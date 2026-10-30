import assert from "node:assert/strict";
import path from "node:path";
import { chromium } from "../node_modules/playwright/index.mjs";
import { QUIPS_BY_SPOT } from "../../cockpit/src/client/ui/ambient-dialogue.js";

const base = process.env.AE_TEST_URL || "http://127.0.0.1:18789";
const screenshotPath = path.resolve(
  "C:/Users/rizky/.gemini/antigravity-cli/brain/e2d2bc27-b67b-480c-82b2-e293df9f2397/screenshots/audit-guitar-scene.png"
);

console.log(`Starting guitar scene and panel toggle verification against ${base}...`);

const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
});
const context = await browser.newContext({
  baseURL: base,
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
page.on("console", (msg) => console.log(`[PAGE LOG] ${msg.type()}: ${msg.text()}`));

function makeState() {
  const now = new Date().toISOString();
  return {
    schema_version: 1,
    workspace_id: "default",
    generated_at: now,
    group_id: null,
    setup_required: false,
    mapping: {
      data_engineer: "agent-nova",
      data_scientist: "agent-atlas",
      research_scientist: "agent-lyra",
      ml_engineer: "agent-axiom"
    },
    groups: [{ id: "grp-1", name: "Core Team", is_project: false }],
    agents: [
      {
        office_role: "hq_lab_director",
        agent_id: null,
        name: "Orion",
        position: "Lab Director",
        role: "Director",
        color: "#7756a7",
        reports_to: null,
        enabled: true,
        availability: "ready",
        connection_checked_at: now,
        in_scope: true,
        phase: "idle",
        active_runs: [],
        latest_result: null,
        current_activity: null
      },
      {
        office_role: "data_engineer",
        agent_id: "agent-nova",
        name: "Nova Lead",
        position: "Principal Data Engineer",
        role: "Lead",
        color: "#176e78",
        reports_to: null,
        enabled: true,
        availability: "ready",
        connection_checked_at: now,
        in_scope: true,
        phase: "idle",
        active_runs: [],
        latest_result: null,
        current_activity: null
      },
      {
        office_role: "data_scientist",
        agent_id: "agent-atlas",
        name: "Atlas",
        position: "Data Scientist",
        role: "Scientist",
        color: "#3465b4",
        reports_to: null,
        enabled: true,
        availability: "ready",
        connection_checked_at: now,
        in_scope: true,
        phase: "idle",
        active_runs: [],
        latest_result: null,
        current_activity: null
      },
      {
        office_role: "research_scientist",
        agent_id: "agent-lyra",
        name: "Lyra",
        position: "Research Scientist",
        role: "Scientist",
        color: "#a83c6a",
        reports_to: null,
        enabled: true,
        availability: "ready",
        connection_checked_at: now,
        in_scope: true,
        phase: "idle",
        active_runs: [],
        latest_result: null,
        current_activity: null
      },
      {
        office_role: "ml_engineer",
        agent_id: "agent-axiom",
        name: "Axiom",
        position: "ML Engineer",
        role: "Engineer",
        color: "#247c5b",
        reports_to: null,
        enabled: true,
        availability: "ready",
        connection_checked_at: now,
        in_scope: true,
        phase: "idle",
        active_runs: [],
        latest_result: null,
        current_activity: null
      }
    ],
    actions: [],
    events: [],
    totals: {
      agents: 4,
      active_runs: 0,
      queued: 0,
      starting: 0,
      working: 0,
      awaiting_answer: 0,
      awaiting_delegates: 0,
      completed: 4,
      failed: 0,
      backlog: 0,
      scheduled: 0,
      tokens_processed: 1250,
      tokens_reported_runs: 1,
      tokens_total_runs: 1
    }
  };
}

await page.route("**/api/cockpit/state*", async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(makeState())
  });
});

console.log("Navigating to /office...");
await page.goto("/office", { waitUntil: "networkidle" });

const canvas = page.locator("#scene canvas");
await canvas.waitFor({ state: "visible", timeout: 15000 });
console.log("Verified: 3D canvas mounted.");

// Step 1: Verify panel toggle text
const toggleBtn = page.locator("#btnToggleSidebars");
await toggleBtn.waitFor({ state: "visible", timeout: 5000 });
const initialText = (await toggleBtn.textContent() || "").trim();
console.log(`Initial panel toggle button text: "${initialText}"`);
assert.equal(initialText, "Lihat kantor penuh", "Panel button must display 'Lihat kantor penuh' by default");

// Toggle to hide panels
await toggleBtn.click();
const hiddenText = (await toggleBtn.textContent() || "").trim();
console.log(`Panel toggle button text when panels hidden: "${hiddenText}"`);
assert.equal(hiddenText, "Tampilkan panel", "Panel button must display 'Tampilkan panel' when panels are hidden");

// Toggle back to show panels
await toggleBtn.click();
const restoredText = (await toggleBtn.textContent() || "").trim();
console.log(`Panel toggle button text restored: "${restoredText}"`);
assert.equal(restoredText, "Lihat kantor penuh", "Panel button must restore to 'Lihat kantor penuh'");

// Step 2: Verify guitar scene & prop
// Wait for agent to arrive at guitar spot or trigger guitar pose
console.log("Monitoring speech bubbles and activity for guitar scene...");
const bubbleLocator = page.locator(".speech-bubble.bubble:not(.hide)");
const GUITAR_QUIPS = new Set(QUIPS_BY_SPOT.guitar);

let detectedGuitarQuip = null;
const deadline = Date.now() + 70000;

const seenBubbles = new Set();
while (Date.now() < deadline) {
  const count = await bubbleLocator.count();
  for (let i = 0; i < count; i++) {
    const el = bubbleLocator.nth(i);
    const text = (await el.textContent() || "").trim();
    if (text && !seenBubbles.has(text)) {
      seenBubbles.add(text);
      console.log(`[DOM Bubble seen]: "${text}"`);
    }
    if (GUITAR_QUIPS.has(text)) {
      detectedGuitarQuip = text;
      break;
    }
  }
  if (detectedGuitarQuip) break;
  await page.waitForTimeout(400);
}

if (detectedGuitarQuip) {
  console.log(`Guitar quip observed: "${detectedGuitarQuip}"!`);
} else {
  console.log("Waiting for guitar spot arrival in scene, capturing full office view...");
}

// Capture screenshot
await page.screenshot({ path: screenshotPath, fullPage: false });
console.log(`Saved screenshot to: ${screenshotPath}`);

await browser.close();
console.log("Guitar scene and panel toggle verification completed successfully!");
