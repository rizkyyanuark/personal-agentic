import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { OFFICE_ROLES, OFFICE_ROLE_BY_SLUG } from '../../src/shared/office-contract.js';
import { DESK_CONFIGS } from '../../src/client/scene/office-layout.js';
import { getOfficeTime } from '../../src/client/scene/office-clock.js';
import { createDeskPropAssets } from '../../src/client/scene/desk-props.js';
import { createChairFallback } from '../../src/client/scene/seating-fallbacks.js';
import { createAgentWorkstation } from '../../src/client/scene/workstation.js';
import {
  WORK_SCHEMATICS,
  createWorkstationScreens,
  projectWorkstationState
} from '../../src/client/scene/workstation-screens.js';

const EXPECTED_ROLES = [
  ['hq_lab_director', 'hq', 'Orion', 'Lab Director', '#7756a7'],
  ['data_engineer', 'data-engineer', 'Nova', 'Data Engineer', '#176e78'],
  ['data_scientist', 'data-scientist', 'Atlas', 'Data Scientist', '#3465b4'],
  ['research_scientist', 'research-scientist', 'Lyra', 'Research Scientist', '#a83c6a'],
  ['ml_engineer', 'ml-engineer', 'Axiom', 'ML Engineer', '#247c5b']
];
const DESK_ROLES = OFFICE_ROLES.filter(({ key }) => key !== 'hq_lab_director');
const BASE_TIME = getOfficeTime(new Date('2026-09-29T02:23:10Z'));
const LIVE = { connection: 'live' };

function installCanvasStub(t) {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const records = [];
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement(tag) {
        assert.equal(tag, 'canvas');
        const canvas = { width: 0, height: 0 };
        const record = { canvas, frames: [], gradients: [] };
        records.push(record);
        let currentFrame = null;
        const ctx = {
          fillStyle: '',
          strokeStyle: '',
          font: '10px sans-serif',
          textAlign: 'left',
          lineWidth: 1,
          measureText(text) {
            const size = Number(/([\d.]+)px/.exec(this.font)?.[1] || 10);
            return { width: String(text).length * size * 0.52 };
          },
          createLinearGradient(...args) {
            const gradient = { args, stops: [] };
            gradient.addColorStop = (offset, color) => gradient.stops.push([offset, color]);
            record.gradients.push(gradient);
            return gradient;
          }
        };
        for (const method of [
          'save',
          'restore',
          'beginPath',
          'closePath',
          'rect',
          'clip',
          'translate',
          'scale',
          'fillRect',
          'strokeRect',
          'arc',
          'fill',
          'stroke',
          'fillText',
          'moveTo',
          'lineTo',
          'bezierCurveTo'
        ]) {
          ctx[method] = (...args) => {
            if (
              method === 'fillRect' &&
              args[0] === 0 &&
              args[1] === 0 &&
              args[2] === canvas.width &&
              args[3] === canvas.height
            ) {
              currentFrame = [];
              record.frames.push(currentFrame);
            }
            currentFrame?.push({
              method,
              args: [...args],
              font: ctx.font,
              textAlign: ctx.textAlign,
              fillStyle: typeof ctx.fillStyle === 'string' ? ctx.fillStyle : 'gradient',
              strokeStyle: ctx.strokeStyle,
              lineWidth: ctx.lineWidth
            });
          };
        }
        canvas.getContext = (kind) => {
          assert.equal(kind, '2d');
          return ctx;
        };
        return canvas;
      }
    }
  });
  t.after(() => {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete globalThis.document;
  });
  return records;
}

function recordFor(records, texture) {
  return records.find(({ canvas }) => canvas === texture.image);
}

function drawnLabels(frame) {
  return frame.filter(({ method }) => method === 'fillText').map(({ args }) => args[0]);
}

function screensForAllRoles(t) {
  const screens = DESK_ROLES.map((role) => createWorkstationScreens(role, 4));
  t.after(() => screens.forEach((screen) => screen.dispose()));
  return screens;
}

