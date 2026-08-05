// JOURNEY — the camera, the input, and the grade. Everything the visitor feels
// but never sees. Composition math lives in composition.js, the flight in
// rig.js, interaction in input.js, the look in post.js, and the scroll that
// joins the two acts in roll.js.
//
// Contract: CONTRACT.md §4 (Journey) — createJourney(engine, world) -> { update }.

import { bus, state, setHover } from '../core/bus.js';
import { createCompositions } from './composition.js';
import { createRig } from './rig.js';
import { createInput } from './input.js';
import { createPost } from './post.js';
import { createRoll } from './roll.js';
import { smoothstep } from './easing.js';

/** How much paper the world dissolves into as the browse surface arrives. */
const ROLL_WASH = 0.62;

export function createJourney(engine, world) {
  const compositions = createCompositions(engine, world);
  const rig = createRig(engine, compositions);
  const post = createPost(engine);
  const roll = createRoll(engine);
  const input = createInput(engine, world, compositions, rig);

  bus.on('view:change', ({ view, venueId, roomId, previous }) => {
    // Past the title page the world is paused behind the browse surface:
    // choosing a church there is a printed matter and moves no camera. The
    // flights are still here, waiting for the roll to come back up.
    if (state.roll > 0) return;
    // Hover belongs to the depth it was picked at.
    setHover(null, null);
    // The world may restage for this depth (rooms presenting themselves, layers
    // sliding in) — measure again before framing anything.
    world.setView?.(view, venueId, roomId);
    compositions.remeasure();
    rig.beginFlight(previous?.view ?? 'arrival', view);
  });

  bus.on('hover:change', ({ venueId, roomId }) => {
    world.setHighlight?.(venueId, roomId);
  });

  bus.on('filters:change', ({ matching }) => {
    world.setFiltered?.(matching);
  });

  return {
    roll,
    update(dt, elapsed) {
      input.update(dt);
      rig.update(dt, elapsed);
      // Late in the roll the village gives itself up to paper, so the map's
      // own sheet arrives over ground rather than over a landscape.
      const wash = state.reducedMotion ? 0 : ROLL_WASH * smoothstep(0.4, 1, state.roll);
      post.setFade(Math.max(rig.fade, wash));
      post.update(dt, elapsed, compositions.tiltFor(state.roll > 0 ? 'arrival' : state.view));
    },
  };
}
