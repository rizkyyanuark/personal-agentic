import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import puppeteer from 'puppeteer';
import { OFFICE_ROLES, isPublicLabState } from '../../src/shared/office-contract.js';
import { DESK_CONFIGS, ROOM_LAYOUT } from '../../src/client/scene/office-layout.js';
import { CHARACTER_RIG } from '../../src/client/scene/seating-contract.js';
import { allocateCharacterSeats } from '../../src/client/scene/seat-registry.js';
import {
  getHomeCameraView,
  getRoomCenterCameraView,
  getWorkstationCameraView
} from '../../src/client/scene/camera-views.js';

const origin = process.env.COCKPIT_URL || 'http://127.0.0.1:8095';
const desktop = { width: 1440, height: 900, deviceScaleFactor: 1, hasTouch: true };
const resized = { ...desktop, width: 1280, height: 820 };
const roleKeys = OFFICE_ROLES.map(({ key }) => key);
const deskKeys = DESK_CONFIGS.map(({ key }) => key);
const subject = deskKeys[0];
const cameraTolerance = 0.03;
const poseTolerance = 0.005;
const blockedAssets = new Set(['/assets/models/task-chair.glb', '/assets/models/sofa-3seat.glb']);

function allStates(state) {
  return Object.fromEntries(roleKeys.map((key) => [key, state]));
}

function publicFixture(states) {
  const running = Object.values(states).filter((state) => state === 'bekerja').length;
  const fixture = {
    connection: 'live',
    now: new Date().toISOString(),
    totals: { tasks: running, completed: 0, events: 0 },
    queue: { queued: 0, running, waiting_approval: 0, failed: 0, stale: 0 },
    agents: Object.fromEntries(
      roleKeys.map((key) => [
        key,
        { state: states[key], task: `Fixture T02, bukan aktivitas live: ${states[key]}` }
      ])
    ),
    feed: []
  };
  assert.equal(isPublicLabState(fixture), true, 'fixture obeys the existing public state schema');
  assert.deepEqual(Object.keys(fixture).sort(), [
    'agents',
    'connection',
    'feed',
    'now',
    'queue',
    'totals'
  ]);
  for (const agent of Object.values(fixture.agents)) {
    assert.deepEqual(Object.keys(agent).sort(), ['state', 'task']);
  }
  return fixture;
}

function assignmentsFor(states) {
  return allocateCharacterSeats(
    Object.fromEntries(Object.entries(states).map(([key, state]) => [key, { state }]))
  );
}

function assertVector(actual, expected, description, tolerance = cameraTolerance) {
  assert.equal(actual.length, expected.length, description);
  actual.forEach((value, index) => {
    assert.ok(Number.isFinite(value), `${description}: coordinate ${index} is finite`);
    assert.ok(
      Math.abs(value - expected[index]) < tolerance,
      `${description}: coordinate ${index}, ${value} != ${expected[index]}`
    );
  });
}

