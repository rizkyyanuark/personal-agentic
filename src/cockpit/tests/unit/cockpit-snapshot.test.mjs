import assert from 'node:assert/strict';
import test from 'node:test';
import { OFFICE_ROLES, isPublicLabState } from '../../src/shared/office-contract.js';
import { createDisconnectedState, projectCockpitSnapshot } from '../../src/client/snapshot.js';
import {
  createOfficePresentation,
  didObservedRunSucceed
} from '../../src/client/ui/office-presentation.js';
import { projectTaskBoard } from '../../src/shared/task-board-contract.js';
import { projectAgentCardPresentation, projectTokenMetric } from '../../src/client/ui/hud.js';

function fixture() {
  return {
    schema_version: 1,
    workspace_id: 'workspace',
    generated_at: '2026-10-06T01:00:00Z',
    group_id: null,
    setup_required: false,
    agents: OFFICE_ROLES.map((role, index) => ({
      office_role: role.key,
      agent_id: `agent-${index}`,
      name: role.name,
      position: role.role,
      role: role.role,
      enabled: true,
      in_scope: true,
      availability: 'ready',
      phase: 'idle',
      active_runs: [],
      latest_result: null
    })),
    events: [],
    totals: {
      agents: 5,
      active_runs: 0,
      queued: 0,
      starting: 0,
      working: 0,
      awaiting_answer: 0,
      awaiting_delegates: 0,
      completed: 0,
      failed: 0,
      backlog: 0,
      scheduled: 0,
      tokens_processed: null,
      tokens_reported_runs: 0,
      tokens_total_runs: 0
    }
  };
}
const run = (status) => ({
  id: 'run-1',
  status,
  phase: 'working',
  summary: 'Run selesai',
  created_at: '2026-10-06T00:58:00Z',
  started_at: '2026-10-06T00:59:00Z',
  ended_at: status === 'running' ? null : '2026-10-06T01:00:00Z'
});

function card(input) {
  const presentation = createOfficePresentation(OFFICE_ROLES);
  presentation.receive(projectCockpitSnapshot(input));
  const view = presentation.getSnapshot();
  return projectAgentCardPresentation(view.agents.data_engineer, view);
}

test('finished runs return directly to Santai while retaining the real outcome in history', () => {
  const input = fixture();
  for (const [status, result] of [
    ['succeeded', 'Selesai'],
    ['failed', 'Gagal'],
    ['timed_out', 'Batas waktu tercapai'],
    ['cancelled', 'Dibatalkan'],
    ['interrupted', 'Terhenti']
  ]) {
    input.agents[1].latest_result = run(status);
    input.generated_at = '2026-10-06T01:00:59.999Z';
    assert.equal(card(input).status.label, 'Santai');
    assert.equal(
      card(input).subtext,
      ['failed', 'timed_out', 'interrupted'].includes(status)
        ? `Tugas terakhir: ${result}`
        : 'Menunggu tugas baru.'
    );
    assert.equal(card(input).task, 'Run selesai');
    assert.equal(projectCockpitSnapshot(input).agents.data_engineer.state, 'siaga');
    input.generated_at = '2026-10-06T01:01:00Z';
    assert.equal(card(input).status.label, 'Santai');
    assert.equal(
      card(input).subtext,
      ['failed', 'timed_out', 'interrupted'].includes(status)
        ? `Tugas terakhir: ${result}`
        : 'Menunggu tugas baru.'
    );
    assert.equal(projectCockpitSnapshot(input).office.history[0].status, status);
  }
});

test('invalid and future completion times never claim recently finished work', () => {
  const input = fixture();
  for (const ended_at of [null, 'invalid', '2026-10-06T01:00:01Z']) {
    input.agents[1].latest_result = { ...run('succeeded'), ended_at };
    assert.equal(card(input).status.label, 'Santai');
  }
  input.agents[1].latest_result = run('running');
  assert.equal(card(input).status.label, 'Santai');
  assert.equal(card(input).subtext, 'Menunggu tugas baru.');
});

