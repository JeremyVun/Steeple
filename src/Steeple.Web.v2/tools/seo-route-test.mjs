#!/usr/bin/env node
// CLEAN ROUTES — THE TRANSPORT AND THE HANDOFF (docs/backlog/seo/design.md
// SEO-D3/D4, build_plan P2.5).
//
// The subject here is the layer between a URL and the application: what the
// server says when a clean route is asked for, and what happens to that answer
// in a browser. Not the router, not the map, not the metadata owner — those are
// P3 and P4, and this suite deliberately asserts nothing about which view opens
// or what the address bar reads afterwards.
//
//   §0  the three boot documents are one file with three bases      (no server)
//   §1  no JavaScript: a listing URL answers with the listing        (fetch)
//   §2  a browser turns that document into the ordinary #ui shell    (browser)
//   §3  the entry is appended once, and the inert parsed twin is gone
//   §4  block the shell and the served document survives, readable
//   §5  a cold /space/… loads its assets from the deployment root
//   §6  …and its API calls reach /api/v1, never /space/api/v1
//   §7  API down: the listing URL keeps 502 and its body still boots
//   §8  …and /browse and the private routes boot with no API at all
//   §9  production nginx: unknown paths are a real 404, and every clean
//       route carries the whole security-header set
//
//   node tools/seo-route-test.mjs
//   node tools/seo-route-test.mjs --web http://localhost:5321
//   node tools/seo-route-test.mjs --web http://localhost:4321 --no-compose
//
// FLAGS AND ENVIRONMENT — inverting these produces convincing, meaningless
// failures, so they are written down here rather than guessed at:
//
//   --web <origin>       the dev or preview origin under test.
//                        Default http://localhost:5173. It must be `npm run
//                        dev` or `npm run preview` from THIS working tree —
//                        the clean routes are served by vite.config.js — and
//                        its proxy must point at the same API as STEEPLE_API
//                        below (`STEEPLE_API_ORIGIN=… npm run dev`). One API
//                        per run: two of them and §1's document and §6's wire
//                        are describing different databases.
//   --compose <origin>   production nginx. Default http://localhost:8080. It
//                        must be built from this tree (`docker compose up -d
//                        --build web api`) or §9 is testing the last build.
//   --no-compose         skip §9 when compose is not up. Say so out loud in
//                        any report: §9 is the only section that tests the
//                        real 404 authority, because vite deliberately does
//                        not have one.
//   STEEPLE_API          the API base, default http://localhost:5200/api/v1
//                        (tools/fixtures.mjs).
//
// §7 and §8 need an origin whose API is unreachable, so the suite starts a
// second vite of its own on --offline-port (default 5399) pointed at a closed
// port, and stops it in `finally`. That is not a second API; it is no API,
// which is the whole point of those two sections.
//
// DO NOT RUN A BUILD WHILE THIS SUITE IS RUNNING. A `vite dev` origin watches
// the tree, and `npm run build`/`build:flat` writing dist*/ makes it push a full
// page reload to every connected client — including this suite's, mid-handoff,
// which then waits forever for a state the reloaded page is starting over on.
// Two of the three intermittent timeouts seen while writing this were that, and
// nothing else (2026-08-08). Use `vite preview` if a build has to run alongside.
//
// Seed data: the listing probes use dunn-loring-umc/art-studio and expect the
// seeded database (`docker compose up -d postgres migrate`). The Draft room
// oakton-baptist/renovation-annex is the 404 subject — it exists and is
// deliberately not discoverable.

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { API, apiIsUp, closeBrowsers, isEnvironmentNoise, launch } from './fixtures.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolvePath(here, '..');

const flag = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at === -1 ? fallback : process.argv[at + 1];
};

