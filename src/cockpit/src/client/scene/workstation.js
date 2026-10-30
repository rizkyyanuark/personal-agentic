import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { disposeObjectTree, disposeResource } from '../lifecycle.js';
import { OFFICE_ROLES } from '../../shared/office-contract.js';
import { ROOM_LAYOUT } from './office-layout.js';
import { getDeskSeat } from './seat-registry.js';
import { createChairFallback, disposeSeatingFallback } from './seating-fallbacks.js';
import { createDeskPropAssets, createDeskProps } from './desk-props.js';
import {
  createNameplateTexture,
  createWorkstationScreens,
  projectWorkstationState
} from './workstation-screens.js';

const STATE_COLORS = {
  bekerja: '#2f8f68',
  menunggu_persetujuan: '#b86920',
  siaga: '#60706a',
  gagal: '#a6402d'
};

function addBox(group, size, position, material, shadow = false) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.userData.workstationOwnedGeometry = true;
  mesh.position.set(...position);
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  group.add(mesh);
  return mesh;
}

function addCylinder(group, radius, height, position, material, segments = 12) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, segments),
    material
  );
  mesh.userData.workstationOwnedGeometry = true;
  mesh.position.set(...position);
  group.add(mesh);
  return mesh;
}

function safeColor(value, fallback = '#356b63') {
  return /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;
}

function createBraidedCableTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1c2024';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = '#2d333b';
  ctx.lineWidth = 3;
  for (let i = -64; i < 128; i += 12) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 64, 64);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i + 64, 0);
    ctx.lineTo(i, 64);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 12);
  return texture;
}

function createPowderCoatBumpTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(64, 64);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const v = 120 + Math.floor(Math.random() * 30);
    imgData.data[i] = v;
    imgData.data[i + 1] = v;
    imgData.data[i + 2] = v;
    imgData.data[i + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  return texture;
}

function addWorkstationCabling(group, assets) {
  const leftCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.3, 1.05, -0.25),
    new THREE.Vector3(-0.3, 0.73, -0.33),
    new THREE.Vector3(-0.2, 0.52, -0.32)
  ]);
  const leftCable = new THREE.Mesh(
    new THREE.TubeGeometry(leftCurve, 16, 0.008, 6, false),
    assets.cableMaterial
  );
  leftCable.castShadow = true;
  group.add(leftCable);

  const rightCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.68, 1.02, -0.18),
    new THREE.Vector3(0.48, 0.73, -0.31),
    new THREE.Vector3(0.18, 0.52, -0.32)
  ]);
  const rightCable = new THREE.Mesh(
    new THREE.TubeGeometry(rightCurve, 16, 0.008, 6, false),
    assets.cableMaterial
  );
  rightCable.castShadow = true;
  group.add(rightCable);

  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.24, 0.5, -0.32),
    new THREE.Vector3(0.52, 0.47, -0.32),
    new THREE.Vector3(0.68, 0.38, -0.38)
  ]);
  const trunkCable = new THREE.Mesh(
    new THREE.TubeGeometry(trunkCurve, 20, 0.011, 8, false),
    assets.cableMaterial
  );
  trunkCable.castShadow = true;
  group.add(trunkCable);

  const floorCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.06, 0.44, -0.32),
    new THREE.Vector3(-0.06, 0.22, -0.4),
    new THREE.Vector3(-0.06, 0.01, -0.4)
  ]);
  const floorCable = new THREE.Mesh(
    new THREE.TubeGeometry(floorCurve, 12, 0.012, 6, false),
    assets.cableMaterial
  );
  floorCable.castShadow = true;
  group.add(floorCable);
  for (const cable of [leftCable, rightCable, trunkCable, floorCable]) {
    cable.userData.workstationOwnedGeometry = true;
  }

  const floorGrommet = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.05, 0.02, 12),
    assets.metal
  );
  floorGrommet.position.set(-0.06, 0.01, -0.4);
  floorGrommet.userData.workstationOwnedGeometry = true;
  floorGrommet.receiveShadow = true;
  group.add(floorGrommet);
}

function roundedBox(w, h, d, r = 0.02) {
  return new RoundedBoxGeometry(
    w,
    h,
    d,
    2,
    Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)
  );
}

