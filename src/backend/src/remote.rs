// SSH transport for the existing Paperclip-derived Codex exec adapter.
// The remote process group follows CCCC; no second scheduler or database.
use crate::{App, codex_settings, model::*, process_tree::OwnedProcessTree};
use anyhow::{Context, Result, ensure};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    io::{Read, Write},
    process::{ChildStdin, Command, Stdio},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};
use ts_rs::TS;

#[derive(Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Connection {
    pub host: String,
    pub status: String,
    pub checked_at: String,
    pub message: String,
    pub version: String,
    pub os: String,
    pub environment_keys: Vec<String>,
}

static CONNECTIONS: OnceLock<Mutex<BTreeMap<String, Connection>>> = OnceLock::new();
fn cache() -> &'static Mutex<BTreeMap<String, Connection>> {
    CONNECTIONS.get_or_init(Mutex::default)
}

pub fn validate_host(host: &str) -> Result<()> {
    ensure!(
        !host.is_empty()
            && host.len() <= 100
            && host.as_bytes()[0].is_ascii_alphanumeric()
            && host
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b)),
        "Use an SSH host alias from this machine's SSH config"
    );
    Ok(())
}

pub fn command(host: &str) -> Result<Command> {
    validate_host(host)?;
    let mut command = Command::new("ssh");
    let target = crate::workstations::configure(&mut command, host)?;
    command.args(["-o", "BatchMode=yes"]); // First value wins for saved password/key auth.
    command.args(["-T", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=8", "-o", "ServerAliveInterval=5", "-o", "ServerAliveCountMax=2", &target,
        "PATH=\"$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH\" python3 -u -c 'import sys; n=int(sys.stdin.buffer.readline()); exec(compile(sys.stdin.buffer.read(n), \"ae-remote-bridge\", \"exec\"))'"]);
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    Ok(command)
}

pub fn invalidate(host: &str) {
    if let Ok(mut entries) = cache().lock() {
        entries.retain(|_, value| value.host != host);
    }
}

pub fn write_request(stdin: &mut ChildStdin, mut request: Value) -> Result<()> {
    request["dotenv_parser"] = include_str!("../../vendor/python-dotenv/parser.py").into();
    request["dotenv_variables"] = include_str!("../../vendor/python-dotenv/variables.py").into();
    let source = include_str!("remote_bridge.py").replace("\r\n", "\n");
    writeln!(stdin, "{}", source.len())?;
    stdin.write_all(source.as_bytes())?;
    serde_json::to_writer(&mut *stdin, &request)?;
    stdin.write_all(b"\n")?;
    stdin.flush()?;
    Ok(())
}

pub fn call_raw(host: &str, request: Value) -> Result<Vec<u8>> {
    let mut command = command(host)?;
    #[cfg(windows)]
    let (mut child, owner) = OwnedProcessTree::spawn_with_creation_flags(&mut command, 0x08000000)?;
    #[cfg(not(windows))]
    let (mut child, owner) = OwnedProcessTree::spawn(&mut command)?;
    let stdout = child.stdout.take().context("Missing SSH stdout")?;
    let stderr = child.stderr.take().context("Missing SSH stderr")?;
    let out = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        stdout
            .take(40 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map(|_| bytes)
    });
    let err = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        stderr.take(65537).read_to_end(&mut bytes).map(|_| bytes)
    });
    write_request(
        &mut child.stdin.take().context("Missing SSH stdin")?,
        request,
    )?;
    let start = Instant::now();
    let status = loop {
        if let Some(status) = owner.try_wait(|| child.try_wait())? {
            break status;
        }
        if start.elapsed() > Duration::from_secs(35) {
            owner.terminate()?;
            anyhow::bail!("Workstation did not respond within 35 seconds");
        }
        std::thread::sleep(Duration::from_millis(30));
    };
    let bytes = out
        .join()
        .map_err(|_| anyhow::anyhow!("SSH output reader failed"))??;
    let error = err
        .join()
        .map_err(|_| anyhow::anyhow!("SSH error reader failed"))??;
    ensure!(
        status.success(),
        "{}",
        String::from_utf8_lossy(&error).trim()
    );
    ensure!(
        bytes.len() <= 40 * 1024 * 1024,
        "Workstation response exceeded size limit"
    );
    Ok(bytes)
}

