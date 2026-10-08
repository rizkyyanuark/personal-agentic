import assert from 'node:assert/strict';
import test from 'node:test';
import { createCharactersScene } from '../../src/client/scene/characters.js';
import { createCharacterActivityController } from '../../src/client/scene/character-activity.js';
import { ROOM_LAYOUT } from '../../src/client/scene/office-layout.js';
import {
  OFFICE_ACTIVITY_DESTINATIONS,
  createOfficeNavigation
} from '../../src/client/scene/office-navigation.js';
import { DIRECTOR_ANCHOR, getDeskSeat } from '../../src/client/scene/seat-registry.js';
import { createOfficePresentation } from '../../src/client/ui/office-presentation.js';
import { OFFICE_ROLES } from '../../src/shared/office-contract.js';

const STEP_SECONDS = 0.25;
const TRANSITION_PHASES = new Set([
  'releasing',
  'undocking',
  'walking',
  'arriving',
  'sitting',
  'recovering'
]);
const destinations = new Map(OFFICE_ACTIVITY_DESTINATIONS.map((entry) => [entry.id, entry]));

function nearVector(actual, expected, label, tolerance = 1e-8) {
  assert.equal(actual.length, expected.length, `${label} dimensions`);
  actual.forEach((value, axis) => {
    assert(
      Math.abs(value - expected[axis]) <= tolerance,
      `${label}: axis ${axis}, ${value} != ${expected[axis]}`
    );
  });
}

function homeSeat(key) {
  return key === 'hq_lab_director' ? DIRECTOR_ANCHOR : getDeskSeat(key);
}

function publicState(states = {}) {
  return {
    connection: 'live',
    now: '2026-10-04T00:00:00.000Z',
    totals: { tasks: 0, completed: 0, events: 0 },
    queue: { queued: 0, running: 0, waiting_approval: 0, failed: 0, stale: 0 },
    agents: Object.fromEntries(
      OFFICE_ROLES.map(({ key }) => [
        key,
        { state: states[key] ?? 'siaga', task: 'Kalimat status publik untuk fixture' }
      ])
    ),
    feed: []
  };
}

function createFixture(
  context,
  {
    onlyRole = null,
    onlyRoles = null,
    reducedMotion = false,
    visible = true,
    initialPlacement = 'home',
    sessionSeed = '',
    initialStates = {},
    autoReceive = true
  } = {}
) {
  const scene = createCharactersScene();
  const includedRoles = onlyRoles ?? (onlyRole ? [onlyRole] : null);
  const entities = includedRoles
    ? Object.fromEntries(includedRoles.map((key) => [key, scene.characterEntities[key]]))
    : scene.characterEntities;
  const presentation = createOfficePresentation(OFFICE_ROLES, { reducedMotion, visible });
  // Focused trajectory fixtures retain their owned-anchor start and original role seed.
  const controller = createCharacterActivityController(entities, { initialPlacement, sessionSeed });
  const receiveState = (state, environment = {}) => {
    presentation.setEnvironment(environment);
    presentation.receive(state);
    controller.receive(presentation.getSnapshot());
  };
  const receive = (states = {}, environment = {}) => receiveState(publicState(states), environment);
  context.after(() => {
    controller.dispose();
    presentation.dispose();
    const resources = new Set();
    scene.charactersGroup.traverse((object) => {
      if (!object.isMesh) return;
      resources.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        resources.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
      }
    });
    for (const resource of resources) resource.dispose();
  });
  if (autoReceive) receive(initialStates);
  return { entities, controller, receive, receiveState };
}

function advanceUntil(fixture, predicate, label, maximumSeconds = 120, observe = () => {}) {
  for (let step = 0; step < maximumSeconds / STEP_SECONDS; step += 1) {
    const previous = fixture.controller.getActivities();
    fixture.controller.update(STEP_SECONDS, STEP_SECONDS);
    const activities = fixture.controller.getActivities();
    observe(activities, previous);
    if (predicate(activities)) return activities;
  }
  assert.fail(`${label} did not occur within ${maximumSeconds} simulated foreground seconds`);
}

