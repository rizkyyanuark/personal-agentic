import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  createCharactersScene,
  updateCharacterAnimations
} from '../../src/client/scene/characters.js';
import { applyCharacterPose } from '../../src/client/scene/character-pose.js';
import { DESK_CONFIGS, ROOM_LAYOUT } from '../../src/client/scene/office-layout.js';
import {
  DESK_SEATS,
  DIRECTOR_ANCHOR,
  getDeskSeat,
  MEETING_SEATS,
  SOFA_SEATS
} from '../../src/client/scene/seat-registry.js';
import { CHARACTER_RIG } from '../../src/client/scene/seating-contract.js';
import { createAgentWorkstation } from '../../src/client/scene/workstation.js';
import { createDeskPropAssets } from '../../src/client/scene/desk-props.js';

const states = ['bekerja', 'siaga', 'menunggu_persetujuan', 'gagal', 'offline', 'stale'];
const inactiveStates = states.filter((state) => state !== 'bekerja');

function near(actual, expected, label, tolerance = 0.001) {
  assert(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
}

function nearVector(actual, expected, label, tolerance = 0.001) {
  actual.forEach((value, axis) => near(value, expected[axis], `${label} axis ${axis}`, tolerance));
}

function bounds(object) {
  return new THREE.Box3().setFromObject(object, true);
}

function position(object) {
  return object.getWorldPosition(new THREE.Vector3());
}

function disposeAfter(context, root) {
  context.after(() => {
    const resources = new Set();
    root.traverse((object) => {
      if (!object.isMesh) return;
      resources.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        resources.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
      }
    });
    for (const resource of resources) resource.dispose();
  });
}

function createFixture(context) {
  const fixture = createCharactersScene();
  disposeAfter(context, fixture.charactersGroup);
  return fixture.characterEntities;
}

function seatedFixtures(entities) {
  return [
    ...DESK_SEATS.map((seat) => [entities[seat.roleKey], seat]),
    ...SOFA_SEATS.map((seat, index) => [entities[DESK_CONFIGS[index].key], seat]),
    ...MEETING_SEATS.map((seat, index) => [
      entities[DESK_CONFIGS[(index + SOFA_SEATS.length) % DESK_CONFIGS.length].key],
      seat
    ])
  ];
}

function poseAt(entity, seat, state, elapsed = 0, reduced = true) {
  entity.state = state;
  entity.seat = seat;
  entity.root.position.fromArray(seat.position);
  entity.root.rotation.y = seat.heading;
  applyCharacterPose(entity, seat, elapsed, reduced);
  entity.root.updateWorldMatrix(true, true);
}

function assertGroundContact(entity, label) {
  for (const [side, shoe] of [
    ['left', entity.leftShoe],
    ['right', entity.rightShoe]
  ]) {
    near(bounds(shoe).min.y, ROOM_LAYOUT.floorY, `${label} ${side} sole`, 0.001);
  }
}

function assertSeatContact(entity, seat, label) {
  near(bounds(entity.pelvis).min.y, seat.surfaceY, `${label} pelvis underside`, 0.002);
}

function assertGaze(entity, seat, label) {
  const expected = new THREE.Vector3(...seat.lookTarget).sub(position(entity.head)).normalize();
  const actual = entity.head.getWorldDirection(new THREE.Vector3());
  assert(actual.angleTo(expected) <= THREE.MathUtils.degToRad(10), `${label} head faces target`);
}

function assertNoUnrequestedProps(entity, label) {
  assert.equal(entity.handMug.visible, false, `${label} mug remains on desk`);
  assert.equal(entity.handPad.visible, false, `${label} no inferred game activity`);
  assert.equal(entity.handBook.visible, false, `${label} no inferred reading activity`);
}

function poseSnapshot(entity) {
  entity.root.updateWorldMatrix(true, true);
  return [
    entity.root,
    entity.hips,
    entity.head,
    entity.leftArm,
    entity.rightArm,
    entity.leftForearm,
    entity.rightForearm,
    entity.leftLeg,
    entity.rightLeg,
    entity.leftCalf,
    entity.rightCalf,
    entity.leftHand,
    entity.rightHand,
    entity.leftShoe,
    entity.rightShoe
  ].map((object) => [...object.position.toArray(), ...object.quaternion.toArray()]);
}

