import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createApp } from '../legacy/server.js';
import { readLabState } from '../legacy/ledger.js';
import { isPublicLabState, OFFICE_ROLES } from '../../src/shared/office-contract.js';

async function withServer(stateReader, callback) {
  const server = createApp({ stateReader }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const { port } = server.address();
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('GET /api/state is read-only, uncached, and omits framework identity', async () => {
  const state = readLabState([]);
  await withServer(
    () => state,
    async (origin) => {
      const response = await fetch(`${origin}/api/state`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('x-powered-by'), null);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.deepEqual(await response.json(), state);

      const mutation = await fetch(`${origin}/api/event`, { method: 'POST' });
      assert.equal(mutation.status, 404);
    }
  );
});

test('GET /api/state reports a failed projection as unavailable', async () => {
  const state = readLabState(['/definitely/missing/cockpit-runtime']);
  await withServer(
    () => state,
    async (origin) => {
      assert.equal((await fetch(`${origin}/api/state`)).status, 503);
    }
  );
});

test('GET /api/state keeps retired-role history without exposing private ledger fields', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'cockpit-api-'));
  const runtime = path.join(root, 'runtime');
  mkdirSync(runtime);
  const db = new DatabaseSync(path.join(runtime, 'state.sqlite3'));
  try {
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
    const now = Date.now() / 1000;
    const insertTask = db.prepare(
      'INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const insertEvent = db.prepare(
      'INSERT INTO events(task_id, kind, data, created_at) VALUES (?, ?, ?, ?)'
    );
    for (const [id, role, leaseUntil] of [
      ['validator-task', 'model-validator', now + 300],
      ['platform-task', 'mlops-platform-engineer', now - 300]
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

    await withServer(
      () => readLabState([runtime]),
      async (origin) => {
        const response = await fetch(origin + '/api/state');
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        const serialized = await response.text();
        assert.equal(serialized.includes('PRIVATE_'), false);
        const state = JSON.parse(serialized);
        assert.equal(isPublicLabState(state), true);
        assert.deepEqual(Object.keys(state).sort(), [
          'agents',
          'connection',
          'feed',
          'now',
          'queue',
          'totals'
        ]);
        assert.deepEqual(
          Object.keys(state.agents).sort(),
          OFFICE_ROLES.map(({ key }) => key).sort()
        );
        assert.equal(state.queue.running, 1);
        assert.equal(state.queue.stale, 1);
        assert.deepEqual(state.totals, { tasks: 2, completed: 0, events: 2 });
        assert.deepEqual(
          new Set(state.feed.map(({ role }) => role)),
          new Set(['archived_model_validator', 'archived_mlops_platform_engineer'])
        );
        for (const event of state.feed) {
          assert.deepEqual(Object.keys(event).sort(), [
            'id',
            'kind',
            'role',
            'text',
            'time',
            'tool'
          ]);
        }
      }
    );
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});
