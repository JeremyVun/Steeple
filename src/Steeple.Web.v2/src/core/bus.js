// Shared event bus + application state. This file is the contract's center of
// gravity: world, journey, and ui modules communicate only through it.
//
// Views: 'arrival' (title over the sky) → 'village' (slow orbit overview)
//        → 'venue' (one church, rooms presented) → 'room' (room detail).
// Wave 2 adds two lenses over the same world (state.mode) and four views:
//   guest — 'apply'  (letter composer for one room; venueId + roomId)
//           'journal' (the guest's correspondence)
//   host  — 'desk'   (letter board for the host's venue; optional venueId)
//   both  — 'letter' (one application opened; applicationId, plus venueId/roomId
//           when the caller knows them — cold deep links resolve via data/store.js)
// Wave 4 folds all of that into two acts joined by one scroll. `state.roll`
// runs 0 → 1: 0 is the title page over the breathing village, 1 is the browse
// surface — the map, the list, the sheets — with the world paused behind it.
// Anything between is mid-roll. journey/roll.js owns the number; every other
// module reads it and answers.
//   setRoll(p)              put the roll somewhere at once (deep links, the harness)
//   rollTo(target, { land }) ask for the cinematic; `land` runs on arrival
//   scrubRoll(pixels, opts)  push it by hand — a wheel, a trackpad, a finger
// Events:
//   'view:change'    ({ view, venueId, roomId, applicationId, previous })
//   'mode:change'    ({ mode: 'guest' | 'host' })
//   'filters:change' ({ filters: Set<string>, matching: Set<venueId> })
//   'hover:change'   ({ venueId|null, roomId|null })
//   'roll:change'    ({ roll })   — the roll moved
//   'roll:request'   ({ target, land })  — someone asked for the cinematic
//                    (held, one deep, while journey/roll.js is still arriving)
//   'roll:scrub'     ({ pixels, done })  — someone is dragging it by hand
//   'desk:change'    ({ desk })   — the host's desk changed instrument
//   'letter:change'  ({ letter }) — the correspondence changed instrument
//   'quality:change' ({ tier })
//   'store:change'   ({ type, ... }) — emitted by data/store.js on every mutation
//   'notifications:change' ({ rows }) — the server inbox was refreshed

// The address bar is core/router.js's, in both directions: this file says where
// the product is, that file says how a location spells it (SEO-D1). Importing
// it here rather than the other way round is what keeps the router free of
// every other import, and therefore runnable under plain node.
import * as router from './router.js';

// Before anything can write history — and before the first relative `api/v1`
// or `assets/…` is resolved against it — the deployment's base becomes an
// absolute path that no `pushState` can move (SEO-D4 · index.html).
// core/intent.js does the same on its own arming path; the call is idempotent.
router.freezeBase();

const listeners = new Map();

export const bus = {
  on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => listeners.get(event)?.delete(fn);
  },
  emit(event, payload) {
    listeners.get(event)?.forEach((fn) => fn(payload));
  },
};

export const state = {
  view: 'arrival',
  venueId: null,
  roomId: null,
  applicationId: null,
  mode: 'guest', // 'guest' | 'host' — which lens the correspondence views use
  filters: new Set(),
  // Which venues answer the search in hand. Only the search knows, and it
  // publishes the set with every answer (ui/map/search.js). It used to be
  // derived from the bundled scenery here, which was a guess about venues the
  // scenery had never heard of.
  matching: new Set(),
  hoverVenueId: null,
  hoverRoomId: null,
  reducedMotion:
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  quality: 'high', // 'high' | 'low' — set by engine at boot
  roll: 0, // 0 = the title page over the village, 1 = the browse surface
};

// Presentation explorations are fixed for the page's lifetime. Every flag is
// read here, once, and lives on `state` — modules read state, never the URL.
const params =
  typeof window === 'undefined'
    ? new URLSearchParams()
    : new URLSearchParams(window.location.search);

/** A flag with a known vocabulary: anything else falls back to the default. */
function flag(name, allowed, fallback) {
  const asked = (params.get(name) ?? '').toLowerCase();
  return allowed.includes(asked) ? asked : fallback;
}