async function createFixturePage(browser, { failSeatingAssets = false } = {}) {
  const page = await browser.newPage();
  const failures = [];
  const expectedFailures = [];
  const warnings = [];
  const aborted = new Set();
  let states = allStates('bekerja');
  await page.setViewport(desktop);
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    try {
      if (request.isInterceptResolutionHandled()) return;
      const path = new URL(request.url()).pathname;
      if (request.method() !== 'GET') {
        failures.push(`unexpected mutating request: ${request.method()} ${path}`);
        await request.abort('blockedbyclient');
      } else if (path === '/api/state') {
        await request.respond({
          status: 200,
          contentType: 'application/json',
          headers: { 'Cache-Control': 'no-store' },
          body: JSON.stringify(publicFixture(states))
        });
      } else if (failSeatingAssets && blockedAssets.has(path)) {
        aborted.add(path);
        await request.abort('failed');
      } else {
        await request.continue();
      }
    } catch (error) {
      failures.push(`request interception: ${error.message}`);
    }
  });
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'warn') warnings.push(message.text());
    if (message.type() !== 'error') return;
    const url = message.location().url;
    const isExpectedAssetError =
      failSeatingAssets &&
      url &&
      blockedAssets.has(new URL(url, origin).pathname) &&
      message.text() === 'Failed to load resource: net::ERR_FAILED';
    (isExpectedAssetError ? expectedFailures : failures).push(`console: ${message.text()} ${url}`);
  });
  page.on('requestfailed', (request) => {
    const path = new URL(request.url()).pathname;
    const error = request.failure()?.errorText || '';
    const expected = failSeatingAssets && blockedAssets.has(path) && error === 'net::ERR_FAILED';
    (expected ? expectedFailures : failures).push(`request failed: ${path} ${error}`);
  });
  const response = await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 30000 });
  assert.equal(response?.status(), 200, 'fixture page HTTP status');
  try {
    await page.waitForFunction(
      () =>
        window.__virtualOfficeReady === true && Object.keys(window.__characters || {}).length === 5,
      { timeout: 45000 }
    );
  } catch (error) {
    console.error('T02 startup diagnostics', {
      failures,
      warnings,
      actual: await page.evaluate(() => ({
        ready: window.__virtualOfficeReady,
        characters: Object.keys(window.__characters || {}),
        workstations: Object.keys(window.__workstations || {}),
        contextLost: window.__renderer?.getContext().isContextLost(),
        loading: document.getElementById('loading')?.textContent,
        fallbackHidden: document.getElementById('sceneFallback')?.hidden
      }))
    });
    throw error;
  }
  await page.waitForSelector('.agent-card:nth-child(5)', { timeout: 45000 });
  await page.waitForFunction(
    (keys) =>
      keys.every((key) => {
        const keyboard = window.__workstations[key]?.group.getObjectByName(`keyboard_${key}`);
        let meshes = 0;
        keyboard?.traverse((object) => {
          if (object.isMesh) meshes++;
        });
        return meshes > 0;
      }),
    { timeout: 45000 },
    deskKeys
  );
  if (!failSeatingAssets) {
    await page.waitForFunction(
      () =>
        !window.__scene.getObjectByName('fallback_task_chair') &&
        !window.__scene.getObjectByName('fallback_sofa'),
      { timeout: 45000 }
    );
  }
  await page.$eval('.office-stage', (stage) => {
    const note = document.createElement('div');
    note.id = 't02-fixture-note';
    note.textContent = 'Fixture T02: pengujian pose, bukan aktivitas live';
    Object.assign(note.style, {
      position: 'absolute',
      top: '8px',
      right: '8px',
      zIndex: '20',
      padding: '6px 8px',
      background: '#1f2937',
      color: '#ffffff',
      font: '12px sans-serif',
      pointerEvents: 'none'
    });
    stage.appendChild(note);
  });
  await waitForAssignments(page, states, 'initial fresh working fixture');
  return {
    page,
    failures,
    expectedFailures,
    warnings,
    aborted,
    async setStates(next, description) {
      publicFixture(next);
      states = next;
      await waitForAssignments(page, next, description);
    }
  };
}

async function waitForAssignments(page, states, description) {
  const assignments = assignmentsFor(states);
  try {
    await page.waitForFunction(
      ({ expectedStates, expectedSeats, tolerance }) =>
        Object.entries(expectedSeats).every(([key, seat]) => {
          const entity = window.__characters[key];
          return (
            entity?.state === expectedStates[key] &&
            entity.seat?.id === seat.id &&
            entity.seat.kind === seat.kind &&
            entity.root.position
              .toArray()
              .every((value, index) => Math.abs(value - seat.position[index]) < tolerance)
          );
        }),
      { timeout: 10000 },
      { expectedStates: states, expectedSeats: assignments, tolerance: poseTolerance }
    );
  } catch (error) {
    console.error(`${description}: assignment mismatch`, {
      expected: assignments,
      actual: await page.evaluate(() =>
        Object.fromEntries(
          Object.entries(window.__characters).map(([key, entity]) => [
            key,
            { state: entity.state, seat: entity.seat, position: entity.root.position.toArray() }
          ])
        )
      )
    });
    throw error;
  }
  return assignments;
}