pub fn call(host: &str, request: Value) -> Result<Value> {
    serde_json::from_slice(&call_raw(host, request)?)
        .context("Workstation returned an invalid response")
}

pub fn request(workspace: &Workspace, op: &str) -> Value {
    json!({"op":op,"path":workspace.path,"workspace":workspace})
}

pub fn validate_workspace(host: &str, path: &str) -> Result<Workspace> {
    let result = call(host, json!({"op":"workspace","path":path}))?;
    let mut workspace: Workspace = serde_json::from_value(result["workspace"].clone())?;
    workspace.ssh_host = Some(host.to_owned());
    Ok(workspace)
}

pub fn settings(host: &str) -> Result<codex_settings::CodexSettings> {
    let result = call(host, json!({"op":"settings"}))?;
    let mut config = String::new();
    for key in ["model", "model_reasoning_effort"] {
        if let Some(value) = result["config"][key].as_str().filter(|s| !s.is_empty()) {
            config.push_str(&format!("{key}={}\n", serde_json::to_string(value)?));
        }
    }
    codex_settings::parse(&config, &result["cache"].to_string())
}

pub fn probe(workspace: &Workspace) -> Connection {
    probe_for(workspace, Harness::Codex)
}
pub fn probe_for(workspace: &Workspace, harness: Harness) -> Connection {
    let host = workspace.ssh_host.clone().unwrap_or_default();
    let mut connection = Connection {
        host: host.clone(),
        status: "offline".into(),
        checked_at: now(),
        message: String::new(),
        version: String::new(),
        os: String::new(),
        environment_keys: vec![],
    };
    let mut probe_request = request(workspace, "probe");
    probe_request["harness"] = json!(harness);
    match call(&host, probe_request) {
        Ok(value) => {
            connection.status = if value["ready"] == true {
                "online"
            } else {
                "attention"
            }
            .into();
            connection.message = value["message"].as_str().unwrap_or("").into();
            connection.version = value["version"].as_str().unwrap_or("").into();
            connection.os = value["os"].as_str().unwrap_or("").into();
            connection.environment_keys = value["environment_keys"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|v| v.as_str().map(str::to_owned))
                .collect();
        }
        Err(error) => connection.message = error.to_string(),
    }
    if let Ok(mut entries) = cache().lock() {
        entries.insert(
            format!("{}:{}", harness.as_str(), workspace.identity()),
            connection.clone(),
        );
    }
    connection
}

pub fn connection_for(workspace: &Workspace, harness: Harness) -> Option<Connection> {
    let mut value = cache()
        .lock()
        .ok()?
        .get(&format!("{}:{}", harness.as_str(), workspace.identity()))?
        .clone();
    if chrono::DateTime::parse_from_rfc3339(&value.checked_at)
        .ok()
        .is_none_or(|time| chrono::Utc::now().signed_duration_since(time).num_seconds() > 90)
    {
        value.status = "checking".into();
        value.message = "Waiting for a fresh workstation check".into();
    }
    Some(value)
}

pub fn connections(app: &App) -> Result<BTreeMap<String, Connection>> {
    Ok(app
        .store
        .list::<Agent>("agents")?
        .into_iter()
        .filter_map(|agent| {
            let effective = app
                .store
                .read(|conn| crate::projects::workspace(conn, &agent))
                .ok()
                .flatten();
            let workspace = effective.as_ref()?;
            workspace.ssh_host.as_ref()?;
            Some((
                agent.id.clone(),
                connection_for(workspace, agent.harness).unwrap_or(Connection {
                    host: workspace.ssh_host.clone().unwrap_or_default(),
                    status: "checking".into(),
                    checked_at: String::new(),
                    message: "Checking workstation".into(),
                    version: String::new(),
                    os: String::new(),
                    environment_keys: vec![],
                }),
            ))
        })
        .collect())
}

