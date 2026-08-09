// CORRESPONDENCE ON THE WIRE, DRIVEN FOR REAL (v2 migration Phase 2 / D4, D5).
//
//   node tools/correspondence-test.mjs "http://localhost:5273/?q=low&world=off"
//
// Two browsers, two people, two loops, and the database is the referee:
//
//   (a) manual venue — the guest applies (402 → the mock card step → sent), the
//       host's desk finds it by server truth, asks a question, the guest answers,
//       the host counter-offers, the guest accepts, and both sides see a booking.
//       a full reload drops the memory mirror mid-flow and server facts return,
//       because nothing authoritative was ever only here.
//   (b) instant venue — the guest applies and is booked on the spot.
//
// §0 is the owner's own repro, kept as a named check: signed out, "I have space
// to share" must never open a desk — no seeded venue, no chooser, no verified
// chip, no demo requests. A stranger must not be shown a business.
//
// Plus the two things that are only true if the wire is really the record:
//   · the guest's inbox is `GET /me/applications` and nobody else's;
//   · a decision email lands in the dev mailbox with a CTA that opens the letter.
//
// And §7, the honest-offline path (D5): the wire is cut under a finished
// request, and nothing may be filed, nothing lost, and the retry must carry the
// same idempotency key — a second key is a second booking request for a send
// the guest made once.
//
// §8 and §9 hold the seam to the two things a correct read is also obliged to
// be. §8: opening a desk reads each of its bookings **once** — the applications
// page and the bookings page name the same bookings, and reading both twice was
// fifty-odd serial round trips before a host saw anything. §9: a page of a
// hundred is not a list, and `mirrorApplications({scope})` deletes what a page
// did not carry — so the walk goes to its end, and when the cap cuts it short it
// upserts and deletes nothing. §9 answers for steeple with a fabricated page,
// because the shape of a page is the contract and a thousand real rows are not.
//
// §10 is the ratings loop (docs/backlog/ratings/), which needs a booking that
// has finished — no seed booking qualifies, so it mints its own single evening
// and pushes it into the past in Postgres. What it holds the seam to is the
// double blind: after the organizer has rated, the host's letter must show
// nothing at all, and each side sees the other's only once it has written its
// own. The wire carries no "they have rated" hint, so the assertion is the
// **absence**, never the leak.
//
// Needs: the API (STEEPLE_API, default http://localhost:5200/api/v1) with
// Auth:DevLoginEnabled and payments.enabled, this app on the given origin with
// its proxy pointed at that same API, and `psql` reachable at the dev database.
// psql stands in for two things: the operator's approve on a new host's first
// listing (docs/backlog/v2_migration D2), which has no API of its own, and
// pushing §10's booking into the past, which is the clock and not a feature.
// World-OFF is the documented state — this suite is about paper, not village.
//
// The five-a-minute `apply` rate limit is **shared** by setup, mock-confirm,
// submit, messages, cancel and **a rating** — five writes a minute for the whole
// account, not five of each. Each scenario mints its own account for that
// reason; a section that would spend more than five in a minute must pace
// itself (~65s, the window's own length) rather than blame the app for a 429.

import {
  API,
  MAILBOX,
  agreeCurrent,
  apiIsUp,
  call,
  closeBrowsers,
  launch,
  mintGuest,
  mintVenue,
  nextWeekday,
  signIn,
  signInPage as signInAs,
  sql,
  stamp,
} from './fixtures.mjs';

const url = process.argv[2] ?? 'http://localhost:5273/?q=low&world=off';

let checks = 0;
let failures = 0;
const problems = [];
const wireLog = [];

// A suite that dies mid-loop still knows everything worth knowing; print it
// rather than leaving a stack trace to speak for the whole run.
async function lastWords(error) {
  // Shut the browsers first: whatever else is true, this run is over, and a
  // half-dead suite must not leave a headless Chrome behind for each person.
  await closeBrowsers();
  console.log(`\nthe run stopped: ${error?.message ?? error}`);
  if (wireLog.length) {
    console.log('\nthe last things steeple was asked, in order:');
    for (const line of wireLog.slice(-25)) console.log(`  ${line}`);
  }
  if (problems.length) {
    console.log('\npage problems:');
    for (const line of [...new Set(problems)]) console.log(`  ${line}`);
  }
  console.log(`\n${checks - failures}/${checks} checks passed before it stopped`);
  process.exit(1);
}
process.on('uncaughtException', lastWords);
process.on('unhandledRejection', lastWords);

function check(label, ok, detail = '') {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
}

const eq = (label, actual, wanted) =>
  check(label, actual === wanted, actual === wanted ? '' : `got ${JSON.stringify(actual)}, wanted ${JSON.stringify(wanted)}`);


// ── the browser ──────────────────────────────────────────────────────────────