async function readPoses(page) {
  return page.evaluate(() => {
    const THREE = window.__THREE;
    window.__scene.updateMatrixWorld(true);
    const world = (object) => object.getWorldPosition(new THREE.Vector3()).toArray();
    const direction = (object) =>
      new THREE.Vector3(0, 0, 1)
        .applyQuaternion(object.getWorldQuaternion(new THREE.Quaternion()))
        .normalize()
        .toArray();
    const physicalMeshes = [];
    window.__scene.traverse((object) => {
      if (!object.isMesh || object.userData.workstationTarget || !object.visible) return;
      let parent = object;
      while (parent) {
        if (parent.name.startsWith('character_') || !parent.visible) return;
        parent = parent.parent;
      }
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (materials.some((material) => material.visible !== false && material.opacity !== 0))
        physicalMeshes.push(object);
    });
    return Object.fromEntries(
      Object.entries(window.__characters).map(([key, entity]) => {
        const seat = entity.seat;
        const keyboard = window.__workstations[key]?.group.getObjectByName(`keyboard_${key}`);
        const keyboardBounds = keyboard ? new THREE.Box3().setFromObject(keyboard) : null;
        const surfaces = [];
        if (seat.kind !== 'standing') {
          for (const side of [-0.14, 0.14]) {
            const origin = new THREE.Vector3(
              seat.position[0] + side * Math.cos(seat.heading),
              seat.surfaceY + 0.08,
              seat.position[2] - side * Math.sin(seat.heading)
            );
            const ray = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0), 0, 0.16);
            const hit = ray.intersectObjects(physicalMeshes, false)[0];
            surfaces.push(hit ? { y: hit.point.y, mesh: hit.object.name } : null);
          }
        }
        const joints = Object.fromEntries(
          [
            'root',
            'hips',
            'head',
            'leftLeg',
            'rightLeg',
            'leftCalf',
            'rightCalf',
            'leftShoe',
            'rightShoe',
            'leftHand',
            'rightHand'
          ].map((name) => [name, world(entity[name])])
        );
        return [
          key,
          {
            state: entity.state,
            seat,
            heading: entity.root.rotation.y,
            forward: direction(entity.root),
            headForward: direction(entity.head),
            joints,
            shoeDirections: [direction(entity.leftShoe), direction(entity.rightShoe)],
            soles: [entity.leftShoe, entity.rightShoe].map(
              (shoe) => new THREE.Box3().setFromObject(shoe).min.y
            ),
            handsToKeyboard: keyboardBounds
              ? [entity.leftHand, entity.rightHand].map((hand) =>
                  keyboardBounds.distanceToPoint(new THREE.Vector3(...world(hand)))
                )
              : null,
            surfaces,
            handProps: [entity.handMug, entity.handPad, entity.handBook].map(
              (prop) => prop.visible
            ),
            inScene: window.__scene.getObjectByName(`character_${key}`) === entity.root
          }
        ];
      })
    );
  });
}

