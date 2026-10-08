import * as THREE from 'three';
import { CHAIR_SURFACE_HEIGHT, SOFA_SURFACE_HEIGHT } from './seating-contract.js';

function addMesh(group, name, geometry, material, position, castShadow = true) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addBox(group, name, size, position, material, castShadow = true) {
  return addMesh(group, name, new THREE.BoxGeometry(...size), material, position, castShadow);
}

// Each returned group owns its resources, including materials shared by its child meshes.
export function createChairFallback({ detailed = false } = {}) {
  const chair = new THREE.Group();
  chair.name = 'fallback_task_chair';
  const fabric = new THREE.MeshStandardMaterial({ color: 0x353b42, roughness: 0.92 });
  const metal = new THREE.MeshStandardMaterial({
    color: 0x24272c,
    roughness: 0.55,
    metalness: 0.35
  });

  addBox(chair, 'chair_seat', [0.48, 0.08, 0.47], [0, CHAIR_SURFACE_HEIGHT - 0.04, 0.01], fabric);
  const backrest = addBox(chair, 'chair_backrest', [0.46, 0.54, 0.075], [0, 0.77, -0.23], fabric);
  backrest.rotation.x = -0.06;

  for (const side of [-1, 1]) {
    addBox(
      chair,
      `chair_armrest_${side}`,
      [0.055, 0.045, 0.29],
      [side * 0.266, 0.67, -0.035],
      metal
    );
    addMesh(
      chair,
      `chair_arm_support_${side}`,
      new THREE.CylinderGeometry(0.016, 0.016, 0.18, 8),
      metal,
      [side * 0.266, 0.56, -0.1]
    );
  }
  addMesh(
    chair,
    'chair_lift',
    new THREE.CylinderGeometry(0.028, 0.028, 0.3, 10),
    metal,
    [0, 0.25, 0]
  );

  const wheelGeometry = new THREE.CylinderGeometry(0.025, 0.025, 0.035, 12);
  wheelGeometry.rotateZ(Math.PI / 2);
  wheelGeometry.computeBoundingBox();
  const wheelY = -wheelGeometry.boundingBox.min.y;
  for (let index = 0; index < 5; index++) {
    const angle = (index / 5) * Math.PI * 2;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    const spoke = addBox(
      chair,
      `chair_spoke_${index}`,
      [0.045, 0.035, 0.29],
      [sin * 0.145, 0.09, cos * 0.145],
      metal,
      detailed
    );
    spoke.rotation.y = angle;
    addMesh(
      chair,
      `chair_caster_stem_${index}`,
      new THREE.CylinderGeometry(0.009, 0.009, 0.06, 8),
      metal,
      [sin * 0.285, 0.068, cos * 0.285],
      detailed
    );
    const wheel = addMesh(
      chair,
      `chair_wheel_${index}`,
      wheelGeometry,
      metal,
      [sin * 0.285, wheelY, cos * 0.285],
      detailed
    );
    wheel.rotation.y = angle;
  }
  return chair;
}

export function createSofaFallback() {
  const sofa = new THREE.Group();
  sofa.name = 'fallback_sofa';
  const frame = new THREE.MeshStandardMaterial({ color: 0x7a583e, roughness: 0.85 });
  const fabric = new THREE.MeshStandardMaterial({ color: 0xdfc397, roughness: 0.95 });

  addBox(sofa, 'sofa_base', [2.14, 0.26, 0.92], [0, 0.27, 0], frame);
  addBox(sofa, 'sofa_backrest_frame', [2.14, 0.6, 0.16], [0, 0.44, -0.38], frame);
  for (const side of [-1, 1]) {
    addBox(sofa, `sofa_armrest_${side}`, [0.17, 0.5, 0.92], [side * 0.985, 0.39, 0], frame);
  }

  const footGeometry = new THREE.BoxGeometry(0.09, 0.14, 0.09);
  footGeometry.computeBoundingBox();
  const footY = -footGeometry.boundingBox.min.y;
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      addMesh(sofa, `sofa_foot_${side}_${end}`, footGeometry, frame, [
        side * 0.94,
        footY,
        end * 0.33
      ]);
    }
  }

  for (const [index, x] of [-0.58, 0, 0.58].entries()) {
    addBox(
      sofa,
      `sofa_seat_${index}`,
      [0.525, 0.15, 0.7],
      [x, SOFA_SURFACE_HEIGHT - 0.075, 0.025],
      fabric
    );
    addBox(sofa, `sofa_backrest_${index}`, [0.54, 0.42, 0.1], [x, 0.55, -0.24], fabric);
  }
  return sofa;
}

export function disposeSeatingFallback(group) {
  const geometries = new Set();
  const materials = new Set();
  group.traverse((object) => {
    if (!object.isMesh) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}
