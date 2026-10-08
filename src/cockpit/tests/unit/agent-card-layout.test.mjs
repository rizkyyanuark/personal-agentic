import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bindAgentCardLayout,
  requiresSharedStatusRow
} from '../../src/client/ui/agent-card-layout.js';

test('all cards keep an inline status row when every complete label fits', () => {
  const headers = [
    { available: 200, name: 40, status: 78, gap: 6 },
    { available: 200, name: 36, status: 148, gap: 6 }
  ];
  assert.equal(requiresSharedStatusRow(headers), false);
});

test('one long status moves the entire strip to the shared second row', () => {
  const headers = [
    { available: 180, name: 40, status: 78, gap: 6 },
    { available: 180, name: 36, status: 148, gap: 6 },
    { available: 180, name: 34, status: 78, gap: 6 }
  ];
  assert.equal(requiresSharedStatusRow(headers), true);
  assert.equal(
    requiresSharedStatusRow(headers.map((header) => ({ ...header, available: 220 }))),
    false
  );
});

test('exact fit stays inline and text growth is measured without a fixed breakpoint', () => {
  const header = { available: 124, name: 40, status: 78, gap: 6 };
  assert.equal(requiresSharedStatusRow([header]), false);
  assert.equal(requiresSharedStatusRow([{ ...header, status: 79 }]), true);
  assert.equal(requiresSharedStatusRow([{ ...header, name: 80, status: 156, gap: 12 }]), true);
  assert.equal(requiresSharedStatusRow([]), false);
});

test('BFCache return keeps reflow observers alive and final teardown disconnects them', () => {
  const events = new Map();
  const frames = new Map();
  const observers = [];
  let frameId = 0;
  class Observer {
    constructor() {
      observers.push(this);
    }
    observe() {
      this.disconnected = false;
    }
    disconnect() {
      this.disconnected = true;
    }
  }
  const view = {
    MutationObserver: Observer,
    ResizeObserver: Observer,
    requestAnimationFrame(callback) {
      frames.set(++frameId, callback);
      return frameId;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
    addEventListener(name, callback) {
      events.set(name, callback);
    },
    removeEventListener(name) {
      events.delete(name);
    }
  };
  const grid = { ownerDocument: {}, querySelectorAll: () => [] };
  const layout = bindAgentCardLayout(grid, view);
  const flush = () => {
    for (const [id, callback] of frames) {
      frames.delete(id);
      callback();
    }
  };
  flush();
  events.get('pagehide')({ persisted: true });
  assert.equal(
    observers.every((observer) => !observer.disconnected),
    true
  );
  events.get('pageshow')();
  assert.equal(frames.size, 1);
  flush();
  events.get('resize')();
  assert.equal(frames.size, 1);
  events.get('pagehide')({ persisted: false });
  assert.equal(
    observers.every((observer) => observer.disconnected),
    true
  );
  assert.equal(frames.size, 0);
  assert.equal(events.size, 0);
  layout.schedule();
  assert.equal(frames.size, 0);
});
