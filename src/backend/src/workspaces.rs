use crate::App;
use anyhow::{Context, Result, bail, ensure};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use ts_rs::TS;

#[derive(Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Folder {
    pub name: String,
    pub path: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[ts(export)]
pub struct LocalProjectsInfo {
    pub status: String,
    pub path: Option<String>,
    pub diagnosis: String,
    pub setup_step: String,
}

#[derive(Serialize, Deserialize, TS)]
#[ts(export)]
pub struct DirectoryView {
    pub path: String,
    pub parent: Option<String>,
    pub roots: Vec<Folder>,
    pub folders: Vec<Folder>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub local_projects: Option<LocalProjectsInfo>,
}

fn display(path: &Path) -> String {
    let value = path.to_string_lossy();
    if let Some(unc) = value.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{unc}")
    } else {
        value.strip_prefix(r"\\?\").unwrap_or(&value).into()
    }
}

pub fn browse(app: &App, requested: &str) -> Result<DirectoryView> {
    browse_internal(
        app,
        requested,
        std::env::var_os("AE_LOCAL_PROJECTS_ROOT").as_deref(),
    )
}

pub fn browse_internal(
    app: &App,
    requested: &str,
    local_projects_root: Option<&std::ffi::OsStr>,
) -> Result<DirectoryView> {
    let project = app
        .store
        .org
        .parent()
        .context("Organization has no parent directory")?;
    let path = if requested.is_empty() {
        project.to_path_buf()
    } else {
        PathBuf::from(requested)
    };
    ensure!(path.is_absolute(), "Select an absolute folder path");
    let path = match path.canonicalize() {
        Ok(p) => p,
        Err(err) if err.kind() == std::io::ErrorKind::PermissionDenied => {
            bail!("Folder access was denied: {err}")
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            bail!("Folder does not exist")
        }
        Err(err) => bail!("Folder is unavailable: {err}"),
    };
    ensure!(
        !path
            .components()
            .any(|c| c.as_os_str().eq_ignore_ascii_case(".state")),
        "Internal organization state cannot be browsed"
    );
    ensure!(path.is_dir(), "Select a folder, not a file");
    let mut roots = vec![Folder {
        name: "Project folder".into(),
        path: display(project),
    }];

    let (local_projects_info, local_projects_root_folder) = match local_projects_root {
        None => (
            LocalProjectsInfo {
                status: "unconfigured".into(),
                path: None,
                diagnosis: "Local projects root is not configured (AE_LOCAL_PROJECTS_ROOT is unset).".into(),
                setup_step: "Follow the 'Explicit local projects overlay' setup in DEPLOYMENT.md: set AE_PROJECTS_DIR to the approved host projects directory and create a dedicated Compose project. Keep existing /workdir workers and their registration state separate.".into(),
            },
            None,
        ),
        Some(val) if val.is_empty() => (
            LocalProjectsInfo {
                status: "unconfigured".into(),
                path: None,
                diagnosis: "Local projects root is not configured (AE_LOCAL_PROJECTS_ROOT is empty).".into(),
                setup_step: "Follow the 'Explicit local projects overlay' setup in DEPLOYMENT.md: set AE_PROJECTS_DIR to the approved host projects directory and create a dedicated Compose project. Keep existing /workdir workers and their registration state separate.".into(),
            },
            None,
        ),
        Some(val) => {
            let root_path = PathBuf::from(val);
            let display_str = root_path.to_string_lossy().into_owned();
            match std::fs::metadata(&root_path) {
                Err(err) if err.kind() == std::io::ErrorKind::NotFound => (
                    LocalProjectsInfo {
                        status: "not_found".into(),
                        path: Some(display_str.clone()),
                        diagnosis: format!("Configured local projects root '{display_str}' does not exist."),
                        setup_step: "Verify that AE_PROJECTS_DIR points to an existing directory on the host and that the /projects mount volume is bound.".into(),
                    },
                    None,
                ),
                Err(err) if err.kind() == std::io::ErrorKind::PermissionDenied => (
                    LocalProjectsInfo {
                        status: "unreadable".into(),
                        path: Some(display_str.clone()),
                        diagnosis: format!("Configured local projects root '{display_str}' access was denied: {err}."),
                        setup_step: "Ensure the process has permission to access the configured directory.".into(),
                    },
                    None,
                ),
                Err(err) => (
                    LocalProjectsInfo {
                        status: "unreadable".into(),
                        path: Some(display_str.clone()),
                        diagnosis: format!("Configured local projects root '{display_str}' is unavailable: {err}."),
                        setup_step: "Verify directory accessibility and permissions.".into(),
                    },
                    None,
                ),
                Ok(_) => match root_path.canonicalize() {
                    Ok(canonical) => {
                        let can_display = display(&canonical);
                        if !canonical.is_dir() {
                            (
                                LocalProjectsInfo {
                                    status: "unreadable".into(),
                                    path: Some(can_display),
                                    diagnosis: format!("Configured local projects root '{display_str}' is not a directory."),
                                    setup_step: "Ensure the local projects mount target is a valid directory.".into(),
                                },
                                None,
                            )
                        } else {
                            match std::fs::read_dir(&canonical) {
                                Ok(_) => (
                                    LocalProjectsInfo {
                                        status: "available".into(),
                                        path: Some(can_display.clone()),
                                        diagnosis: format!("Local projects root '{can_display}' is available."),
                                        setup_step: "Select a repository directory inside the local projects root.".into(),
                                    },
                                    Some(Folder {
                                        name: "Local projects".into(),
                                        path: can_display,
                                    }),
                                ),
                                Err(err) if err.kind() == std::io::ErrorKind::PermissionDenied => (
                                    LocalProjectsInfo {
                                        status: "unreadable".into(),
                                        path: Some(can_display),
                                        diagnosis: format!("Configured local projects root '{display_str}' access was denied: {err}."),
                                        setup_step: "Ensure the container process has read permissions for the mounted directory.".into(),
                                    },
                                    None,
                                ),
                                Err(err) => (
                                    LocalProjectsInfo {
                                        status: "unreadable".into(),
                                        path: Some(can_display),
                                        diagnosis: format!("Configured local projects root '{display_str}' cannot be read: {err}."),
                                        setup_step: "Ensure the container process has read permissions for the mounted directory.".into(),
                                    },
                                    None,
                                ),
                            }
                        }
                    }
                    Err(err) if err.kind() == std::io::ErrorKind::PermissionDenied => (
                        LocalProjectsInfo {
                            status: "unreadable".into(),
                            path: Some(display_str.clone()),
                            diagnosis: format!("Configured local projects root '{display_str}' access was denied: {err}."),
                            setup_step: "Ensure the container process has read permissions for the mounted directory.".into(),
                        },
                        None,
                    ),
                    Err(err) if err.kind() == std::io::ErrorKind::NotFound => (
                        LocalProjectsInfo {
                            status: "not_found".into(),
                            path: Some(display_str.clone()),
                            diagnosis: format!("Configured local projects root '{display_str}' does not exist: {err}."),
                            setup_step: "Verify that AE_PROJECTS_DIR points to an existing directory on the host and that the /projects mount volume is bound.".into(),
                        },
                        None,
                    ),
                    Err(err) => (
                        LocalProjectsInfo {
                            status: "unreadable".into(),
                            path: Some(display_str.clone()),
                            diagnosis: format!("Configured local projects root '{display_str}' cannot be resolved: {err}."),
                            setup_step: "Verify that AE_PROJECTS_DIR points to an existing directory on the host and that the /projects mount volume is bound.".into(),
                        },
                        None,
                    ),
                },
            }
        }
    };

    if let Some(folder) = local_projects_root_folder {
        roots.push(folder);
    }
    if let Some(home) = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }) {
        roots.push(Folder {
            name: "Home".into(),
            path: display(Path::new(&home)),
        });
    }
    #[cfg(windows)]
    for drive in b'A'..=b'Z' {
        let root = format!("{}:\\", char::from(drive));
        if Path::new(&root).is_dir() {
            roots.push(Folder {
                name: root.clone(),
                path: root,
            });
        }
    }
    #[cfg(not(windows))]
    roots.push(Folder {
        name: "Filesystem".into(),
        path: "/".into(),
    });
    let mut view = listing(&path, path.parent().map(display), roots)?;
    view.local_projects = Some(local_projects_info);
    Ok(view)
}

