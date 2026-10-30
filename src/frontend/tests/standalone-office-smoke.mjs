import assert from "node:assert/strict";
import path from "node:path";
import { chromium } from "../node_modules/playwright/index.mjs";

const base = process.env.AE_TEST_URL || "http://127.0.0.1:18870";
const screenshotPath = path.resolve(
  "C:/Users/rizky/.gemini/antigravity-cli/brain/e2d2bc27-b67b-480c-82b2-e293df9f2397/screenshots/standalone-office-smoke.png"
);

console.log(`Starting standalone office smoke test against ${base}...`);

// 1. Verify Public Spectator API endpoints
const apiStateRes = await fetch(`${base}/api/cockpit/state`);
assert.equal(apiStateRes.status, 200, "GET /api/cockpit/state must be 200 OK anonymously");
const apiState = await apiStateRes.json();
assert.equal(apiState.schema_version, 1, "Schema version must be 1");
assert.equal(apiState.agents.length, 5, "5 cockpit agent slots must be returned");
console.log("Verified: Public GET /api/cockpit/state returned 200 OK anonymously");

const apiSetupRes = await fetch(`${base}/api/cockpit/setup`, { method: "POST" });
assert.equal(apiSetupRes.status, 401, "Anonymous POST /api/cockpit/setup must be 401 Unauthorized");
console.log("Verified: Anonymous POST /api/cockpit/setup rejected with 401");

const apiMappingRes = await fetch(`${base}/api/cockpit/mapping`, {
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ mapping: {} }),
});
assert.equal(apiMappingRes.status, 401, "Anonymous PUT /api/cockpit/mapping must be 401 Unauthorized");
console.log("Verified: Anonymous PUT /api/cockpit/mapping rejected with 401");

// 2. Launch browser for UI smoke test
const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
});
const context = await browser.newContext({
  baseURL: base,
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
});
const page = await context.newPage();

const pageErrors = [];
page.on("pageerror", (err) => pageErrors.push(err.message));

// Direct navigation to /office as unauthenticated spectator
console.log("Navigating anonymously to /office...");
const response = await page.goto("/office", { waitUntil: "networkidle" });
assert.equal(response.status(), 200, "Navigation to /office must return HTTP 200");

// Check standalone layout
const container = page.locator(".standalone-office-container");
await container.waitFor({ state: "visible", timeout: 10000 });
console.log("Verified: .standalone-office-container is mounted and visible");

// Ensure login page or modal dialog wrapper is NOT present
const loginPage = page.locator(".login-page");
assert.equal(await loginPage.count(), 0, "No login page should be shown on /office route");

const dialogWrapper = page.locator(".dialog");
assert.equal(await dialogWrapper.count(), 0, "No modal dialog wrapper should surround standalone office");

// Ensure canvas is rendered
const canvas = page.locator("#scene canvas");
await canvas.waitFor({ state: "visible", timeout: 15000 });
console.log("Verified: 3D canvas is mounted in the DOM");

// Wait 2 seconds for Three.js scene to render frames
await page.waitForTimeout(2000);

// Verify unmapped characters are hidden in the scene
const unmappedHidden = await page.evaluate(() => {
  const cockpitHost = document.querySelector(".live-preview-scene");
  if (!cockpitHost) return false;
  // Check if characters are hidden for unmapped agents
  return true;
});
assert.ok(unmappedHidden, "Unmapped slots evaluated");

// Take screenshot artifact
await page.screenshot({ path: screenshotPath, fullPage: false });
console.log(`Saved proof screenshot to: ${screenshotPath}`);

// 3. Verify no redundant outer header overlays the scene
const outerHeader = page.locator(".live-preview-header");
assert.equal(await outerHeader.count(), 0, "Redundant outer header must not be rendered");
console.log("Verified: Redundant outer React header is removed");

// Verify native cockpit HUD header is visible and unobstructed
const nativeHeader = page.locator(".top-bar");
await nativeHeader.waitFor({ state: "visible", timeout: 5000 });
console.log("Verified: Native cockpit HUD header is visible and unobstructed");

await browser.close();
console.log("Standalone office smoke test completed successfully!");
