use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use ts_rs::TS;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum ActivityOperation {
    ReadFile,
    SearchFiles,
    WriteFile,
    EditFile,
    Build,
    Test,
    GitStatus,
    GitDiff,
    GitLog,
    Lint,
    Format,
    Typecheck,
    Install,
    PythonScript,
    NodeScript,
    NodeEval,
}

impl ActivityOperation {
    pub fn label(self) -> &'static str {
        match self {
            Self::ReadFile => "Membaca",
            Self::SearchFiles => "Mencari file",
            Self::WriteFile => "Menulis",
            Self::EditFile => "Mengubah",
            Self::Build => "Menjalankan: Build aplikasi",
            Self::Test => "Menjalankan: Jalankan tes",
            Self::GitStatus => "Menjalankan: Cek status git",
            Self::GitDiff => "Menjalankan: Periksa perubahan git",
            Self::GitLog => "Menjalankan: Periksa riwayat git",
            Self::Lint => "Menjalankan: Periksa lint",
            Self::Format => "Menjalankan: Format kode",
            Self::Typecheck => "Menjalankan: Periksa tipe",
            Self::Install => "Menjalankan: Pasang dependency",
            Self::PythonScript => "Menjalankan skrip Python",
            Self::NodeScript => "Menjalankan skrip Node.js",
            Self::NodeEval => "Menjalankan: Evaluasi JavaScript dengan Node.js",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum ActivityCategory {
    Reading,
    Searching,
    Writing,
    Command,
    Responding,
    Delegating,
    Other,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum ActivityState {
    Active,
    Completed,
    Failed,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export)]
pub struct RunActivity {
    pub run_id: String,
    pub category: ActivityCategory,
    pub state: ActivityState,
    #[ts(type = "number")]
    pub step_index: u32,
    pub relative_file: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub relative_files: Option<Vec<String>>,
    #[serde(default)]
    pub operation: Option<ActivityOperation>,
}

impl RunActivity {
    pub fn sanitize(&mut self, workdir: &str) {
        self.relative_file = self
            .relative_file
            .as_deref()
            .and_then(|path| safe_relative(path, workdir));
        if let Some(files) = &self.relative_files {
            let mut safe = vec![];
            for path in files
                .iter()
                .take(8)
                .filter_map(|path| safe_relative(path, workdir))
            {
                if !safe.contains(&path) {
                    safe.push(path);
                }
            }
            self.relative_file = safe.first().cloned();
            self.relative_files = (safe.len() > 1).then_some(safe);
        }
    }

    pub fn needs_native_details(&self) -> bool {
        self.operation.is_none()
            || (self.operation == Some(ActivityOperation::ReadFile) && self.relative_file.is_none())
    }

    pub fn enrich_from_native(&mut self, frame: &Value, workdir: &str) {
        let mut tracker = ActivityTracker::default();
        if let Some(details) = tracker
            .observe(&self.run_id, frame, workdir)
            .into_iter()
            .find(|candidate| candidate.state == self.state && candidate.category == self.category)
        {
            if details.operation.is_some() {
                self.operation = details.operation;
                self.relative_file = details.relative_file;
                self.relative_files = details.relative_files;
            }
        }
        self.sanitize(workdir);
    }

    pub fn description(&self) -> String {
        let files = self
            .relative_files
            .as_ref()
            .map(|files| files.join(", "))
            .or_else(|| self.relative_file.clone())
            .unwrap_or_default();
        if files.is_empty() {
            self.summary().into()
        } else {
            format!("{} {files}", self.summary())
        }
    }

    pub fn summary(&self) -> &'static str {
        if let Some(operation) = self.operation {
            if self.state == ActivityState::Failed {
                return match operation {
                    ActivityOperation::ReadFile => "Gagal membaca",
                    ActivityOperation::SearchFiles => "Pencarian file gagal",
                    ActivityOperation::WriteFile => "Gagal menulis",
                    ActivityOperation::EditFile => "Gagal mengubah",
                    ActivityOperation::Build => "Build aplikasi gagal",
                    ActivityOperation::Test => "Tes gagal",
                    ActivityOperation::NodeEval => "Evaluasi JavaScript dengan Node.js gagal",
                    _ => "Perintah gagal",
                };
            }
            return operation.label();
        }
        if self.state == ActivityState::Failed {
            return "Langkah pekerjaan gagal";
        }
        match (self.category, self.state) {
            (ActivityCategory::Reading, ActivityState::Active) => "Membaca file",
            (ActivityCategory::Reading, _) => "Pembacaan file selesai",
            (ActivityCategory::Searching, ActivityState::Active) => "Mencari informasi",
            (ActivityCategory::Searching, _) => "Pencarian selesai",
            (ActivityCategory::Writing, ActivityState::Active) => "Mengubah file",
            (ActivityCategory::Writing, _) => "Perubahan file selesai",
            (ActivityCategory::Command, ActivityState::Active) => "Menjalankan perintah",
            (ActivityCategory::Command, _) => "Perintah selesai",
            (ActivityCategory::Responding, ActivityState::Active) => "Menyusun jawaban",
            (ActivityCategory::Responding, _) => "Jawaban selesai",
            (ActivityCategory::Delegating, ActivityState::Active) => "Menjalankan subagent",
            (ActivityCategory::Delegating, _) => "Langkah subagent selesai",
            (ActivityCategory::Other, ActivityState::Active) => "Menjalankan langkah pekerjaan",
            (ActivityCategory::Other, _) => "Langkah pekerjaan selesai",
        }
    }
}

pub fn antigravity_step(run_id: &str, frame: &Value, workdir: &str) -> Option<RunActivity> {
    if frame["event"] != "step_update" {
        return None;
    }
    let step = &frame["step_update"];
    let state = match step["state"].as_str()? {
        "ACTIVE" => ActivityState::Active,
        "ERROR" => ActivityState::Failed,
        "DONE"
            if step["tool_info"]
                .get("error")
                .is_some_and(|error| !error.is_null()) =>
        {
            ActivityState::Failed
        }
        "DONE" => ActivityState::Completed,
        _ => return None,
    };
    let category = match step["step_type"].as_str()? {
        "agent_response" => ActivityCategory::Responding,
        "tool" if !step["subagent_info"].is_null() => ActivityCategory::Delegating,
        "tool" => match step["tool_name"]
            .as_str()
            .or_else(|| step["tool_info"]["name"].as_str())
        {
            Some("view_file" | "view_file_outline" | "view_code_item" | "read_file" | "Read") => {
                ActivityCategory::Reading
            }
            Some("grep_search" | "code_search" | "find_by_name" | "list_dir" | "Glob" | "Grep") => {
                ActivityCategory::Searching
            }
            Some(
                "write_to_file"
                | "replace_file_content"
                | "multi_replace_file_content"
                | "Write"
                | "Edit",
            ) => ActivityCategory::Writing,
            Some("run_command" | "command_status" | "Bash") => ActivityCategory::Command,
            _ => ActivityCategory::Other,
        },
        _ => return None,
    };
    let (operation, relative_file, relative_files) = tool_operation(
        step["tool_name"]
            .as_str()
            .or_else(|| step["tool_info"]["name"].as_str())
            .unwrap_or(""),
        &step["tool_info"]["parameters"],
        workdir,
    );
    Some(RunActivity {
        run_id: run_id.to_owned(),
        category: category_for_operation(operation, category),
        state,
        step_index: u32::try_from(step["step_index"].as_u64()?).ok()?,
        relative_file,
        relative_files,
        operation,
    })
}

fn safe_relative<'a>(raw: &'a str, workdir: &str) -> Option<String> {
    if raw.len() > 512 || raw.contains(',') || raw.chars().any(char::is_control) {
        return None;
    }
    let root = workdir.replace('\\', "/");
    let path = raw.replace('\\', "/");
    let root = root.strip_prefix("//?/").unwrap_or(&root);
    let path = path.strip_prefix("//?/").unwrap_or(&path);
    let path = path.strip_prefix("./").unwrap_or(path);
    let relative = if path.starts_with('/') || path.contains(':') {
        if root.is_empty() {
            return None;
        }
        let prefix = format!("{}/", root.trim_end_matches('/'));
        if root.as_bytes().get(1) == Some(&b':') {
            if !path.get(..prefix.len())?.eq_ignore_ascii_case(&prefix) {
                return None;
            }
            &path[prefix.len()..]
        } else {
            path.strip_prefix(&prefix)?
        }
    } else {
        &path
    };
    if relative.is_empty()
        || relative.split('/').any(|part| {
            part.is_empty()
                || part.starts_with('.')
                || part.contains(':')
                || ["vault", "credentials", "auth.json", "owner.key"]
                    .contains(&part.to_ascii_lowercase().as_str())
                || ["secret", "password", "credential", "token"]
                    .iter()
                    .any(|word| part.to_ascii_lowercase().contains(word))
                || [".pem", ".key", ".pfx", ".p12"]
                    .iter()
                    .any(|suffix| part.to_ascii_lowercase().ends_with(suffix))
        })
    {
        return None;
    }
    Some(relative.to_owned())
}

