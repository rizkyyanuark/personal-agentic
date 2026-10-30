import assert from "node:assert/strict";
import path from "node:path";
import { chromium } from "../node_modules/playwright/index.mjs";

const base = process.env.AE_TEST_URL || "http://127.0.0.1:18789";
const screenshotPath = path.resolve(
  "C:/Users/rizky/.gemini/antigravity-cli/brain/e2d2bc27-b67b-480c-82b2-e293df9f2397/screenshots/idle-office-smoke.png"
);

console.log(`Starting idle office smoke test against ${base}...`);

const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
});
const context = await browser.newContext({
  baseURL: base,
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();

await page.route("**/api/cockpit/state*", async (route) => {
  const now = new Date().toISOString();
  const simulatedState = {
    schema_version: 1,
    workspace_id: "default",
    generated_at: now,
    group_id: null,
    setup_required: false,
    mapping: {
      data_engineer: "agent-nova",
      data_scientist: "agent-atlas"
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
        agent_id: null,
        name: "Lyra",
        position: "Research Scientist",
        role: "Scientist",
        color: "#a83c6a",
        reports_to: null,
        enabled: true,
        availability: "unmapped",
        connection_checked_at: now,
        in_scope: true,
        phase: "idle",
        active_runs: [],
        latest_result: null,
        current_activity: null
      },
      {
        office_role: "ml_engineer",
        agent_id: null,
        name: "Axiom",
        position: "ML Engineer",
        role: "Engineer",
        color: "#247c5b",
        reports_to: null,
        enabled: true,
        availability: "unmapped",
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
      agents: 3,
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

  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(simulatedState)
  });
});

console.log("Navigating to /office...");
await page.goto("/office", { waitUntil: "networkidle" });

const canvas = page.locator("#scene canvas");
await canvas.waitFor({ state: "visible", timeout: 15000 });
console.log("Verified: 3D canvas mounted.");

// Check header ambient banner text
const phaseEl = page.locator("#systemPhase");
await phaseEl.waitFor({ state: "visible", timeout: 5000 });
const phaseText = await phaseEl.textContent();
console.log(`Verified: System phase banner text: "${phaseText}"`);
assert.ok(
  phaseText.includes("Semua santai"),
  `Banner must show idle santai description, got: "${phaseText}"`
);

await page.waitForTimeout(1000);
await page.screenshot({ path: screenshotPath, fullPage: false });
console.log(`Saved proof screenshot to: ${screenshotPath}`);

await browser.close();
console.log("Idle office smoke test passed successfully!");
