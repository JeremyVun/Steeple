#!/usr/bin/env node
// THE VILLAGE ANSWERS WHAT STEEPLE SAID.
//
//   node tools/wave2-test.mjs [baseUrl] [--shots <prefix>]
//     baseUrl  default http://localhost:5315   (world ON — the village is the subject)
//
// Re-baselined 2026-08-06 for v2_migration Phase 3.6 item 2. This suite used to
// tell the whole wave-2 story out of the demo store — send as a seeded persona,
// find the request on a desk that opened for anybody, ask, counter-offer,
// accept, reset. Every part of that except one now belongs to
// `correspondence-test.mjs`, where it is real wire traffic between two people,
// and none of it was true any more: since D4 a desk exists only for the venues
// `GET /manage/venues` names, and `store.js` is a mirror of steeple's answers
// rather than a status machine of its own.
//
// The one part that is nobody else's is why this suite is kept: **the village
// is the only surface that animates a change rather than drawing a state.**
// correspondence-test runs `world=off` and world-test never writes anything, so
// nothing else in the harness can say that a request really posted a letter, or
// that a booking steeple made really put a ribbon on the room. That coupling —
// `flows/world/index.js` listening on `store:change` — is what is checked here,
// and it is driven the only way it can be: a real person, real mouse and
// keyboard, a real room, and steeple's own answer.
//
// The room is a **seeded** one on purpose. The dev geocoder puts every address a
// host types on the village centre and the village builds its churches from the
// bundled scenery, so a venue minted by a harness has no building to light —
// only the five the village stages do. Seed slugs match the bundled ids 1:1.
//
// Needs: the API (STEEPLE_API, default http://localhost:5200/api/v1) with
// Auth:DevLoginEnabled and payments.enabled, and this app on the given origin
// with its proxy pointed at that same API. No psql: nothing here is minted or
// moderated, and nothing in the shared database is changed but one new
// application under this run's own account.
//
// Known: the seeded venues are **instant** (the product default), so the letter
// flies and the booking lands in one answer. `mirrorApplication` reports that
// single event as `filed`, and the world posts the letter — a door sealing is a
// second event that only a manual venue can produce, and no seeded venue is one.
// That beat lives in correspondence-test, off-world, where a manual venue exists.

