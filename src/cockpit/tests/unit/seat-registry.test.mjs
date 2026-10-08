import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHARACTER_CONFIGS,
  DESK_CONFIGS,
  FURNITURE_LAYOUT,
  ROOM_LAYOUT
} from '../../src/client/scene/office-layout.js';
import {
  allocateCharacterSeats,
  DESK_SEATS,
  DIRECTOR_ANCHOR,
  getDeskSeat,
  MEETING_SEATS,
  SOFA_SEATS
} from '../../src/client/scene/seat-registry.js';
import {
  CHAIR_CHARACTER_FORWARD,
  CHAIR_SURFACE_HEIGHT,
  CHARACTER_RIG,
  DESK_CHAIR_OFFSET,
  SOFA_SEAT_OFFSETS,
  SOFA_SURFACE_HEIGHT
} from '../../src/client/scene/seating-contract.js';

const roleKeys = CHARACTER_CONFIGS.map(({ key }) => key);
const deskKeys = DESK_CONFIGS.map(({ key }) => key);
const seats = [...DESK_SEATS, ...SOFA_SEATS, ...MEETING_SEATS];

function near(actual, expected, label, tolerance = 1e-12) {
  assert(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
}

function fixtureLocal(entry) {
  const x = entry.position[0] - entry.fixture.x;
  const z = entry.position[2] - entry.fixture.z;
  const sin = Math.sin(entry.heading);
  const cos = Math.cos(entry.heading);
  return [x * cos - z * sin, entry.position[1] - ROOM_LAYOUT.floorY, x * sin + z * cos];
}

function facingAngle(entry) {
  const dx = entry.lookTarget[0] - entry.position[0];
  const dz = entry.lookTarget[2] - entry.position[2];
  const length = Math.hypot(dx, dz);
  assert(length > 0, `${entry.id} must have a distinct horizontal look target`);
  const dot = (Math.sin(entry.heading) * dx + Math.cos(entry.heading) * dz) / length;
  return Math.acos(Math.min(1, Math.max(-1, dot)));
}

function entitiesWith(states = {}, order = roleKeys) {
  return Object.fromEntries(
    order.map((key) => [key, Object.freeze({ state: states[key] ?? 'siaga' })])
  );
}

function assignmentIds(assignments) {
  return Object.fromEntries(Object.entries(assignments).map(([key, entry]) => [key, entry.id]));
}

function assertUniqueAssignments(assignments) {
  assert.deepEqual(Object.keys(assignments), roleKeys);
  const ids = Object.values(assignments).map(({ id }) => id);
  assert.equal(new Set(ids).size, roleKeys.length, 'characters may not share an anchor');
  assert.equal(assignments.hq_lab_director, DIRECTOR_ANCHOR);
  for (const key of deskKeys) {
    const entry = assignments[key];
    assert(entry.kind === 'desk' || entry.kind === 'sofa', `${key} has a usable seat`);
    if (entry.kind === 'desk') assert.equal(entry, getDeskSeat(key));
  }
}

test('registry exposes four role-owned desks, two sofa slots, three meeting seats, and no HQ desk', () => {
  assert.equal(DESK_SEATS.length, 4);
  assert.equal(SOFA_SEATS.length, 2);
  assert.equal(MEETING_SEATS.length, 3);
  assert.deepEqual(
    DESK_SEATS.map(({ id }) => id),
    ['desk:data_engineer', 'desk:data_scientist', 'desk:research_scientist', 'desk:ml_engineer']
  );
  assert.deepEqual(
    SOFA_SEATS.map(({ id }) => id),
    ['sofa:left', 'sofa:right']
  );
  assert.deepEqual(
    MEETING_SEATS.map(({ id }) => id),
    ['meeting:0', 'meeting:1', 'meeting:2']
  );
  assert.equal(new Set(seats.map(({ id }) => id)).size, 9);
  assert(!seats.some(({ roleKey }) => roleKey === 'hq_lab_director'));
  assert.equal(getDeskSeat('hq_lab_director'), null);
  assert.equal(getDeskSeat('missing-role'), null);
  for (const [index, key] of deskKeys.entries()) assert.equal(getDeskSeat(key), DESK_SEATS[index]);
});

test('measured surface heights and nested anchor data are immutable', () => {
  near(CHAIR_SURFACE_HEIGHT, 0.472405, 'GLTF chair cushion height', 1e-6);
  near(SOFA_SURFACE_HEIGHT, 0.54, 'GLTF sofa cushion height', 1e-6);
  assert.equal(CHAIR_CHARACTER_FORWARD, 0.1);
  assert.equal(DESK_CHAIR_OFFSET, 0.9);
  for (const collection of [DESK_SEATS, SOFA_SEATS, MEETING_SEATS, SOFA_SEAT_OFFSETS]) {
    assert(Object.isFrozen(collection));
  }
  for (const entry of seats) {
    for (const value of [
      entry,
      entry.fixture,
      entry.position,
      entry.lookTarget,
      entry.bounds,
      entry.footprint
    ]) {
      assert(Object.isFrozen(value), `${entry.id} anchor data is immutable`);
    }
    near(entry.position[1], ROOM_LAYOUT.floorY, `${entry.id} root stays on parquet`);
    near(
      entry.surfaceY,
      ROOM_LAYOUT.floorY + (entry.kind === 'sofa' ? SOFA_SURFACE_HEIGHT : CHAIR_SURFACE_HEIGHT),
      `${entry.id} world cushion height`
    );
  }
  assert(Object.isFrozen(DIRECTOR_ANCHOR));
  assert(Object.isFrozen(DIRECTOR_ANCHOR.position));
  assert(Object.isFrozen(DIRECTOR_ANCHOR.lookTarget));
  assert(Object.isFrozen(CHARACTER_RIG));
  for (const [key, value] of Object.entries(CHARACTER_RIG)) {
    assert(Number.isFinite(value) && value > 0, `${key} is a positive finite rig dimension`);
  }
});

test('chair fixture and hip anchors differ by the measured 0.10m positive-front offset', () => {
  for (const entry of [...DESK_SEATS, ...MEETING_SEATS]) {
    const [x, y, z] = fixtureLocal(entry);
    near(x, 0, `${entry.id} hip centered across cushion`);
    near(y, 0, `${entry.id} uses floor-root convention`);
    near(z, CHAIR_CHARACTER_FORWARD, `${entry.id} hip shifts toward normalized front`);
    near(
      Math.hypot(entry.position[0] - entry.fixture.x, entry.position[2] - entry.fixture.z),
      0.1,
      `${entry.id} fixture is not conflated with hip anchor`
    );
  }
  for (const [index, desk] of DESK_CONFIGS.entries()) {
    const entry = DESK_SEATS[index];
    assert.equal(entry.roleKey, desk.key);
    near(entry.fixture.x, desk.x, `${entry.id} fixture x`);
    near(entry.fixture.z, desk.z + DESK_CHAIR_OFFSET, `${entry.id} fixture z`);
    near(
      entry.position[2],
      desk.z + DESK_CHAIR_OFFSET - CHAIR_CHARACTER_FORWARD,
      `${entry.id} hip advances toward desk`
    );
  }
});

test('all projected anchors are supported and furniture footprints remain inside the room', () => {
  for (const entry of seats) {
    const [x, , z] = fixtureLocal(entry);
    const [minX, maxX, minZ, maxZ] = entry.bounds;
    assert(minX < maxX && minZ < maxZ, `${entry.id} support bounds have area`);
    assert(x > minX && x < maxX, `${entry.id} hip x is inside support bounds`);
    assert(z > minZ && z < maxZ, `${entry.id} hip z is inside support bounds`);
    const [width, depth] = entry.footprint;
    assert(width > 0 && depth > 0, `${entry.id} fixture footprint has area`);
    const sin = Math.sin(entry.heading);
    const cos = Math.cos(entry.heading);
    for (const localX of [-width / 2, width / 2]) {
      for (const localZ of [-depth / 2, depth / 2]) {
        const roomX = entry.fixture.x + localX * cos + localZ * sin;
        const roomZ = entry.fixture.z - localX * sin + localZ * cos;
        assert(roomX > ROOM_LAYOUT.min[0] && roomX < ROOM_LAYOUT.max[0], `${entry.id} footprint x`);
        assert(roomZ > ROOM_LAYOUT.min[2] && roomZ < ROOM_LAYOUT.max[2], `${entry.id} footprint z`);
      }
    }
  }
});

test('sofa slots stay on separate outer cushions instead of the lower seams', () => {
  for (const [index, entry] of SOFA_SEATS.entries()) {
    const expected = SOFA_SEAT_OFFSETS[index];
    const actual = fixtureLocal(entry);
    actual.forEach((value, axis) => near(value, expected[axis], `${entry.id} local axis ${axis}`));
    assert.deepEqual(entry.fixture, FURNITURE_LAYOUT.lounge);
    assert(Math.abs(actual[0]) > 0.3, `${entry.id} avoids center cushion and ±0.30m seams`);
    assert(entry.bounds[0] >= -1.05 && entry.bounds[1] <= 1.05);
    assert(entry.bounds[2] >= -0.45 && entry.bounds[3] <= 0.45);
  }
  assert(SOFA_SEATS[0].bounds[1] < -0.325, 'left support excludes the measured [-.325,-.275] seam');
  assert(SOFA_SEATS[1].bounds[0] > 0.325, 'right support excludes the measured [.275,.325] seam');
  assert(SOFA_SEATS[0].bounds[1] < SOFA_SEATS[1].bounds[0], 'support regions do not overlap');
  near(SOFA_SEAT_OFFSETS[0][0], -SOFA_SEAT_OFFSETS[1][0], 'symmetric outer cushion slots');
});

test('positive-Z chair fronts face monitors and meeting center within ten degrees', () => {
  const maxAngle = (10 / 180) * Math.PI;
  for (const entry of [...DESK_SEATS, ...MEETING_SEATS]) {
    assert(facingAngle(entry) <= maxAngle, `${entry.id} faces its look target`);
  }
  for (const [index, desk] of DESK_CONFIGS.entries()) {
    assert.deepEqual(DESK_SEATS[index].lookTarget, [
      desk.x,
      ROOM_LAYOUT.floorY + 1.24,
      desk.z - 0.22
    ]);
  }
  for (const entry of MEETING_SEATS) {
    assert.deepEqual(entry.lookTarget, [
      FURNITURE_LAYOUT.meeting.x,
      ROOM_LAYOUT.floorY + 0.9,
      FURNITURE_LAYOUT.meeting.z
    ]);
    near(
      Math.hypot(
        entry.fixture.x - FURNITURE_LAYOUT.meeting.x,
        entry.fixture.z - FURNITURE_LAYOUT.meeting.z
      ),
      1.35,
      `${entry.id} fixture circle radius`
    );
  }
});

test('sofa bodies follow the backrest while look targets point toward the actual TV', () => {
  for (const entry of SOFA_SEATS) {
    assert.equal(entry.heading, FURNITURE_LAYOUT.lounge.heading);
    assert.deepEqual(entry.lookTarget, [
      FURNITURE_LAYOUT.tv.x,
      ROOM_LAYOUT.floorY + 1.14,
      FURNITURE_LAYOUT.tv.z
    ]);
    assert(facingAngle(entry) < Math.PI / 2, `${entry.id} TV lies in front, not behind the sofa`);
  }
});

test('idle allocation follows canonical role order, not input order, random values, or wall time', () => {
  const originalNow = Date.now;
  const originalRandom = Math.random;
  Date.now = () => {
    throw new Error('seat allocation may not depend on a timer');
  };
  Math.random = () => {
    throw new Error('seat allocation may not depend on randomness');
  };
  try {
    const orders = [
      roleKeys,
      [...roleKeys].reverse(),
      [...roleKeys.slice(3), ...roleKeys.slice(0, 3)]
    ];
    const expected = Object.fromEntries(
      roleKeys.map((key) => [
        key,
        key === 'hq_lab_director'
          ? 'standing:hq'
          : key === deskKeys[0]
            ? 'sofa:left'
            : key === deskKeys[1]
              ? 'sofa:right'
              : `desk:${key}`
      ])
    );
    for (const order of orders) {
      const entities = Object.freeze(entitiesWith({}, order));
      const assignments = allocateCharacterSeats(entities);
      assertUniqueAssignments(assignments);
      assert.deepEqual(assignmentIds(assignments), expected);
      assert.deepEqual(assignmentIds(allocateCharacterSeats(entities)), expected);
      assert(
        order.every((key) => entities[key].state === 'siaga'),
        'allocation does not mutate public status'
      );
    }
  } finally {
    Date.now = originalNow;
    Math.random = originalRandom;
  }
});

test('only siaga receives a sofa seat; all other or missing states retain their own desk', () => {
  for (const state of [
    'bekerja',
    'menunggu_persetujuan',
    'gagal',
    'offline',
    'stale',
    'loading',
    '',
    null,
    undefined
  ]) {
    const entities = Object.fromEntries(roleKeys.map((key) => [key, { state }]));
    const assignments = allocateCharacterSeats(entities);
    assertUniqueAssignments(assignments);
    for (const key of deskKeys)
      assert.equal(assignments[key], getDeskSeat(key), `${key}: ${state}`);
  }
  const assignments = allocateCharacterSeats({});
  assertUniqueAssignments(assignments);
  for (const key of deskKeys) assert.equal(assignments[key], getDeskSeat(key));
});

test('disabled idle seating uses owned desk and HQ anchors without changing operational states', () => {
  for (const states of [
    {},
    {
      hq_lab_director: 'gagal',
      data_engineer: 'siaga',
      data_scientist: 'bekerja',
      research_scientist: 'menunggu_persetujuan',
      ml_engineer: 'gagal'
    }
  ]) {
    const entities = Object.freeze(entitiesWith(states));
    const before = Object.fromEntries(roleKeys.map((key) => [key, entities[key].state]));
    const assignments = allocateCharacterSeats(entities, { allowIdleSeating: false });
    assertUniqueAssignments(assignments);
    for (const key of deskKeys) assert.equal(assignments[key], getDeskSeat(key));
    assert.deepEqual(Object.fromEntries(roleKeys.map((key) => [key, entities[key].state])), before);
  }
});

test('explicit idle-seating permission preserves default allocation after a closed gate', () => {
  const entities = Object.freeze(entitiesWith());
  const expected = assignmentIds(allocateCharacterSeats(entities));
  allocateCharacterSeats(entities, { allowIdleSeating: false });
  assert.deepEqual(
    assignmentIds(allocateCharacterSeats(entities, { allowIdleSeating: true })),
    expected
  );
  assert.deepEqual(assignmentIds(allocateCharacterSeats(entities, {})), expected);
});

test('status transitions refill sofa deterministically and overflow returns to each own desk', () => {
  const states = {};
  const inactiveStates = [
    'bekerja',
    'menunggu_persetujuan',
    'gagal',
    'offline',
    'stale',
    'bekerja'
  ];
  const snapshots = [];
  for (let changed = 0; changed <= deskKeys.length; changed += 1) {
    if (changed > 0) states[deskKeys[changed - 1]] = inactiveStates[changed - 1];
    const assignments = allocateCharacterSeats(entitiesWith(states, [...roleKeys].reverse()));
    assertUniqueAssignments(assignments);
    const idleKeys = deskKeys.filter((key) => !(key in states));
    for (const [index, key] of idleKeys.entries()) {
      assert.equal(assignments[key], index < 2 ? SOFA_SEATS[index] : getDeskSeat(key));
    }
    for (const key of deskKeys.slice(0, changed)) assert.equal(assignments[key], getDeskSeat(key));
    assert.equal(
      Object.values(assignments).filter(({ kind }) => kind === 'sofa').length,
      Math.min(2, idleKeys.length)
    );
    snapshots.push(assignmentIds(assignments));
  }
  for (let changed = deskKeys.length; changed >= 0; changed -= 1) {
    const assignments = allocateCharacterSeats(entitiesWith(states));
    assertUniqueAssignments(assignments);
    assert.deepEqual(
      assignmentIds(assignments),
      snapshots[changed],
      'return transitions have no allocation history'
    );
    if (changed > 0) delete states[deskKeys[changed - 1]];
  }
});

test('HQ remains at the standing coordinator anchor for every status and consumes no sofa capacity', () => {
  const director = CHARACTER_CONFIGS.find(({ key }) => key === 'hq_lab_director');
  assert.equal(DIRECTOR_ANCHOR.id, 'standing:hq');
  assert.equal(DIRECTOR_ANCHOR.kind, 'standing');
  assert.deepEqual(DIRECTOR_ANCHOR.position, director.home.position);
  assert.equal(DIRECTOR_ANCHOR.heading, director.home.heading);
  for (const state of ['siaga', 'bekerja', 'menunggu_persetujuan', 'gagal', 'offline', 'stale']) {
    const assignments = allocateCharacterSeats(entitiesWith({ hq_lab_director: state }));
    assertUniqueAssignments(assignments);
    assert.equal(assignments.hq_lab_director, DIRECTOR_ANCHOR);
    assert.equal(assignments[deskKeys[0]], SOFA_SEATS[0]);
    assert.equal(assignments[deskKeys[1]], SOFA_SEATS[1]);
  }
});
