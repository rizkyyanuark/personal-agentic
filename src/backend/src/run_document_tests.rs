use crate::{
    App, api,
    model::{Agent, Artifact, Group, Harness, Message, Run, RunKind, id},
    security, store,
};
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
    sync::{Arc, Mutex, atomic::AtomicBool},
};
use tower::ServiceExt;

const OWNER: &str = "document-fixture-owner";
const CREATED: &str = "2026-10-07T19:17:20Z";

struct Fixture {
    _directory: tempfile::TempDir,
    app: App,
    router: Router,
    root: PathBuf,
    run: Run,
    reply: Message,
    bytes: Vec<u8>,
}

fn fixture(permission: &str) -> Result<Fixture> {
    let directory = tempfile::tempdir()?;
    let org = directory.path().join("org");
    let root = directory.path().join("workdir");
    std::fs::create_dir(&root)?;
    let workspace = security::validate_workspace(root.to_str().context("UTF-8 fixture workdir")?)?;
    let root = PathBuf::from(&workspace.canonical_path);
    let store = Arc::new(store::Store::open(org.clone())?);
    let mut agent: Agent = store.get("agents", "ceo")?;
    agent.harness = Harness::Antigravity;
    agent.workdir = Some(workspace);
    agent.permission = permission.into();
    agent.enabled = false;
    store.put("agents", &agent.id, &agent)?;
    let mut group: Group = store.get("groups", "general")?;
    group.member_ids = Some(vec![agent.id.clone()]);
    store.put("groups", &group.id, &group)?;
    let run = Run {
        id: id(),
        group_id: group.id.clone(),
        message_id: id(),
        side_chat_id: None,
        agent_id: agent.id.clone(),
        session_id: id(),
        native_session_id: Some(id()),
        status: "succeeded".into(),
        cwd: root.to_string_lossy().into_owned(),
        profile: agent,
        created_at: CREATED.into(),
        started_at: Some(CREATED.into()),
        ended_at: Some(CREATED.into()),
        pid: None,
        remote_pid: None,
        exit_code: Some(0),
        error: None,
        output: "The research plan is ready: [Research plan](report.md).".into(),
        artifact_errors: vec![],
        executable: "agy".into(),
        arguments: vec![],
        model_display_name: None,
        usage: None,
        kind: RunKind::Direct,
        parent_run_id: None,
        task: None,
        organization_context: None,
    };
    store.put("runs", &run.id, &run)?;
    let incoming = Message {
        id: run.message_id.clone(),
        group_id: group.id.clone(),
        side_chat_id: None,
        sender: "owner".into(),
        body: "Please prepare the research plan.".into(),
        recipients: vec![run.agent_id.clone()],
        reply_to: None,
        artifacts: vec![],
        run_id: None,
        created_at: CREATED.into(),
        auto_routed: false,
        schedule_id: None,
        command: None,
        usage_report: None,
    };
    store.put("messages", &incoming.id, &incoming)?;
    let reply = Message {
        id: id(),
        group_id: group.id,
        side_chat_id: None,
        sender: run.agent_id.clone(),
        body: run.output.clone(),
        recipients: vec![],
        reply_to: Some(run.message_id.clone()),
        artifacts: vec![],
        run_id: Some(run.id.clone()),
        created_at: CREATED.into(),
        auto_routed: false,
        schedule_id: None,
        command: None,
        usage_report: None,
    };
    store.put("messages", &reply.id, &reply)?;
    let bytes =
        b"# Research plan\n\nA real historical document with its captured bytes.\n".to_vec();
    std::fs::write(root.join("report.md"), &bytes)?;
    let app = App {
        workspace_id: "default".into(),
        identity: None,
        public_url: Arc::new("http://127.0.0.1:8765".into()),
        enabled: Arc::new(AtomicBool::new(false)),
        token: Arc::new(OWNER.into()),
        address: SocketAddrV4::new(Ipv4Addr::LOCALHOST, 8765),
        codex: PathBuf::from("provider-must-not-run"),
        codex_version: Arc::new(String::new()),
        wake: Arc::new(tokio::sync::Notify::new()),
        cancellations: Arc::new(Mutex::new(HashMap::new())),
        knowledge: Arc::new(crate::knowledge::Knowledge::new(org.join(".state"))),
        tool_tokens: Arc::new(Mutex::new(HashMap::new())),
        store,
    };
    let router = api::router(app.clone(), directory.path().join("frontend"));
    Ok(Fixture {
        _directory: directory,
        app,
        router,
        root,
        run,
        reply,
        bytes,
    })
}

