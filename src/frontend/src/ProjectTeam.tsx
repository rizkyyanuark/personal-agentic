import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { post } from "./api";
import type { Agent } from "./bindings/Agent";
import type { Group } from "./bindings/Group";
import { ValuePicker } from "./ValuePicker";
import { PendingIcon, useActionFeedback } from "./ActionFeedback";

export function ProjectTeam({ group, agents, onSaved, onAdd }: {
  group: Group; agents: Agent[]; onSaved: () => Promise<void>; onAdd: () => void;
}) {
  const [members, setMembers] = useState(group.project?.members ?? []);
  const [chosen, setChosen] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const feedback = useActionFeedback("project-team", group.id);
  const busy = feedback.pending !== null;
  const available = agents.filter(a => !a.project_id && !members.some(m => m.agent_id === a.id));
  async function saveTeam() {
    if (acknowledged) {
      let refreshed = false;
      await feedback.run("refresh", async () => {
        try {
          await onSaved();
          setAcknowledged(false);
          refreshed = true;
          return { kind: "success", message: `${group.name}: team saved.` };
        } catch {
          return { kind: "warning", message: `${group.name}: view refresh failed. Previously saved team remains saved.` };
        }
      }, { errorMessage: `${group.name}: view refresh failed. Previously saved team remains saved.` });
      return refreshed;
    }
    let success = false;
    await feedback.run("save", async () => {
      try {
        await post("/groups", {
          ...group,
          project: { ...group.project, members },
          chat_lead_id: members.some(m => m.agent_id === group.chat_lead_id) ? group.chat_lead_id : null,
        });
        setAcknowledged(true);
      } catch (e) {
        return { kind: "error", message: e instanceof Error ? e.message : "Failed to save project team." };
      }
      try {
        await onSaved();
        setAcknowledged(false);
      } catch {
        return { kind: "warning", message: `${group.name}: team saved, but the view could not refresh.` };
      }
      success = true;
      return { kind: "success", message: `${group.name}: team saved.` };
    }, { errorMessage: "Team save could not be confirmed. Review reporting lines before trying again." });
    return success;
  }
  return <section className="project-team-editor" aria-label="Project team and reporting structure">
    <header><div><h2>Project team</h2><p>Bring in organization agents or create a dedicated project agent. Set reporting lines below.</p></div></header>
    <div className="project-team-add">
      <Label htmlFor="project-add-member">Organization agent</Label>
      <ValuePicker id="project-add-member" searchable value={chosen} disabled={busy} onValueChange={setChosen} options={[{ value: "", label: "Choose an agent" }, ...available.map(a => ({ value: a.id, label: `${a.name}${a.position ? ` · ${a.position}` : ""}` }))]} />
      <Button disabled={busy || !chosen} onClick={() => { setMembers([...members, { agent_id: chosen, manager_id: null }]); setChosen(""); setAcknowledged(false); }}><Plus size={14}/>Add to team</Button>
      <Button variant="outline" disabled={busy} onClick={async () => { if (await saveTeam()) onAdd(); }}>Create project agent</Button>
    </div>
    {members.length === 0 && <p className="project-team-empty">No agents yet. Add your first team member to begin.</p>}
    <div className="project-team-list">{members.map(member => {
      const agent = agents.find(a => a.id === member.agent_id);
      return <div className="project-team-row" key={member.agent_id}><div><strong>{agent?.name ?? member.agent_id}</strong><small>{agent?.position || "Agent"} · {agent?.project_id ? "Project agent" : "Organization agent"}</small></div>
        <label>Reports to<ValuePicker searchable aria-label={`Project manager for ${agent?.name ?? member.agent_id}`} value={member.manager_id ?? ""} disabled={busy} onValueChange={value => { setMembers(members.map(m => m.agent_id === member.agent_id ? { ...m, manager_id: value || null } : m)); setAcknowledged(false); }}
          options={[{ value: "", label: "Organization owner" }, ...members.filter(m => m.agent_id !== member.agent_id).map(m => ({ value: m.agent_id, label: agents.find(a => a.id === m.agent_id)?.name ?? m.agent_id }))]} /></label>
        <Button variant="ghost" disabled={busy || !!agent?.project_id} title={agent?.project_id ? "Delete dedicated agents from their profile" : "Remove from project"} aria-label={`Remove ${agent?.name} from project`} onClick={() => { setMembers(members.filter(m => m.agent_id !== member.agent_id).map(m => m.manager_id === member.agent_id ? { ...m, manager_id: null } : m)); setAcknowledged(false); }}><Trash2 size={15}/></Button>
      </div>;
    })}</div>
    {acknowledged ? (
      <Button disabled={busy} aria-busy={busy} onClick={() => void feedback.run("refresh", async () => {
        await onSaved();
        setAcknowledged(false);
        return { kind: "success", message: `${group.name}: team saved.` };
      }, { errorMessage: `${group.name}: view refresh failed. Previously saved team remains saved.` })}>
        <PendingIcon pending={busy} size={15} />
        {busy ? "Refreshing…" : "Retry refresh"}
      </Button>
    ) : (
      <Button disabled={busy} aria-busy={busy} onClick={() => void saveTeam()}>
        <PendingIcon pending={busy} size={15} />
        {busy ? "Saving…" : "Save team"}
      </Button>
    )}
  </section>;
}
