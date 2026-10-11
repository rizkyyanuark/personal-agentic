use crate::{
    App, api,
    model::{
        Agent, Artifact, Group, Harness, Run, RunArtifactError, RunArtifactSource, RunKind,
        Workspace, id, now,
    },
    security, store,
};
use anyhow::{Context, Result, ensure};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    time::{Duration, Instant},
};
use ts_rs::TS;

const MAX_DOCUMENT_BYTES: usize = 1024 * 1024;
const MAX_DOCUMENTS_PER_RUN: usize = 16;

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct DocumentStatus {
    pub artifact: Option<Artifact>,
    pub can_import: bool,
    pub can_export: bool,
    pub error: Option<String>,
}

#[derive(Deserialize)]
struct RemoteDocument {
    path: String,
    name: String,
    data: String,
    sha256: String,
    size: u64,
}

struct Document {
    path: String,
    name: String,
    bytes: Vec<u8>,
}

fn document_path(reference: &str) -> bool {
    reference.rsplit_once('.').is_some_and(|(_, extension)| {
        extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown")
    })
}

fn decode_path(reference: &str) -> Result<String> {
    let mut bytes = Vec::with_capacity(reference.len());
    let mut source = reference.as_bytes().iter().copied();
    while let Some(byte) = source.next() {
        if byte == b'%' {
            let high = source.next().and_then(|b| (b as char).to_digit(16));
            let low = source.next().and_then(|b| (b as char).to_digit(16));
            let (high, low) = high.zip(low).context("Invalid file path encoding")?;
            bytes.push((high * 16 + low) as u8);
        } else {
            bytes.push(byte);
        }
    }
    String::from_utf8(bytes).context("File path is not UTF-8")
}

fn normalize_href(reference: &str) -> Result<String> {
    ensure!(
        !reference.is_empty() && reference.len() <= 8192,
        "Invalid document path"
    );
    let reference = reference
        .split('#')
        .next()
        .unwrap_or(reference)
        .replace('\\', "/");
    ensure!(
        !decode_path(&reference)?.split('/').any(|part| part == ".."),
        "Path escapes the document scope"
    );
    let reference = if reference.to_ascii_lowercase().starts_with("file:") {
        let url = url::Url::parse(&reference)?;
        ensure!(
            url.host_str().is_none_or(|host| host == "localhost"),
            "Network file paths are not supported"
        );
        ensure!(
            url.query().is_none(),
            "Document links cannot contain a query"
        );
        decode_path(url.path())?
    } else {
        decode_path(&reference)?
    };
    normalize_literal(&reference)
}

fn normalize(reference: &str) -> Result<String> {
    if reference.to_ascii_lowercase().starts_with("file:") {
        normalize_href(reference)
    } else {
        normalize_literal(reference)
    }
}

fn normalize_literal(reference: &str) -> Result<String> {
    ensure!(
        !reference.is_empty()
            && reference.len() <= 8192
            && !reference.chars().any(char::is_control),
        "Invalid document path"
    );
    let reference = reference.replace('\\', "/");
    let reference = reference.strip_prefix("//?/").unwrap_or(&reference);
    ensure!(
        !reference.starts_with("//"),
        "Network file paths are not supported"
    );
    let reference = if reference.starts_with('/') && reference.as_bytes().get(2) == Some(&b':') {
        &reference[1..]
    } else {
        reference
    };
    ensure!(
        !reference.contains('?'),
        "Document links cannot contain a query"
    );
    ensure!(
        !reference.split('/').any(|part| part == ".."),
        "Path escapes the document scope"
    );
    for (index, part) in reference.split('/').enumerate() {
        let part = part.to_ascii_lowercase();
        ensure!(
            !part.starts_with(".env")
                && ![".git", ".state", "auth.json", "owner.key"].contains(&part.as_str()),
            "Sensitive/internal files are not exposed by this viewer"
        );
        ensure!(
            !part.contains(':')
                || (index == 0 && part.len() == 2 && part.as_bytes()[0].is_ascii_alphabetic()),
            "Unsupported document path"
        );
    }
    Ok(reference
        .split('/')
        .filter(|part| *part != ".")
        .collect::<Vec<_>>()
        .join("/"))
}

fn unescape_destination(value: &str) -> String {
    let mut result = String::new();
    let mut chars = value.chars().peekable();
    while let Some(character) = chars.next() {
        if character == '\\' && chars.peek().is_some_and(|next| next.is_ascii_punctuation()) {
            result.push(chars.next().expect("peeked character"));
        } else {
            result.push(character);
        }
    }
    result
}

fn destination(text: &str, start: usize) -> Option<(String, usize)> {
    let bytes = text.as_bytes();
    let mut index = start;
    while bytes.get(index).is_some_and(u8::is_ascii_whitespace) {
        index += 1;
    }
    if bytes.get(index) == Some(&b'<') {
        let end = text[index + 1..].find('>')? + index + 1;
        return Some((unescape_destination(&text[index + 1..end]), end + 1));
    }
    let beginning = index;
    let mut depth = 0usize;
    while let Some(byte) = bytes.get(index) {
        match byte {
            b'\\' if bytes.get(index + 1).is_some_and(u8::is_ascii_punctuation) => index += 2,
            b'(' => {
                depth += 1;
                index += 1;
            }
            b')' if depth == 0 => break,
            b')' => {
                depth -= 1;
                index += 1;
            }
            byte if byte.is_ascii_whitespace() && depth == 0 => break,
            _ => index += 1,
        }
    }
    (index > beginning && depth == 0)
        .then(|| (unescape_destination(&text[beginning..index]), index))
}

fn prose(markdown: &str) -> String {
    let mut bytes = markdown.as_bytes().to_vec();
    let mut fence: Option<(u8, usize)> = None;
    let mut offset = 0;
    for line in markdown.split_inclusive('\n') {
        let trimmed = line.trim_start_matches(' ');
        let indent = line.len() - trimmed.len();
        let marker = trimmed.as_bytes().first().copied();
        let count = marker.map_or(0, |marker| {
            trimmed.bytes().take_while(|byte| *byte == marker).count()
        });
        let is_fence = indent <= 3 && matches!(marker, Some(b'`' | b'~')) && count >= 3;
        let hidden =
            fence.is_some() || is_fence || line.starts_with("    ") || line.starts_with('\t');
        if let Some((opening, length)) = fence {
            if is_fence
                && marker == Some(opening)
                && count >= length
                && trimmed[count..].trim().is_empty()
            {
                fence = None;
            }
        } else if is_fence {
            fence = marker.map(|marker| (marker, count));
        }
        if hidden {
            bytes[offset..offset + line.len()].fill(b' ');
        }
        offset += line.len();
    }
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'`' {
            let length = bytes[index..]
                .iter()
                .take_while(|byte| **byte == b'`')
                .count();
            let mut end = index + length;
            while end < bytes.len() {
                if bytes[end] == b'`' {
                    let closing = bytes[end..]
                        .iter()
                        .take_while(|byte| **byte == b'`')
                        .count();
                    if closing == length {
                        bytes[index..end + length].fill(b' ');
                        end += length;
                        break;
                    }
                    end += closing;
                } else {
                    end += 1;
                }
            }
            index = if end < bytes.len() {
                end
            } else {
                index + length
            };
        } else if bytes[index..].starts_with(b"<!--") {
            let end = bytes[index + 4..]
                .windows(3)
                .position(|part| part == b"-->")
                .map_or(bytes.len(), |end| index + 4 + end + 3);
            bytes[index..end].fill(b' ');
            index = end;
        } else {
            index += 1;
        }
    }
    String::from_utf8(bytes).expect("code masking preserves UTF-8")
}

