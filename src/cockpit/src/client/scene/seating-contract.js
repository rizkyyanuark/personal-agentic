export const CHAIR_SURFACE_HEIGHT = 0.472405;
export const SOFA_SURFACE_HEIGHT = 0.54;
export const CHAIR_CHARACTER_FORWARD = 0.1;
export const DESK_CHAIR_OFFSET = 0.9;
export const SOFA_SEAT_OFFSETS = Object.freeze([
  Object.freeze([-0.58, 0, 0.12]),
  Object.freeze([0.58, 0, 0.12])
]);

export const CHARACTER_RIG = Object.freeze({
  thighLength: 0.32,
  shinLength: CHAIR_SURFACE_HEIGHT + 0.05,
  thighRadius: 0.1,
  shoeHalfHeight: 0.05,
  armLength: 0.35,
  handRadius: 0.07
});
