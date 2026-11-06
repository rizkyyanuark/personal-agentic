import type { PublicOfficeState } from "./bindings/PublicOfficeState";

export function assertPublicOfficeState(value: unknown): asserts value is PublicOfficeState {
  if (!value || typeof value !== "object") throw new Error("Invalid office publication");
  const state = value as Record<string, unknown>;
  if (state.schema_version !== 1 || !Number.isSafeInteger(state.revision) || (state.revision as number) < 0)
    throw new Error("Invalid office publication version");
  if (state.status === "unpublished" || state.status === "unavailable") {
    if (state.snapshot !== null || state.workspace !== null) throw new Error("Unavailable publication included a snapshot");
    return;
  }
  if (state.status !== "published" || !state.workspace || typeof state.workspace !== "object" || !state.snapshot || typeof state.snapshot !== "object")
    throw new Error("Invalid published office");
  const workspace = state.workspace as Record<string, unknown>;
  const snapshot = state.snapshot as Record<string, unknown>;
  if (typeof workspace.id !== "string" || !workspace.id || typeof workspace.name !== "string"
    || snapshot.schema_version !== 1 || snapshot.workspace_id !== workspace.id || snapshot.group_id !== null)
    throw new Error("Public office workspace mismatch");
}
