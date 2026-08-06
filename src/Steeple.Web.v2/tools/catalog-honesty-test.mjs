#!/usr/bin/env node
// THE CATALOG'S TWO FAILURES (review issue 4, 2026-08-06).
//
// data/catalog.js used to answer every failure with the bundled seed. The seed
// knows nothing of open hours or bookings, so an API that *answered* and
// refused a Tuesday-evening search printed nine rooms as though every one of
// them were free on Tuesday evening. This suite is the line between the two
// cases, driven with real events:
//
//   §1  live — the surface answers on real rows
//   §2  answered 500 — the column says so, shows nothing, and comes back on Try again
//   §3  answered 429 — "try again shortly", and the quiet window stops the asking
//   §4  answered 500 at the commitment point — the request sheet refuses to open
//   §5  404 to everything — a static host with no API: the seed still answers
//   §6  nothing there at all — a real proxy with a dead target (502): the seed answers
//
// Two dev servers, both world-OFF (nothing here is about the village, and the
// engine costs the harness minutes):
//
//   npx vite --port 5177
//   STEEPLE_API_ORIGIN=http://localhost:59999 npx vite --port 5179
//   node tools/catalog-honesty-test.mjs "http://localhost:5177/?world=off" "http://localhost:5179/?world=off"
//
// §1–§5 run against the first; §6 against the second. §2–§5 fake the answer in
// the browser rather than behind the proxy, the way tools/surface-test.mjs §2.5
// does — the status the page sees is the whole of what the catalog judges on,
// and it makes the run deterministic. §6 is the one case that cannot be faked
// honestly, because the thing being proven is what the *proxy* answers for a
// dead API (vite and nginx both say 502, not a network error), so it needs a
// real one.
//
// Nothing here asks the catalog about itself. `import('/src/data/catalog.js')`
// from a harness is not reliably the module the app is running: once vite has
// hot-reloaded anything, the app's own graph holds `catalog.js?t=…` and a bare
// import is answered with a **second instance**, pristine — `isLive()` on it
// reads `true` however long the real one has been on the seed. What the seed is
// answering is visible on the page instead: nine spaces across five venues is
// the seed and nothing else (the local database carries far more), and the
// one-time `console.info` is the catalog's own account of the fallback.

import { closeBrowsers, launch } from './fixtures.mjs';

// A top-level-await script has no `finally` around it, so this is the finally:
// whatever kills the run, the browsers it opened go with it. (The pipe transport
// covers the ungraceful deaths — v2_migration Phase 3.6 item 7.)
for (const fatal of ['uncaughtException', 'unhandledRejection']) {
  process.on(fatal, async (error) => {
    await closeBrowsers();
    console.log(`\nthe run stopped: ${error?.message ?? error}`);
    process.exit(1);
  });
}

const live = process.argv[2] ?? 'http://localhost:5177/?world=off';
const absent = process.argv[3] ?? 'http://localhost:5179/?world=off';

const REFUSED = 'Steeple could not answer just now. Try again in a moment.';
const BUSY = 'Steeple is answering a great many questions just now. Try again shortly.';

