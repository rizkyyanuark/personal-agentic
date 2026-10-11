// Codex argument and event mapping adapted from Paperclip v2026.916.0 (MIT).
// See UPSTREAM.md and vendor/PAPERCLIP-LICENSE. Process ownership is from CCCC.
use crate::{App, coordination, model::*, security, store};
use anyhow::{Context, Result, bail};
use rusqlite::params;
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    io::{BufRead, BufReader, Read, Write},
    path::PathBuf,
    process::{Command, Stdio},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    time::{Duration, Instant},
};

pub fn start_queue(app: App) {
    tokio::spawn(async move {
        loop {
            app.knowledge.release_idle_models();
            if let Err(error) = dispatch(&app) {
                tracing::error!("Run dispatcher: {error}");
            }
            tokio::select! { _=app.wake.notified()=>{}, _=tokio::time::sleep(Duration::from_millis(500))=>{} }
        }
    });
}

fn dispatch(app: &App) -> Result<()> {
    if !app.enabled.load(Ordering::Relaxed) {
        return Ok(());
    }
    crate::agent_tools::tick(app)?;
    crate::schedules::tick(app)?;
    crate::actions::tick(app)?;
    coordination::summarize_ready(app)?;
    coordination::review_failures(app)?;
    let runs = app.store.list::<Run>("runs")?;
    let mut active: Vec<Run> = runs
        .iter()
        .filter(|r| ["starting", "running"].contains(&r.status.as_str()))
        .cloned()
        .collect();
    for mut run in runs.into_iter().filter(|r| r.status == "queued") {
        // No workstation cap; ownership locks still protect sessions and workdirs.
        if active.iter().any(|r| conflicts(r, &run)) {
            continue;
        }
        let cancelled = Arc::new(AtomicBool::new(false));
        app.cancellations
            .lock()
            .map_err(|_| anyhow::anyhow!("Cancellation registry unavailable"))?
            .insert(run.id.clone(), cancelled.clone());
        let admitted = app.store.write(|tx| {
            if crate::terminal::busy(
                tx,
                &run.agent_id,
                &run.profile
                    .workdir
                    .as_ref()
                    .map(Workspace::identity)
                    .unwrap_or_default(),
            )? {
                return Ok(false);
            }
            let current: Run = store::get(tx, "runs", &run.id)?;
            if current.status != "queued" {
                return Ok(false);
            }
            let group: Group = store::get(tx, "groups", &run.group_id)?;
            if let Err(error) =
                crate::group_scope::access(tx, &group)?.ensure_allowed(&run.agent_id, run.kind)
            {
                run.status = "failed".into();
                run.error = Some(error.to_string());
                run.ended_at = Some(now());
                store::put(tx, "runs", &run.id, &run)?;
                store::event(tx, "run.changed", &json!({"run_id":run.id}))?;
                return Ok(false);
            }
            run.status = "starting".into();
            store::put(tx, "runs", &run.id, &run)?;
            Ok(true)
        })?;
        if !admitted {
            app.cancellations
                .lock()
                .map_err(|_| anyhow::anyhow!("Cancellation registry unavailable"))?
                .remove(&run.id);
            continue;
        }
        active.push(run.clone());
        let app = app.clone();
        tokio::task::spawn_blocking(move || {
            if let Err(error) = execute(&app, &mut run, &cancelled) {
                run.status = "failed".into();
                run.error = Some(error.to_string());
                run.ended_at = Some(now());
                if let Err(save_error) = app.store.put("runs", &run.id, &run) {
                    tracing::error!("Persist failed run: {save_error}");
                }
                if let Err(save_error) = app.store.event("run.changed", json!({"run_id":run.id})) {
                    tracing::error!("Persist failure event: {save_error}");
                }
            }
            if let Err(error) = crate::questions::finish(&app, &run) {
                tracing::error!("Close pending questions: {error}");
            }
            match app.cancellations.lock() {
                Ok(mut registry) => {
                    registry.remove(&run.id);
                }
                Err(e) => tracing::error!("Cancellation registry: {e}"),
            }
            app.wake.notify_one();
        });
    }
    Ok(())
}

fn same_queue(a: &Run, b: &Run) -> bool {
    a.side_chat_id == b.side_chat_id && (a.side_chat_id.is_none() || a.group_id == b.group_id)
}

pub(crate) fn conflicts(a: &Run, b: &Run) -> bool {
    a.session_id == b.session_id
        || (same_queue(a, b)
            && (a.agent_id == b.agent_id
                || a.profile
                    .workdir
                    .as_ref()
                    .zip(b.profile.workdir.as_ref())
                    .is_some_and(|(a, b)| {
                        if a.ssh_host.is_some() || b.ssh_host.is_some() {
                            a.identity() == b.identity()
                        } else {
                            a.canonical_path.eq_ignore_ascii_case(&b.canonical_path)
                        }
                    })))
}

pub fn cancel(app: &App, run_id: &str) -> Result<Run> {
    let run = app.store.write(|tx| {
        let mut run: Run = store::get(tx, "runs", run_id)?;
        if ["queued", "waiting"].contains(&run.status.as_str()) {
            run.status = "cancelled".into();
            run.ended_at = Some(now());
            store::put(tx, "runs", run_id, &run)?;
        }
        Ok(run)
    })?;
    if run.kind == RunKind::Coordinator {
        for child in app
            .store
            .list::<Run>("runs")?
            .into_iter()
            .filter(|r| r.parent_run_id.as_deref() == Some(run_id) && coordination::active(r))
        {
            if let Err(error) = cancel(app, &child.id) {
                // A child can finish between listing it and requesting cancellation.
                if coordination::active(&app.store.get::<Run>("runs", &child.id)?) {
                    return Err(error);
                }
            }
        }
    }
    if ["starting", "running"].contains(&run.status.as_str()) {
        let flags = app
            .cancellations
            .lock()
            .map_err(|_| anyhow::anyhow!("Cancellation registry unavailable"))?;
        flags
            .get(run_id)
            .context("Run ownership unavailable; reload status")?
            .store(true, Ordering::SeqCst);
    } else if run.status != "cancelled" {
        bail!("Run is already finished");
    }
    app.store
        .event("run.cancel_requested", json!({"run_id":run_id}))?;
    Ok(run)
}

pub(crate) fn runtime_home(app: &App, agent_id: &str) -> PathBuf {
    app.store
        .org
        .join(".state/runtime")
        .join(agent_id)
        .join("codex")
}