async function assertPoses(page, states, description, { fallback = false } = {}) {
  const poses = await readPoses(page);
  const assignments = assignmentsFor(states);
  assert.deepEqual(
    Object.keys(poses).sort(),
    [...roleKeys].sort(),
    `${description}: five characters`
  );
  for (const [key, pose] of Object.entries(poses)) {
    const seat = assignments[key];
    assert.equal(pose.inScene, true, `${description}: ${key} belongs to scene`);
    assert.equal(pose.state, states[key], `${description}: ${key} real fixture state`);
    assert.equal(pose.seat.id, seat.id, `${description}: ${key} deterministic seat`);
    assert.equal(pose.seat.kind, seat.kind, `${description}: ${key} posture kind`);
    assertVector(pose.joints.root, seat.position, `${description}: ${key} anchor`, poseTolerance);
    assert.ok(
      Math.abs(pose.heading - seat.heading) < poseTolerance,
      `${description}: ${key} heading`
    );
    pose.soles.forEach((y, index) => {
      assert.ok(
        Math.abs(y - ROOM_LAYOUT.floorY) < poseTolerance,
        `${description}: ${key} shoe ${index} sole ${y} touches floor ${ROOM_LAYOUT.floorY}`
      );
    });
    const look = [
      seat.lookTarget[0] - pose.joints.head[0],
      seat.lookTarget[1] - pose.joints.head[1],
      seat.lookTarget[2] - pose.joints.head[2]
    ];
    const lookLength = Math.hypot(...look);
    assert.ok(
      pose.headForward.reduce((sum, value, axis) => sum + value * look[axis], 0) / lookLength >
        Math.cos(Math.PI / 18),
      `${description}: ${key} faces its seat look target`
    );
    if (seat.kind === 'standing') {
      assert.equal(key, 'hq_lab_director', `${description}: only HQ stands`);
      continue;
    }
    assert.ok(
      Math.abs(pose.seat.surfaceY - seat.surfaceY) < poseTolerance,
      `${description}: ${key} declared cushion surface`
    );
    assert.ok(
      Math.abs(pose.joints.hips[1] - (seat.surfaceY + CHARACTER_RIG.thighRadius)) < poseTolerance,
      `${description}: ${key} thighs rest on cushion surface`
    );
    for (const side of ['left', 'right']) {
      const hip = pose.joints[`${side}Leg`];
      const knee = pose.joints[`${side}Calf`];
      const foot = pose.joints[`${side}Shoe`];
      const forward = (point) =>
        (point[0] - hip[0]) * pose.forward[0] + (point[2] - hip[2]) * pose.forward[2];
      assert.ok(forward(knee) > 0.2, `${description}: ${key} ${side} thigh/knee point forward`);
      assert.ok(forward(foot) > 0.2, `${description}: ${key} ${side} foot stays in front`);
      assert.ok(
        Math.abs(knee[1] - hip[1]) < 0.15,
        `${description}: ${key} ${side} thigh seated, not vertical`
      );
      assert.ok(knee[1] - foot[1] > 0.3, `${description}: ${key} ${side} shin points down`);
    }
    pose.shoeDirections.forEach((direction, index) => {
      assert.ok(
        direction.reduce((sum, value, axis) => sum + value * pose.forward[axis], 0) > 0.9,
        `${description}: ${key} shoe ${index} points forward`
      );
    });
    pose.surfaces.forEach((hit, index) => {
      assert.ok(hit, `${description}: ${key} hip ${index} has a physical cushion below it`);
      assert.ok(
        Math.abs(hit.y - seat.surfaceY) < 0.01,
        `${description}: ${key} hip ${index} surface ${hit.y} matches ${seat.surfaceY}`
      );
      if (fallback)
        assert.match(
          hit.mesh,
          seat.kind === 'sofa' ? /^sofa_seat_/ : /^chair_seat$/,
          `${description}: ${key} fallback supports actual pose`
        );
    });
    if (states[key] === 'bekerja') {
      assert.equal(seat.kind, 'desk', `${description}: ${key} works at own desk`);
      assert.equal(seat.roleKey, key, `${description}: ${key} never uses another role's desk`);
      assert.equal(pose.handsToKeyboard.length, 2, `${description}: ${key} actual keyboard exists`);
      pose.handsToKeyboard.forEach((distance, index) => {
        assert.ok(
          Number.isFinite(distance) && distance < 0.085,
          `${description}: ${key} wrist ${index} is ${distance} m from actual keyboard`
        );
      });
      assert.deepEqual(
        pose.handProps,
        [false, false, false],
        `${description}: ${key} no handheld break props while working`
      );
    }
  }
  const occupiedSofa = Object.entries(poses).filter(([, pose]) => pose.seat.kind === 'sofa');
  const expectedSofa = deskKeys.filter((key) => states[key] === 'siaga').slice(0, 2);
  assert.deepEqual(
    occupiedSofa.map(([key]) => key),
    expectedSofa,
    `${description}: canonical sofa allocation order`
  );
  assert.equal(
    new Set(occupiedSofa.map(([, pose]) => pose.seat.id)).size,
    occupiedSofa.length,
    `${description}: no double-booked sofa seat`
  );
  const counts = await page.evaluate(() => ({
    desks: Object.keys(window.__workstations).sort(),
    cards: [...document.querySelectorAll('.agent-card')]
      .map((card) => card.id.replace('card-', ''))
      .sort()
  }));
  assert.deepEqual(
    counts.desks,
    [...deskKeys].sort(),
    `${description}: exact four workstations, no HQ desk`
  );
  assert.deepEqual(counts.cards, [...roleKeys].sort(), `${description}: exact five role cards`);
  return poses;
}

async function expectedCamera(page, kind, roleKey = subject) {
  const { aspect, fov } = await page.evaluate(() => ({
    aspect: window.__camera.aspect,
    fov: window.__camera.fov
  }));
  const view =
    kind === 'home'
      ? getHomeCameraView(aspect, fov)
      : kind === 'card' && roleKey === 'hq_lab_director'
        ? getRoomCenterCameraView(aspect, fov)
        : getWorkstationCameraView(roleKey, aspect, fov);
  return { position: view.position.toArray(), target: view.target.toArray() };
}

