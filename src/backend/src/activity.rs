use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

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
}

impl RunActivity {
    pub fn summary(&self) -> &'static str {
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
    Some(RunActivity {
        run_id: run_id.to_owned(),
        category,
        state,
        step_index: u32::try_from(step["step_index"].as_u64()?).ok()?,
        relative_file: relative_file(step, workdir),
    })
}

fn relative_file(step: &Value, workdir: &str) -> Option<String> {
    if workdir.is_empty() {
        return None;
    }
    let params = &step["tool_info"]["parameters"];
    let raw = [
        "AbsolutePath",
        "TargetFile",
        "FilePath",
        "file_path",
        "path",
    ]
    .iter()
    .find_map(|key| params[*key].as_str())?;
    if raw.len() > 512 || raw.chars().any(char::is_control) {
        return None;
    }
    let root = workdir.replace('\\', "/");
    let path = raw.replace('\\', "/");
    let relative = if path.starts_with('/') || path.contains(':') {
        path.strip_prefix(&format!("{}/", root.trim_end_matches('/')))?
    } else {
        &path
    };
    if relative.is_empty()
        || relative.split('/').any(|part| {
            part.is_empty()
                || part.starts_with('.')
                || ["vault", "credentials", "auth.json", "owner.key"]
                    .contains(&part.to_ascii_lowercase().as_str())
        })
    {
        return None;
    }
    Some(relative.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

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
        assert_eq!(failed.summary(), "Langkah pekerjaan gagal");
        assert_eq!(
            serde_json::to_value(&failed).unwrap(),
            json!({"run_id":"platform-run","category":"reading","state":"failed", "step_index":4,"relative_file":null})
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
