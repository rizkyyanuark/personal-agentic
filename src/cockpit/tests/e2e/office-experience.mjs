import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import puppeteer from 'puppeteer';
import { OFFICE_ROLES, isPublicLabState } from '../../src/shared/office-contract.js';
import {
  DESK_CONFIGS,
  FURNITURE_LAYOUT,
  ROOM_LAYOUT
} from '../../src/client/scene/office-layout.js';
import { getHomeCameraView, getTVCameraView } from '../../src/client/scene/camera-views.js';
import { WORK_SCHEMATICS } from '../../src/client/scene/workstation-screens.js';

const origin = process.env.COCKPIT_URL || 'http://127.0.0.1:8095';
const viewports = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'mobile-320', width: 320, height: 760 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1024', width: 1024, height: 768 }
];
const deskKeys = DESK_CONFIGS.map(({ key }) => key);
const roleKeys = OFFICE_ROLES.map(({ key }) => key);
const fallbackPaths = new Set([
  '/assets/models/office-floor-plant.glb',
  '/assets/models/bookshelf.glb'
]);
const cameraTolerance = 0.03;
const apiTimestamp = '2001-01-01T00:00:00.000Z';
const propKinds = {
  data_engineer: ['notebook'],
  data_scientist: ['book', 'diagram-card'],
  research_scientist: ['papers', 'bookmark'],
  ml_engineer: ['headphones']
};

function fixtureState(agentState) {
  const state = {
    connection: 'live',
    now: apiTimestamp,
    totals: { tasks: 23, completed: 7, events: 0 },
    queue: { queued: 5, running: 6, waiting_approval: 2, failed: 1, stale: 2 },
    agents: Object.fromEntries(
      roleKeys.map((key) => [
        key,
        {
          state: key === 'hq_lab_director' ? 'siaga' : agentState,
          task: `Fixture T03–T07, bukan aktivitas live: ${agentState}`
        }
      ])
    ),
    feed: []
  };
  assert.equal(isPublicLabState(state), true, 'fixture follows the sanitized public contract');
  assert.deepEqual(Object.keys(state).sort(), [
    'agents',
    'connection',
    'feed',
    'now',
    'queue',
    'totals'
  ]);
  for (const agent of Object.values(state.agents))
    assert.deepEqual(Object.keys(agent).sort(), ['state', 'task']);
  return state;
}

function projectionErrorState() {
  const state = fixtureState('siaga');
  return {
    ...state,
    connection: 'error',
    totals: { tasks: 0, completed: 0, events: 0 },
    queue: { queued: 0, running: 0, waiting_approval: 0, failed: 0, stale: 0 },
    agents: Object.fromEntries(
      roleKeys.map((key) => [key, { state: 'siaga', task: 'Belum ada tugas tercatat' }])
    )
  };
}

function near(actual, expected, description, tolerance = 0.001) {
  assert.ok(Number.isFinite(actual), `${description}: finite value`);
  assert.ok(Math.abs(actual - expected) < tolerance, `${description}: ${actual} != ${expected}`);
}

function vector(actual, expected, description) {
  assert.equal(actual.length, expected.length, description);
  actual.forEach((value, index) =>
    near(value, expected[index], `${description} ${index}`, cameraTolerance)
  );
}

async function cameraView(page, kind) {
  const { aspect, fov } = await page.evaluate(() => ({
    aspect: window.__camera.aspect,
    fov: window.__camera.fov
  }));
  const view = kind === 'tv' ? getTVCameraView(aspect, fov) : getHomeCameraView(aspect, fov);
  return { position: view.position.toArray(), target: view.target.toArray() };
}

async function assertCamera(page, kind, description) {
  const expected = await cameraView(page, kind);
  await page.waitForFunction(
    ({ position, target, tolerance }) => {
      const camera = window.__camera;
      const controls = window.__controls;
      return (
        camera &&
        controls &&
        camera.position
          .toArray()
          .every((value, index) => Math.abs(value - position[index]) < tolerance) &&
        controls.target
          .toArray()
          .every((value, index) => Math.abs(value - target[index]) < tolerance)
      );
    },
    { timeout: 10000 },
    { ...expected, tolerance: cameraTolerance }
  );
  const actual = await page.evaluate(() => ({
    position: window.__camera.position.toArray(),
    target: window.__controls.target.toArray()
  }));
  vector(actual.position, expected.position, `${description}: actual position`);
  vector(actual.target, expected.target, `${description}: actual target`);
}

async function reset(page, description) {
  await page.click('#btnResetCamera');
  await assertCamera(page, 'home', description);
  const selection = await page.evaluate(() => ({
    tv: document.getElementById('btnFocusTV').getAttribute('aria-pressed'),
    cards: [...document.querySelectorAll('.agent-card[aria-pressed="true"]')].map(
      (card) => card.id
    ),
    desk: document.querySelector('#scene canvas').dataset.selectedWorkstation || ''
  }));
  assert.deepEqual(
    selection,
    { tv: 'false', cards: [], desk: '' },
    `${description}: all selections cleared`
  );
}