function createMonitor(texture, w, h, position, yaw, shadow = false) {
  const monitor = new THREE.Group();
  monitor.name = `monitor_${texture.name}`;
  monitor.position.set(...position);
  monitor.rotation.y = yaw;

  // Bezel from kantor-agent: box(w + 0.06, h + 0.06, 0.035, 0.015), mat('#22252b', 0.4, 0.2)
  const bezelGeo = roundedBox(w + 0.06, h + 0.06, 0.035, 0.015);
  const bezelMat = new THREE.MeshStandardMaterial({
    color: 0x22252b,
    roughness: 0.4,
    metalness: 0.2
  });
  const bezel = new THREE.Mesh(bezelGeo, bezelMat);
  bezel.castShadow = shadow;
  bezel.receiveShadow = shadow;
  bezel.userData.workstationOwnedGeometry = true;
  bezel.userData.workstationOwnedMaterial = true;
  monitor.add(bezel);

  // Screen plane from kantor-agent: PlaneGeometry(w, h) at z = 0.019
  const displayGeo = new THREE.PlaneGeometry(w, h);
  const displayMat = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  const display = new THREE.Mesh(displayGeo, displayMat);
  display.position.z = 0.019;
  display.userData.workstationOwnedGeometry = true;
  display.userData.workstationOwnedMaterial = true;
  monitor.add(display);

  // Neck stand from kantor-agent: BoxGeometry(0.05, 0.22, 0.04), mat('#3a3d44', 0.4, 0.5) at [0, -h/2 - 0.08, -0.03]
  const neckGeo = new THREE.BoxGeometry(0.05, 0.22, 0.04);
  const standMat = new THREE.MeshStandardMaterial({
    color: 0x3a3d44,
    roughness: 0.4,
    metalness: 0.5
  });
  const neck = new THREE.Mesh(neckGeo, standMat);
  neck.position.set(0, -h / 2 - 0.08, -0.03);
  neck.castShadow = shadow;
  neck.userData.workstationOwnedGeometry = true;
  neck.userData.workstationOwnedMaterial = true;
  monitor.add(neck);

  // Foot from kantor-agent: box(0.3, 0.02, 0.2, 0.01) at [0, -h/2 - 0.19, 0]
  const footGeo = roundedBox(0.3, 0.02, 0.2, 0.01);
  const foot = new THREE.Mesh(footGeo, standMat);
  foot.position.set(0, -h / 2 - 0.19, 0);
  foot.castShadow = shadow;
  foot.receiveShadow = shadow;
  foot.userData.workstationOwnedGeometry = true;
  foot.userData.workstationOwnedMaterial = true;
  monitor.add(foot);

  return monitor;
}

function addDeskStickyNotes(group, roleKey) {
  const stickyGroup = new THREE.Group();
  stickyGroup.name = `sticky_notes_${roleKey}`;
  ['#fff1a8', '#ffd8b5', '#cfe0ff'].forEach((c, i) => {
    const n = new THREE.Mesh(
      new THREE.PlaneGeometry(0.07, 0.07),
      new THREE.MeshStandardMaterial({
        color: c,
        roughness: 0.9,
        side: THREE.DoubleSide
      })
    );
    n.position.set(-0.78 + i * 0.08, 1.5 - (i % 2) * 0.05, -0.23);
    n.rotation.z = (i - 1) * 0.12;
    n.userData.workstationOwnedGeometry = true;
    n.userData.workstationOwnedMaterial = true;
    stickyGroup.add(n);
  });
  group.add(stickyGroup);
}

