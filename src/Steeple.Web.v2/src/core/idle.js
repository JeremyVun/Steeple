// The boot has first claim on the wire: the village chunks, the interface
// chunk and the poster are what the visitor is actually looking at. Work that
// belongs to the product surface — the opening search, the map tiles, the
// vocabulary — waits its turn here instead of elbowing into that window.
//
// "Its turn" is the first of: the roll moving (the visitor is heading for the
// product, warm it NOW), or the browser going idle with a hard cap so a busy
// main thread cannot starve the product forever. Deep links land with the roll
// already past zero and run immediately.

import { bus, state } from './bus.js';

export function afterBoot(fn) {
  if (state.roll > 0) return fn();

  let done = false;
  let unsubscribe = () => {};
  const run = () => {
    if (done) return;
    done = true;
    unsubscribe();
    fn();
  };

  unsubscribe = bus.on('roll:change', run);
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 2200 });
  else setTimeout(run, 1200);
}