import {
  agreeCurrent,
  apiIsUp,
  at,
  call,
  closeBrowsers,
  goRoute,
  launch,
  mintGuest,
  routes,
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

const base = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://localhost:5315';
const shotPrefix = process.argv.includes('--shots')
  ? process.argv[process.argv.indexOf('--shots') + 1]
  : null;

const VENUE = 'merrifield-fellowship'; // one of the five the village builds
const ROOM = 'main-hall';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let checks = 0;
let failures = 0;
function check(label, ok, detail = '') {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
}

if (!(await apiIsUp())) {
  console.log('\nThe steeple API is not answering — this suite needs it: the letter is a real one.');
  process.exit(2);
}

// The room has to be one steeple really publishes, or the composer has no open
// hours to paint and the whole story is scenery.
const listing = await call('GET', `/listings/by-slug/${VENUE}/${ROOM}`);
check(`fixture: ${VENUE}/${ROOM} is published and readable`, listing.status === 200, `status ${listing.status}`);
if (listing.status !== 200) {
  console.log('\nThe seeded catalog is not there — reseed before running this.');
  process.exit(2);
}

{
  const style = 'Atlas';
  console.log(`\n──── the village answers · ${style} · ${base} ────`);

  // A person with a card already on file. The 402 gate is real and is
  // correspondence-test's subject; here it would only be a detour between the
  // send and the village's answer to it.
  const guest = await mintGuest({
    email: `village-${style}-${stamp}@example.org`,
    name: 'Maria Alvarez',
  });
  // The animated correspondence beat is the subject here. Answer the current
  // agreements on the wire so their first-sign-in gate cannot stand over the
  // room CTA and turn this into an agreement-dismissal test.
  await agreeCurrent(guest.token);

  const browser = await launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const problems = [];
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (text.includes('GL Driver Message') || text.includes('GPU stall')) return;
    // A shared dev DB can reference media stored in another worktree; tiles
    // come from the open internet.
    if (/Failed to load resource|net::ERR_/.test(text)) return;
    problems.push(`[console.error] ${text}`);
  });

  const state = (key) => page.evaluate(`__steeple.state.${key}`);
  const store = (expression) => page.evaluate(`__steeple.store.${expression}`);
  const world = (expression) => page.evaluate(`__steeple.world.correspondence.debug.${expression}`);
  const text = (selector) =>
    page.evaluate((s) => document.querySelector(s)?.textContent?.trim() ?? null, selector);

  async function shot(name) {
    if (!shotPrefix) return;
    await page.screenshot({ path: `/tmp/${shotPrefix}-${style}-${name}.png` });
    console.log(`        (shot /tmp/${shotPrefix}-${style}-${name}.png)`);
  }

  async function ready(target) {
    // A cold *route* is a product-first flat boot (build_plan P3.3): main.js
    // reads the address before anything else and, for somebody who has already
    // chosen a place, never fetches a village behind their back. This suite is
    // the village's own suite — `__steeple.world` is its whole subject — so it
    // arrives the way a visitor with a village does: the title bare first, then
    // the route, travelled with a real history entry and the popstate the
    // browser would have sent. Going away first is deliberate too: otherwise
    // the page keeps the previous section's roll and tab.
    const asked = new URL(target);
    const route = asked.pathname;
    asked.pathname = '/';
    await page.goto('about:blank');
    await page.goto(asked.href, { waitUntil: 'networkidle0' });
    await page.waitForFunction('window.__steepleReady === true', { timeout: 45000 });
    if (route !== '/') {
      await goRoute(page, route);
      await page.evaluate('__steeple.roll.set(1)');
      await wait(400);
    }
    await wait(2400);
  }

  /** Real mouse click at the middle of a selector, once it is on screen. */
  async function click(selector, label = selector) {
    const handle = await page.$(selector);
    if (!handle) return check(`click ${label}`, false, 'no such element') ?? false;
    await handle.evaluate((n) => n.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await wait(150);
    const box = await handle.boundingBox();
    if (!box) return check(`click ${label}`, false, 'not laid out') ?? false;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await wait(700);
    return true;
  }

  /** Real mouse click on the first element under `selector` reading `pattern`. */
  async function clickText(selector, pattern, label) {
    for (const handle of await page.$$(selector)) {
      const content = (await handle.evaluate((n) => n.textContent)).trim();
      if (!pattern.test(content)) continue;
      await handle.evaluate((n) => n.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await wait(180);
      const box = await handle.boundingBox();
      if (!box) continue;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await wait(700);
      return true;
    }
    check(`click ${label}`, false, `nothing reads ${pattern}`);
    return false;
  }

  /**
   * Light in this world eases: a lantern warms over a second or two and cools
   * the same way. Poll the world's own value until it says what we are waiting
   * for, or until it has plainly had long enough.
   */
  async function eventually(expression, settled, timeout = 20000) {
    const deadline = Date.now() + timeout;
    let value = await world(expression);
    while (!settled(value) && Date.now() < deadline) {
      await wait(400);
      value = await world(expression);
    }
    return value;
  }

  // ── 1. the church before anything is asked of it ─────────────────────────
  console.log('\n1. a church with nothing waiting on it');
  await ready(at(`${base}/?q=low`, routes.room(VENUE, ROOM)));
  await signInPage(page, guest.email, guest.name);
  await wait(1200);
  await ready(at(`${base}/?q=low`, routes.room(VENUE, ROOM)));
  const quietBefore = await world(`lantern('${VENUE}')`);
  check(
    'the village has a lantern for this church at all',
    quietBefore !== null,
    JSON.stringify(quietBefore)
  );
  check(
    'and it is quiet before this person asks anything of it',
    quietBefore && quietBefore.waiting < 0.05 && quietBefore.settled < 0.05,
    JSON.stringify(quietBefore)
  );
  const ribbonBefore = await world(`ribbonMask('${VENUE}','${ROOM}')`);
  check('the room carries no week ribbon yet', ribbonBefore === 0, `mask ${ribbonBefore}`);

  // ── 2. a request, written and sent with real input ───────────────────────
  console.log('\n2. a request, written by hand and sent for real');
  await clickText('.sheet--room .pill--primary', /(Request this space|Book this space|Book )/, 'the room CTA');
  check('the CTA opens the composer', (await state('view')) === 'apply', await state('view'));
  check('the heading names the room', (await text('.letter__title')) === 'Main Hall', await text('.letter__title'));

  // The composer reads the room off the wire; the week card only draws once it
  // has, so this is a wait on state and never on the clock.
  await page
    .waitForFunction('document.querySelectorAll(".week__cell").length > 0', { timeout: 40000 })
    .catch(() => {});
  check('the week card drew from the room’s real open hours', (await page.$$('.week__cell')).length > 0);

  await page.click('#letter-intent');
  await page.keyboard.type(
    'Little Sparrows would like a weekly morning in the hall: songs, free play and a shared snack, with a parent alongside every child.'
  );
  await clickText('.letter__col--note .choice', /^Community$/, 'the activity');
  await page.click('#letter-size');
  await page.keyboard.type('24');

  const painted = await page.evaluate(() => {
    const cell = [...document.querySelectorAll('.week__cell:not(.is-inert)')][6];
    if (!cell) return null;
    const box = cell.getBoundingClientRect();
    return { day: Number(cell.dataset.day), x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });
  check('there is a free hour on the card to paint', painted !== null, JSON.stringify(painted));
  await page.mouse.click(painted.x, painted.y);
  await wait(700);
  await shot('composer');

  await clickText('.letter__foot .pill--primary', /Send|Book/, 'send the request');
  await page
    .waitForFunction('__steeple.store.guestApplications().length > 0', { timeout: 40000 })
    .catch(() => {});

  // The proof that it was a letter and not a rehearsal: steeple's own record.
  const filed = await call('GET', '/me/applications', { token: guest.token });
  const application = filed.body?.items?.[0] ?? null;
  check('steeple holds the request', filed.body?.totalCount === 1, `${filed.body?.totalCount} on file`);
  check('it went to this room', application?.roomSlug === ROOM && application?.venueSlug === VENUE,
    `${application?.venueSlug}/${application?.roomSlug}`);
  check('it carries what was typed', /Little Sparrows/.test(application?.intentText ?? ''), application?.intentText?.slice(0, 40));
  check('and an instant venue answered it with a booking', application?.status === 'approved' && Boolean(application?.bookingId),
    `${application?.status} ${application?.bookingId ?? ''}`);
  check('and the guest’s own page says booked, not sent', (await store('guestApplications()[0].status')) === 'approved', await store('guestApplications()[0].status'));

  // ── 3. the village carries it, when the visitor goes back to look ────────
  //
  // The engine is fully asleep past the roll — Three.js does no work in-product,
  // which is the whole point of the roll — so the letter is in the air but
  // nothing moves it while the reader is standing on the paper. The village's
  // answer is something you go back up to see, and that is how it is checked:
  // the wordmark, clicked like a human, wakes the world where it left off.
  console.log('\n3. the world flies it to the door, once there is a world running');
  await shot('inflight');
  check('the letter is in the air', (await world('envelopeFlying')) === true, String(await world('envelopeFlying')));
  const wordmark = await page.$('.wordmark');
  const markBox = wordmark && (await wordmark.boundingBox());
  check('the wordmark is there to go back up by', Boolean(markBox));
  if (markBox) await page.mouse.click(markBox.x + markBox.width / 2, markBox.y + markBox.height / 2);
  await page.waitForFunction('__steeple.state.roll < 0.05', { timeout: 40000 }).catch(() => {});
  check('the visitor is back at the village', (await state('roll')) < 0.05, String(await state('roll')));

  const landed = await eventually('envelopeFlying', (v) => v === false, 30000);
  check('and the letter lands', landed === false, String(landed));
  const litAfter = await eventually(
    `lantern('${VENUE}')`,
    (v) => v && (v.waiting > 0.05 || v.settled > 0.05),
    30000
  );
  check(
    'the church is no longer dark',
    litAfter && (litAfter.waiting > 0.05 || litAfter.settled > 0.05),
    `${JSON.stringify(quietBefore)} → ${JSON.stringify(litAfter)}`
  );
  await shot('landed');

  // The world is awake here, so the budget means something. Past the roll it is
  // one draw call, which proves only that the engine really did stop.
  const calls = await page.evaluate('__steeple.engine.renderer.info.render.calls');
  check('draw calls with the village awake stay under budget', calls < 300, `${calls} < 300`);

  // ── 4. and the room's week carries the booking steeple made ──────────────
  console.log('\n4. the room’s week ribbon carries steeple’s own answer');
  const booked = await call('GET', `/bookings/${application?.bookingId}`, { token: guest.token });
  const firstDate = booked.body?.occurrences?.[0]?.localDate ?? null;
  check('steeple materialized the dates', Boolean(firstDate), JSON.stringify(booked.body?.occurrences?.slice(0, 2)));
  const weekday = firstDate ? new Date(`${firstDate}T00:00:00`).getDay() : null;
  const mask = await world(`ribbonMask('${VENUE}','${ROOM}')`);
  check(
    'the ribbon carries the weekday steeple booked',
    weekday !== null && (mask & (1 << weekday)) !== 0,
    `mask ${mask} for weekday ${weekday} (${firstDate})`
  );
  check(
    'and the local mirror agrees with steeple about it',
    (await store(`guestApplications()[0].status`)) === 'approved',
    await store('guestApplications()[0].status')
  );

  // ── 5. and no desk is conjured for somebody who keeps nothing (D4) ───────
  console.log('\n5. a guest is not a host');
  await ready(at(`${base}/?q=low`, routes.browse()));
  await click('.porchswitch', 'the porch switch');
  await wait(1600);
  check('no desk opens for a person who manages no venue',
    await page.evaluate('!document.querySelector(".desk.is-open")'));
  check('and no seeded venue chooser is offered', await page.evaluate('!document.querySelector("#desk-venue")'));
  await shot('no-desk');

  check('zero console errors', problems.length === 0, [...new Set(problems)].slice(0, 3).join(' | '));

  await page.close();
  await closeBrowsers();
}

console.log(`\n${failures ? `${failures} FAILURE(S)` : 'all clear'}: ${checks - failures}/${checks} checks passed\n`);
process.exit(failures ? 1 : 0);
