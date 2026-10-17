import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { expect as playwrightExpect } from "@playwright/test";

const expect = playwrightExpect.configure({ timeout: 30000 });

export async function verifyActionFeedbackSettings({ page, call, state, org, directory, base }) {
  assert(org && base && process.env.AE_TEST_DISPOSABLE === "true", "Use an explicitly disposable authenticated candidate");
  const suffix = crypto.randomUUID().slice(0, 8);
  const initial = await state();
  const proof = { scenarios: [], transportFaults: [], providerTasksStarted: 0 };
  const requests = [];
  const observe = value => {
    const url = new URL(value.url());
    if (url.pathname.startsWith("/api/")) requests.push({ path: url.pathname, method: value.method() });
  };
  page.on("request", observe);
  const status = () => page.locator(".action-status-area");
  const dialogs = () => page.locator('[data-slot="dialog-content"][role="dialog"]');
  const count = (method, pathname) => requests.filter(value => value.method === method && value.path === pathname).length;
  async function heldResponse(method, pathname) {
    let release;
    let received = false;
    let responseStatus;
    let used = false;
    let settled;
    const done = new Promise(resolve => { settled = resolve; });
    const hold = new Promise(resolve => { release = resolve; });
    const pattern = `**${pathname}`;
    const handler = async route => {
      if (used || route.request().method() !== method) return route.continue();
      used = true;
      try {
        const response = await route.fetch();
        responseStatus = response.status();
        received = true;
        await hold;
        await route.fulfill({ response });
      } finally { settled(); }
    };
    await page.route(pattern, handler);
    return {
      ready: () => expect.poll(() => received).toBe(true),
      status: () => responseStatus,
      release: () => release(),
      dispose: async () => { release(); if (used) await done; await page.unroute(pattern, handler); },
    };
  }
  async function openRuntime() {
    await page.goto("/settings/runtime");
    await expect(page.locator(".runtime-settings")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Loading runtimes" })).toHaveCount(0);
  }
  async function openSsh(id) {
    await page.goto("/settings/runtime");
    await page.getByRole("button", { name: "SSH workstations", exact: true }).click();
    if (id) {
      const host = (await state()).workstations.find(value => value.id === id);
      assert(host, "Expected disposable workstation");
      await page.getByRole("navigation", { name: "Saved workstations" }).getByRole("button").filter({ hasText: host.name }).click();
      await expect(page.locator("#host-name")).toHaveValue(host.name);
    }
  }
  async function createMenu(kind) {
    await page.goto("/organization");
    await page.getByRole("button", { name: "Add group or section", exact: true }).click();
    await page.getByRole("menuitem", { name: `Create ${kind}`, exact: true }).click();
  }
  async function manageGroup(group) {
    await page.goto(`/${group.project ? "projects" : "groups"}/${group.id}/chat`);
    await page.getByRole("button", { name: group.project ? "Manage project" : "Manage group", exact: true }).click();
    return dialogs().filter({ has: page.locator("#group-name") });
  }
  try {
    await openRuntime();
    const invalidName = "é".repeat(50);
    await page.locator("#runtime-name").fill(invalidName);
    const rejectedRegistration = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/runtimes");
    await page.getByRole("button", { name: "Register runtime", exact: true }).click();
    assert.equal((await rejectedRegistration).status(), 400);
    await expect(status()).toContainText("could not be confirmed");
    await expect(page.locator("#runtime-name")).toHaveValue(invalidName);
    assert(!(await call("/runtimes", undefined, "GET")).some(value => value.name === invalidName));

    const runtimeName = `Feedback runtime ${suffix}`;
    await page.locator("#runtime-name").fill(runtimeName);
    const registerGate = await heldResponse("POST", "/api/runtimes");
    try {
      await page.getByRole("button", { name: "Register runtime", exact: true }).click();
      await registerGate.ready();
      await expect(page.getByRole("button", { name: "Registering runtime…", exact: true })).toHaveAttribute("aria-busy", "true");
      assert.equal(registerGate.status(), 200);
      await page.getByRole("button", { name: "SSH workstations", exact: true }).click();
    } finally { await registerGate.dispose(); }
    await expect(page.locator(".action-toast").filter({ hasText: `${runtimeName} registered.` })).toHaveCount(1);
    await page.getByRole("button", { name: "Agent runtimes", exact: true }).click();
    const token = page.getByLabel("Enrollment token", { exact: true });
    await expect(token).toBeVisible();
    assert((await token.inputValue()).length > 0, "Enrollment token stays in its dedicated field");
    const retainedToken = await token.inputValue();
    await page.getByRole("button", { name: "Organization", exact: true }).click();
    await page.getByRole("button", { name: "User settings", exact: true }).click();
    await page.getByRole("button", { name: "Runtime", exact: true }).click();
    await expect(token).toBeVisible();
    assert((await token.inputValue()) === retainedToken, "Ephemeral enrollment token survives SPA settings navigation without entering a notification");
    const runtime = (await call("/runtimes", undefined, "GET")).find(value => value.name === runtimeName);
    assert(runtime && !runtime.online && !runtime.revoked);
    const row = page.locator(".runtime-row").filter({ has: page.locator("strong", { hasText: runtimeName }) });
    await row.getByRole("button", { name: `Edit ${runtimeName}`, exact: true }).click();
    const renamedRuntime = `${runtimeName} edited`;
    await row.getByRole("textbox", { name: "Runtime name", exact: true }).fill(renamedRuntime);
    await row.getByRole("textbox", { name: "Description", exact: true }).fill("Actual persisted feedback test registration");
    const editGate = await heldResponse("PUT", `/api/runtimes/${runtime.id}`);
    try {
      await row.getByRole("button", { name: "Save runtime", exact: true }).click();
      await editGate.ready();
      await expect(row.getByRole("button", { name: "Saving runtime…", exact: true })).toHaveAttribute("aria-busy", "true");
      await expect(page.getByRole("button", { name: "Register runtime", exact: true })).toHaveAttribute("aria-busy", "false");
    } finally { await editGate.dispose(); }
    await expect(status()).toContainText(`${renamedRuntime} runtime settings saved`);
    assert.equal((await call("/runtimes", undefined, "GET")).find(value => value.id === runtime.id).name, renamedRuntime);
    await page.getByRole("button", { name: "Refresh runtimes", exact: true }).click();
    await expect(status()).toContainText("Runtime list refreshed");
    const renamedRow = page.locator(".runtime-row").filter({ has: page.locator("strong", { hasText: renamedRuntime }) });
    await renamedRow.getByRole("button", { name: "Revoke", exact: true }).click();
    await renamedRow.getByRole("button", { name: "Confirm revoke", exact: true }).click();
    await expect(status()).toContainText("registration revoked");
    assert.equal((await call("/runtimes", undefined, "GET")).find(value => value.id === runtime.id).revoked, true);
    proof.scenarios.push({ name: "runtime register/edit/revoke/manual refresh and actual rejection", runtimeId: runtime.id, rejectionStatus: 400, tokenInDedicatedField: true, tokenSurvivesPendingPanelClosureAndSpaNavigation: true, unrelatedRegisterNotPending: true });
    proof.transportFaults.push("Held genuine registration/edit responses after backend completion to inspect pending UI; forwarded unchanged status/body");

    await createMenu("group");
    let dialog = dialogs().filter({ has: page.locator("#group-name") });
    await dialog.getByLabel("Name", { exact: true }).fill(invalidName);
    const rejectedGroup = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/groups");
    await dialog.getByRole("button", { name: "Save group", exact: true }).click();
    assert.equal((await rejectedGroup).status(), 400);
    await expect(dialog.locator(".action-status-area")).toContainText("could not be confirmed");
    await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue(invalidName);
    const groupName = `Feedback group ${suffix}`;
    await dialog.getByLabel("Name", { exact: true }).fill(groupName);
    const groupGate = await heldResponse("POST", "/api/groups");
    try {
      await dialog.getByRole("button", { name: "Save group", exact: true }).click();
      await groupGate.ready();
      await expect(dialog.getByRole("button", { name: "Saving group…", exact: true })).toHaveAttribute("aria-busy", "true");
    } finally { await groupGate.dispose(); }
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(".action-toast").filter({ hasText: `${groupName} saved.` })).toHaveCount(1);
    await expect(page.locator(".banner.notice").filter({ hasText: "Group saved" })).toHaveCount(0);
    let group = (await state()).groups.find(value => value.name === groupName);
    assert(group);

    dialog = await manageGroup(group);
    const changedName = `${groupName} updated`;
    await dialog.getByLabel("Name", { exact: true }).fill(changedName);
    let failStateRead = false;
    const failRead = async route => route.request().method() === "GET" && failStateRead ? route.abort("failed") : route.continue();
    const acknowledgeThenFailRead = async route => {
      if (route.request().method() !== "POST") return route.continue();
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      failStateRead = true;
      await route.fulfill({ response });
    };
    await page.route("**/api/state", failRead);
    await page.route("**/api/groups", acknowledgeThenFailRead);
    const beforeSaveCount = count("POST", "/api/groups");
    try {
      await dialog.getByRole("button", { name: "Save group", exact: true }).click();
      await expect(dialog.locator(".action-status-area")).toContainText("saved. Review scheduled tasks");
      await expect(dialog.locator(".action-status-area")).toContainText("could not refresh");
      await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue(changedName);
      assert.equal((await state()).groups.find(value => value.id === group.id).name, changedName);
    } finally {
      failStateRead = false;
      await page.unroute("**/api/state", failRead);
      await page.unroute("**/api/groups", acknowledgeThenFailRead);
    }
    await dialog.getByRole("button", { name: "Retry refresh", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    assert.equal(count("POST", "/api/groups") - beforeSaveCount, 1, "Retry refresh never repeats the successful save");
    group = (await state()).groups.find(value => value.id === group.id);
    dialog = await manageGroup(group);
    await dialog.getByRole("button", { name: "Archive group", exact: true }).click();
    await dialogs().getByRole("button", { name: "Archive group", exact: true }).click();
    await expect(dialogs()).toHaveCount(0);
    assert((await state()).groups.find(value => value.id === group.id).archived_at);
    dialog = await manageGroup(group);
    await dialog.getByRole("button", { name: "Restore group", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    assert.equal((await state()).groups.find(value => value.id === group.id).archived_at, null);
    dialog = await manageGroup(group);
    await dialog.getByRole("button", { name: "Delete group", exact: true }).click();
    await dialogs().getByRole("button", { name: "Delete group", exact: true }).click();
    await expect(dialogs()).toHaveCount(0);
    assert((await state()).groups.find(value => value.id === group.id).deleted_at);
    proof.scenarios.push({ name: "group CRUD, rejection, selective closing toast and read-only refresh recovery", groupId: group.id, rejectionStatus: 400, mutationCountDuringRetry: 1, archivedRestoredDeleted: true });
    proof.transportFaults.push("Forwarded actual group save response; aborted subsequent browser GET /api/state until explicit Retry refresh");

    const hostId = process.env.AE_TEST_WORKSTATION_ID;
    const sshAlias = process.env.AE_TEST_SSH_ALIAS;
    const workdir = process.env.AE_TEST_WORKDIR;
    assert(hostId && sshAlias && workdir, "Provide the dedicated candidate's real SSH workstation, alias and workdir");
    const seedHost = (await state()).workstations.find(value => value.id === hostId);
    assert(seedHost && seedHost.auth === "key", "Use the disposable server-side key fixture for review/trust; never copy its key contents");
    const copiedHost = await call("/workstations", { workstation: { ...seedHost, id: "", name: `Feedback SSH ${suffix}` }, secret: null, clear_secret: false });
    await openSsh(copiedHost.id);
    const renamedHost = `${copiedHost.name} saved`;
    await page.locator("#host-name").fill(renamedHost);
    await page.getByRole("button", { name: "Save workstation", exact: true }).click();
    await expect(status()).toContainText(`${renamedHost}: workstation saved`);
    assert.equal((await state()).workstations.find(value => value.id === copiedHost.id).name, renamedHost);
    const testGate = await heldResponse("POST", `/api/workstations/${copiedHost.id}/test`);
    try {
      await page.getByRole("button", { name: "Test connection", exact: true }).click();
      await testGate.ready();
      await expect(page.getByRole("button", { name: "Testing connection…", exact: true })).toHaveAttribute("aria-busy", "true");
      await expect(page.getByRole("button", { name: "Save workstation", exact: true })).toHaveAttribute("aria-busy", "false");
    } finally { await testGate.dispose(); }
    await expect(status()).toContainText("connection is online");
    await page.getByRole("button", { name: "Review host keys", exact: true }).click();
    await expect(status()).toContainText("Trust has not changed");
    const fingerprints = page.locator(".host-key-review pre");
    await expect(fingerprints).toBeVisible();
    assert((await fingerprints.innerText()).includes("SHA256:"), "Real host fingerprints stay in the review display");
    await page.getByRole("button", { name: "Trust these host keys", exact: true }).click();
    await expect(status()).toContainText("host keys trusted");
    await page.getByRole("button", { name: "Remove workstation", exact: true }).click();
    await page.getByRole("button", { name: "Confirm remove", exact: true }).click();
    await expect(status()).toContainText("workstation removed");
    assert(!(await state()).workstations.some(value => value.id === copiedHost.id));

    await page.locator("#import-ssh-alias").fill(sshAlias);
    await page.getByRole("button", { name: "Import alias", exact: true }).click();
    await expect(status()).toContainText("SSH settings imported");
    const importedId = (await state()).workstations.find(value => value.ssh_alias === sshAlias)?.id;
    assert(importedId, "Alias import persisted actual SSH settings");
    await expect(page.locator("#host-auth")).toHaveValue("ssh_config");
    await page.getByRole("button", { name: "Remove workstation", exact: true }).click();
    await page.getByRole("button", { name: "Confirm remove", exact: true }).click();
    await expect(status()).toContainText("workstation removed");

    const unavailable = await call("/workstations", { workstation: { ...seedHost, id: "", name: `Unavailable feedback SSH ${suffix}`, port: 1 }, secret: null, clear_secret: false });
    await openSsh(unavailable.id);
    await page.getByRole("button", { name: "Test connection", exact: true }).click();
    await expect(status()).toContainText(/Connection test failed|connection is not online/);
    await expect(page.locator("#host-name")).toHaveValue(unavailable.name);
    await expect(page.getByRole("button", { name: "Refresh workstation list", exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(directory, "action-feedback-ssh-failure.png"), fullPage: true });
    await page.getByRole("button", { name: "Remove workstation", exact: true }).click();
    await page.getByRole("button", { name: "Confirm remove", exact: true }).click();
    await expect(status()).toContainText("workstation removed");
    proof.scenarios.push({ name: "SSH save/test/review/trust/remove/import and real refused-port failure", hostFixtureId: hostId, copiedHostId: copiedHost.id, aliasImported: true, hostKeysReviewedAndExplicitlyTrusted: true, keysCopied: false, connectionFailure: "Real connection attempt to dedicated host port 1" });
    proof.transportFaults.push("Held genuine successful SSH test response to prove operation-specific pending label; request used real SSH");

    await createMenu("project");
    dialog = dialogs().filter({ has: page.locator("#group-name") });
    const projectName = `Feedback project ${suffix}`;
    await dialog.getByLabel("Name", { exact: true }).fill(projectName);
    await page.locator("#project-host").selectOption(hostId);
    await page.locator("#project-workdir").fill(workdir);
    await dialog.getByRole("button", { name: "Create project", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/projects\/.*\/structure$/);
    const project = (await state()).groups.find(value => value.name === projectName);
    assert(project && project.project.workdir.ssh_host === hostId && project.project.workdir.path === workdir);
    await expect(page.locator(".action-toast").filter({ hasText: `${projectName} created.` })).toHaveCount(1);
    proof.scenarios.push({ name: "project creation closes with one result and preserves SSH workdir", projectId: project.id, workstationId: hostId });
    await page.screenshot({ path: path.join(directory, "action-feedback-project-created.png"), fullPage: true });
    assert.equal((await state()).runs.length, initial.runs.length, "Settings and group operations start no provider tasks");
    await writeFile(path.join(directory, "action-feedback-settings.json"), JSON.stringify(proof, null, 2));
    return proof;
  } finally {
    page.off("request", observe);
  }
}
