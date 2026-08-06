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
//   'roll:scrub'     ({ pixels, done })  — someone is dragging it by hand
//   'desk:change'    ({ desk })   — the host's desk changed instrument
//   'letter:change'  ({ letter }) — the correspondence changed instrument
//   'quality:change' ({ tier })
//   'store:change'   ({ type, ... }) — emitted by data/store.js on every mutation

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

// Presentation styles are prototype explorations (CONTRACT.md §3.1), fixed for
// the page's lifetime. Switching reloads with the hash preserved, so the current
// deep-linked view survives a comparison flip. Every exploration flag is read
// here, once, and lives on `state` — modules read state, never the URL.
const params =
  typeof window === 'undefined'
    ? new URLSearchParams()
    : new URLSearchParams(window.location.search);

/** A flag with a known vocabulary: anything else falls back to the default. */
function flag(name, allowed, fallback) {
  const asked = (params.get(name) ?? '').toLowerCase();
  return allowed.includes(asked) ? asked : fallback;
}

state.style = params.get('style') || 'diorama';

// Tilt-shift strength is a viewing preference, not a quality tier:
// `?tilt=on|1|true` fakes the miniature hard, `?tilt=off|0|false` turns the
// band off entirely, absent leaves the subtle default the styles are tuned for.
state.tilt = (() => {
  const raw = (params.get('tilt') ?? '').toLowerCase();
  if (raw === 'on' || raw === '1' || raw === 'true') return 'strong';
  if (raw === 'off' || raw === '0' || raw === 'false') return 'off';
  return 'default';
})();

// Map rendering language is an exploration flag like ?style= (CONTRACT2 §0/§1):
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

/** Flip an exploration flag: a reload with the hash — your place — preserved. */
function reloadWith(param, value) {
  const url = new URL(window.location.href);
  url.searchParams.set(param, value);
  window.location.assign(url);
}

export function setStyle(style) {
  if (style !== state.style) reloadWith('style', style);
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

export function setView(view, { venueId = null, roomId = null, applicationId = null } = {}) {
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
  syncHash();
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

/** Ask the journey to roll there properly. `land` runs once it has arrived. */
export function rollTo(target, { land = null } = {}) {
  bus.emit('roll:request', { target, land });
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

// Deep links: #/village · #/venue/<venueId> · #/room/<venueId>/<roomId>
//   · #/apply/<venueId>/<roomId> · #/journal · #/desk[/<venueId>]
//   · #/letter/<applicationId>
let applyingHash = false;

function syncHash() {
  if (applyingHash || typeof window === 'undefined') return;
  const h =
    state.view === 'room'
      ? `#/room/${state.venueId}/${state.roomId}`
      : state.view === 'venue'
        ? `#/venue/${state.venueId}`
        : state.view === 'village'
          ? '#/village'
          : state.view === 'apply'
            ? `#/apply/${state.venueId}/${state.roomId}`
            : state.view === 'journal'
              ? '#/journal'
              : state.view === 'desk'
                ? state.venueId
                  ? `#/desk/${state.venueId}`
                  : '#/desk'
                : state.view === 'letter'
                  ? `#/letter/${state.applicationId}`
                  : '';
  if (window.location.hash !== h) history.replaceState(null, '', h || window.location.pathname);
}

export function applyHash() {
  if (typeof window === 'undefined') return;
  const parts = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  applyingHash = true;
  if (parts[0] === 'room' && parts[1] && parts[2]) {
    setView('room', { venueId: parts[1], roomId: parts[2] });
  } else if (parts[0] === 'venue' && parts[1]) {
    setView('venue', { venueId: parts[1] });
  } else if (parts[0] === 'village') {
    setView('village');
  } else if (parts[0] === 'apply' && parts[1] && parts[2]) {
    setView('apply', { venueId: parts[1], roomId: parts[2] });
  } else if (parts[0] === 'journal') {
    setView('journal');
  } else if (parts[0] === 'desk') {
    setView('desk', { venueId: parts[1] ?? null });
  } else if (parts[0] === 'letter' && parts[1]) {
    setView('letter', { applicationId: parts[1] });
  }
  applyingHash = false;
}