fn references(markdown: &str) -> Vec<String> {
    let text = prose(markdown);
    let mut definitions = BTreeMap::new();
    for line in text.lines() {
        let line = line.trim_start();
        if let Some(label) = line
            .strip_prefix('[')
            .and_then(|line| line.find("]:").map(|end| (&line[..end], &line[end + 2..])))
        {
            if let Some((path, _)) = destination(label.1, 0) {
                definitions
                    .entry(label.0.to_ascii_lowercase())
                    .or_insert(path);
            }
        }
    }
    let bytes = text.as_bytes();
    let mut found = BTreeSet::new();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'\\' {
            index = (index + 2).min(bytes.len());
            continue;
        }
        if bytes[index] == b'<' {
            if let Some(end) = text[index + 1..].find('>') {
                let path = &text[index + 1..index + 1 + end];
                if path.to_ascii_lowercase().starts_with("file:") {
                    found.insert(path.to_owned());
                }
                index += end + 2;
                continue;
            }
        }
        if bytes[index] != b'[' {
            index += 1;
            continue;
        }
        let image = index > 0 && bytes[index - 1] == b'!';
        let beginning = index + 1;
        let mut end = beginning;
        let mut depth = 1usize;
        while end < bytes.len() && depth > 0 {
            match bytes[end] {
                b'\\' => end = (end + 2).min(bytes.len()),
                b'[' => {
                    depth += 1;
                    end += 1;
                }
                b']' => {
                    depth -= 1;
                    if depth > 0 {
                        end += 1;
                    }
                }
                _ => end += 1,
            }
        }
        if depth != 0 {
            break;
        }
        let label = text[beginning..end].to_ascii_lowercase();
        let next = end + 1;
        let mut consumed = next;
        let mut path = None;
        if bytes.get(next) == Some(&b'(') {
            if let Some((value, mut close)) = destination(&text, next + 1) {
                while bytes.get(close).is_some_and(u8::is_ascii_whitespace) {
                    close += 1;
                }
                if matches!(bytes.get(close), Some(b'\'' | b'"')) {
                    let quote = bytes[close];
                    close += 1;
                    while close < bytes.len() && bytes[close] != quote {
                        close += 1;
                    }
                    close += 1;
                    while bytes.get(close).is_some_and(u8::is_ascii_whitespace) {
                        close += 1;
                    }
                }
                if bytes.get(close) == Some(&b')') {
                    path = Some(value);
                    consumed = close + 1;
                }
            }
        } else if bytes.get(next) == Some(&b'[') {
            if let Some(close) = text[next + 1..].find(']') {
                let key = &text[next + 1..next + 1 + close];
                path = definitions
                    .get(&if key.is_empty() {
                        label.clone()
                    } else {
                        key.to_ascii_lowercase()
                    })
                    .cloned();
                consumed = next + close + 2;
            }
        } else if bytes.get(next) != Some(&b':') {
            path = definitions.get(&label).cloned();
        }
        if !image && let Some(path) = path {
            found.insert(path);
        }
        index = consumed;
    }
    found
        .into_iter()
        .filter(|path| {
            let raw = path.split('#').next().unwrap_or(path);
            let local_scheme = !raw.contains(':')
                || raw.to_ascii_lowercase().starts_with("file:")
                || (raw.as_bytes().get(1) == Some(&b':')
                    && raw.as_bytes()[0].is_ascii_alphabetic());
            !raw.starts_with('#')
                && normalize_href(path)
                    .map_or_else(|_| document_path(raw), |path| document_path(&path))
                && local_scheme
        })
        .collect()
}

fn published_output(run: &Run) -> String {
    if run.kind != RunKind::Coordinator {
        return run.output.clone();
    }
    let output = run.output.trim();
    let output = output
        .strip_prefix("```json")
        .or_else(|| output.strip_prefix("```"))
        .and_then(|output| output.trim().strip_suffix("```"))
        .unwrap_or(output)
        .trim();
    serde_json::from_str::<serde_json::Value>(output)
        .ok()
        .and_then(|value| value["reply"].as_str().map(str::to_owned))
        .unwrap_or_else(|| run.output.clone())
}

fn eligible(run: &Run) -> Result<&Workspace> {
    ensure!(
        run.profile.harness == Harness::Antigravity,
        "Stored run documents currently support Antigravity only"
    );
    let workspace = run
        .profile
        .workdir
        .as_ref()
        .context("This run has no attached workdir")?;
    ensure!(
        workspace.runtime_id.is_none(),
        "Run document capture is not available for registered runtimes"
    );
    uuid::Uuid::parse_str(
        run.native_session_id
            .as_deref()
            .context("This run has no confirmed native session")?,
    )
    .context("Invalid Antigravity native session")?;
    Ok(workspace)
}

fn declared(run: &Run, reference: &str) -> Result<String> {
    let workspace = eligible(run)?;
    let normalized = normalize(reference)?;
    ensure!(
        document_path(&normalized),
        "Only Markdown documents can be saved as run artifacts"
    );
    if let Some((_, scoped)) = normalized.split_once("/.gemini/antigravity-cli/brain/") {
        ensure!(
            scoped.split('/').next() == run.native_session_id.as_deref(),
            "Document belongs to a different Antigravity native session"
        );
    }
    ensure!(
        references(&published_output(run)).iter().any(|path| {
            normalize_href(path).is_ok_and(|path| {
                logical_path(workspace, &path) == logical_path(workspace, &normalized)
            })
        }),
        "This document was not linked in this run's completed reply"
    );
    Ok(normalized)
}

fn logical_path(workspace: &Workspace, normalized: &str) -> String {
    let root = workspace.canonical_path.replace('\\', "/");
    let configured = workspace.path.replace('\\', "/");
    let root = root.strip_prefix("//?/").unwrap_or(&root);
    let configured = configured.strip_prefix("//?/").unwrap_or(&configured);
    if let Some(relative) = normalized.strip_prefix(&format!("{configured}/")) {
        format!("{root}/{relative}")
    } else if normalized.starts_with('/') || normalized.as_bytes().get(1) == Some(&b':') {
        normalized.to_owned()
    } else {
        format!("{}/{normalized}", root.trim_end_matches('/'))
    }
}

pub(crate) fn stored(app: &App, run: &Run, reference: &str) -> Result<Option<Artifact>> {
    if eligible(run).is_err() {
        return Ok(None);
    }
    let Ok(normalized) = declared(run, reference) else {
        return Ok(None);
    };
    let expected = logical_path(
        run.profile.workdir.as_ref().expect("eligible workspace"),
        &normalized,
    );
    Ok(app
        .store
        .list::<Artifact>("artifacts")?
        .into_iter()
        .rev()
        .find(|artifact| {
            artifact.status != "deleted"
                && artifact.group_id == run.group_id
                && artifact.source.as_ref().is_some_and(|source| {
                    source.run_id == run.id
                        && source.session_id == run.session_id
                        && Some(&source.native_session_id) == run.native_session_id.as_ref()
                        && source.ssh_host
                            == run
                                .profile
                                .workdir
                                .as_ref()
                                .and_then(|workspace| workspace.ssh_host.clone())
                        && normalize(&source.source_path).is_ok_and(|path| path == expected)
                })
        }))
}

