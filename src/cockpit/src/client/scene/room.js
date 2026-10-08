import * as THREE from 'three';
import { ROOM_LAYOUT } from './office-layout.js';
import { createTaskBoard } from './task-board.js';

function addBox(group, size, position, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  group.add(mesh);
  return mesh;
}

function createOfficeClock() {
  const clock = new THREE.Group();
  clock.name = 'office_clock';
  clock.position.set(8.1, 3.55, -7.365);
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x30343c, roughness: 0.65 });
  const casing = new THREE.Mesh(new THREE.CylinderGeometry(0.51, 0.51, 0.07, 48), frameMaterial);
  casing.rotation.x = Math.PI / 2;
  clock.add(casing);

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f8f6f1';
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = '#30343c';
  for (let tick = 0; tick < 60; tick++) {
    const angle = (tick * Math.PI) / 30;
    const inner = tick % 5 === 0 ? 201 : 216;
    ctx.lineWidth = tick % 5 === 0 ? 5 : 2;
    ctx.beginPath();
    ctx.moveTo(256 + Math.sin(angle) * inner, 256 - Math.cos(angle) * inner);
    ctx.lineTo(256 + Math.sin(angle) * 230, 256 - Math.cos(angle) * 230);
    ctx.stroke();
  }
  ctx.fillStyle = '#30343c';
  ctx.font = '600 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let hour = 1; hour <= 12; hour++) {
    const angle = (hour * Math.PI) / 6;
    ctx.fillText(String(hour), 256 + Math.sin(angle) * 172, 256 - Math.cos(angle) * 172);
  }
  ctx.font = '600 29px sans-serif';
  ctx.fillText('WIB', 256, 339);

  const faceTexture = new THREE.CanvasTexture(canvas);
  faceTexture.colorSpace = THREE.SRGBColorSpace;
  faceTexture.wrapS = faceTexture.wrapT = THREE.ClampToEdgeWrapping;
  faceTexture.minFilter = THREE.LinearMipmapLinearFilter;
  faceTexture.magFilter = THREE.LinearFilter;
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(0.474, 48),
    new THREE.MeshBasicMaterial({ map: faceTexture, toneMapped: false })
  );
  face.position.z = 0.038;
  clock.add(face);

  const darkHand = new THREE.MeshBasicMaterial({ color: 0x292d34, toneMapped: false });
  const secondHandMaterial = new THREE.MeshBasicMaterial({ color: 0xb25849, toneMapped: false });
  function hand(name, width, length, z, material) {
    const pivot = new THREE.Group();
    pivot.name = name;
    const mesh = addBox(pivot, [width, length, 0.009], [0, length / 2 - 0.035, z], material);
    mesh.name = `${name}_pointer`;
    clock.add(pivot);
    return pivot;
  }
  const hour = hand('clock_hour_hand', 0.035, 0.26, 0.052, darkHand);
  const minute = hand('clock_minute_hand', 0.024, 0.375, 0.063, darkHand);
  const second = hand('clock_second_hand', 0.009, 0.435, 0.074, secondHandMaterial);
  const hub = new THREE.Mesh(new THREE.CircleGeometry(0.026, 16), darkHand);
  hub.position.z = 0.082;
  clock.add(hub);

  return {
    group: clock,
    update(time) {
      hour.rotation.z = -Math.PI * 2 * (((time.hour % 12) + time.minute / 60) / 12);
      minute.rotation.z = -Math.PI * 2 * ((time.minute + time.second / 60) / 60);
      second.rotation.z = (-Math.PI * 2 * time.second) / 60;
      clock.userData.timeText = time.timeText;
    }
  };
}

