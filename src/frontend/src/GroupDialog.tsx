import { useEffect, useState } from "react";
import { Archive, RotateCcw, Trash2, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { GroupInvites } from "./GroupInvites";
import { RuntimeSelect } from "./RuntimeSettings";
import { WorkstationSelect } from "./WorkstationSelect";
import type { Workstation } from "./bindings/Workstation";
import { FolderPicker } from "./FolderPicker";
import { api, post, ApiFailure } from "./api";
import type { Group } from "./bindings/Group";
import type { Agent } from "./bindings/Agent";
import { ActionStatus, PendingIcon, useActionFeedback } from "./ActionFeedback";

export function GroupDialog({ controllerAccess, group, agents, workstations, onClose, onSaved }: {
  controllerAccess: boolean; group: Group; agents: Agent[]; workstations: Workstation[]; onClose: () => void; onSaved: (group: Group) => Promise<void>;
}) {
  const [draft, setDraft] = useState(group);
  const [people, setPeople] = useState<{user:string;role:string}[]>([]);
  const [folderOpen, setFolderOpen] = useState(false);
  const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null);
  const [error, setError] = useState("");
  const [acknowledged, setAcknowledged] = useState<Group | null>(null);
  const feedback = useActionFeedback(`group:${group.id || (group.project ? "new-project" : "new-group")}`);
  const busy = feedback.pending !== null;
  useEffect(()=>{void api<{user:string;role:string}[]>("/people").then(setPeople,e=>setError(String(e)));},[]);
  const closed = !!(group.archived_at || group.deleted_at);
  const locked = busy || closed || !!acknowledged;
  const available = agents.filter(a => draft.project ? !a.project_id || a.project_id === draft.id : !a.project_id);
  const members = available.filter(a => !draft.project || draft.project.members.some(m=>m.agent_id===a.id)).map((agent) => {
    let level = 1;
    let manager = draft.project ? draft.project.members.find(m=>m.agent_id===agent.id)?.manager_id : agent.reports_to;
    const seen = new Set([agent.id]);
    while (manager && !seen.has(manager)) {
      seen.add(manager); level++;
      manager = draft.project ? draft.project.members.find(m=>m.agent_id===manager)?.manager_id : agents.find((person) => person.id === manager)?.reports_to ?? null;
    }
    return { agent, level };
  });
  const selected = new Set(draft.member_ids ?? members.filter(m => !draft.scope_levels || draft.scope_levels.includes(m.level)).map(m => m.agent.id));
  function resultMessage(saved: Group, operation: string) {
    const name = saved.name;
    if (operation === "delete") return `${name} deleted and hidden. Stored history is retained.`;
    if (operation === "archive") return `${name} archived. Find it beside Sign out. Scheduled tasks are paused.`;
    if (operation === "restore") return `${name} restored. Review paused scheduled tasks before resuming them.`;
    if (!group.id && saved.project) return `${name} created. Add agents and reporting lines in Structure.`;
    return `${name} saved. Review scheduled tasks in their tab.`;
  }
  async function perform(operation: string, action: () => Promise<Group>) {
    setError("");
    let closing = false;
    await feedback.run(operation, async () => {
      let saved: Group;
      try { saved = await action(); }
      catch (failure) {
        if (failure instanceof ApiFailure && failure.status >= 400 && failure.status < 500) {
          return { kind: "error", message: `${draft.name}: ${failure.message}` };
        }
        return { kind: "warning", message: `${draft.name}: the change could not be confirmed. Your draft is retained. Review the saved ${draft.project ? "project" : "group"} before trying again.` };
      }
      setAcknowledged(saved); setDraft(saved);
      try { await onSaved(saved); }
      catch { return { kind: "warning", message: `${resultMessage(saved, operation)} The view could not refresh. Retry refresh without repeating the change.` }; }
      closing = true; onClose();
      return { kind: "success", message: resultMessage(saved, operation) };
    }, { toast: () => closing, errorMessage: "The change could not be confirmed. Your draft is retained; review the details before trying again." });
  }
  async function retryRefresh() {
    if (!acknowledged) return;
    let closing = false;
    await feedback.run("refresh", async () => {
      await onSaved(acknowledged);
      closing = true; onClose();
      return { kind: "success", message: `${acknowledged.name}: saved changes are now displayed.` };
    }, { toast: () => closing, errorMessage: "The change was acknowledged, but the view still could not refresh. Retry refresh without repeating the change." });
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="group-settings-dialog">
      <DialogHeader>
        <DialogTitle>{confirm ? `${confirm === "archive" ? "Archive" : "Delete"} group?` : group.id ? (draft.project ? "Manage project" : "Manage group") : (draft.project ? "Create a project" : "Create a group")}</DialogTitle>
        <DialogDescription>{confirm
          ? confirm === "archive" ? `${group.name} will move to Archived groups beside Sign out. Conversations, files, sessions and runs are kept. Scheduled tasks pause. You can restore it anytime.`
            : `${group.name} will be hidden from the platform. Its stored history is retained and scheduled tasks pause. Deleted groups are not listed in the archive.`
          : closed ? "This group is read-only. Restore it to continue. Scheduled tasks stay paused until you resume them."
          : draft.project && !group.id ? "Choose a name and workdir. Set up the team after creating the project."
          : "Invite people and agents to this room. Only included agents can receive work."}</DialogDescription>
      </DialogHeader>
      {error && <p className="banner error" role="alert">{error}</p>}
      <ActionStatus feedback={feedback} />
      {acknowledged && <Button variant="outline" disabled={busy} aria-busy={feedback.isPending("refresh")} onClick={() => void retryRefresh()}><PendingIcon pending={feedback.isPending("refresh")} size={16}/>{feedback.isPending("refresh") ? "Refreshing…" : "Retry refresh"}</Button>}
      {confirm ? <div className="group-lifecycle-actions">
        <Button variant="outline" disabled={busy} onClick={() => { setConfirm(null); setError(""); }}>Cancel</Button>
        <Button variant={confirm === "delete" ? "destructive" : "default"} disabled={busy || !!acknowledged} aria-busy={feedback.isPending(confirm)}
          onClick={() => void perform(confirm, () => confirm === "delete"
            ? api<Group>(`/groups/${group.id}`, { method: "DELETE" })
            : post<Group>(`/groups/${group.id}/archive`))}>
          <PendingIcon pending={feedback.isPending(confirm)} size={16}/>{feedback.isPending(confirm) ? confirm === "delete" ? "Deleting group…" : "Archiving group…" : confirm === "delete" ? "Delete group" : "Archive group"}
        </Button>
      </div> : <>
        <form className="form-stack" onChangeCapture={event => { if (event.currentTarget.contains(event.target as Node)) { feedback.clear();  } }} onSubmit={(e) => {
          e.preventDefault();
          if (!closed && !busy && !acknowledged) void perform("save", () => post<Group>("/groups", {
            ...draft,
            member_ids: draft.project ? undefined : [...selected],
            project: draft.project ? { ...draft.project, members: group.id ? draft.project.members : [] } : draft.project,
            scope_levels: null,
            chat_lead_id: null,
          }));
        }}>
          <Label htmlFor="group-name">Name</Label>
          <Input id="group-name" value={draft.name} disabled={locked} required maxLength={80}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <Label htmlFor="group-description">Description</Label>
          <Input id="group-description" value={draft.description} disabled={locked}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          {draft.project && <>
            <RuntimeSelect disabled={locked} allowController={controllerAccess} required={!controllerAccess} value={draft.project.workdir.runtime_id ?? ""} onChange={id=>{ feedback.clear();  setDraft({...draft,project:{...draft.project!,workdir:{...draft.project!.workdir,runtime_id:id||undefined,ssh_host:null,path:"",canonical_path:""}}}); }}/>
            {controllerAccess && !draft.project.workdir.runtime_id && <WorkstationSelect id="project-host" value={draft.project.workdir.ssh_host ?? ""} workstations={workstations} disabled={locked}
              onChange={host => { feedback.clear();  setDraft({ ...draft, project: { ...draft.project!, workdir: { ...draft.project!.workdir, ssh_host: host || null, path: "", canonical_path: "", git_root: null } } }); }}/> }
            <Label htmlFor="project-workdir">Project workdir</Label>
            <div className="project-workdir-row"><Input id="project-workdir" required value={draft.project.workdir.path} disabled={locked} onChange={e=>setDraft({...draft,project:{...draft.project!,workdir:{...draft.project!.workdir,path:e.target.value}}})}/><Button type="button" variant="outline" disabled={locked||(!draft.project.workdir.runtime_id&&!controllerAccess)} onClick={()=>setFolderOpen(true)}><FolderOpen size={15}/>Browse</Button></div>
            <p className="hint">Every project run uses this workdir and workstation, overriding each agent's default. Sessions remain separate from other chats.</p>
            <p className="hint">{group.id ? "Manage agents and reporting lines in the project's Structure tab." : "Your project starts with an empty team. Next, configure agents in the Structure tab."}</p>
          </>}
          <GroupInvites agents={draft.project ? [] : available} people={people} memberIds={[...selected]} humanIds={draft.human_ids}
            disabled={locked} onChange={(member_ids, human_ids) => { feedback.clear();  setDraft({...draft, member_ids: draft.project ? undefined : member_ids, human_ids, scope_levels:null, chat_lead_id:null}); }}/>
          {!closed && <Button type="submit" disabled={busy || !!acknowledged || draft.scope_levels?.length === 0} aria-busy={feedback.isPending("save")}><PendingIcon pending={feedback.isPending("save")} size={16}/>{feedback.isPending("save") ? draft.project ? "Saving project…" : "Saving group…" : draft.project ? group.id ? "Save project" : "Create project" : "Save group"}</Button>}
        </form>
        {!!group.id && <div className="group-lifecycle-actions">
          {closed ? <Button disabled={busy || !!acknowledged} aria-busy={feedback.isPending("restore")} onClick={() => void perform("restore", () => post<Group>(`/groups/${group.id}/restore`))}><PendingIcon pending={feedback.isPending("restore")} size={15}/>{!feedback.isPending("restore") && <RotateCcw size={15} />}{feedback.isPending("restore") ? "Restoring group…" : "Restore group"}</Button>
            : <Button variant="outline" disabled={busy} onClick={() => setConfirm("archive")}><Archive size={15} /> Archive group</Button>}
          {!group.deleted_at && <Button variant="destructive" disabled={busy} onClick={() => setConfirm("delete")}><Trash2 size={15} /> Delete group</Button>}
        </div>}
      </>}
      {folderOpen&&draft.project&&<FolderPicker runtimeId={draft.project.workdir.runtime_id??undefined} initialPath={draft.project.workdir.path} sshHost={draft.project.workdir.ssh_host??undefined} onClose={()=>setFolderOpen(false)} onSelect={path=>{setDraft({...draft,project:{...draft.project!,workdir:{...draft.project!.workdir,path}}});setFolderOpen(false);}}/>}
    </DialogContent>
  </Dialog>;
}