fn writable(run: &Run) -> bool {
    ["workspace-write", "danger-full-access"].contains(&run.profile.permission.as_str())
}

fn current_export_allowed(app: &App, run: &Run) -> Result<bool> {
    if !writable(run) {
        return Ok(false);
    }
    app.store.read(|tx| {
        let current = store::list::<Agent>(tx, "agents")?
            .into_iter()
            .find(|agent| agent.id == run.agent_id);
        let Some(current) = current.filter(|agent| agent.deleted_at.is_none()) else {
            return Ok(false);
        };
        if !["workspace-write", "danger-full-access"].contains(&current.permission.as_str()) {
            return Ok(false);
        }
        let group: Group = store::get(tx, "groups", &run.group_id)?;
        if !crate::group_scope::access(tx, &group)?
            .participant_ids
            .contains(&run.agent_id)
        {
            return Ok(false);
        }
        let workspace = group
            .project
            .map(|project| project.workdir)
            .or(current.workdir);
        Ok(workspace
            .as_ref()
            .zip(run.profile.workdir.as_ref())
            .is_some_and(|(current, saved)| current.identity() == saved.identity()))
    })
}

fn ensure_published(app: &App, run: &Run) -> Result<()> {
    ensure!(
        app.store
            .list::<crate::model::Message>("messages")?
            .iter()
            .any(|message| message.run_id.as_deref() == Some(&run.id)
                && message.group_id == run.group_id
                && message.sender == run.agent_id),
        "Run document recovery requires a published reply in this group"
    );
    Ok(())
}

pub(crate) fn inspect(app: &App, run: &Run, reference: &str) -> Result<DocumentStatus> {
    if let Err(error) = declared(run, reference).and_then(|_| ensure_published(app, run)) {
        return Ok(DocumentStatus {
            artifact: None,
            can_import: false,
            can_export: false,
            error: Some(error.to_string()),
        });
    }
    let artifact = stored(app, run, reference)?;
    let group: Group = app.store.get("groups", &run.group_id)?;
    let active = group.archived_at.is_none() && group.deleted_at.is_none();
    let controller_access = crate::platform::controller_access(app);
    let error = run
        .artifact_errors
        .iter()
        .find(|error| normalize_href(&error.path).ok() == normalize(reference).ok())
        .map(|error| error.error.clone());
    Ok(DocumentStatus {
        can_import: artifact.is_none()
            && active
            && controller_access
            && run.ended_at.is_some()
            && run.exit_code == Some(0),
        can_export: artifact.is_some()
            && active
            && controller_access
            && current_export_allowed(app, run)?,
        artifact,
        error,
    })
}

#[cfg(any(not(unix), test))]
fn no_symlinks(base: &Path, relative: &Path) -> Result<PathBuf> {
    ensure!(
        !relative.is_absolute()
            && !relative
                .components()
                .any(|part| matches!(part, Component::ParentDir | Component::Prefix(_))),
        "Path escapes the document scope"
    );
    api::visible_file_path(relative)?;
    let mut candidate = base.to_owned();
    for part in relative.components() {
        if matches!(part, Component::CurDir) {
            continue;
        }
        candidate.push(part);
        ensure!(
            !std::fs::symlink_metadata(&candidate)?
                .file_type()
                .is_symlink(),
            "Symlink documents are not supported"
        );
    }
    let resolved = candidate
        .canonicalize()
        .context("Linked document is unavailable")?;
    ensure!(
        resolved.starts_with(base),
        "Symlink or junction escapes the document scope"
    );
    Ok(resolved)
}

#[cfg(not(unix))]
fn local_path(run: &Run, normalized: &str) -> Result<PathBuf> {
    let workspace = eligible(run)?;
    security::revalidate(workspace)?;
    let root = PathBuf::from(&workspace.canonical_path);
    let candidate = logical_path(workspace, normalized);
    let normalized_root = normalize(&workspace.canonical_path)?;
    if let Some(relative) =
        candidate.strip_prefix(&format!("{}/", normalized_root.trim_end_matches('/')))
    {
        return no_symlinks(&root, Path::new(relative));
    }
    let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .context("Native home directory is unavailable")?;
    let home = PathBuf::from(home).canonicalize()?;
    let session = run
        .native_session_id
        .as_deref()
        .context("Native session is unavailable")?;
    let relative_root = PathBuf::from(".gemini/antigravity-cli/brain").join(session);
    let brain = no_symlinks(&home, &relative_root)?;
    let normalized_brain = normalize(&brain.to_string_lossy())?;
    let relative = candidate
        .strip_prefix(&format!("{}/", normalized_brain.trim_end_matches('/')))
        .context("Document is outside this run's workdir and native Antigravity session")?;
    no_symlinks(&brain, Path::new(relative))
}

#[cfg(unix)]
fn local_scope(run: &Run, normalized: &str) -> Result<(PathBuf, PathBuf)> {
    let workspace = eligible(run)?;
    security::revalidate(workspace)?;
    let root = PathBuf::from(&workspace.canonical_path);
    let candidate = logical_path(workspace, normalized);
    let normalized_root = normalize(&workspace.canonical_path)?;
    if let Some(relative) =
        candidate.strip_prefix(&format!("{}/", normalized_root.trim_end_matches('/')))
    {
        return Ok((root, PathBuf::from(relative)));
    }
    let home =
        PathBuf::from(std::env::var_os("HOME").context("Native home directory is unavailable")?)
            .canonicalize()?;
    let native = PathBuf::from(".gemini/antigravity-cli/brain").join(
        run.native_session_id
            .as_deref()
            .context("Native session is unavailable")?,
    );
    let brain = normalize(&home.join(&native).to_string_lossy())?;
    let relative = candidate
        .strip_prefix(&format!("{}/", brain.trim_end_matches('/')))
        .context("Document is outside this run's workdir and native Antigravity session")?;
    Ok((home, native.join(relative)))
}

#[cfg(unix)]
mod unix_files {
    use super::*;
    use nix::libc;
    use std::{
        ffi::{CString, OsStr},
        fs::File,
        os::{
            fd::{AsRawFd, FromRawFd, OwnedFd},
            unix::ffi::OsStrExt,
        },
    };

    fn name(value: &OsStr) -> Result<CString> {
        CString::new(value.as_bytes()).context("Document path contains a null byte")
    }

    fn owned(descriptor: libc::c_int) -> Result<OwnedFd> {
        if descriptor < 0 {
            return Err(std::io::Error::last_os_error().into());
        }
        Ok(unsafe { OwnedFd::from_raw_fd(descriptor) })
    }

