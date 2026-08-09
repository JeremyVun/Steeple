#!/usr/bin/env node
// THE CLEAN ROUTES, DRIVEN (docs/contracts/seo.md SEO-D1/D2/D6).
//
// tools/router-test.mjs proves the grammar in plain node — every route, every
// old fragment, every hostile segment. This suite proves the half that only a
// browser has: that a cold route boots the product it names, that a press adds
// exactly one history entry, that Back and Forward walk them without looping,
// that a reload on any route family comes back to the same view, and that an
// old shared `#/…` link still opens the same place and is corrected in place.
//
//   node tools/route-test.mjs "http://localhost:5382/?q=low"
//
// Needs: the API (STEEPLE_API, default http://localhost:5200/api/v1) and this
// app on the given origin with its proxy pointed at that same API — `/space/…`
// is a *document* now, rendered by the API, so a cold listing route is a real
// round trip through the proxy and not a client-side guess.
//
// §1 runs with the village on purpose: "no Three was fetched" is only a claim
// worth making where there was a village to fetch. Everything after it adds
// `world=off`, because history is not a camera and headless GL costs minutes.

import { at, closeBrowsers, launch, routes } from './fixtures.mjs';

for (const fatal of ['uncaughtException', 'unhandledRejection']) {
  process.on(fatal, async (error) => {
    await closeBrowsers();
    console.log(`\nthe run stopped: ${error?.message ?? error}`);
    process.exit(1);
  });
}

const url = process.argv[2] ?? 'http://localhost:5382/?q=low';
const flat = (path) => {
  const target = new URL(at(url, path));
  target.searchParams.set('world', 'off');
  return target.href;
};

const VENUE = 'dunn-loring-umc';
const ROOM = 'art-studio';

let failures = 0;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function check(label, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

const problems = [];
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));

const state = (key) => page.evaluate(`__steeple.state.${key}`);
const here = () => page.evaluate(() => location.pathname + location.search + location.hash);
const ready = async (target) => {
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction('window.__steepleReady === true', { timeout: 60000 });
  await wait(1200);
};

