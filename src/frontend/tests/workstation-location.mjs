import { expectValue, readOptions, readValue, selectValue } from "./value-picker.mjs";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect as playwrightExpect } from "@playwright/test";

const expect = playwrightExpect.configure({ timeout: 30000 });

const base = process.env.AE_TEST_URL;
const token = process.env.AE_TEST_OWNER_KEY || (process.env.AE_TEST_OWNER_KEY_FILE
  ? (await readFile(process.env.AE_TEST_OWNER_KEY_FILE, "utf8")).trim() : "");
const hostId = process.env.AE_TEST_WORKSTATION_ID;
const workdir = process.env.AE_TEST_WORKDIR;
const alias = process.env.AE_TEST_SSH_ALIAS;
const phase = process.argv[2] || "initial";
assert(base && token && hostId && workdir && alias && process.env.AE_TEST_DISPOSABLE === "true",
  "Use an explicitly disposable service, its private owner key, and a real test SSH workstation, alias and workdir");
assert(["initial", "restart"].includes(phase));
const proofDir = path.resolve(process.env.AE_TEST_PROOF_DIR || "../../org/.state/verification/workstation-location");
await mkdir(proofDir, { recursive: true });
const manifestPath = path.join(proofDir, "restart-manifest.json");
const browser = await chromium.launch({ ...(process.env.AE_TEST_BROWSER_EXECUTABLE
  ? { executablePath: process.env.AE_TEST_BROWSER_EXECUTABLE } : { channel: "msedge" }), headless: true });
