import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';

const base = process.env.AE_TEST_URL;
const ownerKey = process.env.AE_TEST_OWNER_KEY;
const proofDirectory = process.env.AE_TEST_PROOF_DIR;
const workspace = process.env.AE_TEST_WORKSPACE ?? 'default';
const groupId = process.env.AE_TEST_GROUP_ID;
const orionId = process.env.AE_TEST_ORION_ID;
const novaId = process.env.AE_TEST_NOVA_ID;
let lyraId = process.env.AE_TEST_LYRA_ID;
const documents = (process.env.AE_TEST_DOCS ?? 'PROJECT_BRIEF.md,AGENTS.md,EXPERIMENT_PLAN.md')
  .split(',')
  .map((value) => value.trim());
const timeoutMs = Number(process.env.AE_TEST_TIMEOUT_MS ?? 360000);
const stageMode = process.env.AE_TEST_STAGE ?? 'full';
assert(['full', 'coordination'].includes(stageMode), 'AE_TEST_STAGE must be full or coordination.');
assert(
  base && ownerKey && proofDirectory && groupId && orionId && novaId,
  'Set AE_TEST_URL, AE_TEST_OWNER_KEY, AE_TEST_PROOF_DIR, AE_TEST_GROUP_ID, AE_TEST_ORION_ID and AE_TEST_NOVA_ID.'
);
assert(
  Number.isInteger(timeoutMs) && timeoutMs >= 30000 && timeoutMs <= 900000,
  'AE_TEST_TIMEOUT_MS must be between 30000 and 900000.'
);
assert.equal(documents.length, 3, 'The pilot must review exactly three documents.');
assert.equal(new Set(documents).size, 3, 'Document paths must be distinct.');
for (const document of documents) {
  assert(
    /^[a-zA-Z0-9_.\-/]+\.md$/.test(document) &&
      !document.startsWith('/') &&
      document
        .split('/')
        .every((part) => part && part !== '..' && !['.git', '.state', '.env'].includes(part)),
    'AE_TEST_DOCS must contain safe relative Markdown paths.'
  );
}
await mkdir(proofDirectory, { recursive: true });

const activeStatuses = new Set(['queued', 'starting', 'running', 'waiting']);
const failureStatuses = new Set(['failed', 'timed_out', 'interrupted', 'cancelled']);
const categories = new Set([
  'reading',
  'searching',
  'writing',
  'command',
  'responding',
  'delegating',
  'other'
]);
const messageIds = new Set();
const activities = new Map();
const observations = new Map();
const remoteReceipts = new Map();
const screenshotKeys = new Set();
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const proof = {
  workspace,
  group_id: groupId,
  harness: 'antigravity',
  mocks: false,
  stage_mode: stageMode,
  stages: [],
  screenshots: [],
  preview_created_runs: null,
  project_preserved: false,
  profiles_preserved: false,
  max_active_provider_turns: 0,
  run_activity: [],
  passed: false
};
let browser;
let context;
let page;
let baseline;
let group;
let completed = false;
let pilotError;

async function call(route, body, method = 'GET') {
  const response = await context.request.fetch(`/api${route}`, {
    method,
    headers: { 'x-ae-workspace': workspace },
    ...(body === undefined ? {} : { data: body }),
    timeout: 15000
  });
  assert(
    response.ok(),
    `${method} ${route}: HTTP ${response.status()}; inspect the application privately.`
  );
  return response.json();
}
const snapshot = () => call(`/cockpit/state?group_id=${encodeURIComponent(groupId)}`);
const ownRuns = (state) => state.runs.filter((run) => messageIds.has(run.message_id));

function safeRun(run) {
  return {
    id: run.id,
    message_id: run.message_id,
    agent_id: run.agent_id,
    kind: run.kind,
    parent_run_id: run.parent_run_id,
    status: run.status,
    created_at: run.created_at,
    started_at: run.started_at,
    ended_at: run.ended_at,
    exit_code: run.exit_code,
    native_session_confirmed: Boolean(run.native_session_id),
    ssh_execution_confirmed:
      Boolean(run.profile.workdir?.ssh_host) &&
      Number.isInteger(run.remote_pid) &&
      run.remote_pid > 0 &&
      remoteReceipts.get(run.id)?.started === true &&
      remoteReceipts.get(run.id)?.finished === true,
    remote_started_receipt_confirmed: remoteReceipts.get(run.id)?.started === true,
    remote_finished_receipt_confirmed: remoteReceipts.get(run.id)?.finished === true,
    output_present: typeof run.output === 'string' && run.output.trim().length > 0,
    reported_usage_present: run.usage !== null
  };
}