function assertBoundedStep(activities, previous) {
  assert(
    Object.values(activities).filter(({ phase }) => TRANSITION_PHASES.has(phase)).length <= 2,
    'recovery and route retries share the two-character movement limit'
  );
  for (const [key, activity] of Object.entries(activities)) {
    const distance = Math.hypot(
      activity.position[0] - previous[key].position[0],
      activity.position[2] - previous[key].position[2]
    );
    assert(distance <= 1.6 * STEP_SECONDS + 1e-8, `${key} never teleports during recovery`);
    assert.equal(activity.position[1], ROOM_LAYOUT.floorY, `${key} recovery stays on the floor`);
    assert(
      activity.arrivalId === previous[key].arrivalId ||
        activity.arrivalId === previous[key].arrivalId + 1,
      `${key} recovery does not replay arrivals`
    );
  }
}

function pollDuringRecovery(fixture, states) {
  return (activities, previous) => {
    assertBoundedStep(activities, previous);
    fixture.receive(states);
    fixture.controller.update(0, 0);
    const polled = fixture.controller.getActivities();
    for (const [key, activity] of Object.entries(activities)) {
      nearVector(polled[key].position, activity.position, `${key} polling never moves the root`);
      assert.equal(polled[key].arrivalId, activity.arrivalId, `${key} polling is not an arrival`);
    }
  };
}

function enterPartialAccess(fixture, key, phase) {
  const atAccess = advanceUntil(
    fixture,
    (activities) => {
      if (activities[key].phase !== phase) return false;
      if (phase === 'undocking') return true;
      return OFFICE_ACTIVITY_DESTINATIONS.some(
        (entry) =>
          entry.seat &&
          entry.seat.kind !== 'standing' &&
          entry.id !== homeSeat(key).id &&
          Math.hypot(
            activities[key].position[0] - entry.approach[0],
            activities[key].position[2] - entry.approach[2]
          ) < 0.025
      );
    },
    `${key} entering ${phase} access`,
    240,
    assertBoundedStep
  )[key];
  const destination =
    phase === 'undocking'
      ? destinations.get(fixture.entities[key].seat?.id ?? atAccess.destinationId)
      : OFFICE_ACTIVITY_DESTINATIONS.find(
          (entry) =>
            entry.seat &&
            entry.seat.kind !== 'standing' &&
            entry.id !== homeSeat(key).id &&
            Math.hypot(
              atAccess.position[0] - entry.approach[0],
              atAccess.position[2] - entry.approach[2]
            ) < 0.025
        );
  assert.ok(destination, `${key} has a registered access corridor`);
  fixture.controller.update(0.05, 0.05);
  const partial = fixture.controller.getActivities()[key];
  assert.equal(partial.phase, phase, `${key} remains inside the unfinished corridor`);
  const distance = Math.hypot(
    partial.position[0] - atAccess.position[0],
    partial.position[2] - atAccess.position[2]
  );
  assert(distance > 0 && distance <= 1.6 * 0.05 + 1e-8, 'fixture advances one real access step');
  return { destination, partial };
}

function placeAccessBlocker(fixture, key, blockerKey, destination, phase, distance = 0.55) {
  const position = fixture.entities[key].root.position.toArray();
  const points =
    phase === 'undocking'
      ? [...destination.access].reverse().concat([destination.approach])
      : [...destination.access, destination.position];
  const next = points.find(
    (point) => Math.hypot(point[0] - position[0], point[2] - position[2]) > 0.015
  );
  assert.ok(next, 'fixture has an unfinished access segment');
  const dx = next[0] - position[0];
  const dz = next[2] - position[2];
  const length = Math.hypot(dx, dz);
  const blocker = fixture.entities[blockerKey];
  const original = blocker.root.position.toArray();
  blocker.root.position.set(
    position[0] + (dx / length) * distance,
    ROOM_LAYOUT.floorY,
    position[2] + (dz / length) * distance
  );
  return original;
}

