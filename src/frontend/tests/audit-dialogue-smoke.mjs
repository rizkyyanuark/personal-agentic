import assert from "node:assert/strict";
import path from "node:path";
import { chromium } from "../node_modules/playwright/index.mjs";

const base = process.env.AE_TEST_URL || "http://127.0.0.1:18789";
const screenshotChatPath = path.resolve(
  "C:/Users/rizky/.gemini/antigravity-cli/brain/e2d2bc27-b67b-480c-82b2-e293df9f2397/screenshots/audit-dialogue-chat.png"
);
const screenshotWorkflowPath = path.resolve(
  "C:/Users/rizky/.gemini/antigravity-cli/brain/e2d2bc27-b67b-480c-82b2-e293df9f2397/screenshots/audit-dialogue-workflow.png"
);

console.log(`Starting comprehensive audit dialogue E2E test against ${base}...`);

const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
});
const context = await browser.newContext({
  baseURL: base,
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();

let currentState = "idle";
let currentTask = "Optimasi query database";

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
        phase: currentState === "director_working" ? "working" : "idle",
        active_runs: currentState === "director_working" ? [{
          id: "run-dir-1",
          group_id: "grp-1",
          group_name: "Core Team",
          side_chat_id: null,
          kind: "plan",
          status: "running",
          phase: "working",
          parent_run_id: null,
          created_at: now,
          started_at: now,
          ended_at: null,
          summary: "Koordinasi proyek"
        }] : [],
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
        phase: currentState === "working" ? "working" : "idle",
        active_runs: currentState === "working" ? [{
          id: "run-live-101",
          group_id: "grp-1",
          group_name: "Core Team",
          side_chat_id: null,
          kind: "plan",
          status: "running",
          phase: "working",
          parent_run_id: null,
          created_at: now,
          started_at: now,
          ended_at: null,
          summary: currentTask
        }] : [],
        latest_result: null,
        current_activity: currentState === "working" ? {
          run_id: "run-live-101",
          category: "writing",
          state: "active",
          step_index: 1,
          relative_file: "src/db/query.sql"
        } : null
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
      agents: 2,
      active_runs: currentState === "working" ? 1 : 0,
      queued: 0,
      starting: 0,
      working: currentState === "working" ? 1 : 0,
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

page.on("console", (msg) => console.log(`[PAGE LOG] ${msg.type()}: ${msg.text()}`));

let routeCount = 0;
await page.route("**/api/cockpit/state*", async (route) => {
  routeCount++;
  console.log(`[ROUTE] Intercepted state fetch #${routeCount}, returning currentState=${currentState}`);
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

// Step 1: Verify ambient two-way banter (CHAT) triggers in idle state
console.log("Waiting for ambient leisure dialogue (CHAT) to trigger...");
const bubbleLocator = page.locator(".speech-bubble.bubble:not(.hide)");

let detectedChat = "";
const deadline = Date.now() + 15000;
while (Date.now() < deadline) {
  const count = await bubbleLocator.count();
  for (let i = 0; i < count; i++) {
    const text = (await bubbleLocator.nth(i).textContent() || "").trim();
    if (text && !text.includes("Suasana ilustratif:") && !text.startsWith("Tugas publik:")) {
      detectedChat = text;
      break;
    }
  }
  if (detectedChat) break;
  await page.waitForTimeout(500);
}

console.log(`Detected ambient bubble: "${detectedChat}"`);
assert.ok(detectedChat.length > 0, "Ambient dialogue bubble must be rendered");
assert.ok(!detectedChat.includes("{to}"), "Placeholder {to} must be replaced with character name");
await page.screenshot({ path: screenshotChatPath, fullPage: false });
console.log(`Saved ambient chat screenshot to: ${screenshotChatPath}`);

// Step 2: Trigger task start workflow reaction
console.log("Triggering task start transition (siaga -> bekerja)...");
currentState = "working";
currentTask = "Optimasi query database";

// Wait for "Siap, saya kerjakan!" reaction bubble
const readyBubble = page.locator(".speech-bubble.bubble.hi:has-text('Siap, saya kerjakan!')");
await readyBubble.waitFor({ state: "visible", timeout: 10000 });
const readyText = await readyBubble.textContent();
console.log(`Verified workflow start reaction: "${readyText}"`);
assert.ok(readyText.includes("Siap, saya kerjakan!"), "Worker must say 'Siap, saya kerjakan!' upon assignment");

// Verify Director delegation bubble
const directorBubble = page.locator(".speech-bubble.bubble:has-text('tolong:')");
if (await directorBubble.count() > 0) {
  const dirText = await directorBubble.first().textContent();
  console.log(`Verified director delegation reaction: "${dirText}"`);
  assert.ok(dirText.includes("tolong:"), "Director must say '{name}, tolong: {task}' upon delegation");
}

await page.screenshot({ path: screenshotWorkflowPath, fullPage: false });
console.log(`Saved workflow reaction screenshot to: ${screenshotWorkflowPath}`);

// Step 3: Trigger task completion workflow reaction
console.log("Triggering task completion transition (bekerja -> siaga)...");
currentState = "idle";

const doneBubble = page.locator(".speech-bubble.bubble.hi:has-text('Beres!')");
await doneBubble.waitFor({ state: "visible", timeout: 10000 });
const doneText = await doneBubble.textContent();
console.log(`Verified workflow completion reaction: "${doneText}"`);
assert.ok(doneText.includes("Beres!"), "Worker must say 'Beres!' upon task completion");

await browser.close();
console.log("ALL audit dialogue E2E assertions passed successfully!");
