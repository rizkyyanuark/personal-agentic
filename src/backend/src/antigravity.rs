use crate::{
    App,
    codex_settings::{CodexSettings, ModelOption},
    model::*,
};
use anyhow::{Context, Result, ensure};
use std::{path::PathBuf, process::Command};

pub fn executable() -> Result<PathBuf> {
    if let Some(path) = std::env::var_os("AE_ANTIGRAVITY") {
        let path = PathBuf::from(path);
        ensure!(
            path.is_file(),
            "AE_ANTIGRAVITY must point to a valid agy executable"
        );
        return Ok(path);
    }

    if cfg!(windows) {
        if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") {
            let candidate = PathBuf::from(local_app_data)
                .join("agy")
                .join("bin")
                .join("agy.exe");
            if candidate.is_file() {
                return Ok(candidate);
            }
        }
    }

    for dir in std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default()) {
        let binary_name = if cfg!(windows) { "agy.exe" } else { "agy" };
        let candidate = dir.join(binary_name);
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    anyhow::bail!(
        "Antigravity CLI (agy) executable not found. Install agy or set AE_ANTIGRAVITY to its path."
    )
}

pub fn parse_models(raw: &str) -> Result<CodexSettings> {
    let mut models = Vec::new();
    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with("Fetching") {
            continue;
        }

        let mut parts = line.split('\t');
        if let Some(slug) = parts.next() {
            let slug = slug.trim();
            if slug.is_empty() {
                continue;
            }
            ensure!(
                slug.len() <= 200
                    && slug.as_bytes()[0].is_ascii_alphanumeric()
                    && slug
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || b"._:/-".contains(&byte)),
                "Invalid model identifier in Antigravity catalog"
            );
            ensure!(
                !models.iter().any(|model: &ModelOption| model.slug == slug),
                "Duplicate model identifier in Antigravity catalog"
            );
            let display_name = parts.next().unwrap_or(slug).trim();
            models.push(ModelOption {
                slug: slug.to_owned(),
                display_name: display_name.to_owned(),
                visibility: "list".into(),
                default_reasoning_level: "".into(),
                supported_reasoning_levels: Vec::new(),
            });
        }
    }

    ensure!(
        !models.is_empty(),
        "No models found in Antigravity model catalog"
    );

    let default_model = models[0].slug.clone();

    Ok(CodexSettings {
        model: default_model,
        reasoning: "".into(),
        models,
        fetched_at: Some(chrono::Utc::now().to_rfc3339()),
    })
}

pub fn settings_local() -> Result<CodexSettings> {
    let executable = executable()?;
    let output = Command::new(&executable)
        .arg("models")
        .output()
        .context("Failed to run agy models")?;

    ensure!(
        output.status.success(),
        "agy models exited with failure code: {}",
        output.status
    );

    let text = String::from_utf8(output.stdout).context("Invalid UTF-8 in agy models output")?;
    parse_models(&text)
}

pub fn settings(app: &App, workspace: Option<&Workspace>) -> Result<CodexSettings> {
    if let Some(host) = workspace.and_then(|w| w.ssh_host.as_deref()) {
        return crate::remote::call(
            host,
            serde_json::json!({
                "op": "antigravity_settings",
                "namespace": crate::remote::namespace(app)
            }),
        )
        .and_then(|val| {
            serde_json::from_value(val).context("Invalid remote Antigravity settings")
        });
    }

    settings_local()
}

