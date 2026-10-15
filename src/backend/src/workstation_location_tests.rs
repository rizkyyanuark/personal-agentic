use super::{Workstation, WorkstationLocation};
use crate::{App, api, model::*, store, terminal::TerminalRun};
use anyhow::{Context, Result};
use axum::{
    Router,
    body::{Body, to_bytes},
    http::{Method, Request, StatusCode},
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    net::{Ipv4Addr, SocketAddrV4},
    path::PathBuf,
    process::Command,
    sync::{Arc, Mutex, atomic::AtomicBool},
};
use tower::ServiceExt;

const OWNER: &str = "workstation-location-test-owner";

struct Fixture {
    directory: tempfile::TempDir,
    app: App,
    router: Router,
}

fn fixture() -> Result<Fixture> {
    let directory = tempfile::tempdir()?;
    let org = directory.path().join("org");
    let app = App {
        workspace_id: "default".into(),
        identity: None,
        public_url: Arc::new("http://127.0.0.1:8765".into()),
        enabled: Arc::new(AtomicBool::new(false)),
        store: Arc::new(store::Store::open(org.clone())?),
        token: Arc::new(OWNER.into()),
        address: SocketAddrV4::new(Ipv4Addr::LOCALHOST, 8765),
        codex: PathBuf::from("provider-must-not-run"),
        codex_version: Arc::new(String::new()),
        wake: Arc::new(tokio::sync::Notify::new()),
        cancellations: Arc::new(Mutex::new(HashMap::new())),
        knowledge: Arc::new(crate::knowledge::Knowledge::new(org.join(".state"))),
        tool_tokens: Arc::new(Mutex::new(HashMap::new())),
    };
    let router = api::router(app.clone(), directory.path().join("frontend"));
    Ok(Fixture {
        directory,
        app,
        router,
    })
}

async fn request(
    fixture: &Fixture,
    method: Method,
    route: &str,
    token: Option<&str>,
    value: Value,
) -> Result<(StatusCode, String)> {
    let mut request = Request::builder()
        .method(method)
        .uri(route)
        .header("host", "127.0.0.1:8765")
        .header("content-type", "application/json");
    if let Some(token) = token {
        request = request.header("authorization", format!("Bearer {token}"));
    }
    let response = fixture
        .router
        .clone()
        .oneshot(request.body(Body::from(value.to_string()))?)
        .await?;
    let status = response.status();
    Ok((
        status,
        String::from_utf8(
            to_bytes(response.into_body(), 2 * 1024 * 1024)
                .await?
                .to_vec(),
        )?,
    ))
}

async fn save(fixture: &Fixture, host: &Value) -> Result<Value> {
    let (status, body) = request(
        fixture,
        Method::POST,
        "/api/workstations",
        Some(OWNER),
        json!({"workstation":host}),
    )
    .await?;
    assert_eq!(status, StatusCode::OK, "{body}");
    Ok(serde_json::from_str(&body)?)
}

fn legacy_host(id: &str) -> Value {
    json!({"id":id,"name":"Workspace","hostname":"host.docker.internal",
        "host_ip":"","port":22,"username":"test-user","auth":"ssh_config",
        "ssh_alias":"workspace-location-fixture","ssh_key_path":""})
}

fn session_rows(store: &store::Store) -> Result<Vec<(String, String, String, bool)>> {
    store.read(|conn| {
        Ok(conn
            .prepare("SELECT id,workspace,native_id,active FROM sessions ORDER BY id")?
            .query_map([], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
            })?
            .collect::<rusqlite::Result<_>>()?)
    })
}

fn ssh_configuration(id: &str) -> Result<(String, Vec<String>)> {
    let mut command = Command::new("ssh");
    let target = super::configure(&mut command, id)?;
    Ok((
        target,
        command
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect(),
    ))
}

