"""On-demand SSH bridge. No daemon, credentials on the workstation only.

Process groups follow CCCC's Unix process ownership; dotenv parsing is the
unmodified python-dotenv v1.2.2 parser (sources supplied by the Rust backend).
"""
import io
import base64
import binascii
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import re
import selectors
import shutil
import signal
import sqlite3
import stat
import subprocess
import sys
import time
import tomllib
import types
import uuid

MAX_OUTPUT = 8 * 1024 * 1024
MAX_DOCUMENT = 1024 * 1024
SECRETS = []


def redact(text):
    for secret in sorted(SECRETS, key=len, reverse=True):
        if secret:
            text = text.replace(json.dumps(secret, ensure_ascii=False)[1:-1], "[REDACTED]")
            text = text.replace(secret, "[REDACTED]")
    return text


def emit(value):
    def clean(item):
        if isinstance(item, str):
            return redact(item)
        if isinstance(item, list):
            return [clean(v) for v in item]
        if isinstance(item, dict):
            return {k: clean(v) for k, v in item.items()}
        return item
    print(json.dumps(clean(value), ensure_ascii=False), flush=True)


def run(command, *, timeout=12, **kwargs):
    return subprocess.run(command, capture_output=True, text=True, timeout=timeout, **kwargs)


def run_antigravity(command: list[str], *, timeout: float) -> subprocess.CompletedProcess[str]:
    process = subprocess.Popen(command, stdin=subprocess.DEVNULL,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, start_new_session=True)
    try:
        stdout, stderr = process.communicate(timeout=timeout)
        return subprocess.CompletedProcess(command, process.returncode, stdout, stderr)
    finally:
        try:
            stop_group(process)
        finally:
            for stream in (process.stdout, process.stderr):
                if stream is not None:
                    stream.close()


def codex(harness="codex"):
    if harness == "opencode":
        managed = Path.home()/".local/share/agentic-enterprise/tools/opencode/node_modules/.bin/opencode"
        if managed.is_file():
            return str(managed)
    paths = [str(Path.home() / ".local/bin"), str(Path.home() / ".opencode/bin"), "/opt/homebrew/bin", "/usr/local/bin"]
    paths += [str(p) for p in sorted((Path.home() / ".nvm/versions/node").glob("*/bin"), reverse=True)]
    os.environ["PATH"] = os.pathsep.join(paths + [os.environ.get("PATH", "/usr/bin:/bin")])
    binary = "agy" if harness == "antigravity" else harness
    found = shutil.which(binary)
    if not found:
        raise ValueError(f"{harness} CLI is not installed or is not on this workstation's PATH")
    return found


def antigravity_settings(executable: str | None = None) -> dict[str, object]:
    executable = executable or codex("antigravity")
    result = run_antigravity([executable, "models"], timeout=20)
    if result.returncode != 0:
        raise ValueError("Antigravity model catalog is unavailable; check the native agy login on this workstation")
    models = []
    seen = set()
    for line in result.stdout.splitlines():
        line = line.strip()
        if not line or line.startswith("Fetching"):
            continue
        parts = line.split("\t")
        slug = parts[0].strip()
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}", slug):
            raise ValueError("Invalid model identifier in Antigravity catalog")
        if slug in seen:
            raise ValueError("Duplicate model identifier in Antigravity catalog")
        seen.add(slug)
        models.append({"slug":slug, "display_name":parts[1].strip() if len(parts)>1 else slug,
                       "visibility":"list", "default_reasoning_level":"", "supported_reasoning_levels":[]})
    if not models:
        raise ValueError("No models found in Antigravity model catalog")
    return {"model":models[0]["slug"], "reasoning":"", "models":models,
            "fetched_at":datetime.now(timezone.utc).isoformat()}


def codex_home():
    return Path(os.environ.get("CODEX_HOME", str(Path.home() / ".codex")))


def codex_catalog():
    home = codex_home()
    config = tomllib.loads((home / "config.toml").read_text(encoding="utf-8")) if (home / "config.toml").exists() else {}
    override = config.get("model_catalog_json")
    if override is not None and (not isinstance(override, str) or not override.strip()):
        raise ValueError("model_catalog_json must be a nonempty path")
    return config, home / (override if override is not None else "models_cache.json")


def safe_path(path):
    if any(p.lower().startswith(".env") or p.lower() in (".git", ".state", "auth.json", "owner.key") for p in path.parts):
        raise ValueError("Sensitive/internal files are not exposed by this viewer")
    return path


def workspace(request):
    raw = Path(request["path"])
    if not raw.is_absolute() or not raw.is_dir():
        raise ValueError("Select an existing absolute directory on the workstation")
    root = raw.resolve(strict=True)
    if root == Path(root.anchor):
        raise ValueError("Attach a codebase directory, not a filesystem root")
    with os.scandir(root):
        pass
    git = run(["git", "-C", str(root), "rev-parse", "--show-toplevel"])
    value = {"path": str(raw), "canonical_path": str(root), "git_root": git.stdout.strip() if git.returncode == 0 else None}
    expected = request.get("workspace")
    if expected and any(value[k] != expected[k] for k in ("canonical_path", "git_root")):
        raise ValueError("Attached directory identity changed; reattach it explicitly")
    return value