pub fn browse_runtime(root: &Path, state: &Path, requested: &str) -> Result<DirectoryView> {
    let path = if requested.is_empty() {
        root.to_path_buf()
    } else {
        PathBuf::from(requested)
    };
    ensure!(path.is_absolute(), "Select an absolute folder path");
    let path = match path.canonicalize() {
        Ok(p) => p,
        Err(err) if err.kind() == std::io::ErrorKind::PermissionDenied => {
            bail!("Folder access was denied: {err}")
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            bail!("Folder does not exist")
        }
        Err(err) => bail!("Folder is unavailable: {err}"),
    };
    ensure!(
        path.starts_with(root),
        "Folder is outside the runtime's registered root"
    );
    ensure!(
        !path.starts_with(state)
            && !path.components().any(|c| {
                let name = c.as_os_str().to_string_lossy().to_lowercase();
                name == ".state" || name == ".git" || name.starts_with(".env")
            }),
        "Internal or sensitive folders cannot be browsed"
    );
    let mut view = listing(
        &path,
        path.parent().filter(|p| p.starts_with(root)).map(display),
        vec![Folder {
            name: "Runtime root".into(),
            path: display(root),
        }],
    )?;
    view.folders.retain(|f| {
        !Path::new(&f.path)
            .canonicalize()
            .is_ok_and(|p| p.starts_with(state))
    });
    Ok(view)
}

