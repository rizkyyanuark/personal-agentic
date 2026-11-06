import { useEffect, useRef, useState } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import { ArrowUpRight, Check, ChevronDown, Globe2, RotateCw } from "lucide-react";
import { api, put } from "./api";
import { ActionStatus, PendingIcon, useActionFeedback } from "./ActionFeedback";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import { ActionTooltip } from "./components/ui/tooltip";
import { ValuePicker } from "./ValuePicker";
import type { OfficePublication } from "./bindings/OfficePublication";
import "./public-office-settings.css";

type Candidate = { id: string; name: string; deleted: boolean; role: string };

export function PublicOfficeSettings({ tenants }: { tenants: Candidate[] }) {
  const [publication, setPublication] = useState<OfficePublication | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const mounted = useRef(false);
  const feedback = useActionFeedback("public-office-publication");
  const busy = loading || feedback.pending !== null;
  const eligible = tenants.filter(tenant => !tenant.deleted && tenant.role === "owner");
  const unchanged = publication?.status === "published" && publication.workspace_id === draft;
  const needsReconciliation = Boolean(loadError) || feedback.result?.kind === "error" || feedback.result?.kind === "warning";
  const status = loading ? "Loading…" : !publication ? "Status unknown"
    : publication.status === "published" ? "Published"
      : publication.status === "unavailable" ? "Unavailable" : "Not published";
  const publishLabel = feedback.isPending("publish") ? "Publishing…" : unchanged ? "Published"
    : publication?.workspace_id ? "Update office" : "Publish office";

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void api<OfficePublication>("/office/publication", { signal: controller.signal })
      .then(saved => {
        if (controller.signal.aborted) return;
        setPublication(saved);
        setDraft(saved.workspace_id ?? "");
      })
      .catch(() => { if (!controller.signal.aborted) setLoadError("Publication settings could not load. Refresh to retry."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { mounted.current = false; controller.abort(); };
  }, []);

  async function save(workspaceId: string | null) {
    await feedback.run(workspaceId === null ? "stop" : "publish", async () => {
      const saved = await put<OfficePublication>("/office/publication", { workspace_id: workspaceId });
      if (mounted.current) { setPublication(saved); setLoadError(""); }
      if (saved.status === "unavailable") return { kind: "warning", message: "Publication saved, but its workspace is unavailable. Refresh publication to check its status." };
      return { kind: "success", message: saved.status === "unpublished" ? "Public office unpublished." : `${saved.workspace?.name}: public office published.` };
    }, { errorMessage: "Publication could not be confirmed. Refresh status before retrying; your selection is unchanged." });
  }

  async function refreshPublication() {
    await feedback.run("refresh", async () => {
      const saved = await api<OfficePublication>("/office/publication");
      if (mounted.current) { setPublication(saved); setLoadError(""); }
      return { kind: "success", message: "Saved publication refreshed. Your draft selection is unchanged." };
    }, { errorMessage: "Saved publication could not refresh. Your selection is unchanged." });
  }

  const current = publication?.status === "published"
    ? `Published: ${publication.workspace?.name}`
    : publication?.status === "unavailable"
      ? "The published workspace is unavailable. Choose another workspace or stop publishing."
      : "No office is published.";

  return <section className="settings-card public-office-settings" aria-labelledby="public-office-heading">
    <header className="public-office-heading">
      <div className="public-office-title"><Globe2 aria-hidden="true" /><h2 id="public-office-heading">Public Live Office</h2></div>
      <Badge variant="outline" role="status">{status}</Badge>
      <ActionTooltip content="Refresh publication" side="top">
        <Button type="button" variant="ghost" size="icon" className="public-office-refresh" aria-label="Refresh publication" disabled={busy} aria-busy={feedback.isPending("refresh")} onClick={() => void refreshPublication()}>
          <RotateCw className={feedback.isPending("refresh") ? "action-pending-icon" : undefined} aria-hidden="true" />
        </Button>
      </ActionTooltip>
    </header>
    <p className="public-office-intro">One workspace, open to everyone without sign-in.</p>
    <form className="public-office-form" onSubmit={event => { event.preventDefault(); if (draft && !busy && !unchanged) void save(draft); }}>
      <div className="public-office-field">
        <label htmlFor="public-office-workspace">Public workspace</label>
        <ValuePicker id="public-office-workspace" aria-label="Public workspace" searchable value={draft} onValueChange={setDraft} disabled={busy}
          options={[{ value: "", label: "Choose a workspace" }, ...eligible.map(tenant => ({ value: tenant.id, label: tenant.name }))]} />
        {publication && <p className={unchanged || publication.status === "unpublished" ? "sr-only" : "public-office-current"} data-testid="saved-publication">{current}</p>}
        {!loading && eligible.length === 0 && <p className="public-office-current">Create an active workspace that you own to publish an office.</p>}
      </div>
      <Collapsible.Root className="public-office-disclosure">
        <p>Agent profiles and work activity will be public.</p>
        <Collapsible.Trigger render={<Button type="button" variant="ghost" />} className="public-office-details-trigger">
          What visitors can see<ChevronDown data-icon="inline-end" aria-hidden="true" />
        </Collapsible.Trigger>
        <Collapsible.Panel className="public-office-details">
          <div>
            <p><strong>Visible:</strong> agent profiles, group and project names, sanitized work activity and metrics.</p>
            <p><strong>Excluded:</strong> raw chat, prompts, full outputs, credentials and private workdir paths.</p>
            <p>Review your profile and group descriptions before publishing.</p>
          </div>
        </Collapsible.Panel>
      </Collapsible.Root>
      <div className="public-office-footer">
        <div className="public-office-actions">
          <Button type="submit" disabled={busy || !publication || unchanged || !eligible.some(tenant => tenant.id === draft)} aria-busy={feedback.isPending("publish")}>
            <PendingIcon pending={feedback.isPending("publish")} />{unchanged && <Check data-icon="inline-start" aria-hidden="true" />}{publishLabel}
          </Button>
          {publication?.workspace_id && <Button type="button" variant="outline" disabled={busy} aria-busy={feedback.isPending("stop")} onClick={() => void save(null)}>
            <PendingIcon pending={feedback.isPending("stop")} />{feedback.isPending("stop") ? "Stopping…" : "Stop publishing"}
          </Button>}
        </div>
        <Button variant="link" role="link" nativeButton={false} render={<a href="/office" target="_blank" rel="noreferrer" />}>
          Open public office<ArrowUpRight data-icon="inline-end" aria-hidden="true" />
        </Button>
      </div>
    </form>
    {loadError && <p role="alert" className="error">{loadError}</p>}
    {feedback.result && !feedback.result.announcedByToast && <ActionStatus feedback={feedback} />}
    {needsReconciliation && <Button type="button" variant="outline" disabled={busy} onClick={() => void refreshPublication()}>Refresh saved status</Button>}
  </section>;
}
