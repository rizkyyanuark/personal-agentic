import assert from "node:assert/strict";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { expect as playwrightExpect } from "@playwright/test";
import { selectValue } from "./value-picker.mjs";

const expect = playwrightExpect.configure({ timeout: 30000 });

export async function verifyActionFeedbackReviewChecks({ page, call, _state, org, directory, base }) {
  assert(org && base && process.env.AE_TEST_DISPOSABLE === "true", "Candidate requires explicit disposable test environment");
  const initialRuns = (await call("/state", undefined, "GET")).runs.length;
  const suffix = crypto.randomUUID().slice(0, 8);
  const proof = { findings: [], providerTasksStarted: 0, zeroProviderRuns: true };

  const dismissToasts = async () => {
    const activeToasts = page.locator(".action-toast:not([data-ending-style])");
    while ((await activeToasts.count()) > 0) {
      const initial = await activeToasts.count();
      await activeToasts.first().getByRole("button", { name: "Dismiss notification", exact: true }).click();
      await expect.poll(() => activeToasts.count()).toBeLessThan(initial);
    }
    await expect(page.locator(".action-toast:not([data-ending-style])")).toHaveCount(0);
  };

  // =========================================================================
  // Finding C: NewAgentDialog acknowledged creation with failed refresh
  // =========================================================================
  await page.goto(`${base}/organization`);
  await page.getByRole("button", { name: "Add agent", exact: true }).click();
  const agentDialog = page.getByRole("dialog", { name: "Add your agent", exact: true });
  await expect(agentDialog).toBeVisible();

  const newAgentName = `Review Agent ${suffix}`;
  await agentDialog.locator("#agent-name").fill(newAgentName);
  await agentDialog.locator("#agent-workdir").fill(org);

  const createButton = agentDialog.getByRole("button", { name: "Create agent", exact: true });
  await expect(createButton).toBeEnabled();

  let agentPostCount = 0;
  let failAgentStateRead = false;
  const agentPostHandler = async route => {
    if (route.request().method() === "POST") {
      agentPostCount += 1;
      const res = await route.fetch();
      failAgentStateRead = true;
      return route.fulfill({ response: res });
    }
    return route.continue();
  };
  const failStateReadHandler = async route => {
    if (failAgentStateRead && route.request().method() === "GET") {
      return route.abort("failed");
    }
    return route.continue();
  };

  await page.route("**/api/agents", agentPostHandler);
  await page.route("**/api/state", failStateReadHandler);

  try {
    await createButton.click();
    const warningToast = page.locator(".action-toast:not([data-ending-style])").filter({ hasText: "agent created, but the view could not refresh" });
    await expect(warningToast).toHaveCount(1);
    await expect(agentDialog.locator("fieldset")).toHaveAttribute("disabled", "");
    await expect(agentDialog.locator("#agent-name")).toBeDisabled();
    await expect(agentDialog.getByRole("button", { name: "Create agent", exact: true })).toHaveCount(0);
    const retryAgentRefresh = agentDialog.getByRole("button", { name: "Retry refresh", exact: true });
    await expect(retryAgentRefresh).toBeVisible();

    await dismissToasts();
    await expect(retryAgentRefresh).toBeVisible();
    await expect(agentDialog.locator("fieldset")).toHaveAttribute("disabled", "");
    await expect(agentDialog.locator("#agent-name")).toBeDisabled();

    failAgentStateRead = false;
    await retryAgentRefresh.click();
    await expect(agentDialog).toHaveCount(0);
    assert.equal(agentPostCount, 1, "Agent creation mutation count must remain 1 on retry");
    proof.findings.push({ finding: "C-NewAgentDialog", postCount: agentPostCount, draftLocked: true });
  } finally {
    failAgentStateRead = false;
    await page.unroute("**/api/agents", agentPostHandler);
    await page.unroute("**/api/state", failStateReadHandler);
    await dismissToasts();
  }

  // =========================================================================
  // Finding C / Item 3: ProjectTeam acknowledged save and Create project agent button guard
  // =========================================================================
  const projectWorkdir = (await call("/workspaces/probe", { path: org })).workspace;
  const teamProject = await call("/groups", {
    id: "",
    name: `Team Check ${suffix}`,
    description: "Disposable test project for team save check",
    member_ids: null,
    scope_levels: null,
    chat_lead_id: null,
    project: {
      workdir: projectWorkdir,
      members: [],
    },
  });
  const existingAgent = (await call("/state", undefined, "GET")).agents.find(a => !a.deleted_at);
  assert(existingAgent, "Expected existing agent");

  await page.goto(`${base}/projects/${teamProject.id}/structure`);
  await page.getByRole("button", { name: "Manage team", exact: true }).click();
  const teamSection = page.locator(".project-team-editor");
  await expect(teamSection).toBeVisible();

  await selectValue(teamSection.locator("#project-add-member"), existingAgent.id);
  await teamSection.getByRole("button", { name: "Add to team", exact: true }).click();

  let teamPostCount = 0;
  let failTeamStateRead = false;
  const teamPostHandler = async route => {
    if (route.request().method() === "POST") {
      teamPostCount += 1;
      const res = await route.fetch();
      failTeamStateRead = true;
      return route.fulfill({ response: res });
    }
    return route.continue();
  };
  const failTeamStateHandler = async route => {
    if (failTeamStateRead && route.request().method() === "GET") {
      return route.abort("failed");
    }
    return route.continue();
  };

  await page.route("**/api/groups", teamPostHandler);
  await page.route("**/api/state", failTeamStateHandler);

  try {
    await teamSection.getByRole("button", { name: "Save team", exact: true }).click();
    const teamWarningToast = page.locator(".action-toast:not([data-ending-style])").filter({ hasText: "team saved, but the view could not refresh" });
    await expect(teamWarningToast).toHaveCount(1);
    assert.equal(teamPostCount, 1, "Team save sent exactly 1 mutation");

    const retryTeam = teamSection.getByRole("button", { name: "Retry refresh", exact: true });
    await expect(retryTeam).toBeVisible();

    await dismissToasts();
    await expect(retryTeam).toBeVisible();

    // Verify Item 3: Create project agent button cannot increment POST count while acknowledged awaits refresh
    const createProjectAgentBtn = teamSection.getByRole("button", { name: "Create project agent", exact: true });
    await createProjectAgentBtn.click();
    assert.equal(teamPostCount, 1, "Create project agent button must not send POST while acknowledged awaits refresh");

    // Unblock state read: now retry refresh resolves via GET only
    failTeamStateRead = false;
    await retryTeam.click();
    const teamSuccessToast = page.locator(".action-toast:not([data-ending-style])").filter({ hasText: `${teamProject.name}: team saved.` });
    await expect(teamSuccessToast).toHaveCount(1);
    assert.equal(teamPostCount, 1, "Team save mutation count must remain 1 after retry refresh");
    proof.findings.push({ finding: "C-ProjectTeam", postCount: teamPostCount, readOnlyRetry: true, alternateButtonGuarded: true });
  } finally {
    failTeamStateRead = false;
    await page.unroute("**/api/groups", teamPostHandler);
    await page.unroute("**/api/state", failTeamStateHandler);
    await dismissToasts();
  }

  // =========================================================================
  // Finding C: ArchivedGroups acknowledged restore with failed refresh
  // =========================================================================
  const groupToArchive = await call("/groups", {
    id: "",
    name: `Archive Test ${suffix}`,
    description: "Disposable test group for restore check",
    member_ids: [],
    scope_levels: null,
  });
  await call(`/groups/${groupToArchive.id}/archive`);

  await page.goto(`${base}/organization`);
  const directArchiveBtn = page.getByRole("button", { name: "Archived groups", exact: true });
  if (await directArchiveBtn.isVisible().catch(() => false)) {
    await directArchiveBtn.click();
  } else {
    await page.getByRole("button", { name: "Account menu", exact: true }).click();
    await page.getByRole("menuitem", { name: "Archived groups", exact: true }).click();
  }
  const archiveDialog = page.getByRole("dialog", { name: "Archived groups", exact: true });
  await expect(archiveDialog).toBeVisible();

  let restorePostCount = 0;
  let failRestoreStateRead = false;
  const restorePostHandler = async route => {
    if (route.request().method() === "POST") {
      restorePostCount += 1;
      const res = await route.fetch();
      failRestoreStateRead = true;
      return route.fulfill({ response: res });
    }
    return route.continue();
  };
  const failRestoreStateHandler = async route => {
    if (failRestoreStateRead && route.request().method() === "GET") {
      return route.abort("failed");
    }
    return route.continue();
  };

  await page.route(`**/api/groups/${groupToArchive.id}/restore`, restorePostHandler);
  await page.route("**/api/state", failRestoreStateHandler);

  try {
    await archiveDialog.getByRole("button", { name: `Restore ${groupToArchive.name}`, exact: true }).click();
    const restoreWarningToast = page.locator(".action-toast:not([data-ending-style])").filter({ hasText: "restored, but the view could not refresh" });
    await expect(restoreWarningToast).toHaveCount(1);

    const retryRestore = archiveDialog.getByRole("button", { name: "Retry refresh", exact: true });
    await expect(retryRestore).toBeVisible();

    await dismissToasts();
    await expect(retryRestore).toBeVisible();

    failRestoreStateRead = false;
    await retryRestore.click();
    const restoreSuccessToast = page.locator(".action-toast:not([data-ending-style])").filter({ hasText: `${groupToArchive.name} restored.` });
    await expect(restoreSuccessToast).toHaveCount(1);
    assert.equal(restorePostCount, 1, "Group restore mutation count must remain 1 on retry");
    proof.findings.push({ finding: "C-ArchivedGroups", restoreCount: restorePostCount, recoveryRetained: true });
  } finally {
    failRestoreStateRead = false;
    await page.unroute(`**/api/groups/${groupToArchive.id}/restore`, restorePostHandler);
    await page.unroute("**/api/state", failRestoreStateHandler);
    await dismissToasts();
  }

  // =========================================================================
  // Finding D: GroupList pin mutation count, acknowledged retention, and read-only retry
  // =========================================================================
  const groupA = await call("/groups", {
    id: "",
    name: `PinGroupA ${suffix}`,
    description: "Disposable test group for pin check A",
    member_ids: [],
  });
  const groupB = await call("/groups", {
    id: "",
    name: `PinGroupB ${suffix}`,
    description: "Disposable test group for pin check B",
    member_ids: [],
  });

  await page.goto(`${base}/groups/general/chat`);
  const rowA = page.locator(".group-row").filter({ hasText: groupA.name });
  await expect(rowA).toBeVisible();

  const pinBtnA = rowA.getByRole("button", { name: `Pin ${groupA.name}`, exact: true });
  await expect(pinBtnA).toBeVisible();

  let pinPutCount = 0;
  let lastPinPayload = null;
  let failPinStateRead = false;

  let prePinRequest = null;
  let prePinGateRelease;
  let prePinReceived = false;
  let prePinRequestFinished = false;
  let prePinRequestFailed = false;
  let prePinStarted = false;
  let prePinSettle;
  const prePinHold = new Promise(resolve => { prePinGateRelease = resolve; });
  const prePinSettled = new Promise(resolve => { prePinSettle = resolve; });
  const prePinPattern = "**/api/state";

  const observeRequestFinished = request => {
    if (prePinRequest && request === prePinRequest) {
      prePinRequestFinished = true;
    }
  };
  const observeRequestFailed = request => {
    if (prePinRequest && request === prePinRequest) {
      prePinRequestFailed = true;
    }
  };
  page.on("requestfinished", observeRequestFinished);
  page.on("requestfailed", observeRequestFailed);

  let capturedPrePin = false;
  const stateRouteHandler = async route => {
    if (route.request().method() !== "GET") return route.continue();
    if (!capturedPrePin) {
      capturedPrePin = true;
      prePinStarted = true;
      prePinRequest = route.request();
      try {
        const response = await route.fetch();
        prePinReceived = true;
        await prePinHold;
        await route.fulfill({ response });
      } catch (err) {
        prePinRequestFailed = true;
        throw err;
      } finally {
        prePinSettle();
      }
      return;
    }
    if (failPinStateRead) {
      return route.abort("failed");
    }
    return route.continue();
  };

  const prePinGate = {
    ready: () => expect.poll(() => prePinReceived).toBe(true),
    isFinished: () => prePinRequestFinished,
    isFailed: () => prePinRequestFailed,
    finished: async () => {
      await expect.poll(() => prePinRequestFinished || prePinRequestFailed).toBe(true);
      assert.equal(prePinRequestFailed, false, "Captured pre-pin request must complete successfully, not fail or abort");
      assert.equal(prePinRequestFinished, true, "Captured pre-pin request must finish");
    },
    release: () => prePinGateRelease(),
    dispose: async () => {
      prePinGateRelease();
      if (prePinStarted) await prePinSettled;
      await page.unroute(prePinPattern, stateRouteHandler);
      page.off("requestfinished", observeRequestFinished);
      page.off("requestfailed", observeRequestFailed);
    },
  };

  const pinPutHandler = async route => {
    if (route.request().method() === "PUT") {
      pinPutCount += 1;
      lastPinPayload = JSON.parse(route.request().postData() || "{}");
      const res = await route.fetch();
      failPinStateRead = true;
      return route.fulfill({ response: res });
    }
    return route.continue();
  };

  await page.route("**/api/preferences/groups", pinPutHandler);
  await page.route(prePinPattern, stateRouteHandler);

  try {
    // Initiate pre-pin genuine GET /state and wait until captured by completion gate
    await rowA.locator(".nav-item").click();
    await prePinGate.ready();

    // 1. Pin A: PUT succeeds, GET /state fails
    await pinBtnA.click();
    const pinWarningToast = page.locator(".action-toast:not([data-ending-style])").filter({ hasText: "could not refresh" });
    await expect(pinWarningToast).toHaveCount(1);
    assert.equal(pinPutCount, 1, "Initial pin must send exactly 1 PUT request");
    assert(lastPinPayload?.pinned?.includes(groupA.id), "PUT payload #1 must contain groupA");

    // Aborting the follow-up GET /state must not prematurely finish or fail the held pre-pin gate
    assert.equal(prePinGate.isFinished(), false, "Follow-up GET abort must not finish the pre-pin gate before release");
    assert.equal(prePinGate.isFailed(), false, "Follow-up GET abort must not mark the pre-pin gate as failed");

    // Baseline A is preserved in pinned section
    const pinnedSection = page.locator(".group-section[data-section-id='pinned']");
    await expect(pinnedSection.locator(`[data-group-id="${groupA.id}"]`)).toBeVisible();

    // Preference mutation controls are blocked during needsRefresh
    const rowB = page.locator(".group-row").filter({ hasText: groupB.name });
    await expect(rowB).toBeVisible();
    const pinBtnB = rowB.getByRole("button", { name: `Pin ${groupB.name}`, exact: true });
    await expect(pinBtnB).toBeDisabled();
    await expect(rowA.locator(".group-pin").first()).toBeDisabled();
    await expect(page.locator(".group-header-actions button[aria-label='Group options']")).toBeDisabled();
    await expect(pinnedSection.getByRole("button", { name: "Collapse Pinned", exact: true })).toBeDisabled();
    await expect(rowA.locator(".group-grip")).toBeDisabled();

    // Group navigation and retry refresh remain enabled and focusable for keyboard users
    const retryPinBtn = page.locator(".sidebar").getByRole("button", { name: "Retry refresh", exact: true });
    await expect(retryPinBtn).toBeVisible();
    await expect(retryPinBtn).toBeEnabled();
    await retryPinBtn.focus();
    await expect(retryPinBtn).toBeFocused();
    const navItemA = rowA.locator(".nav-item");
    await expect(navItemA).toBeEnabled();
    await navItemA.focus();
    await expect(navItemA).toBeFocused();

    // Announcement deduplication: live region must be empty while toast is active
    await expect(page.locator(".sidebar .sr-only")).toHaveText("");

    await dismissToasts();
    await expect(retryPinBtn).toBeVisible();
    await expect(page.locator(".sidebar .sr-only")).toHaveText("");

    // Verify gate remains unfinished prior to explicit release
    assert.equal(prePinGate.isFinished(), false, "Pre-pin gate must still be pending before release");

    // 2. Release held stale /state response and await completion gate
    prePinGate.release();
    await prePinGate.finished();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    // Assert baseline A remains preserved and mutation controls remain blocked
    await expect(pinnedSection.locator(`[data-group-id="${groupA.id}"]`)).toBeVisible();
    await expect(pinBtnB).toBeDisabled();
    await expect(rowA.locator(".group-pin").first()).toBeDisabled();
    await expect(page.locator(".group-header-actions button[aria-label='Group options']")).toBeDisabled();
    await expect(pinnedSection.getByRole("button", { name: "Collapse Pinned", exact: true })).toBeDisabled();
    await expect(retryPinBtn).toBeVisible();
    await expect(retryPinBtn).toBeEnabled();

    // 3. Hide and show sidebar through actual UI controls; verify recovery persists
    const edge = page.getByRole("separator", { name: "Resize main navigation", exact: true });
    await edge.click();
    const showBtn = page.getByRole("button", { name: "Show navigation", exact: true });
    if (await showBtn.isVisible().catch(() => false)) {
      await showBtn.click();
    } else {
      await expect(page.getByRole("button", { name: "Expand navigation", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Expand navigation", exact: true }).click();
    }
    await expect(page.locator(".sidebar:not(.rail)")).toBeVisible();

    // Verify after remount: baseline A visible, mutations locked, navigation and Retry refresh available
    const remountedPinnedSection = page.locator(".group-section[data-section-id='pinned']");
    await expect(remountedPinnedSection.locator(`[data-group-id="${groupA.id}"]`)).toBeVisible();
    const remountedRowA = page.locator(".group-row").filter({ hasText: groupA.name });
    const remountedRowB = page.locator(".group-row").filter({ hasText: groupB.name });
    const remountedPinBtnB = remountedRowB.getByRole("button", { name: `Pin ${groupB.name}`, exact: true });
    await expect(remountedPinBtnB).toBeDisabled();
    await expect(remountedRowA.locator(".group-pin").first()).toBeDisabled();
    await expect(page.locator(".group-header-actions button[aria-label='Group options']")).toBeDisabled();
    await expect(remountedPinnedSection.getByRole("button", { name: "Collapse Pinned", exact: true })).toBeDisabled();
    await expect(remountedRowA.locator(".group-grip")).toBeDisabled();

    const remountedRetryBtn = page.locator(".sidebar").getByRole("button", { name: "Retry refresh", exact: true });
    await expect(remountedRetryBtn).toBeVisible();
    await expect(remountedRetryBtn).toBeEnabled();
    await expect(remountedRowA.locator(".nav-item")).toBeEnabled();
    await expect(remountedRowB.locator(".nav-item")).toBeEnabled();

    // 4. Retry refresh executes GET only
    failPinStateRead = false;
    await remountedRetryBtn.click();
    const pinSuccessToast = page.locator(".action-toast:not([data-ending-style])").filter({ hasText: "Group preferences refreshed." });
    await expect(pinSuccessToast).toHaveCount(1);
    assert.equal(pinPutCount, 1, "Pin mutation count must remain 1 after retry refresh (GET only)");
    await expect(remountedRetryBtn).toHaveCount(0);

    // 5. After reconciliation, mutation controls are unblocked; pin Group B
    await dismissToasts();
    await expect(remountedPinBtnB).toBeEnabled();
    await remountedPinBtnB.click();
    const pinBToast = page.locator(".action-toast:not([data-ending-style])").filter({ hasText: `${groupB.name} pinned.` });
    await expect(pinBToast).toHaveCount(1);
    assert.equal(pinPutCount, 2, "Pin B must increment PUT count to exactly 2 without duplicating PUT A");
    assert(lastPinPayload?.pinned?.includes(groupA.id), "PUT payload #2 must retain acknowledged Pin A");
    assert(lastPinPayload?.pinned?.includes(groupB.id), "PUT payload #2 must include Pin B");

    // 6. Query backend to verify both groups are persisted with exactly 2 PUTs
    const backendState = await call("/state", undefined, "GET");
    assert(backendState.group_preferences.pinned.includes(groupA.id), "Backend must persist Group A in pinned");
    assert(backendState.group_preferences.pinned.includes(groupB.id), "Backend must persist Group B in pinned");

    await dismissToasts();
    proof.findings.push({
      finding: "D-GroupList",
      putCount: pinPutCount,
      retainedPinnedBaseline: true,
      staleStateResistant: true,
      sidebarHideShowPreserved: true,
      readOnlyRetry: true,
    });
  } finally {
    failPinStateRead = false;
    await prePinGate.dispose();
    await page.unroute("**/api/preferences/groups", pinPutHandler);
    await dismissToasts();
  }

  // =========================================================================
  // Finding 1: Cross-section recovery target independent of current tab
  // =========================================================================
  await page.context().addCookies([{ name: "ae_workspace", value: "default", url: base }]);
  const allAgents = (await call("/state", undefined, "GET")).agents.filter(a => !a.deleted_at);
  const targetAgent = allAgents[0];
  assert(targetAgent, "Expected at least one agent for cross-section test");
  await page.goto(`${base}/organization/agents/${targetAgent.id}/profile`);
  await expect(page.locator(".inspector")).toBeVisible();
  await page.getByRole("button", { name: "Code", exact: true }).click();

  const scriptScopeCheckbox = page.getByLabel("Agent-owned scripts");
  await expect(scriptScopeCheckbox).toBeVisible();
  if (!(await scriptScopeCheckbox.isChecked())) {
    await scriptScopeCheckbox.check();
  }
  const scriptNameInput = page.locator("#script-name");
  await expect(scriptNameInput).toBeVisible();
  const scriptTestName = `cross-test-${suffix}.ps1`;
  await scriptNameInput.fill(scriptTestName);
  await page.locator("textarea[aria-label='Script content']").fill('Write-Host "cross-section test"');

  let scriptPutCount = 0;
  let failScriptGet = false;
  let stateGetCount = 0;

  const scriptPutHandler = async route => {
    if (route.request().method() === "PUT") {
      scriptPutCount += 1;
      const res = await route.fetch();
      failScriptGet = true;
      return route.fulfill({ response: res });
    }
    return route.continue();
  };
  let scriptGetCallCount = 0;
  const scriptGetHandler = async route => {
    if (route.request().method() === "GET") {
      scriptGetCallCount += 1;
      if (failScriptGet) {
        return route.abort("failed");
      }
    }
    return route.continue();
  };
  const stateCounterHandler = async route => {
    if (route.request().method() === "GET") {
      stateGetCount += 1;
    }
    return route.continue();
  };

  await page.route(`**/api/agents/${targetAgent.id}/files*`, scriptGetHandler);
  await page.route(`**/api/agents/${targetAgent.id}/files`, scriptPutHandler);
  await page.route("**/api/state", stateCounterHandler);

  try {
    await page.getByRole("button", { name: "Save script", exact: true }).click();
    const scriptWarningToast = page.locator(".action-toast:not([data-ending-style])").filter({ hasText: "script saved, but the file list could not refresh" });
    await expect(scriptWarningToast).toHaveCount(1);

    await page.getByRole("button", { name: "Profile", exact: true }).click();
    const retryRefreshBtn = page.getByRole("button", { name: "Retry refresh", exact: true });
    await expect(retryRefreshBtn).toBeVisible();

    await dismissToasts();
    await expect(retryRefreshBtn).toBeVisible();

    // The backend emits a script.saved event upon save, triggering a debounced (350ms) SSE refresh.
    // Wait for that background notification to settle before asserting that clicking Retry refresh
    // exclusively invokes script file loading rather than state refresh.
    await page.waitForTimeout(500);

    const beforeStateGets = stateGetCount;
    const beforeScriptGets = scriptGetCallCount;
    await retryRefreshBtn.click();
    const failedRetryToast = page.locator(".action-toast:not([data-ending-style])").filter({ hasText: "The view could not refresh" });
    await expect(failedRetryToast).toHaveCount(1);
    await dismissToasts();
    await expect(retryRefreshBtn).toBeVisible();

    failScriptGet = false;
    await retryRefreshBtn.click();
    const refreshedToast = page.locator(".action-toast:not([data-ending-style])").filter({ hasText: "view refreshed" });
    await expect(refreshedToast).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Retry refresh", exact: true })).toHaveCount(0);

    assert.equal(scriptPutCount, 1, "Script save PUT count must remain 1 on retry");
    assert(scriptGetCallCount > beforeScriptGets, "Cross-section retry must invoke script file load");
    assert.equal(stateGetCount, beforeStateGets, "Cross-section retry from Profile must invoke script file load, NOT state refresh");
    proof.findings.push({ finding: "1-CrossSectionRecovery", scriptPutCount, targetPreserved: true });
  } finally {
    failScriptGet = false;
    await page.unroute(`**/api/agents/${targetAgent.id}/files*`, scriptGetHandler);
    await page.unroute(`**/api/agents/${targetAgent.id}/files`, scriptPutHandler);
    await page.unroute("**/api/state", stateCounterHandler);
    await dismissToasts();
  }

  // =========================================================================
  // Finding 2 / Item 4: Validate vs Attach workdir diagnosis & announcements
  // =========================================================================
  await page.goto(`${base}/organization/agents/${targetAgent.id}/profile`);
  await page.getByRole("button", { name: "Workdir", exact: true }).click();
  const workdirInput = page.locator("#workdir-path");
  const invalidPath = path.join(org, "nonexistent-dir-" + suffix);
  await workdirInput.fill(invalidPath);

  // 1. Explicit Validate workdir: exactly one announcement (role=alert), no toast, no banner
  await page.getByRole("button", { name: "Validate workdir", exact: true }).click();
  const diagValidate = page.locator(".workdir-diagnosis.error");
  await expect(diagValidate).toBeVisible();
  await expect(diagValidate).toHaveAttribute("role", "alert");
  await expect(diagValidate).toHaveAttribute("id", "workdir-diagnosis");
  await expect(workdirInput).toHaveAttribute("aria-describedby", "workdir-diagnosis");
  await expect(page.locator(".banner.error")).toHaveCount(0);
  await expect(page.locator(".action-toast:not([data-ending-style])")).toHaveCount(0);

  // Input change invalidates diagnosis
  await workdirInput.fill(invalidPath + "-probe");
  await expect(page.locator(".workdir-diagnosis")).toHaveCount(0);

  // 2. Attach workdir: toast is sole announcement; inline guidance has distinct detail; zero PUTs
  let attachPutCount = 0;
  const attachPutCounter = async route => {
    if (route.request().method() === "PUT" && route.request().url().includes(`/api/agents/${targetAgent.id}`)) {
      attachPutCount += 1;
    }
    return route.continue();
  };
  await page.route(`**/api/agents/${targetAgent.id}`, attachPutCounter);

  try {
    await page.getByRole("button", { name: /Attach workdir|Change workdir/, exact: true }).click();
    const attachToast = page.locator(".action-toast:not([data-ending-style])").filter({ hasText: "Attach failed: could not access directory" });
    await expect(attachToast).toHaveCount(1);

    const diagAttach = page.locator(".workdir-diagnosis.error");
    await expect(diagAttach).toBeVisible();
    await expect(diagAttach).not.toHaveAttribute("role", "alert");
    await expect(diagAttach).toContainText("Folder access probe:");
    assert.notEqual(await attachToast.innerText(), await diagAttach.innerText(), "Toast text and inline guidance must be distinct");

    await dismissToasts();
    // After toast dismissal: diagnosis remains readable, zero PUTs sent
    await expect(diagAttach).toBeVisible();
    assert.equal(attachPutCount, 0, "Attach probe failure must send zero profile PUT mutations");
    await expect(page.getByRole("button", { name: "Retry refresh", exact: true })).toHaveCount(0);
    proof.findings.push({ finding: "2-ValidateWorkdirIsolation", validateAnnouncement: 1, attachAnnouncement: 1, distinctProse: true, zeroPuts: true });
  } finally {
    await page.unroute(`**/api/agents/${targetAgent.id}`, attachPutCounter);
    await dismissToasts();
  }

  // =========================================================================
  // Finding 3 / Item 1: Workspace switch generation race with genuine held /tenants response
  // =========================================================================
  const wsA = await call("/tenants", { name: `RaceA ${suffix}` });
  const wsB = await call("/tenants", { name: `RaceB ${suffix}` });
  await page.context().addCookies([{ name: "ae_workspace", value: wsA.id, url: base }]);
  await page.goto(`${base}/settings/workspace`);
  await expect(page.locator(".settings-card h2").filter({ hasText: wsA.name })).toBeVisible();

  let releaseV1;
  const holdV1 = new Promise(resolve => { releaseV1 = resolve; });
  let markV1;
  const v1Arrived = new Promise(resolve => { markV1 = resolve; });
  let markV1Finished;
  const v1Finished = new Promise(resolve => { markV1Finished = resolve; });
  let interceptV1 = false;

  const tenantV1Handler = async route => {
    if (route.request().method() === "GET" && interceptV1) {
      interceptV1 = false;
      const res = await route.fetch();
      markV1();
      await holdV1;
      try {
        await route.fulfill({ response: res });
      } catch (err) {
        if (!/Route is already handled/i.test(err?.message ?? "")) throw err;
      } finally {
        markV1Finished();
      }
      return;
    }
    return route.continue();
  };
  await page.route("**/api/tenants", tenantV1Handler);

  try {
    const wsANameInput = page.locator("#workspace-name");
    await wsANameInput.fill(`RaceA-Renamed ${suffix}`);
    interceptV1 = true;
    await page.getByRole("button", { name: "Rename", exact: true }).click();
    await v1Arrived;

    // While V1 is held, switch to wsB via actual UI Workspace ValuePicker
    const switcher = page.locator(".workspace-switcher button[role='combobox']");
    await selectValue(switcher, wsB.id);
    await expect(page.locator(".settings-card h2").filter({ hasText: wsB.name })).toBeVisible();

    // Rename wsB in the same document
    const wsBNameInput = page.locator("#workspace-name");
    await wsBNameInput.fill(`RaceB-Renamed ${suffix}`);
    await page.getByRole("button", { name: "Rename", exact: true }).click();
    const toastB = page.locator(".action-toast:not([data-ending-style])").filter({ hasText: `RaceB-Renamed ${suffix}` });
    await expect(toastB).toHaveCount(1);

    // Verify ActionFeedbackProvider per-workspace isolation: switching workspace clears toast immediately
    await selectValue(switcher, wsA.id);
    await expect(page.locator(".action-toast:not([data-ending-style])")).toHaveCount(0);

    // Switch back to wsB
    await selectValue(switcher, wsB.id);
    await expect(page.locator(".settings-card h2").filter({ hasText: `RaceB-Renamed ${suffix}` })).toBeVisible();

    // Release V1: old setTenants must NOT overwrite active workspace B or trigger bootstrap dialog
    releaseV1();
    await v1Finished;
    await dismissToasts();
    await expect(page.locator(".settings-card h2").filter({ hasText: `RaceB-Renamed ${suffix}` })).toBeVisible();
    await expect(page.locator(".workspace-dialog")).toHaveCount(0);

    const checkTenants = await call("/tenants", undefined, "GET");
    assert.equal(checkTenants.find(t => t.id === wsA.id)?.name, `RaceA-Renamed ${suffix}`);
    assert.equal(checkTenants.find(t => t.id === wsB.id)?.name, `RaceB-Renamed ${suffix}`);

    // Test A -> B -> A with distinct member snapshots:
    // Intercept Snapshot 1 (owner only), add member to A while on B, switch back to A to load Snapshot 2,
    // release Snapshot 1, assert Snapshot 2 is not downgraded.
    let releaseMembersA;
    const holdMembersA = new Promise(resolve => { releaseMembersA = resolve; });
    let markMembersA;
    const membersAArrived = new Promise(resolve => { markMembersA = resolve; });
    let markMembersAFinished;
    const membersAFinished = new Promise(resolve => { markMembersAFinished = resolve; });
    let interceptMembersA = false;

    const membersAHandler = async route => {
      if (route.request().method() === "GET" && interceptMembersA) {
        interceptMembersA = false;
        const res = await route.fetch();
        markMembersA();
        await holdMembersA;
        try {
          await route.fulfill({ response: res });
        } catch (err) {
          if (!/Route is already handled/i.test(err?.message ?? "")) throw err;
        } finally {
          markMembersAFinished();
        }
        return;
      }
      return route.continue();
    };
    await page.route(`**/api/tenants/${wsA.id}/members`, membersAHandler);

    try {
      interceptMembersA = true;
      // Navigate to wsA: intercepts Snapshot 1 (owner only)
      await selectValue(switcher, wsA.id);
      await membersAArrived;

      // While Snapshot 1 is held, switch to wsB
      await selectValue(switcher, wsB.id);
      await expect(page.locator(".settings-card h2").filter({ hasText: `RaceB-Renamed ${suffix}` })).toBeVisible();

      // Add a real member to wsA via backend while user is on wsB
      const addedMemberUser = `@distinct_member_${suffix}:example.invalid`;
      await call(`/tenants/${wsA.id}/members`, { user: addedMemberUser, role: "member" });

      // Switch back to wsA: loads Snapshot 2 with addedMemberUser
      await selectValue(switcher, wsA.id);
      await expect(page.locator(".settings-card h2").filter({ hasText: `RaceA-Renamed ${suffix}` })).toBeVisible();
      await expect(page.locator(".settings-person").filter({ hasText: addedMemberUser })).toBeVisible();

      // NOW release held Snapshot 1: old response must NOT downgrade Snapshot 2
      releaseMembersA();
      await membersAFinished;

      // Assert added member is still visible and not downgraded
      await expect(page.locator(".settings-person").filter({ hasText: addedMemberUser })).toBeVisible();
      await expect(page.locator(".settings-people-error")).toHaveCount(0);
    } finally {
      releaseMembersA();
      await page.unroute(`**/api/tenants/${wsA.id}/members`, membersAHandler);
    }

    proof.findings.push({ finding: "3-WorkspaceSwitchGeneration", activeWorkspaceKept: wsB.id, sameDocumentSelection: true, distinctMemberSnapshotRetained: true });
  } finally {
    releaseV1();
    await page.unroute("**/api/tenants", tenantV1Handler);
    await dismissToasts();
    await page.context().addCookies([{ name: "ae_workspace", value: "default", url: base }]);
  }

  // =========================================================================
  // Finding 4 / Item 2: Delayed onCreated with real held POST response
  // =========================================================================
  await page.context().addCookies([{ name: "ae_workspace", value: "default", url: base }]);
  await page.goto(`${base}/organization`);
  await page.getByRole("button", { name: "Add agent", exact: true }).click();
  const lateDialog = page.getByRole("dialog", { name: "Add your agent", exact: true });
  await expect(lateDialog).toBeVisible();

  const lateAgentName = `Late Agent ${suffix}`;
  await lateDialog.locator("#agent-name").fill(lateAgentName);
  await lateDialog.locator("#agent-workdir").fill(org);

  let releaseLatePost;
  const holdLatePost = new Promise(resolve => { releaseLatePost = resolve; });
  let markLatePost;
  const latePostArrived = new Promise(resolve => { markLatePost = resolve; });
  let markLatePostFinished;
  const latePostFinished = new Promise(resolve => { markLatePostFinished = resolve; });
  let interceptLatePost = false;

  const latePostHandler = async route => {
    if (route.request().method() === "POST" && interceptLatePost) {
      interceptLatePost = false;
      const res = await route.fetch();
      markLatePost();
      await holdLatePost;
      try {
        await route.fulfill({ response: res });
      } catch (err) {
        if (!/Route is already handled/i.test(err?.message ?? "")) throw err;
      } finally {
        markLatePostFinished();
      }
      return;
    }
    return route.continue();
  };
  await page.route("**/api/agents", latePostHandler);

  try {
    interceptLatePost = true;
    await lateDialog.getByRole("button", { name: "Create agent", exact: true }).click();
    await latePostArrived;

    // Same-document route change while POST is in-flight: navigate away to chat
    await page.evaluate(() => {
      history.pushState(null, "", "/groups/general/chat");
      window.dispatchEvent(new Event("ae:navigate"));
    });
    await expect(page.getByRole("heading", { name: "General", exact: true })).toBeVisible();

    // Return to origin route /organization BEFORE releasing held POST response
    await page.evaluate(() => {
      history.pushState(null, "", "/organization");
      window.dispatchEvent(new Event("ae:navigate"));
    });
    await expect(page.getByRole("button", { name: "Add agent", exact: true })).toBeVisible();

    // NOW release held POST
    releaseLatePost();
    await latePostFinished;

    // Verify returning to origin route before release does not revive abandoned operation or hijack view
    await expect(page.locator(".inspector")).toHaveCount(0);
    await expect(page.locator(".action-toast:not([data-ending-style])")).toHaveCount(0);

    const createdAgent = (await call("/state", undefined, "GET")).agents.find(a => a.name === lateAgentName);
    assert(createdAgent, "Agent was committed by real backend");
    proof.findings.push({ finding: "4-NavigationGuardOnCreated", destinationPreserved: "General", returnBeforeReleaseSafe: true });
  } finally {
    releaseLatePost();
    await page.unroute("**/api/agents", latePostHandler);
    await dismissToasts();
  }

  // =========================================================================
  // Task 1.4: Selected-workspace UI operations and permission denial
  // =========================================================================
  await page.goto(`${base}/settings/workspace`);
  const uiWsName = `UI Workspace ${suffix}`;
  await page.locator("#new-workspace").fill(uiWsName);
  await page.getByRole("button", { name: "Create workspace", exact: true }).click();
  // Create switches to the new workspace: old scope results are suppressed per create/delete contract
  await expect(page.locator(".settings-card h2").filter({ hasText: uiWsName })).toBeVisible();
  await expect(page.locator(".action-toast:not([data-ending-style])")).toHaveCount(0);

  let uiWs = (await call("/tenants", undefined, "GET")).find(t => t.name === uiWsName);
  assert(uiWs, "UI workspace must be in tenants list");

  // Rename UI workspace
  const uiWsRename = `${uiWsName} Ed`;
  await page.locator("#workspace-name").fill(uiWsRename);
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  const renameToast = page.locator(".action-toast:not([data-ending-style])").filter({ hasText: `${uiWsRename}: workspace renamed.` });
  await expect(renameToast).toHaveCount(1);
  await dismissToasts();

  // Invite user in UI
  const inviteUser = `@tester_${suffix}:example.invalid`;
  await page.locator("#workspace-invite").fill(inviteUser);
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  const inviteToast = page.locator(".action-toast:not([data-ending-style])").filter({ hasText: `Invited ${inviteUser} to ${uiWsRename}.` });
  await expect(inviteToast).toHaveCount(1);
  await dismissToasts();

  const personRow = page.locator(".settings-person").filter({ hasText: inviteUser });
  await expect(personRow).toBeVisible();

  // Change role in UI
  await selectValue(personRow.locator("button[role='combobox']"), "owner");
  const roleToast = page.locator(".action-toast:not([data-ending-style])").filter({ hasText: `${inviteUser} is now owner.` });
  await expect(roleToast).toHaveCount(1);
  await dismissToasts();

  // Demote and Remove member in UI
  await selectValue(personRow.locator("button[role='combobox']"), "member");
  await dismissToasts();
  await personRow.getByRole("button", { name: "Remove", exact: true }).click();
  const removeToast = page.locator(".action-toast:not([data-ending-style])").filter({ hasText: `Removed ${inviteUser} from ${uiWsRename}.` });
  await expect(removeToast).toHaveCount(1);
  await dismissToasts();
  await expect(page.locator(".settings-person").filter({ hasText: inviteUser })).toHaveCount(0);

  // Delete workspace in UI
  await page.locator(".workspace-danger summary").click();
  page.once("dialog", d => d.accept());
  await page.locator(".workspace-danger").getByRole("button", { name: "Delete workspace", exact: true }).click();
  // Deleting workspace switches away: old scope toast is suppressed on workspace switch per contract
  await expect(page.locator(".action-toast:not([data-ending-style])")).toHaveCount(0);
  await expect(page.locator(".settings-card h2").filter({ hasText: uiWsRename })).toHaveCount(0);

  // Restore workspace in UI
  const deletedSection = page.locator(".settings-card").filter({ hasText: "Deleted workspaces" });
  await expect(deletedSection).toBeVisible();
  const deletedRow = deletedSection.locator(".settings-person").filter({ hasText: uiWsRename });
  await expect(deletedRow).toBeVisible();
  await deletedRow.getByRole("button", { name: "Restore", exact: true }).click();
  const restoreToast = page.locator(".action-toast:not([data-ending-style])").filter({ hasText: `${uiWsRename}: workspace restored.` });
  await expect(restoreToast).toHaveCount(1);
  await dismissToasts();

  const unauthenticatedRequest = await page.request.delete(`/api/tenants/${uiWs.id}`, { headers: { Cookie: "" } });
  assert.equal(unauthenticatedRequest.status(), 401, "Unauthenticated tenant mutation is denied with 401");

  // Authenticated unauthorized Matrix user test against local Synapse homeserver
  const matrixUser = "@matrix_member_test:matrix-invite.local";
  const matrixPass = "testpassword123";

  // Owner adds matrixUser as role="member" to uiWs
  await call(`/tenants/${uiWs.id}/members`, { user: matrixUser, role: "member" });

  // Create isolated browser context authenticated as matrixUser
  const memberContext = await page.context().browser().newContext({ baseURL: base });
  try {
    const memberPage = await memberContext.newPage();
    const loginRes = await memberPage.request.post("/api/login", {
      data: { username: "matrix_member_test", password: matrixPass }
    });
    assert.equal(loginRes.status(), 200, "Matrix login succeeds with 200");
    const loginData = await loginRes.json();
    assert.equal(loginData.user, matrixUser, "Authenticated Matrix user matches");

    // Select workspace uiWs
    await memberContext.addCookies([{ name: "ae_workspace", value: uiWs.id, url: base }]);

    // Attempt unauthorized tenant deletion as member
    const unauthDeleteRes = await memberPage.request.delete(`/api/tenants/${uiWs.id}`, { data: {} });
    assert.equal(unauthDeleteRes.status(), 403, "Member cannot delete tenant; returns HTTP 403 Forbidden");

    // Attempt unauthorized member invite as member
    const unauthInviteRes = await memberPage.request.post(`/api/tenants/${uiWs.id}/members`, {
      data: { user: `@intruder_${suffix}:matrix-invite.local`, role: "member" }
    });
    assert.equal(unauthInviteRes.status(), 403, "Member cannot invite; returns HTTP 403 Forbidden");

    // Verify SQLite data intact
    const checkWs = (await call("/tenants", undefined, "GET")).find(t => t.id === uiWs.id);
    assert(checkWs && !checkWs.deleted, "Tenant in SQLite must remain non-deleted");
    const checkMembers = await call(`/tenants/${uiWs.id}/members`, undefined, "GET");
    assert.equal(checkMembers.some(m => m.user.includes("intruder")), false, "Intruder must not be in SQLite members");

    // Verify member UI in browser: owner actions absent, member description rendered
    await memberPage.goto(`${base}/settings/workspace`);
    await expect(memberPage.locator(".settings-description")).toContainText("You are a member of this workspace. Its owner manages invitations, agents, and connected machines.");
    await expect(memberPage.locator(".workspace-danger")).toHaveCount(0);
    await expect(memberPage.locator("#workspace-name")).toHaveCount(0);
    await expect(memberPage.locator("#workspace-invite")).toHaveCount(0);
  } finally {
    await memberContext.close();
  }

  proof.findings.push({ finding: "1.4-WorkspaceUIOperations", create: true, rename: true, invite: true, role: true, remove: true, delete: true, restore: true, matrixMemberDenied: true });

  // =========================================================================
  // Task 1.3: Runtime registration and clipboard copy success/failure
  // =========================================================================
  await page.goto(`${base}/settings/runtime`);
  const runtimeName = `Clip-Runtime-${suffix}`;
  await page.locator("#runtime-name").fill(runtimeName);
  await page.getByRole("button", { name: "Register runtime", exact: true }).click();
  const regToast = page.locator(".action-toast:not([data-ending-style])").filter({ hasText: `${runtimeName} registered.` });
  await expect(regToast).toHaveCount(1);
  await dismissToasts();

  const tokenInput = page.locator(".runtime-token input[type='password']");
  await expect(tokenInput).toBeVisible();
  const tokenVal = await tokenInput.inputValue();
  assert(tokenVal.length > 10, "Expected enrollment token in masked input");

  // Clipboard success
  await page.evaluate(() => {
    window._copiedText = "";
    navigator.clipboard.writeText = async (t) => { window._copiedText = t; };
  });
  await page.getByRole("button", { name: "Copy token", exact: true }).click();
  const copyToast = page.locator(".action-toast:not([data-ending-style])").filter({ hasText: "Enrollment token copied to clipboard." });
  await expect(copyToast).toHaveCount(1);
  const recordedCopy = await page.evaluate(() => window._copiedText);
  assert.equal(recordedCopy, tokenVal, "Clipboard received masked enrollment token");
  await dismissToasts();

  // Clipboard failure (denied permission)
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => { throw new Error("Clipboard permission denied"); };
  });
  await page.getByRole("button", { name: "Copied", exact: true }).click();
  const copyFailToast = page.locator(".action-toast:not([data-ending-style])").filter({ hasText: "Could not copy the enrollment token. Select the token field and copy it manually." });
  await expect(copyFailToast).toHaveCount(1);
  const failToastText = await copyFailToast.innerText();
  assert(!failToastText.includes(tokenVal), "Failure toast must NOT leak raw enrollment token");

  // After failure toast dismissal: manual token input remains visible, populated, and accessible
  await dismissToasts();
  await expect(tokenInput).toBeVisible();
  assert.equal(await tokenInput.inputValue(), tokenVal, "Token input remains populated for manual copy");

  proof.findings.push({ finding: "1.3-RuntimeClipboard", copySuccess: true, copyFailureRetained: true, maskedInput: true, tokenNotLeakedInToast: true });
  proof.clipboardMockBoundary = "navigator.clipboard.writeText mocked in browser page context to verify failure path and non-leaking toast";

  // =========================================================================
  // Finding 4.2: Profile save response loss, draft editing, and read-only recovery
  // =========================================================================
  await page.goto(`${base}/groups/general/chat`);
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Profile", exact: true }).click();
  const profileInput = page.locator("#account-display-name");
  await expect(profileInput).toBeVisible();

  const nameA = `NameA_${suffix}`;
  const nameB = `NameB_${suffix}`;

  let profilePutCount = 0;
  let failProfileResponse = false;
  const profilePutHandler = async route => {
    if (route.request().method() === "PUT" && route.request().url().includes("/api/me/profile")) {
      profilePutCount += 1;
      const res = await route.fetch();
      if (failProfileResponse) {
        return route.abort("failed");
      }
      return route.fulfill({ response: res });
    }
    return route.continue();
  };

  await page.route("**/api/me/profile", profilePutHandler);

  failProfileResponse = true;
  await profileInput.fill(nameA);
  await page.getByRole("button", { name: "Save profile", exact: true }).click();

  const saveFailToast = page.locator(".action-toast:not([data-ending-style])").filter({ hasText: "Could not save profile" });
  await expect(saveFailToast).toHaveCount(1);
  assert.equal(profilePutCount, 1, "PUT committed to backend SQLite");

  await profileInput.fill(nameB);

  const checkProfileBtn = page.getByRole("button", { name: "Check saved profile", exact: true });
  await expect(checkProfileBtn).toBeVisible();

  const preCheckPuts = profilePutCount;
  await checkProfileBtn.click();

  const recoveryToast = page.locator(".action-toast:not([data-ending-style])").filter({ hasText: `Saved display name is: "${nameA}"` });
  await expect(recoveryToast).toHaveCount(1);
  await expect(recoveryToast).toContainText(`Your unsaved draft "${nameB}" is retained`);

  assert.equal(await profileInput.inputValue(), nameB, "Draft input must remain B, not overwritten by saved A");

  const meState = await call("/me", undefined, "GET");
  assert.equal(meState.display_name, nameA, "Backend has saved name A");
  assert.equal(profilePutCount, preCheckPuts, "Check saved profile issued zero PUT mutations (GET only)");

  await dismissToasts();
  await page.unroute("**/api/me/profile", profilePutHandler);
  proof.findings.push({ finding: "4.2-ProfileDraftRecovery", putCount: profilePutCount, retainedDraft: true, readOnlyCheck: true });

  // =========================================================================
  // Zero provider runs assertion
  // =========================================================================
  // Restore default workspace cookie
  await page.context().addCookies([{ name: "ae_workspace", value: "default", url: base }]);
  const finalRuns = (await call("/state", undefined, "GET")).runs.length;
  assert.equal(finalRuns, initialRuns, "Review checks must execute zero provider tasks");
  proof.providerTasksStarted = 0;
  proof.zeroProviderRuns = true;

  if (directory) {
    await writeFile(path.join(directory, "action-feedback-review.json"), JSON.stringify(proof, null, 2));
  }

  return proof;
}