    fn directory(root: &Path, relative: &Path, create: bool) -> Result<OwnedFd> {
        ensure!(root.is_absolute(), "Document root must be absolute");
        ensure!(!relative.is_absolute(), "Path escapes the document scope");
        api::visible_file_path(relative)?;
        let flags = libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC;
        let filesystem_root = name(OsStr::new("/"))?;
        let mut current = owned(unsafe { libc::open(filesystem_root.as_ptr(), flags) })
            .context("Document root must be a directory without symlinks")?;
        for component in root.components() {
            let component = match component {
                Component::RootDir | Component::CurDir => continue,
                Component::Normal(component) => name(component)?,
                _ => anyhow::bail!("Invalid absolute document root"),
            };
            current =
                owned(unsafe { libc::openat(current.as_raw_fd(), component.as_ptr(), flags) })
                    .context("Document root ancestors must be directories without symlinks")?;
        }
        for component in relative.components() {
            let component = match component {
                Component::CurDir => continue,
                Component::Normal(component) => name(component)?,
                _ => anyhow::bail!("Path escapes the document scope"),
            };
            if create
                && unsafe { libc::mkdirat(current.as_raw_fd(), component.as_ptr(), 0o755) } < 0
            {
                let error = std::io::Error::last_os_error();
                if error.kind() != std::io::ErrorKind::AlreadyExists {
                    return Err(error.into());
                }
            }
            current =
                owned(unsafe { libc::openat(current.as_raw_fd(), component.as_ptr(), flags) })
                    .context("Document directories must exist without symlinks")?;
        }
        Ok(current)
    }

    fn open_document(parent: &OwnedFd, filename: &OsStr) -> Result<File> {
        let filename = name(filename)?;
        let file = File::from(
            owned(unsafe {
                libc::openat(
                    parent.as_raw_fd(),
                    filename.as_ptr(),
                    libc::O_RDONLY | libc::O_NOFOLLOW | libc::O_NONBLOCK | libc::O_CLOEXEC,
                )
            })
            .context("Symlink or unavailable document is not supported")?,
        );
        ensure!(
            file.metadata()?.is_file(),
            "Document must be a regular file without symlinks"
        );
        Ok(file)
    }

    pub(super) fn read(root: &Path, relative: &Path) -> Result<File> {
        api::visible_file_path(relative)?;
        let parent = directory(
            root,
            relative.parent().unwrap_or_else(|| Path::new("")),
            false,
        )?;
        open_document(
            &parent,
            relative.file_name().context("Missing document filename")?,
        )
    }

    fn publish(parent: &OwnedFd, filename: &OsStr, bytes: &[u8]) -> Result<()> {
        let temporary = name(OsStr::new(&format!(".artifact-{}.tmp", id())))?;
        let filename = name(filename)?;
        let mut file = File::from(owned(unsafe {
            libc::openat(
                parent.as_raw_fd(),
                temporary.as_ptr(),
                libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL | libc::O_NOFOLLOW | libc::O_CLOEXEC,
                0o600,
            )
        })?);
        let result = (|| -> Result<()> {
            file.write_all(bytes)?;
            file.sync_all()?;
            if unsafe {
                libc::linkat(
                    parent.as_raw_fd(),
                    temporary.as_ptr(),
                    parent.as_raw_fd(),
                    filename.as_ptr(),
                    0,
                )
            } < 0
            {
                return Err(std::io::Error::last_os_error())
                    .context("Export destination already exists or cannot be created");
            }
            Ok(())
        })();
        let cleanup = if unsafe { libc::unlinkat(parent.as_raw_fd(), temporary.as_ptr(), 0) } < 0 {
            Err(std::io::Error::last_os_error())
        } else {
            Ok(())
        };
        result?;
        cleanup.context("Cannot remove export temporary file")?;
        if unsafe { libc::fsync(parent.as_raw_fd()) } < 0 {
            return Err(std::io::Error::last_os_error().into());
        }
        Ok(())
    }

    pub(super) fn export(root: &Path, relative: &Path, bytes: &[u8]) -> Result<PathBuf> {
        api::visible_file_path(relative)?;
        let parent = directory(
            root,
            relative.parent().unwrap_or_else(|| Path::new("")),
            true,
        )?;
        publish(
            &parent,
            relative
                .file_name()
                .context("Missing destination filename")?,
            bytes,
        )?;
        Ok(root.join(relative))
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use std::os::unix::fs::symlink;

        #[test]
        fn anchored_reads_cannot_follow_replaced_ancestor_paths() -> Result<()> {
            let temporary = tempfile::tempdir()?;
            let root = temporary.path().join("workdir");
            let outside = temporary.path().join("private");
            std::fs::create_dir_all(root.join("reports"))?;
            std::fs::create_dir(&outside)?;
            std::fs::write(root.join("reports/plan.md"), b"# Authorized document")?;
            std::fs::write(
                outside.join("plan.md"),
                b"PRIVATE_DOCUMENT_MUST_NOT_BE_READ",
            )?;
            let parent = directory(&root, Path::new("reports"), false)?;
            std::fs::rename(root.join("reports"), root.join("original-reports"))?;
            symlink(&outside, root.join("reports"))?;
            let mut bytes = Vec::new();
            open_document(&parent, OsStr::new("plan.md"))?.read_to_end(&mut bytes)?;
            assert_eq!(bytes, b"# Authorized document");
            assert!(read(&root, Path::new("reports/plan.md")).is_err());
            Ok(())
        }

        #[test]
        fn anchored_exports_never_follow_replaced_ancestor_paths_or_overwrite() -> Result<()> {
            let temporary = tempfile::tempdir()?;
            let root = temporary.path().join("workdir");
            let outside = temporary.path().join("private");
            std::fs::create_dir_all(root.join("reports"))?;
            std::fs::create_dir(&outside)?;
            let parent = directory(&root, Path::new("reports"), true)?;
            std::fs::rename(root.join("reports"), root.join("original-reports"))?;
            symlink(&outside, root.join("reports"))?;
            publish(&parent, OsStr::new("plan.md"), b"# Stored document")?;
            assert!(!outside.join("plan.md").exists());
            assert_eq!(
                std::fs::read(root.join("original-reports/plan.md"))?,
                b"# Stored document"
            );
            assert!(export(&root, Path::new("reports/another.md"), b"# Blocked").is_err());
            assert!(publish(&parent, OsStr::new("plan.md"), b"# Do not overwrite").is_err());
            assert_eq!(
                std::fs::read(root.join("original-reports/plan.md"))?,
                b"# Stored document"
            );
            assert_eq!(std::fs::read_dir(root.join("original-reports"))?.count(), 1);
            let path = export(&root, Path::new("fresh/nested/report.md"), b"# New report")?;
            assert_eq!(std::fs::read(&path)?, b"# New report");
            Ok(())
        }

        #[test]
        fn roots_final_symlinks_and_non_regular_files_are_denied() -> Result<()> {
            let temporary = tempfile::tempdir()?;
            let root = temporary.path().join("workdir");
            std::fs::create_dir(&root)?;
            std::fs::write(root.join("actual.md"), b"# Actual")?;
            symlink(root.join("actual.md"), root.join("linked.md"))?;
            symlink(&root, temporary.path().join("linked-root"))?;
            assert!(read(&root, Path::new("linked.md")).is_err());
            assert!(
                read(
                    &temporary.path().join("linked-root"),
                    Path::new("actual.md")
                )
                .is_err()
            );
            let fifo = name(root.join("pipe.md").as_os_str())?;
            assert_eq!(unsafe { libc::mkfifo(fifo.as_ptr(), 0o600) }, 0);
            assert!(read(&root, Path::new("pipe.md")).is_err());
            assert!(read(&root, Path::new("../actual.md")).is_err());
            assert!(export(&root, Path::new(".state/result.md"), b"# Internal").is_err());
            Ok(())
        }

        #[test]
        fn absolute_root_ancestors_cannot_redirect_reads_or_exports() -> Result<()> {
            let temporary = tempfile::tempdir()?;
            let outside = temporary.path().join("outside/workdir");
            std::fs::create_dir_all(&outside)?;
            std::fs::write(
                outside.join("private.md"),
                b"PRIVATE_DOCUMENT_MUST_NOT_BE_READ",
            )?;
            symlink(
                temporary.path().join("outside"),
                temporary.path().join("linked-ancestor"),
            )?;
            let root = temporary.path().join("linked-ancestor/workdir");
            assert!(read(&root, Path::new("private.md")).is_err());
            assert!(export(&root, Path::new("reports/written.md"), b"# Blocked").is_err());
            assert!(!outside.join("reports").exists());
            Ok(())
        }
    }
}