function createDummyAssets(t) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const materialNames = [
    'coffeeMaterial',
    'oak',
    'white',
    'metal',
    'screenBody',
    'deskMat',
    'cableMaterial'
  ];
  const assets = Object.fromEntries(
    materialNames.map((name) => [name, new THREE.MeshStandardMaterial({ color: '#777777' })])
  );
  assets.deskProps = createDeskPropAssets();
  const attach = (container, name) => {
    const mesh = new THREE.Mesh(geometry, assets.metal);
    mesh.name = `injected_${name}`;
    mesh.scale.set(0.1, 0.025, 0.1);
    container.add(mesh);
  };
  assets.attachKeyboard = (container) => attach(container, 'keyboard');
  assets.attachMouse = (container) => attach(container, 'mouse');
  assets.attachCableTray = (container) => attach(container, 'cable_tray');
  assets.attachChair = (container, detailed) => container.add(createChairFallback({ detailed }));
  t.after(() => {
    geometry.dispose();
    materialNames.forEach((name) => assets[name].dispose());
    assets.deskProps.dispose();
  });
  return assets;
}

test('five approved character names retain canonical ledger keys, slugs, jobs and colors', () => {
  assert.deepEqual(
    OFFICE_ROLES.map(({ key, slug, name, role, color }) => [key, slug, name, role, color]),
    EXPECTED_ROLES
  );
  assert.equal(new Set(OFFICE_ROLES.map(({ key }) => key)).size, 5);
  for (const { key, slug } of OFFICE_ROLES) assert.equal(OFFICE_ROLE_BY_SLUG[slug], key);
  assert.deepEqual(
    DESK_CONFIGS.map(({ key }) => key),
    DESK_ROLES.map(({ key }) => key)
  );
  assert.equal(DESK_CONFIGS.length, 4);
  assert(!DESK_CONFIGS.some(({ key }) => key === 'hq_lab_director'));
});

test('four work schematics have distinct approved role-specific kinds and descriptions', () => {
  assert.deepEqual(
    Object.keys(WORK_SCHEMATICS),
    DESK_ROLES.map(({ key }) => key)
  );
  assert.deepEqual(
    Object.values(WORK_SCHEMATICS).map(({ kind }) => kind),
    ['pipeline', 'notebook', 'research', 'model']
  );
  assert.equal(new Set(Object.values(WORK_SCHEMATICS).map(({ kind }) => kind)).size, 4);
  for (const concept of Object.values(WORK_SCHEMATICS)) {
    assert(concept.title);
    assert(concept.description);
    assert(Object.isFrozen(concept));
  }
});

test('fresh public role states preserve working, waiting, idle and failed semantics', () => {
  for (const [state, stateLabel] of [
    ['bekerja', 'Bekerja'],
    ['menunggu_persetujuan', 'Perlu keputusan'],
    ['siaga', 'Siaga'],
    ['gagal', 'Gagal']
  ]) {
    const result = projectWorkstationState({ state, task: 'Ringkasan publik.' }, LIVE);
    assert.deepEqual(result, {
      connection: 'live',
      fresh: true,
      state,
      stateLabel,
      task: 'Ringkasan publik.'
    });
  }
  assert.equal(
    projectWorkstationState({ state: 'siaga', task: '' }, { connection: 'empty' }).fresh,
    true
  );
});

test('workstation projection normalizes only the public summary and ignores private fields', () => {
  const result = projectWorkstationState(
    {
      state: 'bekerja',
      task: '  Ringkasan\u0000\n\t publik.  ',
      goal: 'PRIVATE_GOAL',
      project: 'PRIVATE_PROJECT',
      input: 'PRIVATE_INPUT',
      output: 'PRIVATE_OUTPUT',
      vault: 'PRIVATE_VAULT',
      payload: 'PRIVATE_PAYLOAD',
      token: 'PRIVATE_TOKEN'
    },
    {
      connection: 'live',
      now: 'PRIVATE_NOW',
      totals: 'PRIVATE_TOTALS',
      agents: 'PRIVATE_AGENTS',
      feed: 'PRIVATE_FEED'
    }
  );
  assert.deepEqual(Object.keys(result), ['connection', 'fresh', 'state', 'stateLabel', 'task']);
  assert.equal(result.task, 'Ringkasan publik.');
  assert(!JSON.stringify(result).includes('PRIVATE_'));
  assert.equal(
    projectWorkstationState({ state: 'siaga', task: 'x'.repeat(300) }, LIVE).task.length,
    180
  );
  assert.equal(
    projectWorkstationState({ state: 'siaga', task: ' \n\t ' }, LIVE).task,
    'Belum ada ringkasan publik.'
  );
  assert.equal(projectWorkstationState({ state: 'unmapped', task: 'Publik.' }, LIVE).state, null);
});

