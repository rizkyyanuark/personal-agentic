import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';
import { OFFICE_ROLES, isPublicLabState } from '../../src/shared/office-contract.js';
import { ROOM_LAYOUT } from '../../src/client/scene/office-layout.js';
import { OFFICE_ACTIVITY_DESTINATIONS } from '../../src/client/scene/office-navigation.js';
import { allocateCharacterSeats } from '../../src/client/scene/seat-registry.js';

const roleKeys = OFFICE_ROLES.map(({ key }) => key);
const deskKeys = roleKeys.filter((key) => key !== 'hq_lab_director');
const homeSeats = allocateCharacterSeats({}, { allowIdleSeating: false });
const destinationIds = new Set(OFFICE_ACTIVITY_DESTINATIONS.map(({ id }) => id));
const settledPhases = new Set(['standing', 'seated']);
const movingPhases = new Set([
  'releasing',
  'undocking',
  'walking',
  'arriving',
  'recovering',
  'sitting'
]);
const anchorTolerance = 0.005;
const headingTolerance = 0.001;
const settledHeadingTolerance = 0.03;
const soleTolerance = 0.008;
const observationTimeout = 90000;
const sampleInterval = 150;
const screenshotDirectory = 'artifacts/screenshots';
const evidenceDirectory = 'artifacts/motion';

export async function installMotionObserver(page) {
  await page.evaluateOnNewDocument(() => {
    const nativeMatchMedia = window.matchMedia.bind(window);
    let observingMotionQuery = false;
    window.__motionQa = { mediaTransitions: [], operationalTransitions: [] };
    const anchors = () =>
      Object.entries(window.__characters || {}).map(([key, entity]) => ({
        key,
        position: entity.root.position.toArray(),
        heading: entity.root.rotation.y
      }));
    // This listener observes the same native MQL before the app registers its handlers.
    // Capturing after emulateMediaFeatures would miss a teleport in reconciliation.
    window.matchMedia = (query) => {
      const media = nativeMatchMedia(query);
      if (query === '(prefers-reduced-motion: reduce)' && !observingMotionQuery) {
        observingMotionQuery = true;
        media.addEventListener('change', (event) => {
          window.__motionQa.mediaTransitions.push({
            reducedMotion: event.matches,
            at: performance.now(),
            anchors: anchors()
          });
        });
      }
      return media;
    };
  });
}

function fixtureFor(states) {
  const count = (state) => Object.values(states).filter((value) => value === state).length;
  const running = count('bekerja');
  const waiting = count('menunggu_persetujuan');
  const fixture = {
    connection: 'live',
    now: new Date().toISOString(),
    totals: { tasks: running + waiting, completed: 0, events: 0 },
    queue: { queued: 0, running, waiting_approval: waiting, failed: 0, stale: 0 },
    agents: Object.fromEntries(
      roleKeys.map((key) => [
        key,
        { state: states[key], task: `Fixture motion, bukan aktivitas live: ${states[key]}` }
      ])
    ),
    feed: []
  };
  assert.equal(isPublicLabState(fixture), true, 'motion fixture obeys the public schema');
  assert.deepEqual(Object.keys(fixture).sort(), [
    'agents',
    'connection',
    'feed',
    'now',
    'queue',
    'totals'
  ]);
  assert.deepEqual(Object.keys(fixture.agents).sort(), [...roleKeys].sort());
  for (const agent of Object.values(fixture.agents)) {
    assert.deepEqual(Object.keys(agent).sort(), ['state', 'task']);
  }
  return fixture;
}

function planarDistance(left, right) {
  return Math.hypot(left[0] - right[0], left[2] - right[2]);
}

function angleDifference(left, right) {
  return Math.atan2(Math.sin(left - right), Math.cos(left - right));
}

function assertAnchors(actual, expected, description) {
  assert.deepEqual(
    actual.map(({ key }) => key).sort(),
    expected.map(({ key }) => key).sort(),
    `${description}: five unchanged identities`
  );
  for (const anchor of expected) {
    const character = actual.find(({ key }) => key === anchor.key);
    assert.equal(character.position.length, 3, `${description}: ${anchor.key} position length`);
    character.position.forEach((value, axis) => {
      assert.ok(Number.isFinite(value), `${description}: ${anchor.key} finite axis ${axis}`);
      assert.ok(
        Math.abs(value - anchor.position[axis]) < anchorTolerance,
        `${description}: ${anchor.key} axis ${axis}: ${value} != ${anchor.position[axis]}`
      );
    });
    assert.ok(
      Math.abs(angleDifference(character.heading, anchor.heading)) < headingTolerance,
      `${description}: ${anchor.key} heading: ${character.heading} != ${anchor.heading}`
    );
  }
}

