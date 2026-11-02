import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { disposeObjectTree } from '../lifecycle.js';
import { OFFICE_ROLES } from '../../shared/office-contract.js';
import { createAgentWorkstation, createWorkstationAssets } from './workstation.js';
import { DESK_CONFIGS, FURNITURE_LAYOUT, ROOM_LAYOUT } from './office-layout.js';
import { MEETING_SEATS } from './seat-registry.js';
import { createTVScreen } from './tv-screen.js';
import {
  createChairFallback,
  createSofaFallback,
  disposeSeatingFallback
} from './seating-fallbacks.js';

function createContactShadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(16, 12, 10, 0.58)');
  grad.addColorStop(0.35, 'rgba(16, 12, 10, 0.32)');
  grad.addColorStop(0.7, 'rgba(16, 12, 10, 0.09)');
  grad.addColorStop(1, 'rgba(16, 12, 10, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function box(group, size, position, material, shadow = false) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  group.add(mesh);
  return mesh;
}

function cylinder(group, rTop, rBottom, height, segments, position, material, shadow = false) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(rTop, rBottom, height, segments),
    material
  );
  mesh.position.set(...position);
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  group.add(mesh);
  return mesh;
}

function mugMesh(colorHex = 0xffffff) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.4 });
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 16), mat);
  cup.position.y = 0.05;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.008, 8, 16), mat);
  handle.position.set(0.05, 0.05, 0);
  handle.rotation.y = Math.PI / 2;
  const coffee = new THREE.Mesh(
    new THREE.CylinderGeometry(0.038, 0.038, 0.005, 16),
    new THREE.MeshStandardMaterial({ color: 0x3d2314, roughness: 0.3 })
  );
  coffee.position.y = 0.095;
  g.add(cup, handle, coffee);
  return g;
}

function createProceduralPlant({ scale = 1, seed = 1 } = {}) {
  const plant = new THREE.Group();
  plant.name = 'procedural_floor_plant';
  const potMaterial = new THREE.MeshStandardMaterial({ color: 0xc8744b, roughness: 0.85 });
  const soilMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3526, roughness: 1 });
  const greens = [0x3f8f4f, 0x4fa35d, 0x367a45, 0x5cae66].map(
    (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.7 })
  );

  const pot = cylinder(
    plant,
    0.26 * scale,
    0.2 * scale,
    0.42 * scale,
    24,
    [0, 0.21 * scale, 0],
    potMaterial,
    true
  );
  const soil = cylinder(
    plant,
    0.24 * scale,
    0.24 * scale,
    0.02 * scale,
    24,
    [0, 0.41 * scale, 0],
    soilMaterial,
    false
  );

  const rng = (s) => () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const r = rng(seed);

  const leafGeo = new THREE.SphereGeometry(0.1 * scale, 12, 8);
  for (let i = 0; i < 11; i++) {
    const leaf = new THREE.Mesh(leafGeo, greens[i % greens.length]);
    leaf.scale.set(1, 3.4 + r() * 1.6, 0.35);
    const a = (i / 11) * Math.PI * 2 + r() * 0.4;
    const tilt = 0.35 + r() * 0.45;
    leaf.position.set(
      Math.sin(a) * 0.12 * scale,
      (0.72 + r() * 0.2) * scale,
      Math.cos(a) * 0.12 * scale
    );
    leaf.rotation.set(Math.cos(a) * tilt, 0, -Math.sin(a) * tilt);
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    plant.add(leaf);
  }

  plant.userData.dispose = () => {
    pot.geometry.dispose();
    soil.geometry.dispose();
    leafGeo.dispose();
    potMaterial.dispose();
    soilMaterial.dispose();
    greens.forEach((m) => m.dispose());
  };
  return plant;
}