async function readCamera(page) {
  return page.evaluate(() => ({
    position: window.__camera.position.toArray(),
    target: window.__controls.target.toArray()
  }));
}

async function waitForCamera(page, expected, description) {
  try {
    await page.waitForFunction(
      ({ position, target, tolerance }) =>
        window.__camera.position
          .toArray()
          .every((value, index) => Math.abs(value - position[index]) < tolerance) &&
        window.__controls.target
          .toArray()
          .every((value, index) => Math.abs(value - target[index]) < tolerance),
      { timeout: 10000 },
      { ...expected, tolerance: cameraTolerance }
    );
  } catch (error) {
    console.error(`${description}: camera mismatch`, { expected, actual: await readCamera(page) });
    throw error;
  }
  const actual = await readCamera(page);
  assertVector(actual.position, expected.position, `${description}: camera position`);
  assertVector(actual.target, expected.target, `${description}: camera target`);
  return actual;
}

async function assertFocusedLabel(page, roleKey, description, { outside = false } = {}) {
  const role = OFFICE_ROLES.find(({ key }) => key === roleKey);
  const expectedText = `${role.name} · ${role.role}${role.slug === 'hq' ? ' · HQ' : ''}`;
  await page.waitForFunction(
    ({ key, text, hidden }) => {
      const entity = window.__characters[key];
      let label;
      entity.root.traverse((object) => {
        if (object.isCSS2DObject) label = object;
      });
      const tag = label?.element.querySelector('.agent-tag');
      if (!tag) return false;
      const ndc = label.getWorldPosition(new window.__THREE.Vector3()).project(window.__camera);
      const inFrustum = Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && Math.abs(ndc.z) <= 1;
      const rect = tag.getBoundingClientRect();
      const style = getComputedStyle(tag);
      const visible =
        tag.isConnected &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        rect.width > 0 &&
        rect.height > 0;
      const stage = document.querySelector('.office-stage').getBoundingClientRect();
      return (
        tag.textContent === text &&
        (!hidden || !inFrustum) &&
        label.visible === inFrustum &&
        visible === inFrustum &&
        (!inFrustum ||
          (rect.left >= stage.left - 1 &&
            rect.right <= stage.right + 1 &&
            rect.top >= stage.top - 1 &&
            rect.bottom <= stage.bottom + 1))
      );
    },
    { timeout: 10000 },
    { key: roleKey, text: expectedText, hidden: outside }
  );
  const selected = await page.$$eval('.agent-card[aria-pressed="true"]', (cards) =>
    cards.map((card) => card.id)
  );
  assert.deepEqual(
    selected,
    [`card-${roleKey}`],
    `${description}: one selected DOM role remains readable`
  );
  assert.equal(
    await page.$eval('#scene canvas', (canvas) => canvas.dataset.selectedWorkstation || ''),
    roleKey === 'hq_lab_director' ? '' : roleKey,
    `${description}: desk card selects its workstation; Orion remains deskless`
  );
}

async function focusCard(page, roleKey, description, keyboard = null) {
  if (keyboard) {
    await page.focus(`#card-${roleKey}`);
    await page.keyboard.press(keyboard);
  } else await page.click(`#card-${roleKey}`);
  await waitForCamera(page, await expectedCamera(page, 'card', roleKey), description);
  await assertFocusedLabel(page, roleKey, description);
}

async function resetCamera(page, description, key = null) {
  if (key) await page.keyboard.press(key);
  else await page.click('#btnResetCamera');
  await waitForCamera(page, await expectedCamera(page, 'home'), description);
  const selection = await page.evaluate(() => ({
    cards: [...document.querySelectorAll('.agent-card[aria-pressed="true"]')].map(
      (card) => card.id
    ),
    workstation: document.querySelector('#scene canvas').dataset.selectedWorkstation || ''
  }));
  assert.deepEqual(
    selection,
    { cards: [], workstation: '' },
    `${description}: reset clears selections`
  );
}

