// The screenshot scenes behind ?shot=title|drive|chase|mission. Each one sets the real world
// to a moment a short game really reaches — driving down an avenue, a police chase, the bank
// job — then plays the real rules forward for a few seconds, so the frame is what the game
// actually looks like and the same seed always gives the same frame.
import { STEP } from './config.js';
import { LANDMARKS } from './city.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

function driveForward(world, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    world.step(STEP, { x: 0, y: -1 }, false, false);
  }
}

function idle(world, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    world.step(STEP, { x: 0, y: 0 }, false, false);
  }
}

/** Put the player in a car at (x, y) heading `angle`, with the engine already running. */
function placeInCar(world, x, y, angle, speed) {
  const s = world.state;
  s.car.active = true;
  s.car.x = x;
  s.car.y = y;
  s.car.angle = angle;
  s.car.speed = speed;
  s.car.health = 100;
  s.car.colour = '#c94f43';
  s.player.x = x;
  s.player.y = y;
  s.player.angle = angle;
  s.player.inCar = true;
  s.camera.x = x;
  s.camera.y = y;
}

/** Park a few traffic cars on the road around the player so the street feels alive. */
function crowdStreet(world, x, y) {
  const s = world.state;
  const spots = [
    { x: x + 260, y: y - 22, angle: 0 },
    { x: x - 300, y: y + 22, angle: Math.PI },
    { x: x + 520, y: y + 22, angle: Math.PI },
    { x: x - 120, y: y - 22, angle: 0 },
  ];
  let placed = 0;
  for (const car of s.entities.traffic) {
    if (placed >= spots.length) break;
    if (!car.active) continue;
    const spot = spots[placed];
    car.x = spot.x;
    car.y = spot.y;
    car.angle = spot.angle;
    car.vertical = false;
    car.street = y;
    placed += 1;
  }
}

/**
 * Set `world` to the named scene (title, drive, chase or mission; any other name is title)
 * and return the screen to draw over it.
 */
export function stageShot(name, world) {
  const s = world.state;
  world.reset();
  if (name === 'drive') {
    s.missions.index = 1;
    s.missions.step = 0;
    s.money = 500;
    placeInCar(world, 1440, 1300, 0, 420);
    crowdStreet(world, 1440, 1300);
    driveForward(world, 2.5);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'chase') {
    s.missions.index = 2;
    s.missions.step = 0;
    s.wanted = 3;
    s.money = 1700;
    placeInCar(world, 1440, 860, 0, 480);
    crowdStreet(world, 1440, 860);
    driveForward(world, 3);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'mission') {
    s.missions.index = 3;
    s.missions.step = 1;
    s.money = 2500;
    s.player.x = LANDMARKS.bank.x;
    s.player.y = LANDMARKS.bank.y + 80;
    s.player.angle = -Math.PI / 2;
    s.player.inCar = false;
    s.camera.x = s.player.x;
    s.camera.y = s.player.y;
    world.setBrief('Mara: "One last job. Solmar Bank, in and out."', 30);
    idle(world, 1.5);
    return { screen: SCREEN_PLAY };
  }
  idle(world, 5);
  return { screen: SCREEN_TITLE };
}
