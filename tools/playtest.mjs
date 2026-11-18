// Live play-test: opens the real game in headless Chrome and plays Mission 1 end to end
// with real key events — walk to the car, press E, drive the waypoint route to the Marina —
// then reports the mission state, the money, and any console or page errors. Usage:
//   node tools/playtest.mjs [port]   (defaults to http://127.0.0.1:8080)
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
    health: Math.round(s.player.health), carHealth: Math.round(s.car.health),
    obj: obj ? { kind: obj.kind, x: obj.x, y: obj.y, radius: obj.radius, text: obj.text } : null,
  };
})()`;

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

const userDataDir = '/tmp/solmar-playtest-profile';
rmSync(userDataDir, { recursive: true, force: true });
const chrome = await launchChrome(9224, userDataDir);
const held = new Set();
let tab;
let failed = false;
try {
  tab = await openTab(9224, 'http://127.0.0.1:' + port + '/?seed=7');
  await sleep(2000);
  let snap = await tab.evaluate(SNAP);
  console.log('title screen=' + snap.screen + ' (expect 0)');
  if (snap.screen !== 0) failed = true;

  // Start the game.
  await tab.tap('Enter', 100);
  await sleep(600);
  snap = await tab.evaluate(SNAP);
  console.log('after Enter screen=' + snap.screen + ' mission=' + snap.missionIndex + ' step=' + snap.missionStep);
  if (snap.screen !== 1 || snap.missionIndex !== 0 || snap.missionStep !== 0) failed = true;

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

  // Phase 1: walk to the car (mission step 0 -> 1).
  console.log('phase 1: walk to the car at (960,700)');
  let deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    snap = await tab.evaluate(SNAP);
    if (snap.missionStep >= 1) break;
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
  snap = await tab.evaluate(SNAP);
  console.log('after walk: missionStep=' + snap.missionStep + ' player=(' + snap.px + ',' + snap.py + ')');
  if (snap.missionStep < 1) {
    console.log('FAIL: could not reach the car');
    failed = true;
  }

  // Phase 2: press E to get in (mission step 1 -> 2).
  await tab.tap('KeyE', 100);
  await sleep(500);
  snap = await tab.evaluate(SNAP);
  console.log('after E: inCar=' + snap.inCar + ' missionStep=' + snap.missionStep);
  if (!snap.inCar || snap.missionStep < 2) {
    console.log('FAIL: could not enter the car');
    failed = true;
  }

  // Phase 3: drive the waypoint route to the Marina (mission 0 -> 1).
  const waypoints = [{ x: 1000, y: 860 }, { x: 2760, y: 860 }, { x: 2760, y: 2180 }];
  let wp = 0;
  let lastPos = { x: snap.px, y: snap.py, at: Date.now() };
  let reversingUntil = 0;
  console.log('phase 3: drive to the Marina');
  deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    snap = await tab.evaluate(SNAP);
    if (snap.missionIndex >= 1) break;
    if (snap.screen === 3) {
      console.log('FAIL: got busted during the drive');
      failed = true;
      break;
    }
    const target = waypoints[wp] || snap.obj;
    const dx = target.x - snap.px;
    const dy = target.y - snap.py;
    const dist = Math.hypot(dx, dy);
    if (wp < waypoints.length && dist < 50) wp += 1;
    const now = Date.now();
    // Stuck? Reverse for a moment, steering the other way.
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
    await sleep(120);
  }
  await releaseAll();
  snap = await tab.evaluate(SNAP);
  console.log('after drive: missionIndex=' + snap.missionIndex + ' money=$' + snap.money + ' player=(' + snap.px + ',' + snap.py + ') screen=' + snap.screen);
  if (snap.missionIndex < 1) {
    console.log('FAIL: mission 1 did not complete');
    failed = true;
  } else {
    console.log('MISSION 1 COMPLETE — reward banked, mission 2 is "' + (snap.obj ? snap.obj.text : 'done') + '"');
  }
  await tab.screenshot('/tmp/playtest-end.jpg');
  console.log('console messages (' + tab.consoleMessages.length + '):');
  for (const m of tab.consoleMessages) console.log('  ' + m);
  console.log('page errors (' + tab.pageErrors.length + '):');
  for (const m of tab.pageErrors) console.log('  ' + m);
  if (tab.pageErrors.length > 0) failed = true;
} finally {
  if (tab) tab.close();
  chrome.kill();
}
console.log(failed ? 'PLAYTEST FAILED' : 'PLAYTEST PASSED');
process.exit(failed ? 1 : 0);
