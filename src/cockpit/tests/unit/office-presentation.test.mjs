import assert from 'node:assert/strict';
import test from 'node:test';
import { OFFICE_ROLES, AGENT_STATES } from '../../src/shared/office-contract.js';
import { createOfficePresentation } from '../../src/client/ui/office-presentation.js';

const IDLE = 'hq_lab_director';
const WORKER = 'data_engineer';

function publicState(connection = 'live', overrides = {}) {
  return {
    connection,
    now: '2026-10-03T12:00:00.000Z',
    totals: { tasks: 4, completed: 1, events: 3 },
    queue: { queued: 1, running: 1, waiting_approval: 1, failed: 0, stale: 0 },
    agents: Object.fromEntries(
      OFFICE_ROLES.map(({ key }) => [key, { state: 'siaga', task: 'Belum ada tugas tercatat' }])
    ),
    feed: [],
    ...overrides
  };
}

function sampled(presentation, state = publicState()) {
  presentation.receive(state);
  presentation.setVisualActivities({ [IDLE]: 'sofa' });
  return presentation.getSnapshot();
}

test('bootstrap is unavailable and cannot accept local atmosphere before a valid receive', () => {
  const presentation = createOfficePresentation(OFFICE_ROLES);
  presentation.setVisualActivities({ [IDLE]: 'sofa' });
  const snapshot = presentation.getSnapshot();
  assert.equal(snapshot.connection, 'loading');
  assert.deepEqual(snapshot.gates, {
    dataFresh: false,
    visible: true,
    reducedMotion: false,
    allowAmbient: false,
    allowWorkMotion: false
  });
  assert.deepEqual(
    Object.keys(snapshot.agents),
    OFFICE_ROLES.map(({ key }) => key)
  );
  for (const agent of Object.values(snapshot.agents)) {
    assert.deepEqual(agent, {
      operational: { state: null, task: '', available: false },
      visual: null,
      workingBubble: null
    });
  }
});

test('live and empty public snapshots permit only labeled, local idle activity', () => {
  for (const connection of ['live', 'empty']) {
    const presentation = createOfficePresentation(OFFICE_ROLES);
    const snapshot = sampled(presentation, publicState(connection));
    assert.equal(snapshot.connection, connection);
    assert.equal(snapshot.gates.dataFresh, true);
    assert.equal(snapshot.gates.allowAmbient, true);
    assert.equal(snapshot.gates.allowWorkMotion, true);
    assert.deepEqual(snapshot.agents[IDLE].visual, {
      kind: 'sofa',
      text: 'Duduk di sofa',
      label: 'Suasana ilustratif'
    });
    assert.equal(snapshot.agents[IDLE].operational.state, 'siaga');
    assert.equal(snapshot.agents[IDLE].operational.available, true);
    assert.equal(snapshot.agents[IDLE].workingBubble, null);
  }
});

test('all valid operational states remain public facts, but only working gets a static bubble', () => {
  const presentation = createOfficePresentation(OFFICE_ROLES);
  for (const state of AGENT_STATES) {
    const snapshot = publicState();
    snapshot.agents[WORKER] = { state, task: 'Kalimat status publik' };
    presentation.receive(snapshot);
    presentation.setVisualActivities({ [WORKER]: 'desk' });
    const agent = presentation.getSnapshot().agents[WORKER];
    assert.deepEqual(agent.operational, {
      state,
      task: 'Kalimat status publik',
      available: true
    });
    assert.equal(agent.visual !== null, state === 'siaga');
    assert.equal(agent.workingBubble !== null, state === 'bekerja');
    if (agent.workingBubble) {
      assert.deepEqual(agent.workingBubble, {
        kind: 'role-description',
        text: 'Penyiapan dan validasi data.',
        label: 'Deskripsi peran'
      });
      assert.ok(!agent.workingBubble.text.includes(agent.operational.task));
    }
  }
});

