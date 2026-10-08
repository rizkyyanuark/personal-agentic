import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { getOfficeTime } from '../../src/client/scene/office-clock.js';
import { projectTaskBoard } from '../../src/shared/task-board-contract.js';

function liveState(overrides = {}) {
  return {
    connection: 'live',
    now: '2026-09-28T17:00:00.000Z',
    totals: { tasks: 27, completed: 8, events: 13 },
    queue: { queued: 11, running: 2, waiting_approval: 3, failed: 1, stale: 2 },
    agents: { model_validator: { state: 'bekerja', task: 'Ringkasan publik' } },
    feed: [],
    ...overrides
  };
}

function column(board, key) {
  const result = board.columns.find((item) => item.key === key);
  assert(result, `missing board column ${key}`);
  return result;
}

function attentionValues(board) {
  return Object.fromEntries(board.attention.map(({ key, value }) => [key, value]));
}

function assertClock(instant, expected) {
  const time = getOfficeTime(new Date(instant));
  for (const [key, value] of Object.entries(expected)) assert.equal(time[key], value, key);
  for (const key of ['hour', 'minute', 'second']) assert(Number.isInteger(time[key]));
  assert.deepEqual(Object.keys(time).sort(), [
    'dateText',
    'dayPeriod',
    'hour',
    'minute',
    'minuteKey',
    'second',
    'secondKey',
    'timeText'
  ]);
  return time;
}

test('WIB midnight changes the local date without producing hour 24', () => {
  const before = assertClock('2026-09-28T16:59:59.999Z', {
    hour: 23,
    minute: 59,
    second: 59,
    timeText: '23:59',
    minuteKey: '2026-09-28T23:59',
    secondKey: '2026-09-28T23:59:59',
    dayPeriod: 'night'
  });
  const after = assertClock('2026-09-28T17:00:00.000Z', {
    hour: 0,
    minute: 0,
    second: 0,
    timeText: '00:00',
    minuteKey: '2026-09-29T00:00',
    secondKey: '2026-09-29T00:00:00',
    dayPeriod: 'night'
  });
  assert.match(before.dateText, /28 September 2026/);
  assert.match(after.dateText, /29 September 2026/);
});

test('UTC midnight does not reset a Jakarta clock or its date', () => {
  assertClock('2026-09-28T23:59:59.000Z', {
    hour: 6,
    minute: 59,
    second: 59,
    timeText: '06:59',
    minuteKey: '2026-09-29T06:59',
    secondKey: '2026-09-29T06:59:59',
    dayPeriod: 'day'
  });
  assertClock('2026-09-29T00:00:00.000Z', {
    hour: 7,
    minute: 0,
    second: 0,
    timeText: '07:00',
    minuteKey: '2026-09-29T07:00',
    secondKey: '2026-09-29T07:00:00',
    dayPeriod: 'day'
  });
});

test('WIB year rollover updates the date and texture invalidation keys together', () => {
  const time = assertClock('2026-12-31T17:00:00.000Z', {
    hour: 0,
    minute: 0,
    second: 0,
    timeText: '00:00',
    minuteKey: '2027-01-01T00:00',
    secondKey: '2027-01-01T00:00:00'
  });
  assert.match(time.dateText, /1 Januari 2027/);
});

test('resume and a device-clock correction use the supplied instant instead of accumulated ticks', () => {
  const before = getOfficeTime(new Date('2026-09-28T16:59:58.000Z'));
  assertClock('2026-09-29T00:31:07.000Z', {
    hour: 7,
    minute: 31,
    second: 7,
    timeText: '07:31',
    minuteKey: '2026-09-29T07:31',
    secondKey: '2026-09-29T07:31:07',
    dayPeriod: 'day'
  });
  assertClock('2026-09-28T16:40:00.000Z', {
    hour: 23,
    minute: 40,
    second: 0,
    timeText: '23:40',
    minuteKey: '2026-09-28T23:40',
    secondKey: '2026-09-28T23:40:00'
  });
  assert.equal(before.secondKey, '2026-09-28T23:59:58');
});

