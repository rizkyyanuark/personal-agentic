import assert from "node:assert/strict";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "../node_modules/playwright/index.mjs";

const base = process.env.AE_TEST_URL || "http://127.0.0.1:18870";
const dbPath = path.resolve("org/.state/app.sqlite3");
const screenshotPath = path.resolve(
  "C:/Users/rizky/.gemini/antigravity-cli/brain/e2d2bc27-b67b-480c-82b2-e293df9f2397/screenshots/standalone-office-mapped.png"
);

// Map CEO to data_engineer in SQLite
const db = new DatabaseSync(dbPath);
db.exec(
  `INSERT INTO metadata(key, value) VALUES('cockpit_mapping_v1', '${JSON.stringify({ data_engineer: "ceo" })}') ON CONFLICT(key) DO UPDATE SET value=excluded.value`
);

try {
  // 1. Verify GET /api/cockpit/state reflects mapping
  const res = await fetch(`${base}/api/cockpit/state`);
  assert.equal(res.status, 200);
  const state = await res.json();
  const de = state.agents.find((a) => a.office_role === "data_engineer");
  assert.equal(de.agent_id, "ceo");
  assert.equal(de.name, "CEO");
  console.log("Verified API: data_engineer is mapped to CEO");

  // 2. Open browser and verify 3D scene
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${base}/office`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  // Take screenshot showing exactly 1 mapped character and 4 empty standby desks
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`Saved mapped proof screenshot to: ${screenshotPath}`);

  // Check card text
  const ceoCard = page.locator("#card-data_engineer");
  const cardText = await ceoCard.textContent();
  assert.ok(cardText.includes("CEO"), "Card should display CEO name");
  console.log("Verified: Card displays mapped agent name CEO");

  await browser.close();
} finally {
  // Reset mapping back to clean state
  db.exec("DELETE FROM metadata WHERE key='cockpit_mapping_v1'");
  db.close();
}

console.log("Mapped agent verification passed!");
