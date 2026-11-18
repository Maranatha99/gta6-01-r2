// Full live play-test: plays all four missions of SOLMAR BAY end to end with real key
// events, driving the road routes between waypoints, and reports each mission's completion
// plus any console or page errors. Usage: node tools/playtest-full.mjs [port]
import { rmSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { launchChrome, openTab } from './cdp.mjs';

const port = Number(process.argv[2] || 8080);
const SNAP = `(() => {
  const s = window.__solmar.state;
  const obj = s.missions.current();
  return {
    screen: window.__solmar.screen,
    money: s.money, wanted: s.wanted,
    missionIndex: s.missions.index, missionStep: s.missions.step, done: s.missions.done,
    px: Math.round(s.player.x), py: Math.round(s.player.y),
    angle: s.player.angle, inCar: s.player.inCar,
    carSpeed: Math.round(s.car.speed), carAngle: s.car.angle,
    carHealth: Math.round(s.car.health), carActive: s.car.active,
    carX: Math.round(s.car.x), carY: Math.round(s.car.y),
    health: Math.round(s.player.health),
    parked: s.parked.filter((p) => p.active).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })),
    obj: obj ? { kind: obj.kind, x: obj.x, y: obj.y, radius: obj.radius, text: obj.text } : null,
  };
})()`;

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

const userDataDir = '/tmp/solmar-playtest-full-profile';
rmSync(userDataDir, { recursive: true, force: true });
const chrome = await launchChrome(9225, userDataDir);
const held = new Set();
let tab;
let failed = false;
const log = (...args) => console.log(...args);

try {
  tab = await openTab(9225, 'http://127.0.0.1:' + port + '/?seed=7');
  await sleep(2000);
  let snap = await tab.evaluate(SNAP);
  if (snap.screen !== 0) {
    log('FAIL: title screen not shown');
    failed = true;
  }
  await tab.tap('Enter', 100);
  await sleep(600);

  async function setKeys(wanted) {
    for (const key of [...held]) {
      if (!wanted.has(key)) {
        await tab.release(key);
        held.delete(key);
      }
    }
    for (const key of wanted) {
      if (!held.has(key)) {
        await tab.hold(key);
        held.add(key);
      }
    }
  }
  async function releaseAll() {
    await setKeys(new Set());
  }
  async function snapNow() {
    return tab.evaluate(SNAP);
  }

  /** Walk on foot until the mission step advances (or the timeout hits). */
  async function walkToStep(targetStep, label, timeoutMs) {
    log('  walk: ' + label);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      snap = await snapNow();
      if (snap.missionStep >= targetStep || snap.missionIndex > currentMission) return true;
      if (snap.screen === 3) return false;
      const dx = snap.obj.x - snap.px;
      const dy = snap.obj.y - snap.py;
      const keys = new Set();
      if (dx > 14) keys.add('KeyD');
      else if (dx < -14) keys.add('KeyA');
      if (dy > 14) keys.add('KeyS');
      else if (dy < -14) keys.add('KeyW');
      await setKeys(keys);
      await sleep(120);
    }
    await releaseAll();
    return false;
  }

  /** Drive the waypoint route, then straight at the objective, until the mission advances. */
  async function driveToAdvance(waypoints, label, timeoutMs) {
    log('  drive: ' + label);
    let wp = 0;
    let lastPos = { x: 0, y: 0, at: Date.now() };
    let lastLog = 0;
    let reversingUntil = 0;
    const startStep = (await snapNow()).missionStep;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      snap = await snapNow();
      if (snap.missionIndex > currentMission || snap.missionStep > startStep || snap.done) return true;
      if (snap.screen === 3) return false;
      // Car wrecked: walk to the nearest parked car and take it.
      if (!snap.inCar) {
        await releaseAll();
        log('  car lost at (' + snap.px + ',' + snap.py + ') health ' + snap.carHealth + ' — finding another car');
        let nearest = null;
        let nearestD = Infinity;
        for (const p of snap.parked) {
          const d = Math.hypot(p.x - snap.px, p.y - snap.py);
          if (d < nearestD) {
            nearestD = d;
            nearest = p;
          }
        }
        if (!nearest || nearestD > 1500) {
          log('  no parked car nearby (nearest ' + Math.round(nearestD) + 'm)');
          return false;
        }
        // Walk to the parked car; sidestep when wedged on a building corner.
        const walkDeadline = Date.now() + 40000;
        let walkLast = { x: snap.px, y: snap.py, at: Date.now() };
        let sidestepUntil = 0;
        let sidestepSide = 1;
        while (Date.now() < walkDeadline) {
          snap = await snapNow();
          if (snap.inCar) break;
          if (snap.screen === 3) break;
          const dx = nearest.x - snap.px;
          const dy = nearest.y - snap.py;
          if (Math.hypot(dx, dy) < 60) break;
          const nowWalk = Date.now();
          if (nowWalk - walkLast.at > 3000) {
            if (Math.hypot(snap.px - walkLast.x, snap.py - walkLast.y) < 20) {
              sidestepUntil = nowWalk + 1000;
              sidestepSide = -sidestepSide;
            }
            walkLast = { x: snap.px, y: snap.py, at: nowWalk };
          }
          const keys = new Set();
          if (nowWalk < sidestepUntil) {
            const len = Math.max(1, Math.hypot(dx, dy));
            const px = -dy / len * sidestepSide;
            const py = dx / len * sidestepSide;
            if (px > 0.3) keys.add('KeyD');
            else if (px < -0.3) keys.add('KeyA');
            if (py > 0.3) keys.add('KeyS');
            else if (py < -0.3) keys.add('KeyW');
          } else {
            if (dx > 14) keys.add('KeyD');
            else if (dx < -14) keys.add('KeyA');
            if (dy > 14) keys.add('KeyS');
            else if (dy < -14) keys.add('KeyW');
          }
          await setKeys(keys);
          await sleep(120);
        }
        await releaseAll();
        await tab.tap('KeyE', 100);
        await sleep(400);
        snap = await snapNow();
        if (!snap.inCar) {
          log('  could not take the parked car');
          return false;
        }
        log('  got a new car, continuing');
        lastPos = { x: snap.px, y: snap.py, at: Date.now() };
      }
      const target = waypoints[wp] || snap.obj;
      const dx = target.x - snap.px;
      const dy = target.y - snap.py;
      const dist = Math.hypot(dx, dy);
      // Tight acceptance: the car must reach the road centre before turning, or it cuts
      // across a block and wedges on a building corner. Past the last waypoint the
      // target becomes the mission objective itself.
      if (wp < waypoints.length && dist < 50) wp += 1;
      const now = Date.now();
      if (now - lastLog > 3000) {
        lastLog = now;
        log('    pos=(' + snap.px + ',' + snap.py + ') speed=' + snap.carSpeed + ' health=' + snap.carHealth + ' wanted=' + snap.wanted + ' wp=' + wp + '/' + waypoints.length + ' dist=' + Math.round(dist));
      }
      if (now - lastPos.at > 2500) {
        const moved = Math.hypot(snap.px - lastPos.x, snap.py - lastPos.y);
        if (moved < 40 && Math.abs(snap.carSpeed) < 120) reversingUntil = now + 1500;
        lastPos = { x: snap.px, y: snap.py, at: now };
      }
      const desired = Math.atan2(dy, dx);
      const diff = wrapAngle(desired - snap.carAngle);
      const keys = new Set();
      if (now < reversingUntil) {
        keys.add('KeyS');
        if (diff > 0) keys.add('KeyA');
        else if (diff < 0) keys.add('KeyD');
      } else {
        // Throttle whenever the target is ahead and we are under the cruise cap; brake
        // into tight turns and the final approach. (No dead zone: coasting to a stop
        // mid-road is what wedged the car before.)
        const absDiff = Math.abs(diff);
        if ((dist < 260 || absDiff > 1.2) && Math.abs(snap.carSpeed) > 250) keys.add('KeyS');
        else if (dist > 120 && absDiff < 0.9 && Math.abs(snap.carSpeed) < 360) keys.add('KeyW');
        if (diff > 0.12) keys.add('KeyD');
        else if (diff < -0.12) keys.add('KeyA');
      }
      await setKeys(keys);
      await sleep(90);
    }
    await releaseAll();
    return false;
  }

  async function pressE() {
    await tab.tap('KeyE', 100);
    await sleep(500);
  }

  /** After a pickup on foot, walk back to the player's own car and get in. */
  async function reenterCar(label) {
    snap = await snapNow();
    if (snap.inCar) return true;
    log('  walk back to the car at (' + snap.carX + ',' + snap.carY + ')');
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      snap = await snapNow();
      if (snap.inCar) return true;
      if (snap.screen === 3) return false;
      const dx = snap.carX - snap.px;
      const dy = snap.carY - snap.py;
      if (Math.hypot(dx, dy) < 60) break;
      const keys = new Set();
      if (dx > 14) keys.add('KeyD');
      else if (dx < -14) keys.add('KeyA');
      if (dy > 14) keys.add('KeyS');
      else if (dy < -14) keys.add('KeyW');
      await setKeys(keys);
      await sleep(120);
    }
    await releaseAll();
    await pressE();
    snap = await snapNow();
    if (!snap.inCar) {
      log('FAIL: could not re-enter car (' + label + ')');
      failed = true;
      return false;
    }
    return true;
  }

  let currentMission = 0;
  async function expectMission(index, label) {
    snap = await snapNow();
    await releaseAll();
    if (snap.missionIndex === index || (index === 4 && snap.done)) {
      log('MISSION ' + (index) + ' COMPLETE — ' + label + ' (money $' + snap.money + ', wanted ' + snap.wanted + ')');
      currentMission = index;
      return true;
    }
    log('FAIL: mission ' + (index - 1) + ' did not complete (' + label + '): at mission ' + snap.missionIndex + ' step ' + snap.missionStep + ' player=(' + snap.px + ',' + snap.py + ')');
    failed = true;
    return false;
  }

  // Mission 1 — First Wheels.
  log('MISSION 1: First Wheels');
  if (!await walkToStep(1, 'to the parked car', 30000)) { log('FAIL: walk to car'); failed = true; }
  await pressE();
  snap = await snapNow();
  if (!snap.inCar) { log('FAIL: could not enter car'); failed = true; }
  if (!await driveToAdvance([{ x: 1000, y: 860 }, { x: 2760, y: 860 }, { x: 2760, y: 2180 }], 'to the Marina', 100000)) failed = true;
  if (!await expectMission(1, 'First Wheels')) failed = true;

  // Mission 2 — The Pickup.
  log('MISSION 2: The Pickup');
  if (!await driveToAdvance([{ x: 2760, y: 1300 }, { x: 1220, y: 1300 }], 'to Palma Park', 100000)) failed = true;
  await pressE();
  snap = await snapNow();
  if (snap.inCar) { log('FAIL: could not exit car at the park'); failed = true; }
  if (!await walkToStep(2, 'to the package', 30000)) { log('FAIL: walk to package'); failed = true; }
  await reenterCar('at the park');
  if (!await driveToAdvance([{ x: 1220, y: 1300 }, { x: 3200, y: 1300 }, { x: 3200, y: 2180 }], 'to the Docks', 120000)) failed = true;
  if (!await expectMission(2, 'The Pickup')) failed = true;

  // Mission 3 — Heat (escape).
  log('MISSION 3: Heat');
  snap = await snapNow();
  log('  wanted at mission start: ' + snap.wanted);
  if (!await driveToAdvance([{ x: 1000, y: 2180 }, { x: 1000, y: 1960 }], 'to the Safehouse', 120000)) failed = true;
  if (!await expectMission(3, 'Heat')) failed = true;

  // Mission 4 — The Big Score.
  log('MISSION 4: The Big Score');
  if (!await driveToAdvance([{ x: 1000, y: 1960 }, { x: 1000, y: 2180 }, { x: 2320, y: 2180 }, { x: 2320, y: 860 }, { x: 2100, y: 860 }], 'to Solmar Bank', 150000)) failed = true;
  await pressE();
  snap = await snapNow();
  if (snap.inCar) { log('FAIL: could not exit car at the bank'); failed = true; }
  if (!await walkToStep(2, 'to the bank cash', 30000)) { log('FAIL: walk to bank cash'); failed = true; }
  snap = await snapNow();
  log('  cash grabbed, wanted now: ' + snap.wanted);
  await reenterCar('at the bank');
  if (!await driveToAdvance([{ x: 2100, y: 860 }, { x: 1000, y: 860 }, { x: 1000, y: 1960 }], 'escape to the Safehouse', 150000)) failed = true;
  snap = await snapNow();
  await releaseAll();
  if (snap.done && snap.screen === 4) {
    log('MISSION 4 COMPLETE — The Big Score! Story done, money $' + snap.money);
    currentMission = 4;
    failed = false;
  } else {
    log('FAIL: story did not complete: mission ' + snap.missionIndex + ' step ' + snap.missionStep + ' screen ' + snap.screen);
    failed = true;
  }
  await tab.screenshot('/tmp/playtest-full-end.jpg');
  log('console messages (' + tab.consoleMessages.length + '):');
  for (const m of tab.consoleMessages) log('  ' + m);
  log('page errors (' + tab.pageErrors.length + '):');
  for (const m of tab.pageErrors) log('  ' + m);
  if (tab.pageErrors.length > 0) failed = true;
} finally {
  if (tab) tab.close();
  chrome.kill();
}
log(failed ? 'FULL PLAYTEST FAILED' : 'FULL PLAYTEST PASSED — all 4 missions completed live');
process.exit(failed ? 1 : 0);
