import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { OFFICE_ROLES } from '../../src/shared/office-contract.js';
import {
  CHARACTER_CONFIGS,
  DESK_CONFIGS,
  FURNITURE_LAYOUT,
  ROOM_LAYOUT
} from '../../src/client/scene/office-layout.js';
import {
  CAMERA_DISTANCE_LIMITS,
  getCameraTargetBounds,
  getHomeCameraView,
  getResponsiveFov,
  getRoomCenterCameraView,
  getTVCameraView,
  getWorkstationCameraView
} from '../../src/client/scene/camera-views.js';
import { allocateCharacterSeats, getDeskSeat } from '../../src/client/scene/seat-registry.js';
import {
  createCharactersScene,
  updateCharacterAnimations
} from '../../src/client/scene/characters.js';

test('four workstations form two rows of two, while five roles retain unique home anchors', () => {
  assert.equal(DESK_CONFIGS.length, 4);
  assert(!DESK_CONFIGS.some((desk) => desk.key === 'hq_lab_director'));
  assert.equal(new Set(DESK_CONFIGS.map((desk) => desk.key)).size, 4);
  assert.deepEqual(
    CHARACTER_CONFIGS.map((cfg) => cfg.key),
    OFFICE_ROLES.map((role) => role.key)
  );
  for (const cluster of ['back', 'front']) {
    const row = DESK_CONFIGS.filter((desk) => desk.cluster === cluster);
    assert.equal(row.length, 2);
    assert.equal(new Set(row.map((desk) => desk.z)).size, 1);
    for (const [index, desk] of row.entries()) {
      assert(desk.x - 0.94 > ROOM_LAYOUT.min[0]);
      assert(desk.x + 0.94 < ROOM_LAYOUT.max[0]);
      assert(desk.z - 0.49 > ROOM_LAYOUT.min[2]);
      assert(desk.z + 1.25 < ROOM_LAYOUT.max[2]);
      if (index > 0) assert(desk.x - row[index - 1].x >= 2.68);
      const character = CHARACTER_CONFIGS.find((cfg) => cfg.key === desk.key);
      assert.deepEqual(character.home.position, getDeskSeat(desk.key).position);
      assert.equal(character.home.heading, getDeskSeat(desk.key).heading);
    }
  }
  assert(DESK_CONFIGS[2].z - DESK_CONFIGS[0].z >= 2.54);
  const director = CHARACTER_CONFIGS.find((cfg) => cfg.key === 'hq_lab_director');
  assert.equal(director.home.posture, 'standing');
  assert(director.home.position[0] < ROOM_LAYOUT.board.x - 2.6);
  assert(director.home.position[2] > ROOM_LAYOUT.board.z);
  assert.equal(FURNITURE_LAYOUT.plants.length, 5);
  assert(FURNITURE_LAYOUT.meeting.x < Math.min(...DESK_CONFIGS.map((desk) => desk.x)));
  assert(FURNITURE_LAYOUT.lounge.z > Math.max(...DESK_CONFIGS.map((desk) => desk.z)));
  assert(FURNITURE_LAYOUT.pantry.x > Math.max(...DESK_CONFIGS.map((desk) => desk.x)));
  assert(FURNITURE_LAYOUT.tv.z < FURNITURE_LAYOUT.lounge.z);
});

function assertBoundsInView(view, min, max, aspect, fov = 34) {
  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 120);
  camera.position.copy(view.position);
  camera.lookAt(view.target);
  camera.updateMatrixWorld(true);
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) {
        const point = new THREE.Vector3(x, y, z).project(camera);
        assert(Math.abs(point.x) <= 1, `horizontal clipping at aspect ${aspect}`);
        assert(Math.abs(point.y) <= 1, `vertical clipping at aspect ${aspect}`);
        assert(point.z > -1 && point.z < 1, `depth clipping at aspect ${aspect}`);
      }
    }
  }
}

