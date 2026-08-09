#!/usr/bin/env node
// A LISTING, OPENED (docs/backlog/seo/design.md SEO-D5/D6/D7/D10, build_plan P4).
//
// tools/seo-route-test.mjs proves the layer between a URL and the application:
// what the server says and what the handoff does with it. This suite is the
// other half — what the *product* does once that document has become the app.
//
//   §1  the listing the document brought is used, not asked for again
//   §2  the venue the page is about is under the eye, on both layouts
//   §3  the head keeps up as somebody moves, and never doubles
//   §4  a space that is not there says so, in steeple's own words
//   §5  the shell's own printed head is the route's, and is swept like the rest
//
//   node tools/listing-test.mjs
//   node tools/listing-test.mjs --web http://localhost:5381
//
// FLAGS AND ENVIRONMENT — inverting these produces convincing, meaningless
// failures, so they are written down here rather than guessed at:
//
//   --web <origin>   the dev or preview origin under test. Default
//                    http://localhost:5173. It must be `npm run dev` or
//                    `npm run preview` from THIS working tree (the clean
//                    routes are served by vite.config.js) and its proxy must
//                    point at the same API as STEEPLE_API below
//                    (`STEEPLE_API_ORIGIN=… npm run dev`). ONE API PER RUN:
//                    with two, §1's document and §2's pins are describing
//                    different databases.
//   STEEPLE_API      the API base, default http://localhost:5200/api/v1
//                    (tools/fixtures.mjs). §2 mints two venues through it.
//
// Every page here is opened with `world=off`: the subject is the map, the head
// and the sheets, and headless GL costs minutes to say nothing about them.
//
// WHY §2.2 ARRIVES THROUGH AN OLD `#/room/…` LINK. The defect it guards is a
// pin that does not exist when the route is applied — the map centring on a
// venue whose marker only lands with the first search answer. A cold
// `/space/…` no longer reproduces it *because* §1 works: the document's own
// bootstrap puts that venue on the map before the first pin is drawn. The
// legacy fragment is served the ordinary shell, carries no bootstrap, and is
// therefore the honest reproduction of "the marker was not there yet" — which
// is also every `?goto=` email link and every venue beyond the first page of
// results.
//
// DO NOT RUN A BUILD WHILE THIS SUITE IS RUNNING: a vite dev origin pushes a
// full reload to every connected client when dist*/ is written, mid-assertion.
//
// Seed data: dunn-loring-umc/art-studio and its sibling community-lounge.
// Stub geocoding puts every *minted* venue at the village centre, which is why
// §2.5 asserts which pin is current and on top rather than a guessed pixel.

import {
  at,
  closeBrowsers,
  goRoute,
  launch,
  mintVenue,
  paceAuth,
  routes,
  stamp,
} from './fixtures.mjs';

for (const fatal of ['uncaughtException', 'unhandledRejection']) {
  process.on(fatal, async (error) => {
    await closeBrowsers();
    console.log(`\nthe run stopped: ${error?.message ?? error}`);
    process.exit(1);
  });
}

const flag = (name, fallback) => {
  const at_ = process.argv.indexOf(name);
  return at_ === -1 ? fallback : process.argv[at_ + 1];
};

const WEB = (flag('--web', 'http://localhost:5173') ?? '').replace(/\/$/, '');
const VENUE = 'dunn-loring-umc';
const ROOM = 'art-studio';
const SIBLING = 'community-lounge';

/** How much map stands above a property sheet on a phone (src/ui/rail.js). */
const SHEET_BAND = 172;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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

/** A page opened cold on one clean route, with no village behind it. */
function url(path) {
  const target = new URL(at(WEB, path));
  target.searchParams.set('world', 'off');
  return target.href;
}

/**
 * A page opened and *finished*: the boot is up and the first search has landed.
 *
 * The second half is not politeness. The first live answer is what replaces the
 * seeded roster, re-frames the map around the venues steeple actually has, and
 * therefore what settles where the pin ends up — reading the map before it has
 * arrived is reading a page that is still opening, and it produces stable,
 * convincing, meaningless coordinates (it did, before this line existed).
 */
