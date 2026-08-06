#!/usr/bin/env node
// DISCOVERY IS THE CATALOG'S, NOT THE SCENERY'S (review issue 7, 2026-08-06).
//
// The map's pins and the venue/room property sheets used to be built from
// src/data/venues.js — the 3D village's scenery — while the results came from
// the live catalog. A venue a host listed had a row and nothing else: no pin,
// no sheet, and no way into its apply flow but a hand-typed URL. This suite
// drives the whole way in, with real mouse and keyboard, for both kinds of
// venue, and proves the one that is not scenery behaves exactly like the ones
// that are.
//
//   §1  a live venue: search finds it → its pin → its sheet → its space → apply
//   §2  a seed venue beyond the first page of results, the same way
//   §3  the Draft seed room stays invisible
//   §4  the roster and the search stay one truth (pins rest, prices follow)
//   §5  a superseded search is taken off the wire, not merely ignored
//
// Needs the API on localhost:5200 (vite proxies /api/v1) and a *published* live
// venue minted through the hosting chain — pass its slug pair, or the suite
// falls back to finding one on the wire.
//
//   node tools/discovery-test.mjs "http://localhost:5180/?q=low&world=off" <venueSlug> <roomSlug>
//
// world-OFF: nothing here is about the village, and the engine costs the
// harness minutes. Every assertion is on the DOM or on __steeple.state — the
// app's own catalog module is deliberately never imported, because a bare
// `import('/src/data/catalog.js')` from this page is not reliably the instance
// the app is running once vite has hot-reloaded.

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

const url = process.argv[2] ?? 'http://localhost:5180/?q=low&world=off';
const API = 'http://localhost:5200/api/v1';
const SEED_VENUE = 'vienna-presbyterian';
const SEED_ROOM = 'music-room';

let liveVenue = process.argv[3] ?? null;
let liveRoom = process.argv[4] ?? null;

