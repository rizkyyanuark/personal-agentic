import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSearchQuery, searchEmptyMessage } from "../src/group-search.ts";

test("query edges follow Unicode White_Space plus BOM without changing internal spacing", () => {
  for (const edge of [" ", "\t\r\n", "\u00a0", "\u0085", "\ufeff", "\u2003\u3000"]) {
    assert.equal(normalizeSearchQuery(`${edge}two  words${edge}`), "two  words");
    assert.equal(normalizeSearchQuery(edge), "");
  }
  assert.equal(normalizeSearchQuery("\u200bword\u200b"), "\u200bword\u200b");
  const internal = `word${" ".repeat(32000)}word`;
  assert.equal(normalizeSearchQuery(` ${internal} `), internal);
  assert.equal(Buffer.byteLength(normalizeSearchQuery(` \ufeff${"🚀".repeat(250)}\t`)), 1000);
  assert.equal(Buffer.byteLength(normalizeSearchQuery("🚀".repeat(251))), 1004);
});

test("file readiness text distinguishes known zero from positive and unknown availability", () => {
  for (const mode of ["documents", "images"]) {
    assert.match(searchEmptyMessage(mode, 0), new RegExp(`No searchable indexed ${mode} yet`));
    assert.equal(searchEmptyMessage(mode, 3), `No ${mode} found in this group.`);
    assert.equal(searchEmptyMessage(mode), `No ${mode} found in this group.`);
  }
  assert.equal(searchEmptyMessage("messages", 0), "No messages found in this group.");
});