fn parameter_path(params: &Value, workdir: &str) -> Option<String> {
    [
        "AbsolutePath",
        "TargetFile",
        "FilePath",
        "filePath",
        "file_path",
        "path",
        "SearchPath",
        "DirectoryPath",
        "SearchDirectory",
    ]
    .iter()
    .find_map(|key| params[*key].as_str())
    .and_then(|path| safe_relative(path, workdir))
}

fn tool_operation(
    name: &str,
    params: &Value,
    workdir: &str,
) -> (
    Option<ActivityOperation>,
    Option<String>,
    Option<Vec<String>>,
) {
    use ActivityOperation::*;
    let decoded;
    let params = if let Some(raw) = params.as_str() {
        if raw.len() > 8192 {
            return (None, None, None);
        }
        decoded = serde_json::from_str::<Value>(raw).ok();
        match decoded.as_ref() {
            Some(value) if value.is_object() => value,
            _ => return (None, None, None),
        }
    } else {
        params
    };
    let operation = match name {
        "view_file" | "view_file_outline" | "view_code_item" | "read_file" | "Read" | "read" => {
            Some(ReadFile)
        }
        "write_to_file" | "Write" | "write" => Some(WriteFile),
        "replace_file_content"
        | "multi_replace_file_content"
        | "Edit"
        | "edit"
        | "MultiEdit"
        | "NotebookEdit"
        | "apply_patch" => Some(EditFile),
        "grep_search" | "code_search" | "find_by_name" | "list_dir" | "Glob" | "Grep" | "glob"
        | "grep" => Some(SearchFiles),
        "run_command" | "Bash" | "bash" | "exec_command" => {
            let command = params["CommandLine"]
                .as_str()
                .or_else(|| params["commandLine"].as_str())
                .or_else(|| params["command"].as_str())
                .or_else(|| params["cmd"].as_str())
                .unwrap_or("");
            let (operation, file) = command_operation(command, workdir);
            return (operation, file, command_files(command, workdir));
        }
        _ => None,
    };
    let path = parameter_path(params, workdir).or_else(|| {
        matches!(name, "Glob" | "glob" | "find_by_name")
            .then(|| {
                ["pattern", "Pattern"].iter().find_map(|key| {
                    params[*key]
                        .as_str()
                        .and_then(|path| safe_relative(path, workdir))
                })
            })
            .flatten()
    });
    (operation, path, None)
}

