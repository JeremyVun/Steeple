// The boot has first claim on the wire: the village chunks, the interface
// chunk and the poster are what the visitor is actually looking at. Work that
// belongs to the product surface — the opening search, the map tiles, the
// vocabulary — waits its turn here instead of elbowing into that window.
//
// "Its turn" is the first of: main.js releasing the gate outright (the visitor
// asked for the product, so there is no overture left to protect — build_plan
// Phase 3.5), the roll moving, or the browser going idle with a hard cap so a
// busy main thread cannot starve the product forever. Deep links land with the
// gate already released and run immediately.

import { bus, state } from './bus.js';

let released = false;
const waiting = new Set();

/**
 * The product is the page now — a press on the title page's calls to action, a
 * cold hash link, or a build with no village at all. Everything held for the
 * boot runs at once, and anything registered afterwards runs where it stands.
 */
export function releaseBoot() {
  released = true;
  for (const run of [...waiting]) run();
}

export function afterBoot(fn) {
  if (released || state.roll > 0) return fn();

  let unsubscribe = () => {};
  const run = () => {
    if (!waiting.delete(run)) return;
    unsubscribe();
    fn();
  };
  waiting.add(run);

  unsubscribe = bus.on('roll:change', run);
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 2200 });
  else setTimeout(run, 1200);
}
