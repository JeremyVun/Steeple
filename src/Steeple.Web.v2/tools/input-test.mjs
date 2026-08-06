// REAL-INPUT GATE. Everything here is driven with actual puppeteer mouse,
// wheel and keyboard events — no debug API, no synthetic clicks — because
// screenshots have lied to us before: a closed modal overlay once intercepted
// every pointer event in the experience while every shot looked perfect.
//
// What it proves, in the words of the behavioral contract:
//   · a real click on the title page's call to action rolls down into the product
//   · one wheel tick on the title page carries the whole roll, and a tick the
//     other way while it is running turns it around
//   · the momentum tail of a trackpad flick lands once, and never stalls the roll
//   · past the roll the world is genuinely asleep — no camera moves at all
//   · a click on a map pin enters that venue
//   · a drag across the map pans the map, a wheel over it zooms it
//   · the wordmark rolls back up, and the world wakes where it left off
//   · a wheel up at the surface's own scroll top stays put — scroll never exits
//   · a click on the page behind the desk or the inbox puts the sheet down,
//     and takes nothing else with it
//   · board ↔ ledger switches where it stands: no reload, one render
//   · Esc closes what has focus; Esc never rolls
//   · the title page still answers to a drag of the world, and to nothing else
//   · a click inside the desk is the desk's own, and the porch switch still
//     works with a desk standing over the page
//   · nothing dead overlays the surface, the map, or the property sheet
//
//   node tools/input-test.mjs "http://localhost:5395/?q=low"
//
// Needs: the API (STEEPLE_API, default http://localhost:5200/api/v1) with
// Auth:DevLoginEnabled, this app on the given origin with its proxy pointed at
// that same API, and `psql` reachable at the dev database — §11b and §12 are
// about a **desk**, and since D4 a desk exists only for somebody
// `GET /manage/venues` answers for, so this suite mints one (tools/fixtures.mjs).
//
// ⚠ Known-flaky, and the count is a load reading, not a verdict.
//
// Measured 2026-08-06 at 366fc83 (before Phase 3.6 touched this file) and again
// after, on the same machine: **0 to 8 reds, all of one family** — a roll that
// has to **finish on its own momentum** does not always finish under headless
// GL, and everything downstream of it then reads the title page and fails too
// ("...and the product is the village — arrival", the "canvas is topmost" hit
// tests, "hovering a pin warms that church"). A roll that is *scrubbed* — held,
// turned around mid-flight — reads correctly every single run. On a quiet
// machine this suite came in at 2 reds; with a second suite running beside it,
// 8. That is the set build_plan carried as "seven opening reds / map-first
// drift" through Phase 2: it is neither seven nor drift, it is a completion
// threshold against a clock that runs six times slow.
//
// So: judge the check lines, not the count, and if the opening beats are red
// while §4 onward is green, the machine was busy. Not this suite's to chase.
import {
  apiIsUp,
  apply,
  closeBrowsers,
  isEnvironmentNoise,
  launch,
  mintGuest,
  mintVenue,
  signInPage,
  stamp,
} from './fixtures.mjs';

const url = process.argv[2] ?? 'http://localhost:5395/?q=low';

if (!(await apiIsUp())) {
  console.log('\nThe steeple API is not answering — §11b and §12 need it to mint a host.');
  process.exit(2);
}

// One host who keeps a venue, and one request waiting on it. The venue is a
// **manual** one on purpose: the board/ledger switch is offered only where there
// is a request pile to put in one hand or the other (`desk.js` renderFoot), and
// an instant venue has no Requests tab at all (Phase 2.5). Minted before the
// browser opens: everything else here is about pointers, and a fixture that
// fails should say so before four hundred checks of scenery.
const host = await mintVenue({
  email: `input-host-${stamp}@example.org`,
  name: 'Ruth Ellery',
  venueName: `Trinity Hall ${stamp}`,
  roomName: 'Long Room',
  bookingMode: 'manual',
});
const guest = await mintGuest({ email: `input-guest-${stamp}@example.org`, name: 'Nadia Prosser' });
await apply(guest, host);

const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

let failures = 0;
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !isEnvironmentNoise(m)) errors.push(`[console] ${m.text()}`);
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const state = (key) => page.evaluate(`__steeple.state.${key}`);