async function createFixturePage(browser, failAssets = false) {
  const page = await browser.newPage();
  const failures = [];
  const expectedFailures = [];
  const aborted = new Set();
  let agentState = 'bekerja';
  let offline = false;
  let projectionError = false;
  await page.setViewport({ ...viewports[0], deviceScaleFactor: 1, hasTouch: true });
  await page.emulateTimezone('Etc/UTC');
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.evaluateOnNewDocument(() => {
    const prototype = CanvasRenderingContext2D.prototype;
    const fillRect = prototype.fillRect;
    const fillText = prototype.fillText;
    prototype.fillRect = function (x, y, width, height) {
      if (x === 0 && y === 0 && width === this.canvas.width && height === this.canvas.height)
        this.canvas.__v2Text = [];
      return fillRect.apply(this, arguments);
    };
    prototype.fillText = function (text, x, y) {
      const calls = this.canvas.__v2Text || (this.canvas.__v2Text = []);
      if (calls.length < 100) calls.push({ text: String(text), x, y });
      return fillText.apply(this, arguments);
    };
  });
  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    try {
      if (request.isInterceptResolutionHandled()) return;
      const path = new URL(request.url()).pathname;
      if (request.method() !== 'GET') {
        failures.push(`unexpected mutation: ${request.method()} ${path}`);
        await request.abort('blockedbyclient');
      } else if (path === '/api/state') {
        if (offline) {
          aborted.add(path);
          await request.abort('internetdisconnected');
        } else {
          await request.respond({
            status: projectionError ? 503 : 200,
            contentType: 'application/json',
            headers: { 'Cache-Control': 'no-store' },
            body: JSON.stringify(
              projectionError ? projectionErrorState() : fixtureState(agentState)
            )
          });
        }
      } else if (failAssets && fallbackPaths.has(path)) {
        aborted.add(path);
        await request.abort('failed');
      } else await request.continue();
    } catch (error) {
      failures.push(`interception: ${error.message}`);
    }
  });
  function expectedNetworkFailure(path, text) {
    return (
      (aborted.has('/api/state') &&
        path === '/api/state' &&
        text === 'net::ERR_INTERNET_DISCONNECTED') ||
      (failAssets && fallbackPaths.has(path) && text === 'net::ERR_FAILED')
    );
  }
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => {
    const path = new URL(request.url()).pathname;
    const text = request.failure()?.errorText || '';
    (expectedNetworkFailure(path, text) ? expectedFailures : failures).push(
      `request: ${path} ${text}`
    );
  });
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const path = new URL(message.location().url || origin, origin).pathname;
    const networkText = message.text().replace(/^Failed to load resource: /, '');
    const expectedHttpError =
      projectionError &&
      path === '/api/state' &&
      /^Failed to load resource: the server responded with a status of 503/.test(message.text());
    (expectedNetworkFailure(path, networkText) || expectedHttpError
      ? expectedFailures
      : failures
    ).push(`console: ${path} ${message.text()}`);
  });
  const response = await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 30000 });
  assert.equal(response?.status(), 200, 'office fixture HTTP status');
  try {
    await page.waitForFunction(
      () =>
        window.__virtualOfficeReady === true &&
        window.__renderer &&
        Object.keys(window.__workstations || {}).length === 4 &&
        Object.keys(window.__characters || {}).length === 5,
      { timeout: 45000 }
    );
    await page.waitForFunction(
      (keys) =>
        keys.every((key) => {
          const keyboard = window.__workstations[key].group.getObjectByName(`keyboard_${key}`);
          const mouse = window.__workstations[key].group.getObjectByName(`mouse_${key}`);
          return keyboard?.children.length > 0 && mouse?.children.length > 0;
        }),
      { timeout: 45000 },
      deskKeys
    );
    if (!failAssets)
      await page.waitForFunction(
        () =>
          !window.__scene.getObjectByName('fallback_floor_plant') &&
          !window.__scene.getObjectByName('fallback_bookshelf'),
        { timeout: 45000 }
      );
  } catch (error) {
    console.error('V2 startup diagnostics', {
      failures,
      actual: await page.evaluate(() => ({
        ready: window.__virtualOfficeReady,
        renderer: Boolean(window.__renderer),
        desks: Object.keys(window.__workstations || {}),
        fallback: !document.getElementById('sceneFallback').hidden
      }))
    });
    throw error;
  }
  await page.$eval(
    '.office-stage',
    (stage, fallback) => {
      const note = document.createElement('p');
      note.textContent = fallback
        ? 'Fixture T03–T07: fallback aset; bukan aktivitas live'
        : 'Fixture T03–T07: pengujian kantor; bukan aktivitas live';
      note.id = 'v2-fixture-note';
      Object.assign(note.style, {
        position: 'absolute',
        right: '8px',
        top: '8px',
        zIndex: '20',
        maxWidth: 'calc(100% - 16px)',
        margin: '0',
        padding: '5px 8px',
        background: '#1f2937',
        color: '#ffffff',
        font: '12px sans-serif',
        pointerEvents: 'none'
      });
      stage.appendChild(note);
    },
    failAssets
  );
  await page.waitForFunction(
    (keys) =>
      keys.every(
        (key) =>
          window.__characters[key].state === 'bekerja' &&
          window.__characters[key].seat.kind === 'desk'
      ) && window.__tvScreen.mode === 'catalog',
    { timeout: 10000 },
    deskKeys
  );
  return {
    page,
    failures,
    expectedFailures,
    aborted,
    async setAgentState(next) {
      fixtureState(next);
      agentState = next;
      await page.waitForResponse(
        async (response) => {
          if (new URL(response.url()).pathname !== '/api/state' || response.status() !== 200)
            return false;
          const state = await response.json();
          return state.agents?.data_engineer?.state === next;
        },
        { timeout: 30000 }
      );
      try {
        await page.waitForFunction(
          ({ keys, state }) =>
            keys.every(
              (key) =>
                window.__characters[key].state === state &&
                window.__workstations[key].screens.work.userData.stateLabel ===
                  (state === 'bekerja' ? 'Bekerja' : 'Siaga')
            ),
          { polling: 100, timeout: 10000 },
          { keys: deskKeys, state: next }
        );
      } catch (error) {
        console.error('V2 state transition diagnostics', {
          next,
          actual: await page.evaluate(
            (keys) => ({
              hidden: document.hidden,
              connection: document.getElementById('liveDot').dataset.connection,
              frame: window.__renderer.info.render.frame,
              agents: keys.map((key) => ({
                key,
                character: window.__characters[key].state,
                screen: window.__workstations[key].screens.work.userData.stateLabel
              }))
            }),
            deskKeys
          ),
          failures
        });
        throw error;
      }
    },
    async failProjection() {
      projectionError = true;
      const response = await page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/state' && response.status() === 503,
        { timeout: 30000 }
      );
      assert.equal((await response.json()).connection, 'error');
      await page.waitForFunction(
        () =>
          document.getElementById('liveDot').dataset.connection === 'error' &&
          Object.values(window.__workstations).every(
            ({ screens }) => screens.work.userData.connection === 'error'
          ),
        { timeout: 10000 }
      );
    },
    async disconnect() {
      offline = true;
      await page.waitForFunction(
        (keys) =>
          keys.every(
            (key) => window.__workstations[key].screens.clock.userData.connection === 'offline'
          ) && document.getElementById('liveDot').dataset.connection === 'offline',
        { timeout: 10000 },
        deskKeys
      );
    }
  };
}