test('current work, unavailable runtime and team scope override completion display', () => {
  const input = fixture();
  input.agents[1].latest_result = run('succeeded');
  Object.assign(input.agents[1], { phase: 'working', active_runs: [run('running')] });
  assert.equal(card(input).status.label, 'Bekerja');
  Object.assign(input.agents[1], { phase: 'idle', active_runs: [], availability: 'offline' });
  assert.equal(card(input).status.label, 'Offline');
  input.agents[1].in_scope = false;
  assert.equal(card(input).status.label, 'Di luar tim');
  assert.equal(projectCockpitSnapshot(input).office.history.length, 0);
});

test('native steps reach the existing task card only for the active run', () => {
  const input = fixture();
  input.agents[1].phase = 'working';
  input.agents[1].active_runs = [run('running')];
  input.agents[1].current_activity = {
    run_id: 'run-1',
    category: 'reading',
    state: 'active',
    relative_file: 'PROJECT_BRIEF.md'
  };
  assert.equal(
    projectCockpitSnapshot(input).agents.data_engineer.task,
    'Membaca file · PROJECT_BRIEF.md'
  );
  input.agents[1].current_activity.run_id = 'other-run';
  assert.throws(() => projectCockpitSnapshot(input), /active run/);
});

test('five visual slots retain real identity with a whitelist projection and no private payloads', () => {
  const input = fixture();
  input.agents[1].name = '<img src=x onerror=evil()> & Nova';
  input.agents[1].prompt = 'PRIVATE_PROMPT';
  input.agents[1].active_runs.push({
    ...run('running'),
    input: 'PRIVATE_INPUT',
    output: 'PRIVATE_OUTPUT'
  });
  input.agents[1].phase = 'working';
  input.events = [
    {
      id: 42,
      office_role: 'data_engineer',
      kind: 'step_activity',
      status: 'updated',
      created_at: input.generated_at,
      summary: 'Status run diperbarui',
      payload: 'PRIVATE_EVENT'
    }
  ];
  const before = structuredClone(input);
  const state = projectCockpitSnapshot(input);
  assert.equal(isPublicLabState(state), true);
  assert.equal(state.identities.data_engineer.agentId, 'agent-1');
  assert.equal(state.identities.data_engineer.name, input.agents[1].name);
  assert.equal(state.agents.data_engineer.state, 'bekerja');
  assert.equal(state.feed[0].id, '42');
  assert.doesNotMatch(JSON.stringify(state), /PRIVATE_/);
  assert.deepEqual(input, before);
});

test('feed items project tool badge from activity metadata or direct tool property', () => {
  const input = fixture();
  input.events = [
    {
      id: 101,
      office_role: 'data_engineer',
      kind: 'step',
      status: 'active',
      created_at: input.generated_at,
      summary: 'Membaca file · src/App.tsx',
      activity: {
        run_id: 'run-1',
        category: 'reading',
        state: 'active',
        step_index: 2,
        relative_file: 'src/App.tsx'
      }
    },
    {
      id: 102,
      office_role: 'ml_engineer',
      kind: 'step',
      status: 'active',
      created_at: input.generated_at,
      summary: 'Menjalankan perintah · cargo test',
      tool: 'Terminal'
    }
  ];
  const state = projectCockpitSnapshot(input);
  assert.equal(state.feed[0].tool, 'Membaca');
  assert.equal(state.feed[1].tool, 'Terminal');
});

test('fresh active runs remain working independently of cached local readiness', () => {
  for (const availability of ['ready', 'unknown', 'paused', 'unattached']) {
    const input = fixture();
    Object.assign(input.agents[1], {
      phase: 'working',
      availability,
      active_runs: [run('running')]
    });
    const state = projectCockpitSnapshot(input);
    assert.equal(state.agents.data_engineer.state, 'bekerja', availability);
    assert.equal(typeof state.agents.data_engineer.runtimeHint, 'string');
    const presentation = createOfficePresentation(OFFICE_ROLES);
    presentation.receive(state);
    assert.equal(presentation.getSnapshot().agents.data_engineer.operational.state, 'bekerja');
  }
});

