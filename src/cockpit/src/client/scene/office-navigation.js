import { DESK_CONFIGS, FURNITURE_LAYOUT, ROOM_LAYOUT } from './office-layout.js';
import { DIRECTOR_ANCHOR, DESK_SEATS, MEETING_SEATS, SOFA_SEATS } from './seat-registry.js';

export const CHARACTER_CLEARANCE = 0.27;
const CORNER_CLEARANCE = 0.035;
const EPSILON = 0.00001;

function rectangle(id, x, z, width, depth, clearance = CHARACTER_CLEARANCE) {
  return {
    id,
    shape: 'rectangle',
    minX: x - width / 2 - clearance,
    maxX: x + width / 2 + clearance,
    minZ: z - depth / 2 - clearance,
    maxZ: z + depth / 2 + clearance
  };
}

function circle(id, x, z, radius, clearance = CHARACTER_CLEARANCE) {
  return { id, shape: 'circle', x, z, radius: radius + clearance };
}

const obstacles = [
  ...DESK_CONFIGS.map((desk) => rectangle(`table:${desk.key}`, desk.x, desk.z, 1.88, 0.98)),
  ...DESK_SEATS.map((seat) => rectangle(seat.id, seat.fixture.x, seat.fixture.z, 0.64, 0.62)),
  circle('meeting-table', FURNITURE_LAYOUT.meeting.x, FURNITURE_LAYOUT.meeting.z, 0.98),
  ...MEETING_SEATS.map((seat) => circle(seat.id, seat.fixture.x, seat.fixture.z, 0.44)),
  rectangle('sofa', FURNITURE_LAYOUT.lounge.x, FURNITURE_LAYOUT.lounge.z, 2.1, 0.9),
  rectangle('coffee-table', FURNITURE_LAYOUT.lounge.x, FURNITURE_LAYOUT.lounge.z - 1.05, 1.3, 0.65),
  rectangle('tv', FURNITURE_LAYOUT.tv.x, FURNITURE_LAYOUT.tv.z, 2.2, 0.45),
  rectangle('pantry', FURNITURE_LAYOUT.pantry.x, FURNITURE_LAYOUT.pantry.z - 0.12, 2.5, 0.96),
  rectangle(
    'dispenser',
    FURNITURE_LAYOUT.pantry.x + 1.6,
    FURNITURE_LAYOUT.pantry.z - 0.39,
    0.36,
    0.42
  ),
  rectangle('bookshelf', FURNITURE_LAYOUT.bookshelf.x, FURNITURE_LAYOUT.bookshelf.z, 0.42, 2.3),
  ...FURNITURE_LAYOUT.plants.map((plant) =>
    circle(`plant:${plant.zone}`, plant.x, plant.z, 0.3 * plant.scale)
  )
];

const limits = Object.freeze({
  minX: ROOM_LAYOUT.min[0] + 0.12 + CHARACTER_CLEARANCE,
  maxX: ROOM_LAYOUT.max[0] - 0.12 - CHARACTER_CLEARANCE,
  minZ: ROOM_LAYOUT.min[2] + 0.12 + CHARACTER_CLEARANCE,
  maxZ: ROOM_LAYOUT.max[2] - 0.12 - CHARACTER_CLEARANCE
});

function contains(obstacle, point) {
  if (obstacle.shape === 'circle')
    return Math.hypot(point[0] - obstacle.x, point[2] - obstacle.z) < obstacle.radius - EPSILON;
  return (
    point[0] > obstacle.minX + EPSILON &&
    point[0] < obstacle.maxX - EPSILON &&
    point[2] > obstacle.minZ + EPSILON &&
    point[2] < obstacle.maxZ - EPSILON
  );
}

function intersects(obstacle, from, to) {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  if (obstacle.shape === 'circle') {
    const lengthSquared = dx * dx + dz * dz;
    const fraction =
      lengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((obstacle.x - from[0]) * dx + (obstacle.z - from[2]) * dz) / lengthSquared)
          );
    return (
      Math.hypot(from[0] + dx * fraction - obstacle.x, from[2] + dz * fraction - obstacle.z) <
      obstacle.radius - EPSILON
    );
  }
  let enter = 0;
  let exit = 1;
  for (const [start, step, min, max] of [
    [from[0], dx, obstacle.minX, obstacle.maxX],
    [from[2], dz, obstacle.minZ, obstacle.maxZ]
  ]) {
    if (Math.abs(step) < EPSILON) {
      if (start <= min + EPSILON || start >= max - EPSILON) return false;
      continue;
    }
    const first = (min - start) / step;
    const second = (max - start) / step;
    enter = Math.max(enter, Math.min(first, second));
    exit = Math.min(exit, Math.max(first, second));
    if (enter >= exit - EPSILON) return false;
  }
  return enter < exit - EPSILON && exit > EPSILON && enter < 1 - EPSILON;
}

function insideRoom(point) {
  return (
    point[0] >= limits.minX &&
    point[0] <= limits.maxX &&
    point[2] >= limits.minZ &&
    point[2] <= limits.maxZ
  );
}

function corners(obstacle) {
  if (obstacle.shape === 'circle') {
    const radius = (obstacle.radius + CORNER_CLEARANCE) / Math.cos(Math.PI / 8);
    return Array.from({ length: 8 }, (_, index) => {
      const angle = (index * Math.PI) / 4;
      return [
        obstacle.x + Math.cos(angle) * radius,
        ROOM_LAYOUT.floorY,
        obstacle.z + Math.sin(angle) * radius
      ];
    });
  }
  return [
    [obstacle.minX - CORNER_CLEARANCE, ROOM_LAYOUT.floorY, obstacle.minZ - CORNER_CLEARANCE],
    [obstacle.maxX + CORNER_CLEARANCE, ROOM_LAYOUT.floorY, obstacle.minZ - CORNER_CLEARANCE],
    [obstacle.maxX + CORNER_CLEARANCE, ROOM_LAYOUT.floorY, obstacle.maxZ + CORNER_CLEARANCE],
    [obstacle.minX - CORNER_CLEARANCE, ROOM_LAYOUT.floorY, obstacle.maxZ + CORNER_CLEARANCE]
  ];
}

