import { expectValue, selectValue } from "./value-picker.mjs";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { captureFailure, closePreview, observeAssets, verifyOverlay, verifyFocusTrap, verifyCameraInteractions, verifyPreviewProportions, verifyRefresh, verifyResizeKeepsCamera, verifySnapshotUI, viewportScenarios, waitForScene } from "./cockpit-overlay.mjs";

const base = process.env.AE_TEST_URL || "http://localhost:18766";
const token = process.env.AE_TEST_OWNER_KEY;
assert(token, "Set AE_TEST_OWNER_KEY to authenticate against the real platform");
const proofDirectory = path.resolve(process.env.AE_TEST_PROOF_DIR || "../../scratch/cockpit-verification");
await mkdir(proofDirectory, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ baseURL: base, viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
const page = await context.newPage();
observeAssets(page);
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const request = context.request;
let tenant;
let other;
async function call(route, method = "GET", body, workspace = tenant?.id) {
  const response = await request.fetch(`/api${route}`, {
    method,
    ...(workspace ? { headers: { "x-ae-workspace": workspace } } : {}),
    ...(body === undefined ? {} : { data: body }),
  });
  assert(response.ok(), `${method} ${route}: ${response.status()} ${await response.text()}`);
  return response.json();
}

try {
  const anonymous = await browser.newContext({ baseURL: base });
  assert.equal((await anonymous.request.get("/api/cockpit/state")).status(), 401);
  await anonymous.close();
  await call("/login", "POST", { token });
  tenant = await call("/tenants", "POST", { name: `Cockpit verification ${crypto.randomUUID().slice(0, 8)}` });
  await context.addCookies([{ name: "ae_workspace", value: tenant.id, url: base, sameSite: "Strict" }]);
  const before = await call("/state");
  const originalIds = before.agents.map(agent => agent.id).sort();
  const originalRuns = before.runs.map(run => run.id).sort();

  await page.goto("/organization");
  await page.getByRole("button", { name: "Live Preview", exact: true }).click();
  await expect(page).toHaveURL(`${base}/organization/live-preview`);
  await expect(page.getByRole("heading", { name: "Live Preview", exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.locator(".live-preview-connection")).toHaveAttribute("data-connection", "live");
  await expectValue(page.getByRole("combobox", { name: "Team", exact: true }), "");
  await verifyOverlay(page);
  await verifyFocusTrap(page);
  assert.deepEqual((await call("/state")).runs.map(run => run.id).sort(), originalRuns, "Opening preview must never invoke a run");
  assert.deepEqual((await call("/state")).agents.map(agent => agent.id).sort(), originalIds, "Opening preview must never create profiles");

  await page.getByLabel("Configure cockpit team", { exact: true }).click();
  await page.getByRole("button", { name: "Create missing cockpit profiles", exact: true }).click();
  await expect(page.getByRole("button", { name: "Create missing cockpit profiles", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Configure Orion", exact: true })).toBeVisible();
  await page.getByLabel("Configure cockpit team", { exact: true }).click();
  const cameraProof = await verifyCameraInteractions(page, proofDirectory);
  await page.getByLabel("Configure cockpit team", { exact: true }).click();
  const state = await call("/cockpit/state");
  assert.equal(state.workspace_id, tenant.id);
  assert.equal(state.setup_required, false);
  assert.equal(state.agents.length, 5);
  assert.equal(new Set(state.agents.map(agent => agent.agent_id)).size, 5);
  assert(state.agents.every(agent => !agent.enabled), "Setup profiles stay paused until explicitly configured");
  assert.equal(state.totals.active_runs, 0);
  await verifySnapshotUI(page, state);
  await verifyRefresh(page, tenant.id);
  const after = await call("/state");
  assert(originalIds.every(id => after.agents.some(agent => agent.id === id)), "Setup preserves existing agents");
  assert.deepEqual(after.runs.map(run => run.id).sort(), originalRuns);
  const firstSetupIds = state.agents.map(agent => agent.agent_id).sort();
  const repeated = await call("/cockpit/setup", "POST", {});
  assert.deepEqual(repeated.agents.map(agent => agent.agent_id).sort(), firstSetupIds, "Setup is idempotent");

  const existingAgent = after.agents.find(agent => originalIds.includes(agent.id) && !agent.project_id);
  assert(existingAgent, "Workspace must have an existing Organization agent for mapping verification");
  await page.getByRole("button", { name: "Assign existing agents to cockpit roles", exact: true }).click();
  await selectValue(page.getByRole("combobox", { name: "Orion · Director", exact: true }), existingAgent.id);
  await page.getByRole("button", { name: "Save role mapping", exact: true }).click();
  await expect.poll(async () => (await call("/cockpit/state")).mapping.hq_lab_director).toBe(existingAgent.id);
  await expect(page.locator('.agent-card[data-role="hq_lab_director"] .agent-character-name')).toHaveText(existingAgent.name);
  await verifySnapshotUI(page, await call("/cockpit/state"));
  assert.deepEqual((await call("/state")).agents, after.agents, "Remapping preserves profiles and reporting lines");
  await page.getByRole("button", { name: "Assign existing agents to cockpit roles", exact: true }).click();
  await selectValue(page.getByRole("combobox", { name: "Orion · Director", exact: true }), state.mapping.hq_lab_director);
  await page.getByRole("button", { name: "Save role mapping", exact: true }).click();
  await expect.poll(async () => (await call("/cockpit/state")).mapping.hq_lab_director).toBe(state.mapping.hq_lab_director);
  await expect(page.getByRole("button", { name: "Configure Orion", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Configure Orion", exact: true }).click();
  await expect(page).toHaveURL(/\/organization\/agents\/[^/]+\/profile$/);
  await page.goBack();
  await expect(page).toHaveURL(`${base}/organization/live-preview`);
  await expect(page.locator(".live-preview-connection")).toHaveAttribute("data-connection", "live");
  await waitForScene(page);
  await selectValue(page.getByRole("combobox", { name: "Team", exact: true }), "general");
  await expect(page).toHaveURL(`${base}/organization/live-preview?group=general`);
  await expect(page.locator(".live-preview-connection")).toHaveAttribute("data-connection", "live");
  assert.equal((await call("/cockpit/state?group_id=general")).group_id, "general");
  await verifySnapshotUI(page, await call("/cockpit/state?group_id=general"));
  await page.reload();
  await waitForScene(page);
  await expectValue(page.getByRole("combobox", { name: "Team", exact: true }), "general");
  await expect(page.locator(".live-preview-connection")).toHaveAttribute("data-connection", "live");
  await selectValue(page.getByRole("combobox", { name: "Team", exact: true }), "");

  await context.setOffline(true);
  await expect(page.locator(".live-preview-connection")).toHaveAttribute("data-connection", "offline", { timeout: 15000 });
  await expect(page.locator(".live-preview-connection")).toBeVisible();
  await context.setOffline(false);
  await expect(page.locator(".live-preview-connection")).toHaveAttribute("data-connection", "live", { timeout: 15000 });
  await verifyResizeKeepsCamera(page, proofDirectory);
  for (const method of ["button", "backdrop", "escape"]) {
    await closePreview(page, method);
    await page.getByRole("button", { name: "Live Preview", exact: true }).click();
    await expect(page.locator(".live-preview-connection")).toHaveAttribute("data-connection", "live");
    await expect(page.locator('[data-testid="cockpit-host"]')).toHaveCount(1);
  }
  const layouts = [];
  for (const { width, height, label } of viewportScenarios) {
    await page.setViewportSize({ width, height });
    await expect(page.locator('[data-testid="cockpit-host"]')).toHaveAttribute("data-ready", "true");
    await waitForScene(page);
    await verifyOverlay(page);
    layouts.push(await verifyPreviewProportions(page));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page.getByRole("button", { name: "Close Live Preview", exact: true })).toBeVisible();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Preview must not overflow horizontally at ${width}px`);
    await page.screenshot({ path: path.join(proofDirectory, `live-preview-${label}.png`), fullPage: true });
    await closePreview(page);
    await page.getByRole("button", { name: "Live Preview", exact: true }).click();
    await waitForScene(page);
    await verifyOverlay(page);
    await verifyPreviewProportions(page);
  }

  other = await call("/tenants", "POST", { name: `Cockpit empty workspace ${crypto.randomUUID().slice(0, 8)}` });
  await closePreview(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  await selectValue(page.getByRole("combobox", { name: "Workspace", exact: true }), other.id);
  await page.goto("/organization/live-preview");
  await expect(page.locator(".live-preview-connection")).toHaveAttribute("data-connection", "live");
  await page.getByLabel("Configure cockpit team", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Create missing cockpit profiles", exact: true })).toBeVisible();
  const otherState = await call("/cockpit/state", "GET", undefined, other.id);
  assert(otherState.agents.every(agent => agent.agent_id === null), "Workspace switch must not leak another team's mapping");
  await call(`/tenants/${other.id}`, "DELETE", {});
  other = null;
  await context.addCookies([{ name: "ae_workspace", value: tenant.id, url: base, sameSite: "Strict" }]);
  await page.goto("/organization/live-preview");
  await expect(page.locator(".live-preview-connection")).toHaveAttribute("data-connection", "live");
  await call("/logout", "POST", {});
  await expect(page.locator(".live-preview-connection")).toHaveAttribute("data-connection", "expired", { timeout: 15000 });
  await expect(page.getByRole("button", { name: "Sign in again", exact: true })).toBeVisible();
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(JSON.stringify({ result: "passed", source: "real Rust HTTP + SQLite + browser", workspace: tenant.id, mapped_agents: firstSetupIds.length, preview_created_runs: 0, camera_changed_pixel_fraction: cameraProof.changedFraction, camera_tag_shift_pixels: cameraProof.tagShiftPixels, resize_kept_canvas: true, layouts, screenshots: proofDirectory }));
} catch (error) {
  console.error(error);
  await captureFailure(page, proofDirectory);
  throw error;
} finally {
  await context.setOffline(false);
  if (tenant) {
    await request.post("/api/login", { data: { token } });
    if (other) await request.delete(`/api/tenants/${other.id}`, { data: {} });
    await request.delete(`/api/tenants/${tenant.id}`, { data: {} });
  }
  await browser.close();
}