pub fn build_arguments(
    permission: &str,
    model: &str,
    reasoning: &str,
    conversation_id: Option<&str>,
    prompt: &str,
) -> Vec<String> {
    let mut args = Vec::new();

    if permission == "yolo" || permission == "danger-full-access" {
        args.push("--dangerously-skip-permissions".into());
    } else {
        args.push("--sandbox".into());
        args.extend([
            "--mode".into(),
            if permission == "read-only" {
                "plan"
            } else {
                "accept-edits"
            }
            .into(),
        ]);
    }

    if !model.is_empty() {
        args.extend(["--model".into(), model.to_owned()]);
    }
    if !reasoning.is_empty() {
        args.extend(["--effort".into(), reasoning.to_owned()]);
    }

    args.extend([
        "--output-format".into(),
        "stream-json".into(),
        "--print-timeout".into(),
        "0".into(),
    ]);

    if let Some(session_id) = conversation_id {
        if !session_id.is_empty() {
            args.extend(["--conversation".into(), session_id.to_owned()]);
        }
    }

    // Pass the prompt immediately after --print to satisfy agy CLI positional flag binding.
    args.extend(["--print".into(), prompt.to_owned()]);

    args
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_models_handles_tab_delimited_output() {
        let raw = "\
Fetching available models...
gemini-3.8-flash-high\tGemini 3.8 Flash (High)
gemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)
claude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)
";
        let parsed = parse_models(raw).expect("parse failed");
        assert_eq!(parsed.models.len(), 3);
        assert_eq!(parsed.models[0].slug, "gemini-3.8-flash-high");
        assert_eq!(parsed.models[0].display_name, "Gemini 3.8 Flash (High)");
        assert_eq!(parsed.model, "gemini-3.8-flash-high");
    }

    #[test]
    fn catalog_uses_first_advertised_model_without_inventing_effort_support() {
        let parsed =
            parse_models("native-default\tNative default\ngemini-3.8-flash-high\tGemini Flash\n")
                .unwrap();
        assert_eq!(parsed.model, "native-default");
        assert!(parsed.reasoning.is_empty());
        assert!(
            parsed
                .models
                .iter()
                .all(|model| model.supported_reasoning_levels.is_empty())
        );
        assert!(parsed.resolve("unavailable-model", "").is_err());
        assert!(parsed.resolve("native-default", "max").is_err());
    }

    #[test]
    fn catalog_rejects_missing_models_invalid_ids_and_duplicates() {
        for raw in [
            "Fetching available models...\n",
            "authentication required\n",
            "--model\tInvalid\n",
            "actual-model\tOne\nactual-model\tTwo\n",
        ] {
            assert!(parse_models(raw).is_err(), "Unexpected catalog: {raw}");
        }
    }

    #[test]
    fn build_arguments_formats_yolo_mode() {
        let args = build_arguments(
            "danger-full-access",
            "gemini-3.8-flash-high",
            "",
            None,
            "Hello test",
        );
        assert!(args.contains(&"--dangerously-skip-permissions".to_string()));
        assert!(!args.contains(&"--sandbox".to_string()));
        assert_eq!(args.last().map(String::as_str), Some("Hello test"));
    }

    #[test]
    fn build_arguments_formats_sandbox_and_conversation() {
        let args = build_arguments(
            "read-only",
            "claude-sonnet-4-6",
            "",
            Some("conv-1234"),
            "Resume conversation",
        );
        assert!(args.contains(&"--sandbox".to_string()));
        assert!(args.windows(2).any(|pair| pair == ["--mode", "plan"]));
        assert!(!args.contains(&"--dangerously-skip-permissions".to_string()));
        assert!(args.contains(&"--conversation".to_string()));
        assert!(args.contains(&"conv-1234".to_string()));
        assert_eq!(args.last().map(String::as_str), Some("Resume conversation"));
    }

    #[test]
    fn workspace_write_uses_accept_edits_and_preserves_validated_cli_effort() {
        let args = build_arguments("workspace-write", "actual-model", "high", None, "Task");
        assert!(
            args.windows(2)
                .any(|pair| pair == ["--mode", "accept-edits"])
        );
        assert!(args.windows(2).any(|pair| pair == ["--effort", "high"]));
        assert!(!args.contains(&"--dangerously-skip-permissions".into()));
        assert!(!args.contains(&"--conversation".into()));
    }

    #[test]
    fn native_print_timeout_defers_to_the_runtime_watchdog() {
        for permission in ["read-only", "workspace-write", "danger-full-access"] {
            let args = build_arguments(permission, "", "", None, "Audit project");
            assert_eq!(
                args.iter().filter(|arg| *arg == "--print-timeout").count(),
                1
            );
            assert!(args.windows(2).any(|pair| pair == ["--print-timeout", "0"]));
            assert_eq!(&args[args.len() - 2..], ["--print", "Audit project"]);
        }
    }
}