test('offline, error and loading projections cannot preserve a stale working claim', () => {
  for (const [connection, stateLabel, task] of [
    ['offline', 'Offline', 'Koneksi status terputus.'],
    ['error', 'Status tidak tersedia', 'Ledger belum dapat dibaca.'],
    ['loading', 'Menunggu status', 'Menunggu status ledger.']
  ]) {
    assert.deepEqual(
      projectWorkstationState({ state: 'bekerja', task: 'Old live task.' }, { connection }),
      {
        connection,
        fresh: false,
        state: null,
        stateLabel,
        task
      }
    );
  }
});

test('four screen pairs keep eight independent persistent 768x480 sRGB canvases', (t) => {
  const records = installCanvasStub(t);
  const screens = screensForAllRoles(t);
  const textures = screens.flatMap(({ clock, work }) => [clock, work]);
  assert.equal(records.length, 8);
  assert.equal(new Set(textures).size, 8);
  assert.equal(new Set(textures.map(({ image }) => image)).size, 8);
  for (const texture of textures) {
    assert.equal(texture.isCanvasTexture, true);
    assert.equal(texture.image.width, 768);
    assert.equal(texture.image.height, 480);
    assert.equal(texture.colorSpace, THREE.SRGBColorSpace);
    assert.equal(texture.wrapS, THREE.ClampToEdgeWrapping);
    assert.equal(texture.wrapT, THREE.ClampToEdgeWrapping);
    assert.equal(texture.anisotropy, 4);
  }
  screens.forEach((screen) => {
    screen.setState({ state: 'siaga', task: 'Siaga.' }, LIVE);
    screen.update(0, false, BASE_TIME);
    screen.update(0.5, false, BASE_TIME);
  });
  assert.equal(records.length, 8);
  assert.deepEqual(
    screens.flatMap(({ clock, work }) => [clock, work]),
    textures
  );
});

test('unchanged minute and state leave both screen textures and recorded paints untouched', (t) => {
  const records = installCanvasStub(t);
  const screens = screensForAllRoles(t);
  for (const screen of screens) {
    const agent = { state: 'siaga', task: 'Ringkasan publik.' };
    screen.setState(agent, LIVE);
    screen.update(0, false, BASE_TIME);
    const versions = [screen.clock.version, screen.work.version];
    const frames = [
      recordFor(records, screen.clock).frames.length,
      recordFor(records, screen.work).frames.length
    ];
    assert.equal(screen.setState({ ...agent }, { ...LIVE }), false);
    assert.equal(screen.update(0.8, false, { ...BASE_TIME, second: 42 }), false);
    assert.deepEqual([screen.clock.version, screen.work.version], versions);
    assert.deepEqual(
      [
        recordFor(records, screen.clock).frames.length,
        recordFor(records, screen.work).frames.length
      ],
      frames
    );
  }
});

test('minute changes repaint clocks, while role-state and public-summary changes repaint the right screens', (t) => {
  installCanvasStub(t);
  const screens = screensForAllRoles(t);
  const nextMinute = getOfficeTime(new Date('2026-09-29T02:24:00Z'));
  for (const screen of screens) {
    screen.setState({ state: 'siaga', task: 'Siaga.' }, LIVE);
    screen.update(0, false, BASE_TIME);
    const clockVersion = screen.clock.version;
    const workVersion = screen.work.version;
    assert.equal(screen.update(0, false, nextMinute), true);
    assert.equal(screen.clock.version, clockVersion + 1);
    assert.equal(screen.work.version, workVersion);
    assert.equal(screen.clock.userData.timeText, '09:24');

    assert.equal(
      screen.setState({ state: 'menunggu_persetujuan', task: 'Perlu keputusan.' }, LIVE),
      true
    );
    assert.equal(screen.clock.version, clockVersion + 2);
    assert.equal(screen.work.version, workVersion + 1);
    assert.equal(screen.clock.userData.stateLabel, 'Perlu keputusan');
    assert.equal(screen.work.userData.stateLabel, 'Perlu keputusan');

    assert.equal(
      screen.setState({ state: 'menunggu_persetujuan', task: 'Ringkasan diperbarui.' }, LIVE),
      true
    );
    assert.equal(screen.clock.version, clockVersion + 2);
    assert.equal(screen.work.version, workVersion + 2);
    assert.equal(screen.work.userData.summary, 'Ringkasan diperbarui.');
  }
});

