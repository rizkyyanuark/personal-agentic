import { OFFICE_ROLES } from '../../shared/office-contract.js';
import { CHAIR_CHARACTER_FORWARD, DESK_CHAIR_OFFSET } from './seating-contract.js';

export const ROOM_LAYOUT = Object.freeze({
  floorY: 0.012,
  min: Object.freeze([-9.5, 0, -7.5]),
  max: Object.freeze([9.5, 5.5, 6.5]),
  board: Object.freeze({ x: -2.4, y: 3.25, z: -7.34 }),
  windows: Object.freeze([-7.0, 3.5])
});

const placements = [
  { key: 'data_engineer', x: -1.8, z: -4.8, cluster: 'back' },
  { key: 'data_scientist', x: 1.8, z: -4.8, cluster: 'back' },
  { key: 'research_scientist', x: -1.8, z: -1.4, cluster: 'front' },
  { key: 'ml_engineer', x: 1.8, z: -1.4, cluster: 'front' }
];

export const DESK_CONFIGS = Object.freeze(
  placements.map((placement) =>
    Object.freeze({
      ...placement,
      name: OFFICE_ROLES.find((role) => role.key === placement.key).name
    })
  )
);

export const CHARACTER_CONFIGS = Object.freeze(
  OFFICE_ROLES.map((role) => {
    const desk = DESK_CONFIGS.find((item) => item.key === role.key);
    const home = desk
      ? {
          position: Object.freeze([
            desk.x,
            ROOM_LAYOUT.floorY,
            desk.z + DESK_CHAIR_OFFSET - CHAIR_CHARACTER_FORWARD
          ]),
          heading: Math.PI,
          posture: 'desk'
        }
      : {
          position: Object.freeze([-5.7, ROOM_LAYOUT.floorY, -6.0]),
          heading: 0,
          posture: 'standing'
        };
    return Object.freeze({ ...role, home: Object.freeze(home) });
  })
);

export const FURNITURE_LAYOUT = Object.freeze({
  pantry: Object.freeze({ x: 8.2, z: -6.45, heading: 0 }),
  dispenser: Object.freeze({ x: 9.05, z: -5.45, heading: -Math.PI / 2 }),
  lounge: Object.freeze({ x: 3.3, z: 4.3, heading: Math.PI }),
  tv: Object.freeze({ x: 3.3, z: 1.95, heading: 0 }),
  meeting: Object.freeze({ x: -6.8, z: 0.3, heading: 0 }),
  bookshelf: Object.freeze({ x: -9.08, z: 3.5, heading: Math.PI / 2 }),
  plants: Object.freeze([
    Object.freeze({ x: -8.75, z: -6.25, scale: 1.15, zone: 'back-left' }),
    Object.freeze({ x: 6.6, z: -6.4, scale: 0.8, zone: 'pantry-side' }),
    Object.freeze({ x: -8.5, z: 1.8, scale: 1.0, zone: 'bookshelf' }),
    Object.freeze({ x: 1.5, z: 4.35, scale: 1.0, zone: 'sofa-left' }),
    Object.freeze({ x: 8.6, z: 5.1, scale: 1.15, zone: 'front-right' })
  ])
});