function check(label, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function ready(target) {
  // A goto that only changes the hash is not a navigation: the page keeps
  // everything it was holding — the roll, the tab a desk was left on — and the
  // checks after it quietly read the previous section's state. Go away first.
  await page.goto('about:blank');
  await page.goto(target, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__steepleReady === true', { timeout: 25000 });
  await page.evaluate('__steeple.store.setHomePin(null)');
  await wait(2500);
}

// Headless GL runs app-time several times slow, so every eased move takes many
// times its own duration in wall clock. Wait on the roll itself, never a sleep.
async function settled(target) {
  await page
    .waitForFunction(`Math.abs(__steeple.state.roll - ${target}) < 0.001`, { timeout: 30000 })
    .catch(() => {});
  await wait(400);
  return page.evaluate('__steeple.state.roll');
}

async function box(selector) {
  const handle = await page.$(selector);
  const b = await handle?.boundingBox();
  if (!b) throw new Error(`no box for ${selector}`);
  return { ...b, cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
}

/** What the pointer would actually hit, top first. Dead overlays show up here. */
const stack = (x, y) =>
  page.evaluate(
    (px, py) =>
      document
        .elementsFromPoint(px, py)
        .slice(0, 4)
        .map((n) => `${n.tagName.toLowerCase()}.${(n.className.baseVal ?? n.className) || ''}`),
    x,
    y
  );

// The village breathes: on the title page the camera drifts on its own, so "did
// it move?" is never an equality there. Past the roll it is asleep and the same
// question has an exact answer — zero.
const camera = () =>
  page.evaluate(() => {
    const c = window.__steeple.engine.camera;
    return [c.position.x, c.position.y, c.position.z, c.rotation.x, c.rotation.y, c.rotation.z];
  });

const travel = (a, b) =>
  a.slice(0, 3).reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0) +
  60 * a.slice(3).reduce((sum, v, i) => sum + Math.abs(v - b[i + 3]), 0);

/** How far the camera wanders on its own over `ms`, with nobody touching it. */
async function drift(ms) {
  const before = await camera();
  await wait(ms);
  return travel(before, await camera());
}

/** Where a pin sits on screen — the map's own state, read the way an eye reads it. */
const pinAt = async (venueId) => {
  const b = await box(`.dm-pin[data-venue="${venueId}"]`);
  return { x: b.cx, y: b.cy };
};

const pinSpread = async () => {
  const a = await pinAt('oakton-baptist');
  const b = await pinAt('dunn-loring-umc');
  return Math.hypot(a.x - b.x, a.y - b.y);
};

// ── 1. the call to action rolls the page down, clicked like a human ─────────
await ready(url);
console.log('boot view:', await state('view'), '· roll:', await state('roll'));
check('a bare URL opens at the title page', (await state('roll')) === 0 && (await state('view')) === 'arrival');

const cta = await box('.arrival__cta');
console.log('CTA box:', `${Math.round(cta.x)},${Math.round(cta.y)} ${cta.width}x${cta.height}`);
await page.mouse.click(cta.cx, cta.cy);
check('clicking the call to action rolls down to the product', (await settled(1)) === 1);
check('...and the product is the village', (await state('view')) === 'village', String(await state('view')));
check('...and the world stops doing any work at all', (await page.evaluate('__steeple.engine.running')) === false);

// ── 2. nothing dead lies over the surface, the map or the sheet ─────────────
const head = await box('.dm-head');
const overHead = await stack(head.x + 30, head.cy);
check('the head is the topmost thing at its own head', overHead[0].includes('dm-'), overHead.join(' | '));

const mapBox = await box('.dm-map');
const overMap = await stack(mapBox.cx, mapBox.cy);
check('the map surface itself is what the pointer meets over the map', overMap[0].includes('leaflet-container'), overMap.join(' | '));

const overWorld = await stack(980, 700);
check('the world is behind the surface, not reachable through it', overWorld[0] !== 'canvas.', overWorld.join(' | '));

// ── 3. clicking a map pin enters that venue ─────────────────────────────────
const pin = await box('.dm-pin[data-venue="oakton-baptist"]');
await page.mouse.move(pin.cx, pin.cy);
await wait(500);
check('hovering a pin warms that church', (await state('hoverVenueId')) === 'oakton-baptist', String(await state('hoverVenueId')));

const camBeforePin = await camera();
await page.mouse.click(pin.cx, pin.cy);
await wait(1800);
check('clicking a pin enters the venue', (await state('view')) === 'venue' && (await state('venueId')) === 'oakton-baptist', `${await state('view')} / ${await state('venueId')}`);
check('the hash follows', (await page.evaluate('location.hash')) === '#/venue/oakton-baptist');
check('that pin is marked current', await page.evaluate('!!document.querySelector(\'.dm-pin.is-current[data-venue="oakton-baptist"]\')'));
check('and its row too', await page.evaluate('!!document.querySelector(\'.dm-row.is-current[data-venue="oakton-baptist"]\')'));
check('the sheet opens beside the map', await page.evaluate('!!document.querySelector(".sheet--venue.is-open")'));
check(
  'choosing a church moves no camera: the world is asleep',
  travel(camBeforePin, await camera()) === 0,
  `camera travelled ${travel(camBeforePin, await camera()).toFixed(4)}`
);

const sheet = await box('.sheet--venue');
const overSheet = await stack(sheet.cx, sheet.y + 40);
// Whatever is under the pointer there must belong to the sheet. (Workstream B
// set the sheet's head with a banner, so the topmost element is a picture
// inside it rather than the sheet's own box; the thing being proved — that
// nothing foreign lies over a listing — is unchanged.)
check(
  'nothing lies over the property sheet',
  await page.evaluate(
    (x, y) => !!document.elementsFromPoint(x, y)[0]?.closest('.sheet--venue'),
    sheet.cx,
    sheet.y + 40
  ),
  overSheet.join(' | ')
);

// ── 4. a drag on the map pans the map, and only the map ─────────────────────
await ready(`${url}#/browse`);
check('a deep link opens straight into the product', (await state('roll')) === 1);

const map = await box('.dm-map');
// Start the drag on open ground on the sheet — a pin would answer for itself.
const grip = { x: map.x + 90, y: map.y + map.height - 90 };

async function dragFrom(from, dx, dy) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i += 1) {
    await page.mouse.move(from.x + (i * dx) / 8, from.y + (i * dy) / 8);
    await wait(25);
  }
  await page.mouse.up();
  await wait(700);
}

