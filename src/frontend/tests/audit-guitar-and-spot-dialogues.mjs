import assert from "node:assert/strict";
import path from "node:path";
import { chromium } from "../node_modules/playwright/index.mjs";
import {
  QUIPS_BY_SPOT,
  createAmbientDialogue
} from "../../cockpit/src/client/ui/ambient-dialogue.js";

const base = process.env.AE_TEST_URL || "http://127.0.0.1:18789";
const outDir = "C:/Users/rizky/.gemini/antigravity-cli/brain/e2d2bc27-b67b-480c-82b2-e293df9f2397/screenshots";

console.log("=== EMPIRICAL TEST: GUITAR MESH & SPOT-SPECIFIC DIALOGUES ===");

// 1. Verify exact dialogue matching per user prompt:
console.log("1. Verifying all user-requested spot dialogues in contract...");

// Guitar
const guitarExpected = [
  "🎸 jreng… jreng…",
  "Request lagu dong",
  "Kuncinya G atau C ya?",
  "Senarnya perlu diganti"
];
assert.deepEqual([...QUIPS_BY_SPOT.guitar], guitarExpected, "Guitar quips must match user requirements");
console.log("   - Guitar quips verified:", QUIPS_BY_SPOT.guitar);

// Window
const windowExpected = [
  "Langitnya cerah ya ☀️",
  "Peregangan dulu, pegal 🙆",
  "Macet banget di bawah",
  "Ada layangan tuh!"
];
assert.deepEqual([...QUIPS_BY_SPOT.window], windowExpected, "Window quips must match user requirements");
console.log("   - Window quips verified:", QUIPS_BY_SPOT.window);

// Pantry (Coffee)
const pantryCoffeeExpected = [
  "Ngopi dulu biar melek ☕",
  "Espresso double, please",
  "Wangi banget kopinya",
  "Gulanya di mana ya?"
];
assert.deepEqual([...QUIPS_BY_SPOT.coffee], pantryCoffeeExpected, "Pantry coffee quips must match user requirements");
console.log("   - Pantry coffee quips verified:", QUIPS_BY_SPOT.coffee);

// Sofa PS
const sofaPSExpected = [
  "Gooool! ⚽",
  "Satu match lagi ah 🎮",
  "Stiknya agak nge-drift nih",
  "Tunggu, aku belum siap!"
];
assert.deepEqual([...QUIPS_BY_SPOT.ps], sofaPSExpected, "Sofa PS quips must match user requirements");
console.log("   - Sofa PS quips verified:", QUIPS_BY_SPOT.ps);

// Meet1
const meet1Expected = [
  "Rapat lima menit, janji!",
  "Siapa yang pesan kopi?",
  "Kursinya empuk juga"
];
assert.deepEqual([...QUIPS_BY_SPOT.meet1], meet1Expected, "Meet1 quips must match user requirements");
console.log("   - Meet1 quips verified:", QUIPS_BY_SPOT.meet1);

// Meet2
const meet2Expected = [
  "Diskusi ringan dulu ☕",
  "Laptopnya siapa ini?",
  "Duduk dulu ah"
];
assert.deepEqual([...QUIPS_BY_SPOT.meet2], meet2Expected, "Meet2 quips must match user requirements");
console.log("   - Meet2 quips verified:", QUIPS_BY_SPOT.meet2);

// Meet3
const meet3Expected = [
  "Meja ini paling adem",
  "Ngobrol santai dulu",
  "Kita bahas nanti aja"
];
assert.deepEqual([...QUIPS_BY_SPOT.meet3], meet3Expected, "Meet3 quips must match user requirements");
console.log("   - Meet3 quips verified:", QUIPS_BY_SPOT.meet3);

// 2. Behavioral verification: Guitarist NEVER speaks CHAT banter, only guitar quips
console.log("2. Verifying ambient dialogue isolation for guitarist...");
const roles = [
  { key: "data_engineer", name: "Nova" },
  { key: "ml_engineer", name: "Axiom" }
];
const dialogue = createAmbientDialogue(roles);
const snapshot = {
  gates: { allowAmbient: true, dataFresh: true, visible: true, reducedMotion: false },
  agents: {
    data_engineer: { operational: { available: true, state: "siaga" } },
    ml_engineer: { operational: { available: true, state: "siaga" } }
  }
};
// Axiom is at guitar, Nova is at desk
const activities = {
  data_engineer: { phase: "seated", kind: "desk", destinationId: "desk:data_engineer", arrivalId: 1, position: [0, 0, 0] },
  ml_engineer: { phase: "standing", kind: "guitar", destinationId: "guitar", arrivalId: 1, position: [-1.4, 0.012, 2.6] }
};

// Simulate 40 seconds of updates
dialogue.update(0, snapshot, activities);
const emittedAxiomLines = [];
for (let t = 1; t <= 40; t += 1) {
  const candidates = dialogue.update(1.0, snapshot, activities);
  for (const c of candidates) {
    if (c.roleKey === "ml_engineer") {
      emittedAxiomLines.push(c.text);
    }
  }
}
console.log("   - Emitted lines for Axiom at guitar:", emittedAxiomLines);
assert.ok(emittedAxiomLines.length > 0, "Guitarist must emit quips while playing guitar");
for (const line of emittedAxiomLines) {
  assert.ok(
    guitarExpected.includes(line),
    `Axiom at guitar must ONLY emit guitar quips, but emitted: "${line}"`
  );
  assert.notEqual(line, "Rebahan aja, paling mewah 😴", "Axiom must NOT say 'Rebahan aja, paling mewah 😴'");
}
console.log("   - Verified: Guitarist periodically emits guitar quips and NEVER CHAT banter!");

// 3. Browser E2E Test: Capture visual screenshot of guitar player with speech bubble
console.log(`3. Launching browser against ${base} to capture visual proof...`);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ baseURL: base, viewport: { width: 1440, height: 900 } });
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
    totals: { agents: 2, active_runs: 0, queued: 0, starting: 0, working: 0, awaiting_answer: 0, awaiting_delegates: 0, completed: 2, failed: 0, backlog: 0, scheduled: 0, tokens_processed: 0, tokens_reported_runs: 0, tokens_total_runs: 0 }
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

// Toggle full office view
await page.locator("#btnToggleSidebars").click();
await page.waitForTimeout(1000);

// Focus on Axiom (ml_engineer)
const axiomCard = page.locator('[data-focus="ml_engineer"]');
if (await axiomCard.count() > 0) {
  await axiomCard.first().click({ force: true });
  await page.waitForTimeout(2500);
}

const screenshotPath = path.resolve(outDir, "audit-guitar-fixed-pose.png");
await page.screenshot({ path: screenshotPath });
console.log("   - Captured closeup screenshot of guitar player:", screenshotPath);

await browser.close();
console.log("=== ALL CHECKS PASSED SUCCESSFULLY ===");
