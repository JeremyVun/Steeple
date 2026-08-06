// THE HARNESS FIXTURES — one host who keeps a venue, for any suite that needs one.
//
// Every suite past the browse surface needs the same three sentences said to
// steeple before it can begin: somebody signed in, a venue they manage, a room
// in it that the public can see. Two suites had written that out longhand
// (`correspondence-test.mjs`, `payments-ui-test.mjs`) and the rest went without
// — which is why the desk suites drifted onto the demo store's letters and
// stayed there. It lives here now (v2_migration Phase 3.6 item 1).
//
// What it is not: a reporter. Nothing here calls `check` — it throws when
// steeple refuses, and hands back what steeple answered so the suite can assert
// on it in its own words and keep its own count.
//
// Environment, shared by every suite that imports this:
//   STEEPLE_API   the API's /api/v1 base   (default http://localhost:5200/api/v1)
//   STEEPLE_PSQL  the psql binary          (default `psql`)
//   STEEPLE_DB    the dev database URL     (default the compose dev postgres on 5433)
//
// psql stands in for exactly one thing that has no API by design: the operator's
// decision on a newly claimed venue's first listing (Admin owns it —
// docs/backlog/v2_migration D2). `mintVenue` does what Admin would.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { writeRoomPhoto } from './host-photo.mjs';

export const API = process.env.STEEPLE_API ?? 'http://localhost:5200/api/v1';
export const ORIGIN = API.replace(/\/api\/v1$/, '');
export const MAILBOX = `${ORIGIN}/dev/mailbox.json`;
export const PSQL = process.env.STEEPLE_PSQL ?? 'psql';
export const DB = process.env.STEEPLE_DB ?? 'postgresql://steeple:steeple_dev_pw@localhost:5433/steeple';

/** One token per node process, so two suites running at once never collide on a slug. */
export const stamp = Date.now().toString(36);

export const DAY_TOKENS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export const sql = (statement) =>
  execFileSync(PSQL, [DB, '-tAc', statement], { encoding: 'utf8' }).trim();

/** Is the API answering at all? Every suite that needs it should say so and exit 2 if not. */
export const apiIsUp = () => fetch(`${API}/geofence`).then((r) => r.ok).catch(() => false);

// ── the wire, from node ──────────────────────────────────────────────────────

export async function call(method, path, { token = null, body = undefined, key = null } = {}) {
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

export async function paceAuth() {
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

// The two legal documents at the versions this build ships, read from
// src/data/agreements.js itself so the harness can never drift from the app.
// (Importing the module would drag session/store's localStorage probes into
// node; the constant is the only thing wanted.)
const agreementSource = readFileSync(new URL('../src/data/agreements.js', import.meta.url), 'utf8');
export const CURRENT_AGREEMENTS = [...agreementSource.matchAll(/docType:\s*'([^']+)',\s*version:\s*'([^']+)'/g)].map(
  ([, docType, version]) => ({ docType, version })
);

/**
 * Record the current agreements for an account, on the wire.
 *
 * A fixture account that never agreed is a person the P4 ask will one day
 * interrupt — it waits for a quiet moment and opens the sign-in panel over the
 * page, which is the product working. A suite that is *about* that ask must
 * not call this (hardening-test §4 asserts the un-agreed state); every other
 * suite should, or a modal it never planned for will swallow a click mid-beat.
 */
export async function agreeCurrent(token) {
  for (const doc of CURRENT_AGREEMENTS) {
    await call('POST', '/me/agreements', { token, body: doc });
  }
}

export async function signIn(email, name) {
  await paceAuth();
  const answer = await call('POST', '/auth/sessions', {
    body: { provider: 'dev', idToken: `${email}|${name}`, device: { platform: 'web' } },
  });
  if (answer.status !== 200 && answer.status !== 201) {
    throw new Error(`sign-in for ${email} answered ${answer.status}`);
  }
  return answer.body;
}

/**
 * Sign a *browser* in as somebody, through the app's own seam.
 *
 * A browser's sign-in spends the same per-IP budget as a node one, so it is
 * paced with the same window. `window.__steeple` must be there — that means a
 * dev build or `build:debug`, never a production bundle.
 */
export async function signInPage(page, email, name) {
  await paceAuth();
  await page.evaluate(
    (e, n) => window.__steeple.session.signIn({ email: e, displayName: n }),
    email,
    name
  );
}

// ── dates ────────────────────────────────────────────────────────────────────

export const iso = (d) => d.toISOString().slice(0, 10);

// Calendar arithmetic, not 86_400_000ms: on the day a zone falls back, a fixed-ms
// step lands on the same local date twice and a "walk to the next weekday" loop
// can spin forever.
export const addDays = (date, n) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + n));

/** The next date on weekday `dow` at least `least` days out. */
export function nextWeekday(dow, least = 7) {
  let d = addDays(new Date(), least);
  while (d.getUTCDay() !== dow) d = addDays(d, 1);
  return iso(d);
}

// ── the fixture: one host, one venue, one published room ─────────────────────

let photoBytes = null;

/** The one-pixel-ish PNG publishing cannot happen without, written once per process. */
export function roomPhoto() {
  if (!photoBytes) photoBytes = readFileSync(writeRoomPhoto(`/tmp/steeple-fixture-room-${stamp}.png`));
  return photoBytes;
}

/**
 * A host who keeps a venue with one published room in it.
 *
 * Throws if steeple refuses at any step. The two things a suite usually wants to
 * assert on are handed back rather than checked here: `bookingMode` is what the
 * API answered to the mode patch (null when none was asked for), and
 * `listingStatus` is the status of reading the room back through the public
 * by-slug endpoint — 200 is the whole point of the fixture.
 *
 * @returns {Promise<{token, user, email, name, venueId, venueSlug, roomId,
 *   roomSlug, roomName, venueName, bookingMode, listingStatus, listing}>}
 */