async function assertIdentities(page) {
  const actual = await page.evaluate((keys) => {
    const color = (value) => `#${value.getHexString()}`;
    const texts = (texture) => texture.image.__v2Text || [];
    return {
      cards: [...document.querySelectorAll('.agent-card')].map((card) => ({
        key: card.id.slice(5),
        name: card.querySelector('.agent-character-name').textContent,
        job: card.querySelector('.agent-role').textContent,
        color: color(
          new window.__THREE.Color(
            getComputedStyle(card.querySelector('.agent-avatar')).backgroundColor
          )
        )
      })),
      characters: Object.entries(window.__characters).map(([key, entity]) => ({
        key,
        name: entity.cfg.name,
        color: color(
          entity.hips.children.find((child) => child.geometry?.type === 'CapsuleGeometry').material
            .color
        )
      })),
      desks: keys.map((key) => {
        const desk = window.__workstations[key];
        const mug = desk.group.getObjectByName(`mug_${key}`);
        const plate = desk.group.getObjectByName(`nameplate_${key}`);
        const props = desk.group.getObjectByName(`desk_props_${key}`);
        return {
          key,
          name: desk.group.userData.agentName,
          job: desk.group.userData.job,
          mugColor: color(mug.children[0].material.color),
          mugHandleColor: color(mug.children[1].material.color),
          plate: plate.material.map.userData,
          plateText: texts(plate.material.map),
          propKinds: props.userData.propKinds,
          propObjects: props.children.length,
          monitorCount: desk.group.children.filter((child) => child.name.startsWith('monitor_'))
            .length,
          clockSize: [desk.screens.clock.image.width, desk.screens.clock.image.height],
          workSize: [desk.screens.work.image.width, desk.screens.work.image.height],
          work: desk.screens.work.userData,
          workText: texts(desk.screens.work).map(({ text }) => text),
          clockText: texts(desk.screens.clock).map(({ text }) => text),
          clockPixel: Array.from(
            desk.screens.clock.image.getContext('2d').getImageData(0, 0, 1, 1).data
          ),
          colorSpace: desk.screens.clock.colorSpace,
          workColorSpace: desk.screens.work.colorSpace,
          hasGlow: desk.group.children.some(
            (child) => child.isPointLight || child.material?.isShaderMaterial
          )
        };
      }),
      hqDesk: Boolean(window.__workstations.hq_lab_director),
      concepts: [...document.querySelectorAll('#schematicList li')].map((item) => item.textContent)
    };
  }, deskKeys);
  assert.deepEqual(
    actual.cards.map(({ name }) => name),
    ['Orion', 'Nova', 'Atlas', 'Lyra', 'Axiom'],
    'all five canonical names'
  );
  assert.equal(actual.hqDesk, false, 'Orion has no desk');
  for (const role of OFFICE_ROLES) {
    const card = actual.cards.find(({ key }) => key === role.key);
    const character = actual.characters.find(({ key }) => key === role.key);
    assert.equal(card.name, role.name, `${role.key}: card name`);
    assert.equal(
      card.job,
      role.role + (role.slug === 'hq' ? ' · HQ' : ''),
      `${role.key}: card job`
    );
    assert.equal(card.color, role.color, `${role.key}: actual card color`);
    assert.equal(character.name, role.name, `${role.key}: character identity`);
    assert.equal(character.color, role.color, `${role.key}: actual shirt color`);
    if (role.key === 'hq_lab_director') continue;
    const desk = actual.desks.find(({ key }) => key === role.key);
    assert.equal(desk.name, role.name);
    assert.equal(desk.job, role.role);
    assert.equal(desk.mugColor, role.color, `${role.key}: mug body color`);
    assert.equal(desk.mugHandleColor, role.color, `${role.key}: mug handle color`);
    assert.deepEqual(desk.plate, { roleKey: role.key, name: role.name, job: role.role });
    assert.deepEqual(
      desk.plateText.map(({ text }) => text),
      [role.name, role.role],
      `${role.key}: actual two-line nameplate text`
    );
    assert.ok(desk.plateText[0].y < desk.plateText[1].y, `${role.key}: name above job`);
    assert.deepEqual(desk.propKinds, propKinds[role.key]);
    assert.ok(desk.propObjects > 0, `${role.key}: props exist in scene`);
    if (role.key === 'data_engineer' || role.key === 'ml_engineer') {
      assert.equal(desk.propObjects, 1, `${role.key}: no physical mini-server or mini-compute`);
    }
    assert.equal(desk.monitorCount, 2, `${role.key}: two monitors`);
    assert.deepEqual(desk.clockSize, [768, 480]);
    assert.deepEqual(desk.workSize, [768, 480]);
    assert.equal(desk.colorSpace, 'srgb');
    assert.equal(desk.workColorSpace, 'srgb');
    assert.equal(desk.work.concept, WORK_SCHEMATICS[role.key].title);
    assert.equal(desk.work.illustrative, true);
    assert.ok(
      desk.workText.includes('Tampilan ilustratif'),
      `${role.key}: actual illustration disclaimer`
    );
    assert.ok(desk.workText.includes(WORK_SCHEMATICS[role.key].title));
    assert.ok(desk.clockText.includes(role.name));
    assert.equal(desk.hasGlow, false, `${role.key}: no arbitrary light/shader pulse`);
    assert.ok(
      actual.concepts.some(
        (text) => text.includes(role.name) && text.includes(WORK_SCHEMATICS[role.key].description)
      ),
      `${role.key}: accessible schematic description`
    );
  }
  assert.equal(
    new Set(actual.desks.map(({ clockPixel }) => clockPixel.join(','))).size,
    4,
    'four distinct role-gradient wallpapers'
  );
  assert.equal(actual.concepts.length, 4, 'four accessible illustrations, no HQ screen');
}

