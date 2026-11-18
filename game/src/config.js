// SOLMAR BAY — every tuning number and colour in one place.
// The world is one fixed 3600 x 2600 city; the camera shows a window of it, so no rule
// below depends on the screen size. All speeds are pixels per second, all times seconds.
export const STEP = 1 / 60;

export const WORLD = { width: 3600, height: 2600 };

/** The beach strip on the west edge: water, then sand, then the boardwalk road. */
export const BEACH = { waterX: 170, sandX: 360, boardwalkX: 470 };

/** Streets: centre lines of the road grid. Roads are 96 px wide with a 26 px sidewalk. */
export const STREETS_X = [560, 1000, 1440, 1880, 2320, 2760, 3200];
export const STREETS_Y = [420, 860, 1300, 1740, 2180];
export const ROAD_HALF = 48;
export const WALK_HALF = 74;

/** Fixed-step loop tuning. */
export const PLAYER = {
  radius: 13,
  walkSpeed: 265,
  health: 100,
};

export const CAR = {
  length: 54,
  width: 26,
  accel: 430,
  brake: 620,
  reverseMax: 210,
  maxSpeed: 540,
  grip: 7.5,
  handbrakeGrip: 2.2,
  turnRate: 3.4,
  health: 100,
};

export const TRAFFIC = { count: 14, speedMin: 150, speedMax: 250 };
export const PEDS = { count: 22, speedMin: 42, speedMax: 78 };
export const POLICE = { maxCars: 6, speed: 560, ramDamage: 3, ramCooldown: 2.5 };

export const WANTED = {
  max: 5,
  decaySeconds: 6,
  copSightRange: 560,
  bustSeconds: 1.2,
};

/** Mission cash rewards, in order. */
export const MISSION_REWARDS = [500, 1200, 800, 5000];

export const SAVE_KEY = 'solmar-bay.save.v1';

/** Sunset coast palette: warm sand, teal water, coral and cream buildings. */
export const PALETTE = {
  grass: '#7fae62',
  grassDark: '#74a258',
  sand: '#e8c98f',
  sandWet: '#d9b878',
  water: '#2f8fa8',
  waterDeep: '#22728c',
  road: '#3a3f4a',
  roadLine: '#e8d27a',
  sidewalk: '#b9b2a2',
  curb: '#8f887a',
  park: '#5d9b4a',
  parkPath: '#cbb98a',
  buildingRoof: ['#c96f4a', '#d99a5b', '#e8b04b', '#7fa8a0', '#b0708a', '#8a7fb0', '#d97b6c', '#6f9bc9'],
  buildingWall: '#e8dcc8',
  glass: '#9fd4e0',
  player: '#ff5a4e',
  playerShirt: '#ffd23f',
  cop: '#2b4acb',
  copLightRed: '#ff2e2e',
  copLightBlue: '#2e7bff',
  marker: '#ffd23f',
  markerGreen: '#3ddc84',
  hudPanel: 'rgba(12, 16, 28, 0.72)',
  hudText: '#f5efe0',
  hudMuted: '#c9c2ae',
  star: '#ffd23f',
  starEmpty: '#5a5f6e',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
