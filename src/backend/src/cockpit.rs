use crate::{
    App, api, coordination,
    model::{self, ActionItem, Agent, Group, Harness, Run, RunKind},
    security::{ApiError, ApiResult},
    store,
};
use anyhow::{Context, Result, ensure};
use axum::{
    Json,
    extract::{Query, State},
    http::StatusCode,
};
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{BTreeMap, HashMap, HashSet};
use ts_rs::TS;

const MAPPING_KEY: &str = "cockpit_mapping_v1";

#[derive(Clone, Copy, Debug, Eq, PartialEq, Ord, PartialOrd, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum OfficeRole {
    HqLabDirector,
    DataEngineer,
    DataScientist,
    ResearchScientist,
    MlEngineer,
}

struct RoleProfile {
    key: OfficeRole,
    name: &'static str,
    position: &'static str,
    description: &'static str,
    color: &'static str,
}

const ROLES: [RoleProfile; 5] = [
    RoleProfile {
        key: OfficeRole::HqLabDirector,
        name: "Orion",
        position: "Lab Director",
        description: "Koordinasi lab dan keputusan operasional.",
        color: "#7756a7",
    },
    RoleProfile {
        key: OfficeRole::DataEngineer,
        name: "Nova",
        position: "Data Engineer",
        description: "Penyiapan dan validasi data.",
        color: "#176e78",
    },
    RoleProfile {
        key: OfficeRole::DataScientist,
        name: "Atlas",
        position: "Data Scientist",
        description: "Analisis data dan eksperimen model.",
        color: "#3465b4",
    },
    RoleProfile {
        key: OfficeRole::ResearchScientist,
        name: "Lyra",
        position: "Research Scientist",
        description: "Penelaahan metode dan rancangan riset.",
        color: "#a83c6a",
    },
    RoleProfile {
        key: OfficeRole::MlEngineer,
        name: "Axiom",
        position: "ML Engineer",
        description: "Pengembangan alur pelatihan dan inferensi model.",
        color: "#247c5b",
    },
];

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum CockpitPhase {
    Idle,
    Queued,
    Starting,
    Working,
    AwaitingAnswer,
    AwaitingDelegates,
    Unknown,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum CockpitAvailability {
    Unmapped,
    Deleted,
    Paused,
    Unattached,
    Offline,
    Checking,
    Unknown,
    Ready,
}

#[derive(Clone, Debug, Serialize, TS)]
#[ts(export)]
pub struct CockpitRun {
    pub id: String,
    pub group_id: String,
    pub group_name: String,
    pub side_chat_id: Option<String>,
    pub kind: RunKind,
    pub status: String,
    pub phase: CockpitPhase,
    pub parent_run_id: Option<String>,
    pub created_at: String,
    pub started_at: Option<String>,
    pub ended_at: Option<String>,
    pub summary: String,
}

#[derive(Clone, Debug, Serialize, TS)]
#[ts(export)]
pub struct CockpitAgent {
    pub office_role: OfficeRole,
    pub agent_id: Option<String>,
    pub name: String,
    pub position: String,
    pub role: String,
    pub color: String,
    pub reports_to: Option<String>,
    pub enabled: bool,
    pub availability: CockpitAvailability,
    pub connection_checked_at: Option<String>,
    pub in_scope: bool,
    pub phase: CockpitPhase,
    pub active_runs: Vec<CockpitRun>,
    pub latest_result: Option<CockpitRun>,
    pub current_activity: Option<crate::activity::RunActivity>,
}

#[derive(Clone, Debug, Serialize, TS)]
#[ts(export)]
pub struct CockpitGroup {
    pub id: String,
    pub name: String,
    pub is_project: bool,
}

#[derive(Clone, Debug, Serialize, TS)]
#[ts(export)]
pub struct CockpitAction {
    pub id: String,
    pub group_id: String,
    pub agent_id: String,
    pub status: String,
    pub planned_start: Option<String>,
    pub run_id: Option<String>,
    pub summary: String,
}

#[derive(Clone, Copy, Debug, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum CockpitEventKind {
    StepActivity,
    ActivityUpdated,
    Delegated,
    AwaitingAnswer,
    QuestionAnswered,
}

#[derive(Clone, Debug, Serialize, TS)]
#[ts(export)]
pub struct CockpitEvent {
    #[ts(type = "number")]
    pub id: i64,
    pub kind: CockpitEventKind,
    pub office_role: OfficeRole,
    pub agent_id: String,
    pub run_id: String,
    pub status: String,
    pub created_at: String,
    pub summary: String,
    pub activity: Option<crate::activity::RunActivity>,
}

#[derive(Clone, Debug, Default, Serialize, TS)]
#[ts(export)]
pub struct CockpitTotals {
    pub agents: usize,
    pub active_runs: usize,
    pub queued: usize,
    pub starting: usize,
    pub working: usize,
    pub awaiting_answer: usize,
    pub awaiting_delegates: usize,
    pub completed: usize,
    pub failed: usize,
    pub backlog: usize,
    pub scheduled: usize,
    #[ts(type = "number | null")]
    pub tokens_processed: Option<u64>,
    pub tokens_reported_runs: usize,
    pub tokens_total_runs: usize,
}

#[derive(Clone, Debug, Serialize, TS)]
#[ts(export)]
pub struct CockpitState {
    pub schema_version: u32,
    pub workspace_id: String,
    pub generated_at: String,
    pub group_id: Option<String>,
    pub setup_required: bool,
    pub mapping: BTreeMap<OfficeRole, String>,
    pub groups: Vec<CockpitGroup>,
    pub agents: Vec<CockpitAgent>,
    pub actions: Vec<CockpitAction>,
    pub events: Vec<CockpitEvent>,
    pub totals: CockpitTotals,
}

