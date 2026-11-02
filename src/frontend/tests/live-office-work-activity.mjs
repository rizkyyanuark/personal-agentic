import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const base = process.env.AE_TEST_URL;
const output = process.env.AE_TEST_PROOF_DIR;
const fixture = process.env.AE_TEST_WORKDIR;
assert.equal(base, 'http://127.0.0.1:18795');
assert(output && fixture && process.env.AE_TEST_OWNER_KEY);
await mkdir(output, { recursive: true });
await mkdir(path.join(fixture, 'src'), { recursive: true });
await writeFile(
  path.join(fixture, 'package.json'),
  JSON.stringify({
    name: 'office-work-acceptance',
    private: true,
    type: 'module',
    scripts: { build: 'node --check src/cart.js', test: 'node --test cart.test.js' }
  })
);
await writeFile(
  path.join(fixture, 'src/cart.js'),
  'export function total(items) { return items.reduce((sum, item) => sum + item.quantity, 0); }\n'
);
await writeFile(
  path.join(fixture, 'cart.test.js'),
  "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { total } from './src/cart.js';\ntest('cart totals include price and quantity', () => { assert.equal(total([{price: 12, quantity: 3}, {price: 5, quantity: 2}]), 46); assert.equal(total([]), 0); });\n"
);
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
  assert(
    response.ok(),
    `${method} ${route}: ${response.status()} ${response.ok() ? '' : await response.text()}`
  );
  return response.json();
}
let original;
let group;
let run;
try {
  await call('/login', 'POST', { token: process.env.AE_TEST_OWNER_KEY });
  const snapshot = await call('/cockpit/state');
  const state = await call('/state');
  assert(
    !state.runs.some((item) => ['queued', 'starting', 'running', 'waiting'].includes(item.status))
  );
  original = state.agents.find((agent) => agent.id === snapshot.mapping.data_engineer);
  assert(original);
  await call(`/agents/${original.id}`, 'PUT', {
    ...original,
    permission: 'workspace-write',
    timeout_seconds: 240,
    workdir: { ...original.workdir, path: fixture, canonical_path: fixture, git_root: null }
  });
  group = await call('/groups', 'POST', {
    id: '',
    name: 'Office work trace acceptance',
    description: 'Real disposable cart repair.',
    member_ids: [original.id],
    human_ids: null,
    project: null,
    scope_levels: null,
    chat_lead_id: null,
    archived_at: null,
    deleted_at: null
  });
  await page.goto('/office');
  await page.locator('[data-testid="cockpit-host"] canvas').waitFor();
  const messageId = crypto.randomUUID();
  await call('/messages', 'POST', {
    id: messageId,
    group_id: group.id,
    side_chat_id: null,
    body: 'Work only in the attached disposable cart project. Locate src JavaScript files using a file search, read src/cart.js and package.json, fix total so it sums price times quantity, then run npm run build and npm test. Use separate terminal actions for searching, reading, building and testing so each result can be reviewed independently. Use apply_patch for the source change. Do not commit, push, browse, delegate or ask questions. Do not access parent folders. Report what changed and actual build/test results.',
    recipients: [original.id],
    reply_to: null,
    artifacts: []
  });
  const deadline = Date.now() + 280000;
  while (Date.now() < deadline) {
    const current = await call('/state');
    run = current.runs.find((item) => item.message_id === messageId);
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
  const code = await readFile(path.join(fixture, 'src/cart.js'), 'utf8');
  assert(code.includes('price'));
  const live = await call('/cockpit/state');
  proof.events = live.events.filter((event) => event.run_id === run.id);
  proof.operations = [
    ...new Set(proof.events.map((event) => event.activity?.operation).filter(Boolean))
  ];
  for (const operation of ['read_file', 'search_files', 'edit_file', 'build', 'test'])
    assert(
      proof.operations.includes(operation),
      `Missing real operation ${operation}: ${proof.operations}`
    );
  assert.equal(
    new Set(proof.events.map((event) => event.activity.step_index)).size,
    proof.events.length
  );
  assert(
    proof.events.every((event) => event.group_id === group.id && event.activity.state !== 'active')
  );
  assert(
    !live.events.some(
      (event) => event.kind === 'activity_updated' || event.activity?.category === 'responding'
    )
  );
  await page.waitForFunction(
    (id) => document.querySelector(`#feedList [data-run-id="${id}"]`),
    run.id
  );
  const rows = page.locator(`#feedList [data-run-id="${run.id}"]`);
  assert.equal(await rows.count(), proof.events.length);
  for (const time of await rows.locator('time').allTextContents())
    assert(/^\d{2}:\d{2}:\d{2}$/.test(time), time);
  assert.equal(await page.locator('[data-source="visual"]').count(), 0);
  proof.feedCount = await rows.count();
  await page.waitForTimeout(8000);
  assert.equal(await rows.count(), proof.feedCount, 'Idle roaming preserves real work history.');
  await page.reload();
  await page.waitForFunction(
    (id) => document.querySelector(`#feedList [data-run-id="${id}"]`),
    run.id
  );
  assert.equal(await rows.count(), proof.feedCount, 'Work history survives reload.');
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
    await page.waitForTimeout(250);
    proof.viewports.push({
      width,
      overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    });
    assert.equal(proof.viewports.at(-1).overflow, false);
    await page.screenshot({ path: path.join(output, `work-feed-${width}.png`) });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('[data-source="visual"]').count(), 0);
  proof.reducedMotion = true;
  assert.equal(proof.errors.length, 0);
  proof.passed = true;
} finally {
  if (original && (!run || !['queued', 'starting', 'running', 'waiting'].includes(run.status))) {
    const current = (await call('/state')).agents.find((agent) => agent.id === original.id);
    await call(`/agents/${original.id}`, 'PUT', { ...original, revision: current.revision });
    proof.profileRestored = true;
  }
  if (group) proof.groupId = group.id;
  await writeFile(path.join(output, 'work-activity-proof.json'), JSON.stringify(proof, null, 2));
  await browser.close();
  console.log(
    JSON.stringify({
      passed: proof.passed ?? false,
      run: proof.run,
      operations: proof.operations,
      profileRestored: proof.profileRestored,
      output
    })
  );
}
