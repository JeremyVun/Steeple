#!/usr/bin/env node
// The product without the village (CONTRACT5 §1.4). Real clicks, all the way
// through: browse → venue → space → the request sheet, plus the two things a
// screenshot cannot show — that no WebGL context was ever asked for, and that
// nothing invisible is standing over the page.
//
//   node tools/world-off-test.mjs "http://localhost:5321/?q=low&world=off"
//   node tools/world-off-test.mjs "http://localhost:4321"      # the flat build
//
// Run it against the dev server with ?world=off and against a served
// `npm run build:flat` dist. The second is the one that matters: the flag is
// only worth having if the bundle it produces actually works.

import puppeteer from 'puppeteer';

const url = process.argv[2] ?? 'http://localhost:5321/?q=low&world=off';
const browser = await puppeteer.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

let failures = 0;
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('GL Driver') && !(m.location()?.url ?? '').includes('/api/v1/')) {
    errors.push(`[console] ${m.text()}`);
  }
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (s) => page.evaluate((sel) => document.querySelector(sel)?.textContent?.trim() ?? '', s);

function check(label, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function clickReal(selector) {
  const handle = await page.$(selector);
  if (!handle) throw new Error(`nothing at ${selector}`);
  const b = await handle.boundingBox();
  if (!b) throw new Error(`${selector} has no box`);
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await wait(800);
}

// A renderer that is never made cannot be caught by looking at the page, so the
// context factory itself is booby-trapped before a line of the app runs.
await page.evaluateOnNewDocument(() => {
  window.__glAsked = [];
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    window.__glAsked.push(type);
    return original.call(this, type, ...rest);
  };
});

console.log(`\n— ${url} —`);
await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
await page.waitForFunction('window.__steepleReady === true', { timeout: 20000 });
await wait(2200);

// ── 1. no world, and none asked for ─────────────────────────────────────────
const gl = await page.evaluate('window.__glAsked.filter((t) => /webgl/i.test(t))');
check('no WebGL context is ever asked for', gl.length === 0, gl.join(', '));
check('the canvas is gone from the page', await page.evaluate('document.getElementById("scene") === null'));
check('nothing three-shaped was fetched', await page.evaluate(
  '![...performance.getEntriesByType("resource")].some((r) => /three/i.test(r.name))'
));
check('the debug API says there is no world', await page.evaluate('__steeple.world === null && __steeple.engine === null'));

// ── 2. it opens on the product, not on a title page ─────────────────────────
check('it boots past the roll', (await page.evaluate('__steeple.state.roll')) === 1);
check('...onto the browse surface', (await page.evaluate('__steeple.state.view')) === 'village');
check('the results are there', (await page.evaluate('document.querySelectorAll(".dm-row").length')) > 0);
check('the count reads', /space/.test(await text('.dm-count')), await text('.dm-count'));
check('the scenery switch stands down', await page.evaluate(
  'getComputedStyle(document.querySelector(".scenery")).display === "none"'
));

// ── 3. nothing invisible is standing over the page ──────────────────────────
const overlay = await page.evaluate(() => {
  const row = document.querySelector('.dm-row').getBoundingClientRect();
  const at = document.elementsFromPoint(row.x + row.width / 2, row.y + row.height - 12);
  return { top: at[0]?.className ?? '(none)', reaches: at.some((n) => n.classList?.contains('dm-row')) };
});
check('a listing card is what the pointer finds over a listing card', overlay.reaches, overlay.top);

// ── 4. the whole funnel, by hand ────────────────────────────────────────────
await clickReal('.dm-row');
check('a card opens its space', (await page.evaluate('__steeple.state.view')) === 'room');
const roomName = await text('.sheet--room .sheet__title');
check('the space names itself', roomName.length > 0, roomName);

await page.keyboard.press('Escape');
await wait(700);
check('Esc comes back up a level', ['venue', 'village'].includes(await page.evaluate('__steeple.state.view')));

// A pin is the other way in, and the map is the whole point of the flat page.
await clickReal('.dm-pin');
check('a pin opens its venue', (await page.evaluate('__steeple.state.view')) === 'venue');

// ── 5. the request sheet ────────────────────────────────────────────────────
await page.goto(`${url.split('#')[0]}#/room/grace-community-vienna/fellowship-hall`, { waitUntil: 'domcontentloaded' });
await wait(1800);
check('a deep link to a space lands', (await page.evaluate('__steeple.state.view')) === 'room');