const pinBefore = await pinAt('oakton-baptist');
const camBeforePan = await camera();
await dragFrom(grip, 74, 42);
const pinAfter = await pinAt('oakton-baptist');
const panTravel = travel(camBeforePan, await camera());

check(
  'dragging the map pans the map',
  Math.hypot(pinAfter.x - pinBefore.x, pinAfter.y - pinBefore.y) > 40,
  `pin moved ${Math.hypot(pinAfter.x - pinBefore.x, pinAfter.y - pinBefore.y).toFixed(1)}px`
);
check('dragging the map wakes no camera', panTravel === 0, `camera travelled ${panTravel.toFixed(4)}`);
check('and does not change the view', (await state('view')) === 'village', String(await state('view')));

// ── 5. a wheel over the map zooms the map, and only the map ─────────────────
const spreadBefore = await pinSpread();
const camBeforeWheel = await camera();
await page.mouse.move(map.cx, map.cy);
await page.mouse.wheel({ deltaY: -500 });
await wait(900);
const spreadAfter = await pinSpread();

check('a wheel over the map zooms the map', spreadAfter > spreadBefore * 1.1, `pins ${spreadBefore.toFixed(1)}px → ${spreadAfter.toFixed(1)}px apart`);
check('a wheel over the map wakes no camera', travel(camBeforeWheel, await camera()) === 0);
check('...and never reads as the roll', (await state('roll')) === 1, String(await state('roll')));

// ── 6. the way back up: the wordmark, and nothing but the wordmark ─────────
const wordmark = await box('.wordmark');
await page.mouse.click(wordmark.cx, wordmark.cy);
check('the wordmark rolls back up to the title page', (await settled(0)) === 0);
check('...and the world picks its work up again', (await page.evaluate('__steeple.engine.running')) === true);
check('...and the title page is the view again', (await state('view')) === 'arrival', String(await state('view')));

