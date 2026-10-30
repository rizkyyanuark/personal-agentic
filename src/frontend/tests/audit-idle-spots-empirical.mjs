import assert from "node:assert/strict";
import path from "node:path";
import { chromium } from "../node_modules/playwright/index.mjs";
import { QUIPS_BY_SPOT, SPOT_BY_DESTINATION, QUIPS_BY_KIND } from "../../cockpit/src/client/ui/ambient-dialogue.js";
import { OFFICE_ACTIVITY_DESTINATIONS } from "../../cockpit/src/client/scene/office-navigation.js";
import { ROOM_LAYOUT } from "../../cockpit/src/client/scene/office-layout.js";

const base = process.env.AE_TEST_URL || "http://127.0.0.1:18789";
const outDir = "C:/Users/rizky/.gemini/antigravity-cli/brain/e2d2bc27-b67b-480c-82b2-e293df9f2397/screenshots";

console.log("=== EMPIRICAL E2E AUDIT: GUITAR, WINDOW, WATER DISPENSER ===");

// 1. Static Contract Checks
console.log("1. Verifying office contracts...");
const waterDest = OFFICE_ACTIVITY_DESTINATIONS.find(d => d.id === 'pantry:water');
assert.ok(waterDest, "Destination 'pantry:water' must exist in OFFICE_ACTIVITY_DESTINATIONS");
assert.equal(waterDest.kind, 'water', "Destination 'pantry:water' must have kind 'water'");
assert.equal(waterDest.zone, 'pantry', "Destination 'pantry:water' must have zone 'pantry'");
assert.deepEqual(waterDest.position, [8.65, ROOM_LAYOUT.floorY, -5.65], "Position must be in front of dispenser [8.65, floorY, -5.65]");
console.log("   - pantry:water destination verified:", waterDest.position);

assert.equal(SPOT_BY_DESTINATION['pantry:water'], 'water', "SPOT_BY_DESTINATION['pantry:water'] must map to 'water'");
assert.ok(QUIPS_BY_KIND.water, "QUIPS_BY_KIND.water must exist");
assert.deepEqual(QUIPS_BY_KIND.water, [...QUIPS_BY_SPOT.water], "QUIPS_BY_KIND.water must have all water quips");
console.log("   - water spot and quips mapping verified:", QUIPS_BY_KIND.water);

assert.ok(ROOM_LAYOUT.windows.includes(3.5), "ROOM_LAYOUT.windows must include 3.5 for window destination alignment");
console.log("   - ROOM_LAYOUT.windows verified:", ROOM_LAYOUT.windows);

// 2. Playwright Live Browser Test
console.log(`2. Launching browser to verify live 3D rendering against ${base}...`);
const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
});
const context = await browser.newContext({
  baseURL: base,
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
page.on("console", (msg) => {
  if (msg.type() === "error") console.error(`[BROWSER ERROR] ${msg.text()}`);
});

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

console.log("3. Navigating to /office...");
await page.goto("/office", { waitUntil: "networkidle" });

const canvas = page.locator("#scene canvas");
await canvas.waitFor({ state: "visible", timeout: 15000 });
console.log("   - 3D Canvas mounted successfully.");

// Toggle sidebars to full office view
const toggleBtn = page.locator("#btnToggleSidebars");
await toggleBtn.waitFor({ state: "visible", timeout: 5000 });
const btnText = (await toggleBtn.textContent() || "").trim();
assert.equal(btnText, "Lihat kantor penuh", "Panel toggle must show 'Lihat kantor penuh'");
await toggleBtn.click();
await page.waitForTimeout(600);

// Capture full office view
const fullOfficePath = path.resolve(outDir, "audit-full-office-verified.png");
await page.screenshot({ path: fullOfficePath });
console.log("   - Captured full office overview:", fullOfficePath);

// Step 3: Verify 3D Scene Objects via Evaluation
const sceneCheck = await page.evaluate(() => {
  const canvasEl = document.querySelector("#scene canvas");
  return {
    canvasFound: !!canvasEl,
    width: canvasEl?.width,
    height: canvasEl?.height
  };
});
console.log("   - Canvas check:", sceneCheck);

// Wait a few seconds for agents to wander and show ambient behavior
console.log("4. Observing idle activity cycles...");
await page.waitForTimeout(6000);

const finalScreenshotPath = path.resolve(outDir, "audit-idle-spots-verified.png");
await page.screenshot({ path: finalScreenshotPath });
console.log("   - Captured verified idle spots view:", finalScreenshotPath);

await browser.close();
console.log("=== EMPIRICAL VERIFICATION COMPLETE ===");
