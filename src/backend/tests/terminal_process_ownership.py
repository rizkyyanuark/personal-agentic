"""Real candidate-app local Terminal API ownership check; no agent/provider turn.

Requires an isolated Linux candidate with a valid local model catalog and an
existing writable workdir. Profiles are paused and archived after verification.
The owner key is read from a private file and never included in proof output.
"""
from __future__ import annotations

import argparse
import http.cookiejar
import json
from pathlib import Path
import shlex
import time
import uuid
from urllib.error import HTTPError
from urllib.request import HTTPCookieProcessor, Request, build_opener
from urllib.parse import urlparse


class Api:
    def __init__(self, base: str, owner_file: Path):
        self.base = base.rstrip("/")
        parsed = urlparse(self.base)
        require(parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost"},
                "Use a loopback-only candidate URL")
        self.client = build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.call("/login", {"token": owner_file.read_text().strip()}, "POST")

    def call(self, route: str, data: object = None, method: str = "GET"):
        body = None if data is None else json.dumps(data).encode()
        request = Request(self.base + "/api" + route, data=body, method=method,
                          headers={"Content-Type": "application/json", "Origin": self.base})
        with self.client.open(request, timeout=15) as response:
            return json.load(response)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def terminal(api: Api, agent: str, run: str) -> dict:
    return api.call(f"/agents/{agent}/terminal/{run}")


def wait_terminal(api: Api, agent: str, run: str, seconds: float = 15) -> dict:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        value = terminal(api, agent, run)
        if value["status"] != "running":
            return value
        time.sleep(0.1)
    raise AssertionError("Terminal did not reach a persisted terminal state")


def start(api: Api, agent: str, command: str) -> dict:
    return api.call(f"/agents/{agent}/terminal", {"id": str(uuid.uuid4()), "command": command}, "POST")


def identity_command(heartbeat: bool = False) -> str:
    command = ("sleep 120 & child=$!; "
               "printf '{\"leader_pid\":%s,\"child_pid\":%s,\"pgid\":%s,\"leader_ticks\":%s,\"child_ticks\":%s}\\n' "
               '"$$" "$child" "$(awk \'{print $5}\' /proc/$$/stat)" '
               '"$(awk \'{print $22}\' /proc/$$/stat)" "$(awk \'{print $22}\' /proc/$child/stat)"; ')
    return command + ("while :; do printf 'control-live\\n'; sleep 0.2; done" if heartbeat else "wait")


def wait_identity(api: Api, agent: str, run: str) -> tuple[dict, dict]:
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        value = terminal(api, agent, run)
        lines = value["output"].splitlines()
        if lines:
            metadata = json.loads(lines[0])
            require(all(isinstance(item, int) and item > 0 for item in metadata.values()),
                    "Expected actual positive Unix process identities")
            return value, metadata
        require(value["status"] == "running", "Terminal failed before PID metadata was captured")
        time.sleep(0.1)
    raise AssertionError("Terminal did not stream process identity metadata")