async function readScene(page) {
  return page.evaluate(() => ({
    at: performance.now(),
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    characters: Object.entries(window.__characters).map(([key, entity]) => {
      entity.root.updateWorldMatrix(true, true);
      const sole = (shoe) => {
        const bounds = new window.__THREE.Box3().setFromObject(shoe);
        return { min: bounds.min.toArray(), max: bounds.max.toArray() };
      };
      return {
        key,
        state: entity.state,
        position: entity.root.position.toArray(),
        heading: entity.root.rotation.y,
        cardState: document.getElementById(`card-${key}`)?.dataset.state,
        seat: entity.seat
          ? {
              id: entity.seat.id,
              kind: entity.seat.kind,
              position: [...entity.seat.position],
              heading: entity.seat.heading
            }
          : null,
        activity: entity.activity
          ? {
              kind: entity.activity.kind,
              phase: entity.activity.phase,
              zone: entity.activity.zone,
              destinationId: entity.activity.destinationId,
              arrivalId: entity.activity.arrivalId
            }
          : null,
        soles: { left: sole(entity.leftShoe), right: sole(entity.rightShoe) }
      };
    })
  }));
}

function assertScene(sample, description) {
  assert.deepEqual(
    sample.characters.map(({ key }) => key).sort(),
    [...roleKeys].sort(),
    `${description}: five characters`
  );
  const occupied = new Set();
  let idleMoving = 0;
  for (const character of sample.characters) {
    const { key, position, heading, activity, seat } = character;
    assert.ok(position.every(Number.isFinite), `${description}: ${key} finite position`);
    assert.ok(Number.isFinite(heading), `${description}: ${key} finite heading`);
    for (const axis of [0, 2]) {
      assert.ok(
        position[axis] >= ROOM_LAYOUT.min[axis] - anchorTolerance &&
          position[axis] <= ROOM_LAYOUT.max[axis] + anchorTolerance,
        `${description}: ${key} inside room axis ${axis}`
      );
    }
    assert.ok(
      Math.abs(position[1] - ROOM_LAYOUT.floorY) < anchorTolerance,
      `${description}: ${key} root anchor remains on floor (not sole-contact proof)`
    );
    assert.ok(activity, `${description}: ${key} activity sample exists`);
    if (activity.destinationId !== null) {
      assert.ok(
        destinationIds.has(activity.destinationId),
        `${description}: ${key} valid destination ${activity.destinationId}`
      );
      if (activity.destinationId.startsWith('desk:')) {
        assert.equal(activity.destinationId, `desk:${key}`, `${description}: ${key} own desk`);
      }
      if (activity.destinationId === 'standing:hq') {
        assert.equal(key, 'hq_lab_director', `${description}: director-only board destination`);
      }
    }
    if (character.state === 'siaga' && movingPhases.has(activity.phase)) idleMoving++;
    if (activity.phase === 'seated') {
      assert.ok(seat && seat.kind !== 'standing', `${description}: ${key} seated with a seat`);
      assert.ok(destinationIds.has(seat.id), `${description}: ${key} registered seat`);
      assert.ok(!occupied.has(seat.id), `${description}: no two characters occupy ${seat.id}`);
      occupied.add(seat.id);
      assert.ok(
        planarDistance(position, seat.position) < anchorTolerance,
        `${description}: ${key} settled at actual seat anchor`
      );
      assert.ok(
        Math.abs(angleDifference(heading, seat.heading)) < settledHeadingTolerance,
        `${description}: ${key} faces actual seat direction`
      );
    }
    for (const sole of Object.values(character.soles)) {
      assert.ok(
        [...sole.min, ...sole.max].every(Number.isFinite),
        `${description}: ${key} finite world-space sole bounds`
      );
    }
  }
  assert.ok(idleMoving <= 2, `${description}: at most two decorative journeys, got ${idleMoving}`);
}

function isHome(character) {
  const home = homeSeats[character.key];
  return (
    settledPhases.has(character.activity?.phase) &&
    character.seat?.id === home.id &&
    planarDistance(character.position, home.position) < anchorTolerance &&
    Math.abs(angleDifference(character.heading, home.heading)) < settledHeadingTolerance
  );
}

