import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
const base = process.env.AE_TEST_URL;
const output = process.env.AE_TEST_PROOF_DIR;
assert.equal(base, 'http://127.0.0.1:18795');
assert(output && process.env.AE_TEST_OWNER_KEY);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({
  baseURL: base,
  viewport: { width: 1440, height: 1000 }
});
const page = await context.newPage();
const proof = { apiMocks: false, errors: [], statuses: [], viewports: [] };
page.on('pageerror', (error) => proof.errors.push(error.message));
await page.addInitScript(() => {
  window.__THREE_DEVTOOLS__ = new EventTarget();
  window.__officeScenes = [];
  window.__THREE_DEVTOOLS__.addEventListener('observe', (event) => {
    if (event.detail.isScene) window.__officeScenes.push(event.detail);
  });
});
async function call(route, method = 'GET', data) {
  const response = await context.request.fetch(`/api${route}`, {
    method,
    ...(data ? { data } : {})
  });
  assert(response.ok(), `${method} ${route}: HTTP ${response.status()}`);
  return response.json();
}
async function passiveFeed() {
  assert.equal(
    await page
      .locator(
        '#feedList a, #feedList button, #feedList [role="link"], #feedList .feed-tool, #feedList .feed-trace'
      )
      .count(),
    0
  );
  assert.equal(await page.locator('.agent-activity', { hasText: 'Kegiatan visual' }).count(), 0);
}
async function sampleGuitar() {
  return page.evaluate(() => {
    const scene = window.__officeScenes.find((scene) => scene.getObjectByName('zone_pantry'));
    for (const card of document.querySelectorAll('.agent-card')) {
      const role = card.dataset.role;
      if (card.querySelector('.agent-task')?.textContent !== 'Bermain gitar') continue;
      const root = scene?.getObjectByName(`character_${role}`);
      const body = root?.getObjectByName('guitar_body');
      const guitar = body?.parent;
      if (!guitar?.visible) continue;
      body.geometry.computeBoundingBox();
      const origin = root.worldToLocal(guitar.getWorldPosition(guitar.position.clone()));
      const head = root.worldToLocal(
        guitar.getObjectByName('guitar_headstock').getWorldPosition(guitar.position.clone())
      );
      const hands = [];
      root.traverse((object) => {
        if (
          object.geometry?.type === 'SphereGeometry' &&
          object.geometry.parameters.radius === 0.07
        )
          hands.push(object);
      });
      const picking = hands.find((hand) => hand.parent.parent.position.x < 0);
      const fretting = hands.find((hand) => hand.parent.parent.position.x > 0);
      const pickingLocal = guitar.worldToLocal(picking.getWorldPosition(picking.position.clone()));
      const frettingLocal = guitar.worldToLocal(
        fretting.getWorldPosition(fretting.position.clone())
      );
      const normal = guitar.getWorldDirection(guitar.position.clone());
      const front = root.getWorldDirection(root.position.clone());
      return {
        role,
        determinant: guitar.matrixWorld.determinant(),
        headDelta: head.sub(origin).toArray(),
        frontDot: normal.dot(front),
        pickingClearance: pickingLocal.z - 0.07 - body.geometry.boundingBox.max.z,
        frettingZ: frettingLocal.z,
        strings: guitar.getObjectByName('guitar_strings').geometry.attributes.position.count / 2,
        tuners: guitar.children.filter((child) => child.name === 'guitar_tuner').length,
        torsoClearance: guitar.position.z + body.geometry.boundingBox.min.z - 0.26
      };
    }
    return null;
  });
}
try {
  await call('/login', 'POST', { token: process.env.AE_TEST_OWNER_KEY });
  const before = await call('/state');
  assert(
    !before.runs.some((run) => ['queued', 'starting', 'running', 'waiting'].includes(run.status))
  );
  const office = await call('/cockpit/state');
  const agent = before.agents.find((agent) => agent.id === office.mapping.data_engineer);
  assert(agent?.permission === 'read-only');
  await page.goto('/office');
  await page.locator('[data-testid="cockpit-host"] canvas').waitFor();
  await passiveFeed();
  const group = before.groups.find((group) => group.name === 'Command metadata acceptance');
  assert(group);
  let run;
  const messageId = crypto.randomUUID();
  await call('/messages', 'POST', {
    id: messageId,
    group_id: group.id,
    side_chat_id: null,
    recipients: [agent.id],
    reply_to: null,
    artifacts: [],
    body: 'Read-only local verification: run Get-Content -LiteralPath cart-activity/package.json, cart-activity/src/cart.js, cart-activity/cart.test.js to read these three existing files, then run npm test --prefix cart-activity as a separate terminal call. Report actual results. Do not modify files, browse, install, delegate, ask questions, commit, push or deploy.'
  });
  await page.locator('#card-data_engineer').click();
  const deadline = Date.now() + 220000;
  while (Date.now() < deadline) {
    run = (await call('/state')).runs.find((run) => run.message_id === messageId);
    if (run && proof.statuses.at(-1) !== run.status) {
      proof.statuses.push(run.status);
      console.log(JSON.stringify({ status: run.status }));
    }
    if (!proof.workBubble) {
      proof.workBubble = await page.evaluate(() => {
        const card = document.querySelector('#card-data_engineer');
        const bubble = document.querySelector('#bubble-data_engineer[data-kind="work"]');
        if (
          card?.dataset.state !== 'bekerja' ||
          !bubble ||
          bubble.hidden ||
          getComputedStyle(bubble).display === 'none' ||
          (card.querySelector('.agent-task')?.title.length ?? 0) <= 48
        )
          return null;
        const text = bubble.querySelector('.bubble-text');
        return {
          background: getComputedStyle(bubble).backgroundColor,
          tail: getComputedStyle(bubble, '::after').backgroundColor,
          preview: text.textContent,
          full: card.querySelector('.agent-task').title,
          count: [
            ...new Intl.Segmenter('id', { granularity: 'grapheme' }).segment(text.textContent)
          ].length,
          height: text.getBoundingClientRect().height,
          lineHeight: parseFloat(getComputedStyle(text).lineHeight),
          className: bubble.className
        };
      });
      if (proof.workBubble) {
        assert.equal(proof.workBubble.background, 'rgb(255, 255, 255)');
        assert.equal(proof.workBubble.tail, proof.workBubble.background);
        assert(proof.workBubble.count <= 48 && proof.workBubble.preview.endsWith('\u2026'));
        assert(proof.workBubble.full.includes('cart.test.js'));
        assert(proof.workBubble.height <= proof.workBubble.lineHeight * 3 + 1);
        await page.screenshot({ path: path.join(output, 'work-bubble-desktop.png') });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(500);
        proof.mobileWorking =
          (await page.locator('#card-data_engineer[data-state="bekerja"]').count()) > 0;
        const visibleWork = await page
          .locator('.speech-bubble:not([data-kind="dialogue"])')
          .evaluateAll(
            (elements) =>
              elements.filter(
                (element) => !element.hidden && getComputedStyle(element).display !== 'none'
              ).length
          );
        assert.equal(visibleWork, 0);
        proof.mobileWorkSuppressed = true;
        await page.screenshot({ path: path.join(output, 'work-mobile-card.png') });
        await page.setViewportSize({ width: 1440, height: 1000 });
      }
    }
    if (run && !['queued', 'starting', 'running', 'waiting'].includes(run.status)) break;
    await page.waitForTimeout(200);
  }
  assert(run);
  proof.run = {
    id: run.id,
    status: run.status,
    exitCode: run.exit_code,
    nativeSession: run.native_session_id
  };
  assert.equal(run.status, 'succeeded', run.error ?? 'Provider did not complete');
  assert.equal(run.exit_code, 0);
  assert(run.native_session_id && proof.workBubble && proof.mobileWorking);
  await page.waitForFunction(
    () => document.querySelector('#card-data_engineer')?.dataset.state === 'siaga'
  );
  assert.equal(await page.locator('#card-data_engineer .agent-status').textContent(), 'Santai');
  await passiveFeed();
  assert.equal(new URL(page.url()).pathname, '/office');
  const after = await call('/state');
  assert.deepEqual(after.agents, before.agents);
  await page.locator('#btnResetCamera').click();
  await page.locator('#btnToggleSidebars').click();
  proof.guitar = null;
  const guitarDeadline = Date.now() + 240000;
  while (!proof.guitar && Date.now() < guitarDeadline) {
    proof.guitar = await sampleGuitar();
    if (!proof.guitar) await page.waitForTimeout(500);
  }
  assert(proof.guitar, 'Observe an actual naturally playing guitar actor.');
  const guitar = proof.guitar;
  assert(guitar.determinant > 0 && guitar.headDelta[0] > 0.5 && guitar.headDelta[1] > 0.15);
  assert(guitar.frontDot > 0.99 && guitar.pickingClearance > 0 && guitar.torsoClearance > 0.02);
  assert.equal(guitar.strings, 6);
  assert.equal(guitar.tuners, 6);
  await page.locator(`#tag-${guitar.role}`).press('Enter');
  await page.waitForTimeout(1400);
  await page.screenshot({ path: path.join(output, 'guitar-focused.png') });
  await page.mouse.move(700, 430);
  await page.mouse.down();
  await page.mouse.move(820, 450, { steps: 12 });
  await page.mouse.up();
  await page.screenshot({ path: path.join(output, 'guitar-orbit.png') });
  await page.locator('#btnToggleSidebars').click();
  await page.locator('#btnResetCamera').click();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    if (width <= 1180) await page.locator('#tabFeed').click();
    await page.waitForTimeout(250);
    await passiveFeed();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false
    );
    await page.screenshot({ path: path.join(output, `office-${width}.png`) });
    proof.viewports.push(width);
  }
  const count = await page.locator(`#feedList [data-run-id="${run.id}"]`).count();
  assert(count >= 2);
  await page.reload();
  await page.waitForFunction(
    (id) => document.querySelector(`#feedList [data-run-id="${id}"]`),
    run.id
  );
  assert.equal(await page.locator(`#feedList [data-run-id="${run.id}"]`).count(), count);
  await passiveFeed();
  assert.equal(proof.errors.length, 0);
  proof.passed = true;
} finally {
  await writeFile(path.join(output, 'presentation-proof.json'), JSON.stringify(proof, null, 2));
  await browser.close();
  console.log(
    JSON.stringify({
      passed: proof.passed ?? false,
      run: proof.run,
      workBubble: !!proof.workBubble,
      guitar: proof.guitar,
      output
    })
  );
}
