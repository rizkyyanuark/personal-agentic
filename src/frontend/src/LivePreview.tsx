import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { LogIn, RotateCw, Settings2, X } from "lucide-react";
import { mountCockpit, type CockpitHandle } from "@personal-agentic/cockpit";
import "@personal-agentic/cockpit/styles.css";
import { Button } from "./components/ui/button";
import { ValuePicker } from "./ValuePicker";
import { api, ApiFailure } from "./api";
import type { Agent } from "./bindings/Agent";
import type { Group } from "./bindings/Group";
import type { CockpitState } from "./bindings/CockpitState";
import type { Run } from "./bindings/Run";
import { resolveCockpitWorkspace } from "./cockpitWorkspace";
import "./LivePreview.css";

const slots = [
  ["hq_lab_director", "Orion · Director"],
  ["data_engineer", "Nova · Data Engineer"],
  ["data_scientist", "Atlas · Data Scientist"],
  ["research_scientist", "Lyra · Research Scientist"],
  ["ml_engineer", "Axiom · ML Engineer"],
] as const;

const availabilityLabels: Record<string, string> = {
  unmapped: "Profile not assigned",
  deleted: "Profile deleted · choose another agent",
  paused: "Paused · enable in Profile",
  unattached: "Workdir not attached",
  offline: "Runtime offline",
  checking: "Checking runtime",
  unknown: "Runtime status unavailable",
  ready: "Runtime ready",
};
const phaseLabels: Record<string, string> = {
  idle: "No active work",
  queued: "Queued",
  starting: "Starting",
  working: "Working",
  awaiting_answer: "Needs your answer",
  awaiting_delegates: "Waiting for delegated work",
  unknown: "Work status unavailable",
};

type Props = {
  workspaceId: string;
  workspaceName: string;
  role: string;
  groupId: string | null;
  agents: Agent[];
  groups: Group[];
  runs: Run[];
  onFilter: (id: string | null) => void;
  onBack: () => void;
  onOpenAgent: (id: string) => void;
  onRefresh: () => Promise<void>;
};
type Connection = "loading" | "live" | "paused" | "offline" | "denied" | "expired";