fn project_harnesses(group: &Group, agents: &[Agent], lead_id: Option<&str>) -> Vec<Harness> {
    let Some(project) = group
        .project
        .as_ref()
        .filter(|_| group.archived_at.is_none() && group.deleted_at.is_none())
    else {
        return vec![];
    };
    let members: Vec<_> = project
        .members
        .iter()
        .filter_map(|member| {
            agents.iter().find(|agent| {
                agent.id == member.agent_id && agent.enabled && agent.deleted_at.is_none()
            })
        })
        .collect();
    let mut harnesses = Vec::new();
    for agent in members
        .iter()
        .filter(|agent| Some(agent.id.as_str()) == lead_id)
        .chain(members.iter())
    {
        if !harnesses.contains(&agent.harness) {
            harnesses.push(agent.harness);
        }
    }
    harnesses
}

fn project_workspaces(
    groups: &[Group],
    agents: &[Agent],
) -> BTreeMap<String, (Workspace, Harness)> {
    let mut workspaces = BTreeMap::new();
    for group in groups {
        let Some(project) = group
            .project
            .as_ref()
            .filter(|p| p.workdir.ssh_host.is_some())
        else {
            continue;
        };
        for harness in project_harnesses(group, agents, None) {
            workspaces
                .entry(format!(
                    "{}:{}",
                    harness.as_str(),
                    project.workdir.identity()
                ))
                .or_insert((project.workdir.clone(), harness));
        }
    }
    workspaces
}

pub fn project_connections(app: &App) -> Result<BTreeMap<String, Connection>> {
    app.store.read(project_connections_for)
}

fn project_connections_for(conn: &rusqlite::Connection) -> Result<BTreeMap<String, Connection>> {
    let agents = crate::store::list::<Agent>(conn, "agents")?;
    let groups = crate::store::list::<Group>(conn, "groups")?;
    let mut connections = BTreeMap::new();
    for group in groups {
        let Some(project) = group
            .project
            .as_ref()
            .filter(|p| p.workdir.ssh_host.is_some())
        else {
            continue;
        };
        if group.archived_at.is_some() || group.deleted_at.is_some() {
            continue;
        }
        let access = crate::group_scope::access(conn, &group)?;
        let harnesses = project_harnesses(&group, &agents, access.chat_lead_id.as_deref());
        let Some(harness) = harnesses.first() else {
            continue;
        };
        let connection = connection_for(&project.workdir, *harness).unwrap_or(Connection {
            host: project.workdir.ssh_host.clone().unwrap_or_default(),
            status: "checking".into(),
            checked_at: String::new(),
            message: format!("Checking {} workstation", harness.as_str()),
            version: String::new(),
            os: String::new(),
            environment_keys: vec![],
        });
        connections.insert(group.id, connection);
    }
    Ok(connections)
}

fn monitor_workspaces(
    conn: &rusqlite::Connection,
) -> Result<BTreeMap<String, (Workspace, Harness)>> {
    let mut workspaces = BTreeMap::new();
    let agents = crate::store::list::<Agent>(conn, "agents")?;
    for agent in agents
        .iter()
        .filter(|a| a.enabled && a.deleted_at.is_none())
    {
        if let Some(workspace) =
            crate::projects::workspace(conn, agent)?.filter(|w| w.ssh_host.is_some())
        {
            workspaces.insert(
                format!("{}:{}", agent.harness.as_str(), workspace.identity()),
                (workspace, agent.harness),
            );
        }
    }
    let groups = crate::store::list::<Group>(conn, "groups")?;
    workspaces.extend(project_workspaces(&groups, &agents));
    for run in crate::store::list::<Run>(conn, "runs")?
        .into_iter()
        .filter(crate::coordination::active)
    {
        if let Some(workspace) = run.profile.workdir.filter(|w| w.ssh_host.is_some()) {
            workspaces.insert(
                format!("{}:{}", run.profile.harness.as_str(), workspace.identity()),
                (workspace, run.profile.harness),
            );
        }
    }
    Ok(workspaces)
}

pub fn start_monitor(app: App) {
    tokio::spawn(async move {
        loop {
            let check_app = app.clone();
            let task = tokio::task::spawn_blocking(move || -> Result<()> {
                let workspaces = check_app.store.read(monitor_workspaces)?;
                for (workspace, harness) in workspaces.values() {
                    probe_for(workspace, *harness);
                    check_app
                        .store
                        .event("workstation.checked", json!({"host":workspace.ssh_host}))?;
                }
                Ok(())
            })
            .await;
            match task {
                Ok(Ok(())) => {}
                other => tracing::warn!("Workstation monitor: {other:?}"),
            }
            tokio::time::sleep(Duration::from_secs(30)).await;
        }
    });
}

