import assert from 'node:assert/strict';
import test from 'node:test';

import { StateClient } from '../legacy/state-client.js';
import { OFFICE_ROLES } from '../../src/shared/office-contract.js';

const errorState = {
  connection: 'error',
  now: '2026-09-29T00:00:00.000Z',
  totals: { tasks: 0, completed: 0, events: 0 },
  queue: { queued: 0, running: 0, waiting_approval: 0, failed: 0, stale: 0 },
  agents: Object.fromEntries(
    OFFICE_ROLES.map(({ key }) => [key, { state: 'siaga', task: 'Belum ada tugas tercatat' }])
  ),
  feed: []
};

async function pollWith(fetcher) {
  const previousFetch = globalThis.fetch;
  const previousWarn = console.warn;
  const states = [];
  const warnings = [];
  globalThis.fetch = fetcher;
  console.warn = (...args) => warnings.push(args);
  try {
    const client = new StateClient();
    client.onUpdate((state) => states.push(state));
    await client.poll();
    return { states, warnings };
  } finally {
    globalThis.fetch = previousFetch;
    console.warn = previousWarn;
  }
}

test('a valid 503 projection error reaches the client as error', async () => {
  const { states, warnings } = await pollWith(async () =>
    Response.json(errorState, { status: 503 })
  );
  assert.deepEqual(states, [errorState]);
  assert.equal(warnings.length, 0);
});

test('network failure remains offline', async () => {
  const { states, warnings } = await pollWith(async () => {
    throw new TypeError('network down');
  });
  assert.equal(states.length, 1);
  assert.equal(states[0].connection, 'offline');
  assert.equal(states[0].totals, null);
  assert.equal(states[0].queue, null);
  assert.equal(warnings.length, 1);
});

test('an unrelated HTTP error or mismatched 503 cannot claim a projection error', async () => {
  for (const [status, body] of [
    [500, errorState],
    [503, { ...errorState, connection: 'live' }],
    [503, { connection: 'error' }]
  ]) {
    const { states, warnings } = await pollWith(async () => Response.json(body, { status }));
    assert.equal(states.length, 1);
    assert.equal(states[0].connection, 'offline');
    assert.equal(warnings.length, 1);
  }
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

test('stopping aborts an in-flight poll without emitting a fictitious offline update', async () => {
  const previousFetch = globalThis.fetch;
  const previousWarn = console.warn;
  const warnings = [];
  const states = [];
  let signal;
  globalThis.fetch = (_url, options) => {
    signal = options.signal;
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
    });
  };
  console.warn = (...args) => warnings.push(args);
  const client = new StateClient();
  client.onUpdate((state) => states.push(state));
  try {
    const polling = client.poll();
    assert.equal(client.pending, true);
    client.stop();
    await polling;
    assert.equal(signal.aborted, true);
    assert.equal(client.pending, false);
    assert.equal(client.controller, null);
    assert.deepEqual(states, []);
    assert.deepEqual(warnings, []);
  } finally {
    client.stop();
    globalThis.fetch = previousFetch;
    console.warn = previousWarn;
  }
});

test('a pre-hide response cannot replace a resumed poll or release its pending guard', async () => {
  const previousFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = () => {
    const request = deferred();
    requests.push(request);
    return request.promise;
  };
  const states = [];
  const client = new StateClient();
  client.onUpdate((state) => states.push(state));
  try {
    const beforeHide = client.poll();
    client.stop();
    const afterShow = client.poll();
    assert.equal(requests.length, 2);
    requests[0].resolve(Response.json({ ...errorState, connection: 'live' }));
    await beforeHide;
    assert.equal(client.pending, true);
    assert.deepEqual(states, []);
    await client.poll();
    assert.equal(requests.length, 2, 'new in-flight poll still owns the pending guard');
    requests[1].resolve(Response.json(errorState));
    await afterShow;
    assert.deepEqual(states, [errorState]);
    assert.equal(client.pending, false);
  } finally {
    client.stop();
    globalThis.fetch = previousFetch;
  }
});

test('a stopped response that is already parsing JSON is also ignored', async () => {
  const previousFetch = globalThis.fetch;
  const body = deferred();
  globalThis.fetch = async () => ({ ok: true, status: 200, json: () => body.promise });
  const client = new StateClient();
  const states = [];
  client.onUpdate((state) => states.push(state));
  try {
    const polling = client.poll();
    await Promise.resolve();
    client.stop();
    body.resolve(errorState);
    await polling;
    assert.deepEqual(states, []);
    assert.equal(client.pending, false);
  } finally {
    client.stop();
    globalThis.fetch = previousFetch;
  }
});

