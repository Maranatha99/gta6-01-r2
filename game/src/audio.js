// All sound is synthesized with WebAudio: no audio files, no network. The engine hum follows
// the car's speed, the siren wails while the police are after you, and short blips mark
// pickups, crashes and mission results. Created lazily on the first key press or click.
export function createAudio() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let sirenHigh = false;
  let muted = false;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return false;
      context = new Ctor();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = context.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 660;
      sirenGain = context.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    } catch {
      context = null;
      return false;
    }
    return true;
  }

  /** A short tone: frequency in Hz, length in seconds, 'sine'|'square'|'triangle'. */
  function blip(frequency, seconds, type, volume) {
    if (!ensure() || muted) return;
    try {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + seconds);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(context.currentTime + seconds);
    } catch {
      // Sound is garnish: a failure here must never stop the game.
    }
  }

  return {
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() {
      return muted;
    },
    pickup() {
      blip(880, 0.12, 'sine', 0.25);
      setTimeout(() => blip(1318, 0.18, 'sine', 0.25), 90);
    },
    cash() {
      blip(1046, 0.1, 'triangle', 0.22);
      setTimeout(() => blip(1568, 0.16, 'triangle', 0.22), 80);
    },
    crash() {
      blip(90, 0.25, 'square', 0.3);
    },
    denied() {
      blip(180, 0.2, 'square', 0.2);
    },
    missionDone() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.25), i * 110));
    },
    busted() {
      [392, 311, 233].forEach((f, i) => setTimeout(() => blip(f, 0.3, 'sawtooth', 0.2), i * 160));
    },
    /** Called every frame: engine pitch from speed, siren wail while wanted. */
    update(dt, speed, wanted) {
      if (!context || muted) return;
      try {
        const target = speed > 4 ? 0.05 + Math.min(0.16, speed / 4200) : 0;
        engineGain.gain.setTargetAtTime(target, context.currentTime, 0.08);
        engineOsc.frequency.setTargetAtTime(48 + speed * 0.22, context.currentTime, 0.08);
        if (wanted > 0) {
          sirenTimer -= dt;
          if (sirenTimer <= 0) {
            sirenTimer = 0.55;
            sirenHigh = !sirenHigh;
            sirenOsc.frequency.setTargetAtTime(sirenHigh ? 880 : 620, context.currentTime, 0.05);
          }
          sirenGain.gain.setTargetAtTime(0.05, context.currentTime, 0.1);
        } else {
          sirenGain.gain.setTargetAtTime(0, context.currentTime, 0.1);
        }
      } catch {
        // Never let audio break the frame.
      }
    },
  };
}