async function focusDesk(page, roleKey, description, touch = false) {
  await page.$eval('#scene', (element) => element.scrollIntoView({ block: 'center' }));
  const point = await page.evaluate((key) => {
    const rect = document.querySelector('#scene canvas').getBoundingClientRect();
    const ndc = window.__workstations[key].hitTarget
      .getWorldPosition(new window.__THREE.Vector3())
      .project(window.__camera);
    return {
      x: rect.left + ((ndc.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - ndc.y) / 2) * rect.height,
      inFrustum: Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && Math.abs(ndc.z) <= 1
    };
  }, roleKey);
  assert.equal(point.inFrustum, true, `${description}: real desk hit target is on-screen`);
  if (touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
  await waitForCamera(page, await expectedCamera(page, 'workstation', roleKey), description);
  assert.equal(
    await page.$eval('#scene canvas', (canvas) => canvas.dataset.selectedWorkstation),
    roleKey,
    `${description}: pointer selects actual workstation`
  );
  await assertFocusedLabel(page, roleKey, description);
}

async function resize(page, viewport, description) {
  await page.setViewport(viewport);
  await page.waitForFunction(
    ({ width, height }) => {
      const host = document.getElementById('scene');
      const canvas = document.querySelector('#scene canvas');
      return (
        innerWidth === width &&
        innerHeight === height &&
        devicePixelRatio === 1 &&
        window.__renderer.getPixelRatio() === 1 &&
        Number(canvas.dataset.pixelRatio) === 1 &&
        canvas.width === host.clientWidth &&
        canvas.height === host.clientHeight &&
        Math.abs(window.__camera.aspect - host.clientWidth / host.clientHeight) < 0.001
      );
    },
    { timeout: 10000 },
    viewport
  );
  console.log(`PASS ${description}: committed viewport, buffer, DPR and camera aspect`);
}

async function capture(page, name) {
  const stage = await page.$('.office-stage');
  await stage.screenshot({ path: `artifacts/screenshots/t02-${name}.png` });
}

async function captureSide(page, roleKey, name) {
  const visibility = await page.evaluate((key) => {
    const previous = [];
    for (const [otherKey, entity] of Object.entries(window.__characters)) {
      if (otherKey === key) continue;
      previous.push({ kind: 'character', key: otherKey, visible: entity.root.visible });
      entity.root.visible = false;
    }
    for (const [otherKey, workstation] of Object.entries(window.__workstations)) {
      if (otherKey === key) continue;
      previous.push({ kind: 'workstation', key: otherKey, visible: workstation.group.visible });
      workstation.group.visible = false;
    }
    return previous;
  }, roleKey);
  const panelsHidden = await page.$eval('.workspace', (workspace) =>
    workspace.classList.contains('panels-hidden')
  );
  if (!panelsHidden) await page.click('#btnToggleSidebars');
  const previousLimit = await page.evaluate(() => window.__controls.maxAzimuthAngle);
  const view = await page.evaluate((key) => {
    const position = window.__characters[key].root.getWorldPosition(new window.__THREE.Vector3());
    const target = position.clone().add(new window.__THREE.Vector3(0, 0.9, 0));
    const cameraPosition = target.clone().add(new window.__THREE.Vector3(4.4, 1.25, 0.25));
    window.__controls.maxAzimuthAngle = Math.PI / 2;
    document.getElementById('t02-fixture-note').textContent =
      'Fixture T02: pose terisolasi, kamera diagnostik, bukan aktivitas live';
    window.__setCameraView(cameraPosition, target);
    return { position: cameraPosition.toArray(), target: target.toArray() };
  }, roleKey);
  try {
    await waitForCamera(page, view, `${name}: diagnostic side view`);
    await capture(page, name);
  } finally {
    await page.evaluate((previous) => {
      for (const item of previous) {
        const object =
          item.kind === 'character'
            ? window.__characters[item.key].root
            : window.__workstations[item.key].group;
        object.visible = item.visible;
      }
    }, visibility);
    if (!panelsHidden) await page.click('#btnToggleSidebars');
    await page.evaluate((limit) => {
      window.__controls.maxAzimuthAngle = limit;
      document.getElementById('t02-fixture-note').textContent =
        'Fixture T02: pengujian pose, bukan aktivitas live';
    }, previousLimit);
    await resetCamera(page, `${name}: restore canonical camera and orbit limits`);
  }
}

async function assertReducedMotionStable(page, description) {
  const before = await readPoses(page);
  const observedAt = await page.evaluate(() => performance.now());
  await page.waitForFunction(
    (start) => performance.now() - start > 600,
    { timeout: 10000 },
    observedAt
  );
  const after = await readPoses(page);
  assert.deepEqual(
    after,
    before,
    `${description}: reduced-motion pose transforms stay deterministic`
  );
}

async function manualOrbit(page) {
  const before = await readCamera(page);
  await page.evaluate(() => {
    window.__t02ControlStarts = 0;
    window.__controls.addEventListener('start', () => {
      window.__t02ControlStarts++;
    });
  });
  const rect = await page.$eval('#scene canvas', (canvas) => {
    const bounds = canvas.getBoundingClientRect();
    return { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height };
  });
  const x = rect.x + rect.width * 0.8;
  const y = rect.y + rect.height * 0.72;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 40, y - 10, { steps: 6 });
  await page.mouse.up();
  assert.ok(
    (await page.evaluate(() => window.__t02ControlStarts)) > 0,
    'real drag emits OrbitControls.start'
  );
  const actual = await readCamera(page);
  assert.ok(
    Math.hypot(...actual.position.map((value, index) => value - before.position[index])) > 0.1,
    'real manual orbit changes camera position'
  );
  const selection = await page.evaluate(() => ({
    cards: [...document.querySelectorAll('.agent-card[aria-pressed="true"]')].map(
      (card) => card.id
    ),
    workstation: document.querySelector('#scene canvas').dataset.selectedWorkstation || ''
  }));
  assert.deepEqual(selection, { cards: [], workstation: '' }, 'manual orbit clears selection');
  return actual;
}