test('random bootstrap assigns safe unique leisure destinations with exact root and pose ownership', (context) => {
  const fixture = createFixture(context, {
    initialPlacement: 'random',
    sessionSeed: 'bootstrap-all-idle'
  });
  const navigation = createOfficeNavigation();
  const activities = fixture.controller.getActivities();
  const occupied = new Set();
  for (const [key, activity] of Object.entries(activities)) {
    const destination = destinations.get(activity.destinationId);
    assert.ok(destination, `${key} begins at a registered destination`);
    assert(!['desk', 'board'].includes(destination.kind), `${key} begins in a leisure area`);
    assert(!occupied.has(destination.id), `${destination.id} has one initial occupant`);
    occupied.add(destination.id);
    nearVector(activity.position, destination.position, `${key} initial root is exact`);
    assert.equal(activity.position[1], ROOM_LAYOUT.floorY);
    assert.equal(fixture.entities[key].root.rotation.y, destination.heading);
    assert.equal(fixture.entities[key].seat, destination.seat);
    assert.equal(fixture.entities[key].state, 'siaga');
    assert.equal(activity.arrivalId, 0, 'initial placement is not a completed trip');
    assert(['standing', 'seated'].includes(activity.phase));
    assert.ok(
      navigation.findPath(destination.approach, destinations.get(homeSeat(key).id).approach),
      `${key} initial destination has a route back to home`
    );
    for (const [otherKey, other] of Object.entries(activities)) {
      if (otherKey === key) continue;
      assert(
        Math.hypot(
          activity.position[0] - other.position[0],
          activity.position[2] - other.position[2]
        ) >= 0.62,
        `${key} and ${otherKey} have personal space at bootstrap`
      );
    }
  }
  fixture.controller.update(0, 37.99);
  assert.deepEqual(
    fixture.controller.getActivities(),
    activities,
    'reference initial dwell lasts at least 38 foreground seconds'
  );
  const departing = advanceUntil(
    fixture,
    (next) => Object.values(next).some(({ phase }) => TRANSITION_PHASES.has(phase)),
    'initial reference dwell ending',
    34.25,
    assertBoundedStep
  );
  assert.ok(Object.values(departing).some(({ phase }) => TRANSITION_PHASES.has(phase)));
});

test('injected session seeds reproduce bootstrap and different seeds vary the arrangement', (context) => {
  const first = createFixture(context, { initialPlacement: 'random', sessionSeed: 'same-session' });
  const repeated = createFixture(context, {
    initialPlacement: 'random',
    sessionSeed: 'same-session'
  });
  assert.deepEqual(first.controller.getActivities(), repeated.controller.getActivities());
  for (let step = 0; step < 200; step += 1) {
    first.controller.update(STEP_SECONDS, STEP_SECONDS);
    repeated.controller.update(STEP_SECONDS, STEP_SECONDS);
  }
  assert.deepEqual(
    first.controller.getActivities(),
    repeated.controller.getActivities(),
    'the explicit seed also reproduces the next journey'
  );
  const arrangements = new Set();
  for (const sessionSeed of ['page-one', 'page-two', 'page-three', 'page-four']) {
    const fixture = createFixture(context, { initialPlacement: 'random', sessionSeed });
    arrangements.add(
      JSON.stringify(
        Object.values(fixture.controller.getActivities()).map(({ destinationId }) => destinationId)
      )
    );
  }
  assert(arrangements.size > 1, 'a fresh page seed can produce a different initial arrangement');
});

test('bootstrap waits for fresh visible data and only places operationally idle characters', (context) => {
  const states = {
    hq_lab_director: 'siaga',
    data_engineer: 'bekerja',
    data_scientist: 'menunggu_persetujuan',
    research_scientist: 'gagal',
    ml_engineer: 'gagal'
  };
  const fixture = createFixture(context, {
    initialPlacement: 'random',
    sessionSeed: 'gated-start',
    autoReceive: false
  });
  const assertHomes = () => {
    for (const [key, entity] of Object.entries(fixture.entities))
      nearVector(entity.root.position.toArray(), homeSeat(key).position, `${key} gated root`);
  };
  assertHomes();
  fixture.receiveState({ ...publicState(states), connection: 'offline' });
  fixture.controller.update(STEP_SECONDS, 100000);
  assertHomes();
  fixture.receive(states, { visible: false });
  assertHomes();
  fixture.receive(states, { visible: true });
  const started = fixture.controller.getActivities();
  assert.notEqual(started.hq_lab_director.destinationId, homeSeat('hq_lab_director').id);
  for (const [key, state] of Object.entries(states)) {
    assert.equal(fixture.entities[key].state, state, `${key} keeps its API state`);
    if (state !== 'siaga') {
      nearVector(started[key].position, homeSeat(key).position, `${key} non-idle anchor`);
      assert.equal(started[key].arrivalId, 0);
    }
  }
  fixture.receive(states);
  assert.deepEqual(fixture.controller.getActivities(), started, 'later polls do not place again');
  fixture.receiveState({ ...publicState(states), connection: 'offline' });
  fixture.receive(states);
  for (const [key, activity] of Object.entries(fixture.controller.getActivities()))
    nearVector(activity.position, started[key].position, `${key} reconnect never teleports`);
  fixture.receive();
  for (const [key, activity] of Object.entries(fixture.controller.getActivities()))
    nearVector(activity.position, started[key].position, `${key} later idle state never teleports`);
});