// One browser per person, not one browser with several tabs. Two same-origin
// pages share a renderer process, so one of them stalling — or simply working
// hard — stalls the other, and a suite that cannot tell those apart is a suite
// that reports the wrong thing. Separate browsers is also what "two browsers"
// means in the acceptance script.
//
// It is a browser per *page*, not merely per person: §10 gives one person two
// browsers because only the page in front of a renderer keeps advancing its CSS
// transitions. A second page of the same browser opens a surface that then sits
// at opacity 0 for as long as anybody is willing to wait, and `steady` reads
// that — correctly — as a surface that never came in.
async function openPage(label) {
  const browser = await launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('pageerror', (e) => problems.push(`[${label}] ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // The wire's own refusals are the subject of this suite; tiles and photos
    // come from the open internet, which a sealed machine has none of.
    if (/Failed to load resource|402|409|ERR_/.test(text)) return;
    problems.push(`[${label}] ${text}`);
  });
  // Every call this page made to steeple, in order. When a surface stalls, the
  // question is always "what did the wire say", and guessing at it is how a
  // whole afternoon goes: 429 and 404 look identical from the outside.
  page.on('response', (response) => {
    const at = response.url();
    if (!at.includes('/api/v1')) return;
    wireLog.push(`[${label}] ${response.status()} ${response.request().method()} ${at.replace(/^https?:\/\/[^/]+/, '')}`);
  });
  return page;
}

const settle = (page) => page.evaluate(() => new Promise((r) => setTimeout(r, 200)));

/**
 * Wait for something to be there **and to have stopped moving**.
 *
 * `checkVisibility()` calls an element at opacity 0 visible, and headless GL
 * runs app-time about six times slow, so a drawer's opening transition takes a
 * second or more: a click sent the moment a selector matches lands on whatever
 * the sliding box has already left behind. This waits on the computed opacity
 * and on the box being in the same place two frames running.
 */
// 30s, not 15: headless GL runs app-time about six times slow already, and a
// machine running two suites at once slows it again. Waiting is on the state —
// the number is only how long the suite is willing to believe the surface is
// still on its way.
async function steady(page, selector, timeout = 30000) {
  await page.waitForSelector(selector, { timeout });
  try {
    await page.waitForFunction(
      (sel) => {
        const node = document.querySelector(sel);
        if (!node) return false;
        // A custom radio is a hidden input inside a visible label — it is the
        // label that has the box a pointer can land on, so it is the label whose
        // position has to have settled. The element's own opacity is deliberately
        // not read: styling one to zero is how these controls are built.
        const box = (node.closest('label') ?? node).getBoundingClientRect();
        if (box.width < 1 || box.height < 1) return false;
        // Its containers, though, are the things that fade and slide in.
        for (let at = node.parentElement; at && at !== document.documentElement; at = at.parentElement) {
          const style = getComputedStyle(at);
          if (style.visibility === 'hidden' || Number(style.opacity) < 0.9) return false;
        }
        // Per-selector, because `steady` is called on one thing at a time but the
        // last thing it looked at must not be what this one is compared against.
        const now = `${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.width)}`;
        window.__steadyBox ??= {};
        const was = window.__steadyBox[sel];
        window.__steadyBox[sel] = now;
        return was === now;
      },
      { timeout, polling: 120 },
      selector
    );
  } catch (error) {
    // A timeout here used to say only "15000ms exceeded", which names neither
    // the selector nor the reason. Say which link of the chain never settled.
    const why = await page
      .evaluate((sel) => {
        const node = document.querySelector(sel);
        if (!node) return 'the selector matches nothing any more';
        const box = (node.closest('label') ?? node).getBoundingClientRect();
        if (box.width < 1 || box.height < 1) return `it has no box (${box.width}x${box.height})`;
        const faded = [];
        for (let at = node.parentElement; at && at !== document.documentElement; at = at.parentElement) {
          const style = getComputedStyle(at);
          if (style.visibility === 'hidden' || Number(style.opacity) < 0.9) {
            faded.push(`${at.tagName.toLowerCase()}.${String(at.className).trim().split(/\s+/)[0]} opacity=${style.opacity} visibility=${style.visibility}`);
          }
        }
        if (faded.length) return `a container never came in: ${faded.join(' / ')}`;
        return `it is still moving (box now ${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.width)})`;
      }, selector)
      .catch(() => 'the page would not answer');
    throw new Error(`${selector} never settled — ${why}`);
  }
}

/**
 * A real click, on a surface that redraws itself.
 *
 * These panels rebuild whenever the wire answers, so a handle taken a moment
 * ago can be detached by the time the pointer would land on it. Re-queried and
 * retried — still a real pointer event, never a synthetic `.click()`.
 */
async function press(page, selector, tries = 6) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      await steady(page, selector);
      await page.click(selector);
      return;
    } catch (error) {
      if (attempt === tries - 1) throw new Error(`could not press ${selector}: ${error.message}`);
      await settle(page);
    }
  }
}

async function write(page, selector, text) {
  await steady(page, selector);
  await page.type(selector, text);
}

async function boot(page, at = url) {
  await page.goto(at, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__steeple, { timeout: 30000 });
  await page.evaluate(() => window.__steeple.bus && null);
}

async function signInPage(page, email, name) {
  await signInAs(page, email, name);
  await settle(page);
}

/** What the app thinks it is showing — the first question to ask of any stall. */
const shape = (page) =>
  page
    .evaluate(() => ({
      view: window.__steeple?.state?.view ?? null,
      mode: window.__steeple?.state?.mode ?? null,
      applicationId: window.__steeple?.state?.applicationId ?? null,
      signedIn: window.__steeple?.session?.isSignedIn?.() ?? null,
      person: window.__steeple?.store?.currentOrganizerId?.() ?? null,
      inbox: (window.__steeple?.store?.guestApplications?.() ?? []).map((a) => `${a.id}:${a.status}`),
      surfaces: [...document.querySelectorAll('[class*="is-open"]')].map((n) => String(n.className)),
    }))
    .catch(() => null);

/**
 * Wait for a condition on the page — state, never wall-clock (headless GL is slow).
 *
 * A bare `waitForFunction` timeout says "30000ms exceeded" and nothing else, which
 * is the least useful sentence a suite can end on. Every wait here says what the
 * app was showing when it gave up.
 */
async function until(page, fn, arg = null, timeout = 30000, what = 'the condition') {
  try {
    await page.waitForFunction(fn, { timeout, polling: 120 }, arg);
  } catch (error) {
    throw new Error(`${what} never came true within ${timeout}ms — page was ${JSON.stringify(await shape(page))}`);
  }
}

// ── the run ──────────────────────────────────────────────────────────────────

const up = await apiIsUp();
if (!up) {
  console.log(`\nThe steeple API is not answering at ${API} — this suite needs it.`);
  process.exit(2);
}

// `mintVenue` throws when steeple refuses; the two things worth naming as checks
// are what it hands back — the mode the venue is really in, and that the public
// can read the room. A fixture nobody can see is not a fixture.
function kept(fixture) {
  if (fixture.bookingModeAsked) {
    eq(`fixture: ${fixture.venueName} is in ${fixture.bookingModeAsked} mode`, fixture.bookingMode, fixture.bookingModeAsked);
  }
  check(`fixture: ${fixture.roomName} is published and readable`, fixture.listingStatus === 200, `status ${fixture.listingStatus}`);
  return fixture;
}

console.log('\nfixtures');
const manual = kept(
  await mintVenue({
    email: `host-manual-${stamp}@example.org`,
    name: 'Ruth Callaghan',
    venueName: `Saint Bride Hall ${stamp}`,
    roomName: 'Long Room',
    bookingMode: 'manual',
  })
);
const instant = kept(
  await mintVenue({
    email: `host-instant-${stamp}@example.org`,
    name: 'Owen Marsh',
    venueName: `Cedar Rooms ${stamp}`,
    roomName: 'Garden Room',
    bookingMode: null,
  })
);

// Every minted account accepts the shipping agreements up front: the P4 ask
// otherwise opens over the page mid-beat, and dismissing it signs the account
// out (hardening-test §4 owns the un-agreed state; this suite is about
// correspondence). Hosts agree here; each guest agrees when its token is minted,
// before its browser signs in.
await agreeCurrent(manual.token);
await agreeCurrent(instant.token);

const guest = { email: `guest-${stamp}@example.org`, name: 'Nadia Prosser' };
const instantGuest = { email: `guest-i-${stamp}@example.org`, name: 'Tom Reddick' };

// ── 1. the guest applies to a manual venue, through the 402 gate ─────────────

// ── 0. a stranger is never shown a business ─────────────────────────────────
//
// The owner's own repro, kept as a check: signed out, "I have space to share"
// used to open the full hosting desk for a seeded church — its venue chooser,
// its "Identity verified (SSO)" chip, three demo requests waiting on you, an
// answered row, and a "List a space" button. A stranger saw a fake business.

console.log('\n0 · signed out, "I have space to share"');
const strangerPage = await openPage('stranger');
await boot(strangerPage);
eq('the visitor is signed out', await strangerPage.evaluate(() => window.__steeple.session.isSignedIn()), false);
await strangerPage.click('.porchswitch');
await settle(strangerPage);
await settle(strangerPage);
const stranger = await strangerPage.evaluate(() => ({
  mode: window.__steeple.state.mode,
  view: window.__steeple.state.view,
  desk: Boolean(document.querySelector('.desk.is-open')),
  chooser: Boolean(document.querySelector('#desk-venue')),
  verified: document.querySelectorAll('.verified').length,
  requests: document.querySelectorAll('.desk .card, .desk .row, .desk .record__row').length,
  listASpace: [...document.querySelectorAll('.desk button')].some((b) => b.textContent.includes('List a space')),
  wayIn: Boolean(document.querySelector('.modal__layer .identity')),
}));
eq('no desk opens', stranger.desk, false);
eq('no seeded venue chooser', stranger.chooser, false);
eq('no "Identity verified (SSO)" chip', stranger.verified, 0);
eq('no seeded requests on a board', stranger.requests, 0);
eq('no "List a space" on a desk that is not theirs', stranger.listASpace, false);
eq('the page stays where the visitor was', stranger.view, 'village');
eq('and hosting is not entered', stranger.mode, 'guest');
eq('what opens is the way in', stranger.wayIn, true);

// Signing in from there carries them on — and a person who keeps no venue is
// taken to the flow that would give them one, not to an empty board.
await signInPage(strangerPage, `newcomer-${stamp}@example.org`, 'Ada Newcomer');
await until(strangerPage, () => Boolean(document.querySelector('.listing')?.classList.contains('is-open')) ||
  Boolean(document.querySelector('.listing__layer')), null, 20000)
  .then(() => check('signing in from there opens the listing flow', true))
  .catch(() => check('signing in from there opens the listing flow', false, 'nothing opened'));
eq(
  'and still no desk',
  await strangerPage.evaluate(() => Boolean(document.querySelector('.desk.is-open'))),
  false
);
await strangerPage.close();

console.log('\n1 · the request, and the card steeple asks for first');
// One token for the whole scenario: every sign-in is a permit spent on a budget
// the browsers need too, and asking three times for the same person's token is
// how a suite talks itself into a 429 it then blames on the app. Minted (and
// agreed) before the browser signs in, so the P4 ask never has a debt to press.
const guestToken = (await signIn(guest.email, guest.name)).accessToken;
await agreeCurrent(guestToken);

const guestPage = await openPage('guest');
await boot(guestPage);
await signInPage(guestPage, guest.email, guest.name);

const mine = await call('GET', '/me/applications', { token: guestToken });
eq('a brand new account has an empty inbox', mine.body?.totalCount, 0);

const before = await call('GET', '/me/payments', { token: guestToken });
eq('and no card on file', before.body?.hasPaymentMethod, false);

// Open the apply sheet on the manual room and fill it in with real events.
await guestPage.evaluate(
  (v, r) => window.__steeple.setView('apply', { venueId: v, roomId: r }),
  manual.venueSlug,
  manual.roomSlug
);
// The composer reads the room off the wire; the week card only draws once it has.
await until(guestPage, () => document.querySelectorAll('.week__cell').length > 0);
check('the week card drew from the room’s real open hours', true);

await write(guestPage, '#letter-intent', 'A weekly community lunch for neighbours who live alone.');
await press(guestPage, '.choices .choice input');
await press(guestPage, '#letter-size');
await write(guestPage, '#letter-size', '24');

// Paint an hour on a day the room is open.
const painted = await guestPage.evaluate(() => {
  const cell = [...document.querySelectorAll('.week__cell:not(.is-inert)')][6];
  if (!cell) return false;
  const box = cell.getBoundingClientRect();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
});
check('there is a free hour to paint', Boolean(painted));
await guestPage.mouse.click(painted.x, painted.y);
await settle(guestPage);

// Signed in already, so the send goes straight — no confirm step in between.
await press(guestPage, '.letter__foot .pill--primary');

// 402: the card step, not a dead end.
await until(guestPage, () => Boolean(document.querySelector('.identity--card:not([hidden])')));
check('a request with no card on file opens the card step', true);
await write(guestPage, '#card-brand', 'Visa');
await write(guestPage, '#card-last4', '4242');
await press(guestPage, '.identity--card .pill--primary');

await until(guestPage, () => window.__steeple.store.guestApplications().length === 1);
const filed = await call('GET', '/me/applications', { token: guestToken });
eq('the request is in steeple’s database', filed.body?.totalCount, 1);
const application = filed.body.items[0];
eq('and it is pending, because this venue answers by hand', application.status, 'pending');
eq('the host can see a card is on file', application.hasPaymentMethod, true);

const held = await call('GET', '/me/payments', { token: guestToken });
eq('the card the step saved is on file', held.body?.method?.last4, '4242');

// The mirror is memory-only. The journal's real read remains authoritative.
await guestPage.evaluate(() => window.__steeple.setView('journal'));
await until(guestPage, () => window.__steeple.store.guestApplications().length === 1);
check('the inbox is present from the wire without browser persistence', true);

// ── 2. the host's desk finds it, by server truth ─────────────────────────────

console.log('\n2 · the desk, scoped to the venues steeple says are theirs');
const hostPage = await openPage('host');
await boot(hostPage);
await signInPage(hostPage, `host-manual-${stamp}@example.org`, 'Ruth Callaghan');
await hostPage.evaluate(() => window.__steeple.setMode('host'));
// The desk is Bookings · Requests · Spaces now, and it opens on Bookings —
// under instant-book-by-default most hosts never answer a request at all
// (build_plan Phase 2.5). This venue is manual, so it has a Requests tab; the
// pile of asks is behind it rather than in front.
await until(hostPage, () => document.querySelectorAll('.desk .tab').length === 3, null, 30000, 'the desk drew its tabs');
const deskTabs = await hostPage.$$eval('.desk .tab', (nodes) => nodes.map((n) => n.dataset.tab));
check(
  'a manual venue’s desk carries Bookings, Requests and Spaces',
  deskTabs.join(',') === 'bookings,letters,spaces',
  JSON.stringify(deskTabs)
);
await press(hostPage, '.desk .tab[data-tab="letters"]');
await until(hostPage, () => document.querySelectorAll('.desk .card, .desk .row').length === 1);
const deskVenue = await hostPage.evaluate(() => window.__steeple.state.venueId);
eq('the desk opened on the venue this person manages', deskVenue, manual.venueSlug);

const options = await hostPage.$$eval('#desk-venue option', (nodes) => nodes.map((n) => n.value));
check('and offers no other venue', options.length === 0, `saw ${JSON.stringify(options)}`);

// ── 3. question → answer → counter-offer → accept ────────────────────────────

console.log('\n3 · the loop');
await press(hostPage, '.desk .card, .desk .row');
await until(hostPage, () => document.querySelector('.letterpage.is-open'));
// Writing back is the thread's own reply box now, not a decision button.
await write(hostPage, '#reply-body', 'How many tables would you like set out?');
await press(hostPage, '[data-action="send-reply"]');
await until(
  hostPage,
  (id) => window.__steeple.store.getApplication(id)?.status === 'needsInfo',
  application.id
);
check('the host’s question moved the request to needsInfo at steeple', true);

const asked = await call('GET', `/applications/${application.id}`, { token: guestToken });
eq('and the thread carries it', asked.body?.messages?.length, 1);

// The guest answers, in their own browser, after a reload that clears nothing.
await guestPage.evaluate((id) => window.__steeple.setView('letter', { applicationId: id }), application.id);
await until(guestPage, () => Boolean(document.querySelector('#letter-reply')), null, 30000, 'the guest’s letter offers a reply box');
await write(guestPage, '#letter-reply', 'Six tables would be plenty, thank you.');
await press(guestPage, '.reply .pill');
await until(
  guestPage,
  (id) => window.__steeple.store.getApplication(id)?.status === 'pending',
  application.id
);
check('the guest’s answer brought it back to the host', true);

const answered = await call('GET', `/applications/${application.id}`, { token: guestToken });
eq('two messages on the thread at steeple', answered.body?.messages?.length, 2);

// The host offers another time.
await hostPage.evaluate(
  (id, v) => window.__steeple.setView('letter', { applicationId: id, venueId: v }),
  application.id,
  manual.venueSlug
);
await until(hostPage, () => Boolean(document.querySelector('[data-action="counter"]')));
await press(hostPage, '[data-action="counter"]');
await until(hostPage, () => Boolean(document.querySelector('#counter-from')));
await press(hostPage, '[data-action="send-counter"]');
await until(
  hostPage,
  (id) => window.__steeple.store.getApplication(id)?.status === 'counterOffered',
  application.id
);
check('the counter-offer is steeple’s, not this browser’s', true);

const countered = await call('GET', `/applications/${application.id}`, { token: guestToken });
eq('and it is open on the wire', countered.body?.counterOffer?.status, 'open');

// A full reload drops the guest's mirror; the cookie restores identity and the
// opened letter is fetched from the wire again.
await guestPage.evaluate(() => localStorage.clear());
await boot(guestPage);
await guestPage.waitForFunction('!!__steeple.session.currentUser()', { timeout: 20000 });
await guestPage.evaluate((id) => window.__steeple.setView('letter', { applicationId: id }), application.id);
await until(guestPage, () => Boolean(document.querySelector('.counter .pill--primary')));
check('a cleared browser re-opens the letter from the wire', true);
await press(guestPage, '.counter .pill--primary');
await until(
  guestPage,
  (id) => window.__steeple.store.getApplication(id)?.status === 'approved',
  application.id
);

const approved = await call('GET', `/applications/${application.id}`, { token: guestToken });
eq('accepting the counter booked it at steeple', approved.body?.status, 'approved');
check('and it names the booking it made', Boolean(approved.body?.bookingId));

const booking = await call('GET', `/bookings/${approved.body.bookingId}`, { token: guestToken });
eq('the booking is confirmed', booking.body?.status, 'confirmed');
check('with occurrences held', (booking.body?.occurrences ?? []).length > 0);
check('and a payment posture the client passes through', Boolean(booking.body?.payment));

const guestSees = await guestPage.evaluate(
  (id) => window.__steeple.store.bookingFor(id)?.status ?? null,
  application.id
);
eq('the guest’s page shows the booking', guestSees, 'confirmed');

await hostPage.evaluate(
  (id, v) => window.__steeple.setView('desk', { venueId: v }) ?? id,
  application.id,
  manual.venueSlug
);
await until(
  hostPage,
  (id) => window.__steeple.store.getApplication(id)?.status === 'approved',
  application.id
);
check('the host’s desk shows it answered', true);

// ── 4. the email steeple sent, and its way back in ───────────────────────────

console.log('\n4 · the notification, and the link in it');
const mail = await fetch(`${MAILBOX}?to=${encodeURIComponent(guest.email)}`)
  .then((r) => r.json())
  .catch(() => null);
const letters = mail?.items ?? mail ?? [];
check('steeple emailed the guest about the loop', letters.length > 0, `${letters.length} messages`);
const cta = JSON.stringify(letters).match(/https?:\/\/[^"\\ ]*\?goto=[^"\\ ]+/);
check('and every email carries a goto CTA', Boolean(cta), cta ? cta[0] : 'none found');

if (cta) {
  const target = new URL(cta[0]);
  const followed = `${new URL(url).origin}${target.pathname}${target.search}`;
  const linkPage = await openPage('link');
  await boot(linkPage, followed);
  await signInPage(linkPage, guest.email, guest.name);
  await until(linkPage, () => window.__steeple.state.view === 'letter' || window.__steeple.state.view === 'journal', null, 20000)
    .then(() => check('following the CTA opens the correspondence', true))
    .catch(() => check('following the CTA opens the correspondence', false, 'stayed in the village'));
  const cleaned = await linkPage.evaluate(() => window.location.search.includes('goto'));
  eq('and the link is spent, not left in the address bar', cleaned, false);
  await linkPage.close();
}

// ── 5. an instant venue books on the spot ────────────────────────────────────

console.log('\n5 · instant book');
const instantToken = (await signIn(instantGuest.email, instantGuest.name)).accessToken;
await agreeCurrent(instantToken);
const setup = await call('POST', '/me/payments/setup', { token: instantToken });
await call('POST', '/me/payments/setup/mock-confirm', {
  token: instantToken,
  body: { clientSecret: setup.body.clientSecret, brand: 'Visa', last4: '1881' },
});

const iPage = await openPage('instant');
await boot(iPage);
await signInPage(iPage, instantGuest.email, instantGuest.name);
await iPage.evaluate(
  (v, r) => window.__steeple.setView('apply', { venueId: v, roomId: r }),
  instant.venueSlug,
  instant.roomSlug
);
await until(iPage, () => document.querySelectorAll('.week__cell').length > 0);
const label = await iPage.$eval('.letter__foot .pill--primary', (n) => n.textContent.trim());
eq('an instant venue’s button says what it does', label, 'Book this space');

await write(iPage, '#letter-intent', 'A one-off rehearsal for our neighbourhood choir.');
await press(iPage, '.choices .choice input');
await press(iPage, '#letter-size');
await write(iPage, '#letter-size', '12');
const spot = await iPage.evaluate(() => {
  const cell = [...document.querySelectorAll('.week__cell:not(.is-inert)')][10];
  const box = cell.getBoundingClientRect();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
});
await iPage.mouse.click(spot.x, spot.y);
await settle(iPage);
await press(iPage, '.letter__foot .pill--primary');
await until(iPage, () => window.__steeple.store.guestApplications().length === 1);

const booked = await call('GET', '/me/applications', { token: instantToken });
eq('an instant venue answers the request with a booking', booked.body?.items?.[0]?.status, 'approved');
check('and names it', Boolean(booked.body?.items?.[0]?.bookingId));
const shown = await iPage.evaluate(() => window.__steeple.store.guestApplications()[0].status);
eq('the guest’s page shows it as booked, not as sent', shown, 'approved');

// ── 6. nobody else's correspondence ──────────────────────────────────────────

console.log('\n6 · an inbox belongs to somebody');
const strangerSees = await iPage.evaluate(
  (id) => window.__steeple.store.guestApplications().some((a) => a.id === id),
  application.id
);
eq('one guest never sees another’s request', strangerSees, false);

const forbidden = await call('GET', `/applications/${application.id}`, { token: instantToken });
eq('and steeple refuses it too', forbidden.status, 404);

// ── 7. the send that could not get through (D5) ──────────────────────────────
//
// The honest-offline path. The wire is cut under a finished request, the send
// is pressed, and the only acceptable outcome is: nothing filed, nothing lost,
// a sentence that says so, and a retry that files exactly one.
//
// The cut is made in the browser, not by stopping the API: an aborted request
// is precisely what an unreachable steeple looks like from inside the page
// (`status === 0`), and it is repeatable on any machine. What it also buys is
// the proof that matters most here — puppeteer sees the headers of the attempt
// that never landed, so the `Idempotency-Key` of the failed send can be
// compared with the one the retry carries. Losing it between the two is the one
// bug this section exists to catch: a second key means a second request filed
// against a venue for a send the guest only ever made once.

console.log('\n7 · the send that could not get through');
const offGuest = { email: `guest-off-${stamp}@example.org`, name: 'Priya Nandal' };
const offToken = (await signIn(offGuest.email, offGuest.name)).accessToken;
await agreeCurrent(offToken);
const offSetup = await call('POST', '/me/payments/setup', { token: offToken });
await call('POST', '/me/payments/setup/mock-confirm', {
  token: offToken,
  body: { clientSecret: offSetup.body.clientSecret, brand: 'Visa', last4: '3009' },
});

const offPage = await openPage('offline');

// Every key the page offers steeple for this request, in order.
const keysOffered = [];
// How the wire is cut. Both cuts are driven, because they are not the same
// thing from inside the page and only one of them is the common case: a dead
// fetch is `status === 0`, but this app always sits behind a proxy, and a proxy
// with nothing to talk to answers **502**. Reading only `status === 0` as
// "never arrived" meant an API being restarted — the one outage a person
// actually meets — got the vaguest sentence in the vocabulary and no promise
// that nothing had been sent.
let cut = false;
await offPage.setRequestInterception(true);
offPage.on('request', (request) => {
  const isSubmit = /\/api\/v1\/listings\/[^/]+\/applications$/.test(request.url()) && request.method() === 'POST';
  if (isSubmit) keysOffered.push(request.headers()['idempotency-key'] ?? null);
  if (cut && request.url().includes('/api/v1')) {
    if (cut === 'proxy') {
      request.respond({ status: 502, contentType: 'text/html', body: '<html>502 Bad Gateway</html>' }).catch(() => {});
    } else {
      request.abort('failed').catch(() => {});
    }
    return;
  }
  request.continue().catch(() => {});
});

await boot(offPage);
await signInPage(offPage, offGuest.email, offGuest.name);
await offPage.evaluate(
  (v, r) => window.__steeple.setView('apply', { venueId: v, roomId: r }),
  manual.venueSlug,
  manual.roomSlug
);
await until(offPage, () => document.querySelectorAll('.week__cell').length > 0, null, 30000, 'the week card drew');

const intentWritten = 'A monthly repair café — bring a broken thing and we will look at it together.';
await write(offPage, '#letter-intent', intentWritten);
await press(offPage, '.choices .choice input');
await press(offPage, '#letter-size');
await write(offPage, '#letter-size', '18');
const offSpot = await offPage.evaluate(() => {
  const cell = [...document.querySelectorAll('.week__cell:not(.is-inert)')][8];
  const box = cell.getBoundingClientRect();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
});
await offPage.mouse.click(offSpot.x, offSpot.y);
await settle(offPage);

// Cut the wire — nothing answers at all — then send.
cut = 'dead';
await press(offPage, '.letter__foot .pill--primary');

await until(
  offPage,
  () => /could not be reached/i.test(document.querySelector('.letter__foot')?.textContent ?? ''),
  null,
  30000,
  'the send says steeple could not be reached'
);
const saidOffline = await offPage.$eval('.letter__foot', (n) => n.textContent.trim());
check('an unreachable steeple is said plainly, where the send is', /nothing was sent/i.test(saidOffline), saidOffline);

const nothingFiled = await call('GET', '/me/applications', { token: offToken });
eq('and nothing was filed', nothingFiled.body?.totalCount, 0);

const draftKept = await offPage.evaluate(() => ({
  intent: document.querySelector('#letter-intent')?.value ?? null,
  sheet: Boolean(document.querySelector('.letter__sheet')),
  sendable: !document.querySelector('.letter__foot .pill--primary')?.disabled,
}));
eq('the written request is still on the page, word for word', draftKept.intent, intentWritten);
eq('the sheet did not go anywhere', draftKept.sheet, true);
eq('and the send is pressable again — a retry, not a dead end', draftKept.sendable, true);

// Now the outage a person actually meets: the API is restarting, so the proxy
// in front of it answers 502 and the page never sees a network error at all.
cut = 'proxy';
await offPage.evaluate(() => {
  const foot = document.querySelector('.letter__foot');
  if (foot) foot.dataset.wasSaid = foot.textContent;
});
await press(offPage, '.letter__foot .pill--primary');
await until(
  offPage,
  () => /nothing was sent/i.test(document.querySelector('.letter__foot')?.textContent ?? ''),
  null,
  30000,
  'a 502 from the proxy is said as plainly as a dead wire'
);
check('an API behind a proxy that cannot answer says the same plain thing', true);

const stillNothing = await call('GET', '/me/applications', { token: offToken });
eq('and a 502 filed nothing either', stillNothing.body?.totalCount, 0);

// Mend the wire and press send again.
cut = false;
await press(offPage, '.letter__foot .pill--primary');
await until(
  offPage,
  () => window.__steeple.store.guestApplications().length === 1,
  null,
  30000,
  'the retry filed the request'
);

const afterRetry = await call('GET', '/me/applications', { token: offToken });
eq('the retry filed the request', afterRetry.body?.totalCount, 1);
check('exactly one request exists for a send made once', afterRetry.body?.items?.length === 1);
check('the failed send did carry a key', Boolean(keysOffered[0]), `offered ${JSON.stringify(keysOffered)}`);
check(
  'and every attempt carried the same one — the key survived both failures',
  keysOffered.length === 3 && new Set(keysOffered).size === 1,
  `offered ${JSON.stringify(keysOffered)}`
);

// ── 8. one desk opening, one read of each booking ────────────────────────────
//
// A desk opens by reading two lists that overlap: the applications page names
// the bookings its approvals made, and the bookings page names those same
// bookings. Read one at a time, each of them twice, that was fifty-odd round
// trips before a host saw anything. The rule this section holds the seam to is
// simply: within one opening, no booking's detail is asked for twice.
//
// The instant venue is the fixture because an instant request *is* a booking:
// two of them give the desk two applications and two bookings, so a double read
// is four requests and an honest one is two.

console.log('\n8 · one desk opening, one read of each booking');

const second = await call('POST', `/listings/${instant.roomId}/applications`, {
  token: instantToken,
  key: `second-${stamp}`,
  body: {
    activityType: 'community',
    groupSize: 8,
    schedule: {
      frequency: 'oneOff',
      startDate: nextWeekday(3, 21),
      endDate: null,
      daysOfWeek: null,
      startTime: '13:00',
      endTime: '14:00',
    },
    intentText: 'A second rehearsal, so the desk has more than one booking to open on.',
    turnstileToken: null,
  },
});
check(
  'fixture: the instant room takes a second booking',
  second.status === 200 || second.status === 201,
  `status ${second.status} ${JSON.stringify(second.body)}`
);

const deskPage = await openPage('desk');
// Every booking detail this desk asks steeple for, in order. The detail read is
// `GET /bookings/{id}` and nothing else on that path is one.
const bookingReads = [];
deskPage.on('response', (response) => {
  const path = new URL(response.url()).pathname;
  if (response.request().method() === 'GET' && /^\/api\/v1\/bookings\/[^/]+$/.test(path)) {
    bookingReads.push(path);
  }
});

await boot(deskPage);
await signInPage(deskPage, `host-instant-${stamp}@example.org`, 'Owen Marsh');
await deskPage.evaluate(() => window.__steeple.setMode('host'));
await until(
  deskPage,
  (slug) => {
    const held = window.__steeple.store.venueBookings(slug);
    return held.length >= 2 && held.every((b) => window.__steeple.store.occurrencesFor(b.id).length > 0);
  },
  instant.venueSlug,
  40000,
  'the desk read both of its bookings in full'
);
// Anything still in flight has a moment to land before the count is read.
await settle(deskPage);
await settle(deskPage);

check(
  'the desk read every booking it shows, in full',
  new Set(bookingReads).size === 2,
  `read ${JSON.stringify(bookingReads)}`
);
check(
  'and asked for none of them twice',
  bookingReads.length === new Set(bookingReads).size,
  `${bookingReads.length} requests for ${new Set(bookingReads).size} bookings`
);

// ── 9. a page is not a list ──────────────────────────────────────────────────
//
// `mirrorApplications({scope})` deletes every held row the answer did not carry
// — that is what makes an inbox drop a request withdrawn on another device. It
// is also why reading one page of a hundred and calling it the list was a quiet
// way to erase somebody's hundred-and-first request. The walk goes to the end;
// when it cannot, it upserts and deletes nothing.
//
// Steeple is answered for here rather than filled with a thousand rows: the
// shape of a page is the contract, and the fabricated one is a real page of the
// guest's own application, cloned, with a count that says there are far more
// pages than the walk will ever ask for.

console.log('\n9 · a page is not a list');

const real = (await call('GET', '/me/applications', { token: guestToken })).body?.items?.[0];
check('fixture: the guest still has their one real request', Boolean(real), JSON.stringify(real ?? null));

// A hundred rows that are not the real one, all naming the same booking — so
// this is a count of the walk's booking reads as well as of its deletions.
const crowd = Array.from({ length: 100 }, (_, at) => ({
  ...real,
  id: `00000000-0000-4000-8000-${String(at).padStart(12, '0')}`,
}));

let inboxAnswer = { items: crowd, totalCount: 2500, page: 1, pageSize: 100 };
const guestBookingReads = [];
guestPage.on('response', (response) => {
  const path = new URL(response.url()).pathname;
  if (response.request().method() === 'GET' && /^\/api\/v1\/bookings\/[^/]+$/.test(path)) {
    guestBookingReads.push(path);
  }
});
await guestPage.setRequestInterception(true);
guestPage.on('request', (request) => {
  if (/\/api\/v1\/me\/applications(\?|$)/.test(request.url()) && request.method() === 'GET') {
    request
      .respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(inboxAnswer),
      })
      .catch(() => {});
    return;
  }
  request.continue().catch(() => {});
});

// 2500 rows is 25 pages and the walk stops at 10, so this list never ended —
// and a list that never ended has no standing to say what does not exist.
await guestPage.evaluate(() => window.__steeple.setView('village'));
await guestPage.evaluate(() => window.__steeple.setView('journal'));
await until(
  guestPage,
  () => window.__steeple.store.guestApplications().length >= 100,
  null,
  40000,
  'the truncated walk mirrored what it did read'
);
// The booking behind those rows is read after they are mirrored; give it its
// moment before counting, or a zero would look like a pass.
for (let at = 0; at < 40 && guestBookingReads.length === 0; at += 1) await settle(guestPage);
// And then a while longer, so that "one read" is a fact and not a sample taken
// before the ninety-nine others had a chance to arrive.
for (let at = 0; at < 5; at += 1) await settle(guestPage);

const survived = await guestPage.evaluate(
  (id) => window.__steeple.store.guestApplications().some((a) => a.id === id),
  real.id
);
eq('a walk the cap cut short deletes nothing it did not see', survived, true);
check(
  'and a hundred rows naming one booking read it once',
  guestBookingReads.length === 1,
  `${guestBookingReads.length} booking reads: ${JSON.stringify([...new Set(guestBookingReads)])}`
);

// And when the list really does end, the page is authoritative again: steeple
// says this person has nothing, so nothing is what they have.
inboxAnswer = { items: [], totalCount: 0, page: 1, pageSize: 100 };
await guestPage.evaluate(() => window.__steeple.setView('village'));
await guestPage.evaluate(() => window.__steeple.setView('journal'));
await until(
  guestPage,
  () => window.__steeple.store.guestApplications().length === 0,
  null,
  40000,
  'a whole list is still the whole truth'
);
check('a list that really ended still clears what steeple no longer holds', true);

// ── 10. how it went, said twice and shown once ───────────────────────────────
//
// The rating loop, end to end and on both sides of it (docs/backlog/ratings/).
// A booking that has finished asks each party, from the inbox, how it went; the
// letter is where it is written; and steeple holds each answer back until the
// other one is in.
//
// Nothing in the seed can be rated — seed venues are instant-book with
// future-only availability — so the section mints one evening, books it, and
// pushes it into the past in Postgres. The occurrence and the booking's own
// dates both move: the sweep that settles a booking reads the occurrences, and
// the exclusion constraint on the room means the shift has to be to a time
// nothing else holds. Every authed booking read then runs the sweep, so no
// restart is needed to make both sides eligible.
//
// The blind is the point. The wire carries no hint that the other side has
// written anything — their rating is simply withheld — so what is asserted here
// is the **absence** of the organizer's rating from a host who has not rated
// back, and the arrival of both the moment they do.
//
// Rate limit: the rating POST spends the same five-a-minute budget as `apply`.
// This section spends three on the organizer (the request, the rating, the
// duplicate) and one on the venue, so it never has to wait — a section that
// added a fourth to either account would.

console.log('\n10 · how it went, said twice and shown once');

const rateHost = kept(
  await mintVenue({
    email: `host-rate-${stamp}@example.org`,
    name: 'Miriam Oyelaran',
    venueName: `Fold Street Chapel ${stamp}`,
    roomName: 'Upper Room',
    bookingMode: null,
  })
);
await agreeCurrent(rateHost.token);

const rateGuest = await mintGuest({ email: `guest-rate-${stamp}@example.org`, name: 'Callum Devereux' });
await agreeCurrent(rateGuest.token);

const oneEvening = await call('POST', `/listings/${rateHost.roomId}/applications`, {
  token: rateGuest.token,
  key: `rate-${stamp}`,
  body: {
    activityType: 'community',
    groupSize: 10,
    intentText: 'A single evening of carol practice, and then we will know how it went.',
    turnstileToken: null,
    schedule: {
      frequency: 'oneOff',
      startDate: nextWeekday(3, 7),
      endDate: null,
      daysOfWeek: null,
      startTime: '18:00',
      endTime: '20:00',
    },
  },
});
check(
  'fixture: an instant venue books the one evening on the spot',
  oneEvening.status === 200 || oneEvening.status === 201,
  `status ${oneEvening.status} ${JSON.stringify(oneEvening.body)}`
);
const rateApp = oneEvening.body;
check('fixture: and names the booking it made', Boolean(rateApp?.bookingId));

// The clock, which is the one thing the product cannot be asked to fake.
sql(
  `update booking_occurrences set "StartUtc" = now() - interval '3 days', ` +
    `"EndUtc" = now() - interval '3 days' + interval '2 hours', ` +
    `"LocalDate" = (now() - interval '3 days')::date where "BookingId" = '${rateApp.bookingId}';`
);
sql(
  `update bookings set "StartDate" = (now() - interval '3 days')::date, ` +
    `"EndDate" = (now() - interval '3 days')::date where "Id" = '${rateApp.bookingId}';`
);

const swept = await call('GET', `/bookings/${rateApp.bookingId}`, { token: rateGuest.token });
eq('a booking whose only evening has passed sweeps to completed', swept.body?.status, 'completed');
eq('and steeple invites the organizer to rate it', swept.body?.ratings?.canRate, true);
check(
  'with neither side having written anything yet',
  !swept.body?.ratings?.byOrganizer && !swept.body?.ratings?.byVenue,
  JSON.stringify(swept.body?.ratings)
);

// The inbox is where a person learns they have something to do.
const ratePage = await openPage('rate-guest');
await boot(ratePage);
await signInPage(ratePage, rateGuest.email, rateGuest.name);
await ratePage.evaluate(() => window.__steeple.setView('journal'));
await until(
  ratePage,
  (id) => Boolean(document.querySelector(`.jrow[data-id="${id}"][data-nudge="rate"]`)),
  rateApp.id,
  30000,
  'the finished booking carries the nudge to rate'
);
check('the inbox row asks how it went', true);
const guestRow = await ratePage.evaluate(
  (id) => ({
    note: document.querySelector(`.jrow[data-id="${id}"] .jrow__note`)?.textContent ?? null,
    tally: document.querySelector('.journal__tally')?.textContent ?? null,
  }),
  rateApp.id
);
eq('in the row’s own words', guestRow.note, 'Finished — how was the space?');
eq('and the top line counts it, without calling it a request', guestRow.tally, '1 waiting on you');

// The same person's other browser, parked on the same letter with the form
// still open — the only honest way to press send on a rating that has already
// been written, which is what a duplicate is. A browser of its own, because a
// second page of this one would stop advancing its transitions the moment it
// went behind (see `openPage`).
const stalePage = await openPage('rate-guest-stale');
await boot(stalePage);
await signInPage(stalePage, rateGuest.email, rateGuest.name);
await stalePage.evaluate((id) => window.__steeple.setView('letter', { applicationId: id }), rateApp.id);
await until(
  stalePage,
  () => document.querySelector('.rate')?.dataset.state === 'open',
  null,
  30000,
  'the second browser holds the form too'
);
await press(stalePage, '.guest__surface--opened .rate__stars label[for="letter-rate-2"]');

// ── the organizer rates the space ────────────────────────────────────────────

await ratePage.evaluate((id) => window.__steeple.setView('letter', { applicationId: id }), rateApp.id);
await until(
  ratePage,
  () => document.querySelector('.rate')?.dataset.state === 'open',
  null,
  30000,
  'the letter invites a rating'
);
const askedFirst = await ratePage.evaluate(() => ({
  ask: document.querySelector('.rate__ask')?.textContent ?? null,
  facts: document.querySelectorAll('.rate__fact').length,
}));
eq('the letter asks the question in one line', askedFirst.ask, 'How was the space?');
eq('and nothing is shown as already rated', askedFirst.facts, 0);

// The stars are labels over hidden radios, so the label is what a pointer can
// land on — and `.guest__surface--opened` scopes it, because the host letter
// mounts its own inert copy of this block on the same page when it is open.
await press(ratePage, '.guest__surface--opened .rate__stars label[for="letter-rate-4"]');
await write(ratePage, '#letter-rate-note', 'Warm room, easy to find, and the kettle worked.');
await press(ratePage, '.guest__surface--opened [data-action="rate-open"]');
await until(
  ratePage,
  () => Boolean(document.querySelector('.rate__confirm')),
  null,
  30000,
  'the commit says it is final'
);
check('a rating is committed in two steps, because it cannot be undone', true);
await press(ratePage, '.guest__surface--opened [data-action="rate-send"]');
await until(
  ratePage,
  () => document.querySelector('.rate')?.dataset.state === 'mine',
  null,
  30000,
  'the letter became the fact of the rating'
);

const guestSide = await ratePage.evaluate(() => ({
  who: [...document.querySelectorAll('.rate__who')].map((n) => n.textContent),
  glyphs: document.querySelector('.rate__glyphs')?.textContent ?? null,
  comment: document.querySelector('.rate__comment')?.textContent ?? null,
  reveal: document.querySelector('.rate__reveal')?.textContent ?? null,
  form: Boolean(document.querySelector('.rate__stars')),
}));
eq('the organizer’s own rating is now a fact on the letter', guestSide.who.join('|'), 'Your rating');
eq('at the number of stars they chose', guestSide.glyphs, '★★★★☆');
eq('with the words they wrote', guestSide.comment, 'Warm room, easy to find, and the kettle worked.');
eq('and the form is spent', guestSide.form, false);
check(
  'the venue’s half is said to be still coming, not shown',
  /arrives when it's revealed/.test(guestSide.reveal ?? ''),
  guestSide.reveal
);

const guestRead = await call('GET', `/bookings/${rateApp.bookingId}`, { token: rateGuest.token });
eq('steeple holds the organizer’s rating', guestRead.body?.ratings?.byOrganizer?.stars, 4);
eq('and tells the organizer nothing about the venue’s', guestRead.body?.ratings?.byVenue ?? null, null);

// ── the same rating, sent twice ──────────────────────────────────────────────

await press(stalePage, '.guest__surface--opened [data-action="rate-open"]');
await press(stalePage, '.guest__surface--opened [data-action="rate-send"]');
await until(
  stalePage,
  () => Boolean(document.querySelector('.opened__refusal')?.textContent?.trim()),
  null,
  30000,
  'the second send was answered'
);
const refused = await stalePage.$eval('.opened__refusal', (n) => n.textContent.trim());
check('a rating sent twice is refused in steeple’s own words', /already rated/i.test(refused), refused);
check(
  'and never as "not available here yet" — a 409 is not a missing feature',
  !/not available here yet/i.test(refused),
  refused
);
eq('one send, one rating', sql(`select count(*) from ratings where "BookingId" = '${rateApp.bookingId}';`), '1');
await stalePage.browser().close();

// ── the venue is asked the same question, and told nothing ───────────────────

const rateHostPage = await openPage('rate-host');
await boot(rateHostPage);
await signInPage(rateHostPage, rateHost.email, rateHost.name);
await rateHostPage.evaluate(() => window.__steeple.setView('journal'));
await until(
  rateHostPage,
  (id) => Boolean(document.querySelector(`.jrow--hosting[data-id="${id}"][data-nudge="rate"]`)),
  rateApp.id,
  30000,
  'the finished booking returned to the host’s inbox'
);
const hostRow = await rateHostPage.evaluate(
  (id) => ({
    label: document.querySelector(`.jrow--hosting[data-id="${id}"] .jrow__status span:last-child`)?.textContent ?? null,
    note: document.querySelector(`.jrow--hosting[data-id="${id}"] .jrow__note`)?.textContent ?? null,
    tally: document.querySelector('.journal__tally')?.textContent ?? null,
  }),
  rateApp.id
);
eq('a decided request comes back, once, as Finished', hostRow.label, 'Finished');
eq('asking after the group rather than the room', hostRow.note, 'How was the group? You can rate them.');
eq('and it counts on the host’s top line too', hostRow.tally, '1 waiting on you');

await press(rateHostPage, `.jrow--hosting[data-id="${rateApp.id}"]`);
await until(
  rateHostPage,
  () => Boolean(document.querySelector('.letterpage.is-open')),
  null,
  30000,
  'the hosting row opened the host letter'
);
await until(
  rateHostPage,
  () => Boolean(document.querySelector('.letterpage .ratemark')),
  null,
  30000,
  'the host letter carries the rating block'
);
const blind = await rateHostPage.evaluate(() => ({
  state: document.querySelector('.letterpage .ratemark')?.dataset.state ?? null,
  ask: document.querySelector('.letterpage .ratemark__ask')?.textContent ?? null,
  facts: document.querySelectorAll('.letterpage .ratemark__fact').length,
  chips: document.querySelectorAll('.letterpage__chips .ratemark__chip').length,
  said: document.body.textContent.includes('Warm room, easy to find'),
}));
eq('the host is invited to rate the group', blind.state, 'open');
eq('in the letter’s own words', blind.ask, 'How was the group?');
eq('and is shown nothing the organizer wrote — the blind is absolute', blind.facts, 0);
eq('not even the comment, anywhere on the page', blind.said, false);
eq('a group nobody has rated wears no chip — silence, not a zero', blind.chips, 0);

await press(rateHostPage, '.letterpage .ratemark__stars label[for="host-rate-5"]');
await write(rateHostPage, '#host-rate-note', 'They left it cleaner than they found it.');
await press(rateHostPage, '.letterpage [data-action="rate-open"]');
await until(
  rateHostPage,
  () => Boolean(document.querySelector('.letterpage .ratemark__confirm')),
  null,
  30000,
  'the host’s commit says it is final too'
);
await press(rateHostPage, '.letterpage [data-action="rate-send"]');
await until(
  rateHostPage,
  () => document.querySelector('.letterpage .ratemark')?.dataset.state === 'both',
  null,
  30000,
  'rating back revealed the organizer’s'
);
const hostBoth = await rateHostPage.evaluate(() => ({
  who: [...document.querySelectorAll('.letterpage .ratemark__who')].map((n) => n.textContent),
  glyphs: [...document.querySelectorAll('.letterpage .ratemark__glyphs')].map((n) => n.textContent),
  comments: [...document.querySelectorAll('.letterpage .ratemark__comment')].map((n) => n.textContent),
}));
eq('rating back is what reveals — the host now sees both halves', hostBoth.who.length, 2);
eq('their own first', hostBoth.who[0], 'Your rating');
eq('and the organizer’s at the stars it was written at', hostBoth.glyphs[1], '★★★★☆');
check(
  'with the words that came with it',
  hostBoth.comments.includes('Warm room, easy to find, and the kettle worked.'),
  JSON.stringify(hostBoth.comments)
);

// ── and the organizer, next time they look ───────────────────────────────────

await ratePage.evaluate(() => window.__steeple.setView('journal'));
await ratePage.evaluate((id) => window.__steeple.setView('letter', { applicationId: id }), rateApp.id);
await until(
  ratePage,
  () => document.querySelector('.rate')?.dataset.state === 'both',
  null,
  30000,
  'the organizer’s letter revealed the venue’s rating'
);
const guestBoth = await ratePage.evaluate(() => ({
  who: [...document.querySelectorAll('.rate__who')].map((n) => n.textContent),
  glyphs: [...document.querySelectorAll('.rate__glyphs')].map((n) => n.textContent),
  reveal: document.querySelectorAll('.rate__reveal').length,
}));
eq('the reveal reaches both sides', guestBoth.who.length, 2);
eq('and it is the venue’s, at five', guestBoth.glyphs[1], '★★★★★');
eq('nothing is still said to be coming', guestBoth.reveal, 0);

// The database is the referee: two rows, one per direction, written the way
// round the two people meant them. 1 = the organizer was rated (by the venue),
// 2 = the venue was rated (by the organizer) — db/changelog/008-ratings.sql.
const ratingRows = sql(
  `select "RateeType" || ':' || "Stars" from ratings where "BookingId" = '${rateApp.bookingId}' order by "RateeType";`
);
eq('two rows, one per direction, and no more', ratingRows.split('\n').filter(Boolean).length, 2);
eq('written the way round the two people meant them', ratingRows.replace(/\s+/g, ' '), '1:5 2:4');

// ── done ─────────────────────────────────────────────────────────────────────

await closeBrowsers();

if (problems.length) {
  console.log('\npage problems:');
  for (const line of [...new Set(problems)]) console.log(`  ${line}`);
}
console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