test('identity uses Organization position and never a long role description', () => {
  const input = fixture();
  input.agents[1].position = ' Senior Data Engineer ';
  input.agents[1].role = 'PRIVATE_LONG_DESCRIPTION '.repeat(20);
  input.agents[2].position = '';
  Object.assign(input.agents[3], {
    agent_id: null,
    availability: 'unmapped',
    position: 'Old mapping position'
  });
  const state = projectCockpitSnapshot(input);
  assert.equal(state.identities.data_engineer.role, 'Senior Data Engineer');
  assert.equal(state.identities.data_scientist.role, '');
  assert.equal(state.identities.research_scientist.role, 'Research Scientist');
  assert.doesNotMatch(JSON.stringify(state), /PRIVATE_LONG_DESCRIPTION|Old mapping position/);
});

test('token metric uses persisted measurements and exposes partial coverage without invented totals', () => {
  const input = fixture();
  input.totals.awaiting_answer = 7;
  input.totals.tokens_total_runs = 8;
  let state = projectCockpitSnapshot(input);
  assert.equal(projectTokenMetric(state.office.tokens).value, '—');
  Object.assign(input.totals, { tokens_processed: 208, tokens_reported_runs: 5 });
  state = projectCockpitSnapshot(input);
  assert.deepEqual(projectTokenMetric(state.office.tokens), {
    value: '208',
    description: 'Usage tersimpan: 5 dari 8 run; dapat parsial.'
  });
  assert.equal(projectTokenMetric(state.office.tokens, false).value, '—');
  input.totals.tokens_processed = 0;
  assert.equal(projectTokenMetric(projectCockpitSnapshot(input).office.tokens).value, '0');
  input.totals.tokens_processed = null;
  const overflow = projectTokenMetric(projectCockpitSnapshot(input).office.tokens);
  assert.equal(overflow.value, '—');
  assert.match(overflow.description, /melampaui batas angka aman/);
  assert.match(overflow.description, /5 dari 8 run/);
});

test('malformed token measurements fail explicitly', () => {
  for (const measurement of [
    { tokens_processed: -1 },
    { tokens_processed: 1.5 },
    { tokens_processed: 0, tokens_reported_runs: 0, tokens_total_runs: 1 },
    { tokens_processed: 20, tokens_reported_runs: 2, tokens_total_runs: 1 }
  ]) {
    const input = fixture();
    Object.assign(input.totals, measurement);
    assert.throws(() => projectCockpitSnapshot(input), /Invalid cockpit token usage/);
  }
});

test('known disconnected runtimes retain reported work in text while preventing work animation', () => {
  for (const availability of ['offline', 'checking']) {
    const input = fixture();
    Object.assign(input.agents[1], {
      phase: 'working',
      availability,
      active_runs: [run('running')]
    });
    const agent = projectCockpitSnapshot(input).agents.data_engineer;
    assert.notEqual(agent.state, 'bekerja');
    assert.match(agent.task, /sedang menjalankan run/);
  }
});

test('unmapped, filtered and unknown slots never become idle; waits retain distinct meanings', () => {
  const input = fixture();
  Object.assign(input.agents[0], { agent_id: null, availability: 'unmapped' });
  Object.assign(input.agents[1], { in_scope: false });
  Object.assign(input.agents[2], { availability: 'unknown', phase: 'unknown' });
  Object.assign(input.agents[3], { phase: 'awaiting_answer', active_runs: [run('running')] });
  Object.assign(input.agents[4], { phase: 'awaiting_delegates', active_runs: [run('running')] });
  const state = projectCockpitSnapshot(input);
  assert.deepEqual(
    Object.values(state.agents).map((agent) => agent.state),
    ['unmapped', 'filtered', 'unavailable', 'awaiting_answer', 'awaiting_delegates']
  );
  assert.equal(state.queue.waiting_approval, 0);
});

