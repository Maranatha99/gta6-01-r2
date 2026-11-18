// The city of Solmar Bay: a road grid on the coast, a beach and boardwalk on the west edge,
// a central park, and named landmarks the missions point at. Everything is placed once from a
// seeded random, so the same seed always builds the same city.
import { BEACH, PALETTE, ROAD_HALF, STREETS_X, STREETS_Y, WALK_HALF, WORLD } from './config.js';
import { randomInt, randomPick } from './random.js';

/** The park block: between streets 1000..1440 and 860..1300. */
export const PARK = { x: 1000 + WALK_HALF, y: 860 + WALK_HALF, w: 1440 - 1000 - 2 * WALK_HALF, h: 1300 - 860 - 2 * WALK_HALF };

/** Named places the missions and the HUD refer to. */
export const LANDMARKS = {
  marina: { x: 2760, y: 2180, label: 'Marina' },
  parkPickup: { x: PARK.x + PARK.w / 2, y: PARK.y + PARK.h / 2, label: 'Palma Park' },
  docks: { x: 3200, y: 2260, label: 'Solmar Docks' },
  bank: { x: 2100, y: 730, label: 'Solmar Bank' },
  safehouse: { x: 780, y: 1960, label: "Mara's Safehouse" },
  plaza: { x: 1440, y: 420, label: 'Sunset Plaza' },
};

function roadRects() {
  const rects = [];
  for (const x of STREETS_X) rects.push({ x: x - ROAD_HALF, y: 0, w: ROAD_HALF * 2, h: WORLD.height });
  for (const y of STREETS_Y) rects.push({ x: 0, y: y - ROAD_HALF, w: WORLD.width, h: ROAD_HALF * 2 });
  return rects;
}

/** True when the point is on asphalt (not the sidewalk). */
export function isRoad(city, x, y) {
  for (const r of city.roads) {
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
  }
  return false;
}

/** True when the point is in the sea. */
export function isWater(x, y) {
  return x < BEACH.waterX;
}

/** True when the point is on sand. */
export function isSand(x, y) {
  return x >= BEACH.waterX && x < BEACH.sandX;
}

/**
 * Push a circle (x, y, radius) out of every building it overlaps. Returns the push-out
 * normal of the first building hit ({x, y}, pointing away from the wall), or null when
 * nothing was hit, so callers can slide along the wall instead of stopping dead.
 */
export function collideBuildings(city, body) {
  let normal = null;
  for (const b of city.buildings) {
    const nearestX = Math.max(b.x, Math.min(body.x, b.x + b.w));
    const nearestY = Math.max(b.y, Math.min(body.y, b.y + b.h));
    const dx = body.x - nearestX;
    const dy = body.y - nearestY;
    const distSq = dx * dx + dy * dy;
    if (distSq >= body.radius * body.radius) continue;
    if (distSq > 0.0001) {
      const dist = Math.sqrt(distSq);
      body.x = nearestX + (dx / dist) * body.radius;
      body.y = nearestY + (dy / dist) * body.radius;
      if (!normal) normal = { x: dx / dist, y: dy / dist };
    } else if (body.x < b.x + b.w / 2) {
      body.x = b.x - body.radius;
      if (!normal) normal = { x: -1, y: 0 };
    } else {
      body.x = b.x + b.w + body.radius;
      if (!normal) normal = { x: 1, y: 0 };
    }
  }
  return normal;
}

/** The closest point on the road network to (x, y): where traffic and police spawn. */
export function nearestRoadPoint(city, x, y) {
  let best = null;
  let bestDist = Infinity;
  const consider = (px, py) => {
    const d = (px - x) * (px - x) + (py - y) * (py - y);
    if (d < bestDist) {
      bestDist = d;
      best = { x: px, y: py };
    }
  };
  for (const sx of STREETS_X) consider(sx, Math.max(60, Math.min(WORLD.height - 60, y)));
  for (const sy of STREETS_Y) consider(Math.max(60, Math.min(WORLD.width - 60, x)), sy);
  return best;
}

