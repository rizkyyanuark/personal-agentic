use crate::{codex_settings::CodexSettings, process_tree::OwnedProcessTree};
use anyhow::{Context, Result, ensure};
use serde_json::{Value, json};
use std::{
    io::{Read, Seek},
    path::PathBuf,
    process::{Command, Stdio},
    time::{Duration, Instant},
};

const TIMEOUT: Duration = Duration::from_secs(5);
const MAX_OUTPUT: u64 = 1024 * 1024;

fn capture(command: &mut Command, timeout: Duration, limit: u64) -> Result<String> {
    // A pipe can block on an inherited handle after its parent exits. A bounded
    // temporary file lets process-tree ownership cover descendants and timeout.
    let mut output = tempfile::tempfile()?;
    command
        .stdin(Stdio::null())
        .stdout(output.try_clone()?)
        .stderr(Stdio::null());
    #[cfg(windows)]
    let (mut child, owner) = OwnedProcessTree::spawn_with_creation_flags(command, 0x08000000)?;
    #[cfg(not(windows))]
    let (mut child, owner) = OwnedProcessTree::spawn(command)?;
    let started = Instant::now();
    let status = loop {
        let oversized = output.metadata()?.len() > limit;
        if oversized || started.elapsed() >= timeout {
            owner.terminate()?;
            child.wait()?;
            ensure!(!oversized, "Worker catalog output exceeded its size limit");
            anyhow::bail!("Worker catalog discovery timed out");
        }
        if let Some(status) = owner.try_wait(|| child.try_wait())? {
            break status;
        }
        std::thread::sleep(Duration::from_millis(25));
    };
    ensure!(
        status.success(),
        "Worker catalog command exited unsuccessfully"
    );
    output.rewind()?;
    let mut bytes = Vec::new();
    output.take(limit + 1).read_to_end(&mut bytes)?;
    ensure!(
        bytes.len() as u64 <= limit,
        "Worker catalog output exceeded its size limit"
    );
    String::from_utf8(bytes).context("Worker catalog output was not UTF-8")
}

fn probe(
    harness: &str,
    executable: PathBuf,
    arguments: &[&str],
    parse: impl FnOnce(&str) -> Result<CodexSettings>,
) -> Option<CodexSettings> {
    match capture(
        Command::new(executable).args(arguments),
        TIMEOUT,
        MAX_OUTPUT,
    )
    .and_then(|raw| parse(&raw))
    {
        Ok(settings) => Some(settings),
        Err(error) => {
            tracing::warn!(harness, "Worker catalog unavailable: {error}");
            None
        }
    }
}

pub fn read() -> Value {
    let mut capabilities = json!({
        "codex": crate::codex_settings::read().ok(),
        "read_operations": {"usage": 1}
    });
    if let Ok(executable) = crate::opencode::executable() {
        if let Some(settings) = probe(
            "opencode",
            executable,
            &["models", "--format", "json"],
            |raw| crate::opencode::parse_models(&serde_json::from_str(raw)?),
        ) {
            capabilities["opencode"] = json!(settings);
        }
    }
    if let Ok(executable) = crate::antigravity::executable() {
        if let Some(settings) = probe(
            "antigravity",
            executable,
            &["models"],
            crate::antigravity::parse_models,
        ) {
            capabilities["antigravity"] = json!(settings);
        }
    }
    capabilities
}

#[cfg(test)]
mod tests {
    use super::*;

    fn shell(windows: &str, unix: &str) -> Command {
        if cfg!(windows) {
            let mut command = Command::new("powershell.exe");
            command.args(["-NoProfile", "-NonInteractive", "-Command", windows]);
            command
        } else {
            let mut command = Command::new("sh");
            command.args(["-c", unix]);
            command
        }
    }

    #[test]
    fn captures_success_and_rejects_failure_without_exposing_stderr() -> Result<()> {
        let output = capture(
            &mut shell("Write-Output 'catalog'", "printf 'catalog\n'"),
            Duration::from_secs(15),
            1024,
        )?;
        assert_eq!(output.trim(), "catalog");
        let error = capture(
            &mut shell(
                "[Console]::Error.WriteLine('private-fixture'); exit 7",
                "printf private-fixture >&2; exit 7",
            ),
            Duration::from_secs(15),
            1024,
        )
        .unwrap_err();
        assert!(error.to_string().contains("exited unsuccessfully"));
        assert!(!error.to_string().contains("private-fixture"));
        Ok(())
    }

    #[test]
    fn stalled_catalog_is_terminated_within_deadline() {
        let started = Instant::now();
        let error = capture(
            &mut shell("Start-Sleep -Seconds 30", "sleep 30"),
            Duration::from_millis(150),
            1024,
        )
        .unwrap_err();
        assert!(error.to_string().contains("timed out"));
        assert!(started.elapsed() < Duration::from_secs(5));
    }

    #[test]
    fn excessive_output_is_rejected() {
        let error = capture(
            &mut shell("[Console]::Write(('x' * 4096))", "head -c 4096 /dev/zero"),
            Duration::from_secs(15),
            32,
        )
        .unwrap_err();
        assert!(error.to_string().contains("size limit"));
    }
}