function createBookshelfFallback() {
  const shelf = new THREE.Group();
  shelf.name = 'fallback_bookshelf';
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a583e, roughness: 0.86 });
  const bookMaterials = [0x52635b, 0xb4a48a, 0x737b84].map(
    (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.94 })
  );
  const geometries = [];
  const addPart = (size, position, material) => {
    const part = box(shelf, size, position, material, true);
    geometries.push(part.geometry);
  };
  for (const center of [-0.58, 0.58]) {
    addPart([1.15, 2.185, 0.02], [center, 1.0925, -0.174], wood);
    for (const side of [-1, 1]) {
      addPart([0.042, 2.185, 0.368], [center + side * 0.554, 1.0925, 0], wood);
    }
    for (const [row, y] of [0.07, 0.58, 1.09, 1.6, 2.15].entries()) {
      addPart([1.108, 0.04, 0.368], [center, y, 0], wood);
      if (row === 4) continue;
      for (let index = 0; index < 4; index++) {
        const height = 0.24 + ((index + row) % 3) * 0.045;
        addPart(
          [0.095, height, 0.18],
          [center - 0.4 + index * 0.13, y + 0.02 + height / 2, 0.045],
          bookMaterials[(index + row) % bookMaterials.length]
        );
      }
    }
  }
  shelf.userData.dispose = () => {
    geometries.forEach((geometry) => geometry.dispose());
    for (const material of [wood, ...bookMaterials]) material.dispose();
  };
  return shelf;
}

