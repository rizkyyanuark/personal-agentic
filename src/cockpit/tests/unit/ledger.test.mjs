import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { readLabState } from '../legacy/ledger.js';
import { isPublicLabState, OFFICE_ROLES } from '../../src/shared/office-contract.js';

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'cockpit-ledger-'));
  const runtime = path.join(root, 'runtime');
  mkdirSync(runtime);
  const db = new DatabaseSync(path.join(runtime, 'state.sqlite3'));
  db.exec(`
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY, role TEXT NOT NULL, status TEXT NOT NULL,
      updated_at REAL NOT NULL, lease_until REAL, goal TEXT, inputs TEXT,
      result TEXT, checkpoint TEXT, approval_request TEXT, worker_id TEXT,
      lease_token TEXT, project TEXT
    );
    CREATE TABLE events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL,
      kind TEXT NOT NULL, data TEXT NOT NULL, created_at REAL NOT NULL
    );
  `);
  return { root, runtime, db };
}

test('ledger projection exposes only public fields and aggregates task state', () => {
  const { root, runtime, db } = fixture();
  try {
    const now = Date.now() / 1000;
    db.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      'task-secret',
      'data-engineer',
      'running',
      now,
      now + 300,
      'private goal',
      '{"secret":"input"}',
      'private result',
      'private checkpoint',
      'private approval',
      'worker-secret',
      'lease-secret',
      'private-project'
    );
    db.prepare('INSERT INTO events(task_id, kind, data, created_at) VALUES (?, ?, ?, ?)').run(
      'task-secret',
      'claimed',
      '{"secret":"event"}',
      now
    );

    const state = readLabState([runtime]);
    assert.equal(state.connection, 'live');
    assert.equal(state.queue.running, 1);
    assert.equal(state.agents.data_engineer.state, 'bekerja');
    assert.equal(state.feed[0].text, 'Agent mulai mengerjakan tugas');
    assert.equal(isPublicLabState(state), true);
    const serialized = JSON.stringify(state);
    for (const secret of [
      'private goal',
      'secret',
      'worker-secret',
      'lease-secret',
      'private-project'
    ]) {
      assert.equal(serialized.includes(secret), false, `projection leaked ${secret}`);
    }
    assert.deepEqual(Object.keys(state.agents).sort(), OFFICE_ROLES.map(({ key }) => key).sort());
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('retired roles stay out of active cards while their ledger counts and feed remain visible', () => {
  const { root, runtime, db } = fixture();
  try {
    const now = Date.now() / 1000;
    const insertTask = db.prepare(
      'INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const insertEvent = db.prepare(
      'INSERT INTO events(task_id, kind, data, created_at) VALUES (?, ?, ?, ?)'
    );
    for (const [id, role, leaseUntil] of [
      ['active', 'data-engineer', now + 300],
      ['legacy-validation', 'model-validator', now + 300],
      ['legacy-platform', 'mlops-platform-engineer', now - 300],
      ['unknown', 'unlisted-role', now + 300]
    ]) {
      insertTask.run(
        id,
        role,
        'running',
        now,
        leaseUntil,
        'PRIVATE_GOAL',
        'PRIVATE_INPUT',
        'PRIVATE_RESULT',
        'PRIVATE_CHECKPOINT',
        'PRIVATE_APPROVAL',
        'PRIVATE_WORKER',
        'PRIVATE_TOKEN',
        'PRIVATE_PROJECT'
      );
      insertEvent.run(id, 'claimed', '{"secret":"PRIVATE_EVENT"}', now);
    }

    const state = readLabState([runtime]);
    assert.equal(state.connection, 'live');
    assert.deepEqual(state.totals, { tasks: 4, completed: 0, events: 4 });
    assert.equal(state.queue.running, 3);
    assert.equal(state.queue.stale, 1);
    assert.equal(state.agents.data_engineer.state, 'bekerja');
    assert.deepEqual(Object.keys(state.agents).sort(), OFFICE_ROLES.map(({ key }) => key).sort());
    assert.equal(Object.hasOwn(state.agents, 'model_validator'), false);
    assert.equal(Object.hasOwn(state.agents, 'mlops_platform_engineer'), false);
    assert.deepEqual(
      new Set(state.feed.map(({ role }) => role)),
      new Set(['data_engineer', 'archived_model_validator', 'archived_mlops_platform_engineer'])
    );
    assert.equal(state.feed.length, 3);
    assert.equal(isPublicLabState(state), true);
    assert.equal(
      isPublicLabState({
        ...state,
        agents: { ...state.agents, model_validator: { state: 'siaga', task: 'legacy' } }
      }),
      false
    );
    for (const secret of [
      'PRIVATE_GOAL',
      'PRIVATE_INPUT',
      'PRIVATE_RESULT',
      'PRIVATE_CHECKPOINT',
      'PRIVATE_APPROVAL',
      'PRIVATE_WORKER',
      'PRIVATE_TOKEN',
      'PRIVATE_PROJECT',
      'PRIVATE_EVENT'
    ]) {
      assert.equal(JSON.stringify(state).includes(secret), false);
    }
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('projection fails closed when any configured ledger is missing', () => {
  const state = readLabState(['/definitely/missing/cockpit-runtime']);
  assert.equal(state.connection, 'error');
  assert.equal(state.totals.tasks, 0);
  assert.equal(state.feed.length, 0);
  assert.equal(isPublicLabState(state), true);
});
