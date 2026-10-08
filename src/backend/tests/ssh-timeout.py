"""Real controller/SSH timeout regression; requires a signed-in remote harness.

Set AE_TEST_URL, AE_TEST_KEY and AE_SOURCE_AGENT, then run this script.
Creates its own agent/group/action, invokes three real runs, soft-deletes the
action and agent, and archives the group. Only timeout/Stop may execute `sleep 30`;
no repository files, source profiles, projects or existing groups are edited.
The scheduled timeout uses ten seconds; only the temporary Stop/reply cases use sixty.
AE_RUN_WAIT_SECONDS optionally bounds each run (default 120 seconds).
"""

from __future__ import annotations

import json
import os
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

JsonObject = dict[str, object]
ACTIVE = {"queued", "starting", "running", "waiting"}
SUCCESS_MARKER = "SSH_TIMEOUT_SMOKE_OK"


class SmokeFailure(RuntimeError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SmokeFailure(message)


def as_object(value: object) -> JsonObject:
    require(isinstance(value, dict), "Expected a JSON object from the API")
    return value


def as_objects(value: object) -> list[JsonObject]:
    require(isinstance(value, list), "Expected a JSON array from the API")
    return [as_object(item) for item in value]


def identifier(record: JsonObject) -> str:
    value = record.get("id")
    require(isinstance(value, str) and bool(value), "API record is missing its ID")
    return value


class Api:
    def __init__(self, base: str, key: str) -> None:
        parsed = urlsplit(base)
        require(parsed.scheme in {"http", "https"} and bool(parsed.hostname),
                "AE_TEST_URL must be an HTTP(S) application origin")
        require(not parsed.username and not parsed.password and not parsed.query
                and not parsed.fragment and parsed.path in {"", "/"},
                "AE_TEST_URL must contain only the application origin")
        self.base = base.rstrip("/")
        self.key = key

    def call(self, route: str, data: object = None, method: str = "GET") -> object:
        body = None if data is None else json.dumps(data).encode("utf-8")
        request = Request(self.base + "/api" + route, data=body, method=method,
                          headers={"Authorization": "Bearer " + self.key,
                                   "Content-Type": "application/json"})
        try:
            with urlopen(request, timeout=45) as response:
                raw = response.read(32 * 1024 * 1024 + 1)
            require(len(raw) <= 32 * 1024 * 1024, "API response exceeds 32 MiB")
            return json.loads(raw)
        except HTTPError as error:
            detail = error.read(2000).decode("utf-8", errors="replace")
            raise SmokeFailure(f"{method} {route}: HTTP {error.code}: "
                               + detail.replace(self.key, "[REDACTED]")) from None
        except (URLError, TimeoutError, json.JSONDecodeError) as error:
            raise SmokeFailure(f"{method} {route}: "
                               + str(error).replace(self.key, "[REDACTED]")) from None

    def state(self) -> JsonObject:
        return as_object(self.call("/state"))


def run_events(api: Api, run: JsonObject) -> list[JsonObject]:
    return as_objects(api.call(f"/runs/{identifier(run)}/events"))


def receipt(events: list[JsonObject]) -> JsonObject:
    for event in reversed(events):
        payload = as_object(event.get("payload"))
        line = payload.get("line")
        if event.get("kind") == "run.output" and isinstance(line, str):
            try:
                frame = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(frame, dict) and frame.get("type") == "ae.remote.finished":
                return frame
    raise SmokeFailure("Remote run has no ae.remote.finished completion receipt")


def wait_terminal(api: Api, run_id: str, seconds: float) -> JsonObject:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        run = as_object(api.call(f"/runs/{run_id}"))
        if run.get("status") not in ACTIVE:
            return run
        time.sleep(0.5)
    raise SmokeFailure(f"Run {run_id} did not finish within {seconds:g} seconds")


def submit(api: Api, agent_id: str, group_id: str, prompt: str,
           seconds: float) -> JsonObject:
    message_id = str(uuid.uuid4())
    api.call("/messages", {"id": message_id, "group_id": group_id,
                          "body": prompt, "recipients": [agent_id],
                          "reply_to": None, "artifacts": []}, "POST")
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        matches = [run for run in as_objects(api.state().get("runs"))
                   if run.get("message_id") == message_id]
        if matches:
            require(len(matches) == 1, "Smoke request created unexpected additional runs")
            return matches[0]
        time.sleep(0.5)
    raise SmokeFailure(f"Message {message_id} did not create an observable run")


def wait_action(api: Api, action_id: str, seconds: float, *, dispatched: bool) -> JsonObject:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        action = next((item for item in as_objects(api.state().get("actions"))
                       if item.get("id") == action_id), None)
        require(action is not None, f"Temporary action {action_id} disappeared")
        if dispatched and isinstance(action.get("run_id"), str):
            return action
        if action.get("status") not in {"scheduled", "queued", "running"}:
            require(not dispatched, "Scheduled action failed before dispatch: " + json.dumps(action))
            return action
        time.sleep(0.5)
    raise SmokeFailure(f"Action {action_id} did not transition within {seconds:g} seconds")


def evidence(run: JsonObject, remote: JsonObject) -> JsonObject:
    return {key: run.get(key) for key in
            ("id", "status", "started_at", "ended_at", "remote_pid", "exit_code", "error")} | {
                "remote_receipt_status": remote.get("status"),
                "remote_receipt_exit_code": remote.get("exit_code")}


def cleanup(api: Api, agent_id: str, group_id: str, action_id: str) -> JsonObject:
    state = api.state()
    action = next((item for item in as_objects(state.get("actions"))
                   if item.get("id") == action_id), None)
    if action and action.get("status") in {"scheduled", "queued", "running"}:
        action = as_object(api.call(f"/actions/{action_id}/cancel", {}, "POST"))
        if isinstance(action.get("run_id"), str):
            wait_terminal(api, action["run_id"], 45)
        state = api.state()
    runs = [run for run in as_objects(state.get("runs"))
            if run.get("agent_id") == agent_id and run.get("group_id") == group_id]
    for run in runs:
        if run.get("status") in ACTIVE:
            run_id = identifier(run)
            try:
                api.call(f"/runs/{run_id}/cancel", {}, "POST")
            except SmokeFailure:
                require(as_object(api.call(f"/runs/{run_id}")).get("status") not in ACTIVE,
                        f"Could not cancel temporary run {run_id}; cleanup stopped")
            wait_terminal(api, run_id, 45)
    state = api.state()
    require(not any(run.get("agent_id") == agent_id and run.get("status") in ACTIVE
                    for run in as_objects(state.get("runs"))),
            "Temporary agent still has active work; cleanup stopped")
    if action:
        wait_action(api, action_id, 45, dispatched=False)
        api.call(f"/actions/{action_id}", method="DELETE")
    archived = any(group.get("id") == group_id for group in as_objects(state.get("groups")))
    if archived:
        api.call(f"/groups/{group_id}/archive", {}, "POST")
    deleted = any(agent.get("id") == agent_id for agent in as_objects(state.get("agents")))
    if deleted:
        api.call(f"/agents/{agent_id}", method="DELETE")
    return {"action_soft_deleted": action is not None,
            "group_archived": archived, "agent_soft_deleted": deleted}


def main() -> None:
    base, key, source_id = (os.environ.get(name, "").strip() for name in
                            ("AE_TEST_URL", "AE_TEST_KEY", "AE_SOURCE_AGENT"))
    require(bool(base and key and source_id),
            "Set AE_TEST_URL, AE_TEST_KEY and AE_SOURCE_AGENT before running")
    wait_seconds = float(os.environ.get("AE_RUN_WAIT_SECONDS", "120"))
    require(30 <= wait_seconds <= 600, "AE_RUN_WAIT_SECONDS must be between 30 and 600")
    api = Api(base, key)
    initial = api.state()
    source = next((agent for agent in as_objects(initial.get("agents"))
                   if agent.get("id") == source_id), None)
    require(source is not None, "AE_SOURCE_AGENT must identify an active source agent")
    workspace = source.get("workdir")
    if source.get("project_id"):
        project_group = next((group for group in as_objects(initial.get("groups"))
                              if group.get("id") == source.get("project_id")), None)
        require(project_group is not None, "Source agent project is unavailable")
        workspace = as_object(project_group.get("project")).get("workdir")
    workspace = as_object(workspace)
    require(bool(workspace.get("ssh_host")) and not workspace.get("runtime_id"),
            "This regression requires a controller/SSH source workdir")
    require(not any(run.get("status") in ACTIVE and
                    as_object(run.get("profile")).get("workdir") == workspace
                    for run in as_objects(initial.get("runs"))),
            "Source workdir has active runs; wait before starting the smoke test")
    suffix = uuid.uuid4().hex[:12]
    agent_id, group_id = "ssh-timeout-" + suffix, "ssh-timeout-group-" + suffix
    action_id = "ssh-timeout-action-" + suffix
    agent = dict(source)
    agent.update(id=agent_id, name="SSH timeout smoke " + suffix, position="Verification",
                 project_id=None, reports_to=None, runtime_id=None, workdir=workspace,
                 timeout_seconds=10, enabled=True, deleted_at=None, revision=0,
                 agents_md="", instructions="Run only the requested smoke operation. "
                 "Never delegate, train, inspect or modify repository files. "
                 "The only permitted shell operation is sleep 30 when explicitly requested.")
    proof: JsonObject = {"source_agent": source_id, "temporary_agent": agent_id,
                         "temporary_group": group_id, "temporary_action": action_id,
                         "harness": agent.get("harness"),
                         "model": agent.get("model"), "permission": agent.get("permission"),
                         "mocks": False, "result": "failed"}
    try:
        agent = as_object(api.call("/agents", agent, "POST"))
        require(agent.get("project_id") is None and agent.get("reports_to") is None
                and agent.get("agents_md") == "" and agent.get("permission") == source.get("permission"),
                "Temporary agent inherited project context or changed the source access mode")
        group = as_object(api.call("/groups", {"id": group_id, "name": "SSH timeout smoke " + suffix,
                                             "description": "Real SSH timeout and Stop regression",
                                             "member_ids": [agent_id], "project": None,
                                             "scope_levels": None, "chat_lead_id": None}, "POST"))
        require(group.get("member_ids") == [agent_id] and group.get("project") is None,
                "Temporary group membership is not isolated")
        sleep_prompt = ("Use the real shell execution tool to run exactly sleep 30 once "
                        "and wait for it. Do not inspect or change any files, call external "
                        "services, train, delegate or request user input. Reply WAIT_COMPLETE "
                        "only after the command completes.")
        planned_start = (datetime.now(timezone.utc) + timedelta(seconds=5)).isoformat()
        scheduled = as_object(api.call("/actions", {
            "id": action_id, "revision": 0, "group_id": group_id,
            "title": "SSH scheduled timeout regression", "body": sleep_prompt,
            "assignee_id": agent_id, "planned_start": planned_start,
        }, "POST"))
        require(scheduled.get("status") == "scheduled" and scheduled.get("run_id") is None,
                "Action was not saved as a future scheduler assignment")
        scheduled = wait_action(api, action_id, wait_seconds, dispatched=True)
        timeout_run = wait_terminal(api, scheduled["run_id"], wait_seconds)
        timeout_events = run_events(api, timeout_run)
        timeout_receipt = receipt(timeout_events)
        proof["timeout"] = evidence(timeout_run, timeout_receipt)
        require(timeout_run.get("status") == "timed_out", "Expected timed_out: "
                + json.dumps(proof["timeout"]))
        error = timeout_run.get("error")
        require(isinstance(error, str) and "10" in error and "timeout" in error.lower(),
                "Timed-out run must explain its 10 second timeout")
        require(timeout_receipt.get("status") in {"cancelled", "timed_out"},
                "Expected a confirmed stop receipt from the real SSH bridge")
        require(not any(event.get("kind") == "run.cancel_requested" for event in timeout_events),
                "Timeout unexpectedly recorded a manual cancel request")
        require(isinstance(timeout_run.get("remote_pid"), int), "Timeout never started remotely")
        scheduled = wait_action(api, action_id, wait_seconds, dispatched=False)
        proof["scheduled_action"] = {key: scheduled.get(key) for key in
                                     ("id", "status", "planned_start", "run_id", "error")}
        require(scheduled.get("status") == "failed" and scheduled.get("error") == error
                and scheduled.get("run_id") == identifier(timeout_run),
                "Scheduled action must retain the timeout failure: "
                + json.dumps(proof["scheduled_action"]))
        # Keep explicit Stop independent of the ten-second timeout under provider/API load.
        agent["timeout_seconds"] = 60
        api.call(f"/agents/{agent_id}", agent, "PUT")
        stop_run = submit(api, agent_id, group_id, sleep_prompt, wait_seconds)
        deadline = time.monotonic() + wait_seconds
        while time.monotonic() < deadline:
            stop_run = as_object(api.call(f"/runs/{identifier(stop_run)}"))
            require(stop_run.get("status") in ACTIVE, "Stop run ended before explicit cancellation")
            if isinstance(stop_run.get("remote_pid"), int):
                break
            time.sleep(0.2)
        require(isinstance(stop_run.get("remote_pid"), int), "Stop run did not start remotely")
        api.call(f"/runs/{identifier(stop_run)}/cancel", {}, "POST")
        stop_run = wait_terminal(api, identifier(stop_run), wait_seconds)
        stop_events = run_events(api, stop_run)
        stop_receipt = receipt(stop_events)
        proof["manual_stop"] = evidence(stop_run, stop_receipt)
        require(stop_run.get("status") == "cancelled" and stop_receipt.get("status") == "cancelled",
                "Explicit Stop must remain cancelled: " + json.dumps(proof["manual_stop"]))
        require(any(event.get("kind") == "run.cancel_requested" for event in stop_events),
                "Explicit Stop did not record run.cancel_requested")
        success_run = submit(api, agent_id, group_id, "Do not use tools. Reply with exactly "
                             + SUCCESS_MARKER + " and nothing else.", wait_seconds)
        success_run = wait_terminal(api, identifier(success_run), wait_seconds)
        success_receipt = receipt(run_events(api, success_run))
        proof["normal_completion"] = evidence(success_run, success_receipt)
        require(success_run.get("status") == "succeeded", "Normal reply failed: "
                + json.dumps(proof["normal_completion"]))
        require(str(success_run.get("output", "")).strip() == SUCCESS_MARKER,
                "Normal run did not return the requested bounded reply")
        require(success_receipt.get("status") is None and success_receipt.get("exit_code") == 0,
                "Normal run has no clean SSH completion receipt")
        final_source = next((current for current in as_objects(api.state().get("agents"))
                             if current.get("id") == source_id), None)
        require(final_source == source, "Source profile changed during verification")
        proof["source_profile_unchanged"] = True
        proof["result"] = "passed"
    finally:
        try:
            proof["cleanup"] = cleanup(api, agent_id, group_id, action_id)
        except SmokeFailure as error:
            proof["result"] = "cleanup_failed"
            proof["cleanup"] = {"error": str(error), "group": group_id, "agent": agent_id}
            print(json.dumps(proof, indent=2), flush=True)
            raise
        print(json.dumps(proof, indent=2), flush=True)


if __name__ == "__main__":
    try:
        main()
    except (SmokeFailure, ValueError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        sys.exit(1)