export function createFurnitureScene({ anisotropy = 1, assetBase = '/cockpit-assets/' } = {}) {
  let disposed = false;
  const furniture = new THREE.Group();
  const workstations = {};
  const gltfLoader = new GLTFLoader();

  // Materials
  const darkOak = new THREE.MeshStandardMaterial({ color: 0x7a583e, roughness: 0.65 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x3d4148, roughness: 0.4, metalness: 0.3 });
  const screenBody = new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.35 });
  const whitePlastic = new THREE.MeshStandardMaterial({ color: 0xf4f3ef, roughness: 0.45 });
  const sofaPillow = new THREE.MeshStandardMaterial({ color: 0xe5bf60, roughness: 0.9 });
  const coffeeWood = new THREE.MeshStandardMaterial({ color: 0x8a6649, roughness: 0.6 });
  const stainlessSteel = new THREE.MeshStandardMaterial({
    color: 0xb5bac2,
    roughness: 0.25,
    metalness: 0.85
  });

  const roleColors = Object.fromEntries(OFFICE_ROLES.map((role) => [role.key, role.color]));
  const workstationAssets = createWorkstationAssets({ anisotropy, assetBase });

  DESK_CONFIGS.forEach((cfg) => {
    const workstation = createAgentWorkstation({
      config: cfg,
      accent: roleColors[cfg.key],
      assets: workstationAssets,
      detailed: cfg.key === 'data_engineer',
      anisotropy
    });
    workstations[cfg.key] = workstation;
    furniture.add(workstation.group);
  });

  const pantry = new THREE.Group();
  pantry.name = 'zone_pantry';
  pantry.position.set(FURNITURE_LAYOUT.pantry.x, ROOM_LAYOUT.floorY, FURNITURE_LAYOUT.pantry.z);
  pantry.rotation.y = FURNITURE_LAYOUT.pantry.heading;

  const cabinetMaterial = new THREE.MeshStandardMaterial({ color: 0xf4f3ef, roughness: 0.86 });
  const cabinet = box(pantry, [2.4, 0.77, 0.92], [0, 0.565, -0.02], cabinetMaterial, true);
  cabinet.name = 'pantry_cabinet';
  box(pantry, [2.28, 0.18, 0.76], [0, 0.09, 0.04], cabinetMaterial, true);
  const counter = box(pantry, [2.4, 0.05, 0.96], [0, 0.97, 0], darkOak, true);
  counter.name = 'pantry_countertop';
  box(pantry, [2.4, 0.46, 0.025], [0, 1.225, -0.4675], cabinetMaterial);
  for (const x of [-0.8, 0, 0.8]) {
    box(pantry, [0.76, 0.71, 0.028], [x, 0.565, 0.455], cabinetMaterial);
    box(pantry, [0.16, 0.022, 0.036], [x, 0.81, 0.488], metal);
  }

  const mugShelf = box(pantry, [1.96, 0.04, 0.28], [0, 1.73, -0.34], darkOak, true);
  mugShelf.name = 'pantry_mug_shelf';
  for (const x of [-0.72, 0.72]) {
    box(pantry, [0.035, 0.17, 0.035], [x, 1.625, -0.4475], metal);
    box(pantry, [0.035, 0.035, 0.2], [x, 1.6775, -0.35], metal);
  }
  OFFICE_ROLES.filter((role) => role.key !== 'hq_lab_director').forEach((role, idx) => {
    const shelfMug = mugMesh(role.color);
    shelfMug.name = `pantry_mug_${role.key}`;
    shelfMug.position.set(-0.775 + idx * 0.31, 1.75, -0.33);
    pantry.add(shelfMug);
  });

  // Espresso Machine
  const esp = new THREE.Group();
  esp.name = 'pantry_coffee_machine';
  esp.position.set(-0.45, 0.995, -0.05);
  box(esp, [0.55, 0.4, 0.4], [0, 0.25, 0], stainlessSteel, true);
  box(esp, [0.58, 0.05, 0.42], [0, 0.47, 0], metal);
  box(esp, [0.55, 0.08, 0.44], [0, 0.04, 0], metal);
  box(esp, [0.46, 0.02, 0.2], [0, 0.09, 0.18], stainlessSteel);
  // Portafilter & Wand
  cylinder(esp, 0.045, 0.045, 0.05, 12, [-0.1, 0.2, 0.2], stainlessSteel);
  box(esp, [0.03, 0.03, 0.16], [-0.1, 0.2, 0.3], metal);
  const wand = cylinder(esp, 0.008, 0.008, 0.18, 8, [0.18, 0.2, 0.2], stainlessSteel);
  wand.rotation.z = 0.2;
  // Pressure gauge
  const pressureGauge = cylinder(esp, 0.03, 0.03, 0.008, 16, [0.1, 0.36, 0.205], whitePlastic);
  pressureGauge.rotation.x = Math.PI / 2;
  const gaugeNeedle = box(esp, [0.003, 0.019, 0.003], [0.1, 0.365, 0.211], metal);
  gaugeNeedle.rotation.z = -0.5;
  // Coffee Grinder next to espresso machine
  const grinder = new THREE.Group();
  grinder.name = 'pantry_coffee_grinder';
  grinder.position.set(0.48, 0, 0);
  box(grinder, [0.16, 0.28, 0.2], [0, 0.14, 0], metal);
  const hopper = cylinder(
    grinder,
    0.08,
    0.05,
    0.18,
    16,
    [0, 0.37, 0],
    new THREE.MeshStandardMaterial({
      color: 0xd4b28c,
      transparent: true,
      opacity: 0.6,
      roughness: 0.1
    })
  );
  const beans = cylinder(
    grinder,
    0.065,
    0.05,
    0.1,
    16,
    [0, 0.34, 0],
    new THREE.MeshStandardMaterial({ color: 0x422718, roughness: 0.9 })
  );
  grinder.add(hopper, beans);
  esp.add(grinder);
  pantry.add(esp);

  // Water Dispenser with Blue Gallon Bottle
  const dispenser = new THREE.Group();
  dispenser.name = 'pantry_dispenser';
  dispenser.position.set(
    FURNITURE_LAYOUT.dispenser.x,
    ROOM_LAYOUT.floorY,
    FURNITURE_LAYOUT.dispenser.z
  );
  dispenser.rotation.y = FURNITURE_LAYOUT.dispenser.heading;
  box(dispenser, [0.36, 0.8, 0.42], [0, 0.58, 0], whitePlastic, true);
  box(dispenser, [0.34, 0.18, 0.28], [0, 0.09, 0.07], whitePlastic, true);
  box(dispenser, [0.24, 0.26, 0.05], [0, 0.54, 0.205], metal);
  box(dispenser, [0.26, 0.025, 0.13], [0, 0.3975, 0.225], whitePlastic);
  // Red & Blue taps
  const hotTap = cylinder(
    dispenser,
    0.016,
    0.016,
    0.04,
    8,
    [-0.05, 0.62, 0.25],
    new THREE.MeshBasicMaterial({ color: 0xd64545 })
  );
  hotTap.rotation.x = Math.PI / 2;
  const coldTap = cylinder(
    dispenser,
    0.016,
    0.016,
    0.04,
    8,
    [0.05, 0.62, 0.25],
    new THREE.MeshBasicMaterial({ color: 0x3f6fd1 })
  );
  coldTap.rotation.x = Math.PI / 2;
  // Transparent Blue Gallon Water Bottle
  const bottleMat = new THREE.MeshStandardMaterial({
    color: 0x76b5ed,
    transparent: true,
    opacity: 0.62,
    roughness: 0.1
  });
  cylinder(dispenser, 0.14, 0.14, 0.42, 20, [0, 1.2, 0], bottleMat);
  cylinder(dispenser, 0.06, 0.09, 0.08, 16, [0, 0.98, 0], bottleMat);
  cylinder(
    dispenser,
    0.13,
    0.13,
    0.3,
    20,
    [0, 1.14, 0],
    new THREE.MeshStandardMaterial({ color: 0x4896db, transparent: true, opacity: 0.55 })
  );
  furniture.add(dispenser);

  const insideBackWall = ROOM_LAYOUT.min[2] + 0.18 / 2;
  pantry.updateMatrixWorld(true);
  pantry.userData.wallClearance = new THREE.Box3().setFromObject(pantry).min.z - insideBackWall;
  pantry.userData.front = '+Z';
  const pantryMiniPlant = createProceduralPlant({ scale: 0.35, seed: 17 });
  pantryMiniPlant.name = 'pantry_mini_plant';
  pantryMiniPlant.position.set(0.65, 0.93, 0.05);
  pantry.add(pantryMiniPlant);

  furniture.add(pantry);

  const lounge = new THREE.Group();
  lounge.name = 'zone_lounge';
  lounge.position.set(FURNITURE_LAYOUT.lounge.x, ROOM_LAYOUT.floorY, FURNITURE_LAYOUT.lounge.z);
  lounge.rotation.y = FURNITURE_LAYOUT.lounge.heading;

  // Lounge Rug
  box(
    lounge,
    [3.4, 0.015, 2.6],
    [0, 0.008, 0.6],
    new THREE.MeshStandardMaterial({ color: 0xd8cbba, roughness: 1 })
  );

  // PBR 3D Sofa (Loaded from sofa-3seat.glb)
  const sofaContainer = new THREE.Group();
  sofaContainer.name = 'sofa_loaded';
  sofaContainer.position.set(0, 0.38, 0);
  lounge.add(sofaContainer);
  const sofaFallback = createSofaFallback();
  lounge.add(sofaFallback);

  gltfLoader.load(
    `${assetBase}models/sofa-3seat.glb`,
    (gltf) => {
      if (disposed) {
        disposeObjectTree(gltf.scene);
        return;
      }
      const sofaModel = gltf.scene;
      sofaModel.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material && child.material.map) {
            child.material.map.colorSpace = THREE.SRGBColorSpace;
          }
        }
      });
      sofaContainer.add(sofaModel);
      lounge.remove(sofaFallback);
      disposeSeatingFallback(sofaFallback);
    },
    undefined,
    (error) => {
      console.warn('Gagal memuat sofa-3seat.glb:', error);
    }
  );

  // Accent Pillow
  const pillow = box(lounge, [0.28, 0.2, 0.1], [-0.9, 0.78, -0.27], sofaPillow);
  pillow.rotation.set(-0.2, 0.3, 0.15);

  // Low Coffee Table
  box(lounge, [1.3, 0.06, 0.65], [0, 0.42, 1.05], coffeeWood);
  for (const [lx, lz] of [
    [-0.55, 0.8],
    [0.55, 0.8],
    [-0.55, 1.3],
    [0.55, 1.3]
  ]) {
    cylinder(lounge, 0.022, 0.022, 0.4, 8, [lx, 0.2, lz], metal);
  }

  // 2 PS5 Gamepads on coffee table
  function makeGamepad(colorHex) {
    const pad = new THREE.Group();
    const padMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.4 });
    box(pad, [0.15, 0.03, 0.08], [0, 0, 0], padMat);
    for (const s of [-1, 1]) {
      cylinder(pad, 0.02, 0.02, 0.06, 8, [s * 0.06, -0.01, 0.04], padMat);
    }
    return pad;
  }
  const padWhite = makeGamepad(0xf4f4f6);
  padWhite.position.set(-0.3, 0.47, 1.05);
  padWhite.rotation.y = 0.4;
  const padBlack = makeGamepad(0x1e2024);
  padBlack.position.set(0.15, 0.47, 0.98);
  padBlack.rotation.y = -0.3;

  // Magazine and coffee mug on coffee table (from kantor-agent design)
  const magazine = box(
    lounge,
    [0.24, 0.015, 0.32],
    [-0.05, 0.455, 1.05],
    new THREE.MeshStandardMaterial({ color: 0x4a7c59, roughness: 0.8 })
  );
  magazine.rotation.y = 0.15;
  cylinder(
    lounge,
    0.04,
    0.035,
    0.08,
    16,
    [0.35, 0.49, 1.1],
    new THREE.MeshStandardMaterial({ color: 0xfbfbf9, roughness: 0.5 })
  );

  lounge.add(padWhite, padBlack);

  furniture.add(lounge);

  // TV Corner (In front of the sofa)
  const tv = new THREE.Group();
  tv.name = 'zone_tv';
  tv.position.set(FURNITURE_LAYOUT.tv.x, ROOM_LAYOUT.floorY, FURNITURE_LAYOUT.tv.z);

  // TV Stand Cabinet
  box(tv, [2.2, 0.45, 0.45], [0, 0.225, 0], darkOak, true);
  box(
    tv,
    [2.1, 0.3, 0.02],
    [0, 0.23, 0.23],
    new THREE.MeshStandardMaterial({ color: 0x8a6649, roughness: 0.6 })
  );

  // Soundbar
  box(tv, [1.0, 0.07, 0.1], [0, 0.49, 0.12], screenBody);

  // PS5 Console Standing Vertically
  const ps5 = new THREE.Group();
  ps5.position.set(0.82, 0.45, 0.02);
  box(ps5, [0.04, 0.38, 0.24], [0, 0.2, 0], metal);
  box(ps5, [0.045, 0.4, 0.26], [-0.03, 0.2, 0], whitePlastic);
  box(ps5, [0.045, 0.4, 0.26], [0.03, 0.2, 0], whitePlastic);
  box(ps5, [0.005, 0.3, 0.005], [0, 0.22, 0.125], new THREE.MeshBasicMaterial({ color: 0x5aa6ff }));
  tv.add(ps5);

  // TV Body & Screen
  box(tv, [1.8, 1.04, 0.06], [0, 1.14, 0], screenBody, true);
  const tvScreen = createTVScreen({ anisotropy });
  const tvScreenMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.74, 0.98),
    new THREE.MeshBasicMaterial({ map: tvScreen.texture, toneMapped: false })
  );
  tvScreenMesh.name = 'tv_screen';
  tvScreenMesh.userData.roleKey = 'tv';
  tvScreenMesh.position.set(0, 1.14, 0.032);
  tv.add(tvScreenMesh);
  cylinder(tv, 0.04, 0.04, 0.16, 10, [0, 0.54, 0], metal);
  box(tv, [0.5, 0.02, 0.22], [0, 0.46, 0], metal);

  furniture.add(tv);

  const meeting = new THREE.Group();
  meeting.name = 'zone_meeting';
  meeting.position.set(FURNITURE_LAYOUT.meeting.x, ROOM_LAYOUT.floorY, FURNITURE_LAYOUT.meeting.z);

  // Round Rug
  const roundRug = new THREE.Mesh(
    new THREE.CircleGeometry(2.3, 40),
    new THREE.MeshStandardMaterial({ color: 0xcdbba4, roughness: 1 })
  );
  roundRug.rotation.x = -Math.PI / 2;
  roundRug.position.y = 0.008;
  roundRug.receiveShadow = true;
  meeting.add(roundRug);

  // Round Meeting Table
  cylinder(
    meeting,
    0.98,
    0.98,
    0.05,
    36,
    [0, 0.74, 0],
    new THREE.MeshStandardMaterial({ color: 0xeae4db, roughness: 0.6 }),
    true
  );
  cylinder(meeting, 0.06, 0.06, 0.72, 12, [0, 0.37, 0], stainlessSteel);
  cylinder(meeting, 0.42, 0.46, 0.04, 24, [0, 0.02, 0], stainlessSteel);

  // 3 Swivel Chairs around round table (Loaded from task-chair.glb)
  const meetingChairContainers = [];
  for (const seat of MEETING_SEATS) {
    const chairContainer = new THREE.Group();
    chairContainer.name = `chair_${seat.id}`;
    chairContainer.position.set(
      seat.fixture.x - FURNITURE_LAYOUT.meeting.x,
      0,
      seat.fixture.z - FURNITURE_LAYOUT.meeting.z
    );
    chairContainer.rotation.y = seat.fixture.heading;
    chairContainer.add(createChairFallback());
    meeting.add(chairContainer);
    meetingChairContainers.push(chairContainer);
  }

  gltfLoader.load(
    `${assetBase}models/task-chair.glb`,
    (gltf) => {
      if (disposed) {
        disposeObjectTree(gltf.scene);
        return;
      }
      const chairModel = gltf.scene;
      chairModel.position.y = 0.5197;
      chairModel.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material && child.material.map) {
            child.material.map.colorSpace = THREE.SRGBColorSpace;
          }
        }
      });
      meetingChairContainers.forEach((container) => {
        const fallback = container.getObjectByName('fallback_task_chair');
        container.remove(fallback);
        disposeSeatingFallback(fallback);
        container.add(chairModel.clone());
      });
    },
    undefined,
    (error) => {
      console.warn('Gagal memuat task-chair.glb untuk ruang rapat:', error);
    }
  );

  // Open Sleek Laptop on Meeting Table
  const laptop = new THREE.Group();
  laptop.position.set(0.1, 0.765, -0.1);
  laptop.rotation.y = 0.4;
  box(laptop, [0.42, 0.016, 0.28], [0, 0.008, 0], stainlessSteel);
  const laptopScreen = box(laptop, [0.42, 0.28, 0.012], [0, 0.14, -0.14], screenBody);
  laptopScreen.rotation.x = -0.28;
  const laptopGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.39, 0.25),
    new THREE.MeshBasicMaterial({ color: 0xcde0f7 })
  );
  laptopGlow.position.set(0, 0.14, -0.133);
  laptopGlow.rotation.x = -0.28;
  laptop.add(laptopGlow);
  meeting.add(laptop);

  furniture.add(meeting);

  const shelfGroup = new THREE.Group();
  shelfGroup.name = 'zone_bookshelf';
  shelfGroup.position.set(
    FURNITURE_LAYOUT.bookshelf.x,
    ROOM_LAYOUT.floorY,
    FURNITURE_LAYOUT.bookshelf.z
  );
  shelfGroup.rotation.y = FURNITURE_LAYOUT.bookshelf.heading;
  const shelfFallback = createBookshelfFallback();
  shelfGroup.add(shelfFallback);

  const shelfMiniPlant = createProceduralPlant({ scale: 0.35, seed: 42 });
  shelfMiniPlant.name = 'shelf_mini_plant';
  shelfMiniPlant.position.set(0.3, 1.25, 0.05);
  shelfGroup.add(shelfMiniPlant);

  furniture.add(shelfGroup);

  gltfLoader.load(
    `${assetBase}models/bookshelf.glb`,
    (gltf) => {
      if (disposed) {
        disposeObjectTree(gltf.scene);
        return;
      }
      const shelfModel = gltf.scene;
      shelfModel.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material && child.material.map) {
            child.material.map.colorSpace = THREE.SRGBColorSpace;
          }
        }
      });
      // Place two modular units side-by-side to form a continuous library section
      const shelf1 = shelfModel.clone();
      shelf1.position.set(-0.58, 1.0925, 0);
      shelf1.scale.setScalar(1.15);
      const shelf2 = shelfModel.clone();
      shelf2.position.set(0.58, 1.0925, 0);
      shelf2.scale.setScalar(1.15);
      shelfGroup.add(shelf1, shelf2);
      shelfGroup.remove(shelfFallback);
      shelfFallback.userData.dispose();
    },
    undefined,
    (error) => {
      console.warn('Gagal memuat bookshelf.glb:', error);
    }
  );

  // Potted Indoor Floor Plants (Procedural Monstera from kantor-agent)
  const contactShadowTexture = createContactShadowTexture();
  const contactShadowGeo = new THREE.PlaneGeometry(0.72, 0.72);
  const contactShadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowTexture,
    transparent: true,
    opacity: 0.85,
    depthWrite: false
  });

  FURNITURE_LAYOUT.plants.forEach((pos, idx) => {
    const container = new THREE.Group();
    container.name = `plant_${pos.zone}`;
    container.position.set(pos.x, ROOM_LAYOUT.floorY, pos.z);
    container.scale.setScalar(pos.scale);

    const plant = createProceduralPlant({ scale: 1, seed: idx * 4 + 2 });
    plant.name = 'procedural_floor_plant';
    container.add(plant);

    // Soft ambient occlusion contact shadow directly on the floor
    const shadow = new THREE.Mesh(contactShadowGeo, contactShadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.001;
    container.add(shadow);

    furniture.add(container);
  });

  return {
    group: furniture,
    dispose(disposedResources) {
      if (disposed) return;
      disposed = true;
      workstationAssets.dispose(disposedResources);
    },
    workstations,
    tvScreen,
    tvFocusMesh: tvScreenMesh
  };
}