function assertSamePose(actual, expected, label) {
  actual.forEach((transform, index) =>
    nearVector(transform, expected[index], `${label} joint ${index}`, 1e-10)
  );
}

test('bootstrap uses offline desk poses and a grounded standing HQ, not invented idle activity', (context) => {
  const entities = createFixture(context);
  for (const entity of Object.values(entities)) {
    assert.equal(entity.state, 'offline');
    assert.equal(entity.seat.kind, entity.cfg.key === 'hq_lab_director' ? 'standing' : 'desk');
    assertGroundContact(entity, entity.cfg.key);
    assertNoUnrequestedProps(entity, entity.cfg.key);
  }
});

test('closed idle-seating gate restores owned anchors without overwriting operational state', (context) => {
  const entities = createFixture(context);
  const operationalStates = {
    hq_lab_director: 'gagal',
    data_engineer: 'siaga',
    data_scientist: 'siaga',
    research_scientist: 'bekerja',
    ml_engineer: 'menunggu_persetujuan'
  };
  for (const [key, entity] of Object.entries(entities)) entity.state = operationalStates[key];
  updateCharacterAnimations(entities, 0, true);
  assert.equal(entities.data_engineer.seat, SOFA_SEATS[0]);
  assert.equal(entities.data_scientist.seat, SOFA_SEATS[1]);

  updateCharacterAnimations(entities, 8, true, { allowIdleSeating: false });
  for (const [key, entity] of Object.entries(entities)) {
    const expected = key === 'hq_lab_director' ? DIRECTOR_ANCHOR : getDeskSeat(key);
    assert.equal(entity.seat, expected, `${key} retains its owned anchor`);
    assert.equal(entity.state, operationalStates[key], `${key} API state remains unchanged`);
    nearVector(entity.root.position.toArray(), expected.position, `${key} neutral anchor`);
    near(entity.root.rotation.y, expected.heading, `${key} neutral heading`);
    assertGroundContact(entity, `${key} gated pose`);
    assertNoUnrequestedProps(entity, `${key} gated pose`);
  }
});

test('fresh reduced motion keeps existing sofa occupancy and still poses', (context) => {
  const entities = createFixture(context);
  for (const entity of Object.values(entities)) entity.state = 'siaga';
  updateCharacterAnimations(entities, 0, false, { allowIdleSeating: true });
  const baseline = Object.fromEntries(
    Object.entries(entities).map(([key, entity]) => [
      key,
      { seat: entity.seat, pose: poseSnapshot(entity) }
    ])
  );
  assert.equal(entities.data_engineer.seat, SOFA_SEATS[0]);
  assert.equal(entities.data_scientist.seat, SOFA_SEATS[1]);
  for (const elapsed of [0.3, 9, 100000]) {
    updateCharacterAnimations(entities, elapsed, true, { allowIdleSeating: true });
    for (const [key, entity] of Object.entries(entities)) {
      assert.equal(entity.seat, baseline[key].seat, `${key} reduced motion keeps its seat`);
      assert.equal(entity.state, 'siaga');
      assertSamePose(poseSnapshot(entity), baseline[key].pose, `${key} static fresh pose`);
    }
  }
});

test('caller reduced motion freezes work typing with the idle-seating gate closed', (context) => {
  const entities = createFixture(context);
  for (const entity of Object.values(entities)) entity.state = 'bekerja';
  updateCharacterAnimations(entities, 0, true, { allowIdleSeating: false });
  const baseline = Object.fromEntries(
    Object.entries(entities).map(([key, entity]) => [key, poseSnapshot(entity)])
  );
  for (const elapsed of [Math.PI / 14, 9, 100000]) {
    updateCharacterAnimations(entities, elapsed, true, { allowIdleSeating: false });
    for (const [key, entity] of Object.entries(entities)) {
      assert.equal(entity.state, 'bekerja', `${key} working state is preserved`);
      assert.equal(entity.seat.kind, key === 'hq_lab_director' ? 'standing' : 'desk');
      assertSamePose(poseSnapshot(entity), baseline[key], `${key} typing stops under caller gate`);
    }
  }
});

