import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { chromium } from '@playwright/test';
const base = process.env.AE_TEST_URL;
const output = process.env.AE_TEST_PROOF_DIR;
assert.equal(base, 'http://127.0.0.1:18795');
assert(output && process.env.AE_TEST_OWNER_KEY && process.env.AE_TEST_WORKDIR);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({
  baseURL: base,
  viewport: { width: 1440, height: 1000 }
});
const page = await context.newPage();
const proof = { cases: [], errors: [], apiMocks: false };
page.on('pageerror', (error) => proof.errors.push(error.message));
await page.addInitScript(() => {
  window.__completionEvents = [];
  const prior = new Map();
  new MutationObserver(() => {
    for (const bubble of document.querySelectorAll('.speech-bubble')) {
      const text =
        !bubble.hidden && getComputedStyle(bubble).display !== 'none' ? bubble.textContent : '';
      if (text !== prior.get(bubble.id)) {
        window.__completionEvents.push({ id: bubble.id, text, at: performance.now() });
        prior.set(bubble.id, text);
      }
    }
  }).observe(document, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden']
  });
});
async function call(route, method = 'GET', data) {
  const response = await context.request.fetch(`/api${route}`, {
    method,
    ...(data ? { data } : {})
  });
  assert(response.ok(), `${method} ${route}: ${response.status()}`);
  return response.json();
}
async function fixtureHashes() {
  const result = {};
  for (const name of ['package.json', 'src/cart.js', 'cart.test.js']) {
    result[name] = createHash('sha256')
      .update(await readFile(path.join(process.env.AE_TEST_WORKDIR, 'cart-activity', name)))
      .digest('hex');
  }
  return result;
}
function terminateOwnedNativeTask() {
  const workerPid = Number(process.env.AE_TEST_WORKER_PID);
  assert(Number.isSafeInteger(workerPid) && workerPid > 0);
  const shell = 'C:/Program Files/PowerShell/7/pwsh.exe';
  const raw = execFileSync(
    shell,
    [
      '-NoProfile',
      '-Command',
      `$owner=Get-CimInstance Win32_Process -Filter "ProcessId=${workerPid}"; if($owner.Name -ne 'agentic-enterprise.exe' -or $owner.CommandLine -notmatch 'scratch[\\\\/]live-office-idle[\\\\/]worker'){throw 'Owned fixture worker identity mismatch'}; Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress`
    ],
    { encoding: 'utf8' }
  );
  const processes = JSON.parse(raw);
  const owned = new Set([workerPid]);
  for (let pass = 0; pass < processes.length; pass++) {
    for (const item of processes) if (owned.has(item.ParentProcessId)) owned.add(item.ProcessId);
  }
  const candidates = processes.filter(
    (item) => owned.has(item.ProcessId) && item.Name.toLowerCase() === 'codex.exe'
  );
  if (!candidates.length) return null;
  assert.equal(candidates.length, 1, 'Never guess between multiple native tasks.');
  const target = candidates[0];
  execFileSync(
    shell,
    [
      '-NoProfile',
      '-Command',
      `$task=Get-CimInstance Win32_Process -Filter "ProcessId=${target.ProcessId}"; if($task.Name -ne 'codex.exe' -or $task.ParentProcessId -ne ${target.ParentProcessId}){throw 'Native task identity changed'}; $cursor=$task; $owned=$false; for($i=0;$i -lt 20 -and $cursor;$i++){if($cursor.ParentProcessId -eq ${workerPid}){$owned=$true;break};$cursor=Get-CimInstance Win32_Process -Filter "ProcessId=$($cursor.ParentProcessId)"}; if(-not $owned){throw 'Native task is outside owned worker'}; Stop-Process -Id ${target.ProcessId} -ErrorAction Stop`
    ],
    { encoding: 'utf8' }
  );
  return target;
}
let original;
let active;
try {
  await call('/login', 'POST', { token: process.env.AE_TEST_OWNER_KEY });
  const before = await call('/state');
  assert(
    !before.runs.some((run) => ['queued', 'starting', 'running', 'waiting'].includes(run.status))
  );
  const office = await call('/cockpit/state');
  original = before.agents.find((agent) => agent.id === office.mapping.data_engineer);
  assert.equal(original.permission, 'read-only');
  const group = before.groups.find((group) => group.name === 'Command metadata acceptance');
  assert(group);
  const hashes = await fixtureHashes();
  for (const outcome of ['succeeded', 'failed', 'cancelled']) {
    await page.goto('/office');
    await page.locator('#card-data_engineer').click();
    const messageId = crypto.randomUUID();
    const body =
      outcome === 'succeeded'
        ? 'Real local read-only completion verification. Read cart-activity/package.json using Get-Content, then run npm test --prefix cart-activity in a separate terminal call. Report actual test counts. Do not modify files, browse, install, delegate, ask questions, commit, push or deploy. End with the words Verification complete.'
        : outcome === 'cancelled'
          ? 'Read-only local cancellation verification. Run exactly one foreground PowerShell terminal call: Start-Sleep -Seconds 90. Do not run a background job or change files. Wait for that tool to finish before answering. The owner will cancel this run. Do not browse, install, delegate, commit, push or deploy.'
          : 'Read-only local native-process failure verification. Run exactly one foreground PowerShell terminal call: Start-Sleep -Seconds 90. The test will terminate this native session to verify failure handling. Do not modify files, browse, install, delegate, commit, push or deploy.';
    await call('/messages', 'POST', {
      id: messageId,
      group_id: group.id,
      side_chat_id: null,
      recipients: [original.id],
      reply_to: null,
      artifacts: [],
      body
    });
    const record = { expected: outcome, observedWorking: false, statuses: [] };
    proof.cases.push(record);
    const deadline = Date.now() + 160000;
    let workingAt;
    while (Date.now() < deadline) {
      active = (await call('/state')).runs.find(
        (run) => run.message_id === messageId && run.kind === 'direct'
      );
      if (active && record.statuses.at(-1) !== active.status) {
        record.statuses.push(active.status);
        console.log(JSON.stringify({ outcome, status: active.status }));
      }
      if (await page.locator('#card-data_engineer[data-state="bekerja"]').count()) {
        record.observedWorking = true;
        workingAt ??= Date.now();
      }
      if (
        outcome === 'failed' &&
        !record.terminatedNative &&
        active?.status === 'running' &&
        workingAt &&
        Date.now() - workingAt > 5000
      ) {
        record.terminatedNative = terminateOwnedNativeTask();
      }
      if (
        outcome === 'cancelled' &&
        !record.cancelRequested &&
        active?.status === 'running' &&
        workingAt &&
        Date.now() - workingAt > 5000
      ) {
        await call(`/runs/${active.id}/cancel`, 'POST', {});
        record.cancelRequested = true;
      }
      if (active && !['queued', 'starting', 'running', 'waiting'].includes(active.status)) break;
      await page.waitForTimeout(150);
    }
    assert(active);
    record.run = {
      id: active.id,
      status: active.status,
      exitCode: active.exit_code,
      nativeSession: active.native_session_id
    };
    assert.equal(active.status, outcome);
    assert(record.observedWorking, `The actual UI must observe working before ${outcome}.`);
    await page.waitForFunction(
      () => document.querySelector('#card-data_engineer')?.dataset.state === 'siaga'
    );
    await page.waitForTimeout(5000);
    record.bubbles = await page.evaluate(() => window.__completionEvents);
    record.completionSpeech = record.bubbles.filter(
      (event) => event.id === 'bubble-data_engineer' && /^Beres/.test(event.text)
    );
    assert.equal(record.completionSpeech.length, outcome === 'succeeded' ? 1 : 0);
    const snapshot = await call('/cockpit/state');
    const slot = snapshot.agents.find((agent) => agent.office_role === 'data_engineer');
    assert.equal(slot.latest_result.id, active.id);
    assert.equal(slot.latest_result.status, outcome);
    record.historyOutcome = slot.latest_result.status;
    await page.screenshot({ path: path.join(output, `${outcome}.png`) });
  }
  const initialIds = new Set(before.runs.map((run) => run.id));
  const directIds = new Set(proof.cases.map((item) => item.run.id));
  let after = await call('/state');
  const reviewDeadline = Date.now() + 140000;
  while (
    after.runs.some(
      (run) =>
        !initialIds.has(run.id) && ['queued', 'starting', 'running', 'waiting'].includes(run.status)
    ) &&
    Date.now() < reviewDeadline
  ) {
    await page.waitForTimeout(500);
    after = await call('/state');
  }
  const added = after.runs.filter((run) => !initialIds.has(run.id));
  assert.equal(added.filter((run) => run.kind === 'direct').length, 3);
  assert(
    added.every(
      (run) => directIds.has(run.id) || (run.kind === 'review' && directIds.has(run.parent_run_id))
    )
  );
  assert(added.every((run) => !['queued', 'starting', 'running', 'waiting'].includes(run.status)));
  proof.automaticFailureReviews = added
    .filter((run) => run.kind === 'review')
    .map((run) => ({ id: run.id, parentRunId: run.parent_run_id, status: run.status }));
  assert.deepEqual(after.agents, before.agents);
  assert.deepEqual(await fixtureHashes(), hashes);
  assert.deepEqual(proof.errors, []);
  proof.profileUnchanged = true;
  proof.fixtureUnchanged = true;
  proof.passed = true;
} finally {
  if (active && ['queued', 'starting', 'running', 'waiting'].includes(active.status)) {
    const current = (await call('/state')).runs.find((run) => run.id === active.id);
    if (current && ['queued', 'starting', 'running', 'waiting'].includes(current.status))
      await call(`/runs/${current.id}/cancel`, 'POST', {});
  }
  await writeFile(path.join(output, 'completion-proof.json'), JSON.stringify(proof, null, 2));
  await browser.close();
  console.log(
    JSON.stringify({
      passed: proof.passed ?? false,
      cases: proof.cases.map((item) => ({
        expected: item.expected,
        run: item.run,
        observedWorking: item.observedWorking,
        completionSpeech: item.completionSpeech?.length
      })),
      output
    })
  );
}