test('day and night boundaries use WIB rather than the browser timezone', () => {
  for (const [instant, period] of [
    ['2026-09-28T22:59:59Z', 'night'],
    ['2026-09-28T23:00:00Z', 'day'],
    ['2026-09-29T10:59:59Z', 'day'],
    ['2026-09-29T11:00:00Z', 'night']
  ]) {
    assert.equal(getOfficeTime(new Date(instant)).dayPeriod, period);
  }
});

test('WIB time and Indonesian date text are independent of host TZ and locale', () => {
  const instants = ['2026-09-28T17:00:00Z', '2026-09-29T00:31:07Z', '2026-12-31T17:00:00Z'];
  const expected = instants.map((instant) => getOfficeTime(new Date(instant)));
  const moduleUrl = new URL('../../src/client/scene/office-clock.js', import.meta.url).href;
  const source = `
    import { getOfficeTime } from ${JSON.stringify(moduleUrl)};
    process.stdout.write(JSON.stringify(${JSON.stringify(instants)}.map(
      (instant) => getOfficeTime(new Date(instant))
    )));
  `;
  for (const [TZ, LANG] of [
    ['UTC', 'en_US.UTF-8'],
    ['America/Los_Angeles', 'fr_FR.UTF-8'],
    ['Pacific/Auckland', 'id_ID.UTF-8']
  ]) {
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', source], {
      env: { TZ, LANG, LC_ALL: LANG },
      encoding: 'utf8',
      timeout: 10_000
    });
    assert.deepEqual(JSON.parse(output), expected, `${TZ} / ${LANG}`);
  }
});

test('task board projects running and succeeded counts from their canonical aggregates', () => {
  const board = projectTaskBoard(liveState());
  assert.deepEqual(
    board.columns.map(({ key, label }) => [key, label]),
    [
      ['planning', 'Rencana'],
      ['running', 'Dikerjakan'],
      ['qa', 'Uji QA'],
      ['completed', 'Selesai']
    ]
  );
  assert.equal(column(board, 'running').value, 2);
  assert.equal(column(board, 'running').detail, 'Lease aktif');
  assert.equal(column(board, 'qa').value, 3);
  assert.equal(column(board, 'qa').detail, 'Perlu keputusan');
  assert.equal(column(board, 'completed').value, 8);
  assert.equal(column(board, 'completed').detail, 'Status succeeded');
  assert.equal(board.updatedAt, '2026-09-28T17:00:00.000Z');
  assert.equal(board.connectionLabel, 'Terhubung');
});

test('planning remains unavailable despite queued counts and legacy validator state', () => {
  for (const validatorState of ['bekerja', 'siaga', 'gagal', 'menunggu_persetujuan']) {
    const state = liveState({
      agents: { model_validator: { state: validatorState, task: 'Ringkasan publik' } }
    });
    state.queue.planning = 7;
    state.queue.qa = 6;
    const board = projectTaskBoard(state);
    assert.deepEqual(column(board, 'planning'), {
      key: 'planning',
      label: 'Rencana',
      value: null,
      detail: 'Belum tersedia'
    });
    assert.equal(attentionValues(board).queued, 11);
  }
});

test('attention footer preserves queued, waiting, failed and stale counts separately', () => {
  const board = projectTaskBoard(liveState());
  assert.deepEqual(attentionValues(board), {
    queued: 11,
    waiting_approval: 3,
    failed: 1,
    stale: 2
  });
  assert.deepEqual(
    board.attention.map(({ label }) => label),
    ['Antrean', 'Perlu keputusan', 'Gagal', 'Sesi kedaluwarsa']
  );
  assert.equal(column(board, 'running').value, 2, 'already-filtered running is not recomputed');
  assert.equal(column(board, 'completed').value, 8, 'exceptions do not increase succeeded');
});