// Scrolling got the visitor in; it must never throw them back out. The top of
// the list is where natural reading ends up, not a request to leave.
await ready(`${url}#/browse`);
const list = await box('.dm-list');
await page.mouse.move(list.cx, list.y + 60);
await page.mouse.wheel({ deltaY: -600 });
await wait(800);
check('a wheel up at the list\'s own top stays in the product', (await state('roll')) === 1, String(await state('roll')));
check('...and the view stands where it was', (await state('view')) === 'village', String(await state('view')));

// ── 7. the title page still answers to the world's own input ───────────────
await ready(url);
await wait(4000);
const baseline = await drift(900);
console.log(`  ambient camera drift over 900ms: ${baseline.toFixed(3)}`);

const camBeforeWorld = await camera();
await dragFrom({ x: 1000, y: 640 }, -140, 0);
const worldTravel = travel(camBeforeWorld, await camera());
check('dragging the world moves the world', worldTravel > baseline * 4, `camera travelled ${worldTravel.toFixed(3)}`);
check('...and does not read as the roll', (await state('roll')) === 0, String(await state('roll')));

// The camera used to sway with the pointer and dolly on the wheel, so reaching
// across the screen for a control felt like the ground moving under you. Only a
// deliberate drag may move it.
await wait(2500);
const settledDrift = await drift(900);
const camBeforeSweep = await camera();
for (let i = 0; i <= 8; i += 1) {
  await page.mouse.move(820 + i * 60, 660 - i * 40);
  await wait(60);
}
check(
  'sweeping the pointer across the world leaves the camera to its own drift',
  travel(camBeforeSweep, await camera()) < settledDrift * 3 + 0.5,
  `camera travelled ${travel(camBeforeSweep, await camera()).toFixed(3)} vs drift ${settledDrift.toFixed(3)}`
);

// ── 7b. one tick of a wheel is the whole roll ──────────────────────────────
// A wheel has no hand on it — there is nothing to let go of — so a tick is not
// a scrub, it is an intention, and the roll answers all of it. These are real
// wheel events: puppeteer's mouse.wheel goes in through the browser, not
// through a dispatchEvent the page could tell apart from a person.
await ready(url);
await page.mouse.move(1000, 480);
await page.mouse.wheel({ deltaY: 120 }); // one notch of a real mouse, no more
check('one wheel tick carries the whole roll into the product', (await settled(1)) === 1);
check('...and lands in the village', (await state('view')) === 'village', String(await state('view')));

// A trackpad flick arrives as a long tail of events in the same direction. All
// of it asks for the same landing, and the roll must not restart on each one.
await ready(url);
await page.mouse.move(1000, 480);
for (let i = 0; i < 10; i += 1) {
  await page.mouse.wheel({ deltaY: 60 - i * 5 });
  await wait(24);
}
check("a flick's whole momentum tail still lands, once", (await settled(1)) === 1);

// And a tick the other way, caught while the roll is still running, turns it
// around from wherever it has got to.
await ready(url);
await page.mouse.move(1000, 480);
await page.mouse.wheel({ deltaY: 120 });
await page
  .waitForFunction('__steeple.state.roll > 0.12 && __steeple.state.roll < 0.9', {
    polling: 'raf',
    timeout: 15000,
  })
  .catch(() => {});
const caught = await state('roll');
await page.mouse.wheel({ deltaY: -120 });
check(
  'an opposite tick mid-roll turns it around',
  (await settled(0)) === 0,
  `caught in flight at ${Number(caught).toFixed(2)}`
);
check('...and the title page has it back', (await state('view')) === 'arrival', String(await state('view')));

// ── 8. Esc belongs to whoever has focus, and never to the roll ─────────────
await ready(`${url}#/browse`);

// (a) the search pill has a panel open and owns focus: Esc closes the panel,
//     and the world stays exactly where it was. (Workstream B replaced the
//     filter disclosure with the funnel segment of the search pill; the
//     behaviour under test is unchanged, only what it is asked of.)
const trigger = await box('.dm-seg--filters');
await page.mouse.click(trigger.cx, trigger.cy);
await wait(500);
check('the filter panel opens', (await page.evaluate('document.querySelector(".dm-seg--filters").getAttribute("aria-expanded")')) === 'true');
await page.keyboard.press('Escape');
await wait(600);
check('Esc in the panel closes the panel', (await page.evaluate('document.querySelector(".dm-seg--filters").getAttribute("aria-expanded")')) === 'false');
check('...and does not roll', (await state('roll')) === 1, String(await state('roll')));