export async function mintVenue({
  email,
  name,
  venueName,
  roomName,
  bookingMode = null,
  capacity = 40,
  pricePerHour = 20,
  activities = ['community'],
}) {
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
      capacity,
      pricePerHour,
      houseRules: 'Leave it as you found it.',
      activities,
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
  form.append('file', new Blob([roomPhoto()], { type: 'image/png' }), 'room.png');
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

  // The operator's one decision on a newly claimed venue's first listing. There is no API
  // for it by design (Admin owns it), so the harness does what Admin would.
  sql(
    `update rooms set "Status" = 1, "FirstPublishedAtUtc" = now(), "PublishRequestedAtUtc" = null where "Id" = '${room.body.id}';`
  );
  sql(`update venues set "IsIdentityVerified" = true where "Id" = '${venue.body.id}';`);

  let mode = null;
  if (bookingMode) {
    const patched = await call('PATCH', `/manage/venues/${venue.body.id}`, {
      token,
      body: { bookingMode },
    });
    mode = patched.body?.bookingMode ?? null;
  }

  const listing = await call('GET', `/listings/by-slug/${venue.body.slug}/${room.body.slug}`);

  return {
    token,
    user: host.user,
    email,
    name,
    venueId: venue.body.id,
    venueSlug: venue.body.slug,
    roomId: room.body.id,
    roomSlug: room.body.slug,
    roomName,
    venueName,
    // What was asked for, and what steeple answered — a suite that wants to say
    // "the venue is in the mode it was put in" has both halves without a re-read.
    bookingModeAsked: bookingMode,
    bookingMode: mode,
    listingStatus: listing.status,
    listing: listing.body,
  };
}

/**
 * A person with a card on file. `last4: '0002'` is the mock gateway's decline
 * card: the setup succeeds and every charge against it fails, which is the only
 * honest way to render the failure ladder (docs/contracts/payments.md).
 */
export async function mintGuest({ email, name, last4 = '4242' }) {
  const person = await signIn(email, name);
  const token = person.accessToken;
  const setup = await call('POST', '/me/payments/setup', { token, body: null });
  if (setup.status !== 200) throw new Error(`setup answered ${setup.status}`);
  const saved = await call('POST', '/me/payments/setup/mock-confirm', {
    token,
    body: { clientSecret: setup.body.clientSecret, brand: 'Visa', last4 },
  });
  if (saved.status !== 200) throw new Error(`mock-confirm answered ${saved.status} ${JSON.stringify(saved.body)}`);
  return { token, user: person.user, email, name, last4 };
}

/** One weekly ask, three dates out, on a room a `mintVenue` fixture describes. */
export async function apply(guest, room, { dow = 3, weeks = 3, groupSize = 12, activityType = 'community' } = {}) {
  const start = nextWeekday(dow, 7);
  const end = iso(addDays(new Date(`${start}T12:00:00Z`), 7 * (weeks - 1)));
  const answer = await call('POST', `/listings/${room.roomId}/applications`, {
    token: guest.token,
    key: `apply-${stamp}-${guest.email}-${room.roomId}`,
    body: {
      activityType,
      groupSize,
      intentText: 'A weekly evening for neighbours who would rather not meet in a kitchen.',
      organizationName: null,
      turnstileToken: null,
      schedule: {
        frequency: 'recurringWeekly',
        startDate: start,
        endDate: end,
        daysOfWeek: [DAY_TOKENS[dow]],
        startTime: '18:00',
        endTime: '20:00',
      },
    },
  });
  if (answer.status !== 200 && answer.status !== 201) {
    throw new Error(`apply answered ${answer.status} ${JSON.stringify(answer.body)}`);
  }
  return answer.body;
}

// ── browsers ─────────────────────────────────────────────────────────────────

const browsers = [];

/**
 * A headless browser on a **pipe**.
 *
 * Pipe transport, not a websocket: the browser is a child on a pipe, so it dies
 * when this process dies — including SIGKILL and an abort mid-suite. Over the
 * default transport a headless Chrome outlives its dead node parent, is
 * reparented to init, and a few aborted runs leave a machine full of them
 * (v2_migration Phase 3.6 item 7).
 */
export async function launch(options = {}) {
  const browser = await puppeteer.launch({
    headless: true,
    pipe: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
    ...options,
  });
  browsers.push(browser);
  return browser;
}

/** Shut every browser this process opened. Call it from a `finally`, always. */
export async function closeBrowsers() {
  while (browsers.length) await browsers.pop().close().catch(() => {});
}

/**
 * Console noise a suite that counts page errors must not count.
 *
 * Two sources, neither of them the app. Software GL narrates itself. And a
 * resource that would not load: map tiles and stock photographs come from the
 * open internet, which a sealed machine has none of, while room photographs in
 * the shared dev database carry **absolute** URLs baked in from
 * `Media:PublicBaseUrl` — so rows written by another agent's API instance point
 * at a port nobody is listening on any more, and every one of them logs a failed
 * image load. Suites went red on that alone with every check line green.
 *
 * What is deliberately still counted: a failed call to `/api/v1`. That is the
 * app talking to steeple, and if it could not, the suite should say so.
 *
 * @param {import('puppeteer').ConsoleMessage} message
 */
export function isEnvironmentNoise(message) {
  const text = message.text();
  if (/GL Driver Message|GPU stall/.test(text)) return true;
  if (!/Failed to load resource|net::ERR_/.test(text)) return false;
  return !(message.location?.().url ?? '').includes('/api/v1');
}