// Tilt-shift strength is a viewing preference, not a quality tier:
// `?tilt=on|1|true` fakes the miniature hard, `?tilt=off|0|false` turns the
// band off entirely, absent leaves the subtle default the styles are tuned for.
state.tilt = (() => {
  const raw = (params.get('tilt') ?? '').toLowerCase();
  if (raw === 'on' || raw === '1' || raw === 'true') return 'strong';
  if (raw === 'off' || raw === '0' || raw === 'false') return 'off';
  return 'default';
})();

// Map rendering language is an exploration flag (CONTRACT2 §0/§1):
// 'simple' is the canonical brand basemap; agents may add their own values.
state.map = params.get('map') || 'simple';

// Whether there is a village at all. `?world=off` puts the product on the page
// without the 3D world behind it — no renderer, no WebGL context, straight to
// the browse surface. A build made with VITE_WORLD=off (`npm run build:flat`)
// is that state permanently: three.js is not in the bundle, so no query can ask
// for a world that was never shipped. main.js is the only reader.
state.world =
  import.meta.env?.VITE_WORLD === 'off' || flag('world', ['on', 'off'], 'on') === 'off'
    ? 'off'
    : 'on';

// The same idea one layer in: how the guest's correspondence is set, how the
// host's desk sets its letters, and how a church shows what its post brought.
state.letter = flag('letter', ['stationery', 'ledger'], 'stationery');
state.desk = flag('desk', ['board', 'ledger'], 'board');
state.lantern = flag('lantern', ['lamp', 'window'], 'lamp');

/** Flip an exploration flag: a reload with the route — your place — preserved. */
function reloadWith(param, value) {
  const url = new URL(window.location.href);
  url.searchParams.set(param, value);
  window.location.assign(url);
}

export function setMap(map) {
  if (map !== state.map) reloadWith('map', map);
}

// Two of the exploration flags are switched from inside the instrument they
// change, so they are live state rather than a reload: `?desk=`/`?letter=` set
// the opening value, and after that the surface concerned re-renders itself
// where it stands. Comparing two layouts should cost a frame, not a page load.

export function setLetter(letter) {
  if (letter === state.letter) return;
  state.letter = letter;
  bus.emit('letter:change', { letter });
}

export function setDesk(desk) {
  if (desk === state.desk) return;
  state.desk = desk;
  bus.emit('desk:change', { desk });
}

export function setMode(mode) {
  if (mode === state.mode) return;
  state.mode = mode;
  bus.emit('mode:change', { mode });
}

// A view that belongs to one lens switches the lens; 'letter' keeps the current
// one, so a host reading a letter from the desk stays a host.
const MODE_OF_VIEW = { apply: 'guest', journal: 'guest', desk: 'host' };

// The correspondence views: a sheet with its own subject, laid over the world.
// The instruments that ask about the village — the Wayfinder, the scenery
// switch — step back while one of these is open.
export const CORRESPONDENCE_VIEWS = new Set(['apply', 'journal', 'letter', 'desk']);

/**
 * Go somewhere. The one state transition, and — since the clean routes — the
 * one thing that writes history (SEO-D1).
 *
 * `history` says what the move *is*, and it is the caller's to declare:
 *
 *   'push'    (the default) somebody navigated. A click on a result, a pin, a
 *             breadcrumb, a letter: one press, one entry, Back returns.
 *   'replace' the app corrected itself. Reconciling a desk to the venue this
 *             person actually keeps, standing a signed-out reader back on the
 *             map, filling in an id the URL already implied — none of those are
 *             places anybody chose, so none of them belong in Back.
 *   'none'    the address bar is already right: applyRoute, and only applyRoute.
 */
export function setView(
  view,
  { venueId = null, roomId = null, applicationId = null } = {},
  { history = 'push' } = {}
) {
  const previous = { view: state.view, venueId: state.venueId, roomId: state.roomId };
  if (
    view === state.view &&
    venueId === state.venueId &&
    roomId === state.roomId &&
    applicationId === state.applicationId
  )
    return;
  if (MODE_OF_VIEW[view]) setMode(MODE_OF_VIEW[view]);
  state.view = view;
  state.venueId = venueId;
  state.roomId = roomId;
  state.applicationId = applicationId;
  if (history !== 'none') router.write(state, history);
  bus.emit('view:change', { view, venueId, roomId, applicationId, previous });
}

