use crate::{App, fleet, model, platform, store, worker_packages::Manifest};
use anyhow::Result;
use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode},
};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    net::{Ipv4Addr, SocketAddrV4},
    path::PathBuf,
    sync::{Arc, Mutex, atomic::AtomicBool},
};
use tower::ServiceExt;

pub(crate) fn app(root: PathBuf) -> Result<App> {
    Ok(App {
        workspace_id: "default".into(),
        identity: None,
        public_url: Arc::new("http://127.0.0.1:8765".into()),
        enabled: Arc::new(AtomicBool::new(true)),
        store: Arc::new(store::Store::open(root.clone())?),
        token: Arc::new("owner-test-only".into()),
        address: SocketAddrV4::new(Ipv4Addr::LOCALHOST, 8765),
        codex: "provider-must-not-run".into(),
        codex_version: Arc::new(String::new()),
        wake: Arc::new(tokio::sync::Notify::new()),
        cancellations: Default::default(),
        knowledge: Arc::new(crate::knowledge::Knowledge::new(root.join(".state"))),
        tool_tokens: Arc::new(Mutex::new(HashMap::new())),
    })
}

#[tokio::test]
async fn self_status_uses_real_auth_and_does_not_heartbeat_or_claim_work() -> Result<()> {
    let temp = tempfile::tempdir()?;
    let app = app(temp.path().join("org"))?;
    let p = platform::Platform::open(app.clone(), temp.path().join("frontend"))?;
    let apps = vec![("default".to_owned(), app.clone())];
    let enrollment = fleet::register(&app, "isolated-worker")?;
    let pending = enrollment["enrollment_token"].as_str().unwrap();
    let id = enrollment["id"].as_str().unwrap();
    assert!(fleet::worker_identity(&apps, pending, false)?.is_none());
    assert_eq!(
        fleet::worker_identity(&apps, pending, true)?.unwrap()["workspace"],
        "default"
    );
    let saved = fleet::worker_request(&apps, "enroll", pending, &json!({}))?.unwrap();
    let token = saved["token"].as_str().unwrap();
    assert!(fleet::worker_identity(&apps, pending, true)?.is_none());
    app.store.write(|db| {
        db.execute(
            "INSERT INTO fleet_jobs(id,runtime,state,request) VALUES(?,?,'queued',?)",
            rusqlite::params![
                model::id(),
                id,
                json!({"op":"directories","path":"/test-project"}).to_string()
            ],
        )?;
        Ok(())
    })?;
    let before: Value = app.store.read(|db| {
        Ok(serde_json::from_str(&db.query_row(
            "SELECT value FROM metadata WHERE key=?",
            [format!("runtime:{id}")],
            |r| r.get::<_, String>(0),
        )?)?)
    })?;
    let response = platform::router(p.clone())
        .oneshot(
            Request::builder()
                .uri("/api/runtime/status")
                .header("host", "127.0.0.1:8765")
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty())?,
        )
        .await?;
    assert_eq!(response.status(), StatusCode::OK);
    let body: Value = serde_json::from_slice(&to_bytes(response.into_body(), 65536).await?)?;
    assert_eq!(body["online"], false);
    assert_eq!(body["heartbeat"], 0);
    assert!(body.get("token").is_none());
    let after: Value = app.store.read(|db| {
        Ok(serde_json::from_str(&db.query_row(
            "SELECT value FROM metadata WHERE key=?",
            [format!("runtime:{id}")],
            |r| r.get::<_, String>(0),
        )?)?)
    })?;
    assert_eq!(before, after);
    let queued: i64 = app.store.read(|db| {
        Ok(db.query_row(
            "SELECT count(*) FROM fleet_jobs WHERE state='queued'",
            [],
            |r| r.get(0),
        )?)
    })?;
    assert_eq!(queued, 1);
    fleet::worker_request(
        &apps,
        "poll",
        token,
        &json!({"root":"/test-project","os":"linux","capabilities":{}}),
    )?;
    let connected = fleet::worker_identity(&apps, token, false)?.unwrap();
    assert_eq!(connected["online"], true);
    assert_eq!(connected["heartbeat"], 1);
    assert_eq!(connected["root"], "/test-project");
    fleet::revoke(&app, id)?;
    let denied = platform::router(p)
        .oneshot(
            Request::builder()
                .uri("/api/runtime/status")
                .header("host", "127.0.0.1:8765")
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty())?,
        )
        .await?;
    assert_eq!(denied.status(), StatusCode::UNAUTHORIZED);
    assert!(app.store.list::<model::Run>("runs")?.is_empty());
    Ok(())
}

#[test]
fn package_manifest_rejects_paths_duplicates_expansion_and_wrong_platform() -> Result<()> {
    let value = json!({"schema":1,"protocol":1,"release":"a".repeat(40),"platform":"linux-arm64",
        "package":{"file":"worker-linux-arm64.zip","sha256":"b".repeat(64),"size":100,
        "files":[{"name":"agentic-enterprise","sha256":"c".repeat(64),"size":200}]}});
    serde_json::from_value::<Manifest>(value.clone())?.validate("linux-arm64")?;
    for (pointer, replacement) in [
        ("/package/file", json!("../../secret")),
        ("/protocol", json!(2)),
        ("/package/files/0/name", json!("../agentic-enterprise")),
        ("/package/files/0/size", json!(900000000u64)),
        ("/package/sha256", json!("not-a-checksum")),
    ] {
        let mut changed = value.clone();
        *changed.pointer_mut(pointer).unwrap() = replacement;
        assert!(
            serde_json::from_value::<Manifest>(changed)?
                .validate("linux-arm64")
                .is_err()
        );
    }
    assert!(
        serde_json::from_value::<Manifest>(value)?
            .validate("windows-x64")
            .is_err()
    );
    Ok(())
}

#[test]
fn pending_package_identity_obeys_expiry_revocation_and_workspace_scope() -> Result<()> {
    let temp = tempfile::tempdir()?;
    let first = app(temp.path().join("first"))?;
    let second = app(temp.path().join("second"))?;
    fleet::initialize(&first)?;
    let registered = fleet::register(&first, "pending-package-reader")?;
    let token = registered["enrollment_token"].as_str().unwrap();
    let id = registered["id"].as_str().unwrap();
    assert!(fleet::worker_identity(&[("second".into(), second)], token, true)?.is_none());
    let apps = [("first".into(), first.clone())];
    assert_eq!(
        fleet::worker_identity(&apps, token, true)?.unwrap()["workspace"],
        "first"
    );
    first.store.write(|db| {
        db.execute(
            "UPDATE metadata SET value=json_set(value,'$.expires',0) WHERE key=?",
            [format!("runtime:{id}")],
        )?;
        Ok(())
    })?;
    assert!(fleet::worker_identity(&apps, token, true)?.is_none());
    let fresh = fleet::register(&first, "revoked-package-reader")?;
    fleet::revoke(&first, fresh["id"].as_str().unwrap())?;
    assert!(
        fleet::worker_identity(&apps, fresh["enrollment_token"].as_str().unwrap(), true)?.is_none()
    );
    Ok(())
}
