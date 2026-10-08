import { ROOM_LAYOUT } from './office-layout.js';
import { applyCharacterPose } from './character-pose.js';
import { OFFICE_ACTIVITY_DESTINATIONS, createOfficeNavigation } from './office-navigation.js';

const WALK_SPEED = 1.6;
const WALK_TURN_RATE = 7;
const SETTLE_TURN_RATE = 4;
const WALK_PHASE_RATE = 8;
const SEAT_TRANSITION_SECONDS = 0.85;
const PERSONAL_SPACE = 0.62;
const MIN_ARRIVAL_DWELL_SECONDS = 8;
const REPLAN_SECONDS = 2.2;
const BLOCKED_SECONDS = 5;
const MOVING_PHASES = new Set([
  'releasing',
  'undocking',
  'walking',
  'arriving',
  'recovering',
  'sitting'
]);
const WALKING_PHASES = new Set(['undocking', 'walking', 'arriving', 'recovering']);

function seededRandom(key) {
  let seed = 2166136261;
  for (const character of key) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
  return () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
}

function createSessionSeed() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}:${Math.random()}`;
}

function distanceTo(root, point) {
  return Math.hypot(root.position.x - point[0], root.position.z - point[2]);
}

function angleDifference(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function standAt(entity) {
  const { x, z } = entity.root.position;
  const heading = entity.root.rotation.y;
  return {
    kind: 'standing',
    position: [x, ROOM_LAYOUT.floorY, z],
    heading,
    lookTarget: [x + Math.sin(heading) * 2, 1.62, z + Math.cos(heading) * 2]
  };
}

export function createCharacterActivityController(
  entities,
  { sessionSeed = createSessionSeed(), initialPlacement = 'random' } = {}
) {
  const navigation = createOfficeNavigation();
  const destinations = new Map(OFFICE_ACTIVITY_DESTINATIONS.map((entry) => [entry.id, entry]));
  const reservations = new Map();
  let snapshot = null;
  let clock = 0;
  let disposed = false;
  let dirty = true;
  let motionEnabled = false;
  let initialPlacementConsumed = false;
  const records = Object.entries(entities).map(([key, entity], index) => {
    const home = destinations.get(key === 'hq_lab_director' ? 'standing:hq' : `desk:${key}`);
    const current = destinations.get(entity.seat?.id) ?? home;
    const random = seededRandom(sessionSeed === '' ? key : `${sessionSeed}:${key}`);
    reservations.set(current.id, key);
    return {
      key,
      entity,
      index,
      home,
      random,
      state: 'offline',
      current,
      target: null,
      poseSeat: entity.seat,
      sitBlend: entity.seat?.kind === 'standing' ? 0 : 1,
      phase: entity.seat?.kind === 'standing' ? 'standing' : 'seated',
      route: [],
      access: null,
      resumePhase: null,
      blockedSeconds: 0,
      retryAt: 0,
      walkDistance: 0,
      walking: false,
      arrivalId: 0,
      arrivedAt: 0,
      arrivalPending: false,
      deadline: 11 + index * 4 + random() * 8,
      yielded: 0,
      previousKind: current.kind
    };
  });

  const canMove = () =>
    !disposed &&
    snapshot?.gates?.dataFresh === true &&
    snapshot.gates.visible === true &&
    snapshot.gates.reducedMotion === false &&
    snapshot.gates.allowWorkMotion === true;
  const canWander = (record) =>
    canMove() && snapshot?.gates?.allowAmbient === true && record.state === 'siaga';

  function initializeIdlePlacement() {
    const placed = new Set();
    if (
      initialPlacementConsumed ||
      snapshot?.gates?.dataFresh !== true ||
      snapshot.gates.visible !== true
    )
      return placed;
    // A reduced-motion first snapshot keeps the anchors; later gate changes never teleport.
    initialPlacementConsumed = true;
    if (initialPlacement !== 'random' || !canMove() || !snapshot.gates.allowAmbient) return placed;
    for (const record of records) {
      if (!canWander(record)) continue;
      const choices = OFFICE_ACTIVITY_DESTINATIONS.filter(
        (entry) =>
          !['desk', 'board'].includes(entry.kind) &&
          !reservations.has(entry.id) &&
          records.every(
            (other) =>
              other === record ||
              Math.hypot(
                entry.position[0] - other.entity.root.position.x,
                entry.position[2] - other.entity.root.position.z
              ) >= PERSONAL_SPACE
          )
      );
      const start = Math.floor(record.random() * choices.length);
      let destination = null;
      for (let offset = 0; offset < choices.length; offset += 1) {
        const candidate = choices[(start + offset) % choices.length];
        if (navigation.findPath(candidate.approach, record.home.approach, avoidPositions(record))) {
          destination = candidate;
          break;
        }
      }
      if (!destination) continue;
      releaseUnoccupied(record);
      if (record.current) releaseDestination(record, record.current.id);
      reservations.set(destination.id, record.key);
      record.entity.root.position.set(
        destination.position[0],
        ROOM_LAYOUT.floorY,
        destination.position[2]
      );
      record.entity.root.rotation.y = destination.heading;
      record.current = destination;
      record.previousKind = destination.kind;
      record.target = null;
      record.poseSeat = destination.seat;
      record.entity.seat = destination.seat;
      record.sitBlend = destination.seat && destination.seat.kind !== 'standing' ? 1 : 0;
      record.route = [];
      record.access = null;
      record.resumePhase = null;
      record.arrivalPending = false;
      record.walking = false;
      record.blockedSeconds = 0;
      record.retryAt = 0;
      record.yielded = 0;
      record.arrivedAt = clock;
      record.deadline = clock + 38 + record.random() * 34;
      setPhase(record, record.sitBlend === 1 ? 'seated' : 'standing');
      placed.add(record.key);
      dirty = true;
    }
    return placed;
  }

  function setPhase(record, phase) {
    if (record.phase !== phase) {
      record.phase = phase;
      dirty = true;
    }
  }

  function completeArrival(record) {
    if (!record.arrivalPending) return;
    record.arrivalPending = false;
    record.arrivalId += 1;
    record.arrivedAt = clock;
    // A delayed route must still leave time for reaching the mug and the first sip.
    record.deadline = Math.max(record.deadline, clock + MIN_ARRIVAL_DWELL_SECONDS);
    dirty = true;
  }

  function releaseUnoccupied(record) {
    const occupied =
      record.current && distanceTo(record.entity.root, record.current.position) < 0.025
        ? record.current.id
        : null;
    for (const [id, owner] of reservations) {
      if (owner === record.key && id !== record.access?.destination.id && id !== occupied)
        reservations.delete(id);
    }
  }

  function releaseDestination(record, id) {
    if (reservations.get(id) === record.key) reservations.delete(id);
  }

  function startAccess(record, destination, direction) {
    record.access = {
      destination,
      direction,
      trail: [record.entity.root.position.toArray()]
    };
  }

  function freeze(record) {
    if (record.phase !== 'paused') {
      if (record.phase !== 'waiting-route') record.resumePhase = record.phase;
      setPhase(record, 'paused');
    }
    releaseUnoccupied(record);
    record.walking = false;
    record.yielded = 0;
    record.blockedSeconds = 0;
    if (record.current && distanceTo(record.entity.root, record.current.position) > 1e-8)
      record.current = null;
    if (
      !record.access &&
      record.poseSeat &&
      distanceTo(record.entity.root, record.poseSeat.position) > 1e-8
    ) {
      record.poseSeat = null;
      record.entity.seat = null;
    }
    dirty = true;
  }

  function hasMovingSlot(record) {
    return (
      record.state !== 'siaga' ||
      records.filter((other) => other !== record && MOVING_PHASES.has(other.phase)).length < 2
    );
  }

  function waitForRoute(record) {
    record.resumePhase = record.phase;
    record.walking = false;
    record.blockedSeconds = 0;
    record.yielded = 0;
    record.retryAt = clock + 3 + record.index * 0.4;
    releaseUnoccupied(record);
    setPhase(record, 'waiting-route');
  }

  function startRecovery(record) {
    // Reverse only checkpoints reached through this fixture's access corridor.
    record.route = record.access.trail
      .slice()
      .reverse()
      .map((point) => [...point]);
    record.blockedSeconds = 0;
    record.yielded = 0;
    record.walking = false;
    if (record.state === 'siaga') {
      record.target = null;
      record.arrivalPending = false;
      releaseUnoccupied(record);
    }
    setPhase(record, 'recovering');
  }

  function resumeJourney(record) {
    const phase = record.resumePhase;
    if (!MOVING_PHASES.has(phase)) return false;
    if (record.target) {
      const owner = reservations.get(record.target.id);
      if (owner && owner !== record.key) {
        if (record.access) {
          startRecovery(record);
          if (!hasMovingSlot(record)) waitForRoute(record);
        } else {
          record.target = null;
          record.route = [];
          record.arrivalPending = false;
          record.resumePhase = null;
          record.deadline = clock + 6 + record.index * 0.4;
          setPhase(record, 'standing');
        }
        return true;
      }
      reservations.set(record.target.id, record.key);
    }
    record.resumePhase = null;
    setPhase(record, phase);
    if (!hasMovingSlot(record)) waitForRoute(record);
    return true;
  }

  function avoidPositions(record) {
    return records
      .filter((other) => other !== record)
      .map((other) => other.entity.root.position.toArray());
  }

  function planRoute(record) {
    const path = navigation.findPath(
      record.entity.root.position.toArray(),
      record.target.approach,
      avoidPositions(record)
    );
    if (!path) {
      if (record.target.id !== record.poseSeat?.id) releaseDestination(record, record.target.id);
      record.target = null;
      record.arrivalPending = false;
      record.deadline = clock + 7 + record.random() * 5;
      setPhase(record, record.poseSeat && record.sitBlend > 0.5 ? 'seated' : 'standing');
      return false;
    }
    record.route = path;
    record.yielded = 0;
    record.blockedSeconds = 0;
    setPhase(record, 'walking');
    return true;
  }

  function beginJourney(record, target) {
    if (!target || (reservations.has(target.id) && reservations.get(target.id) !== record.key))
      return false;
    releaseUnoccupied(record);
    reservations.set(target.id, record.key);
    record.target = target;
    record.walking = false;
    record.arrivalPending = true;
    record.deadline = clock + 38 + record.random() * 34;
    if (record.access) {
      const phase = ['paused', 'waiting-route'].includes(record.phase)
        ? record.resumePhase
        : record.phase;
      record.resumePhase = null;
      if (phase === 'recovering') setPhase(record, 'recovering');
      else if (record.access.direction === 'out') setPhase(record, 'undocking');
      else startRecovery(record);
      return true;
    }
    record.route = [];
    record.resumePhase = null;
    if (
      distanceTo(record.entity.root, target.position) <= 1e-8 &&
      record.poseSeat?.id === target.seat?.id
    ) {
      record.current = target;
      record.arrivalPending = false;
      const seated = target.seat && target.seat.kind !== 'standing';
      setPhase(record, seated ? (record.sitBlend >= 1 ? 'seated' : 'sitting') : 'standing');
      if (!seated) {
        record.target = null;
        record.deadline = clock + 38 + record.random() * 34;
      }
      return true;
    }
    if (record.poseSeat?.kind !== 'standing' && record.poseSeat) {
      if (record.sitBlend > 0) setPhase(record, 'releasing');
      else {
        const from = destinations.get(record.poseSeat.id);
        record.route = [...from.access].reverse().map((point) => [...point]);
        record.route.push([...from.approach]);
        startAccess(record, from, 'out');
        setPhase(record, 'undocking');
      }
      return true;
    }
    if (record.poseSeat?.id !== target.id) {
      if (record.poseSeat) releaseDestination(record, record.poseSeat.id);
      record.poseSeat = null;
      record.entity.seat = null;
    }
    if (record.current?.id !== target.id) {
      if (record.current) releaseDestination(record, record.current.id);
      record.current = null;
    }
    return planRoute(record);
  }

  function restoreIdle(record, preserveDeadline = false) {
    if (MOVING_PHASES.has(record.phase)) {
      if (!hasMovingSlot(record)) waitForRoute(record);
      return;
    }
    if (resumeJourney(record)) return;
    record.route = [];
    record.target = null;
    record.walking = false;
    releaseUnoccupied(record);
    if (!preserveDeadline) record.deadline = clock + 9 + record.index * 3 + record.random() * 7;
    const current = record.current;
    if (current && distanceTo(record.entity.root, current.position) <= 1e-8) {
      reservations.set(current.id, record.key);
      record.target = current;
      if (current.seat && current.seat.kind !== 'standing') {
        record.poseSeat = current.seat;
        setPhase(record, record.sitBlend >= 1 ? 'seated' : 'sitting');
      } else {
        record.poseSeat = current.seat?.kind === 'standing' ? current.seat : null;
        setPhase(record, 'standing');
      }
    } else if (
      record.poseSeat &&
      record.poseSeat.kind !== 'standing' &&
      distanceTo(record.entity.root, record.poseSeat.position) <= 1e-8
    ) {
      record.current = destinations.get(record.poseSeat.id);
      record.target = record.current;
      reservations.set(record.current.id, record.key);
      setPhase(record, record.sitBlend >= 1 ? 'seated' : 'sitting');
    } else {
      record.poseSeat = null;
      record.current = null;
      setPhase(record, 'standing');
    }
    dirty = true;
  }

  function chooseDestination(record) {
    const choices = OFFICE_ACTIVITY_DESTINATIONS.filter(
      (entry) =>
        (entry.kind !== 'desk' || entry.id === record.home.id) &&
        (entry.kind !== 'board' || record.key === 'hq_lab_director') &&
        entry.id !== record.current?.id &&
        !reservations.has(entry.id)
    );
    const different = choices.filter((entry) => entry.kind !== record.previousKind);
    const pool = different.length ? different : choices;
    if (!pool.length) return null;
    const start = Math.floor(record.random() * pool.length);
    for (let offset = 0; offset < pool.length; offset++) {
      const candidate = pool[(start + offset) % pool.length];
      const origin = record.poseSeat
        ? destinations.get(record.poseSeat.id)?.approach
        : record.entity.root.position.toArray();
      if (origin && navigation.findPath(origin, candidate.approach, avoidPositions(record)))
        return candidate;
    }
    return null;
  }

  function turn(record, heading, delta, rate = SETTLE_TURN_RATE) {
    const error = angleDifference(record.entity.root.rotation.y, heading);
    record.entity.root.rotation.y += error * Math.min(1, delta * rate);
    return Math.abs(angleDifference(record.entity.root.rotation.y, heading));
  }

  function blockedByCharacter(record, nextX, nextZ) {
    return records.some((other) => {
      if (other === record) return false;
      const current = Math.hypot(
        record.entity.root.position.x - other.entity.root.position.x,
        record.entity.root.position.z - other.entity.root.position.z
      );
      const next = Math.hypot(
        nextX - other.entity.root.position.x,
        nextZ - other.entity.root.position.z
      );
      return next < PERSONAL_SPACE && next < current - 0.00001;
    });
  }

  function retreatRoute(record) {
    const nearby = records
      .filter((other) => other !== record)
      .sort(
        (left, right) =>
          record.entity.root.position.distanceToSquared(left.entity.root.position) -
          record.entity.root.position.distanceToSquared(right.entity.root.position)
      )[0];
    if (!nearby) return null;
    const dx = record.entity.root.position.x - nearby.entity.root.position.x;
    const dz = record.entity.root.position.z - nearby.entity.root.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.001) return null;
    const retreat = [
      record.entity.root.position.x + (dx / distance) * 0.22,
      ROOM_LAYOUT.floorY,
      record.entity.root.position.z + (dz / distance) * 0.22
    ];
    const approach = navigation.findPath(record.entity.root.position.toArray(), retreat);
    const detour =
      approach && navigation.findPath(retreat, record.target.approach, avoidPositions(record));
    return detour ? [...approach, ...detour] : null;
  }

  function walkRoute(record, delta) {
    record.walking = false;
    const point = record.route[0];
    if (!point) return true;
    const distance = distanceTo(record.entity.root, point);
    if (distance === 0) {
      if (record.access && ['undocking', 'arriving'].includes(record.phase))
        record.access.trail.push([...point]);
      record.route.shift();
      return record.route.length === 0;
    }
    if (delta === 0) return false;
    const dx = point[0] - record.entity.root.position.x;
    const dz = point[2] - record.entity.root.position.z;
    turn(record, Math.atan2(dx, dz), delta, WALK_TURN_RATE);
    const step = Math.min(distance, WALK_SPEED * delta);
    const nextX =
      step === distance ? point[0] : record.entity.root.position.x + (dx / distance) * step;
    const nextZ =
      step === distance ? point[2] : record.entity.root.position.z + (dz / distance) * step;
    if (blockedByCharacter(record, nextX, nextZ)) {
      record.yielded += delta;
      record.blockedSeconds += delta;
      if (record.blockedSeconds >= BLOCKED_SECONDS) {
        if (record.access && ['undocking', 'arriving'].includes(record.phase))
          startRecovery(record);
        else waitForRoute(record);
        return false;
      }
      if (record.yielded >= REPLAN_SECONDS && record.phase === 'walking') {
        const alternative = navigation.findPath(
          record.entity.root.position.toArray(),
          record.target.approach,
          avoidPositions(record)
        );
        const retreat = retreatRoute(record);
        if (retreat || alternative) record.route = retreat ?? alternative;
        record.yielded = 0;
      }
      return false;
    }
    record.yielded = 0;
    record.blockedSeconds = 0;
    record.walking = step > 0;
    record.walkDistance += step;
    record.entity.root.position.set(nextX, ROOM_LAYOUT.floorY, nextZ);
    if (step >= distance) {
      if (record.access && ['undocking', 'arriving'].includes(record.phase))
        record.access.trail.push([...point]);
      record.route.shift();
    }
    return record.route.length === 0;
  }

  function finishRecovery(record) {
    const { destination, direction } = record.access;
    record.access = null;
    record.resumePhase = null;
    record.arrivalPending = false;
    record.target = null;
    record.walking = false;
    record.deadline = clock + 6 + record.index * 0.4;
    if (direction === 'out') {
      record.current = destination;
      record.poseSeat = destination.seat;
      record.sitBlend = 0;
      record.entity.seat = null;
      setPhase(record, 'sitting');
    } else {
      releaseDestination(record, destination.id);
      record.current = null;
      record.poseSeat = null;
      record.entity.seat = null;
      setPhase(record, 'standing');
      if (record.state !== 'siaga') beginJourney(record, record.home);
    }
  }

  function finishArrival(record) {
    const target = record.target;
    record.access = null;
    record.resumePhase = null;
    record.current = target;
    record.previousKind = target.kind;
    record.poseSeat = target.seat;
    record.sitBlend = 0;
    record.entity.seat = target.seat?.kind === 'standing' ? target.seat : null;
    if (target.seat && target.seat.kind !== 'standing') setPhase(record, 'sitting');
    else {
      record.target = null;
      setPhase(record, 'standing');
      completeArrival(record);
    }
  }

  function renderPose(record, deltaSeconds = 0) {
    const enabled = canMove();
    const moving = enabled && WALKING_PHASES.has(record.phase) && record.walking;
    const settled =
      !MOVING_PHASES.has(record.phase) && !['paused', 'waiting-route'].includes(record.phase);
    const neutral =
      !enabled ||
      record.phase === 'paused' ||
      record.state === 'gagal' ||
      record.state === 'menunggu_persetujuan' ||
      !settled;
    const inWalkway = WALKING_PHASES.has(record.phase);
    const atSeat =
      record.poseSeat && distanceTo(record.entity.root, record.poseSeat.position) < 0.05;
    const seat = inWalkway || !atSeat ? standAt(record.entity) : record.poseSeat;
    const blend = record.sitBlend * record.sitBlend * (3 - 2 * record.sitBlend);
    applyCharacterPose(record.entity, seat, clock, !enabled, {
      walking: moving,
      distance: record.walkDistance,
      walkPhase: record.walkDistance * (WALK_PHASE_RATE / WALK_SPEED),
      walkCycleDistance: (Math.PI * 2 * WALK_SPEED) / WALK_PHASE_RATE,
      seatBlend: blend,
      activity: settled && canWander(record) ? record.current?.kind : null,
      neutral: neutral && !moving,
      elapsedSinceArrival: Math.max(0, clock - record.arrivedAt),
      seed: record.index * 1.618,
      deltaSeconds
    });
  }

  function sample(record) {
    if (!canWander(record)) return null;
    if (WALKING_PHASES.has(record.phase)) return 'walking';
    if (['paused', 'waiting-route'].includes(record.phase)) return null;
    if (record.phase === 'releasing') return 'standing-up';
    if (record.phase === 'sitting') return 'settling';
    return record.current?.kind ?? null;
  }

  return {
    receive(presentationSnapshot) {
      if (disposed) return;
      const wasEnabled = motionEnabled;
      snapshot = presentationSnapshot;
      motionEnabled = canMove();
      const changedStates = new Map();
      for (const record of records) {
        const facts = snapshot?.agents?.[record.key]?.operational;
        const nextState = facts?.available === true ? facts.state : 'offline';
        changedStates.set(record.key, record.state !== nextState);
        record.state = nextState;
        record.entity.state = nextState;
      }
      const initiallyPlaced = initializeIdlePlacement();
      for (const record of records) {
        const nextState = record.state;
        const changed = changedStates.get(record.key);
        if (!motionEnabled || !['siaga', 'bekerja', 'menunggu_persetujuan'].includes(nextState)) {
          if (changed || wasEnabled !== motionEnabled || record.phase !== 'paused') freeze(record);
        } else if (nextState === 'bekerja' || nextState === 'menunggu_persetujuan') {
          if (changed || !wasEnabled || record.phase === 'paused') {
            if (record.target?.id !== record.home.id || !resumeJourney(record))
              beginJourney(record, record.home);
          }
        } else if (
          nextState === 'siaga' &&
          !initiallyPlaced.has(record.key) &&
          (changed || !wasEnabled || record.phase === 'paused')
        ) {
          restoreIdle(record, !changed);
        }
        if (changed || wasEnabled !== motionEnabled) dirty = true;
        renderPose(record);
      }
    },
    update(deltaSeconds, elapsedSeconds = deltaSeconds) {
      if (disposed) return false;
      const delta = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(deltaSeconds, 0.25)) : 0;
      const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
      if (canMove()) clock += elapsed;
      for (const record of records) {
        if (!canMove() || !['siaga', 'bekerja', 'menunggu_persetujuan'].includes(record.state))
          continue;
        if (record.phase === 'releasing') {
          record.sitBlend = Math.max(0, record.sitBlend - delta / SEAT_TRANSITION_SECONDS);
          record.entity.seat = record.sitBlend > 0.5 ? record.poseSeat : null;
          if (record.sitBlend === 0) {
            const current = destinations.get(record.poseSeat.id);
            record.route = [...current.access].reverse().map((point) => [...point]);
            record.route.push([...current.approach]);
            startAccess(record, current, 'out');
            setPhase(record, 'undocking');
          }
        } else if (record.phase === 'undocking') {
          if (walkRoute(record, delta)) {
            const source = record.access.destination;
            if (source.id !== record.target?.id) releaseDestination(record, source.id);
            record.access = null;
            record.poseSeat = null;
            record.current = null;
            record.entity.seat = null;
            planRoute(record);
          }
        } else if (record.phase === 'walking') {
          if (walkRoute(record, delta)) {
            record.route = [
              ...record.target.access.map((point) => [...point]),
              [...record.target.position]
            ];
            startAccess(record, record.target, 'in');
            setPhase(record, 'arriving');
          }
        } else if (record.phase === 'arriving') {
          if (walkRoute(record, delta) && turn(record, record.target.heading, delta) < 0.025)
            finishArrival(record);
        } else if (record.phase === 'recovering') {
          if (walkRoute(record, delta)) {
            const heading = record.access.destination.heading;
            if (record.access.direction === 'in' || turn(record, heading, delta) < 0.025)
              finishRecovery(record);
          }
        } else if (record.phase === 'waiting-route') {
          record.walking = false;
          if (clock >= record.retryAt && hasMovingSlot(record)) resumeJourney(record);
        } else if (record.phase === 'sitting') {
          record.sitBlend = Math.min(1, record.sitBlend + delta / SEAT_TRANSITION_SECONDS);
          record.entity.seat = record.sitBlend > 0.5 ? record.poseSeat : null;
          if (record.sitBlend === 1) {
            record.target = null;
            setPhase(record, 'seated');
            completeArrival(record);
          }
        } else if (['standing', 'seated'].includes(record.phase)) {
          record.walking = false;
          if (canWander(record) && clock >= record.deadline) {
            const moving = records.filter((other) => MOVING_PHASES.has(other.phase)).length;
            if (moving < 2) {
              const target = chooseDestination(record);
              if (target) beginJourney(record, target);
              else record.deadline = clock + 8 + record.random() * 7;
            }
          } else if (
            record.state !== 'siaga' &&
            record.current?.id !== record.home.id &&
            clock >= record.deadline
          ) {
            beginJourney(record, record.home);
          }
        }
        renderPose(record, delta);
      }
      const changed = dirty;
      dirty = false;
      return changed;
    },
    getSamples() {
      if (disposed) return {};
      return Object.fromEntries(
        records.flatMap((record) => {
          const kind = sample(record);
          return kind ? [[record.key, kind]] : [];
        })
      );
    },
    getActivities() {
      if (disposed) return {};
      return Object.fromEntries(
        records.map((record) => {
          const kind = sample(record) ?? 'neutral';
          const returning = record.state !== 'siaga' && MOVING_PHASES.has(record.phase);
          const activity = {
            kind,
            zone: kind === 'walking' || returning ? 'walkway' : (record.current?.zone ?? 'walkway'),
            phase: returning ? 'returning' : record.phase,
            destinationId: record.current?.id ?? null,
            arrivalId: record.arrivalId,
            position: record.entity.root.position.toArray()
          };
          record.entity.activity = activity;
          return [record.key, activity];
        })
      );
    },
    dispose() {
      disposed = true;
      snapshot = null;
      reservations.clear();
      for (const record of records) {
        record.route = [];
        record.access = null;
        record.resumePhase = null;
        record.target = null;
        record.entity.activity = null;
      }
    }
  };
}
