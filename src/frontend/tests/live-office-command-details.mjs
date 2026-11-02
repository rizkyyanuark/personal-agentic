import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
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
async function call(route, method = 'GET', data) {
  const response = await context.request.fetch(`/api${route}`, {
    method,
    ...(data ? { data } : {})
  });
  assert(response.ok(), `${method} ${route}: HTTP ${response.status()}`);
  return response.json();
}
try {
  await call('/login', 'POST', { token: process.env.AE_TEST_OWNER_KEY });
  const before = await call('/state');
  assert(
    !before.runs.some((run) => ['queued', 'starting', 'running', 'waiting'].includes(run.status))
  );
  const snapshot = await call('/cockpit/state');
  if (process.env.AE_TEST_HISTORY_RECEIPT) {
    const prior = JSON.parse(await readFile(process.env.AE_TEST_HISTORY_RECEIPT, 'utf8'));
    const events = snapshot.events.filter((event) => event.run_id === prior.run.id);
    assert.deepEqual(
      events.map((event) => [
        event.id,
        event.created_at,
        event.activity.step_index,
        event.activity.state
      ]),
      prior.events.map((event) => [
        event.id,
        event.created_at,
        event.activity.step_index,
        event.activity.state
      ])
    );
    assert(events.some((event) => event.summary === 'Membaca src/cart.js, package.json'));
    assert(
      events.some((event) => event.summary === 'Menjalankan: Evaluasi JavaScript dengan Node.js')
    );
    assert(!events.some((event) => ['Membaca', 'Perintah selesai'].includes(event.summary)));
    proof.history = { runId: prior.run.id, preservedIdentityAndTime: true, events };
  }
  await page.goto('/office');
  await page.locator('[data-testid="cockpit-host"] canvas').waitFor();
  if (proof.history) {
    await page.waitForFunction(
      (id) => document.querySelector(`#feedList [data-run-id="${id}"]`),
      proof.history.runId
    );
    const text = await page
      .locator(`#feedList [data-run-id="${proof.history.runId}"]`)
      .allTextContents();
    assert(text.some((line) => line.includes('Membaca src/cart.js, package.json')));
    assert(text.some((line) => line.includes('Evaluasi JavaScript dengan Node.js')));
    await page.screenshot({ path: path.join(output, 'historical-details.png') });
  }
  const agent = before.agents.find((agent) => agent.id === snapshot.mapping.data_engineer);
  assert(agent?.workdir && agent.permission === 'read-only');
  const group = await call('/groups', 'POST', {
    id: '',
    name: 'Command metadata acceptance',
    description: 'Real read-only multi-file and Node.js native verification.',
    member_ids: [agent.id],
    human_ids: null,
    project: null,
    scope_levels: null,
    chat_lead_id: null,
    archived_at: null,
    deleted_at: null
  });
  const messageId = crypto.randomUUID();
  await call('/messages', 'POST', {
    id: messageId,
    group_id: group.id,
    side_chat_id: null,
    body: `This is read-only terminal activity verification on existing disposable fixtures. Run exactly these two separate terminal calls in the attached workdir, then report the actual printed total. Do not inspect other files, modify anything, browse, delegate, invoke agents, ask questions, commit or push.
1. Get-Content -LiteralPath cart-activity/src/cart.js, cart-activity/package.json
2. node --input-type=module -e "import { total } from './cart-activity/src/cart.js'; console.log(total([{price:12,quantity:3}]))"
Use separate calls, without pipelines or compound commands.`,
    recipients: [agent.id],
    reply_to: null,
    artifacts: []
  });
  let run;
  const deadline = Date.now() + 220000;
  while (Date.now() < deadline) {
    run = (await call('/state')).runs.find((run) => run.message_id === messageId);
    if (run && proof.statuses.at(-1) !== run.status) {
      proof.statuses.push(run.status);
      console.log(JSON.stringify({ status: run.status }));
    }
    if (await page.locator('#card-data_engineer[data-state="bekerja"]').count())
      proof.browserWorking = true;
    if (run && !['queued', 'starting', 'running', 'waiting'].includes(run.status)) break;
    await page.waitForTimeout(700);
  }
  assert(run);
  proof.run = {
    id: run.id,
    status: run.status,
    exitCode: run.exit_code,
    nativeSession: run.native_session_id
  };
  assert.equal(run.status, 'succeeded', run.error ?? 'Provider run incomplete');
  assert.equal(run.exit_code, 0);
  assert(run.native_session_id && proof.browserWorking);
  const after = await call('/state');
  assert.deepEqual(after.agents, before.agents, 'Read-only verification never changes profiles.');
  const live = await call('/cockpit/state');
  proof.events = live.events.filter((event) => event.run_id === run.id);
  assert(
    proof.events.some(
      (event) => event.summary === 'Membaca cart-activity/src/cart.js, cart-activity/package.json'
    )
  );
  assert(
    proof.events.some(
      (event) => event.summary === 'Menjalankan: Evaluasi JavaScript dengan Node.js'
    )
  );
  assert(!proof.events.some((event) => ['Membaca', 'Perintah selesai'].includes(event.summary)));
  const frames = (await call(`/runs/${run.id}/events`))
    .filter((event) => event.kind === 'run.output')
    .flatMap((event) => {
      try {
        return [JSON.parse(event.payload.line)];
      } catch {
        return [];
      }
    });
  proof.nodePrinted36 = frames.some(
    (frame) =>
      frame.type === 'item.completed' &&
      frame.item?.type === 'command_execution' &&
      frame.item.exit_code === 0 &&
      frame.item.aggregated_output?.trim() === '36'
  );
  assert(proof.nodePrinted36, 'Node.js must actually run and print the real total.');
  await page.waitForFunction(
    (id) => document.querySelector(`#feedList [data-run-id="${id}"]`),
    run.id
  );
  const rows = page.locator(`#feedList [data-run-id="${run.id}"]`);
  assert.equal(await rows.count(), proof.events.length);
  await page.reload();
  await page.waitForFunction(
    (id) => document.querySelector(`#feedList [data-run-id="${id}"]`),
    run.id
  );
  assert.equal(await rows.count(), proof.events.length);
  assert.equal(
    await rows.locator('a, button, [role="link"]').count(),
    0,
    'The office feed is passive.'
  );
  assert.equal(await rows.locator('.feed-tool, .feed-trace').count(), 0);
  await rows.first().click();
  assert.equal(
    new URL(page.url()).pathname,
    '/office',
    'Reading an activity cannot navigate into the application.'
  );
  proof.passiveFeed = true;
  await page.goto('/office');
  await page.waitForFunction(
    (id) => document.querySelector(`#feedList [data-run-id="${id}"]`),
    run.id
  );
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    if (width <= 1180) await page.locator('#tabFeed').click();
    await page.waitForTimeout(300);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false
    );
    await page.screenshot({ path: path.join(output, `command-details-${width}.png`) });
    proof.viewports.push(width);
  }
  assert.equal(await page.locator('[data-source="visual"]').count(), 0);
  assert.equal(proof.errors.length, 0);
  proof.passed = true;
} finally {
  await writeFile(path.join(output, 'command-details-proof.json'), JSON.stringify(proof, null, 2));
  await browser.close();
  console.log(
    JSON.stringify({
      passed: proof.passed ?? false,
      run: proof.run,
      historyPreserved: proof.history?.preservedIdentityAndTime,
      nodePrinted36: proof.nodePrinted36,
      output
    })
  );
}
