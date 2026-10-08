import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const base = process.env.AE_TEST_URL;
const ownerKey = process.env.AE_TEST_OWNER_KEY;
const proofDirectory = process.env.AE_TEST_PROOF_DIR;
const workspace = process.env.AE_TEST_WORKSPACE ?? 'default';
const runtimeId = process.env.AE_TEST_RUNTIME_ID ?? null;
const workdirPath = process.env.AE_TEST_WORKDIR ?? '/workdir/cockpit-smoke';
assert(base && ownerKey && proofDirectory, 'Set AE_TEST_URL, AE_TEST_OWNER_KEY and AE_TEST_PROOF_DIR.');
assert(!['http://localhost:18766', 'http://127.0.0.1:8765'].includes(base.replace(/\/$/, '')), 'Use a disposable candidate organization.');
assert(workspace === 'default' || runtimeId, 'A non-default workspace needs AE_TEST_RUNTIME_ID for an attached registered runtime.');
await mkdir(proofDirectory, { recursive: true });

const browser = await chromium.launch({ channel: process.env.AE_TEST_BROWSER ?? 'msedge', headless: true });
const context = await browser.newContext({ baseURL: base, viewport: { width: 1440, height: 980 } });
const page = await context.newPage();
const proof = { base, workspace, harness: 'antigravity', mocks: false, statuses: [], workingScreenshot: null, restoredProfile: false, archivedGroup: false };
const active = new Set(['queued', 'starting', 'running', 'waiting']);
let originalProfile;
let group;
let messageId;
let runId;
let finished = false;

async function call(route, body, method = 'GET') {
  const response = await context.request.fetch(`/api${route}`, {
    method, headers: { 'x-ae-workspace': workspace }, ...(body === undefined ? {} : { data: body }), timeout: 15000,
  });
  assert(response.ok(), `${method} ${route}: HTTP ${response.status()}. Inspect the application's error response privately.`);
  return response.json();
}
const snapshot = () => call(`/cockpit/state${group ? `?group_id=${encodeURIComponent(group.id)}` : ''}`);

