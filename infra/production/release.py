#!/usr/bin/env python3
"""Promote a verified registry digest through the fixed production installation."""
from __future__ import annotations

import fcntl
from contextlib import closing
import hashlib
from http.client import HTTPMessage, IncompleteRead, RemoteDisconnected
from http.cookies import SimpleCookie
import json
import os
from pathlib import Path
import re
import shutil
import signal
import sqlite3
import subprocess
import sys
import time
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener
import uuid


ROOT = Path("/opt/personal-agentic")
ENV_FILE = ROOT / "production.env"
COMPOSE = ROOT / "compose.yaml"
RELEASES = ROOT / "releases"
REPOSITORY = "registry.tugasakhir.space/rizkyyanuark/personal-agentic/platform"
PROJECT = "personal-agentic-prod"
VOLUMES = tuple(PROJECT + "_" + name for name in ("platform-data", "matrix-data", "platform-workdir"))
LEGACY_RUNTIME_WORKDIR = "/home/ubuntu/workspace/production"
HOST = "agent.tugasakhir.space"
BASE = "http://127.0.0.1:18766"
ACTIVE = ("queued", "starting", "running", "waiting")
DIGEST = re.compile(r"sha256:[0-9a-f]{64}\Z")
COMMIT = re.compile(r"[0-9a-f]{40}\Z")
SHA = re.compile(r"[0-9a-f]{64}\Z")
COMMAND_ENV = {"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "HOME": "/root", "LANG": "C.UTF-8"}
STAGE = "request"


class ReleaseError(RuntimeError):
    def __init__(self, message: str, *, category: str = "guard", operation: str | None = None,
                 returncode: int | None = None, private_stderr: bytes = b"", secondary: Exception | None = None) -> None:
        super().__init__(message)
        self.category = category
        self.operation = operation
        self.returncode = returncode
        self.private_stderr = private_stderr
        self.secondary = secondary


def require(condition: bool, message: str, *, category: str = "guard") -> None:
    if not condition:
        raise ReleaseError(message, category=category)


def command(arguments: list[str], timeout: int = 180, *, operation: str = "command", output: Path | None = None) -> bytes:
    try:
        if output is None:
            result = subprocess.run(arguments, capture_output=True, check=False, timeout=timeout, env=COMMAND_ENV)
        else:
            descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "wb") as destination:
                result = subprocess.run(arguments, stdout=destination, stderr=subprocess.PIPE,
                                        check=False, timeout=timeout, env=COMMAND_ENV)
                destination.flush()
                os.fsync(destination.fileno())
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ReleaseError("Production command unavailable or timed out", category="command_unavailable",
                           operation=operation) from error
    if result.returncode != 0:
        raise ReleaseError("Production command failed", category="command_failed", operation=operation,
                           returncode=result.returncode, private_stderr=result.stderr[-16384:])
    return result.stdout or b""


def docker(*arguments: str, timeout: int = 180, output: Path | None = None) -> bytes:
    operation = "compose-" + arguments[9] if arguments[0] == "compose" else "docker-" + "-".join(arguments[:2])
    return command(["/usr/bin/docker", "--host", "unix:///var/run/docker.sock",
                    "--config", str(ROOT / "registry-auth"), *arguments], timeout, operation=operation, output=output)


def compose(*arguments: str, timeout: int = 180) -> bytes:
    return docker("compose", "--project-directory", str(ROOT), "--project-name", PROJECT,
                  "--env-file", str(ENV_FILE), "-f", str(COMPOSE), *arguments, timeout=timeout)


def protected(path: Path, private: bool = False) -> None:
    info = path.lstat()
    require(not path.is_symlink() and info.st_uid == 0, "Installation path must be root-owned and not a symlink")
    mask = 0o077 if private else 0o022
    require(not info.st_mode & mask, "Installation permissions are too broad")


def atomic(path: Path, data: bytes) -> None:
    temporary = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "wb") as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        temporary.unlink(missing_ok=True)


def save(path: Path, value: object) -> None:
    atomic(path, (json.dumps(value, indent=2) + "\n").encode())


def read_record(path: Path) -> dict[str, object] | None:
    if not path.exists():
        return None
    protected(path, private=True)
    value = json.loads(path.read_text())
    require(isinstance(value, dict), "Release record is invalid")
    return value


def image_reference() -> str:
    text = ENV_FILE.read_text()
    values = re.findall(r"^AE_PLATFORM_IMAGE=(.*)$", text, re.MULTILINE)
    require(len(values) == 1, "production.env must contain one unquoted AE_PLATFORM_IMAGE")
    image = values[0].strip()
    require(image.startswith(REPOSITORY + "@") and bool(DIGEST.fullmatch(image.split("@", 1)[1])),
            "Production image must use the fixed repository and a SHA256 digest")
    return image


def set_image(image: str) -> None:
    text = ENV_FILE.read_text()
    changed, count = re.subn(r"^AE_PLATFORM_IMAGE=.*$", "AE_PLATFORM_IMAGE=" + image, text, flags=re.MULTILINE)
    require(count == 1, "Production image setting is ambiguous")
    atomic(ENV_FILE, changed.encode())


