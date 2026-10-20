import { RuntimeSettings } from "./RuntimeSettings";
import { useState } from "react";
import { Monitor, Plus, Server, Trash2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, post } from "./api";
import type { Workstation } from "./bindings/Workstation";
import type { Connection } from "./bindings/Connection";
import { applicationEnvironmentHelp, applicationEnvironmentLabel, workstationLabel } from "./workstationLabels";
import { ActionStatus, PendingIcon, useActionFeedback } from "./ActionFeedback";
import { ValuePicker } from "./ValuePicker";

const empty: Workstation = { id: "", name: "", location: "unspecified", hostname: "", host_ip: "", port: 22, username: "", auth: "key", ssh_alias: "", ssh_key_path: "", secret_saved: false };
export function UserSettings({ role, user, controllerAccess, workstations, onRefresh, enrollmentToken, onEnrollmentTokenChange }: { role: string; user: string; controllerAccess: boolean; workstations: Workstation[]; onRefresh: () => Promise<void>; enrollmentToken: string; onEnrollmentTokenChange: (token: string) => void }) {
  const [section, setSection] = useState("runtimes");
  const [draft, setDraft] = useState<Workstation | null>(null);
  const [secret, setSecret] = useState("");
  const [clearSecret, setClearSecret] = useState(false);
  const [alias, setAlias] = useState("");
  const feedback = useActionFeedback("workstations", section);
  const busy = feedback.pending !== null;
  const [detail, setDetail] = useState("");
  const [remove, setRemove] = useState(false);
  const [saved, setSaved] = useState(true);
  const [fingerprints, setFingerprints] = useState<string[]>([]);
  function edit(host: Workstation, clear = true) { setFingerprints([]); setDraft({ ...host, location: host.location ?? "unspecified" }); setSecret(""); setClearSecret(false); setRemove(false); setDetail(""); if (clear) feedback.clear(); setSaved(true); }
  function change(patch: Partial<Workstation>) { setFingerprints([]); setDraft(draft ? { ...draft, ...patch } : null); setSaved(false); setDetail(""); feedback.clear(); }
  async function refreshed(message: string): Promise<{ kind: "success" | "warning"; message: string }> {
    try { await onRefresh(); return { kind: "success", message }; }
    catch { return { kind: "warning", message: `${message} The workstation list could not refresh. Retry refresh without repeating the change.` }; }
  }
  async function perform(action: string, work: () => Promise<{ kind: "success" | "warning" | "error"; message: string }>) {
    setDetail("");
    await feedback.run(action, async () => {
      try { return await work(); }
      catch (failure) { setDetail(failure instanceof Error ? failure.message : String(failure)); throw failure; }
    }, { errorMessage: action === "test" ? "Connection test failed. Review the connection details and retry." : action === "review" ? "Host keys could not be read. Review the connection details and retry." : action === "refresh" ? "The workstation list could not refresh. Retry refresh." : "The workstation change could not be confirmed. Keep your draft and refresh the list before trying again." });
  }
  if (role !== "owner") return <section className="user-settings"><div className="settings-page"><header className="settings-page-heading"><span className="settings-kicker">YOUR WORKSPACE</span><h1>Settings</h1><p>Your account and workspace access.</p></header><section className="settings-card"><div className="settings-section-title"><ShieldCheck size={20}/><h2>Workspace access</h2><span className="settings-badge">Member</span></div><strong className="settings-account">{user}</strong><p className="settings-description">You can join conversations in the rooms shared with you. Your workspace owner manages people, agents, and runtime connections.</p></section><section className="settings-card"><div className="settings-section-title"><Server size={20}/><h2>Agent runtimes</h2></div><p className="settings-description">Agents run on machines connected by your workspace owner. Contact them to connect a machine or change an agent’s workdir.</p></section></div></section>;
  return <section className="user-settings"><div className="settings-page">
    <header className="settings-page-heading"><span className="settings-kicker">WORKSPACE SETTINGS</span><h1>Connected machines</h1><p>Choose where your agents run. Files and credentials stay on the connected machine.</p></header>
    {controllerAccess&&<nav className="settings-tabs" aria-label="Connection type"><Button variant={section==="runtimes"?"secondary":"ghost"} aria-pressed={section==="runtimes"} onClick={()=>setSection("runtimes")}>Agent runtimes</Button><Button variant={section==="ssh"?"secondary":"ghost"} aria-pressed={section==="ssh"} onClick={()=>setSection("ssh")}>SSH workstations</Button></nav>}
    {section==="runtimes"||!controllerAccess?<RuntimeSettings enrollmentToken={enrollmentToken} onEnrollmentTokenChange={onEnrollmentTokenChange}/>:<div className="legacy-workstations">
    <header><div><h2>SSH workstations</h2><p>Save workstations once, then choose them in an agent or project.</p></div><Button disabled={busy} onClick={() => edit(empty)}><Plus size={16}/>Add workstation</Button></header>
    <div className="workstation-settings-layout"><nav aria-label="Saved workstations">
      <div className="workstation-local"><Monitor size={18}/><span><strong>{applicationEnvironmentLabel}</strong><small>{applicationEnvironmentHelp}</small></span></div>
      {workstations.map(host => <button key={host.id} disabled={busy} className={draft?.id === host.id ? "selected" : ""} onClick={() => edit(host)}><Server size={18}/><span><strong>{workstationLabel(host)}</strong><small>{host.username}@{host.host_ip || host.hostname}:{host.port}</small></span></button>)}
      <form className="form-stack workstation-import" onSubmit={e => { e.preventDefault(); void perform("import", async () => { const host = await post<Workstation>("/workstations/import", { alias: alias.trim() }); edit(host, false); setAlias(""); return refreshed(`${host.name}: SSH settings imported.`); }); }}>
        <Label htmlFor="import-ssh-alias">Import existing SSH alias</Label><Input id="import-ssh-alias" value={alias} disabled={busy} onChange={e => { feedback.clear(); setDetail(""); setAlias(e.target.value); }} placeholder="e.g. linux-example"/><Button type="submit" variant="outline" disabled={busy || !alias.trim()} aria-busy={feedback.isPending("import")}><PendingIcon pending={feedback.isPending("import")} size={16}/>{feedback.isPending("import") ? "Importing alias…" : "Import alias"}</Button>
      </form>
    </nav>
    <div>{draft ? <form className="form-stack workstation-form" onSubmit={e => { e.preventDefault(); void perform("save", async () => {
      const host = await post<Workstation>("/workstations", { workstation: draft, secret: secret || null, clear_secret: clearSecret });
      edit(host, false); return refreshed(`${host.name}: workstation saved. Test the connection before attaching a workdir.`);
    }); }}>
      <h2>{draft.id ? draft.name : "New workstation"}</h2>
      <fieldset disabled={busy} className="form-stack">
        <Label htmlFor="host-name">Display name</Label><Input id="host-name" required maxLength={100} value={draft.name} onChange={e => change({ name: e.target.value })}/>
        <Label htmlFor="host-location">Location</Label><ValuePicker id="host-location" disabled={busy} value={draft.location} aria-describedby="host-location-help" onValueChange={value => change({ location: value as Workstation["location"] })} options={[{ value: "unspecified", label: "Unspecified · Saved SSH" }, { value: "local_host", label: "Local · Application host" }, { value: "remote", label: "Remote · Another machine" }]} />
        <p id="host-location-help" className="hint">Local means the host instance running personal-agentic. Location is a label you set; it does not verify host identity or change SSH access.</p>
        <div className="settings-fields"><div><Label htmlFor="host-hostname">Hostname</Label><Input id="host-hostname" required value={draft.hostname} placeholder="workstation.example.com" onChange={e => change({ hostname: e.target.value })}/></div><div><Label htmlFor="host-ip">Host IP (optional)</Label><Input id="host-ip" value={draft.host_ip} placeholder="Use instead of DNS" onChange={e => change({ host_ip: e.target.value })}/></div></div>
        <div className="settings-fields"><div><Label htmlFor="host-port">SSH port</Label><Input id="host-port" type="number" min={1} max={65535} required value={draft.port} onChange={e => change({ port: Number(e.target.value) })}/></div><div><Label htmlFor="host-user">Username</Label><Input id="host-user" required autoComplete="off" value={draft.username} onChange={e => change({ username: e.target.value })}/></div></div>
        <Label htmlFor="host-auth">Authentication</Label><ValuePicker id="host-auth" disabled={busy} value={draft.auth} onValueChange={value => { change({ auth: value }); setSecret(""); setClearSecret(true); }} options={[{ value: "key", label: "SSH key" }, { value: "password", label: "Password" }, { value: "ssh_config", label: "Existing SSH config / agent" }]} />
        {draft.auth === "ssh_config" && <><Label htmlFor="host-alias">SSH config alias</Label><Input id="host-alias" required value={draft.ssh_alias} onChange={e => change({ ssh_alias: e.target.value })}/><p className="hint">Keeps this alias's existing keys, host-key identity and jump-host settings.</p></>}
        {draft.auth === "key" && <><Label htmlFor="host-key">SSH private-key path</Label><Input id="host-key" required value={draft.ssh_key_path} onChange={e => change({ ssh_key_path: e.target.value })} placeholder="Absolute key-file path accessible to the service"/></>}
        {draft.auth !== "ssh_config" && <><Label htmlFor="host-secret">{draft.auth === "password" ? "Password" : "Key passphrase (optional)"}</Label><Input id="host-secret" type="password" autoComplete="new-password" value={secret} required={draft.auth === "password" && (!draft.secret_saved || clearSecret)} placeholder={draft.secret_saved ? "Saved · leave blank to keep" : ""} onChange={e => { setSecret(e.target.value); setSaved(false); feedback.clear(); setDetail(""); }}/><p className="hint">Encrypted for the Windows account running the platform. Never included in agent profiles or exports.</p>{draft.secret_saved && draft.auth === "key" && <label className="settings-checkbox"><input type="checkbox" checked={clearSecret} onChange={e => { setClearSecret(e.target.checked); setSaved(false); feedback.clear(); setDetail(""); }}/>Remove saved passphrase</label>}</>}
      </fieldset>
      <div className="settings-actions"><Button type="submit" disabled={busy} aria-busy={feedback.isPending("save")}><PendingIcon pending={feedback.isPending("save")} size={16}/>{feedback.isPending("save") ? "Saving workstation…" : "Save workstation"}</Button>{draft.id && <Button type="button" variant="outline" disabled={busy || !saved} aria-busy={feedback.isPending("test")} onClick={() => void perform("test", async () => {
        const result = await post<{ connection: Connection; home: string }>(`/workstations/${draft.id}/test`);
        if (result.connection.status !== "online") { setDetail(result.connection.message); return { kind: "error", message: `${draft.name}: connection is not online. Review the details and test again.` }; }
        setDetail(`Connected · ${result.connection.os} · ${result.connection.version} · ${result.home}`);
        return { kind: "success", message: `${draft.name}: connection is online.` };
      })}><PendingIcon pending={feedback.isPending("test")} size={16}/>{feedback.isPending("test") ? "Testing connection…" : "Test connection"}</Button>}</div>
      {draft.id && draft.auth !== "ssh_config" && <div className="host-key-review">
        <Button type="button" variant="outline" disabled={busy || !saved} aria-busy={feedback.isPending("review")} onClick={() => void perform("review", async () => { const result = await api<{ fingerprints: string[] }>(`/workstations/${draft.id}/host-keys`); setFingerprints(result.fingerprints); return { kind: result.fingerprints.length ? "success" : "warning", message: result.fingerprints.length ? `${draft.name}: host keys are ready for review. Trust has not changed.` : `${draft.name}: no host keys were returned. Trust has not changed.` }; })}><PendingIcon pending={feedback.isPending("review")} size={16}/>{feedback.isPending("review") ? "Reading host keys…" : "Review host keys"}</Button>
        {fingerprints.length > 0 && <><p className="hint">Compare these fingerprints with the workstation's SSH host keys before trusting this connection.</p><pre>{fingerprints.join("\n")}</pre><Button type="button" variant="outline" disabled={busy} aria-busy={feedback.isPending("trust")} onClick={() => void perform("trust", async () => { await post(`/workstations/${draft.id}/trust`, { fingerprints }); setFingerprints([]); return { kind: "success", message: `${draft.name}: host keys trusted. Test the connection now.` }; })}><PendingIcon pending={feedback.isPending("trust")} size={16}/>{feedback.isPending("trust") ? "Trusting host keys…" : "Trust these host keys"}</Button></>}
      </div>}
      <p className="hint">Linux/macOS workstations need Python 3.11+, Git and a signed-in Codex CLI. SSH config imports keep their existing host trust.</p>
      {draft.id && <div className="settings-actions">{remove ? <><span>Remove this saved connection?</span><Button type="button" variant="destructive" disabled={busy} aria-busy={feedback.isPending("remove")} onClick={() => void perform("remove", async () => { await api(`/workstations/${draft.id}`, { method: "DELETE" }); setDraft(null); return refreshed(`${draft.name}: workstation removed.`); })}><PendingIcon pending={feedback.isPending("remove")} size={16}/>{feedback.isPending("remove") ? "Removing workstation…" : "Confirm remove"}</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => setRemove(false)}>Cancel</Button></> : <Button type="button" variant="ghost" disabled={busy} onClick={() => { feedback.clear(); setDetail(""); setRemove(true); }}><Trash2 size={14}/>Remove workstation</Button>}</div>}
    </form> : <div className="empty-state"><Server size={30}/><h2>Your workstations</h2><p>Select a saved workstation or add a new connection.</p></div>}
    <ActionStatus feedback={feedback}/>
    {detail && <p className="hint">{detail}</p>}
    {feedback.result && feedback.result.kind !== "success" && <Button type="button" variant="outline" disabled={busy} aria-busy={feedback.isPending("refresh")} onClick={() => void perform("refresh", async () => { await onRefresh(); return { kind: "success", message: "Workstation list refreshed. Your current draft has been kept." }; })}><PendingIcon pending={feedback.isPending("refresh")} size={16}/>{feedback.isPending("refresh") ? "Refreshing…" : "Refresh workstation list"}</Button>}
    </div></div>
  </div>}</div></section>;
}
