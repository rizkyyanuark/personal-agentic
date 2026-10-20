import { expectValue, readValue, selectValue } from "./value-picker.mjs";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect as playwrightExpect } from "@playwright/test";

const expect = playwrightExpect.configure({ timeout: 30000 });

export async function verifyActionFeedbackAccessibility({ page, call, state, org, directory, base }) {
  assert(org && base && process.env.AE_TEST_DISPOSABLE === "true", "Use an explicitly disposable authenticated candidate");
  const initial = await state();
  const template = initial.agents.find(value => !value.deleted_at);
  assert(template, "A real initial agent is required");
  const suffix = crypto.randomUUID().slice(0, 8);
  const agent = await call("/agents", { ...template, id: "", runtime_id: undefined, name: `Feedback accessibility ${suffix}`, position: "Feedback verifier", project_id: null, reports_to: null, instructions: "ACCESSIBILITY_BASELINE", agents_md: "", workdir: null, model: "", reasoning: "", timeout_seconds: 90, enabled: false });
  const originalViewport = page.viewportSize();
  const proof = { agentId: agent.id, layouts: [], injectedFaults: ["Held genuine successful profile responses to inspect pending states and SPA transitions"], screenshots: [] };
  let serial = 0;

  async function heldResponse(target, method, pathname) {
    let release;
    let received = false;
    let responseStatus;
    let abortedByNavigation = false;
    let finished = false;
    let allowNavigationAbort = false;
    let started = false;
    let settledState = false;
    let settle;
    const hold = new Promise(resolve => { release = resolve; });
    const settled = new Promise(resolve => { settle = () => { settledState = true; resolve(); }; });
    const pattern = `**${pathname}`;
    const observeFinished = request => { if (request.method() === method && new URL(request.url()).pathname === pathname) finished = true; };
    target.on("requestfinished", observeFinished);
    target.on("requestfailed", observeFinished);
    const handler = async route => {
      if (route.request().method() !== method) return route.continue();
      started = true;
      try {
        const response = await route.fetch();
        responseStatus = response.status();
        received = true;
        await hold;
        try { await route.fulfill({ response }); }
        catch (error) {
          if (!allowNavigationAbort) throw error;
          abortedByNavigation = true;
        }
      } finally { settle(); }
    };
    await target.route(pattern, handler);
    return {
      ready: () => expect.poll(() => received).toBe(true),
      status: () => responseStatus,
      aborted: () => abortedByNavigation,
      finished: () => expect.poll(() => finished || (allowNavigationAbort && settledState)).toBe(true),
      allowNavigationAbort: () => { allowNavigationAbort = true; },
      release: () => release(),
      dispose: async () => { release(); if (started) await settled; await target.unroute(pattern, handler); target.off("requestfinished", observeFinished); target.off("requestfailed", observeFinished); },
    };
  }
  const holdAgentResponse = target => heldResponse(target, "PUT", `/api/agents/${agent.id}`);
  async function openInstructions(target) {
    await target.goto(new URL(`/organization/agents/${agent.id}/instructions`, base).href);
    await expect(target.locator(".inspector")).toBeVisible({ timeout: 45000 });
    const editor = target.getByLabel("Role and task instructions");
    await expect(editor).toBeVisible({ timeout: 45000 });
    return editor;
  }
  async function openGeneral(target) {
    const toggle = target.getByRole("button", { name: "Show navigation", exact: true });
    if (await toggle.isVisible()) await toggle.click();
    const general = target.locator('.group-row[data-group-id="general"] .nav-item');
    await expect(general).toBeVisible();
    await general.click();
    await expect(target.getByRole("textbox", { name: "Message", exact: true })).toBeVisible();
  }
  async function clearToasts(target) {
    const dismiss = target.locator(".action-toast:not([data-ending-style]):not([data-limited]) .action-toast-close");
    while (await dismiss.count()) await dismiss.first().click();
    await expect(target.locator(".action-toast")).toHaveCount(0);
  }
  async function screenshot(target, name) {
    await target.screenshot({ path: path.join(directory, name), fullPage: true, animations: "disabled" });
    proof.screenshots.push(name);
  }
  async function toastScenario(target, label, reducedMotion = false) {
    console.log(`ACCESSIBILITY: [${label}] clearToasts`);
    await clearToasts(target);
    console.log(`ACCESSIBILITY: [${label}] openInstructions`);
    const editor = await openInstructions(target);
    const marker = `ACCESSIBILITY_${label}_${++serial}`;
    console.log(`ACCESSIBILITY: [${label}] fill editor with ${marker}`);
    await editor.fill(marker);
    const save = target.getByRole("button", { name: "Save changes", exact: true });
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeInViewport();
    console.log(`ACCESSIBILITY: [${label}] holdAgentResponse`);
    const gate = await holdAgentResponse(target);
    try {
      console.log(`ACCESSIBILITY: [${label}] click save`);
      await save.click();
      console.log(`ACCESSIBILITY: [${label}] waiting gate.ready()`);
      await gate.ready();
      assert.equal(gate.status(), 200);
      await expect(target.getByRole("button", { name: "Saving…", exact: true })).toHaveAttribute("aria-busy", "true");
      const pendingMotion = await target.locator(".action-pending-icon").first().evaluate(element => ({ animation: getComputedStyle(element).animationName, duration: getComputedStyle(element).animationDuration }));
      if (reducedMotion) assert.equal(pendingMotion.animation, "none");
      await screenshot(target, `action-feedback-${label}-pending.png`);
      console.log(`ACCESSIBILITY: [${label}] close settings`);
      await target.getByRole("button", { name: "Close agent settings", exact: true }).click();
      console.log(`ACCESSIBILITY: [${label}] openGeneral`);
      await openGeneral(target);
      const composer = target.getByRole("textbox", { name: "Message", exact: true });
      await composer.focus();
      console.log(`ACCESSIBILITY: [${label}] releasing gate`);
      gate.release();
      const toast = target.locator(".action-toast").filter({ hasText: `${agent.name}: changes saved.` });
      await expect(toast).toHaveCount(1);
      await expect(toast).toBeVisible();
      await expect(composer).toBeFocused();
      await toast.hover();
      const metrics = await toast.evaluate(element => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return { x: box.x, y: box.y, width: box.width, height: box.height, transitionDuration: style.transitionDuration, transform: style.transform, viewport: { width: innerWidth, height: innerHeight }, documentWidth: document.documentElement.scrollWidth };
      });
      assert(metrics.x >= -1 && metrics.x + metrics.width <= metrics.viewport.width + 1);
      assert(metrics.y >= -1 && metrics.y + metrics.height <= metrics.viewport.height + 1);
      assert(metrics.documentWidth <= metrics.viewport.width + 1, "Feedback must not cause horizontal overflow");
      const composerBox = await composer.boundingBox();
      assert(composerBox, "Composer remains available");
      assert(metrics.y + metrics.height <= composerBox.y || composerBox.y + composerBox.height <= metrics.y || metrics.x + metrics.width <= composerBox.x || composerBox.x + composerBox.width <= metrics.x, "Toast must not cover the active composer");
      if (reducedMotion) {
        assert(metrics.transitionDuration.split(",").every(value => Number.parseFloat(value) === 0));
        assert.equal(metrics.transform, "none");
        assert.equal(await toast.locator(".action-result-icon").evaluate(element => getComputedStyle(element).animationName), "none");
      } else {
        assert(metrics.transitionDuration.split(",").every(value => { const seconds = Number.parseFloat(value); return seconds >= 0.2 && seconds <= 0.3; }));
      }
      assert.equal(await target.locator('.inspector .action-status-area [role="status"]').filter({ hasText: `${agent.name}: changes saved.` }).count(), 0, "Closed editor cannot duplicate the toast announcement");
      await screenshot(target, `action-feedback-${label}-toast.png`);
      if (label === "desktop") {
        await target.waitForTimeout(5500);
        await expect(toast).toBeVisible();
      }
      await target.keyboard.press("F6");
      await expect.poll(() => toast.evaluate(element => element.closest(".action-toast-viewport")?.contains(document.activeElement))).toBe(true);
      await target.keyboard.press("Tab");
      await expect(toast).toBeFocused();
      await target.keyboard.press("Tab");
      await expect(toast.getByRole("button", { name: "Dismiss notification", exact: true })).toBeFocused();
      if (label === "desktop") {
        await target.mouse.move(composerBox.x + Math.min(10, composerBox.width / 2), composerBox.y + Math.min(10, composerBox.height / 2));
        await target.waitForTimeout(5500);
        await expect(toast).toBeVisible();
        await expect(toast.getByRole("button", { name: "Dismiss notification", exact: true })).toBeFocused();
        proof.successTimeoutPause = { hoverMilliseconds: 5500, keyboardFocusMilliseconds: 5500, hoverPaused: true, focusPausedWithoutHover: true };
      }
      await target.keyboard.press("Enter");
      await expect(toast).toHaveCount(0);
      proof.layouts.push({ label, reducedMotion, pendingMotion, metrics, noFocusSteal: true, keyboardDismissed: true, composerClear: true, resultAnnouncements: 1 });
    } finally { await gate.dispose(); }
  }

  async function boundedErrorStack() {
    await clearToasts(page);
    const agents = [];
    for (let index = 0; index < 4; index++) {
      agents.push(await call("/agents", { ...agent, id: "", name: `Feedback stack ${suffix} ${index + 1}`, timeout_seconds: 90, enabled: false }));
    }
    await page.goto(new URL("/organization", base).href);
    for (let index = 0; index < agents.length; index++) {
      const current = agents[index];
      const configureBtn = page.getByRole("button", { name: `Configure ${current.name}`, exact: true });
      await expect(configureBtn).toBeAttached();
      await configureBtn.dispatchEvent("click");
      await page.getByRole("button", { name: "Profile", exact: true }).click();
      await page.getByLabel("Run timeout (seconds)").fill("5");
      const gate = await heldResponse(page, "PUT", `/api/agents/${current.id}`);
      try {
        await page.getByRole("button", { name: "Save changes", exact: true }).click();
        await gate.ready();
        assert.equal(gate.status(), 400, "Use the real timeout-validation rejection");
        await page.getByRole("button", { name: "Close agent settings", exact: true }).dispatchEvent("click");
        gate.release();
        await gate.finished();
        await expect(page.locator(".action-toast:not([data-ending-style])")).toHaveCount(index + 1);
      } finally { await gate.dispose(); }
    }
    const roots = page.locator(".action-toast:not([data-ending-style])");
    const visible = page.locator(".action-toast:not([data-ending-style]):not([data-limited])");
    await expect(roots).toHaveCount(4);
    await expect(visible).toHaveCount(3);
    await expect(page.locator(".action-toast[data-limited]")).toHaveCount(1);
    await expect(page.locator(".action-toast[data-limited]")).toBeHidden();
    await visible.first().hover();
    await expect(page.locator(".action-toast[data-expanded]:not([data-ending-style]):not([data-limited])")).toHaveCount(3);
    await expect.poll(async () => visible.evaluateAll(elements => {
      const boxes = elements.map(element => element.getBoundingClientRect()).sort((a, b) => a.top - b.top);
      return boxes.every((box, index) => index === 0 || box.top >= boxes[index - 1].bottom - 0.5);
    })).toBe(true);
    const expanded = await visible.evaluateAll(elements => elements.map(element => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    }));
    for (let index = 0; index < await visible.count(); index++) {
      await expect(visible.nth(index).getByRole("button", { name: "Dismiss notification", exact: true })).toBeVisible();
      await expect(visible.nth(index).getByRole("button", { name: "Dismiss notification", exact: true })).toBeEnabled();
    }
    await screenshot(page, "action-feedback-bounded-error-stack.png");
    await visible.first().getByRole("button", { name: "Dismiss notification", exact: true }).click();
    await expect(roots).toHaveCount(3);
    await expect(visible).toHaveCount(3);
    await expect(page.locator(".action-toast[data-limited]")).toHaveCount(0);
    await clearToasts(page);
    const persisted = await state();
    for (const current of agents) {
      const saved = persisted.agents.find(value => value.id === current.id);
      assert(saved && saved.timeout_seconds === 90 && saved.revision === current.revision, "Rejected stack requests cannot change saved profiles");
    }
    proof.boundedStack = { agentIds: agents.map(value => value.id), realRejections: 4, responseStatus: 400, totalNotifications: 4, visibleLimit: 3, expandedBoxes: expanded, limitedNotificationBecameAccessibleAfterDismissal: true, allDismissed: true, profilesUnchanged: true };
    proof.injectedFaults.push("Held four genuine timeout-validation HTTP 400 responses until their respective editors closed; forwarded original status and body");
  }

  try {
    for (const viewport of [{ width: 1440, height: 1000, label: "desktop" }, { width: 390, height: 844, label: "mobile-390" }, { width: 844, height: 390, label: "landscape" }]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await toastScenario(page, viewport.label);
    }
    await page.setViewportSize({ width: 390, height: 480 });
    await toastScenario(page, "mobile-reduced-height");
    proof.reducedHeightNote = "390x480 is a real resized browser viewport with the composer focused, modeling reduced available height; no native mobile software keyboard was emulated.";
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await toastScenario(page, "reduced-motion", true);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    console.log("ACCESSIBILITY: starting boundedErrorStack");
    await boundedErrorStack();
    console.log("ACCESSIBILITY: completed boundedErrorStack");

    console.log("ACCESSIBILITY: starting browser-zoom-200");
    const profileRoot = path.resolve(directory);
    const profile = await mkdtemp(path.join(profileRoot, "action-feedback-zoom-profile-"));
    assert(profile.startsWith(profileRoot + path.sep));
    let zoomContext;
    try {
      const zoomValue = Math.log(2) / Math.log(1.2);
      const host = new URL(base).host;
      const hostname = new URL(base).hostname;
      const hexDefault = Buffer.from("Default").toString("hex");
      const defaultZoomDict = {
        x: zoomValue,
        "": zoomValue,
        "0": zoomValue,
        [hexDefault]: zoomValue,
        ["x" + hexDefault]: zoomValue,
      };
      const perHostDict = {
        [host]: { zoom_level: zoomValue, last_modified: "13300000000000000" },
        [hostname]: { zoom_level: zoomValue, last_modified: "13300000000000000" },
        "localhost": { zoom_level: zoomValue, last_modified: "13300000000000000" },
        "127.0.0.1": { zoom_level: zoomValue, last_modified: "13300000000000000" },
      };
      const preferences = {
        partition: {
          default_zoom_level: defaultZoomDict,
          per_host_zoom_levels: {
            x: perHostDict,
            "": perHostDict,
            "0": perHostDict,
            [hexDefault]: perHostDict,
            ["x" + hexDefault]: perHostDict,
          },
        },
      };
      await mkdir(path.join(profile, "Default"), { recursive: true });
      await writeFile(path.join(profile, "Default", "Preferences"), JSON.stringify(preferences));
      await writeFile(path.join(profile, "Preferences"), JSON.stringify(preferences));
      zoomContext = await chromium.launchPersistentContext(profile, { baseURL: base, ...(process.env.AE_TEST_BROWSER_EXECUTABLE ? { executablePath: process.env.AE_TEST_BROWSER_EXECUTABLE } : { channel: "msedge" }), headless: true, viewport: { width: 1440, height: 1000 }, args: ["--window-size=1440,1000"] });
      await zoomContext.addCookies(await page.context().cookies(base));
      const zoomPage = zoomContext.pages()[0] ?? await zoomContext.newPage();
      try {
        const client = await zoomContext.newCDPSession(zoomPage);
        await client.send("Page.setZoomFactor", { zoomFactor: 2 });
      } catch {}
      console.log("ACCESSIBILITY: browser-zoom-200 openInstructions");
      await openInstructions(zoomPage);
      const zoom = await zoomPage.evaluate(() => ({ innerWidth, outerWidth, devicePixelRatio, visualViewportScale: visualViewport?.scale ?? null, cssZoom: getComputedStyle(document.documentElement).zoom }));
      assert(zoom.devicePixelRatio >= 1.9 && zoom.devicePixelRatio <= 2.1, `Native 200% browser zoom must produce DPR near 2; actual ${JSON.stringify(zoom)}`);
      assert(zoom.innerWidth >= 690 && zoom.innerWidth <= 750, "Native browser zoom must halve the configured 1440px viewport");
      assert(zoom.visualViewportScale === 1 && ["1", "normal"].includes(zoom.cssZoom), "This proof uses browser zoom, not CSS zoom or pinch scaling");
      console.log("ACCESSIBILITY: browser-zoom-200 toastScenario");
      await toastScenario(zoomPage, "browser-zoom-200");
      console.log("ACCESSIBILITY: browser-zoom-200 toastScenario completed");
      proof.browserZoom = { setting: "Chromium isolated-profile partition.default_zoom_level", factor: 2, metrics: zoom, cssZoomUsed: false, pinchZoomUsed: false };
    } finally {
      if (zoomContext) await zoomContext.close();
      assert(profile.startsWith(profileRoot + path.sep));
      await rm(profile, { recursive: true, force: true });
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    console.log("ACCESSIBILITY: creating tenant for workspace isolation");
    const tenant = await call("/tenants", { name: `Feedback isolation ${suffix}` });
    console.log("ACCESSIBILITY: opening instructions");
    const workspaceEditor = await openInstructions(page);
    const selected = await readValue(page.getByRole("combobox", { name: "Workspace", exact: true }));
    await workspaceEditor.fill("ACCESSIBILITY_PENDING_WORKSPACE_CHANGE");
    const saveBtn = page.getByRole("button", { name: "Save changes", exact: true });
    await saveBtn.scrollIntoViewIfNeeded();
    const workspaceGate = await holdAgentResponse(page);
    workspaceGate.allowNavigationAbort();
    try {
      console.log("ACCESSIBILITY: clicking save changes");
      await saveBtn.click();
      console.log("ACCESSIBILITY: waiting workspaceGate.ready()");
      await workspaceGate.ready();
      console.log("ACCESSIBILITY: workspaceGate is ready, status:", workspaceGate.status());
      assert.equal(workspaceGate.status(), 200);
      console.log("ACCESSIBILITY: selecting workspace tenant:", tenant.id);
      await selectValue(page.getByRole("combobox", { name: "Workspace", exact: true }), tenant.id);
      await expectValue(page.getByRole("combobox", { name: "Workspace", exact: true }), tenant.id);
      await expect(page.getByRole("heading", { name: "General", exact: true })).toBeVisible();
      const scopedUrl = page.url();
      console.log("ACCESSIBILITY: releasing workspaceGate");
      workspaceGate.release();
      console.log("ACCESSIBILITY: waiting workspaceGate.finished()");
      await workspaceGate.finished();
      console.log("ACCESSIBILITY: workspaceGate finished");
      await expect.poll(() => page.locator(".action-pending-icon").count()).toBe(0);
      await expect(page.locator(".action-toast")).toHaveCount(0);
      await expect(page.locator(".action-status-area").filter({ hasText: agent.name })).toHaveCount(0);
      assert.equal(page.url(), scopedUrl, "Old workspace completion cannot navigate the new workspace");
      const nextState = await state();
      assert(!nextState.agents.some(value => value.id === agent.id));
      await selectValue(page.getByRole("combobox", { name: "Workspace", exact: true }), selected);
      await expectValue(page.getByRole("combobox", { name: "Workspace", exact: true }), selected);
      assert.equal((await state()).agents.find(value => value.id === agent.id).instructions, "ACCESSIBILITY_PENDING_WORKSPACE_CHANGE");
      proof.workspaceIsolation = { source: selected, target: tenant.id, responseStatus: workspaceGate.status(), oldResultSuppressed: true, oldNavigationSuppressed: true, mutationPersistedInSourceOnly: true };
    } finally { await workspaceGate.dispose(); }

    console.log("ACCESSIBILITY: starting side chat isolation");
    await openGeneral(page);
    await page.getByRole("textbox", { name: "Message", exact: true }).fill("/btw");
    const sideChatGate = await heldResponse(page, "POST", "/api/messages");
    sideChatGate.allowNavigationAbort();
    try {
      console.log("ACCESSIBILITY: clicking send message /btw");
      await page.getByRole("button", { name: "Send message", exact: true }).click();
      console.log("ACCESSIBILITY: waiting sideChatGate.ready()");
      await sideChatGate.ready();
      console.log("ACCESSIBILITY: sideChatGate ready, status:", sideChatGate.status());
      assert.equal(sideChatGate.status(), 200);
      console.log("ACCESSIBILITY: switching workspace to tenant");
      await selectValue(page.getByRole("combobox", { name: "Workspace", exact: true }), tenant.id);
      await expectValue(page.getByRole("combobox", { name: "Workspace", exact: true }), tenant.id);
      await expect(page.getByRole("heading", { name: "General", exact: true })).toBeVisible();
      const scopedUrl = page.url();
      console.log("ACCESSIBILITY: releasing sideChatGate");
      sideChatGate.release();
      console.log("ACCESSIBILITY: waiting sideChatGate.finished()");
      await sideChatGate.finished();
      console.log("ACCESSIBILITY: sideChatGate finished");
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(page.url(), scopedUrl, "Old /btw response cannot navigate the new workspace to its side chat");
      await expect(page.locator(".action-toast")).toHaveCount(0);
      await selectValue(page.getByRole("combobox", { name: "Workspace", exact: true }), selected);
      await expectValue(page.getByRole("combobox", { name: "Workspace", exact: true }), selected);
      const sideChats = await call("/groups/general/messages", undefined, "GET");
      assert(sideChats.some(value => value.command === "btw" && value.body === "/btw" && value.side_chat_id));
      proof.workspaceNavigationIsolation = { command: "Empty /btw without recipients", responseStatus: sideChatGate.status(), sourceMessagePersisted: true, oldNavigationSuppressed: true, providerTasksStarted: 0 };
    } finally { await sideChatGate.dispose(); }

    console.log("ACCESSIBILITY: starting logout isolation");
    const logoutEditor = await openInstructions(page);
    await logoutEditor.fill("ACCESSIBILITY_PENDING_LOGOUT");
    const logoutSaveBtn = page.getByRole("button", { name: "Save changes", exact: true });
    await logoutSaveBtn.scrollIntoViewIfNeeded();
    const logoutGate = await holdAgentResponse(page);
    logoutGate.allowNavigationAbort();
    try {
      console.log("ACCESSIBILITY: clicking save changes for logout");
      await logoutSaveBtn.click();
      console.log("ACCESSIBILITY: waiting logoutGate.ready()");
      await logoutGate.ready();
      console.log("ACCESSIBILITY: logoutGate ready, status:", logoutGate.status());
      assert.equal(logoutGate.status(), 200);
      logoutGate.allowNavigationAbort();
      console.log("ACCESSIBILITY: clicking sign out");
      const directSignOut = page.getByRole("button", { name: "Sign out", exact: true });
      if (await directSignOut.isVisible().catch(() => false)) {
        await directSignOut.click();
      } else {
        await page.getByRole("button", { name: "Account menu", exact: true }).click();
        await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
      }
      const adminHeading = page.getByRole("heading", { name: "Administrator sign in", exact: true });
      const welcomeHeading = page.getByRole("heading", { name: "Welcome back", exact: true });
      await expect(adminHeading.or(welcomeHeading)).toBeVisible();
      if (await welcomeHeading.isVisible()) {
        await page.getByRole("button", { name: "Administrator sign in", exact: true }).click();
        await expect(adminHeading).toBeVisible();
      }
      console.log("ACCESSIBILITY: releasing logoutGate");
      logoutGate.release();
      console.log("ACCESSIBILITY: waiting logoutGate.finished()");
      await logoutGate.finished();
      console.log("ACCESSIBILITY: logoutGate finished");
      await expect(page.locator(".action-toast")).toHaveCount(0);
      await expect(page.locator(".action-status-area")).toHaveCount(0);
      await screenshot(page, "action-feedback-pending-logout.png");
      const ownerKey = (await readFile(path.join(org, ".state", "owner.key"), "utf8")).trim();
      await page.getByLabel("Owner key", { exact: true }).fill(ownerKey);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page.getByRole("combobox", { name: "Workspace", exact: true })).toBeVisible();
      assert.equal((await state()).agents.find(value => value.id === agent.id).instructions, "ACCESSIBILITY_PENDING_LOGOUT");
      proof.logoutIsolation = { responseStatus: logoutGate.status(), privateResultSuppressed: true, realLogoutReload: true, ownerKeyStayedInCandidate: true };
    } finally { await logoutGate.dispose(); }
    assert.equal((await state()).runs.length, initial.runs.length, "Accessibility feedback proof starts no provider tasks");
    proof.providerTasksStarted = 0;
    await writeFile(path.join(directory, "action-feedback-accessibility.json"), JSON.stringify(proof, null, 2));
    return proof;
  } finally {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    if (originalViewport) await page.setViewportSize(originalViewport);
  }
}
