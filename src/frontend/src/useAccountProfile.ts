import { useLayoutEffect, useRef, useState } from "react";
import { api, put } from "./api";
import { useActionFeedback } from "./ActionFeedback";

export function useAccountProfile({ user, workspaceId, displayName, onDisplayNameChange }: {
  user: string; workspaceId: string; displayName: string | null;
  onDisplayNameChange?: (name: string | null) => void;
}) {
  const scope = JSON.stringify([user, workspaceId]);
  const [state, setState] = useState({ scope, draft: displayName ?? "", saved: false });
  if (state.scope !== scope) setState({ scope, draft: displayName ?? "", saved: false });
  const lifetime = useRef<object | null>(null);
  useLayoutEffect(() => {
    lifetime.current = {};
    return () => { lifetime.current = null; };
  }, [scope]);
  const feedback = useActionFeedback(`account-profile:${scope}`, scope);
  const draft = state.scope === scope ? state.draft : displayName ?? "";
  const trimmed = draft.trim();
  const hasControl = Array.from(draft).some(character => {
    const code = character.codePointAt(0)!;
    return code < 32 || (code >= 127 && code <= 159);
  });
  const validation = hasControl ? "Display name cannot contain control characters."
    : Array.from(trimmed).length > 64 ? "Display name cannot exceed 64 characters." : null;
  const changed = trimmed !== (displayName ?? "");
  const pending = feedback.pending !== null;

  async function save() {
    if (pending || !changed || validation || !lifetime.current) return;
    const owner = lifetime.current;
    const current = () => lifetime.current === owner;
    await feedback.run("save-profile", async () => {
      try {
        const result = await put<{ display_name: string | null }>("/me/profile", { display_name: trimmed || null });
        if (!current()) return;
        onDisplayNameChange?.(result.display_name);
        setState({ scope, draft: result.display_name ?? "", saved: true });
        return { kind: "success", message: "Profile saved." };
      } catch (error) {
        if (current()) throw error;
      }
    }, { errorMessage: "Could not save profile. Your draft has been kept." });
  }

  async function checkSaved() {
    if (pending || !lifetime.current) return;
    const owner = lifetime.current;
    const current = () => lifetime.current === owner;
    await feedback.run("check-profile", async () => {
      try {
        const me = await api<{ display_name?: string | null }>("/me");
        if (!current()) return;
        onDisplayNameChange?.(me.display_name ?? null);
        const name = me.display_name ?? "";
        return { kind: "success", message: name === trimmed
          ? `Saved display name matches your draft (${name || "account default"}).`
          : `Saved display name is: "${name || "account default"}". Your unsaved draft "${draft}" is retained.` };
      } catch (error) {
        if (current()) throw error;
      }
    }, { errorMessage: "Could not check saved profile." });
  }

  function setDraft(value: string) {
    setState({ scope, draft: value, saved: false });
    feedback.clear();
  }
  return { draft, saved: state.scope === scope && state.saved, feedback, validation, changed, pending, setDraft, save, checkSaved };
}

export type AccountProfileController = ReturnType<typeof useAccountProfile>;