def inspect_image(image: str, expected_commit: str | None = None) -> str:
    metadata = json.loads(docker("image", "inspect", image))[0]
    require(metadata.get("Architecture") == "arm64" and metadata.get("Os") == "linux",
            "Production image must be Linux ARM64")
    labels = metadata.get("Config", {}).get("Labels") or {}
    revision = labels.get("org.opencontainers.image.revision", "")
    require(isinstance(revision, str) and bool(COMMIT.fullmatch(revision)), "Image lacks a full commit revision label")
    require(expected_commit is None or revision == expected_commit, "Image revision does not match the requested commit")
    require(image in metadata.get("RepoDigests", []), "Image digest was not resolved by the registry")
    return revision


def volume_paths() -> dict[str, Path]:
    volumes = json.loads(docker("volume", "inspect", *VOLUMES))
    require(len(volumes) == len(VOLUMES), "Production volumes are incomplete")
    paths = {}
    for volume in volumes:
        require(volume.get("Name") in VOLUMES and volume.get("Driver") == "local", "Unexpected production volume")
        path = Path(volume["Mountpoint"])
        require(path.is_absolute() and path.is_dir() and not path.is_symlink(), "Production volume mountpoint is invalid")
        paths[volume["Name"]] = path.resolve()
    return paths


def selected_runtime_key() -> Path:
    config = json.loads(compose("config", "--format", "json"))
    mounts = config.get("services", {}).get("platform", {}).get("volumes", [])
    values = [mount.get("source") for mount in mounts if mount.get("target") == "/run/ae-ssh/id_ed25519"]
    require(len(values) == 1 and isinstance(values[0], str),
            "Preflight failed: selected runtime SSH key is ambiguous", category="runtime_key")
    path = Path(values[0])
    require(path.is_absolute() and path.is_relative_to(ROOT / "runtime-ssh") and path.resolve() == path,
            "Preflight failed: selected runtime SSH key is redirected", category="runtime_key")
    return path


def preflight(paths: dict[str, Path], *, root: Path | None = None, identity: Path | None = None, home_bytes: int = 0) -> None:
    target_root = ROOT if root is None else root
    for volume in VOLUMES:
        require(volume in paths, "Preflight failed: required production volume is missing: " + volume, category="backup_volume")
        path = paths[volume]
        require(path.is_absolute() and path.is_dir() and not path.is_symlink(),
                "Preflight failed: volume mountpoint is invalid: " + volume, category="backup_volume")
    runtime_key = identity if identity is not None else target_root / "runtime-ssh" / "id_ed25519"
    require(runtime_key.is_file() and not runtime_key.is_symlink() and not runtime_key.parent.is_symlink(),
            "Preflight failed: runtime SSH key is unavailable", category="runtime_key")
    key_info = runtime_key.stat()
    require(key_info.st_uid == 10001 and (key_info.st_mode & 0o7777) in (0o400, 0o600),
            "Preflight failed: runtime SSH key must belong to UID 10001 with mode 0400 or 0600", category="runtime_key")
    size = 0
    def traversal_error(error: OSError) -> None:
        raise ReleaseError("Preflight failed: backup source is unreadable", category="backup_volume") from error
    for source in paths.values():
        for directory, _folders, files in os.walk(source, followlinks=False, onerror=traversal_error):
            for name in files:
                path = Path(directory) / name
                if not path.is_symlink():
                    size += path.stat().st_size
    size += key_info.st_size + home_bytes
    require(shutil.disk_usage(target_root).free >= size + 512 * 1024 * 1024,
            "Preflight failed: insufficient disk space for production state backup", category="backup_space")



def databases(paths: dict[str, Path]) -> dict[str, Path]:
    root = paths[VOLUMES[0]]
    result = {}
    for path in root.rglob("app.sqlite3"):
        require(path.resolve().is_relative_to(root) and not path.is_symlink(), "Application database escapes its volume")
        result[str(path.relative_to(root))] = path
    require(bool(result), "Production application database is missing; bootstrap first")
    return result