test('working primary monitors show labeled schematics without fabricated execution logs', (t) => {
  const records = installCanvasStub(t);
  const screens = screensForAllRoles(t);
  for (const screen of screens) {
    screen.setState({ state: 'bekerja', task: 'Ringkasan publik.' }, LIVE);
    screen.update(0, false, BASE_TIME);
    const labels = drawnLabels(recordFor(records, screen.clock).frames.at(-1));
    assert(labels.includes('Tampilan ilustratif'));
    assert(labels.includes(screen.concept.title));
    assert(labels.includes('Bekerja'));
    assert(labels.includes(BASE_TIME.timeText));
    assert(
      !labels.some((label) =>
        /python|PID|process connected|execution step|active task/i.test(String(label))
      )
    );
  }
});

test('working animation changes each role screen at most four times per second after activation', (t) => {
  installCanvasStub(t);
  const screens = screensForAllRoles(t);
  for (const screen of screens) {
    screen.setState({ state: 'bekerja', task: 'Pekerjaan aktif.' }, LIVE);
    screen.update(0, false, BASE_TIME);
    assert.equal(screen.work.userData.animated, true);
    const clockVersion = screen.clock.version;
    const workVersion = screen.work.version;
    let changes = 0;
    for (let step = 0; step < 200; step += 1) {
      const before = screen.work.version;
      screen.update(0.005, false, BASE_TIME);
      const change = screen.work.version - before;
      assert(change === 0 || change === 1);
      changes += change;
    }
    assert(changes > 0, 'working schematic must respond when animation is enabled');
    assert(changes <= 4, 'four phase changes per elapsed second');
    assert.equal(screen.work.version, workVersion + changes);
    assert.equal(screen.clock.version, clockVersion);
  }
});

test('nonworking, unavailable and reduced-motion work screens remain static', (t) => {
  const records = installCanvasStub(t);
  const screens = screensForAllRoles(t);
  for (const screen of screens) {
    for (const [state, connection, reducedMotion] of [
      ['menunggu_persetujuan', 'live', false],
      ['siaga', 'live', false],
      ['gagal', 'live', false],
      ['bekerja', 'offline', false],
      ['bekerja', 'error', false],
      ['bekerja', 'live', true]
    ]) {
      screen.setState({ state, task: 'Ringkasan publik.' }, { connection });
      screen.update(0, reducedMotion, BASE_TIME);
      const version = screen.work.version;
      const frameCount = recordFor(records, screen.work).frames.length;
      const frame = structuredClone(recordFor(records, screen.work).frames.at(-1));
      for (let step = 0; step < 12; step += 1) {
        assert.equal(screen.update(0.1, reducedMotion, BASE_TIME), false);
      }
      assert.equal(screen.work.userData.animated, false);
      assert.equal(screen.work.version, version);
      assert.equal(recordFor(records, screen.work).frames.length, frameCount);
      assert.deepEqual(recordFor(records, screen.work).frames.at(-1), frame);
    }
  }
});

test('offline wallpapers keep the device WIB clock and cross midnight independently of API now', (t) => {
  const records = installCanvasStub(t);
  const screens = screensForAllRoles(t);
  const beforeMidnight = getOfficeTime(new Date('2026-09-29T16:59:59Z'));
  const afterMidnight = getOfficeTime(new Date('2026-09-29T17:00:00Z'));
  for (const screen of screens) {
    screen.setState(
      { state: 'bekerja', task: 'Old live task.' },
      { connection: 'offline', now: '2000-01-01T00:00:00Z' }
    );
    screen.update(0, true, beforeMidnight);
    assert.equal(screen.clock.userData.timeText, '23:59');
    const clockVersion = screen.clock.version;
    const workVersion = screen.work.version;
    assert.equal(screen.update(1, true, afterMidnight), true);
    assert.equal(screen.clock.version, clockVersion + 1);
    assert.equal(screen.work.version, workVersion);
    assert.equal(screen.clock.userData.timeText, '00:00');
    assert.equal(screen.clock.userData.dateText, afterMidnight.dateText);
    assert.notEqual(beforeMidnight.dateText, afterMidnight.dateText);
    assert.equal(screen.clock.userData.stateLabel, 'Offline');
    assert(drawnLabels(recordFor(records, screen.clock).frames.at(-1)).includes('WIB'));
    assert.equal(screen.work.userData.animated, false);
  }
});

