"""Exercise the production Unix bridge with real owned and unrelated processes.

No provider request is made. A discovery-only CLI fixture supplies the unavailable
Codex executable; attempting to execute it fails. Linux's subreaper is used only
by this test harness to reap its adopted fixture children after bridge cleanup.
"""
from __future__ import annotations

import ctypes
import hashlib
import json
import os
from pathlib import Path
import selectors
import shlex
import signal
import subprocess
import sys
import tempfile
import time
import uuid

SOURCE = Path(__file__).resolve().parents[1] / "src" / "remote_bridge.py"
WORKER = '''import json, os, signal, subprocess, sys, time
from pathlib import Path
signal.signal(signal.SIGTERM, signal.SIG_IGN)
def identity(pid):
    fields = Path(f"/proc/{pid}/stat").read_text().rsplit(") ", 1)[1].split()
    return {"pid":pid, "pgid":int(fields[2]), "start_ticks":int(fields[19])}
if sys.argv[1] == "child":
    while True: time.sleep(1)
child = subprocess.Popen([sys.executable, __file__, "child"])
Path(sys.argv[2]).write_text(json.dumps([identity(os.getpid()), identity(child.pid)]))
if sys.argv[1] == "complete": sys.exit(0)
while True: time.sleep(1)
'''


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def process_state(identity: dict[str, int]) -> str:
    try:
        fields = Path(f"/proc/{identity['pid']}/stat").read_text().rsplit(") ", 1)[1].split()
    except FileNotFoundError:
        return "gone"
    if int(fields[19]) != identity["start_ticks"]:
        return "identity_reused"
    return fields[0]


def wait_frame(process: subprocess.Popen[bytes], seconds: float) -> dict[str, object]:
    require(process.stdout is not None, "Bridge stdout is required")
    with selectors.DefaultSelector() as selector:
        selector.register(process.stdout, selectors.EVENT_READ)
        require(bool(selector.select(seconds)), "Bridge did not publish its started receipt")
        frame = process.stdout.readline()
    require(bool(frame), "Bridge exited before publishing its started receipt")
    return json.loads(frame)


