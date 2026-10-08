import assert from "node:assert/strict";
import test from "node:test";
import { resolveCockpitWorkspace } from "../src/cockpitWorkspace.ts";

const workdir = (path, ssh_host = null, canonical_path = path) => ({ path, canonical_path, ssh_host });
const agent = (id, workdir, extra = {}) => ({ id, workdir, project_id: null, deleted_at: null, ...extra });
const member = (agent_id, extra = {}) => ({ agent_id, in_scope: true, availability: "ready", active_runs: [], ...extra });
const group = (id, workdir = null, extra = {}) => ({ id, archived_at: null, deleted_at: null, project: workdir ? { workdir } : null, ...extra });
const resolve = (extra = {}) => resolveCockpitWorkspace({ workspaceName: "Personal workspace", groupId: null, agents: [], groups: [], runs: [], roster: [], ...extra });

test("active run workdir takes precedence over the Organization profile", () => {
  assert.deepEqual(resolve({
    agents: [agent("a", workdir("/profile"))],
    groups: [group("project", workdir("/project", "ec2"))],
    roster: [member("a", { active_runs: [{ id: "run", group_id: "project" }] })],
    runs: [{ id: "run", agent_id: "a", group_id: "project", profile: agent("a", workdir("/actual/run", "ec2")) }],
  }), { title: "run", detail: "SSH · ec2 · /actual/run" });
});

test("all active workdirs on one agent are represented without selecting one arbitrarily", () => {
  const result = resolve({
    agents: [agent("a", workdir("/profile"))],
    groups: [group("p1", workdir("/p1", "ec2")), group("p2", workdir("/p2", "ec2"))],
    roster: [member("a", { active_runs: [{ id: "r1", group_id: "p1" }, { id: "r2", group_id: "p2" }] })],
    runs: [
      { id: "r1", agent_id: "a", group_id: "p1", profile: agent("a", workdir("/p1", "ec2")) },
      { id: "r2", agent_id: "a", group_id: "p2", profile: agent("a", workdir("/p2", "ec2")) },
    ],
  });
  assert.equal(result.title, "Beberapa workdir");
  assert.match(result.detail, /\/p1\nSSH · ec2 · \/p2/);
});

test("active run beyond the recent-run list inherits its known project, while an unknown group cannot expose defaults", () => {
  const input = {
    agents: [agent("a", workdir("/profile"))],
    groups: [group("project", workdir("/active/project", "ec2"))],
    roster: [member("a", { active_runs: [{ id: "older", group_id: "project" }] })],
  };
  assert.deepEqual(resolve(input), { title: "project", detail: "SSH · ec2 · /active/project" });
  assert.equal(resolve({ ...input, groups: [] }).title, "Personal workspace");
});

test("selected project supplies its current remote workdir before its status snapshot arrives", () => {
  assert.deepEqual(resolve({
    groupId: "project", groups: [group("project", workdir("/home/ubuntu/projects/finetuned_llm/", "ec2"))],
    agents: [agent("old", workdir("C:\\unrelated"))], roster: [member("old", { in_scope: false })],
  }), { title: "finetuned_llm", detail: "SSH · ec2 · /home/ubuntu/projects/finetuned_llm/" });
});

test("project names follow Linux, Windows, UNC, root and long workdir paths", () => {
  const cases = [
    ["/workspace/my-project/", "my-project"],
    ["C:\\Users\\owner\\My Project\\", "My Project"],
    ["\\\\server\\share\\", "share"],
    ["/", "/"],
    ["C:\\", "C:\\"],
    ["/workspace/" + "a".repeat(200), "a".repeat(200)],
  ];
  for (const [path, title] of cases) {
    assert.deepEqual(resolve({ groupId: "project", groups: [group("project", workdir(path))] }), { title, detail: path });
  }
});

test("All teams uses one common canonical workdir from its mapped profiles", () => {
  const shared = workdir("/projects/lab", "ec2");
  assert.deepEqual(resolve({
    agents: [agent("a", shared), agent("b", shared), agent("unmapped", workdir("/elsewhere"))],
    roster: [member("a"), member("b")],
  }), { title: "lab", detail: "SSH · ec2 · /projects/lab" });
});

test("local Windows canonical paths compare without case or separator differences", () => {
  const result = resolve({
    agents: [agent("a", workdir("C:\\Projects\\Lab", null, "C:\\Projects\\Lab\\")), agent("b", workdir("c:/projects/lab", null, "c:/projects/lab"))],
    roster: [member("a"), member("b")],
  });
  assert.equal(result.title, "lab");
  assert.notEqual(result.title, "Beberapa workdir");
});

test("distinct paths, SSH hosts or runtime targets never select an arbitrary workdir", () => {
  const pairs = [
    [workdir("/a/lab", "ec2"), workdir("/b/lab", "ec2")],
    [workdir("/a/lab", "ec2"), workdir("/a/lab", "another-host")],
    [workdir("/a/lab"), workdir("/a/lab", "ec2")],
    [{ ...workdir("/a/lab"), runtime_id: "runtime-a" }, { ...workdir("/a/lab"), runtime_id: "runtime-b" }],
    [workdir("/a/Lab", "ec2"), workdir("/a/lab", "ec2")],
  ];
  for (const [a, b] of pairs) {
    const result = resolve({ agents: [agent("a", a), agent("b", b)], roster: [member("a"), member("b")] });
    assert.equal(result.title, "Beberapa workdir");
    assert.equal(result.detail.split("\n").length, 2);
  }
});

test("project clones inherit active project workdir rather than their profile override", () => {
  assert.deepEqual(resolve({
    agents: [agent("clone", workdir("/old"), { project_id: "project" })],
    groups: [group("project", workdir("/current/lab", "ec2"))], roster: [member("clone")],
  }), { title: "lab", detail: "SSH · ec2 · /current/lab" });
});

test("out-of-scope, unmapped, missing and deleted profiles cannot contribute paths", () => {
  assert.deepEqual(resolve({
    agents: [agent("outside", workdir("/outside")), agent("deleted", workdir("/deleted"), { deleted_at: "2026-10-07" }), agent("unmapped", workdir("/unmapped"))],
    roster: [member("outside", { in_scope: false }), member("deleted"), member("missing"), member("unmapped", { availability: "unmapped" }), member(null)],
  }), { title: "Personal workspace", detail: "Personal workspace" });
});

test("archived or missing project cannot leak its old workdir after filtering", () => {
  const old = group("old", workdir("/stale"), { archived_at: "2026-10-07" });
  const profiles = { agents: [agent("clone", workdir("/override"), { project_id: "old" })], roster: [member("clone")], groups: [old] };
  assert.equal(resolve(profiles).title, "Personal workspace");
  assert.equal(resolve({ ...profiles, groupId: "old" }).title, "Personal workspace");
  assert.equal(resolve({ ...profiles, groupId: "missing" }).title, "Personal workspace");
  assert.equal(resolve({ groupId: "new", groups: [group("new")], roster: [] }).title, "Personal workspace");
});

test("empty attached path uses the workspace name, while canonical path can supply it", () => {
  assert.equal(resolve({ groupId: "empty", groups: [group("empty", workdir(" "))] }).title, "Personal workspace");
  assert.equal(resolve({ groupId: "canonical", groups: [group("canonical", workdir("", null, "/canonical/lab"))] }).title, "lab");
});
