// THE ROLL — the one scroll that joins the two acts, and the only thing that
// owns it. p runs 0 → 1: 0 is the title page over the breathing village, 1 is
// the browse surface with the world paused behind it. Everyone else reads
// `state.roll` and answers; nobody else writes it.
//
// A wheel is not a hand on the page: one tick means "take me there", and the
// whole eased move follows from it — down from the title page, up from the top
// of the product. A tick the other way while that move is running turns it
// around from wherever it has got to, at the speed it already had. A call to
// action means the same thing and is answered the same way.
//
// A finger is a hand on the page: it scrubs, and letting go always finishes in
// the direction the flick was going — never a threshold, never a snap back on
// a gesture that was plainly heading somewhere.
//
// Rolling up leaves at once. It carries an ease-out curve rather than the
// cinematic's ease-in-out, because a way out that spends its first tenth of a
// second deciding to move reads as a page that has hung.
//
// At p = 1 the renderer is put down on the frame the roll landed on and picks
// up from exactly there, so the ambient drift resumes rather than jumping. The
// roll keeps its own clock for that reason: it has to run while the world does
// not.
//
// Reduced motion gets neither: a short crossfade between the two acts, and no
// camera choreography at all.

import { bus, state, setRoll, setView, drainRollRequest } from '../core/bus.js';
import { clamp, easeInOutCubic, easeOutCubic, easeOutQuint } from './easing.js';

/** Gesture travel that carries the whole roll, never more than two thirds of a page. */
const span = () => Math.min(620, window.innerHeight * 0.68);

/** The cinematic; coming back up is a shade quicker than going down. */
const TWEEN = 1.28;
const RETURN = 0.94;
/** Part of the roll takes that part of the time — but never less than a beat. */
const SHORTEST = 0.3;
/** Reduced motion: a cut with the edge taken off it. */
const CROSSFADE = 0.24;

/** How much of the flick before this one still counts when a finger lets go. */
const FLICK_MEMORY = 0.5;

export function createRoll(engine, { beforeReturn = null } = {}) {
  const reduced = state.reducedMotion;

  let p = 0;
  let ticking = false;
  let last = 0;

  let tweening = false;
  let from = 0;
  let to = 0;
  let clock = 0;
  let duration = 1;
  let curve = easeInOutCubic;
  let landing = null;

  let scrubbing = false;
  let origin = 0;
  let flick = 0;

  function put(next) {
    const clamped = clamp(next, 0, 1);
    if (clamped === p) return;
    p = clamped;
    setRoll(p);
    // Zero work while the visitor is in the product, and not a frame sooner.
    if (p >= 1) engine.stop();
    else engine.start();
  }

  /**
   * The two ends of the roll are two views: the title page, and the product.
   * Everything between belongs to the roll and nothing changes underneath it.
   */
  function arrive() {
    if (p >= 1 && state.view === 'arrival') setView('village');
    else if (p <= 0 && state.view !== 'arrival') setView('arrival');
  }

  // Only a tween needs a clock. A scrub is driven by the hand doing it, and a
  // hand that rests halfway through a drag has not let go of anything — the
  // gesture ends when the finger comes off, and at no other moment.
  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    if (tweening) {
      clock += dt;
      const k = clamp(clock / duration, 0, 1);
      put(from + (to - from) * curve(k));
      if (k >= 1) {
        tweening = false;
        arrive();
        const done = landing;
        landing = null;
        done?.();
      }
    }

    if (tweening) requestAnimationFrame(tick);
    else ticking = false;
  }

  function wake() {
    if (ticking) return;
    ticking = true;
    last = performance.now();
    requestAnimationFrame(tick);
  }

  /**
   * Part of the roll costs that part of the cinematic, so turning a tween
   * around near its end is a short move and not a second full journey.
   */
  function timeFor(target) {
    if (reduced) return CROSSFADE;
    const full = target > p ? TWEEN : RETURN;
    return Math.max(full * Math.abs(target - p), SHORTEST);
  }

  /**
   * The curve a move deserves. Going down from a standing start is the
   * cinematic. Coming back up, or turning around mid-flight, has to leave
   * immediately: an ease-in there is a page that looks broken for a moment.
   */
  function curveFor(target) {
    if (tweening || scrubbing) return easeOutQuint;
    return target < p ? easeOutCubic : easeInOutCubic;
  }

  function tweenTo(target, seconds, land = null) {
    const wanted = clamp(target, 0, 1);
    // A trackpad's momentum asks for the same landing thirty times over. The
    // move already running is the answer; restarting it would stall it forever.
    if (tweening && wanted === to) {
      if (land) landing = land;
      return;
    }
    curve = curveFor(wanted);
    scrubbing = false;
    if (seconds <= 0) {
      tweening = false;
      put(wanted);
      arrive();
      land?.();
      return;
    }
    from = p;
    to = wanted;
    clock = 0;
    duration = seconds;
    landing = land;
    tweening = true;
    wake();
  }

  function scrub(pixels) {
    if (reduced) {
      // No scrubbing without motion: the gesture is read as an intention.
      if (Math.abs(pixels) > 4) tweenTo(pixels > 0 ? 1 : 0, CROSSFADE);
      return;
    }
    if (!scrubbing) {
      scrubbing = true;
      origin = p < 0.5 ? 0 : 1;
      flick = 0;
    }
    tweening = false;
    // Where the hand is heading, with the last moment weighted heaviest: a
    // finger that wobbles on the way is still plainly going one way.
    flick = flick * FLICK_MEMORY + pixels;
    put(p + pixels / span());
  }

  function release() {
    if (!scrubbing) return;
    scrubbing = false;
    // A flick finishes what it started. Only a gesture that went nowhere at all
    // falls back to the end it came from.
    const target = flick > 0 ? 1 : flick < 0 ? 0 : origin;
    flick = 0;
    if (target === p) return arrive();
    tweenTo(target, timeFor(target));
  }

  bus.on('roll:request', ({ target, land }) => {
    const wanted = clamp(target, 0, 1);
    if (wanted < p) beforeReturn?.();
    if (wanted === p && !tweening) {
      arrive();
      land?.();
      return;
    }
    tweenTo(wanted, timeFor(wanted), land);
  });

  bus.on('roll:scrub', ({ pixels, done }) => {
    if (pixels) scrub(pixels);
    if (done) release();
  });

  // A cold load carrying a place goes straight to it. The cinematic belongs to
  // someone arriving at the front door, not to a link somebody was sent — and
  // the view stays whatever the hash is about to say it is.
  if (window.location.hash.replace(/^#\/?/, '')) {
    p = 1;
    setRoll(1);
    engine.stop();
  }

  // Anything that asked for a roll while this file was still being fetched.
  drainRollRequest();

  return {
    /** 0..1 — where the roll stands. */
    get: () => p,
    /** Put it there this instant. The verification harness photographs frames. */
    set(next) {
      tweening = false;
      scrubbing = false;
      flick = 0;
      landing = null;
      put(next);
      arrive();
    },
    /** Replace the flat boot's inert engine and honor where the roll now stands. */
    attachEngine(next) {
      engine = next;
      if (p >= 1) engine.stop();
      else engine.start();
    },
  };
}