const context = await browser.newContext({ baseURL: base, viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const errors = [];
const requests = [];
const results = [];
page.on("pageerror", error => errors.push(error.message));
page.on("request", request => {
  const url = new URL(request.url());
  if (url.pathname.startsWith("/api/")) requests.push({ path: url.pathname, query: url.search, method: request.method(), body: request.postDataJSON() });
});
async function call(route, body, method = body === undefined ? "GET" : "POST") {
  const response = await context.request.fetch(`/api${route}`, { method, ...(body === undefined ? {} : { data: body }), timeout: 60000 });
  assert(response.ok(), `${method} ${route}: HTTP ${response.status()} ${await response.text()}`);
  return response.json();
}
const state = () => call("/state");
const saveHost = host => call("/workstations", { workstation: host, secret: null, clear_secret: false });
const selectedGroup = async locator => (await readOptions(locator)).find(option => option.selected)?.group;
async function openSettings() {
  await page.goto("/settings/workstations", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "SSH workstations", exact: true }).click();
  await page.getByRole("navigation", { name: "Saved workstations" }).getByRole("button", { name: /Workspace/ }).click();
  await expect(page.locator("#host-location")).toBeVisible();
}
async function openAgent() {
  await page.goto("/organization", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Add agent", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Add your agent" })).toBeVisible();
}
async function expectGroups(selector, remoteId, unclassifiedId) {
  const options = await readOptions(selector);
  assert.equal(options.find(option => option.value === hostId)?.group, "Local");
  assert.equal(options.find(option => option.value === remoteId)?.group, "Remote");
  assert.equal(options.find(option => option.value === unclassifiedId)?.group, "Saved SSH");
  assert.equal(options.find(option => option.value === "")?.label, "Application environment");
  assert.match(options.find(option => option.value === hostId)?.label ?? "", /SSH/);
}
try {
  assert.equal((await context.request.get("/api/state")).status(), 401);
  await call("/login", { token });
  const before = await state();
  const host = before.workstations.find(item => item.id === hostId);
  assert(host, "Preconfigure one real SSH workstation on the disposable candidate");
  if (phase === "restart") {
    const saved = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.equal(host.location, "local_host");
    assert.equal(before.runs.length, saved.runCount);
    assert.deepEqual(before.agents.find(agent => agent.id === saved.agent.id), saved.agent);
    assert.deepEqual(before.groups.find(group => group.id === saved.project.id), saved.project);
    assert.equal(before.workstations.find(item => item.id === saved.legacyHostId).location, "unspecified");
    await openSettings();
    await expectValue(page.locator("#host-location"), "local_host");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#host-location").scrollIntoViewIfNeeded();
    await expect(page.locator("#host-location")).toBeInViewport();
    await page.screenshot({ path: path.join(proofDir, "settings-mobile.png"), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/organization/agents/${saved.agent.id}/workdir`, { waitUntil: "domcontentloaded" });
    await expectValue(page.locator("#workstation-host"), hostId);
    assert.equal(await selectedGroup(page.locator("#workstation-host")), "Local");
    const catalog = await call(`/harness/settings?harness=antigravity&ssh_host=${encodeURIComponent(hostId)}`);
    assert(catalog.models.length > 0);
    await page.screenshot({ path: path.join(proofDir, "after-restart.png"), fullPage: true });
    results.push({ scenario: "real service restart preserves classification and profiles", status: "Passed", modelCount: catalog.models.length });
  } else {
    assert.equal(host.location, "unspecified", "Seed the candidate with a genuine legacy record without location");
    const anonymous = await fetch(`${base}/api/workstations`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workstation: host }) });
    assert.equal(anonymous.status, 401);
    const invalid = await context.request.post("/api/workstations", { data: { workstation: { ...host, location: "unsupported" } } });
    assert.equal(invalid.status(), 422);
    assert.deepEqual((await state()).workstations.find(item => item.id === hostId), host);
    results.push({ scenario: "legacy read, invalid enum and anonymous write", status: "Passed", anonymousStatus: 401, invalidStatus: 422 });

    await openSettings();
    await expectValue(page.locator("#host-location"), "unspecified");
    await page.locator("#host-location").focus();
    await expect(page.locator("#host-location")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expectValue(page.locator("#host-location"), "local_host");
    await page.getByRole("button", { name: "Save workstation", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Workstation saved" })).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "SSH workstations", exact: true }).click();
    await page.getByRole("navigation", { name: "Saved workstations" }).getByRole("button", { name: /Workspace/ }).click();
    await expectValue(page.locator("#host-location"), "local_host");
    const local = (await state()).workstations.find(item => item.id === hostId);
    assert.deepEqual({ ...local, location: "unspecified" }, host);
    await page.screenshot({ path: path.join(proofDir, "settings-desktop.png"), fullPage: true });
    results.push({ scenario: "explicit settings save and reload preserve connection", status: "Passed" });

    const remote = await saveHost({ ...host, id: "", name: "Unavailable external workstation", hostname: "unavailable.example.invalid", host_ip: "", location: "remote" });
    const legacyPayload = { ...host, id: "", name: "Unclassified workstation" };
    delete legacyPayload.location;
    const unclassified = await saveHost(legacyPayload);
    assert.equal(unclassified.location, "unspecified");
    const catalog = await call(`/harness/settings?harness=antigravity&ssh_host=${encodeURIComponent(hostId)}`);
    assert(catalog.models.length > 0);
    await openAgent();
    const selector = page.locator("#new-agent-workstation");
    await expectGroups(selector, remote.id, unclassified.id);
    await expectValue(selector, "");
    await selector.focus();
    await page.keyboard.press("ArrowDown");
    await page.locator('[data-slot="combobox-input"]').fill(local.name);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expectValue(selector, hostId);
    await selectValue(page.locator("#agent-harness"), "antigravity");
    await expect(page.locator("#agent-model")).toBeEnabled();
    assert.equal((await readOptions(page.locator("#agent-model"))).length, catalog.models.length);
    await page.locator("#agent-workdir").fill(workdir);
    const model = await readValue(page.locator("#agent-model"));
    await saveHost({ ...local, location: "remote" });
    await expect.poll(async () => (await readOptions(selector)).filter(option => option.value === hostId).length).toBe(1);
    await expect.poll(() => selectedGroup(selector)).toBe("Remote");
    await expectValue(selector, hostId);
    await expect(page.locator("#agent-workdir")).toHaveValue(workdir);
    await expectValue(page.locator("#agent-model"), model);
    await saveHost(local);
    await expect.poll(() => selectedGroup(selector)).toBe("Local");
    await expect(page.locator("#agent-workdir")).toHaveValue(workdir);
    await page.locator("#agent-name").fill("Location acceptance agent");
    await page.getByRole("dialog").getByRole("button", { name: "Create agent", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Add your agent" })).toHaveCount(0);
    const created = (await state()).agents.find(agent => agent.name === "Location acceptance agent");
    assert(created);
    assert.equal(created.workdir.ssh_host, hostId);
    assert.equal(created.workdir.path, workdir);
    assert.equal(created.harness, "antigravity");
    assert.equal(created.model, model);
    assert(requests.some(request => request.path === "/api/workspaces/probe" && request.body?.ssh_host === hostId));
    assert(requests.some(request => request.path === "/api/harness/settings" && new URLSearchParams(request.query).get("ssh_host") === hostId));
    results.push({ scenario: "new agent uses real SSH catalog and probe; relabel preserves draft", status: "Passed", modelCount: catalog.models.length });

    await page.goto(`/organization/agents/${created.id}/workdir`, { waitUntil: "domcontentloaded" });
    const profileSelector = page.locator("#workstation-host");
    await expectGroups(profileSelector, remote.id, unclassified.id);
    await expectValue(profileSelector, hostId);
    await expect(page.locator("#workdir-path")).toHaveValue(workdir);
    await page.getByRole("button", { name: "Validate workdir", exact: false }).click();
    await expect(page.locator(".probe-result")).toContainText(hostId);
    assert.deepEqual((await state()).agents.find(agent => agent.id === created.id), created);
    await page.screenshot({ path: path.join(proofDir, "profile-desktop.png"), fullPage: true });

    await page.goto("/organization", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Add group or section", exact: true }).click();
    await page.getByRole("menuitem", { name: "Create project", exact: true }).click();
    const projectDialog = page.getByRole("dialog", { name: "Create a project" });
    await expectGroups(page.locator("#project-host"), remote.id, unclassified.id);
    await selectValue(page.locator("#project-host"), hostId);
    await projectDialog.getByLabel("Name", { exact: true }).fill("Location acceptance project");
    await page.locator("#project-workdir").fill(workdir);
    await projectDialog.getByRole("button", { name: "Create project", exact: true }).click();
    await expect(page).toHaveURL(/\/projects\/.*\/structure$/);
    const project = (await state()).groups.find(group => group.name === "Location acceptance project");
    assert.equal(project.project.workdir.ssh_host, hostId);
    assert.equal(project.project.workdir.path, workdir);
    await openAgent();
    await selectValue(page.locator("#agent-project"), project.id);
    await selectValue(page.locator("#agent-harness"), "antigravity");
    await expect(page.locator("#agent-workdir")).toHaveValue(workdir);
    await expect(page.locator("#agent-workdir")).toHaveAttribute("readonly", "");
    await expect(page.locator("#new-agent-workstation")).toHaveCount(0);
    await expect(page.locator("#agent-model")).toBeEnabled();
    await page.keyboard.press("Escape");
    results.push({ scenario: "profile and project keep SSH target and project inheritance", status: "Passed" });

    const legacy = await call("/agents", { ...created, id: "", name: "Historical SSH alias", workdir: { ...created.workdir, ssh_host: alias } });
    await page.goto(`/organization/agents/${legacy.id}/workdir`, { waitUntil: "domcontentloaded" });
    await expectValue(page.locator("#workstation-host"), alias);
    assert.equal(await selectedGroup(page.locator("#workstation-host")), "Saved SSH");
    assert.match((await readOptions(page.locator("#workstation-host"))).find(option => option.value === alias)?.label ?? "", /Existing SSH alias/);
    const direct = await call("/workspaces/probe", { path: "/workdir", harness: "antigravity", ssh_host: null });
    assert.equal(direct.workspace.ssh_host, null);
    const missing = await context.request.post("/api/workspaces/probe", { data: { path: workdir, harness: "antigravity", ssh_host: "ws-location-unavailable" } });
    assert.equal(missing.status(), 400);
    const failed = await context.request.get(`/api/harness/settings?harness=antigravity&ssh_host=${encodeURIComponent(remote.id)}`);
    assert(failed.status() >= 400);
    results.push({ scenario: "legacy alias, direct execution and unavailable target retain their semantics", status: "Passed", missingTargetStatus: missing.status(), failedCatalogStatus: failed.status() });

    await openAgent();
    await selectValue(page.locator("#new-agent-workstation"), remote.id);
    await selectValue(page.locator("#agent-harness"), "antigravity");
    await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Create agent", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    results.push({ scenario: "failed selected SSH catalog stays visible without fallback", status: "Passed" });

    await page.setViewportSize({ width: 390, height: 844 });
    await openSettings();
    await page.locator("#host-location").scrollIntoViewIfNeeded();
    await expect(page.locator("#host-location")).toBeInViewport();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(proofDir, "settings-mobile.png"), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator(".settings-page").evaluate(element => { element.style.zoom = "2"; });
    await expect(page.locator("#host-location")).toBeVisible();
    assert(await page.locator(".workstation-form").evaluate(element => element.scrollWidth <= element.clientWidth + 1));
    await page.screenshot({ path: path.join(proofDir, "settings-zoom.png"), fullPage: true });
    results.push({ scenario: "location editor remains keyboard accessible at mobile width and CSS zoom 2", status: "Passed" });
    const after = await state();
    assert.equal(after.runs.length, before.runs.length);
    assert.deepEqual(after.agents.find(agent => agent.id === created.id), created);
    await writeFile(manifestPath, JSON.stringify({ agent: created, project, runCount: after.runs.length, legacyHostId: alias }, null, 2));
  }
  assert.deepEqual(errors, []);
  const proof = { phase, status: "Passed", results, providerTasksStarted: 0, payloadMocks: 0, browserErrors: errors.length };
  await writeFile(path.join(proofDir, `${phase}.json`), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof));
} catch (error) {
  await page.screenshot({ path: path.join(proofDir, `${phase}-failure.png`), fullPage: true });
  throw error;
} finally {
  await context.request.post("/api/logout", { data: {} });
  await browser.close();
}
