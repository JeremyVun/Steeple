// THE ARRIVAL INTENT — intent beats scenery.
//
// The title page is printed in index.html and on screen long before any of the
// product is. Everything on it is pressable from that first frame, and a press
// is an answer the page owes: whoever pressed Find a space is going to the
// spaces, whether or not three.js ever arrives.
//
// Three layers hold that promise, weakest first:
//
//   1. the markup. The two calls to action and the down affordance are real
//      links to the clean routes they mean — `browse` and `desk`, relative to
//      the document's <base>, so one build means /browse at the root and
//      /steeple/browse behind a stripped prefix. If this module is the last
//      script that never arrives, the press is an ordinary navigation to a real
//      document, and the boot that follows opens there. The URL is the recovery
//      truth, and since the routes became real paths it is a truth the *server*
//      can answer too (docs/contracts/seo.md SEO-D1/D3).
//   2. this module. An external same-origin module — the CSP forbids an inline
//      script — and the entry's first import, armed before main.js's own body
//      runs and long before the 105KB interface chunk that used to own these
//      handlers. It imports one thing, core/router.js, which imports nothing
//      itself: no bus, no roll, no session, no store, no Leaflet, no world.
//      Its whole job is to write down {destination, requestedAt}, put that
//      destination in the address bar, say quietly that the press was heard,
//      and hold it for whoever boots. (A <script> of its own in index.html buys
//      nothing: Vite folds every extra html entry back into the first as a
//      static import.)
//   3. main.js. It claims that intent exactly once and lets it decide the boot:
//      an intent means the product, now, flat — the village is not started, and
//      an already-started one is abandoned rather than raised over the top of a
//      map somebody is using.
//
// Once the roll is genuinely live — the interface standing *and* journey/roll.js
// made — main.js releases the page to it (`releaseArrival`), and from then on a
// press is the cinematic instead: the native navigation is prevented and
// ui/arrival.js's handler runs. Not before: the interface chunk can land while
// the world is still building, and a `rollTo` answered by nobody is a press
// thrown away.

import { freezeBase } from './router.js';

// The deployment's base, resolved to an absolute path before this module can
// write anything into history: a *relative* <base> is re-resolved against the
// visible address, so the first press-turned-pushState would otherwise re-root
// every asset and `api/v1` call at the route it wrote (SEO-D4 · index.html).
freezeBase();

/** What each printed control means. Written in the markup, read from it. */
const DESTINATIONS = new Set(['village', 'desk']);

/** Unclaimed: `{ destination, requestedAt }`. Null once main.js has taken it. */
let pending = null;
let claimed = false;

/** What a press does once the roll is live, and whether it may yet (main.js). */
let handler = null;
let released = false;
const live = () => (released ? handler : null);

/** Resolvers held by `whenArrival()` — settled by the first press. */
const waiting = new Set();

/** Every arrival that settled, in order. One per visit; the harness counts. */
const settled = [];

function destinationOf(target) {
  const node = target?.closest?.('[data-intent]');
  const destination = node?.dataset.intent;
  return destination && DESTINATIONS.has(destination) ? { node, destination } : null;
}

/**
 * Quiet progress, from the frame of the press: the control keeps its shape and
 * takes on a slow breath (styles/main.css). Nothing has gone wrong — the page
 * is on its way — so it is not a spinner and not a word.
 */
function acknowledge(node) {
  if (node.dataset.working === 'on') return;
  node.dataset.working = 'on';
  node.closest('.arrival')?.setAttribute('aria-busy', 'true');
}

/**
 * The address bar, told what was pressed — without leaving the document.
 *
 * The printed controls are paths now, so the native navigation is a whole new
 * document: it would throw away a boot already in flight, the interface chunk
 * already on the wire, and this record with it. Writing the same URL by hand
 * keeps every promise the link made — a reload, a share and a restored tab all
 * land on the pressed destination — and costs nothing.
 *
 * The query goes with it. `?map=`, `?world=off` and `?q=` are the
 * visitor's, and a press is not a reason to spend them (SEO-D2).
 */
function record(node) {
  const href = node.getAttribute('href');
  if (!href || typeof history === 'undefined') return;
  try {
    const target = new URL(href, document.baseURI);
    if (target.origin !== window.location.origin) return;
    history.pushState(null, '', `${target.pathname}${window.location.search}`);
  } catch {
    // An address that cannot be built is an address not worth writing.
  }
}