fn listing(path: &Path, parent: Option<String>, roots: Vec<Folder>) -> Result<DirectoryView> {
    let mut folders = Vec::new();
    let entries = match std::fs::read_dir(path) {
        Ok(entries) => entries,
        Err(err) if err.kind() == std::io::ErrorKind::PermissionDenied => {
            bail!("Folder access was denied: {err}")
        }
        Err(err) => bail!("Cannot read this folder: {err}"),
    };
    // ponytail: cap scans at 10,000 entries; paginate if very large folders become common.
    for (count, entry) in entries.enumerate() {
        ensure!(
            count < 10000,
            "This folder has too many entries; enter a more specific path"
        );
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name == ".state" || name == ".git" || name.starts_with(".env") {
            continue;
        }
        if entry.file_type()?.is_dir() {
            folders.push(Folder {
                name,
                path: display(&entry.path()),
            });
        }
    }
    folders.sort_by_cached_key(|f| f.name.to_lowercase());
    Ok(DirectoryView {
        path: display(&path),
        parent,
        roots,
        folders,
        local_projects: None,
    })
}

#[cfg(test)]
mod tests {
    #[test]
    fn runtime_browser_stays_inside_registered_root() -> anyhow::Result<()> {
        let temp = tempfile::tempdir()?;
        let root = temp.path().join("root");
        let state = root.join("worker-state");
        let project = root.join("project");
        for path in [
            &state,
            &project,
            &root.join(".state"),
            &root.join(".env-private"),
        ] {
            std::fs::create_dir_all(path)?;
        }
        let root = root.canonicalize()?;
        let state = state.canonicalize()?;
        let view = super::browse_runtime(&root, &state, "")?;
        assert!(view.parent.is_none());
        assert_eq!(view.roots.len(), 1);
        assert_eq!(
            view.folders
                .iter()
                .map(|f| f.name.as_str())
                .collect::<Vec<_>>(),
            vec!["project"]
        );
        let child = super::browse_runtime(&root, &state, project.to_str().unwrap())?;
        assert_eq!(child.parent, Some(view.path));
        for path in [
            temp.path().to_path_buf(),
            state.clone(),
            root.join(".state"),
            root.join(".env-private"),
            root.join("missing"),
        ] {
            assert!(super::browse_runtime(&root, &state, path.to_str().unwrap()).is_err());
        }
        assert!(super::browse_runtime(&root, &state, "relative").is_err());
        #[cfg(unix)]
        {
            let link = root.join("escape");
            std::os::unix::fs::symlink(temp.path(), &link)?;
            assert!(super::browse_runtime(&root, &state, link.to_str().unwrap()).is_err());
        }
        Ok(())
    }