const WEB = (flag('--web', 'http://localhost:5173') ?? '').replace(/\/$/, '');
const COMPOSE = (flag('--compose', 'http://localhost:8080') ?? '').replace(/\/$/, '');
const OFFLINE_PORT = Number(flag('--offline-port', '5399'));
const SKIP_COMPOSE = process.argv.includes('--no-compose');

// Headless GL runs app-time roughly six times slow, and a machine that is also
// building a container is slower again: these are generous on purpose. Every
// wait in this suite is on DOM state, never on the clock, so a long ceiling
// costs nothing on a quiet machine and is the difference between a real
// verdict and a load reading on a busy one.
const HANDOFF_TIMEOUT = 45000;
const BOOT_TIMEOUT = 60000;

const LISTING = '/space/dunn-loring-umc/art-studio';
const DRAFT = '/space/oakton-baptist/renovation-annex';

/** The header set every HTML location must carry — nginx `add_header` never merges. */
const SECURITY_HEADERS = [
  'content-security-policy',
  'x-content-type-options',
  'referrer-policy',
  'x-frame-options',
];

let checks = 0;
let failures = 0;
const problems = [];

function check(label, ok, detail = '') {
  checks += 1;
  if (!ok) {
    failures += 1;
    problems.push(label);
  }
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** A page's own console errors, environment noise removed (fixtures.isEnvironmentNoise). */
function watchConsole(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !isEnvironmentNoise(m)) errors.push(`[console] ${m.text()}`);
  });
  return errors;
}

/**
 * What the handoff leaves behind, read from the live page. The suite asserts on
 * this rather than on wall-clock or on a screenshot: `data-steeple-handoff` is
 * the script's own settled state and it only ever moves forward.
 */
const readPage = () => ({
  url: location.href,
  handoff: document.documentElement.getAttribute('data-steeple-handoff'),
  bodyClass: document.body.className,
  ui: document.querySelectorAll('#ui').length,
  routeDocument: document.querySelectorAll('#steeple-route-document').length,
  bootstrap: Boolean(document.getElementById('steeple-listing-bootstrap')),
  canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '',
  base: document.querySelector('base')?.getAttribute('href') ?? '',
  baseURI: document.baseURI,
  title: document.title,
  bodyText: document.body.innerText.slice(0, 4000),
  entryScripts: [...document.querySelectorAll('script[src]')]
    .map((s) => s.getAttribute('src'))
    .filter((s) => /main\.js|assets\/index/.test(s)),
  ready: window.__steepleReady === true,
  frames: document.querySelectorAll('iframe').length,
  inserted: window.__steepleInsertedScripts ?? [],
});

/** Counts executable <script> insertions from the first frame, before anything can run. */
async function countScriptInsertions(page) {
  await page.evaluateOnNewDocument(() => {
    window.__steepleInsertedScripts = [];
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeName === 'SCRIPT') {
            window.__steepleInsertedScripts.push(node.getAttribute('src') ?? '(inline)');
          }
        }
      }
      // `document`, not `documentElement`: at document-start there is no
      // <html> yet, and observing null is a page error dressed as a failure.
    }).observe(document, { childList: true, subtree: true });
  });
}

async function head(url) {
  const response = await fetch(url, { redirect: 'manual' });
  const headers = {};
  response.headers.forEach((value, name) => {
    headers[name.toLowerCase()] = value;
  });
  return { status: response.status, headers, body: await response.text() };
}

// ── §0 ───────────────────────────────────────────────────────────────────────