test('reduced-motion first fresh snapshot consumes random bootstrap without later relocation', (context) => {
  const fixture = createFixture(context, {
    initialPlacement: 'random',
    sessionSeed: 'reduced-first',
    reducedMotion: true
  });
  for (const [key, entity] of Object.entries(fixture.entities))
    nearVector(entity.root.position.toArray(), homeSeat(key).position, `${key} reduced anchor`);
  fixture.receive({}, { reducedMotion: false });
  for (const [key, entity] of Object.entries(fixture.entities))
    nearVector(
      entity.root.position.toArray(),
      homeSeat(key).position,
      `${key} no delayed teleport`
    );
});

test('repeated hide/show preserves the remaining idle dwell and never reruns random bootstrap', (context) => {
  const key = 'data_scientist';
  const control = createFixture(context, {
    onlyRole: key,
    initialPlacement: 'random',
    sessionSeed: 'dwell-resume'
  });
  const interrupted = createFixture(context, {
    onlyRole: key,
    initialPlacement: 'random',
    sessionSeed: 'dwell-resume'
  });
  const initial = interrupted.controller.getActivities()[key];
  let departures = 0;
  for (let step = 0; step < 72 / STEP_SECONDS + 1; step += 1) {
    control.controller.update(STEP_SECONDS, STEP_SECONDS);
    interrupted.controller.update(STEP_SECONDS, STEP_SECONDS);
    if (step % 8 === 0) {
      const before = interrupted.controller.getActivities()[key];
      const heading = interrupted.entities[key].root.rotation.y;
      interrupted.receive({}, { visible: false });
      interrupted.controller.update(STEP_SECONDS, 100000);
      nearVector(
        interrupted.controller.getActivities()[key].position,
        before.position,
        'hidden dwell does not move the root'
      );
      interrupted.receive({}, { visible: true });
      nearVector(
        interrupted.controller.getActivities()[key].position,
        before.position,
        'visibility return never reruns placement'
      );
      assert.equal(interrupted.entities[key].root.rotation.y, heading);
    }
    const expected = control.controller.getActivities()[key];
    const actual = interrupted.controller.getActivities()[key];
    assert.equal(actual.phase, expected.phase, 'tab switches preserve the departure deadline');
    assert.equal(actual.arrivalId, expected.arrivalId);
    nearVector(actual.position, expected.position, 'equal foreground time follows the same route');
    if (TRANSITION_PHASES.has(actual.phase)) {
      departures += 1;
      break;
    }
    assert.equal(actual.destinationId, initial.destinationId);
  }
  assert.equal(departures, 1, 'repeated tab switches cannot postpone departure indefinitely');
});

for (const phase of ['releasing', 'undocking', 'walking', 'arriving', 'sitting', 'recovering']) {
  test(`tab visibility preserves and resumes the real ${phase} phase without a bootstrap reset`, (context) => {
    const key = 'data_engineer';
    const blockerKey = 'hq_lab_director';
    const recovering = phase === 'recovering';
    const states = recovering ? { [blockerKey]: 'gagal' } : {};
    const fixture = createFixture(context, {
      onlyRoles: recovering ? [key, blockerKey] : [key],
      initialStates: states
    });
    let blockerOrigin = null;
    if (recovering) {
      const { destination } = enterPartialAccess(fixture, key, 'undocking');
      blockerOrigin = placeAccessBlocker(fixture, key, blockerKey, destination, 'undocking');
    }
    const before = advanceUntil(
      fixture,
      (activities) => activities[key].phase === phase,
      `the real ${phase} phase before tab hide`,
      240,
      assertBoundedStep
    )[key];
    const heading = fixture.entities[key].root.rotation.y;
    fixture.receive(states, { visible: false });
    fixture.controller.update(STEP_SECONDS, 100000);
    const frozen = fixture.controller.getActivities()[key];
    assert.equal(frozen.phase, 'paused');
    assert.equal(frozen.kind, 'neutral');
    nearVector(frozen.position, before.position, `${phase} hidden root is unchanged`);
    assert.equal(frozen.arrivalId, before.arrivalId);
    assert.equal(fixture.entities[key].root.rotation.y, heading);
    fixture.receive(states, { visible: true });
    const resumed = fixture.controller.getActivities()[key];
    assert.equal(resumed.phase, phase, `${phase} resumes its preserved transition`);
    nearVector(resumed.position, before.position, `${phase} resume cannot teleport`);
    assert.equal(resumed.arrivalId, before.arrivalId);
    assert.equal(fixture.entities[key].root.rotation.y, heading);
    if (blockerOrigin) fixture.entities[blockerKey].root.position.fromArray(blockerOrigin);
    const arrived = advanceUntil(
      fixture,
      (activities) => activities[key].arrivalId > before.arrivalId,
      `${phase} completing after visibility resume`,
      120,
      assertBoundedStep
    )[key];
    assert.equal(arrived.arrivalId, before.arrivalId + 1);
    const reached = destinations.get(arrived.destinationId);
    assert.ok(reached);
    nearVector(arrived.position, reached.position, `${phase} resumes to an exact destination`);
  });
}

