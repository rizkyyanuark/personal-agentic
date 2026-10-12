#!/usr/bin/env python3
"""Promote a verified registry digest through the fixed production installation."""
from __future__ import annotations

import fcntl
from contextlib import closing
import hashlib
from http.client import HTTPMessage, IncompleteRead, RemoteDisconnected
from http.cookies import SimpleCookie
import json
import math
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
RUNTIME_WORKDIR = Path("/home/ubuntu/workspace/production")
HOST = "agent.tugasakhir.space"
BASE = "http://127.0.0.1:18766"
ACTIVE = ("queued", "starting", "running", "waiting")
DIGEST = re.compile(r"sha256:[0-9a-f]{64}\Z")
COMMIT = re.compile(r"[0-9a-f]{40}\Z")
SHA = re.compile(r"[0-9a-f]{64}\Z")
DRAIN_ROUTE = "/api/deployment-drain"
DRAIN_LABEL = "space.tugasakhir.personal-agentic.deployment-drain-protocol"
DRAIN_LEASE = RELEASES / "drain-lease.json"
COMMAND_ENV = {"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "HOME": "/root", "LANG": "C.UTF-8"}


class ReleaseError(RuntimeError):
    pass


class ApplicationHttpError(ReleaseError):
    def __init__(self, route: str, status: int):
        super().__init__("Application endpoint failed: " + route + " HTTP " + str(status))
        self.status = status


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ReleaseError(message)


def command(arguments: list[str], timeout: int = 180) -> bytes:
    try:
        result = subprocess.run(arguments, capture_output=True, check=False,
                                timeout=timeout, env=COMMAND_ENV)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ReleaseError("Production command unavailable or timed out: " + arguments[0]) from error
    # Docker/Compose stderr may include interpolated configuration. Keep it off CI logs.
    require(result.returncode == 0, "Production command failed: " + " ".join(arguments[:4]))
    return result.stdout


def docker(*arguments: str, timeout: int = 180) -> bytes:
    return command(["/usr/bin/docker", "--host", "unix:///var/run/docker.sock",
                    "--config", str(ROOT / "registry-auth"), *arguments], timeout)


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


def require_drain_image(image: str) -> None:
    metadata = json.loads(docker("image", "inspect", image))[0]
    labels = metadata.get("Config", {}).get("Labels") or {}
    require(labels.get(DRAIN_LABEL) == "1",
            "Target image does not declare deployment drain protocol 1; reviewed bootstrap or legacy rollback is required")


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
        if response.status != expected:
            raise ApplicationHttpError(route, response.status)
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
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous_handler)
    raise ReleaseError("Production controller did not become ready within the startup budget")


def owner_token() -> str:
    token = compose("exec", "-T", "platform", "cat", "/data/org/.state/owner.key").decode().strip()
    require(bool(token) and len(token) < 1024, "Production owner credential is unavailable")
    return token


def valid_generation(value: object) -> bool:
    if not isinstance(value, str):
        return False
    try:
        return str(uuid.UUID(value)) == value
    except ValueError:
        return False


def validate_drain(value: object) -> dict[str, object]:
    require(isinstance(value, dict) and type(value.get("protocol_version")) is int
            and value.get("protocol_version") == 1
            and {"phase", "generation", "deadline_unix_seconds", "active_operations", "inflight_operations"}.issubset(value),
            "Application deployment drain protocol is unavailable or incompatible")
    phase = value.get("phase")
    require(phase in ("open", "draining", "sealed"), "Application drain phase is invalid")
    require(all(type(value.get(key)) is int and value[key] >= 0
                for key in ("active_operations", "inflight_operations")),
            "Application drain operation counts are invalid")
    generation = value.get("generation")
    deadline = value.get("deadline_unix_seconds")
    require((phase == "open" and generation is None and deadline is None)
            or (phase != "open" and valid_generation(generation)
                and (deadline is None or type(deadline) is int and deadline > 0)),
            "Application drain ownership or deadline is invalid")
    require(phase != "draining" or type(deadline) is int,
            "Application draining deadline is missing")
    require(phase != "sealed" or value["active_operations"] == 0 and value["inflight_operations"] == 0,
            "Sealed application still reports active operations")
    return value