def probe_command(metadata: dict, control: dict) -> str:
    checks = [("leader", metadata["leader_pid"], metadata["leader_ticks"]),
              ("child", metadata["child_pid"], metadata["child_ticks"]),
              ("control", control["leader_pid"], control["leader_ticks"])]
    return "; ".join(
        f"if [ -r /proc/{pid}/stat ]; then "
        f"awk -v role={role} -v expected={ticks} "
        "'{if ($22 != expected) print role \":identity_reused\"; else print role \":\" $3}' "
        f"/proc/{pid}/stat; else printf '{role}:gone\\n'; fi"
        for role, pid, ticks in checks)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--owner-file", type=Path, required=True)
    parser.add_argument("--workdir", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--reasoning", default="medium")
    parser.add_argument("--require-reaped-child", action="store_true")
    args = parser.parse_args()
    api = Api(args.url, args.owner_file)
    suffix = str(uuid.uuid4())
    owned_agent, control_agent = "agt-owned-" + suffix, "agt-control-" + suffix
    folder = args.workdir.rstrip("/") + "/agt-" + suffix
    state = api.call("/state")
    template = next(agent for agent in state["agents"] if agent.get("deleted_at") is None)
    profiles: list[str] = []
    runs: list[tuple[str, str]] = []
    proof = {"candidate_url": args.url, "agent_turns": 0, "provider_calls": 0}
    try:
        agent = dict(template, id=owned_agent, name="AGT owned process audit", reports_to=None,
                     project_id=None, runtime_id=None, harness="codex", model=args.model,
                     reasoning=args.reasoning, enabled=False, deleted_at=None, revision=0,
                     timeout_seconds=10, permission="workspace-write", instructions="", agents_md="",
                     workdir={"path": args.workdir, "canonical_path": args.workdir,
                              "runtime_id": None, "ssh_host": None, "git_root": None})
        agent = api.call("/agents", agent, "POST")
        profiles.append(owned_agent)
        setup = start(api, owned_agent, "mkdir -p " + shlex.quote(folder + "/owned") + " " + shlex.quote(folder + "/control"))
        runs.append((owned_agent, setup["id"]))
        require(wait_terminal(api, owned_agent, setup["id"])["status"] == "completed", "Workdir setup failed")
        agent["workdir"]["path"] = agent["workdir"]["canonical_path"] = folder + "/owned"
        agent = api.call("/agents/" + owned_agent, agent, "PUT")
        second = dict(agent, id=control_agent, name="AGT unrelated process audit", revision=0,
                      timeout_seconds=120, workdir={**agent["workdir"], "path": folder + "/control", "canonical_path": folder + "/control"})
        api.call("/agents", second, "POST")
        profiles.append(control_agent)
        owned = start(api, owned_agent, identity_command())
        runs.append((owned_agent, owned["id"]))
        _, owned_ids = wait_identity(api, owned_agent, owned["id"])
        independent = start(api, control_agent, identity_command(True))
        runs.append((control_agent, independent["id"]))
        before, control_ids = wait_identity(api, control_agent, independent["id"])
        require(owned_ids["pgid"] == owned_ids["leader_pid"], "Owned shell must lead its own process group")
        require(control_ids["pgid"] != owned_ids["pgid"], "Independent command must have a distinct group")
        anonymous = Request(api.base + f"/api/agents/{owned_agent}/terminal/{owned['id']}/stop",
                            data=b"{}", method="POST", headers={"Content-Type": "application/json", "Origin": api.base})
        try:
            build_opener().open(anonymous, timeout=15)
            raise AssertionError("Anonymous Stop must fail authentication")
        except HTTPError as error:
            require(error.code == 401, "Unexpected unauthenticated Stop response")
        try:
            api.call(f"/agents/{control_agent}/terminal/{owned['id']}/stop", {}, "POST")
            raise AssertionError("Cross-agent Stop must fail ownership validation")
        except HTTPError as error:
            require(error.code == 400, "Unexpected cross-agent ownership response")
        require(terminal(api, owned_agent, owned["id"])["status"] == "running", "Rejected Stop changed the owned run")
        began = time.monotonic()
        api.call(f"/agents/{owned_agent}/terminal/{owned['id']}/stop", {}, "POST")
        stopped = wait_terminal(api, owned_agent, owned["id"])
        elapsed = time.monotonic() - began
        require(stopped["status"] == "cancelled" and stopped["ended_at"], "Stop must persist cancelled state and end time")
        require(elapsed < 10, "Explicit local Stop exceeded ten seconds")
        time.sleep(0.4)
        after = terminal(api, control_agent, independent["id"])
        require(after["status"] == "running" and len(after["output"]) > len(before["output"]), "Independent command must continue streaming")
        probe = start(api, owned_agent, probe_command(owned_ids, control_ids))
        runs.append((owned_agent, probe["id"]))
        checked = wait_terminal(api, owned_agent, probe["id"])
        require(checked["status"] == "completed", "Actual /proc identity probe failed")
        observed = dict(line.split(":", 1) for line in checked["output"].splitlines())
        require(observed["leader"] in {"gone", "identity_reused"}, "Direct child must be reaped")
        require(observed["child"] in {"gone", "Z", "identity_reused"}, "Owned child still executing")
        require(observed["control"] not in {"gone", "Z", "identity_reused"}, "Unrelated process no longer alive")
        if args.require_reaped_child:
            require(observed["child"] in {"gone", "identity_reused"}, "Container init must reap the adopted child")
        proof.update(status="passed", stop_seconds=round(elapsed, 3), stopped_run_id=owned["id"],
                     stopped_state=stopped["status"], unrelated_run_id=independent["id"],
                     unrelated_state=after["status"], unrelated_output_grew=True,
                     owned_identities=owned_ids, unrelated_identities=control_ids, observed_states=observed,
                     unauthenticated_stop_http=401, cross_agent_stop_http=400)
    finally:
        for agent_id, run_id in runs:
            if terminal(api, agent_id, run_id)["status"] == "running":
                api.call(f"/agents/{agent_id}/terminal/{run_id}/stop", {}, "POST")
                wait_terminal(api, agent_id, run_id)
        for agent_id in reversed(profiles):
            api.call("/agents/" + agent_id, {}, "DELETE")
        proof["cleanup"] = "all audit terminal runs finished; audit profiles archived"
    print(json.dumps(proof), flush=True)


if __name__ == "__main__":
    main()