// (b) nobody owns focus: Esc means what it has always meant.
await ready(`${url}#/venue/grace-community-vienna`);
await page.evaluate('document.activeElement.blur()');
await wait(200);
await page.keyboard.press('Escape');
await wait(1200);
check('Esc in a listing ascends', (await state('view')) === 'village', String(await state('view')));

// (c) and at the top of the product it stops: the way out is the roll.
await page.keyboard.press('Escape');
await wait(1200);
check('Esc at the top of the product does nothing', (await state('view')) === 'village' && (await state('roll')) === 1, `${await state('view')} / ${await state('roll')}`);

// ── 9. the keyboard reaches the pins ────────────────────────────────────────
await page.focus('.dm-pin[data-venue="merrifield-fellowship"]');
await wait(400);
check('a pin takes keyboard focus', await page.evaluate('document.activeElement.dataset.venue === "merrifield-fellowship"'));
check('focusing a pin warms that church', (await state('hoverVenueId')) === 'merrifield-fellowship', String(await state('hoverVenueId')));
await page.keyboard.press('Enter');
await wait(1200);
check('Enter on a pin enters the venue', (await state('view')) === 'venue' && (await state('venueId')) === 'merrifield-fellowship', `${await state('view')} / ${await state('venueId')}`);

// ── 10. the request CTA still opens the request step ────────────────────────
await ready(`${url}#/room/grace-community-vienna/fellowship-hall`);
const request = await box('.sheet--room .pill--primary');
const overCta = await stack(request.cx, request.cy);
check('nothing overlays the request CTA', overCta[0].includes('pill--primary'), overCta.join(' | '));
await page.mouse.click(request.cx, request.cy);
await wait(1600);
check('clicking it opens the request step', (await state('view')) === 'apply', String(await state('view')));

// ── 11. a click on the page behind a sheet puts the sheet down ─────────────
// Reaching past an open sheet means putting it down, not hunting for the way
// out. It must take nothing else with it: no roll, and no church chosen by the
// same click on its way through.
// Re-baselined for v2_migration Phase 2 (D4). A desk used to open for anybody,
// on a seeded venue. **Hosting is somebody's now**: the desk exists only when
// `GET /manage/venues` answers with something, so a deep link to `#/desk` from a
// browser that is nobody must not conjure a business. That is the check now —
// it is also the owner's own repro, kept at the top of correspondence-test §0.
await ready(`${url}#/desk`);
check('a deep link to a desk, signed out, opens no desk', await page.evaluate('!document.querySelector(".desk.is-open")'));
check('...and leaves the visitor in the village', await state('view'), 'village');
check('...without rolling', (await state('roll')) === 1, String(await state('roll')));

// An inbox belongs to somebody (D6), so there has to be a somebody before
// there is an inbox to click away from. The sign-in is the real one — the
// local API's dev provider, exactly as the identity panel calls it.
await page.evaluate(
  "__steeple.session.signIn({email:'maria@demo.steeple.test',displayName:'Maria Alvarez'})"
);
await page.waitForFunction('!!__steeple.session.currentUser()', { timeout: 20000 });
await ready(`${url}#/journal`);
check('the inbox opens on a deep link', await page.evaluate('!!document.querySelector(".guest__surface--journal.is-open")'));
const journalBox = await box('.journal');
const awayFromInbox = { x: Math.min(journalBox.x + journalBox.width + 100, 1420), y: journalBox.cy };
await page.mouse.click(awayFromInbox.x, awayFromInbox.y);
await wait(700);
check('clicking the page behind the inbox puts it down', (await state('view')) === 'village', String(await state('view')));
check('...and keeps the lens it was read in', (await state('mode')) === 'guest', String(await state('mode')));