def drain_request(token: str, action: str | None = None, generation: str | None = None,
                  *, timeout: float = 15, duration: int = 900, base: str = BASE) -> dict[str, object]:
    body = None
    if action is not None:
        require(action in ("begin", "seal", "resume") and valid_generation(generation),
                "Drain control action or generation is invalid")
        body = {"action": action, "generation": generation}
        if action == "begin":
            require(type(duration) is int and 1 <= duration <= 900, "Drain duration is invalid")
            body["timeout_seconds"] = duration
    content = request(DRAIN_ROUTE, token=token, body=body, timeout=timeout, base=base)[0]
    try:
        value = json.loads(content)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ReleaseError("Application drain response is invalid") from error
    return validate_drain(value)


def require_owned_drain(value: dict[str, object], generation: str, *, sealed: bool = False) -> None:
    require(value.get("generation") == generation and value.get("phase") in
            (("sealed",) if sealed else ("draining", "sealed")),
            "Application drain ownership changed or expired; release refused")


def begin_and_seal_drain(token: str, generation: str, *, timeout: float = 900,
                         interval: float = 2, base: str = BASE) -> dict[str, object]:
    require(0 < timeout <= 900 and 0 < interval <= 2 and valid_generation(generation),
            "Drain timing or generation is invalid")
    deadline = time.monotonic() + timeout
    previous_handler = signal.getsignal(signal.SIGALRM)
    require(signal.getitimer(signal.ITIMER_REAL) == (0, 0), "Drain cannot overlap another deadline")

    def expired(_number: int, _frame: object) -> None:
        raise TimeoutError("Drain deadline expired")

    def still_owned(value: dict[str, object], *, sealed: bool = False) -> None:
        require(value["phase"] != "open",
                "Application admission reopened before seal; release aborted without stopping work")
        require_owned_drain(value, generation, sealed=sealed)

    signal.signal(signal.SIGALRM, expired)
    try:
        signal.setitimer(signal.ITIMER_REAL, timeout)
        state = drain_request(token, "begin", generation, timeout=min(15, timeout),
                              duration=math.ceil(timeout), base=base)
        while time.monotonic() < deadline:
            still_owned(state)
            if state["active_operations"] == 0 and state["inflight_operations"] == 0:
                if state["phase"] != "sealed":
                    try:
                        state = drain_request(token, "seal", generation,
                                              timeout=min(15, max(0.001, deadline - time.monotonic())), base=base)
                    except ApplicationHttpError as error:
                        if error.status != 409:
                            raise
                        state = drain_request(token, timeout=min(15, max(0.001, deadline - time.monotonic())), base=base)
                        still_owned(state)
                    except (URLError, ConnectionError, RemoteDisconnected, IncompleteRead):
                        state = drain_request(token, timeout=min(15, max(0.001, deadline - time.monotonic())), base=base)
                        still_owned(state, sealed=True)
                if state["phase"] == "sealed":
                    still_owned(state, sealed=True)
                    require(time.monotonic() < deadline, "Drain deadline expired before seal confirmation")
                    return state
            time.sleep(min(interval, max(0, deadline - time.monotonic())))
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            try:
                state = drain_request(token, timeout=min(15, remaining), base=base)
            except (URLError, ConnectionError, RemoteDisconnected, IncompleteRead, TimeoutError):
                continue
    except TimeoutError:
        pass
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous_handler)
    raise ReleaseError("Production work did not drain within 15 minutes; release aborted without stopping work")


def resume_drain(token: str, generation: str, *, base: str = BASE) -> dict[str, object]:
    state = drain_request(token, base=base)
    if state["phase"] == "open":
        return state
    require_owned_drain(state, generation)
    state = drain_request(token, "resume", generation, base=base)
    require(state["phase"] == "open", "Application did not confirm reopening admission")
    return state


def validate_drain_lease(value: dict[str, object]) -> dict[str, object]:
    require(type(value.get("protocol_version")) is int and value.get("protocol_version") == 1
            and valid_generation(value.get("generation"))
            and value.get("action") in ("promote", "rollback")
            and type(value.get("stop_started")) is bool,
            "Production drain lease is invalid")
    for prefix in ("source", "target"):
        image, commit = value.get(prefix + "_image"), value.get(prefix + "_commit")
        require(isinstance(image, str) and image.startswith(REPOSITORY + "@")
                and bool(DIGEST.fullmatch(image.split("@", 1)[1]))
                and isinstance(commit, str) and bool(COMMIT.fullmatch(commit)),
                "Production drain lease image identity is invalid")
    return value


