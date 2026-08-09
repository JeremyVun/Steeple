// SURFACE SCOPING, CHECKED AGAINST THE LIVE DOM — the guard for the one defect
// class postcss.config.js can create and nothing else can see.
//
//   node tools/surface-scope-test.mjs "http://localhost:5173/?q=low&world=off"
//
// `postcss.config.js` rewrites every rule authored in `guest.css` to
// `:where(.guest) …` and every rule in `host.css` to `:where(.hostdesk) …`.
// That makes cross-surface bleed impossible, and it makes one new mistake
// possible: markup that mounts OUTSIDE both roots — the shelf's sign-in and
// card modals, the porch, anything `ui/` builds for both surfaces — silently
// loses every rule whose only home is a scoped sheet, and renders as a bare UA
// control. Nothing catches it. It compiles, it passes every other suite, and
// it only shows up as an ugly button in a screenshot: that is exactly how the
// porch switch and the Apple provider shipped unstyled on 2026-08-09.
//
// So this suite is a *live DOM* check, not a static one. It reads which sheet
// declares each class, walks the real document on each surface, and fails on
// any element wearing a class it can no longer be reached by.
//
// Needs: the API (STEEPLE_API, default http://localhost:5200/api/v1) with
// Auth:DevLoginEnabled, this app on the given origin with its proxy pointed at
// that same API, and a debug build (`window.__steeple` — the dev graph or
// `build:debug`), because §3 signs in through the session seam. `world=off`:
// this suite reads markup, and the roll only costs it time.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { agreeCurrent, closeBrowsers, launch, signIn, signInPage, stamp } from './fixtures.mjs';

for (const fatal of ['uncaughtException', 'unhandledRejection']) {
  process.on(fatal, async (error) => {
    await closeBrowsers();
    console.log(`\nthe run stopped: ${error?.message ?? error}`);
    process.exit(1);
  });
}

const url = process.argv[2] ?? 'http://localhost:5173/?q=low&world=off';
const styles = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'styles');

// Which sheet is scoped to which root — the same map postcss.config.js holds.
// Kept here rather than imported so a change to one is visible against the other.
const SCOPED = { 'guest.css': '.guest', 'host.css': '.hostdesk' };
const UNSCOPED = ['main.css', 'map.css', 'panels.css'];

/**
 * Names that appear in a scoped sheet only as a *descendant* qualifier — the
 * sheet styles someone else's class inside its own surface, which is exactly
 * what scoping is for. Those are not homes, and an element wearing the name
 * elsewhere is not missing anything.
 */
const QUALIFIER_ONLY = new Set([
  // host.css says `.listing .identity__body { max-width }` and nothing else
  // does: the class is a hook, not a component.
  'identity__body',
  // host.css's `.spaces` is the desk's own <ul> reset. The venue sheet's
  // section of the same name is dressed entirely by panels.css.
  'spaces',
]);