async function assertClock(page, description) {
  await page.waitForFunction(
    (keys) => {
      const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
      });
      const candidates = [
        formatter.format(new Date()),
        formatter.format(new Date(Date.now() - 1000))
      ];
      const text = window.__room.getObjectByName('office_clock').userData.timeText;
      return (
        candidates.includes(text) &&
        keys.every((key) => window.__workstations[key].screens.clock.userData.timeText === text) &&
        document.getElementById('officeTime').textContent === `${text} WIB`
      );
    },
    { timeout: 10000 },
    deskKeys
  );
  const actual = await page.evaluate((keys) => {
    const clock = window.__room.getObjectByName('office_clock');
    const text = clock.userData.timeText;
    const hour = Number(text.split(':')[0]);
    const minute = Number(text.split(':')[1]);
    const secondAngle = clock.getObjectByName('clock_second_hand').rotation.z;
    const second = (-secondAngle * 60) / (Math.PI * 2);
    return {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      text,
      hour,
      minute,
      second,
      secondAngle,
      hourAngle: clock.getObjectByName('clock_hour_hand').rotation.z,
      minuteAngle: clock.getObjectByName('clock_minute_hand').rotation.z,
      screens: keys.map((key) => window.__workstations[key].screens.clock.userData),
      dom: document.getElementById('officeTime').textContent,
      dayPeriod: window.__room.userData.dayPeriod,
      lightIntensities: window.__room.children
        .filter((child) => child.isLight)
        .map((light) => light.intensity),
      faceText: clock.children
        .find((child) => child.material?.map)
        ?.material.map.image.__v2Text?.map(({ text: value }) => value)
    };
  }, deskKeys);
  assert.equal(actual.timezone, 'UTC', `${description}: browser timezone deliberately UTC`);
  assert.equal(actual.dom, `${actual.text} WIB`);
  near(
    actual.second,
    Math.round(actual.second),
    `${description}: second hand discrete ticks`,
    0.000001
  );
  near(
    actual.hourAngle,
    -Math.PI * 2 * (((actual.hour % 12) + actual.minute / 60) / 12),
    `${description}: analog hour`
  );
  near(
    actual.minuteAngle,
    -Math.PI * 2 * ((actual.minute + actual.second / 60) / 60),
    `${description}: analog minute`
  );
  assert.ok(actual.faceText.includes('WIB'), `${description}: actual WIB clock-face text`);
  assert.equal(actual.dayPeriod, actual.hour >= 6 && actual.hour < 18 ? 'day' : 'night');
  for (const screen of actual.screens) {
    assert.equal(screen.timeText, actual.text);
    assert.ok(
      screen.dateText.includes(
        new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', year: 'numeric' }).format(
          new Date()
        )
      ),
      `${description}: device date, not 2001 API date`
    );
  }
  assert.deepEqual(
    actual.lightIntensities,
    [1.15, 1.65],
    `${description}: interior illumination does not dim with window time`
  );
  return actual;
}