#[tokio::test]
async fn location_http_flow_preserves_legacy_identity_and_existing_guards() -> Result<()> {
    let fixture = fixture()?;
    let store = &fixture.app.store;
    let host_id = format!("ws-{}", id());
    let mut host = legacy_host(&host_id);
    store.put("workstations", &host_id, &host)?;
    assert_eq!(
        super::list(store)?[0].location,
        WorkstationLocation::Unspecified
    );
    super::initialize(store)?;
    let ssh_before = ssh_configuration(&host_id)?;
    let credential_path = super::secret_path(&store.org.join(".state"), &host_id);
    std::fs::create_dir_all(credential_path.parent().context("Credential directory")?)?;
    std::fs::write(&credential_path, b"opaque-credential-fixture")?;

    let mut agent: Agent = store.get("agents", "ceo")?;
    agent.enabled = false;
    agent.workdir = Some(Workspace {
        runtime_id: None,
        ssh_host: Some(host_id.clone()),
        path: "/home/test/project".into(),
        canonical_path: "/home/test/project".into(),
        git_root: Some("/home/test/project".into()),
    });
    store.put("agents", &agent.id, &agent)?;
    let workspace = agent.workdir.as_ref().context("Fixture workdir")?;
    let mut group: Group = store.get("groups", "general")?;
    group.project = Some(Project {
        workdir: workspace.clone(),
        members: vec![],
    });
    store.put("groups", &group.id, &group)?;
    let agent_before: Value = store.get("agents", &agent.id)?;
    let group_before: Value = store.get("groups", &group.id)?;
    for identity in [
        workspace.identity(),
        "ssh://unrelated-host/home/test/project".into(),
    ] {
        store.write(|tx| {
            tx.execute(
                "INSERT INTO sessions(id,group_id,agent_id,workspace,native_id,harness) VALUES(?,?,?,?,?,'codex')",
                rusqlite::params![id(), group.id, agent.id, identity, "fixture-native-session"],
            )?;
            Ok(())
        })?;
    }
    let sessions_before = session_rows(store)?;
    assert_eq!(save(&fixture, &host).await?["location"], "unspecified");
    for location in ["local_host", "remote", "unspecified", "local_host"] {
        host["location"] = json!(location);
        assert_eq!(save(&fixture, &host).await?["location"], location);
        assert_eq!(session_rows(store)?, sessions_before);
        assert_eq!(ssh_configuration(&host_id)?, ssh_before);
        assert_eq!(store.get::<Value>("agents", &agent.id)?, agent_before);
        assert_eq!(store.get::<Value>("groups", &group.id)?, group_before);
        assert_eq!(
            std::fs::read(&credential_path)?,
            b"opaque-credential-fixture"
        );
    }
    let snapshot: Value = store.get("workstations", &host_id)?;
    let mut invalid = host.clone();
    invalid["location"] = json!("same_host_by_ip");
    let rejected = request(
        &fixture,
        Method::POST,
        "/api/workstations",
        Some(OWNER),
        json!({"workstation":invalid}),
    )
    .await?;
    assert_eq!(
        rejected.0,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        rejected.1
    );
    assert!(rejected.1.contains("unknown variant"));
    assert_eq!(store.get::<Value>("workstations", &host_id)?, snapshot);
    assert_eq!(
        request(
            &fixture,
            Method::POST,
            "/api/workstations",
            None,
            json!({"workstation":host})
        )
        .await?
        .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(store.get::<Value>("workstations", &host_id)?, snapshot);

    let mut run = Run {
        id: id(),
        group_id: group.id.clone(),
        message_id: id(),
        side_chat_id: None,
        agent_id: agent.id.clone(),
        session_id: id(),
        native_session_id: None,
        status: "running".into(),
        cwd: workspace.canonical_path.clone(),
        profile: agent.clone(),
        created_at: now(),
        started_at: None,
        ended_at: None,
        pid: None,
        remote_pid: None,
        exit_code: None,
        error: None,
        output: String::new(),
        artifact_errors: vec![],
        executable: "provider-must-not-run".into(),
        arguments: vec![],
        model_display_name: None,
        usage: None,
        kind: RunKind::Direct,
        parent_run_id: None,
        task: None,
        organization_context: None,
    };
    for status in ["queued", "starting", "running", "waiting"] {
        run.status = status.into();
        store.put("runs", &run.id, &run)?;
        let rejected = request(
            &fixture,
            Method::POST,
            "/api/workstations",
            Some(OWNER),
            json!({"workstation":host}),
        )
        .await?;
        assert_eq!(rejected.0, StatusCode::BAD_REQUEST, "{}", rejected.1);
        assert!(rejected.1.contains("active runs"));
        assert_eq!(store.get::<Value>("workstations", &host_id)?, snapshot);
        assert_eq!(session_rows(store)?, sessions_before);
    }
    run.status = "succeeded".into();
    store.put("runs", &run.id, &run)?;
    let mut terminal = TerminalRun {
        id: id(),
        agent_id: agent.id.clone(),
        command: "not executed".into(),
        cwd: workspace.path.clone(),
        canonical_cwd: workspace.identity(),
        shell: "sh".into(),
        status: "running".into(),
        output: String::new(),
        created_at: now(),
        ended_at: None,
        exit_code: None,
        error: None,
    };
    store.put("terminal_runs", &terminal.id, &terminal)?;
    let rejected = request(
        &fixture,
        Method::POST,
        "/api/workstations",
        Some(OWNER),
        json!({"workstation":host}),
    )
    .await?;
    assert_eq!(rejected.0, StatusCode::BAD_REQUEST, "{}", rejected.1);
    assert!(rejected.1.contains("terminal commands"));
    assert_eq!(store.get::<Value>("workstations", &host_id)?, snapshot);
    terminal.status = "succeeded".into();
    store.put("terminal_runs", &terminal.id, &terminal)?;

    let second_id = format!("ws-{}", id());
    let mut second = legacy_host(&second_id);
    second["location"] = json!("local_host");
    assert_eq!(save(&fixture, &second).await?["location"], "local_host");
    let imported = request(
        &fixture,
        Method::POST,
        "/api/workstations/import",
        Some(OWNER),
        json!({"alias":"workstation-location-import.invalid"}),
    )
    .await?;
    assert_eq!(imported.0, StatusCode::OK, "{}", imported.1);
    let imported: Value = serde_json::from_str(&imported.1)?;
    assert_eq!(imported["location"], "unspecified");
    assert_eq!(imported["id"], "workstation-location-import.invalid");

    let reopened = store::Store::open(store.org.clone())?;
    assert_eq!(
        reopened
            .get::<Workstation>("workstations", &host_id)?
            .location,
        WorkstationLocation::LocalHost
    );
    assert_eq!(session_rows(&reopened)?, sessions_before);
    assert_eq!(reopened.get::<Value>("agents", &agent.id)?, agent_before);
    assert_eq!(reopened.get::<Value>("groups", &group.id)?, group_before);
    assert_eq!(store.list::<Run>("runs")?.len(), 1);
    assert!(super::configure(&mut Command::new("ssh"), "ws-missing-location-fixture").is_err());
    assert_eq!(
        super::configure(&mut Command::new("ssh"), "legacy-ssh-alias")?,
        "legacy-ssh-alias"
    );

    host["hostname"] = json!("new-destination.invalid");
    save(&fixture, &host).await?;
    for (_, identity, _, active) in session_rows(store)? {
        assert_eq!(active, !identity.starts_with(&format!("ssh://{host_id}/")));
    }
    assert_eq!(store.get::<Value>("agents", &agent.id)?, agent_before);
    assert_eq!(store.get::<Value>("groups", &group.id)?, group_before);
    Ok(())
}

#[tokio::test]
async fn platform_router_denies_location_save_without_controller_access() -> Result<()> {
    let mut fixture = fixture()?;
    let platform = crate::platform::Platform::open(
        fixture.app.clone(),
        fixture.directory.path().join("frontend"),
    )?;
    fixture.router = crate::platform::router(platform.clone());
    let invited = "@workstation-owner:example.test";
    let token = id();
    // Seed a real persisted login; external Matrix sign-in is outside this regression.
    platform.db(|db| {
        db.execute(
            "INSERT INTO logins(token_hash,user,expires) VALUES(?,?,unixepoch()+86400)",
            rusqlite::params![format!("{:x}", Sha256::digest(token.as_bytes())), invited],
        )?;
        db.execute(
            "INSERT INTO members(tenant,user,role) VALUES('default',?,'owner')",
            [invited],
        )?;
        Ok(())
    })?;
    let host_id = format!("ws-{}", id());
    let mut host = legacy_host(&host_id);
    fixture.app.store.put("workstations", &host_id, &host)?;
    host["location"] = json!("local_host");
    for (token, expected) in [
        (None, StatusCode::UNAUTHORIZED),
        (Some(token.as_str()), StatusCode::FORBIDDEN),
    ] {
        let rejected = request(
            &fixture,
            Method::POST,
            "/api/workstations",
            token,
            json!({"workstation":host}),
        )
        .await?;
        assert_eq!(rejected.0, expected, "{}", rejected.1);
        assert_eq!(
            fixture.app.store.get::<Value>("workstations", &host_id)?,
            legacy_host(&host_id)
        );
    }
    Ok(())
}
