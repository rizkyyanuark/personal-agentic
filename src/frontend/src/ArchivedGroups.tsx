import { useState } from "react";
import { Archive, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { Group } from "./bindings/Group";
import { post } from "./api";

import { PendingIcon, useActionFeedback } from "./ActionFeedback";

export function ArchivedGroups({ open, onClose, groups, onOpen, onRefresh }: {
  open: boolean; onClose: () => void; groups: Group[]; onOpen: (id: string) => void; onRefresh: () => Promise<void>;
}) {
  const feedback = useActionFeedback("archived-groups");
  const busy = feedback.pending !== null;
  const [restoredIds, setRestoredIds] = useState<string[]>([]);
  const archived = groups.filter((g) => g.archived_at && !g.deleted_at).sort((a, b) => a.name.localeCompare(b.name));
  async function restore(group: Group) {
    await feedback.run(`restore:${group.id}`, async () => {
      try {
        await post(`/groups/${group.id}/restore`);
        setRestoredIds(prev => prev.includes(group.id) ? prev : [...prev, group.id]);
      } catch (reason) {
        return { kind: "error", message: reason instanceof Error ? reason.message : `Could not restore ${group.name}.` };
      }
      try {
        await onRefresh();
        setRestoredIds(prev => prev.filter(id => id !== group.id));
      } catch {
        return { kind: "warning", message: `${group.name} restored, but the view could not refresh.` };
      }
      return { kind: "success", message: `${group.name} restored. Scheduled tasks remain paused.` };
    }, { errorMessage: `Restore of ${group.name} could not be confirmed.` });
  }
  return <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
    <DialogContent className="archive-dialog"><DialogHeader><DialogTitle>Archived groups</DialogTitle>
      <DialogDescription>Preview saved conversations or restore a group. Its scheduled tasks stay paused until you resume them.</DialogDescription>
    </DialogHeader>
      <ul className="archived-group-list">
        {archived.map((group) => <li key={group.id}>
          <Archive size={18} /><div><strong>{group.name}</strong><p>{group.description}</p><small>Archived {new Date(group.archived_at!).toLocaleDateString()} · Can be restored</small></div>
          <div className="archive-actions"><Button size="sm" variant="ghost" onClick={() => { onOpen(group.id); onClose(); }}>Preview {group.name}</Button>
            {restoredIds.includes(group.id) ? (
              <Button size="sm" variant="outline" disabled={busy} aria-busy={feedback.isPending(`restore:${group.id}`)} onClick={() => void feedback.run(`restore:${group.id}`, async () => {
                await onRefresh();
                setRestoredIds(prev => prev.filter(id => id !== group.id));
                return { kind: "success", message: `${group.name} restored. Scheduled tasks remain paused.` };
              }, { errorMessage: `${group.name}: view refresh failed. Group remains restored.` })}>
                <PendingIcon pending={feedback.isPending(`restore:${group.id}`)} size={14} />
                Retry refresh
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled={busy} aria-busy={feedback.isPending(`restore:${group.id}`)} onClick={() => void restore(group)}>
                <PendingIcon pending={feedback.isPending(`restore:${group.id}`)} size={14} />
                {!feedback.isPending(`restore:${group.id}`) && <RotateCcw size={14} />}
                {feedback.isPending(`restore:${group.id}`) ? "Restoring…" : `Restore ${group.name}`}
              </Button>
            )}</div>
        </li>)}
      </ul>
      {!archived.length && <p className="muted">No archived groups.</p>}
    </DialogContent>
  </Dialog>;
}