pub fn login_status(app: &App, agent_id: &str) -> Result<Value> {
    let mut agent: Agent = app.store.get("agents", agent_id)?;
    agent.workdir = app
        .store
        .read(|conn| crate::projects::workspace(conn, &agent))?;
    if let Some(workspace) = agent.workdir.as_ref().filter(|w| w.runtime_id.is_some()) {
        let settings = crate::opencode::settings_for(app, agent.harness, Some(workspace))?;
        crate::fleet::validate(app, workspace)?;
        return Ok(
            json!({"ready":true,"message":format!("Registered runtime connected; workdir verified; {} models advertised. Native credentials are validated by the CLI when a run starts.",settings.models.len()),"harness":agent.harness}),
        );
    }
    anyhow::ensure!(
        app.workspace_id == "default" && app.identity.as_ref().is_none_or(|i| i.user == "owner"),
        "Attach a registered runtime before checking its connection"
    );
    if agent.harness == Harness::Opencode {
        let settings = crate::opencode::settings(app, agent.workdir.as_ref())?;
        return Ok(
            json!({"ready":true,"message":format!("OpenCode ready · {} available models",settings.models.len()),"harness":"opencode"}),
        );
    }
    if agent.harness == Harness::Antigravity {
        let settings = crate::antigravity::settings(app, agent.workdir.as_ref())?;
        return Ok(
            json!({"ready":true,"message":format!("Antigravity CLI/catalog available · {} models; native credentials are checked when a run starts",settings.models.len()),"harness":"antigravity"}),
        );
    }
    if let Some(workspace) = agent.workdir.filter(|w| w.ssh_host.is_some()) {
        let result = crate::remote::probe(&workspace);
        return Ok(
            json!({"ready":result.status=="online", "message":result.message,"version":result.version,"host":result.host}),
        );
    }
    anyhow::ensure!(!app.store.list::<Run>("runs")?.iter().any(|r|r.agent_id==agent_id&&["starting","running"].contains(&r.status.as_str())),"Wait for this agent's run before probing credentials");
    let home = runtime_home(app, agent_id);
    std::fs::create_dir_all(&home)?;
    let auth = seed_auth(&home)?;
    let output = Command::new(&app.codex)
        .args(["login", "status"])
        .env("CODEX_HOME", &home)
        .output()?;
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    auth.finish()?;
    Ok(
        json!({"ready":output.status.success(),"message":text.trim(),"version":app.codex_version.as_str(),"executable":app.codex,"runtime_home":home}),
    )
}

// Borrow only the selected Codex auth file. Compare before copyback so a newer
// desktop login is never overwritten by a stale scoped runtime credential.
pub(crate) struct AuthLease {
    source: Option<PathBuf>,
    original: Vec<u8>,
    target: PathBuf,
}
impl AuthLease {
    pub(crate) fn finish(self) -> Result<()> {
        if let Some(source) = self.source {
            let updated = std::fs::read(&self.target)?;
            if updated != self.original && std::fs::read(&source)? == self.original {
                store::atomic_write(&source, &updated)?;
            }
        }
        Ok(())
    }
}
pub(crate) fn seed_auth(home: &std::path::Path) -> Result<AuthLease> {
    let target = home.join("auth.json");
    let source = Some(crate::codex_settings::home()?.join("auth.json"))
        .filter(|p| p.exists() && *p != target);
    #[cfg(windows)]
    if let Some(parent) = source.as_ref().and_then(|p| p.parent()) {
        // Reuse the already-installed Windows sandbox identity, never reprovision
        // machine accounts per agent. These files remain inside protected org state.
        for relative in [
            ".sandbox/setup_marker.json",
            ".sandbox-secrets/sandbox_users.json",
        ] {
            let from = parent.join(relative);
            let to = home.join(relative);
            if from.exists() && !to.exists() {
                store::atomic_write(&to, &std::fs::read(from)?)?;
            }
        }
    }
    let original = if let Some(ref source) = source {
        let bytes = std::fs::read(source)?;
        store::atomic_write(&target, &bytes)?;
        bytes
    } else {
        Vec::new()
    };
    Ok(AuthLease {
        source,
        original,
        target,
    })
}

pub(crate) fn system_environment(command: &mut Command) {
    for key in [
        "PATH",
        "PATHEXT",
        "COMSPEC",
        "SystemRoot",
        "SYSTEMDRIVE",
        "WINDIR",
        "TEMP",
        "TMP",
        "USERPROFILE",
        "APPDATA",
        "LOCALAPPDATA",
        "HOME",
        "LANG",
        "TERM",
        "SSL_CERT_FILE",
        "SSL_CERT_DIR",
        "HTTPS_PROXY",
        "HTTP_PROXY",
        "NO_PROXY",
    ] {
        if let Some(value) = std::env::var_os(key) {
            command.env(key, value);
        }
    }
}

fn execute(app: &App, run: &mut Run, cancelled: &AtomicBool) -> Result<()> {
    let mut active_time = Duration::ZERO;
    let mut answers = vec![];
    loop {
        if !execute_turn(app, run, cancelled, &mut active_time, &answers)? {
            return Ok(());
        }
        answers = crate::questions::wait_for_answers(app, run, cancelled)?;
        if answers.is_empty() {
            return Ok(());
        }
    }
}

