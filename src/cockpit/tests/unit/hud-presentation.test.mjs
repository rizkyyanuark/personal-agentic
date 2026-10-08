import assert from 'node:assert/strict';
import test from 'node:test';

import {
  projectAgentCardPresentation,
  projectConnectionPresentation
} from '../../src/client/ui/hud.js';

function fixture(state = 'siaga', overrides = {}) {
  return {
    agent: {
      operational: { state, task: 'Status tugas publik.', available: true },
      visual: { kind: 'coffee', text: 'Menikmati kopi', label: 'Suasana ilustratif' },
      workingBubble: {
        kind: 'role-description',
        text: 'Menyiapkan alur data.',
        label: 'Deskripsi peran'
      }
    },
    presentation: {
      connection: overrides.connection || 'live',
      gates: {
        dataFresh: true,
        visible: true,
        reducedMotion: false,
        allowAmbient: true,
        allowWorkMotion: true,
        ...overrides.gates
      }
    }
  };
}

test('loading and unavailable tasks do not invent an idle activity', () => {
  const { presentation } = fixture('siaga', { connection: 'loading' });
  const card = projectAgentCardPresentation(null, presentation);
  assert.equal(card.status.description, 'Status belum tersedia');
  assert.equal(card.task, 'Status tugas belum tersedia.');
  assert.equal(card.subtext, 'Memuat status agent.');
});

test('idle card ignores decorative activity and shows real task availability', () => {
  const { agent, presentation } = fixture();
  Object.defineProperty(agent, 'activity', {
    get() {
      throw new Error('Activity outside the visual source must never be read.');
    }
  });
  const before = JSON.stringify({ agent, presentation });
  const card = projectAgentCardPresentation(agent, presentation);
  assert.equal(card.status.label, 'Santai');
  assert.equal(card.task, 'Status tugas publik.');
  assert.equal(card.subtext, 'Menunggu tugas baru.');
  assert.equal(JSON.stringify({ agent, presentation }), before);

  agent.visual = { kind: 'reading', text: 'Membaca', label: 'Suasana ilustratif' };
  const next = projectAgentCardPresentation(agent, presentation);
  assert.equal(next.subtext, 'Menunggu tugas baru.');
  assert.deepEqual(next.status, card.status);
  assert.equal(next.task, card.task);
});

test('work retains public task and runtime facts in reduced motion', () => {
  const { agent, presentation } = fixture('bekerja', {
    gates: { reducedMotion: true, allowAmbient: false, allowWorkMotion: false }
  });
  const card = projectAgentCardPresentation(agent, presentation);
  assert.equal(card.status.description, 'Bekerja');
  assert.equal(card.task, 'Status tugas publik.');
  assert.equal(card.subtext, 'Run sedang berjalan.');
  assert.doesNotMatch(card.subtext, /Suasana ilustratif|Sedang memproses/);
  agent.workingBubble.kind = 'dialog';
  assert.equal(projectAgentCardPresentation(agent, presentation).subtext, 'Run sedang berjalan.');
  agent.operational.runtimeHint = 'Runtime terhubung';
  assert.equal(projectAgentCardPresentation(agent, presentation).subtext, 'Runtime terhubung');
});

test('waiting and failed use operational hints without ambience or work description', () => {
  const { agent, presentation } = fixture('menunggu_persetujuan');
  const waiting = projectAgentCardPresentation(agent, presentation);
  assert.equal(waiting.status.label, 'Menunggu');
  assert.equal(waiting.status.description, 'Menunggu keputusan');
  assert.equal(waiting.subtext, 'Menunggu persetujuan pemilik');
  agent.operational.state = 'gagal';
  const failed = projectAgentCardPresentation(agent, presentation);
  assert.equal(failed.status.description, 'Gagal');
  assert.equal(failed.subtext, 'Percobaan tugas gagal');
});

test('stale and hidden data are explicit while reduced motion preserves task facts', () => {
  const cases = [
    [{ dataFresh: false, allowAmbient: false }, 'Menunggu status terbaru.'],
    [
      { visible: false, dataFresh: false, allowAmbient: false },
      'Pembaruan dijeda saat tab tersembunyi.'
    ],
    [{ reducedMotion: true, allowAmbient: false }, 'Menunggu tugas baru.']
  ];
  for (const [gates, text] of cases) {
    const { agent, presentation } = fixture('siaga', { gates });
    const card = projectAgentCardPresentation(agent, presentation);
    assert.equal(card.subtext, text);
    assert.equal(card.status.label, 'Santai');
    assert.equal(card.task, 'Status tugas publik.');
  }
});