export default function LivePreview({ workspaceId, workspaceName, role, groupId, agents, groups, runs, onFilter, onBack, onOpenAgent, onRefresh }: Props) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const cockpit = useRef<CockpitHandle | null>(null);
  const actionRequest = useRef<AbortController | null>(null);
  const [snapshot, setSnapshot] = useState<CockpitState | null>(null);
  const [connection, setConnection] = useState<Connection>("loading");
  const [message, setMessage] = useState("Loading status for this workspace…");
  const [sceneError, setSceneError] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [refreshPulse, setRefreshPulse] = useState(false);
  const refreshPulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [actionError, setActionError] = useState("");
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [receivedScope, setReceivedScope] = useState("");
  const scope = `${workspaceId}:${groupId ?? "all"}:${revision}`;
  const displayConnection = receivedScope === scope ? connection : "loading";
  const displayMessage = receivedScope === scope ? message : "Loading status for this workspace…";
  const currentSnapshot = snapshot?.workspace_id === workspaceId && snapshot.group_id === groupId ? snapshot : null;
  const workspaceContext = useMemo(() => resolveCockpitWorkspace({
    workspaceName, groupId, agents, groups, runs, roster: currentSnapshot?.agents ?? [],
  }), [workspaceName, groupId, agents, groups, runs, currentSnapshot]);
  const workspaceContextRef = useRef(workspaceContext);
  const refreshing = refreshPulse || displayConnection === "loading";
  const connectionWarning = displayConnection === "offline" || displayConnection === "denied" || displayConnection === "expired";

  useEffect(() => () => {
    if (refreshPulseTimer.current) clearTimeout(refreshPulseTimer.current);
  }, []);

  function refreshStatus() {
    setRefreshPulse(true);
    if (refreshPulseTimer.current) clearTimeout(refreshPulseTimer.current);
    refreshPulseTimer.current = setTimeout(() => setRefreshPulse(false), 550);
    setRevision(value => value + 1);
  }

  useEffect(() => {
    if (role !== "owner" || !host) return;
    let active = true;
    let handle: CockpitHandle | null = null;
    void Promise.resolve().then(() => {
      if (!active) return;
      try {
        handle = mountCockpit(host, {
          assetBase: "/cockpit-assets/",
          workspace: workspaceContextRef.current,
        });
        cockpit.current = handle;
        handle.setConnection("loading", "Loading active workspace status…");
      } catch (error) {
        setSceneError(error instanceof Error ? error.message : String(error));
      }
    });
    return () => { active = false; cockpit.current = null; handle?.dispose(); };
  }, [role, workspaceId, host]);

  useEffect(() => {
    workspaceContextRef.current = workspaceContext;
    cockpit.current?.setWorkspace(workspaceContext);
  }, [workspaceContext, host]);

  useEffect(() => () => actionRequest.current?.abort(), [workspaceId]);

  useEffect(() => {
    if (role !== "owner" || !host) return;
    let stopped = false;
    let generation = 0;
    let request: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    cockpit.current?.setConnection("loading", "Loading selected team…");

    async function poll() {
      if (stopped || document.hidden || request) return;
      const controller = new AbortController();
      request = controller;
      const current = ++generation;
      let timedOut = false;
      const deadline = setTimeout(() => { timedOut = true; controller.abort(); }, 10000);
      try {
        const query = groupId ? `?group_id=${encodeURIComponent(groupId)}` : "";
        const next = await api<CockpitState>(`/cockpit/state${query}`, {
          signal: controller.signal,
          headers: { "x-ae-workspace": workspaceId },
        });
        if (stopped || controller.signal.aborted || current !== generation) return;
        if (next.schema_version !== 1 || next.workspace_id !== workspaceId || next.group_id !== groupId)
          throw new Error("Preview received a status snapshot for a different workspace or team.");
        setSnapshot(next);
        setReceivedScope(scope);
        setConnection("live");
        setMessage(`Updated ${new Date(next.generated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`);
        cockpit.current?.updateState(next);
      } catch (error) {
        if (stopped || (controller.signal.aborted && !timedOut) || current !== generation) return;
        const text = timedOut ? "Status request timed out. Reconnecting…" : error instanceof Error ? error.message : String(error);
        const status = error instanceof ApiFailure ? error.status : null;
        const blocked = status === 401 || status === 403;
        setReceivedScope(scope);
        setConnection(status === 401 ? "expired" : status === 403 ? "denied" : "offline");
        setMessage(status === 401 ? "Your session expired. Sign in again to view current work." : text);
        cockpit.current?.setConnection(blocked ? "error" : "offline", text);
        if (blocked) {
          stopped = true;
          setSnapshot(null);
        }
      } finally {
        clearTimeout(deadline);
        if (request === controller) request = null;
        if (!stopped && !document.hidden && current === generation)
          timer = setTimeout(() => void poll(), 2000);
      }
    }
    function visibilityChanged() {
      if (stopped) return;
      generation++;
      request?.abort();
      request = null;
      if (timer) clearTimeout(timer);
      timer = null;
      if (document.hidden) {
        setReceivedScope(scope);
        setConnection("paused");
        setMessage("Preview updates paused while this tab is hidden.");
        cockpit.current?.setConnection("loading", "Updates paused while tab is hidden.");
      } else if (!stopped) {
        setConnection("loading");
        setMessage("Refreshing active workspace status…");
        cockpit.current?.setConnection("loading", "Refreshing selected team…");
        void poll();
      }
    }
    document.addEventListener("visibilitychange", visibilityChanged);
    void poll();
    return () => {
      stopped = true;
      generation++;
      request?.abort();
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [workspaceId, groupId, role, revision, scope, host]);

  async function configure(path: "/cockpit/setup" | "/cockpit/mapping", body: object, method: "POST" | "PUT") {
    if (busy || role !== "owner") return;
    const controller = new AbortController();
    actionRequest.current?.abort();
    actionRequest.current = controller;
    setBusy(true);
    setActionError("");
    try {
      await api<CockpitState>(path, {
        method,
        signal: controller.signal,
        headers: { "x-ae-workspace": workspaceId },
        body: JSON.stringify(body),
      });
      if (controller.signal.aborted) return;
      setDraft(null);
      setRevision(value => value + 1);
      await onRefresh();
    } catch (error) {
      if (!controller.signal.aborted)
        setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      if (actionRequest.current === controller) actionRequest.current = null;
    }
  }

  const missing = currentSnapshot?.agents.filter(agent => agent.availability === "unmapped") ?? [];
  const roster = currentSnapshot?.agents ?? [];
  const eligibleAgents = agents.filter(agent => !agent.project_id && !agent.deleted_at);
  const mappingValid = draft !== null && slots.every(([key]) => Boolean(draft[key])) && new Set(slots.map(([key]) => draft[key])).size === slots.length;

  const teamSettings = <details className="live-preview-team">
      <summary aria-label="Configure cockpit team" title="Configure cockpit team"><Settings2 size={18} /><span className="sr-only">Configure cockpit team</span></summary>
      <div className="live-preview-team-panel">
      {currentSnapshot?.setup_required && <div className="live-preview-setup" role="status">
        <div><strong>Set up the cockpit team</strong><p>{missing.length} role{missing.length === 1 ? "" : "s"} need an agent profile. Create the profiles, then configure their runtime and workdir in Organization.</p></div>
        <Button disabled={busy} onClick={() => void configure("/cockpit/setup", {}, "POST")}>{busy ? "Creating profiles…" : "Create missing cockpit profiles"}</Button>
      </div>}
      <p className="live-preview-team-hint">Default hierarchy: Organization owner → Orion → Nova, Atlas, Lyra, and Axiom. Opening this preview never invokes an agent.</p>
      <ul className="live-preview-roster">{roster.map(agent => <li key={agent.office_role}>
        <div><strong>{agent.name}</strong><span>{agent.position} · {displayConnection === "live" ? availabilityLabels[agent.availability] ?? agent.availability : "Status unavailable until reconnected"}</span><span>{displayConnection === "live" ? agent.in_scope ? phaseLabels[agent.phase] ?? agent.phase : "Outside selected team" : "Last snapshot is not current"}</span></div>
        {agent.agent_id && agent.availability !== "deleted" && <Button variant="outline" onClick={() => { if (agent.agent_id) onOpenAgent(agent.agent_id); }}>Configure {agent.name}</Button>}
      </li>)}</ul>
      {currentSnapshot && <div className="live-preview-mapping">
        {draft === null ? <Button variant="outline" onClick={() => setDraft({ ...currentSnapshot.mapping })}>Assign existing agents to cockpit roles</Button> : <form onSubmit={event => { event.preventDefault(); if (mappingValid) void configure("/cockpit/mapping", { mapping: draft }, "PUT"); }}>
          <p>Choose a different Organization agent for each role. Existing profiles and reporting lines are preserved.</p>
          <div className="live-preview-role-selects">{slots.map(([key, label]) => <label key={key} htmlFor={`cockpit-role-${key}`}>{label}<ValuePicker id={`cockpit-role-${key}`} aria-label={label} searchable value={draft[key] ?? ""} disabled={busy} onValueChange={value => setDraft(current => ({ ...current, [key]: value }))} options={[{ value: "", label: "Choose Organization agent" }, ...eligibleAgents.map(agent => ({ value: agent.id, label: agent.name }))]} /></label>)}</div>
          {!mappingValid && <p>Choose five different agents before saving.</p>}
          <div className="live-preview-mapping-actions"><Button type="submit" disabled={busy || !mappingValid}>Save role mapping</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setDraft(null)}>Cancel</Button></div>
        </form>}
      </div>}
      </div>
    </details>;

  return <Dialog.Root open onOpenChange={(open, details) => {
    if (open) return;
    if (details.reason === "escape-key" && details.event.target instanceof Element && details.event.target.closest(".cockpit-root")) {
      details.cancel();
      return;
    }
    onBack();
  }}>
    <Dialog.Portal>
      <Dialog.Backdrop className="live-preview-backdrop" data-testid="live-preview-backdrop" />
      <Dialog.Popup className="live-preview-window" aria-modal="true" initialFocus={closeButton} finalFocus={() => document.querySelector<HTMLButtonElement>('[data-testid="open-live-preview"]')}>
        <header className="live-preview-header">
          <div className="live-preview-heading">
            <Dialog.Title className="live-preview-title">Live Preview</Dialog.Title>
            <Dialog.Description className="sr-only">3D office for {workspaceName}</Dialog.Description>
          </div>
          {role === "owner" && <div className="live-preview-controls">
            <label htmlFor="cockpit-team-filter"><span className="sr-only">Team</span>
              <ValuePicker id="cockpit-team-filter" aria-label="Team" searchable value={groupId ?? ""} onValueChange={value => onFilter(value || null)} options={[{ value: "", label: "All teams" }, ...groups.filter(group => !group.archived_at && !group.deleted_at).map(group => ({ value: group.id, label: `${group.project ? "Project · " : "Group · "}${group.name}` }))]} />
            </label>
            <p className={`live-preview-connection connection-${displayConnection} ${connectionWarning ? "live-preview-connection-warning" : "sr-only"}`} role="status" data-connection={displayConnection}>{displayConnection === "live" ? "Live" : displayMessage}</p>
            {displayConnection === "expired" ? <Button variant="outline" size="icon" className="live-preview-icon-button live-preview-refresh" aria-label="Sign in again" title="Sign in again" onClick={() => location.reload()}><LogIn size={18} /></Button> : <Button variant="outline" size="icon" className={`live-preview-icon-button live-preview-refresh ${refreshing ? "is-refreshing" : ""}`} aria-label="Refresh" title="Refresh" aria-busy={refreshing} disabled={busy || refreshing} onClick={refreshStatus}><RotateCw size={18} /></Button>}
            {teamSettings}
          </div>}
          <Dialog.Close ref={closeButton} className="live-preview-close" aria-label="Close Live Preview" title="Close Live Preview"><X size={20} /></Dialog.Close>
        </header>
        {role !== "owner" ? <p className="live-preview-access-error" role="alert">Workspace owner access is required to view the organization cockpit.</p> : <>
          {actionError && <p className="live-preview-error" role="alert">{actionError}</p>}
          {sceneError && <p className="live-preview-error" role="alert">The 3D view could not start: {sceneError}. Current agent status is still available under Configure cockpit team.</p>}
          <div ref={setHost} className="live-preview-scene" data-testid="cockpit-host" />
        </>}
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}
