// The game's rules and state, with no drawing and no browser in it: the player on foot or in
// a car, traffic and pedestrians, the police and the wanted level, the mission chain, cash and
// health. step() advances one fixed step and returns what happened as bit flags, so the caller
// can react (sounds, screens) without the world knowing about them.
import { BEACH, CAR, MISSION_REWARDS, PLAYER, POLICE, WANTED, WORLD } from './config.js';
import { buildCity, collideBuildings, isRoad, isSand, isWater } from './city.js';
import { createEntities } from './entities.js';
import { createMissions, missionBrief, missionEscapeWanted, missionStartWanted } from './missions.js';
import { createRandom } from './random.js';

export const EVENT_PICKUP = 1;
export const EVENT_CRASH = 2;
export const EVENT_CASH = 4;
export const EVENT_MISSION = 8;
export const EVENT_BUSTED = 16;
export const EVENT_STORY_DONE = 32;
export const EVENT_CAR_WRECKED = 64;

const CASH_BAG_SPOTS = [
  { x: 700, y: 500 }, { x: 1600, y: 1000 }, { x: 2500, y: 600 }, { x: 1200, y: 1900 },
  { x: 3000, y: 1200 }, { x: 800, y: 2300 }, { x: 2100, y: 2000 }, { x: 400, y: 1200 },
];

const PARKED_SPOTS = [
  { x: 1000, y: 700, colour: '#c94f43' },
  { x: 1440, y: 600, colour: '#e8e4da' },
  { x: 1880, y: 1000, colour: '#4a7ec9' },
  { x: 2320, y: 1500, colour: '#e0a83c' },
  { x: 2760, y: 900, colour: '#5b8c5a' },
  { x: 560, y: 1500, colour: '#8a6fb0' },
];

const PLAYER_SPAWN = { x: 1000, y: 830 };
const RETRY_SPAWN = { x: 780, y: 1880 };

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

