import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { GroupPreferences } from "./bindings/GroupPreferences";
import { useActionFeedback } from "./ActionFeedback";
import { safeActionError } from "./actionErrors";
import { ApiFailure } from "./api";

type Change = { next: GroupPreferences; message: string; toast: boolean; resolve: (saved: boolean) => void };

export function useGroupPreferences(server: GroupPreferences, write: (next: GroupPreferences) => Promise<void>, refresh: () => Promise<void>) {
  const feedback = useActionFeedback("sidebar-preferences");
  const run = feedback.run;
  const callbacks = useRef({ write, refresh });
  useLayoutEffect(() => { callbacks.current = { write, refresh }; }, [write, refresh]);
  const confirmed = useRef(server);
  const [local, setLocal] = useState<GroupPreferences | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const state = useRef({ live: true, running: false, recovery: false, intent: server, queue: [] as Change[] });
  useLayoutEffect(() => { const current = state.current; current.live = true; return () => {
    current.live = false;
    for (const change of current.queue.splice(0)) change.resolve(false);
  }; }, []);
  useLayoutEffect(() => {
    if (!state.current.running && !state.current.recovery && local === null) {
      confirmed.current = server; state.current.intent = server;
    }
  }, [server, local]);

  const save = useCallback((next: GroupPreferences, message: string, toast = false): Promise<boolean> => {
    const current = state.current;
    if (!current.live || current.recovery) return Promise.resolve(false);
    if (JSON.stringify(next) === JSON.stringify(current.intent)) return Promise.resolve(true);
    current.intent = next; setLocal(next); setAnnouncement("");
    return new Promise(resolve => {
      current.queue.push({ next, message, toast, resolve });
      if (current.running) return;
      current.running = true; setBusy(true);
      void (async () => {
        while (current.live && current.queue.length) {
          const changes = current.queue.splice(0);
          const latest = changes[changes.length - 1];
          let saved = false;
          await run("save", async () => {
            try {
              await callbacks.current.write(latest.next);
              saved = true; confirmed.current = latest.next;
            } catch (error) {
              const rejected = error instanceof ApiFailure && [400, 401, 403, 409, 422].includes(error.status);
              current.recovery = !rejected;
              for (const queued of current.queue.splice(0)) queued.resolve(false);
              if (current.live) {
                if (rejected) { current.intent = confirmed.current; setLocal(confirmed.current); }
                setNeedsRefresh(!rejected);
              }
              return { kind: "error", message: rejected ? `Preference save rejected: ${safeActionError(error)} Your draft is retained.` : "Preference save could not be confirmed. Refresh preferences to reconcile before editing again." };
            }
            if (current.queue.length) return latest.toast ? { kind: "success", message: latest.message } : undefined;
            try {
              await callbacks.current.refresh();
              if (current.live && !current.queue.length) { setLocal(null); setNeedsRefresh(false); }
            } catch {
              current.recovery = true;
              if (current.live) { setLocal(confirmed.current); setNeedsRefresh(true); }
              return { kind: "warning", message: "Preferences saved, but the view could not refresh. Retry refresh without saving again." };
            }
            if (current.live) setAnnouncement(latest.message);
            return { kind: "success", message: latest.message };
          }, { toast: latest.toast });
          for (const change of changes) change.resolve(saved);
          if (current.recovery) {
            for (const change of current.queue.splice(0)) change.resolve(false);
            break;
          }
        }
        current.running = false;
        if (current.live) setBusy(false);
      })();
    });
  }, [run]);

  const retry = useCallback(async () => {
    const current = state.current;
    if (current.running || !current.live) return;
    await run("refresh", async () => {
      await callbacks.current.refresh();
      if (current.live) { current.recovery = false; setLocal(null); setNeedsRefresh(false); setAnnouncement(""); }
      return { kind: "success", message: "Group preferences refreshed." };
    }, { errorMessage: "Preferences could not refresh. Your last confirmed state is retained." });
  }, [run]);
  return { preferences: local ?? server, busy, needsRefresh, announcement, feedback, save, retry };
}
export type GroupPreferenceState = ReturnType<typeof useGroupPreferences>;