test('offline and error clear task and active narration', () => {
  for (const [connection, text] of [
    ['offline', 'Koneksi terputus; menunggu status terbaru.'],
    ['error', 'Status belum dapat dibaca.']
  ]) {
    const { agent, presentation } = fixture('bekerja', {
      connection,
      gates: { dataFresh: false, allowAmbient: false, allowWorkMotion: false }
    });
    agent.operational = { state: null, task: null, available: false };
    const card = projectAgentCardPresentation(agent, presentation);
    assert.equal(card.status.description, 'Status belum tersedia');
    assert.equal(card.task, 'Status tugas belum tersedia.');
    assert.equal(card.subtext, text);
  }
});

test('missing animation does not change a card; missing facts remain explicit', () => {
  const { agent, presentation } = fixture();
  agent.visual = null;
  assert.equal(projectAgentCardPresentation(agent, presentation).subtext, 'Menunggu tugas baru.');
  agent.operational = { state: null, task: null, available: false };
  const card = projectAgentCardPresentation(agent, presentation);
  assert.equal(card.status.description, 'Status belum tersedia');
  assert.equal(card.task, 'Status tugas belum tersedia.');
  assert.equal(card.subtext, 'Status agent belum tersedia.');
});

test('foreground resynchronization cannot retain an old Live label or invent a new sync time', () => {
  const state = { connection: 'live', now: '2026-10-04T00:00:00.000Z', queue: { stale: 0 } };
  const { presentation } = fixture();
  const before = projectConnectionPresentation(state, presentation);
  assert.equal(before.status, 'live');
  assert.equal(before.label, 'Live · 07:00:00');
  assert.equal(before.syncText, 'Sinkron 07:00:00 WIB');

  const pending = projectConnectionPresentation(
    { ...state, now: '2026-10-04T01:00:00.000Z' },
    { ...presentation, syncing: true, gates: { ...presentation.gates, dataFresh: false } },
    before.lastSyncTime
  );
  assert.equal(pending.status, 'syncing');
  assert.equal(pending.label, 'Menyinkronkan…');
  assert.equal(pending.syncText, 'Terakhir 07:00:00 WIB');
  assert.equal(pending.lastSyncTime, before.lastSyncTime);

  const after = projectConnectionPresentation(
    { ...state, now: '2026-10-04T01:00:00.000Z' },
    { ...presentation, syncing: false },
    pending.lastSyncTime
  );
  assert.equal(after.label, 'Live · 08:00:00');
  assert.equal(after.syncText, 'Sinkron 08:00:00 WIB');
});

test('hidden, loading, offline, error and stale connections remain explicitly distinguishable', () => {
  const { presentation } = fixture();
  const state = { connection: 'live', now: '2026-10-04T00:00:00.000Z', queue: { stale: 0 } };
  const hidden = projectConnectionPresentation(
    state,
    { ...presentation, syncing: false, gates: { ...presentation.gates, visible: false } },
    '06:59:00'
  );
  assert.equal(hidden.label, 'Tab tidak aktif');
  assert.equal(hidden.syncText, 'Terakhir 06:59:00 WIB');
  const loading = projectConnectionPresentation(null, { connection: 'loading' });
  assert.equal(loading.label, 'Memuat status publik…');
  assert.equal(loading.syncText, 'Belum tersinkron');
  for (const [connection, label] of [
    ['offline', 'Koneksi terputus'],
    ['error', 'Status gagal dimuat']
  ]) {
    const view = projectConnectionPresentation(
      { ...state, connection },
      { ...presentation, syncing: false },
      '06:59:00'
    );
    assert.equal(view.label, label);
    assert.equal(view.syncText, 'Terakhir 06:59:00 WIB');
  }
  const stale = projectConnectionPresentation({ ...state, queue: { stale: 1 } }, presentation);
  assert.equal(stale.status, 'stale');
  assert.equal(stale.label, 'Sesi kedaluwarsa');
  assert.equal(stale.syncText, 'Sinkron 07:00:00 WIB');
  assert.doesNotMatch(stale.label, /Live/);
});