test('start is idempotent and restart after stop creates one new polling interval', async () => {
  const previousSet = globalThis.setInterval;
  const previousClear = globalThis.clearInterval;
  const intervals = new Map();
  let nextId = 0;
  globalThis.setInterval = (callback, interval) => {
    const id = nextId++;
    intervals.set(id, { callback, interval });
    return id;
  };
  globalThis.clearInterval = (id) => intervals.delete(id);
  const client = new StateClient();
  let polls = 0;
  client.poll = async () => {
    polls++;
  };
  try {
    client.start();
    client.start();
    assert.equal(polls, 1);
    assert.equal(intervals.size, 1);
    assert.equal(intervals.get(0).interval, 5000);
    client.stop();
    assert.equal(intervals.size, 0);
    client.start();
    assert.equal(polls, 2);
    assert.equal(intervals.size, 1);
    intervals.get(1).callback();
    assert.equal(polls, 3);
  } finally {
    client.stop();
    globalThis.setInterval = previousSet;
    globalThis.clearInterval = previousClear;
  }
});

function wakeFixture(context) {
  const previousFetch = globalThis.fetch;
  const previousSet = globalThis.setInterval;
  const previousClear = globalThis.clearInterval;
  const requests = [];
  const intervals = new Map();
  const states = [];
  let now = 1000;
  let nextId = 0;
  let syncs = 0;
  globalThis.fetch = (_url, { signal }) => {
    const request = { ...deferred(), signal };
    requests.push(request);
    return request.promise;
  };
  globalThis.setInterval = (callback, interval) => {
    const id = nextId++;
    intervals.set(id, { callback, interval });
    return id;
  };
  globalThis.clearInterval = (id) => intervals.delete(id);
  const client = new StateClient('/api/state', 5000, { now: () => now });
  client.onUpdate((state) => states.push(state));
  client.onSync(() => syncs++);
  context.after(async () => {
    client.stop();
    for (const request of requests) request.resolve(Response.json(errorState));
    await Promise.resolve();
    await Promise.resolve();
    globalThis.fetch = previousFetch;
    globalThis.setInterval = previousSet;
    globalThis.clearInterval = previousClear;
  });
  return {
    client,
    requests,
    intervals,
    states,
    syncs: () => syncs,
    advance: (milliseconds) => (now += milliseconds)
  };
}

test('foreground event bursts share one wake request, one interval, and one sync announcement', async (context) => {
  const fixture = wakeFixture(context);
  const first = fixture.client.wake();
  fixture.advance(1000);
  assert.equal(fixture.client.wake(), first, 'even a slow pending wake is not aborted by focus');
  assert.equal(fixture.requests.length, 1);
  assert.equal(fixture.intervals.size, 1);
  assert.equal(fixture.syncs(), 1);
  assert.equal(fixture.requests[0].signal.aborted, false);
  fixture.requests[0].resolve(Response.json(errorState));
  await first;
  assert.equal(fixture.client.pending, false);
  await fixture.client.wake();
  assert.equal(fixture.requests.length, 1, 'a slow resolved wake also coalesces follow-up focus');
});

test('a just-resolved wake coalesces follow-up focus but later focus immediately polls again', async (context) => {
  const fixture = wakeFixture(context);
  const first = fixture.client.wake();
  fixture.requests[0].resolve(Response.json(errorState));
  await first;
  fixture.advance(100);
  await fixture.client.wake();
  assert.equal(fixture.requests.length, 1);
  assert.equal(fixture.syncs(), 1);
  fixture.advance(200);
  const next = fixture.client.wake();
  assert.equal(fixture.requests.length, 2);
  assert.equal(fixture.intervals.size, 1);
  assert.equal(fixture.syncs(), 2);
  fixture.requests[1].resolve(Response.json(errorState));
  await next;
});

test('wake supersedes a pre-focus poll without allowing its late response to release the new guard', async (context) => {
  const fixture = wakeFixture(context);
  const previous = fixture.client.poll();
  const wake = fixture.client.wake();
  assert.equal(fixture.requests.length, 2);
  assert.equal(fixture.requests[0].signal.aborted, true);
  assert.equal(fixture.requests[1].signal.aborted, false);
  fixture.requests[0].resolve(Response.json({ ...errorState, connection: 'live' }));
  await previous;
  assert.equal(fixture.client.pending, true);
  assert.deepEqual(fixture.states, []);
  await fixture.client.poll();
  assert.equal(fixture.requests.length, 2, 'the periodic timer cannot duplicate a wake fetch');
  fixture.requests[1].resolve(Response.json(errorState));
  await wake;
  assert.deepEqual(fixture.states, [errorState]);
  assert.equal(fixture.client.pending, false);
});

test('hiding cancels wake and showing again is not suppressed by the event-burst window', async (context) => {
  const fixture = wakeFixture(context);
  const first = fixture.client.wake();
  fixture.client.stop();
  fixture.advance(10);
  const resumed = fixture.client.wake();
  assert.equal(fixture.requests.length, 2);
  assert.equal(fixture.requests[0].signal.aborted, true);
  assert.equal(fixture.requests[1].signal.aborted, false);
  assert.equal(fixture.intervals.size, 1);
  assert.equal(fixture.syncs(), 2);
  fixture.requests[0].resolve(Response.json(errorState));
  await first;
  assert.equal(fixture.client.pending, true);
  fixture.requests[1].resolve(Response.json(errorState));
  await resumed;
  assert.equal(fixture.client.pending, false);
});
