// Browser lifecycle races for the notification feed against a disposable real stack.
//
// STEEPLE_WEB='http://127.0.0.1:55173/?q=low&world=off' \
// STEEPLE_API='http://127.0.0.1:5218/api/v1' \
// STEEPLE_DB='postgresql://sse_acceptance:sse_acceptance_pw@127.0.0.1:55432/sse_acceptance' \
// node tools/notification-lifecycle-test.mjs

import {
  agreeCurrent,
  apiIsUp,
  call,
  closeBrowsers,
  isEnvironmentNoise,
  launch,
  mintGuest,
  mintNotification,
  signInPage,
  sql,
  stamp,
} from './fixtures.mjs';

const APP = process.env.STEEPLE_WEB ?? 'http://localhost:5173/?q=low&world=off';
const SNAPSHOT_PATH = '/api/v1/me/notifications';
const STREAM_PATH = `${SNAPSHOT_PATH}/stream`;

let checks = 0;
let failures = 0;
function check(label, ok, detail = '') {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
}
const eq = (label, got, want) => check(label, got === want, `got ${JSON.stringify(got)}`);
const quiet = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function press(page, selector, tries = 6) {
  for (let attempt = 1; ; attempt += 1) {
    await page.waitForSelector(selector, { visible: true, timeout: 30000 });
    try {
      return await page.click(selector);
    } catch (error) {
      if (attempt >= tries || !/detached/i.test(error.message)) throw error;
      await quiet(400);
    }
  }
}

async function openInbox(page) {
  if (await page.evaluate(() => window.__steeple.state.view === 'journal')) return;
  await page.evaluate(() => window.__steeple.setView('village'));
  await press(page, '.letters');
  await page.waitForSelector('.journal', { timeout: 30000 });
}

async function waitForVisibility(page, expected, timeout = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await page.evaluate(() => document.visibilityState) === expected) return;
    await quiet(100);
  }
  throw new Error(`document did not become ${expected}`);
}

function insertFor(person, label) {
  return mintNotification({
    userId: person.user.id,
    type: 7,
    payload: {
      reminderKind: 'tomorrow',
      roomName: `${label} Room`,
      venueName: `${label} Venue`,
      deepLink: '/inbox',
    },
  });
}

async function wireRow(person, id) {
  const answer = await call('GET', '/me/notifications?pageSize=24', { token: person.token });
  return (answer.body?.items ?? []).find((row) => row.id === id) ?? null;
}

async function pageTransition(page, type) {
  await page.evaluate((eventType) => {
    window.dispatchEvent(new PageTransitionEvent(eventType, { persisted: true }));
  }, type);
}

if (!(await apiIsUp())) {
  console.log('The steeple API is not answering; this test needs the Development API.');
  process.exit(2);
}

let browser = null;
let heldResponse = null;
const problems = [];

