use anyhow::{Context, Result, ensure};
use axum::{
    body::Body,
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::HashSet, path::PathBuf, time::Duration};

const MAX_PACKAGE: usize = 128 * 1024 * 1024;
const MAX_MANIFEST: usize = 65536;

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PackageFile {
    pub name: String,
    pub sha256: String,
    pub size: u64,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Package {
    pub file: String,
    pub sha256: String,
    pub size: u64,
    pub files: Vec<PackageFile>,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Manifest {
    pub schema: u32,
    pub protocol: u32,
    pub release: String,
    pub platform: String,
    pub package: Package,
}
pub fn platform(value: &str) -> Result<()> {
    ensure!(
        matches!(value, "windows-x64" | "linux-arm64"),
        "No prebuilt worker for this platform; use explicit source installation"
    );
    Ok(())
}
fn hex(value: &str, length: usize) -> bool {
    value.len() == length
        && value
            .bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}
impl Manifest {
    pub fn validate(&self, target: &str) -> Result<()> {
        platform(target)?;
        ensure!(
            self.schema == 1 && self.protocol == 1 && self.platform == target,
            "Incompatible worker manifest"
        );
        ensure!(hex(&self.release, 40), "Invalid worker release identity");
        ensure!(
            self.package.file == format!("worker-{target}.zip"),
            "Invalid worker package path"
        );
        ensure!(
            hex(&self.package.sha256, 64)
                && self.package.size > 0
                && self.package.size <= MAX_PACKAGE as u64,
            "Invalid worker package size/checksum"
        );
        ensure!(
            !self.package.files.is_empty() && self.package.files.len() <= 32,
            "Invalid package file list"
        );
        let executable = if target == "windows-x64" {
            "agentic-enterprise.exe"
        } else {
            "agentic-enterprise"
        };
        let mut names = HashSet::new();
        let mut total = 0u64;
        for file in &self.package.files {
            ensure!(
                file.name == executable || (target == "windows-x64" && file.name.ends_with(".dll")),
                "Unexpected runtime library"
            );
            ensure!(
                !file.name.is_empty()
                    && file
                        .name
                        .bytes()
                        .all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c))
                    && !file.name.contains(".."),
                "Unsafe package filename"
            );
            ensure!(
                names.insert(file.name.to_ascii_lowercase()) && hex(&file.sha256, 64),
                "Duplicate file or invalid checksum"
            );
            total = total
                .checked_add(file.size)
                .context("Package size overflow")?;
        }
        ensure!(
            names.contains(executable) && total <= 768 * 1024 * 1024,
            "Package executable missing or expansion too large"
        );
        Ok(())
    }
}

enum Source {
    Directory(PathBuf),
    Remote(url::Url),
}
fn source() -> Result<Source> {
    if let Ok(path) = std::env::var("AE_WORKER_PACKAGE_DIR") {
        let root = PathBuf::from(path)
            .canonicalize()
            .context("Worker package directory unavailable")?;
        ensure!(root.is_dir(), "Worker package directory is not a directory");
        return Ok(Source::Directory(root));
    }
    let url = url::Url::parse(
        &std::env::var("AE_WORKER_PACKAGE_URL")
            .context("Worker packages are not configured on this controller")?,
    )?;
    ensure!(
        url.scheme() == "https"
            && url.host_str().is_some()
            && url.username().is_empty()
            && url.password().is_none()
            && url.query().is_none()
            && url.fragment().is_none()
            && url.path().ends_with('/'),
        "Worker package URL must be a trusted HTTPS directory without credentials/query"
    );
    Ok(Source::Remote(url))
}
async fn read(source: &Source, name: &str, max: usize) -> Result<Vec<u8>> {
    match source {
        Source::Directory(root) => {
            let path = root.join(name).canonicalize()?;
            ensure!(
                path.starts_with(root) && path.is_file(),
                "Package path leaves release directory"
            );
            ensure!(
                tokio::fs::metadata(&path).await?.len() <= max as u64,
                "Package exceeds size limit"
            );
            let bytes = tokio::fs::read(path).await?;
            ensure!(bytes.len() <= max, "Package exceeds size limit");
            Ok(bytes)
        }
        Source::Remote(root) => {
            let client = reqwest::Client::builder()
                .timeout(Duration::from_secs(120))
                .redirect(reqwest::redirect::Policy::none())
                .build()?;
            let mut request = client.get(root.join(name)?);
            if let Ok(path) = std::env::var("AE_WORKER_PACKAGE_TOKEN_FILE") {
                let token = tokio::fs::read_to_string(path)
                    .await
                    .context("Cannot read package-source credential")?;
                request = request.header("PRIVATE-TOKEN", token.trim());
            }
            // Do not propagate upstream errors/URLs/headers to the worker.
            let mut response = request
                .send()
                .await
                .map_err(|_| anyhow::anyhow!("Package source unreachable"))?;
            ensure!(
                response.status().is_success(),
                "Package source rejected the request"
            );
            ensure!(
                response.content_length().is_none_or(|n| n <= max as u64),
                "Package exceeds size limit"
            );
            let mut bytes = Vec::new();
            while let Some(chunk) = response
                .chunk()
                .await
                .map_err(|_| anyhow::anyhow!("Package download interrupted"))?
            {
                ensure!(
                    bytes.len().saturating_add(chunk.len()) <= max,
                    "Package exceeds size limit"
                );
                bytes.extend_from_slice(&chunk);
            }
            Ok(bytes)
        }
    }
}
async fn manifest(source: &Source, target: &str) -> Result<Manifest> {
    let bytes = read(source, &format!("{target}.json"), MAX_MANIFEST).await?;
    let manifest: Manifest = serde_json::from_slice(&bytes).context("Invalid release manifest")?;
    manifest.validate(target)?;
    Ok(manifest)
}
pub async fn response(target: &str, archive: bool) -> Result<Response> {
    platform(target)?;
    let source = source()?;
    // Both supported packages must have passed release verification before serving either.
    let windows = manifest(&source, "windows-x64").await?;
    let linux = manifest(&source, "linux-arm64").await?;
    ensure!(
        windows.release == linux.release,
        "Worker release inventory is incomplete"
    );
    let selected = if target == "windows-x64" {
        windows
    } else {
        linux
    };
    if !archive {
        return Ok(axum::Json(selected).into_response());
    }
    let bytes = read(&source, &selected.package.file, MAX_PACKAGE).await?;
    ensure!(
        bytes.len() as u64 == selected.package.size
            && format!("{:x}", Sha256::digest(&bytes)) == selected.package.sha256,
        "Worker package checksum mismatch"
    );
    Ok((
        StatusCode::OK,
        [(header::CONTENT_TYPE, "application/zip")],
        Body::from(bytes),
    )
        .into_response())
}

pub fn bootstrap(target: &str) -> Result<Response> {
    platform(target)?;
    let text = if target == "windows-x64" {
        include_str!("../../scripts/setup-worker.ps1")
    } else {
        include_str!("../../scripts/setup-worker.sh")
    };
    let filename = if target == "windows-x64" {
        "setup-worker.ps1"
    } else {
        "setup-worker.sh"
    };
    Ok((
        [
            (header::CONTENT_TYPE, "text/plain; charset=utf-8"),
            (
                header::CONTENT_DISPOSITION,
                &format!("attachment; filename=\"{filename}\""),
            ),
        ],
        text,
    )
        .into_response())
}