function record(state, cockpit, stage) {
  const runs = ownRuns(state);
  const executing = runs.filter((run) => ['starting', 'running'].includes(run.status)).length;
  proof.max_active_provider_turns = Math.max(proof.max_active_provider_turns, executing);
  assert(
    executing <= 1,
    'The single-job pilot must never execute two provider turns concurrently.'
  );
  const ids = new Set(runs.map((run) => run.id));
  for (const run of runs) {
    const slot = cockpit.agents.find((agent) => agent.agent_id === run.agent_id);
    const projected =
      slot?.active_runs.find((candidate) => candidate.id === run.id) ??
      (slot?.latest_result?.id === run.id ? slot.latest_result : null);
    const prior = observations.get(run.id) ?? [];
    const next = {
      observed_at: new Date().toISOString(),
      status: run.status,
      phase: projected?.phase ?? null,
      agent_phase: slot?.phase ?? null
    };
    if (
      prior.at(-1)?.status !== next.status ||
      prior.at(-1)?.phase !== next.phase ||
      prior.at(-1)?.agent_phase !== next.agent_phase
    )
      prior.push(next);
    observations.set(run.id, prior);
    assert(
      !failureStatuses.has(run.status),
      `Pilot ${stage} run ${run.id} ended ${run.status}; inspect Runs privately.`
    );
  }
  assert(
    !state.questions.some((question) => ids.has(question.run_id) && question.status === 'pending'),
    'The strictly bounded document task requested an owner answer; stop and inspect the question privately.'
  );
  for (const event of cockpit.events) {
    if (!ids.has(event.run_id) || event.kind !== 'step_activity') continue;
    const activity = event.activity;
    assert(
      activity && activity.run_id === event.run_id && categories.has(activity.category),
      'The public step activity does not match its persisted run.'
    );
    assert(
      ['active', 'completed', 'failed'].includes(activity.state) &&
        Number.isSafeInteger(activity.step_index) &&
        activity.step_index >= 0,
      'Malformed step activity state/index.'
    );
    assert(
      !['writing', 'command'].includes(activity.category),
      'The read-only pilot reported a write or command; stop and inspect the actual tool activity privately.'
    );
    if (activity.relative_file !== null) {
      assert(
        typeof activity.relative_file === 'string' && documents.includes(activity.relative_file),
        'The read-only pilot touched a file outside its three-document scope.'
      );
    }
    const key = String(event.id);
    activities.set(key, {
      event_id: event.id,
      run_id: event.run_id,
      agent_id: event.agent_id,
      category: activity.category,
      state: activity.state,
      step_index: activity.step_index,
      relative_file: activity.relative_file,
      created_at: event.created_at
    });
  }
  return runs;
}

async function capture(stage, role, state, messageId) {
  const card = page.locator(`#card-${role}`);
  const key = `${stage}-${role}-working`;
  if (
    !screenshotKeys.has(key) &&
    (await card.locator('.agent-status').getAttribute('data-state')) === 'bekerja'
  ) {
    screenshotKeys.add(key);
    const file = path.join(proofDirectory, `${key}.png`);
    await page.screenshot({ path: file, animations: 'disabled', timeout: 15000 });
    proof.screenshots.push({ stage, role, kind: 'working', file });
  }
  const ownIds = new Set(
    state.runs.filter((run) => run.message_id === messageId).map((run) => run.id)
  );
  const read = [...activities.values()].find(
    (activity) =>
      ownIds.has(activity.run_id) &&
      activity.category === 'reading' &&
      activity.relative_file &&
      state.runs.find((run) => run.id === activity.run_id)?.agent_id ===
        { data_engineer: novaId, hq_lab_director: orionId, research_scientist: lyraId }[role]
  );
  if (read && !screenshotKeys.has(`${stage}-${role}-reading`)) {
    const rendered = page.locator('#feedList .feed-text').filter({ hasText: read.relative_file });
    if ((await rendered.count()) && (await rendered.first().isVisible())) {
      screenshotKeys.add(`${stage}-${role}-reading`);
      const file = path.join(proofDirectory, `${stage}-${role}-reading.png`);
      await page.screenshot({ path: file, animations: 'disabled', timeout: 15000 });
      proof.screenshots.push({
        stage,
        role,
        kind: 'reading',
        relative_file: read.relative_file,
        file
      });
    }
  }
}