fn checked_bytes(bytes: &[u8]) -> Result<()> {
    ensure!(
        bytes.len() <= MAX_DOCUMENT_BYTES,
        "Document exceeds the 1 MiB Markdown limit"
    );
    std::str::from_utf8(bytes).context("Markdown document is not valid UTF-8")?;
    Ok(())
}

#[cfg(any(not(unix), test))]
fn export_parent(root: &Path, relative: &Path) -> Result<PathBuf> {
    api::visible_file_path(relative)?;
    let mut parent = root.to_owned();
    for component in relative.components() {
        ensure!(
            matches!(component, Component::Normal(_) | Component::CurDir),
            "Path escapes workspace"
        );
        if matches!(component, Component::CurDir) {
            continue;
        }
        parent.push(component);
        match std::fs::create_dir(&parent) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(error.into()),
        }
        let metadata = std::fs::symlink_metadata(&parent)?;
        ensure!(
            metadata.is_dir() && !metadata.file_type().is_symlink(),
            "Export folders cannot be symlinks or files"
        );
        ensure!(
            parent.canonicalize()?.starts_with(root),
            "Export folder escapes the workdir"
        );
    }
    no_symlinks(root, relative)
}

fn read_document(run: &Run, normalized: &str) -> Result<Document> {
    let workspace = eligible(run)?;
    if let Some(host) = &workspace.ssh_host {
        let mut request = crate::remote::request(workspace, "run_document");
        request["harness"] = json!(run.profile.harness);
        request["native_session_id"] = json!(run.native_session_id);
        request["reference"] = logical_path(workspace, normalized).into();
        let value: RemoteDocument = serde_json::from_value(crate::remote::call(host, request)?)?;
        ensure!(
            value.size <= MAX_DOCUMENT_BYTES as u64
                && value.data.len() <= 4 * MAX_DOCUMENT_BYTES.div_ceil(3),
            "Workstation document exceeds the 1 MiB Markdown limit"
        );
        let bytes = STANDARD
            .decode(value.data)
            .context("Workstation returned invalid document bytes")?;
        checked_bytes(&bytes)?;
        ensure!(
            bytes.len() as u64 == value.size
                && format!("{:x}", Sha256::digest(&bytes)) == value.sha256,
            "Workstation document receipt does not match its bytes"
        );
        let source = normalize(&value.path)?;
        ensure!(
            source == logical_path(workspace, normalized),
            "Workstation returned a different document path"
        );
        ensure!(
            value.name == source.rsplit('/').next().unwrap_or(""),
            "Workstation returned a different document filename"
        );
        Ok(Document {
            path: value.path,
            name: value.name,
            bytes,
        })
    } else {
        #[cfg(unix)]
        let (path, mut file) = {
            let (base, relative) = local_scope(run, normalized)?;
            let file = unix_files::read(&base, &relative)?;
            (base.join(relative), file)
        };
        #[cfg(not(unix))]
        let (path, mut file) = {
            let path = local_path(run, normalized)?;
            let file = std::fs::File::open(&path)?;
            (path, file)
        };
        let metadata = file.metadata()?;
        ensure!(
            metadata.is_file(),
            "Link must point to a regular Markdown file"
        );
        ensure!(
            metadata.len() <= MAX_DOCUMENT_BYTES as u64,
            "Document exceeds the 1 MiB Markdown limit"
        );
        let mut bytes = Vec::new();
        std::io::Read::by_ref(&mut file)
            .take(MAX_DOCUMENT_BYTES as u64 + 1)
            .read_to_end(&mut bytes)?;
        let after = file.metadata()?;
        ensure!(
            metadata.len() == after.len() && metadata.modified()? == after.modified()?,
            "Document changed while it was being imported; retry the import"
        );
        checked_bytes(&bytes)?;
        Ok(Document {
            path: path.to_string_lossy().into_owned(),
            name: path
                .file_name()
                .context("Missing document filename")?
                .to_string_lossy()
                .into_owned(),
            bytes,
        })
    }
}

fn persist(app: &App, run: &Run, document: Document, capture_kind: &str) -> Result<Artifact> {
    let artifact = Artifact {
        id: id(),
        group_id: run.group_id.clone(),
        name: document.name,
        media_type: "text/markdown; charset=utf-8".into(),
        size: document.bytes.len() as u64,
        sha256: format!("{:x}", Sha256::digest(&document.bytes)),
        status: "stored".into(),
        error: None,
        created_at: now(),
        in_knowledge: false,
        source: Some(RunArtifactSource {
            run_id: run.id.clone(),
            session_id: run.session_id.clone(),
            native_session_id: run
                .native_session_id
                .clone()
                .context("Missing native session")?,
            ssh_host: run
                .profile
                .workdir
                .as_ref()
                .and_then(|workspace| workspace.ssh_host.clone()),
            source_path: document.path,
            capture_kind: capture_kind.into(),
            captured_at: now(),
        }),
    };
    app.store.write(|tx| {
        let group: Group = store::get(tx, "groups", &run.group_id)?;
        group.ensure_active()?;
        ensure!(
            crate::group_scope::access(tx, &group)?
                .participant_ids
                .contains(&run.agent_id),
            "This run's agent no longer participates in the group"
        );
        if let Some(existing) =
            store::list::<Artifact>(tx, "artifacts")?
                .into_iter()
                .find(|existing| {
                    existing.status != "deleted"
                        && existing.group_id == artifact.group_id
                        && existing.sha256 == artifact.sha256
                        && existing
                            .source
                            .as_ref()
                            .zip(artifact.source.as_ref())
                            .is_some_and(|(existing, new)| {
                                existing.run_id == new.run_id
                                    && existing.source_path == new.source_path
                                    && existing.session_id == new.session_id
                                    && existing.native_session_id == new.native_session_id
                                    && existing.ssh_host == new.ssh_host
                            })
                })
        {
            return Ok(existing);
        }
        store::atomic_write(
            &security::artifact_path(&app.store.org, &artifact.id)?,
            &document.bytes,
        )?;
        store::put(tx, "artifacts", &artifact.id, &artifact)?;
        store::event(
            tx,
            "artifact.captured",
            &json!({"id":artifact.id,"run_id":run.id}),
        )?;
        Ok(artifact.clone())
    })
}