function bootDocumentsAreOneFile() {
  console.log('\n§0  three boot documents, one shape, three bases');
  const bases = ['./', '../', '../../'];
  const sources = bases.map((_, i) =>
    readFileSync(resolvePath(root, `public/route-documents/app-depth-${i + 1}.html`), 'utf8'));

  sources.forEach((source, i) => {
    check(`app-depth-${i + 1} bases on ${bases[i]}`, source.includes(`<base href="${bases[i]}" />`));
    check(`app-depth-${i + 1} is noindex`, /<meta name="robots" content="noindex"/.test(source));
    check(
      `app-depth-${i + 1} carries no user or listing data`,
      !/steeple-listing-bootstrap|ld\+json/.test(source));
  });

  // The only licensed difference. Anything else that drifts between these three
  // is a bug in two of them, and this is the check that says which.
  const normalized = sources.map((source) => source.replace(/<base href="[^"]*" \/>/, '<base href="X" />'));
  check(
    'the three differ in nothing but their base',
    normalized[0] === normalized[1] && normalized[1] === normalized[2]);
}

// ── §1 ───────────────────────────────────────────────────────────────────────

async function withoutJavaScript() {
  console.log('\n§1  no JavaScript: the listing URL answers with the listing');

  const listing = await head(`${WEB}${LISTING}`);
  check('the listing is 200', listing.status === 200, String(listing.status));
  check('…as text/html', (listing.headers['content-type'] ?? '').startsWith('text/html'));
  check('…at no-cache', listing.headers['cache-control'] === 'no-cache', listing.headers['cache-control'] ?? '');
  check('the room is in the body', /Art Studio/.test(listing.body));
  check('so is its venue', /Dunn Loring United Methodist Church/.test(listing.body));
  check('so is its price', /\$\d/.test(listing.body));
  check('the canonical is absolute and names this origin', listing.body.includes(`href="${WEB}${LISTING}"`));

  const graph = listing.body.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
  let parsed = null;
  try {
    parsed = JSON.parse(graph?.[1] ?? '');
  } catch {
    /* reported by the check */
  }

  check('its JSON-LD parses', Array.isArray(parsed?.['@graph']));
  const bootstrap = listing.body.match(/<script id="steeple-listing-bootstrap"[^>]*>([\s\S]*?)<\/script>/);
  let boot = null;
  try {
    boot = JSON.parse(bootstrap?.[1] ?? '');
  } catch {
    /* reported by the check */
  }

  check('its boot payload parses', boot?.roomSlug === 'art-studio');
  check('the handoff script is named, deferred and external', /route-handoff\.js"[^>]*defer/.test(listing.body));
  check('the base comes before the handoff script', listing.body.indexOf('<base') < listing.body.indexOf('route-handoff.js'));

  const draft = await head(`${WEB}${DRAFT}`);
  check('a Draft room is 404', draft.status === 404, String(draft.status));
  check('…noindex', (draft.headers['x-robots-tag'] ?? '').includes('noindex'));
  check('…designed HTML, not ProblemDetails', /Steeple/.test(draft.body) && !/"title":/.test(draft.body));
  check('…and says nothing about why', !/draft|unlisted|geofence|area/i.test(draft.body));

  const slashed = await head(`${WEB}${LISTING}/`);
  check('a trailing slash is a 301 to the canonical', slashed.status === 301, String(slashed.status));
  check('…naming the exact canonical', slashed.headers.location === `${WEB}${LISTING}`, slashed.headers.location ?? '');
}

// ── §2, §3, §5, §6 ───────────────────────────────────────────────────────────

async function handsOffToTheShell() {
  console.log('\n§2  a browser turns the document into the ordinary shell');
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await countScriptInsertions(page);
    const errors = watchConsole(page);
    const requested = [];
    page.on('request', (r) => requested.push(r.url()));

    const response = await page.goto(`${WEB}${LISTING}`, { waitUntil: 'networkidle0', timeout: 40000 });
    await page.waitForFunction(
      "document.documentElement.getAttribute('data-steeple-handoff') === 'done'",
      { timeout: HANDOFF_TIMEOUT });
    await page.waitForFunction('window.__steepleReady === true', { timeout: BOOT_TIMEOUT });

    const seen = await page.evaluate(readPage);

    check('the document arrived as itself, not a redirect', response.status() === 200 && response.url() === `${WEB}${LISTING}`);
    check('the app shell is on the page', seen.ui === 1, `#ui × ${seen.ui}`);
    check('no iframe was used', seen.frames === 0);
    check('the served body is gone, not merely hidden', seen.routeDocument === 0);
    check('rd-body is off the body', !seen.bodyClass.includes('rd-body'), seen.bodyClass || '(no class)');
    check('the served head survived: canonical', seen.canonical === `${WEB}${LISTING}`, seen.canonical);
    check('…and the boot payload', seen.bootstrap);
    check('…and the prefix-aware base', seen.base === '/' && seen.baseURI === `${WEB}/`, `${seen.base} · ${seen.baseURI}`);
    check('the app booted', seen.ready);
    check('nothing was written to the console', errors.length === 0, errors.slice(0, 2).join(' · '));

    console.log('\n§3  the entry is appended exactly once');
    check('one live entry script', seen.entryScripts.length === 1, seen.entryScripts.join(', '));
    const insertedEntries = seen.inserted.filter((src) => /main\.js|assets\/index/.test(src ?? ''));
    check('…inserted exactly once', insertedEntries.length === 1, insertedEntries.join(', '));
    check('no inert twin was left in the document', seen.entryScripts.length === insertedEntries.length);

    console.log('\n§5  assets resolve from the deployment root, not the visible route');
    const assets = requested.filter((url) => url.includes('/assets/'));
    check('the poster set resolved to /assets/…', assets.length > 0 && assets.every((url) => url.startsWith(`${WEB}/assets/`)),
      assets[0] ?? '(none requested)');
    check('nothing was fetched under /space/', !requested.some((url) => url.startsWith(`${WEB}/space/`) && url !== `${WEB}${LISTING}`));

    console.log('\n§6  the wire is /api/v1, from a cold /space/… document');
    const api = requested.filter((url) => url.includes('api/v1'));
    check('the app called the API', api.length > 0, `${api.length} calls`);
    // data/api.js's `BASE = 'api/v1'` is document-relative and evaluated at
    // module scope. Without the served <base> it would resolve against
    // /space/{venue}/, and every call this app makes would 404 in a way that
    // looks like an outage. This is the assertion that catches a base-ordering
    // regression.
    check('…at /api/v1', api.every((url) => url.startsWith(`${WEB}/api/v1`)), api[0] ?? '');
    check('…never at /space/api/v1', !requested.some((url) => url.includes('/space/api')));
  } finally {
    await browser.close().catch(() => {});
  }
}

// ── §4 ───────────────────────────────────────────────────────────────────────

async function survivesABlockedShell() {
  console.log('\n§4  block the shell, and the served document is still the page');
  const browser = await launch();
  try {
    const page = await browser.newPage();
    const errors = watchConsole(page);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (/\/index\.html$/.test(new URL(request.url()).pathname)) request.abort().catch(() => {});
      else request.continue().catch(() => {});
    });

    await page.goto(`${WEB}${LISTING}`, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForFunction(
      "['failed','done'].includes(document.documentElement.getAttribute('data-steeple-handoff'))",
      { timeout: HANDOFF_TIMEOUT });
    const seen = await page.evaluate(readPage);

    check('the handoff reported failure', seen.handoff === 'failed', String(seen.handoff));
    check('the listing is still readable', /Art Studio/.test(seen.bodyText));
    check('its way on is still there', /Request this space/.test(seen.bodyText));
    check('the served body was left alone', seen.routeDocument === 1);
    check('…still wearing its own presentation', seen.bodyClass.includes('rd-body'));
    check('one console line, and only one', errors.length === 1, errors.join(' · '));
    check('…naming no listing and no person', !/art-studio|dunn-loring/i.test(errors[0] ?? ''), errors[0] ?? '');
  } finally {
    await browser.close().catch(() => {});
  }
}