async function assertClockTick(page, description) {
  const before = await assertClock(page, description);
  await page.waitForFunction(
    (angle) => window.__room.getObjectByName('clock_second_hand').rotation.z !== angle,
    { timeout: 10000 },
    before.secondAngle
  );
  const after = await assertClock(page, `${description}: next tick`);
  assert.notEqual(
    after.secondAngle,
    before.secondAngle,
    `${description}: live device seconds advance`
  );
}

async function assertBoard(page, offline = false) {
  const actual = await page.evaluate(() => ({
    board: window.__room.getObjectByName('task_board').userData.board,
    dom: [...document.querySelectorAll('.board-summary-row')].map((row) => ({
      key: row.dataset.stage,
      value: row.querySelector('dd').textContent
    })),
    mapping: document.querySelector('.board-mapping').textContent
  }));
  assert.deepEqual(
    actual.board.columns.map(({ key, value }) => ({ key, value })),
    [
      { key: 'planning', value: null },
      { key: 'running', value: offline ? null : 6 },
      { key: 'completed', value: offline ? null : 7 }
    ],
    'three columns: planning unavailable; running/completed from explicit source counts'
  );
  assert.deepEqual(
    actual.dom.map(({ key }) => key),
    ['planning', 'running', 'completed'],
    'DOM exposes exactly the three approved task-board columns'
  );
  assert.deepEqual(
    actual.board.attention.map(({ key, value }) => ({ key, value })),
    [
      { key: 'queued', value: offline ? null : 5 },
      { key: 'waiting_approval', value: offline ? null : 2 },
      { key: 'failed', value: offline ? null : 1 },
      { key: 'stale', value: offline ? null : 2 }
    ],
    'footer source counts, without promoting queued to planning'
  );
  for (const column of actual.board.columns)
    assert.equal(
      actual.dom.find(({ key }) => key === column.key).value,
      column.value === null ? 'Belum tersedia' : String(column.value)
    );
  assert.match(actual.mapping, /Rencana bukan antrean/);
  assert.equal(actual.board.updatedAt, offline ? null : apiTimestamp);
}