test('idle activity and last failed result stay separate and failure history uses actual terminal state', () => {
  const input = fixture();
  input.agents[1].latest_result = run('failed');
  const state = projectCockpitSnapshot(input);
  assert.equal(state.agents.data_engineer.state, 'siaga');
  assert.equal(state.agents.data_engineer.latestFailure, true);
  assert.equal(state.office.history[0].status, 'failed');
  input.agents[1].latest_result = run('running');
  assert.equal(projectCockpitSnapshot(input).office.history.length, 0);
});

test('actual action counts and waiting for an answer cannot be relabeled QA or roadmap progress', () => {
  const input = fixture();
  Object.assign(input.totals, {
    backlog: 2,
    scheduled: 3,
    working: 1,
    awaiting_answer: 4,
    completed: 7,
    awaiting_delegates: 1
  });
  const board = projectTaskBoard(projectCockpitSnapshot(input));
  assert.deepEqual(
    board.columns.map((item) => item.value),
    [5, 1, 4, 7]
  );
  assert.equal(board.columns[2].label, 'Menunggu jawaban');
  assert.doesNotMatch(JSON.stringify(board), /Uji QA|roadmap/);
});

test('malformed mappings and counts fail explicitly rather than substituting another agent', () => {
  for (const mutate of [
    (input) => {
      input.schema_version = 2;
    },
    (input) => {
      input.agents.pop();
    },
    (input) => {
      input.agents[1].office_role = input.agents[0].office_role;
    },
    (input) => {
      input.agents[1].agent_id = input.agents[0].agent_id;
    },
    (input) => {
      input.agents[1].phase = 'invented';
    },
    (input) => {
      input.totals.working = -1;
    }
  ]) {
    const input = fixture();
    mutate(input);
    assert.throws(() => projectCockpitSnapshot(input), TypeError);
  }
});

test('offline and authorization errors remove facts and operational motion through real presentation wiring', () => {
  const input = fixture();
  Object.assign(input.agents[1], { phase: 'working', active_runs: [run('running')] });
  const presentation = createOfficePresentation(OFFICE_ROLES);
  for (const connection of ['offline', 'error']) {
    presentation.receive(projectCockpitSnapshot(input));
    assert.equal(presentation.getSnapshot().agents.data_engineer.operational.state, 'bekerja');
    presentation.receive(createDisconnectedState(connection));
    const state = presentation.getSnapshot();
    assert.equal(state.connection, connection);
    assert.equal(state.gates.allowWorkMotion, false);
    assert.equal(state.agents.data_engineer.operational.state, null);
  }
});

test('work history ignores generic lifecycle and responses, preserves run trace and 100 meaningful steps', () => {
  const input = fixture();
  const step = {
    office_role: 'data_engineer',
    kind: 'step_activity',
    run_id: 'run-1',
    group_id: 'general',
    status: 'completed',
    created_at: input.generated_at,
    summary: 'Membaca src/cart.js',
    activity: { category: 'reading', state: 'completed', step_index: 4 }
  };
  input.events = [
    { ...step, kind: 'activity_updated' },
    { ...step, activity: { category: 'responding' } },
    ...Array.from({ length: 105 }, (_, id) => ({ ...step, id }))
  ];
  const feed = projectCockpitSnapshot(input).feed;
  assert.equal(feed.length, 100);
  assert.equal(feed[0].text, 'Membaca src/cart.js');
  assert.equal(feed[0].runId, 'run-1');
  assert.equal(feed[0].groupId, 'general');
  assert.equal(feed[0].stepIndex, 4);
  assert.equal(feed[0].stepState, 'completed');
});