def run_case(case: str, directory: Path) -> dict[str, object]:
    home, workdir = directory / "home", directory / "workdir"
    cli = home / ".local/bin/codex"
    cli.parent.mkdir(parents=True)
    cli.write_text("#!/bin/sh\necho 'Provider fixture must never execute' >&2\nexit 97\n")
    cli.chmod(0o700)
    workdir.mkdir()
    worker, receipt = workdir / "worker.py", workdir / "owned.json"
    worker.write_text(WORKER)
    command = shlex.join([sys.executable, str(worker),
                          "complete" if case == "completed_leader" else "sleep", str(receipt)])
    request = {"op": "terminal", "path": str(workdir), "namespace": "process-ownership-audit",
               "session_id": str(uuid.uuid4()), "run_id": str(uuid.uuid4()),
               "instructions": "", "command": "exec " + command,
               "timeout_seconds": 1 if case == "timeout" else 90}
    env = dict(os.environ, HOME=str(home))
    control = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(120)"],
                               start_new_session=True)
    bridge = subprocess.Popen([sys.executable, "-B", str(SOURCE)], env=env,
                              stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    owned: list[dict[str, int]] = []
    try:
        require(bridge.stdin is not None, "Bridge stdin is required")
        bridge.stdin.write(json.dumps(request).encode() + b"\n")
        bridge.stdin.flush()
        started = wait_frame(bridge, 10)
        require(started.get("type") == "ae.remote.started", f"Unexpected receipt: {started}")
        deadline = time.monotonic() + 5
        while not receipt.exists() and time.monotonic() < deadline:
            time.sleep(0.01)
        require(receipt.exists(), "Owned process did not create its PID receipt")
        while time.monotonic() < deadline:
            try:
                owned = json.loads(receipt.read_text())
                break
            except json.JSONDecodeError:
                time.sleep(0.01)
        require(len(owned) == 2, "Fixture must launch a parent and child")
        require(all(item["pgid"] == started["pid"] for item in owned),
                "Fixture descendants must belong to the bridge-owned group")
        if case != "completed_leader":
            require(all(process_state(item) not in {"gone", "Z", "identity_reused"} for item in owned),
                    "Both captured fixture processes must be executing before the trigger")
        begin = time.monotonic()
        if case == "cancel":
            bridge.stdin.write(b"cancel\n")
            bridge.stdin.flush()
        elif case == "disconnect":
            bridge.stdin.close()
        bridge.wait(timeout=25)
        elapsed = time.monotonic() - begin
        require(bridge.stdout is not None and bridge.stderr is not None, "Bridge pipes required")
        stderr = bridge.stderr.read().decode()
        frames = [json.loads(line) for line in bridge.stdout.read().splitlines()]
        finished = next((frame for frame in frames if frame.get("type") == "ae.remote.finished"), None)
        require(finished is not None, "Bridge must publish its completion receipt: " + stderr)
        expected = {"cancel": "cancelled", "timeout": "timed_out", "disconnect": "interrupted",
                    "heartbeat_stall": "interrupted", "completed_leader": None}[case]
        require(finished["status"] == expected, f"Wrong terminal cause: {finished}; {stderr}")
        require(bridge.returncode == (0 if expected is None else 1), f"Wrong exit status: {stderr}")
        require(14 <= elapsed <= 23 if case == "heartbeat_stall" else elapsed < 10,
                f"Termination budget exceeded: {case} {elapsed:.3f}s")
        states = [{**item, "state": process_state(item)} for item in owned]
        require(all(item["state"] in {"gone", "Z", "identity_reused"} for item in states),
                f"Owned descendants still executing: {states}")
        require(process_state(owned[0]) == "gone", "Bridge must reap its direct group leader")
        require(control.poll() is None, "Stopping one run must preserve unrelated process groups")
        return {"case": case, "status": expected, "elapsed_seconds": round(elapsed, 3),
                "group_id": started["pid"], "owned_processes": states, "unrelated_process_alive": True}
    finally:
        if bridge.poll() is None:
            if bridge.stdin is not None and not bridge.stdin.closed:
                try:
                    bridge.stdin.write(b"cancel\n")
                    bridge.stdin.flush()
                except BrokenPipeError:
                    pass
            try:
                bridge.wait(timeout=10)
            except subprocess.TimeoutExpired:
                bridge.kill()
                bridge.wait(timeout=5)
        for item in owned:
            if process_state(item) not in {"gone", "Z", "identity_reused"}:
                os.kill(item["pid"], signal.SIGKILL)
            try:
                os.waitpid(item["pid"], 0)
            except ChildProcessError:
                pass
        control.terminate()
        control.wait(timeout=5)
        for stream in (bridge.stdin, bridge.stdout, bridge.stderr):
            if stream is not None and not stream.closed:
                stream.close()


def main() -> None:
    require(sys.platform.startswith("linux"), "Run on Linux with Python 3.11+ and /proc")
    libc = ctypes.CDLL(None, use_errno=True)
    require(libc.prctl(36, 1, 0, 0, 0) == 0, "Could not enable test-only child subreaping")
    results = []
    with tempfile.TemporaryDirectory(prefix="ae-process-ownership-") as temporary:
        root = Path(temporary)
        for case in ("cancel", "timeout", "disconnect", "heartbeat_stall", "completed_leader"):
            case_dir = root / case
            case_dir.mkdir()
            result = run_case(case, case_dir)
            results.append(result)
            print(json.dumps(result), flush=True)
    print(json.dumps({"status": "passed", "scenarios": len(results),
                      "source_sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
                      "process_mocks": 0, "provider_calls": 0,
                      "cli_fixture": "discovery only; execution fails",
                      "production_contacted": False}), flush=True)


if __name__ == "__main__":
    main()
