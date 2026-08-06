// BOOT. Two ways in, and the second one is the point of this file.
//
// With the village: renderer, world, journey, interface, in that order, and the
// title page waiting for the roll.
//
// Without it (`?world=off`, or a build made with VITE_WORLD=off — see
// package.json's `build:flat`): the same product with nothing behind it. No
// renderer is made, no WebGL context is asked for, three.js is never imported
// — the engine, the world and the journey are behind a dynamic import that the
// flat build compiles away entirely — and the page opens on the browse surface
// rather than on a title page over a village that is not there. Everything past
// that point is the same code: the interface only ever talked to core/bus.js.
//
// The roll survives the world's absence, because it is only a number: the
// wordmark still takes you back up to the title page, and the page still comes
// back down. What it loses is the canvas that used to carry the gesture, so the
// flat boot puts the wheel and the down-arrow on the page instead.
//
// The second way in is also the safety net. A visitor whose browser refuses a
// WebGL context — an old machine, a hardened profile, a blocklisted driver — or
// whose three.js chunk never arrives, is not owed a blank page: the village is
// the overture, and the product underneath it is whole without one. Any failure
// raising the world is one calm line in the console and then `bootFlat`.

import { createRoll } from './journey/roll.js';
import { createUI } from './ui/index.js';
import {
  bus,
  state,
  setView,
  setFilters,
  setHover,
  setStyle,
  setMode,
  setMap,
  rollTo,
  applyHash,
} from './core/bus.js';
import { store } from './data/store.js';
import * as session from './data/session.js';

/** Compile-time, not run-time: this is what lets the flat build drop three.js. */
const BUILT_FLAT = import.meta.env.VITE_WORLD === 'off';

/**
 * The debug/verification API — used by tools/*.mjs. Do not remove.
 *
 * It is a key to the whole product's insides — the session, the store, the bus
 * — so a production bundle does not carry it. The dev server always has it;
 * a build has it only when asked for one: `VITE_DEBUG=on vite build`, which is
 * what `npm run build:debug` and `build:flat:debug` are for. The suites drive
 * the dev server, apart from world-off-test.mjs's second invocation against a
 * served flat build — that one wants `build:flat:debug`.
 *
 * `window.__steepleReady` is not part of this: it is the boot signal core/
 * engine.js itself reads to know whether the loop may be put down, so it is set
 * in every build.
 */
const DEBUG_API = import.meta.env.DEV || import.meta.env.VITE_DEBUG === 'on';

function publish(extra) {
  if (!DEBUG_API) return;
  window.__steeple = {
    bus,
    state,
    setView,
    setFilters,
    setHover,
    setStyle,
    setMode,
    setMap,
    store,
    // Who the page is: harnesses that need a signed-in guest sign one in for
    // real against the local API, exactly as the identity panel does.
    session,
    ...extra,
  };
}

async function boot() {
  const canvas = document.getElementById('scene');
  if (BUILT_FLAT || state.world === 'off') return bootFlat(canvas);

  try {
    await bootVillage(canvas);
  } catch (failure) {
    console.warn('[steeple] The village could not be raised — opening the product without it.', failure);
    bootFlat(canvas);
  }
}

/** The product with the village behind it. Throws rather than half-boots. */
async function bootVillage(canvas) {
  const { createEngine } = await import('./core/engine.js');
  const { buildWorld } = await import('./world/index.js');
  const { createJourney } = await import('./journey/index.js');

  const engine = createEngine(canvas);
  try {
    // A refused context is usually a throw out of the renderer's constructor,
    // but not always: a driver can hand back a context that is already lost, or
    // lose it between creation and the first frame. Either way there is nothing
    // to render into, and the page is better off flat than black.
    const gl = engine.renderer.getContext();
    if (!gl || gl.isContextLost?.()) throw new Error('WebGL context lost before the first frame');

    const world = await buildWorld(engine);
    const journey = createJourney(engine, world);
    createUI(engine, world);

    engine.onUpdate((dt, elapsed) => {
      world.update(dt, elapsed);
      journey.update?.(dt, elapsed);
    });

    publish({
      engine,
      world,
      // The roll, set instantly: the screenshot harness photographs frames of it.
      roll: journey.roll,
    });

    window.addEventListener('hashchange', applyHash);
    applyHash();

    engine.start();
  } catch (failure) {
    // Hand the context back before the fallback takes the canvas away: a live
    // renderer nobody can see is a GPU allocation nobody can free.
    release(engine);
    throw failure;
  }
}