test('real-state allocation keeps soles on parquet and pelvis on occupied surfaces for normal and reduced motion', (context) => {
  const entities = createFixture(context);
  for (const state of states) {
    for (const reduced of [false, true]) {
      for (const elapsed of [0, 5.1, 239]) {
        for (const entity of Object.values(entities)) entity.state = state;
        updateCharacterAnimations(entities, elapsed, reduced);
        for (const entity of Object.values(entities)) {
          const label = `${entity.cfg.key}/${state}/RM=${reduced}/t=${elapsed}`;
          assert.equal(entity.state, state, `${label} status remains unchanged`);
          assertGroundContact(entity, label);
          assertGaze(entity, entity.seat, label);
          assertNoUnrequestedProps(entity, label);
          if (entity.seat.kind !== 'standing') assertSeatContact(entity, entity.seat, label);
        }
      }
    }
  }
});

test('all four desks, both sofa slots, and three meeting fixtures retain floor and cushion contact across pose states', (context) => {
  const entities = createFixture(context);
  for (const [entity, seat] of seatedFixtures(entities)) {
    for (const state of states) {
      for (const reduced of [false, true]) {
        const label = `${seat.id}/${state}/RM=${reduced}`;
        poseAt(entity, seat, state, 1.2, reduced);
        assertGroundContact(entity, label);
        assertSeatContact(entity, seat, label);
        assertGaze(entity, seat, label);
        assertNoUnrequestedProps(entity, label);
        assert.equal(entity.handTablet.visible, false, `${label} no director tablet`);
      }
    }
  }
});

test('seated knees extend toward normalized positive-Z fronts, with toes beyond knees rather than behind the chair', (context) => {
  const entities = createFixture(context);
  for (const [entity, seat] of seatedFixtures(entities)) {
    poseAt(entity, seat, 'siaga');
    const front = entity.root.getWorldDirection(new THREE.Vector3());
    for (const [side, thigh, knee, shoe] of [
      ['left', entity.leftLeg, entity.leftCalf, entity.leftShoe],
      ['right', entity.rightLeg, entity.rightCalf, entity.rightShoe]
    ]) {
      const kneeForward = position(knee).sub(position(thigh)).dot(front);
      const toeForward = position(shoe).sub(position(knee)).dot(front);
      assert(kneeForward > 0.25, `${seat.id} ${side} knee extends forward`);
      assert(toeForward > 0.05, `${seat.id} ${side} toe extends beyond knee`);
      assert(
        shoe.getWorldDirection(new THREE.Vector3()).dot(front) > 0.999,
        `${seat.id} ${side} shoe front`
      );
      assert(entity[`${side}Leg`].rotation.x < 0, `${seat.id} ${side} thigh bends forward`);
      assert(entity[`${side}Calf`].rotation.x > 0, `${seat.id} ${side} calf bends down`);
    }
  }
  const director = entities.hq_lab_director;
  poseAt(director, DIRECTOR_ANCHOR, 'bekerja');
  assert.equal(director.leftLeg.rotation.x, 0);
  assert.equal(director.rightLeg.rotation.x, 0);
  assert.equal(director.leftCalf.rotation.x, 0);
  assert.equal(director.rightCalf.rotation.x, 0);
});

test('actual palm centers reach both keyboard-side targets within one millimeter under reduced motion', (context) => {
  const entities = createFixture(context);
  for (const [index, seat] of DESK_SEATS.entries()) {
    const desk = DESK_CONFIGS[index];
    const entity = entities[seat.roleKey];
    for (const state of states) {
      poseAt(entity, seat, state, 123, true);
      nearVector(
        position(entity.leftHand).toArray(),
        [desk.x - 0.032, ROOM_LAYOUT.floorY + 0.9, desk.z + 0.212],
        `${seat.id} left palm`
      );
      nearVector(
        position(entity.rightHand).toArray(),
        [desk.x - 0.218, ROOM_LAYOUT.floorY + 0.9, desk.z + 0.212],
        `${seat.id} right palm`
      );
    }
  }
});