async fn request(
    fixture: &Fixture,
    method: Method,
    path: &str,
    token: Option<&str>,
    body: Value,
) -> Result<(StatusCode, Vec<u8>)> {
    let mut request = Request::builder()
        .method(method)
        .uri(path)
        .header("host", "127.0.0.1:8765")
        .header("content-type", "application/json");
    if let Some(token) = token {
        request = request.header("authorization", format!("Bearer {token}"));
    }
    let response = fixture
        .router
        .clone()
        .oneshot(request.body(Body::from(body.to_string()))?)
        .await?;
    let status = response.status();
    assert_eq!(
        response
            .headers()
            .get("cache-control")
            .and_then(|value| value.to_str().ok()),
        (status != StatusCode::UNAUTHORIZED).then_some("no-store")
    );
    Ok((
        status,
        to_bytes(response.into_body(), 2 * 1024 * 1024)
            .await?
            .to_vec(),
    ))
}

async fn owner(
    fixture: &Fixture,
    method: Method,
    path: &str,
    body: Value,
) -> Result<(StatusCode, Value)> {
    let (status, bytes) = request(fixture, method, path, Some(OWNER), body).await?;
    Ok((status, serde_json::from_slice(&bytes)?))
}

fn document_url(run: &Run, route: &str, path: &str) -> String {
    let query = url::form_urlencoded::Serializer::new(String::new())
        .append_pair("path", path)
        .finish();
    format!("/api/runs/{}/{route}?{query}", run.id)
}

async fn import(fixture: &Fixture, run: &Run, path: &str) -> Result<(StatusCode, Value)> {
    owner(
        fixture,
        Method::POST,
        &format!("/api/runs/{}/artifacts", run.id),
        json!({"path":path}),
    )
    .await
}

fn published(fixture: &Fixture, run: &Run) -> Result<()> {
    let mut reply = fixture.reply.clone();
    reply.id = id();
    reply.run_id = Some(run.id.clone());
    reply.body = run.output.clone();
    fixture.app.store.put("runs", &run.id, run)?;
    fixture.app.store.put("messages", &reply.id, &reply)
}

