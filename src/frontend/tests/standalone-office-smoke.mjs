import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { openSync, closeSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, expect } from "@playwright/test";
import { selectValue } from "./value-picker.mjs";

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const binary = process.env.AE_TEST_BINARY;
assert(binary, "Set AE_TEST_BINARY to the source-matched native controller executable");
const proof = path.resolve(process.env.AE_TEST_PROOF_DIR || path.join(source, "../scratch/public-office-proof"), randomUUID());
const org = path.join(proof, "owned-test-org");
await mkdir(org, { recursive: true });
const listener = createServer();
await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const base = `http://127.0.0.1:${port}`;
const receipt = { base, org, binary: path.resolve(binary), fixture: "Owned SQLite records; no provider or Matrix login", checks: [], screenshots: [] };
let service, browser, owner, a, b, db, workspaceDB, visibilityBrowser;
const sessions = [];

async function start() {
  const log = openSync(path.join(proof, `controller-${Date.now()}.log`), "a");
  const env = { ...process.env };
  delete env.AE_MATRIX_HOMESERVER;
  delete env.AE_PUBLIC_URL;
  service = spawn(path.resolve(binary), ["--org", org, "--port", String(port), "--frontend", path.join(source, "frontend/dist"), "--codex", path.join(proof, "provider-must-not-run")], { cwd: source, env, stdio: ["ignore", log, log], windowsHide: true });
  closeSync(log);
  await expect.poll(async () => {
    if (service.exitCode !== null) throw new Error(`Controller exited ${service.exitCode}; inspect ${proof}`);
    try { return (await fetch(`${base}/api/health`)).status; } catch { return 0; }
  }, { timeout: 60000 }).toBe(200);
}
async function stop() {
  if (!service || service.exitCode !== null || service.signalCode !== null) return;
  const exited = new Promise(resolve => service.once("exit", resolve));
  service.kill();
  await exited;
}
async function api(context, route, { method = "GET", data, workspace, status = 200, headers = {} } = {}) {
  const response = await context.request.fetch(`/api${route}`, { method, ...(data === undefined ? {} : { data }), headers: { ...(workspace ? { "x-ae-workspace": workspace } : {}), ...headers } });
  assert.equal(response.status(), status, `${method} ${route}: ${await response.text()}`);
  if (route.includes("office") || route.includes("cockpit")) assert.equal(response.headers()["cache-control"], "no-store");
  return status === 200 ? response.json() : null;
}
async function context(options = {}) {
  const result = await browser.newContext({ baseURL: base, viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce", ...options });
  await result.addInitScript(() => {
    window.__THREE_DEVTOOLS__ = new EventTarget();
    window.__officeObservedScenes = [];
    window.__THREE_DEVTOOLS__.addEventListener("observe", event => {
      if (event.detail.isScene) window.__officeObservedScenes.push(event.detail);
    });
  });
  return result;
}
async function screenshot(page, name) {
  const filename = path.join(proof, `${name}.png`);
  await page.screenshot({ path: filename });
  receipt.screenshots.push(filename);
}
async function published(page, name) {
  await expect(page.locator(".top-bar")).toContainText(name);
  await expect(page.locator("#scene canvas")).toBeVisible();
  await expect(page.locator(".agent-card")).toHaveCount(5);
  await expect(page.locator(".public-office-notice")).toHaveCount(0);
}
async function empty(page, title) {
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible({ timeout: 20000 });
  for (const selector of ["canvas", ".agent-card", ".feed-item", ".character-label-container"]) await expect(page.locator(selector)).toHaveCount(0);
}
async function publish(id) { return api(owner, "/office/publication", { method: "PUT", data: { workspace_id: id } }); }
function fixtureSession(user, role) {
  const token = randomUUID();
  const hash = createHash("sha256").update(token).digest("hex");
  db.prepare("INSERT INTO logins(token_hash,user,expires) VALUES(?,?,?)").run(hash, user, Math.floor(Date.now() / 1000) + 3600);
  db.prepare("INSERT INTO members(tenant,user,role) VALUES(?,?,?)").run(b.id, user, role);
  sessions.push({ user, hash });
  return token;
}

try {
  await start();
  browser = await chromium.launch({ channel: process.env.AE_TEST_BROWSER || "msedge", headless: true });
  owner = await context();
  await api(owner, "/login", { method: "POST", data: { token: (await readFile(path.join(org, ".state/owner.key"), "utf8")).trim() } });
  assert.equal((await api(owner, "/office/publication")).status, "unpublished");
  a = await api(owner, "/tenants", { method: "POST", data: { name: "Public office fixture A" } });
  b = await api(owner, "/tenants", { method: "POST", data: { name: "Private office fixture B" } });
  for (const workspace of [a, b]) await api(owner, "/cockpit/setup", { method: "POST", data: {}, workspace: workspace.id });
  const privateState = await api(owner, "/state", { workspace: b.id });
  const privateNova = privateState.agents.find(agent => agent.name === "Nova");
  await api(owner, `/agents/${privateNova.id}`, { method: "PUT", data: { ...privateNova, name: "Private fixture Nova" }, workspace: b.id });
  const before = {};
  for (const workspace of [a, b]) before[workspace.id] = await api(owner, "/state", { workspace: workspace.id });
  receipt.baseline = [a, b].map(workspace => ({ id: workspace.id, name: workspace.name, agents: before[workspace.id].agents.length, runs: before[workspace.id].runs.length, profileHash: createHash("sha256").update(JSON.stringify(before[workspace.id].agents)).digest("hex") }));
  assert(Object.values(before).every(state => state.runs.length === 0), "Setup cannot start provider work");
  db = new DatabaseSync(path.join(org, ".state/platform.sqlite3"));
  db.exec("PRAGMA busy_timeout=5000");
  const memberToken = fixtureSession("office-fixture-member", "member");
  const otherOwnerToken = fixtureSession("office-fixture-owner", "owner");
  const anonymous = await context();
  const otherAnonymous = await context({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await api(anonymous, "/office/publication", { status: 401 });
  await api(anonymous, "/cockpit/state", { status: 401 });
  await api(anonymous, `/cockpit/state?group_id=general&workspace_id=${b.id}`, { workspace: b.id, status: 401 });
  await api(anonymous, "/public/office/state", { method: "POST", data: {}, status: 405 });
  for (const token of [memberToken, otherOwnerToken]) {
    for (const method of ["GET", "PUT"]) await api(anonymous, "/office/publication", { method, ...(method === "PUT" ? { data: { workspace_id: a.id } } : {}), status: 403, headers: { authorization: `Bearer ${token}` } });
  }
  const desktop = await anonymous.newPage();
  const mobile = await otherAnonymous.newPage();
  const signed = await owner.newPage();
  const errors = [];
  for (const page of [desktop, mobile, signed]) page.on("pageerror", error => errors.push(error.message));
  await desktop.goto("/office");
  await empty(desktop, "Kantor belum dipublikasikan");
  await screenshot(desktop, "unpublished");
  await owner.addCookies([{ name: "ae_workspace", value: b.id, url: base }]);
  await signed.goto("/settings/workspace");
  const settings = signed.locator('section[aria-labelledby="public-office-heading"]');
  await expect(settings).toBeVisible();
  await expect(settings.getByRole("button", { name: "Stop publishing", exact: true })).toHaveCount(0);
  const disclosure = settings.getByRole("button", { name: "What visitors can see", exact: true });
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  await disclosure.focus();
  await signed.keyboard.press("Enter");
  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  await expect(settings.getByText("raw chat, prompts, full outputs, credentials and private workdir paths.", { exact: false })).toBeVisible();
  await signed.keyboard.press("Space");
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  await selectValue(settings.getByRole("combobox", { name: "Public workspace", exact: true }), a.id);
  assert.equal((await api(owner, "/office/publication")).status, "unpublished", "Selection alone cannot publish");
  await settings.getByRole("button", { name: "Publish office", exact: true }).focus();
  await signed.keyboard.press("Enter");
  await expect(settings.getByTestId("saved-publication")).toHaveText(`Published: ${a.name}`);
  await expect(settings.getByRole("button", { name: "Published", exact: true })).toBeDisabled();
  const [openedOffice] = await Promise.all([
    owner.waitForEvent("page"),
    settings.getByRole("link", { name: "Open public office", exact: true }).click(),
  ]);
  await published(openedOffice, a.name);
  await openedOffice.close();
  const first = await api(owner, "/office/publication");
  assert.equal(first.workspace_id, a.id);
  assert.equal((await publish(a.id)).revision, first.revision);
  await screenshot(signed, "owner-settings-desktop");
  await signed.setViewportSize({ width: 390, height: 844 });
  await settings.scrollIntoViewIfNeeded();
  assert(await settings.evaluate(element => element.getBoundingClientRect().right <= innerWidth), "Settings fit mobile viewport");
  await screenshot(signed, "owner-settings-mobile");
  await disclosure.click();
  await expect(settings.locator(".public-office-details")).toBeVisible();
  await screenshot(signed, "owner-settings-mobile-details");
  await disclosure.click();
  await signed.setViewportSize({ width: 320, height: 844 });
  await settings.scrollIntoViewIfNeeded();
  assert(await settings.evaluate(element => element.scrollWidth <= element.clientWidth && element.getBoundingClientRect().right <= innerWidth), "Compact settings do not overflow at 320px");
  await screenshot(signed, "owner-settings-320");
  await signed.setViewportSize({ width: 1440, height: 1000 });
  await signed.emulateMedia({ reducedMotion: "no-preference" });
  await disclosure.click();
  assert(await settings.locator(".public-office-details").evaluate(element => getComputedStyle(element).transitionDuration.split(",").some(value => parseFloat(value) > 0)), "Detail reveal has a purposeful transition");
  await disclosure.click();
  await signed.emulateMedia({ reducedMotion: "reduce" });
  await disclosure.click();
  assert(await settings.locator(".public-office-details").evaluate(element => getComputedStyle(element).transitionDuration.split(",").every(value => parseFloat(value) === 0)), "Reduced motion disables the detail transition");
  await disclosure.click();
  receipt.checks.push("Compact publication settings: explicit status, unchanged save disabled, keyboard disclosure, 320/390px layouts and reduced motion");
  await published(desktop, a.name);
  await mobile.goto(`/office?workspace=${b.id}&group=..%2Fprivate`);
  await published(mobile, a.name);
  await signed.goto(`/office?workspace=${b.id}`);
  await published(signed, a.name);
  assert.equal((await owner.cookies()).find(cookie => cookie.name === "ae_workspace").value, b.id);
  const states = await Promise.all([anonymous, otherAnonymous, owner].map(ctx => api(ctx, `/public/office/state?workspace_id=${b.id}&group_id=invalid`, { headers: { "x-ae-workspace": b.id } })));
  for (const state of states) {
    assert.equal(state.workspace.id, a.id);
    assert.equal(state.snapshot.workspace_id, a.id);
    assert.equal(state.snapshot.group_id, null);
    assert.deepEqual(state.snapshot.mapping, states[0].snapshot.mapping);
    assert.equal(state.snapshot.totals.active_runs, 0);
  }
  const publicRequest = signed.waitForRequest(request => request.url().includes("/api/public/office/state"));
  assert.equal((await publicRequest).headers().cookie, undefined, "Public fetch omits signed-in cookies");
  await expect.poll(() => desktop.locator('.character-label-container:not([style*="display: none"])').count()).toBe(5);
  receipt.characters = await desktop.evaluate(roles => {
    const scene = window.__officeObservedScenes.at(-1);
    if (!scene) throw new Error("Actual Three.js scene was not observed");
    return roles.map(role => {
      const root = scene.getObjectByName(`character_${role}`);
      let meshes = 0;
      root?.traverse(object => { if (object.isMesh && object.visible) meshes++; });
      return { role, visible: root?.visible === true, meshes };
    });
  }, Object.keys(states[0].snapshot.mapping));
  assert(receipt.characters.every(character => character.visible && character.meshes > 10), "Each mapped character has actual visible meshes in the rendered scene");
  for (const role of Object.keys(states[0].snapshot.mapping)) {
    const card = desktop.locator(`.agent-card[data-role="${role}"]`);
    await card.click();
    await expect(card).toHaveAttribute("aria-pressed", "true");
    await expect(desktop.locator(`#tag-${role}`)).toBeVisible();
    await screenshot(desktop, `character-${role}`);
    await card.click();
  }
  const canvas = await desktop.locator("canvas").elementHandle();
  await desktop.locator('.agent-card[data-role="data_engineer"]').click();
  await desktop.waitForTimeout(3000);
  await expect(desktop.locator('.agent-card[data-role="data_engineer"]')).toHaveAttribute("aria-pressed", "true");
  assert(await desktop.locator("canvas").evaluate((element, previous) => element === previous, canvas), "Same-target polling retains mount and focus");
  const revisionBeforeRename = (await api(owner, "/office/publication")).revision;
  const renamed = `${a.name} renamed`;
  await api(owner, `/tenants/${a.id}`, { method: "PUT", data: { name: renamed } });
  a.name = renamed;
  await published(desktop, renamed);
  await published(mobile, renamed);
  await published(signed, renamed);
  assert.equal((await api(owner, "/office/publication")).revision, revisionBeforeRename, "Workspace rename does not replace the published target");
  assert(await desktop.locator("canvas").evaluate((element, previous) => element === previous, canvas), "Workspace rename updates the title without remounting the scene");
  await expect(desktop.locator('.agent-card[data-role="data_engineer"]')).toHaveAttribute("aria-pressed", "true");
  receipt.checks.push("Published workspace rename propagates to existing anonymous and signed-in viewers without publication revision change or camera remount");
  await screenshot(desktop, "public-desktop");
  await screenshot(mobile, "public-mobile");
  receipt.checks.push("Unpublished; owner keyboard publish; two anonymous + signed-in selectors; five mapped character labels/focus; mobile; same-target mount retained");

  workspaceDB = new DatabaseSync(path.join(org, "workspaces", a.id, ".state/app.sqlite3"));
  workspaceDB.exec("PRAGMA busy_timeout=5000");
  const mapped = before[a.id].agents.find(agent => agent.id === states[0].snapshot.mapping.data_engineer);
  const now = new Date().toISOString();
  const run = { id: "public-office-stored-fixture", group_id: "general", message_id: "fixture-message", side_chat_id: null, agent_id: mapped.id, session_id: "PRIVATE_SESSION", native_session_id: null, status: "succeeded", cwd: "C:/PRIVATE_WORKDIR", profile: mapped, created_at: now, started_at: now, ended_at: now, pid: null, remote_pid: null, exit_code: 0, error: null, output: "PRIVATE_OUTPUT", artifact_errors: [], executable: "PRIVATE_EXECUTABLE", arguments: ["PRIVATE_ARGUMENT"], model_display_name: null, usage: { total_tokens: 42 }, kind: "direct", parent_run_id: null, task: "PRIVATE_PROMPT", organization_context: null };
  workspaceDB.prepare("INSERT INTO runs(id,data) VALUES(?,?)").run(run.id, JSON.stringify(run));
  const activity = { run_id: run.id, category: "reading", state: "completed", step_index: 1, relative_file: "src/public-office-fixture.ts", operation: "read_file" };
  const fixtureEvent = workspaceDB.prepare("INSERT INTO events(kind,payload,created_at) VALUES(?,?,?)").run("run.activity", JSON.stringify(activity), now).lastInsertRowid;
  await expect(desktop.locator("#feedList")).toContainText("Membaca src/public-office-fixture.ts");
  await expect(mobile.locator("#feedListMobile")).toContainText("Membaca src/public-office-fixture.ts");
  for (const ctx of [anonymous, otherAnonymous, owner]) {
    const projected = await api(ctx, "/public/office/state");
    assert.equal(projected.snapshot.totals.tokens_processed, 42);
    assert(!JSON.stringify(projected).includes("PRIVATE_"));
    assert.equal(projected.snapshot.events[0].summary, "Membaca src/public-office-fixture.ts");
  }
  await screenshot(desktop, "public-descriptive-activity");
  workspaceDB.prepare("DELETE FROM events WHERE seq=?").run(fixtureEvent);
  workspaceDB.prepare("DELETE FROM runs WHERE id=?").run(run.id);
  workspaceDB.close();
  workspaceDB = null;
  receipt.checks.push("Labeled persisted completed-run/activity fixture updates feed and 42-token aggregate for all viewers; raw source markers excluded; no actual provider run");

  await signed.goto("/organization/live-preview?group=general");
  await expect(signed.locator(".live-preview-connection")).toHaveAttribute("data-connection", "live");
  await expect(signed.getByRole("combobox", { name: "Team", exact: true })).toHaveAttribute("data-value", "general");
  assert.equal((await api(owner, "/cockpit/state?group_id=general", { workspace: b.id })).workspace_id, b.id);
  await expect(signed.getByLabel("Configure cockpit team", { exact: true })).toBeVisible();
  await screenshot(signed, "private-preview");
  await signed.getByRole("button", { name: "Close Live Preview", exact: true }).click();
  await expect(signed).toHaveURL(/\/organization$/);
  const organizationPopup = owner.waitForEvent("page");
  await signed.getByRole("button", { name: "Public Live Office", exact: true }).click();
  const organizationOffice = await organizationPopup;
  await published(organizationOffice, a.name);
  await organizationOffice.close();
  await signed.getByRole("button", { name: "Workspace preview", exact: true }).click();
  await expect(signed).toHaveURL(/\/organization\/live-preview/);
  await expect(signed.locator(".live-preview-connection")).toHaveAttribute("data-connection", "live");
  const member = await context();
  await member.addCookies([{ name: "ae_session", value: memberToken, url: base }, { name: "ae_workspace", value: b.id, url: base }]);
  const memberPage = await member.newPage();
  await memberPage.goto("/settings/workspace");
  await expect(memberPage.locator(".workspace-bar")).toBeVisible();
  await expect(memberPage.getByRole("heading", { name: "Public Live Office", exact: true })).toHaveCount(0);
  assert.equal((await api(member, "/cockpit/state", { workspace: b.id })).workspace_id, b.id);
  await api(member, "/cockpit/state", { workspace: a.id, status: 403 });
  receipt.checks.push("Private workspace/filter/mapping controls preserved; member reads own authorized projection but cannot manage publication or access another workspace");

  await stop();
  await start();
  assert.equal((await api(owner, "/office/publication")).workspace_id, a.id);
  await published(desktop, a.name);
  await publish(b.id);
  await published(desktop, b.name);
  await published(mobile, b.name);
  db.prepare("UPDATE members SET role='member' WHERE tenant=? AND user='owner'").run(b.id);
  await empty(desktop, "Kantor publik tidak tersedia");
  assert.equal((await api(anonymous, "/public/office/state")).workspace, null);
  await publish(null);
  await empty(mobile, "Kantor belum dipublikasikan");
  db.prepare("UPDATE members SET role='owner' WHERE tenant=? AND user='owner'").run(b.id);
  await publish(a.id);
  await published(desktop, a.name);
  db.prepare("UPDATE tenants SET deleted=1 WHERE id=?").run(a.id);
  await empty(desktop, "Kantor publik tidak tersedia");
  await publish(null);
  db.prepare("UPDATE tenants SET deleted=0 WHERE id=?").run(a.id);
  await publish(a.id);
  await published(desktop, a.name);
  await anonymous.setOffline(true);
  await empty(desktop, "Kantor publik belum dapat dimuat");
  await anonymous.setOffline(false);
  await published(desktop, a.name);
  let releaseDelayed;
  let held = false;
  const delayed = new Promise(resolve => { releaseDelayed = resolve; });
  await desktop.route("**/api/public/office/state", async route => {
    if (held) return route.continue();
    held = true;
    const response = await route.fetch();
    await delayed;
    // The payload is a genuine response captured before the publication switch.
    await route.fulfill({ response }).catch(error => { receipt.delayedDelivery = String(error); });
  });
  await expect.poll(() => held).toBe(true);
  await empty(desktop, "Kantor publik belum dapat dimuat");
  await publish(b.id);
  await published(desktop, b.name);
  releaseDelayed();
  await desktop.unroute("**/api/public/office/state");
  await desktop.waitForTimeout(3000);
  await published(desktop, b.name);
  await publish(a.id);
  receipt.checks.push("Actual native restart; switch; revoke; stop broken target; delete; offline scene clearing and recovery");
  receipt.checks.push("Genuine old response delayed beyond deadline cannot restore old workspace after a newer publication");

  // Playwright forces focus/visibility; Puppeteer observes the browser's real tab state.
  const cockpitRequire = createRequire(path.join(source, "cockpit/package.json"));
  const { default: puppeteer } = await import(pathToFileURL(cockpitRequire.resolve("puppeteer")).href);
  visibilityBrowser = await puppeteer.launch({ executablePath: process.env.AE_TEST_BROWSER_EXECUTABLE || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
  const tab = await visibilityBrowser.newPage();
  await tab.goto(`${base}/office`);
  await tab.waitForSelector("#scene canvas");
  const foreground = await visibilityBrowser.newPage();
  await foreground.bringToFront();
  await tab.waitForFunction(() => document.hidden && !document.querySelector("canvas"));
  await publish(b.id);
  await tab.bringToFront();
  await tab.waitForFunction(name => !document.hidden && document.querySelector(".top-bar")?.textContent.includes(name), {}, b.name);
  assert.equal(await tab.$(".public-office-notice"), null);
  await visibilityBrowser.close();
  visibilityBrowser = null;
  await publish(a.id);
  receipt.checks.push("Actual browser tab hidden clears scene; foreground refetches changed publication without mocked visibility");

  await signed.goto("/settings/workspace");
  await expect(settings).toBeVisible();
  await selectValue(settings.getByRole("combobox", { name: "Public workspace", exact: true }), b.id);
  await expect(settings.getByTestId("saved-publication")).toBeVisible();
  await expect(settings.getByTestId("saved-publication")).toHaveText(`Published: ${a.name}`);
  db.prepare("UPDATE tenants SET deleted=1 WHERE id=?").run(b.id);
  const invalidSave = signed.waitForResponse(response => response.url().endsWith("/api/office/publication") && response.request().method() === "PUT");
  await settings.getByRole("button", { name: "Update office", exact: true }).click();
  assert.equal((await invalidSave).status(), 400);
  await expect(settings.getByRole("combobox", { name: "Public workspace", exact: true })).toHaveAttribute("data-value", b.id);
  assert.equal((await api(owner, "/office/publication")).workspace_id, a.id);
  db.prepare("UPDATE tenants SET deleted=0 WHERE id=?").run(b.id);
  let writes = 0;
  let releaseWrite;
  const pendingWrite = new Promise(resolve => { releaseWrite = resolve; });
  await signed.route("**/api/office/publication", async route => {
    if (route.request().method() !== "PUT") return route.continue();
    writes++;
    await pendingWrite;
    await route.fetch();
    await route.abort("failed");
  });
  await settings.getByRole("button", { name: "Update office", exact: true }).click();
  await expect(settings.getByRole("button", { name: "Publishing…", exact: true })).toBeDisabled();
  await expect(settings.getByRole("combobox", { name: "Public workspace", exact: true })).toBeDisabled();
  releaseWrite();
  await expect(settings.getByRole("button", { name: "Update office", exact: true })).toBeEnabled();
  await expect(signed.getByText("Publication could not be confirmed.", { exact: false }).first()).toBeVisible();
  assert.equal(writes, 1, "Lost response cannot repeat a mutation");
  await expect(settings.getByRole("combobox", { name: "Public workspace", exact: true })).toHaveAttribute("data-value", b.id);
  await signed.unroute("**/api/office/publication");
  await settings.getByRole("button", { name: "Refresh saved status", exact: true }).click();
  await expect(settings.getByTestId("saved-publication")).toHaveText(`Published: ${b.name}`);
  await settings.getByRole("button", { name: "Stop publishing", exact: true }).click();
  await expect(settings.getByRole("button", { name: "Publish office", exact: true })).toBeEnabled();
  await empty(desktop, "Kantor belum dipublikasikan");
  receipt.checks.push("Real mutation with lost response; draft retained; explicit reconciliation; UI stop");
  for (const workspace of [a, b]) {
    const after = await api(owner, "/state", { workspace: workspace.id });
    assert.deepEqual(after.agents, before[workspace.id].agents, "Viewing/publication never changes profiles");
    assert.deepEqual(after.runs, before[workspace.id].runs, "Viewing/publication never starts tasks");
  }
  assert.deepEqual(errors, []);
  receipt.checks.push("No browser errors; no viewer-created runs or profile changes");
} catch (error) {
  receipt.failure = String(error.stack || error);
  throw error;
} finally {
  if (owner && service?.exitCode === null && service.signalCode === null) {
    await publish(null).catch(error => { receipt.cleanupError = String(error); });
    for (const workspace of [a, b].filter(Boolean)) await api(owner, `/tenants/${workspace.id}`, { method: "DELETE", data: {} }).catch(error => { receipt.cleanupError = String(error); });
    await api(owner, "/logout", { method: "POST", data: {} }).catch(error => { receipt.cleanupError = String(error); });
  }
  if (db) {
    for (const session of sessions) {
      db.prepare("DELETE FROM logins WHERE token_hash=?").run(session.hash);
      db.prepare("DELETE FROM members WHERE user=?").run(session.user);
    }
    receipt.fixtureSessionsRemaining = sessions.reduce((count, session) => count + db.prepare("SELECT count(*) AS n FROM logins WHERE token_hash=?").get(session.hash).n, 0);
    receipt.allSessionsRemaining = db.prepare("SELECT count(*) AS n FROM logins").get().n;
    receipt.activeFixtureWorkspaces = [a, b].filter(Boolean).reduce((count, workspace) => count + db.prepare("SELECT count(*) AS n FROM tenants WHERE id=? AND deleted=0").get(workspace.id).n, 0);
    db.close();
  }
  workspaceDB?.close();
  await visibilityBrowser?.close();
  await browser?.close();
  await stop();
  receipt.serviceStopped = !service || service.exitCode !== null || service.signalCode !== null;
  await writeFile(path.join(proof, "receipt.json"), JSON.stringify(receipt, null, 2));
}
assert.equal(receipt.cleanupError, undefined, "Owned fixture cleanup must complete");
assert.equal(receipt.allSessionsRemaining, 0, "All fixture sessions, including bootstrap-owner sign-in, are revoked");
assert.equal(receipt.activeFixtureWorkspaces, 0, "Owned test workspaces are soft-deleted");
assert.equal(receipt.serviceStopped, true, "Owned controller is stopped");
console.log(JSON.stringify({ result: "PASS", proof, checks: receipt.checks }, null, 2));