    #[test]
    fn controller_browser_discovers_local_projects_root() -> anyhow::Result<()> {
        let temp = tempfile::tempdir()?;
        let org = temp.path().join("org");
        let projects = temp.path().join("projects");
        std::fs::create_dir_all(&org)?;
        std::fs::create_dir_all(&projects)?;

        let store = std::sync::Arc::new(crate::store::Store::open(org.clone())?);
        let app = crate::App {
            workspace_id: "default".into(),
            identity: None,
            public_url: std::sync::Arc::new("http://127.0.0.1:8765".into()),
            enabled: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
            store,
            token: std::sync::Arc::new("owner".into()),
            address: std::net::SocketAddrV4::new(std::net::Ipv4Addr::LOCALHOST, 8765),
            codex: std::path::PathBuf::from("provider-must-not-run"),
            codex_version: std::sync::Arc::new(String::new()),
            wake: std::sync::Arc::new(tokio::sync::Notify::new()),
            cancellations: std::sync::Arc::new(std::sync::Mutex::new(
                std::collections::HashMap::new(),
            )),
            knowledge: std::sync::Arc::new(crate::knowledge::Knowledge::new(org.join(".state"))),
            tool_tokens: std::sync::Arc::new(std::sync::Mutex::new(
                std::collections::HashMap::new(),
            )),
        };

        // 1. Unconfigured
        let view = super::browse_internal(&app, "", None)?;
        assert!(!view.roots.iter().any(|r| r.name == "Local projects"));
        assert_eq!(
            view.local_projects.as_ref().map(|i| i.status.as_str()),
            Some("unconfigured")
        );

        // 2. Available
        let view = super::browse_internal(&app, "", Some(projects.as_os_str()))?;
        assert!(view.roots.iter().any(|r| r.name == "Local projects"));
        assert_eq!(
            view.local_projects.as_ref().map(|i| i.status.as_str()),
            Some("available")
        );

        // 3. Not found
        let nonexistent = temp.path().join("nonexistent");
        let view = super::browse_internal(&app, "", Some(nonexistent.as_os_str()))?;
        assert!(!view.roots.iter().any(|r| r.name == "Local projects"));
        assert_eq!(
            view.local_projects.as_ref().map(|i| i.status.as_str()),
            Some("not_found")
        );

        // 4. Unreadable (file instead of directory)
        let file_root = temp.path().join("file_root");
        std::fs::write(&file_root, b"not a dir")?;
        let view = super::browse_internal(&app, "", Some(file_root.as_os_str()))?;
        assert!(!view.roots.iter().any(|r| r.name == "Local projects"));
        assert_eq!(
            view.local_projects.as_ref().map(|i| i.status.as_str()),
            Some("unreadable")
        );

        // 5. Unreadable due to permission denial (on Unix)
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let is_root = rustix::process::geteuid().is_root();
            let restricted_dir = temp.path().join("restricted_dir");
            std::fs::create_dir_all(&restricted_dir)?;
            std::fs::set_permissions(&restricted_dir, std::fs::Permissions::from_mode(0o000))?;
            let view = super::browse_internal(&app, "", Some(restricted_dir.as_os_str()))?;
            if !is_root {
                assert!(!view.roots.iter().any(|r| r.name == "Local projects"));
                assert_eq!(
                    view.local_projects.as_ref().map(|i| i.status.as_str()),
                    Some("unreadable")
                );
                assert!(
                    view.local_projects
                        .as_ref()
                        .unwrap()
                        .diagnosis
                        .contains("access was denied")
                );
            }
            std::fs::set_permissions(&restricted_dir, std::fs::Permissions::from_mode(0o755))?;
        }

        Ok(())
    }
}