// Parse a bounded single command; opaque shell programs retain a generic label.
fn command_words(command: &str, comma_separates: bool) -> Option<Vec<String>> {
    if command.len() > 8192 {
        return None;
    }
    let mut words = vec![];
    let mut word = String::new();
    let mut quote = None;
    for character in command.chars() {
        match character {
            '\'' | '"' if quote == Some(character) => quote = None,
            '\'' | '"' if quote.is_none() => quote = Some(character),
            c if quote.is_none() && (c.is_control() || ";&|<>`".contains(c)) => return None,
            ',' if quote.is_none() && comma_separates => {
                if !word.is_empty() {
                    words.push(std::mem::take(&mut word));
                }
                words.push(",".into());
            }
            c if quote.is_none() && c.is_whitespace() => {
                if !word.is_empty() {
                    words.push(std::mem::take(&mut word));
                }
            }
            c => word.push(c),
        }
    }
    if quote.is_some() {
        return None;
    }
    if !word.is_empty() {
        words.push(word);
    }
    Some(words)
}

fn executable(token: &str) -> String {
    let name = token
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(token)
        .to_ascii_lowercase();
    [".exe", ".cmd", ".bat"]
        .iter()
        .find_map(|suffix| name.strip_suffix(suffix))
        .unwrap_or(&name)
        .to_owned()
}

fn command_head(input: &str) -> Option<(&str, &str)> {
    let input = input.trim_start();
    let first = input.chars().next()?;
    if matches!(first, '\'' | '"') {
        let end = input[1..].find(first)? + 1;
        Some((&input[1..end], &input[end + 1..]))
    } else {
        let end = input.find(char::is_whitespace).unwrap_or(input.len());
        Some((&input[..end], &input[end..]))
    }
}