#[derive(Default, Deserialize)]
pub struct StateQuery {
    group_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MappingInput {
    pub mapping: BTreeMap<OfficeRole, String>,
}

fn require_owner(app: &App) -> Result<(), ApiError> {
    if app
        .identity
        .as_ref()
        .is_some_and(|identity| identity.role != "owner")
    {
        return Err(ApiError(
            StatusCode::FORBIDDEN,
            "Workspace owner required for live preview".into(),
        ));
    }
    Ok(())
}

pub async fn state(
    State(app): State<App>,
    Query(query): Query<StateQuery>,
) -> ApiResult<CockpitState> {
    require_owner(&app)?;
    Ok(Json(snapshot(&app, query.group_id.as_deref())?))
}

fn mapping(conn: &Connection) -> Result<BTreeMap<OfficeRole, String>> {
    let saved: Option<String> = conn
        .query_row(
            "SELECT value FROM metadata WHERE key=?",
            [MAPPING_KEY],
            |row| row.get(0),
        )
        .optional()?;
    Ok(saved
        .map(|value| serde_json::from_str(&value))
        .transpose()?
        .unwrap_or_default())
}

fn persist_mapping(conn: &Connection, saved: &BTreeMap<OfficeRole, String>) -> Result<()> {
    conn.execute("INSERT INTO metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [MAPPING_KEY, &serde_json::to_string(saved)?])?;
    store::event(
        conn,
        "cockpit.mapping_updated",
        &json!({"mapped_roles": saved.len()}),
    )?;
    Ok(())
}

pub async fn save_mapping(
    State(app): State<App>,
    Json(input): Json<MappingInput>,
) -> ApiResult<CockpitState> {
    require_owner(&app)?;
    app.store.write(|conn| {
        let mut ids = HashSet::new();
        for id in input.mapping.values() {
            crate::security::validate_id(id)?;
            ensure!(
                ids.insert(id),
                "Each office role must use a different agent"
            );
            let agent: Agent = store::get(conn, "agents", id)
                .context("Mapped agent does not exist in this workspace")?;
            ensure!(
                agent.deleted_at.is_none(),
                "Restore a deleted agent before mapping it"
            );
        }
        if mapping(conn)? != input.mapping {
            persist_mapping(conn, &input.mapping)?;
        }
        Ok(())
    })?;
    Ok(Json(snapshot(&app, None)?))
}

fn template(profile: &RoleProfile) -> Agent {
    Agent {
        id: model::id(),
        runtime_id: None,
        harness: Harness::Codex,
        project_id: None,
        name: profile.name.into(),
        position: profile.position.into(),
        role: profile.description.into(),
        reports_to: None,
        color: profile.color.into(),
        model: String::new(),
        reasoning: String::new(),
        instructions: String::new(),
        agents_md: String::new(),
        workdir: None,
        permission: "read-only".into(),
        timeout_seconds: 1800,
        enabled: false,
        deleted_at: None,
        revision: 1,
    }
}

fn initialize(app: &App) -> Result<()> {
    let mut candidates: Vec<_> = ROLES.iter().map(template).collect();
    for agent in &mut candidates {
        api::validate_agent(app, agent)?;
    }
    let created = app.store.write(|conn| {
        let mut saved = mapping(conn)?;
        let mut created = vec![];
        for (profile, mut agent) in ROLES.iter().zip(candidates) {
            if let Some(id) = saved.get(&profile.key) {
                let existing: Agent = store::get(conn, "agents", id)
                    .context("Mapped agent is missing; repair the mapping before setup")?;
                ensure!(
                    existing.deleted_at.is_none(),
                    "Restore or remap the deleted cockpit agent before setup"
                );
                continue;
            }
            if profile.key != OfficeRole::HqLabDirector {
                agent.reports_to = Some(
                    saved
                        .get(&OfficeRole::HqLabDirector)
                        .context("Map the lab director before the specialist roles")?
                        .clone(),
                );
            }
            api::create_agent_record(conn, &mut agent)?;
            saved.insert(profile.key, agent.id.clone());
            created.push(agent);
        }
        if !created.is_empty() {
            persist_mapping(conn, &saved)?;
        }
        Ok(created)
    })?;
    for agent in &created {
        app.store.materialize(agent)?;
    }
    Ok(())
}

pub async fn setup(State(app): State<App>) -> ApiResult<CockpitState> {
    require_owner(&app)?;
    initialize(&app)?;
    Ok(Json(snapshot(&app, None)?))
}

fn phase(run: &Run, pending: &HashSet<String>) -> CockpitPhase {
    match run.status.as_str() {
        "queued" => CockpitPhase::Queued,
        "starting" | "running" if pending.contains(&run.id) => CockpitPhase::AwaitingAnswer,
        "starting" => CockpitPhase::Starting,
        "running" => CockpitPhase::Working,
        "waiting" => CockpitPhase::AwaitingDelegates,
        "succeeded" | "failed" | "timed_out" | "interrupted" | "cancelled" | "delegated" => {
            CockpitPhase::Idle
        }
        _ => CockpitPhase::Unknown,
    }
}

fn summarize(run: &Run, groups: &HashMap<String, Group>, pending: &HashSet<String>) -> CockpitRun {
    let group_name = groups
        .get(&run.group_id)
        .map(|group| group.name.clone())
        .unwrap_or_else(|| "Unavailable group".into());
    let label = match run.kind {
        RunKind::Direct => "Direct work",
        RunKind::Coordinator => "Coordination",
        RunKind::Delegate => "Delegated work",
        RunKind::Summary => "Result summary",
        RunKind::Review => "Failure review",
    };
    CockpitRun {
        id: run.id.clone(),
        group_id: run.group_id.clone(),
        group_name: group_name.clone(),
        side_chat_id: run.side_chat_id.clone(),
        kind: run.kind,
        status: run.status.clone(),
        phase: phase(run, pending),
        parent_run_id: run.parent_run_id.clone(),
        created_at: run.created_at.clone(),
        started_at: run.started_at.clone(),
        ended_at: run.ended_at.clone(),
        summary: format!("{label} in {group_name}"),
    }
}

fn availability(
    conn: &Connection,
    agent: &Agent,
    effective_workspace: Option<&model::Workspace>,
    harness: Harness,
    now: i64,
) -> Result<(CockpitAvailability, Option<String>)> {
    if agent.deleted_at.is_some() {
        return Ok((CockpitAvailability::Deleted, None));
    }
    let workspace = if let Some(workspace) = effective_workspace {
        Some(workspace.clone())
    } else if let Some(id) = &agent.project_id {
        let group: Group = store::get(conn, "groups", id)?;
        if group.archived_at.is_some() || group.deleted_at.is_some() {
            return Ok((CockpitAvailability::Paused, None));
        }
        group.project.map(|project| project.workdir)
    } else {
        agent.workdir.clone()
    };
    let Some(workspace) = workspace else {
        return Ok((CockpitAvailability::Unattached, None));
    };
    if !agent.enabled {
        return Ok((CockpitAvailability::Paused, None));
    }
    if let Some(id) = &workspace.runtime_id {
        let runtime: Option<String> = conn
            .query_row(
                "SELECT value FROM metadata WHERE key=?",
                [format!("runtime:{id}")],
                |row| row.get(0),
            )
            .optional()?;
        let Some(runtime) = runtime else {
            return Ok((CockpitAvailability::Offline, None));
        };
        let runtime: Value = serde_json::from_str(&runtime)?;
        let seen = runtime["last_seen"].as_i64();
        let checked = seen
            .and_then(|value| chrono::DateTime::from_timestamp(value, 0))
            .map(|time| time.to_rfc3339());
        let online = !runtime["revoked"].as_bool().unwrap_or(true)
            && seen.is_some_and(|seen| seen > now - 30);
        let state = if !online {
            CockpitAvailability::Offline
        } else if runtime["capabilities"][harness.as_str()]["models"]
            .as_array()
            .is_some_and(|models| !models.is_empty())
        {
            CockpitAvailability::Ready
        } else {
            CockpitAvailability::Unknown
        };
        return Ok((state, checked));
    }
    if workspace.ssh_host.is_some() {
        let connection = crate::remote::connection_for(&workspace, harness);
        return Ok(match connection {
            Some(connection) => (
                match connection.status.as_str() {
                    "online" => CockpitAvailability::Ready,
                    "offline" => CockpitAvailability::Offline,
                    _ => CockpitAvailability::Checking,
                },
                (!connection.checked_at.is_empty()).then_some(connection.checked_at),
            ),
            None => (CockpitAvailability::Checking, None),
        });
    }
    Ok((CockpitAvailability::Unknown, None))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        Router,
        body::{Body, to_bytes},
        http::{Method, Request},
    };
    use sha2::{Digest, Sha256};
    use std::{
        net::{Ipv4Addr, SocketAddrV4},
        path::PathBuf,
        sync::{Arc, Mutex, atomic::AtomicBool},
    };
    use tower::ServiceExt;

    fn application(directory: &std::path::Path) -> Result<App> {
        let store = Arc::new(store::Store::open(directory.to_path_buf())?);
        Ok(App {
            workspace_id: "default".into(),
            identity: None,
            public_url: Arc::new("http://127.0.0.1:8765".into()),
            enabled: Arc::new(AtomicBool::new(false)),
            token: Arc::new("test-owner-token".into()),
            address: SocketAddrV4::new(Ipv4Addr::LOCALHOST, 8765),
            codex: PathBuf::from("unused-provider-cli"),
            codex_version: Arc::new(String::new()),
            wake: Arc::new(tokio::sync::Notify::new()),
            cancellations: Arc::new(Mutex::new(HashMap::new())),
            knowledge: Arc::new(crate::knowledge::Knowledge::new(directory.join(".state"))),
            tool_tokens: Arc::new(Mutex::new(HashMap::new())),
            store,
        })
    }

    fn run(agent: &Agent, id: &str, status: &str, kind: RunKind, side: Option<&str>) -> Run {
        Run {
            id: id.into(),
            group_id: "general".into(),
            message_id: "message".into(),
            side_chat_id: side.map(str::to_owned),
            agent_id: agent.id.clone(),
            session_id: "private-session".into(),
            native_session_id: Some("private-native-id".into()),
            status: status.into(),
            cwd: "/private/workdir".into(),
            profile: agent.clone(),
            created_at: model::now(),
            started_at: Some(model::now()),
            ended_at: (!["queued", "starting", "running", "waiting"].contains(&status))
                .then(model::now),
            pid: Some(123),
            remote_pid: None,
            exit_code: None,
            error: Some("private-error".into()),
            artifact_errors: vec![],
            output: "private-output".into(),
            executable: "private-executable".into(),
            arguments: vec!["private-argument".into()],
            model_display_name: None,
            usage: None,
            kind,
            parent_run_id: None,
            task: Some("private-task".into()),
            organization_context: None,
        }
    }

    #[test]
    fn setup_is_idempotent_preserves_profiles_and_survives_restart() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let mut app = application(directory.path())?;
        let original: Agent = app.store.get("agents", "ceo")?;
        initialize(&app)?;
        let first = snapshot(&app, None)?;
        assert!(!first.setup_required);
        assert_eq!(app.store.list::<Agent>("agents")?.len(), 6);
        for slot in &first.agents {
            let agent: Agent = app.store.get("agents", slot.agent_id.as_ref().unwrap())?;
            assert!(!agent.enabled);
            assert!(agent.workdir.is_none());
            assert_eq!(agent.revision, 1);
            assert_eq!(
                agent.position,
                ROLES
                    .iter()
                    .find(|role| role.key == slot.office_role)
                    .unwrap()
                    .position
            );
            assert_eq!(
                agent.color,
                ROLES
                    .iter()
                    .find(|role| role.key == slot.office_role)
                    .unwrap()
                    .color
            );
            assert_eq!(
                agent.reports_to,
                if slot.office_role == OfficeRole::HqLabDirector {
                    None
                } else {
                    Some(first.mapping[&OfficeRole::HqLabDirector].clone())
                }
            );
        }
        initialize(&app)?;
        assert_eq!(snapshot(&app, None)?.mapping, first.mapping);
        assert_eq!(app.store.list::<Agent>("agents")?.len(), 6);
        assert_eq!(
            serde_json::to_value(app.store.get::<Agent>("agents", "ceo")?)?,
            serde_json::to_value(original)?
        );
        app.store = Arc::new(store::Store::open(directory.path().to_path_buf())?);
        assert_eq!(snapshot(&app, None)?.mapping, first.mapping);
        let director_id = &first.mapping[&OfficeRole::HqLabDirector];
        let mut director: Agent = app.store.get("agents", director_id)?;
        director.name = "Renamed director".into();
        director.deleted_at = Some(model::now());
        app.store.put("agents", director_id, &director)?;
        let deleted = snapshot(&app, None)?;
        assert_eq!(deleted.agents[0].availability, CockpitAvailability::Deleted);
        assert_eq!(deleted.agents[0].name, "Renamed director");
        assert!(initialize(&app).is_err());
        assert_eq!(app.store.list::<Agent>("agents")?.len(), 6);
        Ok(())
    }

