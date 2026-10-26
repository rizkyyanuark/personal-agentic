import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { expect } from "@playwright/test";
import { selectValue } from "./value-picker.mjs";

export async function verifyInvitationResilience({ page, owner, tenant, base, matrixId, record, openDialog, closeDialog, createLink, dismiss, mutateFixtureDb }) {
  const matrix = process.env.AE_TEST_MATRIX_CONTAINER;
  const matrixUrl = process.env.AE_TEST_MATRIX_URL;
  assert.equal(matrix, "personal-agentic-invitations-test-matrix");
  assert(matrixUrl && new URL(matrixUrl).hostname === "127.0.0.1");
  const inventoryUrl = `${base}/api/tenants/${tenant.id}/invitations`;
  await owner.addCookies([{ name: "ae_workspace", value: tenant.id, url: base, sameSite: "Strict" }]);
  await page.reload();
  await dismiss(page);
  execFileSync("docker", ["stop", "--time", "10", matrix], { stdio: "pipe" });
  try {
    await page.getByRole("button", { name: "Refresh invitations", exact: true }).click();
    await openDialog(page);
    await expect(page.getByText("New-account invitations are not available yet. You can still invite an existing Matrix account.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create invitation", exact: true })).toBeDisabled();
    await page.getByRole("tab", { name: "Existing Matrix account", exact: true }).click();
    await page.getByLabel("Invite Matrix user", { exact: true }).fill(matrixId);
    await expect(page.getByRole("button", { name: "Invite", exact: true })).toBeEnabled();
    await closeDialog(page);
  } finally { execFileSync("docker", ["start", matrix], { stdio: "pipe" }); }
  await expect.poll(async () => {
    try { return (await fetch(matrixUrl + "/_matrix/client/versions")).status; }
    catch { return 0; }
  }, { timeout: 45000 }).toBe(200);
  await Promise.all([page.waitForResponse(r => r.url() === inventoryUrl && r.request().method() === "GET"), page.getByRole("button", { name: "Refresh invitations", exact: true }).click()]);
  await expect(page.locator(".action-toast:not([data-ending-style])")).toHaveCount(0);
  record("Real Synapse outage disables only new-account links; existing-ID method remains usable; successful reads are quiet");

  await page.route(inventoryUrl, route => route.request().method() === "GET" ? route.abort("failed") : route.continue());
  const createdResponse = page.waitForResponse(r => r.url() === inventoryUrl && r.request().method() === "POST");
  const retained = await createLink(page);
  const created = await (await createdResponse).json();
  await expect(page.getByText("Invitation created. Keep its link; the invitation list could not refresh.", { exact: true })).toHaveCount(1);
  await expect(page.getByLabel("Invitation link — shown only now")).toHaveValue(retained);
  await closeDialog(page);
  await page.unroute(inventoryUrl);
  await dismiss(page);
  await Promise.all([page.waitForResponse(r => r.url() === inventoryUrl && r.request().method() === "GET"), page.getByRole("button", { name: "Refresh invitations", exact: true }).click()]);
  const after = await (await owner.request.get(inventoryUrl)).json();
  assert.equal(after.invitations.filter(i => i.id === created.id).length, 1);
  await openDialog(page);
  await expect(page.getByLabel("Invitation link — shown only now")).toHaveValue(retained);
  await closeDialog(page);
  record("Acknowledged real creation survives an injected list-read outage; retry reads without creating a replacement");

  assert(/^[a-f0-9-]+$/i.test(created.id));
  mutateFixtureDb(`PRAGMA ignore_check_constraints=ON; UPDATE member_invitations SET status='future_status' WHERE id='${created.id}';`);
  await page.getByRole("button", { name: "Refresh invitations", exact: true }).click();
  await expect(page.getByText("Unknown status", { exact: true })).toBeVisible();
  await page.route(inventoryUrl, route => route.request().method() === "GET" ? route.abort("failed") : route.continue());
  await page.getByRole("listitem").filter({ has: page.getByText("Unknown status", { exact: true }) }).getByRole("button", { name: "Revoke invitation", exact: true }).click();
  await expect(page.getByText("Invitation revoked, but the list could not refresh. Refresh the list; do not revoke again.", { exact: true })).toHaveCount(1);
  await page.unroute(inventoryUrl);
  const revoked = await (await owner.request.get(inventoryUrl)).json();
  assert.equal(revoked.invitations.find(i => i.id === created.id).status, "revoked");
  await openDialog(page);
  await expect(page.getByLabel("Invitation link — shown only now")).toHaveCount(0);
  await closeDialog(page); await dismiss(page);
  await page.getByRole("button", { name: "Refresh invitations", exact: true }).click();
  record("Real persisted unknown state stays truthful; acknowledged revoke/read failure does not repeat or falsely delete accounts");

  let release, reached, finished;
  const gate = new Promise(resolve => { release = resolve; });
  const captured = new Promise(resolve => { reached = resolve; });
  const completed = new Promise(resolve => { finished = resolve; });
  await page.route(inventoryUrl, async route => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    reached();
    await gate;
    await route.fulfill({ response });
    finished();
  });
  await openDialog(page);
  await page.getByRole("button", { name: "Create invitation", exact: true }).click();
  await captured;
  await closeDialog(page);
  await selectValue(page.getByRole("combobox", { name: "Workspace", exact: true }), "default");
  release(); await completed; await page.unroute(inventoryUrl);
  await openDialog(page);
  await expect(page.getByLabel("Invitation link — shown only now")).toHaveCount(0);
  await expect(page.locator(".action-toast:not([data-ending-style])")).toHaveCount(0);
  await closeDialog(page);
  await selectValue(page.getByRole("combobox", { name: "Workspace", exact: true }), tenant.id);
  await openDialog(page);
  await expect(page.getByLabel("Invitation link — shown only now")).toHaveCount(0);
  await closeDialog(page);
  record("Delayed real create response after SPA workspace switch cannot leak a link, toast, or stale state");

  const settingsResponse = await owner.request.post("/api/tenants", { data: { name: "Invitation settings regression" } });
  assert.equal(settingsResponse.status(), 200);
  const settings = await settingsResponse.json();
  await page.reload();
  await selectValue(page.getByRole("combobox", { name: "Workspace", exact: true }), settings.id);
  await page.locator("#workspace-name").fill("Invitation settings renamed");
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(page.locator("#workspace-name")).toHaveValue("Invitation settings renamed");
  await openDialog(page);
  await page.getByRole("tab", { name: "Existing Matrix account", exact: true }).click();
  await page.getByLabel("Invite Matrix user", { exact: true }).fill(matrixId);
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  await expect(page.getByLabel("Invite Matrix user", { exact: true })).toHaveValue("");
  await closeDialog(page);
  await selectValue(page.getByLabel(`Role for ${matrixId}`, { exact: true }), "owner");
  await expect.poll(async () => (await (await owner.request.get(`/api/tenants/${settings.id}/members`)).json()).find(m => m.user === matrixId)?.role).toBe("owner");
  await selectValue(page.getByLabel(`Role for ${matrixId}`, { exact: true }), "member");
  await page.locator(".settings-person").filter({ has: page.getByText(matrixId, { exact: true }) }).getByRole("button", { name: "Remove", exact: true }).click();
  await expect.poll(async () => (await (await owner.request.get(`/api/tenants/${settings.id}/members`)).json()).some(m => m.user === matrixId)).toBe(false);
  await page.getByText("Delete workspace", { exact: true }).filter({ hasNot: page.locator("svg") }).first().click();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Delete workspace", exact: true }).click();
  const deleted = page.locator(".settings-person").filter({ has: page.getByText("Invitation settings renamed", { exact: true }) });
  await expect(deleted.getByRole("button", { name: "Restore", exact: true })).toBeVisible();
  await deleted.getByRole("button", { name: "Restore", exact: true }).click();
  await expect.poll(async () => (await (await owner.request.get("/api/tenants")).json()).find(t => t.id === settings.id)?.deleted).toBe(false);
  record("Existing workspace rename, role change, removal, deletion and restoration still persist through real settings controls");
}