export function createRoomScene(options = {}) {
  const room = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0xc8aa82, roughness: 0.88 });
  const wall = new THREE.MeshStandardMaterial({ color: 0xdad4ca, roughness: 0.95 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xc9b9a6, roughness: 0.82 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf8f6f1, roughness: 0.84 });

  const floor = addBox(room, [19, 0.16, 14], [0, -0.08, -0.5], wood);
  floor.receiveShadow = true;

  // Instancing keeps the parquet visible without hundreds of draw calls.
  const parquet = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.23, 0.012, 0.62),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88 }),
    14 * 19
  );
  const tile = new THREE.Object3D();
  const tones = [0xd0ad7d, 0xc5a373, 0xd7b98c];
  let index = 0;
  for (let row = 0; row < 19; row++) {
    for (let column = 0; column < 14; column++) {
      tile.position.set(-8.8 + column * 1.35 + (row % 2) * 0.12, 0.006, -6.8 + row * 0.69);
      tile.updateMatrix();
      parquet.setMatrixAt(index, tile.matrix);
      parquet.setColorAt(index, new THREE.Color(tones[(column + row * 2) % tones.length]));
      index++;
    }
  }
  parquet.instanceMatrix.needsUpdate = true;
  parquet.instanceColor.needsUpdate = true;
  parquet.receiveShadow = true;
  room.add(parquet);

  const backWall = addBox(room, [19, 5.5, 0.18], [0, 2.75, -7.5], wall);
  const leftWall = addBox(room, [0.18, 5.5, 14], [-9.5, 2.75, -0.5], wall);
  backWall.receiveShadow = true;
  leftWall.receiveShadow = true;
  addBox(room, [19, 0.17, 0.13], [0, 0.09, -7.35], trim);
  addBox(room, [0.13, 0.17, 14], [-9.35, 0.09, -0.5], trim);

  // Two windows establish the scale of the room behind the workstations.
  const sky = new THREE.MeshBasicMaterial({ color: 0xaed1e5, toneMapped: false });
  const skyline = new THREE.MeshBasicMaterial({ color: 0xd5e4eb, toneMapped: false });
  const cityLightPositions = [];
  ROOM_LAYOUT.windows.forEach((center, paneIndex) => {
    addBox(room, [2.55, 2.2, 0.025], [center, 3.53, -7.37], sky);
    for (let block = 0; block < 5; block++) {
      const height = 0.4 + ((block * 3 + paneIndex) % 4) * 0.18;
      addBox(
        room,
        [0.32, height, 0.012],
        [center - 0.92 + block * 0.46, 2.43 + height / 2, -7.34],
        skyline
      );
      for (let row = 0; row < Math.floor(height / 0.18); row++) {
        for (const offset of [-0.075, 0.075]) {
          if ((block + row + paneIndex) % 3 === 0) continue;
          cityLightPositions.push([
            center - 0.92 + block * 0.46 + offset,
            2.51 + row * 0.18,
            -7.33
          ]);
        }
      }
    }
    addBox(room, [2.7, 0.09, 0.09], [center, 4.68, -7.3], white);
    addBox(room, [2.7, 0.09, 0.09], [center, 2.38, -7.3], white);
    addBox(room, [0.09, 2.3, 0.09], [center - 1.3, 3.53, -7.3], white);
    addBox(room, [0.09, 2.3, 0.09], [center + 1.3, 3.53, -7.3], white);
    addBox(room, [0.06, 2.2, 0.09], [center, 3.53, -7.29], white);
    addBox(room, [2.56, 0.06, 0.09], [center, 3.53, -7.29], white);
    addBox(room, [2.8, 0.09, 0.3], [center, 2.35, -7.2], white);
  });

  const cityLightMaterial = new THREE.MeshBasicMaterial({
    color: 0xf0ca83,
    toneMapped: false,
    transparent: true,
    opacity: 0,
    depthWrite: false
  });
  const cityLights = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.045, 0.065, 0.004),
    cityLightMaterial,
    cityLightPositions.length
  );
  cityLights.name = 'window_city_lights';
  const cityLightTransform = new THREE.Object3D();
  cityLightPositions.forEach((position, lightIndex) => {
    cityLightTransform.position.set(...position);
    cityLightTransform.updateMatrix();
    cityLights.setMatrixAt(lightIndex, cityLightTransform.matrix);
  });
  cityLights.instanceMatrix.needsUpdate = true;
  cityLights.visible = false;
  room.add(cityLights);

  const officeClock = createOfficeClock();
  room.add(officeClock.group);
  const daySky = new THREE.Color(0xaed1e5);
  const nightSky = new THREE.Color(0x252d4e);
  const twilightSky = new THREE.Color(0xd6ada0);
  const dayBuildings = new THREE.Color(0xd5e4eb);
  const nightBuildings = new THREE.Color(0x191f33);
  let lastSecondKey = null;
  let lastMinuteKey = null;
  room.userData.updateTime = (time) => {
    if (!time) return;
    if (time.secondKey !== lastSecondKey) {
      officeClock.update(time);
      lastSecondKey = time.secondKey;
    }
    if (time.minuteKey !== lastMinuteKey) {
      const hour = time.hour + time.minute / 60;
      const daylight =
        THREE.MathUtils.smoothstep(hour, 5.5, 6.5) *
        (1 - THREE.MathUtils.smoothstep(hour, 17.5, 18.5));
      sky.color.copy(nightSky).lerp(daySky, daylight);
      sky.color.lerp(twilightSky, 4 * daylight * (1 - daylight) * 0.42);
      skyline.color.copy(nightBuildings).lerp(dayBuildings, daylight);
      cityLightMaterial.opacity = 1 - daylight;
      cityLights.visible = daylight < 1;
      room.userData.dayPeriod = time.dayPeriod;
      lastMinuteKey = time.minuteKey;
    }
  };

  const { x: boardX, y: boardY, z: boardZ } = ROOM_LAYOUT.board;
  const board = createTaskBoard({ anisotropy: options.anisotropy ?? 1 });
  board.group.position.set(boardX, boardY, boardZ);
  room.add(board.group);
  room.userData.setBoardState = board.setState;

  const cork = new THREE.MeshStandardMaterial({ color: 0xb48e63, roughness: 0.95 });
  addBox(room, [0.12, 1.9, 2.3], [-9.34, 2.9, -3.4], cork);
  for (let item = 0; item < 4; item++) {
    addBox(
      room,
      [0.014, 0.56, 0.39],
      [-9.265, 3.22 - (item % 2) * 0.68, -4.0 + Math.floor(item / 2) * 0.88],
      white
    );
  }

  const shadowResolution = options.shadowResolution ?? 2048;
  const hemi = new THREE.HemisphereLight(0xfdf7ef, 0xc9b9a3, 1.05);
  room.add(hemi);
  room.add(new THREE.AmbientLight(0xfff5ea, 0.72));
  const sunlight = new THREE.DirectionalLight(0xfff1dc, 2.2);
  sunlight.position.set(8, 14, 10);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(shadowResolution, shadowResolution);
  sunlight.shadow.camera.near = 0.5;
  sunlight.shadow.camera.far = 50;
  sunlight.shadow.camera.left = -15;
  sunlight.shadow.camera.right = 15;
  sunlight.shadow.camera.top = 13;
  sunlight.shadow.camera.bottom = -13;
  sunlight.shadow.bias = -0.0005;
  sunlight.shadow.normalBias = 0.02;
  sunlight.shadow.radius = options.shadowRadius ?? 2;
  room.add(sunlight);

  return room;
}