test('active cards name every safe read target and distinguish inline Node.js evaluation', () => {
  const input = fixture();
  Object.assign(input.agents[1], {
    phase: 'working',
    active_runs: [run('running')],
    current_activity: {
      run_id: 'run-1',
      category: 'reading',
      state: 'active',
      operation: 'read_file',
      relative_file: 'src/cart.js',
      relative_files: ['src/cart.js', 'package.json'],
      command: 'PRIVATE_COMMAND',
      output: 'PRIVATE_OUTPUT'
    }
  });
  let state = projectCockpitSnapshot(input);
  assert.equal(state.agents.data_engineer.task, 'Membaca src/cart.js, package.json');
  assert.doesNotMatch(JSON.stringify(state), /PRIVATE_/);
  Object.assign(input.agents[1].current_activity, {
    category: 'command',
    operation: 'node_eval',
    relative_file: null,
    relative_files: null
  });
  state = projectCockpitSnapshot(input);
  assert.equal(state.agents.data_engineer.task, 'Menjalankan: Evaluasi JavaScript dengan Node.js');
});

test('completion speech uses the same observed native run through snapshot and presentation', () => {
  const input = fixture();
  const slot = input.agents[1];
  slot.phase = 'working';
  slot.active_runs = [run('running')];
  const presentation = createOfficePresentation(OFFICE_ROLES);
  presentation.receive(projectCockpitSnapshot(input));
  const previous = presentation.getSnapshot().agents.data_engineer.operational;
  assert.deepEqual(previous.activeRunIds, ['run-1']);
  slot.phase = 'idle';
  slot.active_runs = [];
  for (const status of ['succeeded', 'failed', 'cancelled', 'timed_out', 'interrupted']) {
    slot.latest_result = run(status);
    presentation.receive(projectCockpitSnapshot(input));
    const next = presentation.getSnapshot().agents.data_engineer.operational;
    assert.deepEqual(next.latestResult, { runId: 'run-1', status });
    assert.equal(didObservedRunSucceed(previous, next), status === 'succeeded');
    assert.equal(didObservedRunSucceed(next, next), false, 'Polling cannot repeat completion.');
  }
  slot.latest_result = { ...run('succeeded'), id: 'old-success' };
  presentation.receive(projectCockpitSnapshot(input));
  const next = presentation.getSnapshot().agents.data_engineer.operational;
  assert.equal(didObservedRunSucceed(previous, next), false, 'Old success is unrelated.');
  assert.equal(
    didObservedRunSucceed(
      { ...previous, activeRunIds: ['run-1', 'other'] },
      { ...next, latestResult: { runId: 'run-1', status: 'succeeded' } }
    ),
    false
  );
  assert.equal(didObservedRunSucceed({ ...previous, activeRunIds: undefined }, next), false);
  assert.equal(didObservedRunSucceed(previous, { ...next, latestResult: null }), false);
  assert.equal(didObservedRunSucceed(previous, { ...next, activeRunIds: ['still-active'] }), false);
});

test('completion provenance is optional, bounded and does not forward private result fields', () => {
  const input = fixture();
  input.agents[1].latest_result = {
    ...run('succeeded'),
    native_session_id: 'PRIVATE_SESSION',
    output: 'PRIVATE_OUTPUT'
  };
  const projected = projectCockpitSnapshot(input);
  const presentation = createOfficePresentation(OFFICE_ROLES);
  const worker = projected.agents.data_engineer;
  worker.activeRunIds = ['run-1', null];
  worker.latestResult.extra = 'PRIVATE_EXTRA';
  presentation.receive(projected);
  const facts = presentation.getSnapshot().agents.data_engineer.operational;
  assert.equal(facts.activeRunIds, undefined);
  assert.deepEqual(facts.latestResult, { runId: 'run-1', status: 'succeeded' });
  assert.doesNotMatch(JSON.stringify(facts), /PRIVATE_/);
  worker.activeRunIds = [];
  worker.latestResult = { runId: 'x'.repeat(129), status: 'succeeded' };
  presentation.receive(projected);
  assert.equal(presentation.getSnapshot().agents.data_engineer.operational.latestResult, undefined);
});