function addDeskSurface(group, config, role, assets, accentMaterial, nameplate, detailed) {
  addBox(group, [1.05, 0.014, 0.4], [-0.12, 0.782, 0.2], assets.deskMat);

  const keyboardContainer = new THREE.Group();
  keyboardContainer.name = `keyboard_${config.key}`;
  keyboardContainer.position.set(...(detailed ? [-0.15, 0.815, 0.14] : [-0.12, 0.806, 0.15]));
  keyboardContainer.rotation.y = 0;
  keyboardContainer.scale.setScalar(detailed ? 0.95 : 0.9);
  assets.attachKeyboard(keyboardContainer);
  group.add(keyboardContainer);

  const mouseContainer = new THREE.Group();
  mouseContainer.name = `mouse_${config.key}`;
  mouseContainer.position.set(detailed ? 0.36 : 0.34, 0.789, 0.18);
  mouseContainer.rotation.y = Math.PI;
  mouseContainer.scale.setScalar(detailed ? 1.0 : 0.9);
  assets.attachMouse(mouseContainer);
  group.add(mouseContainer);

  const mug = new THREE.Group();
  mug.name = `mug_${config.key}`;
  mug.userData.roleColor = role.color;
  addCylinder(mug, 0.045, 0.1, [0, 0.05, 0], accentMaterial, 16);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 8, 16), accentMaterial);
  handle.userData.workstationOwnedGeometry = true;
  handle.position.set(0.05, 0.05, 0);
  handle.rotation.y = Math.PI / 2;
  mug.add(handle);
  addCylinder(mug, 0.037, 0.003, [0, 0.101, 0], assets.coffeeMaterial, 16);
  mug.position.set(0.73, 0.783, 0.26);
  group.add(mug);

  // Angled acrylic desk nameplate (1:1 kantor-agent design)
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.125),
    new THREE.MeshBasicMaterial({
      map: nameplate,
      toneMapped: false,
      transparent: true,
      side: THREE.DoubleSide
    })
  );
  plate.name = `nameplate_${config.key}`;
  plate.userData.workstationOwnedGeometry = true;
  plate.userData.workstationOwnedMaterial = true;
  plate.rotation.x = -0.55;
  plate.position.set(0.55, 0.838, 0.44);
  group.add(plate);
}

