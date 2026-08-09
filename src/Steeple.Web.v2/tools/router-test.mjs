// The route, in plain node — src/core/router.js has no imports precisely so it
// can be driven here, with no browser and no API.
//   node tools/router-test.mjs
//
// What this suite is for: the router is the one translator between a browser
// location and product state (docs/contracts/seo.md SEO-D1), and almost
// everything it can get wrong is silent. A dropped query string is a lost
// `?world=off`; a base resolved twice is every asset and `api/v1` call re-rooted
// under `/space/`; a legacy `#/room/...` that pushes instead of replacing is a
// duplicate canonical and a Back button that will not leave. So the assertions
// here are round-trips, write *modes*, and the exact URL that was written.
//
// The compatibility matrix at §2 is the SEO-D2 table, kept as a matrix on
// purpose: hash support has no deadline and is the rollback path, so these
// cases outlive the suites that used to drive hashes for other reasons.

import {
  basePath,
  classify,
  freezeBase,
  isProductEntry,
  parse,
  pathFor,
  resetBaseForTests,
  write,
} from '../src/core/router.js';

let failures = 0;

function expect(label, actual, wanted) {
  const same = JSON.stringify(actual) === JSON.stringify(wanted);
  if (!same) {
    failures += 1;
    console.error(`FAIL  ${label} — got ${JSON.stringify(actual)}, wanted ${JSON.stringify(wanted)}`);
  } else {
    console.log(`ok    ${label}`);
  }
}

function check(label, ok, detail = '') {
  if (!ok) {
    failures += 1;
    console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    console.log(`ok    ${label}`);
  }
}

/**
 * A document at `href`, with the `<base href>` it was actually served with.
 * Everything the router touches — the base element, `document.baseURI`, the
 * location and the history — and nothing else.
 *
 * The default models the real deployment: nginx serves a *depth-correct*
 * boot document at every clean route (public/route-documents/app-depth-{1,2,3}
 * carry `./`, `../` and `../../`), and index.html carries `./` at the root. Get
 * that wrong here and the suite would prove a base this app never ships.
 */
function open(href, { prefix = '/', base } = {}) {
  resetBaseForTests();
  const url = new URL(href);
  const depth = url.pathname.slice(prefix.length).split('/').filter(Boolean).length;
  const page = {
    url,
    base: base ?? (depth > 1 ? '../'.repeat(depth - 1) : './'),
    writes: [],
  };

  const baseElement = {
    getAttribute: (name) => (name === 'href' ? page.base : null),
    setAttribute: (name, value) => {
      if (name === 'href') page.base = value;
    },
  };

  globalThis.document = {
    querySelector: (selector) => (selector === 'base[href]' ? baseElement : null),
    get baseURI() {
      return new URL(page.base, page.url.href).href;
    },
  };

  globalThis.location = {
    get href() {
      return page.url.href;
    },
    get origin() {
      return page.url.origin;
    },
    get pathname() {
      return page.url.pathname;
    },
    get search() {
      return page.url.search;
    },
    get hash() {
      return page.url.hash;
    },
  };

  globalThis.history = {
    pushState: (_state, _title, url) => {
      page.writes.push({ mode: 'push', url });
      page.url = new URL(url, page.url.href);
    },
    replaceState: (_state, _title, url) => {
      page.writes.push({ mode: 'replace', url });
      page.url = new URL(url, page.url.href);
    },
  };

  globalThis.window = { addEventListener() {}, removeEventListener() {} };

  return page;
}

/** What `parse` said, reduced to the four fields the bus applies. */
const placeOf = (found) => ({
  view: found.view,
  venueId: found.venueId,
  roomId: found.roomId,
  applicationId: found.applicationId,
});

// ── §1 every clean route round-trips ────────────────────────────────────────
console.log('\n── §1 state → path → state ──────────────────────────────────');

const ROUTES = [
  { where: { view: 'arrival' }, path: '/' },
  { where: { view: 'village' }, path: '/browse' },
  { where: { view: 'venue', venueId: 'grace-community-vienna' }, path: '/venue/grace-community-vienna' },
  {
    where: { view: 'room', venueId: 'dunn-loring-umc', roomId: 'art-studio' },
    path: '/space/dunn-loring-umc/art-studio',
  },
  {
    where: { view: 'apply', venueId: 'dunn-loring-umc', roomId: 'art-studio' },
    path: '/apply/dunn-loring-umc/art-studio',
  },
  { where: { view: 'journal' }, path: '/journal' },
  { where: { view: 'desk' }, path: '/desk' },
  { where: { view: 'desk', venueId: 'oakton-baptist' }, path: '/desk/oakton-baptist' },
  { where: { view: 'letter', applicationId: 'app-chess-club' }, path: '/letter/app-chess-club' },
];

