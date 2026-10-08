import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAdaptivePixelRatio,
  observeDevicePixelRatio
} from '../../src/client/scene/pixel-ratio.js';

class MockMediaQueryList extends EventTarget {
  constructor(media) {
    super();
    this.media = media;
    this.changeListeners = new Set();
  }

  addEventListener(type, listener, options) {
    if (type === 'change') this.changeListeners.add(listener);
    super.addEventListener(type, listener, options);
  }

  removeEventListener(type, listener, options) {
    if (type === 'change') this.changeListeners.delete(listener);
    super.removeEventListener(type, listener, options);
  }

  emitChange() {
    this.dispatchEvent(new Event('change'));
  }
}

function createBrowser(devicePixelRatio) {
  return {
    devicePixelRatio,
    queries: [],
    matchMedia(media) {
      const query = new MockMediaQueryList(media);
      this.queries.push(query);
      return query;
    }
  };
}

test('adaptive pixel ratio preserves native density between the minimum 1 and maximum 2', () => {
  for (const [native, expected] of [
    [-2, 1],
    [0, 1],
    [0.75, 1],
    [1, 1],
    [1.25, 1.25],
    [1.5, 1.5],
    [2, 2],
    [3, 2],
    [4, 2]
  ]) {
    assert.equal(getAdaptivePixelRatio(native), expected, `native DPR ${native}`);
  }
});

test('observer initially reports capped density but watches the native resolution', () => {
  const browser = createBrowser(3);
  const updates = [];
  const stop = observeDevicePixelRatio((ratio) => updates.push(ratio), browser);
  try {
    assert.deepEqual(updates, [2]);
    assert.equal(browser.queries.length, 1);
    assert.match(browser.queries[0].media, /resolution:\s*3dppx/);
    assert.equal(browser.queries[0].changeListeners.size, 1);
  } finally {
    stop();
  }
});

test('DPR changes rearm native resolution queries without accumulating change listeners', () => {
  const browser = createBrowser(1);
  const updates = [];
  const stop = observeDevicePixelRatio((ratio) => updates.push(ratio), browser);
  try {
    assert.deepEqual(updates, [1]);
    assert.match(browser.queries[0].media, /resolution:\s*1dppx/);

    for (const native of [1.5, 2, 3]) {
      const previous = browser.queries.at(-1);
      browser.devicePixelRatio = native;
      previous.emitChange();

      const active = browser.queries.at(-1);
      assert.notEqual(active, previous);
      const nativePattern = String(native).replaceAll('.', '\\.');
      assert.match(active.media, new RegExp(`resolution:\\s*${nativePattern}dppx`));
      assert.equal(previous.changeListeners.size, 0);
      assert.equal(active.changeListeners.size, 1);
      assert.equal(
        browser.queries.reduce((total, query) => total + query.changeListeners.size, 0),
        1
      );

      const callbackCount = updates.length;
      const queryCount = browser.queries.length;
      previous.emitChange();
      assert.equal(updates.length, callbackCount, 'retired queries do not report changes');
      assert.equal(browser.queries.length, queryCount, 'retired queries do not rearm');
    }

    assert.equal(browser.queries.length, 4);
    assert.deepEqual(updates, [1, 1.5, 2, 2]);
  } finally {
    stop();
  }
});

test('cleanup removes the active observer and prevents callbacks or rearming', () => {
  const browser = createBrowser(1);
  const updates = [];
  const stop = observeDevicePixelRatio((ratio) => updates.push(ratio), browser);
  browser.devicePixelRatio = 1.5;
  browser.queries[0].emitChange();
  assert.deepEqual(updates, [1, 1.5]);

  stop();
  assert.doesNotThrow(stop);
  assert(browser.queries.every((query) => query.changeListeners.size === 0));

  const queryCount = browser.queries.length;
  browser.devicePixelRatio = 2;
  browser.queries.forEach((query) => query.emitChange());
  assert.deepEqual(updates, [1, 1.5]);
  assert.equal(browser.queries.length, queryCount);
});