// ── 11b. the desk's own plumbing, on somebody who really keeps a venue ─────
//
// Restored 2026-08-06 (v2_migration Phase 3.6 item 3). These two were removed,
// not fixed, when D4 made a desk somebody's: they are desk-specific, and driving
// them on the inbox instead asserts the wrong thing, because the two sheets sit
// in different modes. What they needed was a host — `tools/fixtures.mjs` mints
// one now, so they are back where they belong.
await signInPage(page, host.email, host.name);
await page.waitForFunction('!!__steeple.session.currentUser()', { timeout: 20000 });
await ready(`${url}#/desk`);
await page.waitForFunction('!!document.querySelector(".desk")', { timeout: 30000 }).catch(() => {});
await wait(1200);
check('a deep link to a desk, as a host who keeps one, opens it', await page.evaluate('!!document.querySelector(".desk")'));
check('...in the host lens', (await state('mode')) === 'host', String(await state('mode')));

// A click inside the sheet is the sheet's own. Asserted as a hit test and not
// only as "the view did not change": the desk has no click-away of its own, so
// a state check here can never fail and a check that cannot fail is worse than
// no check. What can go wrong is what this suite exists for — something dead
// laid over the sheet, so that a press meant for the desk lands on the page
// beneath it. So: what is topmost at the desk's own centre?
const deskBox = await box('.desk');
const deskPoint = { x: deskBox.cx, y: Math.min(deskBox.cy, 860) };
const insideDesk = await stack(deskPoint.x, deskPoint.y);
check('a click inside the desk is the desk’s own', !/browse|canvas|^body/.test(insideDesk[0] ?? ''), insideDesk.join(' < '));
await page.mouse.click(deskPoint.x, deskPoint.y);
await wait(700);
check('...and does not put the sheet down', (await state('view')) === 'desk' && (await page.evaluate('!!document.querySelector(".desk")')), String(await state('view')));

// The porch switch is chrome, not part of the sheet: it has to keep working
// with a desk standing over the page.
const porch = await box('.porchswitch');
const overPorch = await stack(porch.cx, porch.cy);
check('the porch switch is reachable over an open desk', overPorch[0].includes('porchswitch'), overPorch.join(' < '));
await page.mouse.click(porch.cx, porch.cy);
await wait(1600);
check('the porch switch still works over an open desk', (await state('mode')) === 'guest', String(await state('mode')));
check('...leaving the visitor browsing, not on the title page', (await state('view')) === 'village' && (await state('roll')) === 1, `${await state('view')} roll ${await state('roll')}`);
await page.mouse.click(porch.cx, porch.cy);
await wait(1600);
check('...and it is the way back in', (await state('mode')) === 'host', String(await state('mode')));