try {
  const personA = await mintGuest({
    email: `notification-lifecycle-a-${stamp}@example.org`,
    name: 'Lifecycle Avery',
  });
  const personB = await mintGuest({
    email: `notification-lifecycle-b-${stamp}@example.org`,
    name: 'Lifecycle Bailey',
  });
  await agreeCurrent(personA.token);
  await agreeCurrent(personB.token);

  browser = await launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !isEnvironmentNoise(message)) problems.push(message.text());
  });

  await page.evaluateOnNewDocument(() => {
    const nativeFetch = window.fetch.bind(window);
    const audit = {
      snapshots: [],
      streams: [],
      mode: 'native',
      announcements: [],
    };
    window.fetch = async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      const absolute = new URL(url, document.baseURI);
      if (absolute.pathname.endsWith('/api/v1/me/notifications')) {
        audit.snapshots.push(performance.now());
      }
      if (!absolute.pathname.endsWith('/api/v1/me/notifications/stream')) {
        return nativeFetch(input, init);
      }
      const headers = new Headers(input instanceof Request ? input.headers : init?.headers);
      audit.streams.push({
        at: performance.now(),
        credentialFree: absolute.search === '' && absolute.username === '' && absolute.password === '',
        authorized: /^Bearer\s+\S+/.test(headers.get('authorization') ?? ''),
        mode: audit.mode,
      });
      if (audit.mode === 'cooldown') {
        audit.mode = 'native';
        return new Response('', {
          status: 503,
          headers: { 'content-type': 'application/problem+json', 'retry-after': '2' },
        });
      }
      if (audit.mode === 'stall') {
        const body = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('event: invalidate\ndata: {}\n\n'));
          },
        });
        return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
      }
      return nativeFetch(input, init);
    };
    window.__lifecycle = audit;
    document.addEventListener('DOMContentLoaded', () => {
      const region = document.getElementById('a11y');
      if (!region) return;
      new MutationObserver(() => {
        const value = region.textContent ?? '';
        if (value.includes('in your inbox')) audit.announcements.push(value);
      }).observe(region, { childList: true, characterData: true, subtree: true });
    }, { once: true });
  });

  const cdp = await page.createCDPSession();
  await cdp.send('Fetch.enable', {
    patterns: [{ urlPattern: '*api/v1/me/notifications?*', requestStage: 'Response' }],
  });
  let armed = null;
  const resume = (requestId) => cdp.send('Fetch.continueResponse', { requestId });
  cdp.on('Fetch.requestPaused', (event) => {
    const path = new URL(event.request.url).pathname;
    if (path !== SNAPSHOT_PATH || !armed) {
      void resume(event.requestId).catch(() => {});
      return;
    }
    const resolve = armed;
    armed = null;
    heldResponse = {
      release: async () => {
        const response = heldResponse;
        heldResponse = null;
        await resume(event.requestId).catch(() => {});
        return response;
      },
    };
    resolve(heldResponse);
  });
  const pauseNextSnapshot = () => new Promise((resolve) => { armed = resolve; });

  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__steepleReady === true && window.__steeple?.state?.roll >= 1, {
    timeout: 30000,
  });
  await signInPage(page, personA.email, personA.name);
  await openInbox(page);
  await page.waitForFunction(() => window.__lifecycle.streams.some((one) => one.mode === 'native'), {
    timeout: 30000,
  });

  // A response already fixed at the database cannot satisfy a later invalidation.
  const announcementsBefore = await page.evaluate(() => window.__lifecycle.announcements.length);
  const snapshotsBefore = await page.evaluate(() => window.__lifecycle.snapshots.length);
  const paused = pauseNextSnapshot();
  await page.evaluate(() => window.__steeple.setView('village'));
  await press(page, '.letters');
  const delayed = await Promise.race([
    paused,
    quiet(15000).then(() => { throw new Error('snapshot response was not intercepted'); }),
  ]);
  const trailingId = insertFor(personA, `Trailing ${stamp}`);
  await delayed.release();
  await page.waitForFunction(
    (id) => Boolean(document.querySelector(`.jmsg[data-id="${id}"]`)),
    { timeout: 30000 },
    trailingId
  );
  await page.waitForFunction(
    (before) => window.__lifecycle.snapshots.length >= before + 2,
    { timeout: 30000 },
    snapshotsBefore
  );
  check('an invalidation during a delayed snapshot causes a trailing read', true);
  eq('the trailing arrival is not marked read automatically', (await wireRow(personA, trailingId))?.readAt ?? null, null);

  sql(`select pg_notify('steeple_notifications', '${personA.user.id}');`);
  const afterArrivalReads = await page.evaluate(() => window.__lifecycle.snapshots.length);
  await page.waitForFunction(
    (before) => window.__lifecycle.snapshots.length > before,
    { timeout: 30000 },
    afterArrivalReads
  );
  await quiet(250);
  const arrivalAnnouncements = await page.evaluate(
    (before) => window.__lifecycle.announcements.slice(before),
    announcementsBefore
  );
  eq('repeat invalidation does not repeat the arrival announcement', arrivalAnnouncements.length, 1);

  // A late A response cannot repopulate the same tab after B signs in.
  const privateA = insertFor(personA, `Private A ${stamp}`);
  await page.waitForFunction(
    (id) => Boolean(document.querySelector(`.jmsg[data-id="${id}"]`)),
    { timeout: 30000 },
    privateA
  );
  const privateB = insertFor(personB, `Private B ${stamp}`);
  const stalePause = pauseNextSnapshot();
  await page.evaluate(() => window.__steeple.setView('village'));
  await press(page, '.letters');
  const stale = await Promise.race([
    stalePause,
    quiet(15000).then(() => { throw new Error('stale A response was not intercepted'); }),
  ]);
  await page.evaluate(() => window.__steeple.session.signOut());
  await page.waitForFunction(() => window.__steeple.session.isSignedIn() === false, { timeout: 15000 });
  await signInPage(page, personB.email, personB.name);
  await stale.release();
  await openInbox(page);
  try {
    await page.waitForFunction(
      (id) => Boolean(document.querySelector(`.jmsg[data-id="${id}"]`)),
      { timeout: 30000 },
      privateB
    );
  } catch (error) {
    const state = await page.evaluate(() => ({
      signedIn: window.__steeple.session.isSignedIn(),
      user: window.__steeple.session.currentUser()?.displayName ?? null,
      path: location.pathname,
      rows: [...document.querySelectorAll('.jmsg')].map((row) => row.dataset.id),
      snapshots: window.__lifecycle.snapshots.length,
      streams: window.__lifecycle.streams,
    }));
    throw new Error(`B row did not render: ${JSON.stringify(state)}`, { cause: error });
  }
  const switched = await page.evaluate((a, b) => ({
    a: Boolean(document.querySelector(`.jmsg[data-id="${a}"]`)),
    b: Boolean(document.querySelector(`.jmsg[data-id="${b}"]`)),
  }), privateA, privateB);
  eq('a delayed A snapshot cannot leak into B rows', switched.a, false);
  eq('B keeps the row from B own snapshot', switched.b, true);

  // A foreground blank tab gives Chrome ownership of the actual visibility transition.
  await quiet(1300);
  const coverPage = await browser.newPage();
  await coverPage.goto('about:blank');
  await coverPage.bringToFront();
  await waitForVisibility(page, 'hidden');
  await quiet(100);
  const hiddenBefore = await page.evaluate(() => ({
    snapshots: window.__lifecycle.snapshots.length,
    streams: window.__lifecycle.streams.length,
  }));
  const hiddenId = insertFor(personB, `Hidden ${stamp}`);
  await quiet(1500);
  const hiddenDuring = await page.evaluate((id) => ({
    snapshots: window.__lifecycle.snapshots.length,
    streams: window.__lifecycle.streams.length,
    row: Boolean(document.querySelector(`.jmsg[data-id="${id}"]`)),
  }), hiddenId);
  eq('a natively hidden page starts no automatic snapshot', hiddenDuring.snapshots, hiddenBefore.snapshots);
  eq('a natively hidden page starts no replacement stream', hiddenDuring.streams, hiddenBefore.streams);
  eq('the missed arrival is not applied while natively hidden', hiddenDuring.row, false);
  await page.bringToFront();
  await waitForVisibility(page, 'visible');
  await page.waitForFunction(
    (id) => Boolean(document.querySelector(`.jmsg[data-id="${id}"]`)),
    { timeout: 30000 },
    hiddenId
  );
  eq('native visibility recovery leaves the missed arrival unread', (await wireRow(personB, hiddenId))?.readAt ?? null, null);

  await quiet(1300);
  await pageTransition(page, 'pagehide');
  await quiet(100);
  const absentBefore = await page.evaluate(() => ({
    snapshots: window.__lifecycle.snapshots.length,
    streams: window.__lifecycle.streams.length,
  }));
  const absentId = insertFor(personB, `Pagehide ${stamp}`);
  await quiet(1500);
  const absentDuring = await page.evaluate((id) => ({
    snapshots: window.__lifecycle.snapshots.length,
    streams: window.__lifecycle.streams.length,
    row: Boolean(document.querySelector(`.jmsg[data-id="${id}"]`)),
  }), absentId);
  eq('a dispatched pagehide starts no automatic snapshot', absentDuring.snapshots, absentBefore.snapshots);
  eq('a dispatched pagehide starts no replacement stream', absentDuring.streams, absentBefore.streams);
  eq('the absent-page arrival is not applied before dispatched pageshow', absentDuring.row, false);
  await pageTransition(page, 'pageshow');
  await page.waitForFunction(
    (id) => Boolean(document.querySelector(`.jmsg[data-id="${id}"]`)),
    { timeout: 30000 },
    absentId
  );
  eq('dispatched pageshow recovery leaves the missed arrival unread', (await wireRow(personB, absentId))?.readAt ?? null, null);

  // Retry-After owns admission cooldown even when a lifecycle event wakes the feed.
  await pageTransition(page, 'pagehide');
  await page.evaluate(() => { window.__lifecycle.mode = 'cooldown'; });
  const cooldownAt = await page.evaluate(() => window.__lifecycle.streams.length);
  await pageTransition(page, 'pageshow');
  await page.waitForFunction((at) => window.__lifecycle.streams.length > at, { timeout: 10000 }, cooldownAt);
  await quiet(1100);
  eq(
    'a wake cannot bypass a stream Retry-After cooldown',
    await page.evaluate((at) => window.__lifecycle.streams.length, cooldownAt),
    cooldownAt + 1
  );
  await page.waitForFunction((at) => window.__lifecycle.streams.length >= at + 2, { timeout: 10000 }, cooldownAt);
  const cooldownAttempts = await page.evaluate((at) => window.__lifecycle.streams.slice(at, at + 2), cooldownAt);
  check(
    'stream retry resumes after the advertised cooldown',
    cooldownAttempts[1].at - cooldownAttempts[0].at >= 1900,
    `${Math.round(cooldownAttempts[1].at - cooldownAttempts[0].at)}ms`
  );

  // The response yields one initial frame and then remains byte-silent.
  await pageTransition(page, 'pagehide');
  await page.evaluate(() => { window.__lifecycle.mode = 'stall'; });
  const idleAt = await page.evaluate(() => window.__lifecycle.streams.length);
  await pageTransition(page, 'pageshow');
  await page.waitForFunction((at) => window.__lifecycle.streams.length >= at + 2, { timeout: 100000 }, idleAt);
  const idleAttempts = await page.evaluate((at) => window.__lifecycle.streams.slice(at, at + 2), idleAt);
  check(
    'a byte-stalled stream is replaced after the 75-second idle watchdog',
    idleAttempts[1].at - idleAttempts[0].at >= 74000,
    `${Math.round(idleAttempts[1].at - idleAttempts[0].at)}ms`
  );
  check(
    'every intercepted stream keeps credentials in its authorization header',
    await page.evaluate(() => window.__lifecycle.streams.every((one) => one.authorized && one.credentialFree))
  );
  await pageTransition(page, 'pagehide');
  await page.evaluate(() => { window.__lifecycle.mode = 'native'; });
  await pageTransition(page, 'pageshow');

  // A real row press is the first act that may write a receipt.
  eq('the row stays unread until its real press', (await wireRow(personB, absentId))?.readAt ?? null, null);
  await openInbox(page);
  await press(page, `.jmsg[data-id="${absentId}"]`);
  await page.waitForFunction(() => location.pathname === '/journal', { timeout: 30000 });
  let readAt = null;
  for (let attempt = 0; attempt < 30 && !readAt; attempt += 1) {
    readAt = (await wireRow(personB, absentId))?.readAt ?? null;
    if (!readAt) await quiet(250);
  }
  check('a real notification press persists its receipt', Boolean(readAt), String(readAt));
  check('the browser stayed free of app errors', problems.length === 0, problems.join(' | '));
} finally {
  if (heldResponse) await heldResponse.release().catch(() => {});
  await closeBrowsers();
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
