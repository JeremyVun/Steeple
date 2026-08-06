// BOOT. Three states, and which one the page ends in is the visitor's to decide.
//
//   printed arrival   the title page, in the document itself, answering presses
//                     through core/intent.js before any of this has run. Its
//                     controls are real links: the address bar is the record of
//                     a press even if no script ever arrives.
//   live village      nobody asked for anything, so the overture is raised —
//                     engine, world and journey, over the poster of their own
//                     opening frame, and the cinematic roll past that.
//   product-first     somebody asked. The product opens flat, at once, and the
//                     village is not started; a village already being started is
//                     abandoned rather than raised over a map in use. That visit
//                     stays flat, including a later return to the title page.
//
// Intent beats scenery. That is the whole ordering rule here: the interface
// chunk goes on the wire first and alone, and engine/world/journey wait for the
// interface to be interactive, for the browser to draw breath, and for nobody
// to have asked for the product in the meantime. A dynamic import already in
// flight cannot be called back, so sequencing is the only dependable way to
// leave the connection to the tiles, the catalog and the photographs.
//
// The title page itself is not booted at all: it is printed in index.html and
// already on screen. What boots here arrives behind it.
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
// The flat way in is also the safety net. A visitor whose browser refuses a
// WebGL context — an old machine, a hardened profile, a blocklisted driver — or
// whose three.js chunk never arrives, is not owed a blank page: the village is
// the overture, and the product underneath it is whole without one. Any failure
// raising the world is one calm line in the console and then `bootFlat`.

// First, and on purpose: this is what answers the printed title page's presses,
// and it must be armed before anything else in the entry runs. It imports
// nothing — no bus, no roll, no session, no store, and nothing of the 105KB
// interface chunk, Leaflet or three.js.
import {
  claimArrival,
  pendingArrival,
  releaseArrival,
  reportArrival,
  settledArrivals,
  whenArrival,
} from './core/intent.js';
import { createRoll } from './journey/roll.js';
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
import { releaseBoot } from './core/idle.js';
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
    // Every arrival intent that settled, in order — the exactly-once proof
    // tools/boot-priority-test.mjs reads.
    arrival: settledArrivals,
    ...extra,
  };
}

// The interface is its own chunk now — the entry stays small enough that the
// pre-rendered title page in index.html is not waiting on Leaflet and the whole
// product surface to parse. Started here, unconditionally, so its download runs
// beside the village chunks rather than after them; built the moment it lands,
// because createUI never needed the world (it only ever talked to core/bus.js).
const interfaceReady = import('./ui/index.js').then(({ createUI }) => createUI(null, null));

/**
 * The product has the page. Set the moment an intent, a deep link or a failure
 * decides it, and read by the village boot at every point it could still create
 * or start something: a boot generation that has been overtaken must never
 * raise an engine over a map somebody is already using.
 */
let taken = false;

/** How long a busy main thread may postpone the village. Not indefinitely. */
const IDLE_CAP = 600;

async function boot() {
  const canvas = document.getElementById('scene');
  const flat = BUILT_FLAT || state.world === 'off';
  // A cold link to a place in the product is somebody who has already chosen:
  // no title page, no overture, and no village fetched behind their back.
  const linked = Boolean(window.location.hash.replace(/^#\/?/, ''));

  if (flat || linked || pendingArrival()) {
    taken = true;
    // Nothing is left to protect the wire for: the opening search and the map's
    // vocabulary may go now rather than at the browser's convenience.
    releaseBoot();
    await interfaceReady;
    return bootFlat(canvas);
  }

  // The interface has the connection to itself. Only once it is interactive,
  // and the browser has a moment to spare, does the overture get to download.
  await interfaceReady;
  await Promise.race([idleOpportunity(), whenArrival()]);
  if (pendingArrival()) {
    taken = true;
    releaseBoot();
    return bootFlat(canvas);
  }

  const raised = bootVillage(canvas).then(
    (up) => up,
    (failure) => {
      // A boot that was overtaken is not a boot that failed.
      if (!taken)
        console.warn('[steeple] The village could not be raised — opening the product without it.', failure);
      return false;
    }
  );

  const outcome = await Promise.race([raised, whenArrival().then(() => 'asked')]);
  // Either the village stands, or a press landed so late that the live roll had
  // already claimed and answered it. Both leave the page the village's.
  if (outcome === true || (outcome === 'asked' && !pendingArrival())) return;

  taken = true;
  releaseBoot();
  bootFlat(canvas);
}

/** The browser drawing breath, or the cap — whichever comes first. */
function idleOpportunity() {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function')
      requestIdleCallback(() => resolve(), { timeout: IDLE_CAP });
    else setTimeout(resolve, IDLE_CAP);
  });
}