pub(crate) fn import(app: &App, run: &Run, reference: &str) -> Result<Artifact> {
    ensure!(
        crate::platform::controller_access(app),
        "Controller filesystem access requires the bootstrap owner"
    );
    let normalized = declared(run, reference)?;
    ensure_published(app, run)?;
    ensure!(
        run.ended_at.is_some() && run.exit_code == Some(0),
        "Document recovery requires a confirmed completed native reply"
    );
    let group: Group = app.store.get("groups", &run.group_id)?;
    group.ensure_active()?;
    let artifact = if let Some(artifact) = stored(app, run, reference)? {
        artifact
    } else {
        persist(
            app,
            run,
            read_document(run, &normalized)?,
            "historical_import",
        )?
    };
    app.store.write(|tx| {
        store::get::<Group>(tx, "groups", &run.group_id)?.ensure_active()?;
        let mut saved: Run = store::get(tx, "runs", &run.id)?;
        saved
            .artifact_errors
            .retain(|error| normalize_href(&error.path).ok().as_ref() != Some(&normalized));
        store::put(tx, "runs", &saved.id, &saved)?;
        for mut message in store::list::<crate::model::Message>(tx, "messages")?
            .into_iter()
            .filter(|message| {
                message.run_id.as_deref() == Some(&run.id)
                    && message.group_id == run.group_id
                    && message.sender == run.agent_id
            })
        {
            if !message.artifacts.contains(&artifact.id) {
                message.artifacts.push(artifact.id.clone());
                store::put(tx, "messages", &message.id, &message)?;
            }
        }
        store::event(tx, "run.changed", &json!({"run_id":run.id}))?;
        Ok(())
    })?;
    Ok(artifact)
}

pub(crate) fn capture(app: &App, run: &mut Run) -> Result<Vec<String>> {
    if run.profile.harness != Harness::Antigravity {
        return Ok(vec![]);
    }
    ensure!(
        ["succeeded", "waiting"].contains(&run.status.as_str())
            && run.ended_at.is_some()
            && run.exit_code == Some(0),
        "Run documents can be captured only after a confirmed completed native reply"
    );
    let links = references(&published_output(run));
    let mut artifacts = Vec::new();
    let started = Instant::now();
    for (index, reference) in links.into_iter().enumerate() {
        let result = (|| {
            let literal = normalize_href(&reference)?;
            let normalized = declared(run, &literal)?;
            if let Some(artifact) = stored(app, run, &literal)? {
                return Ok(artifact);
            }
            ensure!(
                index < MAX_DOCUMENTS_PER_RUN,
                "Run document capture is limited to 16 linked Markdown files; import this document explicitly"
            );
            ensure!(
                started.elapsed() < Duration::from_secs(35),
                "Run document capture reached its 35 second budget; import this document explicitly"
            );
            persist(app, run, read_document(run, &normalized)?, "completion")
        })();
        match result {
            Ok(artifact) => {
                if !artifacts.contains(&artifact.id) {
                    artifacts.push(artifact.id);
                }
                run.artifact_errors.retain(|error| error.path != reference);
            }
            Err(error) => {
                let error = error.to_string();
                run.artifact_errors
                    .retain(|existing| existing.path != reference);
                run.artifact_errors.push(RunArtifactError {
                    path: reference.clone(),
                    error: error.clone(),
                });
                app.store.event(
                    "artifact.capture_failed",
                    json!({"run_id":run.id,"path":reference,"error":error}),
                )?;
            }
        }
    }
    Ok(artifacts)
}

