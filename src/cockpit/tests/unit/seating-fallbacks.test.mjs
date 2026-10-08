import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  CHAIR_SURFACE_HEIGHT,
  SOFA_SURFACE_HEIGHT,
  SOFA_SEAT_OFFSETS
} from '../../src/client/scene/seating-contract.js';
import {
  createChairFallback,
  createSofaFallback,
  disposeSeatingFallback
} from '../../src/client/scene/seating-fallbacks.js';

const epsilon = 1e-7;

function surfaceAt(group, x, z) {
  group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(x, 2, z), new THREE.Vector3(0, -1, 0));
  return ray.intersectObject(group, true)[0];
}

function assertNear(actual, expected) {
  assert(Math.abs(actual - expected) <= epsilon, `${actual} differs from ${expected}`);
}

function assertGroundedWithin(group, maxSize) {
  const bounds = new THREE.Box3().setFromObject(group);
  const size = bounds.getSize(new THREE.Vector3());
  assert(bounds.min.y >= -epsilon, `geometry below floor: ${bounds.min.y}`);
  assertNear(bounds.min.y, 0);
  for (const axis of ['x', 'y', 'z']) {
    assert(size[axis] <= maxSize[axis] + epsilon, `${axis} footprint exceeded: ${size[axis]}`);
  }
}

test('chair fallback keeps the canonical cushion surface at both hip projections', () => {
  for (const detailed of [false, true]) {
    const chair = createChairFallback({ detailed });
    for (const x of [-0.14, 0.14]) {
      const hit = surfaceAt(chair, x, 0.1);
      assert(hit);
      assert.equal(hit.object.name, 'chair_seat');
      assertNear(hit.point.y, CHAIR_SURFACE_HEIGHT);
      assert(hit.face.normal.y > 0.99);
    }
  }
});

test('sofa fallback supports both canonical occupants and their thigh contact points', () => {
  const sofa = createSofaFallback();
  for (const [x, , z] of SOFA_SEAT_OFFSETS) {
    for (const hipSide of [-0.14, 0, 0.14]) {
      const hit = surfaceAt(sofa, x + hipSide, z);
      assert(hit);
      assert.match(hit.object.name, /^sofa_seat_/);
      assertNear(hit.point.y, SOFA_SURFACE_HEIGHT);
      assert(hit.face.normal.y > 0.99);
    }
  }
});

test('fallback footprints remain inside the measured local furniture envelopes', () => {
  for (const detailed of [false, true]) {
    assertGroundedWithin(createChairFallback({ detailed }), { x: 0.66, y: 1.06, z: 0.66 });
  }
  assertGroundedWithin(createSofaFallback(), { x: 2.15, y: 0.8, z: 0.93 });
});

test('every chair wheel and sofa foot touches the floor independently', () => {
  for (const [group, pattern, expectedCount] of [
    [createChairFallback(), /^chair_wheel_/, 5],
    [createSofaFallback(), /^sofa_foot_/, 4]
  ]) {
    group.updateMatrixWorld(true);
    const supports = group.children.filter((child) => pattern.test(child.name));
    assert.equal(supports.length, expectedCount);
    for (const support of supports) {
      assertNear(new THREE.Box3().setFromObject(support).min.y, 0);
    }
  }
});

test('backrests stay behind the occupants and their exposed front faces point to local +Z', () => {
  for (const [group, x, y, expectedName] of [
    [createChairFallback(), 0, 0.8, 'chair_backrest'],
    [createSofaFallback(), -0.58, 0.65, 'sofa_backrest_0'],
    [createSofaFallback(), 0.58, 0.65, 'sofa_backrest_2']
  ]) {
    group.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(x, y, 1), new THREE.Vector3(0, 0, -1));
    const hit = ray.intersectObject(group, true)[0];
    assert(hit);
    assert.equal(hit.object.name, expectedName);
    assert(hit.point.z < 0);
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    assert(normal.z > 0.99);
    assert(new THREE.Box3().setFromObject(hit.object).max.z < 0);
  }
});

test('separate fallback groups own independent resources when their assets are replaced', () => {
  for (const [factory, seatName] of [
    [createChairFallback, 'chair_seat'],
    [createSofaFallback, 'sofa_seat_0']
  ]) {
    const first = factory().getObjectByName(seatName);
    const second = factory().getObjectByName(seatName);
    assert.notEqual(first.geometry, second.geometry);
    assert.notEqual(first.material, second.material);
  }
});

test('discarded fallback groups dispose shared geometry and materials exactly once', () => {
  for (const factory of [createChairFallback, createSofaFallback]) {
    const group = factory();
    const references = new Map();
    group.traverse((object) => {
      if (!object.isMesh) return;
      for (const resource of [
        object.geometry,
        ...(Array.isArray(object.material) ? object.material : [object.material])
      ]) {
        references.set(resource, (references.get(resource) || 0) + 1);
      }
    });
    assert([...references].some(([resource, count]) => resource.isBufferGeometry && count > 1));
    assert([...references].some(([resource, count]) => resource.isMaterial && count > 1));

    const disposeEvents = new Map([...references.keys()].map((resource) => [resource, 0]));
    for (const resource of disposeEvents.keys()) {
      resource.addEventListener('dispose', () => {
        disposeEvents.set(resource, disposeEvents.get(resource) + 1);
      });
    }
    const seatName = factory === createChairFallback ? 'chair_seat' : 'sofa_seat_0';
    const sharedMaterial = group.getObjectByName(seatName).material;
    const extraMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), [
      sharedMaterial,
      sharedMaterial
    ]);
    group.add(extraMesh);
    let extraGeometryDisposals = 0;
    extraMesh.geometry.addEventListener('dispose', () => extraGeometryDisposals++);

    disposeSeatingFallback(group);

    assert.equal(extraGeometryDisposals, 1);
    for (const count of disposeEvents.values()) assert.equal(count, 1);
  }
});