test('each canonical working role has a static description independent of generic task text', () => {
  const presentation = createOfficePresentation(OFFICE_ROLES);
  const state = publicState();
  for (const { key } of OFFICE_ROLES) {
    state.agents[key] = { state: 'bekerja', task: 'Sedang menjalankan tugas' };
  }
  presentation.receive(state);
  const descriptions = Object.values(presentation.getSnapshot().agents).map(
    ({ workingBubble }) => workingBubble
  );
  assert.equal(new Set(descriptions.map(({ text }) => text)).size, OFFICE_ROLES.length);
  assert.ok(
    descriptions.every(
      ({ kind, label }) => kind === 'role-description' && label === 'Deskripsi peran'
    )
  );
});

test('malformed contracts fail closed without retaining previous activity or operational facts', () => {
  const invalid = [
    null,
    {},
    publicState('live', { now: 'invalid' }),
    publicState('live', { feed: null }),
    publicState('live', { queue: null }),
    publicState('live', { totals: null }),
    publicState('live', { agents: {} }),
    publicState('unrecognized')
  ];
  const badAgent = publicState();
  badAgent.agents[WORKER].state = 'roaming';
  invalid.push(badAgent);
  const badTask = publicState();
  badTask.agents[WORKER].task = { goal: 'private' };
  invalid.push(badTask);
  for (const state of invalid) {
    const presentation = createOfficePresentation(OFFICE_ROLES);
    sampled(presentation);
    presentation.receive(state);
    const snapshot = presentation.getSnapshot();
    assert.equal(snapshot.connection, 'offline');
    assert.equal(snapshot.gates.dataFresh, false);
    assert.equal(snapshot.gates.allowAmbient, false);
    assert.equal(snapshot.agents[IDLE].visual, null);
    assert.deepEqual(snapshot.agents[WORKER].operational, {
      state: null,
      task: '',
      available: false
    });
  }
});

test('numeric zero is the only stale value that permits freshness', () => {
  for (const stale of [1, -1, '0', null, undefined, NaN, Infinity]) {
    const presentation = createOfficePresentation(OFFICE_ROLES);
    const state = publicState();
    state.agents[WORKER].state = 'bekerja';
    state.queue.stale = stale;
    const snapshot = sampled(presentation, state);
    assert.equal(snapshot.gates.dataFresh, false);
    assert.equal(snapshot.gates.allowAmbient, false);
    assert.equal(snapshot.gates.allowWorkMotion, false);
    assert.equal(snapshot.agents[IDLE].visual, null);
    assert.equal(snapshot.agents[WORKER].workingBubble, null);
    assert.equal(snapshot.agents[IDLE].operational.available, stale === 1);
  }
});

test('error and offline clear operational facts, bubbles, and local samples', () => {
  for (const connection of ['error', 'offline']) {
    const presentation = createOfficePresentation(OFFICE_ROLES);
    const state = publicState();
    state.agents[WORKER].state = 'bekerja';
    sampled(presentation, state);
    presentation.receive(publicState(connection));
    const snapshot = presentation.getSnapshot();
    assert.equal(snapshot.connection, connection);
    assert.equal(snapshot.gates.dataFresh, false);
    assert.equal(snapshot.gates.allowWorkMotion, false);
    for (const agent of Object.values(snapshot.agents)) {
      assert.equal(agent.operational.available, false);
      assert.equal(agent.operational.state, null);
      assert.equal(agent.visual, null);
      assert.equal(agent.workingBubble, null);
    }
    presentation.receive(publicState());
    assert.equal(presentation.getSnapshot().agents[IDLE].visual, null);
  }
});