def database_state(paths: dict[str, Path]) -> tuple[int, dict[str, str]]:
    active = 0
    fingerprints = {}
    application = databases(paths)
    for path in application.values():
        with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=10)) as connection:
            tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            require({"runs", "terminal_runs", "artifacts"}.issubset(tables), "Application database schema is unexpected")
            placeholders = ",".join("?" for _ in ACTIVE)
            active += connection.execute(
                f"SELECT COUNT(*) FROM runs WHERE json_extract(data,'$.status') IN ({placeholders})", ACTIVE).fetchone()[0]
            active += connection.execute(
                "SELECT COUNT(*) FROM terminal_runs WHERE json_extract(data,'$.status') IN ('running','queued','starting')").fetchone()[0]
            active += connection.execute(
                "SELECT COUNT(*) FROM artifacts WHERE json_extract(data,'$.status')='indexing'").fetchone()[0]
    state_root = paths[VOLUMES[0]]
    schema_paths = {VOLUMES[0] + "/" + str(path.relative_to(state_root)): path
                    for path in state_root.rglob("*.sqlite3") if path.parent.name == ".state"}
    require(any(path.name == "platform.sqlite3" for path in schema_paths.values()),
            "Production identity database is missing; bootstrap first")
    matrix_database = paths[VOLUMES[1]] / "homeserver.db"
    require(matrix_database.is_file(), "Production Matrix database is missing; bootstrap first")
    schema_paths[VOLUMES[1] + "/homeserver.db"] = matrix_database
    for name, path in schema_paths.items():
        volume_root = paths[VOLUMES[1]] if name.startswith(VOLUMES[1] + "/") else state_root
        require(path.resolve().is_relative_to(volume_root) and not path.is_symlink(),
                "Production database escapes its volume")
        with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=10)) as connection:
            schema = list(connection.execute("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name"))
            version = connection.execute("PRAGMA user_version").fetchone()[0]
            tables = {row[1] for row in schema if row[0] == "table"}
            markers = {}
            if "metadata" in tables:
                markers["metadata"] = list(connection.execute("SELECT key,value FROM metadata WHERE key='schema_version'"))
            if "schema_version" in tables:
                markers["schema_version"] = list(connection.execute("SELECT * FROM schema_version"))
            fingerprints[name] = hashlib.sha256(json.dumps([schema, version, markers]).encode()).hexdigest()
    return active, fingerprints


class LocalOnlyRedirects(HTTPRedirectHandler):
    def redirect_request(self, req: Request, fp: object, code: int, msg: str,
                         headers: HTTPMessage, newurl: str) -> None:
        raise ReleaseError("Unexpected redirect from the local application")


def request(route: str, token: str | None = None, body: object = None,
            expected: int = 200, session: str | None = None, *, timeout: float = 15,
            base: str = BASE) -> tuple[bytes, HTTPMessage]:
    headers = {"Host": HOST}
    if token is not None:
        headers["Authorization"] = "Bearer " + token
    if session is not None:
        headers["Cookie"] = "ae_session=" + session
    data = None if body is None else json.dumps(body).encode()
    if data is not None:
        headers["Content-Type"] = "application/json"
    operation = Request(base + route, data=data, headers=headers)
    try:
        response = build_opener(ProxyHandler({}), LocalOnlyRedirects()).open(operation, timeout=timeout)
    except HTTPError as error:
        response = error
    try:
        require(response.status == expected, "Application endpoint failed: " + route + " HTTP " + str(response.status))
        content = response.read(32 * 1024 * 1024 + 1)
        require(len(content) <= 32 * 1024 * 1024, "Application response exceeds the smoke-test limit")
        return content, response.headers
    finally:
        response.close()


def wait_ready(*, timeout: float = 90, interval: float = 2, base: str = BASE) -> None:
    require(0 < timeout <= 90 and 0 < interval <= 2, "Readiness timing is invalid")
    deadline = time.monotonic() + timeout
    previous_handler = signal.getsignal(signal.SIGALRM)
    require(signal.getitimer(signal.ITIMER_REAL) == (0, 0), "Readiness cannot overlap another deadline")

    def expired(_number: int, _frame: object) -> None:
        raise TimeoutError("Readiness deadline expired")

    signal.signal(signal.SIGALRM, expired)
    try:
        signal.setitimer(signal.ITIMER_REAL, timeout)
        while time.monotonic() < deadline:
            try:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                health = json.loads(request("/api/health", timeout=min(15, remaining), base=base)[0])
                require(isinstance(health, dict), "Application health payload is invalid")
                require(health.get("status") == "ok", "Application health payload is invalid")
                if time.monotonic() < deadline:
                    return
                break
            except (ReleaseError, URLError, TimeoutError, ConnectionError,
                    RemoteDisconnected, IncompleteRead, json.JSONDecodeError):
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                time.sleep(min(interval, remaining))
    except TimeoutError:
        pass
    finally:
        try:
            signal.setitimer(signal.ITIMER_REAL, 0)
        except TimeoutError:
            signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous_handler)
    raise ReleaseError("Production controller did not become ready within the startup budget")


def source_restart_guard(current: dict[str, object] | None, previous: dict[str, object] | None,
                         pending: dict[str, object] | None, image: str, commit: str,
                         active: int, schema: dict[str, str], latest_schema: dict[str, str],
                         *, directory: Path = RELEASES, configured_image: str) -> None:
    require(current is not None and current.get("status") == "verified"
            and current.get("image") == image and current.get("commit") == commit
            and isinstance(current.get("svg_sha256"), str) and bool(SHA.fullmatch(current["svg_sha256"])),
            "Source restart requires the unchanged verified release")
    require(pending is None and configured_image == image and active == 0 and latest_schema == schema
            and read_record(directory / "current.json") == current
            and read_record(directory / "previous.json") == previous
            and read_record(directory / "pending.json") is None,
            "Source restart identity, schema or release journal changed")