def clear_drain_lease(lease: dict[str, object], *, path: Path = DRAIN_LEASE) -> None:
    require(read_record(path) == lease, "Production drain lease changed during release")
    path.unlink()
    descriptor = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


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
    token = owner_token()
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
                for key in ("action", "backup", "schema_before", "previous", "verified_at", "smoke", "drain_generation")),
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
    expected = {volume + ".tar.gz" for volume in VOLUMES} | {"runtime-workdirs.tar.gz"}
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


def recovery_drain_identity(lease: dict[str, object] | None, transaction: dict[str, object] | None,
                            current: dict[str, object], image: str, commit: str,
                            state: dict[str, object]) -> tuple[str | None, bool]:
    if lease is None:
        require(state["phase"] == "open" and (transaction is None or transaction.get("drain_generation") is None),
                "Recovery lacks the matching production drain lease")
        return None, False
    validate_drain_lease(lease)
    generation = str(lease["generation"])
    source_abort = (transaction is None and image == lease["source_image"]
                    and commit == lease["source_commit"])
    if not source_abort:
        record = current if transaction is None else transaction
        require(image == lease["target_image"] and commit == lease["target_commit"]
                and record.get("drain_generation") == generation,
                "Recovery candidate does not own the production drain lease")
        if transaction is not None:
            former = transaction.get("previous")
            require(isinstance(former, dict) and former.get("image") == lease["source_image"]
                    and former.get("commit") == lease["source_commit"],
                    "Recovery predecessor does not match the drain lease")
    if state["phase"] == "open":
        source_verified = (lease.get("source_verified") is True
                           and isinstance(lease.get("source_smoke"), dict)
                           and lease["source_smoke"].get("svg_sha256") == current.get("svg_sha256"))
        require(transaction is None and (not source_abort or not lease["stop_started"] or source_verified),
                "An incomplete stopped release unexpectedly reopened admission")
    else:
        require_owned_drain(state, generation, sealed=not source_abort or bool(lease["stop_started"]))
    return generation, source_abort


def recover(incoming: dict[str, object], current_image: str, paths: dict[str, Path],
            current: dict[str, object] | None, previous: dict[str, object] | None,
            pending: dict[str, object] | None, schema: dict[str, str],
            lease: dict[str, object] | None) -> dict[str, object]:
    transaction = recovery_record(incoming, current, previous, pending)
    target = REPOSITORY + "@" + str(incoming["digest"])
    commit, svg = str(incoming["commit"]), str(incoming["svg_sha256"])
    require(current_image == target, "Configured image differs from the recovery request")
    require_drain_image(target)
    verify_running_candidate(target, commit)
    token = owner_token()
    state = drain_request(token)
    require(current is not None, "A verified current release is required for recovery")
    generation, source_abort = recovery_drain_identity(lease, transaction, current, target, commit, state)
    pre_stop_abort = (source_abort and lease is not None
                     and (not lease["stop_started"] or state["phase"] == "open" and lease.get("source_verified") is True))
    active, before_schema = database_state(paths)
    require((pre_stop_abort or active == 0) and before_schema == schema,
            "Production state changed before recovery verification")
    archive_hashes = {}
    if transaction is not None:
        require(schema == transaction.get("schema_before"), "Database schema changed since the failed release")
        archive_hashes = verify_recovery_backup(transaction)
    proof = smoke(svg)
    active, latest_schema = database_state(paths)
    require((pre_stop_abort or active == 0) and latest_schema == schema, "Production state changed during recovery verification")
    require(image_reference() == target, "Configured image changed during recovery verification")
    verify_running_candidate(target, commit)
    require(read_record(RELEASES / "current.json") == current and read_record(RELEASES / "previous.json") == previous
            and read_record(RELEASES / "pending.json") == pending, "Release journal changed during recovery verification")
    require(read_record(DRAIN_LEASE) == lease, "Production drain lease changed during recovery verification")
    latest = drain_request(token)
    recovery_drain_identity(lease, transaction, current, target, commit, latest)
    verified = None if transaction is None else finalize_release(transaction, proof)
    if generation is not None:
        latest = resume_drain(token, generation)
        require(lease is not None, "Production drain lease disappeared")
        clear_drain_lease(lease)
    if transaction is None:
        return {"action": "recover", "unchanged": True, "image": target, "commit": commit,
                "smoke": proof, "drain": latest, "source_release_abort": source_abort}
    return {"action": "recover", "release": verified, "backup_archive_hashes": archive_hashes,
            "services_restarted": False, "database_restored": False, "drain": latest}