test('home camera uses the pinned reference views, including the closer cropped mobile view', () => {
  const desktop = getHomeCameraView(1.6, 38);
  const mobile = getHomeCameraView(320 / 760, 62);
  assert.deepEqual(desktop.position.toArray(), [-1.2, 12.5, 16.8]);
  assert.deepEqual(desktop.target.toArray(), [-1, 0.6, -1.2]);
  assert.deepEqual(mobile.position.toArray(), [-2.2, 14.5, 19.5]);
  assert.deepEqual(mobile.target.toArray(), [-1.9, 0.4, -1.4]);
  for (const view of [desktop, mobile]) {
    assert(view.position.distanceTo(view.target) <= 34);
  }
});

test('responsive FOV breakpoints and orbit target bounds match the pinned reference', () => {
  assert.deepEqual(CAMERA_DISTANCE_LIMITS, { min: 5, max: 34 });
  assert.deepEqual(
    [819, 820, 1179, 1180].map((width) => getResponsiveFov(width)),
    [62, 44, 44, 38]
  );
  assert.equal(getResponsiveFov(1180, true), 34);
  assert.deepEqual(getCameraTargetBounds(), { min: [-9, 0.3, -6], max: [9, 3.5, 5] });
});

test('portrait focus views stay inside the reference OrbitControls distance limits', () => {
  for (const [width, height] of [
    [320, 760],
    [390, 844],
    [768, 1024]
  ]) {
    const aspect = width / height;
    const fov = getResponsiveFov(width);
    const views = [
      getRoomCenterCameraView(aspect, fov),
      getTVCameraView(aspect, fov),
      ...DESK_CONFIGS.map((desk) => getWorkstationCameraView(desk.key, aspect, fov))
    ];
    for (const view of views) {
      const distance = view.position.distanceTo(view.target);
      assert(distance >= CAMERA_DISTANCE_LIMITS.min - 1e-9, `focus too close at ${width}px`);
      assert(distance <= CAMERA_DISTANCE_LIMITS.max + 1e-9, `focus too far at ${width}px`);
    }
    for (const desk of DESK_CONFIGS) {
      assertBoundsInView(
        getWorkstationCameraView(desk.key, aspect, fov),
        [desk.x - 1.1, 0, desk.z - 0.55],
        [desk.x + 1.1, 3.2, desk.z + 1.5],
        aspect,
        fov
      );
    }
  }
});

test('four desk views and HQ room-center view fit their intended bounds', () => {
  for (const aspect of [0.65, 1, 2.4]) {
    for (const desk of DESK_CONFIGS) {
      assertBoundsInView(
        getWorkstationCameraView(desk.key, aspect),
        [desk.x - 1.1, 0, desk.z - 0.55],
        [desk.x + 1.1, 3.2, desk.z + 1.5],
        aspect
      );
    }
    assertBoundsInView(getRoomCenterCameraView(aspect), [-3.8, 0, -3.4], [3.8, 3.3, 3.4], aspect);
  }
  assert.equal(getWorkstationCameraView('hq_lab_director', 1), null);
  assert.equal(getWorkstationCameraView('unknown-role', 1), null);
});

test('character placement stays deterministic across statuses, elapsed time, and reduced motion', () => {
  const { charactersGroup, characterEntities } = createCharactersScene();
  assert.equal(charactersGroup.children.length, 5);
  for (const state of ['siaga', 'bekerja', 'gagal', 'menunggu_persetujuan', 'offline']) {
    for (const reduced of [false, true]) {
      for (const entity of Object.values(characterEntities)) entity.state = state;
      updateCharacterAnimations(characterEntities, 65, reduced);
      const placements = allocateCharacterSeats(characterEntities);
      for (const cfg of CHARACTER_CONFIGS) {
        const entity = characterEntities[cfg.key];
        assert.deepEqual(entity.root.position.toArray(), placements[cfg.key].position);
        assert.equal(entity.root.rotation.y, placements[cfg.key].heading);
        assert.equal(entity.root.name, `character_${cfg.key}`);
        assert.equal(entity.root.userData.roleKey, cfg.key);
        if (cfg.home.posture === 'standing') {
          assert.equal(entity.leftLeg.rotation.x, 0);
          assert.equal(entity.rightLeg.rotation.x, 0);
        }
      }
    }
  }
});
