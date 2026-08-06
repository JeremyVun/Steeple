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
//   1. THE SECRET IS OUT OF REACH. After a real sign-in, localStorage holds the
//      person and no token of any kind; the refresh token is an httpOnly cookie
//      `document.cookie` cannot see.
//   2. TABS SHARE THE PERSON. Tab two, opened after the sign-in, adopts them —
//      and a tab already open when someone signs in is told, through the
//      `storage` event, with REASON.signedIn.
//   3. THE RACE IS SURVIVABLE. Both tabs are reloaded, so neither holds an
//      access token, and both are then made to do authed work at the same
//      instant: two refreshes of one cookie, concurrently. Both must come back
//      with a working session and the family must still be alive — the failure
//      this whole change exists to stop is reuse-detection revoking it.
//   4. SO IS THE BARE-WIRE VERSION. Four concurrent POST /auth/refresh from one
//      page, cookie only. All must answer 200, and the session must survive.
//   5. SIGNING OUT IS SHARED. One tab signs out; the other lets go, says
//      'signedOut' rather than 'expired', and the cookie is gone from both.
//   6. AND EXPIRY IS TOLD APART. With the cookie taken (the only way to stage a
//      dead session now), a reload signs the browser out with REASON.expired.
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

  const stored = await one.evaluate("JSON.parse(localStorage.getItem('steeple-village-session'))");
  check('storage names the person', stored?.user?.id === person.id);
  check('and holds no access token', !stored?.accessToken);
  check('and no refresh token', !stored?.refreshToken);
  check(
    'nothing token-shaped anywhere in storage',
    await one.evaluate(() =>
      Object.keys(localStorage).every((key) => !/token/i.test(localStorage.getItem(key) ?? ''))
    )
  );

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
  eq('the open tab was told, once', twoHeard.length, 1);
  eq('with the reason it happened for', twoHeard[0].reason, 'signedIn');
  eq('and it is the same person', twoHeard[0].who, person.id);
  eq('so the second tab holds them too', await two.evaluate('__steeple.session.currentUser()?.id ?? null'), person.id);

  const three = await open(browser);
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
  await Promise.all([
    one.reload({ waitUntil: 'domcontentloaded' }),
    two.reload({ waitUntil: 'domcontentloaded' }),
  ]);
  await Promise.all([
    one.waitForFunction('window.__steepleReady === true', { timeout: 30000 }),
    two.waitForFunction('window.__steepleReady === true', { timeout: 30000 }),
  ]);
  await watch(one);
  await watch(two);
  eq('both tabs still name the person', await one.evaluate('__steeple.session.currentUser()?.id ?? null'), person.id);
  eq('both of them', await two.evaluate('__steeple.session.currentUser()?.id ?? null'), person.id);

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

  // ── 6. expiry is told apart from a sign-out ──────────────────────────────
  console.log('\n6. a session that ends without being asked');
  // One tab from here. A sibling adopting the person does authed work of its own
  // the moment it hears about them, and that work rotates the cookie — which
  // would quietly put back the credential this section exists to take away.
  await two.close();
  await one.evaluate((who) => window.__steeple.session.signIn({ email: who }), email);
  const live = (await one.cookies()).find((c) => c.name === 'steeple_refresh');
  // Straight through CDP: puppeteer's own deleteCookie round-trips the cookie
  // back through setCookies and cannot express an httpOnly one it never read a
  // value for, so it fails silently or throws — either way it does not delete.
  const cdp = await one.createCDPSession();
  await cdp.send('Network.deleteCookies', {
    name: 'steeple_refresh',
    domain: live.domain,
    path: live.path,
  });
  await cdp.detach();
  // The staging has to be checked, not assumed: a cookie that quietly survived
  // would make every assertion below pass for the wrong reason.
  check(
    'the cookie really is gone before the reload',
    !(await one.cookies()).some((c) => c.name === 'steeple_refresh' && c.value)
  );
  await one.reload({ waitUntil: 'domcontentloaded' });
  await one.waitForFunction('window.__steepleReady === true', { timeout: 30000 });
  await one.waitForFunction('!__steeple.session.currentUser()', { timeout: 25000 }).catch(() => {});
  eq('the dead session is dropped', await one.evaluate('!!__steeple.session.currentUser()'), 'false');
  eq(
    'and storage says why, for whoever asks next',
    await one.evaluate("JSON.parse(localStorage.getItem('steeple-village-session')).reason"),
    'expired'
  );
} catch (error) {
  failed += 1;
  console.log(` FAIL  the suite fell over: ${error?.stack ?? error}`);
} finally {
  await closeBrowsers();
}

for (const problem of problems) check(`the page stayed quiet — ${problem}`, false);
console.log(`\n${checks - failed}/${checks} checks passed`);
process.exit(failed ? 1 : 0);