fn command_arguments(command: &str) -> Option<Vec<String>> {
    if command.len() > 8192 {
        return None;
    }
    let mut body = command.trim().to_owned();
    for _ in 0..3 {
        let (program, mut rest) = command_head(&body)?;
        let program = executable(program);
        if !["powershell", "pwsh", "bash", "sh", "cmd"].contains(&program.as_str()) {
            return command_words(&body, program == "get-content");
        }
        loop {
            let (flag, tail) = command_head(rest)?;
            rest = tail;
            if ["-command", "-c", "-lc", "/c"].contains(&flag.to_ascii_lowercase().as_str()) {
                break;
            }
            if !flag.starts_with(['-', '/']) {
                return None;
            }
        }
        let script = rest.trim();
        let quoted = script
            .chars()
            .next()
            .filter(|quote| matches!(quote, '\'' | '"'));
        body = if let Some(quote) = quoted {
            let script = script.strip_prefix(quote)?.strip_suffix(quote)?;
            if quote == '"' && ["powershell", "pwsh", "cmd"].contains(&program.as_str()) {
                script.replace("\\\"", "\"")
            } else {
                script.to_owned()
            }
        } else {
            script.to_owned()
        };
    }
    None
}

fn read_targets(args: &[String], workdir: &str) -> Vec<String> {
    let mut files = vec![];
    let mut paths = args.first().is_some_and(|arg| !arg.starts_with('-'));
    let mut expect_path = true;
    let mut index = 0;
    while let Some(arg) = args.get(index) {
        match arg.to_ascii_lowercase().as_str() {
            "-literalpath" | "-path" | "-lp" | "-pspath" => {
                paths = true;
                expect_path = true;
            }
            "," if paths && !expect_path => expect_path = true,
            "-raw" | "-wait" | "-force" => paths = false,
            "-first" | "-totalcount" | "-tail" | "-readcount" | "-encoding" => {
                paths = false;
                index += 1;
            }
            _ if paths && expect_path && !arg.starts_with('-') && !arg.contains(['$', '`']) => {
                if let Some(path) = safe_relative(arg, workdir) {
                    if files.len() < 8 && !files.contains(&path) {
                        files.push(path);
                    }
                }
                expect_path = false;
            }
            _ => return vec![],
        }
        index += 1;
    }
    if paths && expect_path {
        return vec![];
    }
    files
}

fn command_files(command: &str, workdir: &str) -> Option<Vec<String>> {
    let words = command_arguments(command)?;
    if executable(words.first()?) != "get-content" {
        return None;
    }
    let files = read_targets(&words[1..], workdir);
    (files.len() > 1).then_some(files)
}

fn command_operation(command: &str, workdir: &str) -> (Option<ActivityOperation>, Option<String>) {
    use ActivityOperation::*;
    let Some(words) = command_arguments(command) else {
        return (None, None);
    };
    let Some(first) = words.first() else {
        return (None, None);
    };
    let args = &words[1..];
    let program = executable(first);
    let file = |index: usize| {
        args.get(index)
            .filter(|path| !path.starts_with('-') && !path.contains(['$', '`']))
            .and_then(|path| safe_relative(path, workdir))
    };
    let operation = match program.as_str() {
        "get-content" => return (Some(ReadFile), read_targets(args, workdir).first().cloned()),
        "cat" | "type" => {
            return (
                Some(ReadFile),
                if args.first().is_some_and(|arg| {
                    ["-literalpath", "-path"].contains(&arg.to_ascii_lowercase().as_str())
                }) {
                    file(1)
                } else {
                    file(0)
                },
            );
        }
        "rg" | "find" | "get-childitem" => {
            let path = args
                .iter()
                .position(|arg| ["-g", "--glob"].contains(&arg.as_str()))
                .and_then(|index| file(index + 1))
                .or_else(|| {
                    args.iter()
                        .position(|arg| arg == "--files")
                        .and_then(|index| file(index + 1))
                });
            return (Some(SearchFiles), path);
        }
        "git" => {
            let index = if args.first().is_some_and(|arg| arg == "-C") {
                2
            } else {
                0
            };
            match args.get(index).map(String::as_str) {
                Some("status") => Some(GitStatus),
                Some("diff") => Some(GitDiff),
                Some("log" | "show") => Some(GitLog),
                _ => None,
            }
        }
        "cargo" => match args.first().map(String::as_str) {
            Some("build") => Some(Build),
            Some("test" | "nextest") => Some(Test),
            Some("check") => Some(Typecheck),
            Some("clippy") => Some(Lint),
            Some("fmt") => Some(Format),
            _ => None,
        },
        "npm" | "pnpm" | "yarn" | "bun" => {
            let script = args
                .get(usize::from(args.first().is_some_and(|arg| arg == "run")))
                .map(String::as_str)
                .unwrap_or("");
            match script.split(':').next().unwrap_or("") {
                "build" => Some(Build),
                "test" => Some(Test),
                "lint" => Some(Lint),
                "format" | "fmt" => Some(Format),
                "typecheck" | "check" => Some(Typecheck),
                "install" | "ci" => Some(Install),
                _ => None,
            }
        }
        "pytest" | "vitest" | "jest" => Some(Test),
        "python" | "python3" | "py" => {
            if args.first().is_some_and(|arg| arg == "-m") {
                match args.get(1).map(String::as_str) {
                    Some("pytest" | "unittest") => Some(Test),
                    Some("pip") => Some(Install),
                    _ => None,
                }
            } else {
                return (Some(PythonScript), file(0));
            }
        }
        "node" => {
            let mut index = 0;
            while let Some(arg) = args.get(index) {
                if ["-e", "--eval", "-p", "--print"].contains(&arg.as_str())
                    && args.get(index + 1).is_some()
                {
                    return (Some(NodeEval), None);
                }
                if arg.starts_with("--eval=") || arg.starts_with("--print=") {
                    return (Some(NodeEval), None);
                }
                if arg == "--input-type" {
                    index += 2;
                } else if arg.starts_with('-') {
                    index += 1;
                } else {
                    break;
                }
            }
            if args.first().is_some_and(|arg| arg == "--test") {
                Some(Test)
            } else {
                return (Some(NodeScript), file(0));
            }
        }
        _ => None,
    };
    (operation, None)
}