test('hidden polls cannot reopen atmosphere, and showing requires a new visible receive', () => {
  const presentation = createOfficePresentation(OFFICE_ROLES);
  sampled(presentation);
  presentation.setEnvironment({ visible: false });
  presentation.receive(publicState());
  assert.equal(presentation.getSnapshot().gates.dataFresh, false);
  assert.equal(presentation.getSnapshot().gates.visible, false);
  presentation.setEnvironment({ visible: true });
  presentation.setVisualActivities({ [IDLE]: 'sofa' });
  assert.equal(presentation.getSnapshot().gates.allowAmbient, false);
  assert.equal(presentation.getSnapshot().agents[IDLE].visual, null);
  presentation.receive(publicState());
  assert.equal(presentation.getSnapshot().gates.allowAmbient, true);
  assert.equal(presentation.getSnapshot().agents[IDLE].visual, null);
  presentation.setVisualActivities({ [IDLE]: 'board' });
  assert.equal(presentation.getSnapshot().agents[IDLE].visual.kind, 'board');
});

test('an initially hidden environment needs a valid receive after becoming visible', () => {
  const presentation = createOfficePresentation(OFFICE_ROLES, { visible: false });
  sampled(presentation);
  presentation.setEnvironment({ visible: true });
  assert.equal(presentation.getSnapshot().gates.dataFresh, false);
  presentation.receive(publicState());
  assert.equal(presentation.getSnapshot().gates.dataFresh, true);
});

test('reduced motion suppresses atmosphere and work motion while retaining static working text', () => {
  const presentation = createOfficePresentation(OFFICE_ROLES);
  const state = publicState();
  state.agents[WORKER].state = 'bekerja';
  sampled(presentation, state);
  presentation.setEnvironment({ reducedMotion: true });
  const snapshot = presentation.getSnapshot();
  assert.equal(snapshot.gates.dataFresh, true);
  assert.equal(snapshot.gates.reducedMotion, true);
  assert.equal(snapshot.gates.allowAmbient, false);
  assert.equal(snapshot.gates.allowWorkMotion, false);
  assert.equal(snapshot.agents[IDLE].visual, null);
  assert.equal(snapshot.agents[WORKER].workingBubble.label, 'Deskripsi peran');
  presentation.setEnvironment({ reducedMotion: false });
  assert.equal(presentation.getSnapshot().gates.allowAmbient, true);
  assert.equal(presentation.getSnapshot().agents[IDLE].visual, null);
});

test('unchanged environment updates do not invalidate a visible fresh snapshot', () => {
  const presentation = createOfficePresentation(OFFICE_ROLES);
  sampled(presentation);
  presentation.setEnvironment({ visible: true, reducedMotion: false });
  assert.equal(presentation.getSnapshot().gates.dataFresh, true);
  assert.equal(presentation.getSnapshot().agents[IDLE].visual.kind, 'sofa');
});

test('foreground synchronization closes motion without fabricating offline or changing public facts', () => {
  const presentation = createOfficePresentation(OFFICE_ROLES);
  const before = sampled(presentation);
  presentation.beginSync();
  const syncing = presentation.getSnapshot();
  assert.equal(syncing.syncing, true);
  assert.equal(syncing.connection, 'live', 'the last actual connection outcome is preserved');
  assert.equal(syncing.gates.dataFresh, false);
  assert.equal(syncing.gates.allowAmbient, false);
  assert.equal(syncing.gates.allowWorkMotion, false);
  assert.deepEqual(syncing.agents[IDLE].operational, before.agents[IDLE].operational);
  assert.equal(syncing.agents[IDLE].visual, null);
  presentation.receive(publicState());
  assert.equal(presentation.getSnapshot().syncing, false);
  assert.equal(presentation.getSnapshot().gates.dataFresh, true);
});