test('fresh reduced-motion bootstrap pauses at owned anchors rather than allocating idle sofa seats', (context) => {
  const fixture = createFixture(context, { reducedMotion: true });
  const initial = fixture.controller.getActivities();
  assert.deepEqual(fixture.controller.getSamples(), {});
  for (const [key, entity] of Object.entries(fixture.entities)) {
    assert.equal(entity.state, 'siaga', `${key} public state is retained`);
    assert.equal(entity.seat, homeSeat(key), `${key} keeps its initial owned anchor`);
    assert.equal(initial[key].phase, 'paused');
    assert.equal(initial[key].kind, 'neutral');
    assert.equal(initial[key].arrivalId, 0);
    nearVector(initial[key].position, homeSeat(key).position, `${key} bootstrap position`);
    assert.equal(entity.handMug.visible, false);
    assert.equal(entity.handBook.visible, false);
    assert.equal(entity.handPad.visible, false);
  }
  fixture.controller.update(STEP_SECONDS, 100000);
  fixture.receive();
  assert.deepEqual(
    fixture.controller.getActivities(),
    initial,
    'updates and polls do not invent a trip'
  );
});

test('enabling reduced motion during a real trip freezes the actual position without teleporting home', (context) => {
  const key = 'data_scientist';
  const fixture = createFixture(context, { onlyRole: key });
  const home = homeSeat(key).position;
  const moving = advanceUntil(
    fixture,
    (activities) =>
      activities[key].kind === 'walking' &&
      Math.hypot(activities[key].position[0] - home[0], activities[key].position[2] - home[2]) >
        0.5,
    'Atlas walking away from its desk'
  )[key];
  const heading = fixture.entities[key].root.rotation.y;
  fixture.receive({}, { reducedMotion: true });
  const frozen = fixture.controller.getActivities()[key];
  nearVector(frozen.position, moving.position, 'freeze preserves the in-flight position');
  assert.equal(fixture.entities[key].root.rotation.y, heading, 'freeze does not reset heading');
  assert.equal(frozen.phase, 'paused');
  assert.equal(frozen.kind, 'neutral');
  assert.equal(frozen.arrivalId, moving.arrivalId, 'interruption is not an arrival');
  assert.deepEqual(fixture.controller.getSamples(), {});
  for (const elapsed of [0.25, 60, 100000]) {
    fixture.controller.update(STEP_SECONDS, elapsed);
    fixture.receive();
    assert.deepEqual(fixture.controller.getActivities()[key], frozen, 'paused updates stay frozen');
    assert.equal(fixture.entities[key].state, 'siaga');
  }
});