open('http://localhost:5173/');
for (const route of ROUTES) {
  const full = {
    view: null,
    venueId: null,
    roomId: null,
    applicationId: null,
    ...route.where,
  };
  expect(`${route.where.view} formats as ${route.path}`, pathFor(full), route.path);

  open(`http://localhost:5173${route.path}`);
  expect(`${route.path} parses back to ${route.where.view}`, placeOf(parse()), full);
  check(`${route.path} is a route this app wrote`, parse().known === true);
}

// The listing route is the canonical one and `/room/...` is deliberately not a
// second spelling of it (SEO-D9): only the old fragment grammar says "room".
open('http://localhost:5173/room/dunn-loring-umc/art-studio');
expect('/room/... is not a clean route', parse().known, false);

// ── §2 the legacy compatibility matrix (SEO-D2) ─────────────────────────────
console.log('\n── §2 old hashes are entrances, never canonicals ────────────');

const LEGACY = [
  ['#/browse', '/browse', { view: 'village' }],
  ['#/village', '/browse', { view: 'village' }],
  ['#/venue/grace-community-vienna', '/venue/grace-community-vienna', { view: 'venue', venueId: 'grace-community-vienna' }],
  [
    '#/room/dunn-loring-umc/art-studio',
    '/space/dunn-loring-umc/art-studio',
    { view: 'room', venueId: 'dunn-loring-umc', roomId: 'art-studio' },
  ],
  [
    '#/apply/dunn-loring-umc/art-studio',
    '/apply/dunn-loring-umc/art-studio',
    { view: 'apply', venueId: 'dunn-loring-umc', roomId: 'art-studio' },
  ],
  ['#/journal', '/journal', { view: 'journal' }],
  ['#/desk', '/desk', { view: 'desk' }],
  ['#/desk/oakton-baptist', '/desk/oakton-baptist', { view: 'desk', venueId: 'oakton-baptist' }],
  ['#/letter/app-chess-club', '/letter/app-chess-club', { view: 'letter', applicationId: 'app-chess-club' }],
];

for (const [hash, clean, where] of LEGACY) {
  const page = open(`http://localhost:5173/${hash}`);
  const found = parse();
  expect(`${hash} means ${where.view}`, found.view, where.view);
  check(`${hash} is recognized as an entrance`, found.legacy === true);
  write(found, 'replace');
  expect(`${hash} is replaced in place by ${clean}`, page.writes, [{ mode: 'replace', url: clean }]);
}

// The query is the whole point of the fix under this table: the old syncHash
// spent `location.search` on the first write of every boot.
for (const [hash, clean] of LEGACY) {
  const page = open(`http://localhost:5173/?world=off&map=simple${hash}`);
  write(parse(), 'replace');
  expect(`${hash} keeps the query it arrived with`, page.writes[0].url, `${clean}?world=off&map=simple`);
}

// An unrecognized fragment is still somebody asking for the product.
open('http://localhost:5173/#/nonsense/here');
expect('an unknown fragment falls back to browse', parse().view, 'village');
expect('...and is not treated as a route this app wrote', parse().known, false);
check('...but still counts as a cold product entry', isProductEntry() === true);

open('http://localhost:5173/#top');
expect('a fragment that is not a route is left to the document', parse().view, 'arrival');

// ── §3 history intent ───────────────────────────────────────────────────────
console.log('\n── §3 push, replace, and the write that is not needed ───────');

{
  const page = open('http://localhost:5173/browse?q=low');
  write({ view: 'room', venueId: 'oakton-baptist', roomId: 'gymnasium' }, 'push');
  expect('a navigation writes exactly one entry', page.writes, [
    { mode: 'push', url: '/space/oakton-baptist/gymnasium?q=low' },
  ]);

  write({ view: 'room', venueId: 'oakton-baptist', roomId: 'gymnasium' }, 'push');
  expect('the same place again writes nothing', page.writes.length, 1);

  write({ view: 'venue', venueId: 'oakton-baptist' }, 'replace');
  expect('a correction replaces', page.writes[1], { mode: 'replace', url: '/venue/oakton-baptist?q=low' });
}

{
  // A state with no address of its own is left exactly where it stands rather
  // than written as a broken URL.
  const page = open('http://localhost:5173/browse');
  expect('a room with no slugs has no path', pathFor({ view: 'room', venueId: 'x' }), null);
  write({ view: 'room', venueId: 'x' }, 'push');
  expect('...and writes nothing', page.writes, []);
}

{
  // The root, at the root, with nothing to say: the boot must not write.
  const page = open('http://localhost:5173/');
  write({ view: 'arrival' }, 'replace');
  expect('an already-canonical root is not rewritten', page.writes, []);
}

// ── §4 malformed input is an unknown route, never an exception ──────────────
console.log('\n── §4 the grammar rejects, quietly ─────────────────────────');