function press(event, node, destination) {
  const cinematic = live();
  if (cinematic) {
    // The roll owns the page: the cinematic is the answer, not a navigation.
    event.preventDefault();
    cinematic(destination);
    return;
  }

  acknowledge(node);
  // This module is here, so the press is answered here: the document stays,
  // and the address bar is written below exactly as the link would have.
  event.preventDefault();
  if (claimed) return;

  // Until it is claimed the record is the latest press, not the first: someone
  // who presses Find a space and then Host a space is going to the desk, which
  // is also where the address bar now points. Claiming is the one-shot part.
  record(node);
  pending = { destination, requestedAt: Math.round(performance.now()) };
  for (const resolve of waiting) resolve(pending);
  waiting.clear();
}

// A middle click, or one with a modifier down, is somebody opening the title
// page's route in a window of their own. That is the link's business and none
// of this module's: it must not record an intent for a page nobody is on.
function onClick(event) {
  if (event.defaultPrevented || event.button > 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const found = destinationOf(event.target);
  if (found) press(event, found.node, found.destination);
}

// A link answers Enter by itself; Space is the button half of these controls,
// and the printed page must not lose it while it waits for the interface.
function onKeydown(event) {
  if (event.key !== ' ' && event.key !== 'Spacebar') return;
  const found = destinationOf(event.target);
  if (!found || found.node !== document.activeElement) return;
  event.preventDefault();
  found.node.click();
}

// Capture, at the document: the controls may be the printed markup or the set
// ui/arrival.js builds for a page that lacks it, and one listener answers for
// both without either of them knowing this file exists.
document.addEventListener('click', onClick, true);
document.addEventListener('keydown', onKeydown, true);

/** What was asked for, if anything, and nobody has taken it yet. */
export function pendingArrival() {
  return pending;
}

/** Resolves on the first press. Never rejects; never resolves without one. */
export function whenArrival() {
  if (pending) return Promise.resolve(pending);
  return new Promise((resolve) => waiting.add(resolve));
}

/**
 * Take the intent — once. The second caller gets null, which is the whole
 * point: one press, one destination, applied by one boot.
 */
export function claimArrival() {
  if (!pending) return null;
  const intent = pending;
  pending = null;
  claimed = true;
  return intent;
}

/** ui/arrival.js says what a press does; main.js says when it may (below). */
export function setArrivalHandler(fn) {
  handler = fn;
}

/**
 * The roll is live — the interface standing *and* journey/roll.js made. From
 * here a press is the cinematic and the native navigation is prevented. Not one
 * frame earlier: the interface chunk lands while the world is still building,
 * and a `rollTo` nobody is subscribed to is a press thrown away.
 */
export function releaseArrival() {
  released = true;
  // A press that landed in the last moments of the boot, while there was still
  // no roll to answer it: the village is up, so it gets the answer every later
  // press gets rather than being quietly dropped.
  const late = claimArrival();
  if (late && handler) handler(late.destination);
}

/**
 * Whoever wants to hear about arrivals. One at a time, and told about the ones
 * that settled before it asked.
 *
 * A subscriber rather than an import, because this module still imports nothing
 * — that is the whole reason it can be armed before the entry's own body runs.
 * The batcher is a chunk that lands much later than the boot it wants to
 * measure, which is why the replay below is not optional: a direct entry has
 * already settled by the time anything can subscribe.
 */
let sink = null;

export function watchArrivals(report) {
  sink = report;
  for (const row of settled) report(row);
}

/**
 * One arrival, settled. Called exactly once per press that actually decided
 * something: when a boot claims a pending intent (`direct`), or when the live
 * roll answers a press (`cinematic`) — never once on the press and again on
 * hydration.
 *
 * This is the named seam the analytics batcher wires into (`arrival_settled`,
 * `docs/contracts/analytics.md`); the record is also read back by
 * tools/boot-priority-test.mjs through the debug API.
 */
export function reportArrival(destination, entry) {
  const row = { destination, entry, at: Math.round(performance.now()) };
  settled.push(row);
  sink?.(row);
}

/** Debug/verification only, published by main.js as `__steeple.arrival()`. */
export function settledArrivals() {
  return settled.slice();
}
