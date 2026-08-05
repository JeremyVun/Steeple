// CORRESPONDENCE ON THE WIRE, DRIVEN FOR REAL (v2 migration Phase 2 / D4, D5).
//
//   node tools/correspondence-test.mjs "http://localhost:5273/?q=low&world=off"
//
// Two browsers, two people, two loops, and the database is the referee:
//
//   (a) manual venue — the guest applies (402 → the mock card step → sent), the
//       host's desk finds it by server truth, asks a question, the guest answers,
//       the host counter-offers, the guest accepts, and both sides see a booking.
//       localStorage is cleared on both sides mid-flow and nothing is lost,
//       because nothing was ever only here.
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
// Needs: the API (STEEPLE_API, default http://localhost:5200/api/v1) with
// Auth:DevLoginEnabled and payments.enabled, this app on the given origin with
// its proxy pointed at that same API, and `psql` reachable at the dev database.
// psql stands in for exactly one thing: the operator's approve on a new host's
// first listing (docs/backlog/v2_migration D2), which has no API of its own.
// World-OFF is the documented state — this suite is about paper, not village.
//
// The five-a-minute `apply` rate limit is shared by setup, mock-confirm, submit
// and messages, so each scenario mints its own account.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { writeRoomPhoto } from './host-photo.mjs';

const url = process.argv[2] ?? 'http://localhost:5273/?q=low&world=off';
const API = process.env.STEEPLE_API ?? 'http://localhost:5200/api/v1';
const MAILBOX = `${API.replace(/\/api\/v1$/, '')}/dev/mailbox.json`;
const PSQL = process.env.STEEPLE_PSQL ?? 'psql';
const DB = process.env.STEEPLE_DB ?? 'postgresql://steeple:steeple_dev_pw@localhost:5433/steeple';

const stamp = Date.now().toString(36);
const PHOTO = readFileSync(writeRoomPhoto(`/tmp/steeple-webp2-room-${stamp}.png`));

let checks = 0;
let failures = 0;
const problems = [];
const wireLog = [];

