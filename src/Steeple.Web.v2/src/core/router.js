// THE ROUTE — the one translator between a browser location and product state.
//
// `setView` in core/bus.js is still the state transition; this file is the
// adapter around it, never a second state machine. It reads a location and says
// what the product should be showing; it takes what the product is showing and
// says what the address bar should read. Nothing else in the app may parse or
// write a URL (docs/backlog/seo/design.md SEO-D1, §6).
//
// It imports nothing — not the bus, not the store, not a byte of the interface
// — for two reasons. core/intent.js is armed before anything else in the entry
// and needs the base frozen before it can write a press into the address bar;
// and a module with no imports can be run under plain node, which is what
// tools/router-test.mjs does.
//
//   state              route                       index policy
//   arrival            /                           index
//   village (browse)   /browse                     noindex, follow
//   venue sheet        /venue/{venue}              noindex, follow
//   room sheet         /space/{venue}/{room}       index          ← the canonical
//   apply composer     /apply/{venue}/{room}       noindex, nofollow
//   guest inbox        /journal                    noindex, nofollow
//   host desk          /desk[/{venue}]             noindex, nofollow
//   application letter /letter/{applicationId}     noindex, nofollow
//
// THE OLD HASHES ARE ENTRANCES, NEVER CANONICALS (SEO-D2). No HTTP redirect can
// see a fragment, so the conversion is necessarily here, and it is a
// `replaceState` so a shared link leaves no duplicate entry behind it:
//
//   #/browse · #/village → /browse          #/apply/{v}/{r} → /apply/{v}/{r}
//   #/venue/{v}          → /venue/{v}       #/journal       → /journal
//   #/room/{v}/{r}       → /space/{v}/{r}   #/desk[/{v}]    → /desk[/{v}]
//   #/letter/{id}        → /letter/{id}     anything else   → /browse
//
// `room` is the one word that differs: `/space/...` is the canonical listing URL
// and `/room/...` is deliberately not a second clean route (SEO-D9). Hash
// support has no deadline; it is the compatibility and rollback path.
//
// THE QUERY IS NEVER DROPPED. Every write carries `location.search` through
// verbatim: `?map=`, `?world=off`, `?q=low` and `?goto=` are the
// visitor's, and the old `syncHash` silently spent them on the first hash write
// of every boot (design SEO-D2, index.html's own comment).
//
// THE BASE IS FROZEN BEFORE THE FIRST WRITE (SEO-D4, §7). `index.html` ships
// `<base href="./">` so one build deploys at `/` and at a stripped `/steeple/`
// prefix; a *relative* base is re-resolved against the visible address, so the
// first `pushState('/space/v/r')` would silently re-root every relative asset,
// `api/v1` call and photograph at `/space/v/`. `freezeBase()` resolves it once
// and writes the absolute prefix back to the element, after which no history
// write can move it.

/** Where this deployment is rooted: '/' at the root, '/steeple/' behind a prefix. */
let base = null;

/**
 * A path segment, after decoding: no empty segments (`//`), no `.` or `..`, no
 * slashes, colons or anything else that could smuggle an absolute URL through
 * the grammar. Slugs and application ids are the only things that ever appear.
 */
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._~-]*$/;
const SEGMENT_LIMIT = 128;

/** Which crawler policy each view carries (SEO-D1); an unknown view is private. */
const POLICY = {
  arrival: 'index',
  village: 'noindexFollow',
  venue: 'noindexFollow',
  room: 'index',
  apply: 'private',
  journal: 'private',
  desk: 'private',
  letter: 'private',
};

const EMPTY = { view: null, venueId: null, roomId: null, applicationId: null };

const doc = () => globalThis.document ?? null;
const loc = () => globalThis.location ?? null;

/**
 * Resolve the application base once and make it immovable.
 *
 * Called by core/intent.js at arm time — before the first press can write
 * anything — and again (idempotently) by core/bus.js. Returns the absolute
 * prefix path, always with a trailing slash.
 */
