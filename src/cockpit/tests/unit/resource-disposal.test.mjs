import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { disposeObjectTree } from '../../src/client/lifecycle.js';

test('owned scene disposal releases shared geometry/material/texture only once per traversal', () => {
  const geometry = new THREE.BoxGeometry();
  const texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: texture });
  const scene = new THREE.Scene();
  const counts = { geometry: 0, material: 0, texture: 0 };
  geometry.addEventListener('dispose', () => counts.geometry++);
  material.addEventListener('dispose', () => counts.material++);
  texture.addEventListener('dispose', () => counts.texture++);
  scene.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
  disposeObjectTree(scene);
  assert.deepEqual(counts, { geometry: 1, material: 1, texture: 1 });
});
