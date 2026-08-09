// JOURNEY — the splash camera, roll gestures, and grade. The scene is scenery;
// product navigation does not restage it.
//
// Contract: CONTRACT.md §4 (Journey) — createJourney(engine, world) -> { update }.

import { state } from '../core/bus.js';
import { createCompositions } from './composition.js';
import { createRig } from './rig.js';
import { createInput } from './input.js';
import { createPost } from './post.js';
import { createRoll } from './roll.js';
import { smoothstep } from './easing.js';

/** How much paper the world dissolves into as the browse surface arrives. */
const ROLL_WASH = 0.62;

// The poster handoff: the first live frames compose against the photograph's
// aspect, so the render fades in standing exactly where the photograph was
// taken from; then the frame is given back to the window. Held still while the
// canvas crossfade is running (styles/main.css, 480ms) — a camera that moves
// mid-blend is the mismatch this exists to remove — then eased out.
const POSTER_HOLD_S = 0.65;
const POSTER_EASE_S = 1.2;

export function createJourney(engine, world, { posterAspect = null, roll: heldRoll = null } = {}) {
  const compositions = createCompositions(engine, world);
  const rig = createRig(engine, compositions);
  const post = createPost(engine);
  const roll = heldRoll ?? createRoll(engine);
  createInput(engine);

  // Only the title page opens over the poster; a deep link past it never sees
  // one. Kept through reduced motion too: the drift is centimetres over a
  // second and a half, far gentler than the cut it replaces.
  let posterT = posterAspect && state.view === 'arrival' && state.roll === 0 ? 0 : null;
  if (posterT === 0) compositions.setFitAspect(posterAspect);

  function settlePoster(dt) {
    if (posterT === null) return;
    posterT += dt;
    const p = smoothstep(POSTER_HOLD_S, POSTER_HOLD_S + POSTER_EASE_S, posterT);
    if (p >= 1) {
      compositions.setFitAspect(null);
      posterT = null;
      return;
    }
    compositions.setFitAspect(posterAspect + (engine.camera.aspect - posterAspect) * p);
  }

  return {
    roll,
    update(dt, elapsed) {
      settlePoster(dt);
      rig.update(dt, elapsed);
      // Late in the roll the village gives itself up to paper, so the map's
      // own sheet arrives over ground rather than over a landscape.
      const wash = state.reducedMotion ? 0 : ROLL_WASH * smoothstep(0.4, 1, state.roll);
      post.setFade(wash);
      post.update(dt, elapsed, compositions.tilt);
    },
  };
}