pub fn namespace(app: &App) -> String {
    format!(
        "{:x}",
        Sha256::digest(app.store.org.to_string_lossy().as_bytes())
    )[..24]
        .to_owned()
}

pub fn terminal(
    app: &App,
    profile: &Agent,
    run: &mut crate::terminal::TerminalRun,
    script: &str,
    cancelled: &std::sync::atomic::AtomicBool,
) -> Result<()> {
    let workspace = profile.workdir.as_ref().context("Attach a workdir first")?;
    let mut command = command(
        workspace
            .ssh_host
            .as_deref()
            .context("Missing workstation")?,
    )?;
    #[cfg(windows)]
    let (mut child, owner) = OwnedProcessTree::spawn_with_creation_flags(&mut command, 0x08000000)?;
    #[cfg(not(windows))]
    let (mut child, owner) = OwnedProcessTree::spawn(&mut command)?;
    let (send, receive) = std::sync::mpsc::sync_channel(128);
    let readers = [
        crate::runtime::read_pipe(
            child.stdout.take().context("Missing stdout")?,
            send.clone(),
            false,
        ),
        crate::runtime::read_pipe(child.stderr.take().context("Missing stderr")?, send, true),
    ];
    let mut stdin = child.stdin.take().context("Missing SSH stdin")?;
    let mut request = request(workspace, "terminal");
    request["namespace"] = namespace(app).into();
    request["session_id"] = format!("terminal-{}", profile.id).into();
    request["run_id"] = run.id.clone().into();
    request["instructions"] = "".into();
    request["command"] = script.into();
    request["timeout_seconds"] = profile.timeout_seconds.into();
    write_request(&mut stdin, request)?;
    let started = Instant::now();
    let mut heartbeat = Instant::now();
    let mut stop_at = None;
    let mut finished = None;
    let mut exit = None;
    let mut diagnostic = String::new();
    loop {
        let drained = exit.is_some() && readers.iter().all(|r| r.is_finished());
        for (error, line) in receive.try_iter().take(256) {
            if error {
                if diagnostic.len() < 16000 {
                    diagnostic.push_str(&line);
                }
                continue;
            }
            let value: Value =
                serde_json::from_str(&line).context("Invalid remote terminal response")?;
            if value["type"] == "ae.terminal.output" {
                run.output.push_str(value["text"].as_str().unwrap_or(""));
                ensure!(
                    run.output.len() <= 2 * 1024 * 1024,
                    "Terminal output exceeded 2 MiB"
                );
                app.store.put("terminal_runs", &run.id, run)?;
            }
            if value["type"] == "ae.remote.finished" {
                finished = Some(value);
            }
        }
        if stop_at.is_none()
            && (cancelled.load(std::sync::atomic::Ordering::SeqCst)
                || started.elapsed() > Duration::from_secs(profile.timeout_seconds))
        {
            let _ = stdin.write_all(b"cancel\n");
            stop_at = Some(Instant::now());
        }
        if heartbeat.elapsed() > Duration::from_secs(2) {
            if stdin.write_all(b"heartbeat\n").is_err() && stop_at.is_none() {
                stop_at = Some(Instant::now());
            }
            heartbeat = Instant::now();
        }
        if stop_at.is_some_and(|time| time.elapsed() > Duration::from_secs(10)) {
            owner.terminate()?;
        }
        if exit.is_none() {
            exit = owner.try_wait(|| child.try_wait())?;
        }
        if drained {
            break;
        }
        std::thread::sleep(Duration::from_millis(30));
    }
    for reader in readers {
        reader
            .join()
            .map_err(|_| anyhow::anyhow!("Remote terminal reader failed"))??;
    }
    if let Some(result) = finished {
        run.exit_code = result["exit_code"]
            .as_i64()
            .and_then(|v| i32::try_from(v).ok());
        run.status = result["status"]
            .as_str()
            .unwrap_or(if run.exit_code == Some(0) {
                "completed"
            } else {
                "failed"
            })
            .into();
        if run.status == "failed" {
            run.error = Some(format!("Remote command exited with {:?}", run.exit_code));
        }
    } else {
        run.status = "interrupted".into();
        run.error = Some(format!(
            "Remote command ended without completion confirmation. {diagnostic}"
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ssh_alias_is_not_a_shell_or_option() {
        for host in ["linux-example", "macos-example", "work.example"] {
            assert!(super::validate_host(host).is_ok());
        }
        for host in ["-oProxyCommand=whoami", "host;id", "a b", "x\ny", ""] {
            assert!(super::validate_host(host).is_err());
        }
    }

    fn project_fixture() -> Result<(tempfile::TempDir, crate::store::Store, Group, Agent)> {
        let directory = tempfile::tempdir()?;
        let db = crate::store::Store::open(directory.path().join("org"))?;
        let mut lead: Agent = db.get("agents", "ceo")?;
        lead.harness = Harness::Antigravity;
        lead.enabled = true;
        lead.workdir = None;
        db.put("agents", &lead.id, &lead)?;
        let mut group: Group = db.get("groups", "general")?;
        group.id = format!("project-{}", id());
        group.member_ids = None;
        group.scope_levels = None;
        group.chat_lead_id = Some(lead.id.clone());
        group.project = Some(Project {
            workdir: Workspace {
                runtime_id: None,
                ssh_host: Some(format!("project-test-{}", id())),
                path: "/workspace/project".into(),
                canonical_path: "/workspace/project".into(),
                git_root: None,
            },
            members: vec![ProjectMember {
                agent_id: lead.id.clone(),
                manager_id: None,
            }],
        });
        db.put("groups", &group.id, &group)?;
        Ok((directory, db, group, lead))
    }

    fn record_connection(workspace: &Workspace, harness: Harness, status: &str) -> Result<()> {
        let connection = Connection {
            host: workspace.ssh_host.clone().unwrap(),
            status: status.into(),
            checked_at: now(),
            message: harness.as_str().into(),
            version: harness.as_str().into(),
            os: "linux".into(),
            environment_keys: vec![],
        };
        cache()
            .lock()
            .map_err(|_| anyhow::anyhow!("Connection cache is poisoned"))?
            .insert(
                format!("{}:{}", harness.as_str(), workspace.identity()),
                connection,
            );
        Ok(())
    }

    #[test]
    fn monitor_preserves_active_harness_snapshots_after_profile_switch() -> Result<()> {
        let (_directory, db, group, mut lead) = project_fixture()?;
        let workspace = group.project.as_ref().unwrap().workdir.clone();
        for message_id in ["old-active-harness", "old-queued-harness"] {
            db.write(|conn| {
                crate::api::submit_message(
                    conn,
                    crate::api::SendInput {
                        id: message_id.into(),
                        group_id: group.id.clone(),
                        side_chat_id: None,
                        body: format!("@{} Review project documentation", lead.name),
                        recipients: vec![],
                        reply_to: None,
                        artifacts: vec![],
                    },
                    None,
                )
            })?;
        }
        let mut runs = db.list::<Run>("runs")?;
        assert_eq!(runs.len(), 2);
        assert!(
            runs.iter()
                .all(|run| run.profile.harness == Harness::Antigravity)
        );
        assert_eq!(db.read(monitor_workspaces)?.len(), 1);
        runs[0].status = "running".into();
        db.put("runs", &runs[0].id, &runs[0])?;
        lead.harness = Harness::Codex;
        db.put("agents", &lead.id, &lead)?;
        let old_key = format!("antigravity:{}", workspace.identity());
        let current_key = format!("codex:{}", workspace.identity());
        let monitored = db.read(monitor_workspaces)?;
        assert_eq!(monitored.len(), 2);
        assert_eq!(monitored[&old_key].1, Harness::Antigravity);
        assert_eq!(monitored[&current_key].1, Harness::Codex);
        for run in &mut runs {
            run.status = "succeeded".into();
            run.ended_at = Some(now());
            db.put("runs", &run.id, run)?;
        }
        let completed = db.read(monitor_workspaces)?;
        assert_eq!(completed.len(), 1);
        assert!(!completed.contains_key(&old_key));
        assert_eq!(completed[&current_key].1, Harness::Codex);
        assert_eq!(db.get::<Agent>("agents", &lead.id)?.harness, Harness::Codex);
        Ok(())
    }

    #[test]
    fn antigravity_project_checks_its_members_without_requiring_codex() -> Result<()> {
        let (_directory, db, mut group, lead) = project_fixture()?;
        let mut disabled = lead.clone();
        disabled.id = "disabled-codex".into();
        disabled.harness = Harness::Codex;
        disabled.enabled = false;
        db.put("agents", &disabled.id, &disabled)?;
        group.project.as_mut().unwrap().members.push(ProjectMember {
            agent_id: disabled.id.clone(),
            manager_id: Some(lead.id.clone()),
        });
        db.put("groups", &group.id, &group)?;
        let agents = db.list::<Agent>("agents")?;
        let probes = project_workspaces(&[group.clone()], &agents);
        assert_eq!(probes.len(), 1);
        assert_eq!(probes.values().next().unwrap().1, Harness::Antigravity);
        let workdir = group.project.as_ref().unwrap().workdir.clone();
        assert!(connection_for(&workdir, Harness::Codex).is_none());
        let checking = db.read(project_connections_for)?;
        assert_eq!(checking[&group.id].status, "checking");
        assert!(checking[&group.id].message.contains("antigravity"));
        record_connection(&workdir, Harness::Antigravity, "online")?;
        let connected = db.read(project_connections_for)?;
        assert_eq!(connected[&group.id].status, "online");
        assert_eq!(connected[&group.id].version, "antigravity");
        group.project.as_mut().unwrap().members.clear();
        db.put("groups", &group.id, &group)?;
        assert!(project_workspaces(&[group.clone()], &agents).is_empty());
        assert!(!db.read(project_connections_for)?.contains_key(&group.id));
        invalidate(workdir.ssh_host.as_deref().unwrap());
        Ok(())
    }

    #[test]
    fn mixed_project_checks_each_harness_and_displays_the_selected_lead() -> Result<()> {
        let (_directory, db, mut group, lead) = project_fixture()?;
        let mut specialist = lead.clone();
        specialist.id = "codex-specialist".into();
        specialist.harness = Harness::Codex;
        db.put("agents", &specialist.id, &specialist)?;
        group.project.as_mut().unwrap().members.insert(
            0,
            ProjectMember {
                agent_id: specialist.id.clone(),
                manager_id: Some(lead.id.clone()),
            },
        );
        let mut removed = specialist.clone();
        removed.id = "deleted-opencode".into();
        removed.harness = Harness::Opencode;
        removed.deleted_at = Some(now());
        db.put("agents", &removed.id, &removed)?;
        group.project.as_mut().unwrap().members.push(ProjectMember {
            agent_id: removed.id.clone(),
            manager_id: Some(lead.id.clone()),
        });
        db.put("groups", &group.id, &group)?;
        let agents = db.list::<Agent>("agents")?;
        let probes = project_workspaces(&[group.clone(), group.clone()], &agents);
        assert_eq!(probes.len(), 2);
        let workdir = group.project.as_ref().unwrap().workdir.clone();
        for harness in [Harness::Antigravity, Harness::Codex] {
            assert!(probes.contains_key(&format!("{}:{}", harness.as_str(), workdir.identity())));
        }
        assert!(!probes.contains_key(&format!("opencode:{}", workdir.identity())));
        record_connection(&workdir, Harness::Antigravity, "online")?;
        record_connection(&workdir, Harness::Codex, "attention")?;
        let connected = db.read(project_connections_for)?;
        assert_eq!(connected[&group.id].version, "antigravity");
        assert_eq!(connected[&group.id].status, "online");
        group.chat_lead_id = Some(specialist.id.clone());
        db.put("groups", &group.id, &group)?;
        let connected = db.read(project_connections_for)?;
        assert_eq!(connected[&group.id].version, "codex");
        assert_eq!(connected[&group.id].status, "attention");
        group.archived_at = Some(now());
        db.put("groups", &group.id, &group)?;
        assert!(project_workspaces(&[group.clone()], &agents).is_empty());
        assert!(!db.read(project_connections_for)?.contains_key(&group.id));
        invalidate(workdir.ssh_host.as_deref().unwrap());
        Ok(())
    }
}