export function createWorld(seed) {
  const random = createRandom(seed);
  const city = buildCity(random);
  const entities = createEntities(random, city);
  const missions = createMissions();

  const player = { x: PLAYER_SPAWN.x, y: PLAYER_SPAWN.y, angle: -Math.PI / 2, health: PLAYER.health, inCar: false, hurtCooldown: 0, lastDamage: 99 };
  const car = { active: false, x: 0, y: 0, angle: 0, speed: 0, health: CAR.health, colour: '#c94f43' };
  const parked = PARKED_SPOTS.map((spot) => ({ ...spot, angle: Math.PI / 2, active: true }));
  const cashBags = CASH_BAG_SPOTS.map((spot) => ({ ...spot, taken: false }));
  const particles = [];
  for (let i = 0; i < 140; i += 1) particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, colour: '#ffffff', size: 3 });

  const state = {
    time: 0,
    money: 0,
    wanted: 0,
    wantedTimer: 0,
    bustTimer: 0,
    player,
    car,
    parked,
    cashBags,
    particles,
    city,
    entities,
    missions,
    camera: { x: PLAYER_SPAWN.x, y: PLAYER_SPAWN.y },
    toast: null,
    brief: null,
    storyDone: false,
  };

  function spawnParticle(x, y, vx, vy, life, colour, size) {
    for (const p of particles) {
      if (p.active) continue;
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = vx;
      p.vy = vy;
      p.life = life;
      p.maxLife = life;
      p.colour = colour;
      p.size = size;
      return;
    }
  }

  function burst(x, y, colour, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const a = random() * Math.PI * 2;
      const s = speed * (0.4 + random() * 0.8);
      spawnParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.4 + random() * 0.5, colour, 2 + random() * 3);
    }
  }

  function setToast(text, seconds) {
    state.toast = { text, t: seconds };
  }

  function setBrief(text, seconds) {
    state.brief = { text, t: seconds };
  }

  function nearestCar(maxDist) {
    let best = null;
    let bestDist = maxDist;
    const consider = (x, y, ref) => {
      const d = distance(player.x, player.y, x, y);
      if (d < bestDist) {
        bestDist = d;
        best = ref;
      }
    };
    if (car.active) consider(car.x, car.y, { kind: 'mine' });
    for (const p of parked) if (p.active) consider(p.x, p.y, { kind: 'parked', car: p });
    for (const t of entities.traffic) {
      if (t.active) consider(t.x, t.y, { kind: 'traffic', car: t });
    }
    return best;
  }

  function enterCar() {
    const found = nearestCar(78);
    if (!found) return false;
    if (found.kind === 'mine') {
      player.inCar = true;
      return true;
    }
    if (found.kind === 'parked') {
      found.car.active = false;
      car.x = found.car.x;
      car.y = found.car.y;
      car.angle = found.car.angle;
      car.colour = found.car.colour;
    } else {
      found.car.active = false;
      car.x = found.car.x;
      car.y = found.car.y;
      car.angle = found.car.angle;
      car.colour = found.car.colour;
    }
    car.speed = 0;
    car.health = CAR.health;
    car.active = true;
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    player.inCar = true;
    // Stealing in sight of the law draws heat.
    let copNear = false;
    for (const cop of entities.police) {
      if (cop.active && distance(cop.x, cop.y, player.x, player.y) < WANTED.copSightRange) copNear = true;
    }
    if (copNear && state.wanted < WANTED.max) state.wanted += 1;
    return true;
  }

  function exitCar() {
    player.inCar = false;
    player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
    player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
    player.angle = car.angle;
    car.speed = 0;
    const body = { x: player.x, y: player.y, radius: PLAYER.radius };
    collideBuildings(city, body);
    player.x = body.x;
    player.y = body.y;
  }

  function stepPlayerOnFoot(dt, vec) {
    const speed = isSand(player.x, player.y) ? PLAYER.walkSpeed * 0.7 : PLAYER.walkSpeed;
    let mx = vec.x;
    let my = vec.y;
    const len = Math.hypot(mx, my);
    if (len > 0) {
      mx /= len;
      my /= len;
      player.angle = Math.atan2(my, mx);
    }
    const nx = player.x + mx * speed * dt;
    const ny = player.y + my * speed * dt;
    player.x = clamp(nx, BEACH.waterX + 16, WORLD.width - 16);
    player.y = clamp(ny, 16, WORLD.height - 16);
    const body = { x: player.x, y: player.y, radius: PLAYER.radius };
    if (collideBuildings(city, body)) {
      player.x = body.x;
      player.y = body.y;
    }
    // Hit by a fast traffic car: hurt, knocked back, brief invulnerability.
    if (player.hurtCooldown > 0) player.hurtCooldown -= dt;
    for (const t of entities.traffic) {
      if (!t.active || player.hurtCooldown > 0) continue;
      if (distance(t.x, t.y, player.x, player.y) < 34 && Math.abs(t.speed) > 110) {
        player.health -= 20;
        player.hurtCooldown = 1;
        player.lastDamage = 0;
        const a = Math.atan2(player.y - t.y, player.x - t.x);
        player.x += Math.cos(a) * 40;
        player.y += Math.sin(a) * 40;
        burst(player.x, player.y, '#ff5a4e', 10, 160);
        return EVENT_CRASH;
      }
    }
    return 0;
  }

  function stepPlayerCar(dt, vec, handbrake) {
    const onRoad = isRoad(city, car.x, car.y) || isSand(car.x, car.y);
    const topSpeed = onRoad ? CAR.maxSpeed : CAR.maxSpeed * 0.55;
    if (vec.y < 0) car.speed += CAR.accel * dt;
    else if (vec.y > 0) car.speed -= CAR.brake * dt;
    else car.speed -= car.speed * 1.8 * dt;
    if (handbrake) car.speed -= car.speed * 2.2 * dt;
    car.speed = clamp(car.speed, -CAR.reverseMax, topSpeed);
    const steerAmount = clamp(Math.abs(car.speed) / 220, 0.3, 1) * (handbrake ? 1.5 : 1);
    car.angle += vec.x * CAR.turnRate * steerAmount * dt * (car.speed >= 0 ? 1 : -1);
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    if (isWater(nx, ny)) {
      car.speed *= -0.3;
    } else {
      car.x = Math.max(26, Math.min(WORLD.width - 26, nx));
      car.y = Math.max(26, Math.min(WORLD.height - 26, ny));
    }
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    const body = { x: car.x, y: car.y, radius: 26 };
    const normal = collideBuildings(city, body);
    if (normal) {
      car.x = body.x;
      car.y = body.y;
      // Slide along the wall: drop only the velocity that runs into it, keep the rest.
      const vx = Math.cos(car.angle) * car.speed;
      const vy = Math.sin(car.angle) * car.speed;
      const intoWall = -(vx * normal.x + vy * normal.y);
      if (intoWall > 0) {
        const rx = vx + normal.x * intoWall;
        const ry = vy + normal.y * intoWall;
        car.speed = rx * Math.cos(car.angle) + ry * Math.sin(car.angle);
        if (intoWall > 300) {
          car.health -= Math.round((intoWall - 300) / 40);
          burst(car.x, car.y, '#ffd23f', 12, 220);
          if (car.health <= 0) return EVENT_CAR_WRECKED;
          return EVENT_CRASH;
        }
      }
      car.speed *= 0.6;
    }
    // Ram traffic: shove it aside (it yields and pulls away), dent both cars a little.
    for (const t of entities.traffic) {
      if (!t.active) continue;
      if (distance(t.x, t.y, car.x, car.y) < 50) {
        const a = Math.atan2(t.y - car.y, t.x - car.x);
        t.x += Math.cos(a) * 26;
        t.y += Math.sin(a) * 26;
        t.yieldT = 1.5;
        t.speed = Math.max(t.speed, 300);
        if (Math.abs(car.speed) > 300) {
          car.health -= 3;
          car.speed *= 0.85;
          burst(t.x, t.y, '#ffd23f', 8, 180);
          return EVENT_CRASH;
        }
      }
    }
    for (const ped of entities.peds) {
      if (!ped.active || ped.down > 0) continue;
      if (distance(ped.x, ped.y, car.x, car.y) < 32 && Math.abs(car.speed) > 120) {
        ped.down = 3;
        ped.flee = 2;
        if (state.wanted < WANTED.max) state.wanted += 1;
        state.wantedTimer = 0;
        burst(ped.x, ped.y, '#ff5a4e', 10, 160);
        return EVENT_CRASH;
      }
    }
    // Dust and skid marks when pushing hard off-road or handbraking.
    if ((Math.abs(car.speed) > 320 && !onRoad) || (handbrake && Math.abs(car.speed) > 150)) {
      const bx = car.x - Math.cos(car.angle) * 24;
      const by = car.y - Math.sin(car.angle) * 24;
      spawnParticle(bx, by, -Math.cos(car.angle) * 40 + (random() - 0.5) * 60, -Math.sin(car.angle) * 40 + (random() - 0.5) * 60, 0.5, '#cbb98a', 4);
    }
    return 0;
  }

  function stepWanted(dt) {
    if (state.wanted <= 0) return;
    let nearestCop = Infinity;
    for (const cop of entities.police) {
      if (!cop.active) continue;
      nearestCop = Math.min(nearestCop, distance(cop.x, cop.y, player.x, player.y));
    }
    if (nearestCop > 550) {
      state.wantedTimer += dt;
      if (state.wantedTimer >= WANTED.decaySeconds) {
        state.wanted -= 1;
        state.wantedTimer = 0;
      }
    } else {
      state.wantedTimer = 0;
    }
  }

  function stepMissions() {
    const obj = missions.current();
    if (!obj) return 0;
    const px = player.x;
    const py = player.y;
    const d = distance(px, py, obj.x, obj.y);
    let done = false;
    if (obj.kind === 'walkTo') done = d < obj.radius;
    else if (obj.kind === 'enterCar') done = player.inCar;
    else if (obj.kind === 'driveTo') done = player.inCar && d < obj.radius;
    else if (obj.kind === 'pickup') done = !player.inCar && d < obj.radius;
    else if (obj.kind === 'escape') done = state.wanted === 0 || d < obj.radius;
    if (!done) return 0;
    const finishedIndex = missions.index;
    const wasPickup = obj.kind === 'pickup';
    if (obj.kind === 'pickup' && finishedIndex === 3) state.wanted = missionEscapeWanted(3);
    missions.advance();
    // The reward is paid once, when the whole mission is done — not per objective.
    if (missions.index !== finishedIndex || missions.done) {
      state.money += MISSION_REWARDS[finishedIndex] ?? 0;
    }
    if (missions.done) {
      state.storyDone = true;
      return EVENT_MISSION | EVENT_STORY_DONE | (wasPickup ? EVENT_PICKUP : 0);
    }
    setBrief(missions.current() ? missionBrief(missions.index) : '', 6);
    if (missions.index === 2) state.wanted = missionStartWanted(2);
    return EVENT_MISSION | (wasPickup ? EVENT_PICKUP : 0);
  }

  function stepCashBags() {
    if (player.inCar) return 0;
    for (const bag of cashBags) {
      if (bag.taken) continue;
      if (distance(player.x, player.y, bag.x, bag.y) < 30) {
        bag.taken = true;
        state.money += 100;
        return EVENT_CASH;
      }
    }
    return 0;
  }

  function stepParticles(dt) {
    for (const p of particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 2;
      p.vy *= 1 - dt * 2;
    }
  }

  function step(dt, vec, handbrake, enterPressed) {
    let events = 0;
    state.time += dt;
    if (state.toast) {
      state.toast.t -= dt;
      if (state.toast.t <= 0) state.toast = null;
    }
    if (state.brief) {
      state.brief.t -= dt;
      if (state.brief.t <= 0) state.brief = null;
    }
    player.lastDamage += dt;
    if (player.lastDamage > 5 && player.health < PLAYER.health) {
      player.health = Math.min(PLAYER.health, player.health + 5 * dt);
    }

    if (enterPressed) {
      if (player.inCar) exitCar();
      else if (!enterCar()) events |= 0;
    }
    if (player.inCar) {
      events |= stepPlayerCar(dt, vec, handbrake);
      if (events & EVENT_CAR_WRECKED) {
        car.active = false;
        player.inCar = false;
        player.x = car.x + 40;
        player.y = car.y + 40;
        burst(car.x, car.y, '#ff5a4e', 24, 300);
        setToast('Your car is wrecked — find another one!', 4);
      }
    } else {
      events |= stepPlayerOnFoot(dt, vec);
    }

    const playerSpeed = player.inCar ? Math.abs(car.speed) : 0;
    entities.stepTraffic(dt, player, player.inCar, playerSpeed);
    entities.stepPeds(dt, player, playerSpeed);
    const touching = entities.stepPolice(dt, player, player.inCar ? car : null, state.wanted);
    // A cop ramming the player's car dents it on IMPACT only: continuous pushing shoves
    // the car but deals no more damage, so a chase wears the car down instead of killing
    // it in seconds. A wrecked car strands the driver.
    if (player.inCar && car.active) {
      for (const cop of entities.police) {
        if (!cop.active) continue;
        if (distance(cop.x, cop.y, car.x, car.y) < 54) {
          const a = Math.atan2(car.y - cop.y, car.x - cop.x);
          car.x += Math.cos(a) * 46 * dt;
          car.y += Math.sin(a) * 46 * dt;
          if (!cop.touching) {
            cop.touching = true;
            if (cop.ramCooldown <= 0) {
              cop.ramCooldown = POLICE.ramCooldown;
              car.health -= POLICE.ramDamage;
              cop.speed *= 0.5;
              burst(car.x, car.y, '#ffd23f', 8, 180);
              events |= EVENT_CRASH;
            }
            if (car.health <= 0) {
              car.active = false;
              player.inCar = false;
              player.x = car.x + 40;
              player.y = car.y + 40;
              burst(car.x, car.y, '#ff5a4e', 24, 300);
              setToast('Your car is wrecked — find another one!', 4);
              events |= EVENT_CAR_WRECKED;
            }
          }
        } else {
          cop.touching = false;
        }
      }
    }
    if (touching) {
      state.bustTimer += dt;
      if (state.bustTimer >= WANTED.bustSeconds) return events | EVENT_BUSTED;
    } else {
      state.bustTimer = 0;
    }
    if (player.health <= 0) return events | EVENT_BUSTED;

    stepWanted(dt);
    events |= stepCashBags();
    events |= stepMissions();
    stepParticles(dt);

    const focusX = player.x;
    const focusY = player.y;
    state.camera.x += (focusX - state.camera.x) * Math.min(1, dt * 5);
    state.camera.y += (focusY - state.camera.y) * Math.min(1, dt * 5);
    return events;
  }

  function reset() {
    player.x = PLAYER_SPAWN.x;
    player.y = PLAYER_SPAWN.y;
    player.angle = -Math.PI / 2;
    player.health = PLAYER.health;
    player.inCar = false;
    player.hurtCooldown = 0;
    player.lastDamage = 99;
    car.active = false;
    car.speed = 0;
    car.health = CAR.health;
    for (const p of parked) p.active = true;
    for (const bag of cashBags) bag.taken = false;
    for (const p of particles) p.active = false;
    state.time = 0;
    state.money = 0;
    state.wanted = 0;
    state.wantedTimer = 0;
    state.bustTimer = 0;
    state.toast = null;
    state.brief = null;
    state.storyDone = false;
    state.camera.x = PLAYER_SPAWN.x;
    state.camera.y = PLAYER_SPAWN.y;
    missions.reset();
    entities.reset(player);
  }

  function retryMission() {
    missions.step = 0;
    player.x = RETRY_SPAWN.x;
    player.y = RETRY_SPAWN.y;
    player.angle = -Math.PI / 2;
    player.health = PLAYER.health;
    player.inCar = false;
    player.hurtCooldown = 0;
    player.lastDamage = 99;
    state.wanted = 0;
    state.wantedTimer = 0;
    state.bustTimer = 0;
    state.camera.x = player.x;
    state.camera.y = player.y;
    // A fresh car waits on the street by the safehouse.
    car.active = true;
    car.x = 1000;
    car.y = 1960;
    car.angle = Math.PI / 2;
    car.speed = 0;
    car.health = CAR.health;
    car.colour = '#c94f43';
    setBrief(missionBrief(missions.index), 6);
  }

  function applySave(save) {
    state.money = save.money || 0;
    missions.index = Math.min(save.missionIndex || 0, 3);
    missions.step = 0;
    missions.done = !!save.done;
    if (missions.done) state.storyDone = true;
    if (missions.index === 2) state.wanted = 2;
  }

  function snapshotSave() {
    return { money: state.money, missionIndex: missions.index, done: missions.done };
  }

  return {
    state,
    step,
    reset,
    retryMission,
    applySave,
    snapshotSave,
    setToast,
    setBrief,
    enterCar,
    exitCar,
  };
}