async function send(agentId, body) {
  const id = randomUUID();
  messageIds.add(id);
  const message = await call(
    '/messages',
    {
      id,
      group_id: groupId,
      side_chat_id: null,
      body,
      recipients: [],
      reply_to: null,
      artifacts: []
    },
    'POST'
  );
  assert.equal(message.id, id);
  assert.deepEqual(
    message.recipients,
    [agentId],
    'The real mention path must address exactly one agent.'
  );
  return id;
}

async function assertSuccessful(run, expectedAgent, expectedKind, terminalStatus = 'succeeded') {
  assert.equal(run.agent_id, expectedAgent);
  assert.equal(run.kind, expectedKind);
  assert.equal(
    run.status,
    terminalStatus,
    `Expected ${expectedKind} ${terminalStatus}; inspect Runs privately.`
  );
  assert.equal(run.exit_code, 0);
  assert(run.native_session_id, 'No native provider conversation was confirmed.');
  assert.equal(run.profile.workdir?.ssh_host, group.project.workdir.ssh_host);
  assert(
    Number.isInteger(run.remote_pid) && run.remote_pid > 0,
    'The persisted run must include the actual SSH process receipt.'
  );
  assert.equal(
    path.posix.basename(run.executable),
    'agy',
    'The actual native executable must be agy.'
  );
  assert(run.output?.trim(), 'The native execution must return a nonempty result.');
  assert.equal(run.profile.harness, 'antigravity');
  assert.equal(run.profile.permission, 'read-only');
  assert.equal(
    run.cwd,
    group.project.workdir.path,
    'Project workdir override must be used by the actual run.'
  );
  const events = await call(`/runs/${run.id}/events`);
  const frames = [];
  for (const event of events) {
    if (
      event.kind !== 'run.output' ||
      event.payload?.run_id !== run.id ||
      event.payload.stderr !== false ||
      typeof event.payload.line !== 'string'
    )
      continue;
    try {
      frames.push(JSON.parse(event.payload.line));
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  }
  const started = frames.filter((frame) => frame.type === 'ae.remote.started');
  const finished = frames.filter((frame) => frame.type === 'ae.remote.finished');
  assert.equal(started.length, 1, 'The run must have exactly one persisted remote start receipt.');
  assert.equal(
    finished.length,
    1,
    'The run must have exactly one persisted remote completion receipt.'
  );
  assert.equal(started[0].pid, run.remote_pid);
  assert.equal(started[0].cwd, group.project.workdir.canonical_path);
  assert.equal(path.posix.basename(started[0].executable), 'agy');
  assert.equal(finished[0].exit_code, 0);
  assert.equal(
    finished[0].status,
    null,
    'The SSH bridge must confirm an ordinary successful exit.'
  );
  remoteReceipts.set(run.id, { started: true, finished: true });
}

async function observeStage(stage, messageId, done) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    const state = await call('/state');
    const cockpit = await snapshot();
    assert.equal(cockpit.workspace_id, workspace);
    assert.equal(cockpit.group_id, groupId);
    record(state, cockpit, stage);
    await capture(stage, 'data_engineer', state, messageId);
    await capture(stage, 'hq_lab_director', state, messageId);
    await capture(stage, 'research_scientist', state, messageId);
    const stageRuns = state.runs.filter((run) => run.message_id === messageId);
    latest = stageRuns;
    if (done(stageRuns)) return stageRuns;
    await sleep(200);
  }
  const statuses =
    latest?.map((run) => `${run.kind}:${run.status}`).join(', ') || 'no runs observed';
  throw new Error(
    `Pilot ${stage} did not reach its required result within ${timeoutMs} ms (${statuses}).`
  );
}