/** A point on a random road, away from the given point, for spawning traffic and police. */
export function randomRoadPoint(random, awayFrom, minDist) {
  for (let tries = 0; tries < 20; tries += 1) {
    const vertical = random() < 0.5;
    const point = vertical
      ? { x: randomPick(random, STREETS_X), y: 80 + random() * (WORLD.height - 160) }
      : { x: 80 + random() * (WORLD.width - 160), y: randomPick(random, STREETS_Y) };
    const dx = point.x - awayFrom.x;
    const dy = point.y - awayFrom.y;
    if (dx * dx + dy * dy >= minDist * minDist) return point;
  }
  return { x: STREETS_X[0], y: STREETS_Y[0] };
}

export function buildCity(random) {
  const roads = roadRects();
  const buildings = [];
  const trees = [];
  const palms = [];

  // One building (or a small row) per city block, placed inside the block's inner rectangle.
  const xs = [BEACH.boardwalkX + 40, ...STREETS_X];
  const ys = [40, ...STREETS_Y];
  const xEdges = [...xs, WORLD.width - 40];
  const yEdges = [...ys, WORLD.height - 40];
  for (let bx = 0; bx < xEdges.length - 1; bx += 1) {
    for (let by = 0; by < yEdges.length - 1; by += 1) {
      const x0 = xEdges[bx] + WALK_HALF + 6;
      const y0 = yEdges[by] + WALK_HALF + 6;
      const x1 = xEdges[bx + 1] - WALK_HALF - 6;
      const y1 = yEdges[by + 1] - WALK_HALF - 6;
      if (x1 - x0 < 90 || y1 - y0 < 90) continue;
      // The park block stays green; the bank and safehouse blocks keep their landmark spots.
      const isPark = x0 >= PARK.x - 10 && y0 >= PARK.y - 10 && x1 <= PARK.x + PARK.w + 10 && y1 <= PARK.y + PARK.h + 10;
      if (isPark) continue;
      const isBankBlock = x0 > 1880 && x0 < 2320 && y0 > 420 && y0 < 860;
      const isSafeBlock = x0 > 560 && x0 < 1000 && y0 > 1740 && y0 < 2180;
      // Landmark blocks keep only their landmark building: a random one would overlap it.
      const count = isBankBlock || isSafeBlock ? 0 : randomInt(random, 1, 3);
      for (let n = 0; n < count; n += 1) {
        const w = randomInt(random, 90, Math.min(220, x1 - x0 - 20));
        const h = randomInt(random, 80, Math.min(190, y1 - y0 - 20));
        const x = randomInt(random, x0, Math.max(x0, x1 - w));
        const y = randomInt(random, y0, Math.max(y0, y1 - h));
        const colour = randomPick(random, PALETTE.buildingRoof);
        buildings.push({ x, y, w, h, colour, height: randomInt(random, 8, 26) });
      }
    }
  }

  // Landmark buildings, drawn bigger and labelled on the map.
  buildings.push({ x: LANDMARKS.bank.x - 110, y: LANDMARKS.bank.y - 100, w: 220, h: 140, colour: '#d9b25b', height: 30, label: 'SOLMAR BANK' });
  buildings.push({ x: LANDMARKS.safehouse.x - 80, y: LANDMARKS.safehouse.y - 55, w: 160, h: 110, colour: '#7fa8a0', height: 16, label: 'SAFEHOUSE' });

  // Trees fill the park; palms line the boardwalk and the marina.
  for (let i = 0; i < 46; i += 1) {
    trees.push({
      x: PARK.x + 24 + random() * (PARK.w - 48),
      y: PARK.y + 24 + random() * (PARK.h - 48),
      r: randomInt(random, 12, 20),
    });
  }
  for (let y = 120; y < WORLD.height - 120; y += 150) {
    palms.push({ x: BEACH.sandX + 26, y, r: 12 });
    palms.push({ x: BEACH.sandX + 26, y: y + 70, r: 10 });
  }
  for (let x = 2400; x < 3300; x += 130) palms.push({ x, y: 2260, r: 11 });

  return { roads, buildings, trees, palms };
}
