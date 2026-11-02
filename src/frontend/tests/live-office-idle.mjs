import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { CHAT } from '../../cockpit/src/client/ui/ambient-dialogue.js';

const base = process.env.AE_TEST_URL;
const token = process.env.AE_TEST_OWNER_KEY;
const workdir = process.env.AE_TEST_WORKDIR;
const output = process.env.AE_TEST_PROOF_DIR;
const runtimeId = process.env.AE_TEST_RUNTIME_ID || null;
assert(
  base && token && workdir && output,
  'Set candidate URL, owner key, workdir and proof directory.'
);
assert(
  new URL(base).hostname === '127.0.0.1' && new URL(base).port === '18795',
  'Use the isolated local candidate.'
);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({
  baseURL: base,
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'no-preference'
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const proof = { base, apiMocks: false, activities: {}, guitars: {}, samples: [], errors };
async function call(route, method = 'GET', data) {
  const response = await context.request.fetch(`/api${route}`, {
    method,
    ...(data ? { data } : {})
  });
  assert(response.ok(), `${method} ${route}: ${response.status()} ${await response.text()}`);
  return response.json();
}
await page.addInitScript(() => {
  window.__THREE_DEVTOOLS__ = new EventTarget();
  window.__officeEvidence = { bubbles: [], scenes: [] };
  window.__THREE_DEVTOOLS__.addEventListener('observe', (event) => {
    if (event.detail.isScene) window.__officeEvidence.scenes.push(event.detail);
  });
  const previous = new Map();
  setInterval(() => {
    for (const bubble of document.querySelectorAll('.speech-bubble')) {
      const text = bubble.hidden || bubble.style.display === 'none' ? '' : bubble.textContent;
      if (previous.get(bubble.id) !== text) {
        window.__officeEvidence.bubbles.push({ role: bubble.id, text, at: performance.now() });
        previous.set(bubble.id, text);
      }
    }
  }, 20);
});
try {
  await call('/login', 'POST', { token });
  const setup = await call('/cockpit/setup', 'POST', {});
  const probe = await call('/workspaces/probe', 'POST', { path: workdir, runtime_id: runtimeId });
  const state = await call('/state');
  for (const agentId of Object.values(setup.mapping)) {
    const agent = state.agents.find((item) => item.id === agentId);
    await call(`/agents/${agentId}`, 'PUT', {
      ...agent,
      runtime_id: runtimeId,
      enabled: true,
      workdir: probe.workspace,
      permission: 'read-only',
      timeout_seconds: 120
    });
  }
  const before = await call('/state');
  await page.goto('/office');
  await page.locator('#card-data_engineer').waitFor();
  await page.waitForFunction(
    () => document.querySelector('#card-data_engineer')?.dataset.state === 'siaga',
    undefined,
    { timeout: 90000 }
  );
  await page.screenshot({ path: path.join(output, 'office-initial.png') });
  proof.geometry = await page.evaluate(() => {
    const scene = window.__officeEvidence.scenes.find((item) =>
      item.getObjectByName('zone_pantry')
    );
    if (!scene) throw new Error('Actual Three.js scene not observed.');
    const position = (name) => {
      const object = scene.getObjectByName(name);
      return object.getWorldPosition(object.position.clone()).toArray();
    };
    const mats = [];
    scene.traverse((object) => {
      if (object.material?.color?.getHex() === 0x28483f) mats.push(object.name);
    });
    return {
      pantry: position('zone_pantry'),
      pot: position('plant_pantry-side'),
      dispenser: position('pantry_dispenser'),
      deskMats: mats.length
    };
  });
  assert(
    Math.abs(proof.geometry.pantry[0] - 8.2) < 0.01 &&
      Math.abs(proof.geometry.pantry[2] + 6.45) < 0.01
  );
  assert(
    Math.abs(proof.geometry.pot[0] - 6.6) < 0.01 && Math.abs(proof.geometry.pot[2] + 6.4) < 0.01
  );
  assert.equal(proof.geometry.deskMats, 0);
  const end = Date.now() + Number(process.env.AE_TEST_OBSERVE_MS || 300000);
  while (Date.now() < end) {
    const sample = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.agent-card')].map((card) => ({
        role: card.dataset.role,
        text:
          card.querySelector('.agent-task')?.textContent ||
          card.querySelector('.task')?.textContent,
        state: card.dataset.state
      }));
      const scene = window.__officeEvidence.scenes.find((item) =>
        item.getObjectByName('zone_pantry')
      );
      const guitars = [];
      scene?.traverse((object) => {
        if (!object.visible || !object.userData.contacts) return;
        const hips = object.parent.parent;
        const contact = (name) =>
          object.localToWorld(object.position.clone().fromArray(object.userData.contacts[name]));
        const hand = (side) => {
          const arm = hips.children.find(
            (child) =>
              child.isGroup &&
              Math.sign(child.position.x) === side &&
              Math.abs(child.position.x) > 0.2
          );
          const forearm = arm.children.find((child) => child.isGroup);
          return forearm.children.find((child) => child.geometry?.parameters?.radius === 0.07);
        };
        const left = hand(-1),
          right = hand(1);
        guitars.push({
          role: hips.parent.userData.roleKey,
          neckDistance: contact('neck').distanceTo(right.getWorldPosition(right.position.clone())),
          strumDistance: contact('strum').distanceTo(left.getWorldPosition(left.position.clone()))
        });
      });
      return {
        cards,
        guitars,
        feed: document.querySelectorAll('#feedList [data-source="visual"]').length
      };
    });
    for (const card of sample.cards) {
      if (card.text && !proof.activities[card.text]) {
        proof.activities[card.text] = card.role;
        console.log(
          JSON.stringify({ activity: card.text, role: card.role, visualEntries: sample.feed })
        );
      }
    }
    for (const guitar of sample.guitars) {
      proof.samples.push(guitar);
      if (proof.guitars[guitar.role]) continue;
      proof.guitars[guitar.role] = guitar;
      await page.screenshot({ path: path.join(output, `guitar-${guitar.role}-main.png`) });
      await page.locator(`#tag-${guitar.role}`).click({ force: true });
      await page.waitForTimeout(1400);
      await page.screenshot({ path: path.join(output, `guitar-${guitar.role}-front.png`) });
      await page.mouse.move(720, 500);
      await page.mouse.down();
      await page.mouse.move(930, 500, { steps: 12 });
      await page.mouse.up();
      await page.screenshot({ path: path.join(output, `guitar-${guitar.role}-side.png`) });
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(300);
  }
  proof.bubbles = await page.evaluate(() => window.__officeEvidence.bubbles);
  const after = await call('/state');
  assert.deepEqual(after.runs, before.runs, 'Observing the office does not start work.');
  assert.deepEqual(after.agents, before.agents, 'Observing the office preserves profiles.');
  proof.visualEntries = await page.locator('#feedList [data-source="visual"]').count();
  assert.equal(proof.visualEntries, 0, 'Idle activities remain on cards.');
  await page.screenshot({ path: path.join(output, 'office-activities.png') });
  await page.reload();
  await page.waitForFunction(
    () => document.querySelector('#card-data_engineer')?.dataset.state === 'siaga'
  );
  assert.equal(await page.locator('#feedList [data-source="visual"]').count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, 'office-mobile.png') });
  proof.runCount = after.runs.length;
  if (process.env.AE_TEST_RUN_INTERRUPTION === 'true') {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const group = await call('/groups', 'POST', {
      id: '',
      name: 'Live Office real interruption',
      description: 'Disposable local acceptance.',
      member_ids: Object.values(setup.mapping),
      human_ids: null,
      project: null,
      scope_levels: null,
      chat_lead_id: null,
      archived_at: null,
      deleted_at: null
    });
    const patterns = CHAT.map(([text]) => text.split('{to}'));
    const start = Date.now();
    let opener;
    while (!opener && Date.now() - start < 60000) {
      opener = await page.evaluate((patterns) => {
        const now = performance.now();
        return window.__officeEvidence.bubbles.findLast(
          (entry) =>
            entry.text &&
            now - entry.at < 500 &&
            patterns.some((parts) =>
              parts.length === 1
                ? entry.text === parts[0]
                : entry.text.startsWith(parts[0]) && entry.text.endsWith(parts[1])
            )
        );
      }, patterns);
      if (!opener) await page.waitForTimeout(100);
    }
    assert(opener, 'Wait for an actual new opener before invoking work.');
    const role = opener.role.replace('bubble-', '');
    const messageId = crypto.randomUUID();
    await call('/messages', 'POST', {
      id: messageId,
      group_id: group.id,
      side_chat_id: null,
      body: 'Read SMOKE_INPUT.txt with a read-only file tool. Reply with its exact first line and the number of nonempty lines. Do not modify files, browse, delegate, invoke agents, or ask questions.',
      recipients: [setup.mapping[role]],
      reply_to: null,
      artifacts: []
    });
    proof.interruption = { role, opener, messageId, statuses: [], browserWorking: false };
    const deadline = Date.now() + 140000;
    let run;
    while (Date.now() < deadline) {
      const current = await call('/state');
      run = current.runs.find((item) => item.message_id === messageId);
      if (run && proof.interruption.statuses.at(-1) !== run.status)
        proof.interruption.statuses.push(run.status);
      const working = await page.locator(`#card-${role}[data-state="bekerja"]`).count();
      if (working && !proof.interruption.browserWorking) {
        proof.interruption.browserWorking = true;
        await page.screenshot({ path: path.join(output, 'real-run-working.png') });
      }
      if (run && !['queued', 'starting', 'running', 'waiting'].includes(run.status)) break;
      await page.waitForTimeout(200);
    }
    proof.interruption.run = run;
    proof.interruption.bubbles = await page.evaluate(() => window.__officeEvidence.bubbles);
    assert(run, 'The real message must create a run.');
    assert(
      proof.interruption.browserWorking,
      'Real work must interrupt the idle card in the browser.'
    );
    assert(
      ['succeeded', 'failed', 'timed_out', 'interrupted', 'cancelled'].includes(run.status),
      'The real run must reach a terminal state.'
    );
    assert(run.native_session_id, 'Provider session must be real.');
    const pair = CHAT.find(([text]) => {
      const parts = text.split('{to}');
      return parts.length === 1
        ? opener.text === text
        : opener.text.startsWith(parts[0]) && opener.text.endsWith(parts[1]);
    });
    assert(pair, 'The interrupted opener must belong to the reference catalogue.');
    assert(
      !proof.interruption.bubbles.some(
        (entry) => entry.at > opener.at && entry.at < opener.at + 6500 && entry.text === pair[1]
      ),
      'Work must cancel the pending reply.'
    );
    proof.interruption.pendingReplyCancelled = true;
    proof.interruption.providerSucceeded = run.status === 'succeeded' && run.exit_code === 0;
    await call(`/groups/${group.id}/archive`, 'POST', {});
    await page.screenshot({ path: path.join(output, 'real-run-completed.png') });
  }
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(
    JSON.stringify({
      activities: Object.keys(proof.activities),
      guitarRoles: Object.keys(proof.guitars),
      visualEntries: proof.visualEntries,
      runCount: proof.runCount,
      errors
    })
  );
} finally {
  await writeFile(path.join(output, 'idle-proof.json'), JSON.stringify(proof, null, 2));
  await browser.close();
}
