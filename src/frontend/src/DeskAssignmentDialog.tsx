import { useEffect, useState } from "react";
import { Button } from "./components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./components/ui/dialog";
import { ValuePicker } from "./ValuePicker";
import { api } from "./api";
import type { Agent } from "./bindings/Agent";
import type { CockpitState } from "./bindings/CockpitState";
import { useActionFeedback } from "./ActionFeedback";

const deskSlots = [
  ["hq_lab_director", "Desk 1: Director"],
  ["data_engineer", "Desk 2: Data Engineer"],
  ["data_scientist", "Desk 3: Data Scientist"],
  ["research_scientist", "Desk 4: Research Scientist"],
  ["ml_engineer", "Desk 5: ML Engineer"],
] as const;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: Agent[];
  workspaceId: string;
  role: string;
  onSaved: () => Promise<void>;
};

export function DeskAssignmentDialog({ open, onOpenChange, agents, workspaceId, role, onSaved }: Props) {
  const [snapshot, setSnapshot] = useState<CockpitState | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const feedback = useActionFeedback("desk-assignment", workspaceId);
  const busy = feedback.pending !== null || loading;

  const eligibleAgents = agents.filter(agent => !agent.project_id && !agent.deleted_at);

  useEffect(() => {
    if (!open || role !== "owner") return;
    let active = true;
    void api<CockpitState>("/cockpit/state", { headers: { "x-ae-workspace": workspaceId } })
      .then((state) => {
        if (!active) return;
        setSnapshot(state);
        setDraft(state.mapping ?? {});
      })
      .catch((err) => {
        if (!active) return;
        void feedback.run("load-error", async () => { throw err; });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [open, role, workspaceId]);

  if (role !== "owner") return null;

  async function handleSetup() {
    await feedback.run("setup", async () => {
      const next = await api<CockpitState>("/cockpit/setup", {
        method: "POST",
        headers: { "x-ae-workspace": workspaceId },
        body: "{}",
      });
      setSnapshot(next);
      setDraft(next.mapping ?? {});
      await onSaved();
    });
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    await feedback.run("save-mapping", async () => {
      await api<CockpitState>("/cockpit/mapping", {
        method: "PUT",
        headers: { "x-ae-workspace": workspaceId },
        body: JSON.stringify({ mapping: draft }),
      });
      await onSaved();
      onOpenChange(false);
    });
  }

  const assignedValues = deskSlots.map(([key]) => draft[key]).filter(Boolean);
  const hasDuplicates = new Set(assignedValues).size !== assignedValues.length;
  const isComplete = deskSlots.every(([key]) => Boolean(draft[key]));
  const isValid = isComplete && !hasDuplicates;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="desk-assignment-dialog" style={{ maxWidth: "560px" }}>
        <DialogHeader>
          <DialogTitle>Desk Assignments</DialogTitle>
          <DialogDescription>
            Assign organization agents to office workstations. Desks without an assigned agent will remain in standby with monitors dark and empty chairs.
          </DialogDescription>
        </DialogHeader>

        {snapshot?.setup_required && (
          <div style={{ padding: "12px", background: "var(--color-bg-subtle, #f5f5f5)", borderRadius: "6px", marginBottom: "16px" }}>
            <p style={{ margin: "0 0 8px 0", fontSize: "14px", fontWeight: 500 }}>Default profiles needed</p>
            <p style={{ margin: "0 0 12px 0", fontSize: "13px", color: "var(--color-fg-muted, #666)" }}>
              One or more desk slots require agent profiles. Create missing profiles automatically or assign existing agents below.
            </p>
            <Button type="button" disabled={busy} onClick={() => void handleSetup()}>
              {busy ? "Creating profiles..." : "Create default profiles"}
            </Button>
          </div>
        )}

        <form onSubmit={(e) => void handleSave(e)}>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "20px" }}>
            {deskSlots.map(([key, label]) => (
              <label key={key} style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", fontWeight: 500 }}>
                <span>{label}</span>
                <ValuePicker
                  id={`desk-slot-${key}`}
                  aria-label={label}
                  searchable
                  value={draft[key] ?? ""}
                  disabled={busy}
                  onValueChange={(val) => setDraft((curr) => ({ ...curr, [key]: val }))}
                  options={[
                    { value: "", label: "Unassigned (Empty desk)" },
                    ...eligibleAgents.map((agent) => ({ value: agent.id, label: `${agent.name} (${agent.position || "Agent"})` })),
                  ]}
                />
              </label>
            ))}
          </div>

          {hasDuplicates && (
            <p style={{ color: "var(--color-danger, #d32f2f)", fontSize: "13px", margin: "0 0 12px 0" }}>
              Each agent can only be assigned to one desk at a time.
            </p>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !isValid}>
              Save assignments
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