export function freezeBase() {
  if (base) return base;

  const document = doc();
  const element = document?.querySelector?.('base[href]');
  if (element && document.baseURI) {
    // `document.baseURI` has already resolved the element's href against the
    // document's own address, which is the whole point of the relative form:
    // only the browser knows which prefix this document arrived under.
    base = withSlash(new URL(document.baseURI).pathname);
    element.setAttribute('href', base);
  } else {
    // No <base> at all is not a shape this app ships; the deployment root is
    // the only honest guess, and it is right for every root deployment.
    base = '/';
  }

  return base;
}

/** The frozen prefix. Freezes on first ask so no caller can read a stale one. */
export function basePath() {
  return base ?? freezeBase();
}

/**
 * Test-only: put the module back to its pre-boot state so a suite can drive the
 * root deployment and a stripped-prefix one in the same process.
 */
export function resetBaseForTests() {
  base = null;
}

function withSlash(path) {
  if (!path) return '/';
  return path.endsWith('/') ? path : `${path}/`;
}

/**
 * The path segments of a location, or null when the address is not a route this
 * app could have written. Malformed percent encoding is a null, never a throw.
 */
function segmentsOf(pathname) {
  const prefix = basePath();
  if (!pathname.startsWith(prefix)) {
    // A path outside the deployment's own prefix is not ours to interpret.
    return null;
  }

  const rest = pathname.slice(prefix.length);
  if (rest === '') return [];

  const raw = rest.split('/');
  const out = [];
  for (const part of raw) {
    if (!part || part.length > SEGMENT_LIMIT) return null;
    let decoded;
    try {
      decoded = decodeURIComponent(part);
    } catch {
      return null;
    }
    if (!SEGMENT.test(decoded)) return null;
    out.push(decoded);
  }
  return out;
}

/** The `#/...` grammar, as tokens. Null when the fragment is not one of ours. */
function legacyTokensOf(hash) {
  if (!hash || !hash.startsWith('#/')) return null;
  const raw = hash.slice(2).split('/');
  const out = [];
  for (const part of raw) {
    if (part === '') continue; // `#/browse/` and `#/` were both always accepted
    if (part.length > SEGMENT_LIMIT) return null;
    let decoded;
    try {
      decoded = decodeURIComponent(part);
    } catch {
      return null;
    }
    if (!SEGMENT.test(decoded)) return null;
    out.push(decoded);
  }
  return out;
}

/**
 * Tokens to product state. `room` is spelled `space` in the clean grammar and
 * `room` in the legacy one — the only difference between the two tables.
 */
function place(tokens, { legacy = false } = {}) {
  const [head, first, second] = tokens;
  const roomHead = legacy ? 'room' : 'space';

  if (tokens.length === 0) return { ...EMPTY, view: 'arrival' };
  if (tokens.length === 1 && head === 'browse') return { ...EMPTY, view: 'village' };
  if (legacy && tokens.length === 1 && head === 'village') return { ...EMPTY, view: 'village' };
  if (tokens.length === 2 && head === 'venue') return { ...EMPTY, view: 'venue', venueId: first };
  if (tokens.length === 3 && head === roomHead)
    return { ...EMPTY, view: 'room', venueId: first, roomId: second };
  if (tokens.length === 3 && head === 'apply')
    return { ...EMPTY, view: 'apply', venueId: first, roomId: second };
  if (tokens.length === 1 && head === 'journal') return { ...EMPTY, view: 'journal' };
  if (tokens.length === 1 && head === 'desk') return { ...EMPTY, view: 'desk' };
  if (tokens.length === 2 && head === 'desk') return { ...EMPTY, view: 'desk', venueId: first };
  if (tokens.length === 2 && head === 'letter')
    return { ...EMPTY, view: 'letter', applicationId: first };

  return null;
}

/**
 * What a location means.
 *
 * @returns {{view: string|null, venueId: string|null, roomId: string|null,
 *   applicationId: string|null, known: boolean, legacy: boolean}} — `known` is
 *   false for anything the grammar does not recognize, which is a route the
 *   caller must correct rather than an error to raise.
 */
