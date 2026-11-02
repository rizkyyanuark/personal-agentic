import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';

const base = process.env.AE_TEST_URL;
const output = process.env.AE_TEST_PROOF_DIR;
assert(base === 'http://127.0.0.1:18795' && output && process.env.AE_TEST_OWNER_KEY);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({
  baseURL: base,
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1
});
const page = await context.newPage();
const proof = { apiMocks: false, errors: [], desktops: [] };
let tenant;
let filterGroup;
page.on('pageerror', (error) => proof.errors.push(error.message));
async function call(route, method = 'GET', data) {
  const response = await context.request.fetch(`/api${route}`, {
    method,
    ...(data ? { data } : {})
  });
  assert(response.ok(), `${method} ${route}: HTTP ${response.status()}`);
  return response.json();
}
await page.addInitScript(() => {
  window.__THREE_DEVTOOLS__ = new EventTarget();
  window.__officeProof = { scenes: [], bubbles: [], pantry: [] };
  window.__THREE_DEVTOOLS__.addEventListener('observe', (event) => {
    if (event.detail.isScene) window.__officeProof.scenes.push(event.detail);
  });
  const prior = new Map();
  let lastPantrySample = 0;
  setInterval(() => {
    for (const bubble of document.querySelectorAll('.speech-bubble')) {
      const text = bubble.hidden || bubble.style.display === 'none' ? '' : bubble.textContent;
      if (prior.get(bubble.id) !== text) {
        window.__officeProof.bubbles.push({ role: bubble.id, text, at: performance.now() });
        prior.set(bubble.id, text);
      }
    }
    if (performance.now() - lastPantrySample > 500) {
      lastPantrySample = performance.now();
      const scene = window.__officeProof.scenes.find((item) => item.getObjectByName('zone_pantry'));
      const agents = [...document.querySelectorAll('.agent-card')].map((card) => {
        const character = scene?.getObjectByName(`character_${card.dataset.role}`);
        return {
          role: card.dataset.role,
          text: card.querySelector('.agent-task')?.textContent,
          position: character?.getWorldPosition(character.position.clone()).toArray()
        };
      });
      window.__officeProof.pantry.push({ at: lastPantrySample, agents });
    }
  }, 20);
});
try {
  const anonymous = await browser.newContext({ baseURL: base });
  assert.equal((await anonymous.request.get('/api/cockpit/state')).status(), 200);
  assert.equal((await anonymous.request.post('/api/cockpit/setup')).status(), 401);
  assert.equal((await anonymous.request.put('/api/cockpit/mapping')).status(), 401);
  await anonymous.close();
  proof.authentication = { publicSnapshot: 200, anonymousSetup: 401, anonymousMapping: 401 };
  await call('/login', 'POST', { token: process.env.AE_TEST_OWNER_KEY });
  const before = await call('/state');
  await page.goto('/organization');
  const opened = context.waitForEvent('page');
  await page.getByRole('button', { name: 'Live Office', exact: true }).click({ noWaitAfter: true });
  const office = await opened;
  await office.waitForLoadState('domcontentloaded');
  await expect(office).toHaveURL(`${base}/office`);
  await office.locator('[data-testid="cockpit-host"] canvas').waitFor();
  await office.close();
  proof.organizationEntrypoint = true;
  await page.goto('/office');
  await page.waitForFunction(
    () => document.querySelector('#card-data_engineer')?.dataset.state === 'siaga'
  );
  proof.geometry = await page.evaluate(() => {
    const scene = window.__officeProof.scenes.find((item) => item.getObjectByName('zone_pantry'));
    const bounds = (name) => {
      let result;
      (typeof name === 'string' ? scene.getObjectByName(name) : name).traverse((object) => {
        if (!object.geometry) return;
        object.geometry.computeBoundingBox();
        const box = object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld);
        if (result) result.union(box);
        else result = box;
      });
      return { min: result.min.toArray(), max: result.max.toArray() };
    };
    const position = (name) => {
      const object = scene.getObjectByName(name);
      return object.getWorldPosition(object.position.clone()).toArray();
    };
    const desks = ['data_engineer', 'data_scientist', 'research_scientist', 'ml_engineer'];
    return {
      pantry: { position: position('zone_pantry'), ...bounds('zone_pantry') },
      pot: { position: position('plant_pantry-side'), ...bounds('plant_pantry-side') },
      dispenser: bounds('pantry_dispenser'),
      desks: desks.map((role) => ({
        role,
        surface: bounds(
          scene.getObjectByName(`workstation_${role}`).children.find((child) => child.isMesh)
        ),
        keyboard: bounds(`keyboard_${role}`),
        mouse: bounds(`mouse_${role}`)
      }))
    };
  });
  const { pantry, pot, dispenser } = proof.geometry;
  assert(Math.abs(pantry.position[0] - 8.2) < 0.01 && Math.abs(pantry.position[2] + 6.45) < 0.01);
  assert(Math.abs(pot.position[0] - 6.6) < 0.01 && Math.abs(pot.position[2] + 6.4) < 0.01);
  for (const object of [pantry, pot, dispenser]) {
    assert(object.max[0] < 9.41 && object.min[2] > -7.41, 'Furniture clears the inside wall.');
  }
  assert(pot.max[0] < pantry.min[0], 'Pot clears the cabinet.');
  assert(pantry.max[2] < dispenser.min[2], 'Dispenser clears the cabinet.');
  for (const desk of proof.geometry.desks) {
    assert(
      Math.abs(desk.keyboard.min[1] - desk.surface.max[1]) < 0.001,
      `${desk.role} keyboard rests on the desktop`
    );
    assert(
      Math.abs(desk.mouse.min[1] - desk.surface.max[1]) < 0.001,
      `${desk.role} mouse rests on the desktop`
    );
    await page.locator(`#card-${desk.role}`).click();
    await page.waitForTimeout(1400);
    await page.screenshot({ path: path.join(output, `desk-${desk.role}.png`) });
    proof.desktops.push(desk.role);
    await page.keyboard.press('Escape');
  }
  proof.timingWindowStart = await page.evaluate(() => performance.now());
  await page.waitForTimeout(120000);
  await page.waitForFunction(
    () =>
      window.__officeProof.pantry.some(
        (sample) =>
          sample.agents.filter((agent) => /^(Menikmati kopi|Mengambil air)/.test(agent.text))
            .length >= 2
      ),
    undefined,
    { timeout: 180000 }
  );
  proof.bubbles = await page.evaluate(() => window.__officeProof.bubbles);
  proof.pantry = await page.evaluate(() => window.__officeProof.pantry);
  proof.twoPantryUsers = proof.pantry.find(
    (sample) =>
      sample.agents.filter((agent) => /^(Menikmati kopi|Mengambil air)/.test(agent.text)).length >=
      2
  );
  assert(proof.twoPantryUsers, 'Observe two actual pantry occupants.');
  proof.details = [];
  for (const { role } of proof.geometry.desks) {
    await page.locator(`#card-${role}`).click();
    const detail = await page.evaluate(
      (role) => ({
        role,
        card: document.querySelector(`#card-${role} .agent-task`).textContent,
        label: document.querySelector(`#card-${role} .agent-activity`).textContent,
        narrative: document.querySelector(`.character-narrative[data-role="${role}"] p`)
          ?.textContent
      }),
      role
    );
    assert.notEqual(detail.label, 'Kegiatan visual');
    if (detail.label === 'Menunggu tugas baru.') assert.equal(detail.narrative, detail.card);
    proof.details.push(detail);
    await page.keyboard.press('Escape');
  }
  proof.feedBeforeSwitch = await page.locator('#feedList [data-source="visual"]').count();
  assert.equal(proof.feedBeforeSwitch, 0, 'Idle movement never enters work history.');
  await page.screenshot({ path: path.join(output, 'office-final.png') });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(500);
  assert.equal(await page.locator('.agent-activity', { hasText: 'Kegiatan visual' }).count(), 0);
  assert(
    (await page.locator('.agent-task').allTextContents()).every(
      (text) =>
        !/^(Menonton TV|Bermain PS|Menikmati kopi|Mengambil air|Bermain gitar|Bersantai|Membaca di dekat|Duduk di area meeting|Menuju)/.test(
          text
        )
    ),
    'Unavailable or reduced-motion cards cannot claim active leisure.'
  );
  proof.reducedMotion = true;
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await context.setOffline(true);
  await page.waitForTimeout(12000);
  proof.offlineCards = await page.locator('.agent-card').allTextContents();
  assert.equal(await page.locator('.agent-activity', { hasText: 'Kegiatan visual' }).count(), 0);
  assert(
    (await page.locator('.agent-task').allTextContents()).every(
      (text) =>
        !/^(Menonton TV|Bermain PS|Menikmati kopi|Mengambil air|Bermain gitar|Bersantai|Membaca di dekat|Duduk di area meeting|Menuju)/.test(
          text
        )
    ),
    'Unavailable or reduced-motion cards cannot claim active leisure.'
  );
  await context.setOffline(false);
  await page.waitForFunction(
    () => document.querySelector('#card-data_engineer')?.dataset.state === 'siaga'
  );
  filterGroup = await call('/groups', 'POST', {
    id: '',
    name: 'Live Office empty filter',
    description: 'Disposable filter acceptance.',
    member_ids: [],
    human_ids: null,
    project: null,
    scope_levels: null,
    chat_lead_id: null,
    archived_at: null,
    deleted_at: null
  });
  await page.goto(`/office?group=${filterGroup.id}`);
  await page.waitForFunction(
    () => document.querySelector('#card-data_engineer')?.dataset.state === 'filtered'
  );
  assert.equal(await page.locator('#feedList [data-source="visual"]').count(), 0);
  proof.filterIsolation = true;
  await page.goto('/office');
  await page.waitForFunction(
    () => document.querySelector('#card-data_engineer')?.dataset.state === 'siaga'
  );
  tenant = await call('/tenants', 'POST', {
    name: `Live Office isolation ${crypto.randomUUID().slice(0, 8)}`
  });
  await context.addCookies([{ name: 'ae_workspace', value: tenant.id, url: base }]);
  await page.reload();
  await page.waitForFunction(
    () => document.querySelector('#card-data_engineer')?.dataset.state === 'unmapped'
  );
  assert.equal(await page.locator('#feedList [data-source="visual"]').count(), 0);
  proof.workspaceIsolation = true;
  await context.addCookies([{ name: 'ae_workspace', value: 'default', url: base }]);
  await page.goto('/organization/live-preview');
  await page.waitForFunction(
    () => document.querySelector('#card-data_engineer')?.dataset.state === 'siaga'
  );
  assert.equal(await page.locator('#feedList [data-source="visual"]').count(), 0);
  proof.legacyEntrypointAndRemount = true;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, 'office-final-mobile.png') });
  const after = await call('/state');
  assert.deepEqual(after.runs, before.runs);
  assert.deepEqual(after.agents, before.agents);
  assert.equal(proof.errors.length, 0);
  proof.passed = true;
} finally {
  await context.setOffline(false);
  await context.addCookies([{ name: 'ae_workspace', value: 'default', url: base }]);
  if (filterGroup) await call(`/groups/${filterGroup.id}/archive`, 'POST', {});
  if (tenant) await call(`/tenants/${tenant.id}`, 'DELETE', {});
  await writeFile(path.join(output, 'context-proof.json'), JSON.stringify(proof, null, 2));
  await browser.close();
  console.log(JSON.stringify({ passed: proof.passed ?? false, output }));
}
