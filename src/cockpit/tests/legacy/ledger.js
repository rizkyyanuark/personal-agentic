import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  OFFICE_FEED_ROLE_BY_SLUG,
  OFFICE_ROLE_BY_SLUG,
  OFFICE_ROLES
} from '../../src/shared/office-contract.js';

// Only owner-selected lab runtimes are read. Demo fixtures and other projects
// are never discovered by scanning the workspace.
export const DEFAULT_RUNTIME_DIR =
  '/home/ubuntu/infra-hub/ai-ml-lab-suite/runtime/scitldr-ingestion';

const EVENT_TEXT = Object.freeze({
  created: 'Tugas masuk ke antrean',
  claimed: 'Agent mulai mengerjakan tugas',
  checkpointed: 'Checkpoint tugas tersimpan',
  waiting_approval: 'Tugas menunggu persetujuan pemilik',
  resumed: 'Tugas kembali ke antrean',
  external_action_recorded: 'Tindakan pemilik telah dicatat',
  attempt_failed: 'Percobaan tugas gagal',
  lease_expired: 'Sesi kerja agent kedaluwarsa',
  dependency_failed: 'Tugas terhenti karena dependensi gagal',
  succeeded: 'Tugas selesai',
  failed: 'Tugas gagal',
  cancelled: 'Tugas dibatalkan'
});

export function configuredRuntimeDirs(value = process.env.OFFICE_LAB_RUNTIME_DIRS) {
  if (value === undefined) return [DEFAULT_RUNTIME_DIR];
  if (!value.trim()) return [];
  return [
    ...new Set(
      value
        .split(path.delimiter)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ];
}

function emptyState(connection = 'empty') {
  const agents = {};
  for (const { key } of OFFICE_ROLES) {
    agents[key] = { state: 'siaga', task: 'Belum ada tugas tercatat' };
  }
  return {
    connection,
    now: new Date().toISOString(),
    totals: { tasks: 0, completed: 0, events: 0 },
    queue: { queued: 0, running: 0, waiting_approval: 0, failed: 0, stale: 0 },
    agents,
    feed: []
  };
}

function taskPriority(task, nowSeconds) {
  if (task.status === 'running' && Number(task.lease_until) > nowSeconds) return 4;
  if (task.status === 'waiting_approval') return 3;
  if (task.status === 'queued') return 2;
  return 1;
}

function agentView(task, nowSeconds) {
  if (task.status === 'running') {
    return Number(task.lease_until) > nowSeconds
      ? { state: 'bekerja', task: 'Sedang menjalankan tugas' }
      : { state: 'siaga', task: 'Sesi kerja kedaluwarsa, perlu diperiksa' };
  }
  if (task.status === 'waiting_approval') {
    return { state: 'menunggu_persetujuan', task: 'Menunggu keputusan pemilik' };
  }
  if (task.status === 'queued') return { state: 'siaga', task: 'Tugas menunggu giliran' };
  if (task.status === 'failed') return { state: 'gagal', task: 'Tugas terakhir gagal' };
  if (task.status === 'succeeded') return { state: 'siaga', task: 'Tugas terakhir selesai' };
  return { state: 'siaga', task: 'Tugas terakhir dibatalkan' };
}

function readLedger(dbPath, sourceIndex) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const tasks = db
      .prepare('SELECT role, status, updated_at, lease_until FROM tasks ORDER BY updated_at DESC')
      .all();
    const counts = db.prepare('SELECT status, COUNT(*) AS total FROM tasks GROUP BY status').all();
    const eventCount = db.prepare('SELECT COUNT(*) AS total FROM events').get().total;
    const events = db
      .prepare(
        'SELECT e.id, e.kind, e.created_at, t.role FROM events e ' +
          'JOIN tasks t ON t.id = e.task_id ORDER BY e.id DESC LIMIT 30'
      )
      .all()
      .map((event) => ({ ...event, sourceIndex }));
    return { tasks, counts, eventCount, events };
  } finally {
    db.close();
  }
}

/**
 * Project-safe public projection of the real SQLite ledger.
 * No goal, project, input, result, checkpoint, approval reason, worker token,
 * raw event data, or vault document is selected or returned.
 */
export function readLabState(runtimeDirs = configuredRuntimeDirs()) {
  const state = emptyState();
  const nowSeconds = Date.now() / 1000;
  const latestByRole = new Map();
  const feedEvents = [];
  let openedLedgers = 0;

  try {
    for (const [sourceIndex, directory] of runtimeDirs.entries()) {
      if (!path.isAbsolute(directory)) throw new Error('runtime path must be absolute');
      const dbPath = path.join(directory, 'state.sqlite3');
      if (!fs.existsSync(dbPath)) {
        if (
          directory === DEFAULT_RUNTIME_DIR &&
          process.env.OFFICE_LAB_RUNTIME_DIRS === undefined
        ) {
          continue;
        }
        throw new Error('configured runtime not available');
      }

      const ledger = readLedger(dbPath, sourceIndex);
      openedLedgers++;
      for (const count of ledger.counts) {
        const n = Number(count.total);
        state.totals.tasks += n;
        if (count.status === 'succeeded') state.totals.completed += n;
        if (count.status === 'queued') state.queue.queued += n;
        if (count.status === 'waiting_approval') state.queue.waiting_approval += n;
        if (count.status === 'failed') state.queue.failed += n;
      }
      state.totals.events += Number(ledger.eventCount);

      for (const task of ledger.tasks) {
        if (task.status === 'running') {
          if (Number(task.lease_until) > nowSeconds) state.queue.running++;
          else state.queue.stale++;
        }
        if (!Object.hasOwn(OFFICE_ROLE_BY_SLUG, task.role)) continue;
        const roleKey = OFFICE_ROLE_BY_SLUG[task.role];
        const prior = latestByRole.get(roleKey);
        if (
          !prior ||
          taskPriority(task, nowSeconds) > taskPriority(prior, nowSeconds) ||
          (taskPriority(task, nowSeconds) === taskPriority(prior, nowSeconds) &&
            Number(task.updated_at) > Number(prior.updated_at))
        ) {
          latestByRole.set(roleKey, task);
        }
      }
      feedEvents.push(...ledger.events);
    }

    for (const [roleKey, task] of latestByRole) {
      state.agents[roleKey] = agentView(task, nowSeconds);
    }
    state.feed = feedEvents
      .filter(
        (event) =>
          Object.hasOwn(OFFICE_FEED_ROLE_BY_SLUG, event.role) &&
          Number.isFinite(Number(event.created_at))
      )
      .sort((a, b) => Number(b.created_at) - Number(a.created_at))
      .slice(0, 30)
      .map((event) => ({
        id: `${event.sourceIndex}:${event.id}`,
        role: OFFICE_FEED_ROLE_BY_SLUG[event.role],
        kind: Object.hasOwn(EVENT_TEXT, event.kind) ? event.kind : 'other',
        text: Object.hasOwn(EVENT_TEXT, event.kind)
          ? EVENT_TEXT[event.kind]
          : 'Perubahan tugas tercatat',
        tool: null,
        time: new Date(Number(event.created_at) * 1000).toISOString()
      }));
    state.connection = openedLedgers > 0 && state.totals.tasks > 0 ? 'live' : 'empty';
    return state;
  } catch {
    // A partial set of ledgers would create misleading counts, so fail closed.
    return emptyState('error');
  }
}
