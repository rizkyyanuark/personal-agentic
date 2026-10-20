import { expectValue, readOptions, readValue, selectValue } from "./value-picker.mjs";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect as playwrightExpect } from "@playwright/test";
const expect = playwrightExpect.configure({ timeout: 30000 });

const base = process.env.AE_TEST_URL;
const token = process.env.AE_TEST_OWNER_KEY || (process.env.AE_TEST_OWNER_KEY_FILE ? (await readFile(process.env.AE_TEST_OWNER_KEY_FILE, "utf8")).trim() : "");
assert(base && token && process.env.AE_TEST_DISPOSABLE === "true", "Use an explicitly disposable real service with AE_TEST_URL, a private owner key, and AE_TEST_DISPOSABLE=true");
const proofDir = path.resolve(process.env.AE_TEST_PROOF_DIR || "../../org/.state/verification/runtime-catalog");
await mkdir(proofDir, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ baseURL: base, viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const browserErrors = [];
const catalogRequests = [];
const failedRequests = [];
const apiResponses = [];
page.on("pageerror", error => browserErrors.push(error.message));
page.on("response", response => { const url = new URL(response.url()); if (url.pathname.startsWith("/api/")) apiResponses.push({ path: url.pathname, status: response.status() }); });
page.on("requestfailed", request => failedRequests.push({ path: new URL(request.url()).pathname, failure: request.failure()?.errorText }));
page.on("request", request => { const url = new URL(request.url()); if (/^\/api\/(harness|codex)\/settings$/.test(url.pathname)) catalogRequests.push(url); });
const results = [];
const missingHarness = process.env.AE_TEST_MISSING_HARNESS || "codex";
const primaryHost = process.env.AE_TEST_PRIMARY_SSH_HOST || "";
const agents = [];
const groups = [];
let tenant;
let offlineRuntime;
let releaseDelayed;
async function call(route, body, method = "GET", workspace) {
  const response = await context.request.fetch(`/api${route}`, { method, ...(body === undefined ? {} : { data: body }), ...(workspace ? { headers: { "x-ae-workspace": workspace } } : {}) });
  assert(response.ok(), `${method} ${route}: HTTP ${response.status()} ${await response.text()}`);
  return response.json();
}
const state = () => call("/state");
const dialog = () => page.getByRole("dialog", { name: "Add your agent" });
async function openDialog() {
  await page.goto("/organization", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Add agent", exact: true }).click();
  await expect(dialog()).toBeVisible();
}
async function choose(harness, settings) {
  await selectValue(page.locator("#agent-harness"), harness);
  await expect(page.locator("#agent-model")).toBeEnabled();
  await expect.poll(async () => (await readOptions(page.locator("#agent-model"))).map(option => [option.value, option.label])).toEqual(settings.models.map(model => [model.slug, model.display_name]));
  await expect(dialog().getByRole("alert")).toHaveCount(0);
}
try {
  assert.equal((await context.request.get("/api/harness/settings?harness=codex")).status(), 401);
  await call("/login", { token }, "POST");
  const before = await state();
  const sessionsBefore = await call("/sessions");
  await page.goto("/organization", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Add agent", exact: true })).toBeVisible();
  assert.equal(catalogRequests.length, 0, "Dashboard must not load a controller catalog for historical badges");
  await expect(page.locator(".banner.error")).toHaveCount(0);
  const missing = await context.request.get(`/api/harness/settings?harness=${missingHarness}`);
  assert(missing.status() >= 400, "Use a candidate where the selected failure harness is unavailable");
  await openDialog();
  await selectValue(page.locator("#agent-harness"), missingHarness);
  await expect(dialog().getByRole("alert")).toContainText(/catalog|models_cache|Codex|OpenCode|executable|sign in/i);
  await expect(dialog().getByRole("button", { name: "Create agent", exact: true })).toBeDisabled();
  await expect(page.locator(".banner.error")).toHaveCount(0);
  results.push({ scenario: "dashboard and selected missing catalog", status: "Passed", anonymousStatus: 401, selectedFailureStatus: missing.status(), eagerRequests: 0 });

  if (process.env.AE_TEST_ABSENCE_ONLY !== "true") {
  const harness = process.env.AE_TEST_LOCAL_HARNESS || "antigravity";
  const local = await call(`/harness/settings?harness=${harness}${primaryHost ? `&ssh_host=${encodeURIComponent(primaryHost)}` : ""}`);
  assert(local.models.length > 0);
  if (primaryHost) await selectValue(page.locator("#new-agent-workstation"), primaryHost);
  await choose(harness, local);
  assert(catalogRequests.some(url => url.searchParams.get("harness") === harness && (url.searchParams.get("ssh_host") || "") === primaryHost && !url.searchParams.has("runtime_id")));
  await page.getByRole("button", { name: "Refresh models", exact: true }).click();
  await expect(page.locator("#agent-model")).toBeEnabled();
  results.push({ scenario: primaryHost ? "selected SSH catalog and refresh" : "Local catalog without SSH host and refresh", status: "Passed", harness, modelCount: local.models.length });

  let observeDelayed;
  let observeDelivered;
  const delivered = new Promise(resolve => { observeDelivered = resolve; });
  const observed = new Promise(resolve => { observeDelayed = resolve; });
  const delayed = new Promise(resolve => { releaseDelayed = resolve; });
  let delayOnce = true;
  await page.route("**/api/harness/settings?**", async route => {
    const url = new URL(route.request().url());
    if (delayOnce && url.searchParams.get("harness") === missingHarness && !url.searchParams.has("agent_id")) {
      delayOnce = false;
      const actual = await route.fetch();
      observeDelayed();
      await delayed;
      await route.fulfill({ response: actual });
      observeDelivered();
    } else await route.continue();
  });
  await selectValue(page.locator("#new-agent-workstation"), "");
  await selectValue(page.locator("#agent-harness"), missingHarness);
  await observed;
  if (primaryHost) await selectValue(page.locator("#new-agent-workstation"), primaryHost);
  await choose(harness, local);
  releaseDelayed();
  await delivered;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect.poll(() => readValue(page.locator("#agent-model"))).toBe(local.models.some(model => model.slug === local.model) ? local.model : local.models[0].slug);
  await page.unroute("**/api/harness/settings?**");
  await expect(dialog().getByRole("alert")).toHaveCount(0);
  results.push({ scenario: "late failure from previous harness", status: "Passed", payloadMocks: 0, faultInjection: "delay the actual HTTP failure response" });

  const workdir = process.env.AE_TEST_WORKDIR || "/workdir/catalog-acceptance";
  const name = `Catalog verification ${crypto.randomUUID().slice(0, 8)}`;
  await page.locator("#agent-workdir").fill(workdir);
  await page.locator("#agent-name").fill(name);
  await dialog().getByRole("button", { name: "Create agent", exact: true }).click();
  await expect(dialog()).toHaveCount(0);
  const created = (await state()).agents.find(agent => agent.name === name);
  assert(created);
  agents.push(created.id);
  assert.equal(created.harness, harness);
  assert.equal(created.model, local.models.some(model => model.slug === local.model) ? local.model : local.models[0].slug);
  assert.equal(created.workdir.ssh_host, primaryHost || null);
  await page.goto(`/organization/agents/${created.id}/profile`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#profile-model")).toBeEnabled();
  await expectValue(page.locator("#profile-model"), created.model);
  await selectValue(page.locator("#profile-harness"), process.env.AE_TEST_PROFILE_MISSING_HARNESS || missingHarness);
  await expect(page.locator("#profile-model")).toBeDisabled();
  await expect(page.locator(".inspector .error")).toContainText(/catalog|models_cache|Codex|OpenCode|executable|sign in/i);
  await expectValue(page.locator("#profile-model"), "", "Model catalog unavailable");
  assert.equal((await state()).agents.find(agent => agent.id === created.id).model, created.model, "A failed unsaved catalog cannot replace the persisted model");
  await page.getByRole("button", { name: "Close agent settings", exact: true }).click();
  assert.deepEqual((await state()).agents.find(agent => agent.id === created.id), created, "Unsaved harness selection must preserve the saved profile");
  assert.deepEqual(await call("/sessions"), sessionsBefore, "Catalog discovery must not create native sessions");
  results.push({ scenario: "Create persistence, Profile error isolation and saved sessions", status: "Passed", providerRuns: 0 });

  const project = await call("/groups", { id: "", name: `Catalog project ${crypto.randomUUID().slice(0, 8)}`, description: "Disposable catalog acceptance", project: { workdir: created.workdir, members: [] } }, "POST");
  groups.push(project.id);
  await openDialog();
  await selectValue(page.locator("#agent-project"), project.id);
  await choose(harness, local);
  await expect(page.locator("#agent-workdir")).toHaveValue(created.workdir.path);
  await expect(page.locator("#agent-workdir")).toHaveAttribute("readonly", "");
  await expect(page.locator("#new-agent-workstation")).toHaveCount(0);
  if (process.env.AE_TEST_RUNTIME_ID && process.env.AE_TEST_EXPECT_WORKER_CATALOG === "unavailable") {
    const workerFolder = await call("/workspaces/probe", { path: "/workdir/catalog-acceptance", runtime_id: process.env.AE_TEST_RUNTIME_ID, harness: "codex", ssh_host: null }, "POST");
    await call("/groups", { ...project, project: { ...project.project, workdir: workerFolder.workspace } }, "POST");
    await expectValue(page.getByRole("combobox", { name: "Registered runtime", exact: true }), process.env.AE_TEST_RUNTIME_ID);
    await expect(page.locator("#agent-model")).toBeDisabled();
    await expect(dialog().getByRole("button", { name: "Create agent", exact: true })).toBeDisabled();
    await expect(dialog().getByRole("alert")).toContainText("available harness");
    await call("/groups", project, "POST");
    await expectValue(page.getByRole("combobox", { name: "Registered runtime", exact: true }), "");
    await choose(harness, local);
    results.push({ scenario: "project runtime changed while creation dialog is open", status: "Passed", controllerCatalogInvalidated: true });
  }
  await page.keyboard.press("Escape");
  results.push({ scenario: primaryHost ? "project effective SSH workdir" : "project effective Local workdir", status: "Passed" });

  const sshHost = process.env.AE_TEST_SSH_HOST;
  if (sshHost) {
    const sshHarness = process.env.AE_TEST_SSH_HARNESS || harness;
    const ssh = await call(`/harness/settings?harness=${sshHarness}&ssh_host=${encodeURIComponent(sshHost)}`);
    await openDialog();
    await selectValue(page.locator("#new-agent-workstation"), sshHost);
    await choose(sshHarness, ssh);
    assert(catalogRequests.some(url => url.searchParams.get("ssh_host") === sshHost && url.searchParams.get("harness") === sshHarness));
    await page.screenshot({ path: path.join(proofDir, "ssh-catalog.png") });
    await page.keyboard.press("Escape");
    results.push({ scenario: "selected SSH workstation", status: "Passed", modelCount: ssh.models.length });
  } else results.push({ scenario: "selected SSH workstation", status: "Not run", reason: "No disposable SSH workstation supplied" });

  const runtimeId = process.env.AE_TEST_RUNTIME_ID;
  if (runtimeId) {
    const runtime = (await call("/runtimes")).find(item => item.id === runtimeId);
    assert(runtime?.online && !runtime.revoked);
    const workerHarness = process.env.AE_TEST_WORKER_HARNESS || harness;
    await openDialog();
    await selectValue(page.getByRole("combobox", { name: "Registered runtime", exact: true }), runtimeId);
    if (process.env.AE_TEST_EXPECT_WORKER_CATALOG === "unavailable") {
      assert(!Object.values(runtime.capabilities || {}).some(Boolean), "Use a real worker without any signed-in catalog");
      const worker = await context.request.get(`/api/harness/settings?harness=${workerHarness}&runtime_id=${encodeURIComponent(runtimeId)}`);
      assert(worker.status() >= 400);
      await expect(page.locator("#agent-harness")).toBeDisabled();
      await expect(page.locator("#agent-model")).toBeDisabled();
      await expect(dialog().getByRole("alert")).toContainText("available harness");
      await expect(dialog().getByRole("button", { name: "Create agent", exact: true })).toBeDisabled();
      results.push({ scenario: "registered online worker with no native catalog", status: "Passed", catalogStatus: worker.status(), modelCount: 0, fabricatedReadiness: false });
    } else {
      const worker = await call(`/harness/settings?harness=${workerHarness}&runtime_id=${encodeURIComponent(runtimeId)}`);
      await choose(workerHarness, worker);
      results.push({ scenario: "registered online worker", status: "Passed", harness: workerHarness, modelCount: worker.models.length });
    }
    await expect(page.locator("#new-agent-workstation")).toHaveCount(0);
    await page.screenshot({ path: path.join(proofDir, "registered-catalog.png") });
    await page.keyboard.press("Escape");
  } else results.push({ scenario: "registered online worker", status: "Not run", reason: "No disposable worker supplied" });

  offlineRuntime = await call("/runtimes", { name: `Offline catalog ${crypto.randomUUID().slice(0, 8)}` }, "POST");
  const offline = await context.request.get(`/api/harness/settings?harness=${harness}&runtime_id=${offlineRuntime.id}`);
  assert(offline.status() >= 400);
  await openDialog();
  await selectValue(page.getByRole("combobox", { name: "Registered runtime", exact: true }), offlineRuntime.id);
  await expect(dialog().getByRole("alert")).toContainText("Connect this runtime");
  await expect(page.locator("#agent-model")).toBeDisabled();
  await expect(dialog().getByRole("button", { name: "Create agent", exact: true })).toBeDisabled();
  await call(`/runtimes/${offlineRuntime.id}`, {}, "DELETE");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const revoked = await context.request.get(`/api/harness/settings?harness=${harness}&runtime_id=${offlineRuntime.id}`);
  assert(revoked.status() >= 400);
  await expect(page.locator("#agent-harness")).toBeDisabled();
  await expect(dialog().getByRole("alert")).toContainText("revoked");
  await page.keyboard.press("Escape");
  results.push({ scenario: "unconnected then revoked registered runtime", status: "Passed", offlineStatus: offline.status(), revokedStatus: revoked.status(), enrollmentTokenRecorded: false });

  let unavailableId = process.env.AE_TEST_UNAVAILABLE_AGENT_ID;
  if (!unavailableId && !primaryHost) {
    const fixture = await call("/agents", { ...created, id: "", name: "Historical unavailable model fixture", model: "historical-model-no-longer-listed", reasoning: "high", workdir: null, enabled: false }, "POST");
    agents.push(fixture.id);
    unavailableId = fixture.id;
  }
  if (unavailableId) {
    const saved = (await state()).agents.find(agent => agent.id === unavailableId);
    assert(saved?.model, "Supply an isolated saved-model fixture");
    await page.goto(`/organization/agents/${unavailableId}/profile`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#profile-model")).toBeEnabled();
    await expectValue(page.locator("#profile-model"), saved.model);
    const unavailable = (await readOptions(page.locator("#profile-model"))).find(option => option.value === saved.model);
    assert(unavailable?.disabled && unavailable.selected, "The saved unavailable model remains selected and cannot be chosen anew");
    assert.match(unavailable.label, /\(unavailable\)/);
    await page.getByRole("button", { name: "Refresh models", exact: true }).click();
    await expect(page.locator("#profile-model")).toBeEnabled();
    assert.deepEqual((await state()).agents.find(agent => agent.id === unavailableId), saved);
    results.push({ scenario: "saved unavailable model without substitution", status: "Passed", fixture: "historical saved profile" });
  } else results.push({ scenario: "saved unavailable model without substitution", status: "Not run", reason: "No isolated historical profile fixture supplied" });

  const historyGroup = process.env.AE_TEST_HISTORY_GROUP;
  if (historyGroup) {
    const messages = await call(`/groups/${historyGroup}/messages`);
    const runReplies = messages.filter(message => message.run_id && message.sender !== "owner" && message.sender !== "system");
    const sourceRuns = await Promise.all(runReplies.map(message => call(`/runs/${message.run_id}`)));
    assert(new Set(sourceRuns.map(run => run.profile.harness)).size >= 2, "Supply historical fixtures from at least two harnesses");
    await page.goto(`/groups/${historyGroup}/chat`, { waitUntil: "domcontentloaded" });
    for (const [index, source] of sourceRuns.entries()) {
      const modelIndex = source.arguments.indexOf("--model");
      const recorded = (modelIndex >= 0 ? source.arguments[modelIndex + 1] : "") || source.profile.model;
      const model = source.profile.harness === "opencode" ? recorded.split("#")[0] : recorded;
      const badge = page.locator(`article[id="message-${runReplies[index].id}"] .model-badge`);
      await expect(badge).toContainText(source.model_display_name || model || "Model not recorded");
      const names = { codex: "Codex CLI", opencode: "OpenCode", antigravity: "Antigravity (agy)" };
      await expect(badge).toHaveAttribute("title", new RegExp(`^${names[source.profile.harness].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} · Recorded for this reply:`));
    }
    await page.screenshot({ path: path.join(proofDir, "recorded-model-badges.png") });
    results.push({ scenario: "mixed-harness recorded reply identity", status: "Passed", replyCount: sourceRuns.length, fixture: "persisted historical replies; provider execution is outside this check" });
  } else results.push({ scenario: "mixed-harness recorded reply identity", status: "Not run", reason: "No isolated historical reply fixtures supplied" });

  tenant = await call("/tenants", { name: `Catalog boundary ${crypto.randomUUID().slice(0, 8)}` }, "POST");
  const forbidden = await context.request.get(`/api/harness/settings?harness=${harness}`, { headers: { "x-ae-workspace": tenant.id } });
  assert(forbidden.status() >= 400);
  assert.match(await forbidden.text(), /registered runtime|catalog/i);
  if (runtimeId) {
    const isolated = await context.request.get(`/api/harness/settings?harness=${harness}&runtime_id=${encodeURIComponent(runtimeId)}`, { headers: { "x-ae-workspace": tenant.id } });
    assert(isolated.status() >= 400, "Another tenant must not read a runtime catalog");
  }
  results.push({ scenario: "tenant controller and cross-workspace catalog boundary", status: "Passed", controllerStatus: forbidden.status() });
  }
  assert.deepEqual((await state()).runs, before.runs, "Discovery must not invoke agent work");
  assert.deepEqual(await call("/sessions"), sessionsBefore, "All discovery paths must preserve native sessions");
  assert.deepEqual(browserErrors, []);
  await page.goto("/organization", { waitUntil: "domcontentloaded" });
  await page.screenshot({ path: path.join(proofDir, "runtime-catalog.png"), fullPage: true });
  await writeFile(path.join(proofDir, "runtime-catalog.json"), JSON.stringify({ results, browserErrors, runsUnchanged: true, sessionsUnchanged: true, nativeProviderTurns: 0, httpPayloadMocks: 0 }, null, 2));
  console.log(JSON.stringify({ results, browserErrors, runsUnchanged: true, sessionsUnchanged: true, nativeProviderTurns: 0, httpPayloadMocks: 0 }));
} catch (error) {
  await writeFile(path.join(proofDir, "runtime-catalog-failure.json"), JSON.stringify({ error: String(error), browserErrors, failedRequests, apiResponses, results }, null, 2));
  await page.screenshot({ path: path.join(proofDir, "runtime-catalog-failure.png"), fullPage: true }).catch(() => {});
  throw error;
} finally {
  releaseDelayed?.();
  for (const id of agents) await call(`/agents/${id}`, undefined, "DELETE");
  for (const id of groups) await call(`/groups/${id}/archive`, {}, "POST");
  if (offlineRuntime) await call(`/runtimes/${offlineRuntime.id}`, {}, "DELETE");
  if (tenant) await call(`/tenants/${tenant.id}`, {}, "DELETE");
  await context.close();
  await browser.close();
}