def dotenv(request, root):
    file = root / ".env"
    if not file.exists():
        return {}
    if file.stat().st_size > 1024 * 1024:
        raise ValueError("Workdir .env exceeds 1 MiB")
    # Upstream parser rejects malformed entries without echoing secret source lines.
    parser = types.ModuleType("ae_dotenv_parser")
    variables = types.ModuleType("ae_dotenv_variables")
    exec(request["dotenv_parser"], parser.__dict__)
    exec(request["dotenv_variables"], variables.__dict__)
    values = {}
    reserved = {"PWD", "PATH", "PATHEXT", "COMSPEC", "HOME", "USERPROFILE", "CODEX_HOME", "CODEX_THREAD_ID", "AE_ORG", "AE_TOKEN", "AE_TOOL_TOKEN", "RUST_LOG", "XDG_DATA_HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_STATE_HOME", "OPENCODE_CONFIG", "OPENCODE_CONFIG_CONTENT", "OPENCODE_CONFIG_DIR", "OPENCODE_DB", "OPENCODE_PASSWORD", "OPENCODE_SERVER_PASSWORD"}
    for binding in parser.parse_stream(io.StringIO(file.read_text(encoding="utf-8-sig"))):
        if binding.error:
            raise ValueError("Invalid workdir .env syntax; check key/value quoting")
        if binding.key is None:
            continue
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", binding.key) or binding.key.upper() in reserved:
            raise ValueError("Invalid or reserved variable name in workdir .env")
        if binding.value is None:
            raise ValueError("Workdir .env entries require a value")
        values[binding.key] = "".join(atom.resolve({**os.environ, **values}) for atom in variables.parse_variables(binding.value))
    SECRETS.extend(v for v in values.values() if v)
    return values


def contained(root, reference):
    from urllib.parse import urlparse, unquote
    if reference.startswith("file:"):
        url = urlparse(reference)
        if url.netloc not in ("", "localhost"):
            raise ValueError("Network file paths are not supported")
        reference = unquote(url.path)
    path = Path(reference)
    if ".." in path.parts or any(ord(c) < 32 for c in reference):
        raise ValueError("Path escapes workspace")
    safe_path(path)
    resolved = (root / path).resolve(strict=True)
    if not resolved.is_relative_to(root):
        raise ValueError("File is outside the saved run workdir")
    safe_path(resolved.relative_to(root))
    return resolved


def document_reference(reference, *, relative=False):
    from urllib.parse import urlparse, unquote
    if not isinstance(reference, str) or not reference:
        raise ValueError("A document path is required")
    if reference.startswith("file:"):
        if relative:
            raise ValueError("Export destination must be relative to the saved run workdir")
        url = urlparse(reference)
        if url.netloc not in ("", "localhost") or url.query or url.fragment:
            raise ValueError("Only local file paths are supported")
        reference = unquote(url.path)
    path = Path(reference)
    if ".." in path.parts or "\\" in reference or any(ord(c) < 32 or ord(c) == 127 for c in reference):
        raise ValueError("Document path traversal is not allowed")
    if relative and (path.is_absolute() or re.match(r"^[A-Za-z]:", reference)):
        raise ValueError("Export destination must be relative to the saved run workdir")
    safe_path(path)
    if path.suffix.lower() not in (".md", ".markdown"):
        raise ValueError("Only standalone Markdown documents are supported")
    return path


def document_parent(base, parts, *, create=False):
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    base = Path(base)
    if not base.is_absolute():
        raise ValueError("Document root must be absolute")
    descriptor = os.open("/", flags)
    try:
        for part in base.parts[1:]:
            try:
                child = os.open(part, flags, dir_fd=descriptor)
            except OSError as error:
                raise ValueError("Document root must exist without symlinks") from error
            os.close(descriptor)
            descriptor = child
        for part in parts:
            if create:
                try:
                    os.mkdir(part, mode=0o755, dir_fd=descriptor)
                except FileExistsError:
                    pass
            try:
                child = os.open(part, flags, dir_fd=descriptor)
            except OSError as error:
                raise ValueError("Document directories must exist without symlinks") from error
            os.close(descriptor)
            descriptor = child
        return descriptor
    except (OSError, ValueError):
        os.close(descriptor)
        raise


