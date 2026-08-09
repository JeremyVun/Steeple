#!/usr/bin/env node
// ONE SESSION, TWO TABS — driven for real (docs/contracts/identity.md).
//
//   node tools/session-tabs-test.mjs "http://localhost:5175/?world=off"
//
// Needs the API on whatever the given origin's proxy points at, with
// Auth:DevLoginEnabled. World-OFF is the documented state: this suite is about
// credentials, not the village, and the flat boot lands on the product.
//
// Two pages of one browser — one cookie jar, one localStorage, exactly what a
// person has when they open a second tab. What it proves:
//
//   1. PRIVATE DATA IS OUT OF STORAGE. Neither browser store holds a profile,
//      mirror, draft, token, or location; the refresh token is an httpOnly
//      cookie `document.cookie` cannot see.
//   2. TABS SHARE SESSION STATE. An opaque BroadcastChannel event tells tab two
//      to fetch the person from steeple; no profile crosses between documents.
//   3. THE RACE IS SURVIVABLE. Both tabs are reloaded, so neither holds an
//      access token, and both are then made to do authed work at the same
//      instant: two refreshes of one cookie, concurrently. Both must come back
//      with a working session and the family must still be alive — the failure
//      this whole change exists to stop is reuse-detection revoking it.
//   4. SO IS THE BARE-WIRE VERSION. Four concurrent POST /auth/refresh from one
//      page, cookie only. All must answer 200, and the session must survive.
//   5. SIGNING OUT IS SHARED. One tab signs out; the other follows through the
//      channel, the cookie goes, and legacy private keys are purged everywhere.
//   6. MIGRATION IS UNCONDITIONAL. Old signed-out profile/store keys planted by
//      hand are deleted at the next boot and are never adopted.
//
// Timing: headless app-time runs several times slow — every wait here is on
// state, never on the clock.

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

const url = process.argv[2] ?? 'http://localhost:5175/?world=off';
const stamp = Date.now().toString(36);
const email = `tabs-${stamp}@example.com`;
const MEMORY_APPLICATION = 'a2000000-0000-4000-8000-000000000002';

