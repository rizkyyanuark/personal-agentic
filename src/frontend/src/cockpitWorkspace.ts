import type { CockpitWorkspace } from "@personal-agentic/cockpit";
import type { Agent } from "./bindings/Agent";
import type { CockpitAgent } from "./bindings/CockpitAgent";
import type { Group } from "./bindings/Group";
import type { Run } from "./bindings/Run";
import type { Workspace } from "./bindings/Workspace";

type Input = {
  workspaceName: string;
  groupId: string | null;
  agents: Agent[];
  groups: Group[];
  runs: Run[];
  roster: CockpitAgent[];
};

function describeWorkdir(workdir: Workspace): CockpitWorkspace | null {
  const path = workdir.path.trim() || workdir.canonical_path.trim();
  if (!path) return null;
  const trimmed = path.replace(/[\\/]+$/, "");
  const title = !trimmed ? "/" : /^[a-z]:$/i.test(trimmed) ? `${trimmed}\\` : trimmed.split(/[\\/]/).at(-1)!;
  return { title, detail: workdir.ssh_host ? `SSH · ${workdir.ssh_host} · ${path}` : path };
}

function workdirKey(workdir: Workspace): string {
  let path = (workdir.canonical_path.trim() || workdir.path.trim()).replace(/\\/g, "/").replace(/\/+$/, "");
  if (!workdir.ssh_host && (/^[a-z]:/i.test(path) || path.startsWith("//"))) path = path.toLowerCase();
  return JSON.stringify([workdir.runtime_id ?? "", workdir.ssh_host ?? "", path]);
}

export function resolveCockpitWorkspace({ workspaceName, groupId, agents, groups, runs, roster }: Input): CockpitWorkspace {
  const fallback = { title: workspaceName.trim() || "Workspace", detail: workspaceName.trim() || "Workspace" };
  const activeGroups = groups.filter(group => !group.deleted_at && !group.archived_at);
  const selected = activeGroups.find(group => group.id === groupId);
  if (groupId && !selected) return fallback;
  if (selected?.project) return describeWorkdir(selected.project.workdir) ?? fallback;
  const workdirs = new Map<string, CockpitWorkspace>();
  let unknownActiveWorkdir = false;
  function addWorkdir(workdir: Workspace | null | undefined) {
    if (!workdir) return false;
    const description = describeWorkdir(workdir);
    if (!description) return false;
    workdirs.set(workdirKey(workdir), description);
    return true;
  }
  for (const member of roster) {
    if (!member.in_scope || !member.agent_id || member.availability === "deleted" || member.availability === "unmapped") continue;
    const agent = agents.find(agent => agent.id === member.agent_id && !agent.deleted_at);
    if (!agent) continue;
    if (member.active_runs.length) {
      for (const active of member.active_runs) {
        const run = runs.find(run => run.id === active.id && run.agent_id === member.agent_id && run.group_id === active.group_id);
        const group = activeGroups.find(group => group.id === active.group_id);
        const workdir = run?.profile.workdir ?? group?.project?.workdir ?? (group && !group.project ? agent.workdir : null);
        if (!addWorkdir(workdir)) unknownActiveWorkdir = true;
      }
      continue;
    }
    const workdir = agent.project_id
      ? activeGroups.find(group => group.id === agent.project_id)?.project?.workdir
      : agent.workdir;
    addWorkdir(workdir);
  }
  if (unknownActiveWorkdir || !workdirs.size) return fallback;
  if (workdirs.size === 1) return workdirs.values().next().value!;
  return { title: "Beberapa workdir", detail: [...workdirs.values()].map(workdir => workdir.detail).join("\n") };
}
