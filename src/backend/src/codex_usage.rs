// Account RPC and wire fields follow the official openai/codex app-server protocol.
// Agent execution still uses exec. This short-lived process only reads rate limits.
use crate::{App, model::now, runtime};
use crate::{model::*, store};
use anyhow::{Context, Result, ensure};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, BTreeSet},
    path::Path,
};
use ts_rs::TS;

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct UsageReport {
    pub checked_at: String,
    pub buckets: Vec<UsageBucket>,
    #[serde(default)]
    pub opencode_usage: Option<String>,
    #[serde(default)]
    pub sources: Vec<UsageSource>,
    #[serde(default)]
    pub state: String,
    #[serde(default)]
    pub request_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct UsageSource {
    pub runtime_id: Option<String>,
    pub runtime_name: String,
    pub harness: String,
    pub scope: String,
    pub checked_at: String,
    pub status: String,
    pub code: Option<String>,
    pub message: Option<String>,
    pub buckets: Vec<UsageBucket>,
    pub opencode_usage: Option<String>,
}

#[derive(Clone)]
pub(crate) struct UsageTarget {
    pub source: UsageSource,
    workspace: Option<Workspace>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct UsageBucket {
    pub limit_id: Option<String>,
    pub limit_name: Option<String>,
    pub plan_type: Option<String>,
    pub primary: Option<UsageWindow>,
    pub secondary: Option<UsageWindow>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct UsageWindow {
    pub used_percent: Option<f64>,
    #[ts(type = "number | null")]
    pub window_duration_mins: Option<i64>,
    #[ts(type = "number | null")]
    pub resets_at: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Response {
    rate_limits: Option<UsageBucket>,
    rate_limits_by_limit_id: Option<BTreeMap<String, UsageBucket>>,
}

fn parse(value: Value) -> Result<UsageReport> {
    let response: Response =
        serde_json::from_value(value).context("Codex returned an unsupported usage format")?;
    let buckets = if let Some(map) = response.rate_limits_by_limit_id.filter(|m| !m.is_empty()) {
        map.into_iter()
            .map(|(id, mut bucket)| {
                if bucket.limit_id.is_none() {
                    bucket.limit_id = Some(id);
                }
                bucket
            })
            .collect()
    } else {
        response.rate_limits.into_iter().collect::<Vec<_>>()
    };
    ensure!(
        !buckets.is_empty(),
        "Codex has not reported usage limits for this account. Check that Codex is signed in with ChatGPT."
    );
    Ok(UsageReport {
        checked_at: now(),
        buckets,
        opencode_usage: None,
        sources: vec![],
        state: "complete".into(),
        request_id: None,
    })
}

pub fn read(app: &App) -> Result<UsageReport> {
    read_native(&app.codex, &app.store.org.join(".state/runtime"))
}

pub(crate) fn read_native(executable: &Path, parent: &Path) -> Result<UsageReport> {
    std::fs::create_dir_all(parent)?;
    let home = tempfile::Builder::new()
        .prefix("usage-")
        .tempdir_in(parent)?;
    let _auth = runtime::seed_auth(home.path())?;
    parse(crate::codex_rpc::request_native(
        executable,
        home.path(),
        home.path(),
        "account/rateLimits/read",
        json!({}),
    )?)
}

pub(crate) fn targets(app: &App, group_id: &str, side: Option<&str>) -> Result<Vec<UsageTarget>> {
    let runtimes = crate::fleet::list(app)?;
    app.store.read(|conn| {
        let group: Group = store::get(conn, "groups", group_id)?;
        group.ensure_active()?;
        crate::api::validate_side_chat(conn, group_id, side)?;
        let scope = crate::group_scope::access(conn, &group)?;
        let mut seen = BTreeSet::new();
        let mut result = vec![];
        for agent in store::list::<Agent>(conn, "agents")? {
            if !agent.enabled
                || agent.deleted_at.is_some()
                || !scope.delegate_ids.contains(&agent.id)
            {
                continue;
            }
            let workspace = group
                .project
                .as_ref()
                .map(|p| p.workdir.clone())
                .or(agent.workdir.clone());
            let runtime_id = workspace.as_ref().and_then(|w| w.runtime_id.clone());
            let host = workspace.as_ref().and_then(|w| w.ssh_host.clone());
            let name = if let Some(id) = &runtime_id {
                runtimes
                    .iter()
                    .find(|r| r["id"] == *id)
                    .and_then(|r| r["name"].as_str())
                    .unwrap_or("Unavailable runtime")
                    .to_owned()
            } else if let Some(host) = &host {
                format!("SSH · {host}")
            } else if workspace.is_some() {
                "Application environment".into()
            } else {
                format!("{} · no workdir", agent.name)
            };
            let key = (
                runtime_id.clone(),
                host,
                agent.harness.as_str().to_owned(),
                if workspace.is_none() {
                    agent.id.clone()
                } else {
                    String::new()
                },
            );
            if !seen.insert(key) {
                continue;
            }
            result.push(UsageTarget {
                source: UsageSource {
                    runtime_id,
                    runtime_name: name,
                    harness: agent.harness.as_str().into(),
                    scope: if agent.harness == Harness::Opencode {
                        "conversation"
                    } else {
                        "account"
                    }
                    .into(),
                    checked_at: now(),
                    status: "pending".into(),
                    code: None,
                    message: None,
                    buckets: vec![],
                    opencode_usage: None,
                },
                workspace,
            });
        }
        Ok(result)
    })
}

pub(crate) fn pending(targets: &[UsageTarget], request_id: &str) -> UsageReport {
    UsageReport {
        checked_at: now(),
        buckets: vec![],
        opencode_usage: None,
        sources: targets.iter().map(|t| t.source.clone()).collect(),
        state: "pending".into(),
        request_id: Some(request_id.into()),
    }
}

pub(crate) fn inspect(
    app: &App,
    target: &UsageTarget,
    group: &str,
    side: Option<&str>,
) -> UsageSource {
    let mut source = target.source.clone();
    source.checked_at = now();
    let result = (|| -> Result<()> {
        let workspace = target.workspace.as_ref().context("No workdir attached")?;
        if let Some(id) = &source.runtime_id {
            ensure!(
                crate::fleet::list(app)?
                    .iter()
                    .any(|r| r["id"] == *id && r["online"] == true && r["revoked"] == false),
                "Runtime offline"
            );
        }
        match source.harness.as_str() {
            "codex" => {
                let report = if let Some(id) = &source.runtime_id {
                    crate::fleet::usage(app, id)?
                } else if let Some(host) = &workspace.ssh_host {
                    let value = crate::remote::call(host, json!({"op":"usage"}))?;
                    parse(value)?
                } else {
                    read(app)?
                };
                source.buckets = report.buckets;
                source.status = "complete".into();
            }
            "opencode" => {
                let runs: Vec<Run> = app
                    .store
                    .list::<Run>("runs")?
                    .into_iter()
                    .filter(|r| {
                        r.group_id == group
                            && r.side_chat_id.as_deref() == side
                            && r.profile.harness == Harness::Opencode
                            && r.profile.workdir.as_ref().is_some_and(|w| {
                                w.runtime_id == workspace.runtime_id
                                    && w.ssh_host == workspace.ssh_host
                            })
                    })
                    .collect();
                let measured: Vec<_> = runs.iter().filter_map(|r| r.usage.as_ref()).collect();
                let tokens = |key: &str| {
                    let values: Vec<u64> =
                        measured.iter().filter_map(|v| v[key].as_u64()).collect();
                    if measured.is_empty()
                        || measured.len() != runs.len()
                        || values.len() != measured.len()
                    {
                        "not fully reported".into()
                    } else {
                        values.into_iter().sum::<u64>().to_string()
                    }
                };
                let costs: Vec<_> = measured
                    .iter()
                    .filter_map(|v| v["cost_usd"].as_f64())
                    .collect();
                let cost = if measured.is_empty()
                    || measured.len() != runs.len()
                    || costs.len() != measured.len()
                {
                    "not fully reported".into()
                } else {
                    format!("${:.6}", costs.into_iter().sum::<f64>())
                };
                source.opencode_usage = Some(format!(
                    "This conversation: {} runs; {} input / {} output tokens; cost {cost}. Account quota and reset times are unavailable.",
                    runs.len(),
                    tokens("input_tokens"),
                    tokens("output_tokens")
                ));
                source.status = "complete".into();
            }
            _ => {
                source.status = "unavailable".into();
                source.code = Some("quota_unavailable".into());
                source.message = Some(
                    "This harness integration does not expose account quota or reset times.".into(),
                );
            }
        }
        Ok(())
    })();
    if let Err(error) = result {
        let (code, message) = failure(&error);
        source.status = "failed".into();
        source.code = Some(code.into());
        source.message = Some(message.into());
    }
    source
}

fn failure(error: &anyhow::Error) -> (&'static str, &'static str) {
    let text = format!("{error:#}").to_lowercase();
    if text.contains("offline") {
        (
            "offline",
            "Runtime is offline. Start its worker or restore the workstation connection, then request usage again.",
        )
    } else if text.contains("usage capability") {
        (
            "upgrade_required",
            "This worker does not support usage inspection. Install a compatible worker; no controller account was used.",
        )
    } else if text.contains("no workdir") {
        (
            "workdir_required",
            "Attach a workdir before inspecting this agent's runtime usage.",
        )
    } else if text.contains("permission denied")
        || text.contains("access is denied")
        || text.contains("access denied")
    {
        (
            "permission_denied",
            "Permission denied on this source. Check the workstation account and native CLI access.",
        )
    } else if text.contains("-32601") || text.contains("-32602") {
        (
            "unsupported_response",
            "The installed harness does not support this usage request. Check CLI compatibility.",
        )
    } else if text.contains("executable")
        || text.contains("os error 2")
        || text.contains("no such file")
    {
        (
            "cli_unavailable",
            "Codex could not start on this runtime. Check its complete CLI installation.",
        )
    } else if text.contains("timed out")
        || text.contains("timeout")
        || text.contains("disconnected")
        || text.contains("did not respond")
    {
        (
            "timeout",
            "Usage inspection timed out or disconnected. Check this runtime and retry.",
        )
    } else if text.contains("sign-in")
        || text.contains("signed in")
        || text.contains("auth")
        || text.contains("-320")
    {
        (
            "authentication",
            "Usage is unavailable from this runtime's account. Check its native Codex login.",
        )
    } else if text.contains("unsupported") || text.contains("invalid response") {
        (
            "unsupported_response",
            "The installed harness returned an unsupported usage response. Check CLI compatibility.",
        )
    } else {
        (
            "inspection_failed",
            "Usage inspection failed on this source. Check its runtime connection and native harness login.",
        )
    }
}

pub fn read_for_group(app: &App, group: &str, side: Option<&str>) -> Result<UsageReport> {
    let targets = targets(app, group, side)?;
    let mut report = pending(&targets, "");
    report.request_id = None;
    report.sources = targets
        .iter()
        .map(|t| inspect(app, t, group, side))
        .collect();
    report.state = "complete".into();
    report.checked_at = now();
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn prefers_all_buckets_and_preserves_unavailable_windows() {
        let report = parse(json!({"rateLimits":{"primary":{"usedPercent":99}},"rateLimitsByLimitId":{"codex":{"primary":{"usedPercent":15,"windowDurationMins":300,"resetsAt":1234}},"extra":{"secondary":null}}})).unwrap();
        assert_eq!(report.buckets.len(), 2);
        assert_eq!(
            report.buckets[0].primary.as_ref().unwrap().used_percent,
            Some(15.0)
        );
        assert!(report.buckets[1].primary.is_none());
        assert_eq!(
            parse(json!({"rateLimits":{"primary":{"usedPercent":0}}}))
                .unwrap()
                .buckets[0]
                .primary
                .as_ref()
                .unwrap()
                .used_percent,
            Some(0.0)
        );
        assert!(parse(json!({"rateLimits":null})).is_err());
    }
    #[test]
    fn source_failures_remain_specific_without_upstream_secrets() {
        assert_eq!(
            failure(&anyhow::anyhow!("Permission denied (publickey)")).0,
            "permission_denied"
        );
        assert_eq!(
            failure(&anyhow::anyhow!("Access is denied. (os error 5)")).0,
            "permission_denied"
        );
        assert_eq!(
            failure(&anyhow::anyhow!(
                "Workstation did not respond within 35 seconds"
            ))
            .0,
            "timeout"
        );
        assert_eq!(
            failure(&anyhow::anyhow!(
                "Codex request failed (code -32601). Check sign-in"
            ))
            .0,
            "unsupported_response"
        );
        assert!(
            !failure(&anyhow::anyhow!("private-upstream-detail"))
                .1
                .contains("private-upstream-detail")
        );
    }

    #[test]
    fn old_reports_keep_unknown_windows_and_no_invented_sources() -> Result<()> {
        let report: UsageReport =
            serde_json::from_value(json!({"checked_at":"old","buckets":[],"opencode_usage":null}))?;
        assert!(report.sources.is_empty());
        assert!(report.state.is_empty());
        assert!(report.request_id.is_none());
        Ok(())
    }

    #[test]
    fn project_scope_inherits_targets_and_excludes_disabled_and_uninvited_agents() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let app = crate::worker_onboarding_tests::app(temp.path().join("org"))?;
        let mut ceo: Agent = app.store.get("agents", "ceo")?;
        ceo.enabled = true;
        let mut peer = ceo.clone();
        peer.id = "peer".into();
        peer.harness = Harness::Antigravity;
        let mut disabled = ceo.clone();
        disabled.id = "disabled".into();
        disabled.harness = Harness::Opencode;
        disabled.enabled = false;
        let mut outside = ceo.clone();
        outside.id = "outside".into();
        outside.harness = Harness::Opencode;
        let mut duplicate = ceo.clone();
        duplicate.id = "duplicate".into();
        for agent in [&ceo, &peer, &disabled, &outside, &duplicate] {
            app.store.put("agents", &agent.id, agent)?;
        }
        let mut group: Group = app.store.get("groups", "general")?;
        group.project = Some(Project {
            workdir: Workspace {
                runtime_id: Some("laptop-target".into()),
                ssh_host: None,
                path: "project".into(),
                canonical_path: "project".into(),
                git_root: None,
            },
            members: [&ceo, &peer, &disabled, &duplicate]
                .iter()
                .map(|a| ProjectMember {
                    agent_id: a.id.clone(),
                    manager_id: None,
                })
                .collect(),
        });
        app.store.put("groups", &group.id, &group)?;
        let sources = targets(&app, &group.id, None)?;
        assert_eq!(sources.len(), 2);
        assert!(
            sources
                .iter()
                .all(|s| s.source.runtime_id.as_deref() == Some("laptop-target"))
        );
        assert!(sources.iter().any(|s| s.source.harness == "antigravity"));
        assert!(targets(&app, &group.id, Some("invalid-side-chat")).is_err());
        Ok(())
    }

    #[test]
    fn legacy_worker_is_not_sent_an_unknown_operation() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let app = crate::worker_onboarding_tests::app(temp.path().join("org"))?;
        crate::fleet::initialize(&app)?;
        let registered = crate::fleet::register(&app, "old-worker")?;
        let apps = vec![("default".into(), app.clone())];
        let enrollment = crate::fleet::worker_request(
            &apps,
            "enroll",
            registered["enrollment_token"].as_str().unwrap(),
            &json!({}),
        )?
        .unwrap();
        crate::fleet::worker_request(
            &apps,
            "poll",
            enrollment["token"].as_str().unwrap(),
            &json!({"capabilities":{},"os":"windows","root":"fixture"}),
        )?;
        let error = crate::fleet::usage(&app, registered["id"].as_str().unwrap()).unwrap_err();
        assert!(error.to_string().contains("usage capability"));
        assert_eq!(
            app.store.read(|db| Ok(db.query_row(
                "SELECT count(*) FROM fleet_jobs",
                [],
                |r| r.get::<_, i64>(0)
            )?))?,
            0
        );
        assert!(app.store.list::<Run>("runs")?.is_empty());
        Ok(())
    }

    #[test]
    fn opencode_keeps_missing_measurements_unknown() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let app = crate::worker_onboarding_tests::app(temp.path().join("org"))?;
        let mut agent: Agent = app.store.get("agents", "ceo")?;
        agent.harness = Harness::Opencode;
        agent.workdir = Some(crate::security::validate_workspace(
            temp.path().to_str().unwrap(),
        )?);
        app.store.put("agents", &agent.id, &agent)?;
        let targets = targets(&app, "general", None)?;
        let target = targets
            .iter()
            .find(|t| t.source.harness == "opencode")
            .unwrap();
        let empty = inspect(&app, target, "general", None);
        assert_eq!(empty.status, "complete");
        assert_eq!(empty.scope, "conversation");
        assert!(empty.buckets.is_empty());
        assert!(empty.opencode_usage.unwrap().contains("not fully reported"));
        let saved: Run = serde_json::from_value(json!({
            "id":"historical", "group_id":"general", "message_id":"historical-message",
            "agent_id":agent.id, "session_id":"historical-session", "status":"succeeded",
            "cwd":temp.path().to_str(), "profile":agent, "created_at":now(),
            "output":"", "executable":"historical-only", "arguments":[],
            "usage":{"input_tokens":12}
        }))?;
        app.store.put("runs", &saved.id, &saved)?;
        let source = inspect(&app, target, "general", None);
        let label = source.opencode_usage.unwrap();
        assert!(label.contains("12 input / not fully reported output"));
        assert!(label.contains("cost not fully reported"));
        assert!(source.buckets.is_empty());
        assert!(
            app.store
                .list::<crate::terminal::TerminalRun>("terminal_runs")?
                .is_empty()
        );
        Ok(())
    }

    #[test]
    fn pending_usage_is_interrupted_on_restart_without_replay() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let dir = temp.path().join("org");
        {
            let db = store::Store::open(dir.clone())?;
            let message = Message {
                id: "report".into(),
                group_id: "general".into(),
                side_chat_id: None,
                sender: "system".into(),
                body: "Harness usage".into(),
                recipients: vec![],
                reply_to: None,
                artifacts: vec![],
                run_id: None,
                created_at: now(),
                auto_routed: false,
                schedule_id: None,
                command: Some("usage".into()),
                usage_report: Some(pending(&[], "request")),
            };
            db.put("messages", &message.id, &message)?;
        }
        let db = store::Store::open(dir)?;
        let message: Message = db.get("messages", "report")?;
        assert_eq!(message.usage_report.unwrap().state, "interrupted");
        assert!(db.list::<Run>("runs")?.is_empty());
        Ok(())
    }
}