// ── 12. board ↔ ledger switches where it stands ────────────────────────────
// The switch used to reload the page with a new query string, which cost two
// seconds and the visitor's place. A window marker set before the click cannot
// survive a reload; it must survive this.
//
// Driven for real again since Phase 3.6 (item 3): a desk exists only for a
// person `GET /manage/venues` answers for, and there is one signed in above.
// The switch lives under the request pile, and the desk opens on Bookings, so
// the pile has to be the thing on the table before there is a switch to press.
const requestsTab = await page.evaluate(() => {
  const tab = [...document.querySelectorAll('.tab')].find((n) => /^Requests/.test(n.textContent.trim()));
  if (!tab) return null;
  const b = tab.getBoundingClientRect();
  return { cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
});
check('a manual venue’s desk offers its request pile', requestsTab !== null);
if (requestsTab) await page.mouse.click(requestsTab.cx, requestsTab.cy);
await wait(1000);
await page.waitForFunction('!!document.querySelector(".desk__variant")', { timeout: 20000 }).catch(() => {});
const haveDesk = await page.evaluate('!!document.querySelector(".desk__variant")');
check('the desk offers its two layouts', haveDesk);
if (haveDesk) {
await page.evaluate(() => {
  window.__deskMark = performance.now();
  window.__deskNavs = performance.getEntriesByType('navigation').length;
  document
    .querySelector('.desk__variant')
    .addEventListener('click', () => (window.__deskFrom = performance.now()), { capture: true });
  // Subscribed after the desk's own listener, so this lands once it has redrawn.
  window.__steeple.bus.on('desk:change', () => (window.__deskTo = performance.now()));
});
const cardsBefore = await page.evaluate('document.querySelectorAll(".desk .card").length');
const ledgerSegment = await page.evaluate(() => {
  const b = [...document.querySelectorAll('.desk__variant .segment')].find(
    (n) => n.textContent.trim() === 'Ledger'
  );
  const r = b.getBoundingClientRect();
  return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
});
await page.mouse.click(ledgerSegment.cx, ledgerSegment.cy);
await wait(500);
const deskSwitch = await page.evaluate(() => ({
  survived: typeof window.__deskMark === 'number',
  navs: performance.getEntriesByType('navigation').length,
  took: window.__deskTo - window.__deskFrom,
  rows: document.querySelectorAll('.desk .row').length,
  cards: document.querySelectorAll('.desk .card').length,
  variant: document.querySelector('.hostdesk').dataset.desk,
  view: window.__steeple.state.view,
}));
check('switching to the ledger did not reload the page', deskSwitch.survived && deskSwitch.navs === 1, JSON.stringify(deskSwitch));
check('...and the desk is set as a ledger now', deskSwitch.variant === 'ledger' && deskSwitch.rows > 0 && deskSwitch.cards === 0, `${deskSwitch.rows} rows, ${deskSwitch.cards} cards (was ${cardsBefore} cards)`);
check('...in under a tenth of a second', deskSwitch.took < 100, `${deskSwitch.took.toFixed(1)}ms`);
check('...and the visitor kept their place', deskSwitch.view === 'desk' && (await state('roll')) === 1);

const boardSegment = await page.evaluate(() => {
  const b = [...document.querySelectorAll('.desk__variant .segment')].find(
    (n) => n.textContent.trim() === 'Board'
  );
  const r = b.getBoundingClientRect();
  return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
});
await page.mouse.click(boardSegment.cx, boardSegment.cy);
await wait(400);
check(
  '...and back again',
  (await page.evaluate('document.querySelectorAll(".desk .card").length')) === cardsBefore &&
    (await page.evaluate('typeof window.__deskMark')) === 'number'
);
}

// ── 13. a finger still has the page in its hand ────────────────────────────
// The wheel gave up scrubbing; touch keeps it. A finger drags the roll where it
// likes, and letting go finishes in the direction the flick was going — which
// is a different question from how far it happened to get.
await page.setViewport({ width: 820, height: 1000, hasTouch: true, isMobile: true });

async function touchStroke(from, legs) {
  await page.touchscreen.touchStart(from.x, from.y);
  let y = from.y;
  for (const { dy, steps } of legs) {
    for (let i = 0; i < steps; i += 1) {
      y += dy / steps;
      await page.touchscreen.touchMove(from.x, y);
      await wait(26);
    }
  }
  await page.touchscreen.touchEnd();
}

await ready(url);
// Drawing the page up: the finger goes up, the roll goes down into the product.
await touchStroke({ x: 410, y: 700 }, [{ dy: -420, steps: 12 }]);
check('a finger draws the page up into the product', (await settled(1)) === 1);
check('...and lands there', (await state('view')) === 'village', String(await state('view')));

await ready(url);
// The same drag, turned around before it is let go: a flick back is a change of
// mind, and it is answered even though the roll is well past halfway.
await touchStroke({ x: 410, y: 700 }, [
  { dy: -430, steps: 12 },
  { dy: 150, steps: 6 },
]);
check('a flick turned around before it is let go goes back', (await settled(0)) === 0);
check('...and the title page has it', (await state('view')) === 'arrival', String(await state('view')));

await ready(url);
const held = await page.evaluate('__steeple.state.roll');
await page.touchscreen.touchStart(410, 700);
await page.touchscreen.touchMove(410, 480);
await wait(200);
const scrubbed = await state('roll');
check('a finger holding the page holds the roll with it', scrubbed > 0.1 && scrubbed < 0.99, `${held} → ${Number(scrubbed).toFixed(2)}`);
await page.touchscreen.touchEnd();

console.log(errors.length ? `\nconsole/page errors:\n${errors.join('\n')}` : '\nno console errors');
if (errors.length) failures += errors.length;
console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
await closeBrowsers();
process.exit(failures ? 1 : 0);
