import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { selectValue } from "./value-picker.mjs";
import { expect as playwrightExpect } from "@playwright/test";
const expect = playwrightExpect.configure({ timeout: 30000 });

async function bounded(promise, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label)), 15000); })]); }
  finally { clearTimeout(timer); }
}

export async function verifyAccountProfileNavigation({ page, call, state, directory, base }) {
  assert(process.env.AE_TEST_DISPOSABLE === "true" && ["localhost", "127.0.0.1"].includes(new URL(base).hostname), "Use a disposable loopback controller");
  const browser = page.context().browser();
  const { human } = JSON.parse(await readFile(process.env.AE_TEST_MATRIX_CREDENTIALS_FILE, "utf8"));
  await call("/tenants/default/members", { user: human.user_id, role: "member" });
  const member = await browser.newContext({ baseURL: base, viewport: { width: 1440, height: 980 } });
  const login = await member.request.post("/api/login", { data: { username: human.username, password: human.password } });
  assert.equal(login.status(), 200, "Real local Matrix Member login");
  const memberPage = await member.newPage();
  const errors = [];
  memberPage.on("pageerror", error => errors.push(error.message));
  const api = async (context, route, method = "GET", data) => {
    const response = await context.request.fetch("/api" + route, { method, ...(data === undefined ? {} : { data }) });
    assert.equal(response.status(), 200, `Local ${method} ${route}`); return response.json();
  };
  const originalOwner = (await api(page.context(), "/me")).display_name ?? null;
  const originalMember = (await api(member, "/me")).display_name ?? null;
  const runsBefore = (await state()).runs.length;
  const checks = [];
  const toasts = current => current.locator(".action-toast:not([data-ending-style])");
  async function dismiss(current) {
    while (await toasts(current).count()) {
      await toasts(current).first().getByRole("button", { name: "Dismiss notification", exact: true }).click();
      await expect(toasts(current)).toHaveCount(0);
    }
  }
  async function hold(current, method, action, fail = false) {
    let release, started, completed, routeError;
    const gate = new Promise(resolve => { release = resolve; });
    const accepted = new Promise(resolve => { started = resolve; });
    const done = new Promise(resolve => { completed = resolve; });
    let held = false;
    const endpoint = method === "PUT" ? "/api/me/profile" : "/api/me";
    const handler = async route => {
      if (route.request().method() !== method || held) return route.continue();
      held = true;
      try {
        const response = await route.fetch();
        assert.equal(response.status(), 200, "The held response must come from the real local application");
        started(); await gate;
        if (fail) await route.abort("failed"); else await route.fulfill({ response });
      } catch (error) { routeError = error; started(); }
      finally { completed(); }
    };
    await current.route(`**${endpoint}`, handler);
    try {
      await action({ started: () => bounded(accepted, "Profile request did not reach real persistence"), release: async () => {
        release(); await bounded(done, "Profile response did not complete"); if (routeError) throw routeError;
      } });
    } finally {
      release();
      await current.unroute(`**${endpoint}`, handler);
    }
  }
  async function flow(current, actor, returnEarly, destination = "Runtime") {
    await current.goto("/settings/profile");
    await expect(current.locator("#account-display-name")).toBeVisible();
    await dismiss(current);
    const name = `${actor} navigation ${destination} ${returnEarly ? "early" : "away"} ${Date.now()}`;
    let writes = 0;
    const count = request => { if (request.method() === "PUT" && new URL(request.url()).pathname === "/api/me/profile") writes += 1; };
    current.on("request", count);
    try {
      await hold(current, "PUT", async gate => {
        await current.locator("#account-display-name").fill(name);
        await current.getByRole("button", { name: "Save profile", exact: true }).click();
        await gate.started();
        await expect(current.getByRole("button", { name: "Save profile", exact: true })).toHaveText("Saving…");
        if (destination === "Chat") await current.locator('[data-group-id="general"] .nav-item').last().click();
        else await current.getByRole("button", { name: destination, exact: true }).click();
        await expect(current.locator("#account-display-name")).toHaveCount(0);
        if (returnEarly) {
          await current.getByRole("button", { name: "Profile", exact: true }).click();
          await expect(current.locator("#account-display-name")).toHaveValue(name);
          await expect(current.getByRole("button", { name: "Save profile", exact: true })).toBeDisabled();
          await expect(current.getByRole("button", { name: "Save profile", exact: true })).toHaveText("Saving…");
        }
        await gate.release();
        await expect(toasts(current).filter({ hasText: "Profile saved." })).toHaveCount(1);
        await expect(current.locator(".account-menu-name")).toHaveText(name);
        if (destination === "Chat") {
          await current.getByRole("button", { name: "Account menu", exact: true }).click();
          await current.getByRole("menuitem", { name: "Profile", exact: true }).click();
        } else if (!returnEarly) await current.getByRole("button", { name: "Profile", exact: true }).click();
        await expect(current.locator("#account-display-name")).toHaveValue(name);
        await expect(current.locator(".profile-identity h2")).toHaveText(name);
        await expect(current.getByRole("button", { name: "Save profile", exact: true })).toHaveText("Saved");
        assert.equal((await api(current.context(), "/me")).display_name, name);
        assert.equal(writes, 1, "Returning while pending must not repeat the PUT");
      });
      await current.screenshot({ path: path.join(directory, `profile-save-${actor}-${destination}-${returnEarly ? "early" : "away"}.png`), fullPage: true });
      checks.push({ actor, destination, returnEarly, realWrites: writes, successToasts: 1, formAndSidebarMatchSavedValue: true });
    } finally { current.off("request", count); }
  }
  try {
    for (const [current, actor] of [[page, "Owner"], [memberPage, "Member"]]) {
      await flow(current, actor, false);
      await flow(current, actor, true);
    }
    await flow(page, "Owner", false, "Chat");
    await dismiss(page);
    const draft = `Unconfirmed navigation ${Date.now()}`;
    await hold(page, "PUT", async gate => {
      await page.locator("#account-display-name").fill(draft);
      await page.getByRole("button", { name: "Save profile", exact: true }).click(); await gate.started();
      await page.getByRole("button", { name: "Runtime", exact: true }).click(); await gate.release();
      await expect(toasts(page).filter({ hasText: "Could not save profile. Your draft has been kept." })).toHaveCount(1);
    }, true);
    await page.getByRole("button", { name: "Profile", exact: true }).click();
    await expect(page.locator("#account-display-name")).toHaveValue(draft);
    await expect(page.getByRole("button", { name: "Check saved profile", exact: true })).toBeVisible();
    await dismiss(page);
    let recoveryWrites = 0;
    const countRecovery = request => { if (request.method() === "PUT" && new URL(request.url()).pathname === "/api/me/profile") recoveryWrites += 1; };
    page.on("request", countRecovery);
    try {
      await hold(page, "GET", async gate => {
        await page.getByRole("button", { name: "Check saved profile", exact: true }).click(); await gate.started();
        await page.getByRole("button", { name: "Runtime", exact: true }).click(); await gate.release();
        await expect(toasts(page).filter({ hasText: "Saved display name matches your draft" })).toHaveCount(1);
        await expect(page.locator(".account-menu-name")).toHaveText(draft);
      });
      await page.getByRole("button", { name: "Profile", exact: true }).click();
      await expect(page.locator("#account-display-name")).toHaveValue(draft);
      await expect(page.locator(".profile-identity h2")).toHaveText(draft);
      assert.equal(recoveryWrites, 0, "Read-only reconciliation must not repeat the write");
      checks.push({ actor: "Owner", ambiguousRealPut: true, draftRetainedAcrossNavigation: true, failureToasts: 1, recoveryToasts: 1, recoveryWrites: 0 });
    } finally { page.off("request", countRecovery); }
    const previousWorkspace = await page.getByRole("combobox", { name: "Workspace", exact: true }).getAttribute("data-value");
    const workspace = await call("/tenants", { name: `Profile navigation context ${Date.now()}` });
    await page.reload();
    await expect(page.locator("#account-display-name")).toBeVisible();
    try {
      await dismiss(page);
      const obsolete = `Obsolete workspace name ${Date.now()}`;
      const latest = `Current workspace name ${Date.now()}`;
      await hold(page, "PUT", async gate => {
        await page.locator("#account-display-name").fill(obsolete);
        await page.getByRole("button", { name: "Save profile", exact: true }).click(); await gate.started();
        await selectValue(page.getByRole("combobox", { name: "Workspace", exact: true }), workspace.id);
        await page.getByRole("button", { name: "Account menu", exact: true }).click();
        await page.getByRole("menuitem", { name: "Profile", exact: true }).click();
        await page.locator("#account-display-name").fill(latest);
        await page.getByRole("button", { name: "Save profile", exact: true }).click();
        await expect(toasts(page).filter({ hasText: "Profile saved." })).toHaveCount(1);
        await gate.release();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await expect(toasts(page).filter({ hasText: "Could not save profile" })).toHaveCount(0);
        await expect(page.locator("#account-display-name")).toHaveValue(latest);
        await expect(page.locator(".account-menu-name")).toHaveText(latest);
        assert.equal((await api(page.context(), "/me")).display_name, latest);
      }, true);
      checks.push({ actor: "Owner", abandonedWorkspaceFailureSuppressed: true, currentWorkspaceSaveRetained: true, staleFailureToasts: 0 });
    } finally {
      await page.keyboard.press("Escape");
      await selectValue(page.getByRole("combobox", { name: "Workspace", exact: true }), previousWorkspace || "default");
      await call(`/tenants/${workspace.id}`, {}, "DELETE");
    }
    assert.deepEqual(errors, []);
    assert.equal((await state()).runs.length, runsBefore, "No agent tasks may be created");
    const receipt = { at: new Date().toISOString(), base, checks, regressionFixed: true, runsBefore, runsAfter: (await state()).runs.length, successfulApiResponsesMocked: false, faultInjection: "Real successful PUT/GET responses are delayed across SPA navigation; one real persisted PUT loses only its acknowledgment through a transport abort." };
    await writeFile(path.join(directory, "profile-save-navigation.json"), JSON.stringify(receipt, null, 2));
    return receipt;
  } finally {
    await api(page.context(), "/me/profile", "PUT", { display_name: originalOwner });
    await api(member, "/me/profile", "PUT", { display_name: originalMember });
    assert.equal((await api(page.context(), "/me")).display_name ?? null, originalOwner, "Owner profile restored");
    assert.equal((await api(member, "/me")).display_name ?? null, originalMember, "Member profile restored");
    await api(member, "/logout", "POST", {});
    await member.close();
  }
}