for (const phase of ['undocking', 'arriving']) {
  test(`reduced motion preserves a partially traversed ${phase} corridor and resumes it safely`, (context) => {
    const key = 'data_engineer';
    const fixture = createFixture(context, { onlyRole: key });
    const { destination, partial } = enterPartialAccess(fixture, key, phase);
    const heading = fixture.entities[key].root.rotation.y;
    fixture.receive({}, { reducedMotion: true });
    const frozen = fixture.controller.getActivities()[key];
    nearVector(frozen.position, partial.position, `${phase} freeze keeps the actual root`);
    assert.equal(fixture.entities[key].root.rotation.y, heading);
    assert.equal(frozen.phase, 'paused');
    assert.equal(frozen.arrivalId, partial.arrivalId, 'pausing an access route is not an arrival');
    fixture.controller.update(STEP_SECONDS, 100000);
    fixture.receive();
    assert.deepEqual(
      fixture.controller.getActivities()[key],
      frozen,
      'the partial route stays frozen'
    );

    fixture.receive({}, { reducedMotion: false });
    const resumed = fixture.controller.getActivities()[key];
    nearVector(resumed.position, partial.position, `${phase} resume does not move the root`);
    assert.equal(fixture.entities[key].root.rotation.y, heading, 'resume preserves heading');
    assert.equal(resumed.phase, phase, 'resume retains the unfinished access phase');
    const arrived = advanceUntil(
      fixture,
      (activities) => activities[key].arrivalId > partial.arrivalId,
      `${key} finishing its interrupted ${phase} journey`,
      120,
      assertBoundedStep
    )[key];
    assert.equal(
      arrived.arrivalId,
      partial.arrivalId + 1,
      'the resumed journey completes only once'
    );
    assert(['standing', 'seated'].includes(arrived.phase));
    const reached = destinations.get(arrived.destinationId);
    assert.ok(reached, 'the resumed journey finishes at a registered destination');
    nearVector(arrived.position, reached.position, 'resumed arrival reaches its exact endpoint');
    assert.equal(fixture.entities[key].seat, reached.seat, 'resumed pose owns the reached seat');
    if (phase === 'arriving') assert.equal(reached.id, destination.id, 'ingress keeps its target');
  });

  test(`an obstructed ${phase} corridor backs out at walking speed and retries after it clears`, (context) => {
    const key = 'data_engineer';
    const blockerKey = 'hq_lab_director';
    const fixture = createFixture(context, { onlyRoles: [key, blockerKey] });
    const states = { [blockerKey]: 'gagal' };
    fixture.receive(states);
    const { destination, partial } = enterPartialAccess(fixture, key, phase);
    const blockerOrigin = placeAccessBlocker(fixture, key, blockerKey, destination, phase);
    const observeRecovery = pollDuringRecovery(fixture, states);
    const recovering = advanceUntil(
      fixture,
      (activities) => activities[key].phase === 'recovering',
      `${phase} access recovery`,
      15,
      observeRecovery
    )[key];
    assert.equal(
      recovering.arrivalId,
      partial.arrivalId,
      'a blocked entry is not a completed arrival'
    );
    const recovered = advanceUntil(
      fixture,
      (activities) => activities[key].phase === (phase === 'undocking' ? 'seated' : 'standing'),
      `${phase} recovery completing at its safe origin`,
      15,
      observeRecovery
    )[key];
    const safePoint = phase === 'undocking' ? destination.position : destination.approach;
    nearVector(
      recovered.position,
      safePoint,
      'recovery returns along the traversed access corridor'
    );
    assert.equal(
      recovered.arrivalId,
      partial.arrivalId,
      'rollback never claims a new activity arrival'
    );
    assert(
      !TRANSITION_PHASES.has(recovered.phase),
      'a completed rollback releases the movement slot'
    );
    if (phase === 'undocking') assert.equal(fixture.entities[key].seat, destination.seat);
    else
      assert.equal(
        recovered.destinationId,
        null,
        'rollback to an approach does not occupy its seat'
      );
    fixture.receive(states);
    nearVector(
      fixture.controller.getActivities()[key].position,
      recovered.position,
      'polling keeps the recovered origin in place'
    );
    fixture.controller.update(0, 0);
    nearVector(
      fixture.controller.getActivities()[key].position,
      recovered.position,
      'the recovered origin cannot teleport'
    );

    fixture.entities[blockerKey].root.position.fromArray(blockerOrigin);
    const arrived = advanceUntil(
      fixture,
      (activities) => activities[key].arrivalId > partial.arrivalId,
      `${phase} retry after the blocker leaves`,
      120,
      assertBoundedStep
    )[key];
    const reached = destinations.get(arrived.destinationId);
    assert.ok(reached);
    nearVector(
      arrived.position,
      reached.position,
      'retry finishes at the exact registered endpoint'
    );
    assert.equal(
      arrived.arrivalId,
      partial.arrivalId + 1,
      'a successful retry creates one arrival'
    );
  });
}

