import path from "node:path";
import { chromium } from "../node_modules/playwright/index.mjs";

const base = process.env.AE_TEST_URL || "http://127.0.0.1:18789";
const outDir = "C:/Users/rizky/.gemini/antigravity-cli/brain/e2d2bc27-b67b-480c-82b2-e293df9f2397/screenshots";

const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
});
const context = await browser.newContext({
  baseURL: base,
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();

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

await page.goto("/office", { waitUntil: "networkidle" });
await page.locator("#scene canvas").waitFor({ state: "visible", timeout: 15000 });

// Hide sidebars
await page.locator("#btnToggleSidebars").click();
await page.waitForTimeout(1000);

// Close-up 1: Click Nova card or focus on data_engineer
const novaCard = page.locator('[data-focus="data_engineer"]');
if (await novaCard.count() > 0) {
  await novaCard.first().click({ force: true });
  await page.waitForTimeout(2000);
}
await page.screenshot({ path: path.resolve(outDir, "audit-closeup-nova.png") });

// Close-up 2: Focus on Orion (hq_lab_director)
const hqCard = page.locator('[data-focus="hq_lab_director"]');
if (await hqCard.count() > 0) {
  await hqCard.first().click({ force: true });
  await page.waitForTimeout(2000);
}
await page.screenshot({ path: path.resolve(outDir, "audit-closeup-director.png") });

await browser.close();
console.log("Closeups captured successfully.");