def backup(paths: dict[str, Path], image: str, schema: dict[str, str]) -> Path:
    directory = ROOT / "backups" / (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8])
    directory.parent.mkdir(mode=0o700, exist_ok=True)
    protected(directory.parent, private=True)
    directory.mkdir(mode=0o700)
    require(RUNTIME_WORKDIR.is_dir() and RUNTIME_WORKDIR.resolve() == RUNTIME_WORKDIR,
            "The fixed production runtime workdir is unavailable or redirected")
    sources = [*paths.values(), RUNTIME_WORKDIR]
    size = sum(path.lstat().st_size for root in sources for path in root.rglob("*") if path.is_file() and not path.is_symlink())
    require(shutil.disk_usage(ROOT).free >= size + 512 * 1024 * 1024, "Insufficient disk space for production state backup")
    manifest = {"image": image, "schema": schema, "archives": {}}
    archives = [(volume + ".tar.gz", "type=volume,source=" + volume + ",target=/source,readonly") for volume in VOLUMES]
    archives.append(("runtime-workdirs.tar.gz", "type=bind,source=" + str(RUNTIME_WORKDIR) + ",target=/source,readonly"))
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
    atomic(directory / "production.env", ENV_FILE.read_bytes())
    atomic(directory / "compose.yaml", COMPOSE.read_bytes())
    runtime_key = ROOT / "runtime-ssh" / "id_ed25519"
    require(runtime_key.is_file() and not runtime_key.is_symlink(), "The selected production runtime key is unavailable")
    atomic(directory / "runtime-ssh-id_ed25519", runtime_key.read_bytes())
    manifest["runtime_workdir"] = str(RUNTIME_WORKDIR)
    manifest["identity_key"] = "runtime-ssh-id_ed25519"
    manifest["excluded"] = "Global AGY/provider authentication outside the production workdir"
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
        current_image = image_reference()
        paths = volume_paths()
        active, schema = database_state(paths)
        current = read_record(RELEASES / "current.json")
        previous = read_record(RELEASES / "previous.json")
        pending = read_record(RELEASES / "pending.json")
        lease = read_record(DRAIN_LEASE)
        if lease is not None:
            validate_drain_lease(lease)
        if incoming["action"] == "status":
            return {"action": "status", "image": current_image, "active_operations": active,
                    "current": current, "previous": previous, "pending": pending,
                    "drain_lease": lease, "drain": drain_request(owner_token()), "smoke": smoke(None)}
        if incoming["action"] == "recover":
            return recover(incoming, current_image, paths, current, previous, pending, schema, lease)
        require(lease is None, "A previous production drain lease requires identity-bound recovery before another release")
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
        docker("pull", target, timeout=600)
        revision = inspect_image(target, expected_commit)
        require_drain_image(target)
        previous_revision = inspect_image(current_image)
        verify_running_candidate(current_image, previous_revision)
        if incoming["action"] == "rollback" and pending is not None:
            before_smoke = {"svg_sha256": pending.get("svg_sha256")}
        else:
            before_smoke = smoke(None)
        token = owner_token()
        drain = drain_request(token)
        require(drain["phase"] == "open", "Application admission is already closed without a matching release lease")
        if target == current_image and current is not None and pending is None:
            return {"action": incoming["action"], "unchanged": True, "image": target,
                    "commit": revision, "smoke": smoke(svg_hash), "drain": drain}
        generation = str(uuid.uuid4())
        lease = {"protocol_version": 1, "generation": generation, "action": incoming["action"],
                 "source_image": current_image, "source_commit": previous_revision,
                 "target_image": target, "target_commit": revision, "stop_started": False}
        save(DRAIN_LEASE, lease)
        transaction = None
        try:
            begin_and_seal_drain(token, generation)
            active, latest_schema = database_state(paths)
            require(active == 0 and latest_schema == schema, "Production state changed while draining; release refused")
            require(image_reference() == current_image
                    and read_record(RELEASES / "current.json") == current
                    and read_record(RELEASES / "previous.json") == previous
                    and read_record(RELEASES / "pending.json") == pending,
                    "Production release identity changed while draining")
            require_owned_drain(drain_request(token), generation, sealed=True)
            lease["stop_started"] = True
            save(DRAIN_LEASE, lease)
            compose("stop", "--timeout", "30", "platform", "matrix")
            active, stopped_schema = database_state(paths)
            require(active == 0, "A run started during the shutdown window; upgrade refused. Inspect interrupted work before retrying")
            require(stopped_schema == schema, "Application schema changed during release preflight")
            backup_directory = backup(paths, current_image, stopped_schema)
            initial = target == current_image and current is None and pending is None
            former = None if initial else {"image": current_image, "commit": previous_revision,
                      "svg_sha256": before_smoke["svg_sha256"], "backup": str(backup_directory),
                      "status": "failed" if incoming["action"] == "rollback" and pending is not None else "verified"}
            transaction = {"action": incoming["action"], "image": target, "commit": revision,
                           "svg_sha256": svg_hash, "drain_generation": generation,
                           "previous": former, "backup": str(backup_directory), "schema_before": stopped_schema,
                           "database_risk": "Image rollback does not reverse database or data migrations"}
            save(RELEASES / "pending.json", transaction)
            if target != current_image:
                set_image(target)
            compose("up", "-d", "--no-build", "--pull", "never", "matrix", "platform")
            wait_ready()
            verify_running_candidate(target, revision)
            require_owned_drain(drain_request(token), generation, sealed=True)
            proof = smoke(svg_hash)
            verify_running_candidate(target, revision)
            require_owned_drain(drain_request(token), generation, sealed=True)
            require(database_state(paths)[0] == 0, "Candidate started work before release verification completed")
        except (ReleaseError, OSError, sqlite3.Error, URLError, TimeoutError, IncompleteRead, json.JSONDecodeError) as error:
            message = str(error) if isinstance(error, ReleaseError) else type(error).__name__
            if not lease["stop_started"]:
                try:
                    resume_drain(token, generation)
                    clear_drain_lease(lease)
                except (ReleaseError, OSError, URLError, TimeoutError, IncompleteRead):
                    raise ReleaseError("Release aborted before shutdown; owned drain recovery is required") from None
                raise ReleaseError("Release aborted before shutdown: " + message + "; admission reopened and work preserved") from None
            try:
                active, source_schema = database_state(paths)
                source_restart_guard(current, previous, pending, current_image, previous_revision,
                                     active, schema, source_schema, configured_image=image_reference())
                compose("up", "-d", "--no-build", "--pull", "never", "matrix", "platform")
                wait_ready()
                require_owned_drain(drain_request(token), generation, sealed=True)
                source_proof = smoke(str(current["svg_sha256"]))
                verify_running_candidate(current_image, previous_revision)
                active, source_schema = database_state(paths)
                source_restart_guard(current, previous, pending, current_image, previous_revision,
                                     active, schema, source_schema, configured_image=image_reference())
                require_owned_drain(drain_request(token), generation, sealed=True)
                lease.update(source_verified=True, source_smoke=source_proof)
                save(DRAIN_LEASE, lease)
                resume_drain(token, generation)
                clear_drain_lease(lease)
            except (ReleaseError, OSError, sqlite3.Error, URLError, TimeoutError, IncompleteRead, json.JSONDecodeError) as restart_error:
                source_restart_error = (str(restart_error) if isinstance(restart_error, ReleaseError)
                                        else type(restart_error).__name__)
            else:
                raise ReleaseError("Release aborted after shutdown began: " + message
                                   + "; the same verified source was restarted and admission reopened") from None
            try:
                lease.update(last_error=message, source_restart_error=source_restart_error)
                save(DRAIN_LEASE, lease)
                candidate_record = read_record(RELEASES / "pending.json")
                if (transaction is not None and candidate_record is not None
                        and candidate_record.get("drain_generation") == generation
                        and release_identity(candidate_record) == release_identity(transaction)):
                    transaction.update(status="failed", error=message)
                    save(RELEASES / "pending.json", transaction)
            except (ReleaseError, OSError):
                raise ReleaseError("Release failure evidence could not be saved; admission remains sealed and manual recovery is required") from None
            raise ReleaseError("Release failed after shutdown began: " + message
                               + "; admission remains sealed. Inspect the drain lease, release records and any retained backup before recovery") from None
        verified = finalize_release(transaction, proof)
        drain = resume_drain(token, generation)
        clear_drain_lease(lease)
        return {**verified, "drain": drain}


if __name__ == "__main__":
    os.umask(0o077)
    try:
        print(json.dumps(main(), sort_keys=True))
    except (ReleaseError, OSError, ValueError, KeyError, sqlite3.Error, URLError, TimeoutError, IncompleteRead) as error:
        # Never emit Docker output, response bodies, configuration, or credential values.
        message = str(error) if isinstance(error, ReleaseError) else type(error).__name__
        print(json.dumps({"status": "failed", "error": message}), file=sys.stderr)
        sys.exit(1)