test('a blocked recovery waits without holding the movement slot and safely retries its preserved corridor', (context) => {
  const key = 'data_engineer';
  const frontKey = 'hq_lab_director';
  const backKey = 'data_scientist';
  const fixture = createFixture(context, { onlyRoles: [key, frontKey, backKey] });
  const states = { [frontKey]: 'gagal', [backKey]: 'gagal' };
  fixture.receive(states);
  const { destination, partial } = enterPartialAccess(fixture, key, 'undocking');
  const frontOrigin = placeAccessBlocker(fixture, key, frontKey, destination, 'undocking');
  const backOrigin = placeAccessBlocker(fixture, key, backKey, destination, 'undocking', -0.55);
  const observeRecovery = pollDuringRecovery(fixture, states);
  advanceUntil(
    fixture,
    (activities) => activities[key].phase === 'recovering',
    'recovery while both access directions are blocked',
    15,
    observeRecovery
  );
  const waiting = advanceUntil(
    fixture,
    (activities) => activities[key].phase === 'waiting-route',
    'a blocked recovery releasing its movement slot',
    15,
    observeRecovery
  )[key];
  nearVector(
    waiting.position,
    partial.position,
    'a fully blocked recovery stays at its actual root'
  );
  assert.equal(waiting.arrivalId, partial.arrivalId);
  assert.equal(waiting.kind, 'neutral');
  assert(!TRANSITION_PHASES.has(waiting.phase));
  fixture.entities[frontKey].root.position.fromArray(frontOrigin);
  fixture.entities[backKey].root.position.fromArray(backOrigin);
  const arrived = advanceUntil(
    fixture,
    (activities) => activities[key].arrivalId > partial.arrivalId,
    'the preserved recovery and onward trip after the corridor clears',
    120,
    assertBoundedStep
  )[key];
  assert.equal(arrived.arrivalId, partial.arrivalId + 1);
  const reached = destinations.get(arrived.destinationId);
  assert.ok(reached);
  nearVector(
    arrived.position,
    reached.position,
    'the recovered journey finishes without endpoint drift'
  );
});

test('a work-state update during partial ingress safely exits before returning to the owned desk', (context) => {
  const key = 'data_engineer';
  const fixture = createFixture(context, { onlyRole: key });
  const { destination, partial } = enterPartialAccess(fixture, key, 'arriving');
  assert.notEqual(destination.id, homeSeat(key).id, 'fixture enters a leisure seat');
  fixture.receive({ [key]: 'bekerja' });
  const returning = fixture.controller.getActivities()[key];
  nearVector(
    returning.position,
    partial.position,
    'public work status cannot reset a partial ingress root'
  );
  assert.equal(returning.phase, 'returning');
  assert.equal(
    fixture.entities[key].state,
    'bekerja',
    'work state is visible before physical return'
  );
  assert.equal(
    returning.arrivalId,
    partial.arrivalId,
    'interrupting ingress never claims a leisure arrival'
  );
  assert.deepEqual(fixture.controller.getSamples(), {});
  const settled = advanceUntil(
    fixture,
    (activities) =>
      activities[key].destinationId === homeSeat(key).id && activities[key].phase === 'seated',
    'the worker returning through a preserved ingress exit',
    120,
    assertBoundedStep
  )[key];
  nearVector(
    settled.position,
    homeSeat(key).position,
    'the worker settles exactly at its owned desk'
  );
  assert.equal(fixture.entities[key].seat, homeSeat(key));
  assert.equal(
    settled.arrivalId,
    partial.arrivalId + 1,
    'only the completed home return is an arrival'
  );
});