const REJECTED = [
  '/space//art-studio',
  '/space/./art-studio',
  '/space/../../etc/passwd',
  '/space/dunn-loring-umc/art-studio/extra',
  '/space/dunn-loring-umc',
  '/space/dunn-loring-umc/art-studio/',
  '/browse/',
  '/venue/%E0%A4%A',
  '/venue/https:%2F%2Fevil.example.com',
  '/letter/app%2Fchess',
  '/definitely-not-a-route',
];

// The base is whatever the *served* document froze it to — the root, here. What
// follows is the app being asked to parse an address afterwards.
for (const path of REJECTED) {
  open(`http://localhost:5173${path}`, { base: '/' });
  let found;
  try {
    found = parse();
  } catch (error) {
    found = { threw: String(error) };
  }
  expect(`${path} is unknown`, found.known ?? found, false);
}

open('http://localhost:5173/browse');
expect('a href that is not a URL at all is unknown', parse('::::').known, false);
expect('a URL on another origin is unknown', parse('https://evil.example.com/browse').known, false);

// The loop is closed at both ends: anything outside a slug's vocabulary is
// encoded on the way out, and the encoded form is rejected on the way back —
// so no id can smuggle a second path segment into a route.
expect('segments are encoded on the way out', pathFor({ view: 'venue', venueId: 'a/b' }), '/venue/a%2Fb');
open('http://localhost:5173/venue/a%2Fb');
expect('...and an encoded separator is not a slug', parse().known, false);

// ── §5 the base prefix (design §7) ──────────────────────────────────────────
console.log('\n── §5 one build, root or stripped prefix ───────────────────');

{
  // The listing document is rendered by the API, which knows its own prefix and
  // emits it absolutely (design §7).
  const page = open('http://example.com/steeple/space/dunn-loring-umc/art-studio', {
    prefix: '/steeple/',
    base: '/steeple/',
  });
  expect('the prefix is the base', basePath(), '/steeple/');
  expect('a prefixed listing route parses', placeOf(parse()), {
    view: 'room',
    venueId: 'dunn-loring-umc',
    roomId: 'art-studio',
    applicationId: null,
  });
  expect('...and formats with the prefix exactly once', pathFor({ view: 'journal' }), '/steeple/journal');
  write({ view: 'journal' }, 'push');
  expect('...and writes it', page.writes, [{ mode: 'push', url: '/steeple/journal' }]);
}

{
  // The relative form is what the static boot documents ship; freezing is what
  // stops a later pushState re-resolving it against the visible route.
  const page = open('http://example.com/steeple/browse', { prefix: '/steeple/' });
  expect('a relative base resolves to the deployment root', basePath(), '/steeple/');
  expect('...and is written back to the element as an absolute path', page.base, '/steeple/');
  write({ view: 'room', venueId: 'v', roomId: 'r' }, 'push');
  expect('...so the base does not move with the route', page.base, '/steeple/');
  expect('...and the route keeps its prefix', page.writes[0].url, '/steeple/space/v/r');
}

{
  const page = open('http://localhost:5173/browse', { base: './' });
  expect('at the root the base is /', basePath(), '/');
  expect('...written back absolute', page.base, '/');
  freezeBase();
  expect('...and freezing twice changes nothing', page.base, '/');
}

{
  // A path outside the deployment's own prefix is not this app's to interpret.
  open('http://example.com/elsewhere/browse', { prefix: '/steeple/', base: '/steeple/' });
  expect('a path outside the prefix is unknown', parse().known, false);
}

// ── §6 index policy (SEO-D1's third column) ─────────────────────────────────
console.log('\n── §6 what a crawler is told ───────────────────────────────');

expect('the title page is indexable', classify('arrival'), 'index');
expect('a listing is indexable', classify('room'), 'index');
expect('browse is noindex, follow', classify('village'), 'noindexFollow');
expect('a venue sheet is noindex, follow', classify('venue'), 'noindexFollow');
for (const view of ['apply', 'journal', 'desk', 'letter']) {
  expect(`${view} is private`, classify(view), 'private');
}
expect('an unknown view is private', classify('nonsense'), 'private');

// ── §7 which boot an address asks for (SEO-D6) ─────────────────────────────
console.log('\n── §7 title page, or somebody who has already chosen ───────');

const ENTRIES = [
  ['http://localhost:5173/', false],
  ['http://localhost:5173/?world=off', false],
  ['http://localhost:5173/?goto=%2Finbox', false],
  ['http://localhost:5173/browse', true],
  ['http://localhost:5173/space/dunn-loring-umc/art-studio', true],
  ['http://localhost:5173/journal', true],
  ['http://localhost:5173/#/browse', true],
  ['http://localhost:5173/#/room/dunn-loring-umc/art-studio', true],
];

for (const [href, product] of ENTRIES) {
  open(href);
  expect(`${href} ${product ? 'opens the product' : 'opens the title'}`, isProductEntry(), product);
}

console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} FAILING`}\n`);
process.exit(failures === 0 ? 0 : 1);
