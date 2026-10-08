// Codex/OpenCode provide native catalogs; Antigravity SSH exposes installed workspace bundles.
use crate::{App, runtime, security, terminal};
use anyhow::{Context, Result, ensure};
use axum::{
    Json,
    extract::{Path, Query, State},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{io::Read, path::PathBuf};
use ts_rs::TS;

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Skill {
    pub name: String,
    pub description: String,
    pub path: String,
    pub scope: String,
    pub enabled: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SkillError {
    pub path: String,
    pub message: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SkillList {
    pub cwd: String,
    pub skills: Vec<Skill>,
    pub errors: Vec<SkillError>,
    pub text: Option<String>,
}

#[derive(Deserialize)]
struct Response {
    data: Vec<Entry>,
}
#[derive(Deserialize)]
struct Entry {
    skills: Vec<Skill>,
    errors: Vec<SkillError>,
}

#[derive(Deserialize)]
struct AntigravityManifest {
    path: String,
    folder_name: String,
    frontmatter: String,
}

#[derive(Deserialize)]
struct AntigravityCatalog {
    cwd: String,
    manifests: Vec<AntigravityManifest>,
    errors: Vec<SkillError>,
    text: Option<String>,
}

#[derive(Deserialize)]
struct AntigravityMetadata {
    name: Option<serde_yaml_ng::Value>,
    description: Option<serde_yaml_ng::Value>,
}

fn antigravity_skill(manifest: &AntigravityManifest) -> Result<Skill> {
    let metadata: AntigravityMetadata =
        serde_yaml_ng::from_str(&manifest.frontmatter).map_err(|_| {
            anyhow::anyhow!("Invalid YAML frontmatter; check syntax and duplicate fields")
        })?;
    let name = match metadata.name {
        Some(value) => value
            .as_str()
            .context("Skill name must be a string")?
            .to_owned(),
        None => manifest.folder_name.clone(),
    };
    ensure!(
        !name.is_empty() && name.chars().count() <= 64 && !name.chars().any(char::is_whitespace),
        "Skill name must contain 1–64 characters without whitespace"
    );
    let description = metadata
        .description
        .as_ref()
        .and_then(serde_yaml_ng::Value::as_str)
        .context("Skill description must be a string")?
        .trim()
        .to_owned();
    ensure!(
        !description.is_empty() && description.chars().count() <= 1024,
        "Skill description must contain 1–1024 characters"
    );
    Ok(Skill {
        name,
        description,
        path: manifest.path.clone(),
        scope: "repo".into(),
        enabled: true,
    })
}

fn antigravity_catalog(value: serde_json::Value, selected: Option<&str>) -> Result<SkillList> {
    let catalog: AntigravityCatalog =
        serde_json::from_value(value).context("Invalid Antigravity workspace skills response")?;
    let mut result = SkillList {
        cwd: catalog.cwd,
        skills: Vec::new(),
        errors: catalog.errors,
        text: catalog.text,
    };
    for manifest in catalog.manifests {
        match antigravity_skill(&manifest) {
            Ok(skill) => result.skills.push(skill),
            Err(error) => result.errors.push(SkillError {
                path: manifest.path,
                message: error.to_string(),
            }),
        }
    }
    result
        .skills
        .sort_by_key(|s| (s.name.to_lowercase(), s.path.clone()));
    if let Some(path) = selected {
        if let Some(error) = result.errors.iter().find(|error| error.path == path) {
            anyhow::bail!("Cannot preview skill: {}", error.message);
        }
        ensure!(
            result.skills.iter().any(|skill| skill.path == path) && result.text.is_some(),
            "Skill is missing or has invalid metadata; refresh the list and inspect its errors"
        );
    }
    Ok(result)
}
#[derive(Deserialize)]
pub struct SkillQuery {
    path: Option<String>,
}

pub async fn list(
    State(app): State<App>,
    Path(id): Path<String>,
    Query(query): Query<SkillQuery>,
) -> security::ApiResult<SkillList> {
    Ok(Json(
        tokio::task::spawn_blocking(move || read(&app, &id, query.path.as_deref()))
            .await
            .context("Skill discovery task failed")??,
    ))
}

fn read(app: &App, id: &str, selected: Option<&str>) -> Result<SkillList> {
    let agent = terminal::agent(app, id)?;
    let workspace = agent.workdir.context("Attach a workdir first")?;
    if let Some(host) = &workspace.ssh_host {
        let mut request = crate::remote::request(&workspace, "skills");
        request["reference"] = selected.into();
        request["harness"] = json!(agent.harness);
        request["namespace"] = crate::remote::namespace(app).into();
        let value = crate::remote::call(host, request)?;
        if agent.harness == crate::model::Harness::Antigravity {
            return antigravity_catalog(value, selected);
        }
        return Ok(serde_json::from_value(value)?);
    }
    if agent.harness == crate::model::Harness::Opencode {
        let response = crate::opencode::query(app, Some(&workspace), "/api/skill")?;
        let root = PathBuf::from(workspace.git_root.as_deref().unwrap_or(&workspace.path))
            .canonicalize()?;
        let mut result = SkillList {
            cwd: workspace.path.clone(),
            skills: vec![],
            errors: vec![],
            text: None,
        };
        for value in response["data"]
            .as_array()
            .context("Invalid OpenCode skills response")?
        {
            let path = value["path"].as_str().context("Skill path missing")?;
            let candidate = PathBuf::from(path);
            if !candidate.is_absolute() || path.starts_with("/builtin/") {
                continue;
            }
            let resolved = candidate.canonicalize()?;
            if !resolved.starts_with(&root) {
                continue;
            }
            let skill = Skill {
                name: value["name"].as_str().unwrap_or("").into(),
                description: value["description"].as_str().unwrap_or("").into(),
                path: path.into(),
                scope: "repo".into(),
                enabled: true,
            };
            if selected == Some(path) {
                let relative = resolved.strip_prefix(&root)?;
                let safe = crate::api::contained(&root, &relative.to_string_lossy())?;
                ensure!(
                    safe.file_name().is_some_and(|n| n == "SKILL.md"),
                    "Only SKILL.md can be previewed"
                );
                let bytes = std::fs::read(safe)?;
                ensure!(
                    bytes.len() <= 256 * 1024,
                    "Skill exceeds 256 KiB preview limit"
                );
                result.text = Some(String::from_utf8(bytes)?);
            }
            result.skills.push(skill);
        }
        ensure!(
            selected.is_none() || result.text.is_some(),
            "Skill is no longer installed in this workdir; refresh the list"
        );
        result.skills.sort_by_key(|s| s.name.to_lowercase());
        return Ok(result);
    }
    let home = runtime::runtime_home(app, id);
    std::fs::create_dir_all(&home)?;
    let value = crate::codex_rpc::request(
        app,
        &home,
        std::path::Path::new(&workspace.path),
        "skills/list",
        json!({"cwds":[workspace.path],"forceReload":true}),
    )?;
    let response: Response = serde_json::from_value(value)
        .context("Installed Codex returned an unsupported skills format")?;
    let mut result = SkillList {
        cwd: workspace.path.clone(),
        skills: Vec::new(),
        errors: Vec::new(),
        text: None,
    };
    let root =
        PathBuf::from(workspace.git_root.as_deref().unwrap_or(&workspace.path)).canonicalize()?;
    for entry in response.data {
        // The requested list is project skills, including inherited skills in the Git root.
        result
            .skills
            .extend(entry.skills.into_iter().filter(|s| s.scope == "repo"));
        result.errors.extend(entry.errors);
    }
    result
        .skills
        .sort_by_key(|s| (s.name.to_lowercase(), s.path.clone()));
    if let Some(path) = selected {
        let skill = result
            .skills
            .iter()
            .find(|s| s.path == path)
            .context("Skill is no longer installed in this workdir; refresh the list")?;
        let resolved = PathBuf::from(&skill.path)
            .canonicalize()
            .context("Cannot open skill instructions")?;
        ensure!(
            resolved.file_name().is_some_and(|n| n == "SKILL.md"),
            "Only SKILL.md instructions can be previewed"
        );
        let relative = resolved
            .strip_prefix(&root)
            .context("Skill links outside this codebase; inspect it with Terminal")?;
        let safe = crate::api::contained(&root, &relative.to_string_lossy())?;
        let mut bytes = Vec::new();
        std::fs::File::open(safe)?
            .take(256 * 1024 + 1)
            .read_to_end(&mut bytes)?;
        ensure!(
            bytes.len() <= 256 * 1024,
            "Skill exceeds 256 KiB preview limit"
        );
        result.text =
            Some(String::from_utf8(bytes).context("Skill instructions are not UTF-8 text")?);
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest(folder: &str, yaml: &str) -> AntigravityManifest {
        AntigravityManifest {
            path: format!("/workdir/.agents/skills/{folder}/SKILL.md"),
            folder_name: folder.into(),
            frontmatter: yaml.into(),
        }
    }

    #[test]
    fn antigravity_quoted_and_folded_descriptions_use_yaml_semantics() {
        let quoted = antigravity_skill(&manifest(
            "research",
            "name: deep-research\ndescription: \"Research: sources, citations # verified\"\n",
        ))
        .unwrap();
        assert_eq!(quoted.name, "deep-research");
        assert_eq!(
            quoted.description,
            "Research: sources, citations # verified"
        );
        let folded = antigravity_skill(&manifest(
            "review",
            "description: >-\n  Review code\n  and report defects.\n",
        ))
        .unwrap();
        assert_eq!(folded.name, "review");
        assert_eq!(folded.description, "Review code and report defects.");
        let literal = antigravity_skill(&manifest(
            "audit",
            "description: |\n  First line\n  Second line\n",
        ))
        .unwrap();
        assert_eq!(literal.description, "First line\nSecond line");
    }

    #[test]
    fn antigravity_metadata_requires_strings_and_nonempty_description() {
        for yaml in [
            "name: research\n",
            "description: ''\n",
            "description: 42\n",
            "description: [research]\n",
            "name: false\ndescription: Research\n",
        ] {
            assert!(
                antigravity_skill(&manifest("research", yaml)).is_err(),
                "{yaml}"
            );
        }
        assert!(antigravity_skill(&manifest("research", "description: null\n")).is_err());
    }

    #[test]
    fn antigravity_invalid_and_duplicate_yaml_is_rejected() {
        for yaml in [
            "description: [broken\n",
            "name: research\nname: other\ndescription: Research\n",
            "description: First\ndescription: Second\n",
        ] {
            assert!(
                antigravity_skill(&manifest("research", yaml)).is_err(),
                "{yaml}"
            );
        }
    }

    #[test]
    fn antigravity_metadata_bounds_are_enforced() {
        let description = "x".repeat(1024);
        assert!(
            antigravity_skill(&manifest(
                "research",
                &format!("description: {description}\n")
            ))
            .is_ok()
        );
        assert!(
            antigravity_skill(&manifest(
                "research",
                &format!("description: {description}x\n")
            ))
            .is_err()
        );
        assert!(
            antigravity_skill(&manifest(
                "research",
                "name: two words\ndescription: Research\n"
            ))
            .is_err()
        );
        assert!(antigravity_skill(&manifest(&"x".repeat(65), "description: Research\n")).is_err());
    }

    #[test]
    fn antigravity_catalog_preserves_good_skills_and_reports_bad_files() {
        let value = json!({
            "cwd": "/workdir", "text": null,
            "errors": [{"path":"/workdir/.agent/skills/broken/SKILL.md","message":"Invalid UTF-8"}],
            "manifests": [
                {"path":"/workdir/.agents/skills/z/SKILL.md","folder_name":"z","frontmatter":"description: Last\n"},
                {"path":"/workdir/.agents/skills/bad/SKILL.md","folder_name":"bad","frontmatter":"name: bad\n"},
                {"path":"/workdir/.agents/skills/a/SKILL.md","folder_name":"a","frontmatter":"description: First\n"}
            ]
        });
        let result = antigravity_catalog(value, None).unwrap();
        assert_eq!(
            result
                .skills
                .iter()
                .map(|s| s.name.as_str())
                .collect::<Vec<_>>(),
            ["a", "z"]
        );
        assert_eq!(result.errors.len(), 2);
        assert_eq!(
            result.errors[1].path,
            "/workdir/.agents/skills/bad/SKILL.md"
        );
    }

    #[test]
    fn antigravity_preview_requires_valid_current_catalog_entry() {
        let path = "/workdir/.agents/skills/research/SKILL.md";
        let mut value = json!({"cwd":"/workdir", "errors":[], "text":"---\ndescription: Research\n---\n# Research", "manifests":[{"path":path,"folder_name":"research","frontmatter":"description: Research\n"}]});
        assert!(
            antigravity_catalog(value.clone(), Some(path))
                .unwrap()
                .text
                .is_some()
        );
        assert!(antigravity_catalog(value.clone(), Some("/workdir/README.md")).is_err());
        value["manifests"][0]["frontmatter"] = json!("description: 42\n");
        assert!(
            antigravity_catalog(value, Some(path))
                .unwrap_err()
                .to_string()
                .contains("Skill description must be a string")
        );
    }
}