def run_document(request, root, home=None):
    if request.get("harness") != "antigravity":
        raise ValueError("Native document import requires an Antigravity run")
    if request.get("workspace", {}).get("runtime_id"):
        raise ValueError("Use the registered runtime for this workdir")
    session = request.get("native_session_id")
    if not isinstance(session, str) or not re.fullmatch(r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}", session):
        raise ValueError("The saved run has no valid Antigravity session")
    path = document_reference(request.get("reference"))
    candidate = root / path
    if candidate.is_relative_to(root):
        base = root
        relative = candidate.relative_to(root)
    else:
        home = (Path.home() if home is None else home).resolve(strict=True)
        brain = home / ".gemini/antigravity-cli/brain" / session
        if not candidate.is_relative_to(brain):
            raise ValueError("Document is outside this run's workdir and Antigravity session")
        base = home
        relative = candidate.relative_to(home)
    safe_path(relative)
    parent = document_parent(base, relative.parts[:-1])
    try:
        metadata = os.stat(relative.name, dir_fd=parent, follow_symlinks=False)
        if not stat.S_ISREG(metadata.st_mode):
            raise ValueError("Document must be a regular file without symlinks")
        descriptor = os.open(relative.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
        with os.fdopen(descriptor, "rb") as source:
            before = os.fstat(source.fileno())
            if not stat.S_ISREG(before.st_mode):
                raise ValueError("Document must be a regular file without symlinks")
            if before.st_size > MAX_DOCUMENT:
                raise ValueError("Document exceeds the 1 MiB limit")
            data = source.read(MAX_DOCUMENT + 1)
            after = os.fstat(source.fileno())
            if len(data) > MAX_DOCUMENT:
                raise ValueError("Document exceeds the 1 MiB limit")
            if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
                raise ValueError("Document changed while it was being imported; retry the import")
    finally:
        os.close(parent)
    try:
        data.decode("utf-8")
    except UnicodeDecodeError as error:
        raise ValueError("Document must contain valid UTF-8 Markdown") from error
    return {"path": str(base / relative), "name": relative.name,
            "data": base64.b64encode(data).decode("ascii"),
            "sha256": hashlib.sha256(data).hexdigest(), "size": len(data)}


def export_document(request, root):
    if request.get("workspace", {}).get("runtime_id"):
        raise ValueError("Use the registered runtime for this workdir")
    if request.get("permission") not in ("workspace-write", "danger-full-access"):
        raise ValueError("The saved run profile does not permit workdir writes")
    relative = document_reference(request.get("reference"), relative=True)
    encoded = request.get("data")
    if not isinstance(encoded, str) or len(encoded) > 4 * ((MAX_DOCUMENT + 2) // 3):
        raise ValueError("Document exceeds the 1 MiB limit")
    try:
        data = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as error:
        raise ValueError("Invalid document encoding") from error
    if len(data) > MAX_DOCUMENT:
        raise ValueError("Document exceeds the 1 MiB limit")
    try:
        data.decode("utf-8")
    except UnicodeDecodeError as error:
        raise ValueError("Document must contain valid UTF-8 Markdown") from error
    if request.get("sha256") != hashlib.sha256(data).hexdigest():
        raise ValueError("Document checksum does not match the stored artifact")
    parent = document_parent(root, relative.parts[:-1], create=True)
    temporary = ".artifact-" + uuid.uuid4().hex + ".tmp"
    created = False
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                             mode=0o600, dir_fd=parent)
        created = True
        with os.fdopen(descriptor, "wb") as target:
            target.write(data)
            target.flush()
            os.fsync(target.fileno())
        try:
            os.link(temporary, relative.name, src_dir_fd=parent, dst_dir_fd=parent,
                    follow_symlinks=False)
        except FileExistsError as error:
            raise ValueError("Export destination already exists; choose a new filename") from error
        os.unlink(temporary, dir_fd=parent)
        created = False
        os.fsync(parent)
    finally:
        if created:
            try:
                os.unlink(temporary, dir_fd=parent)
            except FileNotFoundError:
                pass
        os.close(parent)
    return {"path": str(root / relative)}


def stop_group(process):
    if getattr(process, "ae_stopped", False):
        return
    process.ae_stopped = True
    # Reap the entire process group even when its leader has already exited.
    try:
        os.killpg(process.pid, signal.SIGTERM)
        time.sleep(0.2)
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    except PermissionError:
        # Darwin returns EPERM for an owned group containing only zombies.
        # Do not hide a permission failure while any group member is still alive.
        groups = subprocess.run(["ps", "-axo", "pgid=,stat="], capture_output=True,
                                text=True, check=True, timeout=5).stdout
        for line in groups.splitlines():
            group, state = line.split(maxsplit=1)
            if int(group) == process.pid and not state.startswith("Z"):
                raise
    process.wait(timeout=5)


def execute(request, ws, executable):
    terminal = request["op"] == "terminal"
    opencode = request.get("harness") == "opencode" and not terminal
    antigravity = request.get("harness") == "antigravity" and not terminal
    if antigravity and request.get("images"):
        raise ValueError("Antigravity image attachments are not supported by this SSH integration")
    root = Path(ws["canonical_path"])
    env = dict(os.environ)
    env.update(dotenv(request, root))
    # OpenCode v2 resolves run location from PWD before process.cwd().
    env["PWD"] = str(root)
    if request.get("tool_token"):
        env["AE_TOOL_TOKEN"] = request["tool_token"]
        SECRETS.append(request["tool_token"])
    for key in ("namespace", "session_id", "run_id"):
        if not re.fullmatch(r"[A-Za-z0-9-]{1,80}", request[key]):
            raise ValueError("Invalid runtime identifier")
    home = Path.home() / ".local/share/agentic-enterprise" / request["namespace"] / "sessions" / request["session_id"]
    home.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(home, 0o700)
    source = codex_home() / "auth.json"
    original = None if terminal or opencode or antigravity else source.read_bytes()
    target = home / "auth.json"
    if original is not None:
        target.write_bytes(original)
        os.chmod(target, 0o600)
    (home / "AGENTS.md").write_text(request["instructions"], encoding="utf-8")
    if not antigravity:
        env["CODEX_HOME"] = str(home)
    opencode_auth = None
    if opencode:
        opencode_auth = opencode_credentials(request, home)
        opencode_environment(env,home)
        config=request["opencode_config"]
        config["instructions"]=[str(home/"AGENTS.md")]
        env["OPENCODE_CONFIG_CONTENT"]=json.dumps(config)
    args = ["-lc", request["command"]] if terminal else list(request["arguments"])
    if not terminal and not opencode and not antigravity:
        config, catalog = codex_catalog()
        if "model_catalog_json" in config:
            args += ["-c", "model_catalog_json=" + json.dumps(str(catalog))]
    if request.get("schema"):
        if antigravity:
            args[:0] = ["--json-schema", request["schema"]]
        else:
            schema = home / "coordination-schema.json"
            schema.write_text(request["schema"], encoding="utf-8")
            args += ["--output-schema", str(schema)]
    import base64
    for attachment in request.get("images", []):
        if not re.fullmatch(r"[A-Za-z0-9-]{1,80}", attachment["id"]):
            raise ValueError("Invalid image identifier")
        file = home / (attachment["id"] + ".image")
        file.write_bytes(base64.b64decode(attachment["data"], validate=True))
        args += ["--file" if opencode else "--image", str(file)]
    if request.get("native_session_id") and not (antigravity and "--conversation" in args):
        if antigravity:
            args[:0] = ["--conversation", request["native_session_id"]]
        else:
            args += ["--session" if opencode else "resume", request["native_session_id"]]
    if not terminal and not opencode and not antigravity:
        args += ["-"]
    process = subprocess.Popen([executable, *args], cwd=root, env=env, stdin=subprocess.PIPE,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    reason = None
    try:
        emit({"type": "ae.remote.started", "pid": process.pid, "executable": executable, "arguments": args, "cwd": str(root)})
        # Write concurrently so a large prompt cannot block the heartbeat/output loop.
        import threading
        def prompt():
            try:
                if not terminal and not antigravity:
                    process.stdin.write(request["prompt"].encode("utf-8"))
                process.stdin.close()
            except BrokenPipeError:
                pass
        writer = threading.Thread(target=prompt, daemon=True)
        writer.start()
        selector = selectors.DefaultSelector()
        streams = {process.stdout: bytearray(), process.stderr: bytearray()}
        # Drain bytes prefetched with the JSON request before using the raw fd.
        # A blocked daemon BufferedReader would abort Python during shutdown.
        os.set_blocking(sys.stdin.fileno(), False)
        prefetched = sys.stdin.buffer.read()
        control_buffer = bytearray(prefetched or b"")
        if prefetched == b"":
            reason = "interrupted"
        for stream in [*streams, sys.stdin.buffer]:
            os.set_blocking(stream.fileno(), False)
            selector.register(stream, selectors.EVENT_READ)
        started = heartbeat = time.monotonic()
        active_time = 0
        waiting_for_input = False
        total = 0
        while True:
            for key, _ in selector.select(0.25):
                stream = key.fileobj
                chunk = os.read(stream.fileno(), 65536)
                if stream == sys.stdin.buffer:
                    if not chunk:
                        reason = "interrupted"
                    control_buffer.extend(chunk)
                    continue
                if not chunk:
                    selector.unregister(stream)
                    continue
                total += len(chunk)
                if total > MAX_OUTPUT:
                    raise ValueError("Run output exceeded 8 MiB")
                buffer = streams[stream]
                buffer.extend(chunk)
                patterns = [s.encode() for s in SECRETS if s]
                # Hold possible secret prefixes across reads, including multiline values.
                boundary = buffer.rfind(b"\n", 0, max(0, len(buffer) - max(map(len, patterns), default=0))) + 1
                for pattern in patterns:
                    start = buffer.find(pattern, max(0, boundary - len(pattern)))
                    if 0 <= start < boundary < start + len(pattern):
                        boundary = buffer.rfind(b"\n", 0, start) + 1
                if boundary:
                    text = bytes(buffer[:boundary]).decode("utf-8", errors="replace")
                    del buffer[:boundary]
                    forward(text, terminal, stream == process.stderr)
            tick = time.monotonic()
            if not waiting_for_input:
                active_time += tick - started
            started = tick
            while b"\n" in control_buffer:
                line, _, remaining = control_buffer.partition(b"\n")
                control_buffer[:] = remaining
                heartbeat = time.monotonic()
                if line.strip() == b"cancel":
                    reason = "cancelled"
                if not terminal:
                    waiting_for_input = line.strip() == b"waiting_for_input"
            if time.monotonic() - heartbeat > 15:
                reason = "interrupted"
            if active_time > request["timeout_seconds"]:
                reason = "timed_out"
            exited = os.waitid(os.P_PID, process.pid, os.WEXITED | os.WNOHANG | os.WNOWAIT)
            if reason or exited is not None:
                stop_group(process)
                writer.join(timeout=2)
                # Drain final bytes after the owned group is gone.
                for stream, buffer in streams.items():
                    os.set_blocking(stream.fileno(), True)
                    buffer.extend(stream.read(MAX_OUTPUT - min(total, MAX_OUTPUT) + 1))
                    if buffer:
                        text = buffer.decode("utf-8", errors="replace")
                        forward(text, terminal, stream == process.stderr)
                emit({"type": "ae.remote.finished", "status": reason, "exit_code": process.returncode})
                return process.returncode if reason is None else 1
    finally:
        stop_group(process)
        if opencode_auth:
            opencode_credentials_finish(opencode_auth)
        # Never replace a newer native login with stale scoped credentials.
        if original is not None and source.read_bytes() == original and target.exists():
            updated = target.read_bytes()
            if updated != original:
                replacement = source.with_name("ae-auth-" + request["run_id"] + ".tmp")
                replacement.write_bytes(updated)
                os.chmod(replacement, 0o600)
                replacement.replace(source)


def forward(text, terminal, error):
    if terminal:
        emit({"type": "ae.terminal.output", "text": text})
    elif error:
        print(redact(text), end="", file=sys.stderr, flush=True)
    else:
        for line in text.splitlines():
            if line.strip():
                emit(json.loads(line))


def skills(request, root, executable):
    process = subprocess.Popen([executable, "app-server"], cwd=root, stdin=subprocess.PIPE,
                               stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, start_new_session=True)
    def send(value):
        process.stdin.write((json.dumps(value) + "\n").encode())
        process.stdin.flush()
    try:
        send({"id": 0, "method": "initialize", "params": {"clientInfo": {"name": "agentic_enterprise", "version": "0.1.0"}}})
        selector = selectors.DefaultSelector()
        selector.register(process.stdout, selectors.EVENT_READ)
        buffer = b""
        total = 0
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            for _, _ in selector.select(0.25):
                chunk = os.read(process.stdout.fileno(), 65536)
                if not chunk:
                    raise ValueError("Remote Codex skills discovery disconnected")
                total += len(chunk)
                if total > 2 * 1024 * 1024:
                    raise ValueError("Remote skills response exceeded 2 MiB")
                buffer += chunk
                while b"\n" in buffer:
                    line, buffer = buffer.split(b"\n", 1)
                    value = json.loads(line)
                    if "error" in value:
                        raise ValueError("Remote Codex skills request failed; check the installed CLI")
                    if value.get("id") == 0:
                        send({"method": "initialized", "params": {}})
                        send({"id": 1, "method": "skills/list", "params": {"cwds": [str(root)], "forceReload": True}})
                    elif value.get("id") == 1:
                        found = [s for entry in value["result"]["data"] for s in entry["skills"] if s["scope"] == "repo"]
                        errors = [e for entry in value["result"]["data"] for e in entry["errors"]]
                        text = None
                        if request.get("reference"):
                            selected = next((s for s in found if s["path"] == request["reference"]), None)
                            if selected is None:
                                raise ValueError("Skill is no longer installed; refresh the list")
                            path = contained(Path(request["workspace"].get("git_root") or root), selected["path"])
                            if path.name != "SKILL.md" or path.stat().st_size > 256 * 1024:
                                raise ValueError("Only SKILL.md files up to 256 KiB can be previewed")
                            text = path.read_text(encoding="utf-8")
                        emit({"cwd": str(root), "skills": sorted(found, key=lambda s: s["name"].lower()), "errors": errors, "text": text})
                        return 0
        raise ValueError("Remote skills discovery timed out")
    finally:
        stop_group(process)


class AntigravitySkillError(ValueError):
    """A safe, content-free error for one installed skill."""


def antigravity_skill_path(root: Path, reference: Path) -> Path:
    try:
        return contained(root, str(reference))
    except RuntimeError:
        raise AntigravitySkillError("Skill path contains a symlink loop") from None


def read_antigravity_skill(root: Path, reference: Path) -> tuple[Path, str, str]:
    path = antigravity_skill_path(root, reference)
    if path.name != "SKILL.md":
        raise AntigravitySkillError("Only SKILL.md instructions can be discovered")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
    descriptor = os.open(path, flags)
    before = os.fstat(descriptor)
    if not stat.S_ISREG(before.st_mode):
        os.close(descriptor)
        raise AntigravitySkillError("Skill instructions must be a regular file")
    with os.fdopen(descriptor, "rb") as stream:
        current = antigravity_skill_path(root, reference)
        current_stat = current.stat()
        if current != path or (before.st_dev, before.st_ino) != (current_stat.st_dev, current_stat.st_ino):
            raise AntigravitySkillError("Skill changed during discovery; refresh the list")
        data = stream.read(256 * 1024 + 1)
        after = os.fstat(stream.fileno())
        current = antigravity_skill_path(root, reference)
        current_stat = current.stat()
        if (current != path or (after.st_dev, after.st_ino) != (current_stat.st_dev, current_stat.st_ino)
                or (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns)):
            raise AntigravitySkillError("Skill changed during discovery; refresh the list")
    if len(data) > 256 * 1024:
        raise AntigravitySkillError("Skill exceeds 256 KiB preview limit")
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise AntigravitySkillError("Skill instructions are not UTF-8 text") from None
    opening = re.match(r"\A---[ \t]*\r?\n", text)
    if opening is None:
        raise AntigravitySkillError("Skill requires YAML frontmatter at the start of SKILL.md")
    closing = re.search(r"(?m)^---[ \t]*(?:\r?\n|$)", text[opening.end():])
    if closing is None:
        raise AntigravitySkillError("Skill YAML frontmatter is missing its closing delimiter")
    frontmatter = text[opening.end():opening.end() + closing.start()]
    if len(frontmatter.encode("utf-8")) > 16 * 1024:
        raise AntigravitySkillError("Skill frontmatter exceeds 16 KiB limit")
    return path, frontmatter, text


def antigravity_skills(request: dict[str, object], root: Path) -> int:
    manifests: list[dict[str, str]] = []
    errors: list[dict[str, str]] = []
    seen: set[Path] = set()
    entry_count = 0
    candidate_count = 0
    header_bytes = 0
    for relative in (".agents/skills", ".agent/skills"):
        logical_root = root / relative
        try:
            skill_root = antigravity_skill_path(root, logical_root)
            if not skill_root.is_dir():
                raise AntigravitySkillError("Skill installation path must be a directory")
            entries = []
            with os.scandir(skill_root) as iterator:
                for entry in iterator:
                    entry_count += 1
                    if entry_count > 1024:
                        raise ValueError("Skill discovery exceeds 1024 directory entries")
                    entries.append(entry.name)
        except FileNotFoundError:
            continue
        except OSError:
            errors.append({"path": str(logical_root), "message": "Cannot read the skill installation directory"})
            continue
        except AntigravitySkillError as error:
            errors.append({"path": str(logical_root), "message": str(error)})
            continue
        except ValueError:
            if entry_count > 1024:
                raise
            errors.append({"path": str(logical_root), "message": "Skill installation directory must remain inside this workdir"})
            continue
        for folder_name in sorted(entries, key=lambda name: (name.lower(), name)):
            logical_directory = logical_root / folder_name
            candidate = logical_directory / "SKILL.md"
            try:
                directory = antigravity_skill_path(root, logical_directory)
                if not directory.is_dir():
                    continue
                try:
                    candidate.lstat()
                except FileNotFoundError:
                    continue
                candidate_count += 1
                if candidate_count > 256:
                    raise ValueError("Skill discovery exceeds 256 skill candidates")
                path, frontmatter, _ = read_antigravity_skill(root, candidate)
                if path in seen:
                    continue
                header_bytes += len(frontmatter.encode("utf-8"))
                if header_bytes > 2 * 1024 * 1024:
                    raise ValueError("Skill discovery frontmatter exceeds 2 MiB aggregate limit")
                seen.add(path)
                manifests.append({"path": str(path), "folder_name": folder_name, "frontmatter": frontmatter})
            except OSError:
                errors.append({"path": str(candidate), "message": "Cannot read skill instructions"})
            except AntigravitySkillError as error:
                errors.append({"path": str(candidate), "message": str(error)})
            except ValueError:
                if candidate_count > 256 or header_bytes > 2 * 1024 * 1024:
                    raise
                errors.append({"path": str(candidate), "message": "Skill instructions must remain inside this workdir and outside sensitive paths"})
    text = None
    selected = request.get("reference")
    if selected:
        installed = next((manifest for manifest in manifests if manifest["path"] == selected), None)
        if installed is None:
            raise ValueError("Skill is no longer installed in this workdir; refresh the list")
        try:
            _, frontmatter, text = read_antigravity_skill(root, Path(installed["path"]))
        except (OSError, ValueError):
            raise ValueError("Skill changed during discovery; refresh the list") from None
        if frontmatter != installed["frontmatter"]:
            raise ValueError("Skill changed during discovery; refresh the list")
    emit({"cwd": str(root), "manifests": manifests, "errors": errors, "text": text})
    return 0


def opencode_environment(env,home=None):
    if home is not None:
        for key,folder in (("XDG_DATA_HOME","data"),("XDG_CACHE_HOME","cache"),("XDG_STATE_HOME","state")):
            env[key]=str(home/folder)
        env["OPENCODE_DB"]=str(home/"data/opencode/opencode.db")
    env["OPENCODE_CONFIG_CONTENT"]=json.dumps({"share":"disabled","autoupdate":False})


def opencode_credentials(request, home):
    # The native CLI owns migrations; borrow only credentials, never its chats.
    source=Path(os.environ.get("XDG_DATA_HOME",str(Path.home()/".local/share")))/"opencode"/os.environ.get("OPENCODE_DB","opencode.db")
    target=home/"data/opencode/opencode.db"
    if not target.exists():
        opencode_query({**request,"route":"/api/model","runtime_session_id":request["session_id"]})
    native=sqlite3.connect(source.as_uri()+"?mode=ro",uri=True)
    columns="id,integration_id,label,value,connector_id,method_id,active,time_created,time_updated"
    try: rows=native.execute("SELECT "+columns+" FROM credential").fetchall()
    finally: native.close()
    scoped=sqlite3.connect(target,timeout=5)
    try:
        with scoped:
            scoped.execute("DELETE FROM credential")
            scoped.executemany("INSERT INTO credential ("+columns+") VALUES (?,?,?,?,?,?,?,?,?)",rows)
    finally: scoped.close()
    for row in rows:
        value=json.loads(row[3])
        SECRETS.extend(value[k] for k in ("key","access","refresh") if isinstance(value.get(k),str))
    return source,target,rows


def opencode_credentials_finish(lease):
    source,target,rows=lease
    native=sqlite3.connect(source,timeout=5)
    scoped=sqlite3.connect(target.as_uri()+"?mode=ro",uri=True)
    try:
        with native:
            for row in rows:
                updated=scoped.execute("SELECT value,time_updated FROM credential WHERE id=?",(row[0],)).fetchone()
                if updated and updated[0]!=row[3]:
                    native.execute("UPDATE credential SET value=?,time_updated=? WHERE id=? AND value=?",(*updated,row[0],row[3]))
    finally:
        scoped.close()
        native.close()


def opencode_query(request):
    # Native registry queries need to wait for plugin settlement in OpenCode v2.
    import base64
    import queue
    import secrets
    import threading
    import urllib.request
    import urllib.parse
    namespace=request["namespace"]
    if not re.fullmatch(r"[A-Za-z0-9-]{1,80}",namespace):
        raise ValueError("Invalid runtime namespace")
    route=request["route"]
    session=request.get("runtime_session_id")
    if route not in ("/api/model","/api/skill") and not (session and re.fullmatch(r"/api/session/ses_[A-Za-z0-9]+/message\?limit=200&order=desc",route)):
        raise ValueError("Unsupported OpenCode registry")
    home=Path.home()/".local/share/agentic-enterprise"/namespace/"opencode-catalog"
    if session:
        if not re.fullmatch(r"[A-Za-z0-9-]{1,80}",session): raise ValueError("Invalid runtime session")
        home=home.parent/"sessions"/session
    home.mkdir(parents=True,exist_ok=True,mode=0o700)
    env=dict(os.environ)
    opencode_environment(env,home if session else None)
    if request.get("path"):
        env.update(dotenv(request,Path(request["path"])))
        env["PWD"]=request["path"]
    password=secrets.token_hex(32)
    env["OPENCODE_PASSWORD"]=password
    process=subprocess.Popen([codex("opencode"),"serve","--stdio","--hostname","127.0.0.1","--port","0"],
        cwd=request.get("path") or Path.home(),env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
    ready=queue.Queue()
    threading.Thread(target=lambda:ready.put(process.stdout.readline(65536)),daemon=True).start()
    threading.Thread(target=lambda:process.stderr.read(65536),daemon=True).start()
    try:
        try: line=ready.get(timeout=15)
        except queue.Empty as error: raise ValueError("OpenCode private server did not become ready") from error
        url=json.loads(line)["url"]
        if not re.fullmatch(r"http://127\.0\.0\.1:\d+",url):
            raise ValueError("Unexpected OpenCode server address")
        auth="Basic "+base64.b64encode(("opencode:"+password).encode()).decode()
        opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
        query="?"+urllib.parse.urlencode({"location[directory]":request["path"]}) if request.get("path") else ""
        def fetch(endpoint):
            separator="&" if "?" in endpoint else "?"
            location=separator+query[1:] if query else ""
            with opener.open(urllib.request.Request(url+endpoint+location,headers={"Authorization":auth}),timeout=5) as response:
                return json.load(response)
        if route in ("/api/model","/api/skill"):
            started=time.monotonic()
            while True:
                plugins=fetch("/api/plugin")["data"]
                if plugins:
                    if any(p["state"]["status"]!="active" for p in plugins):
                        raise ValueError("An OpenCode plugin failed to activate; check the workstation's OpenCode setup")
                    break
                if time.monotonic()-started>20: raise ValueError("OpenCode plugins did not become ready")
                time.sleep(.25)
        value=fetch(route)
        if route=="/api/model":
            value["default"]=fetch("/api/model/default")["data"]
            value["data"]=[{k:m.get(k) for k in ("id","providerID","name","variants","capabilities","cost","enabled","status")} for m in value["data"]]
        return value
    finally:
        process.stdin.close()
        stop_group(process)


def read_codex_usage():
    executable = os.environ.get("AE_CODEX") or shutil.which("codex")
    if not executable:
        raise ValueError("Codex executable unavailable on this runtime")
    process = subprocess.Popen(
        [executable, "app-server", "--stdio", "-c", 'cli_auth_credentials_store="file"'],
        cwd=str(Path.home()), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL, start_new_session=True,
    )
    selector = selectors.DefaultSelector()
    try:
        selector.register(process.stdout, selectors.EVENT_READ)
        def send(value):
            process.stdin.write((json.dumps(value) + "\n").encode())
            process.stdin.flush()
        send({"id": 0, "method": "initialize", "params": {"clientInfo": {"name": "agentic_enterprise", "version": "0.1.0"}}})
        deadline = time.monotonic() + 20
        received = 0
        buffer = b""
        while time.monotonic() < deadline:
            if not selector.select(min(0.2, max(0, deadline - time.monotonic()))):
                continue
            chunk = os.read(process.stdout.fileno(), 8192)
            if not chunk:
                raise ValueError("Codex request disconnected; check native login")
            received += len(chunk)
            if received > 2 * 1024 * 1024:
                raise ValueError("Unsupported Codex usage response size")
            buffer += chunk
            while b"\n" in buffer:
                line, buffer = buffer.split(b"\n", 1)
                value = json.loads(line)
                if "id" not in value:
                    continue
                if value.get("error"):
                    raise ValueError("Codex request failed; check native sign-in")
                if value["id"] == 0:
                    send({"method": "initialized", "params": {}})
                    send({"id": 1, "method": "account/rateLimits/read", "params": {}})
                elif value["id"] == 1:
                    result = value.get("result", {})
                    return {k: result.get(k) for k in ("rateLimits", "rateLimitsByLimitId")}
        raise ValueError("Codex request timed out")
    finally:
        selector.close()
        stop_group(process)


def main(request):
    op = request["op"]
    if op == "usage":
        emit(read_codex_usage())
        return 0
    if op == "antigravity_settings":
        emit(antigravity_settings())
        return 0
    if op == "opencode_query":
        emit(opencode_query(request))
        return 0
    if op == "directories":
        root = safe_path(Path(request.get("path") or Path.home()).resolve(strict=True))
        folders = []
        for p in sorted(root.iterdir(), key=lambda p: p.name.lower()):
            if p.is_dir() and not p.name.startswith("."):
                folders.append({"name": p.name, "path": str(p)})
            if len(folders) >= 1000:
                break
        emit({"path": str(root), "parent": str(root.parent) if root.parent != root else None,
              "roots": [{"name": "Home", "path": str(Path.home())}], "folders": folders})
        return 0
    if op == "settings":
        config, catalog = codex_catalog()
        profile = config.get("profiles", {}).get(config.get("profile"), {})
        keys = ("model", "model_reasoning_effort")
        emit({"config": {k: profile.get(k, config.get(k, "")) for k in keys},
              "cache": json.loads(catalog.read_text(encoding="utf-8"))})
        return 0
    ws = workspace(request)
    if op == "workspace":
        emit({"workspace": ws, "git_status": "Workdir verified on workstation"})
        return 0
    root = Path(ws["canonical_path"])
    if op == "run_document":
        emit(run_document(request, root))
        return 0
    if op == "export_document":
        emit(export_document(request, root))
        return 0
    if op == "redact":
        dotenv(request, root)
        emit({"command": redact(request["command"])})
        return 0
    if op in ("file", "files"):
        path = contained(root, request["reference"])
        if op == "files" and path.is_dir():
            entries = [{"name": p.name, "directory": p.is_dir()} for p in path.iterdir()
                       if not p.name.startswith(".env") and p.name not in (".git", ".state", "node_modules", "target")]
            emit({"entries": sorted(entries, key=lambda p: p["name"].lower()), "base": str(root)})
        else:
            limit = 25 * 1024 * 1024 if op == "file" else 256 * 1024
            with path.open("rb") as file:
                data = file.read(limit + 1)
            if len(data) > limit:
                raise ValueError("File exceeds viewer size limit")
            if op == "file":
                sys.stdout.buffer.write(data)
            else:
                emit({"text": data.decode("utf-8"), "base": str(root)})
        return 0
    harness = request.get("harness", "codex")
    if harness not in ("codex","opencode","antigravity"):
        raise ValueError("Unsupported harness")
    executable = codex(harness)
    if op == "skills":
        if harness == "antigravity":
            return antigravity_skills(request, root)
        if harness == "opencode":
            values=opencode_query({**request,"route":"/api/skill"})["data"]
            skills=[]
            text=None
            boundary=Path(ws.get("git_root") or root).resolve()
            for skill in values:
                if skill["path"].startswith("/builtin/"): continue
                path=Path(skill["path"]).resolve(strict=True)
                if not path.is_relative_to(boundary):
                    continue
                skills.append({"name":skill["name"],"description":skill.get("description", ""),"path":skill["path"],"scope":"repo","enabled":True})
                if request.get("reference")==skill["path"]:
                    if path.name!="SKILL.md": raise ValueError("Only SKILL.md can be previewed")
                    safe=contained(boundary,str(path))
                    if safe.stat().st_size>256*1024: raise ValueError("Skill exceeds 256 KiB preview limit")
                    text=safe.read_text(encoding="utf-8")
            if request.get("reference") and text is None: raise ValueError("Skill is no longer installed in this workdir")
            emit({"cwd":str(root),"skills":sorted(skills,key=lambda s:s["name"].lower()),"errors":[],"text":text})
            return 0
        return skills(request, root, executable)
    if op == "probe":
        version = run_antigravity([executable, "--version"], timeout=4) if harness == "antigravity" else run([executable, "--version"])
        if harness == "antigravity":
            ready = version.returncode == 0
            env = dotenv(request, root)
            emit({"ready":ready,
                  "message":"Antigravity CLI available; model catalog is checked before execution. Native credentials are validated when a run starts." if ready else "Antigravity CLI version check failed",
                  "version":version.stdout.strip(), "executable":executable, "os":os.uname().sysname,
                  "environment_keys":list(env), "workspace":ws})
            return 0
        if harness == "opencode":
            env = dotenv(request, root)
            ready = version.returncode==0 and re.search(r"(?:^|\s)v?2\.\d+\.\d+(?:[-+].*)?$",version.stdout.strip()) is not None
            emit({"ready":ready,"message":"OpenCode v2 installed; model availability is checked before each run" if ready else "Install OpenCode v2 for this integration", "version":version.stdout.strip(),
                  "executable":executable,"os":os.uname().sysname,"environment_keys":list(env),"workspace":ws})
            return 0
        login = run([executable, "login", "status"])
        env = dotenv(request, root)
        emit({"ready": login.returncode == 0 and version.returncode == 0,
              "message": (login.stdout + login.stderr).strip(), "version": version.stdout.strip(),
              "executable": executable, "os": os.uname().sysname, "environment_keys": list(env), "workspace": ws})
        return 0
    if op in ("execute", "terminal"):
        if op == "terminal":
            executable = "/bin/sh"
        return execute(request, ws, executable)
    raise ValueError("Unsupported remote operation")


if __name__ == "__main__":
    try:
        request = json.loads(sys.stdin.buffer.readline(48 * 1024 * 1024))
        sys.exit(main(request))
    except (OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        print(redact(str(error)), file=sys.stderr, flush=True)
        sys.exit(1)
