// Real-input test for the discovery surface (CONTRACT4 §3, §4). Everything the
// visitor does is driven with actual mouse and keyboard events — no debug API
// for anything they can touch — because a search pill that only works when
// JavaScript pokes it is not a search pill. The debug API is used only to put
// the page past the roll, to observe, and to reset.
//
//   node tools/map-test.mjs "http://localhost:5322/?q=low"
//   node tools/map-test.mjs "http://localhost:5322/?q=low&map=dusk" dusk
import {
  agreeCurrent,
  at,
  closeBrowsers,
  isEnvironmentNoise,
  launch,
  routes,
  signIn,
  signInPage,
  stamp,
} from './fixtures.mjs';

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

const url = process.argv[2] ?? 'http://localhost:5322/?q=low';
const tag = process.argv[3] ?? 'run';
const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

let failures = 0;
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !isEnvironmentNoise(m)) errors.push(`[console] ${m.text()}`);
});
page.on('requestfailed', (r) => {
  if (r.url().includes('tile.openstreetmap.org')) errors.push(`[tiles] ${r.url()} ${r.failure()?.errorText ?? ''}`);
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const state = (key) => page.evaluate(`__steeple.state.${key}`);
const said = () => page.evaluate('document.getElementById("a11y").textContent');
const text = (selector) => page.evaluate((s) => document.querySelector(s)?.textContent?.trim() ?? '', selector);
const gone = (selector) => page.evaluate((s) => document.querySelector(s) === null, selector);
const count = (selector) => page.evaluate((s) => document.querySelectorAll(s).length, selector);

function check(label, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function ready(target) {
  // Navigating to the URL the page is already on only moves the hash, and a
  // search left over from the last section would quietly poison the next one.
  await page.goto('about:blank');
  // The bundled catalog paints immediately, then the live search reconciles it
  // and may re-frame the map. `__steepleReady` only means the shell is mounted;
  // measuring before this answer lands races that second frame.
  const liveSearch = page.waitForResponse(
    (response) => response.url().includes('/api/v1/listings/search') && response.ok(),
    { timeout: 25000 }
  );
  await page.goto(target, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__steepleReady === true', { timeout: 25000 });
  await liveSearch;
  // The product lives past the roll; the harness lands there without the tween.
  await page.evaluate('__steeple.roll.set(1)');
  // The results sheet reports its settled cover after the roll, which can ask
  // Leaflet for one final reframe. Do not mistake the quiet before that report
  // for the finished map; then require stable geometry as the real readiness
  // signal so a slow browser is not governed by the minimum alone.
  await wait(2600);
  let previous = null;
  let stable = 0;
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const snapshot = await page.evaluate(() => {
      const pin = (id) => document.querySelector(`.dm-pin[data-venue="${id}"]`)?.getBoundingClientRect();
      const grace = pin('grace-community-vienna');
      const oakton = pin('oakton-baptist');
      return {
        rows: document.querySelectorAll('.dm-row').length,
        count: document.querySelector('.dm-count')?.textContent?.trim() ?? '',
        spread: grace && oakton ? Math.hypot(grace.x - oakton.x, grace.y - oakton.y) : 0,
      };
    });
    const unchanged =
      previous &&
      snapshot.rows === previous.rows &&
      snapshot.count === previous.count &&
      Math.abs(snapshot.spread - previous.spread) < 0.25;
    stable = snapshot.rows === 9 && snapshot.spread > 0 && unchanged ? stable + 1 : 0;
    if (stable >= 4) return;
    previous = snapshot;
    await wait(250);
  }
  throw new Error('the live discovery answer did not settle');
}

async function box(selector) {
  const b = await (await page.$(selector))?.boundingBox();
  if (!b) throw new Error(`no box for ${selector}`);
  return { ...b, cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
}

async function realClick(selector) {
  // The results are cards two across now, so a listing further down the column
  // is genuinely off the bottom of the list. A visitor scrolls to it before
  // clicking it, and so does the harness.
  await page.evaluate((s) => {
    const node = document.querySelector(s);
    const r = node?.getBoundingClientRect();
    if (r && (r.bottom > window.innerHeight || r.top < 0)) {
      node.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
  }, selector);
  await wait(250);
  const { cx, cy } = await box(selector);
  await page.mouse.click(cx, cy);
  await wait(700);
}

/**
 * The map's own scale, measured the way a visitor sees it: pins moving apart.
 *
 * Between two named pins, not the first and the last on the page. The map draws
 * every venue the catalog answers with now, and the dev geocoder sends every
 * address a host types to the village centre (StubGeocodingGateway) — so the
 * first and last pins can be the same point, the spread is zero, and every zoom
 * measurement taken from it is NaN. A ruler that reads zero however far the map
 * is zoomed cannot show the failure it is there to catch.
 */
async function pinSpread() {
  return page.evaluate(() => {
    const at = (v) => document.querySelector(`.dm-pin[data-venue="${v}"]`)?.getBoundingClientRect();
    const a = at('grace-community-vienna');
    const b = at('oakton-baptist');
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  });
}

async function shot(name) {
  await page.screenshot({ path: `/tmp/steeple-b-map-${name}.png` });
}

// ── 1. the surface stands where it belongs ──────────────────────────────────
await ready(at(url, routes.browse()));
console.log(`\n— ${url} —`);
console.log('boot view:', await state('view'), '· map:', await state('map'));

const card = await box('.dm-card');
const mapBox = await box('.dm-map');
const bar = await box('.dm-bar');
const list = await box('.dm-list');

check('the surface takes the whole page under the top line', card.width > 1400 && card.height > 780, `${Math.round(card.width)}x${Math.round(card.height)}`);
check('the map is the hero on the left', mapBox.x < 4 && mapBox.width > 700 && mapBox.height > 780, `${Math.round(mapBox.width)}x${Math.round(mapBox.height)} at ${Math.round(mapBox.x)}`);
check('the search pill stands above the results', bar.y + bar.height <= list.y, `pill ends ${Math.round(bar.y + bar.height)}, list starts ${Math.round(list.y)}`);
check('the pill is one bar of four segments', (await count('.dm-bar > .dm-seg')) === 4, `${await count('.dm-bar > .dm-seg')} segments`);
// Where the search is looking is said by the control that changes it, not by a
// heading over the answers (CONTRACT6 §2.7). Whichever source answered — the
// bundled seed or the live geofence — names the area in the Where segment.
check('the head is the answer and nothing else', await gone('.dm-area'));
check(
  'the Where segment names the area it is searching',
  /Vienna/.test(await page.evaluate('document.querySelector("#dm-where").placeholder')),
  await page.evaluate('document.querySelector("#dm-where").placeholder')
);
check('the head counts what the search found', (await text('.dm-count')) === '9 spaces across 5 venues', await text('.dm-count'));
check('all five churches are pinned', (await count('.dm-pin')) === 5);
check('every published space is a row', (await count('.dm-row')) === 9, `${await count('.dm-row')} rows`);
check('the tiles are credited', (await text('.leaflet-control-attribution')).includes('OpenStreetMap contributors'));
await shot(`browse-${tag}`);

// ── 2. no "you are here", anywhere ──────────────────────────────────────────
check('the home pin is gone', await gone('.dm-home'));
check('...and the line it stood on', await gone('.dm-homeline'));
check('...and the button that placed it', await gone('.dm-here'));
check('...and the readout it fed', await gone('.dm-readout'));
check('...and the near-line above the list', await gone('.dm-near'));
await page.evaluate('__steeple.setView("venue",{venueId:"oakton-baptist"})');
await wait(900);
check('a sheet claims no distance from anything', await gone('.wf-distance'));
await page.evaluate('__steeple.setView("village")');
await wait(700);

// ── 3. pins and rows are one truth ──────────────────────────────────────────
// From a clean framing: opening a church a moment ago left the map on it.
await ready(at(url, routes.browse()));
const grace = await box('.dm-pin[data-venue="grace-community-vienna"]');
await page.mouse.move(grace.cx, grace.cy);
await wait(400);
check('hovering a pin warms that church', (await state('hoverVenueId')) === 'grace-community-vienna', String(await state('hoverVenueId')));
check('...and its rows light with it', (await count('.dm-row.is-hovered[data-venue="grace-community-vienna"]')) > 0);
await page.mouse.move(grace.cx, mapBox.y + mapBox.height - 20);
await wait(400);
check('leaving a pin cools it', (await state('hoverVenueId')) === null, String(await state('hoverVenueId')));

// The pin first: choosing a church brings its pin under the eye, so the map is
// no longer framed on the whole area afterwards.
await realClick('.dm-pin[data-venue="merrifield-fellowship"]');
await wait(1000);
check('a pin opens its church', (await state('view')) === 'venue' && (await state('venueId')) === 'merrifield-fellowship', `${await state('view')} / ${await state('venueId')}`);
check('the church sheet says who it is', (await text('.sheet--venue .sheet__title')) === 'Merrifield Fellowship Church', await text('.sheet--venue .sheet__title'));
check('...and is set with a picture of one of its spaces', await page.evaluate('!!document.querySelector(".sheet--venue .dm-banner--hero .dm-banner__img")'));
await shot(`venue-${tag}`);

await ready(at(url, routes.browse()));
await realClick('.dm-row[data-room="gymnasium"]');
await wait(1200);
check(
  'a row opens the space it names',
  (await state('view')) === 'room' && (await state('roomId')) === 'gymnasium',
  `${await state('view')} / ${await state('venueId')} / ${await state('roomId')}`
);
check('the pin carries the selection', (await count('.dm-pin.is-current[data-venue="oakton-baptist"]')) === 1);
check('the sheet shows the space it opened', (await text('.sheet--room .sheet__title')) === 'Gymnasium', await text('.sheet--room .sheet__title'));
await page.evaluate('__steeple.setView("village")');
await wait(800);

// ── 4. banners ──────────────────────────────────────────────────────────────
check('every row carries a banner', (await count('.dm-row .dm-banner')) === (await count('.dm-row')));
const loaded = await page.evaluate(() =>
  [...document.querySelectorAll('.dm-banner__img')].filter((n) => n.naturalWidth > 0).length
);
check('the banners are real pictures, not broken marks', loaded >= 8, `${loaded} loaded`);
// Card variants where they exist; the live seed's photos carry only the
// original until steeple backfills variants (CONTRACT4 §5), so any real URL passes.
check('and they are asked for at a real URL', await page.evaluate('/^https:\\/\\//.test(document.querySelector(".dm-row .dm-banner__img").src)'), await page.evaluate('document.querySelector(".dm-row .dm-banner__img").src'));

// A URL that will not answer is the same as no photograph at all.
await page.evaluate(`
  const img = document.querySelector('.dm-row .dm-banner__img');
  img.src = location.origin + '/definitely-not-a-photograph.png';
`);
await wait(1200);
check('a photograph that fails falls back to a lettered plate', (await count('.dm-banner.is-lettered')) >= 1, `${await count('.dm-banner.is-lettered')} lettered`);
check('...and the plate says which space it stands for', (await text('.dm-banner.is-lettered .dm-banner__letter')).length === 1, await text('.dm-banner.is-lettered .dm-banner__letter'));

// ── 5. the search pill: where ───────────────────────────────────────────────
await ready(at(url, routes.browse()));
await realClick('.dm-seg--where');
check('the where segment opens its typeahead', (await count('.dm-typeahead__item')) > 1, `${await count('.dm-typeahead__item')} options`);
// The whole area is always the first option, and it is named after whatever
// the geofence calls itself — the same words the segment shows when empty.
check(
  '...offering the whole area first, by name',
  (await text('.dm-typeahead__item.is-anywhere')) ===
    (await page.evaluate('document.querySelector("#dm-where").placeholder')),
  await text('.dm-typeahead__item.is-anywhere')
);

await page.keyboard.type('Oak', { delay: 60 });
await wait(400);
check('typing narrows it to the suburbs that match', (await count('.dm-typeahead__item')) === 2, await page.evaluate('[...document.querySelectorAll(".dm-typeahead__item")].map(n=>n.textContent).join(" | ")'));
await shot(`typeahead-${tag}`);

await page.keyboard.press('Enter');
await wait(900);
check('Enter takes the suburb', (await page.evaluate('document.querySelector(".dm-seg__input").value')) === 'Oakton');
check('...and the search answers with it', (await text('.dm-count')) === '2 spaces across 1 venue', await text('.dm-count'));
check('...the rows are only that suburb', await page.evaluate('[...document.querySelectorAll(".dm-row")].every(n=>n.dataset.venue==="oakton-baptist")'));
check('...and the other four churches rest on the map', (await count('.dm-pin.is-resting')) === 4, `${await count('.dm-pin.is-resting')} resting`);
console.log('  announced:', JSON.stringify(await said()));

// ── 6. the search pill: how many ────────────────────────────────────────────
await ready(at(url, routes.browse()));
await realClick('.dm-seg--many');
await realClick('.pill--capacity[data-capacity="100"]');
check('a size takes the small rooms out', (await text('.dm-count')) === '3 spaces across 3 venues', await text('.dm-count'));
check('the segment says what it is holding', (await text('.dm-seg--many .dm-seg__value')) === '100+ people', await text('.dm-seg--many .dm-seg__value'));
// The seats are read off the front of the meta line, not by stripping every
// non-digit from it: that line carries a rating too once a venue has earned one
// ("Seats 120 · ★ 4.6 (12)"), and a strip turns that into 1204612.
check('every row left is big enough', await page.evaluate('[...document.querySelectorAll(".dm-row__meta")].every(n=>Number((n.textContent.match(/^Seats\\s+(\\d+)/) ?? [])[1]) >= 100)'));
check('the churches that cannot hold you rest, and stay pinned', (await count('.dm-pin.is-resting')) === 2, `${await count('.dm-pin.is-resting')} resting`);
check('the world is told the same thing', (await page.evaluate('__steeple.state.matching.size')) === 3, String(await page.evaluate('__steeple.state.matching.size')));
await shot(`capacity-${tag}`);

await realClick('.pill--capacity[data-capacity="100"]');
check('pressing it again puts every space back', (await text('.dm-count')) === '9 spaces across 5 venues', await text('.dm-count'));

// ── 7. the search pill: when ────────────────────────────────────────────────
await realClick('.dm-seg--when');
await realClick('.dm-switch__option[data-mode="weekly"]');
await realClick('.pill--day[data-day="2"]');
await realClick('.pill--band[data-band="Evening"]');
check('the pill holds the days and the band', (await text('.dm-seg--when .dm-seg__value')) === 'Every Tue · evening', await text('.dm-seg--when .dm-seg__value'));
check(
  'the schedule is sent even though the seed cannot answer it',
  (await text('.dm-count')) === '9 spaces across 5 venues',
  await text('.dm-count')
);
await shot(`when-${tag}`);
await realClick('.dm-when .dm-group__clear');
check('"Any time" gives the question back', (await text('.dm-seg--when .dm-seg__value')) === 'Any time');

// ── 8. the search pill: the funnel ──────────────────────────────────────────
await realClick('.dm-seg--filters');
check('the funnel opens three groups', (await count('.dm-filters .dm-group')) === 3);
await realClick('.pill--filter[data-filter="Music"]');
check('an activity filters', (await page.evaluate('[...__steeple.state.filters].join()')) === 'Music');
check('...the count follows', (await text('.dm-count')).startsWith('3 spaces'), await text('.dm-count'));
check('...and the funnel wears the number', (await text('.dm-seg__badge')) === '1', await text('.dm-seg__badge'));
await realClick('.pill--filter[data-filter="Piano"]');
check('an amenity narrows it further', (await text('.dm-count')).startsWith('1 space'), await text('.dm-count'));
check('...and the funnel counts both', (await text('.dm-seg__badge')) === '2', await text('.dm-seg__badge'));
await shot(`filters-${tag}`);

await page.keyboard.press('Escape');
await wait(400);
check('Escape closes the panel', await page.evaluate('document.querySelector(".dm-pop").hidden === true'));
check('...and leaves the search standing', (await text('.dm-count')).startsWith('1 space'));

// Clicking away is an answer too, and it must not be read as anything else.
await realClick('.dm-seg--filters');
check('the funnel opens again', await page.evaluate('document.querySelector(".dm-pop").hidden === false'));
await page.mouse.click(mapBox.cx, mapBox.cy);
await wait(500);
check('a click on the map closes the panel', await page.evaluate('document.querySelector(".dm-pop").hidden === true'));
check('...without changing where you are', (await state('view')) === 'village', String(await state('view')));

await realClick('.dm-seg--filters');
await realClick('.dm-filters .dm-group__clear');
check('clear all puts every space back', (await text('.dm-count')) === '9 spaces across 5 venues', await text('.dm-count'));
check('...and every church back on its feet', (await count('.dm-pin.is-resting')) === 0);

// A filter set from anywhere else is still a filter.
await page.evaluate('__steeple.setFilters(new Set(["Sports"]))');
await wait(700);
check('a filter set elsewhere is adopted by the pill', (await text('.dm-seg__badge')) === '1', await text('.dm-seg__badge'));
check('...and re-asked as a search', (await text('.dm-count')).startsWith('1 space'), await text('.dm-count'));

// ── 9. zoom, with some pace in it ───────────────────────────────────────────
// Measured the way it is felt: how many zoom levels one gesture actually moves.
// Wave 4 doubled it — + from half a level to a whole one, a 60px notch of the
// wheel from a quarter to a half. Wave 6 took the notch 30% further again, to
// 0.65 (CONTRACT5 §2.3); tools/map-feel.mjs is where that number is measured.
await ready(at(url, routes.browse()));
const beforeButton = await pinSpread();
await realClick('.leaflet-control-zoom-in');
await wait(1000);
const buttonLevels = Math.log2((await pinSpread()) / beforeButton);
check('the + button takes a whole zoom level, where it took half', buttonLevels > 0.95 && buttonLevels < 1.05, `${buttonLevels.toFixed(2)} levels`);

await ready(at(url, routes.browse()));
const beforeWheel = await pinSpread();
await page.mouse.move(mapBox.cx, mapBox.cy);
await page.mouse.wheel({ deltaY: -60 });
await wait(1400);
const wheelLevels = Math.log2((await pinSpread()) / beforeWheel);
check('one notch of the wheel moves 0.65 of a level, where it moved half', wheelLevels > 0.62 && wheelLevels < 0.68, `${wheelLevels.toFixed(2)} levels`);

// ── 10. a church placed but not published: shown, never clickable ───────────
// The wheel gesture above deliberately clips the result list to the visible
// map. A placed venue must not change that rentable answer; the exact number is
// whatever the visitor could see immediately before placing it.
const rentableRowsBeforePlacement = await count('.dm-row');
await page.evaluate(
  '__steeple.store.upsertPlacedVenue({ id: "new-church-test", name: "New Church", shortName: "New Church", lat: 38.884, lng: -77.28 })'
);
await wait(700);
check('a placed church appears as a quiet mark', (await count('.dm-newpin')) === 1);
check('it says who it is', (await text('.dm-newpin__name')) === 'New Church');
check('it is not clickable', await page.evaluate('!document.querySelector(".dm-newpin").classList.contains("leaflet-interactive")'));
const rentableRows = await count('.dm-row');
check(
  'and it is not among the spaces for rent',
  rentableRows === rentableRowsBeforePlacement,
  `${rentableRowsBeforePlacement} before, ${rentableRows} after`
);

// ── 11. the surface withdraws where it has nothing to answer ────────────────
//
// Re-baselined 2026-08-07 (P6): a stranger has no journal since D6 — asking for
// it signed out bounces to the village, which is its own guarantee. The
// withdrawal this section is about needs somebody with a correspondence view to
// stand over the map, so one is signed in for it (and agrees on the wire, or
// the P4 quiet-moment ask would stand its own panel over this beat).
const strangerJournal = await page.evaluate(
  '(__steeple.setView("journal"), new Promise((r) => setTimeout(() => r(__steeple.state.view), 900)))'
);
check('a stranger asking for a journal is returned to the village', strangerJournal === 'village');
const reader = await signIn(`map-reader-${stamp}@example.org`, 'Quiet Reader');
await agreeCurrent(reader.accessToken);
await signInPage(page, `map-reader-${stamp}@example.org`, 'Quiet Reader');
await wait(600);
await page.evaluate('__steeple.setView("journal")');
await wait(900);
check('the surface withdraws from a correspondence view', await page.evaluate('document.querySelector(".discovery").hasAttribute("inert")'));
await page.evaluate('__steeple.setView("village")');
await wait(900);
check('and comes back to the village', await page.evaluate('!document.querySelector(".discovery").hasAttribute("inert")'));

console.log(errors.length ? `\nconsole/page/tile errors:\n${errors.join('\n')}` : '\nno console errors');
if (errors.length) failures += errors.length;
console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
await closeBrowsers();
process.exit(failures ? 1 : 0);
