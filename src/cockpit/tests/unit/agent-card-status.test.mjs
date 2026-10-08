import assert from 'node:assert/strict';
import test from 'node:test';
import { getAgentCardStatus } from '../../src/client/ui/agent-card-status.js';

test('short waiting pill retains the complete operational meaning', () => {
  const status = getAgentCardStatus('menunggu_persetujuan', 'live');
  assert.equal(status.state, 'menunggu_persetujuan');
  assert.equal(status.label, 'Menunggu');
  assert.equal(status.description, 'Menunggu keputusan');
});

test('card labels follow reference vocabulary while keeping operational states', () => {
  for (const [state, label] of [
    ['bekerja', 'Bekerja'],
    ['siaga', 'Santai'],
    ['selesai', 'Selesai'],
    ['gagal', 'Gagal']
  ]) {
    assert.equal(getAgentCardStatus(state, 'live').label, label);
    assert.equal(getAgentCardStatus(state, 'empty').state, state);
  }
});

test('offline, error, loading, stale and unknown states do not claim live activity', () => {
  for (const connection of ['offline', 'error', 'loading', 'stale']) {
    const status = getAgentCardStatus('menunggu_persetujuan', connection);
    assert.equal(status.state, null);
    assert.equal(status.description, 'Status belum tersedia');
  }
  for (const state of [undefined, null, 'santai', 'unknown']) {
    assert.equal(getAgentCardStatus(state, 'live').state, null);
  }
});