export function parse(href = currentHref()) {
  const unknown = { ...EMPTY, known: false, legacy: false };
  if (typeof href !== 'string') return unknown;

  let url;
  try {
    url = new URL(href, originOf());
  } catch {
    return unknown;
  }

  // Somewhere else entirely is not a route: an absolute URL that arrived in a
  // query string or a notification payload is refused here rather than parsed
  // for its path and quietly honoured.
  if (url.origin !== originOf()) return unknown;

  // A fragment is an entrance, and it wins over the path it arrived on: every
  // legacy link was written against `/` and carries its whole destination.
  const legacyTokens = legacyTokensOf(url.hash);
  if (legacyTokens) {
    const found = place(legacyTokens, { legacy: true });
    // An unrecognized fragment still says "this visitor asked for the product",
    // so it converts to browse rather than opening the title (design §10).
    return found
      ? { ...found, known: true, legacy: true }
      : { ...EMPTY, view: 'village', known: false, legacy: true };
  }

  const segments = segmentsOf(url.pathname);
  if (!segments) return unknown;

  const found = place(segments);
  return found ? { ...found, known: true, legacy: false } : unknown;
}

/** The route segments for a product state, or null when it has no address. */
function segmentsFor(where) {
  switch (where?.view) {
    case 'arrival':
      return [];
    case 'village':
      return ['browse'];
    case 'venue':
      return where.venueId ? ['venue', where.venueId] : null;
    case 'room':
      return where.venueId && where.roomId ? ['space', where.venueId, where.roomId] : null;
    case 'apply':
      return where.venueId && where.roomId ? ['apply', where.venueId, where.roomId] : null;
    case 'journal':
      return ['journal'];
    case 'desk':
      return where.venueId ? ['desk', where.venueId] : ['desk'];
    case 'letter':
      return where.applicationId ? ['letter', where.applicationId] : null;
    default:
      return null;
  }
}

/**
 * The canonical path for a product state, prefix included. Null when the state
 * has no address of its own — a half-filled view is left where it stands rather
 * than written as a broken URL.
 */
export function pathFor(where) {
  const segments = segmentsFor(where);
  if (!segments) return null;
  return basePath() + segments.map(encodeURIComponent).join('/');
}

/** `index` · `noindexFollow` · `private` — SEO-D1's third column. */
export function classify(view) {
  return POLICY[view] ?? 'private';
}

/** Whether this address is somebody who has already chosen (SEO-D6). */
export function isProductEntry(href = currentHref()) {
  const found = parse(href);
  return Boolean(found.view && found.view !== 'arrival');
}

function currentHref() {
  return loc()?.href ?? '';
}

function originOf() {
  return loc()?.origin ?? 'http://localhost';
}

function currentSearch() {
  return loc()?.search ?? '';
}

/**
 * Write a product state into the address bar.
 *
 * `mode` is the whole history contract: 'push' for navigation a person
 * initiated, 'replace' for the initial route, a legacy conversion or a
 * correction the app made on its own behalf. Nothing else writes history.
 *
 * The current query string is carried through verbatim, and any fragment is
 * dropped — which is exactly how a legacy `#/room/...` entrance becomes its
 * clean path without a second history entry.
 *
 * @returns {string|null} the URL written, or null when nothing needed writing.
 */
export function write(where, mode = 'push') {
  const path = pathFor(where);
  if (path === null) return null;

  const history = globalThis.history;
  const location = loc();
  if (!history || !location) return null;

  const next = `${path}${currentSearch()}`;
  if (next === `${location.pathname}${location.search}` && !location.hash) return null;

  if (mode === 'replace') history.replaceState(null, '', next);
  else history.pushState(null, '', next);
  return next;
}

/** Back and Forward. The handler applies state; it must never write. */
export function onPopState(handler) {
  const window = globalThis.window;
  if (!window?.addEventListener) return () => {};
  const listener = () => handler(parse());
  window.addEventListener('popstate', listener);
  return () => window.removeEventListener('popstate', listener);
}