export function createWorkstationAssets({ anisotropy = 1, assetBase = '/cockpit-assets/' } = {}) {
  let disposed = false;
  const loadingManager = new THREE.LoadingManager();
  loadingManager.onError = (url) => console.warn(`Tekstur workstation gagal dimuat: ${url}`);
  const oakTexture = new THREE.TextureLoader(loadingManager).load(
    `${assetBase}workstation-oak.svg`
  );
  oakTexture.colorSpace = THREE.SRGBColorSpace;
  oakTexture.wrapS = THREE.RepeatWrapping;
  oakTexture.wrapT = THREE.RepeatWrapping;
  oakTexture.repeat.set(2.8, 1.4);
  oakTexture.anisotropy = anisotropy;

  let keyboardTemplate = null;
  const keyboardWaiters = [];
  const gltfLoader = new GLTFLoader(loadingManager);
  gltfLoader.load(
    `${assetBase}models/keyboard.glb`,
    (gltf) => {
      if (disposed) {
        disposeObjectTree(gltf.scene);
        return;
      }
      keyboardTemplate = gltf.scene;
      keyboardTemplate.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material && child.material.map) {
            child.material.map.colorSpace = THREE.SRGBColorSpace;
          }
        }
      });
      keyboardWaiters.forEach((cb) => cb(keyboardTemplate));
      keyboardWaiters.length = 0;
    },
    undefined,
    (err) => console.warn('Gagal memuat keyboard.glb:', err)
  );

  let chairTemplate = null;
  const chairWaiters = [];
  gltfLoader.load(
    `${assetBase}models/task-chair.glb`,
    (gltf) => {
      if (disposed) {
        disposeObjectTree(gltf.scene);
        return;
      }
      chairTemplate = gltf.scene;
      chairTemplate.position.y = 0.5197;
      chairTemplate.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material && child.material.map) {
            child.material.map.colorSpace = THREE.SRGBColorSpace;
          }
        }
      });
      chairWaiters.forEach((cb) => cb(chairTemplate));
      chairWaiters.length = 0;
    },
    undefined,
    (err) => console.warn('Gagal memuat task-chair.glb:', err)
  );

  let mouseTemplate = null;
  const mouseWaiters = [];
  gltfLoader.load(
    `${assetBase}models/mouse.glb`,
    (gltf) => {
      if (disposed) {
        disposeObjectTree(gltf.scene);
        return;
      }
      mouseTemplate = gltf.scene;
      mouseTemplate.position.y = 0.01875;
      mouseTemplate.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material && child.material.map) {
            child.material.map.colorSpace = THREE.SRGBColorSpace;
          }
        }
      });
      mouseWaiters.forEach((cb) => cb(mouseTemplate));
      mouseWaiters.length = 0;
    },
    undefined,
    (err) => console.warn('Gagal memuat mouse.glb:', err)
  );

  const powderCoatBump = createPowderCoatBumpTexture();
  const braidedCableTexture = createBraidedCableTexture();

  let cableTrayTemplate = null;
  const cableTrayWaiters = [];
  gltfLoader.load(
    `${assetBase}models/cable-tray.glb`,
    (gltf) => {
      if (disposed) {
        disposeObjectTree(gltf.scene);
        return;
      }
      cableTrayTemplate = gltf.scene;
      cableTrayTemplate.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material) {
            child.material.roughness = 0.42;
            child.material.metalness = 0.78;
            child.material.bumpMap = powderCoatBump;
            child.material.bumpScale = 0.002;
            if (child.material.map) {
              child.material.map.colorSpace = THREE.SRGBColorSpace;
            }
          }
        }
      });
      cableTrayWaiters.forEach((cb) => cb(cableTrayTemplate));
      cableTrayWaiters.length = 0;
    },
    undefined,
    (err) => console.warn('Gagal memuat cable-tray.glb:', err)
  );

  const assets = {
    deskProps: createDeskPropAssets(),
    coffeeMaterial: new THREE.MeshStandardMaterial({ color: 0x382b21, roughness: 0.95 }),
    oak: new THREE.MeshStandardMaterial({
      color: 0xe0c18d,
      map: oakTexture,
      roughness: 0.72
    }),
    white: new THREE.MeshStandardMaterial({ color: 0xf1eee7, roughness: 0.7 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x343a3d, roughness: 0.48, metalness: 0.35 }),
    screenBody: new THREE.MeshStandardMaterial({
      color: 0x202426,
      roughness: 0.3,
      metalness: 0.15
    }),
    deskMat: new THREE.MeshStandardMaterial({ color: 0x28483f, roughness: 0.86 }),
    keyMaterial: new THREE.MeshStandardMaterial({ color: 0xe8e6e1, roughness: 0.58 }),
    cableMaterial: new THREE.MeshStandardMaterial({
      color: 0x22262c,
      roughness: 0.68,
      metalness: 0.15,
      map: braidedCableTexture
    }),
    dispose(disposedResources = new Set()) {
      if (disposed) return;
      disposed = true;
      for (const waiters of [keyboardWaiters, chairWaiters, mouseWaiters, cableTrayWaiters])
        waiters.length = 0;
      for (const template of [keyboardTemplate, chairTemplate, mouseTemplate, cableTrayTemplate])
        if (template) disposeObjectTree(template, disposedResources);
      for (const resource of Object.values(assets))
        if (resource?.isMaterial) disposeResource(resource, disposedResources);
      for (const texture of [oakTexture, powderCoatBump, braidedCableTexture])
        disposeResource(texture, disposedResources);
      for (const resource of Object.values(assets.deskProps))
        if (resource?.isMaterial || resource?.isBufferGeometry)
          disposeResource(resource, disposedResources);
    },
    attachKeyboard(container) {
      if (keyboardTemplate) {
        container.add(keyboardTemplate.clone());
      } else {
        keyboardWaiters.push((tpl) => container.add(tpl.clone()));
      }
    },
    attachChair(container, detailed = false) {
      if (chairTemplate) {
        container.add(chairTemplate.clone());
      } else {
        const fallback = createChairFallback({ detailed });
        container.add(fallback);
        chairWaiters.push((tpl) => {
          container.remove(fallback);
          disposeSeatingFallback(fallback);
          container.add(tpl.clone());
        });
      }
    },
    attachMouse(container) {
      if (mouseTemplate) {
        container.add(mouseTemplate.clone());
      } else {
        mouseWaiters.push((tpl) => container.add(tpl.clone()));
      }
    },
    attachCableTray(container) {
      if (cableTrayTemplate) {
        container.add(cableTrayTemplate.clone());
      } else {
        cableTrayWaiters.push((tpl) => container.add(tpl.clone()));
      }
    }
  };

  return assets;
}