const browser = await launch();

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  /**
   * A page on the browse surface. `answer` decides what /api/v1 says: null lets
   * every request through to the proxy, otherwise it is `{ match, status }` and
   * every matching request is answered with that status and a problem document.
   */
  async function surface(url, answer = null) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    const said = [];
    page.on('console', (m) => said.push(`${m.type()}:${m.text()}`));
    page.on('pageerror', (e) => check(`no page error: ${e.message}`, false));

    // Mutable, so a section can lift its own block and press Try again.
    const state = { answer, asked: [], answered: [] };
    page.on('response', (r) => {
      if (r.url().includes('/api/v1/')) state.answered.push(`${r.status()} ${new URL(r.url()).pathname}`);
    });
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/api/v1/')) state.asked.push(url);
      const { answer: now } = state;
      // Both of these reject if the page moved on under the request — a race
      // that says nothing about the product, so it is not allowed to end a run.
      if (now && now.match.test(url)) {
        return request
          .respond({
            status: now.status,
            contentType: 'application/problem+json',
            body: JSON.stringify({ title: 'no', status: now.status, code: 'test_refusal' }),
          })
          .catch(() => {});
      }
      return request.continue().catch(() => {});
    });

    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForFunction('window.__steepleReady === true', { timeout: 25000 });
    await page.waitForFunction('__steeple.state.roll === 1', { timeout: 25000 });
    // The surface's first search is asked at boot; wait on its answer landing,
    // whichever answer it is, rather than on the clock.
    await page.waitForFunction(
      'document.querySelectorAll(".dm-row").length > 0 || !document.querySelector(".dm-trouble").hidden',
      { timeout: 20000 }
    );
    return { page, state, said };
  }

  const text = (page, sel) =>
    page.evaluate((s) => document.querySelector(s)?.textContent?.trim() ?? '', sel);
  const rows = (page) => page.evaluate('document.querySelectorAll(".dm-row").length');
  const troubled = (page) =>
    page.evaluate('document.querySelector(".dm-trouble")?.hidden === false');

  // What the bundled seed answers a bare search with, and the local database
  // never does — five churches is the village, and one room in it is a Draft.
  const SEED_COUNT = '9 spaces across 5 venues';

  /** A real press, by pointer, on whatever is at the element's middle. */
  async function press(page, selector) {
    const handle = await page.$(selector);
    if (!handle) throw new Error(`nothing at ${selector}`);
    const box = await handle.boundingBox();
    if (!box) throw new Error(`${selector} has no box`);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }

  // ═══ 1. live ═══════════════════════════════════════════════════════════════
  console.log('\n1. the API answers, and the surface is the answer');
  {
    const { page, state } = await surface(live);
    check('rows on the page', (await rows(page)) > 0, `${await rows(page)} rows`);
    check('the count is a count', /space/.test(await text(page, '.dm-count')), await text(page, '.dm-count'));
    check('nothing is troubled', (await troubled(page)) === false);
    check('the search itself was answered by the API', state.answered.some((a) => a === '200 /api/v1/listings/search'), state.answered.join(' · '));
    check('...and what is on the page is not the seed', (await text(page, '.dm-count')) !== SEED_COUNT, await text(page, '.dm-count'));
    await page.close();
  }

  // ═══ 2. an answered 500 ════════════════════════════════════════════════════
  //
  // The bug this replaced: nine seeded rooms, one of them free at a time
  // nobody asked steeple about.
  console.log('\n2. steeple answers 500, and the column says so instead of inventing rows');
  {
    const { page, state } = await surface(live, {
      match: /\/api\/v1\/listings\/search/,
      status: 500,
    });
    check('the column is troubled', (await troubled(page)) === true);
    check('...and says the calm thing', (await text(page, '.dm-trouble__said')) === REFUSED, await text(page, '.dm-trouble__said'));
    check('no rows stand under it', (await rows(page)) === 0, `${await rows(page)} rows`);
    check('the empty state is not what is said', await page.evaluate('document.querySelector(".dm-empty").hidden === true'));
    check('the count does not count', (await text(page, '.dm-count')) === 'No answer just now', await text(page, '.dm-count'));
    // The pins keep their names and lose their prices: a price bubble is a
    // quote against a query, and this query was never answered. (They stand
    // priced from the seed at the first frame, so this is a real change.)
    check('no price is quoted over a pin', (await page.evaluate('document.querySelectorAll(\'.dm-pin[data-shows="price"]\').length')) === 0);
    check('...and the pins still name their churches', (await page.evaluate('document.querySelectorAll(\'.dm-pin[data-shows="name"]\').length')) > 0);
    check('the churches rest — none of them is claimed to match', (await page.evaluate('__steeple.state.matching.size')) === 0);

    // The retry rhythm: the way back is one press, and it is a real press.
    state.answer = null;
    await press(page, '.dm-trouble__again');
    await page.waitForFunction('document.querySelectorAll(".dm-row").length > 0', { timeout: 15000 });
    check('Try again brings the real rows back', (await rows(page)) > 0, `${await rows(page)} rows`);
    check('...and the trouble goes with them', (await troubled(page)) === false);
    check('...and the count counts again', /space/.test(await text(page, '.dm-count')), await text(page, '.dm-count'));
    await page.close();
  }

  // ═══ 3. an answered 429 ════════════════════════════════════════════════════
  console.log('\n3. steeple answers 429, and the surface stops adding to the pace');
  {
    const { page, state } = await surface(live, {
      match: /\/api\/v1\/listings\/search/,
      status: 429,
    });
    check('the column is troubled', (await troubled(page)) === true);
    check('...and asks to be asked again shortly', (await text(page, '.dm-trouble__said')) === BUSY, await text(page, '.dm-trouble__said'));
    check('no rows are invented for a rate limit either', (await rows(page)) === 0, `${await rows(page)} rows`);

    // Inside the quiet window the answer is the same and no request is made:
    // asking a service that refused for pace is the one retry that makes it
    // worse. The block is lifted first, so a request that *did* go out would
    // succeed and show rows — the check would be loud rather than lucky.
    state.answer = null;
    const before = state.asked.filter((u) => u.includes('/listings/search')).length;
    await press(page, '.dm-trouble__again');
    await wait(1500);
    const after = state.asked.filter((u) => u.includes('/listings/search')).length;
    check('the quiet window asks nothing', after === before, `${before} → ${after}`);
    check('...and says the same thing', (await text(page, '.dm-trouble__said')) === BUSY, await text(page, '.dm-trouble__said'));
    check('...and still shows no rows', (await rows(page)) === 0, `${await rows(page)} rows`);
    await page.close();
  }

  // ═══ 4. the commitment point ═══════════════════════════════════════════════
  //
  // The village has scenery for this room, so the sheet *could* be built out of
  // it — with no open hours, no availability, and a form ready to take a date.
  // That is the false availability this suite exists for, at the one place it
  // would cost somebody something.
  console.log('\n4. the request sheet will not open on a room steeple refused to describe');
  {
    const { page } = await surface(live, {
      match: /\/api\/v1\/(listings\/by-slug|sitemap)/,
      status: 500,
    });
    await page.evaluate('__steeple.setView("apply",{venueId:"grace-community-vienna",roomId:"fellowship-hall"})');
    await page.waitForFunction(
      '/could not (open|answer)/i.test(document.querySelector(".letter__columns .prose")?.textContent ?? "")',
      { timeout: 15000 }
    );
    const sheetSaid = await text(page, '.letter__columns .prose');
    check('the sheet says it has no answer', /could not answer/i.test(sheetSaid), sheetSaid);
    // On the page, not merely in the DOM: the identity step and the card step
    // are built once and kept hidden, so their own "Save and send" is always in
    // the markup and is never reachable here.
    check('nothing on the page offers to send', await page.evaluate(
      '![...document.querySelectorAll(".letter__sheet button")].some((b) => b.offsetParent !== null && /send|request/i.test(b.textContent))'
    ));
    check('the foot of the sheet is empty', (await page.evaluate('document.querySelector(".letter__foot").childElementCount')) === 0);
    check('no week of dates is offered', (await page.evaluate('document.querySelectorAll(".letter__sheet .week__grid").length')) === 0);
    await page.close();
  }

  // ═══ 5. a 404 to everything ════════════════════════════════════════════════
  //
  // A static host, or a proxy nobody wired: /api/v1 is not served here at all.
  // No read on the catalog has a not-found case of its own, so this is steeple
  // being absent, and the promise the seed was built for stays.
  console.log('\n5. an origin that does not serve /api/v1 — the seed still answers');
  {
    const { page, said } = await surface(live, { match: /\/api\/v1\//, status: 404 });
    check('the surface is browsable', (await rows(page)) > 0, `${await rows(page)} rows`);
    check('nothing is troubled', (await troubled(page)) === false);
    check('what is on the page is the seed', (await text(page, '.dm-count')) === SEED_COUNT, await text(page, '.dm-count'));
    check('...and the catalog said so once, as information', said.filter((s) => s.includes('[catalog] steeple API unavailable')).length === 1);
    await page.close();
  }

  // ═══ 6. a real proxy with nothing behind it ════════════════════════════════
  //
  // The case the strict reading of "status 0" would have broken: this page is
  // always served from behind a proxy, and a proxy with a dead upstream answers
  // 502. Nothing is faked here — the dev server's target is a port with nothing
  // on it.
  console.log('\n6. a real dead API behind a real proxy (502) — the seed answers');
  {
    const { page, said, state } = await surface(absent);
    check('the proxy is what answered, and it said 502', state.answered.some((a) => a.startsWith('502 /api/v1/')), state.answered.slice(0, 3).join(' · '));
    check('the surface is browsable', (await rows(page)) > 0, `${await rows(page)} rows`);
    check('nothing is troubled', (await troubled(page)) === false);
    check('what is on the page is the seed', (await text(page, '.dm-count')) === SEED_COUNT, await text(page, '.dm-count'));
    check('...and the catalog said so once, as information', said.filter((s) => s.includes('[catalog] steeple API unavailable')).length === 1);
    await page.close();
  }

  console.log(`\n${failures === 0 ? 'all good' : `${failures} FAILED`}`);
} finally {
  await closeBrowsers();
}

process.exit(failures === 0 ? 0 : 1);
