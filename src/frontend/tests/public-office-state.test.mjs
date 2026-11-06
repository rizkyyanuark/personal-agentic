import assert from "node:assert/strict";
import test from "node:test";
import { assertPublicOfficeState } from "../src/publicOfficeState.ts";

const published = () => ({ schema_version: 1, revision: 1, status: "published", workspace: { id: "published", name: "Office" }, snapshot: { schema_version: 1, workspace_id: "published", group_id: null } });

test("public envelope requires known schema and safe monotonic revision values", () => {
  for (const revision of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1", null]) assert.throws(() => assertPublicOfficeState({ ...published(), revision }));
  assert.throws(() => assertPublicOfficeState({ ...published(), schema_version: 2 }));
  assert.doesNotThrow(() => assertPublicOfficeState(published()));
});
test("public snapshot must match the envelope workspace and have no team filter", () => {
  for (const snapshot of [{ schema_version: 1, workspace_id: "private", group_id: null }, { schema_version: 1, workspace_id: "published", group_id: "private" }, null]) assert.throws(() => assertPublicOfficeState({ ...published(), snapshot }));
});
test("unpublished and unavailable responses cannot carry retained workspace data", () => {
  for (const status of ["unpublished", "unavailable"]) {
    assert.throws(() => assertPublicOfficeState({ ...published(), status }));
    assert.doesNotThrow(() => assertPublicOfficeState({ schema_version: 1, revision: 2, status, workspace: null, snapshot: null }));
  }
});