test('missing or null counts remain unavailable instead of becoming zero', () => {
  for (const state of [
    liveState({ queue: undefined, totals: undefined }),
    liveState({ queue: null, totals: null }),
    liveState({ queue: { running: null, queued: null, failed: null }, totals: { completed: null } })
  ]) {
    const board = projectTaskBoard(state);
    assert(board.columns.every(({ value }) => value === null));
    assert(board.attention.every(({ value }) => value === null));
  }
});

test('a fresh empty ledger preserves actual zero counts without inventing planning', () => {
  const board = projectTaskBoard(
    liveState({
      connection: 'empty',
      totals: { tasks: 0, completed: 0, events: 0 },
      queue: { queued: 0, running: 0, waiting_approval: 0, failed: 0, stale: 0 }
    })
  );
  assert.equal(board.connectionLabel, 'Belum ada tugas');
  assert.equal(column(board, 'running').value, 0);
  assert.equal(column(board, 'completed').value, 0);
  assert.equal(column(board, 'planning').value, null);
  assert(board.attention.every(({ value }) => value === 0));
});

test('invalid aggregates and timestamps are unavailable rather than coerced', () => {
  for (const invalid of [-1, 1.5, '3', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, false]) {
    const state = liveState({
      queue: {
        queued: invalid,
        running: invalid,
        waiting_approval: invalid,
        failed: invalid,
        stale: invalid
      },
      totals: { completed: invalid },
      now: 'not-a-timestamp'
    });
    const board = projectTaskBoard(state);
    assert(board.columns.every(({ value }) => value === null));
    assert(board.attention.every(({ value }) => value === null));
    assert.equal(board.updatedAt, null);
  }
});

test('offline, error and initial loading hide counts instead of claiming completed work', () => {
  for (const [state, connection, label] of [
    [liveState({ connection: 'offline' }), 'offline', 'Koneksi terputus'],
    [liveState({ connection: 'error' }), 'error', 'Status gagal dimuat'],
    [null, 'loading', 'Menghubungkan']
  ]) {
    const board = projectTaskBoard(state);
    assert.equal(board.connection, connection);
    assert.equal(board.connectionLabel, label);
    assert.equal(board.updatedAt, null);
    assert(board.columns.every(({ value }) => value === null));
    assert(board.attention.every(({ value }) => value === null));
  }
});

test('projection returns only public board fields and does not mutate input or expose private payloads', () => {
  const baseline = liveState();
  const privateFields = Object.fromEntries(
    [
      'goal',
      'project',
      'prompt',
      'input',
      'output',
      'checkpoint',
      'credentials',
      'vault',
      'workerToken',
      'runtimePath',
      'toolPayload',
      'approvalReason'
    ].map((key) => [key, `PRIVATE-${key}`])
  );
  const state = {
    ...baseline,
    ...privateFields,
    queue: { ...baseline.queue, ...privateFields },
    totals: { ...baseline.totals, ...privateFields },
    agents: { model_validator: { state: 'bekerja', task: 'PRIVATE-task-title', ...privateFields } },
    feed: [{ text: 'PRIVATE-raw-event', ...privateFields }]
  };
  const before = structuredClone(state);
  const board = projectTaskBoard(state);
  assert.deepEqual(board, projectTaskBoard(baseline));
  assert.deepEqual(state, before);
  assert.deepEqual(Object.keys(board).sort(), [
    'attention',
    'columns',
    'connection',
    'connectionLabel',
    'updatedAt'
  ]);
  for (const item of board.columns)
    assert.deepEqual(Object.keys(item).sort(), ['detail', 'key', 'label', 'value']);
  for (const item of board.attention)
    assert.deepEqual(Object.keys(item).sort(), ['key', 'label', 'value']);
  assert.doesNotMatch(JSON.stringify(board), /PRIVATE-/);
});

test('projection does not access private payloads or agent-task detail to derive board stages', () => {
  const state = liveState();
  const expected = projectTaskBoard(state);
  for (const field of ['agents', 'feed', 'vault', 'toolPayload']) {
    Object.defineProperty(state, field, {
      enumerable: true,
      get() {
        throw new Error(`board must not read ${field}`);
      }
    });
  }
  assert.deepEqual(projectTaskBoard(state), expected);
});