function destination(
  id,
  kind,
  zone,
  position,
  heading,
  seat = null,
  approach = position,
  access = []
) {
  return Object.freeze({
    id,
    kind,
    zone,
    position: Object.freeze([...position]),
    heading,
    seat,
    approach: Object.freeze([...approach]),
    access: Object.freeze(access.map((point) => Object.freeze(point)))
  });
}

function seatedDestination(seat) {
  if (seat.kind === 'desk') {
    return destination(seat.id, 'desk', 'workstations', seat.position, seat.heading, seat, [
      seat.position[0] + 0.82,
      ROOM_LAYOUT.floorY,
      seat.position[2] + 0.05
    ]);
  }
  if (seat.kind === 'sofa') {
    const side = Math.sign(seat.position[0] - FURNITURE_LAYOUT.lounge.x);
    const approach = [
      FURNITURE_LAYOUT.lounge.x + side * 1.66,
      ROOM_LAYOUT.floorY,
      seat.position[2] - 0.4
    ];
    return destination(seat.id, 'sofa', 'lounge', seat.position, seat.heading, seat, approach, [
      [seat.position[0], ROOM_LAYOUT.floorY, seat.position[2] - 0.22]
    ]);
  }
  const dx = seat.position[0] - FURNITURE_LAYOUT.meeting.x;
  const dz = seat.position[2] - FURNITURE_LAYOUT.meeting.z;
  const radius = Math.hypot(dx, dz);
  const approach = [
    seat.position[0] + (dx / radius) * 0.52 + (dz / radius) * 0.65,
    ROOM_LAYOUT.floorY,
    seat.position[2] + (dz / radius) * 0.52 - (dx / radius) * 0.65
  ];
  return destination(seat.id, 'meeting', 'meeting', seat.position, seat.heading, seat, approach);
}

export const OFFICE_ACTIVITY_DESTINATIONS = Object.freeze([
  ...DESK_SEATS.map(seatedDestination),
  ...SOFA_SEATS.map(seatedDestination),
  ...MEETING_SEATS.map(seatedDestination),
  destination(
    DIRECTOR_ANCHOR.id,
    'board',
    'board',
    DIRECTOR_ANCHOR.position,
    DIRECTOR_ANCHOR.heading,
    DIRECTOR_ANCHOR
  ),
  destination('coffee:left', 'coffee', 'pantry', [6.7, ROOM_LAYOUT.floorY, -5.65], Math.PI),
  destination('coffee:right', 'coffee', 'pantry', [7.55, ROOM_LAYOUT.floorY, -5.65], Math.PI),
  destination(
    'reading:left',
    'reading',
    'bookshelf',
    [-7.85, ROOM_LAYOUT.floorY, 3.0],
    -Math.PI / 2
  ),
  destination(
    'reading:right',
    'reading',
    'bookshelf',
    [-7.85, ROOM_LAYOUT.floorY, 4.1],
    -Math.PI / 2
  )
]);

export function createOfficeNavigation() {
  const baseCorners = obstacles
    .flatMap(corners)
    .filter((point) => insideRoom(point) && !obstacles.some((entry) => contains(entry, point)));
  const free = (point, entries) =>
    insideRoom(point) && !entries.some((entry) => contains(entry, point));
  const clear = (from, to, entries) =>
    free(from, entries) &&
    free(to, entries) &&
    !entries.some((entry) => intersects(entry, from, to));

  return {
    isFree(point) {
      return free(point, obstacles);
    },
    findPath(from, to, avoid = []) {
      const dynamic = avoid
        .filter(
          (point) =>
            Math.hypot(point[0] - from[0], point[2] - from[2]) > 0.64 &&
            Math.hypot(point[0] - to[0], point[2] - to[2]) > 0.64
        )
        .map((point, index) => circle(`character:${index}`, point[0], point[2], 0.64, 0));
      const entries = [...obstacles, ...dynamic];
      if (!free(from, entries) || !free(to, entries)) return null;
      if (clear(from, to, entries)) return [[...to]];
      const nodes = [
        [...from],
        [...to],
        ...baseCorners.filter((point) => free(point, entries)),
        ...dynamic.flatMap(corners).filter((point) => free(point, entries))
      ];
      const distances = nodes.map(() => Infinity);
      const previous = nodes.map(() => -1);
      const visited = new Set();
      distances[0] = 0;
      while (visited.size < nodes.length) {
        let current = -1;
        for (let index = 0; index < nodes.length; index++) {
          if (!visited.has(index) && (current === -1 || distances[index] < distances[current]))
            current = index;
        }
        if (current === -1 || !Number.isFinite(distances[current])) return null;
        if (current === 1) {
          const path = [];
          for (let index = 1; index !== 0; index = previous[index]) path.unshift(nodes[index]);
          return path;
        }
        visited.add(current);
        for (let next = 0; next < nodes.length; next++) {
          if (visited.has(next) || !clear(nodes[current], nodes[next], entries)) continue;
          const candidate =
            distances[current] +
            Math.hypot(nodes[next][0] - nodes[current][0], nodes[next][2] - nodes[current][2]);
          if (candidate < distances[next]) {
            distances[next] = candidate;
            previous[next] = current;
          }
        }
      }
      return null;
    }
  };
}
