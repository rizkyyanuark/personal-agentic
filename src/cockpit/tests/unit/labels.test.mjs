import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BUBBLE_LABELS,
  clearSpeechBubble,
  clearSpeechBubbles,
  disposeCharacterLabels,
  normalizeSpeechBubble,
  roleIdentity,
  speechBubblePreview,
  updateSpeechBubble
} from '../../src/client/ui/labels.js';

test('blank Organization position leaves a clean name without an invented title or separator', () => {
  assert.equal(roleIdentity({ name: 'Nova', role: '' }), 'Nova');
  assert.equal(roleIdentity({ name: 'Orion', role: '', slug: 'hq' }), 'Orion');
  assert.equal(roleIdentity({ name: 'Nova', role: 'Data Engineer' }), 'Nova · Data Engineer');
});

function labelsFixture() {
  return Object.fromEntries(
    ['nova', 'atlas'].map((key) => [
      key,
      {
        bubble: { dataset: {}, hidden: true, style: { display: 'none' } },
        bubbleText: { textContent: '' },
        bubbleTimer: null,
        bubbleRecord: null,
        disposed: false,
        dispose() {
          this.disposed = true;
        }
      }
    ])
  );
}

function withTimers(callback) {
  const originalSet = globalThis.setTimeout;
  const originalClear = globalThis.clearTimeout;
  const timers = new Map();
  let nextId = 0;
  globalThis.setTimeout = (handler, delay) => {
    const id = nextId++;
    timers.set(id, { handler, delay });
    return id;
  };
  globalThis.clearTimeout = (id) => timers.delete(id);
  try {
    callback(timers);
  } finally {
    globalThis.setTimeout = originalSet;
    globalThis.clearTimeout = originalClear;
  }
}

test('event bubbles stay explicitly historical and render payload as text', () => {
  withTimers((timers) => {
    const labels = labelsFixture();
    assert.equal(
      updateSpeechBubble(labels, 'nova', { kind: 'event', text: '<b>Agent mulai bekerja</b>' }),
      true
    );
    assert.equal(labels.nova.bubble.dataset.kind, 'event');
    assert.equal(labels.nova.bubbleText.textContent, '<b>Agent mulai bekerja</b>');
    assert.equal(labels.nova.bubble.hidden, false);
    assert.equal(timers.get(0).delay, 6000);
    timers.get(0).handler();
    assert.equal(labels.nova.bubble.hidden, true);
    assert.equal(labels.nova.bubbleRecord, null);
    assert.equal(timers.size, 0);
  });
});

test('work speech bubbles share the same plain class as dialogue', () => {
  withTimers(() => {
    const labels = labelsFixture();
    assert.equal(
      updateSpeechBubble(labels, 'nova', {
        kind: 'work',
        cls: 'hi',
        text: 'Membaca file · src/App.tsx'
      }),
      true
    );
    assert.equal(labels.nova.bubble.dataset.kind, 'work');
    assert.equal(labels.nova.bubble.className, 'speech-bubble bubble');
    assert.equal(labels.nova.bubbleText.textContent, 'Membaca file · src/App.tsx');
    assert.equal(labels.nova.bubble.hidden, false);
  });
});

test('bubble kinds use fixed provenance labels, never a caller-supplied label', () => {
  withTimers(() => {
    const labels = labelsFixture();
    for (const [kind, prefix] of [
      ['dialogue', 'Suasana ilustratif'],
      ['role-description', 'Deskripsi peran'],
      ['work', 'Tugas publik']
    ]) {
      updateSpeechBubble(labels, 'nova', { kind, text: 'Teks', label: 'Aktivitas nyata' });
      assert.equal(labels.nova.bubbleText.textContent, 'Teks');
      assert.equal(BUBBLE_LABELS[kind], prefix);
      assert.equal(labels.nova.bubbleRecord.label, undefined);
      assert(Object.isFrozen(labels.nova.bubbleRecord));
    }
  });
});