pub(crate) fn export(app: &App, artifact: &Artifact, relative_destination: &str) -> Result<String> {
    ensure!(
        crate::platform::controller_access(app),
        "Controller filesystem access requires the bootstrap owner"
    );
    ensure!(artifact.status != "deleted", "Artifact deleted");
    let source = artifact
        .source
        .as_ref()
        .context("This artifact has no run source to export")?;
    let run: Run = app.store.get("runs", &source.run_id)?;
    let workspace = eligible(&run)?;
    ensure!(
        artifact.group_id == run.group_id
            && source.session_id == run.session_id
            && Some(&source.native_session_id) == run.native_session_id.as_ref()
            && source.ssh_host == workspace.ssh_host,
        "Artifact source does not match its run"
    );
    ensure!(
        current_export_allowed(app, &run)?,
        "Export requires write permission in both this run and the current attached workdir"
    );
    ensure_published(app, &run)?;
    let group: Group = app.store.get("groups", &run.group_id)?;
    group.ensure_active()?;
    let reference = normalize(relative_destination)?;
    ensure!(
        !reference.starts_with('/')
            && !reference.contains(':')
            && !relative_destination
                .to_ascii_lowercase()
                .starts_with("file:"),
        "Export destination must be relative to this run's workdir"
    );
    ensure!(
        document_path(&reference),
        "Export destination must be a Markdown filename"
    );
    let bytes = std::fs::read(security::artifact_path(&app.store.org, &artifact.id)?)?;
    checked_bytes(&bytes)?;
    ensure!(
        bytes.len() as u64 == artifact.size
            && format!("{:x}", Sha256::digest(&bytes)) == artifact.sha256,
        "Stored artifact bytes do not match their receipt"
    );
    let path = if let Some(host) = &workspace.ssh_host {
        let mut request = crate::remote::request(workspace, "export_document");
        request["permission"] = run.profile.permission.clone().into();
        request["reference"] = reference.clone().into();
        request["data"] = STANDARD.encode(&bytes).into();
        request["sha256"] = artifact.sha256.clone().into();
        let result = crate::remote::call(host, request)?;
        let path = result["path"]
            .as_str()
            .context("Workstation returned no export destination")?;
        ensure!(
            normalize(path)? == logical_path(workspace, &reference),
            "Workstation returned a different export destination"
        );
        path.to_owned()
    } else {
        security::revalidate(workspace)?;
        let root = PathBuf::from(&workspace.canonical_path);
        let relative = Path::new(&reference);
        #[cfg(unix)]
        let path = unix_files::export(&root, relative, &bytes)?;
        #[cfg(not(unix))]
        let path = {
            let parent = relative.parent().unwrap_or_else(|| Path::new(""));
            let parent = export_parent(&root, parent)?;
            let path = parent.join(
                relative
                    .file_name()
                    .context("Missing destination filename")?,
            );
            let mut file = tempfile::NamedTempFile::new_in(&parent)?;
            file.write_all(&bytes)?;
            file.as_file().sync_all()?;
            file.persist_noclobber(&path)
                .map_err(|error| anyhow::anyhow!(error.error))
                .context("Export destination already exists or cannot be created")?;
            path
        };
        path.to_string_lossy().into_owned()
    };
    app.store.event(
        "artifact.exported",
        json!({"id":artifact.id,"run_id":run.id,"path":path}),
    )?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn application(directory: &Path) -> Result<(App, Run)> {
        use std::sync::{Arc, Mutex, atomic::AtomicBool};
        let org = directory.join("org");
        let root = directory.join("workdir");
        std::fs::create_dir_all(&root)?;
        let store = Arc::new(store::Store::open(org.clone())?);
        let mut agent: Agent = store.get("agents", "ceo")?;
        agent.harness = Harness::Antigravity;
        agent.workdir = Some(security::validate_workspace(
            root.to_str().context("UTF-8 fixture path")?,
        )?);
        agent.permission = "workspace-write".into();
        store.put("agents", &agent.id, &agent)?;
        let run = Run {
            id: id(),
            group_id: "general".into(),
            message_id: id(),
            side_chat_id: None,
            agent_id: agent.id.clone(),
            session_id: id(),
            native_session_id: Some(id()),
            status: "succeeded".into(),
            cwd: root.to_string_lossy().into_owned(),
            profile: agent,
            created_at: now(),
            started_at: Some(now()),
            ended_at: Some(now()),
            pid: None,
            remote_pid: None,
            exit_code: Some(0),
            error: None,
            output: "[Report](report.md)".into(),
            artifact_errors: vec![],
            executable: "agy".into(),
            arguments: vec![],
            model_display_name: None,
            usage: None,
            kind: RunKind::Direct,
            parent_run_id: None,
            task: None,
            organization_context: None,
        };
        store.put("runs", &run.id, &run)?;
        let message = crate::model::Message {
            id: id(),
            group_id: run.group_id.clone(),
            side_chat_id: None,
            sender: run.agent_id.clone(),
            body: run.output.clone(),
            recipients: vec![],
            reply_to: Some(run.message_id.clone()),
            artifacts: vec![],
            run_id: Some(run.id.clone()),
            created_at: now(),
            auto_routed: false,
            schedule_id: None,
            command: None,
            usage_report: None,
        };
        store.put("messages", &message.id, &message)?;
        let app = App {
            workspace_id: "default".into(),
            identity: None,
            public_url: Arc::new("http://127.0.0.1:8765".into()),
            enabled: Arc::new(AtomicBool::new(true)),
            store,
            token: Arc::new("fixture".into()),
            address: "127.0.0.1:8765".parse()?,
            codex: "codex".into(),
            codex_version: Arc::new(String::new()),
            wake: Arc::new(tokio::sync::Notify::new()),
            cancellations: Arc::new(Mutex::new(Default::default())),
            knowledge: Arc::new(crate::knowledge::Knowledge::new(org.join(".state"))),
            tool_tokens: Arc::new(Mutex::new(Default::default())),
        };
        Ok((app, run))
    }

    #[test]
    fn completed_documents_are_durable_deduplicated_and_export_respects_current_permissions()
    -> Result<()> {
        let directory = tempfile::tempdir()?;
        let (app, mut run) = application(directory.path())?;
        let root = PathBuf::from(&run.profile.workdir.as_ref().unwrap().canonical_path);
        let bytes = b"# Saved report\n\nReal persisted bytes.\n";
        std::fs::write(root.join("report.md"), bytes)?;
        let captured = capture(&app, &mut run)?;
        assert_eq!(captured.len(), 1);
        assert!(run.artifact_errors.is_empty());
        assert_eq!(capture(&app, &mut run)?, captured);
        assert_eq!(app.store.list::<Artifact>("artifacts")?.len(), 1);
        let artifact = stored(&app, &run, "report.md")?.context("stored report")?;
        assert!(!artifact.in_knowledge);
        assert_eq!(artifact.source.as_ref().unwrap().capture_kind, "completion");
        assert_eq!(
            std::fs::read(security::artifact_path(&app.store.org, &artifact.id)?)?,
            bytes
        );
        std::fs::remove_file(root.join("report.md"))?;
        assert_eq!(stored(&app, &run, "report.md")?.unwrap().id, artifact.id);
        let exported = export(&app, &artifact, "exported.md")?;
        assert_eq!(std::fs::read(exported)?, bytes);
        assert!(export(&app, &artifact, "exported.md").is_err());
        let nested = export(&app, &artifact, "reports/nested/report.md")?;
        assert_eq!(std::fs::read(nested)?, bytes);
        let mut current: Agent = app.store.get("agents", &run.agent_id)?;
        current.permission = "read-only".into();
        app.store.put("agents", &current.id, &current)?;
        assert!(!inspect(&app, &run, "report.md")?.can_export);
        assert!(export(&app, &artifact, "forbidden.md").is_err());
        assert!(!root.join("forbidden.md").exists());
        assert_eq!(run.status, "succeeded");
        assert_eq!(run.exit_code, Some(0));
        Ok(())
    }

    #[test]
    fn non_default_workspace_cannot_import_or_export_controller_documents() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let (app, mut run) = application(directory.path())?;
        let root = PathBuf::from(&run.profile.workdir.as_ref().unwrap().canonical_path);
        std::fs::write(root.join("report.md"), b"# Saved document")?;
        let mut scoped = app.clone();
        scoped.workspace_id = id();
        assert!(
            import(&scoped, &run, "report.md")
                .unwrap_err()
                .to_string()
                .contains("requires the bootstrap owner")
        );
        assert!(app.store.list::<Artifact>("artifacts")?.is_empty());
        let metadata = inspect(&scoped, &run, "report.md")?;
        assert!(!metadata.can_import && !metadata.can_export);

        capture(&app, &mut run)?;
        let artifact = stored(&app, &run, "report.md")?.context("stored document")?;
        assert!(
            export(&scoped, &artifact, "denied/report.md")
                .unwrap_err()
                .to_string()
                .contains("requires the bootstrap owner")
        );
        assert!(!root.join("denied").exists());
        let metadata = inspect(&scoped, &run, "report.md")?;
        assert_eq!(
            metadata.artifact.map(|artifact| artifact.id),
            Some(artifact.id)
        );
        assert!(!metadata.can_import && !metadata.can_export);
        Ok(())
    }

    #[test]
    fn historical_import_requires_published_run_link_and_records_import_version() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let (app, run) = application(directory.path())?;
        let root = PathBuf::from(&run.profile.workdir.as_ref().unwrap().canonical_path);
        std::fs::write(root.join("report.md"), b"# Current bytes at import")?;
        std::fs::write(root.join("unlinked.md"), b"# Unlinked")?;
        assert!(inspect(&app, &run, "report.md")?.can_import);
        assert!(import(&app, &run, "unlinked.md").is_err());
        let artifact = import(&app, &run, "report.md")?;
        assert_eq!(
            artifact.source.as_ref().unwrap().capture_kind,
            "historical_import"
        );
        assert_eq!(import(&app, &run, "report.md")?.id, artifact.id);
        let messages: Vec<crate::model::Message> = app.store.list("messages")?;
        assert!(
            messages
                .iter()
                .any(|message| message.artifacts.contains(&artifact.id))
        );
        let mut private = run.clone();
        private.id = id();
        app.store.put("runs", &private.id, &private)?;
        assert!(import(&app, &private, "report.md").is_err());
        assert!(!inspect(&app, &private, "report.md")?.can_import);
        Ok(())
    }

    #[test]
    fn stored_coordinator_documents_survive_later_workflow_status_changes() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let (app, mut run) = application(directory.path())?;
        let root = PathBuf::from(&run.profile.workdir.as_ref().unwrap().canonical_path);
        std::fs::write(root.join("report.md"), b"# Completed coordinator report")?;
        run.kind = RunKind::Coordinator;
        run.status = "waiting".into();
        let captured = capture(&app, &mut run)?;
        assert_eq!(captured.len(), 1);
        std::fs::remove_file(root.join("report.md"))?;
        for workflow_status in ["delegated", "failed"] {
            run.status = workflow_status.into();
            app.store.put("runs", &run.id, &run)?;
            assert_eq!(stored(&app, &run, "report.md")?.unwrap().id, captured[0]);
            assert!(inspect(&app, &run, "report.md")?.artifact.is_some());
        }
        assert!(
            export(
                &app,
                &stored(&app, &run, "report.md")?.unwrap(),
                "after-summary-failure.md"
            )
            .is_ok()
        );
        Ok(())
    }

    #[test]
    fn document_names_preserve_spaces_fragment_characters_unicode_and_percent() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let (app, mut run) = application(directory.path())?;
        let root = PathBuf::from(&run.profile.workdir.as_ref().unwrap().canonical_path);
        let name = "report # 日本語 %.md";
        let href = "report%20%23%20%E6%97%A5%E6%9C%AC%E8%AA%9E%20%25.md#intro";
        let bytes = b"# Unicode filename report";
        run.output = format!("[Plan]({href})");
        app.store.put("runs", &run.id, &run)?;
        std::fs::write(root.join(name), bytes)?;
        assert_eq!(normalize_href(href)?, name);
        assert_eq!(normalize(name)?, name);
        let captured = capture(&app, &mut run)?;
        assert_eq!(captured.len(), 1);
        let artifact = stored(&app, &run, name)?.context("named document snapshot")?;
        assert_eq!(artifact.name, name);
        let file_uri = url::Url::from_file_path(root.join(name))
            .unwrap()
            .to_string();
        assert_eq!(stored(&app, &run, &file_uri)?.unwrap().id, artifact.id);
        assert_eq!(import(&app, &run, name)?.id, artifact.id);
        let exported = export(&app, &artifact, "exports/export # 日本語 %.md")?;
        assert_eq!(std::fs::read(exported)?, bytes);
        let (other_app, mut historic) = application(&directory.path().join("historical"))?;
        let other_root = PathBuf::from(&historic.profile.workdir.as_ref().unwrap().canonical_path);
        historic.output = run.output.clone();
        historic.status = "delegated".into();
        other_app.store.put("runs", &historic.id, &historic)?;
        std::fs::write(other_root.join(name), bytes)?;
        let imported = import(&other_app, &historic, name)?;
        assert_eq!(
            imported.source.as_ref().unwrap().capture_kind,
            "historical_import"
        );
        assert_eq!(import(&other_app, &historic, name)?.id, imported.id);
        Ok(())
    }

    #[test]
    fn capture_failures_preserve_success_and_foreign_sessions_are_denied() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let (app, mut run) = application(directory.path())?;
        assert!(capture(&app, &mut run)?.is_empty());
        assert_eq!(run.status, "succeeded");
        assert_eq!(run.exit_code, Some(0));
        assert_eq!(run.artifact_errors.len(), 1);
        assert!(
            app.store
                .events(0, 100)?
                .iter()
                .any(|event| event.kind == "artifact.capture_failed")
        );
        let foreign = format!("/home/user/.gemini/antigravity-cli/brain/{}/plan.md", id());
        run.output = format!("[Foreign]({foreign})");
        assert!(
            declared(&run, &foreign)
                .unwrap_err()
                .to_string()
                .contains("different Antigravity native session")
        );
        let mut codex = run.clone();
        codex.profile.harness = Harness::Codex;
        assert!(stored(&app, &codex, "photo.png")?.is_none());
        Ok(())
    }

    #[test]
    fn extracts_documents_that_markdown_actually_links() {
        let markdown = r#"[report](reports/result.md) [nested](<reports/a (b).markdown> "Report")
[old][source] ![image](image.md) ` [secret](inline.md) `
```md
[not a link](fenced.md)
```
<!-- [hidden](comment.md) -->
[source]: /home/user/report.md
[web](https://example.com/report.md)
"#;
        assert_eq!(
            references(markdown),
            vec![
                "/home/user/report.md",
                "reports/a (b).markdown",
                "reports/result.md"
            ]
        );
    }

    #[test]
    fn normalized_paths_reject_scope_and_credential_escapes() -> Result<()> {
        assert_eq!(
            normalize("file:///home/user/result%20plan.md#section")?,
            "/home/user/result plan.md"
        );
        assert_eq!(normalize("reports/./result.md")?, "reports/result.md");
        assert_eq!(
            normalize("file:///C:/Users/owner/report.md")?,
            "C:/Users/owner/report.md"
        );
        assert_eq!(
            normalize("C:\\Users\\owner\\report.md")?,
            "C:/Users/owner/report.md"
        );
        assert_eq!(
            references("[Plan][REPORT]\n\n[report]: plan.md"),
            vec!["plan.md"]
        );
        for reference in [
            "../secret.md",
            "%2e%2e/secret.md",
            "file:///home/user/../secret.md",
            "file:///home/user/%2e%2e/secret.md",
            "file://server/share/result.md",
            "//server/share/result.md",
            ".env/report.md",
            ".git/result.md",
            ".state/result.md",
            "auth.json/result.md",
            "owner.key/result.md",
            "result.md:secret",
            "report%00.md",
        ] {
            assert!(normalize_href(reference).is_err(), "{reference}");
        }
        Ok(())
    }

    #[test]
    fn old_artifact_records_remain_knowledge() -> Result<()> {
        let artifact: Artifact = serde_json::from_value(
            json!({"id":"legacy","group_id":"general","name":"report.md","media_type":"text/plain","size":3,"sha256":"fixture","status":"stored","error":null,"created_at":"2026-01-01"}),
        )?;
        assert!(artifact.in_knowledge);
        assert!(artifact.source.is_none());
        Ok(())
    }

    #[test]
    fn strict_documents_use_regular_contained_paths() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let root = directory.path().canonicalize()?;
        std::fs::write(root.join("report.md"), b"# Report")?;
        assert_eq!(
            no_symlinks(&root, Path::new("report.md"))?,
            root.join("report.md")
        );
        assert!(no_symlinks(&root, Path::new("../report.md")).is_err());
        assert!(no_symlinks(&root, Path::new(".env/report.md")).is_err());
        assert!(checked_bytes(&vec![b'x'; MAX_DOCUMENT_BYTES + 1]).is_err());
        assert!(checked_bytes(&[0xff]).is_err());
        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn symlink_sources_and_export_folders_are_denied() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let (app, mut run) = application(directory.path())?;
        let root = PathBuf::from(&run.profile.workdir.as_ref().unwrap().canonical_path);
        let outside = directory.path().join("outside.md");
        std::fs::write(&outside, b"# Outside")?;
        std::os::unix::fs::symlink(&outside, root.join("report.md"))?;
        assert!(capture(&app, &mut run)?.is_empty());
        assert!(run.artifact_errors[0].error.contains("Symlink"));
        std::os::unix::fs::symlink(directory.path(), root.join("exports"))?;
        assert!(export_parent(&root, Path::new("exports/nested")).is_err());
        assert!(!directory.path().join("nested").exists());
        Ok(())
    }
}