const cta = await page.evaluateHandle(() =>
  [...document.querySelectorAll('button')].find((b) => /request this space/i.test(b.textContent))
);
const ctaBox = await cta.asElement()?.boundingBox();
check('the request CTA is on the page and clickable', !!ctaBox);
if (ctaBox) {
  await page.mouse.click(ctaBox.x + ctaBox.width / 2, ctaBox.y + ctaBox.height / 2);
  await wait(1200);
  check('it opens the booking sheet', (await page.evaluate('__steeple.state.view')) === 'apply');
  check('the sheet is really drawn', (await page.evaluate('document.querySelectorAll(".guest form, .guest").length')) > 0);
}

// ── 6. Esc walks the correspondence back down, with no journey to walk it ───
// The ladder past the map — a letter to the board it was read from, a board to
// the map — lives in journey/input.js, which a page with no world never loads.
// Repeated in main.js for the flat page, and asserted here: without this, Esc
// inside a request is a key that does nothing at all (CONTRACT6 §1.2).
//
// Correspondence belongs to somebody now (D6), so the ladder is only walkable
// once there is a somebody: the suite signs one in against the local API. A
// page with no API to reach, or a production bundle with no demo village in it,
// has no letters to walk at all — and that is itself the thing to assert.
{
  // Signed out first: a link to a letter is not a way past the sign-in.
  await page.goto(`${url.split('#')[0]}#/letter/app-chess-club`, { waitUntil: 'domcontentloaded' });
  await wait(1800);
  check(
    'signed out, a link to a letter lands in the village',
    (await page.evaluate('__steeple.state.view')) === 'village',
    await page.evaluate('__steeple.state.view')
  );
  check('and there is no inbox on the shelf', await page.evaluate(
    "!document.querySelector('.letters') || document.querySelector('.letters').hidden"
  ));

  const signedIn = await page
    .evaluate(
      "__steeple.session.signIn({email:'maria@demo.steeple.test',displayName:'Maria Alvarez'}).then(() => true, () => false)"
    )
    .catch(() => false);
  const seeded = signedIn
    ? await page.evaluate("__steeple.store.guestApplications().length > 0")
    : false;

  if (!signedIn) {
    console.log('     (no API to sign in against — the correspondence ladder is not walkable here)');
  } else if (!seeded) {
    // A production bundle: real correspondence comes from the wire, and there
    // is none for a brand-new village.
    check(
      'a build with no demo village opens an empty inbox',
      (await page.evaluate(
        "(async () => { __steeple.setView('journal'); return __steeple.state.view; })()"
      )) === 'journal'
    );
  } else {
    await page.goto(`${url.split('#')[0]}#/letter/app-chess-club`, { waitUntil: 'domcontentloaded' });
    await wait(1800);
    check('a request the parish received opens as the host', await page.evaluate(
      "__steeple.state.view === 'letter' && __steeple.state.mode === 'host'"
    ), await page.evaluate("`${__steeple.state.view}/${__steeple.state.mode}`"));
    await page.keyboard.press('Escape');
    await wait(900);
    check(
      'Esc closes a request onto the board it belongs to',
      (await page.evaluate('__steeple.state.view')) === 'desk',
      await page.evaluate('__steeple.state.view')
    );
    await page.keyboard.press('Escape');
    await wait(900);
    check(
      'and Esc again leaves the board for the map',
      (await page.evaluate("__steeple.state.view === 'village' && __steeple.state.mode === 'guest'")),
      await page.evaluate("`${__steeple.state.view}/${__steeple.state.mode}`")
    );

    const own = await page.evaluate('__steeple.store.guestApplications()[0].id');
    await page.goto(`${url.split('#')[0]}#/letter/${own}`, { waitUntil: 'domcontentloaded' });
    await wait(1600);
    await page.keyboard.press('Escape');
    await wait(900);
    check(
      'a guest’s own letter closes onto their inbox',
      (await page.evaluate('__steeple.state.view')) === 'journal',
      await page.evaluate('__steeple.state.view')
    );
  }
}

// ── 7. the way back up still means something ────────────────────────────────
await page.keyboard.press('Escape');
await wait(900);
await page.goto(`${url.split('#')[0]}#/village`, { waitUntil: 'domcontentloaded' });
await wait(1500);
await clickReal('.wordmark');
await wait(1600);
check('the wordmark rolls back up to the title page', (await page.evaluate('__steeple.state.roll')) < 1);

await page.screenshot({ path: '/tmp/w6a-world-off-title.png' });

console.log('');
if (errors.length) {
  failures += errors.length;
  for (const e of errors) console.log(e);
}
console.log(failures ? `${failures} FAILURES` : 'all clear');
await browser.close();
process.exit(failures ? 1 : 0);