test('untyped, invalid, empty or unknown bubbles clear instead of masquerading as work', () => {
  withTimers((timers) => {
    const labels = labelsFixture();
    for (const input of [
      'raw text',
      null,
      { kind: 'unknown', text: 'X' },
      { kind: 'event', text: ' ' }
    ]) {
      updateSpeechBubble(labels, 'nova', { kind: 'event', text: 'Prior event' });
      assert.equal(updateSpeechBubble(labels, 'nova', input), false);
      assert.equal(labels.nova.bubble.hidden, true);
      assert.equal(labels.nova.bubbleText.textContent, '');
      assert.equal(labels.nova.bubble.dataset.kind, undefined);
      assert.equal(timers.size, 0);
    }
    assert.equal(updateSpeechBubble(labels, 'missing', { kind: 'event', text: 'X' }), false);
  });
});

test('replacement cancels the old timer and its queued callback cannot erase a newer bubble', () => {
  withTimers((timers) => {
    const labels = labelsFixture();
    updateSpeechBubble(labels, 'nova', { kind: 'event', text: 'Old' }, 4800);
    const oldCallback = timers.get(0).handler;
    updateSpeechBubble(labels, 'nova', { kind: 'role-description', text: 'New' });
    assert.equal(timers.has(0), false);
    oldCallback();
    assert.equal(labels.nova.bubbleText.textContent, 'New');
    assert.equal(labels.nova.bubble.hidden, false);
    clearSpeechBubble(labels, 'nova');
    assert.equal(timers.size, 0);
  });
});

test('status/gate cancellation and disposal clear every record, timer and visual', () => {
  withTimers((timers) => {
    const labels = labelsFixture();
    for (const key of Object.keys(labels)) {
      updateSpeechBubble(labels, key, { kind: 'dialogue', text: 'Local ambience' });
    }
    clearSpeechBubbles(labels);
    assert.equal(timers.size, 0);
    for (const label of Object.values(labels)) {
      assert.equal(label.bubble.hidden, true);
      assert.equal(label.bubbleRecord, null);
    }
    updateSpeechBubble(labels, 'nova', { kind: 'event', text: 'Another event' });
    disposeCharacterLabels(labels);
    disposeCharacterLabels(labels);
    assert.equal(timers.size, 0);
    assert(Object.values(labels).every((label) => label.disposed));
  });
});

test('bubble text and lifetime are bounded without retaining payload objects', () => {
  withTimers((timers) => {
    const labels = labelsFixture();
    const input = { kind: 'event', text: '\n\u0000' + 'a'.repeat(400), private: 'not retained' };
    updateSpeechBubble(labels, 'nova', input, Infinity);
    assert.equal(labels.nova.bubbleRecord.text.length, 160);
    assert.deepEqual(Object.keys(labels.nova.bubbleRecord), ['kind', 'text']);
    assert.equal(timers.get(0).delay, 6000);
    assert.equal(input.text.length, 402);
    updateSpeechBubble(labels, 'atlas', { kind: 'event', text: 'bounded' }, 0);
    assert.equal(timers.get(1).delay, 100);
  });
});

test('bubble previews are short without splitting joined emoji and full detail remains intact', () => {
  const emoji = '\u{1f469}\u{1f3fd}\u200d\u{1f4bb}';
  const text = emoji.repeat(70);
  const record = normalizeSpeechBubble({ kind: 'work', text });
  const preview = speechBubblePreview(record);
  assert.equal(
    [...new Intl.Segmenter('id', { granularity: 'grapheme' }).segment(preview)].length,
    48
  );
  assert.equal(preview, emoji.repeat(47) + '\u2026');
  assert.equal(record.text, text);
  assert.equal(
    speechBubblePreview({ kind: 'dialogue', text: 'a'.repeat(110) }),
    'a'.repeat(95) + '\u2026'
  );
});