test('syncing ends on real error or offline outcomes and does not bypass expired-lease safety', () => {
  for (const connection of ['error', 'offline']) {
    const presentation = createOfficePresentation(OFFICE_ROLES);
    sampled(presentation);
    presentation.beginSync();
    presentation.receive(publicState(connection));
    const snapshot = presentation.getSnapshot();
    assert.equal(snapshot.syncing, false);
    assert.equal(snapshot.connection, connection);
    assert.equal(snapshot.gates.allowAmbient, false);
    assert.equal(snapshot.agents[IDLE].operational.available, false);
  }
  const presentation = createOfficePresentation(OFFICE_ROLES);
  sampled(presentation);
  presentation.beginSync();
  const stale = publicState();
  stale.queue.stale = 1;
  presentation.receive(stale);
  assert.equal(presentation.getSnapshot().syncing, false);
  assert.equal(presentation.getSnapshot().connection, 'live');
  assert.equal(presentation.getSnapshot().gates.allowAmbient, false);
});

test('hidden pages cannot claim an active synchronization and must receive fresh visible data', () => {
  const presentation = createOfficePresentation(OFFICE_ROLES);
  sampled(presentation);
  presentation.beginSync();
  presentation.setEnvironment({ visible: false });
  presentation.beginSync();
  assert.equal(presentation.getSnapshot().syncing, false);
  assert.equal(presentation.getSnapshot().gates.dataFresh, false);
  presentation.setEnvironment({ visible: true });
  presentation.beginSync();
  assert.equal(presentation.getSnapshot().syncing, true);
  assert.equal(presentation.getSnapshot().gates.allowAmbient, false);
  presentation.receive(publicState());
  assert.equal(presentation.getSnapshot().syncing, false);
  assert.equal(presentation.getSnapshot().gates.allowAmbient, true);
  presentation.dispose();
  presentation.beginSync();
  assert.equal(presentation.getSnapshot().syncing, false);
});

test('role transitions discard old local poses even when an idle state returns', () => {
  const presentation = createOfficePresentation(OFFICE_ROLES);
  sampled(presentation);
  const state = publicState();
  state.agents[IDLE].state = 'menunggu_persetujuan';
  presentation.receive(state);
  assert.equal(presentation.getSnapshot().agents[IDLE].visual, null);
  assert.equal(presentation.getSnapshot().agents[IDLE].workingBubble, null);
  presentation.receive(publicState());
  assert.equal(presentation.getSnapshot().agents[IDLE].visual, null);
});

test('identical valid polls retain current local pose but a stale interval discards it', () => {
  const presentation = createOfficePresentation(OFFICE_ROLES);
  sampled(presentation);
  presentation.receive(publicState());
  assert.equal(presentation.getSnapshot().agents[IDLE].visual.kind, 'sofa');
  const stale = publicState();
  stale.queue.stale = 1;
  presentation.receive(stale);
  assert.equal(presentation.getSnapshot().agents[IDLE].visual, null);
  presentation.receive(publicState());
  assert.equal(presentation.getSnapshot().agents[IDLE].visual, null);
});

test('samples accept only fixed local kinds for idle roles and ignore caller-supplied narrative', () => {
  const presentation = createOfficePresentation(OFFICE_ROLES);
  presentation.receive(publicState());
  const expected = {
    sofa: 'Duduk di sofa',
    meeting: 'Duduk di area meeting',
    desk: 'Duduk di meja',
    board: 'Berdiri dekat papan'
  };
  for (const [kind, text] of Object.entries(expected)) {
    presentation.setVisualActivities({ [IDLE]: kind });
    assert.deepEqual(presentation.getSnapshot().agents[IDLE].visual, {
      kind,
      text,
      label: 'Suasana ilustratif'
    });
  }
  for (const sample of [
    'game',
    'guitar',
    'Sedang membaca task',
    { kind: 'sofa', text: 'private' }
  ]) {
    presentation.setVisualActivities({ [IDLE]: sample, archived_model_validator: 'sofa' });
    assert.equal(presentation.getSnapshot().agents[IDLE].visual, null);
    assert.equal(
      Object.hasOwn(presentation.getSnapshot().agents, 'archived_model_validator'),
      false
    );
  }
  presentation.setVisualActivities(Object.create({ [IDLE]: 'sofa' }));
  assert.equal(presentation.getSnapshot().agents[IDLE].visual, null);
});

