import * as THREE from 'three';
import { DESK_CONFIGS, FURNITURE_LAYOUT, ROOM_LAYOUT } from './office-layout.js';

export const CAMERA_DISTANCE_LIMITS = Object.freeze({ min: 5, max: 34 });

function fitView(min, max, target, direction, aspect, fov) {
  const away = direction.clone().normalize();
  const right = new THREE.Vector3().crossVectors(THREE.Object3D.DEFAULT_UP, away).normalize();
  const up = new THREE.Vector3().crossVectors(away, right).normalize();
  const tanVertical = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const tanHorizontal = tanVertical * Math.max(aspect, 0.1);
  const offset = new THREE.Vector3();
  let distance = 0;
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) {
        offset.set(x, y, z).sub(target);
        distance = Math.max(
          distance,
          (Math.abs(offset.dot(right)) * 1.08) / tanHorizontal + offset.dot(away),
          (Math.abs(offset.dot(up)) * 1.08) / tanVertical + offset.dot(away)
        );
      }
    }
  }
  return {
    position: target.clone().addScaledVector(away, Math.max(distance, CAMERA_DISTANCE_LIMITS.min)),
    target
  };
}

export function getTVCameraView(aspect, fov = 34) {
  const { x, z } = FURNITURE_LAYOUT.tv;
  return fitView(
    [x - 1.5, 0, z - 0.35],
    [x + 1.5, 2.6, z + 0.35],
    new THREE.Vector3(x, ROOM_LAYOUT.floorY + 1.14, z),
    new THREE.Vector3(0.35, 1.3, 3.75),
    aspect,
    fov
  );
}

export function getHomeCameraView(aspect, fov = 38) {
  const mobile = fov >= 60;
  return mobile
    ? { position: new THREE.Vector3(-2.2, 14.5, 19.5), target: new THREE.Vector3(-1.9, 0.4, -1.4) }
    : { position: new THREE.Vector3(-1.2, 12.5, 16.8), target: new THREE.Vector3(-1.0, 0.6, -1.2) };
}

export function getResponsiveFov(viewportWidth, expanded = false) {
  if (viewportWidth < 820) return 62;
  if (viewportWidth < 1180) return 44;
  return expanded ? 34 : 38;
}

export function getCameraTargetBounds() {
  return { min: [-9, 0.3, -6], max: [9, 3.5, 5] };
}
export function getRoomCenterCameraView(aspect, fov = 34) {
  return fitView(
    [-3.8, 0, -3.4],
    [3.8, 3.3, 3.4],
    new THREE.Vector3(0, 1.5, 0),
    new THREE.Vector3(0.85, 2, 4.2),
    aspect,
    fov
  );
}

export function getCharacterCameraView(position, aspect, fov = 34, kind = 'standing') {
  const [x, , z] = position;
  const atDesk = kind === 'desk';
  return fitView(
    atDesk ? [x - 1.1, 0, z - 1.35] : [x - 0.8, 0, z - 0.65],
    atDesk ? [x + 1.1, 3.2, z + 0.7] : [x + 0.8, 3.2, z + 0.65],
    new THREE.Vector3(x, atDesk ? 1.5 : 1.4, z - (atDesk ? 0.5 : 0)),
    new THREE.Vector3(0.85, 2, 3.75),
    aspect,
    fov
  );
}

export function getWorkstationCameraView(roleKey, aspect, fov = 34) {
  const desk = DESK_CONFIGS.find((item) => item.key === roleKey);
  if (!desk) return null;
  return fitView(
    [desk.x - 1.1, 0, desk.z - 0.55],
    [desk.x + 1.1, 3.2, desk.z + 1.5],
    new THREE.Vector3(desk.x, 1.5, desk.z + 0.3),
    new THREE.Vector3(0.85, 2.0, 3.75),
    aspect,
    fov
  );
}