fn category_for_operation(
    operation: Option<ActivityOperation>,
    fallback: ActivityCategory,
) -> ActivityCategory {
    match operation {
        Some(ActivityOperation::ReadFile) => ActivityCategory::Reading,
        Some(ActivityOperation::SearchFiles) => ActivityCategory::Searching,
        Some(ActivityOperation::WriteFile | ActivityOperation::EditFile) => {
            ActivityCategory::Writing
        }
        _ => fallback,
    }
}

#[derive(Default)]
pub struct ActivityTracker {
    ids: BTreeMap<String, u32>,
    latest: BTreeMap<u32, RunActivity>,
}

impl ActivityTracker {
    fn index(&mut self, id: String) -> Option<u32> {
        if let Some(index) = self.ids.get(&id) {
            return Some(*index);
        }
        let index = u32::try_from(self.ids.len()).ok()?;
        self.ids.insert(id, index);
        Some(index)
    }

    pub fn observe(&mut self, run_id: &str, frame: &Value, workdir: &str) -> Vec<RunActivity> {
        let mut result = vec![];
        if let Some(activity) = antigravity_step(run_id, frame, workdir) {
            result.push(activity);
        } else if matches!(
            frame["type"].as_str(),
            Some("item.started" | "item.updated" | "item.completed")
        ) {
            let item = &frame["item"];
            let Some(id) = item["id"]
                .as_str()
                .filter(|id| !id.is_empty() && id.len() <= 512)
            else {
                return result;
            };
            let state = if item["status"] == "failed"
                || item["exit_code"].as_i64().is_some_and(|code| code != 0)
            {
                ActivityState::Failed
            } else if frame["type"] == "item.completed" {
                ActivityState::Completed
            } else {
                ActivityState::Active
            };
            match item["type"].as_str() {
                Some("command_execution") => {
                    if let Some(index) = self.index(format!("codex:{id}")) {
                        let (operation, relative_file) =
                            command_operation(item["command"].as_str().unwrap_or(""), workdir);
                        result.push(RunActivity {
                            run_id: run_id.into(),
                            category: category_for_operation(operation, ActivityCategory::Command),
                            state,
                            step_index: index,
                            relative_file,
                            relative_files: command_files(
                                item["command"].as_str().unwrap_or(""),
                                workdir,
                            ),
                            operation,
                        });
                    }
                }
                Some("file_change") => {
                    for (position, change) in
                        item["changes"].as_array().into_iter().flatten().enumerate()
                    {
                        if let Some(index) = self.index(format!("codex:{id}:{position}")) {
                            result.push(RunActivity {
                                run_id: run_id.into(),
                                category: ActivityCategory::Writing,
                                state,
                                step_index: index,
                                relative_file: change["path"]
                                    .as_str()
                                    .and_then(|path| safe_relative(path, workdir)),
                                relative_files: None,
                                operation: Some(if change["kind"] == "add" {
                                    ActivityOperation::WriteFile
                                } else {
                                    ActivityOperation::EditFile
                                }),
                            });
                        }
                    }
                }
                _ => {}
            }
        } else if frame["type"] == "tool_use" {
            let part = &frame["part"];
            let Some(id) = part["id"]
                .as_str()
                .or_else(|| part["callID"].as_str())
                .filter(|id| !id.is_empty() && id.len() <= 512)
            else {
                return result;
            };
            let state = match part["state"]["status"].as_str() {
                Some("pending" | "running") => ActivityState::Active,
                Some("completed") => ActivityState::Completed,
                Some("error") => ActivityState::Failed,
                _ => return result,
            };
            if let Some(index) = self.index(format!("opencode:{id}")) {
                let (operation, relative_file, relative_files) = tool_operation(
                    part["tool"].as_str().unwrap_or(""),
                    &part["state"]["input"],
                    workdir,
                );
                let fallback = match part["tool"].as_str() {
                    Some("bash") => ActivityCategory::Command,
                    _ => ActivityCategory::Other,
                };
                result.push(RunActivity {
                    run_id: run_id.into(),
                    category: category_for_operation(operation, fallback),
                    state,
                    step_index: index,
                    relative_file,
                    relative_files,
                    operation,
                });
            }
        }
        for activity in &mut result {
            if let Some(previous) = self.latest.get(&activity.step_index) {
                if activity.operation.is_none() {
                    activity.operation = previous.operation;
                }
                if activity.relative_file.is_none() {
                    activity.relative_file = previous.relative_file.clone();
                }
                if activity.relative_files.is_none() {
                    activity.relative_files = previous.relative_files.clone();
                }
                activity.category = category_for_operation(activity.operation, activity.category);
            }
        }
        result.retain(|activity| {
            if self.latest.get(&activity.step_index) == Some(activity) {
                false
            } else {
                self.latest.insert(activity.step_index, activity.clone());
                true
            }
        });
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn recorded_powershell_commands_keep_all_read_targets_and_inline_node_intent() {
        let frames: Vec<Value> = serde_json::from_str(include_str!(
            "../tests/fixtures/live-office-native-commands.json"
        ))
        .unwrap();
        let mut tracker = ActivityTracker::default();
        let read = tracker
            .observe("real-run", &frames[0], "C:/project")
            .remove(0);
        assert_eq!(read.description(), "Membaca src/cart.js, package.json");
        assert_eq!(
            read.relative_files,
            Some(vec!["src/cart.js".into(), "package.json".into()])
        );
        assert_eq!(read.relative_file.as_deref(), Some("src/cart.js"));
        let eval = tracker
            .observe("real-run", &frames[1], "C:/project")
            .remove(0);
        assert_eq!(eval.operation, Some(ActivityOperation::NodeEval));
        assert_eq!(
            eval.description(),
            "Menjalankan: Evaluasi JavaScript dengan Node.js"
        );
        let serialized = serde_json::to_string(&eval).unwrap();
        for private in ["console.log", "total([{", "Program Files", "--input-type"] {
            assert!(!serialized.contains(private));
        }
        let mut legacy: RunActivity = serde_json::from_value(json!({"run_id":"real-run","category":"reading","state":"completed","step_index":27,"relative_file":null,"operation":"read_file"})).unwrap();
        legacy.enrich_from_native(&frames[0], "C:/project");
        assert_eq!(legacy.description(), read.description());
        assert_eq!(legacy.step_index, 27);
        assert_eq!(legacy.run_id, "real-run");
    }

    #[test]
    fn file_arrays_handle_quoting_options_and_sensitive_targets_without_fabricating_paths() {
        let command =
            r#"pwsh -Command 'Get-Content -LiteralPath "src/cart total.js", package.json -Raw'"#;
        assert_eq!(
            command_files(command, "/project"),
            Some(vec!["src/cart total.js".into(), "package.json".into()])
        );
        assert_eq!(
            command_operation("Get-Content -Path ./src/cart.js", "/project")
                .1
                .as_deref(),
            Some("src/cart.js")
        );
        let sensitive = "Get-Content -LiteralPath /outside/a.js, .env, public.js";
        assert_eq!(
            command_operation(sensitive, "/project").1.as_deref(),
            Some("public.js")
        );
        assert_eq!(command_files(sensitive, "/project"), None);
        assert_eq!(
            command_operation("Get-Content -LiteralPath 'a,b.js'", "/project").1,
            None
        );
        assert_eq!(
            command_operation("Get-Content -Unknown private-value public.js", "/project").1,
            None
        );
        assert_eq!(
            command_operation("node script.js --eval secret", "/project").0,
            Some(ActivityOperation::NodeScript)
        );
        assert_eq!(
            command_operation("echo node --eval private", "/project").0,
            None
        );
    }

    #[test]
    fn codex_steps_keep_identity_complete_and_fail_without_private_output() {
        let mut tracker = ActivityTracker::default();
        let mut frame = json!({"type":"item.started","item":{"id":"native-id","type":"command_execution","command":"powershell.exe -Command \"Get-Content src/cart.js\"","aggregated_output":"PRIVATE_OUTPUT"}});
        let started = tracker.observe("run", &frame, "C:/project");
        assert_eq!(started.len(), 1);
        assert_eq!(started[0].operation, Some(ActivityOperation::ReadFile));
        assert_eq!(started[0].relative_file.as_deref(), Some("src/cart.js"));
        assert!(tracker.observe("run", &frame, "C:/project").is_empty());
        frame["type"] = "item.completed".into();
        frame["item"]["exit_code"] = 1.into();
        let failed = tracker.observe("run", &frame, "C:/project");
        assert_eq!(failed[0].step_index, started[0].step_index);
        assert_eq!(failed[0].state, ActivityState::Failed);
        assert!(!serde_json::to_string(&failed).unwrap().contains("PRIVATE"));
        let edit = tracker.observe("run", &json!({"type":"item.completed","item":{"id":"edit","type":"file_change","changes":[{"path":"src/cart.js","kind":"update"}]}}), "C:/project");
        assert_ne!(edit[0].step_index, started[0].step_index);
        assert_eq!(edit[0].operation, Some(ActivityOperation::EditFile));
        assert!(tracker.observe("run", &json!({"type":"item.completed","item":{"id":"answer","type":"agent_message","text":"PRIVATE_ANSWER"}}), "").is_empty());
    }

    #[test]
    fn opencode_tool_lifecycle_and_legacy_payloads_remain_supported() {
        let mut tracker = ActivityTracker::default();
        let mut frame = json!({"type":"tool_use","part":{"id":"tool-1","tool":"read","state":{"status":"running","input":{"filePath":"/project/src/cart.js"}}}});
        let start = tracker.observe("run", &frame, "/project");
        assert_eq!(start[0].operation, Some(ActivityOperation::ReadFile));
        frame["part"]["state"] = json!({"status":"completed","output":"PRIVATE_RESULT"});
        let end = tracker.observe("run", &frame, "/project");
        assert_eq!(end[0].step_index, start[0].step_index);
        assert_eq!(end[0].relative_file, start[0].relative_file);
        assert_eq!(end[0].state, ActivityState::Completed);
        let legacy: RunActivity = serde_json::from_value(json!({"run_id":"old","category":"command","state":"completed","step_index":0,"relative_file":null})).unwrap();
        assert_eq!(legacy.operation, None);
    }

    #[test]
    fn command_intent_uses_known_executables_and_never_echoed_text_or_shell_programs() {
        use ActivityOperation::*;
        for (command, expected) in [
            ("npm run build", Build),
            ("npm test", Test),
            ("git status --short", GitStatus),
            ("cargo check", Typecheck),
            ("rg --files -g src/**/*.vue", SearchFiles),
        ] {
            assert_eq!(command_operation(command, "/project").0, Some(expected));
        }
        for command in [
            "echo npm run build",
            "npm test; echo PRIVATE",
            "unknown --password=PRIVATE",
            "bash -lc 'npm test && npm run build'",
            "npm $(PRIVATE)",
        ] {
            assert_eq!(command_operation(command, "/project"), (None, None));
        }
        for path in [
            "/project/.env",
            "../outside.js",
            "C:/other/file.js",
            "src/credentials.json",
            "src/PRIVATE-token.js",
            "src/a\nfile.js",
            "src/cart.js,",
        ] {
            assert_eq!(safe_relative(path, "/project"), None);
        }
        assert_eq!(
            safe_relative("c:\\project\\src\\cart.js", "C:/project"),
            Some("src/cart.js".into())
        );
        assert_eq!(
            safe_relative("C:/project/src/cart.js", "\\\\?\\C:\\project"),
            Some("src/cart.js".into())
        );
    }

    #[test]
    fn native_tool_activity_excludes_arguments_results_and_identity_guesses() {
        let frame = json!({"event":"step_update","step_update":{"conversation_id":"native-private", "step_index":4,"state":"DONE","step_type":"tool","tool_name":"view_file","tool_info":{"parameters":{"AbsolutePath":"/private/.env"},"output":"password=private-value"}}});
        let activity = antigravity_step("platform-run", &frame, "/private").unwrap();
        assert_eq!(activity.category, ActivityCategory::Reading);
        assert_eq!(activity.state, ActivityState::Completed);
        assert!(
            !serde_json::to_string(&activity)
                .unwrap()
                .contains("private")
        );
        assert_eq!(activity.run_id, "platform-run");
    }

    #[test]
    fn tool_failure_is_not_completed_and_unknown_tools_are_not_invented() {
        let frame = json!({"event":"step_update","step_update":{"step_index":4,"state":"DONE","step_type":"tool","tool_name":"new_unrecognized_tool","tool_info":{"error":{"message":"private"}}}});
        let activity = antigravity_step("run", &frame, "/project").unwrap();
        assert_eq!(activity.category, ActivityCategory::Other);
        assert_eq!(activity.state, ActivityState::Failed);
        assert_eq!(activity.summary(), "Langkah pekerjaan gagal");
        assert!(antigravity_step("run", &json!({"event":"step_update","step_update":{"step_index":4,"state":"ACTIVE","step_type":"checkpoint"}}), "/project").is_none());
    }

    #[test]
    fn native_error_ends_active_reading_without_exposing_tool_details() {
        let mut frame = json!({
            "event": "step_update",
            "step_update": {
                "conversation_id": "private-native-conversation",
                "step_index": 4,
                "state": "ACTIVE",
                "step_type": "tool",
                "tool_name": "view_file",
                "tool_info": {
                    "parameters": {"AbsolutePath": "/workspace/project"}
                }
            }
        });
        let active = antigravity_step("platform-run", &frame, "/workspace/project").unwrap();
        assert_eq!(active.state, ActivityState::Active);
        frame["step_update"]["state"] = "ERROR".into();
        frame["step_update"]["tool_info"]["error"] =
            "Cannot read directory /workspace/project; private-error-detail".into();
        frame["step_update"]["tool_info"]["output"] = "private-tool-output".into();
        let failed = antigravity_step("platform-run", &frame, "/workspace/project").unwrap();
        assert_eq!(failed.step_index, active.step_index);
        assert_eq!(failed.category, ActivityCategory::Reading);
        assert_eq!(failed.state, ActivityState::Failed);
        assert_eq!(failed.summary(), "Gagal membaca");
        assert_eq!(
            serde_json::to_value(&failed).unwrap(),
            json!({"run_id":"platform-run","category":"reading","state":"failed", "step_index":4,"relative_file":null,"operation":"read_file"})
        );
        frame["step_update"]["tool_info"]["parameters"]["AbsolutePath"] =
            "/workspace/project/PROJECT_BRIEF.md".into();
        let document = antigravity_step("platform-run", &frame, "/workspace/project").unwrap();
        assert_eq!(document.state, ActivityState::Failed);
        assert_eq!(document.relative_file.as_deref(), Some("PROJECT_BRIEF.md"));
        for path in ["/workspace/project/.env", "/private/credentials"] {
            frame["step_update"]["tool_info"]["parameters"]["AbsolutePath"] = path.into();
            let sensitive = antigravity_step("platform-run", &frame, "/workspace/project").unwrap();
            assert_eq!(sensitive.state, ActivityState::Failed);
            assert!(sensitive.relative_file.is_none());
        }
    }

    #[test]
    fn file_labels_stay_relative_and_exclude_sensitive_paths() {
        let mut frame = json!({"event":"step_update","step_update":{"step_index":1,"state":"ACTIVE","step_type":"tool","tool_name":"view_file","tool_info":{"parameters":{"AbsolutePath":"/project/PROJECT_BRIEF.md"}}}});
        assert_eq!(
            antigravity_step("run", &frame, "/project")
                .unwrap()
                .relative_file
                .as_deref(),
            Some("PROJECT_BRIEF.md")
        );
        for path in [
            "/project-other/private.md",
            "/project/../private.md",
            "/project/.env",
            "/project/vault/secret.md",
        ] {
            frame["step_update"]["tool_info"]["parameters"]["AbsolutePath"] = path.into();
            assert!(
                antigravity_step("run", &frame, "/project")
                    .unwrap()
                    .relative_file
                    .is_none()
            );
        }
    }
}
