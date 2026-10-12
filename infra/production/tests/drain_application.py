"""Exercise the helper control client against an isolated, running controller."""
from __future__ import annotations

import importlib.util
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import threading
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import uuid


org = Path(os.environ["AE_TEST_ORG"])
base = os.environ["AE_TEST_API_URL"]
host = os.environ["AE_TEST_HOST"]
assert base == "http://127.0.0.1:8765" and host == "127.0.0.1:18768"
assert org == Path("/org")
token = (org / ".state/owner.key").read_text().strip()
spec = importlib.util.spec_from_file_location("release", Path(__file__).parents[1] / "release.py")
assert spec and spec.loader
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


def application(route: str, body: dict | None = None) -> dict | list:
    request = Request(base + "/api" + route,
                      data=None if body is None else json.dumps(body).encode(),
                      headers={"Host": host, "Authorization": "Bearer " + token,
                               "Content-Type": "application/json"})
    with urlopen(request, timeout=10) as response:
        return json.load(response)


class HostAdapter(BaseHTTPRequestHandler):
    # Production keeps its fixed Host. Only this loopback transport adapts it to the test origin.
    def do_GET(self) -> None:
        self.forward()

    def do_POST(self) -> None:
        self.forward()

    def forward(self) -> None:
        assert self.path == "/api/deployment-drain"
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        request = Request(base + self.path, data=body if self.command == "POST" else None,
                          headers={"Host": host, "Authorization": self.headers["Authorization"],
                                   "Content-Type": "application/json"}, method=self.command)
        try:
            response = urlopen(request, timeout=10)
        except HTTPError as error:
            response = error
        with response:
            content = response.read()
            self.send_response(response.code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)

    def log_message(self, *_args: object) -> None:
        pass


def terminal(command: str) -> str:
    run = application("/agents/ceo/terminal", {"id": str(uuid.uuid4()), "command": command})
    return run["id"]


def completed(run_id: str) -> dict:
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        run = application("/agents/ceo/terminal/" + run_id)
        if run["status"] != "running":
            assert run["status"] == "completed" and run["exit_code"] == 0
            return run
        time.sleep(0.05)
    raise AssertionError("Actual terminal did not complete")


server = ThreadingHTTPServer(("127.0.0.1", 0), HostAdapter)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
control_base = "http://127.0.0.1:" + str(server.server_port)
generation = None
proof = {"controller": "real application", "transport": "physical loopback Host adapter",
         "provider": "not invoked", "internal_modules_mocked": False}
try:
    assert release.drain_request(token, base=control_base)["phase"] == "open"
    run_id = terminal("sleep 2; printf 'helper-accepted-proof'")
    generation = str(uuid.uuid4())
    started = time.monotonic()
    state = release.begin_and_seal_drain(token, generation, timeout=10, interval=0.1, base=control_base)
    assert state["phase"] == "sealed" and state["active_operations"] == 0
    assert "helper-accepted-proof" in completed(run_id)["output"]
    proof["accepted_terminal_finished_before_seal"] = True
    proof["wait_seconds"] = round(time.monotonic() - started, 3)
    try:
        release.resume_drain(token, str(uuid.uuid4()), base=control_base)
    except release.ReleaseError:
        proof["foreign_resume_refused"] = True
    else:
        raise AssertionError("Foreign resume was accepted")
    assert release.resume_drain(token, generation, base=control_base)["phase"] == "open"
    generation = None
    run_id = terminal("sleep 3; printf 'helper-timeout-preserved-proof'")
    generation = str(uuid.uuid4())
    try:
        release.begin_and_seal_drain(token, generation, timeout=1, interval=0.1, base=control_base)
    except release.ReleaseError as error:
        assert "release aborted without stopping work" in str(error)
    else:
        raise AssertionError("Active work was sealed before timeout")
    assert application("/agents/ceo/terminal/" + run_id)["status"] == "running"
    assert release.resume_drain(token, generation, base=control_base)["phase"] == "open"
    generation = None
    assert "helper-timeout-preserved-proof" in completed(run_id)["output"]
    proof["timeout_preserved_actual_work"] = True
    proof["short_test_deadlines_seconds"] = [10, 1]
    proof["production_deadline_seconds"] = 900
    output = org / ".state/verification/deployment-drain-helper"
    output.mkdir(parents=True, exist_ok=True)
    (output / "proof.json").write_text(json.dumps(proof, indent=2) + "\n")
    print(json.dumps({"result": "passed", **proof}))
finally:
    if generation:
        state = release.drain_request(token, base=control_base)
        if state["phase"] != "open" and state["generation"] == generation:
            release.resume_drain(token, generation, base=control_base)
    server.shutdown()
    server.server_close()
    thread.join(timeout=5)
