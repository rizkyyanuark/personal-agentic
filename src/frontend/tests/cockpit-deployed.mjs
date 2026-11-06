import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { captureFailure, closePreview, observeAssets, verifyOverlay, verifyFocusTrap, verifyCameraInteractions, verifyPreviewProportions, verifyRefresh, verifyResizeKeepsCamera, verifySnapshotUI, verifyTouchPreview, viewportScenarios, waitForScene } from "./cockpit-overlay.mjs";

const base = process.env.AE_TEST_URL || "http://localhost:18766";
const token = process.env.AE_TEST_OWNER_KEY;
assert(token, "Set AE_TEST_OWNER_KEY privately");
const proofDirectory = path.resolve(process.env.AE_TEST_PROOF_DIR || "../../scratch/cockpit-verification");
await mkdir(proofDirectory, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ baseURL: base, viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
const page = await context.newPage();
observeAssets(page);
const errors = [];
page.on("pageerror", error => errors.push(error.message));
async function api(route) {
  const response = await context.request.get(`/api${route}`, { headers: { "x-ae-workspace": "default" } });
  assert(response.ok(), `${route}: ${response.status()}`);
  return response.json();
}
try {
  assert((await context.request.post("/api/login", { data: { token } })).ok());
  await context.addCookies([{ name: "ae_workspace", value: "default", url: base, sameSite: "Strict" }]);
  const before = await api("/state");
  const snapshot = await api("/cockpit/state");
  assert.equal(snapshot.agents.length, 5);
  assert.equal(snapshot.setup_required, false);
  const orion = snapshot.mapping.hq_lab_director;
  assert.equal(snapshot.agents.find(agent => agent.office_role === "hq_lab_director").reports_to, null);
  assert(snapshot.agents.filter(agent => agent.office_role !== "hq_lab_director").every(agent => agent.reports_to === orion));
  await page.goto("/organization");
  await expect(page.locator(".org-card-owner").getByText("Workspace owner", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Orion reports to Workspace owner", exact: true })).toHaveCount(1);
  for (const name of ["Nova", "Atlas", "Lyra", "Axiom"])
    await expect(page.getByRole("img", { name: `${name} reports to Orion`, exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Workspace preview", exact: true })).toBeVisible();
  if (process.env.AE_TEST_ARRANGE_ORG === "true") {
    await page.getByRole("button", { name: "Auto arrange", exact: true }).click();
    await expect.poll(async () => {
      const layout = (await api("/state")).organization_layout;
      return layout ? Object.keys(layout).length : 0;
    }).toBe(before.agents.length + 1);
    await page.getByRole("button", { name: "Fit View", exact: true }).click();
  }
  await page.screenshot({ path: path.join(proofDirectory, "deployed-organization.png"), fullPage: true });
  await page.getByRole("button", { name: "Workspace preview", exact: true }).click();
  await expect(page).toHaveURL(`${base}/organization/live-preview`);
  const host = page.locator('[data-testid="cockpit-host"]');
  await expect(host).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await expect(host).toHaveAttribute("data-scene-ready", "true");
  await expect(host.locator(".agent-card")).toHaveCount(5);
  await expect(page.locator(".live-preview-connection")).toHaveAttribute("data-connection", "live");
  await waitForScene(page);
  await verifyOverlay(page);
  await verifyFocusTrap(page);
  await verifySnapshotUI(page, snapshot);
  await verifyRefresh(page, "default");
  const cameraProof = await verifyCameraInteractions(page, proofDirectory);
  await verifyResizeKeepsCamera(page, proofDirectory);
  await page.screenshot({ path: path.join(proofDirectory, "deployed-live-preview.png"), fullPage: true });
  for (const method of ["button", "backdrop", "escape"]) {
    await closePreview(page, method);
    await page.getByRole("button", { name: "Workspace preview", exact: true }).click();
    await waitForScene(page);
  }
  const layouts = [];
  for (const { width, height, label } of viewportScenarios) {
    await page.setViewportSize({ width, height });
    await waitForScene(page);
    await verifyOverlay(page);
    layouts.push(await verifyPreviewProportions(page));
    await page.screenshot({ path: path.join(proofDirectory, `deployed-live-preview-${label}.png`), fullPage: true });
    await closePreview(page);
    await page.getByRole("button", { name: "Workspace preview", exact: true }).click();
    await waitForScene(page);
    await verifyOverlay(page);
    await verifyPreviewProportions(page);
  }
  const touch = await verifyTouchPreview(browser, base, token, snapshot, proofDirectory);
  const after = await api("/state");
  assert.deepEqual(after.runs.map(run => run.id).sort(), before.runs.map(run => run.id).sort());
  assert.deepEqual(after.agents, before.agents);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: "passed", url: `${base}/organization/live-preview`, agents: after.agents.length, cockpit_agents: 5, runs: after.runs.length, preview_created_runs: 0, tokens_processed: snapshot.totals.tokens_processed, tokens_reported_runs: snapshot.totals.tokens_reported_runs, tokens_total_runs: snapshot.totals.tokens_total_runs, actual_webgl_scene: true, camera_changed_pixel_fraction: cameraProof.changedFraction, camera_tag_shift_pixels: cameraProof.tagShiftPixels, resize_kept_canvas: true, layouts, touch, screenshots: proofDirectory }));
} catch (error) {
  console.error(error);
  await captureFailure(page, proofDirectory);
  throw error;
} finally {
  await browser.close();
}