async function open(page, href) {
  await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction('window.__steepleReady === true', { timeout: 60000 });
  await page.waitForFunction(
    () => (document.querySelector('.dm-count')?.textContent ?? '').trim().length > 0,
    { timeout: 45000 }
  );
}

/**
 * Where a venue's pin stands, in the map's own coordinates.
 *
 * Read from the inline transforms Leaflet writes — the marker's own, plus the
 * map pane it sits in — and NOT from `getBoundingClientRect`. `.dm-pin` carries
 * `transition: transform 160ms` (styles/map.css), so every reposition is a
 * slide, and a rect taken mid-slide is a position the map never had. In a
 * browser that is a sixth of a second nobody notices; in headless, where
 * transitions crawl, it parks a correctly-placed pin thousands of pixels off
 * the sheet for seconds and reads perfectly stable while it does. The
 * transforms are the settled truth (`iconAnchor` is [15, 38] — the teardrop's
 * tip is the point that was pinned).
 */
const pin = (page, venueId) =>
  page.evaluate((id) => {
    const node = document.querySelector(`.leaflet-marker-icon[data-venue="${id}"]`);
    const map = document.querySelector('.dm-map');
    const pane = document.querySelector('.leaflet-map-pane');
    if (!node || !map || !pane) return null;
    const shift = (element) => {
      const found = /translate3?d?\((-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(element.style.transform);
      return found ? { x: Number(found[1]), y: Number(found[2]) } : { x: 0, y: 0 };
    };
    const at = shift(node);
    const origin = shift(pane);
    const frame = map.getBoundingClientRect();
    return {
      x: Math.round(origin.x + at.x + 15),
      y: Math.round(origin.y + at.y + 38),
      width: Math.round(frame.width),
      height: Math.round(frame.height),
      current: node.classList.contains('is-current'),
      raised: Number(node.style.zIndex || 0),
      // Leaflet hangs this on the pane for exactly as long as an animated pan is
      // running (`Map.panBy` puts it on, `_onPanTransitionEnd` takes it off), so
      // it is the map's own answer to "am I still moving" — not a guess from
      // two samples, and not the clock.
      panning: pane.classList.contains('leaflet-pan-anim'),
    };
  }, venueId);

/**
 * The pin, once the map has stopped moving. DOM state, never the clock.
 *
 * THREE THINGS MOVE A DEEP-LINKED VENUE, and the gaps between them are the
 * whole difficulty: the roster is framed around every venue there is, the deep
 * link pans that frame onto one of them, and the sheet settles into its band
 * and asks for it again in the strip that is left. Nothing announces the end of
 * that sequence, and between any two of its moves the map holds perfectly still
 * — so a stillness window shorter than a pause latches on the wide shot in the
 * middle of it and reads stable, repeatable and wrong. It did, at 4×250ms, in
 * §2.3 and §2.4 (product verified correct at the time by six cold loads).
 *
 * So a reading has to earn the right to be counted, twice over:
 *
 *   · the map is not mid-pan — `panning` is Leaflet's own flag, above;
 *   · the pin is the current one, which means the camera has been told about
 *     it. `mark` and `centre` are called together at both of atlas.js's call
 *     sites (`setCurrent`, and `setVenues` when the marker lands late), so a
 *     pin wearing `is-current` is a pin a centring has already been asked for.
 *
 * And on top of both, QUIET polls of an unmoving map — two seconds, comfortably
 * past the 0.7s pan and the sheet's own settle behind it. Anything that moves
 * the map, including a pan that has only just started, sends the count back to
 * zero.
 */
const POLL = 200;
const QUIET = 10;

async function settled(page, venueId, { tries = 120 } = {}) {
  let previous = null;
  let same = 0;
  for (let i = 0; i < tries; i += 1) {
    const now = await pin(page, venueId);
    const eligible = !!now && now.current && !now.panning;
    if (eligible && previous && now.x === previous.x && now.y === previous.y) {
      same += 1;
      if (same >= QUIET - 1) return now;
    } else {
      same = 0;
    }
    previous = eligible ? now : null;
    await wait(POLL);
  }
  return previous ?? (await pin(page, venueId));
}

/** Everything the head says about where this page thinks it is. */
const head = (page) =>
  page.evaluate(() => ({
    title: document.title,
    robots: document.querySelector('meta[name="robots"]')?.content ?? null,
    canonical: document.querySelector('link[rel="canonical"]')?.href ?? null,
    canonicals: document.querySelectorAll('link[rel="canonical"]').length,
    description: document.querySelector('meta[name="description"]')?.content ?? null,
    descriptions: document.querySelectorAll('meta[name="description"]').length,
    robotsCount: document.querySelectorAll('meta[name="robots"]').length,
    ogTitle: document.querySelector('meta[property="og:title"]')?.content ?? null,
    ogTitles: document.querySelectorAll('meta[property="og:title"]').length,
    ogUrl: document.querySelector('meta[property="og:url"]')?.content ?? null,
    linkedData: document.head.querySelectorAll('script[type="application/ld+json"]').length,
    owned: document.head.querySelectorAll('[data-steeple-route-meta]').length,
    path: location.pathname,
  }));

const browser = await launch();
const listingPath = `/api/v1/listings/by-slug/${VENUE}/${ROOM}`;

try {
  // ── §1 the listing the document brought ───────────────────────────────────
  console.log('\n── §1 the document primes the catalog ───────────────────────');
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    const asked = [];
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith('/api/v1/')) asked.push(path);
    });
    const broken = [];
    page.on('pageerror', (error) => broken.push(error.message));

    await open(page, url(routes.room(VENUE, ROOM)));
    await settled(page, VENUE);

    check(
      'the room the URL names is open',
      (await page.evaluate('__steeple.state.roomId')) === ROOM
        && (await page.evaluate('!!document.querySelector(".sheet--room.is-open")'))
    );
    check(
      'its listing was never asked for a second time',
      asked.filter((path) => path === listingPath).length === 0,
      asked.filter((path) => path === listingPath).join(' ')
    );
    check(
      'the sheet shows what only the listing carries',
      await page.evaluate(
        () =>
          !!document.querySelector('.sheet--room .prose')?.textContent?.trim()
          && !!document.querySelector('.sheet--room .dm-banner--hero img, .sheet--room .dm-banner--hero [style*="background-image"]')
      )
    );
    check(
      'the boot payload is marked used, and its structured data is left standing',
      await page.evaluate(
        () =>
          document.getElementById('steeple-listing-bootstrap')?.hasAttribute('data-steeple-consumed') === true
          && document.head.querySelectorAll('script[type="application/ld+json"]').length === 1
      )
    );

    // Away and back: the read is held for the session, so a second opening of
    // the same room is not a second question either.
    await goRoute(page, routes.browse());
    await wait(600);
    await goRoute(page, routes.room(VENUE, ROOM));
    await wait(1200);
    check(
      'returning to it asks nothing either',
      asked.filter((path) => path === listingPath).length === 0
    );
    check('nothing threw', broken.length === 0, broken.join(' | '));
    await page.close();
  }

  // ── §2 the venue under the eye ────────────────────────────────────────────
  console.log('\n── §2 the map centres the venue it is about ─────────────────');

  await paceAuth();
  const first = await mintVenue({
    email: `p4a-${stamp}@example.com`,
    name: 'Priya Anand',
    venueName: `Maple Avenue Hall ${stamp}`,
    roomName: 'Long Room',
  });
  await paceAuth();
  const second = await mintVenue({
    email: `p4b-${stamp}@example.com`,
    name: 'Tom Okafor',
    venueName: `Maple Avenue Chapel ${stamp}`,
    roomName: 'Side Chapel',
  });

  {
    // §2.1 · §2.3 the seeded venue, cold, on the desktop layout. The side panel
    // has its own column in the grid, so "not under the panel" is "inside the
    // map element" — and the pin should be near the middle of it.
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await open(page, url(routes.room(VENUE, ROOM)));
    const box = await settled(page, VENUE);

    check('§2.1 the deep-linked venue has a pin, and it is the current one', !!box?.current);
    check(
      '§2.3 …standing inside the map, clear of the side panel',
      !!box && box.x > 0 && box.x < box.width && box.y > 0 && box.y < box.height,
      JSON.stringify(box)
    );
    check(
      '§2.3 …and near the middle of it rather than at an edge',
      !!box
        && Math.abs(box.x - box.width / 2) < box.width / 6
        && Math.abs(box.y - box.height / 2) < box.height / 6,
      JSON.stringify(box)
    );

    // §2.6 a different room of the same venue is not a different place.
    const before = await settled(page, VENUE);
    await goRoute(page, routes.room(VENUE, SIBLING));
    await wait(1500);
    const after = await settled(page, VENUE);
    check(
      '§2.6 changing rooms inside one venue does not move the map',
      before.x === after.x && before.y === after.y,
      `${JSON.stringify(before)} → ${JSON.stringify(after)}`
    );

    // A pan somebody made is theirs: an unrelated redraw must not take it back.
    await page.mouse.move(700, 520);
    await page.mouse.down();
    await page.mouse.move(700, 430, { steps: 8 });
    await page.mouse.move(700, 360, { steps: 8 });
    await page.mouse.up();
    const panned = await settled(page, VENUE);
    check('a deliberate pan moves the map', panned.y !== after.y, `${after.y} → ${panned.y}`);
    await page.evaluate(() => __steeple.bus.emit('store:change', { type: 'reset' }));
    await wait(2000);
    const kept = await settled(page, VENUE);
    check(
      '…and an unrelated redraw leaves it exactly where they left it',
      kept.x === panned.x && kept.y === panned.y,
      `${JSON.stringify(panned)} → ${JSON.stringify(kept)}`
    );
    await page.close();
  }

  {
    // §2.2 a venue with no pin at the moment the route is applied. The legacy
    // fragment is served the ordinary shell, so nothing primes the catalog and
    // the marker arrives only with the first search answer (see the header).
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    const legacy = new URL(at(WEB, '/'));
    legacy.searchParams.set('world', 'off');
    legacy.hash = `#/room/${first.venueSlug}/${first.roomSlug}`;
    await open(page, legacy.href);
    const box = await settled(page, first.venueSlug);

    check(
      '§2.2 a venue whose pin arrives late is still brought forward',
      !!box && box.current && box.x > 0 && box.x < box.width && box.y > 0 && box.y < box.height,
      JSON.stringify(box)
    );
    check(
      '§2.2 …and the old fragment left the clean path behind it',
      (await page.evaluate(() => location.pathname))
        === `/space/${first.venueSlug}/${first.roomSlug}`
    );
    await page.close();
  }

  {
    // §2.5 two venues at one address. Dev geocoding puts every minted venue at
    // the village centre, so their pins stack: the only honest assertion is
    // which one is current and which one is on top, never a pixel.
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await open(page, url(routes.room(second.venueSlug, second.roomSlug)));
    await settled(page, second.venueSlug);

    const chosen = await pin(page, second.venueSlug);
    const other = await pin(page, first.venueSlug);
    check('§2.5 the venue being read about is the current pin', chosen?.current === true);
    check('§2.5 …the one stacked under it is not', other?.current === false);
    check(
      '§2.5 …and the chosen one comes to the top of the stack',
      !!chosen && !!other && chosen.raised > other.raised,
      `${chosen?.raised} vs ${other?.raised}`
    );
    await page.close();
  }

  {
    // §2.4 the narrow layout: a band of map above the sheet is all there is,
    // and the pin has to be in it.
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    await open(page, url(routes.room(VENUE, ROOM)));
    const box = await settled(page, VENUE);
    check(
      '§2.4 on a phone the pin lands in the band above the sheet',
      !!box && box.y > 0 && box.y < SHEET_BAND,
      `${JSON.stringify(box)} band ${SHEET_BAND}`
    );
    await page.close();
  }

  // ── §3 the head keeps up ──────────────────────────────────────────────────
  console.log('\n── §3 the head follows the route ────────────────────────────');
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await open(page, url(routes.room(VENUE, ROOM)));
    await wait(1200);

    const listing = await head(page);
    check(
      'a listing names itself, indexes, and carries one canonical',
      listing.title.startsWith('Art Studio at Dunn Loring United Methodist Church')
        && listing.robots === 'index,follow'
        && listing.canonicals === 1
        && listing.canonical === `${WEB}${routes.room(VENUE, ROOM)}`
        && listing.linkedData === 1,
      JSON.stringify(listing)
    );

    await goRoute(page, routes.apply(VENUE, ROOM));
    await wait(900);
    const composing = await head(page);
    check(
      'asking for it is private: no canonical, no structured data, nofollow',
      composing.robots === 'noindex,nofollow'
        && composing.canonicals === 0
        && composing.linkedData === 0
        && composing.title !== listing.title,
      JSON.stringify(composing)
    );

    await page.evaluate(() => history.back());
    await wait(1400);
    const back = await head(page);
    check(
      'Back restores the listing head exactly',
      back.title === listing.title
        && back.canonical === listing.canonical
        && back.robots === 'index,follow'
        && back.canonicals === 1
        && back.linkedData === 1,
      JSON.stringify(back)
    );

    await goRoute(page, routes.room('oakton-baptist', 'gymnasium'));
    await wait(2500);
    const other = await head(page);
    check(
      'another listing is described as itself, and only once',
      other.title !== listing.title
        && other.canonical === `${WEB}/space/oakton-baptist/gymnasium`
        && other.ogUrl === other.canonical
        && other.canonicals === 1
        && other.linkedData === 1,
      JSON.stringify(other)
    );
    check(
      'the structured data is about the room in front of us',
      await page.evaluate(() => {
        const block = document.head.querySelector('script[type="application/ld+json"]');
        const graph = JSON.parse(block.textContent)['@graph'] ?? [];
        return graph.some((node) => node['@type'] === 'Place' && node.url === location.origin + location.pathname);
      })
    );

    await goRoute(page, routes.browse());
    await wait(900);
    const browse = await head(page);
    check(
      'browse follows but is not indexed, and drops every listing claim',
      browse.robots === 'noindex,follow'
        && browse.canonicals === 0
        && browse.linkedData === 0
        && browse.description === null,
      JSON.stringify(browse)
    );

    // Four navigations later there must still be exactly one of each.
    await goRoute(page, routes.room(VENUE, ROOM));
    await wait(1500);
    const again = await head(page);
    check(
      'nothing accumulated: one canonical, one ld+json, one robots',
      again.canonicals === 1
        && again.linkedData === 1
        && (await page.evaluate(() => document.querySelectorAll('meta[name="robots"]').length)) === 1,
      JSON.stringify(again)
    );
    await page.close();
  }

  // ── §4 a space that is not there ──────────────────────────────────────────
  console.log('\n── §4 the unavailable state ─────────────────────────────────');
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await open(page, url(routes.browse()));
    await wait(1500);

    await goRoute(page, routes.room(VENUE, 'no-such-room'));
    await page.waitForFunction(
      '!!document.querySelector(".sheet--unavailable.is-open")',
      { timeout: 20000 }
    );

    const said = await page.evaluate(() => ({
      heading: document.querySelector('.sheet--unavailable .sheet__title')?.textContent,
      prose: document.querySelector('.sheet--unavailable .prose')?.textContent,
      actions: [...document.querySelectorAll('.sheet--unavailable .sheet__ways button')].map(
        (node) => node.textContent
      ),
      roomSheet: !!document.querySelector('.sheet--room.is-open'),
      map: !!document.querySelector('.leaflet-container'),
    }));
    check(
      'it says the served page’s words, over the map it left standing',
      said.heading === "This space isn't available"
        && said.prose?.startsWith('The link may be out of date')
        && said.actions.join('|') === 'Browse spaces|Steeple home'
        && said.roomSheet === false
        && said.map === true,
      JSON.stringify(said)
    );

    const gone = await head(page);
    check(
      'and the head stops claiming to be a listing',
      gone.title === 'Space unavailable · Steeple'
        && gone.robots === 'noindex'
        && gone.canonicals === 0
        && gone.linkedData === 0,
      JSON.stringify(gone)
    );

    await page.click('.sheet--unavailable .pill--primary');
    await wait(900);
    check(
      'the way on is a way on',
      (await page.evaluate('__steeple.state.view')) === 'village'
        && (await page.evaluate(() => location.pathname)) === '/browse'
    );

    // A room that is merely still being read is not an unavailable one.
    await goRoute(page, routes.room(VENUE, ROOM));
    await wait(300);
    check(
      'a listing still on the wire is never called unavailable',
      await page.evaluate(() => !document.querySelector('.sheet--unavailable.is-open'))
    );
    await page.close();
  }

  // ── §5 the shell's own printed head ───────────────────────────────────────
  //
  // §3 proves the owner replaces its own set. This proves there is only one
  // set to replace. index.html is served whole at `/` and under every legacy
  // `#/…` fragment written against it, and it prints the site's canonical,
  // description, social tags and WebSite block — so unless those nodes carry
  // `data-steeple-route-meta` too, ui/metadata.js writes a second opinion
  // beside them and cannot ever remove the first (SEO-D7):
  //
  //   · a legacy `#/room/…` link ends with two canonicals naming two different
  //     URLs, two descriptions and two ld+json blocks;
  //   · `#/browse` keeps a canonical pointing at `/` while saying `noindex` —
  //     the mixed signal SEO-D7 exists to forbid.
  //
  // These three boots are the only ones where index.html is the served
  // document: every clean route is answered by the API or by a boot document,
  // whose heads the handoff never copies.
  console.log('\n── §5 the shell head is the route’s, and swept ──────────────');
  {
    const shell = (hash = '') => {
      const target = new URL(at(WEB, '/'));
      target.searchParams.set('world', 'off');
      if (hash) target.hash = hash;
      return target.href;
    };

    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });
      await open(page, shell(`#/room/${VENUE}/${ROOM}`));
      await page.waitForFunction('!!document.querySelector(".sheet--room.is-open")', { timeout: 20000 });
      await wait(1200);
      const said = await head(page);
      check(
        'a legacy room link leaves one head, and it is the listing’s',
        said.canonicals === 1
          && said.canonical === `${WEB}/space/${VENUE}/${ROOM}`
          && said.descriptions === 1
          && said.linkedData === 1
          && said.ogTitles === 1
          && said.robotsCount === 1
          && said.title.startsWith('Art Studio at Dunn Loring United Methodist Church'),
        JSON.stringify(said)
      );
      check(
        '…and its description is the room’s, not the site’s',
        said.description?.startsWith('Art Studio at Dunn Loring United Methodist Church') === true,
        said.description ?? 'null'
      );
      await page.close();
    }

    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });
      await open(page, shell('#/browse'));
      await wait(1200);
      const said = await head(page);
      check(
        'a legacy browse link is noindex,follow with no canonical left standing',
        said.canonicals === 0
          && said.robots === 'noindex,follow'
          && said.robotsCount === 1
          && said.linkedData === 0
          && said.description === null,
        JSON.stringify(said)
      );
      await page.close();
    }

    {
      // The root itself — which is the *title page*, and a flat boot does not
      // stop there (`?world=off` opens the product and reads /browse
      // afterwards, main.js bootFlat). So it is reached the way a visitor
      // reaches it: the wordmark, which rolls the page back up.
      //
      // This is where the printed set and the owner's set say the same thing,
      // so it is where a duplicate would be invisible — and the check that
      // proves the marking is a sweep rather than a loss.
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });
      await open(page, shell('#/browse'));
      await page.click('.wordmark');
      await page.waitForFunction("__steeple.state.view === 'arrival'", { timeout: 20000 });
      await wait(1200);
      const said = await head(page);
      check(
        'the title page carries one of each, naming the deployment root',
        said.path === '/'
          && said.canonicals === 1
          && said.canonical === `${WEB}/`
          && said.descriptions === 1
          && said.linkedData === 1
          && said.ogTitles === 1
          && said.robotsCount === 1,
        JSON.stringify(said)
      );
      check(
        '…in the site’s own words, and indexed',
        said.title === 'Steeple — Community space to rent in Northern Virginia'
          && said.description?.startsWith('Steeple — rent affordable halls, studios and gyms') === true
          && said.ogTitle === 'Steeple — community space to rent in Northern Virginia'
          && said.robots === 'index,follow',
        JSON.stringify(said)
      );
      await page.close();
    }
  }
} finally {
  await closeBrowsers();
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) console.log(`failed: ${problems.join(' · ')}`);
process.exit(failures > 0 ? 1 : 0);
