import { CHARACTER_CONFIGS, DESK_CONFIGS, FURNITURE_LAYOUT, ROOM_LAYOUT } from './office-layout.js';
import {
  CHAIR_CHARACTER_FORWARD,
  CHAIR_SURFACE_HEIGHT,
  DESK_CHAIR_OFFSET,
  SOFA_SEAT_OFFSETS,
  SOFA_SURFACE_HEIGHT
} from './seating-contract.js';

function localToRoom(fixture, offset) {
  const sin = Math.sin(fixture.heading);
  const cos = Math.cos(fixture.heading);
  return Object.freeze([
    fixture.x + offset[0] * cos + offset[2] * sin,
    ROOM_LAYOUT.floorY + offset[1],
    fixture.z - offset[0] * sin + offset[2] * cos
  ]);
}

function seat({
  id,
  kind,
  roleKey,
  fixture,
  offset,
  surfaceHeight,
  lookTarget,
  bounds,
  footprint
}) {
  const position = localToRoom(fixture, offset);
  return Object.freeze({
    id,
    kind,
    roleKey,
    fixture: Object.freeze(fixture),
    position,
    surfaceY: ROOM_LAYOUT.floorY + surfaceHeight,
    heading: fixture.heading,
    lookTarget: Object.freeze(lookTarget),
    bounds: Object.freeze(bounds),
    footprint: Object.freeze(footprint)
  });
}

export const DESK_SEATS = Object.freeze(
  DESK_CONFIGS.map((desk) =>
    seat({
      id: `desk:${desk.key}`,
      kind: 'desk',
      roleKey: desk.key,
      fixture: { x: desk.x, z: desk.z + DESK_CHAIR_OFFSET, heading: Math.PI },
      offset: [0, 0, CHAIR_CHARACTER_FORWARD],
      surfaceHeight: CHAIR_SURFACE_HEIGHT,
      lookTarget: [desk.x, ROOM_LAYOUT.floorY + 1.24, desk.z - 0.22],
      bounds: [-0.23, 0.23, -0.14, 0.2],
      footprint: [0.62565, 0.59501]
    })
  )
);

export const SOFA_SEATS = Object.freeze(
  SOFA_SEAT_OFFSETS.map((offset, index) =>
    seat({
      id: `sofa:${index === 0 ? 'left' : 'right'}`,
      kind: 'sofa',
      fixture: { ...FURNITURE_LAYOUT.lounge },
      offset,
      surfaceHeight: SOFA_SURFACE_HEIGHT,
      lookTarget: [FURNITURE_LAYOUT.tv.x, ROOM_LAYOUT.floorY + 1.14, FURNITURE_LAYOUT.tv.z],
      bounds: [offset[0] - 0.245, offset[0] + 0.245, -0.1, 0.3],
      footprint: [2.1, 0.9]
    })
  )
);

export const MEETING_SEATS = Object.freeze(
  [0, 1, 2].map((index) => {
    const angle = (index / 3) * Math.PI * 2 + 0.5;
    const fixture = {
      x: FURNITURE_LAYOUT.meeting.x + Math.sin(angle) * 1.35,
      z: FURNITURE_LAYOUT.meeting.z + Math.cos(angle) * 1.35,
      heading: Math.atan2(-Math.sin(angle), -Math.cos(angle))
    };
    return seat({
      id: `meeting:${index}`,
      kind: 'meeting',
      fixture,
      offset: [0, 0, CHAIR_CHARACTER_FORWARD],
      surfaceHeight: CHAIR_SURFACE_HEIGHT,
      lookTarget: [
        FURNITURE_LAYOUT.meeting.x,
        ROOM_LAYOUT.floorY + 0.9,
        FURNITURE_LAYOUT.meeting.z
      ],
      bounds: [-0.23, 0.23, -0.14, 0.2],
      footprint: [0.62565, 0.59501]
    });
  })
);

const deskByRole = new Map(DESK_SEATS.map((entry) => [entry.roleKey, entry]));
const director = CHARACTER_CONFIGS.find((entry) => entry.home.posture === 'standing');
export const DIRECTOR_ANCHOR = Object.freeze({
  id: 'standing:hq',
  kind: 'standing',
  position: director.home.position,
  heading: director.home.heading,
  lookTarget: Object.freeze([director.home.position[0], 1.65, director.home.position[2] + 2])
});

export function allocateCharacterSeats(entities, { allowIdleSeating = true } = {}) {
  const assignments = {};
  let sofaIndex = 0;
  for (const config of CHARACTER_CONFIGS) {
    if (config.home.posture === 'standing') {
      assignments[config.key] = DIRECTOR_ANCHOR;
      continue;
    }
    const isIdle = allowIdleSeating && entities[config.key]?.state === 'siaga';
    assignments[config.key] =
      isIdle && sofaIndex < SOFA_SEATS.length
        ? SOFA_SEATS[sofaIndex++]
        : deskByRole.get(config.key);
  }
  return assignments;
}

export function getDeskSeat(roleKey) {
  return deskByRole.get(roleKey) ?? null;
}
