"""Real local controller checks for Windows installer and Linux HTTP error handling.

Requires AE_TEST_BINARY and Windows PowerShell 7; never uses production or a provider.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import sqlite3
import subprocess
import time
import urllib.error
import urllib.request

repo = Path(__file__).resolve().parents[3]
root = Path(os.environ["AE_TEST_OUTPUT"]).resolve()
binary = Path(os.environ["AE_TEST_BINARY"]).resolve()
pwsh = os.environ.get("AE_TEST_PWSH", "pwsh")
bash = os.environ.get("AE_TEST_BASH", r"C:\Program Files\Git\bin\bash.exe")
port = int(os.environ.get("AE_TEST_PORT", "18796"))
base = f"http://127.0.0.1:{port}"
root.mkdir(parents=True, exist_ok=True)
org = root / "org"
work = root / "project"
work.mkdir(exist_ok=True)
checks: list[dict[str, object]] = []
env = {k: v for k, v in os.environ.items() if not k.startswith("AE_")}
env.update(AE_PUBLIC_URL=base, CODEX_HOME=str(root / "empty-codex"),
           AE_ANTIGRAVITY=str(root / "no-agy.exe"), AE_OPENCODE=str(root / "no-opencode.exe"))
log = (root / "controller.log").open("w")
controller = subprocess.Popen([str(binary), "--org", str(org), "--port", str(port),
    "--bind", "127.0.0.1", "--frontend", str(repo / "src/frontend/dist"),
    "--codex", str(root / "no-codex.exe")], env=env, stdout=log,
    stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NO_WINDOW)

def call(path: str, token: str = "", body: object = None) -> tuple[int, bytes]:
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Origin": base}
    if token:
        headers["Authorization"] = "Bearer " + token
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(base + path, data=data, headers=headers)
    try:
        response = urllib.request.urlopen(req, timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, response.read()

def check(name: str, condition: bool) -> None:
    if not condition:
        raise AssertionError(name)
    checks.append({"check": name, "passed": True})

try:
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        try:
            if call("/api/health")[0] == 200:
                break
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(.5)
    else:
        raise RuntimeError("Local controller did not start")
    compose_env = env | {"AE_PLATFORM_IMAGE": "registry.example/platform@sha256:" + "a" * 64,
        "AE_PUBLIC_URL": "https://controller.example", "AE_MATRIX_BOT_PASSWORD": "local-config-test-only",
        "AE_MATRIX_SERVER_NAME": "matrix.example", "AE_SSH_KEY_FILE": str(root / "fixture.key")}
    rendered = subprocess.run(["docker", "compose", "-f", str(repo / "infra/production/compose.yaml"),
                               "config", "--format", "json"],
                              env=compose_env, capture_output=True, text=True, timeout=30)
    check("Production Compose renders", rendered.returncode == 0)
    configuration = json.loads(rendered.stdout)
    check("Inventory reaches container with persistent-volume path",
          configuration["services"]["platform"]["environment"]["AE_WORKER_PACKAGE_DIR"]
          == "/data/worker-packages/current")
    compose_env["AE_WORKER_PACKAGE_DIR"] = "/data/worker-packages/" + "a" * 40
    rendered = subprocess.run(["docker", "compose", "-f", str(repo / "infra/production/compose.yaml"),
                               "config", "--format", "json"],
                              env=compose_env, capture_output=True, text=True, timeout=30)
    check("Pinned release reaches container",
          rendered.returncode == 0 and json.loads(rendered.stdout)["services"]["platform"]
          ["environment"]["AE_WORKER_PACKAGE_DIR"] == compose_env["AE_WORKER_PACKAGE_DIR"])
    owner = (org / ".state/owner.key").read_text().strip()
    code, data = call("/api/runtimes", owner, {"name": "package-error-local"})
    check("Real runtime registered locally", code == 200)
    pending = json.loads(data)
    token = pending["enrollment_token"]
    cases = [("invalid", "invalid-local-token", 401), ("unavailable", token, 503)]
    linux = (repo / "src/scripts/setup-worker.sh").read_text()
    helper = "package_request() {" + linux.split("package_request() {", 1)[1].split("\n}\n", 1)[0] + "\n}\n"
    for name, credential, expected in cases:
        code, _ = call("/api/runtime/packages/windows-x64/manifest", credential)
        check(f"Real endpoint returns {expected}: {name}", code == expected)
        child_env = env | {"AE_ENROLLMENT_TOKEN": credential}
        result = subprocess.run([pwsh, "-NoProfile", "-File",
            str(repo / "src/scripts/setup-worker.ps1"), "-Controller", base,
            "-Workdir", str(work), "-InstallDir", str(root / ("install-" + name))],
            env=child_env, capture_output=True, text=True, timeout=90)
        output = result.stdout + result.stderr
        check(f"Windows reports HTTP {expected}: {name}",
              result.returncode != 0 and f"HTTP {expected}" in output)
        check(f"Windows hides token: {name}", credential not in output)
        if expected == 503:
            check("Package failure does not ask for replacement token",
                  "Replacing your token will not fix package availability" in output)
        check(f"No enrollment on failure: {name}",
              not (root / ("install-" + name) / "state/registration.json").exists())
        (root / ("windows-" + name + ".log")).write_text(output)
        auth = root / ("linux-" + name)
        auth.mkdir(exist_ok=True)
        (auth / "auth").write_text('header = "Authorization: Bearer ' + credential + '"\n')
        shell = 'set -euo pipefail\nfail() { printf "%s\n" "$*" >&2; exit 1; }\ntemp="$AE_TEST_AUTH_DIR"\n'
        shell += helper + 'package_request "$AE_TEST_URL/api/runtime/packages/linux-arm64/manifest" "$AE_TEST_BODY"\n'
        shell_env = env | {"AE_TEST_AUTH_DIR": auth.as_posix(),
                          "AE_TEST_URL": base, "AE_TEST_BODY": (auth / "body").as_posix()}
        result = subprocess.run([bash, "--noprofile", "--norc", "-c", shell],
                                env=shell_env, capture_output=True, text=True, timeout=30)
        output = result.stdout + result.stderr
        check(f"Linux package HTTP function reports {expected}",
              result.returncode != 0 and f"HTTP {expected}" in output)
        check(f"Linux hides token: {name}", credential not in output)
    with sqlite3.connect(org / ".state/app.sqlite3") as db:
        db.execute("UPDATE metadata SET value=json_set(value,'$.expires',0) WHERE key=?",
                   ("runtime:" + pending["id"],))
        db.commit()
    check("Expired pending token returns 401",
          call("/api/runtime/packages/windows-x64/manifest", token)[0] == 401)
    with sqlite3.connect(org / ".state/app.sqlite3") as db:
        check("No agent runs created", db.execute("SELECT COUNT(*) FROM runs").fetchone()[0] == 0)
        check("No jobs claimed or queued", db.execute("SELECT COUNT(*) FROM fleet_jobs").fetchone()[0] == 0)
    receipt = {"checks": checks, "agent_runs": 0, "production_access": False,
               "linux_scope": "Exact package HTTP function against real local controller; no ARM64 service claim"}
    (root / "receipt.json").write_text(json.dumps(receipt, indent=2))
    print(f"{len(checks)} real local error-path checks passed; 0 agent runs")
finally:
    controller.terminate()
    try:
        controller.wait(timeout=15)
    except subprocess.TimeoutExpired:
        controller.kill()
        controller.wait()
    log.close()