def smoke(svg_sha256: str | None) -> dict[str, object]:
    wait_ready()
    token = compose("exec", "-T", "platform", "cat", "/data/org/.state/owner.key").decode().strip()
    require(bool(token) and len(token) < 1024, "Production owner credential is unavailable")
    request("/api/state", expected=401)
    request("/api/cockpit/state", expected=401)
    request("/api/login", body={"token": "invalid-production-smoke-key"}, expected=401)
    login, headers = request("/api/login", body={"token": token})
    identity = json.loads(login)
    require(identity.get("ok") is True and identity.get("user") == "owner", "Owner login failed")
    cookies = SimpleCookie()
    cookies.load(headers.get("Set-Cookie", ""))
    cookie = cookies.get("ae_session")
    require(cookie is not None and bool(cookie.value) and cookie["httponly"]
            and cookie["secure"] and cookie["samesite"] == "Strict", "Owner login cookie is invalid")
    session = cookie.value
    try:
        require(json.loads(request("/api/me", session=session)[0]).get("user") == "owner",
                "Authenticated identity is not the owner")
        state_view = json.loads(request("/api/state", session=session)[0])
        require(all(isinstance(state_view.get(key), list) for key in ("agents", "groups", "runs")), "Authenticated application state is invalid")
        cockpit = json.loads(request("/api/cockpit/state", session=session)[0])
        require(cockpit.get("schema_version") == 1 and cockpit.get("workspace_id") == "default"
                and isinstance(cockpit.get("agents"), list) and isinstance(cockpit.get("totals"), dict),
                "Authenticated cockpit state is invalid")
    finally:
        request("/api/logout", session=session, body={})
    request("/api/state", session=session, expected=401)
    page, page_headers = request("/")
    require("text/html" in page_headers.get("Content-Type", "") and b"<!doctype html>" in page.lower(), "Application UI is unavailable")
    svg = request("/harnesses/antigravity.svg")[0]
    actual = hashlib.sha256(svg).hexdigest()
    require(svg_sha256 is None or actual == svg_sha256, "Served Antigravity asset does not match the tested image")
    return {"health": 200, "anonymous_state": 401, "invalid_login": 401, "owner_login": 200,
            "authenticated_state": 200, "cockpit": 200, "logout_revocation": 401,
            "ui": 200, "svg_sha256": actual}


def release_identity(value: dict[str, object]) -> tuple[object, object, object]:
    return value.get("image"), value.get("commit"), value.get("svg_sha256")


def recovery_record(incoming: dict[str, object], current: dict[str, object] | None,
                    previous: dict[str, object] | None,
                    pending: dict[str, object] | None) -> dict[str, object] | None:
    target = REPOSITORY + "@" + str(incoming["digest"])
    identity = (target, incoming["commit"], incoming["svg_sha256"])
    require(current is not None and current.get("status") == "verified", "A verified current release is required for recovery")
    if pending is None:
        require(release_identity(current) == identity, "Recovery does not match the verified current release")
        return None
    require(pending.get("action") == "promote" and pending.get("status") in (None, "failed", "verified"),
            "Only a pending promotion can be recovered")
    require(release_identity(pending) == identity, "Recovery identity does not match the pending release")
    former = pending.get("previous")
    require(isinstance(former, dict) and former.get("status") == "verified", "Recovery requires a verified predecessor")
    require(isinstance(former.get("image"), str) and former["image"].startswith(REPOSITORY + "@")
            and bool(DIGEST.fullmatch(former["image"].split("@", 1)[1]))
            and isinstance(former.get("commit"), str) and bool(COMMIT.fullmatch(former["commit"]))
            and isinstance(former.get("svg_sha256"), str) and bool(SHA.fullmatch(former["svg_sha256"])),
            "Recovery predecessor identity is invalid")
    require(release_identity(former) != identity, "Recovery predecessor must be a different release")
    require(isinstance(pending.get("backup"), str) and former.get("backup") == pending.get("backup")
            and isinstance(pending.get("schema_before"), dict) and bool(pending["schema_before"]),
            "Recovery backup or schema record is incomplete")
    if release_identity(current) == identity:
        require(pending.get("status") == "verified" and all(current.get(key) == pending.get(key)
                for key in ("action", "backup", "schema_before", "previous", "verified_at", "smoke")),
                "Current release belongs to a different transaction")
        require(previous == former, "Finalized predecessor record does not match the pending transaction")
    else:
        require(release_identity(current) == release_identity(former), "Current release is not the pending predecessor")
        require(previous is None or previous.get("status") == "verified", "Previous release record is invalid")
        if previous is not None and release_identity(previous) == release_identity(former):
            require(previous == former, "Partially finalized predecessor record is inconsistent")
    return pending


