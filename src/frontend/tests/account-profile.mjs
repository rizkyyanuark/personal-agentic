import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect as playwrightExpect } from "@playwright/test";
import { selectValue } from "./value-picker.mjs";

const expect = playwrightExpect.configure({ timeout: 30000 });
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const workspaceHeaders = id => ({ "x-ae-workspace": id });

async function api(context, route, { method = "GET", data, workspace, status = 200, headers = {} } = {}) {
  const response = await context.request.fetch(`/api${route}`, {
    method,
    ...(data === undefined ? {} : { data }),
    headers: { ...(workspace ? workspaceHeaders(workspace) : {}), ...headers },
  });
  assert.equal(response.status(), status, `${method} ${route} HTTP status`);
  return status === 200 ? response.json() : null;
}

async function sessionHash(context) {
  const session = (await context.cookies()).find(cookie => cookie.name === "ae_session");
  assert(session?.value, "The browser must have an application session from real sign-in");
  return digest(session.value);
}

async function dismissToasts(page) {
  const toasts = page.locator(".action-toast:not([data-ending-style])");
  while (await toasts.count()) {
    const before = await toasts.count();
    await toasts.first().getByRole("button", { name: "Dismiss notification", exact: true }).click();
    await expect.poll(() => toasts.count()).toBeLessThan(before);
  }
}

async function oneOutcome(page, message) {
  await expect(page.locator(".action-toast:not([data-ending-style])").filter({ hasText: message })).toHaveCount(1);
  await expect(page.locator(".profile-form .action-status-area")).not.toContainText(message);
}

async function profile(page) {
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Profile", exact: true }).click();
  await expect(page.locator("#account-display-name")).toBeVisible();
}

async function enterName(page, value) {
  const input = page.locator("#account-display-name");
  await input.focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  if (value) await page.keyboard.insertText(value);
  await expect(input).toHaveValue(value);
}

async function saveName(page, raw, accepted) {
  await dismissToasts(page);
  await enterName(page, raw);
  const responsePromise = page.waitForResponse(response =>
    new URL(response.url()).pathname === "/api/me/profile" && response.request().method() === "PUT");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  const response = await responsePromise;
  assert.equal(response.status(), 200);
  assert.equal((await response.json()).display_name, accepted);
  await oneOutcome(page, "Profile saved.");
  await expect(page.locator("#account-display-name")).toHaveValue(accepted ?? "");
}

async function assertProfile(page, user, name, role) {
  await expect(page.locator("#account-display-name")).toHaveValue(name ?? "");
  await expect(page.locator(".account-menu-trigger .account-menu-name")).toHaveText(name || user);
  await expect(page.locator(".account-menu-trigger .account-menu-role")).toHaveText(role === "owner" ? "Owner" : "Member");
  await expect(page.locator(".workspace-bar .settings-badge")).toHaveText(role === "owner" ? "Owner" : "Member");
  const identity = await page.locator(".profile-details").evaluate(element => Object.fromEntries(
    [...element.querySelectorAll("dt")].map(term => [term.textContent, term.nextElementSibling?.textContent]),
  ));
  assert.equal(identity.Username, user, "The immutable account identity stays visible");
  assert.equal(identity.Role, role === "owner" ? "Owner" : "Member");
}

async function switchWorkspace(page, id) {
  await selectValue(page.getByRole("combobox", { name: "Workspace", exact: true }), id);
  await profile(page);
}

async function menuPermissions(page, { owner, controller }) {
  const trigger = page.getByRole("button", { name: "Account menu", exact: true });
  await trigger.click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "Profile", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Sign out", exact: true })).toBeVisible();
  for (const [name, allowed] of [["Runtime settings", controller], ["Workspace settings", owner], ["Archived groups", owner]]) {
    await expect(menu.getByRole("menuitem", { name, exact: true })).toHaveCount(allowed ? 1 : 0);
  }
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
}

async function login(page, { ownerKey, human }) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome back", exact: true })).toBeVisible();
  await expect(page.locator("#login-username")).toBeVisible();
  if (ownerKey) {
    await page.getByRole("button", { name: "Administrator sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Administrator sign in", exact: true })).toBeVisible();
    await expect(page.locator("#login-username")).toHaveCount(0);
    await page.locator("#login-password").fill(ownerKey);
  } else {
    await page.locator("#login-username").fill(human.username);
    await page.locator("#login-password").fill(human.password);
  }
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Workspace", exact: true })).toBeVisible();
}

