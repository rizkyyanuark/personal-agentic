use crate::{
    App, api,
    drain::{Admission, Control, Phase},
    model::*,
    platform, store,
};
use anyhow::{Context, Result};
use axum::{
    Router,
    body::{Body, to_bytes},
    http::{Method, Request, StatusCode},
};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    net::{Ipv4Addr, SocketAddrV4},
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};
use tower::ServiceExt;

const OWNER: &str = "deployment-drain-test-owner";
struct Fixture {
    directory: tempfile::TempDir,
    app: App,
    platform: Arc<platform::Platform>,
    router: Router,
}

fn application(org: PathBuf) -> Result<App> {
    let store = Arc::new(store::Store::open(org.clone())?);
    Ok(App {
        workspace_id: "default".into(),
        identity: None,
        public_url: Arc::new("http://127.0.0.1:8765".into()),
        enabled: Arc::new(AtomicBool::new(false)),
        store,
        token: Arc::new(OWNER.into()),
        address: SocketAddrV4::new(Ipv4Addr::LOCALHOST, 8765),
        codex: PathBuf::from("provider-not-used-in-contract-tests"),
        codex_version: Arc::new(String::new()),
        wake: Arc::new(tokio::sync::Notify::new()),
        cancellations: Arc::new(Mutex::new(HashMap::new())),
        knowledge: Arc::new(crate::knowledge::Knowledge::new(org.join(".state"))),
        tool_tokens: Arc::new(Mutex::new(HashMap::new())),
    })
}
fn fixture() -> Result<Fixture> {
    let directory = tempfile::tempdir()?;
    let app = application(directory.path().join("org"))?;
    let platform = platform::Platform::open(app.clone(), directory.path().join("frontend"))?;
    for loaded in platform.apps.lock().unwrap().values() {
        loaded.enabled.store(false, Ordering::SeqCst);
    }
    let router = platform::router(platform.clone());
    Ok(Fixture {
        directory,
        app,
        platform,
        router,
    })
}
async fn request(
    router: &Router,
    method: Method,
    path: &str,
    body: Value,
    token: &str,
    tenant: Option<&str>,
) -> Result<(StatusCode, Value)> {
    let mut request = Request::builder()
        .method(method)
        .uri(path)
        .header("host", "127.0.0.1:8765")
        .header("content-type", "application/json");
    if !token.is_empty() {
        request = request.header("authorization", format!("Bearer {token}"));
    }
    if let Some(tenant) = tenant {
        request = request.header("x-ae-workspace", tenant);
    }
    let response = router
        .clone()
        .oneshot(request.body(Body::from(body.to_string()))?)
        .await?;
    let status = response.status();
    let bytes = to_bytes(response.into_body(), 1024 * 1024).await?;
    let value = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes)?
    };
    Ok((status, value))
}
async fn control(f: &Fixture, action: &str, generation: &str) -> Result<(StatusCode, Value)> {
    request(
        &f.router,
        Method::POST,
        "/api/deployment-drain",
        json!({"action":action,"generation":generation}),
        OWNER,
        None,
    )
    .await
}
fn message(id: &str, agent: Option<&str>) -> Value {
    json!({"id":id,"group_id":"general","body":"Accepted work","recipients":agent.into_iter().collect::<Vec<_>>(),"reply_to":null})
}
fn configure(app: &App, root: &std::path::Path) -> Result<Agent> {
    let mut agent: Agent = app.store.get("agents", "ceo")?;
    agent.workdir = Some(crate::security::validate_workspace(
        root.to_str().context("UTF-8 workdir")?,
    )?);
    app.store.put("agents", &agent.id, &agent)?;
    Ok(agent)
}