#[tokio::test]
async fn historical_document_http_flow_is_authenticated_durable_and_idempotent() -> Result<()> {
    let fixture = fixture("workspace-write")?;
    let mut notice = fixture.reply.clone();
    notice.id = id();
    notice.sender = "system".into();
    fixture.app.store.put("messages", &notice.id, &notice)?;
    let mut other_group: Group = fixture.app.store.get("groups", "general")?;
    other_group.id = id();
    other_group.name = "Separate chat".into();
    fixture
        .app
        .store
        .put("groups", &other_group.id, &other_group)?;
    let mut unrelated = fixture.reply.clone();
    unrelated.id = id();
    unrelated.group_id = other_group.id;
    fixture
        .app
        .store
        .put("messages", &unrelated.id, &unrelated)?;
    let inspected = owner(
        &fixture,
        Method::GET,
        &document_url(&fixture.run, "document", "report.md"),
        json!({}),
    )
    .await?;
    assert_eq!(inspected.0, StatusCode::OK);
    assert_eq!(inspected.1["can_import"], true);
    assert_eq!(inspected.1["can_export"], false);
    assert!(inspected.1["artifact"].is_null());
    assert!(fixture.app.store.list::<Artifact>("artifacts")?.is_empty());
    let route = format!("/api/runs/{}/artifacts", fixture.run.id);
    for token in [None, Some("incorrect-owner-token")] {
        assert_eq!(
            request(
                &fixture,
                Method::POST,
                &route,
                token,
                json!({"path":"report.md"})
            )
            .await?
            .0,
            StatusCode::UNAUTHORIZED
        );
    }
    assert!(fixture.app.store.list::<Artifact>("artifacts")?.is_empty());
    let imported = import(&fixture, &fixture.run, "report.md").await?;
    assert_eq!(imported.0, StatusCode::OK, "{}", imported.1);
    let artifact: Artifact = serde_json::from_value(imported.1.clone())?;
    assert!(!artifact.in_knowledge);
    assert_eq!(artifact.status, "stored");
    assert_eq!(artifact.size, fixture.bytes.len() as u64);
    assert_eq!(
        artifact.sha256,
        format!("{:x}", Sha256::digest(&fixture.bytes))
    );
    let source = artifact.source.as_ref().context("historical source")?;
    assert_eq!(source.capture_kind, "historical_import");
    assert_eq!(source.run_id, fixture.run.id);
    assert_eq!(source.session_id, fixture.run.session_id);
    assert_eq!(
        Some(&source.native_session_id),
        fixture.run.native_session_id.as_ref()
    );
    assert_eq!(
        PathBuf::from(&source.source_path),
        fixture.root.join("report.md")
    );
    chrono::DateTime::parse_from_rfc3339(&source.captured_at)?;
    assert_ne!(source.captured_at, CREATED);
    assert_eq!(
        std::fs::read(security::artifact_path(
            &fixture.app.store.org,
            &artifact.id
        )?)?,
        fixture.bytes
    );
    let reply: Message = fixture.app.store.get("messages", &fixture.reply.id)?;
    assert_eq!(reply.artifacts, vec![artifact.id.clone()]);
    assert_eq!(reply.body, fixture.reply.body);
    assert!(
        fixture
            .app
            .store
            .get::<Message>("messages", &notice.id)?
            .artifacts
            .is_empty()
    );
    assert!(
        fixture
            .app
            .store
            .get::<Message>("messages", &unrelated.id)?
            .artifacts
            .is_empty()
    );
    assert_eq!(
        import(&fixture, &fixture.run, "./report.md").await?.1["id"],
        artifact.id
    );
    assert_eq!(fixture.app.store.list::<Artifact>("artifacts")?.len(), 1);
    std::fs::remove_file(fixture.root.join("report.md"))?;
    let (status, bytes) = request(
        &fixture,
        Method::GET,
        &document_url(&fixture.run, "files", "report.md"),
        Some(OWNER),
        json!({}),
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(bytes, fixture.bytes);
    let (status, bytes) = request(
        &fixture,
        Method::GET,
        &format!("/api/artifacts/{}", artifact.id),
        Some(OWNER),
        json!({}),
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(bytes, fixture.bytes);
    fixture.app.store.write(|tx| {
        let mut reply: Message = store::get(tx, "messages", &fixture.reply.id)?;
        reply.artifacts.clear();
        store::put(tx, "messages", &reply.id, &reply)?;
        let mut saved: Run = store::get(tx, "runs", &fixture.run.id)?;
        saved.artifact_errors.push(crate::model::RunArtifactError {
            path: "report.md".into(),
            error: "Interrupted before the reply association was saved".into(),
        });
        store::put(tx, "runs", &saved.id, &saved)
    })?;
    assert_eq!(
        import(&fixture, &fixture.run, "report.md").await?.1["id"],
        artifact.id
    );
    assert_eq!(
        fixture
            .app
            .store
            .get::<Message>("messages", &fixture.reply.id)?
            .artifacts,
        vec![artifact.id.clone()]
    );
    assert!(
        fixture
            .app
            .store
            .get::<Run>("runs", &fixture.run.id)?
            .artifact_errors
            .is_empty()
    );
    let reopened = store::Store::open(fixture.app.store.org.clone())?;
    assert_eq!(
        reopened.get::<Artifact>("artifacts", &artifact.id)?.sha256,
        artifact.sha256
    );
    let saved: Run = reopened.get("runs", &fixture.run.id)?;
    assert_eq!(saved.status, "succeeded");
    assert_eq!(saved.exit_code, Some(0));
    assert!(saved.error.is_none());
    assert!(!fixture.app.store.org.join(".state/models").exists());
    Ok(())
}

#[tokio::test]
async fn recovery_rejects_undeclared_wrong_run_foreign_session_and_external_files() -> Result<()> {
    let fixture = fixture("workspace-write")?;
    std::fs::write(fixture.root.join("unlinked.md"), b"not linked")?;
    for reference in ["unlinked.md", "../report.md", ".env/report.md"] {
        assert_eq!(
            import(&fixture, &fixture.run, reference).await?.0,
            StatusCode::BAD_REQUEST
        );
    }
    let mut unpublished = fixture.run.clone();
    unpublished.id = id();
    fixture
        .app
        .store
        .put("runs", &unpublished.id, &unpublished)?;
    assert_eq!(
        import(&fixture, &unpublished, "report.md").await?.0,
        StatusCode::BAD_REQUEST
    );
    let mut foreign = fixture.run.clone();
    foreign.id = id();
    let path = format!(
        "/home/agent/.gemini/antigravity-cli/brain/{}/report.md",
        id()
    );
    foreign.output = format!("[Other session report]({path})");
    published(&fixture, &foreign)?;
    let denied = import(&fixture, &foreign, &path).await?;
    assert_eq!(denied.0, StatusCode::BAD_REQUEST);
    assert!(
        denied.1["error"]
            .as_str()
            .context("scope error")?
            .contains("different Antigravity")
    );
    let external_path = fixture._directory.path().join("private.md");
    std::fs::write(&external_path, b"EXTERNAL_DOCUMENT_MUST_NOT_BE_EXPOSED")?;
    let path = external_path.to_string_lossy().into_owned();
    let mut external = fixture.run.clone();
    external.id = id();
    external.output = format!("[Outside report](<{path}>)");
    published(&fixture, &external)?;
    let denied = import(&fixture, &external, &path).await?;
    assert_eq!(denied.0, StatusCode::BAD_REQUEST);
    assert!(
        !denied
            .1
            .to_string()
            .contains("EXTERNAL_DOCUMENT_MUST_NOT_BE_EXPOSED")
    );
    let forged = request(
        &fixture,
        Method::POST,
        &format!("/api/runs/{}/artifacts", fixture.run.id),
        Some(OWNER),
        json!({"path":"report.md","native_session_id":id(),"harness":"antigravity"}),
    )
    .await?;
    assert_eq!(forged.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert!(fixture.app.store.list::<Artifact>("artifacts")?.is_empty());
    Ok(())
}

#[tokio::test]
async fn archive_delete_and_restore_do_not_silently_import_or_bypass_mutation_checks() -> Result<()>
{
    let fixture = fixture("workspace-write")?;
    let first = import(&fixture, &fixture.run, "report.md").await?;
    assert_eq!(first.0, StatusCode::OK);
    let artifact = first.1["id"].as_str().context("artifact id")?.to_owned();
    for (method, route) in [
        (Method::POST, "/api/groups/general/archive"),
        (Method::DELETE, "/api/groups/general"),
    ] {
        assert_eq!(
            owner(&fixture, method, route, json!({})).await?.0,
            StatusCode::OK
        );
        assert_eq!(
            import(&fixture, &fixture.run, "report.md").await?.0,
            StatusCode::BAD_REQUEST
        );
        let inspected = owner(
            &fixture,
            Method::GET,
            &document_url(&fixture.run, "document", "report.md"),
            json!({}),
        )
        .await?;
        assert_eq!(inspected.1["artifact"]["id"], artifact);
        assert_eq!(inspected.1["can_import"], false);
        assert_eq!(inspected.1["can_export"], false);
        assert_eq!(
            owner(
                &fixture,
                Method::POST,
                &format!("/api/artifacts/{artifact}/export"),
                json!({"path":"blocked.md"})
            )
            .await?
            .0,
            StatusCode::BAD_REQUEST
        );
        assert!(!fixture.root.join("blocked.md").exists());
        assert_eq!(fixture.app.store.list::<Artifact>("artifacts")?.len(), 1);
        assert_eq!(
            owner(
                &fixture,
                Method::POST,
                "/api/groups/general/restore",
                json!({})
            )
            .await?
            .0,
            StatusCode::OK
        );
        assert_eq!(fixture.app.store.list::<Artifact>("artifacts")?.len(), 1);
        assert_eq!(
            import(&fixture, &fixture.run, "report.md").await?.1["id"],
            artifact
        );
    }
    Ok(())
}

#[tokio::test]
async fn export_obeys_saved_and_current_permissions_and_never_overwrites() -> Result<()> {
    let fixture = fixture("workspace-write")?;
    let imported = import(&fixture, &fixture.run, "report.md").await?;
    assert_eq!(imported.0, StatusCode::OK);
    let artifact = imported.1["id"].as_str().context("artifact id")?;
    let route = format!("/api/artifacts/{artifact}/export");
    let mut current: Agent = fixture.app.store.get("agents", "ceo")?;
    current.permission = "read-only".into();
    fixture.app.store.put("agents", &current.id, &current)?;
    assert_eq!(
        owner(
            &fixture,
            Method::POST,
            &route,
            json!({"path":"exports/copied.md"})
        )
        .await?
        .0,
        StatusCode::BAD_REQUEST
    );
    assert!(!fixture.root.join("exports").exists());
    current.permission = "workspace-write".into();
    fixture.app.store.put("agents", &current.id, &current)?;
    let inspected = owner(
        &fixture,
        Method::GET,
        &document_url(&fixture.run, "document", "report.md"),
        json!({}),
    )
    .await?;
    assert_eq!(inspected.1["can_export"], true);
    for destination in [
        "../escaped.md",
        ".env/result.md",
        ".state/result.md",
        ".git/result.md",
        "/tmp/escaped.md",
        "file:///tmp/escaped.md",
    ] {
        assert_eq!(
            owner(&fixture, Method::POST, &route, json!({"path":destination}))
                .await?
                .0,
            StatusCode::BAD_REQUEST
        );
    }
    let result = owner(
        &fixture,
        Method::POST,
        &route,
        json!({"path":"exports/copied.md"}),
    )
    .await?;
    assert_eq!(result.0, StatusCode::OK, "{}", result.1);
    let destination = fixture.root.join("exports/copied.md");
    assert_eq!(
        PathBuf::from(result.1["path"].as_str().context("export destination")?),
        destination
    );
    assert_eq!(std::fs::read(&destination)?, fixture.bytes);
    std::fs::write(&destination, b"Keep the existing user edit")?;
    assert_eq!(
        owner(
            &fixture,
            Method::POST,
            &route,
            json!({"path":"exports/copied.md"})
        )
        .await?
        .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(std::fs::read(&destination)?, b"Keep the existing user edit");
    assert_eq!(
        std::fs::read_dir(destination.parent().context("export parent")?)?.count(),
        1
    );
    let mut current: Agent = fixture.app.store.get("agents", "ceo")?;
    current.workdir = None;
    fixture.app.store.put("agents", &current.id, &current)?;
    assert_eq!(
        owner(
            &fixture,
            Method::POST,
            &route,
            json!({"path":"exports/after-detach.md"})
        )
        .await?
        .0,
        StatusCode::BAD_REQUEST
    );
    assert!(!fixture.root.join("exports/after-detach.md").exists());
    Ok(())
}

#[tokio::test]
async fn historical_read_only_run_cannot_gain_write_permission_from_current_profile() -> Result<()>
{
    let fixture = fixture("read-only")?;
    let imported = import(&fixture, &fixture.run, "report.md").await?;
    assert_eq!(imported.0, StatusCode::OK);
    let artifact = imported.1["id"].as_str().context("artifact id")?;
    let route = format!("/api/artifacts/{artifact}/export");
    assert_eq!(
        owner(&fixture, Method::POST, &route, json!({"path":"copied.md"}))
            .await?
            .0,
        StatusCode::BAD_REQUEST
    );
    let mut current: Agent = fixture.app.store.get("agents", "ceo")?;
    current.permission = "danger-full-access".into();
    fixture.app.store.put("agents", &current.id, &current)?;
    assert_eq!(
        owner(&fixture, Method::POST, &route, json!({"path":"copied.md"}))
            .await?
            .0,
        StatusCode::BAD_REQUEST
    );
    assert!(!fixture.root.join("copied.md").exists());
    Ok(())
}

#[tokio::test]
async fn completion_artifact_without_published_reply_stays_out_of_state_and_recovery() -> Result<()>
{
    let fixture = fixture("workspace-write")?;
    let mut private = fixture.run.clone();
    private.id = id();
    fixture.app.store.put("runs", &private.id, &private)?;
    let ids = crate::run_artifacts::capture(&fixture.app, &mut private)?;
    assert_eq!(ids.len(), 1);
    let artifact: Artifact = fixture.app.store.get("artifacts", &ids[0])?;
    assert!(!artifact.in_knowledge);
    let notice = Message {
        id: id(),
        sender: "system".into(),
        body: "The run could not publish its reply.".into(),
        run_id: Some(private.id.clone()),
        artifacts: vec![],
        ..fixture.reply.clone()
    };
    fixture.app.store.put("messages", &notice.id, &notice)?;
    assert_eq!(
        artifact
            .source
            .as_ref()
            .context("completion source")?
            .capture_kind,
        "completion"
    );
    let snapshot = owner(&fixture, Method::GET, "/api/state", json!({})).await?;
    assert_eq!(snapshot.0, StatusCode::OK);
    assert!(
        !snapshot.1["artifacts"]
            .as_array()
            .context("artifact snapshot")?
            .iter()
            .any(|value| value["id"] == artifact.id)
    );
    let inspected = owner(
        &fixture,
        Method::GET,
        &document_url(&private, "document", "report.md"),
        json!({}),
    )
    .await?;
    assert_eq!(inspected.1["can_import"], false);
    assert!(inspected.1["artifact"].is_null());
    assert_eq!(
        import(&fixture, &private, "report.md").await?.0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(fixture.app.store.list::<Artifact>("artifacts")?.len(), 1);
    Ok(())
}

#[tokio::test]
async fn invited_default_workspace_owner_cannot_import_or_export_controller_documents() -> Result<()>
{
    let mut fixture = fixture("workspace-write")?;
    let platform = crate::platform::Platform::open(
        fixture.app.clone(),
        fixture._directory.path().join("frontend"),
    )?;
    fixture.router = crate::platform::router(platform.clone());
    let invited_user = "@artifact-owner:example.test";
    let invited_token = id();
    // A persisted authenticated session avoids requiring an external Matrix login.
    platform.db(|db| {
        db.execute(
            "INSERT INTO logins(token_hash,user,expires) VALUES(?,?,unixepoch()+86400)",
            rusqlite::params![
                format!("{:x}", Sha256::digest(invited_token.as_bytes())),
                invited_user
            ],
        )?;
        Ok(())
    })?;
    assert_eq!(
        request(
            &fixture,
            Method::GET,
            "/api/state",
            Some(&invited_token),
            json!({})
        )
        .await?
        .0,
        StatusCode::FORBIDDEN
    );
    let invited = owner(
        &fixture,
        Method::POST,
        "/api/tenants/default/members",
        json!({"user":invited_user,"role":"owner"}),
    )
    .await?;
    assert_eq!(invited.0, StatusCode::OK, "{}", invited.1);
    let (status, bytes) = request(
        &fixture,
        Method::GET,
        "/api/tenants",
        Some(&invited_token),
        json!({}),
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    let tenants: Value = serde_json::from_slice(&bytes)?;
    assert_eq!(tenants[0]["id"], "default");
    assert_eq!(tenants[0]["role"], "owner");

    let document = document_url(&fixture.run, "document", "report.md");
    let import_route = format!("/api/runs/{}/artifacts", fixture.run.id);
    let (status, bytes) = request(
        &fixture,
        Method::GET,
        &document,
        Some(&invited_token),
        json!({}),
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    let metadata: Value = serde_json::from_slice(&bytes)?;
    assert_eq!(metadata["can_import"], false);
    assert_eq!(metadata["can_export"], false);
    assert!(metadata["artifact"].is_null());
    let (status, bytes) = request(
        &fixture,
        Method::POST,
        &import_route,
        Some(&invited_token),
        json!({"path":"report.md"}),
    )
    .await?;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert!(String::from_utf8(bytes)?.contains("requires the bootstrap owner"));
    assert!(fixture.app.store.list::<Artifact>("artifacts")?.is_empty());

    let imported = import(&fixture, &fixture.run, "report.md").await?;
    assert_eq!(imported.0, StatusCode::OK, "{}", imported.1);
    let artifact: Artifact = serde_json::from_value(imported.1)?;
    assert_eq!(fixture.app.store.list::<Artifact>("artifacts")?.len(), 1);
    let (status, bytes) = request(
        &fixture,
        Method::GET,
        &document,
        Some(&invited_token),
        json!({}),
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    let metadata: Value = serde_json::from_slice(&bytes)?;
    assert_eq!(metadata["artifact"]["id"], artifact.id);
    assert_eq!(metadata["can_import"], false);
    assert_eq!(metadata["can_export"], false);
    let export_route = format!("/api/artifacts/{}/export", artifact.id);
    let (status, bytes) = request(
        &fixture,
        Method::POST,
        &export_route,
        Some(&invited_token),
        json!({"path":"denied/copy.md"}),
    )
    .await?;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert!(String::from_utf8(bytes)?.contains("requires the bootstrap owner"));
    assert!(!fixture.root.join("denied").exists());
    let exported = owner(
        &fixture,
        Method::POST,
        &export_route,
        json!({"path":"allowed/copy.md"}),
    )
    .await?;
    assert_eq!(exported.0, StatusCode::OK, "{}", exported.1);
    assert_eq!(
        std::fs::read(fixture.root.join("allowed/copy.md"))?,
        fixture.bytes
    );
    std::fs::remove_file(fixture.root.join("report.md"))?;
    let (status, bytes) = request(
        &fixture,
        Method::GET,
        &format!("/api/artifacts/{}", artifact.id),
        Some(&invited_token),
        json!({}),
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(bytes, fixture.bytes);
    assert_eq!(
        request(
            &fixture,
            Method::GET,
            &document_url(&fixture.run, "files", "report.md"),
            Some(&invited_token),
            json!({})
        )
        .await?
        .0,
        StatusCode::FORBIDDEN
    );
    Ok(())
}