async function avatarSnapshot(page) {
  await page.goto("/organization");
  const nodes = page.locator('.react-flow__node[data-id^="agent:"]');
  await expect(nodes.first()).toBeVisible();
  return nodes.evaluateAll(elements => elements.map(element => ({
    id: element.getAttribute("data-id"),
    initials: element.querySelector(".avatar-initials")?.textContent,
    color: element.querySelector(".avatar")?.getAttribute("style"),
  })).sort((a, b) => a.id.localeCompare(b.id)));
}

async function snapshots(context, workspaces) {
  return Promise.all(workspaces.map(async workspace => {
    const state = await api(context, "/state", { workspace: workspace.id });
    const people = await api(context, "/people", { workspace: workspace.id });
    return {
      id: workspace.id,
      people: people.sort((a, b) => a.user.localeCompare(b.user)),
      agents: digest(state.agents),
      runs: state.runs.length,
      actions: state.actions.length,
    };
  }));
}

async function staleWorkspaceResponse(page, context, workspaces, savedName, suffix, method) {
  await switchWorkspace(page, workspaces[0].id);
  await dismissToasts(page);
  const oldName = method === "PUT" ? `Old PUT ${suffix}` : savedName;
  const currentName = `Current ${method} ${suffix}`;
  if (method === "GET") {
    await enterName(page, "🚀".repeat(65));
    await page.getByRole("button", { name: "Save profile", exact: true }).click();
    await oneOutcome(page, "Display name cannot exceed 64 characters.");
    await dismissToasts(page);
  }
  let releaseResponse;
  const release = new Promise(resolve => { releaseResponse = resolve; });
  let forwarded = false;
  let heldRequests = 0;
  const endpoint = method === "PUT" ? "/api/me/profile" : "/api/me";
  const matching = request => request.method() === method && new URL(request.url()).pathname === endpoint
    && (method !== "PUT" || request.postDataJSON()?.display_name === oldName);
  const handler = async route => {
    if (heldRequests || !matching(route.request())) return route.continue();
    heldRequests += 1;
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    assert.equal((await response.json()).display_name, oldName);
    forwarded = true;
    await release;
    return route.fulfill({ response });
  };
  await page.route(`**${endpoint}`, handler);
  try {
    if (method === "PUT") {
      await enterName(page, oldName);
      await page.getByRole("button", { name: "Save profile", exact: true }).click();
    } else {
      await page.getByRole("button", { name: "Check saved profile", exact: true }).click();
    }
    await expect.poll(() => forwarded).toBe(true);
    assert.equal((await api(context, "/me")).display_name, oldName, "The held response must come from the real persisted profile");
    await switchWorkspace(page, workspaces[1].id);
    await saveName(page, currentName, currentName);
    const lateResponse = page.waitForResponse(response => matching(response.request()));
    releaseResponse();
    await (await lateResponse).finished();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await assertProfile(page, "owner", currentName, "owner");
    assert.equal((await api(context, "/me")).display_name, currentName);
    await oneOutcome(page, "Profile saved.");
    assert.equal(heldRequests, 1, "Exactly one old-workspace response is delayed");
  } finally {
    releaseResponse();
    await page.unroute(`**${endpoint}`, handler);
  }
  await saveName(page, savedName, savedName);
  return { method, heldResponses: heldRequests, currentWorkspaceNameRetained: true, persistedNameRetained: true, staleToastSuppressed: true };
}