def verify_recovery_backup(transaction: dict[str, object], *, root: Path = ROOT) -> dict[str, str]:
    value = transaction.get("backup")
    require(isinstance(value, str), "Recovery backup path is missing")
    directory = Path(value)
    backups = root / "backups"
    protected(backups, private=True)
    require(directory.is_absolute() and directory.parent == backups
            and directory.resolve() == directory, "Recovery backup path escapes the fixed backup directory")
    protected(directory, private=True)
    manifest = read_record(directory / "manifest.json")
    former = transaction.get("previous")
    require(isinstance(manifest, dict) and isinstance(former, dict), "Recovery backup manifest is missing")
    hashes = manifest.get("archives")
    expected = {volume + ".tar.gz" for volume in VOLUMES}
    if manifest.get("format") is None:
        expected.add("runtime-workdirs.tar.gz")
        require(manifest.get("runtime_workdir") == LEGACY_RUNTIME_WORKDIR,
                "Recovery legacy runtime archive source is unsupported")
    else:
        require(type(manifest.get("format")) is int and manifest["format"] == 2,
                "Recovery backup format is unsupported")
        expected.add("platform-home.tar")
    require(isinstance(hashes, dict) and set(hashes) == expected
            and manifest.get("image") == former.get("image")
            and manifest.get("schema") == transaction.get("schema_before"), "Recovery backup manifest does not match the transaction")
    verified = {}
    for name in sorted(expected):
        expected_hash = hashes[name]
        require(isinstance(expected_hash, str) and bool(SHA.fullmatch(expected_hash)), "Recovery archive hash is invalid")
        archive = directory / name
        protected(archive, private=True)
        require(archive.is_file(), "Recovery archive is unavailable")
        digest = hashlib.sha256()
        with archive.open("rb") as content:
            for chunk in iter(lambda: content.read(1024 * 1024), b""):
                digest.update(chunk)
        require(digest.hexdigest() == expected_hash, "Recovery archive integrity check failed")
        verified[name] = expected_hash
    for name in ("production.env", "compose.yaml", "runtime-ssh-id_ed25519"):
        protected(directory / name, private=True)
        require((directory / name).is_file(), "Recovery private backup file is unavailable")
    if manifest.get("format") == 2:
        files = manifest.get("files")
        require(isinstance(files, dict) and set(files) == {"production.env", "compose.yaml", "runtime-ssh-id_ed25519"},
                "Recovery private file manifest is invalid")
        for name, digest in files.items():
            require(isinstance(digest, str) and bool(SHA.fullmatch(digest))
                    and hashlib.sha256((directory / name).read_bytes()).hexdigest() == digest,
                    "Recovery private file integrity check failed")
    return verified


def verify_running_candidate(image: str, commit: str) -> None:
    inspect_image(image, commit)
    metadata = json.loads(docker("image", "inspect", image))[0]
    containers = json.loads(docker("inspect", PROJECT + "-platform-1", PROJECT + "-matrix-1"))
    require(len(containers) == 2 and all(value.get("State", {}).get("Running")
            and not value.get("State", {}).get("OOMKilled") for value in containers), "Recovery requires running services without OOM")
    platform = containers[0]
    require(platform.get("Config", {}).get("Image") == image and platform.get("Image") == metadata.get("Id")
            and (platform.get("Config", {}).get("Labels") or {}).get("org.opencontainers.image.revision") == commit,
            "Running platform does not match the recovery candidate")


