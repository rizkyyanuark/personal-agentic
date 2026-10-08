import assert from 'node:assert/strict';
import test from 'node:test';
import { bindHeaderLayout } from '../../src/client/ui/header-layout.js';

function fixture(withObserver = true) {
  const events = new Map();
  const fontEvents = new Map();
  const frames = new Map();
  const variables = new Map();
  const observers = [];
  let nextFrame = 0;
  class Observer {
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe(target) {
      this.target = target;
    }
    disconnect() {
      this.disconnected = true;
    }
  }
  const view = {
    ResizeObserver: withObserver ? Observer : undefined,
    requestAnimationFrame(callback) {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
    addEventListener: (name, callback) => events.set(name, callback),
    removeEventListener: (name) => events.delete(name)
  };
  const workspace = {
    getBoundingClientRect: () => ({ top: 10 }),
    style: { setProperty: (name, value) => variables.set(name, value) }
  };
  const header = {
    bottom: 82.4,
    closest: () => workspace,
    getBoundingClientRect() {
      return { bottom: this.bottom };
    },
    ownerDocument: {
      fonts: {
        addEventListener: (name, callback) => fontEvents.set(name, callback),
        removeEventListener: (name) => fontEvents.delete(name)
      }
    }
  };
  const flush = () => {
    for (const [id, callback] of frames) {
      frames.delete(id);
      callback();
    }
  };
  return { view, header, events, fontEvents, frames, variables, observers, flush };
}

test('panel clearance follows the actual header bottom relative to the workspace', () => {
  const state = fixture();
  bindHeaderLayout(state.header, state.view);
  state.flush();
  assert.equal(state.variables.get('--office-header-bottom'), '73px');
  state.header.bottom = 130.2;
  state.observers[0].callback();
  state.observers[0].callback();
  assert.equal(state.frames.size, 1);
  state.flush();
  assert.equal(state.variables.get('--office-header-bottom'), '121px');
});

test('BFCache preserves observers and remeasures on return; teardown releases resources', () => {
  const state = fixture();
  const layout = bindHeaderLayout(state.header, state.view);
  state.flush();
  state.events.get('pagehide')({ persisted: true });
  assert.equal(state.observers[0].disconnected, undefined);
  state.header.bottom = 150;
  state.events.get('pageshow')();
  state.fontEvents.get('loadingdone')();
  assert.equal(state.frames.size, 1);
  state.flush();
  assert.equal(state.variables.get('--office-header-bottom'), '140px');
  layout.schedule();
  state.events.get('pagehide')({ persisted: false });
  assert.equal(state.frames.size, 0);
  assert.equal(state.events.size, 0);
  assert.equal(state.fontEvents.size, 0);
  assert.equal(state.observers[0].disconnected, true);
  layout.schedule();
  assert.equal(state.frames.size, 0);
});

test('resize fallback still measures without ResizeObserver and missing header is harmless', () => {
  const state = fixture(false);
  bindHeaderLayout(state.header, state.view);
  state.flush();
  state.header.bottom = 115;
  state.events.get('resize')();
  state.flush();
  assert.equal(state.variables.get('--office-header-bottom'), '105px');
  assert.equal(bindHeaderLayout(null, state.view), null);
});
