// A small seeded random generator (xorshift32): the same seed gives the same city, the same
// traffic colours and the same screenshot scenes, which is what makes the game repeatable.

export function createRandom(seed) {
  let a = (seed | 0) || 0x9e3779b9;
  return function random() {
    a ^= a << 13;
    a ^= a >>> 17;
    a ^= a << 5;
    return ((a >>> 0) / 4294967296);
  };
}

/** Integer in [min, max] from a random function. */
export function randomInt(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

/** One element of an array, picked by a random function. */
export function randomPick(random, list) {
  return list[Math.floor(random() * list.length)];
}

/** Fisher-Yates shuffle of a copy, driven by a random function. */
export function shuffled(random, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
