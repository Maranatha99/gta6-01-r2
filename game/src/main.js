// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between five screens: title, play, paused, busted and story complete.
//
// ?seed=N fixes the city. ?shot=title|drive|chase|mission (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
// window.__solmar exposes the live state for play-testing: { state, screen }.
import { SAVE_KEY, STEP } from './config.js';
import {
  EVENT_BUSTED,
  EVENT_CAR_WRECKED,
  EVENT_CASH,
  EVENT_CRASH,
  EVENT_MISSION,
  EVENT_PICKUP,
  EVENT_STORY_DONE,
  createWorld,
} from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import {
  SCREEN_BUSTED,
  SCREEN_DONE,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  createRenderer,
} from './render.js';
import { stageShot } from './shots.js';
import { missionBrief } from './missions.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(seed);
const renderer = createRenderer(canvas);
const audio = createAudio();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (typeof save.money !== 'number' || typeof save.missionIndex !== 'number') return null;
    return save;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(world.snapshotSave()));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  const save = readSave();
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, save);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let save = readSave();
  let accumulator = 0;
  let last = performance.now();
  let newGameKey = false;

  // Screen readers (and anyone watching the page's text) hear the screen changes and events.
  function announce(message) {
    status.textContent = message;
  }

  function startGame(fromSave) {
    world.reset();
    if (fromSave && save) world.applySave(save);
    world.setBrief(missionBrief(world.state.missions.index), 6);
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Mission ' + (world.state.missions.index + 1) + '.');
  }

  function toTitle() {
    save = readSave();
    screen = SCREEN_TITLE;
    announce('Solmar Bay. Press Enter to start.');
  }

  function handleEvents(events) {
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_CASH) audio.cash();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_CAR_WRECKED) audio.crash();
    if (events & EVENT_MISSION) {
      audio.missionDone();
      const done = world.state.missions.done;
      if (done) {
        screen = SCREEN_DONE;
        announce('The Big Score is done. Solmar Bay is yours.');
      } else {
        const reward = world.state.money;
        world.setToast('Mission complete!  +$' + reward.toLocaleString('en-US') + ' total', 4);
        announce('Mission complete.');
      }
      writeSave();
    }
    if (events & EVENT_STORY_DONE) writeSave();
    if (events & EVENT_BUSTED) {
      audio.busted();
      screen = SCREEN_BUSTED;
      announce('Busted. The mission restarts at the Safehouse.');
    }
  }

  function step() {
    const actions = input.takeActions();
    if (input.takeAnyKey()) audio.unlock();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      world.setToast(muted ? 'Sound off' : 'Sound on', 2);
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) startGame(!!save);
      // 'C' starts a fresh game even when a save exists: read the key directly.
      if (newGameKey) {
        newGameKey = false;
        save = null;
        try {
          window.localStorage.removeItem(SAVE_KEY);
        } catch {
          // Ignore storage failures.
        }
        startGame(false);
      }
      world.step(STEP, { x: 0, y: 0 }, false, false);
      return;
    }
    if (screen === SCREEN_BUSTED) {
      if (actions & ACTION_CONFIRM) {
        world.retryMission();
        screen = SCREEN_PLAY;
        announce('Mission restarted at the Safehouse.');
      }
      return;
    }
    if (screen === SCREEN_DONE) {
      if (actions & ACTION_CONFIRM) {
        screen = SCREEN_PLAY;
        announce('Free roam. Solmar Bay is yours.');
      }
      return;
    }
    if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
      return;
    }
    if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const vec = input.vector();
    const events = world.step(STEP, vec, input.handbrake(), !!(actions & ACTION_ENTER));
    audio.update(STEP, world.state.player.inCar ? Math.abs(world.state.car.speed) : 0, world.state.wanted);
    handleEvents(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    // 'C' for a new game is read here, before step() consumes the frame's actions.
    while (accumulator >= STEP) {
      step();
      accumulator -= STEP;
      if (screen !== SCREEN_PLAY && screen !== SCREEN_TITLE) break;
    }
    if (screen === SCREEN_PAUSED || screen === SCREEN_BUSTED || screen === SCREEN_DONE) accumulator = 0;
    renderer.draw(world.state, screen, save);
  }

  // Leaving the tab pauses a running game rather than letting the cops catch you unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });
  // 'C' on the title screen starts a new game instead of continuing the save.
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyC' && screen === SCREEN_TITLE) newGameKey = true;
  });

  // Live state for play-testing (headless or console): read-only view of the game.
  window.__solmar = {
    get state() {
      return world.state;
    },
    get screen() {
      return screen;
    },
    get save() {
      return save;
    },
  };

  world.reset();
  announce('Solmar Bay. Press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