const declaringSheets = (() => {
  const sheets = {};
  for (const file of [...UNSCOPED, ...Object.keys(SCOPED)]) {
    sheets[file] = fs.readFileSync(path.join(styles, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  }
  return (cls) => {
    const pattern = new RegExp('\\.' + cls.replace(/-/g, '\\-') + '(?![\\w-])');
    return Object.entries(sheets)
      .filter(([, css]) => pattern.test(css))
      .map(([file]) => file);
  };
})();

/** Every class the live document is currently wearing, once. */
async function classesOn(page) {
  return page.evaluate(() =>
    [...new Set([...document.querySelectorAll('*')].flatMap((n) => [...n.classList]))]
  );
}

/**
 * For one class, is every element wearing it under a root that can reach it?
 * Returns the offenders, each with the chain that proves it.
 */
async function unreachable(page, cls, roots) {
  return page.evaluate(
    (cls, roots) =>
      [...document.querySelectorAll('.' + CSS.escape(cls))]
        .filter((n) => !roots.some((root) => n.closest(root)))
        .map((n) => {
          const chain = [];
          for (let p = n; p && p !== document.body; p = p.parentElement) {
            const first = typeof p.className === 'string' ? p.className.trim().split(/\s+/)[0] : '';
            chain.unshift(`${p.tagName.toLowerCase()}${p.id ? '#' + p.id : ''}${first ? '.' + first : ''}`);
          }
          return chain.slice(0, 5).join(' > ');
        }),
    cls,
    roots
  );
}

const found = [];

/** Walk whatever is on screen now and record anything out of reach. */
async function sweep(page, where) {
  for (const cls of await classesOn(page)) {
    if (/^(is-|has-|leaflet)/.test(cls) || QUALIFIER_ONLY.has(cls)) continue;
    const homes = declaringSheets(cls);
    if (!homes.length) continue;
    if (homes.some((file) => UNSCOPED.includes(file))) continue;
    const roots = homes.map((file) => SCOPED[file]);
    for (const chain of await unreachable(page, cls, roots)) {
      found.push({ where, cls, roots: roots.join(' or '), chain });
    }
  }
}

const checks = [];
const check = (what, ok, detail = '') => {
  checks.push(ok);
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || !detail ? '' : ` — ${detail}`}`);
};

const browser = await launch();
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(url, { waitUntil: 'networkidle2' });
  await page.waitForSelector('.porch', { timeout: 30000 });

  // ── §1 the village, signed out — the porch stands on neither surface ──────
  await sweep(page, 'browse, signed out');

  // ── §2 the shelf's sign-in, which is the guest identity panel outside .guest
  await page.click('.account');
  await page.waitForSelector('.signin__layer.is-open .identity', { timeout: 10000 });
  await sweep(page, 'the shelf sign-in modal');
  await page.keyboard.press('Escape');

  // ── §3 hosting, where the desk writes on the request sheet's primitives ───
  //
  // A host who keeps no venue is taken straight to the listing flow rather
  // than to a desk (host-publish-test §1), and that flow is the long form —
  // the `.field*` markup the scoping cut off from guest.css. Whichever of the
  // two opens is what gets swept.
  const email = `scope-${stamp}@steeple.test`;
  const name = 'Scope Reader';
  // Agreed on the wire first: an un-agreed account meets the agreements ask,
  // and dismissing it signs the account out (HARNESS.md).
  await agreeCurrent((await signIn(email, name)).accessToken);
  await signInPage(page, email, name);
  await page.waitForFunction(() => !!document.querySelector('.porchswitch'), { timeout: 20000 });
  await page.click('.porchswitch');
  await page.waitForFunction(
    () => !!document.querySelector('.listing.is-open, .listing__layer:not([hidden]), .hostdesk'),
    { timeout: 30000 }
  );
  await sweep(page, 'hosting');

  const byPlace = new Map();
  for (const f of found) {
    const key = `${f.where}: .${f.cls}`;
    if (!byPlace.has(key)) byPlace.set(key, f);
  }

  console.log('');
  check(
    'every rendered class can be reached by the sheet that declares it',
    byPlace.size === 0,
    byPlace.size ? `${byPlace.size} out of reach` : ''
  );
  for (const [key, f] of byPlace) {
    console.log(`        ${key}  needs ${f.roots}, stands in  ${f.chain}`);
  }

  // The two symptoms that paid for this suite, named so a regression reads
  // as itself rather than as a number.
  check(
    'the porch switch is dressed',
    !found.some((f) => f.cls === 'porchswitch'),
    'ui/host/index.js mounts it in .porch, outside .hostdesk'
  );
  check(
    'the shelf sign-in is dressed',
    !found.some((f) => f.cls.startsWith('identity') || f.cls.startsWith('provider')),
    'ui/signIn.js mounts the panel under #ui, outside .guest'
  );

  const passed = checks.filter(Boolean).length;
  console.log(`\n${passed}/${checks.length}`);
  process.exitCode = passed === checks.length ? 0 : 1;
} finally {
  await closeBrowsers();
}