def finalize_release(transaction: dict[str, object], proof: dict[str, object], *, directory: Path = RELEASES) -> dict[str, object]:
    protected(directory, private=True)
    former = transaction.get("previous")
    require(former is None or isinstance(former, dict), "Previous release record is invalid")
    failed_record = None
    if transaction.get("status") == "failed":
        fingerprint = hashlib.sha256(json.dumps(transaction, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        failed_record = directory / ("failed-" + fingerprint + ".json")
        if failed_record.exists():
            require(read_record(failed_record) == transaction, "Failed release audit record conflicts with the transaction")
        else:
            save(failed_record, transaction)
    verified = dict(transaction)
    verified.pop("error", None)
    if transaction.get("status") == "verified":
        require(isinstance(transaction.get("verified_at"), str) and bool(transaction["verified_at"])
                and isinstance(transaction.get("smoke"), dict)
                and transaction.get("svg_sha256") == proof["svg_sha256"],
                "Verified pending evidence is incomplete")
    else:
        verified.update(status="verified", verified_at=datetime.now(timezone.utc).isoformat(),
                        svg_sha256=proof["svg_sha256"], smoke=proof)
    if failed_record is not None:
        verified["failed_record"] = str(failed_record)
    save(directory / "pending.json", verified)
    if former is not None:
        save(directory / "previous.json", former)
    save(directory / "current.json", verified)
    (directory / "pending.json").unlink()
    descriptor = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    return verified


def recover(incoming: dict[str, object], current_image: str, paths: dict[str, Path],
            current: dict[str, object] | None, previous: dict[str, object] | None,
            pending: dict[str, object] | None, schema: dict[str, str]) -> dict[str, object]:
    transaction = recovery_record(incoming, current, previous, pending)
    target = REPOSITORY + "@" + str(incoming["digest"])
    commit, svg = str(incoming["commit"]), str(incoming["svg_sha256"])
    require(current_image == target, "Configured image differs from the recovery request")
    verify_running_candidate(target, commit)
    archive_hashes = {}
    if transaction is not None:
        require(schema == transaction.get("schema_before"), "Database schema changed since the failed release")
        archive_hashes = verify_recovery_backup(transaction, root=ROOT)
    proof = smoke(svg)
    active, latest_schema = database_state(paths)
    require(active == 0 and latest_schema == schema, "Production state changed during recovery verification")
    require(image_reference() == target, "Configured image changed during recovery verification")
    verify_running_candidate(target, commit)
    require(read_record(RELEASES / "current.json") == current and read_record(RELEASES / "previous.json") == previous
            and read_record(RELEASES / "pending.json") == pending, "Release journal changed during recovery verification")
    if transaction is None:
        return {"action": "recover", "unchanged": True, "image": target, "commit": commit, "smoke": proof}
    verified = finalize_release(transaction, proof, directory=RELEASES)
    return {"action": "recover", "release": verified, "backup_archive_hashes": archive_hashes,
            "services_restarted": False, "database_restored": False}


def backup(paths: dict[str, Path], image: str, schema: dict[str, str], *, identity: Path, home_bytes: int) -> Path:
    preflight(paths, identity=identity, home_bytes=home_bytes)
    directory = ROOT / "backups" / (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8])
    directory.parent.mkdir(mode=0o700, exist_ok=True)
    protected(directory.parent, private=True)
    directory.mkdir(mode=0o700)
    manifest = {"format": 2, "image": image, "schema": schema, "archives": {}}
    archives = [(volume + ".tar.gz", "type=volume,source=" + volume + ",target=/source,readonly") for volume in VOLUMES]
    for archive, source in archives:
        docker("run", "--rm", "--network", "none", "--read-only", "--user", "0:0",
               "--cpus", "0.5", "--memory", "128m", "--memory-swap", "256m", "--pids-limit", "64",
               "--entrypoint", "/bin/tar", "--mount", source,
               "--mount", "type=bind,source=" + str(directory) + ",target=/backup", image,
               "-czf", "/backup/" + archive, "-C", "/source", ".", timeout=600)
        path = directory / archive
        os.chmod(path, 0o600)
        digest = hashlib.sha256()
        with path.open("rb") as content:
            for chunk in iter(lambda: content.read(1024 * 1024), b""):
                digest.update(chunk)
        manifest["archives"][archive] = digest.hexdigest()
    home_archive = directory / "platform-home.tar"
    docker("cp", PROJECT + "-platform-1:/home/agent/.", "-", output=home_archive, timeout=600)
    digest = hashlib.sha256()
    with home_archive.open("rb") as content:
        for chunk in iter(lambda: content.read(1024 * 1024), b""):
            digest.update(chunk)
    manifest["archives"][home_archive.name] = digest.hexdigest()
    atomic(directory / "production.env", ENV_FILE.read_bytes())
    atomic(directory / "compose.yaml", COMPOSE.read_bytes())
    runtime_key = identity
    require(runtime_key.is_file() and not runtime_key.is_symlink(), "The selected production runtime key is unavailable")
    atomic(directory / "runtime-ssh-id_ed25519", runtime_key.read_bytes())
    manifest["files"] = {name: hashlib.sha256((directory / name).read_bytes()).hexdigest()
                         for name in ("production.env", "compose.yaml", "runtime-ssh-id_ed25519")}
    manifest["identity_key"] = "runtime-ssh-id_ed25519"
    manifest["excluded"] = "External project sources and provider authentication on external runtimes"
    save(directory / "manifest.json", manifest)
    return directory


def parse_request(raw: bytes) -> dict[str, object]:
    def unique_fields(pairs: list[tuple[str, object]]) -> dict[str, object]:
        result = {}
        for name, field in pairs:
            require(name not in result, "Release request contains duplicate fields")
            result[name] = field
        return result
    require(len(raw) <= 8192, "Release request exceeds 8 KiB")
    value = json.loads(raw, object_pairs_hook=unique_fields)
    require(isinstance(value, dict), "Release request must be a JSON object")
    action = value.get("action")
    allowed = {"promote": {"action", "digest", "commit", "svg_sha256"},
               "recover": {"action", "digest", "commit", "svg_sha256"},
               "rollback": {"action", "acknowledge_database_risk"}, "status": {"action"}}
    require(isinstance(action, str) and action in allowed and set(value).issubset(allowed[action]), "Release action or fields are unsupported")
    if action in ("promote", "recover"):
        require(isinstance(value.get("digest"), str) and bool(DIGEST.fullmatch(value["digest"])), "Invalid image digest")
        require(isinstance(value.get("commit"), str) and bool(COMMIT.fullmatch(value["commit"])), "Invalid full commit SHA")
        require("svg_sha256" not in value or isinstance(value["svg_sha256"], str) and bool(SHA.fullmatch(value["svg_sha256"])), "Invalid SVG hash")
        require(action != "recover" or "svg_sha256" in value, "Recovery requires an explicit source SVG hash")
    if action == "rollback":
        require(value.get("acknowledge_database_risk") is True, "Rollback requires explicit acknowledgement of database compatibility risk")
    return value


def input_request() -> dict[str, object]:
    require(len(sys.argv) == 1, "Release helper accepts typed JSON on stdin, without command arguments")
    def input_timeout(_number: int, _frame: object) -> None:
        raise ReleaseError("Release input did not finish within 30 seconds")
    signal.signal(signal.SIGALRM, input_timeout)
    signal.alarm(30)
    try:
        raw = sys.stdin.buffer.read(8193)
    finally:
        signal.alarm(0)
    return parse_request(raw)


def main() -> dict[str, object]:
    global STAGE
    STAGE = "request"
    incoming = input_request()
    require(os.geteuid() == 0, "Release helper must run through the restricted root command")
    protected(ROOT, private=True)
    protected(ENV_FILE, private=True)
    protected(COMPOSE)
    protected(ROOT / "registry-auth", private=True)
    protected(ROOT / "registry-auth" / "config.json", private=True)
    RELEASES.mkdir(mode=0o700, exist_ok=True)
    protected(RELEASES, private=True)
    with (ROOT / "release.lock").open("a") as lock:
        os.chmod(lock.name, 0o600)
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ReleaseError("Another production release is in progress") from None
        STAGE = "inventory"
        current_image = image_reference()
        paths = volume_paths()
        active, schema = database_state(paths)
        current = read_record(RELEASES / "current.json")
        previous = read_record(RELEASES / "previous.json")
        pending = read_record(RELEASES / "pending.json")
        if incoming["action"] == "status":
            return {"action": "status", "image": current_image, "active_operations": active,
                    "current": current, "previous": previous, "pending": pending, "smoke": smoke(None)}
        require(active == 0, "Production has active, queued or waiting runs, terminal commands, or indexing; release refused")
        if incoming["action"] == "recover":
            STAGE = "recovery"
            return recover(incoming, current_image, paths, current, previous, pending, schema)
        require(incoming["action"] == "rollback" or pending is None,
                "A previous release is incomplete; resolve its pending record before another promotion")
        if incoming["action"] == "rollback":
            source = pending if pending is not None else current
            candidate = pending.get("previous") if pending is not None else previous
            require(isinstance(source, dict) and isinstance(candidate, dict), "No recorded previous release is available")
            require(candidate.get("status") == "verified", "The recorded previous image was not healthy; rollback refused")
            require(schema == source.get("schema_before"), "Database schema changed since the previous image; rollback requires manual compatibility review")
            target = candidate["image"]
            expected_commit = candidate["commit"]
            svg_hash = candidate.get("svg_sha256")
        else:
            target = REPOSITORY + "@" + incoming["digest"]
            expected_commit = incoming["commit"]
            svg_hash = incoming.get("svg_sha256")
        require(isinstance(target, str) and target.startswith(REPOSITORY + "@") and bool(DIGEST.fullmatch(target.split("@", 1)[1])), "Recorded release image is invalid")
        STAGE = "preflight"
        identity = None
        home_bytes = 0
        if target != current_image or current is None or pending is not None:
            identity = selected_runtime_key()
            preflight(paths, identity=identity)
            usage = docker("exec", PROJECT + "-platform-1", "du", "-sb", "/home/agent").split(maxsplit=1)
            require(bool(usage) and usage[0].isdigit(), "Preflight failed: controller home size is unavailable", category="backup_volume")
            home_bytes = int(usage[0])
            preflight(paths, identity=identity, home_bytes=home_bytes)
        STAGE = "image-preparation"
        docker("pull", target, timeout=600)
        revision = inspect_image(target, expected_commit)
        previous_revision = inspect_image(current_image)
        verify_running_candidate(current_image, previous_revision)
        if incoming["action"] == "rollback" and pending is not None:
            before_smoke = {"svg_sha256": pending.get("svg_sha256")}
        else:
            before_smoke = smoke(None)
        if target == current_image and current is not None and pending is None:
            return {"action": incoming["action"], "unchanged": True, "image": target,
                    "commit": revision, "smoke": smoke(svg_hash)}
        active, latest_schema = database_state(paths)
        require(active == 0 and latest_schema == schema, "Production state changed during image preparation; release refused")
        require(image_reference() == current_image
                and read_record(RELEASES / "current.json") == current
                and read_record(RELEASES / "previous.json") == previous
                and read_record(RELEASES / "pending.json") == pending,
                "Production release identity changed during image preparation")
        STAGE = "preflight"
        require(identity is not None, "Backup identity is unavailable")
        preflight(paths, identity=identity, home_bytes=home_bytes)
        try:
            STAGE = "stop"
            compose("stop", "--timeout", "30", "platform", "matrix")
            active, stopped_schema = database_state(paths)
            require(active == 0, "A run started during the shutdown window; upgrade refused. Inspect interrupted work before retrying")
            require(stopped_schema == schema, "Application schema changed during release preflight")
            STAGE = "backup"
            backup_directory = backup(paths, current_image, stopped_schema, identity=identity, home_bytes=home_bytes)
        except (ReleaseError, OSError, sqlite3.Error) as error:
            message = str(error) if isinstance(error, ReleaseError) else type(error).__name__
            try:
                active, source_schema = database_state(paths)
                source_restart_guard(current, previous, pending, current_image, previous_revision,
                                     active, schema, source_schema, directory=RELEASES, configured_image=image_reference())
                compose("up", "-d", "--no-build", "--pull", "never", "matrix", "platform")
                smoke(str(current["svg_sha256"]))
                verify_running_candidate(current_image, previous_revision)
                active, source_schema = database_state(paths)
                source_restart_guard(current, previous, pending, current_image, previous_revision,
                                     active, schema, source_schema, directory=RELEASES, configured_image=image_reference())
            except (ReleaseError, OSError, sqlite3.Error, URLError, TimeoutError, IncompleteRead, json.JSONDecodeError) as restart_error:
                raise ReleaseError("Release failed before image replacement: " + message
                                   + "; verified source restart was unavailable. Inspect production state and backups before manual recovery",
                                   category="source_restart_failed", operation=getattr(error, "operation", None),
                                   returncode=getattr(error, "returncode", None), private_stderr=getattr(error, "private_stderr", b""),
                                   secondary=restart_error) from None
            raise ReleaseError("Release aborted before image replacement: " + message
                               + "; the same verified source was restarted", category="source_restarted",
                               operation=getattr(error, "operation", None), returncode=getattr(error, "returncode", None),
                               private_stderr=getattr(error, "private_stderr", b"")) from None
        initial = target == current_image and current is None and pending is None
        former = None if initial else {"image": current_image, "commit": previous_revision,
                  "svg_sha256": before_smoke["svg_sha256"], "backup": str(backup_directory),
                  "status": "failed" if incoming["action"] == "rollback" and pending is not None else "verified"}
        transaction = {"action": incoming["action"], "image": target, "commit": revision,
                       "svg_sha256": svg_hash,
                       "previous": former, "backup": str(backup_directory), "schema_before": stopped_schema,
                       "database_risk": "Image rollback does not reverse database or data migrations"}
        try:
            STAGE = "activation"
            save(RELEASES / "pending.json", transaction)
            if target != current_image:
                set_image(target)
            compose("up", "-d", "--no-build", "--pull", "never", "matrix", "platform")
            wait_ready()
            verify_running_candidate(target, revision)
            STAGE = "verification"
            proof = smoke(svg_hash)
            verify_running_candidate(target, revision)
        except (ReleaseError, OSError, URLError, TimeoutError, IncompleteRead, json.JSONDecodeError) as error:
            transaction["status"] = "failed"
            transaction["error"] = str(error) if isinstance(error, ReleaseError) else type(error).__name__
            try:
                if image_reference() == current_image:
                    compose("up", "-d", "--no-build", "--pull", "never", "matrix", "platform")
                save(RELEASES / "pending.json", transaction)
            except (ReleaseError, OSError) as recovery_error:
                raise ReleaseError("Release recovery failed; inspect the pending record and retained backup before restarting services",
                                   category="candidate_failed", operation=getattr(error, "operation", None),
                                   returncode=getattr(error, "returncode", None), private_stderr=getattr(error, "private_stderr", b""),
                                   secondary=recovery_error) from None
            raise ReleaseError("Candidate startup or verification failed: " + transaction["error"]
                               + "; state backup retained. No automatic database restore or image rollback was attempted",
                               category="candidate_failed", operation=getattr(error, "operation", None),
                               returncode=getattr(error, "returncode", None), private_stderr=getattr(error, "private_stderr", b"")) from None
        STAGE = "finalization"
        return finalize_release(transaction, proof, directory=RELEASES)


def failure_proof(error: Exception) -> dict[str, object]:
    message = str(error) if isinstance(error, ReleaseError) else type(error).__name__
    proof = {"status": "failed", "error": message, "stage": STAGE,
             "category": error.category if isinstance(error, ReleaseError) else "system_error"}
    reference = "release-" + uuid.uuid4().hex
    try:
        protected(ROOT, private=True)
        RELEASES.mkdir(mode=0o700, exist_ok=True)
        protected(RELEASES, private=True)
        details = {**proof, "reference": reference, "recorded_at": datetime.now(timezone.utc).isoformat()}
        if isinstance(error, ReleaseError):
            details.update(operation=error.operation, returncode=error.returncode)
            if error.private_stderr:
                details["private_stderr"] = error.private_stderr.decode("utf-8", errors="replace")
            if error.secondary is not None:
                secondary = error.secondary
                details["secondary_failure"] = {"error": str(secondary) if isinstance(secondary, ReleaseError) else type(secondary).__name__,
                                                "operation": getattr(secondary, "operation", None),
                                                "returncode": getattr(secondary, "returncode", None),
                                                "private_stderr": getattr(secondary, "private_stderr", b"").decode("utf-8", errors="replace")}
        save(RELEASES / (reference + ".json"), details)
        proof["diagnostic_reference"] = reference
    except (OSError, ReleaseError):
        proof["diagnostic_available"] = False
    return proof


if __name__ == "__main__":
    os.umask(0o077)
    try:
        print(json.dumps(main(), sort_keys=True))
    except (ReleaseError, OSError, ValueError, KeyError, sqlite3.Error, URLError, TimeoutError, IncompleteRead) as error:
        # Never emit Docker output, response bodies, configuration, or credential values.
        print(json.dumps(failure_proof(error)), file=sys.stderr)
        sys.exit(1)