export function createAgentWorkstation({ config, assets, detailed = false, anisotropy = 1 }) {
  const canonicalRole = OFFICE_ROLES.find((item) => item.key === config.key);
  const role = canonicalRole ? { ...canonicalRole } : null;
  const seat = getDeskSeat(config.key);
  if (!role || !seat) throw new RangeError(`No workstation for ${config.key}`);
  const roleColor = safeColor(role.color);
  const group = new THREE.Group();
  group.name = `workstation_${config.key}`;
  group.position.set(config.x, ROOM_LAYOUT.floorY, config.z);
  group.userData.roleKey = role.key;
  group.userData.agentName = role.name;
  group.userData.job = role.role;

  const accentMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(roleColor),
    roughness: 0.48
  });

  addBox(group, [1.88, 0.065, 0.98], [0, 0.75, 0], assets.oak, detailed);
  for (const side of [-1, 1]) {
    addBox(group, [0.065, 0.72, 0.88], [side * 0.87, 0.36, 0], assets.white, detailed);
  }
  addBox(group, [1.68, 0.22, 0.035], [0, 0.49, -0.42], assets.white);
  addBox(group, [1.55, 0.025, 0.05], [0, 0.705, -0.32], assets.metal);

  const cableTrayContainer = new THREE.Group();
  cableTrayContainer.position.set(0, 0.569, -0.32);
  assets.attachCableTray(cableTrayContainer);
  group.add(cableTrayContainer);

  addWorkstationCabling(group, assets);
  const screens = createWorkstationScreens(role, anisotropy);
  let nameplate = createNameplateTexture(role, anisotropy);
  const props = createDeskProps(role, assets.deskProps, accentMaterial);
  group.add(props.group);
  // Monitors from kantor-agent: Main 1.0x0.58 at [-0.3, 1.26, -0.25], Side 0.82x0.5 at [0.68, 1.22, -0.18] yaw -0.35 rad
  const clockMonitor = createMonitor(screens.clock, 1.0, 0.58, [-0.3, 1.26, -0.25], 0.0, detailed);
  const workMonitor = createMonitor(screens.work, 0.82, 0.5, [0.68, 1.22, -0.18], -0.35, detailed);
  group.add(clockMonitor, workMonitor);
  if (role.key === 'data_scientist' || role.key === 'research_scientist') {
    addDeskStickyNotes(group, role.key);
  }

  addDeskSurface(group, config, role, assets, accentMaterial, nameplate, detailed);

  const computer = addBox(
    group,
    [0.28, 0.48, 0.42],
    [0.7, 0.34, -0.22],
    assets.screenBody,
    detailed
  );
  computer.name = `status_computer_${config.key}`;
  const ledMaterial = new THREE.MeshBasicMaterial({ color: 0x78847f, toneMapped: false });
  addBox(group, [0.018, 0.018, 0.006], [0.79, 0.47, 0.0], ledMaterial);

  const chairContainer = new THREE.Group();
  chairContainer.name = `chair_${config.key}`;
  chairContainer.position.set(seat.fixture.x - config.x, 0, seat.fixture.z - config.z);
  chairContainer.rotation.y = seat.fixture.heading;
  assets.attachChair(chairContainer, detailed);
  group.add(chairContainer);

  const highlightMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(roleColor),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    visible: false,
    toneMapped: false
  });
  const highlight = addBox(group, [1.98, 0.012, 1.36], [0, 0.018, 0.28], highlightMaterial);
  highlight.renderOrder = 1;

  const hitTarget = addBox(
    group,
    [1.98, 1.7, 1.72],
    [0, 0.84, 0.28],
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitTarget.userData.roleKey = config.key;
  hitTarget.userData.workstationTarget = true;
  hitTarget.userData.workstationOwnedMaterial = true;

  let hoverTarget = 0;
  let selected = false;
  let highlightValue = 0;
  return {
    group,
    hitTarget,
    detailed,
    screens,
    schematic: screens.concept,
    setIdentity(identity) {
      if (
        group.userData.agentName === identity.name &&
        group.userData.job === identity.role &&
        group.userData.agentId === identity.agentId
      )
        return;
      group.userData.agentName = identity.name;
      group.userData.job = identity.role;
      group.userData.agentId = identity.agentId;
      role.name = identity.name;
      role.role = identity.role;
      role.agentId = identity.agentId;
      screens.invalidateIdentity();
      const next = createNameplateTexture(
        { ...role, agentId: identity.agentId, name: identity.name, role: identity.role },
        anisotropy
      );
      const plate = group.getObjectByName(`nameplate_${config.key}`);
      if (plate) {
        plate.material.map = next;
        plate.material.needsUpdate = true;
      }
      nameplate.dispose();
      nameplate = next;
    },
    setHovered(value) {
      hoverTarget = value ? 1 : 0;
    },
    setSelected(value) {
      selected = Boolean(value);
    },
    setState(agent, snapshot) {
      const projection = projectWorkstationState(agent, snapshot);
      const stateColor = STATE_COLORS[projection.state] || '#78847f';
      ledMaterial.color.set(stateColor);
      return screens.setState(agent, snapshot);
    },
    update(delta, reduceMotion = false, timeSnapshot) {
      const target = selected ? 1 : hoverTarget * 0.65;
      highlightValue = reduceMotion
        ? target
        : THREE.MathUtils.damp(highlightValue, target, 12, delta);
      highlightMaterial.opacity = highlightValue * 0.22;
      highlightMaterial.visible = highlightValue > 0.01;
      return screens.update(delta, reduceMotion, timeSnapshot);
    },
    dispose() {
      // Loaded clones and shared asset materials belong to createWorkstationAssets.
      group.traverse((object) => {
        if (object.userData.workstationOwnedGeometry) object.geometry.dispose();
        if (object.userData.workstationOwnedMaterial) object.material.dispose();
      });
      const fallback = chairContainer.getObjectByName('fallback_task_chair');
      if (fallback) disposeSeatingFallback(fallback);
      accentMaterial.dispose();
      ledMaterial.dispose();
      highlightMaterial.dispose();
      nameplate.dispose();
      screens.dispose();
      props.dispose();
    }
  };
}

