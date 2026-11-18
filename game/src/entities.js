// The other people in the city: traffic cars that drive the road grid, pedestrians who walk
// the sidewalks and flee from a speeding car, and police cars that chase the player while the
// wanted level is up. None of them allocates after creation: fixed pools, reused slots.
import { CAR, PEDS, POLICE, STREETS_X, STREETS_Y, TRAFFIC, WORLD } from './config.js';
import { collideBuildings, isRoad, randomRoadPoint } from './city.js';
import { randomInt, randomPick } from './random.js';

export const TRAFFIC_COLOURS = ['#e8e4da', '#c94f43', '#4a7ec9', '#e0a83c', '#5b8c5a', '#8a6fb0', '#d97b6c', '#3f4a5a'];

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function angleTo(x1, y1, x2, y2) {
  return Math.atan2(y2 - y1, x2 - x1);
}

export function createEntities(random, city) {
  const traffic = [];
  for (let i = 0; i < TRAFFIC.count; i += 1) {
    traffic.push({
      x: 0, y: 0, angle: 0, speed: 0, colour: '#888888', active: false,
      vertical: true, street: 0, lane: 1, targetSpeed: 200, yieldT: 0,
    });
  }
  const peds = [];
  for (let i = 0; i < PEDS.count; i += 1) {
    peds.push({
      x: 0, y: 0, angle: 0, speed: 0, colour: '#888888', active: false,
      down: 0, flee: 0, targetX: 0, targetY: 0, wait: 0, shirt: '#888888', skin: '#d9a06b',
    });
  }
  const police = [];
  for (let i = 0; i < POLICE.maxCars; i += 1) {
    police.push({ x: 0, y: 0, angle: 0, speed: 0, active: false, light: 0, touching: false, ramCooldown: 0 });
  }

  function spawnTrafficCar(car, player) {
    const point = randomRoadPoint(random, player, 420);
    car.vertical = random() < 0.5;
    if (car.vertical) {
      car.street = point.x;
      car.x = point.x + (random() < 0.5 ? -22 : 22);
      car.y = point.y;
      car.angle = car.x < point.x ? Math.PI / 2 : -Math.PI / 2;
    } else {
      car.street = point.y;
      car.x = point.x;
      car.y = point.y + (random() < 0.5 ? -22 : 22);
      car.angle = car.y < point.y ? 0 : Math.PI;
    }
    car.targetSpeed = randomInt(random, TRAFFIC.speedMin, TRAFFIC.speedMax);
    car.speed = car.targetSpeed;
    car.colour = randomPick(random, TRAFFIC_COLOURS);
    car.active = true;
  }

  function spawnPed(ped, player) {
    const point = randomRoadPoint(random, player, 320);
    ped.x = point.x + randomInt(random, -60, 60);
    ped.y = point.y + randomInt(random, -60, 60);
    ped.angle = random() * Math.PI * 2;
    ped.speed = randomInt(random, PEDS.speedMin, PEDS.speedMax);
    ped.shirt = randomPick(random, ['#e05a4e', '#4a7ec9', '#e0a83c', '#5b8c5a', '#f2ede0', '#8a6fb0']);
    ped.skin = randomPick(random, ['#d9a06b', '#8a5a3b', '#e8b88a', '#6b4a2f']);
    ped.down = 0;
    ped.flee = 0;
    ped.wait = 0;
    ped.active = true;
  }

  function reset(player) {
    for (const car of traffic) spawnTrafficCar(car, player);
    for (const ped of peds) spawnPed(ped, player);
    for (const cop of police) cop.active = false;
  }

  /** Traffic follows its street; at an intersection it sometimes turns onto the crossing road.
   *  A traffic car with the player's car fast behind it yields: it swaps lane and speeds up,
   *  so the player can pass instead of sitting in a queue. */
  function stepTraffic(dt, player, playerInCar, playerSpeed) {
    for (const car of traffic) {
      if (!car.active) continue;
      if (car.yieldT > 0) car.yieldT -= dt;
      if (playerInCar && playerSpeed > 200) {
        const dx = player.x - car.x;
        const dy = player.y - car.y;
        const along = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
        const across = -dx * Math.sin(car.angle) + dy * Math.cos(car.angle);
        if (along < 0 && along > -170 && Math.abs(across) < 34) car.yieldT = 1.5;
      }
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      // Reached the end of the world: respawn on another road.
      if (car.x < 40 || car.x > WORLD.width - 40 || car.y < 40 || car.y > WORLD.height - 40) {
        spawnTrafficCar(car, player);
        continue;
      }
      // At a crossing, sometimes turn.
      const nearX = STREETS_X.find((s) => Math.abs(car.x - s) < 14);
      const nearY = STREETS_Y.find((s) => Math.abs(car.y - s) < 14);
      if (car.vertical && nearY !== undefined && random() < 0.012) {
        car.vertical = false;
        car.street = nearY;
        car.y = nearY + (random() < 0.5 ? -22 : 22);
        car.angle = car.y < nearY ? 0 : Math.PI;
      } else if (!car.vertical && nearX !== undefined && random() < 0.012) {
        car.vertical = true;
        car.street = nearX;
        car.x = nearX + (random() < 0.5 ? -22 : 22);
        car.angle = car.x < nearX ? Math.PI / 2 : -Math.PI / 2;
      }
      // Stay glued to the lane after a turn; a yielding car swaps to the far lane.
      const flip = car.yieldT > 0 ? -1 : 1;
      if (car.vertical) car.x += (car.street + (car.angle > 0 ? -22 : 22) * flip - car.x) * Math.min(1, dt * 3);
      else car.y += (car.street + (Math.cos(car.angle) > 0 ? -22 : 22) * flip - car.y) * Math.min(1, dt * 3);
      // Slow down for the car ahead on the same lane.
      for (const other of traffic) {
        if (other === car || !other.active || other.vertical !== car.vertical) continue;
        const along = car.vertical ? (other.y - car.y) * Math.sin(car.angle) : (other.x - car.x) * Math.cos(car.angle);
        const across = car.vertical ? Math.abs(other.x - car.x) : Math.abs(other.y - car.y);
        if (along > 0 && along < 90 && across < 30) {
          car.speed = Math.max(0, Math.min(car.speed, other.speed * 0.8));
          break;
        }
      }
      const cruise = car.yieldT > 0 ? 340 : car.targetSpeed;
      car.speed += (cruise - car.speed) * Math.min(1, dt * 0.8);
    }
  }

  function stepPeds(dt, player, playerSpeed) {
    for (const ped of peds) {
      if (!ped.active) continue;
      if (ped.down > 0) {
        ped.down -= dt;
        continue;
      }
      const dx = ped.x - player.x;
      const dy = ped.y - player.y;
      const dist = Math.hypot(dx, dy);
      // Flee from a fast car bearing down on the sidewalk.
      if (dist < 170 && playerSpeed > 120) ped.flee = 1.2;
      if (ped.flee > 0) {
        ped.flee -= dt;
        ped.angle = angleLerp(ped.angle, Math.atan2(dy, dx), Math.min(1, dt * 6));
        ped.x += Math.cos(ped.angle) * 150 * dt;
        ped.y += Math.sin(ped.angle) * 150 * dt;
      } else if (ped.wait > 0) {
        ped.wait -= dt;
      } else {
        ped.x += Math.cos(ped.angle) * ped.speed * dt;
        ped.y += Math.sin(ped.angle) * ped.speed * dt;
        if (!isRoad(city, ped.x, ped.y) && random() < 0.004) {
          ped.angle += (random() < 0.5 ? -1 : 1) * (Math.PI / 2 + random() * 0.6);
          ped.wait = random() * 2;
        }
        if (ped.x < 200 || ped.x > WORLD.width - 30 || ped.y < 30 || ped.y > WORLD.height - 30) {
          ped.angle += Math.PI;
          ped.x = Math.max(200, Math.min(WORLD.width - 30, ped.x));
          ped.y = Math.max(30, Math.min(WORLD.height - 30, ped.y));
        }
      }
      const body = { x: ped.x, y: ped.y, radius: 12 };
      if (collideBuildings(city, body)) {
        ped.x = body.x;
        ped.y = body.y;
        ped.angle += Math.PI / 2;
      }
    }
  }

  /**
   * Police pursuit: steer toward the player, ram the player's car, and corner the player on
   * foot. Returns true while a cop is touching the player on foot (bust timer is kept by the
   * caller). Cops spawn on roads near the player while wanted, and leave when it clears.
   */
  function stepPolice(dt, player, playerCar, wanted) {
    const wantCount = wanted === 0 ? 0 : Math.min(POLICE.maxCars, 1 + wanted);
    let activeCount = 0;
    for (const cop of police) if (cop.active) activeCount += 1;
    if (activeCount < wantCount) {
      for (const cop of police) {
        if (activeCount >= wantCount) break;
        if (cop.active) continue;
        const point = randomRoadPoint(random, player, 520);
        cop.x = point.x;
        cop.y = point.y;
        cop.angle = angleTo(point.x, point.y, player.x, player.y);
        cop.speed = 0;
        cop.active = true;
        activeCount += 1;
      }
    }
    let touchingPlayer = false;
    for (const cop of police) {
      if (!cop.active) continue;
      if (wanted === 0) {
        cop.active = false;
        continue;
      }
      cop.light += dt * 6;
      if (cop.ramCooldown > 0) cop.ramCooldown -= dt;
      const target = playerCar || player;
      const wantAngle = angleTo(cop.x, cop.y, target.x, target.y);
      const dist = Math.hypot(target.x - cop.x, target.y - cop.y);
      // Wobble the pursuit line a little so two cops do not stack on one spot.
      const wobble = Math.sin(cop.light * 0.35) * 0.25;
      cop.angle = angleLerp(cop.angle, wantAngle + wobble, Math.min(1, dt * 2.2));
      cop.speed += ((dist > 500 ? POLICE.speed : POLICE.speed * 0.92) - cop.speed) * Math.min(1, dt * 1.4);
      cop.x += Math.cos(cop.angle) * cop.speed * dt;
      cop.y += Math.sin(cop.angle) * cop.speed * dt;
      cop.x = Math.max(30, Math.min(WORLD.width - 30, cop.x));
      cop.y = Math.max(30, Math.min(WORLD.height - 30, cop.y));
      const body = { x: cop.x, y: cop.y, radius: 24 };
      if (collideBuildings(city, body)) {
        cop.x = body.x;
        cop.y = body.y;
        cop.speed *= 0.4;
        cop.angle += 0.6;
      }
      if (dist < 46 && !playerCar) touchingPlayer = true;
    }
    return touchingPlayer;
  }

  return { traffic, peds, police, reset, stepTraffic, stepPeds, stepPolice };
}