async function assertPlacements(page, fallbacks = false) {
  const actual = await page.evaluate(
    (zones) => {
      const scene = window.__scene;
      const pantry = scene.getObjectByName('zone_pantry');
      const bounds = new window.__THREE.Box3().setFromObject(pantry);
      const names = [
        'pantry_cabinet',
        'pantry_countertop',
        'pantry_coffee_machine',
        'pantry_coffee_grinder',
        'pantry_mug_shelf',
        'pantry_dispenser'
      ];
      return {
        pantry: {
          minimum: bounds.min.toArray(),
          heading: pantry.rotation.y,
          front: pantry.userData.front,
          components: names.map((name) => Boolean(pantry.getObjectByName(name))),
          mugs: pantry.children.filter(
            (child) => child.isGroup && child.name.startsWith('pantry_mug_')
          ).length
        },
        plants: zones.map((zone) => {
          const plant = scene.getObjectByName(`plant_${zone}`);
          const fallback = plant.getObjectByName('fallback_floor_plant');
          let meshCount = 0;
          (fallback || plant).traverse((child) => {
            if (child.isMesh) meshCount++;
          });
          return {
            zone,
            position: plant.position.toArray(),
            scale: plant.scale.toArray(),
            fallback: Boolean(fallback),
            meshes: meshCount,
            ground: fallback ? new window.__THREE.Box3().setFromObject(fallback).min.y : null
          };
        }),
        plantCount: scene.children
          .flatMap((group) => group.children)
          .filter((child) => child.name.startsWith('plant_')).length,
        bookshelf: Boolean(
          scene.getObjectByName('zone_bookshelf').getObjectByName('fallback_bookshelf')
        )
      };
    },
    FURNITURE_LAYOUT.plants.map(({ zone }) => zone)
  );
  near(
    actual.pantry.minimum[2] - (ROOM_LAYOUT.min[2] + 0.09),
    0.03,
    'actual pantry rear envelope clears wall by 3 cm',
    0.00001
  );
  near(actual.pantry.heading, 0, 'pantry faces room');
  assert.equal(actual.pantry.front, '+Z');
  assert.deepEqual(actual.pantry.components, [true, true, true, true, true, true]);
  assert.equal(actual.pantry.mugs, 4);
  assert.equal(actual.plantCount, 3, 'exactly three floor plants');
  for (const expected of FURNITURE_LAYOUT.plants) {
    const plant = actual.plants.find(({ zone }) => zone === expected.zone);
    vector(
      plant.position,
      [expected.x, ROOM_LAYOUT.floorY, expected.z],
      `${expected.zone}: canonical plant position`
    );
    vector(
      plant.scale,
      [expected.scale, expected.scale, expected.scale],
      `${expected.zone}: scale`
    );
    assert.equal(plant.fallback, fallbacks, `${expected.zone}: asset/fallback outcome`);
    assert.equal(
      plant.meshes,
      fallbacks ? 10 : 2,
      `${expected.zone}: real merged asset plus contact shadow, or complete fallback plant`
    );
    if (fallbacks)
      near(plant.ground, ROOM_LAYOUT.floorY, `${expected.zone}: fallback pot grounded`);
  }
  assert.equal(actual.bookshelf, fallbacks, 'bookshelf survives failed GLB with geometry');
}

async function assertViewport(page, viewport, capture = true) {
  await page.setViewport({ ...viewport, deviceScaleFactor: 1, hasTouch: true });
  await page.waitForFunction(
    ({ width, height }) => {
      const host = document.getElementById('scene');
      return (
        innerWidth === width &&
        innerHeight === height &&
        Math.abs(window.__camera.aspect - host.clientWidth / host.clientHeight) < 0.001
      );
    },
    { timeout: 10000 },
    viewport
  );
  await reset(page, `${viewport.name}: home camera`);
  await page.evaluate(() => window.scrollTo(0, 0));
  const layout = await page.evaluate(() => {
    const controls = [...document.querySelectorAll('button')]
      .filter((button) => {
        const rect = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        return (
          !button.hidden &&
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        );
      })
      .map((button) => ({
        id: button.id,
        width: button.getBoundingClientRect().width,
        height: button.getBoundingClientRect().height
      }));
    const textOverflow = [];
    for (const button of document.querySelectorAll('.header-actions button')) {
      const bounds = button.getBoundingClientRect();
      const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const start = node.textContent.search(/\S/);
        if (start < 0) continue;
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, node.textContent.trimEnd().length);
        for (const rect of range.getClientRects())
          if (
            rect.left < bounds.left - 1 ||
            rect.right > bounds.right + 1 ||
            rect.top < bounds.top - 1 ||
            rect.bottom > bounds.bottom + 1
          )
            textOverflow.push(button.id);
      }
    }
    return {
      width: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      controls,
      textOverflow,
      contextLost: window.__renderer.getContext().isContextLost(),
      fixture: document.getElementById('v2-fixture-note').textContent
    };
  });
  assert.ok(
    layout.documentWidth <= layout.width + 1,
    `${viewport.name}: no document horizontal overflow`
  );
  assert.ok(layout.bodyWidth <= layout.width + 1, `${viewport.name}: no body horizontal overflow`);
  assert.equal(layout.contextLost, false, `${viewport.name}: WebGL context remains live`);
  assert.deepEqual(layout.textOverflow, [], `${viewport.name}: header text stays in buttons`);
  assert.match(layout.fixture, /bukan aktivitas live/);
  for (const control of layout.controls) {
    assert.ok(control.width >= 44, `${viewport.name}: ${control.id} minimum 44 px width`);
    assert.ok(control.height >= 44, `${viewport.name}: ${control.id} minimum 44 px height`);
  }
  if (capture)
    await page.screenshot({
      path: `artifacts/screenshots/v2-${viewport.name}.png`,
      fullPage: true
    });
  console.log(`PASS v2 ${viewport.name}: overview, controls, no overflow, canonical reset`);
}