test('roaming settles at registered destinations with seat/root agreement and exclusive occupied seats', (context) => {
  const fixture = createFixture(context);
  const arrivedRoles = new Set();
  let walkingObserved = false;
  let nominalSpeedObserved = false;
  let activities = fixture.controller.getActivities();
  const initialHomes = Object.fromEntries(
    Object.keys(fixture.entities).map((key) => [key, homeSeat(key).id])
  );

  for (let step = 0; step < 300 / STEP_SECONDS; step += 1) {
    const previous = activities;
    fixture.controller.update(STEP_SECONDS, STEP_SECONDS);
    activities = fixture.controller.getActivities();
    assert(
      Object.values(activities).filter(({ phase }) => TRANSITION_PHASES.has(phase)).length <= 2,
      'no more than two idle characters are transitioning at once'
    );
    const occupied = new Set();
    for (const [key, entity] of Object.entries(fixture.entities)) {
      const activity = activities[key];
      assert.equal(entity.state, 'siaga', `${key} visual motion never changes API state`);
      nearVector(activity.position, entity.root.position.toArray(), `${key} sampled root`);
      assert.equal(entity.root.position.y, ROOM_LAYOUT.floorY, `${key} root stays at floor height`);
      const distance = Math.hypot(
        activity.position[0] - previous[key].position[0],
        activity.position[2] - previous[key].position[2]
      );
      assert(
        distance <= 1.6 * STEP_SECONDS + 1e-8,
        `${key} step stays within the reference walking speed`
      );
      nominalSpeedObserved ||=
        activity.kind === 'walking' && Math.abs(distance / STEP_SECONDS - 1.6) < 1e-8;
      assert(
        activity.arrivalId === previous[key].arrivalId ||
          activity.arrivalId === previous[key].arrivalId + 1,
        `${key} physical arrival changes the identifier at most once per frame`
      );
      const completedArrival = activity.arrivalId > previous[key].arrivalId;
      if (completedArrival)
        assert(
          ['standing', 'seated'].includes(activity.phase),
          `${key} arrival identifier advances only after the transition settles`
        );
      walkingObserved ||= activity.kind === 'walking';
      if (entity.seat?.id) {
        assert(!occupied.has(entity.seat.id), `${entity.seat.id} has at most one occupant`);
        occupied.add(entity.seat.id);
      }
      if (!['standing', 'seated'].includes(activity.phase) || !activity.destinationId) continue;
      const destination = destinations.get(activity.destinationId);
      assert.ok(destination, `${key} settles at a registered destination`);
      nearVector(activity.position, destination.position, `${key} settled destination`);
      assert.equal(entity.seat, destination.seat, `${key} settled seat matches its destination`);
      if (completedArrival) {
        if (previous[key].arrivalId === 0)
          assert.notEqual(destination.id, initialHomes[key], `${key} first trip leaves its home`);
        if (destination.id !== initialHomes[key]) arrivedRoles.add(key);
      }
    }
    if (arrivedRoles.size >= 3 && walkingObserved && nominalSpeedObserved) break;
  }
  assert.ok(walkingObserved, 'fixture exercises walking, not only the bootstrap pose');
  assert.ok(nominalSpeedObserved, 'an unobstructed step reaches the reference 1.6 units/second');
  assert(arrivedRoles.size >= 3, 'at least three roles physically arrive away from their home');
});

for (const state of ['bekerja', 'menunggu_persetujuan']) {
  test(`a roaming worker safely returns to its own desk when state becomes ${state}`, (context) => {
    const key = 'data_scientist';
    const fixture = createFixture(context, { onlyRole: key });
    const home = homeSeat(key);
    const away = advanceUntil(
      fixture,
      (activities) =>
        activities[key].arrivalId > 0 &&
        activities[key].destinationId !== home.id &&
        ['standing', 'seated'].includes(activities[key].phase),
      'Atlas arriving at a leisure destination'
    )[key];

    fixture.receive({ [key]: state });
    const returning = fixture.controller.getActivities()[key];
    nearVector(returning.position, away.position, 'public-state update does not teleport');
    assert.equal(returning.phase, 'returning');
    assert.equal(fixture.entities[key].state, state, 'public state changes immediately');
    assert.deepEqual(fixture.controller.getSamples(), {}, 'non-idle return is not idle activity');
    const settled = advanceUntil(
      fixture,
      (activities) =>
        activities[key].destinationId === home.id && activities[key].phase === 'seated',
      `${state} worker returning to its desk`
    )[key];
    nearVector(settled.position, home.position, 'returned root matches the owned desk');
    assert.equal(fixture.entities[key].seat, home);
    assert.equal(fixture.entities[key].state, state);
    assert.equal(settled.kind, 'neutral', 'no decorative activity while working or waiting');
    assert(settled.arrivalId > away.arrivalId, 'completed return is a physical arrival');
    fixture.receive({ [key]: state });
    assert.deepEqual(
      fixture.controller.getActivities()[key],
      settled,
      'polls do not replay arrival'
    );
  });
}