let failures = 0;
let checks = 0;
const check = (label, ok, detail = '') => {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const up = await fetch(`${API}/geofence`).then((r) => r.ok, () => false);
if (!up) {
  console.log('\nThe steeple API is not answering on localhost:5200 — this suite needs it.');
  process.exit(2);
}

// Any venue that is not one of the five the village stages will do; the slug
// pair is only passed in so a run can name the one it just minted.
if (!liveVenue) {
  const scenery = new Set([
    'grace-community-vienna',
    'vienna-presbyterian',
    'oakton-baptist',
    'dunn-loring-umc',
    'merrifield-fellowship',
  ]);
  const found = await fetch(`${API}/listings/search?minCapacity=45&pageSize=100`)
    .then((r) => r.json())
    .then(({ items }) => items.find((i) => !scenery.has(i.venueSlug)));
  if (!found) {
    console.log('\nNo live (non-scenery) venue on the wire to drive. Mint one first.');
    process.exit(2);
  }
  liveVenue = found.venueSlug;
  liveRoom = found.roomSlug;
}
console.log(`\nliving venue under test: ${liveVenue}/${liveRoom}`);

const browser = await launch();

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const problems = [];
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (/GL Driver|GPU stall/.test(text)) return;
    if ((m.location()?.url ?? '').includes('/api/v1/')) return;
    if (/\/media\//.test(text)) return; // absolute media URLs from other agents' ports
    problems.push(`[console] ${text}`);
  });

  const searches = [];
  page.on('request', (r) => {
    if (r.url().includes('/listings/search')) searches.push(r.url());
  });
  const withdrawn = [];
  page.on('requestfailed', (r) => {
    if (r.url().includes('/listings/search')) withdrawn.push(r.failure()?.errorText ?? '?');
  });

  const text = (sel) => page.evaluate((s) => document.querySelector(s)?.textContent?.trim() ?? '', sel);
  const count = (sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel);
  const has = (sel) => page.evaluate((s) => document.querySelector(s) !== null, sel);
  const view = () => page.evaluate('__steeple.state.view');

  /** A real press, by pointer, on whatever is at the element's middle. */
  async function press(selector) {
    const handle = await page.$(selector);
    if (!handle) throw new Error(`nothing at ${selector}`);
    const box = await handle.boundingBox();
    if (!box) throw new Error(`${selector} has no box`);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }

  async function settled(predicate, why, timeout = 15000) {
    await page.waitForFunction(predicate, { timeout }).catch(() => {
      throw new Error(`never settled: ${why}`);
    });
  }

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction('window.__steepleReady === true', { timeout: 25000 });
  await page.waitForFunction('__steeple.state.roll === 1', { timeout: 25000 });
  await settled('document.querySelectorAll(".dm-row").length > 0', 'the first answer');

  // ── 1. the live venue, the whole way in ────────────────────────────────────
  console.log('\n1. a venue a host listed is a venue like any other');
  {
    // Narrow the search by hand until the live venue is among the answers: its
    // room seats 45, and the room the other agents mint seats 40.
    await press('.dm-seg--many .dm-seg__open');
    await page.waitForSelector('.dm-capacity__input', { visible: true });
    await page.focus('.dm-capacity__input');
    await page.keyboard.type('45');
    await settled(
      `[...document.querySelectorAll('.dm-row')].some((r) => r.dataset.venue === '${liveVenue}')`,
      'the live venue in the results'
    );
    await page.keyboard.press('Escape');

    check('the search finds it', await has(`.dm-row[data-venue="${liveVenue}"]`));
    check(
      '...and the count counts it',
      /space/.test(await text('.dm-count')),
      await text('.dm-count')
    );

    // The pin. It is the thing that did not exist before this change.
    const pin = `.dm-pin[data-venue="${liveVenue}"]`;
    check('it has a pin on the map', await has(pin));
    check(
      "...and the pin says the venue's own name",
      (await text(`${pin} .dm-pin__who`)) !== '' &&
        !/^venue|undefined|null$/i.test(await text(`${pin} .dm-pin__who`)),
      await text(`${pin} .dm-pin__who`)
    );
    check(
      '...and quotes what it costs',
      (await page.evaluate((s) => document.querySelector(s)?.dataset.shows, pin)) === 'price',
      await text(`${pin} .dm-pin__price`)
    );
    check(
      '...and names itself to a screen reader',
      (await page.evaluate((s) => document.querySelector(s)?.getAttribute('aria-label'), pin))?.includes(
        'Vienna'
      )
    );

    // Keyboard first: a pin is a button and answers like one.
    await page.evaluate((s) => document.querySelector(s).focus(), pin);
    check('the pin takes focus', await page.evaluate((s) => document.activeElement === document.querySelector(s), pin));
    await page.keyboard.press('Enter');
    await settled(`__steeple.state.venueId === '${liveVenue}'`, 'Enter on the pin opening the venue');
    check('Enter on the pin opens the venue', (await view()) === 'venue');

    // And the mouse. The dev geocoder sends every address to the village centre
    // (StubGeocodingGateway), so ninety-odd venues stack on one point here and
    // the pointer finds whichever is on top — so the check is the invariant
    // that actually matters: the sheet that opens is the pin that was pressed.
    await page.keyboard.press('Escape');
    await wait(600);
    const box = await (await page.$(pin)).boundingBox();
    const pressed = await page.evaluate(
      ([x, y]) =>
        document
          .elementsFromPoint(x, y)
          .find((n) => n.classList?.contains('dm-pin'))?.dataset.venue ?? null,
      [box.x + box.width / 2, box.y + box.height / 2]
    );
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await settled(`__steeple.state.view === 'venue'`, 'a click on the pin');
    check(
      'a click on a pin opens the venue that pin belongs to',
      pressed !== null && (await page.evaluate('__steeple.state.venueId')) === pressed,
      `pressed ${pressed}, opened ${await page.evaluate('__steeple.state.venueId')}`
    );
    // Back to the one under test, the way a keyboard gets there.
    await page.keyboard.press('Escape');
    await wait(500);
    await page.evaluate((s) => document.querySelector(s).focus(), pin);
    await page.keyboard.press('Enter');
    await settled(`__steeple.state.venueId === '${liveVenue}'`, 'the live venue again');

    // The sheet.
    check('the venue sheet is open', await page.evaluate("document.querySelector('.sheet--venue').classList.contains('is-open')"));
    const title = await text('.sheet--venue .sheet__title');
    check('the venue names itself', title.length > 0 && title !== liveVenue, title);
    check('...in the suburb it is in', /Vienna/.test(await text('.sheet--venue .eyebrow')), await text('.sheet--venue .eyebrow'));
    check('...with an address you can take with you', (await text('.sheet--venue .sheet__address')).length > 5, await text('.sheet--venue .sheet__address'));
    check('...and its spaces as cards', (await count('.sheet--venue .spacecard')) > 0);

    // The street address is the half of a venue only RoomDetail carries: the
    // search answer knows the suburb and nothing finer, so the sheet opens on
    // that and the full read completes it a beat later.
    await settled(
      "/\\d/.test(document.querySelector('.sheet--venue .sheet__address')?.textContent ?? '')",
      'the venue read completing the sheet'
    );
    check(
      'the full read fills in the street address, not just the suburb',
      /\d/.test(await text('.sheet--venue .sheet__address')),
      await text('.sheet--venue .sheet__address')
    );
    check(
      'a venue steeple has not verified does not wear the mark',
      (await count('.sheet--venue .verified')) === 0
    );
    check('the breadcrumb names it too', (await text('.crumbs')).includes(title.slice(0, 12)), await text('.crumbs'));

    // The space.
    await press('.sheet--venue .spacecard');
    await settled("__steeple.state.view === 'room'", 'the space card opening a room');
    const roomTitle = await text('.sheet--room .sheet__title');
    check('a space card opens the space', (await view()) === 'room');
    check('the space names itself', roomTitle.length > 0, roomTitle);
    check('...prices it', /\$\d/.test(await text('.sheet--room .price')), await text('.sheet--room .price'));
    check('...and sizes it', /Seats \d+/.test(await text('.sheet--room .headline__capacity')), await text('.sheet--room .headline__capacity'));
    await settled(
      "document.querySelector('.sheet--room .block--rules') !== null",
      'the listing read completing the room sheet'
    );
    check('the listing fills in the paragraph', (await text('.sheet--room .prose')).length > 20);
    check('...and the house rules', (await text('.sheet--room .block--rules .prose')).length > 5);
    check('...and what it welcomes', (await count('.sheet--room .chip--activity')) > 0);

    // Apply.
    await press('.sheet--room .sheet__foot .pill--primary');
    await settled("__steeple.state.view === 'apply'", 'the request sheet opening');
    check('Request opens the composer', (await view()) === 'apply');
    await settled(
      "document.querySelector('.letter__head')?.textContent?.trim().length > 0",
      'the composer addressing itself'
    );
    const addressed = await text('.letter__head');
    check('...pre-addressed to this very space', addressed.includes(roomTitle.slice(0, 10)), addressed);
    check(
      '...and to this very venue',
      addressed.includes(title.slice(0, 12)),
      addressed
    );
    check('the week card is there to choose hours in', await has('.letter__col--when'));

    await page.keyboard.press('Escape');
    await wait(500);
  }

  // ── 2. a seed venue, the same journey ──────────────────────────────────────
  //
  // vienna-presbyterian is the interesting one: the local database holds more
  // published rooms than one page of results, and it sits past the end of the
  // first page. A search that narrows to it must bring its pin up.
  console.log('\n2. a seed venue, unchanged — and one the first page of results never reaches');
  {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction('window.__steepleReady === true', { timeout: 25000 });
    await settled('document.querySelectorAll(".dm-row").length > 0', 'the first answer');

    check(
      'the five the village stages are pinned from the first frame',
      (await count('.dm-pin')) >= 5,
      `${await count('.dm-pin')} pins`
    );

    // A real filter: the only piano in the beachhead is the seed's music room.
    await press('.dm-seg--filters');
    await page.waitForSelector('.pill--filter[data-filter="Piano"]', { visible: true });
    await press('.pill--filter[data-filter="Piano"]');
    await settled(
      `[...document.querySelectorAll('.dm-row')].some((r) => r.dataset.venue === '${SEED_VENUE}')`,
      'the piano search'
    );
    await page.keyboard.press('Escape');

    check('a narrowed search reaches a venue the first page did not', await has(`.dm-row[data-venue="${SEED_VENUE}"]`));
    check('...and brings its pin with it', await has(`.dm-pin[data-venue="${SEED_VENUE}"]`));
    check(
      '...and the venues that cannot answer rest, still pinned',
      (await count('.dm-pin.is-resting')) > 0,
      `${await count('.dm-pin.is-resting')} resting`
    );
    check(
      '...and quote no price, because this query was not asked about them',
      (await count('.dm-pin.is-resting[data-shows="price"]')) === 0
    );

    // By keyboard, which is unambiguous: the dev geocoder stacks ninety-odd
    // venues on the village centre, and a price chip belonging to one of those
    // stands over this pin. Pressing what you can see is right (the chip opens
    // the venue it belongs to — §1 asserts exactly that), so the pointer cannot
    // be aimed at a covered pin here.
    await page.evaluate((s) => document.querySelector(s).focus(), `.dm-pin[data-venue="${SEED_VENUE}"]`);
    await page.keyboard.press('Enter');
    await settled(`__steeple.state.venueId === '${SEED_VENUE}'`, 'the seed pin opening its venue');
    check('its pin opens its sheet', (await view()) === 'venue');
    check(
      'the sheet is the one it has always been',
      (await text('.sheet--venue .sheet__title')) === 'Vienna Presbyterian Church',
      await text('.sheet--venue .sheet__title')
    );
    check(
      '...with the address it has always had',
      (await text('.sheet--venue .sheet__address')) === '124 Park Street NE, Vienna 22180',
      await text('.sheet--venue .sheet__address')
    );
    check('...both its spaces', (await count('.sheet--venue .spacecard')) === 2, `${await count('.sheet--venue .spacecard')} cards`);
    check('...its description', (await text('.sheet--venue .prose--sm')).startsWith('Historic church near the W&OD trail'), await text('.sheet--venue .prose--sm'));
    check('...and how to park and arrive', (await count('.sheet--venue .facts__pair')) === 2);
    check('...and its verified mark, which it has earned', (await count('.sheet--venue .verified')) === 1);
    check('...photographed as itself', await page.evaluate("!!document.querySelector('.sheet--venue .dm-banner--hero img')?.getAttribute('src')"));

    await page.evaluate(`__steeple.setView('room', { venueId: '${SEED_VENUE}', roomId: '${SEED_ROOM}' })`);
    await settled("__steeple.state.view === 'room'", 'the seed room');
    await settled(
      "document.querySelector('.sheet--room .block--rules') !== null",
      'the seed listing landing'
    );
    check('its space is the one it has always been', (await text('.sheet--room .sheet__title')) === 'Music Room', await text('.sheet--room .sheet__title'));
    check('...at the price it has always been', (await text('.sheet--room .price')) === '$35/hr', await text('.sheet--room .price'));
    check('...with the rules it has always had', (await text('.sheet--room .block--rules .prose')).startsWith('Piano use included'), await text('.sheet--room .block--rules .prose'));
    check('...and its photograph', await page.evaluate("!!document.querySelector('.sheet--room .dm-banner--hero img')?.getAttribute('src')"));

    await press('.sheet--room .sheet__foot .pill--primary');
    await settled("__steeple.state.view === 'apply'", 'the seed request sheet');
    check('and Request still opens the composer', (await view()) === 'apply');
    await page.keyboard.press('Escape');
    await wait(400);
  }

  // ── 3. the Draft stays a Draft ─────────────────────────────────────────────
  console.log('\n3. only Published rooms are public');
  {
    await page.evaluate("__steeple.setView('venue', { venueId: 'oakton-baptist' })");
    await settled("__steeple.state.venueId === 'oakton-baptist'", 'the Oakton sheet');
    await settled("document.querySelectorAll('.sheet--venue .spacecard').length > 0", 'its cards');
    const cards = await page.evaluate(
      "[...document.querySelectorAll('.sheet--venue .spacecard__name')].map((n) => n.textContent)"
    );
    check('the Draft space is not offered', !cards.some((n) => /Renovation Annex/.test(n)), cards.join(', '));
    check('...but the sheet says one is being prepared', /being prepared/.test(await text('.sheet--venue .aside')), await text('.sheet--venue .aside'));

    await page.goto(`${url.split('#')[0]}#/room/oakton-baptist/renovation-annex`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForFunction('window.__steepleReady === true', { timeout: 25000 });
    await wait(2500);
    check(
      'a deep link to the Draft opens no listing',
      !(await page.evaluate("document.querySelector('.sheet--room').classList.contains('is-open')")),
      `${await view()} / ${await text('.sheet--room .sheet__title')}`
    );
  }

  // ── 4. one truth ───────────────────────────────────────────────────────────
  console.log('\n4. the pins and the rows are one answer');
  {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction('window.__steepleReady === true', { timeout: 25000 });
    await settled('document.querySelectorAll(".dm-row").length > 0', 'the first answer');

    const agreed = await page.evaluate(() => {
      const rows = new Set([...document.querySelectorAll('.dm-row')].map((r) => r.dataset.venue));
      const standing = new Set(
        [...document.querySelectorAll('.dm-pin:not(.is-resting)')].map((p) => p.dataset.venue)
      );
      return {
        rows: rows.size,
        standing: standing.size,
        orphanRows: [...rows].filter((v) => !document.querySelector(`.dm-pin[data-venue="${v}"]`)),
      };
    });
    check('every venue with a row has a pin', agreed.orphanRows.length === 0, agreed.orphanRows.join(', '));
    check(
      '...and the pins standing are the venues that answered',
      agreed.standing === agreed.rows,
      `${agreed.standing} standing vs ${agreed.rows} in the list`
    );
    check(
      'the world is told the same set',
      (await page.evaluate('__steeple.state.matching.size')) === agreed.rows,
      `${await page.evaluate('__steeple.state.matching.size')}`
    );
  }

  // ── 5. a superseded question leaves the wire ───────────────────────────────
  console.log('\n5. a question nobody is waiting on is taken off the wire');
  {
    searches.length = 0;
    withdrawn.length = 0;
    await press('.dm-seg--many .dm-seg__open');
    await page.waitForSelector('.dm-capacity__input', { visible: true });
    await page.focus('.dm-capacity__input');
    // Five keystrokes, as fast as a person types a number.
    for (const key of ['1', '0', '0', '0']) {
      await page.keyboard.press(key);
      await wait(30);
    }
    await wait(1800);
    check(
      'four keystrokes are not four searches',
      searches.length <= 2,
      `${searches.length} searches: ${searches.map((s) => new URL(s).search).join(' · ')}`
    );
    check('the surface still answered', (await text('.dm-count')).length > 0, await text('.dm-count'));
    check('...and did not fall back to the seed', (await text('.dm-count')) !== '9 spaces across 5 venues', await text('.dm-count'));

    // Now prove the withdrawal is real rather than merely quiet. The local API
    // answers a search faster than a person can press the next key, so the
    // first question is held open behind an interceptor: two are genuinely in
    // flight, and the earlier one has to leave the wire rather than be ignored
    // on arrival. Held on the request, not faked as a response — what is being
    // proven is that the browser cancelled it.
    searches.length = 0;
    withdrawn.length = 0;
    let holding = null;
    await page.setRequestInterception(true);
    const gate = (request) => {
      if (request.url().includes('/listings/search') && !holding) {
        holding = request;
        return; // never continued, never answered: still in flight
      }
      request.continue().catch(() => {});
    };
    page.on('request', gate);

    await page.evaluate(() => {
      const input = document.querySelector('.dm-capacity__input');
      const set = (v) => {
        input.value = v;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set('10');
      setTimeout(() => set('25'), 700);
    });
    await wait(2000);
    check(
      'the earlier of two searches is withdrawn, not merely ignored',
      withdrawn.some((why) => /abort/i.test(why)),
      `${searches.length} asked, withdrawn: ${withdrawn.join(', ') || 'none'}`
    );

    page.off('request', gate);
    await page.setRequestInterception(false);
    await wait(1500);
    check('and the surface still answered', (await text('.dm-count')).length > 0, await text('.dm-count'));
  }

  console.log(`\n${problems.length} console problems`);
  for (const p of problems.slice(0, 12)) console.log(`   ${p}`);
} finally {
  await closeBrowsers();
}

console.log(`\n${checks - failures}/${checks} checks`);
process.exit(failures > 0 ? 1 : 0);
