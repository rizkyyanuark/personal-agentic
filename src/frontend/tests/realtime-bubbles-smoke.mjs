import assert from "node:assert/strict";
import path from "node:path";
import { chromium } from "../node_modules/playwright/index.mjs";

const base = process.env.AE_TEST_URL || "http://127.0.0.1:18870";
const screenshotPath = path.resolve(
  "C:/Users/rizky/.gemini/antigravity-cli/brain/e2d2bc27-b67b-480c-82b2-e293df9f2397/screenshots/realtime-bubbles-smoke.png"
);

console.log(`Starting real-time speech bubbles and task stream smoke test against ${base}...`);

const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
});
const context = await browser.newContext({
  baseURL: base,
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();

// Intercept /api/cockpit/state to inject a live working agent with active tool run activity and feed event
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
        availability: "unmapped",
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
        phase: "working",
        active_runs: [
          {
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
            summary: "Membaca file · src/App.tsx"
          }
        ],
        latest_result: null,
        current_activity: {
          run_id: "run-live-101",
          category: "reading",
          state: "active",
          step_index: 3,
          relative_file: "src/App.tsx"
        }
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
    events: [
      {
        id: 9001,
        kind: "step",
        office_role: "data_engineer",
        agent_id: "agent-nova",
        run_id: "run-live-101",
        status: "step",
        created_at: now,
        summary: "Membaca file · src/App.tsx · Core Team",
        activity: {
          run_id: "run-live-101",
          category: "reading",
          state: "active",
          step_index: 3,
          relative_file: "src/App.tsx"
        }
      }
    ],
    totals: {
      agents: 2,
      active_runs: 1,
      queued: 0,
      starting: 0,
      working: 1,
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

// Wait for 3D scene to mount
const canvas = page.locator("#scene canvas");
await canvas.waitFor({ state: "visible", timeout: 15000 });
console.log("Verified: 3D canvas mounted.");

// Wait for the working character's speech bubble to appear
const bubble = page.locator(".speech-bubble.bubble.hi");
await bubble.waitFor({ state: "visible", timeout: 10000 });

const bubbleText = await bubble.textContent();
console.log(`Verified: Working Speech Bubble rendered with text: "${bubbleText}"`);
assert.ok(
  bubbleText.includes("Membaca file") || bubbleText.includes("src/App.tsx"),
  `Speech bubble must display active tool activity, got: ${bubbleText}`
);

// Verify Task Stream Feed in HUD
const feedItem = page.locator("#feedList li:not(.empty-state)").first();
await feedItem.waitFor({ state: "visible", timeout: 5000 });

const feedText = await feedItem.locator(".feed-text").textContent();
console.log(`Verified: Activity feed rendered text: "${feedText}"`);
assert.ok(feedText.includes("Membaca file"), "Feed must render tool activity text");

const feedToolBadge = feedItem.locator(".feed-tool");
await feedToolBadge.waitFor({ state: "visible", timeout: 5000 });
const badgeText = await feedToolBadge.textContent();
console.log(`Verified: Tool badge rendered: "${badgeText}"`);
assert.equal(badgeText, "Membaca", "Feed tool badge must display localized tool category");

// Capture proof screenshot
await page.screenshot({ path: screenshotPath, fullPage: false });
console.log(`Saved proof screenshot to: ${screenshotPath}`);

await browser.close();
console.log("Real-time speech bubbles and task stream smoke test passed successfully!");
