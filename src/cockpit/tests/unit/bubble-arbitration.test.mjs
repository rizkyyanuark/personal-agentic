import assert from 'node:assert/strict';
import test from 'node:test';
import { createBubbleCoordinator } from '../../src/client/ui/bubble-coordinator.js';

test('a third arrival quip cannot delay the scheduled reply or hide its opener', () => {
  const labelMap = Object.fromEntries(
    ['opener', 'reply', 'arrival'].map((roleKey) => [
      roleKey,
      {
        bubble: { dataset: {}, style: {}, setAttribute() {} },
        bubbleText: { textContent: '' },
        bubbleTimer: null
      }
    ])
  );
  const coordinator = createBubbleCoordinator({ labelMap });
  const candidates = ['opener', 'reply', 'comment'].map((turn, index) => ({
    id: turn,
    roleKey: ['opener', 'reply', 'arrival'][index],
    kind: 'dialogue',
    turn,
    text: turn
  }));
  coordinator.update({
    camera: {},
    width: 1440,
    height: 1000,
    gates: { dataFresh: true, visible: true, allowAmbient: true },
    candidates
  });
  assert.equal(labelMap.opener.bubble.hidden, false);
  assert.equal(labelMap.reply.bubble.hidden, false);
  assert.equal(labelMap.arrival.bubble.hidden, true);
  coordinator.dispose();
  assert(Object.values(labelMap).every((label) => label.bubble.hidden));
});

test('mobile keeps work in cards but permits short dialogue with a uniform bubble class', () => {
  const labelMap = Object.fromEntries(
    ['worker', 'idle'].map((key) => [
      key,
      { bubble: { dataset: {}, style: {} }, bubbleText: { textContent: '' }, bubbleTimer: null }
    ])
  );
  const coordinator = createBubbleCoordinator({ labelMap });
  const candidates = [
    { id: 'work', roleKey: 'worker', kind: 'work', text: 'Membaca file', cls: 'hi' },
    { id: 'step', roleKey: 'worker', kind: 'event', text: 'Membaca src/cart.js' },
    { id: 'chat', roleKey: 'idle', kind: 'dialogue', text: 'Istirahat sebentar' }
  ];
  coordinator.update({
    camera: {},
    width: 390,
    height: 844,
    gates: { dataFresh: true, visible: true, allowAmbient: true },
    candidates
  });
  assert.equal(labelMap.worker.bubble.hidden, true);
  assert.equal(labelMap.idle.bubble.hidden, false);
  assert.equal(labelMap.idle.bubble.className, 'speech-bubble bubble');
  assert.equal(
    coordinator.getDetails().find((detail) => detail.roleKey === 'worker').text,
    'Membaca file'
  );
  coordinator.update({
    camera: {},
    width: 1440,
    height: 1000,
    gates: { dataFresh: true, visible: true, allowAmbient: true },
    candidates
  });
  assert.equal(labelMap.worker.bubble.hidden, false);
  assert.equal(labelMap.worker.bubble.className, labelMap.idle.bubble.className);
  coordinator.dispose();
});