export function setFilters(filters) {
  state.filters = new Set(filters);
  // The matching set is not recomputed here: the pill adopts these filters, asks
  // steeple, and publishes the venues that actually answered. Until then the
  // last real answer stands, which is a stale truth rather than a fresh guess.
  bus.emit('filters:change', { filters: state.filters, matching: state.matching });
}

/** Put the roll at `p` this instant — no cinematic, no easing. */
export function setRoll(p) {
  const next = p < 0 ? 0 : p > 1 ? 1 : p;
  if (next === state.roll) return;
  state.roll = next;
  bus.emit('roll:change', { roll: next });
}

/**
 * Ask the journey to roll there properly. `land` runs once it has arrived.
 *
 * The one request on this bus that is held rather than dropped when nobody is
 * listening: journey/roll.js is the only subscriber and it may still be on its
 * way, and a roll asked for and silently thrown away is a press the page ate
 * (build_plan Phase 3.5, task 3). One deep — the last thing asked for is what
 * was wanted — and drained the moment the roll subscribes.
 */
let held = null;

export function rollTo(target, { land = null } = {}) {
  if (!listeners.get('roll:request')?.size) {
    held = { target, land };
    return;
  }
  bus.emit('roll:request', { target, land });
}

/** journey/roll.js, once it is listening. Nothing else may call this. */
export function drainRollRequest() {
  const request = held;
  held = null;
  if (request) bus.emit('roll:request', request);
}

/**
 * A hand on the roll: `pixels` of gesture, positive rolling down toward the
 * browse surface. `done` ends the gesture rather than waiting for it to settle.
 */
export function scrubRoll(pixels, { done = false } = {}) {
  bus.emit('roll:scrub', { pixels, done });
}

export function setHover(venueId = null, roomId = null) {
  if (state.hoverVenueId === venueId && state.hoverRoomId === roomId) return;
  state.hoverVenueId = venueId;
  state.hoverRoomId = roomId;
  bus.emit('hover:change', { venueId, roomId });
}

/**
 * The address bar, applied to the product — the only reader of a location, and
 * the only place a route may be applied from (core/router.js owns the grammar).
 *
 * It never pushes. The initial route is already in the address bar, a legacy
 * `#/…` entrance is corrected in place so no duplicate entry is left behind it,
 * and Back and Forward are the browser moving through entries that already
 * exist. That is the re-entrancy guard the design asks for (SEO-D1): the write
 * side of every application here is either a `replace` of an address that was
 * wrong, or nothing at all.
 *
 * @param {{initial?: boolean}} options `initial` is the one boot call; anything
 *   else is a popstate, which also has to move the roll — the title page and
 *   the product are two ends of one scroll, and Back between them must travel.
 */
export function applyRoute({ initial = false } = {}) {
  if (typeof window === 'undefined') return;
  const found = router.parse();

  // The one case where the address bar is not the authority: the interface is
  // built before the boot applies its route, and an email's `?goto=` may
  // already have sent this page somewhere. A root address must not pull it back
  // to the title — the write below puts the address bar right instead.
  const sentElsewhere =
    initial && (found.view ?? 'village') === 'arrival' && state.view !== 'arrival';

  if (!sentElsewhere) {
    setView(
      found.view ?? 'village',
      {
        venueId: found.venueId ?? null,
        roomId: found.roomId ?? null,
        applicationId: found.applicationId ?? null,
      },
      { history: 'none' }
    );
  }

  // A legacy fragment, an unknown path, a trailing slash: whatever it was, the
  // address bar now reads the one canonical spelling of where this person is.
  router.write(state, 'replace');

  if (!initial) alignRoll();
}

/**
 * Back and Forward across the title page. The roll is the join between the two
 * acts, so a history entry that means "the title" has to travel back up to it,
 * and one that means the product has to be down here — otherwise Back leaves a
 * map on screen under a URL that says `/`.
 */
function alignRoll() {
  if (state.view === 'arrival') {
    if (state.roll > 0) rollTo(0);
  } else if (state.roll < 1) {
    rollTo(1);
  }
}

if (typeof window !== 'undefined') {
  // Registered here rather than in main.js: the popstate contract belongs to
  // the state it applies, and both boot paths would otherwise have to remember.
  router.onPopState(() => applyRoute());
}