// ── §7, §8 ───────────────────────────────────────────────────────────────────

/**
 * A vite of this tree pointed at a port nothing is listening on. Not a second
 * API — no API, which is the whole point of the two sections that use it.
 *
 * Started as its own process group and stopped as one. `npx vite` would be two
 * processes, and killing the wrapper leaves the server itself running: an
 * orphaned dev server holds its port and goes on watching this tree, so the
 * next run finds the port taken and every run after it pays for the watcher.
 * (Observed, 2026-08-08 — it is the same orphan the browser suites answer with
 * `pipe: true`.) The binary is called directly and the whole group is signalled.
 */
async function withoutAnApi(run) {
  const child = spawn(
    resolvePath(root, 'node_modules/.bin/vite'),
    ['--port', String(OFFLINE_PORT), '--strictPort'],
    {
      cwd: root,
      env: { ...process.env, STEEPLE_API_ORIGIN: 'http://127.0.0.1:1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });

  const stop = () => {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  };

  // Whatever ends this process ends that one: an aborted run must not leave a
  // server behind either.
  process.once('exit', stop);

  const origin = `http://localhost:${OFFLINE_PORT}`;
  try {
    for (let attempt = 0; attempt < 160; attempt += 1) {
      const up = await fetch(`${origin}/`).then((r) => r.ok).catch(() => false);
      if (up) break;
      await wait(250);
    }

    await run(origin);
  } finally {
    stop();
  }
}

async function apiDown(origin) {
  console.log('\n§7  the API is gone: the listing URL is honest about it');
  const listing = await head(`${origin}${LISTING}`);
  check('the status is a server failure, not a 404', [502, 503, 504].includes(listing.status), String(listing.status));
  check('…and never a false 200', listing.status !== 200);
  check('the body is the boot document', /Opening Steeple/.test(listing.body));
  check('…which is noindex', (listing.headers['x-robots-tag'] ?? '').includes('noindex'));

  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${origin}${LISTING}?world=off`, { waitUntil: 'networkidle0', timeout: 40000 });
    await page.waitForFunction("document.documentElement.getAttribute('data-steeple-handoff') === 'done'", { timeout: HANDOFF_TIMEOUT });
    await page.waitForFunction('window.__steepleReady === true', { timeout: BOOT_TIMEOUT });
    const seen = await page.evaluate(readPage);
    check('a browser still reaches the app over that 502', seen.ui === 1 && seen.ready);

    console.log('\n§8  …and the routes that never needed the API boot anyway');
    for (const [route, depth] of [['/browse', 1], ['/journal', 1], ['/desk', 1], ['/letter/whatever', 2]]) {
      const document_ = await head(`${origin}${route}`);
      check(`${route} is 200`, document_.status === 200, String(document_.status));
      check(`${route} is noindex`, (document_.headers['x-robots-tag'] ?? '').includes('noindex'));
      check(`${route} carries the depth-${depth} base`,
        document_.body.includes(`<base href="${'../'.repeat(depth - 1) || './'}" />`));
    }

    await page.goto(`${origin}/browse?world=off`, { waitUntil: 'networkidle0', timeout: 40000 });
    await page.waitForFunction("document.documentElement.getAttribute('data-steeple-handoff') === 'done'", { timeout: HANDOFF_TIMEOUT });
    await page.waitForFunction('window.__steepleReady === true', { timeout: BOOT_TIMEOUT });
    const browse = await page.evaluate(readPage);
    check('/browse boots with no API at all', browse.ui === 1 && browse.ready && browse.routeDocument === 0);
  } finally {
    await browser.close().catch(() => {});
  }
}

// ── §9 ───────────────────────────────────────────────────────────────────────

async function productionNginx() {
  console.log('\n§9  production nginx: the 404 authority, and the header set');

  const unknown = await head(`${COMPOSE}/definitely-not-a-route`);
  check('an unknown path is a real 404', unknown.status === 404, String(unknown.status));
  check('…with the designed page, never the shell', /nothing at this address/i.test(unknown.body) && !/id="ui"/.test(unknown.body));
  const deep = await head(`${COMPOSE}/browse/nope/nope`);
  check('a deep unknown path is a real 404', deep.status === 404, String(deep.status));

  const missingAsset = await head(`${COMPOSE}/assets/missing.js`);
  check('a missing asset is a plain 404', missingAsset.status === 404, String(missingAsset.status));

  const boot = await head(`${COMPOSE}/route-documents/app-depth-1.html`);
  check('the boot documents have no public address', boot.status === 404, String(boot.status));

  const root_ = await head(`${COMPOSE}/`);
  check('the root document is 200', root_.status === 200, String(root_.status));

  const listing = await head(`${COMPOSE}${LISTING}`);
  check('the listing proxies to the API', listing.status === 200 && /Art Studio/.test(listing.body), String(listing.status));
  const draft = await head(`${COMPOSE}${DRAFT}`);
  check("the API's 404 passes through unchanged", draft.status === 404 && /Steeple/.test(draft.body), String(draft.status));

  const sitemap = await head(`${COMPOSE}/sitemap.xml`);
  check('the sitemap is 200 XML', sitemap.status === 200 && /urlset/.test(sitemap.body), String(sitemap.status));
  const robots = await head(`${COMPOSE}/robots.txt`);
  check('robots.txt is 200', robots.status === 200 && /Sitemap:/.test(robots.body), String(robots.status));

  // add_header does not merge: a location that adds anything of its own
  // inherits nothing from the server block. Every HTML answer is checked, one
  // by one, because that is the only way this can be true.
  const htmlLocations = ['/', LISTING, DRAFT, '/browse', '/venue/dunn-loring-umc', '/apply/dunn-loring-umc/art-studio',
    '/journal', '/desk', '/desk/dunn-loring-umc', '/letter/whatever', '/definitely-not-a-route'];
  for (const location of htmlLocations) {
    const answer = await head(`${COMPOSE}${location}`);
    const missing = SECURITY_HEADERS.filter((name) => !answer.headers[name]);
    check(`${location} carries the whole header set`, missing.length === 0, missing.join(', '));
  }

  for (const [route, robotsValue] of [
    ['/browse', 'noindex, follow'],
    ['/venue/dunn-loring-umc', 'noindex, follow'],
    ['/apply/dunn-loring-umc/art-studio', 'noindex, nofollow'],
    ['/journal', 'noindex, nofollow'],
    ['/desk', 'noindex, nofollow'],
    ['/letter/whatever', 'noindex, nofollow'],
  ]) {
    const answer = await head(`${COMPOSE}${route}`);
    check(`${route} is ${robotsValue}`, answer.headers['x-robots-tag'] === robotsValue, answer.headers['x-robots-tag'] ?? '(none)');
  }
}

// ── the run ──────────────────────────────────────────────────────────────────

async function lastWords(error) {
  await closeBrowsers();
  console.log(`\nthe run stopped: ${error?.message ?? error}`);
  process.exit(1);
}

for (const fatal of ['uncaughtException', 'unhandledRejection']) {
  process.on(fatal, lastWords);
}

try {
  bootDocumentsAreOneFile();

  if (!(await apiIsUp())) {
    console.log(`\nThe steeple API is not answering at ${API} — §1–§6 need it. Start it and re-run.`);
    process.exit(2);
  }

  await withoutJavaScript();
  await handsOffToTheShell();
  await survivesABlockedShell();
  await withoutAnApi(apiDown);

  if (SKIP_COMPOSE) console.log('\n§9  skipped (--no-compose) — the real 404 authority went untested');
  else await productionNginx();
} finally {
  await closeBrowsers();
}

console.log(`\n${checks - failures}/${checks} checks`);
if (failures) console.log(`failed: ${problems.join(' · ')}`);
process.exit(failures ? 1 : 0);
