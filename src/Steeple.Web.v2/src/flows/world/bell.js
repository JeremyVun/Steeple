// One soft bell, rung when a church says yes.
//
// Rules it keeps: no audio context exists before the visitor's first gesture
// (browsers forbid it and it would be rude anyway), reduced motion means no
// sound at all, and the loudest it ever gets is a room away.

const PARTIALS = [
  // A hum note and its overtones, tuned like a small bronze bell: fifth,
  // octave, minor third above. Quiet, short, no strike transient.
  { ratio: 0.5, gain: 0.55, decay: 3.4 },
  { ratio: 1.0, gain: 1.0, decay: 2.6 },
  { ratio: 1.5, gain: 0.32, decay: 1.9 },
  { ratio: 2.0, gain: 0.22, decay: 1.4 },
  { ratio: 2.4, gain: 0.13, decay: 1.0 },
];

export function createBell({ reducedMotion = false, volume = 0.055 } = {}) {
  let ctx = null;
  let gestured = false;

  function noteGesture() {
    gestured = true;
  }

  if (typeof window !== 'undefined') {
    for (const type of ['pointerdown', 'keydown', 'touchstart']) {
      window.addEventListener(type, noteGesture, { passive: true });
    }
  }

  function context() {
    if (ctx) return ctx;
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    return ctx;
  }

  return {
    get armed() {
      return gestured && !reducedMotion;
    },

    ring(root = 587.33) {
      if (reducedMotion || !gestured) return false;
      const audio = context();
      if (!audio) return false;
      if (audio.state === 'suspended') audio.resume?.();
      const t0 = audio.currentTime + 0.01;
      const out = audio.createGain();
      out.gain.value = volume;
      out.connect(audio.destination);
      for (const p of PARTIALS) {
        const osc = audio.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = root * p.ratio;
        const env = audio.createGain();
        env.gain.setValueAtTime(0.0001, t0);
        env.gain.exponentialRampToValueAtTime(p.gain, t0 + 0.012);
        env.gain.exponentialRampToValueAtTime(0.0001, t0 + p.decay);
        osc.connect(env);
        env.connect(out);
        osc.start(t0);
        osc.stop(t0 + p.decay + 0.05);
      }
      setTimeout(() => out.disconnect(), 4200);
      return true;
    },
  };
}