export async function verifyAccountProfile({ page, call, org, directory, base, ownerKey }) {
  assert(org && directory && process.env.AE_TEST_DISPOSABLE === "true" && process.env.AE_TEST_URL && process.env.AE_TEST_ORG,
    "account-profile requires explicitly disposable local candidate settings");
  assert(["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname), "Use a loopback candidate");
  const phase = process.env.AE_TEST_PROFILE_PHASE || "prepare";
  assert(["prepare", "verify", "cleanup"].includes(phase), "AE_TEST_PROFILE_PHASE must be prepare, verify, or cleanup");
  const credentialsFile = process.env.AE_TEST_MATRIX_CREDENTIALS_FILE;
  assert(credentialsFile, "Provide AE_TEST_MATRIX_CREDENTIALS_FILE for an existing real local Matrix human account");
  const { human } = JSON.parse(await readFile(credentialsFile, "utf8"));
  assert(human?.username && human?.password && human?.user_id, "The private Matrix fixture must include a real human account");
  assert.equal((await call("/auth", undefined, "GET")).matrix, true, "Configure the candidate's real local Matrix homeserver before acceptance");
  const browser = page.context().browser();
  await page.goto("about:blank");
  const proofDirectory = path.join(directory, "account-profile");
  await mkdir(proofDirectory, { recursive: true });
  const manifestPath = path.join(proofDirectory, "private-restart-manifest.json");
  const errors = [];
  const contexts = [];
  const proof = { phase, at: new Date().toISOString(), cases: [], providerTasksStarted: 0, mocks: false };
  const makeContext = async storageState => {
    const context = await browser.newContext({ baseURL: base, viewport: { width: 1440, height: 980 }, ...(storageState ? { storageState } : {}) });
    contexts.push(context);
    return context;
  };
  const makePage = async context => {
    const value = await context.newPage();
    value.on("pageerror", error => errors.push(error.message));
    return value;
  };
  const writeProof = async () => {
    assert.deepEqual(errors, [], "Profile browser JavaScript errors");
    const serialized = JSON.stringify(proof, null, 2);
    for (const secret of [ownerKey, human.password]) assert(!serialized.includes(secret), "Public receipt must not include credentials");
    await writeFile(path.join(proofDirectory, `${phase}.json`), `${serialized}\n`);
  };
  let manifest;
  try {
    if (phase === "prepare") {
      const previous = await readFile(manifestPath, "utf8").catch(error => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      assert(!previous || JSON.parse(previous).cleanedAt, "Run account-profile cleanup before replacing an unfinished private manifest");
      const ownerMe = await call("/me", undefined, "GET");
      assert.equal(ownerMe.user, "owner");
      assert.equal(ownerMe.matrix, true, "GET /me retains the existing matrix field");
      const suffix = randomUUID().slice(0, 8);
      manifest = { version: 1, base, createdAt: proof.at, workspaces: [], owner: { user: "owner", originalName: ownerMe.display_name ?? null }, member: { user: human.user_id } };
      await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600 });
      const workspaceA = await call("/tenants", { name: `Profile member ${suffix}` });
      manifest.workspaces.push({ ...workspaceA, memberRole: "member" });
      await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600 });
      const workspaceB = await call("/tenants", { name: `Profile owner ${suffix}` });
      manifest.workspaces.push({ ...workspaceB, memberRole: "owner" });
      await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600 });
      const workspaces = [{ ...workspaceA, memberRole: "member" }, { ...workspaceB, memberRole: "owner" }];
      for (const workspace of workspaces) await call(`/tenants/${workspace.id}/members`, { user: human.user_id, role: workspace.memberRole });
      const ownerContext = await makeContext();
      const memberContext = await makeContext();
      const ownerPage = await makePage(ownerContext);
      const memberPage = await makePage(memberContext);
      await login(ownerPage, { ownerKey });
      await login(memberPage, { human });
      const memberMe = await api(memberContext, "/me");
      assert.equal(memberMe.user, human.user_id, "Real Matrix sign-in supplies its stable Matrix ID");
      assert.equal(memberMe.matrix, true);
      assert.notEqual(await sessionHash(ownerContext), await sessionHash(memberContext), "Browser sessions must be independent");
      const initialDefault = await api(ownerContext, "/state", { workspace: "default" });
      const originalAvatars = await avatarSnapshot(ownerPage);
      const before = await snapshots(ownerContext, workspaces);
      manifest = {
        version: 1, base, createdAt: proof.at, workspaces, before,
        defaultAgents: digest(initialDefault.agents), defaultRuns: initialDefault.runs.length, originalAvatars,
        owner: { user: "owner", originalName: ownerMe.display_name ?? null, name: `Owner profile ${suffix}`, storageState: await ownerContext.storageState() },
        member: { user: human.user_id, originalName: memberMe.display_name ?? null, name: `Matrix profile ${suffix}`, storageState: await memberContext.storageState() },
      };
      await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600 });
      const ownerSession = await sessionHash(ownerContext);
      const memberSession = await sessionHash(memberContext);
      let ownerPuts = 0;
      ownerPage.on("request", request => { if (request.method() === "PUT" && new URL(request.url()).pathname === "/api/me/profile") ownerPuts += 1; });
      await profile(ownerPage);
      await saveName(ownerPage, `Baseline ${suffix}`, `Baseline ${suffix}`);
      const unicode64 = "🚀".repeat(64);
      await saveName(ownerPage, `  ${unicode64}  `, unicode64);
      await ownerPage.reload();
      await assertProfile(ownerPage, "owner", unicode64, "owner");
      assert.equal((await api(ownerContext, "/me")).display_name, unicode64);
      const nameLayout = await ownerPage.locator(".account-menu-trigger").evaluate(trigger => {
        const control = trigger.getBoundingClientRect();
        const name = trigger.querySelector(".account-menu-name").getBoundingClientRect();
        const role = trigger.querySelector(".account-menu-role").getBoundingClientRect();
        return { contained: name.left >= control.left && name.right <= control.right + 1, separated: name.bottom <= role.top + 1,
          documentFits: document.documentElement.scrollWidth <= innerWidth + 1 };
      });
      assert.deepEqual(nameLayout, { contained: true, separated: true, documentFits: true }, "Long names must fit without overlapping the role");
      await ownerPage.screenshot({ path: path.join(proofDirectory, "owner-unicode-64.png"), fullPage: true });
      await dismissToasts(ownerPage);
      const beforeInvalidPuts = ownerPuts;
      await enterName(ownerPage, "🚀".repeat(65));
      await ownerPage.getByRole("button", { name: "Save profile", exact: true }).click();
      await oneOutcome(ownerPage, "Display name cannot exceed 64 characters.");
      assert.equal(ownerPuts, beforeInvalidPuts, "65 scalars must be rejected in the form before a PUT");
      assert.equal(Array.from(await ownerPage.locator("#account-display-name").inputValue()).length, 65);
      assert.equal((await api(ownerContext, "/me")).display_name, unicode64);
      proof.cases.push({ scenario: "normal keyboard Unicode boundary and reload", acceptedScalars: 64, rejectedScalars: 65, overlongPuts: 0, trimmed: true, oneToast: true });

      const invalidBodies = [{}, { display_name: "\tProfile\n" }, { display_name: "🚀".repeat(65) },
        { display_name: false }, { display_name: "forged", user: human.user_id },
        { display_name: "forged", target_user: human.user_id }, { display_name: "forged", role: "owner" },
        { display_name: "forged", memberships: [] }];
      for (const data of invalidBodies) {
        await api(ownerContext, "/me/profile", { method: "PUT", data, status: 400 });
        assert.equal((await api(ownerContext, "/me")).display_name, unicode64);
        assert.equal((await api(memberContext, "/me")).display_name, manifest.member.originalName);
      }
      const anonymous = await makeContext();
      await api(anonymous, "/me/profile", { method: "PUT", data: { display_name: "denied" }, status: 401 });
      await api(ownerContext, "/me/profile", { method: "PUT", data: { display_name: "denied" }, headers: { Origin: "https://invalid.example" }, status: 403 });
      assert.equal((await api(ownerContext, "/me")).display_name, unicode64);
      proof.cases.push({ scenario: "validation and self-only authorization", rejectedBodies: invalidBodies.length, validationStatus: 400, anonymousStatus: 401, originStatus: 403, savedValuesUnchanged: true });

      await saveName(ownerPage, "", null);
      await ownerPage.reload();
      await assertProfile(ownerPage, "owner", null, "owner");
      const literal = `<b data-profile-test="${suffix}">Plain text</b>`;
      await saveName(ownerPage, literal, literal);
      await expect(ownerPage.locator(`[data-profile-test="${suffix}"]`)).toHaveCount(0);
      await expect(ownerPage.locator(".settings-section-title h2")).toHaveText(literal);
      await saveName(ownerPage, "A🚀", "A🚀");
      await expect(ownerPage.locator(".account-menu-trigger .avatar-initials")).toHaveText("A🚀");
      await saveName(ownerPage, manifest.owner.name, manifest.owner.name);
      await ownerPage.reload();
      await assertProfile(ownerPage, "owner", manifest.owner.name, "owner");
      proof.cases.push({ scenario: "owner clear fallback and literal plain text", clearedName: null, fallback: "owner", markupRenderedAsText: true, reload: true });
      proof.cases.push({ scenario: "Unicode scalar account avatar", displayName: "A🚀", initials: "A🚀", agentBranchUnchanged: true });

      await switchWorkspace(memberPage, workspaceA.id);
      await saveName(memberPage, `Before clear ${suffix}`, `Before clear ${suffix}`);
      await saveName(memberPage, "", null);
      await memberPage.reload();
      await assertProfile(memberPage, human.user_id, null, "member");
      await saveName(memberPage, manifest.member.name, manifest.member.name);
      await memberPage.reload();
      await assertProfile(memberPage, human.user_id, manifest.member.name, "member");
      await api(memberContext, "/me/profile", { method: "PUT", data: { display_name: "forged", user: "owner" }, status: 400 });
      assert.equal((await api(ownerContext, "/me")).display_name, manifest.owner.name);
      assert.equal((await api(memberContext, "/me")).display_name, manifest.member.name);
      await menuPermissions(memberPage, { owner: false, controller: false });
      await expect(memberPage.getByRole("button", { name: "Action board", exact: true })).toHaveCount(0);
      await expect(memberPage.getByRole("button", { name: "Organization", exact: true })).toHaveCount(0);
      const deniedAction = { id: randomUUID(), group_id: "general", title: `Denied profile action ${suffix}`, body: "No provider execution", assignee_id: "", planned_start: null, status: "backlog", revision: 0 };
      await api(memberContext, "/actions", { method: "POST", data: deniedAction, workspace: workspaceA.id, status: 403 });
      await api(memberContext, `/tenants/${workspaceA.id}/members`, { method: "POST", data: { user: human.user_id, role: "owner" }, status: 403 });
      await api(memberContext, "/workspaces/directories?path=/workdir", { workspace: workspaceA.id, status: 403 });
      await switchWorkspace(memberPage, workspaceB.id);
      await assertProfile(memberPage, human.user_id, manifest.member.name, "owner");
      await menuPermissions(memberPage, { owner: true, controller: false });
      await api(memberContext, "/workspaces/directories?path=/workdir", { workspace: workspaceB.id, status: 403 });
      await switchWorkspace(ownerPage, workspaceA.id);
      await assertProfile(ownerPage, "owner", manifest.owner.name, "owner");
      await menuPermissions(ownerPage, { owner: true, controller: false });
      await api(ownerContext, "/workspaces/directories?path=/workdir", { workspace: workspaceA.id, status: 403 });
      await switchWorkspace(ownerPage, "default");
      await assertProfile(ownerPage, "owner", manifest.owner.name, "owner");
      await menuPermissions(ownerPage, { owner: true, controller: true });
      await api(ownerContext, "/workspaces/directories?path=/workdir", { workspace: "default" });
      assert.deepEqual(await avatarSnapshot(ownerPage), originalAvatars, "Account edits must preserve real agent avatar initials and colors");
      proof.cases.push({ scenario: "two browser identities and workspace roles", owner: "owner", member: human.user_id, memberRoles: ["member", "owner"], memberActionStatus: 403, controllerRestricted: true, permissionAwareMenu: true, agentAvatarsUnchanged: true });
      const staleResponses = [];
      for (const method of ["PUT", "GET"]) staleResponses.push(await staleWorkspaceResponse(ownerPage, ownerContext, workspaces, manifest.owner.name, suffix, method));
      await switchWorkspace(ownerPage, "default");
      proof.cases.push({ scenario: "late responses from abandoned profile workspace", responses: staleResponses });
      proof.networkFaultInjection = "Real profile PUT/GET responses are delayed until a different workspace acknowledges a newer save; backend requests and persistence remain real.";

      await switchWorkspace(memberPage, workspaceA.id);
      await memberPage.goto("/groups/general/chat");
      const chatBody = `Profile identity check ${suffix}`;
      await memberPage.getByRole("textbox", { name: "Message", exact: true }).fill(chatBody);
      const messageResponse = memberPage.waitForResponse(response => new URL(response.url()).pathname === "/api/messages" && response.request().method() === "POST");
      await memberPage.getByRole("button", { name: "Send message", exact: true }).click();
      assert.equal((await messageResponse).status(), 200);
      const messages = await api(ownerContext, "/groups/general/messages", { workspace: workspaceA.id });
      const sent = messages.find(message => message.body === chatBody);
      assert(sent, "The real member chat message must be persisted");
      assert.equal(sent.sender, human.user_id);
      proof.cases.push({ scenario: "chat attribution remains immutable", message: sent.id, sender: sent.sender, providerRunsCreated: 0 });
      assert.deepEqual(await snapshots(ownerContext, workspaces), before, "Profiles must not change memberships, agent records, actions, or runs");
      assert.equal(await sessionHash(ownerContext), ownerSession);
      assert.equal(await sessionHash(memberContext), memberSession);
      assert.equal((await api(ownerContext, "/state", { workspace: "default" })).runs.length, manifest.defaultRuns);
      await switchWorkspace(memberPage, workspaceB.id);
      await profile(ownerPage);
      await ownerPage.screenshot({ path: path.join(proofDirectory, "owner-before-restart.png"), fullPage: true });
      await memberPage.screenshot({ path: path.join(proofDirectory, "matrix-before-restart.png"), fullPage: true });
      manifest.owner.sessionHash = ownerSession;
      manifest.member.sessionHash = memberSession;
      manifest.owner.storageState = await ownerContext.storageState();
      manifest.member.storageState = await memberContext.storageState();
      manifest.prepared = true;
      manifest.preparedAt = new Date().toISOString();
      await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600 });
      proof.restartReady = true;
      proof.ownerDisplayName = manifest.owner.name;
      proof.memberDisplayName = manifest.member.name;
      await writeProof();
      return proof;
    }

    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.equal(manifest.version, 1);
    assert.equal(manifest.base, base, "Use the same candidate origin across restart phases");
    assert.equal(manifest.member.user, human.user_id, "Use the same real Matrix account across phases");
    if (phase === "cleanup") {
      await call("/me/profile", { display_name: manifest.owner.originalName }, "PUT");
      for (const workspace of manifest.workspaces) await call(`/tenants/${workspace.id}`, {}, "DELETE");
      if (Object.hasOwn(manifest.member, "originalName")) {
        const cleanupContext = await makeContext();
        await api(cleanupContext, "/login", { method: "POST", data: { username: human.username, password: human.password } });
        await api(cleanupContext, "/me/profile", { method: "PUT", data: { display_name: manifest.member.originalName } });
        await api(cleanupContext, "/logout", { method: "POST", data: {} });
      }
      for (const account of [manifest.owner, manifest.member]) {
        if (!account.storageState) continue;
        const oldContext = await makeContext(account.storageState);
        const revoked = await oldContext.request.post("/api/logout", { data: {} });
        assert([200, 401].includes(revoked.status()), "Cleanup must revoke its session or confirm it was already expired/revoked");
      }
      proof.cleaned = true;
      manifest.cleanedAt = new Date().toISOString();
      await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600 });
      await writeProof();
      return proof;
    }
    assert.equal(manifest.prepared, true, "Run prepare successfully, then restart the candidate before verify");
    const restartPath = process.env.AE_TEST_PROFILE_RESTART_RECEIPT || path.join(directory, "container-restart.json");
    const restart = JSON.parse(await readFile(restartPath, "utf8"));
    assert(restart.container_id && restart.started_at_before && restart.started_at_after, "Provide the host Docker restart receipt");
    assert.notEqual(restart.started_at_after, restart.started_at_before, "The candidate process must actually restart");
    assert.notEqual(restart.pid_after, restart.pid_before, "The candidate PID must change across restart");
    assert(Date.parse(restart.started_at_after) > Date.parse(manifest.preparedAt), "Restart must occur after the successful profile prepare phase");
    assert(Number.isFinite(restart.readiness_latency_ms) && restart.readiness_latency_ms >= 0, "The host restart must establish real endpoint readiness");
    proof.restart = { container: restart.container_id, startedAtBefore: restart.started_at_before, startedAtAfter: restart.started_at_after,
      pidBefore: restart.pid_before, pidAfter: restart.pid_after, readinessLatencyMs: restart.readiness_latency_ms };
    const ownerContext = await makeContext(manifest.owner.storageState);
    const memberContext = await makeContext(manifest.member.storageState);
    const ownerPage = await makePage(ownerContext);
    const memberPage = await makePage(memberContext);
    for (const [context, account] of [[ownerContext, manifest.owner], [memberContext, manifest.member]]) {
      assert.equal(await sessionHash(context), account.sessionHash, "Restart must preserve the same browser session");
      const me = await api(context, "/me");
      assert.equal(me.user, account.user);
      assert.equal(me.display_name, account.name, "Profile must persist across a real candidate restart");
    }
    await ownerPage.goto("/settings/profile");
    await assertProfile(ownerPage, "owner", manifest.owner.name, "owner");
    await memberPage.goto("/settings/profile");
    await assertProfile(memberPage, manifest.member.user, manifest.member.name, "owner");
    for (const workspace of manifest.workspaces) {
      await switchWorkspace(ownerPage, workspace.id);
      await assertProfile(ownerPage, "owner", manifest.owner.name, "owner");
      await switchWorkspace(memberPage, workspace.id);
      await assertProfile(memberPage, manifest.member.user, manifest.member.name, workspace.memberRole);
      await api(memberContext, "/workspaces/directories?path=/workdir", { workspace: workspace.id, status: 403 });
    }
    assert.deepEqual(await snapshots(ownerContext, manifest.workspaces), manifest.before);
    await switchWorkspace(ownerPage, "default");
    const finalDefault = await api(ownerContext, "/state", { workspace: "default" });
    assert.equal(digest(finalDefault.agents), manifest.defaultAgents);
    assert.equal(finalDefault.runs.length, manifest.defaultRuns);
    assert.deepEqual(await avatarSnapshot(ownerPage), manifest.originalAvatars);
    proof.cases.push({ scenario: "same sessions after host-controlled restart", bothProfilesPersisted: true, workspaces: manifest.workspaces.map(workspace => workspace.id), membershipsUnchanged: true, agentAvatarsUnchanged: true, providerRunsCreated: 0 });

    for (const [context, account, credentials] of [[ownerContext, manifest.owner, { ownerKey }], [memberContext, manifest.member, { human }]]) {
      const accountPage = context === ownerContext ? ownerPage : memberPage;
      await profile(accountPage);
      await accountPage.getByRole("button", { name: "Account menu", exact: true }).click();
      await accountPage.getByRole("menuitem", { name: "Sign out", exact: true }).click();
      await expect(accountPage.getByRole("heading", { name: "Welcome back", exact: true })).toBeVisible();
      await api(context, "/me", { status: 401 });
      await login(accountPage, credentials);
      assert.equal((await api(context, "/me")).user, account.user);
      assert.equal((await api(context, "/me")).display_name, account.name);
      assert.notEqual(await sessionHash(context), account.sessionHash, "Sign-in after logout creates a fresh session");
      await profile(accountPage);
      await expect(accountPage.locator("#account-display-name")).toHaveValue(account.name);
    }
    proof.cases.push({ scenario: "logout and unchanged login modes", ownerAndMatrixRevokedStatus: 401, matrixPriorityRetained: true, administratorAlternativeRetained: true, namesPreservedOnRelogin: true });
    await ownerPage.screenshot({ path: path.join(proofDirectory, "owner-after-restart.png"), fullPage: true });
    await memberPage.screenshot({ path: path.join(proofDirectory, "matrix-after-restart.png"), fullPage: true });

    await api(ownerContext, "/me/profile", { method: "PUT", data: { display_name: manifest.owner.originalName } });
    await api(memberContext, "/me/profile", { method: "PUT", data: { display_name: manifest.member.originalName } });
    assert.equal((await api(ownerContext, "/me")).display_name, manifest.owner.originalName);
    assert.equal((await api(memberContext, "/me")).display_name, manifest.member.originalName);
    for (const workspace of manifest.workspaces) await api(ownerContext, `/tenants/${workspace.id}`, { method: "DELETE", data: {} });
    const finalTenants = await api(ownerContext, "/tenants");
    for (const workspace of manifest.workspaces) assert.equal(finalTenants.find(tenant => tenant.id === workspace.id)?.deleted, true);
    await api(ownerContext, "/logout", { method: "POST", data: {} });
    await api(memberContext, "/logout", { method: "POST", data: {} });
    proof.restoredOriginalNames = true;
    proof.disposableWorkspacesDeleted = true;
    proof.completed = true;
    manifest.cleanedAt = new Date().toISOString();
    await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600 });
    await writeProof();
    return proof;
  } catch (error) {
    for (const [index, context] of contexts.entries()) {
      const current = context.pages()[0];
      if (current && !current.isClosed()) {
        await current.screenshot({ path: path.join(proofDirectory, `${phase}-failure-${index}.png`), timeout: 10000 })
          .catch(captureError => console.error(`Profile failure screenshot unavailable: ${captureError.message}`));
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(message.replaceAll(ownerKey, "[REDACTED]").replaceAll(human.password, "[REDACTED]"));
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
}