let checks = 0;
let failed = 0;
function check(label, ok, detail = '') {
  checks += 1;
  if (!ok) failed += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? `: ${detail}` : ''}`);
}
const eq = (label, actual, wanted) =>
  check(
    label,
    String(actual) === String(wanted),
    String(actual) === String(wanted) ? JSON.stringify(actual) : `${JSON.stringify(actual)} (wanted ${JSON.stringify(wanted)})`
  );

// pipe:true — a suite killed mid-run must not leave a headless Chrome tree
// behind; and everything below closes in a finally either way.
const browser = await launch();

const problems = [];

/** Opens a page on the app and waits for it to be ready to be driven. */
async function open(browserContext) {
  const page = await browserContext.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const from = m.location()?.url ?? '';
    const text = m.text();
    // The wire's own refusals are the point of §6, and tiles come from an
    // internet a sealed machine does not have.
    if (text.includes('GL Driver') || from.includes('/api/v1/')) return;
    if (/ERR_(CONNECTION_REFUSED|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|TIMED_OUT)/.test(text)) return;
    problems.push(`console: ${text} ${from}`);
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__steepleReady === true', { timeout: 30000 });
  return page;
}

/**
 * Start recording what data/session.js tells this page's watchers. The record
 * survives nothing but this document — every reload re-arms it.
 */
const watch = (page) =>
  page.evaluate(() => {
    window.__tabHeard = [];
    window.__steeple.session.onSessionChange((held, reason) =>
      window.__tabHeard.push({ who: held?.user?.id ?? null, reason })
    );
  });

const heard = (page) => page.evaluate('window.__tabHeard ?? []');
const waitHeard = (page, reason, timeout = 20000) =>
  page.waitForFunction(
    (r) => (window.__tabHeard ?? []).some((one) => one.reason === r),
    { timeout },
    reason
  );

// After a simultaneous reload Puppeteer's isolated-world wait can miss an
// expando written on the page's Window even though page.evaluate sees it. Poll
// in the page's own realm so the harness waits on the state it later asserts.
async function waitInPage(page, predicate, argument = null, timeout = 60000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await page.evaluate(predicate, argument).catch(() => false)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`page state did not settle within ${timeout}ms`);
}

const storageSnapshot = (page) =>
  page.evaluate(() => {
    const read = (area) =>
      Array.from({ length: area.length }, (_, i) => area.key(i)).map((key) => [key, area.getItem(key)]);
    return { local: read(localStorage), session: read(sessionStorage) };
  });

const hasPrivateStorage = (snapshot, person = null) =>
  [...snapshot.local, ...snapshot.session].some(
    ([key, value]) =>
      key === 'steeple-village-session' ||
      key.startsWith('steeple-village-store:') ||
      (person && (String(value).includes(person.id) || String(value).includes(person.email)))
  );

try {
  console.log(`\n── one session, two tabs · ${url} ──`);

  const one = await open(browser);
  const two = await open(browser);
  await watch(one);
  await watch(two);

  // ── 1. the secret is out of reach ────────────────────────────────────────
  console.log('\n1. what the browser is allowed to hold');
  const person = await one.evaluate(
    (who) => window.__steeple.session.signIn({ email: who, displayName: 'Tabs Person' }),
    email
  );
  check('a real sign-in against steeple', Boolean(person?.id), person?.displayName);

  const afterSignIn = await storageSnapshot(one);
  check('neither storage contains a profile, mirror, draft, or identity', !hasPrivateStorage(afterSignIn, person));
  check('the retired profile key does not exist', !(await one.evaluate("localStorage.getItem('steeple-village-session')")));

  const jar = await one.cookies();
  const cookie = jar.find((c) => c.name === 'steeple_refresh');
  check('the refresh token is a cookie', Boolean(cookie?.value));
  check('httpOnly, so no script can read it', cookie?.httpOnly === true);
  check('SameSite=Strict', cookie?.sameSite === 'Strict');
  check('scoped to the whole document root', cookie?.path === '/');
  check(
    'and document.cookie cannot see it',
    !(await one.evaluate('document.cookie')).includes('steeple_refresh')
  );

  // ── 2. tabs share the person ─────────────────────────────────────────────
  console.log('\n2. what the other tab is told');
  await waitHeard(two, 'signedIn');
  const twoHeard = await heard(two);
  eq('the open tab heard one signed-in event', twoHeard.filter((event) => event.reason === 'signedIn').length, 1);
  check('every profile event came from steeple for the same person', twoHeard.every((event) => event.who === person.id));
  eq('so the second tab holds them too', await two.evaluate('__steeple.session.currentUser()?.id ?? null'), person.id);

  const three = await open(browser);
  await three.waitForFunction((id) => window.__steeple.session.currentUser()?.id === id, { timeout: 20000 }, person.id);
  eq(
    'a tab opened afterwards finds them already there',
    await three.evaluate('__steeple.session.currentUser()?.id ?? null'),
    person.id
  );
  await three.close();

  // ── 3. the race ──────────────────────────────────────────────────────────
  console.log('\n3. two tabs, one cookie, at the same instant');
  // A reload is the honest way to reach the state that used to be fatal: the
  // access token was memory, so after this neither tab holds one, and the next
  // piece of authed work in each has to rotate the cookie. Before, both tabs
  // held the same refresh token in localStorage and the second to spend it was
  // called a thief.
  // Private working state is memory-only. It exists now, appears in neither
  // storage, and must be gone after these reloads while the cookie restores the
  // session itself.
  await one.evaluate(() => window.__steeple.store.setHomePin({ lat: 38.901, lng: -77.265 }));
  await one.evaluate(
    (applicationId, organizer) =>
      window.__steeple.store.mirrorApplication({
        id: applicationId,
        roomId: 'b2000000-0000-4000-8000-000000000002',
        roomName: 'Memory Room',
        venueName: 'Memory Venue',
        venueSlug: 'memory-venue',
        roomSlug: 'memory-room',
        organizer: { id: organizer.id, displayName: organizer.displayName, ratingSummary: null },
        activityType: 'community',
        groupSize: 5,
        schedule: {
          frequency: 'oneOff',
          startDate: '2026-09-01',
          endDate: '2026-09-01',
          daysOfWeek: null,
          startTime: '10:00:00',
          endTime: '11:00:00',
        },
        intentText: 'Memory-only draft marker',
        status: 'pending',
        createdAtUtc: '2026-08-09T00:00:00Z',
        decidedAtUtc: null,
        expiresAtUtc: '2026-08-23T00:00:00Z',
        bookingId: null,
        messageCount: 0,
        messages: [],
      }),
    MEMORY_APPLICATION,
    person
  );
  check('a private home pin exists in memory before reload', await one.evaluate('!!__steeple.store.homePin()'));
  check(
    'a server mirror row exists in memory before reload',
    await one.evaluate((id) => Boolean(__steeple.store.getApplication(id)), MEMORY_APPLICATION)
  );
  check('the home pin was not persisted', !hasPrivateStorage(await storageSnapshot(one), person));

  await Promise.all([
    one.reload({ waitUntil: 'domcontentloaded' }),
    two.reload({ waitUntil: 'domcontentloaded' }),
  ]);
  try {
    await Promise.all([
      waitInPage(one, () => window.__steepleReady === true),
      waitInPage(two, () => window.__steepleReady === true),
    ]);
  } catch (error) {
    const state = await Promise.all(
      [one, two].map((page) =>
        page.evaluate(() => ({ ready: window.__steepleReady, debug: Boolean(window.__steeple), href: location.href }))
          .catch((failure) => ({ evaluationError: failure.message, href: page.url() }))
      )
    );
    throw new Error(`reload did not become ready: ${JSON.stringify(state)}`, { cause: error });
  }
  await Promise.all([
    waitInPage(one, (id) => window.__steeple.session.currentUser()?.id === id, person.id, 20000),
    waitInPage(two, (id) => window.__steeple.session.currentUser()?.id === id, person.id, 20000),
  ]);
  await watch(one);
  await watch(two);
  eq('both tabs still name the person', await one.evaluate('__steeple.session.currentUser()?.id ?? null'), person.id);
  eq('both of them', await two.evaluate('__steeple.session.currentUser()?.id ?? null'), person.id);
  eq('the memory-only home pin is gone', await one.evaluate('__steeple.store.homePin()'), null);
  eq(
    'the memory-only server mirror is empty again',
    await one.evaluate((id) => __steeple.store.getApplication(id), MEMORY_APPLICATION),
    null
  );
  check('and storage is still private-data free', !hasPrivateStorage(await storageSnapshot(one), person));

  // The collision itself, forced: two documents sharing one cookie jar, each
  // spending the same refresh token at the same instant. Boot alone does not
  // prove this — the two tabs finish loading at different moments and their
  // refreshes may simply not overlap, which looks exactly like a pass.
  const rotate = (page) =>
    page.evaluate(() =>
      fetch('api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }).then((r) => r.status)
    );
  const [rotOne, rotTwo] = await Promise.all([rotate(one), rotate(two)]);
  eq('the first tab rotates', rotOne, 200);
  eq('and so does the second, on the very same token', rotTwo, 200);

  const race = (page) =>
    page.evaluate(() =>
      window.__steeple.session
        .withAccess((token) => fetch('api/v1/me', { headers: { authorization: `Bearer ${token}` } }))
        .then((response) => response.status)
        .catch((error) => `threw ${error?.status ?? error?.message}`)
    );
  const [gotOne, gotTwo] = await Promise.all([race(one), race(two)]);
  eq('the first tab got its answer', gotOne, 200);
  eq('and so did the second', gotTwo, 200);
  eq('nobody was signed out', await one.evaluate('!!__steeple.session.currentUser()'), 'true');
  eq('on either side', await two.evaluate('!!__steeple.session.currentUser()'), 'true');
  check(
    'and neither tab was told the session expired',
    (await heard(one)).every((h) => h.reason !== 'expired') &&
      (await heard(two)).every((h) => h.reason !== 'expired')
  );

  // The family is the thing reuse detection kills. If it were revoked, the very
  // next rotation would fail — so ask for one.
  eq(
    'the family is alive: the cookie still rotates',
    await one.evaluate(() =>
      fetch('api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }).then((r) => r.status)
    ),
    200
  );

  // ── 4. the bare wire ─────────────────────────────────────────────────────
  console.log('\n4. four refreshes of one cookie, concurrently');
  const wire = await one.evaluate(() =>
    Promise.all(
      Array.from({ length: 4 }, () =>
        fetch('api/v1/auth/refresh', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        }).then((r) => r.status)
      )
    )
  );
  eq('every one of them is honoured', JSON.stringify(wire), JSON.stringify([200, 200, 200, 200]));
  eq(
    'and the session that came out of it still works',
    await one.evaluate(() =>
      window.__steeple.session
        .withAccess((token) => fetch('api/v1/me', { headers: { authorization: `Bearer ${token}` } }))
        .then((r) => r.status)
        .catch((e) => `threw ${e?.status ?? e?.message}`)
    ),
    200
  );

  // ── 5. signing out is shared ─────────────────────────────────────────────
  console.log('\n5. one tab signs out');
  await watch(two);
  await one.evaluate(() => {
    localStorage.setItem('steeple-village-session', '{"user":{"email":"old@example.org"}}');
    localStorage.setItem('steeple-village-store:old-user', '{"applications":[{"private":true}]}');
    sessionStorage.setItem('steeple-village-store:anon', '{"draft":"private"}');
  });
  await two.evaluate(() => sessionStorage.setItem('steeple-village-store:old-user', '{"private":true}'));
  await one.evaluate('__steeple.session.signOut()');
  await waitHeard(two, 'signedOut');
  const outHeard = await heard(two);
  eq('the other tab is told', outHeard.at(-1).reason, 'signedOut');
  eq('and it names nobody', outHeard.at(-1).who, 'null');
  eq('so the second tab holds nobody', await two.evaluate('!!__steeple.session.currentUser()'), 'false');
  eq('nor does the first', await one.evaluate('!!__steeple.session.currentUser()'), 'false');
  check(
    'the refresh cookie went with it',
    !(await one.cookies()).some((c) => c.name === 'steeple_refresh' && c.value)
  );
  check('the signing-out tab purged every legacy private key', !hasPrivateStorage(await storageSnapshot(one)));
  check('the sibling purged its own sessionStorage too', !hasPrivateStorage(await storageSnapshot(two)));

  // ── 6. old signed-out state is purged at boot ─────────────────────────────
  console.log('\n6. migration of a signed-out browser');
  await two.close();
  await one.evaluate(() => {
    localStorage.setItem(
      'steeple-village-session',
      JSON.stringify({ user: null, reason: 'signedOut', stamp: Date.now() })
    );
    localStorage.setItem('steeple-village-store:departed-user', '{"homePin":{"lat":1,"lng":2}}');
    sessionStorage.setItem('steeple-village-store:anon', '{"intentText":"unfinished"}');
  });
  await one.reload({ waitUntil: 'domcontentloaded' });
  await one.waitForFunction('window.__steepleReady === true', { timeout: 30000 });
  eq('the old tombstone is not an identity', await one.evaluate('!!__steeple.session.currentUser()'), 'false');
  check('module boot deleted every planted private key', !hasPrivateStorage(await storageSnapshot(one)));
} catch (error) {
  failed += 1;
  console.log(` FAIL  the suite fell over: ${error?.stack ?? error}`);
} finally {
  await closeBrowsers();
}

for (const problem of problems) check(`the page stayed quiet — ${problem}`, false);
console.log(`\n${checks - failed}/${checks} checks passed`);
process.exit(failed ? 1 : 0);