async function assertTVFocus(page) {
  await page.focus('#btnFocusTV');
  await page.keyboard.press('Enter');
  await assertCamera(page, 'tv', 'TV Enter focus');
  assert.equal(
    await page.$eval('#btnFocusTV', (button) => button.getAttribute('aria-pressed')),
    'true'
  );
  await page.keyboard.press('Escape');
  await assertCamera(page, 'home', 'TV Escape reset');
  await page.click('#btnFocusTV');
  await assertCamera(page, 'tv', 'TV button click');
  const orbitStart = await page.$eval('#scene canvas', (canvas) => {
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await page.mouse.move(orbitStart.x, orbitStart.y);
  await page.mouse.down();
  await page.mouse.move(orbitStart.x + 38, orbitStart.y + 26, { steps: 3 });
  await page.mouse.up();
  const manualOrbitSelection = await page.evaluate(() => ({
    tv: document.getElementById('btnFocusTV').getAttribute('aria-pressed'),
    cards: document.querySelectorAll('.agent-card[aria-pressed="true"]').length,
    desk: document.querySelector('#scene canvas').dataset.selectedWorkstation || ''
  }));
  assert.deepEqual(
    manualOrbitSelection,
    { tv: 'false', cards: 0, desk: '' },
    'manual orbit clears camera preset and pressed selection'
  );
  await reset(page, 'TV button reset');
  for (const touch of [false, true]) {
    await page.$eval('#scene', (element) => element.scrollIntoView({ block: 'center' }));
    const point = await page.evaluate(() => {
      const canvas = document.querySelector('#scene canvas');
      const rect = canvas.getBoundingClientRect();
      const tv = window.__scene.getObjectByName('tv_screen');
      const world = tv.getWorldPosition(new window.__THREE.Vector3());
      const ndc = world.project(window.__camera);
      const raycaster = new window.__THREE.Raycaster();
      raycaster.setFromCamera(new window.__THREE.Vector2(ndc.x, ndc.y), window.__camera);
      const targets = [
        ...Object.values(window.__workstations).map(({ hitTarget }) => hitTarget),
        tv
      ];
      return {
        x: rect.left + ((ndc.x + 1) * rect.width) / 2,
        y: rect.top + ((1 - ndc.y) * rect.height) / 2,
        visible: Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1,
        nearest: raycaster.intersectObjects(targets, false)[0]?.object.userData.roleKey
      };
    });
    assert.equal(point.visible, true, 'TV real screen center inside home canvas');
    assert.equal(point.nearest, 'tv', 'TV nearest hit target prevents selecting a desk behind it');
    if (touch) await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.click(point.x, point.y);
    await assertCamera(page, 'tv', touch ? 'TV real touch focus' : 'TV real mouse focus');
    const selection = await page.evaluate(() => ({
      tv: document.getElementById('btnFocusTV').getAttribute('aria-pressed'),
      cards: document.querySelectorAll('.agent-card[aria-pressed="true"]').length,
      desk: document.querySelector('#scene canvas').dataset.selectedWorkstation || ''
    }));
    assert.deepEqual(selection, { tv: 'true', cards: 0, desk: '' });
    await reset(page, touch ? 'TV touch reset' : 'TV mouse reset');
  }
}

async function assertTVModes(fixture) {
  const { page } = fixture;
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await page.waitForFunction(
    (keys) => keys.every((key) => window.__workstations[key].screens.work.userData.animated),
    { timeout: 10000 },
    deskKeys
  );
  const workVersion = await page.evaluate(
    () => window.__workstations.data_engineer.screens.work.version
  );
  await page.waitForFunction(
    (version) => window.__workstations.data_engineer.screens.work.version > version,
    { timeout: 10000 },
    workVersion
  );
  await fixture.setAgentState('siaga');
  await page.waitForFunction(
    (keys) =>
      Object.values(window.__characters).filter((entity) => entity.seat.kind === 'sofa').length ===
        2 &&
      window.__tvScreen.mode === 'racing' &&
      keys.every((key) => !window.__workstations[key].screens.work.userData.animated),
    { timeout: 10000 },
    deskKeys
  );
  const race = await page.evaluate(() => ({
    version: window.__tvScreen.texture.version,
    text: window.__tvScreen.texture.image.__v2Text.map(({ text }) => text),
    dom: document.getElementById('tvMode').dataset.mode,
    canvas: document.querySelector('#scene canvas').dataset.tvMode
  }));
  assert.ok(race.text.includes('Animasi dekoratif'));
  assert.ok(race.text.includes('Sirkuit Senja'));
  assert.equal(race.dom, 'racing');
  assert.equal(race.canvas, 'racing');
  await page.waitForFunction(
    (version) => window.__tvScreen.texture.version > version,
    { timeout: 10000 },
    race.version
  );
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.waitForFunction(() => matchMedia('(prefers-reduced-motion: reduce)').matches, {
    timeout: 10000
  });
  const frozen = await page.evaluate(() => ({
    version: window.__tvScreen.texture.version,
    frame: window.__renderer.info.render.frame,
    time: performance.now()
  }));
  await page.waitForFunction(
    ({ frame, time }) =>
      performance.now() - time >= 1100 && window.__renderer.info.render.frame > frame,
    { timeout: 10000 },
    frozen
  );
  assert.equal(
    await page.evaluate(() => window.__tvScreen.texture.version),
    frozen.version,
    'occupied TV retains a frozen racing frame during reduced motion'
  );
  await page.click('#btnFocusTV');
  await assertCamera(page, 'tv', 'racing TV focused');
  await page.$eval('.office-stage', (stage) => stage.scrollIntoView({ block: 'center' }));
  await (
    await page.$('.office-stage')
  ).screenshot({ path: 'artifacts/screenshots/v2-tv-racing-reduced-motion.png' });
  await fixture.setAgentState('bekerja');
  await page.waitForFunction(
    () =>
      Object.values(window.__characters).every((entity) => entity.seat.kind !== 'sofa') &&
      window.__tvScreen.mode === 'catalog',
    { timeout: 10000 }
  );
  const catalog = await page.evaluate(() => ({
    text: window.__tvScreen.texture.image.__v2Text.map(({ text }) => text),
    mode: document.getElementById('tvMode').dataset.mode
  }));
  assert.ok(catalog.text.includes('NETFLIX'));
  assert.ok(catalog.text.includes('Katalog dekoratif'));
  assert.equal(catalog.mode, 'catalog');
  await (
    await page.$('.office-stage')
  ).screenshot({ path: 'artifacts/screenshots/v2-tv-catalog.png' });
  await reset(page, 'TV catalog reset');
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
  const fixture = await createFixturePage(browser);
  try {
    await assertIdentities(fixture.page);
    await assertClockTick(fixture.page, 'shared device clock, UTC browser');
    await assertBoard(fixture.page);
    await assertPlacements(fixture.page);
    for (const viewport of viewports) await assertViewport(fixture.page, viewport);
    await assertViewport(fixture.page, viewports[0], false);
    await assertTVFocus(fixture.page);
    await assertTVModes(fixture);
    await fixture.failProjection();
    await assertBoard(fixture.page, true);
    const projection = await fixture.page.evaluate(() => ({
      connection: document.getElementById('liveDot').dataset.connection,
      label: document.getElementById('liveStatus').textContent,
      phase: document.getElementById('systemPhase').textContent,
      screens: Object.values(window.__workstations).map(
        ({ screens }) => screens.work.userData.stateLabel
      )
    }));
    assert.deepEqual(projection, {
      connection: 'error',
      label: 'Status gagal dimuat',
      phase: 'Status tugas belum dapat dibaca.',
      screens: Array(4).fill('Status tidak tersedia')
    });
    await fixture.page.screenshot({
      path: 'artifacts/screenshots/v2-projection-error.png',
      fullPage: true
    });
    await fixture.disconnect();
    await assertClockTick(fixture.page, 'shared device clock survives offline API');
    await assertBoard(fixture.page, true);
    const offline = await fixture.page.evaluate(() =>
      Object.values(window.__workstations).map(({ screens }) => ({
        clock: screens.clock.userData.stateLabel,
        work: screens.work.userData.stateLabel,
        animated: screens.work.userData.animated
      }))
    );
    for (const desk of offline)
      assert.deepEqual(desk, { clock: 'Offline', work: 'Offline', animated: false });
    assert.ok(
      fixture.aborted.has('/api/state'),
      'offline is proven through a failed API request, not a UI override'
    );
    await fixture.page.screenshot({ path: 'artifacts/screenshots/v2-offline.png', fullPage: true });
    assert.deepEqual(fixture.failures, [], 'no unexplained console errors or failed requests');
    console.log(
      `PASS v2 identities, device WIB clock/offline, board sources, live assets/pantry, TV modes/focus/mouse/touch; expected network failures: ${fixture.expectedFailures.length}`
    );
  } finally {
    await fixture.page.close();
  }
  const fallback = await createFixturePage(browser, true);
  try {
    await assertPlacements(fallback.page, true);
    assert.deepEqual(
      [...fallback.aborted].sort(),
      [...fallbackPaths].sort(),
      'only the two intended GLBs failed'
    );
    await assertClock(fallback.page, 'clock with asset fallbacks');
    await (
      await fallback.page.$('.office-stage')
    ).screenshot({ path: 'artifacts/screenshots/v2-asset-fallback.png' });
    assert.deepEqual(fallback.failures, [], 'fallback has no unexplained console errors');
    console.log(
      `PASS v2 three plant fallbacks + bookshelf; expected asset failures: ${fallback.expectedFailures.length}`
    );
  } finally {
    await fallback.page.close();
  }
} finally {
  await browser.close();
}
