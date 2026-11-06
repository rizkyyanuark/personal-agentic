import assert from "node:assert/strict";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { expect } from "@playwright/test";

export const previewDialog = page => page.getByRole("dialog", { name: "Live Preview", exact: true });
export const cockpitHost = page => page.locator('[data-testid="cockpit-host"]');
export const viewportScenarios = [
  { width: 320, height: 844, label: "320" },
  { width: 390, height: 844, label: "390" },
  { width: 768, height: 1000, label: "768" },
  { width: 1024, height: 1000, label: "1024" },
  { width: 1440, height: 1000, label: "1440" },
  { width: 1848, height: 930, label: "1848x930" },
  { width: 1280, height: 720, label: "1280x720" },
  { width: 390, height: 600, label: "390x600" },
  { width: 844, height: 390, label: "844x390" },
];
const assets = new WeakMap();
let originalStyles;

async function verifyOriginalAppearance(host) {
  const reference = process.env.AE_COCKPIT_REFERENCE;
  assert(reference, "Set AE_COCKPIT_REFERENCE to the untouched virtual-kantor directory");
  originalStyles ??= Promise.all(["main.css", "tokens.css"].map(name => readFile(path.join(reference, "src/client/styles", name), "utf8")));
  const [main, tokens] = await originalStyles;
  return host.evaluate(async (node, styles) => {
    const frame = document.createElement("iframe");
    const rect = node.getBoundingClientRect();
    frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${rect.width}px;height:${rect.height}px;border:0;visibility:hidden`;
    document.body.append(frame);
    try {
      const doc = frame.contentDocument;
      const css = doc.createElement("style");
      css.textContent = styles.tokens + "\n" + styles.main.replace(/@import[^;]+;/, "");
      doc.head.append(css);
      doc.body.className = node.className.replace("cockpit-root", "");
      doc.body.innerHTML = node.innerHTML;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const selectors = [".brand-block", ".brand-block h1", ".brand-block h1 span", ".roadmap-card", ".metrics", ".metric", ".agent-card", ".agent-avatar", ".agent-character-name", ".agent-role", ".agent-status", ".agent-task", ".agent-activity", ".side-panel.right", ".panel-header", ".tab-btn", ".panel-scroll", "#agentGrid"];
      const properties = ["fontFamily", "fontSize", "fontWeight", "lineHeight", "display", "color", "backgroundColor", "borderRadius", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "gap", "gridTemplateColumns", "gridTemplateRows", "alignItems", "alignContent", "justifyContent", "textAlign", "whiteSpace", "overflow", "boxShadow", "backdropFilter"];
      const differences = [];
      for (const selector of selectors) {
        const actual = node.querySelector(selector);
        const expected = doc.querySelector(selector);
        if (!actual || !expected) { differences.push(`${selector}: missing original component`); continue; }
        const actualStyle = getComputedStyle(actual);
        const expectedStyle = frame.contentWindow.getComputedStyle(expected);
        for (const property of properties) {
          const a = actualStyle[property], e = expectedStyle[property];
          if (a === e) continue;
          if (/^[\d.]+px$/.test(a) && /^[\d.]+px$/.test(e) && Math.abs(parseFloat(a) - parseFloat(e)) < 1.5) continue;
          if (/^(?:[\d.]+px\s*)+$/.test(a) && /^(?:[\d.]+px\s*)+$/.test(e)) {
            const av = a.match(/[\d.]+/g).map(Number), ev = e.match(/[\d.]+/g).map(Number);
            if (av.length === ev.length && av.every((value, i) => Math.abs(value - ev[i]) < 0.5)) continue;
          }
          differences.push(`${selector}.${property}: ${a} != original ${e}`);
        }
      }
      return { components: selectors.length, differences };
    } finally { frame.remove(); }
  }, { main, tokens });
}
const requiredAssets = ["workstation-oak.svg", "models/sofa-3seat.glb", "models/task-chair.glb", "models/bookshelf.glb", "models/keyboard.glb", "models/mouse.glb", "models/cable-tray.glb"];

export function observeAssets(page) {
  const results = new Map();
  assets.set(page, results);
  page.on("response", response => {
    const prefix = "/cockpit-assets/";
    const pathname = new URL(response.url()).pathname;
    if (!pathname.startsWith(prefix)) return;
    const name = pathname.slice(prefix.length);
    if (!requiredAssets.includes(name)) return;
    const prior = results.get(name);
    if (prior?.status >= 200 && prior.status < 300) return;
    results.set(name, { status: response.status() });
  });
}

export async function captureFailure(page, proofDirectory) {
  if (page.isClosed()) return;
  try {
    await page.screenshot({ path: path.join(proofDirectory, "failure.png"), fullPage: true, timeout: 10000 });
  } catch (error) {
    console.error(`Failure screenshot unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function waitForScene(page) {
  const host = cockpitHost(page);
  await expect(previewDialog(page)).toBeVisible();
  await expect(host).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await expect(host).toHaveAttribute("data-scene-ready", "true");
  await expect(host.locator("#scene canvas")).toBeVisible();
  const results = assets.get(page);
  assert(results, "Observe asset responses before opening preview");
  await expect.poll(() => page.evaluate(names => {
    const receipts = performance.getEntriesByType("resource");
    return names.filter(name => !receipts.some(receipt => new URL(receipt.name).pathname === `/cockpit-assets/${name}` && receipt.responseEnd > 0 && receipt.decodedBodySize > 0));
  }, requiredAssets), { timeout: 20000 }).toEqual([]);
  for (const name of requiredAssets) {
    const result = results.get(name);
    assert(result && result.status >= 200 && result.status < 300, `Scene asset ${name}: HTTP ${result?.status}, complete browser Resource Timing receipt`);
  }
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

export async function verifyOverlay(page) {
  const dialog = previewDialog(page);
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(page.getByTestId("live-preview-backdrop")).toBeVisible();
  const teamFilter = page.getByRole("combobox", { name: "Team", exact: true });
  await expect(teamFilter).toBeVisible();
  const filterBox = await teamFilter.boundingBox();
  assert(filterBox && filterBox.width >= 120, "Team filter must retain at least 120px usable width");
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  assert(box && viewport);
  assert(box.width >= viewport.width * 0.8 && box.height >= viewport.height * 0.8, "Live Preview must occupy most of the viewport");
  assert(box.x > 0 && box.y > 0, "Floating preview keeps a visible margin");
  assert(box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, "Floating preview stays within the viewport");
  const shadow = await dialog.evaluate(node => getComputedStyle(node).boxShadow);
  assert.notEqual(shadow, "none", "Floating preview has a visible shadow");
  const background = await page.getByTestId("live-preview-backdrop").evaluate(node => getComputedStyle(node).backgroundColor);
  const alpha = Number(background.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/)?.[1] ?? (background.startsWith("rgb(") ? 1 : 0));
  assert(alpha > 0 && alpha < 1, `Backdrop dims the Organization view: ${background}`);
  assert(await page.locator(".organization-view").evaluate(node => node.getBoundingClientRect().width > 0), "Organization stays rendered behind preview");
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Overlay does not create horizontal page overflow");
}

export async function verifyPreviewProportions(page) {
  const viewport = page.viewportSize();
  assert(viewport);
  const header = await page.locator(".live-preview-header").boundingBox();
  const coarsePointer = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  assert(header && header.height <= (viewport.width <= 600 ? 92 : coarsePointer ? 64 : 56), `Compact toolbar height at ${viewport.width}x${viewport.height}: ${header?.height}`);
  const host = cockpitHost(page);
  await expect(host).not.toHaveClass(/cockpit-preview/);
  const original = await verifyOriginalAppearance(host);
  assert.deepEqual(original.differences, [], "Integrated cockpit must preserve original CSS appearance");
  const measurements = await host.evaluate(node => {
    const rect = node.getBoundingClientRect();
    const canvas = node.querySelector("#scene canvas");
    const grid = node.querySelector("#agentGrid").getBoundingClientRect();
    const panel = node.querySelector(".side-panel.right").getBoundingClientRect();
    const panelBody = node.querySelector(".side-panel.right .panel-scroll").getBoundingClientRect();
    const panelMinimized = node.querySelector(".side-panel.right").classList.contains("minimized");
    const cards = [...node.querySelectorAll(".agent-card")].map(card => card.getBoundingClientRect().height);
    let clear = 0;
    const columns = 24, rows = 20;
    for (let column = 0; column < columns; column++) {
      for (let row = 0; row < rows; row++) {
        const target = document.elementFromPoint(rect.x + rect.width * (column + 0.5) / columns, rect.y + rect.height * (row + 0.5) / rows);
        if (target === canvas || target?.closest(".labels-layer")) clear++;
      }
    }
    return { host_width: rect.width, host_height: rect.height, card_height: Math.max(...cards), card_strip_height: grid.height, mobile_panel_gap: Math.max(panel.top - grid.bottom, grid.top - panel.bottom), panel_body_height: panelBody.height, panel_minimized: panelMinimized, clear_canvas_ratio: clear / (columns * rows) };
  });
  assert(measurements.host_height > 0 && measurements.card_height > 0, "Original scene and cards render within the preview");
  if (measurements.host_width <= 820) assert(measurements.mobile_panel_gap >= 6, `Agent cards must stay clear of the mobile detail panel: ${JSON.stringify(measurements)}`);
  const steadyStatus = page.locator('.live-preview-connection[data-connection="live"]');
  const statusBox = await steadyStatus.boundingBox();
  assert(statusBox && statusBox.width <= 1 && statusBox.height <= 1, "Steady connection time must not occupy a second toolbar row");
  const description = page.locator(".live-preview-heading [id]").filter({ hasText: /^3D office for / });
  await expect(description).toHaveCount(1);
  for (const element of await description.all()) {
    const box = await element.boundingBox();
    assert(!box || box.width <= 1 && box.height <= 1, "Workspace/read-only description remains screen-reader-only");
  }
  return { width: viewport.width, height: viewport.height, toolbar_height: header.height, original_components_verified: original.components, ...measurements };
}

export async function verifySnapshotUI(page, snapshot) {
  const host = cockpitHost(page);
  for (const agent of snapshot.agents) {
    if (!agent.agent_id) continue;
    const card = host.locator(`.agent-card[data-role="${agent.office_role}"]`);
    await expect(card).toHaveAttribute("data-agent-id", agent.agent_id);
    await expect(card.locator(".agent-character-name")).toHaveText(agent.name);
    await expect(card.locator(".agent-role")).toHaveText(agent.position);
    if (agent.role !== agent.position) assert.notEqual(await card.locator(".agent-role").textContent(), agent.role, "Role pill uses the actual job position");
  }
  const tokens = host.locator("#statTokens");
  const expected = snapshot.totals.tokens_processed === null ? "—" : snapshot.totals.tokens_processed.toLocaleString("id-ID");
  await expect(tokens).toHaveText(expected);
  await expect(tokens).toHaveAttribute("title", snapshot.totals.tokens_processed === null && snapshot.totals.tokens_reported_runs === 0 ? "Belum ada usage token tersimpan." : new RegExp(`${snapshot.totals.tokens_reported_runs} dari ${snapshot.totals.tokens_total_runs} run`));
  await expect(tokens.locator("..").getByText("Token diproses", { exact: true })).toHaveCount(1);
}

export async function verifyRefresh(page, workspaceId) {
  const refresh = page.getByRole("button", { name: "Refresh", exact: true });
  for (const motion of ["no-preference", "reduce"]) {
    await page.emulateMedia({ reducedMotion: motion });
    await refresh.evaluate(node => {
      const samples = [];
      let frame = null;
      const sample = () => {
        if (node.getAttribute("aria-busy") !== "true") return;
        const svg = node.querySelector("svg");
        const anim = svg?.getAnimations().find(a => a.animationName === "live-preview-refresh-turn");
        if (anim && anim.startTime === null && document.timeline?.currentTime != null) {
          anim.startTime = document.timeline.currentTime;
        }
        const style = getComputedStyle(svg);
        samples.push({ animation: style.animationName, transform: style.transform });
        frame = requestAnimationFrame(sample);
      };
      const observer = new MutationObserver(() => {
        if (node.getAttribute("aria-busy") === "true" && frame === null) sample();
      });
      observer.observe(node, { attributes: true, attributeFilter: ["aria-busy", "class"] });
      node.refreshProbe = { samples, stop: () => { observer.disconnect(); cancelAnimationFrame(frame); } };
    });
    const requestPromise = page.waitForRequest(async request => {
      return new URL(request.url()).pathname === "/api/cockpit/state" && await refresh.getAttribute("aria-busy") === "true";
    });
    await refresh.click();
    const response = await (await requestPromise).response();
    assert(response?.ok(), "Refresh must receive an actual successful Rust status response");
    assert.equal((await response.json()).workspace_id, workspaceId);
    await expect(refresh).toHaveAttribute("aria-busy", "false");
    const samples = await refresh.evaluate(node => {
      node.refreshProbe.stop();
      const samples = node.refreshProbe.samples;
      delete node.refreshProbe;
      return samples;
    });
    assert(samples.length > 0, "Refresh exposes a real busy state during the request");
    if (motion === "reduce") assert(samples.every(sample => sample.animation === "none"), "Reduced motion disables refresh rotation");
    else {
      assert(samples.some(sample => sample.animation === "live-preview-refresh-turn"), "Refresh applies its rotation animation while busy");
      assert(new Set(samples.map(sample => sample.transform)).size > 1, "Refresh icon visibly rotates across rendered frames");
    }
    await expect(page.locator(".live-preview-connection")).toHaveAttribute("data-connection", "live");
  }
}

export async function verifyFocusTrap(page) {
  const close = page.getByRole("button", { name: "Close Live Preview", exact: true });
  await close.focus();
  for (const key of ["Tab", "Shift+Tab", ...Array(20).fill("Tab")]) {
    await page.keyboard.press(key);
    assert(await previewDialog(page).evaluate(node => node.contains(node.ownerDocument.activeElement)), "Keyboard focus must stay inside Live Preview");
  }
}

export async function verifyTouchPreview(browser, base, token, snapshot, proofDirectory) {
  const context = await browser.newContext({ baseURL: base, viewport: { width: 390, height: 600 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  const page = await context.newPage();
  observeAssets(page);
  try {
    assert((await context.request.post("/api/login", { data: { token } })).ok());
    await context.addCookies([{ name: "ae_workspace", value: snapshot.workspace_id, url: base, sameSite: "Strict" }]);
    await page.goto("/organization");
    await page.getByRole("button", { name: "Workspace preview", exact: true }).tap();
    await waitForScene(page);
    await verifySnapshotUI(page, snapshot);
    const card = cockpitHost(page).locator('.agent-card[data-role="data_engineer"]');
    const url = page.url();
    await card.tap();
    await expect(card).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(url);
    await card.tap();
    await expect(card).toHaveAttribute("aria-pressed", "false");
    await card.tap();
    await expect(card).toHaveAttribute("aria-pressed", "true");
    // Mobile reveals the selected tag; tapping that selection resets the original camera.
    await expect(cockpitHost(page).locator("#tag-data_engineer")).toBeVisible();
    await cockpitHost(page).locator("#tag-data_engineer").tap();
    await expect(card).toHaveAttribute("aria-pressed", "false");
    await card.tap();
    await expect(card).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(url);
    const layouts = [];
    for (const viewport of [{ width: 390, height: 600 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      await waitForScene(page);
      layouts.push(await verifyPreviewProportions(page));
      for (const control of [page.getByRole("button", { name: "Refresh", exact: true }), page.getByLabel("Configure cockpit team", { exact: true }), page.getByRole("button", { name: "Close Live Preview", exact: true })]) {
        const box = await control.boundingBox();
        assert(box && box.width >= 44 && box.height >= 44, "Preview toolbar controls keep 44px touch targets");
      }
      await page.screenshot({ path: path.join(proofDirectory, `touch-preview-${viewport.width}x${viewport.height}.png`), fullPage: true });
    }
    const panelToggle = cockpitHost(page).locator("#btnMinRight");
    if (await panelToggle.getAttribute("aria-expanded") === "false") await panelToggle.tap();
    await expect(panelToggle).toHaveAttribute("aria-expanded", "true");
    const expandedLandscape = await verifyPreviewProportions(page);
    assert(expandedLandscape.panel_body_height > 0, "Original landscape panel renders scrollable content");
    await page.screenshot({ path: path.join(proofDirectory, "touch-expanded-landscape.png"), fullPage: true });
    await page.getByRole("button", { name: "Close Live Preview", exact: true }).tap();
    await expect(page).toHaveURL(`${base}/organization`);
    await expect(cockpitHost(page)).toHaveCount(0);
    return { card_tap: true, tag_tap: true, close_tap: true, layouts, expanded_landscape: expandedLandscape };
  } finally {
    await context.close();
  }
}

async function projectedTag(page, role = "data_engineer") {
  return cockpitHost(page).locator(`#tag-${role}`).evaluate(node => {
    const coordinates = [...node.parentElement.style.transform.matchAll(/translate\(\s*([-\d.]+)px\s*,\s*([-\d.]+)px\s*\)/g)].at(-1);
    if (!coordinates) throw new Error("CSS2D character tag has no projected coordinates");
    return [Number(coordinates[1]), Number(coordinates[2])];
  });
}

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export async function verifyResizeKeepsCamera(page, proofDirectory) {
  const host = cockpitHost(page);
  const card = host.locator('.agent-card[data-role="data_engineer"]');
  const canvas = host.locator("#scene canvas");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await waitForScene(page);
  await card.click();
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const identity = await canvas.elementHandle();
  const desktopPosition = await projectedTag(page);
  const url = page.url();
  for (const viewport of [{ width: 390, height: 600 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport);
    await waitForScene(page);
    assert(await canvas.evaluate((node, original) => node === original, identity), "Resize must retain the mounted WebGL canvas");
    await expect(card).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(url);
    await expect(host.locator("#tag-data_engineer")).toBeVisible();
    await verifyPreviewProportions(page);
    await page.screenshot({ path: path.join(proofDirectory, `selected-nova-resize-${viewport.width}x${viewport.height}.png`), fullPage: true });
  }
  await expect.poll(async () => distance(desktopPosition, await projectedTag(page))).toBeLessThan(2);
  await card.click();
  await expect(card).toHaveAttribute("aria-pressed", "false");
  await identity.dispose();
}

async function scenePoint(canvas) {
  return canvas.evaluate(node => {
    const rect = node.getBoundingClientRect();
    for (const [x, y] of [[0.5, 0.65], [0.5, 0.5], [0.55, 0.7], [0.45, 0.65], [0.5, 0.4]]) {
      const point = { x: rect.width * x, y: rect.height * y };
      if (document.elementFromPoint(rect.x + point.x, rect.y + point.y) === node) return point;
    }
    throw new Error("Cockpit has no unobstructed canvas point for camera input");
  });
}

export async function verifyCameraInteractions(page, proofDirectory) {
  await waitForScene(page);
  const host = cockpitHost(page);
  const canvas = host.locator("#scene canvas");
  const nova = host.locator('.agent-card[data-role="data_engineer"]');
  const tag = host.locator("#tag-data_engineer");
  const url = page.url();
  await expect(tag).toBeVisible();
  const homeTag = await projectedTag(page);
  const home = await canvas.screenshot({ path: path.join(proofDirectory, "camera-home.png") });
  await nova.click();
  await expect(nova).toHaveAttribute("aria-pressed", "true");
  await expect(previewDialog(page)).toBeVisible();
  await expect(page).toHaveURL(url);
  await expect.poll(async () => distance(homeTag, await projectedTag(page))).toBeGreaterThan(30);
  const tagShiftPixels = distance(homeTag, await projectedTag(page));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const focused = await canvas.screenshot({ path: path.join(proofDirectory, "camera-nova.png") });
  const changedFraction = await page.evaluate(async ({ before, after }) => {
    async function pixels(encoded) {
      const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      context.drawImage(bitmap, 0, 0);
      const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      bitmap.close();
      return data;
    }
    const a = await pixels(before), b = await pixels(after);
    if (a.length !== b.length) throw new Error("Camera comparison requires equal canvas dimensions");
    let changed = 0;
    for (let index = 0; index < a.length; index += 4) {
      if (Math.max(Math.abs(a[index] - b[index]), Math.abs(a[index + 1] - b[index + 1]), Math.abs(a[index + 2] - b[index + 2])) > 16) changed++;
    }
    return changed / (a.length / 4);
  }, { before: home.toString("base64"), after: focused.toString("base64") });
  assert(changedFraction > 0.03, `Selecting Nova must visibly move the camera; changed ${changedFraction}`);
  await nova.click();
  await expect(nova).toHaveAttribute("aria-pressed", "false");
  await nova.click();
  await nova.focus();
  await page.keyboard.press("Escape");
  await expect(nova).toHaveAttribute("aria-pressed", "false");
  await expect(previewDialog(page)).toBeVisible();
  await expect(page).toHaveURL(url);
  await expect.poll(async () => distance(homeTag, await projectedTag(page))).toBeLessThan(2);
  await tag.click();
  await expect(nova).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(url);
  await canvas.dblclick({ position: await scenePoint(canvas) });
  await expect(nova).toHaveAttribute("aria-pressed", "false");
  for (const role of ["hq_lab_director", "data_engineer", "data_scientist", "research_scientist", "ml_engineer"]) {
    const card = host.locator(`.agent-card[data-role="${role}"]`);
    await card.click();
    await expect(card).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(url);
    await expect(host.locator('.agent-card[aria-pressed="true"]')).toHaveCount(1);
    await card.click();
    await expect(card).toHaveAttribute("aria-pressed", "false");
  }
  const beforeOrbit = await projectedTag(page);
  const bounds = await canvas.boundingBox();
  assert(bounds);
  const orbitStart = await scenePoint(canvas);
  await page.mouse.move(bounds.x + orbitStart.x, bounds.y + orbitStart.y);
  await page.mouse.down();
  await page.mouse.move(bounds.x + orbitStart.x + 120, bounds.y + orbitStart.y + 35, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => distance(beforeOrbit, await projectedTag(page))).toBeGreaterThan(15);
  await expect(page).toHaveURL(url);
  await canvas.dblclick({ position: await scenePoint(canvas) });
  const toggle = host.locator("#btnToggleSidebars");
  const workspace = host.locator(".workspace");
  await toggle.click();
  await expect(workspace).toHaveClass(/panels-hidden/);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(workspace).not.toHaveClass(/panels-hidden/);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  for (const side of ["Left", "Right"]) {
    const button = host.locator(`#btnMin${side}`);
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
  }
  return { changedFraction, tagShiftPixels };
}

export async function closePreview(page, method = "button") {
  if (method === "backdrop") {
    await page.getByTestId("live-preview-backdrop").click({ position: { x: 3, y: 3 } });
  } else if (method === "escape") {
    await page.getByRole("button", { name: "Close Live Preview", exact: true }).focus();
    await page.keyboard.press("Escape");
  } else {
    await page.getByRole("button", { name: "Close Live Preview", exact: true }).click();
  }
  await expect(previewDialog(page)).toHaveCount(0);
  await expect(cockpitHost(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/organization$/);
  await expect(page.getByRole("button", { name: "Workspace preview", exact: true })).toBeFocused();
}