try {
  browser = await chromium.launch({
    channel: process.env.AE_TEST_BROWSER ?? 'msedge',
    headless: true
  });
  context = await browser.newContext({ baseURL: base, viewport: { width: 1440, height: 1000 } });
  page = await context.newPage();
  const login = await context.request.post('/api/login', { data: { token: ownerKey } });
  assert(login.ok(), `Owner login failed: HTTP ${login.status()}.`);
  await context.addCookies([{ name: 'ae_workspace', value: workspace, url: base }]);
  baseline = await call('/state');
  group = baseline.groups.find((candidate) => candidate.id === groupId);
  assert(
    group?.project && !group.archived_at && !group.deleted_at,
    'Use the existing active configured pilot project.'
  );
  assert(
    group.project.workdir.ssh_host && !group.project.workdir.runtime_id,
    'This pilot specifically verifies a direct SSH project workdir.'
  );
  const initialCockpit = await snapshot();
  lyraId ??= initialCockpit.mapping.research_scientist;
  assert(lyraId, 'Set AE_TEST_LYRA_ID or map the Research Scientist slot first.');
  assert.deepEqual(
    [
      initialCockpit.mapping.hq_lab_director,
      initialCockpit.mapping.data_engineer,
      initialCockpit.mapping.research_scientist
    ],
    [orionId, novaId, lyraId],
    'The tested identities must be the actual mapped cockpit slots.'
  );
  proof.agent_ids = { orion: orionId, nova: novaId, lyra: lyraId };
  const projectAccess = baseline.group_access[groupId];
  assert(projectAccess, 'The pilot project must have a real group-access projection.');
  assert.equal(projectAccess.chat_lead_id, orionId, 'Orion must be this project chat lead.');
  assert(
    projectAccess.participant_ids.includes(novaId) &&
      projectAccess.participant_ids.includes(orionId),
    'Nova and Orion must be allowed project chat participants.'
  );
  assert(
    projectAccess.delegate_ids.includes(lyraId),
    'Lyra must be allowed as this project delegate.'
  );
  for (const id of [orionId, novaId, lyraId]) {
    const agent = baseline.agents.find((candidate) => candidate.id === id);
    assert(
      agent?.enabled &&
        !agent.deleted_at &&
        agent.harness === 'antigravity' &&
        agent.permission === 'read-only',
      'Each pilot profile must be enabled Antigravity and read-only.'
    );
  }
  assert(
    !baseline.runs.some(
      (run) =>
        activeStatuses.has(run.status) &&
        (run.group_id === groupId || [orionId, novaId, lyraId].includes(run.agent_id))
    ),
    'Wait for existing work before starting this single-job pilot.'
  );
  await page.goto(`/organization/live-preview?group=${encodeURIComponent(groupId)}`);
  await expect(page.locator('.live-preview-connection')).toHaveAttribute(
    'data-connection',
    'live',
    { timeout: 30000 }
  );
  await expect(page.locator('#card-data_engineer')).toBeVisible();
  assert(
    await page.locator('.cockpit-root canvas').count(),
    'The actual cockpit canvas must mount.'
  );
  const afterOpening = await call('/state');
  assert.deepEqual(
    afterOpening.runs.map((run) => run.id).sort(),
    baseline.runs.map((run) => run.id).sort(),
    'Opening the preview must not start a job.'
  );
  proof.preview_created_runs = 0;

  const restrictions =
    `Read only these three relative Markdown files using the native file reader: ${documents.join(', ')}. ` +
    'Do not run shell commands or tests, modify files, download anything, access the network, start training or GPU jobs, ' +
    'read other files or secrets, create worktrees, invoke extra agents, or ask the owner questions. ' +
    'Report missing documents and blockers honestly; do not claim unavailable facts. Use Indonesian for the audit and final summary.';
  if (stageMode === 'full') {
    const novaName = baseline.agents.find((agent) => agent.id === novaId).name;
    const directMessageId = await send(
      novaId,
      `@${novaName} Perform the bounded read-only project documentation audit. ${restrictions} ` +
        'For each document, report its filename and one factual finding about project scope, working rules or experiment constraints. Return a concise audit and stop; do not delegate.'
    );
    const directRuns = await observeStage(
      'nova-audit',
      directMessageId,
      (runs) => runs.length > 0 && runs.every((run) => !activeStatuses.has(run.status))
    );
    assert.equal(directRuns.length, 1, 'The direct audit must invoke exactly one Nova run.');
    const direct = await call(`/runs/${directRuns[0].id}`);
    await assertSuccessful(direct, novaId, 'direct');
    for (const document of documents) {
      assert(direct.output.includes(document), 'The audit must mention each requested document.');
      assert(
        [...activities.values()].some(
          (activity) =>
            activity.run_id === direct.id &&
            activity.category === 'reading' &&
            activity.state === 'completed' &&
            activity.relative_file === document
        ),
        `No actual reading event was reported for ${document}.`
      );
    }
    proof.stages.push({ name: 'nova-audit', message_id: directMessageId, runs: [safeRun(direct)] });
  }

  const orionName = baseline.agents.find((agent) => agent.id === orionId).name;
  const delegateMessageId = await send(
    orionId,
    `@${orionName} Coordinate a bounded documentation review. This coordinator turn is routing only: ` +
      'return the required JSON decision without reading files or directories, running commands, calling tools or native subagents. ' +
      'The platform queue executes the assignment after your decision. Delegate exactly one task to your Research Scientist ' +
      `(agent ID ${lyraId}); assign nobody else and do not perform the file review yourself. ` +
      `The delegated task must apply these restrictions: ${restrictions} ` +
      'Ask that specialist to identify one alignment concern or explicitly report no substantiated concern across the three documents, with filename references. ' +
      'Return a concise final summary of the actual delegated result. This is one sequential job, no retry or additional delegation.'
  );
  const coordinatedRuns = await observeStage(
    'orion-review',
    delegateMessageId,
    (runs) =>
      runs.some((run) => run.kind === 'summary') &&
      runs.every((run) => !activeStatuses.has(run.status))
  );
  assert.equal(
    coordinatedRuns.length,
    3,
    'The coordinated task must consist of one coordinator, one delegate and one summary.'
  );
  const coordinators = coordinatedRuns.filter((run) => run.kind === 'coordinator');
  const delegates = coordinatedRuns.filter((run) => run.kind === 'delegate');
  const summaries = coordinatedRuns.filter((run) => run.kind === 'summary');
  assert.equal(coordinators.length, 1);
  assert.equal(delegates.length, 1);
  assert.equal(summaries.length, 1);
  const [coordinator, delegate, summary] = await Promise.all(
    [coordinators[0], delegates[0], summaries[0]].map((run) => call(`/runs/${run.id}`))
  );
  await assertSuccessful(coordinator, orionId, 'coordinator', 'delegated');
  assert.equal(delegate.parent_run_id, coordinator.id);
  assert.equal(summary.parent_run_id, coordinator.id);
  await assertSuccessful(delegate, lyraId, 'delegate');
  await assertSuccessful(summary, orionId, 'summary');
  assert.equal(
    summary.native_session_id,
    coordinator.native_session_id,
    'Orion summary must resume the actual coordinator conversation.'
  );
  proof.coordinator_conversation_resumed = true;
  assert(
    [...activities.values()].some(
      (activity) =>
        activity.run_id === delegate.id &&
        activity.category === 'reading' &&
        activity.state === 'completed'
    ),
    'The real delegate must report an actual native reading event.'
  );
  const messages = await call(
    `/groups/${encodeURIComponent(groupId)}/messages?main=true&limit=200`
  );
  assert(
    messages.some(
      (message) =>
        message.run_id === summary.id && message.sender === orionId && message.body?.trim()
    ),
    'The final Orion summary must be persisted in the actual project chat.'
  );
  proof.stages.push({
    name: 'orion-review',
    message_id: delegateMessageId,
    runs: [coordinator, delegate, summary].map(safeRun)
  });

  await expect(page.locator('#card-data_engineer .agent-status')).not.toHaveAttribute(
    'data-state',
    'bekerja',
    { timeout: 15000 }
  );
  await expect(page.locator('#card-research_scientist .agent-status')).not.toHaveAttribute(
    'data-state',
    'bekerja',
    { timeout: 15000 }
  );
  const finalScreenshot = path.join(proofDirectory, 'pilot-completed.png');
  await page.screenshot({ path: finalScreenshot, animations: 'disabled' });
  proof.screenshots.push({ kind: 'completed', file: finalScreenshot });
  assert(
    proof.screenshots.some((item) =>
      item.stage === (stageMode === 'full' ? 'nova-audit' : 'orion-review') &&
      item.role === (stageMode === 'full' ? 'data_engineer' : 'hq_lab_director') &&
      item.kind === 'working'
    ),
    'The browser did not observe the tested agent actually working.'
  );
  assert(
    proof.screenshots.some((item) => item.kind === 'reading'),
    'The browser did not render any native reading activity.'
  );
  const finalState = await call('/state');
  const finalCockpit = await snapshot();
  proof.token_coverage = {
    processed: finalCockpit.totals.tokens_processed,
    reported_runs: finalCockpit.totals.tokens_reported_runs,
    total_runs: finalCockpit.totals.tokens_total_runs
  };
  proof.project_preserved =
    hash(finalState.groups.find((candidate) => candidate.id === groupId)) === hash(group);
  proof.profiles_preserved = hash(finalState.agents) === hash(baseline.agents);
  assert(
    proof.project_preserved && proof.profiles_preserved,
    'The pilot must preserve configured project and profiles.'
  );
  assert.equal(
    ownRuns(finalState).length,
    stageMode === 'full' ? 4 : 3,
    'There must be exactly the requested provider turns and no extra task/retry/review.'
  );
  completed = true;
  proof.passed = true;
} catch (error) {
  pilotError = error;
  proof.error =
    error instanceof Error ? error.message : 'The pilot failed; inspect the app privately.';
} finally {
  if (context && !completed && messageIds.size > 0) {
    try {
      const deadline = Date.now() + 30000;
      let cancelled = [];
      while (Date.now() < deadline) {
        const remaining = ownRuns(await call('/state')).filter((run) =>
          activeStatuses.has(run.status)
        );
        if (remaining.length === 0) break;
        for (const run of remaining.sort(
          (a, b) => Number(Boolean(a.parent_run_id)) - Number(Boolean(b.parent_run_id))
        )) {
          await call(`/runs/${run.id}/cancel`, {}, 'POST');
          cancelled.push(run.id);
        }
        await sleep(250);
      }
      proof.cancel_requested_run_ids = [...new Set(cancelled)];
      proof.remaining_owned_active_runs = ownRuns(await call('/state'))
        .filter((run) => activeStatuses.has(run.status))
        .map((run) => run.id);
      if (proof.remaining_owned_active_runs.length)
        proof.cleanup_error = 'Owned work is still active; inspect listed run IDs before retrying.';
    } catch (error) {
      proof.cleanup_error =
        error instanceof Error
          ? error.message
          : 'Cancellation failed; inspect owned runs privately.';
    }
  }
  proof.run_activity = [...activities.values()];
  proof.run_status_traces = Object.fromEntries(observations);
  proof.message_ids = [...messageIds];
  await writeFile(
    path.join(proofDirectory, 'cockpit-ssh-pilot-proof.json'),
    JSON.stringify(proof, null, 2)
  );
  await browser?.close();
  console.log(
    JSON.stringify({
      passed: proof.passed,
      provider_turns: proof.stages.reduce((count, stage) => count + stage.runs.length, 0),
      actual_step_events: proof.run_activity.length,
      working_screenshot: proof.screenshots.some((item) => item.kind === 'working'),
      project_preserved: proof.project_preserved,
      proof: path.join(proofDirectory, 'cockpit-ssh-pilot-proof.json')
    })
  );
}
if (pilotError) throw pilotError;