// A suite that dies mid-loop still knows everything worth knowing; print it
// rather than leaving a stack trace to speak for the whole run.
async function lastWords(error) {
  // Shut the browsers first: whatever else is true, this run is over, and a
  // half-dead suite must not leave a headless Chrome behind for each person.
  for (const browser of browsers) await browser.close().catch(() => {});
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

const sql = (statement) =>
  execFileSync(PSQL, [DB, '-tAc', statement], { encoding: 'utf8' }).trim();

// ── the wire, from node ──────────────────────────────────────────────────────

async function call(method, path, { token = null, body = undefined, key = null } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let document = null;
  try {
    document = text ? JSON.parse(text) : null;
  } catch {
    document = null;
  }
  return { status: response.status, body: document };
}

// Signing in is per-IP limited (10/min) and deliberately so — it is the one
// endpoint a stranger can hammer. A suite that mints a fresh person for every
// scenario will exhaust that honestly, so it waits its turn rather than asking
// the API to be more permissive than it should be in production. This is the
// one wall-clock wait in the file: it is the server's clock, not the app's.
const authAt = [];
const AUTH_PER_MINUTE = 10;

async function paceAuth() {
  for (;;) {
    const now = Date.now();
    while (authAt.length && now - authAt[0] > 60_000) authAt.shift();
    if (authAt.length < AUTH_PER_MINUTE) break;
    const waitMs = 60_000 - (now - authAt[0]) + 250;
    console.log(`  ·     waiting ${Math.ceil(waitMs / 1000)}s for the sign-in window to roll`);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  authAt.push(Date.now());
}

async function signIn(email, name) {
  await paceAuth();
  const answer = await call('POST', '/auth/sessions', {
    body: { provider: 'dev', idToken: `${email}|${name}`, device: { platform: 'web' } },
  });
  if (answer.status !== 200 && answer.status !== 201) {
    throw new Error(`sign-in for ${email} answered ${answer.status}`);
  }
  return answer.body;
}

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (date, n) => new Date(date.getTime() + n * 86400000);
/** The next date on weekday `dow` at least `least` days out. */
function nextWeekday(dow, least = 7) {
  let d = addDays(new Date(), least);
  while (d.getDay() !== dow) d = addDays(d, 1);
  return iso(d);
}

const DAY_TOKENS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// ── the fixture: one host, one venue, one published room ─────────────────────

async function mintVenue({ email, name, venueName, roomName, bookingMode }) {
  const host = await signIn(email, name);
  const token = host.accessToken;

  const venue = await call('POST', '/manage/venues', {
    token,
    body: {
      name: venueName,
      description: 'A hall kept for the neighbourhood, with tall windows and a good floor.',
      addressLine: '10 Maple Avenue East',
      suburb: 'Vienna',
      postcode: '22180',
    },
    key: `venue-${stamp}-${venueName}`,
  });
  if (venue.status !== 201 && venue.status !== 200) {
    throw new Error(`venue create answered ${venue.status} ${JSON.stringify(venue.body)}`);
  }

  const room = await call('POST', `/manage/venues/${venue.body.id}/rooms`, {
    token,
    body: {
      name: roomName,
      description: 'A bright room with chairs, tables and a kettle.',
      capacity: 40,
      pricePerHour: 20,
      houseRules: 'Leave it as you found it.',
      activities: ['community'],
      amenities: ['chairs', 'tables'],
      accessibility: ['stepFreeAccess'],
    },
    key: `room-${stamp}-${roomName}`,
  });
  if (room.status !== 201 && room.status !== 200) {
    throw new Error(`room create answered ${room.status} ${JSON.stringify(room.body)}`);
  }

  // The photograph publishing cannot happen without.
  const form = new FormData();
  form.append('file', new Blob([PHOTO], { type: 'image/png' }), 'room.png');
  const photo = await fetch(`${API}/manage/rooms/${room.body.id}/photos`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  if (!photo.ok) throw new Error(`photo upload answered ${photo.status}`);

  // Open every day, so the week card always has somewhere to paint.
  await call('PUT', `/manage/rooms/${room.body.id}/availability`, {
    token,
    body: {
      days: DAY_TOKENS.map((dayOfWeek) => ({
        dayOfWeek,
        windows: [{ startTime: '08:00', endTime: '21:00' }],
      })),
      blackouts: [],
    },
  });

  await call('PATCH', `/manage/rooms/${room.body.id}`, { token, body: { status: 'published' } });

  // The operator's one decision on a new host's first listing. There is no API
  // for it by design (Admin owns it), so the harness does what Admin would.
  sql(
    `update rooms set "Status" = 1, "FirstPublishedAtUtc" = now(), "PublishRequestedAtUtc" = null where "Id" = '${room.body.id}';`
  );
  sql(`update venues set "IsIdentityVerified" = true where "Id" = '${venue.body.id}';`);

  if (bookingMode) {
    const patched = await call('PATCH', `/manage/venues/${venue.body.id}`, {
      token,
      body: { bookingMode },
    });
    eq(`fixture: ${venueName} is in ${bookingMode} mode`, patched.body?.bookingMode, bookingMode);
  }

  const listing = await call('GET', `/listings/by-slug/${venue.body.slug}/${room.body.slug}`);
  check(`fixture: ${roomName} is published and readable`, listing.status === 200, `status ${listing.status}`);

  return {
    token,
    user: host.user,
    venueId: venue.body.id,
    venueSlug: venue.body.slug,
    roomId: room.body.id,
    roomSlug: room.body.slug,
    roomName,
    venueName,
  };
}

// ── the browser ──────────────────────────────────────────────────────────────

// One browser per person, not one browser with several tabs. Two same-origin
// pages share a renderer process, so one of them stalling — or simply working
// hard — stalls the other, and a suite that cannot tell those apart is a suite
// that reports the wrong thing. Separate browsers is also what "two browsers"
// means in the acceptance script.
const browsers = [];

async function openPage(label) {
  const browser = await puppeteer.launch({
    headless: true,
    // Pipe transport, not a websocket: the browser is a child on a pipe, so it dies
    // when this process dies — including SIGKILL and an abort mid-suite. Over the
    // default transport a headless Chrome outlives its dead node parent and is
    // reparented to init, and a few aborted runs leave a machine full of them.
    pipe: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  browsers.push(browser);
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
async function steady(page, selector, timeout = 15000) {
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
  // A browser's sign-in spends the same per-IP budget as a node one.
  await paceAuth();
  await page.evaluate(
    (e, n) => window.__steeple.session.signIn({ email: e, displayName: n }),
    email,
    name
  );
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

const up = await fetch(`${API}/geofence`).then((r) => r.ok).catch(() => false);
if (!up) {
  console.log(`\nThe steeple API is not answering at ${API} — this suite needs it.`);
  process.exit(2);
}

console.log('\nfixtures');
const manual = await mintVenue({
  email: `host-manual-${stamp}@example.org`,
  name: 'Ruth Callaghan',
  venueName: `Saint Bride Hall ${stamp}`,
  roomName: 'Long Room',
  bookingMode: 'manual',
});
const instant = await mintVenue({
  email: `host-instant-${stamp}@example.org`,
  name: 'Owen Marsh',
  venueName: `Cedar Rooms ${stamp}`,
  roomName: 'Garden Room',
  bookingMode: null,
});

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
const guestPage = await openPage('guest');
await boot(guestPage);
await signInPage(guestPage, guest.email, guest.name);

// One token for the whole scenario: every sign-in is a permit spent on a budget
// the browsers need too, and asking three times for the same person's token is
// how a suite talks itself into a 429 it then blames on the app.
const guestToken = (await signIn(guest.email, guest.name)).accessToken;

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

await press(guestPage, '.letter__foot .pill--primary');
await until(guestPage, () => !document.querySelector('.identity').hidden);
await press(guestPage, '.identity .pill--primary');

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

// The mirror is a cache: burn it and the wire puts it back.
await guestPage.evaluate(() => localStorage.removeItem(`steeple-village-store:${window.__steeple.store.currentOrganizerId()}`));
await guestPage.evaluate(() => window.__steeple.setView('journal'));
await until(guestPage, () => window.__steeple.store.guestApplications().length === 1);
check('localStorage cleared mid-flow: the inbox comes back from the wire', true);

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
await press(hostPage, '.letter__actions [data-action="ask"]');
await write(hostPage, '#ask-body', 'How many tables would you like set out?');
await press(hostPage, '[data-action="send-question"]');
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

// The guest clears localStorage again, then accepts.
await guestPage.evaluate(() => localStorage.clear());
await boot(guestPage);
await signInPage(guestPage, guest.email, guest.name);
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
await until(iPage, () => !document.querySelector('.identity').hidden);
await press(iPage, '.identity .pill--primary');
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
await until(offPage, () => !document.querySelector('.identity').hidden, null, 30000, 'the identity step opened');
await press(offPage, '.identity .pill--primary');

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
await until(offPage, () => !document.querySelector('.identity').hidden, null, 30000, 'the identity step reopened');
await press(offPage, '.identity .pill--primary');
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
await until(offPage, () => !document.querySelector('.identity').hidden, null, 30000, 'the identity step reopened');
await press(offPage, '.identity .pill--primary');
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

// ── done ─────────────────────────────────────────────────────────────────────

for (const browser of browsers) await browser.close();

if (problems.length) {
  console.log('\npage problems:');
  for (const line of [...new Set(problems)]) console.log(`  ${line}`);
}
console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);