test('operational task normalization matches the 180-character workstation boundary', () => {
  const presentation = createOfficePresentation(OFFICE_ROLES);
  const state = publicState();
  state.agents[WORKER].task = ` \u0000Sedang\n menjalankan\t tugas ${'x'.repeat(200)}`;
  presentation.receive(state);
  const task = presentation.getSnapshot().agents[WORKER].operational.task;
  assert.equal(task.length, 180);
  assert.ok(task.startsWith('Sedang menjalankan tugas '));
  assert.ok(!/[\p{Cc}]/u.test(task));
});

test('activity, private properties, and feed entries are never read as current work', () => {
  const presentation = createOfficePresentation(OFFICE_ROLES);
  const state = publicState();
  const forbidden = () => {
    throw new Error('Private or historical content was read');
  };
  for (const name of ['goal', 'project', 'payload', 'vault', 'activity']) {
    Object.defineProperty(state, name, { get: forbidden });
    Object.defineProperty(state.agents[WORKER], name, { get: forbidden });
  }
  const event = {};
  for (const name of ['role', 'text', 'task', 'goal']) {
    Object.defineProperty(event, name, { get: forbidden });
  }
  state.feed = [event];
  state.agents[WORKER].state = 'bekerja';
  presentation.receive(state);
  const snapshot = presentation.getSnapshot();
  assert.equal(snapshot.gates.dataFresh, true);
  assert.equal(snapshot.agents[WORKER].workingBubble.text, 'Penyiapan dan validasi data.');
  assert.equal(snapshot.agents[IDLE].visual, null);
});

test('input snapshots and returned snapshots cannot mutate retained presentation facts', () => {
  const roles = OFFICE_ROLES.map((role) => ({ ...role }));
  const presentation = createOfficePresentation(roles);
  const state = publicState();
  state.agents[WORKER].state = 'bekerja';
  const original = structuredClone(state);
  sampled(presentation, state);
  assert.deepEqual(state, original);
  state.agents[IDLE].state = 'gagal';
  state.agents[IDLE].task = 'Changed externally';
  state.queue.stale = 1;
  roles[0].key = 'different';
  const snapshot = presentation.getSnapshot();
  snapshot.gates.dataFresh = false;
  snapshot.agents[IDLE].operational.state = 'gagal';
  snapshot.agents[IDLE].visual.text = 'Changed externally';
  snapshot.agents[WORKER].workingBubble.text = 'Changed externally';
  const retained = presentation.getSnapshot();
  assert.equal(retained.gates.dataFresh, true);
  assert.equal(retained.agents[IDLE].operational.state, 'siaga');
  assert.equal(retained.agents[IDLE].operational.task, 'Belum ada tugas tercatat');
  assert.equal(retained.agents[IDLE].visual.text, 'Duduk di sofa');
  assert.equal(retained.agents[WORKER].workingBubble.text, 'Penyiapan dan validasi data.');
  assert.equal(Object.hasOwn(retained.agents, 'different'), false);
});

test('dispose is terminal and releases all operational and illustrative presentation', () => {
  const presentation = createOfficePresentation(OFFICE_ROLES);
  sampled(presentation);
  presentation.dispose();
  presentation.receive(publicState());
  presentation.setEnvironment({ visible: true, reducedMotion: false });
  presentation.setVisualActivities({ [IDLE]: 'sofa' });
  const snapshot = presentation.getSnapshot();
  assert.equal(snapshot.connection, 'offline');
  assert.equal(snapshot.gates.dataFresh, false);
  assert.equal(snapshot.gates.visible, false);
  assert.equal(snapshot.gates.allowAmbient, false);
  for (const agent of Object.values(snapshot.agents)) {
    assert.equal(agent.operational.available, false);
    assert.equal(agent.visual, null);
    assert.equal(agent.workingBubble, null);
  }
});