#[tokio::test]
async fn bootstrap_bearer_controls_global_gate_without_leaking_generation() -> Result<()> {
    let f = fixture()?;
    let generation = id();
    for token in ["", "wrong-key"] {
        assert_eq!(
            request(
                &f.router,
                Method::GET,
                "/api/deployment-drain",
                Value::Null,
                token,
                None
            )
            .await?
            .0,
            StatusCode::UNAUTHORIZED
        );
    }
    let (status, _) = request(
        &f.router,
        Method::POST,
        "/api/login",
        json!({"token":OWNER}),
        "",
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    let cookie_response = f
        .router
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/deployment-drain")
                .header("host", "127.0.0.1:8765")
                .header("cookie", format!("ae_session={OWNER}"))
                .body(Body::empty())?,
        )
        .await?;
    assert_eq!(cookie_response.status(), StatusCode::UNAUTHORIZED);
    for role in ["owner", "member"] {
        let token = format!("tenant-{role}-login");
        use sha2::{Digest, Sha256};
        f.platform.db(|db| {
            db.execute(
                "INSERT INTO logins VALUES(?,?,unixepoch()+3600)",
                rusqlite::params![
                    format!("{:x}", Sha256::digest(token.as_bytes())),
                    format!("@{role}:example.org")
                ],
            )?;
            db.execute(
                "INSERT INTO members VALUES('default',?,?)",
                rusqlite::params![format!("@{role}:example.org"), role],
            )?;
            Ok(())
        })?;
        assert_eq!(
            request(
                &f.router,
                Method::POST,
                "/api/deployment-drain",
                json!({"action":"begin","generation":generation}),
                &token,
                None
            )
            .await?
            .0,
            StatusCode::UNAUTHORIZED
        );
    }
    assert_eq!(
        request(
            &f.router,
            Method::POST,
            "/api/deployment-drain",
            json!({"action":"begin","generation":generation,"timeout_seconds":901}),
            OWNER,
            None
        )
        .await?
        .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        request(
            &f.router,
            Method::POST,
            "/api/deployment-drain",
            json!({"action":"begin","generation":generation,"parent_run_id":"escape"}),
            OWNER,
            None
        )
        .await?
        .0,
        StatusCode::BAD_REQUEST
    );
    let (status, began) = control(&f, "begin", &generation).await?;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(began["protocol_version"], 1);
    assert_eq!(began["phase"], "draining");
    let repeated = control(&f, "begin", &generation).await?.1;
    assert_eq!(
        repeated["deadline_unix_seconds"],
        began["deadline_unix_seconds"]
    );
    assert_eq!(control(&f, "begin", &id()).await?.0, StatusCode::CONFLICT);
    assert_eq!(control(&f, "resume", &id()).await?.0, StatusCode::CONFLICT);
    let (status, state) = request(
        &f.router,
        Method::GET,
        "/api/state",
        Value::Null,
        OWNER,
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(state["maintenance"]["phase"], "draining");
    assert!(state["maintenance"].get("generation").is_none());
    assert_eq!(control(&f, "seal", &generation).await?.1["phase"], "sealed");
    assert_eq!(
        control(&f, "begin", &generation).await?.1["phase"],
        "sealed"
    );
    assert_eq!(control(&f, "resume", &generation).await?.1["phase"], "open");
    assert_eq!(control(&f, "resume", &generation).await?.0, StatusCode::OK);
    Ok(())
}

#[tokio::test]
async fn new_work_rejected_and_known_message_replay_preserved_across_tenants() -> Result<()> {
    let f = fixture()?;
    configure(&f.app, f.directory.path())?;
    let (_, tenant) = request(
        &f.router,
        Method::POST,
        "/api/tenants",
        json!({"name":"Second workspace"}),
        OWNER,
        None,
    )
    .await?;
    let tenant_id = tenant["id"].as_str().context("Tenant id")?;
    let second = f
        .platform
        .apps
        .lock()
        .unwrap()
        .get(tenant_id)
        .cloned()
        .unwrap();
    second.enabled.store(false, Ordering::SeqCst);
    configure(&second, f.directory.path())?;
    let first_id = id();
    let (status, _) = request(
        &f.router,
        Method::POST,
        "/api/messages",
        message(&first_id, None),
        OWNER,
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    let generation = id();
    control(&f, "begin", &generation).await?;
    for tenant in [None, Some(tenant_id)] {
        let (status, _) = request(
            &f.router,
            Method::POST,
            "/api/messages",
            message(&id(), Some("ceo")),
            OWNER,
            tenant,
        )
        .await?;
        assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
        let (status, _) = request(
            &f.router,
            Method::POST,
            "/api/agents/ceo/terminal",
            json!({"id":id(),"command":"echo forbidden"}),
            OWNER,
            tenant,
        )
        .await?;
        assert_eq!(
            status,
            if tenant.is_none() {
                StatusCode::SERVICE_UNAVAILABLE
            } else {
                StatusCode::FORBIDDEN
            }
        );
        assert_eq!(
            request(
                &f.router,
                Method::POST,
                "/api/artifacts/missing/index",
                Value::Null,
                OWNER,
                tenant
            )
            .await?
            .0,
            StatusCode::SERVICE_UNAVAILABLE
        );
        assert_eq!(
            request(
                &f.router,
                Method::POST,
                "/api/actions/missing/invoke",
                Value::Null,
                OWNER,
                tenant
            )
            .await?
            .0,
            StatusCode::SERVICE_UNAVAILABLE
        );
    }
    assert_eq!(
        request(
            &f.router,
            Method::POST,
            "/api/tenants",
            json!({"name":"Blocked workspace"}),
            OWNER,
            None
        )
        .await?
        .0,
        StatusCode::SERVICE_UNAVAILABLE
    );
    assert_eq!(
        request(
            &f.router,
            Method::POST,
            "/api/messages",
            message(&first_id, None),
            OWNER,
            None
        )
        .await?
        .0,
        StatusCode::OK
    );
    assert!(f.app.store.list::<Run>("runs")?.is_empty());
    assert!(second.store.list::<Run>("runs")?.is_empty());
    assert_eq!(control(&f, "seal", &generation).await?.0, StatusCode::OK);
    assert_eq!(
        request(
            &f.router,
            Method::POST,
            "/api/messages",
            message(&first_id, None),
            OWNER,
            None
        )
        .await?
        .0,
        StatusCode::OK
    );
    assert_eq!(control(&f, "resume", &generation).await?.0, StatusCode::OK);
    assert_eq!(
        request(
            &f.router,
            Method::POST,
            "/api/messages",
            message(&id(), None),
            OWNER,
            Some(tenant_id)
        )
        .await?
        .0,
        StatusCode::OK
    );
    Ok(())
}

#[test]
fn admission_commit_and_begin_are_atomic_with_real_sqlite() -> Result<()> {
    let directory = tempfile::tempdir()?;
    let store = Arc::new(store::Store::open(directory.path().join("org"))?);
    let (started_tx, started_rx) = std::sync::mpsc::channel();
    let (release_tx, release_rx) = std::sync::mpsc::channel();
    let worker = store.clone();
    let admission = std::thread::spawn(move || {
        worker.write_admission(Admission::Root, |tx| {
            tx.execute(
                "INSERT INTO metadata VALUES('accepted-race','committed')",
                [],
            )?;
            started_tx.send(())?;
            release_rx.recv()?;
            Ok(())
        })
    });
    started_rx.recv_timeout(Duration::from_secs(2))?;
    let drain = store.drain.clone();
    let generation = id();
    let (closed_tx, closed_rx) = std::sync::mpsc::channel();
    let begin = std::thread::spawn(move || {
        let result = drain.control(
            Control::Begin {
                generation,
                timeout_seconds: 900,
            },
            || Ok(0),
        );
        closed_tx.send(())?;
        result.map(|_| ())
    });
    assert!(closed_rx.recv_timeout(Duration::from_millis(50)).is_err());
    release_tx.send(())?;
    admission.join().unwrap()?;
    begin.join().unwrap()?;
    assert_eq!(
        store.read(|tx| Ok(tx.query_row(
            "SELECT value FROM metadata WHERE key='accepted-race'",
            [],
            |r| r.get::<_, String>(0)
        )?))?,
        "committed"
    );
    assert!(
        store
            .write_admission(Admission::Root, |tx| {
                tx.execute("INSERT INTO metadata VALUES('rejected-race','wrong')", [])?;
                Ok(())
            })
            .unwrap_err()
            .is::<crate::drain::Closed>()
    );
    assert_eq!(
        store.read(|tx| Ok(tx.query_row(
            "SELECT COUNT(*) FROM metadata WHERE key='rejected-race'",
            [],
            |r| r.get::<_, i64>(0)
        )?))?,
        0
    );
    Ok(())
}

#[tokio::test]
async fn accepted_delegates_summaries_and_schedule_claims_follow_production_paths() -> Result<()> {
    let f = fixture()?;
    let ceo = configure(&f.app, f.directory.path())?;
    let mut worker = ceo.clone();
    worker.id = "worker".into();
    worker.reports_to = Some(ceo.id.clone());
    f.app.store.put("agents", &worker.id, &worker)?;
    let input = api::SendInput {
        id: id(),
        group_id: "general".into(),
        side_chat_id: None,
        body: "Accepted coordination".into(),
        recipients: vec![ceo.id.clone()],
        reply_to: None,
        artifacts: vec![],
    };
    let message = f
        .app
        .store
        .write_admission(Admission::Root, |tx| api::submit_message(tx, input, None))?;
    let mut root = f.app.store.list::<Run>("runs")?.pop().unwrap();
    root.kind = RunKind::Coordinator;
    f.app.store.put("runs", &root.id, &root)?;
    let due = (chrono::Utc::now() - chrono::Duration::minutes(1)).to_rfc3339();
    let schedule = Schedule {
        id: id(),
        group_id: "general".into(),
        name: "Deferred schedule".into(),
        body: "@CEO Accepted scheduled work".into(),
        start_at: due.clone(),
        repeat_minutes: None,
        next_run_at: Some(due.clone()),
        enabled: true,
        last_sent_at: None,
        last_message_id: None,
        last_error: None,
    };
    f.app.store.put("schedules", &schedule.id, &schedule)?;
    let action = ActionItem {
        id: id(),
        group_id: "general".into(),
        title: "Deferred action".into(),
        body: "Accepted planned work".into(),
        assignee_id: ceo.id.clone(),
        planned_start: Some(due),
        status: "scheduled".into(),
        created_by: "owner".into(),
        created_at: now(),
        updated_at: now(),
        revision: 1,
        run_id: None,
        error: None,
    };
    f.app.store.put("action_items", &action.id, &action)?;
    let generation = id();
    control(&f, "begin", &generation).await?;
    crate::schedules::tick(&f.app)?;
    crate::actions::tick(&f.app)?;
    assert_eq!(
        serde_json::to_value(f.app.store.get::<Schedule>("schedules", &schedule.id)?)?,
        serde_json::to_value(&schedule)?
    );
    assert_eq!(
        serde_json::to_value(f.app.store.get::<ActionItem>("action_items", &action.id)?)?,
        serde_json::to_value(&action)?
    );
    root.status = "succeeded".into();
    root.output=json!({"reply":"Delegating accepted task","delegations":[{"agent_id":worker.id,"task":"Finish accepted work"}]}).to_string();
    f.app.store.write_admission(Admission::Continuation, |tx| {
        crate::coordination::complete(tx, &mut root, &message, &[])?;
        store::put(tx, "runs", &root.id, &root)
    })?;
    assert_eq!(root.status, "waiting");
    assert_eq!(
        control(&f, "seal", &generation).await?.0,
        StatusCode::CONFLICT
    );
    let mut delegate = f
        .app
        .store
        .list::<Run>("runs")?
        .into_iter()
        .find(|run| run.kind == RunKind::Delegate)
        .unwrap();
    delegate.status = "succeeded".into();
    delegate.output = "Verified delegated result".into();
    f.app.store.put("runs", &delegate.id, &delegate)?;
    crate::coordination::summarize_ready(&f.app)?;
    let mut summary = f
        .app
        .store
        .list::<Run>("runs")?
        .into_iter()
        .find(|run| run.kind == RunKind::Summary)
        .unwrap();
    assert_eq!(summary.parent_run_id.as_deref(), Some(root.id.as_str()));
    assert_eq!(
        control(&f, "seal", &generation).await?.0,
        StatusCode::CONFLICT
    );
    summary.status = "succeeded".into();
    f.app.store.put("runs", &summary.id, &summary)?;
    assert_eq!(control(&f, "seal", &generation).await?.0, StatusCode::OK);
    control(&f, "resume", &generation).await?;
    crate::schedules::tick(&f.app)?;
    crate::actions::tick(&f.app)?;
    assert!(
        !f.app
            .store
            .get::<Schedule>("schedules", &schedule.id)?
            .enabled
    );
    assert!(
        f.app
            .store
            .get::<Schedule>("schedules", &schedule.id)?
            .last_message_id
            .is_some()
    );
    assert_eq!(
        f.app
            .store
            .get::<ActionItem>("action_items", &action.id)?
            .status,
        "queued"
    );
    let runs = f.app.store.list::<Run>("runs")?.len();
    crate::schedules::tick(&f.app)?;
    crate::actions::tick(&f.app)?;
    assert_eq!(f.app.store.list::<Run>("runs")?.len(), runs);
    Ok(())
}

#[tokio::test]
async fn inflight_and_secondary_workspace_work_block_seal_until_real_cleanup() -> Result<()> {
    let f = fixture()?;
    let (_, tenant) = request(
        &f.router,
        Method::POST,
        "/api/tenants",
        json!({"name":"Remote workspace"}),
        OWNER,
        None,
    )
    .await?;
    let tenant_id = tenant["id"].as_str().unwrap();
    let second = f
        .platform
        .apps
        .lock()
        .unwrap()
        .get(tenant_id)
        .cloned()
        .unwrap();
    second.enabled.store(false, Ordering::SeqCst);
    let operation = second.store.drain.operation(Admission::Root)?;
    let generation = id();
    control(&f, "begin", &generation).await?;
    let (_, status) = request(
        &f.router,
        Method::GET,
        "/api/deployment-drain",
        Value::Null,
        OWNER,
        None,
    )
    .await?;
    assert!(status["inflight_operations"].as_u64().unwrap() >= 1);
    assert_eq!(
        control(&f, "seal", &generation).await?.0,
        StatusCode::CONFLICT
    );
    drop(operation);
    second.store.write(|tx|{tx.execute("INSERT INTO fleet_jobs(id,runtime,state,request) VALUES('remote-job','runtime','claimed','{}')",[])?;Ok(())})?;
    assert_eq!(
        control(&f, "seal", &generation).await?.0,
        StatusCode::CONFLICT
    );
    second.store.write(|tx| {
        tx.execute(
            "UPDATE fleet_jobs SET state='cancelled' WHERE id='remote-job'",
            [],
        )?;
        Ok(())
    })?;
    assert_eq!(
        control(&f, "seal", &generation).await?.0,
        StatusCode::CONFLICT
    );
    second.store.write(|tx| {
        tx.execute(
            "UPDATE fleet_jobs SET state='finished',done=1 WHERE id='remote-job'",
            [],
        )?;
        Ok(())
    })?;
    assert_eq!(control(&f, "seal", &generation).await?.0, StatusCode::OK);
    assert!(
        second
            .store
            .drain
            .operation(Admission::Continuation)
            .unwrap_err()
            .is::<crate::drain::Closed>()
    );
    Ok(())
}

#[tokio::test]
async fn drain_timeout_preserves_work_and_sealed_restart_preserves_ownership() -> Result<()> {
    let f = fixture()?;
    let generation = id();
    let (_, status) = request(
        &f.router,
        Method::POST,
        "/api/deployment-drain",
        json!({"action":"begin","generation":generation,"timeout_seconds":1}),
        OWNER,
        None,
    )
    .await?;
    assert_eq!(status["phase"], "draining");
    tokio::time::sleep(Duration::from_millis(1200)).await;
    assert_eq!(f.app.store.drain.maintenance()?.phase, Phase::Open);
    assert_eq!(
        control(&f, "seal", &generation).await?.0,
        StatusCode::CONFLICT
    );
    assert_eq!(control(&f, "resume", &generation).await?.0, StatusCode::OK);
    let sealed_generation = id();
    control(&f, "begin", &sealed_generation).await?;
    control(&f, "seal", &sealed_generation).await?;
    let reopened = store::Store::open(f.app.store.org.clone())?;
    assert_eq!(reopened.drain.maintenance()?.phase, Phase::Sealed);
    assert!(
        reopened
            .write_admission(Admission::Root, |_| Ok(()))
            .unwrap_err()
            .is::<crate::drain::Closed>()
    );
    assert!(
        reopened
            .drain
            .control(Control::Resume { generation: id() }, || Ok(0))
            .unwrap_err()
            .is::<crate::drain::Conflict>()
    );
    reopened.drain.control(
        Control::Resume {
            generation: sealed_generation,
        },
        || Ok(0),
    )?;
    assert_eq!(reopened.drain.maintenance()?.phase, Phase::Open);
    Ok(())
}

#[tokio::test]
async fn sealed_history_reads_do_not_reopen_work_or_block_release_verification() -> Result<()> {
    let f = fixture()?;
    let accepted = f.app.store.drain.operation(Admission::Progress)?;
    let generation = id();
    assert_eq!(control(&f, "begin", &generation).await?.0, StatusCode::OK);
    assert_eq!(
        control(&f, "seal", &generation).await?.0,
        StatusCode::CONFLICT
    );
    drop(accepted);
    assert_eq!(control(&f, "seal", &generation).await?.0, StatusCode::OK);
    let reading = f.app.store.drain.operation(Admission::Progress)?;
    let status = f.app.store.drain.status(|| Ok(0))?;
    assert_eq!(status.phase, Phase::Sealed);
    assert_eq!(status.inflight_operations, 0);
    assert!(
        f.app
            .store
            .drain
            .operation(Admission::Root)
            .unwrap_err()
            .is::<crate::drain::Closed>()
    );
    assert!(
        f.app
            .store
            .drain
            .operation(Admission::Continuation)
            .unwrap_err()
            .is::<crate::drain::Closed>()
    );
    assert_eq!(
        request(
            &f.router,
            Method::GET,
            "/api/groups/general/messages",
            Value::Null,
            OWNER,
            None
        )
        .await?
        .0,
        StatusCode::OK
    );
    assert_eq!(
        request(
            &f.router,
            Method::GET,
            "/api/deployment-drain",
            Value::Null,
            OWNER,
            None
        )
        .await?
        .1["active_operations"],
        0
    );
    drop(reading);
    assert_eq!(control(&f, "resume", &generation).await?.0, StatusCode::OK);
    Ok(())
}

#[cfg(unix)]
#[tokio::test]
async fn actual_terminal_finishes_while_drain_rejects_new_commands() -> Result<()> {
    let f = fixture()?;
    configure(&f.app, f.directory.path())?;
    let command = id();
    let body = json!({"id":command,"command":"sleep 1; printf 'drain-terminal-proof'"});
    assert_eq!(
        request(
            &f.router,
            Method::POST,
            "/api/agents/ceo/terminal",
            body.clone(),
            OWNER,
            None
        )
        .await?
        .0,
        StatusCode::OK
    );
    let generation = id();
    control(&f, "begin", &generation).await?;
    assert_eq!(
        control(&f, "seal", &generation).await?.0,
        StatusCode::CONFLICT
    );
    assert_eq!(
        request(
            &f.router,
            Method::POST,
            "/api/agents/ceo/terminal",
            body.clone(),
            OWNER,
            None
        )
        .await?
        .0,
        StatusCode::OK
    );
    assert_eq!(
        request(
            &f.router,
            Method::POST,
            "/api/agents/ceo/terminal",
            json!({"id":command,"command":"printf other"}),
            OWNER,
            None
        )
        .await?
        .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        request(
            &f.router,
            Method::POST,
            "/api/agents/ceo/terminal",
            json!({"id":id(),"command":"printf forbidden"}),
            OWNER,
            None
        )
        .await?
        .0,
        StatusCode::SERVICE_UNAVAILABLE
    );
    let deadline = std::time::Instant::now() + Duration::from_secs(5);
    loop {
        let saved: crate::terminal::TerminalRun = f.app.store.get("terminal_runs", &command)?;
        if saved.status != "running" {
            assert_eq!(saved.status, "completed");
            assert!(saved.output.contains("drain-terminal-proof"));
            break;
        }
        assert!(
            std::time::Instant::now() < deadline,
            "Actual terminal did not finish"
        );
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    assert_eq!(control(&f, "seal", &generation).await?.0, StatusCode::OK);
    Ok(())
}

#[tokio::test]
async fn authorized_matrix_posts_receive_deduplicated_maintenance_notice_without_queueing()
-> Result<()> {
    let f = fixture()?;
    f.platform
        .apps
        .lock()
        .unwrap()
        .get("default")
        .unwrap()
        .enabled
        .store(true, Ordering::SeqCst);
    f.platform.db(|db| {
        db.execute(
            "INSERT INTO members VALUES('default','@member:example.test','owner')",
            [],
        )?;
        Ok(())
    })?;
    f.app.store.write(|db| {
        db.execute(
            "INSERT INTO metadata VALUES('matrix_room:general','!general:example.test')",
            [],
        )?;
        Ok(())
    })?;
    let event = |event_id: &str, sender: &str| {
        serde_json::from_value(json!({
            "type":"m.room.message", "event_id":event_id, "sender":sender,
            "origin_server_ts":1, "content":{"msgtype":"m.text","body":"Matrix drain proof"}
        }))
    };
    let room = "!general:example.test";
    assert!(
        crate::matrix::ingest(
            &f.platform,
            room,
            event("$accepted", "@member:example.test")?
        )?
        .is_none()
    );
    let count = f.app.store.list::<Message>("messages")?.len();
    control(&f, "begin", &id()).await?;
    let first =
        crate::matrix::ingest(&f.platform, room, event("$closed", "@member:example.test")?)?
            .context("Maintenance notice missing")?;
    let replay =
        crate::matrix::ingest(&f.platform, room, event("$closed", "@member:example.test")?)?
            .context("Maintenance notice replay missing")?;
    assert_eq!(first, replay);
    assert_eq!(f.app.store.list::<Message>("messages")?.len(), count);
    assert!(
        crate::matrix::ingest(
            &f.platform,
            room,
            event("$accepted", "@member:example.test")?
        )?
        .is_none()
    );
    assert!(
        crate::matrix::ingest(
            &f.platform,
            room,
            event("$outsider", "@outsider:example.test")?
        )
        .is_err()
    );
    assert!(
        crate::matrix::ingest(
            &f.platform,
            "!other:example.test",
            event("$other", "@member:example.test")?
        )?
        .is_none()
    );
    Ok(())
}