try {
  const login = await context.request.post('/api/login', { data: { token: ownerKey } });
  assert(login.ok(), `Owner login failed: HTTP ${login.status()}`);
  await context.addCookies([{ name: 'ae_workspace', value: workspace, url: base }]);
  const setup = await call('/cockpit/setup', {}, 'POST');
  const novaId = setup.mapping.data_engineer;
  assert(novaId, 'Cockpit setup must map the data engineer.');
  const state = await call('/state');
  originalProfile = state.agents.find(agent => agent.id === novaId);
  assert(originalProfile && !originalProfile.deleted_at && !originalProfile.enabled, 'Run this smoke against an inactive disposable Nova profile.');
  assert(!state.runs.some(run => run.agent_id === novaId && active.has(run.status)), 'Nova already has active work.');
  const probe = await call('/workspaces/probe', { path: workdirPath, runtime_id: runtimeId }, 'POST');
  const draft = { ...originalProfile, harness: 'antigravity', runtime_id: runtimeId, workdir: probe.workspace, enabled: true, permission: 'read-only', model: '', reasoning: '', timeout_seconds: 120 };
  const configured = await call(`/agents/${novaId}`, draft, 'PUT');
  const catalog = await call(`/harness/settings?harness=antigravity&agent_id=${encodeURIComponent(novaId)}`);
  assert(catalog.models.some(model => model.slug === catalog.model), 'Use an actual model advertised by this execution machine.');
  await call(`/agents/${novaId}`, { ...configured, model: catalog.model, reasoning: '' }, 'PUT');
  group = await call('/groups', {
    id: '', name: `Cockpit smoke ${new Date().toISOString()}`, description: 'Disposable real provider verification.',
    member_ids: [novaId], human_ids: null, project: null, scope_levels: null, chat_lead_id: null, archived_at: null, deleted_at: null,
  }, 'POST');
  proof.agentId = novaId;
  proof.groupId = group.id;
  proof.model = catalog.model;
  await page.goto(`/organization/live-preview?group=${encodeURIComponent(group.id)}`);
  await page.locator('.live-preview-connection[data-connection="live"]').waitFor({ timeout: 30000 });
  await page.locator('#card-data_engineer').waitFor();
  messageId = randomUUID();
  proof.messageId = messageId;
  await call('/messages', {
    id: messageId, group_id: group.id, side_chat_id: null,
    body: 'Read SMOKE_INPUT.txt using the file reader. Report its exact first line and the count of nonempty lines as FIRST_LINE: ... and NONEMPTY_LINES: ... . Do not change files, run shell commands, browse, invoke agents, delegate, or ask questions. Reply only with those two fields.',
    recipients: [novaId], reply_to: null, artifacts: [],
  }, 'POST');
  const deadline = Date.now() + 120000;
  let workingScreenshot;
  while (Date.now() < deadline) {
    const current = await snapshot();
    const slot = current.agents.find(agent => agent.agent_id === novaId);
    const observed = [...slot.active_runs, ...(slot.latest_result ? [slot.latest_result] : [])].find(run => !runId || run.id === runId);
    if (observed) {
      runId ??= observed.id;
      if (proof.statuses.at(-1)?.status !== observed.status) proof.statuses.push({ at: new Date().toISOString(), status: observed.status, phase: observed.phase });
      if (!active.has(observed.status)) { finished = true; break; }
    }
    if (!workingScreenshot && await page.locator('#card-data_engineer.working').count()) {
      proof.workingScreenshot = path.join(proofDirectory, 'cockpit-real-working.png');
      workingScreenshot = page.screenshot({ path: proof.workingScreenshot, animations: 'disabled' });
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  await workingScreenshot;
  assert(finished && runId, 'Real run did not finish within 120 seconds.');
  const run = await call(`/runs/${runId}`);
  assert.equal(run.message_id, messageId);
  assert.equal(run.agent_id, novaId);
  assert.equal(run.kind, 'direct');
  assert.equal(run.status, 'succeeded', `Real run ended ${run.status}; inspect Runs privately.`);
  assert.equal(run.exit_code, 0);
  assert(run.native_session_id, 'A provider conversation must be confirmed.');
  assert.match(run.output, /FIRST_LINE:\s*Cockpit integration smoke/i);
  assert.match(run.output, /NONEMPTY_LINES:\s*2\b/i);
  const runs = (await call('/state')).runs.filter(candidate => candidate.message_id === messageId);
  assert.equal(runs.length, 1, 'The smoke invokes one direct agent and no delegates.');
  const completed = await snapshot();
  assert.equal(completed.agents.find(agent => agent.agent_id === novaId).latest_result.id, runId);
  assert.equal(completed.agents.find(agent => agent.agent_id === novaId).latest_result.status, 'succeeded');
  const renderedDeadline = Date.now() + 12000;
  while (Date.now() < renderedDeadline && await page.locator('#card-data_engineer.working').count()) await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(await page.locator('#card-data_engineer.working').count(), 0);
  proof.completedScreenshot = path.join(proofDirectory, 'cockpit-real-completed.png');
  await page.screenshot({ path: proof.completedScreenshot, animations: 'disabled' });
  proof.runId = runId;
  proof.exitCode = run.exit_code;
  proof.result = { firstLine: 'Cockpit integration smoke', nonemptyLines: 2, verifiedAgainstProviderOutput: true };
  proof.totals = completed.totals;
  proof.passed = true;
} catch (error) {
  proof.passed = false;
  proof.error = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  try {
    if (runId && !finished) {
      await call(`/runs/${runId}/cancel`, {}, 'POST');
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) { const run = await call(`/runs/${runId}`); if (!active.has(run.status)) { finished = true; break; } await new Promise(resolve => setTimeout(resolve, 250)); }
    }
    if (originalProfile && (!messageId || finished)) {
      const current = (await call('/state')).agents.find(agent => agent.id === originalProfile.id);
      await call(`/agents/${originalProfile.id}`, { ...originalProfile, revision: current.revision }, 'PUT');
      proof.restoredProfile = true;
    }
    if (group && (!messageId || finished)) { await call(`/groups/${group.id}/archive`, {}, 'POST'); proof.archivedGroup = true; }
  } catch (error) { proof.cleanupError = error instanceof Error ? error.message : String(error); }
  await writeFile(path.join(proofDirectory, 'cockpit-real-agent-proof.json'), JSON.stringify(proof, null, 2));
  await browser.close();
  console.log(JSON.stringify({ passed: proof.passed, runId: proof.runId ?? null, statuses: proof.statuses.map(item => item.status), workingObservedInBrowser: !!proof.workingScreenshot, restoredProfile: proof.restoredProfile, proof: path.join(proofDirectory, 'cockpit-real-agent-proof.json') }));
}
