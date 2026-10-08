#!/usr/bin/env python3
"""Promote a verified registry digest through the fixed production installation."""
from __future__ import annotations

import fcntl
from contextlib import closing
import hashlib
from http.client import HTTPMessage
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
RUNTIME_WORKDIR = Path("/home/ubuntu/workspace/production")
HOST = "agent.tugasakhir.space"
BASE = "http://127.0.0.1:18766"
ACTIVE = ("queued", "starting", "running", "waiting")
DIGEST = re.compile(r"sha256:[0-9a-f]{64}\Z")
COMMIT = re.compile(r"[0-9a-f]{40}\Z")
SHA = re.compile(r"[0-9a-f]{64}\Z")
COMMAND_ENV = {"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "HOME": "/root", "LANG": "C.UTF-8"}


class ReleaseError(RuntimeError):
    pass


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
            expected: int = 200, session: str | None = None) -> tuple[bytes, HTTPMessage]:
    headers = {"Host": HOST}
    if token is not None:
        headers["Authorization"] = "Bearer " + token
    if session is not None:
        headers["Cookie"] = "ae_session=" + session
    data = None if body is None else json.dumps(body).encode()
    if data is not None:
        headers["Content-Type"] = "application/json"
    operation = Request(BASE + route, data=data, headers=headers)
    try:
        response = build_opener(ProxyHandler({}), LocalOnlyRedirects()).open(operation, timeout=15)
    except HTTPError as error:
        response = error
    try:
        require(response.status == expected, "Application endpoint failed: " + route + " HTTP " + str(response.status))
        content = response.read(32 * 1024 * 1024 + 1)
        require(len(content) <= 32 * 1024 * 1024, "Application response exceeds the smoke-test limit")
        return content, response.headers
    finally:
        response.close()


def smoke(svg_sha256: str | None) -> dict[str, object]:
    for attempt in range(45):
        try:
            health = json.loads(request("/api/health")[0])
            require(health.get("status") == "ok", "Application health payload is invalid")
            break
        except (ReleaseError, URLError, TimeoutError, json.JSONDecodeError):
            if attempt == 44:
                raise ReleaseError("Production controller did not become ready") from None
            time.sleep(2)
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
               "rollback": {"action", "acknowledge_database_risk"}, "status": {"action"}}
    require(isinstance(action, str) and action in allowed and set(value).issubset(allowed[action]), "Release action or fields are unsupported")
    if action == "promote":
        require(isinstance(value.get("digest"), str) and bool(DIGEST.fullmatch(value["digest"])), "Invalid image digest")
        require(isinstance(value.get("commit"), str) and bool(COMMIT.fullmatch(value["commit"])), "Invalid full commit SHA")
        require("svg_sha256" not in value or isinstance(value["svg_sha256"], str) and bool(SHA.fullmatch(value["svg_sha256"])), "Invalid SVG hash")
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
        if incoming["action"] == "status":
            return {"action": "status", "image": current_image, "active_operations": active,
                    "current": current, "previous": previous, "pending": pending, "smoke": smoke(None)}
        require(active == 0, "Production has active, queued or waiting runs, terminal commands, or indexing; release refused")
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
        previous_revision = inspect_image(current_image)
        if incoming["action"] == "rollback" and pending is not None:
            before_smoke = {"svg_sha256": pending.get("svg_sha256")}
        else:
            before_smoke = smoke(None)
        if target == current_image and current is not None and pending is None:
            return {"action": incoming["action"], "unchanged": True, "image": target,
                    "commit": revision, "smoke": smoke(svg_hash)}
        active, latest_schema = database_state(paths)
        require(active == 0 and latest_schema == schema, "Production state changed during image preparation; release refused")
        try:
            compose("stop", "--timeout", "30", "platform", "matrix")
            active, stopped_schema = database_state(paths)
            require(active == 0, "A run started during the shutdown window; upgrade refused. Inspect interrupted work before retrying")
            require(stopped_schema == schema, "Application schema changed during release preflight")
            backup_directory = backup(paths, current_image, stopped_schema)
        except (ReleaseError, OSError, sqlite3.Error):
            # The image has not changed, so restarting these services cannot introduce a migration.
            compose("up", "-d", "--no-build", "--pull", "never", "matrix", "platform")
            raise
        initial = target == current_image and current is None and pending is None
        former = None if initial else {"image": current_image, "commit": previous_revision,
                  "svg_sha256": before_smoke["svg_sha256"], "backup": str(backup_directory),
                  "status": "failed" if incoming["action"] == "rollback" and pending is not None else "verified"}
        transaction = {"action": incoming["action"], "image": target, "commit": revision,
                       "svg_sha256": svg_hash,
                       "previous": former, "backup": str(backup_directory), "schema_before": stopped_schema,
                       "database_risk": "Image rollback does not reverse database or data migrations"}
        try:
            save(RELEASES / "pending.json", transaction)
            if target != current_image:
                set_image(target)
            compose("up", "-d", "--no-build", "--pull", "never", "matrix", "platform")
            proof = smoke(svg_hash)
        except (ReleaseError, OSError, URLError, TimeoutError, json.JSONDecodeError):
            transaction["status"] = "failed"
            try:
                if image_reference() == current_image:
                    compose("up", "-d", "--no-build", "--pull", "never", "matrix", "platform")
                save(RELEASES / "pending.json", transaction)
            except (ReleaseError, OSError):
                raise ReleaseError("Release recovery failed; inspect the pending record and retained backup before restarting services") from None
            raise ReleaseError("Candidate startup or verification failed; state backup retained. No automatic database restore or image rollback was attempted") from None
        transaction.update(status="verified", verified_at=datetime.now(timezone.utc).isoformat(),
                           svg_sha256=proof["svg_sha256"], smoke=proof)
        if former is not None:
            save(RELEASES / "previous.json", former)
        save(RELEASES / "current.json", transaction)
        (RELEASES / "pending.json").unlink(missing_ok=True)
        return transaction


if __name__ == "__main__":
    os.umask(0o077)
    try:
        print(json.dumps(main(), sort_keys=True))
    except (ReleaseError, OSError, ValueError, KeyError, sqlite3.Error, URLError, TimeoutError) as error:
        # Never emit Docker output, response bodies, configuration, or credential values.
        message = str(error) if isinstance(error, ReleaseError) else type(error).__name__
        print(json.dumps({"status": "failed", "error": message}), file=sys.stderr)
        sys.exit(1)