test('all four workstation constructors include approved mugs, nameplates, monitors and role props', (t) => {
  const records = installCanvasStub(t);
  const assets = createDummyAssets(t);
  const stations = DESK_CONFIGS.map((config) => createAgentWorkstation({ config, assets }));
  t.after(() => stations.forEach((station) => station.dispose()));
  const expectedProps = {
    data_engineer: ['notebook'],
    data_scientist: ['book', 'diagram-card'],
    research_scientist: ['papers', 'bookmark'],
    ml_engineer: ['headphones']
  };

  for (const station of stations) {
    const key = station.group.userData.roleKey;
    const role = OFFICE_ROLES.find((item) => item.key === key);
    assert.equal(station.group.name, `workstation_${key}`);
    assert.equal(station.group.userData.agentName, role.name);
    assert.equal(station.group.userData.job, role.role);
    const mug = station.group.getObjectByName(`mug_${key}`);
    assert(mug);
    assert.equal(mug.userData.roleColor, role.color);
    const cup = mug.children.find(({ geometry }) => geometry?.type === 'CylinderGeometry');
    assert.equal(`#${cup.material.color.getHexString()}`, role.color);
    const nameplate = station.group.getObjectByName(`nameplate_${key}`);
    assert(nameplate);
    assert.deepEqual(nameplate.material.map.userData, {
      roleKey: key,
      name: role.name,
      job: role.role
    });
    const nameplateLabels = drawnLabels(recordFor(records, nameplate.material.map).frames.at(-1));
    assert(nameplateLabels.includes(role.name));
    assert(nameplateLabels.includes(role.role));
    const clockMonitor = station.group.getObjectByName(`monitor_screen_clock_${key}`);
    const workMonitor = station.group.getObjectByName(`monitor_screen_work_${key}`);
    assert(clockMonitor);
    assert(workMonitor);
    assert(clockMonitor.position.x < workMonitor.position.x);
    assert.equal(
      station.group.children.filter(({ name }) => name.startsWith('monitor_screen_')).length,
      2
    );
    for (const essential of ['keyboard', 'mouse', 'chair']) {
      assert(station.group.getObjectByName(`${essential}_${key}`).children.length > 0);
    }
    assert.deepEqual(
      station.group.getObjectByName(`desk_props_${key}`).userData.propKinds,
      expectedProps[key]
    );
    assert.equal(station.screens.work.userData.illustrative, true);
    assert(
      drawnLabels(recordFor(records, station.screens.work).frames.at(-1)).includes(
        'Tampilan ilustratif'
      )
    );
  }
});

test('HQ cannot create a workstation even when dummy shared assets are supplied', (t) => {
  installCanvasStub(t);
  const assets = createDummyAssets(t);
  assert.throws(
    () => createAgentWorkstation({ config: { key: 'hq_lab_director', x: 0, z: 0 }, assets }),
    /No workstation for hq_lab_director/
  );
});

test('idle workstation screens show Santai clock with waiting subtitle and locked work monitor', (t) => {
  const records = installCanvasStub(t);
  const screens = screensForAllRoles(t);
  for (const screen of screens) {
    screen.setState({ state: 'siaga', task: 'Siaga.' }, LIVE);
    screen.update(0, false, BASE_TIME);
    const clockLabels = drawnLabels(recordFor(records, screen.clock).frames.at(-1));
    assert(clockLabels.includes('menunggu tugas'));
    assert(clockLabels.some((l) => l.includes('Santai')));

    const workLabels = drawnLabels(recordFor(records, screen.work).frames.at(-1));
    assert(workLabels.includes('Layar terkunci'));
    assert(workLabels.includes('Agent sedang berada di area santai'));
  }
});