async function installCardObserver(page) {
  await page.evaluate(() => {
    const cards = document.getElementById('card-hq_lab_director')?.parentElement;
    if (!cards) throw new Error('Motion fixture requires the agent card strip');
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const card = mutation.target;
        if (mutation.attributeName !== 'data-state' || !card.matches('.agent-card')) continue;
        if (mutation.oldValue === card.dataset.state) continue;
        const key = card.dataset.role;
        const entity = window.__characters[key];
        window.__motionQa.operationalTransitions.push({
          at: performance.now(),
          key,
          state: card.dataset.state,
          position: entity.root.position.toArray(),
          heading: entity.root.rotation.y,
          phase: entity.activity?.phase,
          seatId: entity.seat?.id ?? null
        });
      }
    });
    observer.observe(cards, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-state'],
      attributeOldValue: true
    });
  });
}

export async function runMotionRegression(browser, origin, viewport) {
  assert.ok(origin, 'motion regression requires an explicit preview origin');
  const page = await browser.newPage();
  const failures = [];
  const evidence = {
    origin,
    viewport,
    fixture: 'Intercepted public-state fixture; not live ledger activity',
    tolerances: {
      anchorUnits: anchorTolerance,
      frozenHeadingRadians: headingTolerance,
      settledHeadingRadians: settledHeadingTolerance,
      walkingSoleUnits: soleTolerance,
      floorY: ROOM_LAYOUT.floorY
    },
    polls: [],
    samples: [],
    checkpoints: []
  };
  let states = Object.fromEntries(roleKeys.map((key) => [key, 'siaga']));
  let revision = 0;
  let deliveredRevision = -1;
  let pollCount = 0;
  let error;
  await mkdir(screenshotDirectory, { recursive: true });
  await mkdir(evidenceDirectory, { recursive: true });
  const artifact = `${evidenceDirectory}/${viewport.name}-regression.json`;

  async function capture(description) {
    const sample = await readScene(page);
    evidence.samples.push({ description, pollCount, revision, ...sample });
    assert.deepEqual(failures, [], `${description}: console and request errors`);
    assertScene(sample, description);
    return sample;
  }

  async function observeUntil(description, predicate, timeout = observationTimeout) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const sample = await capture(description);
      const result = predicate(sample);
      if (result) return { sample, result };
      await new Promise((resolve) => setTimeout(resolve, sampleInterval));
    }
    assert.fail(
      `${description}: timeout after ${timeout}ms; latest sample: ${JSON.stringify(evidence.samples.at(-1))}`
    );
  }

  try {
    await page.setViewport({
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1
    });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await installMotionObserver(page);
    await page.setRequestInterception(true);
    page.on('request', async (request) => {
      try {
        if (request.isInterceptResolutionHandled()) return;
        const url = new URL(request.url());
        if (request.method() !== 'GET') {
          failures.push(`unexpected mutating request: ${request.method()} ${url.pathname}`);
          await request.abort('blockedbyclient');
        } else if (url.origin === new URL(origin).origin && url.pathname === '/api/state') {
          const pollStates = { ...states };
          const fixture = fixtureFor(pollStates);
          const currentRevision = revision;
          await request.respond({
            status: 200,
            contentType: 'application/json',
            headers: { 'Cache-Control': 'no-store' },
            body: JSON.stringify(fixture)
          });
          pollCount++;
          deliveredRevision = currentRevision;
          evidence.polls.push({
            pollCount,
            revision: currentRevision,
            now: fixture.now,
            states: pollStates
          });
        } else {
          await request.continue();
        }
      } catch (failure) {
        failures.push(`request interception: ${failure.message}`);
      }
    });
    page.on('pageerror', (failure) => failures.push(`pageerror: ${failure.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') failures.push(`console: ${message.text()}`);
    });
    page.on('requestfailed', (request) =>
      failures.push(`request failed: ${request.url()} ${request.failure()?.errorText || ''}`)
    );
    const response = await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 30000 });
    assert.equal(response?.status(), 200, 'motion fixture page HTTP status');
    await page.waitForFunction(
      (keys) =>
        window.__virtualOfficeReady === true &&
        Object.keys(window.__characters || {}).length === keys.length &&
        keys.every(
          (key) =>
            window.__characters[key]?.state === 'siaga' &&
            document.getElementById(`card-${key}`)?.dataset.state === 'siaga'
        ),
      { timeout: 45000 },
      roleKeys
    );
    await page.$eval('.office-stage', (stage) => {
      const label = document.createElement('div');
      label.id = 'motion-fixture-note';
      label.textContent = 'Fixture QA motion: bukan aktivitas live';
      Object.assign(label.style, {
        position: 'absolute',
        top: '8px',
        right: '8px',
        zIndex: '30',
        padding: '6px 8px',
        maxWidth: 'calc(100% - 16px)',
        background: '#1f2937',
        color: '#ffffff',
        font: '12px sans-serif',
        pointerEvents: 'none'
      });
      stage.append(label);
    });
    await installCardObserver(page);
    const bootstrap = await capture('reduced-motion bootstrap');
    assertAnchors(
      bootstrap.characters,
      roleKeys.map((key) => ({
        key,
        position: homeSeats[key].position,
        heading: homeSeats[key].heading
      })),
      'Reduced-motion bootstrap uses home anchors, not legacy idle sofa allocation'
    );
    evidence.checkpoints.push({ name: 'bootstrap', sample: bootstrap });
    console.log('PASS motion: reduced-motion bootstrap exact five home anchors');

    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    const firstJourney = await observeUntil('observe real decorative walking', (sample) =>
      sample.characters.find(
        (character) =>
          deskKeys.includes(character.key) &&
          character.activity.kind === 'walking' &&
          planarDistance(character.position, homeSeats[character.key].position) >= 0.6
      )
    );
    const subject = firstJourney.result.key;
    evidence.checkpoints.push({ name: 'first-real-walk', subject, sample: firstJourney.sample });
    const walkStarted = firstJourney.sample.at;
    let walkingSamples = 0;
    await observeUntil(
      'world-space walking sole samples',
      (sample) => {
        const character = sample.characters.find(({ key }) => key === subject);
        if (character.activity.kind === 'walking') {
          walkingSamples++;
          const left = character.soles.left.min[1];
          const right = character.soles.right.min[1];
          assert.ok(
            left >= ROOM_LAYOUT.floorY - soleTolerance &&
              right >= ROOM_LAYOUT.floorY - soleTolerance,
            `${subject}: walking shoe bounds must not penetrate floor beyond ${soleTolerance} units: ${left}, ${right}`
          );
          assert.ok(
            Math.abs(Math.min(left, right) - ROOM_LAYOUT.floorY) <= soleTolerance,
            `${subject}: at least one world-space sole is planted within ${soleTolerance} units: ${left}, ${right}`
          );
        }
        return sample.at - walkStarted >= 1200 && walkingSamples >= 4;
      },
      15000
    );

    const beforeReducedEvents = await page.evaluate(
      () => window.__motionQa.mediaTransitions.length
    );
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.waitForFunction(
      (before) =>
        window.__motionQa.mediaTransitions.length > before &&
        window.__motionQa.mediaTransitions.at(-1).reducedMotion === true,
      { timeout: 10000 },
      beforeReducedEvents
    );
    const preReduced = await page.evaluate(() =>
      window.__motionQa.mediaTransitions.findLast(({ reducedMotion }) => reducedMotion)
    );
    assert.ok(
      preReduced?.anchors.length === roleKeys.length,
      'PRE-handler reduced-motion evidence exists'
    );
    const immediate = await capture('immediate reduced-motion freeze');
    assert.equal(immediate.reducedMotion, true, 'reduced-motion media input enabled');
    assertAnchors(immediate.characters, preReduced.anchors, 'Freeze preserves PRE-handler anchors');
    evidence.checkpoints.push({ name: 'freeze-pre-handler', sample: preReduced });
    evidence.checkpoints.push({ name: 'freeze-immediate', sample: immediate });
    await page.screenshot({
      path: `${screenshotDirectory}/${viewport.name}-motion-frozen.png`,
      fullPage: true
    });
    const beforeFrozenPoll = pollCount;
    const frozenAcrossPoll = await observeUntil(
      'frozen across fresh API poll',
      (sample) => {
        assertAnchors(
          sample.characters,
          preReduced.anchors,
          'Fresh polls cannot relocate frozen characters'
        );
        return pollCount > beforeFrozenPoll;
      },
      12000
    );
    evidence.checkpoints.push({ name: 'freeze-next-poll', sample: frozenAcrossPoll.sample });
    console.log(
      'PASS motion: real displacement, world-space soles, PRE-handler freeze and next-poll freeze'
    );

    for (const nextState of ['bekerja', 'menunggu_persetujuan']) {
      states = { ...states, [subject]: 'siaga' };
      revision++;
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
      await observeUntil(
        `fresh siaga before ${nextState}`,
        (sample) =>
          deliveredRevision === revision &&
          sample.characters.find(({ key }) => key === subject).state === 'siaga',
        12000
      );
      const away = await observeUntil(`real walk before ${nextState}`, (sample) => {
        const character = sample.characters.find(({ key }) => key === subject);
        return (
          character.activity.kind === 'walking' &&
          planarDistance(character.position, homeSeats[subject].position) >= 2
        );
      });
      evidence.checkpoints.push({ name: `away-before-${nextState}`, subject, sample: away.sample });
      const transitionStart = await page.evaluate(() => performance.now());
      states = { ...states, [subject]: nextState };
      revision++;
      const operational = await observeUntil(
        `DOM updates for ${nextState}`,
        (sample) => {
          const character = sample.characters.find(({ key }) => key === subject);
          return (
            deliveredRevision === revision &&
            character.state === nextState &&
            character.cardState === nextState
          );
        },
        12000
      );
      const domTransition = await page.evaluate(
        ({ key, state, started }) =>
          window.__motionQa.operationalTransitions.findLast(
            (entry) => entry.key === key && entry.state === state && entry.at >= started
          ),
        { key: subject, state: nextState, started: transitionStart }
      );
      assert.ok(domTransition, `${nextState}: first DOM status-transition evidence exists`);
      assert.ok(
        planarDistance(domTransition.position, homeSeats[subject].position) > 0.1,
        `${nextState}: DOM state changes before the character finishes its safe return`
      );
      evidence.checkpoints.push({ name: `dom-first-${nextState}`, sample: domTransition });
      evidence.checkpoints.push({ name: `operational-${nextState}`, sample: operational.sample });
      const returned = await observeUntil(`safe home return ${nextState}`, (sample) => {
        const character = sample.characters.find(({ key }) => key === subject);
        return (
          character.state === nextState && character.cardState === nextState && isHome(character)
        );
      });
      const returnedSubject = returned.sample.characters.find(({ key }) => key === subject);
      assert.ok(
        returned.sample.at > domTransition.at,
        `${nextState}: completed return follows DOM update`
      );
      assert.equal(
        returnedSubject.seat.id,
        `desk:${subject}`,
        `${nextState}: settled in own workstation`
      );
      evidence.checkpoints.push({
        name: `returned-${nextState}`,
        subject,
        sample: returned.sample
      });
      await page.screenshot({
        path: `${screenshotDirectory}/${viewport.name}-motion-returned-${nextState}.png`,
        fullPage: true
      });
      console.log(`PASS motion: ${subject} DOM ${nextState} before safe return to its own desk`);
    }
    assert.deepEqual(failures, [], 'motion fixture: no console, request or mutation errors');
    evidence.outcome = 'passed';
  } catch (failure) {
    error = failure;
    evidence.outcome = 'failed';
    evidence.error = { name: failure.name, message: failure.message, stack: failure.stack };
    console.error('Motion regression diagnostics', {
      artifact,
      failures,
      revision,
      deliveredRevision,
      pollCount,
      latest: evidence.samples.at(-1)
    });
    if (!page.isClosed()) {
      try {
        await page.screenshot({
          path: `${screenshotDirectory}/${viewport.name}-motion-failure.png`,
          fullPage: true
        });
      } catch (failure) {
        evidence.failureScreenshotError = failure.message;
      }
    }
  } finally {
    evidence.failures = failures;
    if (!page.isClosed()) {
      try {
        evidence.observers = await page.evaluate(() => window.__motionQa);
      } catch (failure) {
        evidence.observerReadError = failure.message;
      }
    }
    await writeFile(artifact, `${JSON.stringify(evidence, null, 2)}\n`);
    await page.close();
  }
  if (error) throw error;
  console.log(`Motion evidence: ${artifact}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const origin = process.env.COCKPIT_URL || 'http://127.0.0.1:8099';
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
    await runMotionRegression(browser, origin, { name: 'desktop-1440', width: 1440, height: 900 });
  } finally {
    await browser.close();
  }
}