    #[test]
    fn projection_uses_scoped_project_workdir_without_changing_agent_defaults() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let app = application(directory.path())?;
        initialize(&app)?;
        let saved = snapshot(&app, None)?.mapping;
        let mut agent: Agent = app.store.get("agents", &saved[&OfficeRole::DataEngineer])?;
        agent.enabled = true;
        assert!(agent.workdir.is_none());
        app.store.put("agents", &agent.id, &agent)?;
        let original = serde_json::to_value(&agent)?;
        let project_directory = directory.path().join("project");
        std::fs::create_dir(&project_directory)?;
        let document = project_directory.join("PROJECT_BRIEF.md");
        std::fs::write(
            &document,
            "Project documentation for the projection regression.",
        )?;
        let document = document.canonicalize()?;
        let workspace = crate::security::validate_workspace(project_directory.to_str().unwrap())?;
        let mut project: Group = app.store.get("groups", "general")?;
        project.id = "project-workdir".into();
        project.member_ids = None;
        project.project = Some(model::Project {
            workdir: workspace.clone(),
            members: vec![model::ProjectMember {
                agent_id: agent.id.clone(),
                manager_id: None,
            }],
        });
        app.store
            .read(|conn| crate::group_scope::validate(conn, &mut project))?;
        app.store.put("groups", &project.id, &project)?;
        let idle = snapshot(&app, Some(&project.id))?;
        let slot = idle
            .agents
            .iter()
            .find(|slot| slot.office_role == OfficeRole::DataEngineer)
            .unwrap();
        assert_eq!(slot.availability, CockpitAvailability::Unknown);
        assert_eq!(slot.phase, CockpitPhase::Idle);
        let unfiltered = snapshot(&app, None)?;
        assert_eq!(
            unfiltered
                .agents
                .iter()
                .find(|slot| slot.office_role == OfficeRole::DataEngineer)
                .unwrap()
                .availability,
            CockpitAvailability::Unattached
        );
        app.store.write(|conn| {
            crate::api::submit_message(
                conn,
                crate::api::SendInput {
                    id: "project-audit".into(),
                    group_id: project.id.clone(),
                    side_chat_id: None,
                    body: format!("@{} Review PROJECT_BRIEF.md", agent.name),
                    recipients: vec![],
                    reply_to: None,
                    artifacts: vec![],
                },
                None,
            )
        })?;
        let mut active = app
            .store
            .list::<Run>("runs")?
            .into_iter()
            .find(|run| run.message_id == "project-audit")
            .unwrap();
        assert_eq!(
            serde_json::to_value(&active.profile.workdir)?,
            serde_json::to_value(&workspace)?
        );
        active.status = "running".into();
        active.pid = Some(123);
        active.started_at = Some(model::now());
        app.store.put("runs", &active.id, &active)?;
        let activity = crate::activity::antigravity_step(&active.id, &json!({"event":"step_update","step_update":{"step_index":1,"state":"DONE","step_type":"tool","tool_name":"view_file","tool_info":{"parameters":{"AbsolutePath":document.to_string_lossy()}}}}), &workspace.canonical_path).unwrap();
        app.store
            .event("run.activity", serde_json::to_value(activity)?)?;
        for filter in [None, Some(project.id.as_str())] {
            let state = snapshot(&app, filter)?;
            let slot = state
                .agents
                .iter()
                .find(|slot| slot.office_role == OfficeRole::DataEngineer)
                .unwrap();
            assert_eq!(slot.availability, CockpitAvailability::Unknown);
            assert_eq!(slot.phase, CockpitPhase::Working);
            assert_eq!(slot.active_runs[0].id, active.id);
            assert_eq!(
                slot.current_activity
                    .as_ref()
                    .unwrap()
                    .relative_file
                    .as_deref(),
                Some("PROJECT_BRIEF.md")
            );
        }
        let unrelated = snapshot(&app, Some("general"))?;
        assert!(unrelated.events.is_empty());
        let slot = unrelated
            .agents
            .iter()
            .find(|slot| slot.office_role == OfficeRole::DataEngineer)
            .unwrap();
        assert!(slot.active_runs.is_empty());
        assert!(slot.current_activity.is_none());
        assert_eq!(slot.availability, CockpitAvailability::Unattached);
        assert_eq!(
            serde_json::to_value(app.store.get::<Agent>("agents", &agent.id)?)?,
            original
        );
        Ok(())
    }

    #[test]
    fn projection_keeps_parallel_old_active_work_and_hides_private_data() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let app = application(directory.path())?;
        initialize(&app)?;
        let saved = snapshot(&app, None)?.mapping;
        let agent: Agent = app.store.get("agents", &saved[&OfficeRole::DataEngineer])?;
        for (id, status, kind, side) in [
            ("active-main", "running", RunKind::Direct, None),
            ("active-side", "running", RunKind::Direct, Some("side")),
            ("waiting-delegates", "waiting", RunKind::Coordinator, None),
            ("queued", "queued", RunKind::Delegate, None),
        ] {
            app.store
                .put("runs", id, &run(&agent, id, status, kind, side))?;
        }
        let question = crate::questions::QuestionRequest {
            id: "question".into(),
            request_id: "question-request".into(),
            run_id: "active-side".into(),
            agent_id: agent.id.clone(),
            agent_name: agent.name.clone(),
            group_id: "general".into(),
            side_chat_id: Some("side".into()),
            questions: vec![crate::questions::Question {
                id: "clarification".into(),
                header: "Scope".into(),
                question: "Which output format do you want?".into(),
                options: vec![],
            }],
            answers: BTreeMap::new(),
            status: "pending".into(),
            delivered: false,
            created_at: model::now(),
            answered_at: None,
            error: None,
        };
        app.store.put("questions", &question.id, &question)?;
        for n in 0..120 {
            let id = format!("finished-{n}");
            app.store.put(
                "runs",
                &id,
                &run(&agent, &id, "succeeded", RunKind::Direct, None),
            )?;
        }
        app.store.event(
            "run.changed",
            json!({"run_id":"active-main", "secret":"private-event"}),
        )?;
        let state = snapshot(&app, None)?;
        let slot = state
            .agents
            .iter()
            .find(|slot| slot.office_role == OfficeRole::DataEngineer)
            .unwrap();
        assert_eq!(slot.active_runs.len(), 4);
        assert_eq!(slot.phase, CockpitPhase::Working);
        assert_eq!(state.totals.active_runs, 4);
        assert_eq!(state.totals.working, 1);
        assert_eq!(state.totals.awaiting_answer, 1);
        assert_eq!(state.totals.awaiting_delegates, 1);
        assert_eq!(state.totals.queued, 1);
        assert_eq!(state.totals.completed, 120);
        assert_eq!(state.events.len(), 1);
        app.store.event("run.activity", json!({"run_id":"active-main","category":"reading","state":"active","step_index":1,"relative_file":"PROJECT_BRIEF.md"}))?;
        let with_activity = snapshot(&app, None)?;
        let activity_slot = with_activity
            .agents
            .iter()
            .find(|slot| slot.office_role == OfficeRole::DataEngineer)
            .unwrap();
        assert_eq!(
            activity_slot
                .current_activity
                .as_ref()
                .unwrap()
                .relative_file
                .as_deref(),
            Some("PROJECT_BRIEF.md")
        );
        assert_eq!(with_activity.events.len(), 2);
        assert!(with_activity.events[0].summary.contains("Membaca file"));
        assert!(with_activity.events[0].activity.is_some());
        assert!(!serde_json::to_string(&with_activity)?.contains("private-output"));
        let serialized = serde_json::to_string(&state)?;
        for secret in [
            "private-session",
            "private-native-id",
            "private/workdir",
            "private-error",
            "private-output",
            "private-executable",
            "private-argument",
            "private-task",
            "private-event",
        ] {
            assert!(!serialized.contains(secret), "Projection exposed {secret}");
        }
        let mut restricted: Group = app.store.get("groups", "general")?;
        restricted.id = "restricted".into();
        restricted.name = "Restricted".into();
        restricted.member_ids = Some(vec![saved[&OfficeRole::MlEngineer].clone()]);
        app.store.put("groups", &restricted.id, &restricted)?;
        let filtered = snapshot(&app, Some("restricted"))?;
        assert!(
            !filtered
                .agents
                .iter()
                .find(|slot| slot.office_role == OfficeRole::DataEngineer)
                .unwrap()
                .in_scope
        );
        assert_eq!(filtered.totals.active_runs, 0);
        assert_eq!(filtered.totals.completed, 0);
        assert!(filtered.events.is_empty());
        assert!(snapshot(&app, Some("another-workspace-group")).is_err());
        Ok(())
    }

    #[test]
    fn active_availability_uses_queued_harness_after_profile_switch() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let app = application(directory.path())?;
        initialize(&app)?;
        let saved = snapshot(&app, None)?.mapping;
        let mut agent: Agent = app.store.get("agents", &saved[&OfficeRole::DataEngineer])?;
        agent.enabled = true;
        agent.harness = Harness::Antigravity;
        agent.workdir = Some(model::Workspace {
            runtime_id: Some("harness-worker".into()),
            ssh_host: None,
            path: "/project".into(),
            canonical_path: "/project".into(),
            git_root: None,
        });
        app.store.put("agents", &agent.id, &agent)?;
        app.store.write(|conn| {
            conn.execute("INSERT INTO metadata(key,value) VALUES('runtime:harness-worker',?)", [json!({"id":"harness-worker","revoked":false,"last_seen":chrono::Utc::now().timestamp(),"capabilities":{"antigravity":{"models":[{"slug":"advertised-model"}]}}}).to_string()])?;
            crate::api::submit_message(conn, crate::api::SendInput {
                id: "harness-switch".into(),
                group_id: "general".into(),
                side_chat_id: None,
                body: format!("@{} Review project documentation", agent.name),
                recipients: vec![],
                reply_to: None,
                artifacts: vec![],
            }, None)?;
            Ok(())
        })?;
        let mut active = app
            .store
            .list::<Run>("runs")?
            .into_iter()
            .find(|run| run.message_id == "harness-switch")
            .unwrap();
        assert_eq!(active.profile.harness, Harness::Antigravity);
        agent.harness = Harness::Codex;
        app.store.put("agents", &agent.id, &agent)?;
        for (status, phase) in [
            ("queued", CockpitPhase::Queued),
            ("running", CockpitPhase::Working),
        ] {
            active.status = status.into();
            app.store.put("runs", &active.id, &active)?;
            let state = snapshot(&app, Some("general"))?;
            let slot = state
                .agents
                .iter()
                .find(|slot| slot.office_role == OfficeRole::DataEngineer)
                .unwrap();
            assert_eq!(slot.availability, CockpitAvailability::Ready);
            assert_eq!(slot.phase, phase);
            assert_eq!(slot.active_runs[0].id, active.id);
            assert_eq!(
                app.store.get::<Run>("runs", &active.id)?.profile.harness,
                Harness::Antigravity
            );
        }
        active.status = "succeeded".into();
        active.ended_at = Some(model::now());
        app.store.put("runs", &active.id, &active)?;
        let idle = snapshot(&app, Some("general"))?;
        let slot = idle
            .agents
            .iter()
            .find(|slot| slot.office_role == OfficeRole::DataEngineer)
            .unwrap();
        assert_eq!(slot.phase, CockpitPhase::Idle);
        assert_eq!(slot.availability, CockpitAvailability::Unknown);
        assert_eq!(
            app.store.get::<Agent>("agents", &agent.id)?.harness,
            Harness::Codex
        );
        Ok(())
    }

    #[test]
    fn availability_obeys_heartbeat_and_actions_are_not_running_work() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let app = application(directory.path())?;
        initialize(&app)?;
        let saved = snapshot(&app, None)?.mapping;
        let mut agent: Agent = app.store.get("agents", &saved[&OfficeRole::MlEngineer])?;
        agent.enabled = true;
        agent.workdir = Some(model::Workspace {
            runtime_id: Some("worker".into()),
            ssh_host: None,
            path: "/private".into(),
            canonical_path: "/private".into(),
            git_root: None,
        });
        app.store.put("agents", &agent.id, &agent)?;
        app.store.write(|conn| {
            let catalog = crate::codex_settings::CodexSettings {
                model: "model".into(), reasoning: "medium".into(), fetched_at: Some(model::now()),
                models: vec![crate::codex_settings::ModelOption {
                    slug: "model".into(), display_name: "Model".into(), visibility: "list".into(),
                    default_reasoning_level: "medium".into(), supported_reasoning_levels: vec![],
                }],
            };
            conn.execute("INSERT INTO metadata VALUES('runtime:worker',?)", [json!({"id":"worker","revoked":false,"last_seen":chrono::Utc::now().timestamp()-40,"token":"private-token","capabilities":{"codex":catalog}}).to_string()])?;
            Ok(())
        })?;
        let item = ActionItem {
            id: "scheduled-action".into(),
            group_id: "general".into(),
            title: "private-title".into(),
            body: "private-body".into(),
            assignee_id: agent.id.clone(),
            planned_start: Some("2099-01-01T00:00:00Z".into()),
            status: "scheduled".into(),
            created_by: "owner".into(),
            created_at: model::now(),
            updated_at: model::now(),
            revision: 1,
            run_id: None,
            error: None,
        };
        app.store.put("action_items", &item.id, &item)?;
        let state = snapshot(&app, None)?;
        assert_eq!(state.agents[4].availability, CockpitAvailability::Offline);
        assert_eq!(state.agents[4].phase, CockpitPhase::Idle);
        assert_eq!(state.totals.scheduled, 1);
        assert_eq!(state.totals.active_runs, 0);
        assert!(!serde_json::to_string(&state)?.contains("private-"));
        app.store.write(|conn| {
            conn.execute("UPDATE metadata SET value=json_set(value,'$.last_seen',?) WHERE key='runtime:worker'", [chrono::Utc::now().timestamp()])?;
            Ok(())
        })?;
        assert_eq!(
            snapshot(&app, None)?.agents[4].availability,
            CockpitAvailability::Ready
        );
        app.store.write(|conn| {
            conn.execute("UPDATE metadata SET value=json_set(value,'$.capabilities.codex.models',json('[]')) WHERE key='runtime:worker'", [])?;
            Ok(())
        })?;
        assert_eq!(
            snapshot(&app, None)?.agents[4].availability,
            CockpitAvailability::Unknown
        );
        app.store.put(
            "runs",
            "unknown-status",
            &run(
                &agent,
                "unknown-status",
                "future-provider-status",
                RunKind::Direct,
                None,
            ),
        )?;
        assert_eq!(snapshot(&app, None)?.agents[4].phase, CockpitPhase::Unknown);
        let mut project: Group = app.store.get("groups", "general")?;
        project.id = "archived-project".into();
        project.archived_at = Some(model::now());
        project.project = Some(model::Project {
            workdir: agent.workdir.clone().unwrap(),
            members: vec![model::ProjectMember {
                agent_id: agent.id.clone(),
                manager_id: None,
            }],
        });
        app.store.put("groups", &project.id, &project)?;
        agent.project_id = Some(project.id);
        app.store.put("agents", &agent.id, &agent)?;
        assert_eq!(
            snapshot(&app, None)?.agents[4].availability,
            CockpitAvailability::Paused
        );
        Ok(())
    }

    #[test]
    fn token_totals_use_reported_usage_preserve_unknown_and_follow_scope() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let app = application(directory.path())?;
        initialize(&app)?;
        let saved = snapshot(&app, None)?.mapping;
        let agent: Agent = app.store.get("agents", &saved[&OfficeRole::DataEngineer])?;
        let initial = snapshot(&app, None)?;
        assert_eq!(initial.totals.tokens_processed, None);
        assert_eq!(initial.totals.tokens_reported_runs, 0);
        for (id, usage, harness) in [
            (
                "codex-usage",
                Some(
                    json!({"input_tokens":100,"cached_input_tokens":40,"output_tokens":20,"private":"private-usage"}),
                ),
                Harness::Codex,
            ),
            (
                "antigravity-usage",
                Some(json!({"total_tokens":35})),
                Harness::Antigravity,
            ),
            (
                "opencode-first",
                Some(
                    json!({"input_tokens":10,"output_tokens":5,"source":"opencode_session","messages":1}),
                ),
                Harness::Opencode,
            ),
            (
                "opencode-second",
                Some(
                    json!({"input_tokens":20,"output_tokens":5,"source":"opencode_session","messages":1}),
                ),
                Harness::Opencode,
            ),
            (
                "step-finish",
                Some(json!({"tokens":{"input":8,"output":3,"reasoning":2}})),
                Harness::Opencode,
            ),
            ("unknown-usage", None, Harness::Antigravity),
            (
                "malformed-usage",
                Some(json!({"input_tokens":"100","output_tokens":20})),
                Harness::Codex,
            ),
            (
                "partial-usage",
                Some(json!({"input_tokens":100})),
                Harness::Codex,
            ),
        ] {
            let mut record = run(&agent, id, "succeeded", RunKind::Direct, None);
            record.usage = usage;
            record.profile.harness = harness;
            app.store.put("runs", id, &record)?;
        }
        let unrelated: Agent = app.store.get("agents", "ceo")?;
        let mut unscoped = run(&unrelated, "not-mapped", "succeeded", RunKind::Direct, None);
        unscoped.usage = Some(json!({"total_tokens":9999}));
        app.store.put("runs", &unscoped.id, &unscoped)?;
        let state = snapshot(&app, None)?;
        assert_eq!(state.totals.tokens_processed, Some(208));
        assert_eq!(state.totals.tokens_reported_runs, 5);
        assert_eq!(state.totals.tokens_total_runs, 8);
        assert!(!serde_json::to_string(&state)?.contains("private-usage"));
        let mut other_group: Group = app.store.get("groups", "general")?;
        other_group.id = "other-group".into();
        other_group.name = "Other group".into();
        app.store.put("groups", &other_group.id, &other_group)?;
        assert_eq!(
            snapshot(&app, Some("other-group"))?.totals.tokens_processed,
            None
        );
        let mut zero = run(&agent, "reported-zero", "succeeded", RunKind::Direct, None);
        zero.group_id = other_group.id.clone();
        zero.usage = Some(json!({"input_tokens":0,"output_tokens":0}));
        app.store.put("runs", &zero.id, &zero)?;
        let reported_zero = snapshot(&app, Some(&other_group.id))?;
        assert_eq!(reported_zero.totals.tokens_processed, Some(0));
        assert_eq!(reported_zero.totals.tokens_reported_runs, 1);
        assert_eq!(reported_zero.totals.tokens_total_runs, 1);
        assert_eq!(reported_tokens(&json!({"total_tokens":-1})), None);
        assert_eq!(
            reported_tokens(&json!({"total_tokens":9_007_199_254_740_992u64})),
            None
        );
        for id in ["max-one", "max-two"] {
            let mut record = run(&agent, id, "succeeded", RunKind::Direct, None);
            record.group_id = other_group.id.clone();
            record.usage = Some(json!({"total_tokens":9_007_199_254_740_991u64}));
            app.store.put("runs", id, &record)?;
        }
        assert_eq!(
            snapshot(&app, Some(&other_group.id))?
                .totals
                .tokens_processed,
            None
        );
        Ok(())
    }

    async fn request(
        router: &Router,
        method: Method,
        path: &str,
        credential: Option<&str>,
        workspace: Option<&str>,
        body: Value,
    ) -> Result<(StatusCode, Value)> {
        let mut request = Request::builder()
            .method(method)
            .uri(path)
            .header("host", "127.0.0.1:8765")
            .header("content-type", "application/json");
        if let Some(token) = credential {
            request = request.header("authorization", format!("Bearer {token}"));
        }
        if let Some(workspace) = workspace {
            request = request.header("x-ae-workspace", workspace);
        }
        let response = router
            .clone()
            .oneshot(request.body(Body::from(body.to_string()))?)
            .await?;
        let status = response.status();
        let bytes = to_bytes(response.into_body(), 1024 * 1024).await?;
        Ok((status, serde_json::from_slice(&bytes)?))
    }

    #[tokio::test]
    async fn real_http_routes_enforce_owner_tenant_and_mapping_validation() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let app = application(directory.path())?;
        let platform =
            crate::platform::Platform::open(app.clone(), directory.path().join("frontend"))?;
        let router = crate::platform::router(platform.clone());
        let anonymous = request(
            &router,
            Method::GET,
            "/api/cockpit/state",
            None,
            None,
            json!({}),
        )
        .await?;
        assert_eq!(anonymous.0, StatusCode::UNAUTHORIZED);
        let member_token = "test-member-session";
        platform.db(|conn| {
            conn.execute(
                "INSERT INTO members VALUES('default','member','member')",
                [],
            )?;
            conn.execute(
                "INSERT INTO logins VALUES(?,'member',unixepoch()+3600)",
                [format!("{:x}", Sha256::digest(member_token.as_bytes()))],
            )?;
            Ok(())
        })?;
        for (method, path) in [
            (Method::GET, "/api/cockpit/state"),
            (Method::POST, "/api/cockpit/setup"),
            (Method::PUT, "/api/cockpit/mapping"),
        ] {
            assert_eq!(
                request(
                    &router,
                    method,
                    path,
                    Some(member_token),
                    None,
                    json!({"mapping":{}})
                )
                .await?
                .0,
                StatusCode::FORBIDDEN
            );
        }
        let first = request(
            &router,
            Method::POST,
            "/api/cockpit/setup",
            Some(&app.token),
            None,
            json!({}),
        )
        .await?;
        assert_eq!(first.0, StatusCode::OK);
        let second = request(
            &router,
            Method::POST,
            "/api/cockpit/setup",
            Some(&app.token),
            None,
            json!({}),
        )
        .await?;
        assert_eq!(second.1["mapping"], first.1["mapping"]);
        let director = first.1["mapping"]["hq_lab_director"].as_str().unwrap();
        let duplicate = request(
            &router,
            Method::PUT,
            "/api/cockpit/mapping",
            Some(&app.token),
            None,
            json!({"mapping":{"hq_lab_director":director,"data_engineer":director}}),
        )
        .await?;
        assert_eq!(duplicate.0, StatusCode::BAD_REQUEST);
        assert_eq!(
            request(
                &router,
                Method::GET,
                "/api/cockpit/state",
                Some(&app.token),
                None,
                json!({})
            )
            .await?
            .1["mapping"],
            first.1["mapping"]
        );
        let mapped: Agent = app.store.get("agents", director)?;
        let mut receipt = run(
            &mapped,
            "owner-workspace-usage",
            "succeeded",
            RunKind::Direct,
            None,
        );
        receipt.usage = Some(json!({"total_tokens":42}));
        app.store.put("runs", &receipt.id, &receipt)?;
        assert_eq!(
            request(
                &router,
                Method::GET,
                "/api/cockpit/state",
                Some(&app.token),
                None,
                json!({})
            )
            .await?
            .1["totals"]["tokens_processed"],
            42
        );
        let tenant = request(
            &router,
            Method::POST,
            "/api/tenants",
            Some(&app.token),
            None,
            json!({"name":"Other workspace"}),
        )
        .await?;
        assert_eq!(tenant.0, StatusCode::OK);
        let tenant_id = tenant.1["id"].as_str().unwrap();
        let other = request(
            &router,
            Method::GET,
            "/api/cockpit/state",
            Some(&app.token),
            Some(tenant_id),
            json!({}),
        )
        .await?;
        assert_eq!(other.0, StatusCode::OK);
        assert_eq!(other.1["workspace_id"], tenant_id);
        assert!(other.1["setup_required"].as_bool().unwrap());
        assert!(other.1["mapping"].as_object().unwrap().is_empty());
        assert!(other.1["totals"]["tokens_processed"].is_null());
        assert_eq!(other.1["totals"]["tokens_reported_runs"], 0);
        assert_eq!(other.1["totals"]["tokens_total_runs"], 0);
        assert!(!other.1.to_string().contains(director));
        assert_eq!(
            request(
                &router,
                Method::GET,
                "/api/cockpit/state",
                Some(&app.token),
                Some("unowned-workspace"),
                json!({})
            )
            .await?
            .0,
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            request(
                &router,
                Method::GET,
                "/api/cockpit/state?group_id=unavailable",
                Some(&app.token),
                None,
                json!({})
            )
            .await?
            .0,
            StatusCode::BAD_REQUEST
        );
        Ok(())
    }
}

