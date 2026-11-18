// The story: four missions for Rico Vale, a driver new to Solmar Bay, told by his fixer Mara.
// Each mission is a chain of objectives; an objective completes when the player reaches its
// marker, gets in a car, picks something up, or loses the heat. The world only advances the
// chain — the world module owns the rules for completing each kind.
import { LANDMARKS } from './city.js';
import { MISSION_REWARDS } from './config.js';

export const MISSION_NAMES = [
  'First Wheels',
  'The Pickup',
  'Heat',
  'The Big Score',
];

/**
 * Objective kinds:
 *  walkTo  — reach the marker on foot or in a car
 *  enterCar — get into any car
 *  driveTo — reach the marker while driving
 *  pickup  — reach the marker on foot (the package, the cash)
 *  escape  — lose the wanted level, or reach the safehouse marker
 */
export function missionObjectives(index) {
  switch (index) {
    case 0:
      return [
        { kind: 'walkTo', x: 960, y: 700, radius: 70, text: 'Walk to the parked car by the plaza' },
        { kind: 'enterCar', x: 960, y: 700, radius: 90, text: 'Press E to get in the car' },
        { kind: 'driveTo', x: LANDMARKS.marina.x, y: LANDMARKS.marina.y, radius: 110, text: 'Drive to the Marina — follow the yellow marker' },
      ];
    case 1:
      return [
        { kind: 'driveTo', x: LANDMARKS.parkPickup.x, y: LANDMARKS.parkPickup.y, radius: 160, text: 'Drive to Palma Park' },
        { kind: 'pickup', x: LANDMARKS.parkPickup.x, y: LANDMARKS.parkPickup.y, radius: 46, text: 'Get out and grab the package (walk over it)' },
        { kind: 'driveTo', x: LANDMARKS.docks.x, y: LANDMARKS.docks.y, radius: 110, text: 'Deliver the package to the Docks' },
      ];
    case 2:
      return [
        { kind: 'escape', x: LANDMARKS.safehouse.x, y: LANDMARKS.safehouse.y, radius: 130, text: 'Cops are on you! Lose the heat or reach the Safehouse' },
      ];
    case 3:
      return [
        { kind: 'driveTo', x: LANDMARKS.bank.x, y: LANDMARKS.bank.y, radius: 170, text: 'Drive to Solmar Bank' },
        { kind: 'pickup', x: LANDMARKS.bank.x, y: LANDMARKS.bank.y, radius: 60, text: 'Get out and grab the cash from the bank' },
        { kind: 'escape', x: LANDMARKS.safehouse.x, y: LANDMARKS.safehouse.y, radius: 130, text: '3 stars! Lose the cops and reach the Safehouse' },
      ];
    default:
      return [];
  }
}

/** The wanted level a mission starts with (the story sets the heat, not the player). */
export function missionStartWanted(index) {
  if (index === 2) return 2;
  if (index === 3) return 0;
  return 0;
}

/** The wanted level the final escape of a mission sets when the cash is grabbed. */
export function missionEscapeWanted(index) {
  if (index === 3) return 3;
  return 0;
}

export function missionReward(index) {
  return MISSION_REWARDS[index] ?? 0;
}

export function missionBrief(index) {
  switch (index) {
    case 0:
      return 'Mara: "Rico, welcome to Solmar Bay. There is a car waiting by the plaza — take it, and meet me at the Marina. Drive like you mean it."';
    case 1:
      return 'Mara: "A package is waiting in Palma Park. Pick it up on foot, then run it to the Docks. No questions, no stops."';
    case 2:
      return 'Mara: "The drop was watched — the cops are on you! Lose them, or get to my Safehouse. Do not get caught."';
    case 3:
      return 'Mara: "One last job. Solmar Bank, in and out. Grab the cash and bring it home. The whole city will be looking for you."';
    default:
      return 'Solmar Bay is yours now. Free roam — drive, explore, and keep the cash coming.';
  }
}

export function createMissions() {
  return {
    index: 0,
    step: 0,
    done: false,
    /** The objective the HUD should point at right now, or null when the story is over. */
    current() {
      if (this.done) return null;
      const steps = missionObjectives(this.index);
      return steps[this.step] ?? null;
    },
    advance() {
      const steps = missionObjectives(this.index);
      this.step += 1;
      if (this.step >= steps.length) {
        this.index += 1;
        this.step = 0;
        if (this.index >= MISSION_NAMES.length) this.done = true;
      }
    },
    reset() {
      this.index = 0;
      this.step = 0;
      this.done = false;
    },
  };
}