function canvasDocument() {
  return {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      const canvas = { width: 0, height: 0 };
      const drawing = new Proxy(
        {
          canvas,
          measureText: (text) => ({ width: String(text).length * 8 }),
          createLinearGradient: () => ({ addColorStop() {} })
        },
        { get: (object, key) => (key in object ? object[key] : () => {}) }
      );
      canvas.getContext = () => drawing;
      return canvas;
    }
  };
}

test('real keyboard GLB keycaps sit within one centimeter of palms using actual workstation transforms', async (context) => {
  const bytes = await readFile(
    new URL('../../../frontend/public/cockpit-assets/models/keyboard.glb', import.meta.url)
  );
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    ''
  );
  const entities = createFixture(context);
  const oldDocument = globalThis.document;
  globalThis.document = canvasDocument();
  const material = new THREE.MeshBasicMaterial();
  const deskProps = createDeskPropAssets();
  context.after(() => {
    material.dispose();
    deskProps.dispose();
  });
  try {
    for (const [index, desk] of DESK_CONFIGS.entries()) {
      let keyboard;
      const assets = {
        deskProps,
        coffeeMaterial: material,
        oak: material,
        white: material,
        metal: material,
        screenBody: material,
        deskMat: material,
        cableMaterial: material,
        attachKeyboard(container) {
          keyboard = container;
          container.add(gltf.scene.clone(true));
        },
        attachMouse() {},
        attachChair() {},
        attachCableTray() {}
      };
      const workstation = createAgentWorkstation({
        config: desk,
        assets,
        detailed: desk.key === 'data_engineer'
      });
      disposeAfter(context, workstation.group);
      workstation.group.updateWorldMatrix(true, true);
      assert(keyboard, `${desk.key} attaches a real keyboard`);
      const entity = entities[desk.key];
      poseAt(entity, DESK_SEATS[index], 'bekerja', 99, true);
      for (const [side, hand] of [
        ['left', entity.leftHand],
        ['right', entity.rightHand]
      ]) {
        const palm = position(hand);
        const ray = new THREE.Raycaster(
          palm.clone().add(new THREE.Vector3(0, 0.5, 0)),
          new THREE.Vector3(0, -1, 0)
        );
        const hit = ray.intersectObject(keyboard, true)[0];
        assert(hit, `${desk.key} ${side} palm is over actual keyboard geometry`);
        const topNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
        assert(topNormal.y > 0.5, `${desk.key} ${side} hits a key top, not a keyboard side`);
        const keyColors = hit.object.geometry.getAttribute('color');
        assert(keyColors, `${desk.key} uses the measured color-coded keyboard GLB`);
        for (const vertex of [hit.face.a, hit.face.b, hit.face.c]) {
          assert(
            Math.min(keyColors.getX(vertex), keyColors.getY(vertex), keyColors.getZ(vertex)) > 0.3,
            `${desk.key} ${side} hits a cream keycap rather than the dark keyboard body`
          );
        }
        near(bounds(hand).min.y, hit.point.y, `${desk.key} ${side} palm/keycap contact`, 0.01);
      }
    }
  } finally {
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
  }
});