fn aggregate(runs: &[CockpitRun]) -> CockpitPhase {
    [
        CockpitPhase::Working,
        CockpitPhase::Starting,
        CockpitPhase::AwaitingAnswer,
        CockpitPhase::AwaitingDelegates,
        CockpitPhase::Queued,
        CockpitPhase::Unknown,
    ]
    .into_iter()
    .find(|phase| runs.iter().any(|run| run.phase == *phase))
    .unwrap_or(CockpitPhase::Idle)
}

fn reported_tokens(usage: &Value) -> Option<u64> {
    const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
    let count = if let Some(total) = usage.get("total_tokens") {
        total.as_u64()?
    } else if usage.get("input_tokens").is_some() || usage.get("output_tokens").is_some() {
        usage["input_tokens"]
            .as_u64()?
            .checked_add(usage["output_tokens"].as_u64()?)?
    } else {
        let tokens = usage.get("tokens")?;
        let input = tokens["input"].as_u64()?;
        let output = tokens["output"].as_u64()?;
        let reasoning = match tokens.get("reasoning") {
            Some(value) => value.as_u64()?,
            None => 0,
        };
        input.checked_add(output)?.checked_add(reasoning)?
    };
    (count <= MAX_SAFE_INTEGER).then_some(count)
}

fn snapshot(app: &App, filter: Option<&str>) -> Result<CockpitState> {
    app.store.read(|conn| {
        let saved = mapping(conn)?;
        let profiles: HashMap<_, _> = store::list::<Agent>(conn, "agents")?.into_iter().map(|agent| (agent.id.clone(), agent)).collect();
        let groups: HashMap<_, _> = store::list::<Group>(conn, "groups")?.into_iter().filter(|group| group.deleted_at.is_none() && group.archived_at.is_none() && crate::platform::can_read(app, group)).map(|group| (group.id.clone(), group)).collect();
        let members = if let Some(id) = filter {
            let group = groups.get(id).context("Choose an active group in this workspace")?;
            let access = crate::group_scope::access(conn, group)?;
            Some(access.participant_ids.into_iter().chain(access.delegate_ids).collect::<HashSet<_>>())
        } else { None };
        let project_workspace = filter.and_then(|id| groups.get(id)).and_then(|group| group.project.as_ref()).map(|project| &project.workdir);
        let mut pending_query = conn.prepare("SELECT DISTINCT json_extract(data,'$.run_id') FROM questions WHERE json_extract(data,'$.status')='pending'")?;
        let pending = pending_query.query_map([], |row| row.get::<_, String>(0))?.collect::<rusqlite::Result<HashSet<_>>>()?;
        let runs: Vec<Run> = store::list::<Run>(conn, "runs")?.into_iter().filter(|run| groups.contains_key(&run.group_id) && filter.is_none_or(|id| id == run.group_id)).collect();
        let mut totals = CockpitTotals::default();
        let mut token_sum = 0u64;
        let mut token_overflow = false;
        let now = chrono::Utc::now();
        let mut agents = vec![];
        let mut scoped_ids = HashMap::new();
        for profile in &ROLES {
            let agent_id = saved.get(&profile.key);
            let agent = agent_id.and_then(|id| profiles.get(id));
            let in_scope = members.as_ref().is_none_or(|members| agent_id.is_some_and(|id| members.contains(id)));
            let mut agent_runs: Vec<_> = runs.iter().filter(|run| in_scope && Some(&run.agent_id) == agent_id).collect();
            agent_runs.sort_by(|a, b| a.created_at.cmp(&b.created_at).then(a.id.cmp(&b.id)));
            let active_runs: Vec<_> = agent_runs.iter().filter(|run| coordination::active(run)).map(|run| summarize(run, &groups, &pending)).collect();
            let latest_result = agent_runs.iter().filter(|run| !coordination::active(run)).max_by_key(|run| run.ended_at.as_ref().unwrap_or(&run.created_at)).map(|run| summarize(run, &groups, &pending));
            let active_run = agent_runs.iter().rev().copied().filter(|run| coordination::active(run)).max_by_key(|run| (run.status == "running", &run.created_at, &run.id));
            let effective_workspace = active_run.and_then(|run| run.profile.workdir.as_ref()).or_else(|| in_scope.then_some(project_workspace).flatten());
            let (availability, connection_checked_at) = if let Some(agent) = agent { availability(conn, agent, effective_workspace, active_run.map(|run| run.profile.harness).unwrap_or(agent.harness), now.timestamp())? } else if agent_id.is_some() { (CockpitAvailability::Deleted, None) } else { (CockpitAvailability::Unmapped, None) };
            if let Some(agent) = agent.filter(|agent| in_scope && agent.deleted_at.is_none()) {
                totals.agents += 1;
                scoped_ids.insert(agent.id.clone(), profile.key);
            }
            for run in &active_runs {
                totals.active_runs += 1;
                match run.phase {
                    CockpitPhase::Queued => totals.queued += 1, CockpitPhase::Starting => totals.starting += 1,
                    CockpitPhase::Working => totals.working += 1, CockpitPhase::AwaitingAnswer => totals.awaiting_answer += 1,
                    CockpitPhase::AwaitingDelegates => totals.awaiting_delegates += 1, _ => {},
                }
            }
            totals.completed += agent_runs.iter().filter(|run| run.status == "succeeded").count();
            totals.failed += agent_runs.iter().filter(|run| ["failed", "timed_out", "interrupted"].contains(&run.status.as_str())).count();
            totals.tokens_total_runs += agent_runs.len();
            for count in agent_runs.iter().filter_map(|run| run.usage.as_ref().and_then(reported_tokens)) {
                totals.tokens_reported_runs += 1;
                if let Some(sum) = token_sum.checked_add(count).filter(|sum| *sum <= 9_007_199_254_740_991) {
                    token_sum = sum;
                } else { token_overflow = true; }
            }
            let agent_phase = if active_runs.is_empty() && latest_result.as_ref().is_some_and(|run| run.phase == CockpitPhase::Unknown) {
                CockpitPhase::Unknown
            } else { aggregate(&active_runs) };
            agents.push(CockpitAgent {
                office_role: profile.key, agent_id: agent_id.cloned(), name: agent.map(|agent| agent.name.clone()).unwrap_or_else(|| profile.name.into()),
                position: agent.map(|agent| agent.position.clone()).unwrap_or_else(|| profile.position.into()), role: agent.map(|agent| agent.role.clone()).unwrap_or_else(|| profile.description.into()),
                color: agent.map(|agent| agent.color.clone()).unwrap_or_else(|| profile.color.into()), reports_to: agent.and_then(|agent| agent.reports_to.clone()), enabled: agent.is_some_and(|agent| agent.enabled),
                availability, connection_checked_at, in_scope, phase: agent_phase, active_runs, latest_result, current_activity: None,
            });
        }
        totals.tokens_processed = (totals.tokens_reported_runs > 0 && !token_overflow).then_some(token_sum);
        let actions: Vec<_> = store::list::<ActionItem>(conn, "action_items")?.into_iter().filter(|item| scoped_ids.contains_key(&item.assignee_id) && item.status != "deleted" && groups.contains_key(&item.group_id) && filter.is_none_or(|id| id == item.group_id)).map(|item| {
            if item.status == "backlog" { totals.backlog += 1; }
            if item.status == "scheduled" { totals.scheduled += 1; }
            CockpitAction { id: item.id, group_id: item.group_id.clone(), agent_id: item.assignee_id, status: item.status, planned_start: item.planned_start, run_id: item.run_id, summary: format!("Planned work in {}", groups[&item.group_id].name) }
        }).collect();
        let runs_by_id: HashMap<_, _> = runs.iter().filter(|run| scoped_ids.contains_key(&run.agent_id)).map(|run| (run.id.as_str(), run)).collect();
        let mut events_query = conn.prepare("SELECT seq,kind,json_extract(payload,'$.run_id'),created_at, CASE WHEN kind='run.activity' THEN payload ELSE NULL END FROM events WHERE kind IN ('run.activity','run.changed','run.delegated','run.awaiting_answer','question.created','question.answered') AND json_extract(payload,'$.run_id') IS NOT NULL ORDER BY seq DESC")?;
        let records = events_query.query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?, row.get::<_, Option<String>>(4)?)))?;
        let mut events = vec![];
        for record in records {
            let (id, kind, run_id, created_at, payload) = record?;
            let Some(run) = runs_by_id.get(run_id.as_str()) else { continue; };
            let activity = payload.map(|payload| serde_json::from_str::<crate::activity::RunActivity>(&payload)).transpose().context("Invalid stored run activity")?;
            let (kind, status, label) = match kind.as_str() {
                "run.delegated" => (CockpitEventKind::Delegated, "delegated", "Work delegated"),
                "run.awaiting_answer" | "question.created" => (CockpitEventKind::AwaitingAnswer, "awaiting_answer", "Owner question requested"),
                "question.answered" => (CockpitEventKind::QuestionAnswered, "answered", "Owner answer received"),
                "run.activity" => (CockpitEventKind::StepActivity, "step", ""),
                _ => (CockpitEventKind::ActivityUpdated, "updated", "Activity updated"),
            };
            let summary = if let Some(activity) = &activity {
                if let Some(agent) = agents.iter_mut().find(|agent| agent.agent_id.as_ref() == Some(&run.agent_id) && agent.phase == CockpitPhase::Working && agent.current_activity.is_none() && agent.active_runs.iter().any(|active| active.id == run_id)) {
                    agent.current_activity = Some(activity.clone());
                }
                format!("{}{} · {}", activity.summary(), activity.relative_file.as_ref().map(|file| format!(" · {file}")).unwrap_or_default(), groups[&run.group_id].name)
            } else { format!("{label} in {}", groups[&run.group_id].name) };
            events.push(CockpitEvent { id, kind, office_role: scoped_ids[&run.agent_id], agent_id: run.agent_id.clone(), run_id, status: status.into(), created_at, summary, activity });
            if events.len() == 40 { break; }
        }
        let mut group_choices: Vec<_> = groups.values().map(|group| CockpitGroup { id: group.id.clone(), name: group.name.clone(), is_project: group.project.is_some() }).collect();
        group_choices.sort_by(|a, b| a.name.cmp(&b.name).then(a.id.cmp(&b.id)));
        Ok(CockpitState { schema_version: 1, workspace_id: app.workspace_id.clone(), generated_at: now.to_rfc3339(), group_id: filter.map(str::to_owned), setup_required: saved.len() != ROLES.len(), mapping: saved, groups: group_choices, agents, actions, events, totals })
    })
}