export function setupWorkstationInteraction({
  camera,
  canvas,
  workstations,
  onSelect,
  extraTargets = []
}) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const entries = Object.values(workstations);
  const targets = [...entries.map((entry) => entry.hitTarget), ...extraTargets];
  let hovered = null;
  let selected = null;
  let pointerDown = null;

  function pick(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(targets, false)[0]?.object;
    if (!hit) return null;
    return {
      roleKey: hit.userData?.roleKey || null,
      isCharacter: Boolean(hit.userData?.isCharacter)
    };
  }

  function setHovered(hit) {
    const roleKey = hit?.roleKey || null;
    if (hovered === roleKey) return;
    if (hovered && workstations[hovered]) workstations[hovered].setHovered(false);
    hovered = roleKey;
    if (hovered && workstations[hovered]) workstations[hovered].setHovered(true);
    canvas.style.cursor = hovered ? 'pointer' : '';
  }

  function handleMove(event) {
    setHovered(pick(event));
  }

  function handlePointerDown(event) {
    pointerDown = { x: event.clientX, y: event.clientY };
  }

  function handlePointerUp(event) {
    if (
      !pointerDown ||
      Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 6
    ) {
      pointerDown = null;
      return;
    }
    pointerDown = null;
    const hit = pick(event);
    if (hit?.roleKey && typeof onSelect === 'function') onSelect(hit.roleKey, hit.isCharacter);
  }

  const handlers = {
    pointermove: handleMove,
    pointerdown: handlePointerDown,
    pointerup: handlePointerUp,
    pointercancel: () => {
      pointerDown = null;
      setHovered(null);
    },
    pointerleave: () => setHovered(null)
  };
  for (const [event, handler] of Object.entries(handlers))
    canvas.addEventListener(event, handler, { passive: true });

  return {
    dispose() {
      for (const [event, handler] of Object.entries(handlers))
        canvas.removeEventListener(event, handler);
      canvas.style.cursor = '';
    },
    select(roleKey) {
      if (selected && workstations[selected]) workstations[selected].setSelected(false);
      selected = workstations[roleKey] ? roleKey : null;
      if (selected) workstations[selected].setSelected(true);
      canvas.dataset.selectedWorkstation = selected || '';
    },
    clearSelection() {
      if (selected && workstations[selected]) workstations[selected].setSelected(false);
      selected = null;
      canvas.dataset.selectedWorkstation = '';
    }
  };
}