fn execute_turn(
    app: &App,
    run: &mut Run,
    cancelled: &AtomicBool,
    active_time: &mut Duration,
    answers: &[crate::questions::QuestionRequest],
) -> Result<bool> {
    let workspace = run
        .profile
        .workdir
        .as_ref()
        .context("Attach a workdir before running this agent")?;
    let remote_host = workspace.ssh_host.clone();
    let runtime_id = workspace.runtime_id.clone();
    let offloaded = remote_host.is_some() || runtime_id.is_some();
    let opencode = run.profile.harness == Harness::Opencode;
    let antigravity = run.profile.harness == Harness::Antigravity;
    if remote_host.is_some() {
        let connection = crate::remote::probe_for(workspace, run.profile.harness);
        anyhow::ensure!(
            connection.status == "online",
            "{}: {}",
            connection.host,
            connection.message
        );
    } else if runtime_id.is_none() {
        security::revalidate(workspace)?;
    }
    run.native_session_id = app.store.read(|c| {
        Ok(c.query_row(
            "SELECT native_id FROM sessions WHERE id=?",
            [&run.session_id],
            |r| r.get(0),
        )?)
    })?;
    let mut home = match &run.side_chat_id {
        Some(side) => app
            .store
            .org
            .join(".state/runtime")
            .join(&run.agent_id)
            .join("side-chats")
            .join(side)
            .join("codex"),
        None => runtime_home(app, &run.agent_id),
    };
    if opencode {
        home.set_file_name("opencode");
    } else if antigravity {
        home.set_file_name("antigravity");
    }
    std::fs::create_dir_all(&home)?;
    let auth = if !offloaded && !opencode && !antigravity {
        Some(seed_auth(&home)?)
    } else {
        None
    };
    let env = if !offloaded {
        security::workdir_env(workspace)?
    } else {
        Default::default()
    };
    let tools_lease = (!antigravity)
        .then(|| crate::agent_tools::Lease::new(app, run))
        .transpose()?;
    let tool_token = tools_lease.as_ref().map(|lease| lease.token());
    let mut secrets: Vec<String> = env.values().filter(|s| !s.is_empty()).cloned().collect();
    secrets.extend(tool_token.map(str::to_owned));
    let message: Message = app.store.get("messages", &run.message_id)?;
    let organization_instructions = security::read_optional(&app.store.org.join("AGENTS.md"))?;
    let mut organization = coordination::organization_context(app, &run.agent_id)?;
    let group: Group = app.store.get("groups", &run.group_id)?;
    if let Some(project) = &group.project {
        organization.project = Some(project.clone());
        for member in &mut organization.members {
            if project.members.iter().any(|m| m.agent_id == member.id) {
                member.workdir = Some(project.workdir.identity());
                member.environment_keys = env.keys().cloned().collect();
                member.available = member.enabled;
                member.unavailable_reason = (!member.enabled).then(|| "Agent is paused".into());
            }
        }
    }
    let access = app.store.read(|conn| {
        crate::group_scope::access(conn, &store::get(conn, "groups", &run.group_id)?)
    })?;
    access.ensure_allowed(&run.agent_id, run.kind)?;
    organization.chat_lead_id = access.chat_lead_id.clone();
    let participates = access.participant_ids.contains(&run.agent_id);
    organization.group_access = Some(access);
    if run.kind == RunKind::Delegate {
        let parent: Run = app.store.get(
            "runs",
            run.parent_run_id
                .as_deref()
                .context("Delegated run has no assigner")?,
        )?;
        organization.assigned_by_id = parent.agent_id.clone();
        organization.return_results_to_id = parent.agent_id;
    }
    run.organization_context = Some(organization);
    let instruction = format!(
        "Agent: {}\nPosition: {}\nRole: {}\n\nOrganization instructions:\n{}\n\nAgent instructions:\n{}\n\nAgent AGENTS.md:\n{}",
        run.profile.name,
        run.profile.position,
        run.profile.role,
        organization_instructions,
        run.profile.instructions,
        run.profile.agents_md
    );
    store::atomic_write(&home.join("AGENTS.md"), instruction.as_bytes())?;
    let mut prompt = String::new();
    if antigravity {
        prompt.push_str(&instruction);
        prompt.push_str("\n\n");
    }
    if let Some(reply) = &message.reply_to
        && participates
    {
        let quoted: Message = app.store.get("messages", reply)?;
        prompt.push_str(&format!(
            "Replying to {}:\n{}\n\n",
            quoted.sender, quoted.body
        ));
    }
    prompt.push_str(&coordination::context(app, run)?);
    if !antigravity {
        prompt.push_str("\nPlatform tools are available through the enterprise MCP server. Use workspace_list and action_list to discover accessible work. Only explicit tasks cross chat boundaries; never copy unrelated histories or secrets. Cross-chat work returns asynchronously with a receipt and summary. Only humans can start a side chat with /btw; never create one through tools or slash-command text. Use chat_usage or chat_reset when requested; do not type slash commands as a substitute for calling tools. If project is present in your context, its members define your project manager/team and its workdir overrides defaults for every assignment in this chat. Global reporting remains in the organization snapshot. An action with no planned_start is backlog, never scheduled. Do not invoke it until asked.\n");
    } else {
        prompt.push_str("\nPlatform MCP tools are not attached to this Antigravity run. Do not call enterprise tools, unrelated MCP servers, or launch other agent CLI processes. Project instructions and the explicit task define your scope.\n");
        if run.kind == RunKind::Coordinator {
            prompt.push_str("\nWhen the task requests delegation, use only the verified organization context to return the required routing JSON. The platform will enqueue the named Organization agent after this process exits and will return its result for your summary. Do not inspect files or directories, run commands, call native subagents, or simulate sending an assignment through tools. The captured availability and workdir are sufficient for this routing decision. Assignment is not completed work.\n");
        } else if run.kind == RunKind::Summary {
            prompt.push_str("\nUse only the supplied completed worker results for this summary. Do not read files, run commands, call tools or repeat the audit.\n");
        }
    }
    prompt.push_str("\nCurrent task:\n");
    if run.kind == RunKind::Summary {
        prompt.push_str("This is a summary-only turn: report the existing worker results and answers. Do not repeat the original task or ask the owner again. The assigned worker owns clarification.\n");
    } else if !antigravity {
        prompt.push_str("If you need clarification, a decision or missing information from the owner, call enterprise.ask_user and wait for the answer. Use that tool instead of ending with an unanswered question, request_user_input (unavailable in exec), or reading terminal stdin. Suggested choices are optional; the owner can always write their own answer. Do not assume an answer or request credentials. A tool error or cancelled question is not approval. Continue the same task after the returned answer.\n");
    }
    prompt.push_str(run.task.as_deref().unwrap_or(&message.body));
    if !answers.is_empty() {
        prompt.push_str("\n\nThe owner has now answered your saved questions. The earlier CLI turn ended while waiting; do not wait on its expired tool/exec cell or ask these questions again. Continue the original task in this same session using these answers:\n");
        prompt.push_str(&serde_json::to_string(
            &answers
                .iter()
                .map(|q| json!({"questions":q.questions,"answers":q.answers}))
                .collect::<Vec<_>>(),
        )?);
    }
    let mut command = if let Some(id) = &runtime_id {
        crate::fleet::command(app, id)?
    } else {
        match &remote_host {
            Some(host) => crate::remote::command(host)?,
            None => Command::new(if antigravity {
                crate::antigravity::executable()?
            } else if opencode {
                crate::opencode::executable()?
            } else {
                app.codex.clone()
            }),
        }
    };
    let settings = crate::opencode::settings_for(app, run.profile.harness, Some(workspace))?;
    let (selected_model, selected_reasoning) =
        settings.resolve(&run.profile.model, &run.profile.reasoning)?;
    let opencode_auth = if opencode && !offloaded {
        let lease = crate::opencode::seed_credentials(workspace, &home)?;
        secrets.extend(lease.secrets());
        Some(lease)
    } else {
        None
    };
    run.model_display_name = settings
        .models
        .iter()
        .find(|m| m.slug == selected_model)
        .map(|m| m.display_name.clone());
    let mut args = vec![
        "exec".into(),
        "--json".into(),
        "--color".into(),
        "never".into(),
        "--skip-git-repo-check".into(),
        "-c".into(),
        "cli_auth_credentials_store=\"file\"".into(),
        "-c".into(),
        format!("sandbox_mode=\"{}\"", run.profile.permission),
        "-c".into(),
        "approval_policy=\"never\"".into(),
        "-c".into(),
        format!("model_reasoning_effort=\"{}\"", selected_reasoning),
    ];
    args.extend([
        "-c".into(),
        format!(
            "mcp_servers.enterprise.url=\"{}/mcp\"",
            if runtime_id.is_some() {
                app.public_url.to_string()
            } else {
                format!("http://{}", app.address)
            }
        ),
        "-c".into(),
        "mcp_servers.enterprise.bearer_token_env_var=\"AE_TOOL_TOKEN\"".into(),
        "-c".into(),
        "mcp_servers.enterprise.required=true".into(),
        "-c".into(),
        "mcp_servers.enterprise.tool_timeout_sec=86500".into(),
    ]);
    if !offloaded {
        args.push("--ignore-user-config".into());
        if !opencode
            && !antigravity
            && let Some(catalog) = crate::codex_settings::catalog_argument()?
        {
            args.extend(["-c".into(), catalog]);
        }
    }
    // Windows otherwise downgrades workspace-write to read-only when no sandbox
    // implementation is selected in the isolated (ignored-config) runtime.
    #[cfg(windows)]
    if !offloaded && !opencode && !antigravity {
        args.extend([
            "-c".into(),
            "windows.sandbox=\"elevated\"".into(),
            "-c".into(),
            "sandbox_workspace_write.exclude_tmpdir_env_var=true".into(),
            "-c".into(),
            "sandbox_workspace_write.exclude_slash_tmp=true".into(),
        ]);
    }
    if !selected_model.is_empty() {
        args.extend(["--model".into(), selected_model.clone()]);
    }
    if opencode {
        args = vec![
            "run".into(),
            "--standalone".into(),
            "--format".into(),
            "json".into(),
            "--auto".into(),
            "--model".into(),
            if selected_reasoning.is_empty() {
                selected_model.clone()
            } else {
                format!("{selected_model}#{selected_reasoning}")
            },
        ];
        if run.kind == RunKind::Coordinator {
            prompt.push_str("\nReturn ONLY a JSON object matching this schema. No Markdown fences or commentary outside the JSON:\n");
            prompt.push_str(include_str!("coordination-schema.json"));
        }
    }
    if run.kind == RunKind::Coordinator && !offloaded && !opencode && !antigravity {
        let schema = home.join("coordination-schema.json");
        store::atomic_write(&schema, include_bytes!("coordination-schema.json"))?;
        args.extend([
            "--output-schema".into(),
            schema.to_string_lossy().into_owned(),
        ]);
    }
    let mut remote_images = Vec::<Value>::new();
    for artifact_id in &message.artifacts {
        let artifact: Artifact = app.store.get("artifacts", artifact_id)?;
        let path = security::artifact_path(&app.store.org, &artifact.id)?;
        if artifact.media_type.starts_with("image/") {
            anyhow::ensure!(
                !antigravity,
                "Image attachments are not supported by this Antigravity CLI adapter"
            );
            if offloaded {
                use base64::Engine;
                remote_images.push(json!({"id":artifact.id,"data":base64::engine::general_purpose::STANDARD.encode(std::fs::read(path)?)}));
            } else {
                args.extend([
                    if opencode { "--file" } else { "--image" }.into(),
                    path.to_string_lossy().into_owned(),
                ]);
            }
        } else if artifact.media_type.starts_with("text/") {
            prompt.push_str(&format!(
                "\n\nAttached document {}:\n{}",
                artifact.name,
                std::fs::read_to_string(path)?
            ));
        } else {
            bail!(
                "Attachment {} cannot be sent to this harness; only text and images are supported",
                artifact.name
            );
        }
    }
    if antigravity {
        args = crate::antigravity::build_arguments(
            &run.profile.permission,
            &selected_model,
            &selected_reasoning,
            run.native_session_id.as_deref(),
            &prompt,
        );
        if run.kind == RunKind::Coordinator {
            args.splice(
                0..0,
                [
                    "--json-schema".into(),
                    include_str!("coordination-schema.json").into(),
                ],
            );
        }
    }
    let mut remote_request = offloaded.then(|| json!({
        "op":"execute", "path":workspace.path, "workspace":workspace,
        "namespace":crate::remote::namespace(app),"session_id":run.session_id,"run_id":run.id,
        "instructions":instruction,"arguments":args,"prompt":prompt,"images":remote_images,
        "timeout_seconds":run.profile.timeout_seconds,"native_session_id":run.native_session_id,
        "tool_token":tool_token,
        "harness":run.profile.harness,"opencode_config":opencode.then(||crate::opencode::config(&home,&run.profile.permission,&selected_model,&app.address.to_string())),
        "schema":(run.kind==RunKind::Coordinator && !opencode && !antigravity).then(||include_str!("coordination-schema.json"))
    }));
    if runtime_id.is_some() {
        if let Some(request) = remote_request.as_mut() {
            request["opencode_config"]["mcp"]["enterprise"]["url"] =
                format!("{}/mcp", app.public_url).into();
        }
    }
    if !antigravity {
        if let Some(native) = &run.native_session_id {
            args.extend([
                if opencode { "--session" } else { "resume" }.into(),
                native.clone(),
            ]);
        }
        if !opencode {
            args.push("-".into());
        }
    }
    if !offloaded {
        command.args(&args).current_dir(&workspace.path).env_clear();
        system_environment(&mut command);
        command
            .envs(&env)
            .env("PWD", &workspace.path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        if let Some(token) = tool_token {
            command.env("AE_TOOL_TOKEN", token);
        }
        if !antigravity {
            command.env("CODEX_HOME", &home);
        }
        if opencode {
            crate::opencode::environment(&mut command, Some(&home));
            command.env(
                "OPENCODE_CONFIG_CONTENT",
                crate::opencode::config(
                    &home,
                    &run.profile.permission,
                    &selected_model,
                    &app.address.to_string(),
                )
                .to_string(),
            );
        }
    }
    #[cfg(windows)]
    let (mut child, owner) =
        crate::process_tree::OwnedProcessTree::spawn_with_creation_flags(&mut command, 0x08000000)?;
    #[cfg(not(windows))]
    let (mut child, owner) = crate::process_tree::OwnedProcessTree::spawn(&mut command)?;
    run.pid = Some(child.id());
    run.status = "running".into();
    run.started_at.get_or_insert_with(now);
    run.executable = remote_host
        .as_ref()
        .map(|h| format!("ssh:{h}/{}", run.profile.harness.as_str()))
        .unwrap_or_else(|| command.get_program().to_string_lossy().into_owned());
    run.arguments = args;
    app.store.put("runs", &run.id, run)?;
    let directory = app.store.org.join(".state/sessions").join(&run.session_id);
    std::fs::create_dir_all(&directory)?;
    store::atomic_write(
        &directory.join(format!("{}.json", run.id)),
        serde_json::to_vec_pretty(run)?.as_slice(),
    )?;
    let (tx, rx) = mpsc::sync_channel::<(bool, String)>(128);
    let stdout = child.stdout.take().context("Missing stdout")?;
    let stderr = child.stderr.take().context("Missing stderr")?;
    let readers = [
        read_pipe(stdout, tx.clone(), false),
        read_pipe(stderr, tx, true),
    ];
    let mut remote_stdin = None;
    if let Some(mut stdin) = child.stdin.take() {
        if let Some(request) = remote_request {
            if runtime_id.is_some() {
                serde_json::to_writer(&mut stdin, &request)?;
                stdin.write_all(b"\n")?;
                stdin.flush()?;
            } else {
                crate::remote::write_request(&mut stdin, request)?;
            }
            remote_stdin = Some(stdin);
        } else {
            if !antigravity {
                stdin.write_all(prompt.as_bytes())?;
            }
        }
    }
    let mut answers_delivered = answers.is_empty();
    let mut last_tick = Instant::now();
    let mut was_waiting = false;
    let mut last_heartbeat = Instant::now();
    let mut remote_stop_at = None;
    let mut protocol = Protocol {
        workdir: workspace.canonical_path.clone(),
        ..Default::default()
    };
    let mut stopped = None;
    app.store.event("run.changed", json!({"run_id":run.id}))?;
    loop {
        for (is_error, line) in rx.try_iter().take(256) {
            if !protocol.capture(app, &run.id, &secrets, is_error, &line)? {
                stopped = Some("failed");
                run.error = Some("Run output exceeded 8 MiB; stopped to protect storage".into());
                break;
            }
        }
        if !answers_delivered && protocol.session.is_some() {
            for answer in answers {
                crate::questions::delivered(app, &run.id, &answer.request_id)?;
            }
            answers_delivered = true;
        }
        if let Some(metadata) = protocol.remote_started.take() {
            run.remote_pid = metadata["pid"].as_u64().and_then(|v| u32::try_from(v).ok());
            run.executable = metadata["executable"]
                .as_str()
                .unwrap_or(&run.executable)
                .into();
            run.arguments = serde_json::from_value(metadata["arguments"].clone())?;
            app.store.put("runs", &run.id, run)?;
        }
        if stopped.is_none() && cancelled.load(Ordering::SeqCst) {
            stopped = Some("cancelled");
        }
        let waiting = app
            .store
            .read(|conn| crate::questions::pending(conn, &run.id))?;
        let tick = Instant::now();
        if !was_waiting {
            *active_time += tick.duration_since(last_tick);
        }
        last_tick = tick;
        if stopped.is_none() && *active_time > Duration::from_secs(run.profile.timeout_seconds) {
            stopped = Some("timed_out");
        }
        if let Some(stdin) = remote_stdin.as_mut() {
            if stopped.is_some() && remote_stop_at.is_none() {
                let _ = stdin.write_all(b"cancel\n");
                remote_stop_at = Some(Instant::now());
            } else if stopped.is_none()
                && (waiting != was_waiting || last_heartbeat.elapsed() > Duration::from_secs(2))
            {
                if stdin
                    .write_all(if waiting {
                        b"waiting_for_input\n"
                    } else {
                        b"heartbeat\n"
                    })
                    .is_err()
                {
                    stopped = Some("interrupted");
                }
                last_heartbeat = Instant::now();
            }
        }
        was_waiting = waiting;
        if stopped.is_some()
            && (!offloaded
                || remote_stop_at.is_some_and(|time| time.elapsed() > Duration::from_secs(10)))
        {
            owner.request_stop()?;
            owner.terminate()?;
        }
        if let Some(status) = owner.try_wait(|| child.try_wait())? {
            run.exit_code = status.code();
            // Process exit can precede the pipe readers draining their final frames.
            while readers.iter().any(|r| !r.is_finished()) {
                for (is_error, line) in rx.try_iter() {
                    protocol.capture(app, &run.id, &secrets, is_error, &line)?;
                }
                std::thread::sleep(Duration::from_millis(10));
            }
            for reader in readers {
                reader
                    .join()
                    .map_err(|_| anyhow::anyhow!("Output reader panicked"))??;
            }
            for (is_error, line) in rx.try_iter() {
                protocol.capture(app, &run.id, &secrets, is_error, &line)?;
            }
            // A normal remote exit can close stdin before its completion receipt is
            // drained. That receipt resolves a heartbeat EOF, never an explicit stop.
            if stopped == Some("interrupted") && protocol.remote_finished.is_some() {
                stopped = None;
            }
            // OpenCode and Antigravity CLIs terminate with an exit status, not Codex's turn.completed frame.
            if opencode
                && status.success()
                && protocol.session.is_some()
                && !protocol.text.is_empty()
            {
                protocol.completed = true;
            }
            if protocol.bytes > 8 * 1024 * 1024 {
                stopped = Some("failed");
                run.error = Some("Run output exceeded 8 MiB".into());
            }
            if offloaded && protocol.remote_finished.is_none() {
                run.status = "interrupted".into();
                run.error = Some("Remote connection ended without completion confirmation. Inspect the remote workdir and process state before explicitly retrying.".into());
            } else if let Some(state) = stopped {
                run.status = state.into();
            } else if status.success()
                && (!offloaded
                    || protocol
                        .remote_finished
                        .as_ref()
                        .is_some_and(|v| v["exit_code"] == 0))
                && protocol.completed
                && protocol.error.is_none()
                && (!protocol.text.is_empty()
                    || !crate::questions::unresolved(app, &run.id)?.is_empty())
                && !protocol.malformed
            {
                run.status = "succeeded".into();
            } else {
                run.status = "failed".into();
                run.error = Some(protocol.error.clone().unwrap_or_else(|| {
                    format!(
                        "Harness ended without a valid completed reply (exit {:?}). {}",
                        status.code(),
                        protocol.diagnostic.trim()
                    )
                }));
            }
            if let Some(finished) = &protocol.remote_finished {
                run.exit_code = finished["exit_code"]
                    .as_i64()
                    .and_then(|v| i32::try_from(v).ok());
                // A remote cancellation acknowledges our stop; keep its original cause.
                if stopped.is_none()
                    && let Some(state) = finished["status"].as_str()
                {
                    run.status = state.into();
                }
            }
            if run.status == "timed_out" {
                run.error = Some(format!(
                    "Agent exceeded its {} second execution timeout. Inspect partial results before continuing.",
                    run.profile.timeout_seconds
                ));
            }
            break;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    run.native_session_id = protocol.session.or(run.native_session_id.clone());
    if let Some(auth) = opencode_auth {
        auth.finish()?;
    }
    run.output = security::redacted(&protocol.text, &secrets);
    run.error = run
        .error
        .as_deref()
        .map(|text| security::redacted(text, &secrets));
    run.usage = protocol.usage;
    if opencode
        && runtime_id.is_none()
        && run.native_session_id.is_some()
        && !["cancelled", "timed_out", "interrupted"].contains(&run.status.as_str())
    {
        match crate::opencode::usage(app, run, &home) {
            Ok(usage) => run.usage = Some(usage),
            Err(error) => {
                app.store.event(
                    "run.usage_unavailable",
                    json!({"run_id":run.id,"error":error.to_string()}),
                )?;
            }
        }
    }
    if run.status == "succeeded" && !crate::questions::unresolved(app, &run.id)?.is_empty() {
        anyhow::ensure!(
            run.native_session_id.is_some(),
            "Harness asked a question without a resumable session"
        );
        // Code-mode can end a native turn while a tool call is still waiting.
        // Keep its queue slot and resume this same session only after an answer.
        run.status = "running".into();
        run.pid = None;
        run.remote_pid = None;
        run.exit_code = None;
        app.store.write(|conn| {
            store::put(conn, "runs", &run.id, run)?;
            conn.execute(
                "UPDATE sessions SET native_id=? WHERE id=?",
                params![run.native_session_id, run.session_id],
            )?;
            store::event(conn, "run.awaiting_answer", &json!({"run_id":run.id}))?;
            Ok(())
        })?;
        if let Some(auth) = auth {
            auth.finish()?;
        }
        return Ok(true);
    }
    run.ended_at = Some(now());
    let publishable = ["succeeded", "waiting"].contains(&run.status.as_str())
        && participates
        && app.store.read(|tx| {
            let group = store::get(tx, "groups", &run.group_id)?;
            Ok(crate::group_scope::access(tx, &group)?
                .participant_ids
                .contains(&run.agent_id))
        })?;
    let captured_artifacts = if publishable {
        match crate::run_artifacts::capture(app, run) {
            Ok(artifacts) => artifacts,
            Err(error) => {
                run.artifact_errors.push(RunArtifactError {
                    path: "capture".into(),
                    error: error.to_string(),
                });
                tracing::error!(run_id = %run.id, "Persist run artifact capture evidence: {error}");
                vec![]
            }
        }
    } else {
        vec![]
    };
    app.store.write(|tx| {
        coordination::complete(tx, run, &message, &secrets)?;
        store::put(tx, "runs", &run.id, run)?;
        if let Some(native) = &run.native_session_id {
            tx.execute(
                "UPDATE sessions SET native_id=? WHERE id=?",
                params![native, run.session_id],
            )?;
        }
        let current_access =
            crate::group_scope::access(tx, &store::get(tx, "groups", &run.group_id)?)?;
        if ["succeeded", "waiting"].contains(&run.status.as_str())
            && participates
            && current_access.participant_ids.contains(&run.agent_id)
        {
            let reply = Message {
                id: id(),
                group_id: run.group_id.clone(),
                side_chat_id: message.side_chat_id.clone(),
                sender: run.agent_id.clone(),
                body: run.output.clone(),
                recipients: vec![],
                reply_to: Some(run.message_id.clone()),
                artifacts: captured_artifacts.clone(),
                run_id: Some(run.id.clone()),
                created_at: now(),
                auto_routed: false,
                schedule_id: None,
                command: None,
                usage_report: None,
            };
            store::put(tx, "messages", &reply.id, &reply)?;
        }
        store::event(tx, "run.changed", &json!({"run_id":run.id}))?;
        Ok(())
    })?;
    store::atomic_write(
        &directory.join(format!("{}.json", run.id)),
        serde_json::to_vec_pretty(run)?.as_slice(),
    )?;
    if let Err(error) = auth.map(|auth| auth.finish()).transpose() {
        tracing::warn!("Codex credential synchronization failed: {error}");
        app.store
            .event("auth.sync_failed", json!({"agent_id":run.agent_id}))?;
    }
    Ok(false)
}

pub(crate) fn read_pipe(
    pipe: impl std::io::Read + Send + 'static,
    tx: mpsc::SyncSender<(bool, String)>,
    error: bool,
) -> std::thread::JoinHandle<Result<()>> {
    std::thread::spawn(move || {
        let mut reader = BufReader::new(pipe);
        let mut buffer = Vec::new();
        loop {
            buffer.clear();
            let n = std::io::Read::by_ref(&mut reader)
                .take(8 * 1024 * 1024)
                .read_until(b'\n', &mut buffer)?;
            if n == 0 {
                break;
            }
            if n == 8 * 1024 * 1024 && buffer.last() != Some(&b'\n') {
                bail!("Provider frame exceeds 8 MiB");
            }
            if tx
                .send((error, String::from_utf8_lossy(&buffer).trim_end().into()))
                .is_err()
            {
                break;
            }
        }
        Ok(())
    })
}

#[derive(Default)]
struct Protocol {
    workdir: String,
    activities: BTreeMap<u32, crate::activity::RunActivity>,
    remote_started: Option<Value>,
    remote_finished: Option<Value>,
    bytes: usize,
    diagnostic: String,
    session: Option<String>,
    text: String,
    completed: bool,
    error: Option<String>,
    usage: Option<Value>,
    antigravity_steps: BTreeMap<(String, u64), Option<AntigravityStepUsage>>,
    antigravity_usage_unscoped: bool,
    malformed: bool,
}
impl Protocol {
    fn capture(
        &mut self,
        app: &App,
        run_id: &str,
        secrets: &[String],
        is_error: bool,
        line: &str,
    ) -> Result<bool> {
        self.bytes = self.bytes.saturating_add(line.len());
        if self.bytes > 8 * 1024 * 1024 {
            return Ok(false);
        }
        if !is_error {
            match serde_json::from_str::<Value>(line) {
                Ok(value) => {
                    self.observe(&value);
                    if let Some(activity) =
                        crate::activity::antigravity_step(run_id, &value, &self.workdir)
                    {
                        if self.activities.get(&activity.step_index) != Some(&activity) {
                            app.store
                                .event("run.activity", serde_json::to_value(&activity)?)?;
                            self.activities.insert(activity.step_index, activity);
                        }
                    }
                    if value["type"] == "item.completed"
                        && value["item"]["type"] == "mcp_tool_call"
                        && value["item"]["server"] == "enterprise"
                        && value["item"]["tool"] == "ask_user"
                        && value["item"]["status"] == "completed"
                        && !value["item"]["result"].is_null()
                    {
                        if let Some(request) = value["item"]["arguments"]["request_id"].as_str() {
                            crate::questions::delivered(app, run_id, request)?;
                        }
                    }
                    for request in opencode_question_deliveries(&value) {
                        crate::questions::delivered(app, run_id, request)?;
                    }
                }
                Err(_) => {
                    if !line.trim().is_empty() {
                        self.malformed = true;
                    }
                }
            }
        }
        let line = security::redacted(line, secrets);
        if is_error && self.diagnostic.len() < 16000 {
            self.diagnostic.push_str(&line);
            self.diagnostic.push('\n');
        }
        app.store.event(
            "run.output",
            json!({"run_id":run_id,"stderr":is_error,"line":line}),
        )?;
        Ok(true)
    }

    fn observe(&mut self, v: &Value) {
        if let Some(session) = v["sessionID"]
            .as_str()
            .or_else(|| v["conversation_id"].as_str())
        {
            self.session = Some(session.into());
        }
        if let Some(event) = v["event"].as_str() {
            match event {
                "init" => {
                    if let Some(session) = v["conversation_id"].as_str() {
                        self.session = Some(session.into());
                    }
                }
                "step_update" => {
                    let update = &v["step_update"];
                    if let Some(session) = update["conversation_id"].as_str() {
                        self.session = Some(session.into());
                    }
                    if let Some(delta) = update["text_delta"].as_str() {
                        self.text.push_str(delta);
                    }
                    self.observe_antigravity_usage(update);
                }
                "result" => {
                    let result = &v["result"];
                    if let Some(session) = result["conversation_id"].as_str() {
                        self.session = Some(session.into());
                    }
                    if result["status"] == "SUCCESS" {
                        self.completed = true;
                        if let Some(structured) = result
                            .get("structured_output")
                            .filter(|value| value.is_object())
                        {
                            self.text = structured.to_string();
                        } else if let Some(resp) = result["response"].as_str() {
                            self.text = resp.into();
                        }
                    } else {
                        self.completed = false;
                        self.error = Some(
                            result["error"]
                                .as_str()
                                .filter(|message| !message.trim().is_empty())
                                .map(str::to_owned)
                                .unwrap_or_else(|| {
                                    format!(
                                        "Antigravity did not complete successfully (status: {})",
                                        result["status"].as_str().unwrap_or("missing")
                                    )
                                }),
                        );
                    }
                }
                _ => {}
            }
        }
        match v["type"].as_str() {
            Some("text") => {
                if let Some(text) = v["part"]["text"].as_str() {
                    self.text = text.into();
                }
            }
            Some("step_finish") => {
                self.usage = Some(v["part"].clone());
            }
            Some("ae.remote.started") => self.remote_started = Some(v.clone()),
            Some("ae.remote.finished") => self.remote_finished = Some(v.clone()),
            Some("thread.started") => self.session = v["thread_id"].as_str().map(str::to_owned),
            Some("item.completed") if v["item"]["type"] == "agent_message" => {
                if let Some(t) = v["item"]["text"].as_str() {
                    self.text = t.into();
                }
            }
            Some("turn.completed") => {
                self.completed = true;
                self.usage = Some(v["usage"].clone());
            }
            Some("turn.failed") => {
                self.error = Some(
                    v["error"]["message"]
                        .as_str()
                        .unwrap_or("Codex turn failed")
                        .into(),
                )
            }
            Some("error") => {
                self.error = Some(
                    v["message"]
                        .as_str()
                        .or_else(|| v["error"]["message"].as_str())
                        .or_else(|| v["error"]["data"]["message"].as_str())
                        .unwrap_or("Harness protocol error")
                        .into(),
                )
            }
            _ => {}
        }
    }

    fn observe_antigravity_usage(&mut self, update: &Value) {
        let usage = update.get("usage").filter(|value| !value.is_null());
        let measured_step = matches!(
            update["step_type"].as_str(),
            Some("agent_response" | "checkpoint")
        );
        if !measured_step && usage.is_none() {
            return;
        }
        let identity = update["conversation_id"]
            .as_str()
            .filter(|conversation| !conversation.is_empty())
            .zip(update["step_index"].as_u64());
        let Some((conversation, index)) = identity else {
            self.antigravity_usage_unscoped = true;
            self.usage = None;
            return;
        };
        let key = (conversation.to_owned(), index);
        match update["state"].as_str() {
            Some("ACTIVE") => {
                self.antigravity_steps.entry(key).or_insert(None);
            }
            Some("DONE") => {
                if let Some(usage) = usage {
                    self.antigravity_steps
                        .insert(key, AntigravityStepUsage::parse(usage));
                } else {
                    self.antigravity_steps.entry(key).or_insert(None);
                }
            }
            _ => self.antigravity_usage_unscoped = true,
        }
        // Native result.usage includes previous conversation turns. Only completed
        // steps from this process belong to this run; repeated frames replace a step.
        self.usage = if self.antigravity_usage_unscoped {
            None
        } else {
            AntigravityStepUsage::aggregate(self.antigravity_steps.values())
        };
    }
}

struct AntigravityStepUsage {
    input: u64,
    output: u64,
    total: u64,
    thinking: Option<u64>,
    cache_read: Option<u64>,
}

impl AntigravityStepUsage {
    const MAX_TOKENS: u64 = 9_007_199_254_740_991;

    fn parse(value: &Value) -> Option<Self> {
        fn count(value: &Value) -> Option<u64> {
            value
                .as_u64()
                .filter(|count| *count <= AntigravityStepUsage::MAX_TOKENS)
        }
        fn optional(value: &Value, name: &str) -> Option<Option<u64>> {
            match value.get(name) {
                None | Some(Value::Null) => Some(None),
                Some(value) => Some(Some(count(value)?)),
            }
        }
        let input = count(&value["input_tokens"])?;
        let output = count(&value["output_tokens"])?;
        let total = input.checked_add(output)?;
        if total > Self::MAX_TOKENS {
            return None;
        }
        if let Some(reported) = value.get("total_tokens").filter(|value| !value.is_null()) {
            if count(reported)? != total {
                return None;
            }
        }
        Some(Self {
            input,
            output,
            total,
            thinking: optional(value, "thinking_tokens")?,
            cache_read: optional(value, "cache_read_tokens")?,
        })
    }

    fn aggregate<'a>(steps: impl Iterator<Item = &'a Option<Self>>) -> Option<Value> {
        fn add(left: u64, right: u64) -> Option<u64> {
            left.checked_add(right)
                .filter(|sum| *sum <= AntigravityStepUsage::MAX_TOKENS)
        }
        let mut input = 0;
        let mut output = 0;
        let mut total = 0;
        let mut thinking = Some(0);
        let mut cache_read = Some(0);
        let mut measured = false;
        for step in steps {
            let step = step.as_ref()?;
            measured = true;
            input = add(input, step.input)?;
            output = add(output, step.output)?;
            total = add(total, step.total)?;
            thinking = thinking
                .zip(step.thinking)
                .and_then(|(left, right)| add(left, right));
            cache_read = cache_read
                .zip(step.cache_read)
                .and_then(|(left, right)| add(left, right));
        }
        if !measured {
            return None;
        }
        let mut usage = json!({
            "input_tokens": input,
            "output_tokens": output,
            "total_tokens": total
        });
        if let Some(count) = thinking {
            usage["thinking_tokens"] = count.into();
        }
        if let Some(count) = cache_read {
            usage["cache_read_tokens"] = count.into();
        }
        Some(usage)
    }
}

fn opencode_question_deliveries(value: &Value) -> Vec<&str> {
    if value["type"] != "tool_use" || value["part"]["state"]["status"] != "completed" {
        return vec![];
    }
    let state = &value["part"]["state"];
    if value["part"]["tool"] == "enterprise_ask_user" {
        return state["input"]["request_id"].as_str().into_iter().collect();
    }
    state["metadata"]["metadata"]["toolCalls"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|call| call["tool"] == "enterprise.ask_user" && call["status"] == "completed")
        .filter_map(|call| call["input"]["request_id"].as_str())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn opencode_events_preserve_session_reply_and_errors() {
        let mut p = Protocol::default();
        p.observe(
            &json!({"type":"text","sessionID":"ses_native","part":{"text":"OpenCode reply"}}),
        );
        assert_eq!(p.session.as_deref(), Some("ses_native"));
        assert_eq!(p.text, "OpenCode reply");
        assert!(!p.completed);
        let mut event = json!({"type":"tool_use","part":{"tool":"execute","state":{"status":"completed","metadata":{"metadata":{"toolCalls":[{"tool":"enterprise.ask_user","status":"completed","input":{"request_id":"native-question"}}]}}}}});
        assert_eq!(
            opencode_question_deliveries(&event),
            vec!["native-question"]
        );
        event["part"]["state"]["metadata"]["metadata"]["toolCalls"][0]["status"] = "error".into();
        assert!(opencode_question_deliveries(&event).is_empty());
        p.observe(&json!({"type":"error","error":{"message":"Free model unavailable"}}));
        assert_eq!(p.error.as_deref(), Some("Free model unavailable"));
    }
    #[test]
    fn completed_message_is_not_completed_turn() {
        let mut p = Protocol::default();
        p.observe(&json!({"type":"item.completed","item":{"type":"agent_message","text":"hello"}}));
        assert!(!p.completed);
        p.observe(&json!({"type":"turn.completed","usage":{"input_tokens":4}}));
        assert!(p.completed);
        assert_eq!(p.text, "hello");
        p.observe(&json!({"type":"turn.failed","error":{"message":"failed"}}));
        assert_eq!(p.error.as_deref(), Some("failed"));
    }
    #[test]
    fn antigravity_events_preserve_conversation_reply_and_usage() {
        let mut p = Protocol::default();
        p.observe(&json!({
            "event": "init",
            "conversation_id": "agy-conv-123"
        }));
        assert_eq!(p.session.as_deref(), Some("agy-conv-123"));
        p.observe(&json!({
            "event": "step_update",
            "step_update": {
                "conversation_id": "agy-conv-123",
                "step_index": 2,
                "state": "ACTIVE",
                "step_type": "agent_response",
                "text_delta": "Hello from "
            }
        }));
        p.observe(&json!({
            "event": "step_update",
            "step_update": {
                "conversation_id": "agy-conv-123",
                "step_index": 2,
                "state": "DONE",
                "step_type": "agent_response",
                "text_delta": "Antigravity!",
                "usage": {"input_tokens": 100, "output_tokens": 50}
            }
        }));
        assert_eq!(p.text, "Hello from Antigravity!");
        assert!(!p.completed);
        p.observe(&json!({
            "event": "result",
            "result": {
                "conversation_id": "agy-conv-123",
                "status": "SUCCESS",
                "response": "Hello from Antigravity!",
                "usage": {"input_tokens": 1000, "output_tokens": 500}
            }
        }));
        assert!(p.completed);
        assert_eq!(p.usage.as_ref().unwrap()["output_tokens"], 50);
    }

    #[test]
    fn antigravity_usage_counts_completed_steps_once() {
        let mut p = Protocol::default();
        let mut step = json!({
            "event": "step_update",
            "step_update": {
                "conversation_id": "conversation",
                "step_index": 3,
                "state": "ACTIVE",
                "step_type": "agent_response",
                "usage": {"input_tokens": 100, "output_tokens": 2}
            }
        });
        p.observe(&step);
        assert!(p.usage.is_none());
        step["step_update"]["state"] = "DONE".into();
        step["step_update"]["usage"] = json!({
            "input_tokens": 10302,
            "output_tokens": 582,
            "thinking_tokens": 551,
            "cache_read_tokens": 8113,
            "total_tokens": 10884
        });
        p.observe(&step);
        p.observe(&step);
        assert_eq!(p.usage.as_ref().unwrap()["total_tokens"], 10884);
        step["step_update"]["state"] = "ACTIVE".into();
        p.observe(&step);
        assert_eq!(p.usage.as_ref().unwrap()["total_tokens"], 10884);
        p.observe(&json!({
            "event": "step_update",
            "step_update": {
                "conversation_id": "conversation", "step_index": 4,
                "state": "DONE", "step_type": "checkpoint",
                "usage": {"input_tokens": 116, "output_tokens": 7,
                          "thinking_tokens": 0, "cache_read_tokens": 0,
                          "total_tokens": 123}
            }
        }));
        for kind in ["user_input", "tool"] {
            p.observe(&json!({
                "event": "step_update",
                "step_update": {
                    "conversation_id": "conversation", "step_index": 5,
                    "state": "DONE", "step_type": kind
                }
            }));
        }
        assert_eq!(
            p.usage,
            Some(json!({
                "input_tokens": 10418, "output_tokens": 589,
                "thinking_tokens": 551, "cache_read_tokens": 8113,
                "total_tokens": 11007
            }))
        );
    }

    #[test]
    fn antigravity_resumed_run_does_not_count_previous_conversation_usage() {
        let mut first = Protocol::default();
        first.observe(&json!({
            "event": "step_update",
            "step_update": {
                "conversation_id": "resumed", "step_index": 2,
                "state": "DONE", "step_type": "agent_response",
                "usage": {"input_tokens": 30384, "output_tokens": 4,
                          "thinking_tokens": 0, "cache_read_tokens": 0,
                          "total_tokens": 30388}
            }
        }));
        first.observe(&json!({
            "event": "result",
            "result": {
                "conversation_id": "resumed", "status": "SUCCESS", "response": "apple",
                "num_turns": 1, "usage": {"input_tokens": 30384, "output_tokens": 4,
                                           "total_tokens": 30388}
            }
        }));
        let mut resumed = Protocol::default();
        resumed.observe(&json!({
            "event": "init", "conversation_id": "resumed"
        }));
        resumed.observe(&json!({
            "event": "step_update",
            "step_update": {
                "conversation_id": "resumed", "step_index": 4,
                "state": "DONE", "step_type": "agent_response",
                "usage": {"input_tokens": 278, "output_tokens": 4,
                          "thinking_tokens": 0, "cache_read_tokens": 30214,
                          "total_tokens": 282}
            }
        }));
        resumed.observe(&json!({
            "event": "result",
            "result": {
                "conversation_id": "resumed", "status": "SUCCESS", "response": "apple",
                "num_turns": 2, "usage": {"input_tokens": 30662, "output_tokens": 8,
                                           "cache_read_tokens": 30214, "total_tokens": 30670}
            }
        }));
        assert!(resumed.completed);
        assert_eq!(resumed.session.as_deref(), Some("resumed"));
        let first_total = first.usage.as_ref().unwrap()["total_tokens"]
            .as_u64()
            .unwrap();
        let resumed_total = resumed.usage.as_ref().unwrap()["total_tokens"]
            .as_u64()
            .unwrap();
        assert_eq!(first_total, 30388);
        assert_eq!(resumed_total, 282);
        assert_eq!(first_total + resumed_total, 30670);
    }

    #[test]
    fn antigravity_incomplete_or_invalid_usage_remains_unknown() {
        let valid = json!({
            "conversation_id": "conversation", "step_index": 3,
            "state": "DONE", "step_type": "agent_response",
            "usage": {"input_tokens": 10, "output_tokens": 2}
        });
        let mut cases = Vec::new();
        for bad_usage in [
            Value::Null,
            json!({"input_tokens": 3}),
            json!({"input_tokens": -1, "output_tokens": 2}),
            json!({"input_tokens": "3", "output_tokens": 2}),
            json!({"input_tokens": 3, "output_tokens": 2, "total_tokens": 99}),
            json!({"input_tokens": AntigravityStepUsage::MAX_TOKENS, "output_tokens": 1}),
        ] {
            let mut update = valid.clone();
            update["step_index"] = 4.into();
            update["usage"] = bad_usage;
            cases.push(update);
        }
        for (field, invalid) in [
            ("conversation_id", json!("")),
            ("step_index", json!(-1)),
            ("step_index", Value::Null),
            ("state", json!("UNKNOWN")),
        ] {
            let mut update = valid.clone();
            update[field] = invalid;
            cases.push(update);
        }
        for invalid in cases {
            let mut p = Protocol::default();
            p.observe(&json!({"event": "step_update", "step_update": valid}));
            assert_eq!(p.usage.as_ref().unwrap()["total_tokens"], 12);
            p.observe(&json!({"event": "step_update", "step_update": invalid}));
            assert!(p.usage.is_none());
            p.observe(&json!({
                "event": "result",
                "result": {"status": "SUCCESS", "response": "done",
                           "usage": {"input_tokens": 1000, "output_tokens": 100}}
            }));
            assert!(p.completed);
            assert!(p.usage.is_none());
        }
        let mut p = Protocol::default();
        p.observe(&json!({
            "event": "result",
            "result": {"status": "SUCCESS", "response": "done",
                       "usage": {"input_tokens": 1000, "output_tokens": 100}}
        }));
        assert!(p.completed);
        assert!(p.usage.is_none());
    }

    #[test]
    fn antigravity_usage_preserves_zero_and_omits_unreported_optional_counts() {
        let mut p = Protocol::default();
        for (index, usage) in [
            (
                0,
                json!({"input_tokens": 0, "output_tokens": 0, "total_tokens": 0,
                       "thinking_tokens": 0, "cache_read_tokens": 0}),
            ),
            (1, json!({"input_tokens": 0, "output_tokens": 0})),
        ] {
            p.observe(&json!({
                "event": "step_update",
                "step_update": {"conversation_id": "zero", "step_index": index,
                                "state": "DONE", "step_type": "agent_response",
                                "usage": usage}
            }));
        }
        assert_eq!(
            p.usage,
            Some(json!({
                "input_tokens": 0, "output_tokens": 0, "total_tokens": 0
            }))
        );
    }

    #[test]
    fn antigravity_structured_result_replaces_streamed_text() {
        let mut p = Protocol::default();
        p.observe(&json!({
            "event": "step_update", "step_update": {"text_delta": "Planning the answer"}
        }));
        let structured = json!({"summary": "Audit complete", "assignments": []});
        p.observe(&json!({
            "event": "result",
            "result": {"status": "SUCCESS", "response": "unstructured fallback",
                       "structured_output": structured}
        }));
        assert!(p.completed);
        assert!(p.error.is_none());
        assert_eq!(serde_json::from_str::<Value>(&p.text).unwrap(), structured);
    }

    #[test]
    fn antigravity_requires_a_success_receipt_and_preserves_native_errors() {
        let mut success = Protocol::default();
        success.observe(&json!({
            "event": "step_update", "step_update": {"text_delta": "partial response"}
        }));
        assert!(!success.completed);
        success.observe(&json!({
            "event": "result", "result": {"status": "SUCCESS", "response": "final response"}
        }));
        assert!(success.completed);
        assert!(success.error.is_none());
        assert_eq!(success.text, "final response");
        for status in [
            "ERROR",
            "CANCELED",
            "INTERRUPTED",
            "INVALID",
            "WAITING",
            "RUNNING",
            "UNKNOWN",
        ] {
            let mut p = Protocol::default();
            p.observe(&json!({
                "event": "init", "conversation_id": "native"
            }));
            p.observe(&json!({
                "event": "step_update", "step_update": {"text_delta": "partial response"}
            }));
            p.observe(&json!({"event": "result", "result": {"status": status}}));
            assert!(!p.completed);
            assert!(p.error.as_deref().unwrap().contains(status));
        }
        let mut p = Protocol::default();
        p.observe(&json!({
            "event": "result", "result": {"status": "ERROR", "error": "authentication required"}
        }));
        assert!(!p.completed);
        assert_eq!(p.error.as_deref(), Some("authentication required"));
        let mut p = Protocol::default();
        p.observe(&json!({"event": "result", "result": {"response": "partial response"}}));
        assert!(!p.completed);
        assert!(p.error.as_deref().unwrap().contains("missing"));
    }
}