await mkdir('artifacts/screenshots', { recursive: true });
const browser = await puppeteer.launch({
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--enable-unsafe-swiftshader'
  ]
});

try {
  const working = allStates('bekerja');
  const idle = allStates('siaga');
  const fixture = await createFixturePage(browser);
  const { page } = fixture;
  try {
    await assertPoses(page, working, 'all working');
    await assertReducedMotionStable(page, 'all working');
    await waitForCamera(page, await expectedCamera(page, 'home'), 'initial home');
    await capture(page, 'desktop-overview');
    await focusCard(page, subject, 'working card focus', 'Enter');
    await focusCard(page, 'hq_lab_director', 'HQ standing card focus');
    await capture(page, 'hq');
    await resetCamera(page, 'HQ reset');

    await focusCard(page, subject, 'working card before idle');
    const deskCardView = await readCamera(page);
    await fixture.setStates(idle, 'working to idle seat transition');
    await assertPoses(page, idle, 'all idle');
    await waitForCamera(page, deskCardView, 'focused card stays at original workstation');
    await assertFocusedLabel(page, subject, 'off-frustum sofa label hidden', { outside: true });
    const idleCardView = await readCamera(page);
    assertVector(idleCardView.position, deskCardView.position, 'idle card camera stays at desk');
    assertVector(idleCardView.target, deskCardView.target, 'idle card target stays at desk');
    await assertReducedMotionStable(page, 'all idle');
    await resize(page, resized, 'desk-card mode resize');
    await waitForCamera(
      page,
      await expectedCamera(page, 'card'),
      'resize retains original workstation focus'
    );
    await assertFocusedLabel(page, subject, 'sofa label hidden after resize', { outside: true });
    await resize(page, desktop, 'desk-card mode restore viewport');
    await waitForCamera(
      page,
      await expectedCamera(page, 'card'),
      'restore retains original workstation focus'
    );
    await focusCard(page, subject, 'idle card Space activation', 'Space');
    await resetCamera(page, 'reset before empty desk click');
    await focusDesk(page, subject, 'mouse focuses empty desk');
    const workstationView = await expectedCamera(page, 'workstation');
    assertVector(workstationView.position, idleCardView.position, 'desk and card camera agree');
    assertVector(workstationView.target, idleCardView.target, 'desk and card targets agree');
    await assertFocusedLabel(page, subject, 'off-frustum sofa label hidden while desk is focused', {
      outside: true
    });
    await resize(page, resized, 'workstation mode resize');
    await waitForCamera(
      page,
      await expectedCamera(page, 'workstation'),
      'resize retains empty workstation focus'
    );
    await resize(page, desktop, 'workstation mode restore viewport');
    await waitForCamera(
      page,
      await expectedCamera(page, 'workstation'),
      'restore retains workstation focus'
    );
    await fixture.setStates(working, 'idle to working while workstation focused');
    await waitForCamera(
      page,
      workstationView,
      'workstation camera is not retargeted by arriving character'
    );
    await fixture.setStates(idle, 'working to idle while workstation focused');
    await waitForCamera(
      page,
      workstationView,
      'workstation camera is not retargeted by departing character'
    );
    await resetCamera(page, 'reset before touch desk click');
    await focusDesk(page, subject, 'touch focuses same empty desk', true);
    await resetCamera(page, 'reset before manual orbit');
    await focusCard(page, subject, 'sofa card before manual orbit');
    const manual = await manualOrbit(page);
    await fixture.setStates(working, 'seat transition after manual orbit');
    await waitForCamera(page, manual, 'state-driven seat movement does not reclaim manual orbit');
    await resize(page, resized, 'manual orbit resize');
    await waitForCamera(page, manual, 'resize preserves manual camera position and target');
    await fixture.setStates(idle, 'idle transition after manual resize');
    await waitForCamera(page, manual, 'second state transition still preserves manual orbit');
    await resize(page, desktop, 'manual orbit restore viewport');
    await waitForCamera(page, manual, 'restoring viewport preserves manual orbit');
    await resetCamera(page, 'Escape restores home after manual orbit', 'Escape');
    await focusCard(page, subject, 'card re-enables workstation focus after manual orbit');

    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await focusCard(page, subject, 'animated sofa card focus');
    await fixture.setStates(working, 'animated focused seat transition');
    await waitForCamera(
      page,
      await expectedCamera(page, 'card'),
      'animated seat transition keeps camera at the original desk'
    );
    await assertFocusedLabel(page, subject, 'animated return keeps the desk card selected');
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await resetCamera(page, 'final home reset');
    await captureSide(page, subject, 'desk-side');
    await fixture.setStates(idle, 'diagnostic sofa capture state');
    await assertPoses(page, idle, 'diagnostic capture allocation remains valid');
    await captureSide(page, subject, 'sofa-side');
    assert.deepEqual(
      fixture.failures,
      [],
      'normal fixture has no console, page, request or mutation failures'
    );
    console.log(
      'PASS T02 fixture: four desk poses, two deterministic sofa seats, HQ standing, keyboard contact, feet/furniture surfaces, reduced motion, card/desk focus, resize, transitions and manual orbit'
    );
  } finally {
    await page.close();
  }

  const fallback = await createFixturePage(browser, { failSeatingAssets: true });
  try {
    assert.deepEqual(
      [...fallback.aborted].sort(),
      [...blockedAssets].sort(),
      'only chair and sofa model requests intentionally aborted'
    );
    const counts = await fallback.page.evaluate(() => {
      const found = { chairs: 0, sofas: 0 };
      window.__scene.traverse((object) => {
        if (object.name === 'fallback_task_chair') found.chairs++;
        if (object.name === 'fallback_sofa') found.sofas++;
      });
      return found;
    });
    assert.deepEqual(
      counts,
      { chairs: 7, sofas: 1 },
      'all four desk chairs, three meeting chairs and sofa retain geometry fallback'
    );
    await assertPoses(fallback.page, working, 'asset fallback working', { fallback: true });
    await fallback.setStates(idle, 'asset fallback idle seats');
    await assertPoses(fallback.page, idle, 'asset fallback idle', { fallback: true });
    await assertReducedMotionStable(fallback.page, 'asset fallback idle');
    await waitForCamera(
      fallback.page,
      await expectedCamera(fallback.page, 'home'),
      'asset fallback home'
    );
    await capture(fallback.page, 'asset-fallback');
    assert.ok(
      fallback.expectedFailures.some((message) => message.includes('task-chair.glb')),
      'chair failure is explicitly recorded'
    );
    assert.ok(
      fallback.expectedFailures.some((message) => message.includes('sofa-3seat.glb')),
      'sofa failure is explicitly recorded'
    );
    assert.ok(
      fallback.warnings.some((message) => message.includes('task-chair.glb')),
      'chair fallback reports the explained loader warning'
    );
    assert.ok(
      fallback.warnings.some((message) => message.includes('sofa-3seat.glb')),
      'sofa fallback reports the explained loader warning'
    );
    assert.deepEqual(
      fallback.failures,
      [],
      'asset fallback has no unexplained console, page, request or mutation failures'
    );
    console.log(
      'PASS T02 asset fallback: intentional chair/sofa failures recorded; seating geometry, floor/cushion contact and all five role cards preserved'
    );
  } finally {
    await fallback.page.close();
  }
} finally {
  await browser.close();
}