try {
  // ── §1 a cold listing route ───────────────────────────────────────────────
  console.log('\n── §1 the canonical listing URL, opened cold ────────────────');
  {
    await ready(at(url, routes.room(VENUE, ROOM)));
    check('it opens the room it names', (await state('view')) === 'room' && (await state('roomId')) === ROOM,
      `${await state('view')} / ${await state('roomId')}`);
    check('the room sheet is open', await page.evaluate('!!document.querySelector(".sheet--room.is-open")'));
    check('the map is on the page', await page.evaluate('!!document.querySelector(".leaflet-container")'));
    check('past the roll, with no title act', (await state('roll')) === 1);
    check(
      'the address bar is exactly what was asked for',
      (await here()) === `/space/${VENUE}/${ROOM}${new URL(url).search}`,
      await here()
    );
    check(
      'no village was fetched behind it',
      await page.evaluate(() =>
        !performance
          .getEntriesByType('resource')
          .some((r) => /(three|engine|world|journey)[-.]/.test(r.name))
      )
    );
    check('...and the debug API agrees', await page.evaluate('__steeple.engine === null'));
    check(
      'the API was reached at the root, not under the route',
      await page.evaluate(() =>
        performance.getEntriesByType('resource').some((r) => /\/api\/v1\//.test(r.name)) &&
        !performance.getEntriesByType('resource').some((r) => /\/space\/[^/]+\/[^/]+\/api\//.test(r.name))
      )
    );
  }

  // ── §2 one press, one entry ───────────────────────────────────────────────
  console.log('\n── §2 navigation, Back and Forward ──────────────────────────');
  {
    await ready(flat(routes.browse()));
    await page.waitForFunction('document.querySelectorAll(".dm-row").length > 1', { timeout: 45000 });

    const depth = () => page.evaluate(() => history.length);
    const before = await depth();

    const rows = await page.$$('.dm-row');
    const box = await rows[0].boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await wait(1400);

    const room = { venue: await state('venueId'), room: await state('roomId') };
    check('a press on a result opens that room', (await state('view')) === 'room', await state('view'));
    check('...at its canonical address', (await here()).startsWith(`/space/${room.venue}/${room.room}`), await here());
    check('...and adds exactly one history entry', (await depth()) === before + 1, `${before} → ${await depth()}`);

    await page.goBack();
    await wait(1200);
    check('Back restores the browse surface', (await state('view')) === 'village', await state('view'));
    check('...at its own address', (await here()).startsWith('/browse'), await here());

    await page.goForward();
    await wait(1200);
    check('Forward returns to the room', (await state('view')) === 'room' && (await state('roomId')) === room.room);
    check('...once, without looping', (await depth()) === before + 1, String(await depth()));

    // A second press from there, then two steps back: the ladder holds.
    await page.evaluate(() => document.querySelector('.sheet--room .pill--primary')?.click());
    await wait(1400);
    check('the request composer is its own entry', (await state('view')) === 'apply', await state('view'));
    check('...spelled /apply', (await here()).startsWith(`/apply/${room.venue}/${room.room}`), await here());
    await page.goBack();
    await wait(1200);
    check('Back from the composer is the room again', (await state('view')) === 'room', await state('view'));
  }

  // ── §3 the compatibility entrances ────────────────────────────────────────
  console.log('\n── §3 old links open the same place, once ───────────────────');
  {
    const LEGACY = [
      ['#/browse', '/browse', 'village'],
      ['#/village', '/browse', 'village'],
      [`#/room/${VENUE}/${ROOM}`, `/space/${VENUE}/${ROOM}`, 'room'],
      [`#/venue/${VENUE}`, `/venue/${VENUE}`, 'venue'],
      ['#/journal', '/journal', 'village'], // signed out, the inbox is nobody's
    ];

    for (const [hash, clean, view] of LEGACY) {
      const target = `${flat(routes.title())}${hash}`;
      const before = await page.evaluate(() => history.length);
      await ready(target);
      check(`${hash} opens ${view}`, (await state('view')) === view, await state('view'));
      if (view !== 'village' || hash.includes('browse') || hash.includes('village')) {
        check(`${hash} becomes ${clean}`, (await page.evaluate(() => location.pathname)) === clean, await here());
      }
      check(`${hash} keeps ?world=off`, (await page.evaluate(() => location.search)).includes('world=off'), await here());
      check(`${hash} leaves no fragment behind`, (await page.evaluate(() => location.hash)) === '');
      check(
        `${hash} is a replace, not a second entry`,
        (await page.evaluate(() => history.length)) <= before + 1,
        `${before} → ${await page.evaluate(() => history.length)}`
      );
    }
  }

  // ── §4 a reload on every route family ─────────────────────────────────────
  console.log('\n── §4 reload restores the view it was on ───────────────────');
  {
    const FAMILIES = [
      [routes.browse(), 'village'],
      [routes.venue(VENUE), 'venue'],
      [routes.room(VENUE, ROOM), 'room'],
      [routes.apply(VENUE, ROOM), 'apply'],
      // Signed out, these three are the same product truth they have always
      // been: the correspondence is somebody's, and this browser is nobody, so
      // the route is honoured by landing on the map and correcting the address.
      [routes.journal(), 'village'],
      [routes.desk(), 'village'],
      [routes.letter('app-chess-club'), 'village'],
    ];

    for (const [path, view] of FAMILIES) {
      await ready(flat(path));
      check(`${path} restores ${view}`, (await state('view')) === view, `${await state('view')} @ ${await here()}`);
      check(`${path} never grows a fragment`, (await page.evaluate(() => location.hash)) === '');
    }
  }

  // ── §5 the title page, and the ways in that are not routes ────────────────
  console.log('\n── §5 the root, the flat boot and ?goto= ───────────────────');
  {
    await ready(at(url, routes.title()));
    check('the root opens the title page', (await state('view')) === 'arrival', await state('view'));
    check('...at the root, untouched', (await here()) === `/${new URL(url).search}`, await here());
    check('...with the village behind it', await page.evaluate('__steeple.engine !== null'));

    // The printed control is a real link to a real route, and a press on it is
    // answered without leaving the document once the roll owns the page.
    await page.evaluate(() => document.querySelector('.arrival__cta').click());
    await page.waitForFunction('__steeple.state.roll === 1', { timeout: 30000 });
    await wait(600);
    check('a press on Find a space lands on browse', (await state('view')) === 'village');
    check('...and the address bar says so', (await here()).startsWith('/browse'), await here());
    check('...keeping the query it came with', (await here()).includes(new URL(url).search.slice(1)), await here());

    await ready(flat(routes.title()));
    check('a flat boot opens the product', (await state('view')) === 'village', await state('view'));
    check(
      '...and says where it is, without a second entry to go back through',
      (await here()).startsWith('/browse') && (await here()).includes('world=off'),
      await here()
    );

    // `?goto=` is untouched by the route change and stays that way: the
    // parameter is claimed and taken off the address bar at once, the page is
    // rolled down to the product, and a link nobody is signed in to follow is
    // *held* behind the sign-in panel rather than spent (ui/deepLink.js). What
    // the clean routes add is only that the address it corrects to is the real
    // route, not `/` — and that a listing link no longer needs `?goto=` at all
    // to land, which §1 is the proof of.
    const goto = new URL(flat(routes.title()));
    goto.searchParams.set('goto', '/space/' + VENUE + '/' + ROOM);
    await ready(goto.href);
    check('the parameter is spent at once', !(await here()).includes('goto='), await here());
    check('...the page is already at the product', (await state('roll')) === 1);
    check(
      '...and a link nobody can follow yet asks for a way in',
      await page.evaluate('!!document.querySelector(".signin__layer.is-open")')
    );
  }

  check('no page error along the way', problems.length === 0, problems.join(' · '));
  console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} FAILING`}\n`);
} finally {
  await closeBrowsers();
}

process.exit(failures === 0 ? 0 : 1);