/**
 * The product with the village behind it. Answers `true` if it raised one,
 * `false` if the product took the page while it was working, and throws if
 * there is no village to be had.
 */
async function bootVillage(canvas) {
  // Three chunks, one round trip: nothing in engine.js is needed to *download*
  // the world or the journey, so fetching them one after the other was three
  // serial trips for no ordering that mattered.
  const [{ createEngine }, { buildWorld }, { createJourney }] = await Promise.all([
    import('./core/engine.js'),
    import('./world/index.js'),
    import('./journey/index.js'),
  ]);

  // The narrow interval: the press landed while these were in flight. Their
  // transfers are done and cannot be given back, but nothing is made of them —
  // an engine started now would be a renderer nobody asked for, running behind
  // a product already on screen.
  if (taken) return false;

  const engine = createEngine(canvas);
  try {
    // A refused context is usually a throw out of the renderer's constructor,
    // but not always: a driver can hand back a context that is already lost, or
    // lose it between creation and the first frame. Either way there is nothing
    // to render into, and the page is better off flat than black.
    const gl = engine.renderer.getContext();
    if (!gl || gl.isContextLost?.()) throw new Error('WebGL context lost before the first frame');

    const world = await buildWorld(engine);
    // Building a world takes long enough for somebody to give up on it.
    if (taken) {
      release(engine);
      return false;
    }

    const journey = createJourney(engine, world, { posterAspect: posterAspect() });
    // The harness contract: __steepleReady (frame 10) means a village boot's
    // interface is standing and warm. The chunk has been downloading since the
    // first line of this module, so this await is long settled.
    await interfaceReady;
    if (taken) {
      release(engine);
      return false;
    }

    // Until the first frame is on the canvas the poster underneath is the
    // village; the crossfade between them is the real opening frame arriving.
    const arrived = engine.onUpdate(() => {
      arrived();
      canvas.classList.add('is-live');
      const poster = document.getElementById('poster');
      if (poster) setTimeout(() => poster.remove(), 800);
    });

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

    // The roll is real now, so the title page's controls may have it: from here
    // a press is the cinematic rather than a jump down the hash. A press that
    // landed in the last moments of this boot is answered the same way, by
    // releaseArrival itself.
    releaseArrival();
    return true;
  } catch (failure) {
    // Hand the context back before the fallback takes the canvas away: a live
    // renderer nobody can see is a GPU allocation nobody can free.
    release(engine);
    throw failure;
  }
}

/**
 * Which photograph the page chose, as an aspect the journey can compose
 * against — the first live frame must stand exactly where it was taken from
 * (journey/index.js). From the filename, not naturalWidth: the name is there
 * before a single byte of the image is, and tools/poster.mjs guarantees its
 * shape.
 */
function posterAspect() {
  const src = document.querySelector('#poster img')?.currentSrc ?? '';
  const m = src.match(/-(\d+)x(\d+)\.[0-9a-f]{8}\.webp$/);
  return m ? Number(m[1]) / Number(m[2]) : null;
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
 * The product with nothing behind it. The interface itself is already standing
 * — boot() awaits `interfaceReady` before coming here — so this is only the
 * flat page's own furniture: no canvas, no poster, the roll landed.
 *
 * Every way here but one is a choice: a build with no village in it, `?world=off`,
 * a cold hash link, or a press on the title page that beat the overture. The
 * exception is a village that could not be raised, so nothing here may assume a
 * clean page: the canvas may already be half-alive.
 */
function bootFlat(canvas) {
  // An aria-hidden black rectangle under the paper helps nobody, and a poster
  // of a village that is not coming is a lie about what scrolling reveals.
  canvas?.remove();
  document.getElementById('poster')?.remove();
  document.documentElement.dataset.world = 'off';

  // The roll needs a renderer only to put it down at the top and pick it up
  // again. With no renderer there is nothing to put down.
  const roll = createRoll({ start() {}, stop() {} });

  publish({ engine: null, world: null, roll });

  window.addEventListener('hashchange', applyHash);
  applyHash();

  // What was pressed, applied — once. The address bar usually says the same
  // thing already (the controls are links, and the native navigation was left
  // alone), so this is belt and braces for the case where it does not.
  const asked = claimArrival();
  if (asked) {
    reportArrival(asked.destination, 'direct');
    setView(asked.destination === 'desk' ? 'desk' : 'village');
  }

  // A page with no title act to fly through opens on the product. The title
  // page is still up there; the wordmark is still the way to it.
  roll.set(1);

  // And when it is reached again, its controls belong to the roll like any
  // other page's do — flat or not, the press is answered here now.
  releaseArrival();

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

// Nothing catches for boot(): if even the interface chunk cannot be had, the
// page the visitor keeps is the pre-rendered title sheet, and the console says
// why nothing answers it.
boot().catch((failure) => console.error('[steeple] Boot failed outright.', failure));