function release(engine) {
  try {
    engine.stop();
    engine.renderer.dispose();
    engine.renderer.forceContextLoss?.();
  } catch {
    // A context that cannot be given back is the case we are already in.
  }
}

/**
 * The product with nothing behind it.
 *
 * Also the landing place when raising the village fails, so nothing here may
 * assume a clean page: the canvas may already be gone, and #ui may hold a
 * half-built interface — `createUI` empties it before it builds, which is what
 * makes calling this after a partial village boot safe.
 */
function bootFlat(canvas) {
  // An aria-hidden black rectangle under the paper helps nobody.
  canvas?.remove();
  document.documentElement.dataset.world = 'off';

  // The roll needs a renderer only to put it down at the top and pick it up
  // again. With no renderer there is nothing to put down.
  const roll = createRoll({ start() {}, stop() {} });

  createUI(null, null);
  publish({ engine: null, world: null, roll });

  window.addEventListener('hashchange', applyHash);
  applyHash();

  // A page with no title act to fly through opens on the product. The title
  // page is still up there; the wordmark is still the way to it.
  roll.set(1);

  flatGestures();
  window.__steepleReady = true;
}

/**
 * One level up, for the depths that exist when there is no world to fly in.
 *
 * The ladder is the breadcrumb's (ui/nav.js): the step Esc takes is the step the
 * trail offers, so the two can never disagree (CONTRACT6 §1.2). A letter closes
 * onto the correspondence it belongs to — the parish's board for a host, the
 * guest's own inbox for a guest — which is exactly what the crumb above it says.
 * journey/input.js walks the same ladder with a camera on it, and remembers
 * besides which view a correspondence was opened from; a page with no journey
 * has no such memory and answers with the correspondence itself.
 */
function shallower() {
  switch (state.view) {
    case 'room':
      return state.venueId ? { view: 'venue', venueId: state.venueId } : { view: 'village' };
    case 'venue':
      return { view: 'village' };
    case 'letter':
      return state.mode === 'host'
        ? { view: 'desk', venueId: state.venueId }
        : { view: 'journal' };
    case 'journal':
    case 'desk':
      return { view: 'village' };
    // 'apply' is missing on purpose: the request sheet answers Escape itself,
    // in capture, wherever focus is sitting (ui/guest/composer.js).
    default:
      return null;
  }
}

/**
 * What the canvas used to listen for, listened for by the page instead.
 *
 * journey/input.js is the source of truth for all of this and it is the half of
 * the experience the flat page does not have. What is repeated here is only the
 * part with meaning without a camera: the wheel that starts the roll, the key
 * that comes down off the title page, and Esc going back up a level. The scene
 * cycle (Tab, arrows, Enter) is not repeated, because there is no scene to
 * cycle. A sheet that answers Escape itself — the request composer, the listing
 * flow, an open drawer, the account card — still answers first: each of them
 * stops the key before it reaches this.
 *
 * If a third caller ever needs `ascend`, it should be hoisted into core/bus.js
 * rather than written a third time.
 */
function flatGestures() {
  window.addEventListener(
    'wheel',
    (event) => {
      // Past the roll the wheel belongs to whatever is being scrolled.
      if (state.roll >= 1) return;
      rollTo(event.deltaY > 0 ? 1 : 0);
    },
    { passive: true }
  );

  const pageHasTheKey = (event) =>
    event.target === document.body || event.target === document.documentElement;

  const dialogIsOpen = () =>
    [...document.querySelectorAll('#ui [role="dialog"], #ui dialog[open], #ui [data-modal="open"]')].some(
      (node) => (node.checkVisibility ? node.checkVisibility() : node.offsetParent !== null)
    );

  window.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.key === 'Escape') {
      if (dialogIsOpen()) return;
      const next = shallower();
      if (!next) return;
      const { view, ...where } = next;
      event.preventDefault();
      setView(view, where);
      return;
    }

    if (state.view !== 'arrival' || !pageHasTheKey(event)) return;
    if (event.key !== 'ArrowDown' && event.key !== 'PageDown') return;
    event.preventDefault();
    rollTo(1);
  });
}

boot();
