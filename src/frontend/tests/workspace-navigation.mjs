import assert from "node:assert/strict";
import { mkdir, writeFile, rm, readFile, mkdtemp } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { chromium, expect as playwrightExpect } from "@playwright/test";

const expect = playwrightExpect.configure({ timeout: 30000 });

export async function verifyWorkspaceNavigation({ page, request, call, state, until, finished, org, directory, base, noProvider }) {
  assert(process.env.AE_TEST_ORG && path.resolve(org) !== path.resolve("../../org"), "Use a disposable organization");
  page.setDefaultTimeout(15000);
  const prefs = async () => (await state()).group_preferences;
  const stale = (await state()).groups.filter((g) => ["Alpha", "Zulu", "Archive me", "Hidden deleted group"].includes(g.name));
  for (const g of stale) {
    if (!g.deleted_at) await call(`/groups/${g.id}`, undefined, "DELETE");
  }
  await call("/preferences/groups", { order: [], pinned: [], sections: [], collapsed: [], sort: "custom" }, "PUT");
  await call("/preferences/panels", { sidebar: 240 }, "PUT");
  const create = (name) => call("/groups", { id: "", name, description: "Workspace navigation verification" });
  const alpha = await create("Alpha"), zulu = await create("Zulu"), archived = await create("Archive me"), deleted = await create("Hidden deleted group");
  await call(`/groups/${archived.id}/archive`);
  await call(`/groups/${deleted.id}`, undefined, "DELETE");
  await page.reload();
  const options = page.getByRole("button", { name: "Group options", exact: true });
  const sort = async (name) => {
    await options.click();
    const response = page.waitForResponse(r => r.request().method() === "PUT" && new URL(r.url()).pathname === "/api/preferences/groups");
    await page.getByRole("menuitem", { name, exact: true }).click();
    const saved = await response;
    assert(saved.ok(), `Sort ${name}: ${saved.status()} ${await saved.text()}`);
    await expect(options, `Sort ${name} must finish its acknowledged refresh`).toBeEnabled();
  };
  const relevantIds = [alpha.id, "general", zulu.id];
  const order = async () => {
    const rows = await page.locator(".group-row").all();
    const result = [];
    for (const row of rows) {
      const gid = await row.getAttribute("data-group-id");
      if (relevantIds.includes(gid)) {
        result.push(await row.locator(".nav-item").textContent());
      }
    }
    return result;
  };
  await expect(page.getByRole("combobox", { name: "Sort groups", exact: true })).toHaveCount(0);
  await sort("A-Z"); await expect.poll(order).toEqual(["Alpha", "General", "Zulu"]);
  await sort("Z-A"); await expect.poll(order).toEqual(["Zulu", "General", "Alpha"]);
  await page.getByRole("button", { name: "Pin Alpha", exact: true }).click();
  await expect.poll(order).toEqual(["Alpha", "Zulu", "General"]);
  await page.getByRole("button", { name: "Collapse Pinned", exact: true }).click();
  await expect(page.locator(`[data-group-id="${alpha.id}"]`)).toBeHidden();
  await page.reload(); await expect(page.getByRole("button", { name: "Expand Pinned", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Expand Pinned", exact: true }).click();
  await page.getByRole("button", { name: "Add group or section", exact: true }).click(); await page.getByRole("menuitem", { name: "Create section", exact: true }).click();
  await page.getByRole("textbox", { name: "Section name", exact: true }).fill("Engineering");
  await page.getByRole("button", { name: "Save section", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Create section" })).toBeHidden();
  await page.getByRole("button", { name: "Move Zulu to section", exact: true }).click();
  await page.getByRole("menuitem", { name: "Engineering", exact: true }).click();
  const engineering = await until(async () => (await prefs()).sections.find((s) => s.name === "Engineering" && s.groups.includes(zulu.id)));
  await page.getByRole("button", { name: "Section options for Engineering", exact: true }).click();
  await page.getByRole("menuitem", { name: "Rename section", exact: true }).click();
  await page.getByRole("textbox", { name: "Section name", exact: true }).fill("Product team");
  await page.getByRole("button", { name: "Save section", exact: true }).click();
  await expect(page.getByRole("button", { name: "Collapse Product team", exact: true })).toBeVisible();
  await options.click(); await page.getByRole("menuitem", { name: "Create section", exact: true }).click();
  await page.getByRole("textbox", { name: "Section name", exact: true }).fill("Product team");
  await page.getByRole("button", { name: "Save section", exact: true }).click();
  await expect(page.locator(".action-toast").filter({ hasText: "unique" })).toBeVisible();
  await page.getByRole("dialog", { name: "Create section" }).getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Reorder Alpha", exact: true }).dragTo(page.locator(`[data-section-id="${engineering.id}"] .group-section-heading`));
  await expect.poll(async () => (await prefs()).sections.find((s) => s.id === engineering.id).groups.sort()).toEqual([alpha.id, zulu.id].sort());
  assert(!(await prefs()).pinned.includes(alpha.id));
  await sort("A-Z");
  await page.getByRole("button", { name: "Reorder Zulu", exact: true }).focus();
  await page.keyboard.press("ArrowUp");
  await expect.poll(order).toEqual(["Zulu", "Alpha", "General"]);
  assert.equal((await prefs()).sort, "custom");
  await page.getByRole("button", { name: "Collapse Product team", exact: true }).click();
  await page.reload(); await expect(page.getByRole("button", { name: "Expand Product team", exact: true })).toBeVisible();
  const saved = await prefs();
  for (const invalid of [
    { ...saved, sections: [{ id: "pinned", name: "Reserved", groups: [] }] },
    { ...saved, sections: [{ id: "other", name: "", groups: [] }] },
    { ...saved, sections: [{ id: "other", name: "Other", groups: ["missing"] }] },
    { ...saved, sections: [...saved.sections, { id: "other", name: "Other", groups: [zulu.id] }] },
    { ...saved, collapsed: ["missing"] },
  ]) assert((await request.put("/api/preferences/groups", { data: invalid })).status() >= 400);
  assert.deepEqual(await prefs(), saved, "Rejected writes must preserve saved sections");
  assert.equal((await request.put("/api/preferences/groups", { data: saved, headers: { Origin: "https://example.com" } })).status(), 403);
  const anonymous = await page.context().browser().newContext({ baseURL: base });
  assert.equal((await anonymous.request.put("/api/preferences/groups", { data: saved })).status(), 401);
  assert.equal((await anonymous.request.get("/api/runs/missing")).status(), 401);
  await anonymous.close();
  await expect(page.getByText("Deleted groups", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export organization", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Archived groups", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Archived groups" })).toBeVisible();
  await expect(page.getByText("Hidden deleted group", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: path.join(directory, "archive-modal.png") });
  await page.getByRole("button", { name: "Restore Archive me", exact: true }).click();
  await expect(page.locator(".action-toast").filter({ hasText: "Archive me restored" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Restore Archive me", exact: true })).toHaveCount(0);
  assert.equal((await state()).groups.find((g) => g.id === archived.id).archived_at, null);
  await page.getByRole("dialog", { name: "Archived groups" }).getByRole("button", { name: "Close", exact: true }).click();
  await page.goto(`/groups/hidden--${deleted.id}/chat`);
  await expect(page.getByRole("heading", { name: "Page not found", exact: true })).toBeVisible();
  await page.goto("/groups/general/chat");
  await expect(page.getByRole("heading", { name: "General", exact: true })).toBeVisible();
  const edge = page.getByRole("separator", { name: "Resize main navigation", exact: true });
  await edge.click();
  await expect(page.getByRole("button", { name: "Expand navigation", exact: true })).toBeVisible();
  await expect(page.locator(".sidebar.rail")).toBeVisible();
  const railBox = await page.locator(".sidebar.rail").boundingBox();
  assert(railBox.width >= 50 && railBox.width <= 70, `Rail width (${railBox.width}px) is ~56px`);
  await expect(page.locator(".sidebar.rail").getByRole("button", { name: /Search/ })).toBeVisible();
  await expect(page.locator(".sidebar.rail").getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  // Test tooltip on rail buttons (hover and keyboard focus)
  const expandBtn = page.getByRole("button", { name: "Expand navigation", exact: true });
  await expandBtn.hover();
  await expect(page.locator(".action-tooltip-popup").filter({ hasText: "Expand navigation" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.locator(".action-tooltip-popup")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".action-tooltip-popup")).toHaveCount(0);

  await expandBtn.click();
  await expect(page.locator(".sidebar:not(.rail)")).toBeVisible();

  // Test keyboard resize toggle on separator
  await edge.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".sidebar.rail")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".sidebar:not(.rail)")).toBeVisible();

  // Test Account menu Escape and focus restoration
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Profile", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeFocused();
  const keyboardAndBounds = await verifySidebarBounds({ page, state });

  // Test reduced motion and reduced height
  await page.emulateMedia({ reducedMotion: "reduce" });
  await edge.click();
  await expect(page.locator(".sidebar.rail")).toBeVisible();
  await page.getByRole("button", { name: "Expand navigation", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "no-preference" });

  const edgeBox = await edge.boundingBox(), oldWidth = (await page.locator("#sidebar").boundingBox()).width;
  await page.mouse.move(edgeBox.x + edgeBox.width / 2, edgeBox.y + 100); await page.mouse.down();
  await page.mouse.move(edgeBox.x + 65, edgeBox.y + 100, { steps: 8 }); await page.mouse.up();
  const resizedWidth = (await page.locator("#sidebar").boundingBox()).width;
  assert(resizedWidth > oldWidth + 35, "Dragging still resizes without collapsing");
  await expect.poll(async () => (await state()).panel_sizes.sidebar).toBeGreaterThan(oldWidth + 35);

  // Measure expanded panel wrapper and content before collapse
  const preCollapseContentBox = await page.locator("#content").boundingBox();

  // Test resize -> collapse -> reload -> expand restores exact width (not 180px minSize)
  await edge.click();
  await expect(page.locator(".sidebar.rail")).toBeVisible();

  // Measure collapsed panel wrapper and main content
  const collapsedSidebarBox = await page.locator("#sidebar").boundingBox();
  const collapsedContentBox = await page.locator("#content").boundingBox();
  assert(collapsedSidebarBox.width >= 50 && collapsedSidebarBox.width <= 70, `Collapsed #sidebar panel wrapper width (${collapsedSidebarBox.width}px) is ~56px`);
  assert(collapsedContentBox.width > preCollapseContentBox.width + 50, "Main content expanded to take up collapsed sidebar space");

  await page.reload();
  await expect(page.locator(".sidebar.rail")).toBeVisible();
  const reloadedSidebarBox = await page.locator("#sidebar").boundingBox();
  const reloadedContentBox = await page.locator("#content").boundingBox();
  assert(reloadedSidebarBox.width >= 50 && reloadedSidebarBox.width <= 70, `Reload retains rail mode on #sidebar panel wrapper (${reloadedSidebarBox.width}px)`);
  assert(reloadedContentBox.width > preCollapseContentBox.width + 50, "Reload retains expanded main content space");

  await page.getByRole("button", { name: "Expand navigation", exact: true }).click();
  await expect(page.locator(".sidebar:not(.rail)")).toBeVisible();
  const restoredSidebarBox = await page.locator("#sidebar").boundingBox();
  const restoredContentBox = await page.locator("#content").boundingBox();
  assert(Math.abs(restoredSidebarBox.width - resizedWidth) <= 5, `Restored #sidebar panel width (${restoredSidebarBox.width}px) matches previously resized width (${resizedWidth}px), not 180px minSize`);
  assert(restoredSidebarBox.width >= 180 && restoredSidebarBox.width <= 420, "Restored width is in 180-420px range");
  assert(Math.abs(restoredContentBox.width - preCollapseContentBox.width) <= 8, "Main content returned to pre-collapse width");

  // Check initial mobile -> desktop transition retains consistent panel state and size
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator("#sidebar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show navigation", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 980 });
  await expect(page.locator("#sidebar")).toBeVisible();
  const transitionSidebarBox = await page.locator("#sidebar").boundingBox();
  assert(Math.abs(transitionSidebarBox.width - resizedWidth) <= 5, `Desktop restore after mobile viewport retains resized width (${transitionSidebarBox.width}px)`);
  const storageFallbacks = await verifySidebarStorage({ page, request, base });
  await page.setViewportSize({ width: 1024, height: 420 });
  const reducedHeight = await verifySidebarLayout(page, "reduced-height");
  await page.setViewportSize({ width: 1440, height: 980 });
  const browserZoom = await verifySidebarZoom({ page, directory, base });

  await page.getByRole("button", { name: "Expand Product team", exact: true }).click();
  await page.screenshot({ path: path.join(directory, "desktop-sections.png") });

  const workdir = path.join(org, "navigation-workdir"); await mkdir(workdir, { recursive: true });
  await writeFile(path.join(workdir, "proof.txt"), "WORKSPACE_ACTIVITY_OK");
  const workspace = (await call("/workspaces/probe", { path: workdir })).workspace;
  const original = (await state()).agents.find((a) => a.id === "ceo") ?? (await state()).agents[0];
  let runId = "no-provider";
  let recordedModel = "none";
  let catalogName = "none";
  let effort = "low";
  let failed = { id: "no-failed-run" };

  if (!noProvider) {
    const catalog = await call("/codex/settings", undefined, "GET");
    const model = catalog.models.find((m) => m.slug === "gpt-5.6-luna") ?? catalog.models.find((m) => m.slug === catalog.model);
    effort = model.supported_reasoning_levels.find((r) => r.effort === "low")?.effort ?? model.default_reasoning_level;
    recordedModel = model.slug;
    catalogName = model.display_name;
    const agent = await call(`/agents/${original.id}`, { ...original, name: "Navigation agent", position: "Director", model: model.slug, reasoning: effort, workdir: workspace, timeout_seconds: 180 }, "PUT");
    await page.reload();

    const message = await call("/messages", { id: crypto.randomUUID(), group_id: "general", recipients: [agent.id], body: `Run a PowerShell command to wait 5 seconds and read this absolute path: ${path.join(workdir, "proof.txt")}. Return its exact contents. Do not delegate.` });
    await expect(page.getByRole("button", { name: /Chat activity: (Working|Queued)/ })).toBeVisible({ timeout: 30000 });
    assert(await page.locator(".chat-activity .activity-spinner").count());
    await page.screenshot({ path: path.join(directory, "chat-working.png") });
    const run = await finished(message.id); assert.equal(run.status, "succeeded", run.error);
    assert(run.output.includes("WORKSPACE_ACTIVITY_OK"));
    await expect(page.getByRole("button", { name: "Chat activity: Done", exact: true })).toBeVisible({ timeout: 30000 });
    await expect(page.locator(".chat-activity.done")).toHaveCSS("color", "rgb(20, 125, 62)");
    const badge = page.locator(".message-agent .model-badge").last();
    await expect(badge).toContainText(`${model.display_name}`); await expect(badge).toContainText(effort);
    const heading = page.locator(".message-agent .message-heading").last();
    assert(await heading.locator(".bot-badge + .model-badge").count(), "Model follows Position");
    const recorded = await call(`/runs/${run.id}`, undefined, "GET");
    assert(recorded.arguments.includes(model.slug)); assert(recorded.arguments.includes(`model_reasoning_effort="${effort}"`));
    const nextEffort = model.supported_reasoning_levels.find((r) => r.effort !== effort)?.effort ?? effort;
    await call("/agents/ceo", { ...agent, reasoning: nextEffort }, "PUT");
    await page.reload(); await expect(badge).toContainText(effort); assert(!(await badge.textContent()).includes(nextEffort) || nextEffort === effort);
    await page.screenshot({ path: path.join(directory, "chat-model-done.png") });
    runId = run.id;

    // Real dotenv validation produces a failed run without sending a paid provider request.
    const envPath = path.join(workdir, ".env"); await writeFile(envPath, "=invalid\n");
    const failedMessage = await call("/messages", { id: crypto.randomUUID(), group_id: "general", recipients: [agent.id], body: "This should fail before Codex starts because the attached dotenv is invalid." });
    failed = await finished(failedMessage.id); assert.equal(failed.status, "failed");
    await expect(page.getByRole("button", { name: "Chat activity: Needs attention", exact: true })).toBeVisible({ timeout: 30000 });
    await expect(page.locator(".chat-activity.done")).toHaveCount(0);
    await rm(envPath);
    await page.getByRole("textbox", { name: "Message", exact: true }).fill("/btw");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(page.getByRole("region", { name: "Side chat", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Chat activity: No recent activity", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Back to main chat", exact: true }).click();
    await expect(page.getByRole("button", { name: "Chat activity: Needs attention", exact: true })).toBeVisible();
  }

  const mobileProof = await verifyMobileNavigation({ page, directory, agentId: original.id });
  await page.setViewportSize({ width: 1440, height: 980 });
  const beforeRestart = await prefs();
  let restarted = false;
  let restartEvidence = null;
  let externalRestartEvidence = null;
  if (process.env.AE_ALLOW_LOCAL_RESTART === "true") {
    execFileSync("pwsh", ["-NoProfile", "-File", "../scripts/Stop.ps1", "-Org", org], { stdio: "ignore", timeout: 25000 });
    execFileSync("pwsh", ["-NoProfile", "-File", "../scripts/Start.ps1", "-Org", org, "-Port", new URL(base).port], { stdio: "ignore", timeout: 25000 });
    await until(async () => {
      try {
        return Boolean(await call("/state", undefined, "GET"));
      } catch {
        return false;
      }
    });
    assert.deepEqual(await prefs(), beforeRestart);
    restarted = true;
    restartEvidence = { mechanism: "native-script", before: beforeRestart, after: await prefs() };
  } else {
    const hostReceiptPath = path.join(directory, "container-restart.json");
    try {
      const historical = JSON.parse(await readFile(hostReceiptPath, "utf-8"));
      const before = Date.parse(historical.started_at_before);
      const after = Date.parse(historical.started_at_after);
      assert.equal(historical.mechanism, "docker-host-cli");
      assert.equal(historical.candidate_container, process.env.AE_TEST_CONTAINER ?? "personal-agentic-toast-candidate-local");
      assert.match(historical.container_id, /^[a-f0-9]{64}$/);
      assert(Number.isFinite(before) && Number.isFinite(after) && after > before, "Restart timestamps must advance");
      assert(Date.parse(historical.recorded_at) >= after, "Receipt must be recorded after its restart");
      assert(["localhost", "127.0.0.1", "[::1]"].includes(new URL(historical.base_url).hostname));
      assert(historical.preferences_before && historical.preferences_after, "Restart receipt must include both preference snapshots");
      assert.deepEqual(historical.preferences_after, historical.preferences_before);
      assert.equal(historical.persisted, true);
      externalRestartEvidence = {
        source: hostReceiptPath,
        appliesToThisPhase: false,
        validated: true,
        candidateContainer: historical.candidate_container,
        containerId: historical.container_id,
        recordedAt: historical.recorded_at,
        startedAtBefore: historical.started_at_before,
        startedAtAfter: historical.started_at_after,
        preferencesEqual: true,
      };
    } catch (error) {
      externalRestartEvidence = {
        source: hostReceiptPath,
        appliesToThisPhase: false,
        validated: false,
        reason: error.code === "ENOENT" ? "No independent host restart receipt" : `Invalid independent receipt: ${error.message.split("\n")[0]}`,
      };
    }
  }
  await page.reload();
  await page.getByRole("button", { name: "Section options for Product team", exact: true }).click();
  await page.getByRole("menuitem", { name: "Remove section", exact: true }).click();
  await expect(page.getByRole("button", { name: "Collapse Product team", exact: true })).toHaveCount(0);
  await expect(page.locator(`[data-section-id="all"] [data-group-id="${zulu.id}"]`)).toBeVisible();
  const receipt = {
    run: runId,
    recordedModel,
    catalogName,
    reasoning: effort,
    failedRun: failed.id,
    restored: archived.id,
    hidden: deleted.id,
    sectionsPersistedAcrossRestart: restarted,
    sectionsPersistedAcrossRestartNote: restarted
      ? "Verified across native Stop.ps1 / Start.ps1"
      : "This phase did not restart the service. Independent host restart evidence is reported separately.",
    restartEvidence,
    externalRestartEvidence,
    keyboardAndBounds,
    storageFallbacks,
    reducedHeight,
    browserZoom,
    browserStorageFaultInjection: "Blocked-storage case throws a browser SecurityError; HTTP and persistence remain real.",
    sidebar: { resizedWidth, collapsed: collapsedSidebarBox, reloaded: reloadedSidebarBox, restored: restoredSidebarBox, responsive: transitionSidebarBox },
    mobile: mobileProof,
    mocks: false,
  };
  await writeFile(path.join(directory, "workspace-navigation.json"), JSON.stringify(receipt, null, 2));
  return receipt;
}

async function verifySidebarLayout(page, name) {
  await expect(page.locator(".sidebar:not(.rail)")).toBeVisible();
  const controls = await page.locator(".sidebar:not(.rail)").evaluate(sidebar => {
    const rect = element => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    return {
      sidebar: rect(sidebar),
      buttons: [...sidebar.querySelectorAll(".search-button,.organization-button,.account-menu-trigger")].map(button => ({
        label: button.getAttribute("aria-label") || button.textContent.trim(),
        box: rect(button),
        overflow: button.scrollWidth > button.clientWidth + 1,
        icons: [...button.querySelectorAll("svg")].map(rect),
      })),
    };
  });
  assert.equal(controls.buttons.length, 4, "Search, two shortcuts and account control remain available");
  for (const { label, box, icons, overflow } of controls.buttons) {
    assert(box.width > 0 && box.height >= 28 && box.x >= controls.sidebar.x && box.x + box.width <= controls.sidebar.x + controls.sidebar.width + 1, `${label} fits the sidebar at ${name}`);
    assert(!overflow, `${label} has no clipped content at ${name}`);
    for (const icon of icons) assert(icon.width >= 12 && icon.x >= box.x && icon.x + icon.width <= box.x + box.width + 1, `${label} icon is contained at ${name}`);
  }
  const shortcutIcons = controls.buttons.filter(button => ["Action board", "Organization"].includes(button.label)).map(button => button.icons[0]);
  assert.equal(shortcutIcons.length, 2);
  assert(Math.abs(shortcutIcons[0].x - shortcutIcons[1].x) <= 1, "Workspace shortcut icons align");
  const account = page.getByRole("button", { name: "Account menu", exact: true });
  await account.scrollIntoViewIfNeeded();
  await account.click();
  const menu = page.locator(".account-menu");
  await expect(menu).toBeVisible();
  const menuBox = await menu.boundingBox();
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, horizontalOverflow: document.documentElement.scrollWidth > innerWidth }));
  assert(menuBox.x >= 0 && menuBox.y >= 0 && menuBox.x + menuBox.width <= viewport.width + 1 && menuBox.y + menuBox.height <= viewport.height + 1, `Account menu is contained at ${name}`);
  assert(!viewport.horizontalOverflow, `No horizontal page overflow at ${name}`);
  await expect(menu.getByRole("menuitem", { name: "Profile", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(account).toBeFocused();
  return { name, ...controls, menu: menuBox, viewport };
}

async function verifySidebarBounds({ page, state }) {
  const sidebar = page.locator("#sidebar");
  const edge = page.getByRole("separator", { name: "Resize main navigation", exact: true });
  const originalWidth = (await sidebar.boundingBox()).width;
  const dragTo = async width => {
    const box = await edge.boundingBox();
    const panel = await sidebar.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(panel.x + width + box.width / 2, box.y + 100, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => Math.abs((await sidebar.boundingBox()).width - width)).toBeLessThan(2);
    await expect.poll(async () => Math.abs((await state()).panel_sizes.sidebar - width)).toBeLessThan(2);
  };
  await edge.focus();
  await page.keyboard.press("End");
  await expect.poll(async () => Math.round((await sidebar.boundingBox()).width)).toBe(420);
  await expect.poll(async () => (await state()).panel_sizes.sidebar).toBe(420);
  const maximum = await verifySidebarLayout(page, "maximum-420");
  await dragTo(180);
  const minimum = await verifySidebarLayout(page, "minimum-180");
  await edge.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await sidebar.boundingBox()).width).toBeGreaterThan(180);
  const arrowRightWidth = (await sidebar.boundingBox()).width;
  await expect.poll(async () => Math.abs((await state()).panel_sizes.sidebar - arrowRightWidth)).toBeLessThan(2);
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => Math.round((await sidebar.boundingBox()).width)).toBe(180);
  await expect.poll(async () => (await state()).panel_sizes.sidebar).toBe(180);
  await dragTo(originalWidth);
  return { minimum, maximum, arrowRightWidth, arrowLeftWidth: 180, restoredWidth: (await sidebar.boundingBox()).width };
}

async function verifySidebarStorage({ page, request, base }) {
  const meResponse = await request.get("/api/me");
  assert(meResponse.ok());
  const { user } = await meResponse.json();
  const workspace = await page.evaluate(() => document.cookie.split(";").map(value => value.trim()).find(value => value.startsWith("ae_workspace="))?.split("=")[1] ?? "default");
  const auth = await page.context().storageState();
  const proof = [];
  for (const mode of ["corrupt", "foreign-scope", "blocked"]) {
    const isolated = await page.context().browser().newContext({ baseURL: base, viewport: { width: 1440, height: 980 }, storageState: { cookies: auth.cookies, origins: [] } });
    try {
      await isolated.addInitScript(({ mode, user, workspace }) => {
        if (mode === "blocked") {
          Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Storage access blocked for acceptance", "SecurityError"); } });
        } else if (mode === "corrupt") {
          localStorage.setItem(`ae_sidebar_collapsed:v1:${user}:${workspace}`, "{invalid");
          localStorage.setItem(`ae_sidebar_expanded_width:v1:${user}:${workspace}`, "NaN");
        } else {
          localStorage.setItem(`ae_sidebar_collapsed:v1:another-${user}:${workspace}`, "true");
          localStorage.setItem(`ae_sidebar_collapsed:v1:${user}:another-${workspace}`, "true");
        }
      }, { mode, user, workspace });
      const candidate = await isolated.newPage();
      const errors = [];
      candidate.on("pageerror", error => errors.push(error.message));
      await candidate.goto("/groups/general/chat");
      await expect(candidate.locator(".sidebar:not(.rail)")).toBeVisible();
      const expandedWidth = (await candidate.locator("#sidebar").boundingBox()).width;
      assert(expandedWidth >= 180 && expandedWidth <= 420, `${mode} preferences use a valid expanded width`);
      await candidate.getByRole("button", { name: "Collapse navigation", exact: true }).click();
      await expect(candidate.locator(".sidebar.rail")).toBeVisible();
      await expect.poll(async () => Math.round((await candidate.locator("#sidebar").boundingBox()).width)).toBe(56);
      await candidate.getByRole("button", { name: "Expand navigation", exact: true }).click();
      await expect.poll(async () => Math.abs((await candidate.locator("#sidebar").boundingBox()).width - expandedWidth)).toBeLessThan(3);
      const foreignKeysPreserved = mode === "foreign-scope" ? await candidate.evaluate(({ user, workspace }) =>
        localStorage.getItem(`ae_sidebar_collapsed:v1:another-${user}:${workspace}`) === "true"
        && localStorage.getItem(`ae_sidebar_collapsed:v1:${user}:another-${workspace}`) === "true", { user, workspace }) : null;
      if (mode === "foreign-scope") assert.equal(foreignKeysPreserved, true, "Current navigation does not overwrite another identity/workspace preference");
      assert.deepEqual(errors, [], `${mode} preferences do not crash navigation`);
      proof.push({ mode, user, workspace, expandedWidth, railWidth: 56, restoredWidth: (await candidate.locator("#sidebar").boundingBox()).width, foreignKeysPreserved });
    } finally { await isolated.close(); }
  }
  return proof;
}

async function verifySidebarZoom({ page, directory, base }) {
  const profileRoot = path.resolve(directory);
  const profile = await mkdtemp(path.join(profileRoot, "navigation-zoom-profile-"));
  let context;
  try {
    const zoomLevel = Math.log(2) / Math.log(1.2);
    const hostValues = Object.fromEntries([new URL(base).host, new URL(base).hostname, "localhost", "127.0.0.1"].map(host => [host, { zoom_level: zoomLevel, last_modified: "13300000000000000" }]));
    const partitions = ["x", "", "0", Buffer.from("Default").toString("hex"), "x" + Buffer.from("Default").toString("hex")];
    const preferences = { partition: { default_zoom_level: Object.fromEntries(partitions.map(key => [key, zoomLevel])), per_host_zoom_levels: Object.fromEntries(partitions.map(key => [key, hostValues])) } };
    await mkdir(path.join(profile, "Default"), { recursive: true });
    await writeFile(path.join(profile, "Default", "Preferences"), JSON.stringify(preferences));
    await writeFile(path.join(profile, "Preferences"), JSON.stringify(preferences));
    context = await chromium.launchPersistentContext(profile, { baseURL: base, ...(process.env.AE_TEST_BROWSER_EXECUTABLE ? { executablePath: process.env.AE_TEST_BROWSER_EXECUTABLE } : { channel: "msedge" }), headless: true, viewport: { width: 1920, height: 1080 }, args: ["--window-size=1920,1080"] });
    await context.addCookies(await page.context().cookies(base));
    const candidate = context.pages()[0] ?? await context.newPage();
    await candidate.goto("/groups/general/chat");
    const metrics = await candidate.evaluate(() => ({ innerWidth, innerHeight, outerWidth, devicePixelRatio, visualViewportScale: visualViewport?.scale ?? null, cssZoom: getComputedStyle(document.documentElement).zoom }));
    assert(metrics.devicePixelRatio >= 1.9 && metrics.devicePixelRatio <= 2.1 && metrics.innerWidth >= 930 && metrics.innerWidth <= 990, `Native 200% layout zoom required: ${JSON.stringify(metrics)}`);
    assert(metrics.visualViewportScale === 1 && ["1", "normal"].includes(metrics.cssZoom), "Sidebar zoom acceptance excludes CSS zoom and pinch scaling");
    const expanded = await verifySidebarLayout(candidate, "browser-zoom-200");
    await candidate.getByRole("button", { name: "Collapse navigation", exact: true }).click();
    await expect.poll(async () => Math.round((await candidate.locator("#sidebar").boundingBox()).width)).toBe(56);
    await candidate.getByRole("button", { name: "Account menu", exact: true }).click();
    const menu = await candidate.locator(".account-menu").boundingBox();
    assert(menu && menu.x >= 0 && menu.y >= 0 && menu.x + menu.width <= metrics.innerWidth + 1 && menu.y + menu.height <= metrics.innerHeight + 1, "Rail account menu fits the zoomed viewport");
    await candidate.screenshot({ path: path.join(directory, "navigation-browser-zoom-200.png") });
    await candidate.keyboard.press("Escape");
    await expect(candidate.getByRole("button", { name: "Account menu", exact: true })).toBeFocused();
    return { factor: 2, metrics, expanded, railMenu: menu };
  } finally {
    if (context) await context.close();
    assert(profile.startsWith(profileRoot + path.sep));
    await rm(profile, { recursive: true, force: true });
  }
}

export async function verifyMobileNavigation({ page, directory, agentId = "ceo" }) {
  const mobileProof = [];
  for (const width of [390, 320, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/groups/general/chat");
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), { message: `No page overflow at ${width}px` }).toBe(true);
    if (width < 768) {
      await page.getByRole("button", { name: "Show navigation", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Workspace navigation", exact: true })).toBeVisible();
      const drawer = await page.getByRole("dialog", { name: "Workspace navigation", exact: true }).boundingBox();
      assert(drawer.x >= 0 && drawer.y >= 0 && drawer.x + drawer.width <= width && drawer.y + drawer.height <= 844, "Drawer stays entirely within the viewport");
      await expect(page.getByRole("button", { name: "Group options", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Account menu", exact: true }).click();
      await page.getByRole("menuitem", { name: "Archived groups", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Archived groups", exact: true })).toBeVisible();
      await page.getByRole("dialog", { name: "Archived groups", exact: true }).getByRole("button", { name: "Close", exact: true }).click();
      await page.getByRole("navigation", { name: "Groups", exact: true }).getByRole("button", { name: "General", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Workspace navigation", exact: true })).toHaveCount(0);
      await page.screenshot({ path: path.join(directory, `mobile-chat-${width}.png`) });
      for (const view of ["knowledge", "runs", "scheduled-tasks"]) {
        await page.goto(`/groups/general/${view}`);
        await expect(page.getByRole("button", { name: "Manage group", exact: true })).toBeVisible();
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), { message: `${view} overflow at ${width}px` }).toBe(true);
      }
      await page.goto(`/organization/agents/${agentId}/profile`);
      await expect(page.getByRole("textbox", { name: "Display name", exact: true })).toBeVisible();
      assert((await page.locator(".inspector").boundingBox()).width >= width - 2, "Mobile inspector uses full width");
      await page.screenshot({ path: path.join(directory, `mobile-profile-${width}.png`) });
      await page.getByRole("button", { name: "Close agent settings", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Organization", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Show navigation", exact: true })).toBeVisible();
    }
    mobileProof.push({ width, overflow: false });
  }
  const phone = await page.context().browser().newContext({ baseURL: new URL(page.url()).origin, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await page.context().storageState() });
  try {
    const touch = await phone.newPage();
    await touch.goto("/groups/general/chat");
    await touch.getByRole("button", { name: "Show navigation", exact: true }).tap();
    await touch.getByRole("button", { name: "Group options", exact: true }).tap();
    await expect(touch.getByRole("menuitem", { name: "A-Z", exact: true })).toBeVisible();
    await touch.getByRole("menuitem", { name: "A-Z", exact: true }).tap();
    await touch.getByRole("button", { name: "Account menu", exact: true }).tap();
    await touch.getByRole("menuitem", { name: "Archived groups", exact: true }).tap();
    await expect(touch.getByRole("dialog", { name: "Archived groups", exact: true })).toBeVisible();
    await touch.screenshot({ path: path.join(directory, "mobile-touch-archive.png") });
  } finally { await phone.close(); }
  return mobileProof;
}