test('sofa hands stay at lap anchors and HQ hands meet the visible tablet edges', (context) => {
  const entities = createFixture(context);
  for (const [entity, seat] of seatedFixtures(entities).filter(
    ([, seat]) => seat.kind === 'sofa'
  )) {
    poseAt(entity, seat, 'siaga');
    for (const [side, hand, x] of [
      ['left', entity.leftHand, -0.16],
      ['right', entity.rightHand, 0.16]
    ]) {
      const local = entity.hips.worldToLocal(position(hand));
      nearVector(local.toArray(), [x, 0.17, 0.2], `${seat.id} ${side} lap`, 0.001);
      assert(
        bounds(hand).min.y > seat.surfaceY,
        `${seat.id} ${side} hand does not penetrate cushion`
      );
    }
  }
  const director = entities.hq_lab_director;
  for (const state of states) {
    poseAt(director, DIRECTOR_ANCHOR, state);
    assert.equal(director.handTablet.visible, true);
    for (const [side, hand, x] of [
      ['left', director.leftHand, -0.15],
      ['right', director.rightHand, 0.15]
    ]) {
      const local = director.hips.worldToLocal(position(hand));
      nearVector(local.toArray(), [x, 0.34, 0.27], `HQ ${side} tablet grip`, 0.001);
      assert(
        bounds(director.handTablet).distanceToPoint(position(hand)) < CHARACTER_RIG.handRadius,
        `HQ ${side} reaches tablet edge`
      );
    }
    assertGroundContact(director, `HQ/${state}`);
    assertGaze(director, DIRECTOR_ANCHOR, `HQ/${state}`);
    assertNoUnrequestedProps(director, `HQ/${state}`);
  }
});

test('idle, waiting, failed, offline, and stale poses do not invent activity as elapsed time or motion preference changes', (context) => {
  const entities = createFixture(context);
  for (const state of inactiveStates) {
    for (const entity of Object.values(entities)) entity.state = state;
    updateCharacterAnimations(entities, 0, false);
    const baseline = Object.fromEntries(
      Object.entries(entities).map(([key, entity]) => [key, poseSnapshot(entity)])
    );
    for (const elapsed of [0.3, 1.9, 60, 100000]) {
      for (const reduced of [false, true]) {
        updateCharacterAnimations(entities, elapsed, reduced);
        for (const [key, entity] of Object.entries(entities)) {
          assertSamePose(
            poseSnapshot(entity),
            baseline[key],
            `${key}/${state}/t=${elapsed}/RM=${reduced}`
          );
        }
      }
    }
  }
});

test('only working desk hands type subtly, while feet, head, HQ, and reduced-motion poses remain still', (context) => {
  const entities = createFixture(context);
  for (const entity of Object.values(entities)) entity.state = 'bekerja';
  updateCharacterAnimations(entities, 0, false);
  const baseline = Object.fromEntries(
    Object.entries(entities).map(([key, entity]) => [
      key,
      {
        hands: [position(entity.leftHand), position(entity.rightHand)],
        head: entity.head.getWorldDirection(new THREE.Vector3()),
        shoes: [position(entity.leftShoe), position(entity.rightShoe)],
        pose: poseSnapshot(entity)
      }
    ])
  );
  updateCharacterAnimations(entities, Math.PI / 14, false);
  for (const [key, entity] of Object.entries(entities)) {
    assertGroundContact(entity, `${key} typing`);
    if (key === 'hq_lab_director') {
      assertSamePose(
        poseSnapshot(entity),
        baseline[key].pose,
        'HQ working is a static coordinator pose'
      );
      continue;
    }
    for (const [index, hand] of [entity.leftHand, entity.rightHand].entries()) {
      const actual = position(hand);
      const before = baseline[key].hands[index];
      near(actual.x, before.x, `${key} typing x`, 1e-10);
      near(actual.z, before.z, `${key} typing z`, 1e-10);
      near(actual.distanceTo(before), 0.002, `${key} typing amplitude`, 1e-10);
    }
    nearVector(
      entity.head.getWorldDirection(new THREE.Vector3()).toArray(),
      baseline[key].head.toArray(),
      `${key} typing gaze`,
      1e-10
    );
    [entity.leftShoe, entity.rightShoe].forEach((shoe, index) =>
      nearVector(
        position(shoe).toArray(),
        baseline[key].shoes[index].toArray(),
        `${key} typing foot`,
        1e-10
      )
    );
  }
  for (const elapsed of [Math.PI / 14, 9, 100000]) {
    updateCharacterAnimations(entities, elapsed, true);
    for (const [key, entity] of Object.entries(entities)) {
      assertSamePose(
        poseSnapshot(entity),
        baseline[key].pose,
        `${key} reduced motion freezes typing`
      );
    }
  }
});
