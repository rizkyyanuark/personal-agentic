import assert from 'node:assert/strict';
import test from 'node:test';
import { OFFICE_ROLES, isPublicLabState } from '../../src/shared/office-contract.js';
import { createDisconnectedState, projectCockpitSnapshot } from '../../src/client/snapshot.js';
import { createOfficePresentation } from '../../src/client/ui/office-presentation.js';
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

test('real completed runs show Selesai for 60 seconds then Santai, retaining the outcome', () => {
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
    assert.equal(card(input).status.label, 'Selesai');
    assert.equal(card(input).subtext, `Tugas terakhir: ${result}`);
    assert.equal(card(input).task, 'Run selesai');
    assert.equal(projectCockpitSnapshot(input).agents.data_engineer.state, 'siaga');
    input.generated_at = '2026-10-06T01:01:00Z';
    assert.equal(card(input).status.label, 'Santai');
    assert.equal(card(input).subtext, `Tugas terakhir: ${result}`);
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
      kind: 'activity_updated',
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
