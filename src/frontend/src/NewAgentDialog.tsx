import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./components/ui/dialog";
import { RuntimeSelect, HarnessSelect } from "./RuntimeSettings";
import { availableHarnesses, type RegisteredRuntime } from "./runtimeCatalog";
import { WorkstationSelect } from "./WorkstationSelect";
import type { Agent } from "./bindings/Agent";
import type { Group } from "./bindings/Group";
import type { Workspace } from "./bindings/Workspace";
import type { Workstation } from "./bindings/Workstation";
import { api, post } from "./api";
import type { CodexSettings } from "./bindings/CodexSettings";

export function NewAgentDialog({ agents, groups, projectId, controllerAccess, workstations, onClose, onCreated }: {
  agents: Agent[]; groups: Group[]; projectId: string; controllerAccess: boolean; workstations: Workstation[];
  onClose: () => void; onCreated: (agent: Agent) => Promise<void>;
}) {
  const [scope, setScope] = useState(projectId);
  const project = groups.find(group => group.id === scope)?.project;
  const [selectedRuntimeId, setRuntimeId] = useState(project?.workdir.runtime_id ?? "");
  const runtimeId = project ? project.workdir.runtime_id ?? "" : selectedRuntimeId;
  const [runtimes, setRuntimes] = useState<RegisteredRuntime[]>([]);
  const [harness, setHarness] = useState<Agent["harness"] | "">("");
  const [model, setModel] = useState("");
  const chosenHarness = harness || availableHarnesses(runtimes.find(runtime => runtime.id === runtimeId))[0] || (controllerAccess && !runtimeId ? "codex" : "");
  const [path, setPath] = useState("");
  const [sshHost, setSshHost] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const runtime = runtimes.find(item => item.id === runtimeId);
  const catalogHost = project?.workdir.ssh_host ?? sshHost;
  const runtimeReady = Boolean(chosenHarness && (runtimeId ? runtime?.online && !runtime.revoked && availableHarnesses(runtime).includes(chosenHarness) : controllerAccess));
  const catalogContext = JSON.stringify([chosenHarness, runtimeId, catalogHost, runtimeReady]);
  const [catalogResult, setCatalogResult] = useState<{ context: string; settings: CodexSettings | null; error: string } | null>(null);
  const catalogRequest = useRef(0);
  const mounted = useRef(false);
  const catalog = catalogResult?.context === catalogContext ? catalogResult.settings : null;
  const selectionError = runtimeId
    ? !runtime ? "Loading this runtime…" : runtime.revoked ? "This runtime is revoked. Choose another runtime." : !runtime.online ? "Connect this runtime to load its model catalog." : "Choose an available harness on this runtime. Install and sign in to a harness if no catalog is reported."
    : "Choose a harness and workstation to load its model catalog.";
  const modelError = !runtimeReady ? selectionError : catalogResult?.context === catalogContext ? catalogResult.error : "";
  const chosenModel = model || catalog?.models.find(option => option.slug === catalog.model)?.slug || catalog?.models[0]?.slug || "";
  const ready = Boolean(runtimeReady && catalog?.models.some(option => option.slug === chosenModel));
  const loadCatalog = useCallback(() => {
    const request = ++catalogRequest.current;
    if (!chosenHarness || !runtimeReady) return;
    const query = new URLSearchParams({ harness: chosenHarness });
    if (runtimeId) query.set("runtime_id", runtimeId);
    else if (catalogHost) query.set("ssh_host", catalogHost);
    void api<CodexSettings>(`/harness/settings?${query}`).then(settings => {
      if (mounted.current && request === catalogRequest.current) setCatalogResult({ context: catalogContext, settings, error: "" });
    }, (reason: unknown) => {
      if (mounted.current && request === catalogRequest.current) setCatalogResult({ context: catalogContext, settings: null, error: reason instanceof Error ? reason.message : String(reason) });
    });
  }, [catalogContext, chosenHarness, runtimeId, catalogHost, runtimeReady]);
  useEffect(() => {
    mounted.current = true;
    loadCatalog();
    window.addEventListener("focus", loadCatalog);
    return () => { mounted.current = false; window.removeEventListener("focus", loadCatalog); };
  }, [loadCatalog]);
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="new-agent-dialog">
    <DialogHeader><DialogTitle>Add your agent</DialogTitle><DialogDescription>Choose its runtime, harness and workdir, then set up its profile.</DialogDescription></DialogHeader>
    <form className="form-stack" onSubmit={event => {
      event.preventDefault(); const fields = new FormData(event.currentTarget);
      if (!ready || !chosenHarness || busy) return;
      setBusy(true); setError("");
      void (async () => {
        try {
          const workdir = project?.workdir ?? (await post<{ workspace: Workspace }>("/workspaces/probe", { path, harness: chosenHarness, runtime_id: runtimeId || null, ssh_host: sshHost || null })).workspace;
          const agent = await post<Agent>("/agents", {
            id: "", name: String(fields.get("name")), project_id: scope || null, runtime_id: workdir.runtime_id,
            position: String(fields.get("position")), role: String(fields.get("role")),
            color: getComputedStyle(document.documentElement).getPropertyValue("--gauss-700").trim(),
            harness: chosenHarness, model: chosenModel, reasoning: "", reports_to: String(fields.get("reports_to")) || null,
            instructions: "Work carefully. Explain your changes and verify the result.", agents_md: "",
            workdir: project ? null : workdir, permission: chosenHarness === "opencode" ? "danger-full-access" : "read-only",
            timeout_seconds: 1800, enabled: true, deleted_at: null, revision: 1,
          });
          await onCreated(agent);
        } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
        finally { setBusy(false); }
      })();
    }}>
      <RuntimeSelect value={runtimeId} onLoaded={setRuntimes} disabled={busy || Boolean(project)} required={!controllerAccess}
        allowController={controllerAccess} onChange={id => { setRuntimeId(id); setHarness(""); setModel(""); setPath(""); setSshHost(""); }} />
      <HarnessSelect id="agent-harness" value={chosenHarness} runtimeId={runtimeId} runtimes={runtimes} allowController={controllerAccess} onChange={value => { setHarness(value); setModel(""); }} />
      <label htmlFor="agent-workdir">Workdir</label>
      {controllerAccess && !runtimeId && !project && <WorkstationSelect id="new-agent-workstation" value={sshHost} workstations={workstations} disabled={busy} onChange={host => { setSshHost(host); setPath(""); setModel(""); }} />}
      <Input id="agent-workdir" value={project?.workdir.path ?? path} required readOnly={Boolean(project)} disabled={!runtimeReady || busy}
        placeholder="Absolute folder path on this runtime" onChange={event => setPath(event.target.value)} />
      {project && <p className="hint">Runtime and workdir are inherited from this project.</p>}
      <label htmlFor="agent-project">Agent scope</label>
      <select id="agent-project" value={scope} disabled={busy} onChange={event => {
        const next = groups.find(group => group.id === event.target.value)?.project;
        setScope(event.target.value); setRuntimeId(next?.workdir.runtime_id ?? ""); setHarness(""); setModel(""); setPath(""); setSshHost("");
      }}><option value="">Organization agent</option>{groups.filter(group => group.project && !group.archived_at && !group.deleted_at).map(group => <option key={group.id} value={group.id}>Project: {group.name}</option>)}</select>
      <label htmlFor="agent-name">Name</label><Input id="agent-name" name="name" required maxLength={80} placeholder="Engineer" />
      <label htmlFor="agent-position">Position</label><Input id="agent-position" name="position" maxLength={120} placeholder="Software Engineer" />
      <label htmlFor="agent-role">Role</label><Input id="agent-role" name="role" placeholder="Build and maintain our products" />
      <label htmlFor="agent-model">Model</label><select id="agent-model" value={chosenModel} disabled={!catalog || busy} onChange={event => setModel(event.target.value)}>
        {!catalog && <option value="">{modelError ? "Model catalog unavailable" : "Loading models…"}</option>}
        {model && catalog && !catalog.models.some(option => option.slug === model) && <option value={model} disabled>{model} (unavailable)</option>}
        {catalog?.models.map(option => <option key={option.slug} value={option.slug}>{option.display_name}</option>)}
      </select>
      <div className="model-source"><span>From the selected harness and workstation</span><button type="button" disabled={busy} aria-label="Refresh models" onClick={() => { setCatalogResult(null); loadCatalog(); }}>Refresh</button></div>
      {modelError && <p className="error" role="alert">{modelError}</p>}
      <label htmlFor="agent-manager">Reports to</label><select id="agent-manager" name="reports_to" defaultValue=""><option value="">Organization owner</option>{agents.filter(agent => !agent.project_id).map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select>
      {error && <p className="error" role="alert">{error}</p>}
      <Button type="submit" disabled={!ready || busy}>{busy ? "Creating agent…" : "Create agent"}</Button>
    </form>
  </DialogContent></Dialog>;
}
