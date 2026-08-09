// THE HARDENING, DRIVEN FOR REAL (v2_migration Phase 4 + the web half of Phase 5).
//
//   node tools/hardening-test.mjs "http://localhost:5281/?q=low&world=off"
//
// Everything this suite is about is invisible on a screenshot, so every check
// asks either the wire or the app's own seams what actually happened:
//
//   §1  the analytics batcher — interaction events reach steeple, in batches,
//       under one session id, and the API accepts every name the client sends.
//   §2  Turnstile with no site key — no widget, no script, and both writes that
//       carry a token still send null, which the whole local loop depends on.
//   §3  the providers with no client id — no button, no SDK, and the dev
//       provider still the way in.
//   §4  agreements — a first sign-in is asked wherever the session came from,
//       steeple records both documents, the same account is not asked twice,
//       and the two pages are really served.
//   §5  the group asking — organizationName is the request's own field now, and
//       it reaches steeple.
//   §6  a write waits longer than a read, and a timeout is not an absence.
//   §7  the desk's hours are steeple's — cleared storage, same hours.
//   §8  the SEO floor — robots.txt, the sitemap the API renders, the share card.
//
// World-OFF is the documented state — none of this is about the village — and
// `?q=low` keeps the headless GL cheap. Needs the API (STEEPLE_API, default
// http://localhost:5200/api/v1) with Auth:DevLoginEnabled, and this app on the
// given origin with its proxy pointed at that same API. Signing in is per-IP
// paced by fixtures.mjs; do not bypass it.

import {
  API,
  agreeCurrent,
  apiIsUp,
  call,
  closeBrowsers,
  isEnvironmentNoise,
  launch,
  mintGuest,
  mintVenue,
  paceAuth,
  signInPage,
  stamp,
} from './fixtures.mjs';
import { writeRoomPhoto } from './host-photo.mjs';

const url = process.argv[2] ?? 'http://localhost:5281/?q=low&world=off';
const PHOTO = writeRoomPhoto(`/tmp/steeple-hardening-room-${stamp}.png`);

let checks = 0;
let failures = 0;
const problems = [];

function check(label, ok, detail = '') {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

if (!(await apiIsUp())) {
  console.log(`\nThe steeple API is not answering at ${API} — this suite needs it.`);
  process.exit(2);
}

// One host with one published room, so §5's request has somewhere to go and §7
// has a room whose hours steeple keeps.
const host = await mintVenue({
  email: `hard-host-${stamp}@example.org`,
  name: 'Ruth Vaughan',
  venueName: `Saint Mark's ${stamp}`,
  roomName: `Long Hall ${stamp}`,
});

// The two people who ask for it. Both carry a card: steeple answers a request
// without one with `402 payment_method_required`, which is its own beat (the
// payments suite drives it) and not what this suite is about — here it would
// only stop §5 and §6 before the thing they are measuring.
const guest = await mintGuest({ email: `hard-guest-${stamp}@example.org`, name: 'Nell Hardy' });
const waiting = await mintGuest({ email: `hard-slow-${stamp}@example.org`, name: 'Wilf Slow' });

// Minted accounts agree up front (the documented practice) — since 2026-08-07
// the ask is a gate that rises over an un-agreed session's work, which is §6's
// sheet mid-composition. `guest` deliberately does not: §4's subject is the
// un-agreed state, and its "nothing recorded before it is pressed" depends on it.
await agreeCurrent(host.token);
await agreeCurrent(waiting.token);

const browser = await launch();

try {
  const page = await browser.newPage();
  let signedOutBootRefusals = 0;
  await page.setViewport({ width: 1440, height: 900 });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error' || isEnvironmentNoise(msg)) return;
    // P2 boot has no profile hint: every fresh signed-out document probes the
    // httpOnly cookie and receives an ordinary 401. Assert those responses
    // below; do not count Chrome's rendering of that expected refusal as an
    // application console problem.
    if (msg.location()?.url?.includes('/api/v1/auth/refresh') && /401/.test(msg.text())) return;
    problems.push(`[console.error] ${msg.text()}`);
  });

  // Every event batch this page posts, and what steeple answered.
  const batches = [];
  page.on('response', async (response) => {
    if (response.url().includes('/api/v1/auth/refresh') && response.status() === 401) {
      signedOutBootRefusals += 1;
      return;
    }
    if (!response.url().includes('/api/v1/events')) return;
    let sent = null;
    try {
      sent = JSON.parse(response.request().postData() ?? 'null');
    } catch {
      sent = null;
    }
    batches.push({ status: response.status(), sent });
  });

  const store = (expression) => page.evaluate(`__steeple.store.${expression}`);
  const text = (selector) =>
    page.evaluate((s) => document.querySelector(s)?.textContent?.trim() ?? null, selector);
  const visible = (selector) =>
    page.evaluate((s) => {
      const node = document.querySelector(s);
      if (!node) return false;
      return node.checkVisibility ? node.checkVisibility() : node.offsetParent !== null;
    }, selector);
  // The refresh token is an httpOnly cookie and the access token lives in module
  // memory — neither is in localStorage. `withAccess` is the app's own way to a
  // bearer, and the only one a harness may use (CLAUDE.md, the session seam).
  const bearer = () => page.evaluate('__steeple.session.withAccess((t) => Promise.resolve(t))');

  async function click(selector, label = selector) {
    const handle = await page.$(selector);
    if (!handle) return check(`click ${label}`, false, 'no element');
    await handle.evaluate((n) => n.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await wait(140);
    const box = await handle.boundingBox();
    if (!box) return check(`click ${label}`, false, 'not laid out');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await wait(500);
    return true;
  }

  async function clickText(selector, pattern, label) {
    for (const handle of await page.$$(selector)) {
      const said = (await handle.evaluate((n) => n.textContent)).trim();
      if (!pattern.test(said)) continue;
      await handle.evaluate((n) => n.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await wait(140);
      const box = await handle.boundingBox();
      if (!box) continue;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await wait(500);
      return true;
    }
    check(`click ${label}`, false, `no match for ${pattern}`);
    return false;
  }

  // Arrive the way a visitor does: the printed title page, and a press on it
  // before a line of the product has arrived.
  //
  // An arrival is a *press*, not a URL — a cold hash opens on the product
  // without anybody having chosen anything, and settles nothing
  // (tools/boot-priority-test.mjs §5 asserts the view and deliberately not an
  // intent). Pressed before boot it is the `direct` entry, which is the one the
  // whole printed-page contract exists for; world-off has no title act to fly
  // through afterwards, so this is also the only arrival this suite's flags can
  // produce. `!window.__steeple` is how the press is known to have beaten the
  // boot — and the CPU is throttled while it does, because otherwise this is a
  // race an unthrottled machine wins about half the time: the boot claims
  // nothing, the press lands in the hash as the markup's own fallback, and no
  // arrival is ever reported. Throttling is how tools/boot-priority-test.mjs
  // makes the same beat deterministic.
  async function land() {
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () => !!document.querySelector('.arrival__cta') && !window.__steeple,
        { timeout: 30000 }
      );
      // In-page, not by pointer: at this moment the title page is the only thing
      // laid out, and a throttled boot moves it under a mouse aimed at where the
      // control was a moment ago (an aimed press lands on the map behind it).
      await page.evaluate(() => document.querySelector('.arrival__cta').click());
    } finally {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    }
    await page.waitForFunction('window.__steepleReady === true', { timeout: 60000 });
    await page.evaluate('__steeple.roll.set(1)');
    await page.waitForFunction('__steeple.state.roll === 1', { timeout: 20000 });
    await wait(900);
  }

  console.log(`\n──── the hardening · ${url} ────`);
  await land();

  // ── 1. the batcher ────────────────────────────────────────────────────────
  console.log('\n1. what this browser saw somebody do, and where it went');
  check('a signed-out boot proved the absent cookie rather than reading a profile hint', signedOutBootRefusals > 0);

  // The map, by hand. One event per gesture, not one per frame of it.
  const map = await page.$('.leaflet-container');
  check('there is a map to drag', Boolean(map));
  if (map) {
    const box = await map.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 140, box.y + box.height / 2 - 90, { steps: 12 });
    await page.mouse.up();
    await wait(700);
  }

  // Then the sign-in panel, which is the funnel's own first beat.
  await click('.account', 'the shelf’s Sign in');
  await wait(600);
  await page.keyboard.press('Escape');
  await wait(400);

  // Batches go on a timer, and the arrival flushes in one of its own long
  // before these do. Wait on the events themselves, never on a clock.
  const wanted = ['arrival_settled', 'map_interacted', 'sso_started'];
  const namesSoFar = () => batches.flatMap((b) => (b.sent?.events ?? []).map((e) => e.name));
  const sawThem = await (async () => {
    for (let n = 0; n < 60; n += 1) {
      if (wanted.every((name) => namesSoFar().includes(name))) return true;
      await wait(400);
    }
    return false;
  })();
  check('steeple was posted a batch at all', batches.length > 0, `${batches.length} batches`);
  check('and everything this browser saw reached it', sawThem, namesSoFar().join(' '));

  const events = batches.flatMap((b) => b.sent?.events ?? []);
  const names = events.map((e) => e.name);
  check('it was told how somebody arrived', names.includes('arrival_settled'), names.join(' '));
  const arrival = events.find((e) => e.name === 'arrival_settled');
  check(
    'saying where they were going and how they got there',
    arrival?.props?.destination === 'village' && arrival?.props?.entry === 'direct',
    JSON.stringify(arrival?.props)
  );
  check(
    'reported once, never once per hydration',
    names.filter((n) => n === 'arrival_settled').length === 1,
    String(names.filter((n) => n === 'arrival_settled').length)
  );
  check('and about the map', names.includes('map_interacted'), names.join(' '));
  check('and about the sign-in that was started', names.includes('sso_started'), names.join(' '));
  check(
    'every batch was accepted',
    batches.length > 0 && batches.every((b) => b.status === 202),
    JSON.stringify(batches.map((b) => b.status))
  );
  const sessionIds = new Set(batches.map((b) => b.sent?.sessionId));
  check('under one session id', sessionIds.size === 1 && Boolean([...sessionIds][0]), [...sessionIds].join(' '));
  check(
    'each event carries when it happened',
    batches.every((b) =>
      (b.sent?.events ?? []).every((e) => typeof e.occurredAt === 'string' && e.occurredAt.endsWith('Z'))
    )
  );
  // The gesture is counted once, not once per mousemove: a batcher that shipped
  // a frame's worth of pans would drown the taxonomy it is meant to serve.
  const pans = names.filter((n) => n === 'map_interacted').length;
  check('a drag is one event, not a hundred', pans > 0 && pans <= 3, `${pans} map events`);
  check('no batch is over the API’s limit', batches.every((b) => (b.sent?.events ?? []).length <= 50));

  // ── 2. Turnstile, absent ──────────────────────────────────────────────────
  console.log('\n2. no site key, no widget — and the writes still say null');
  await click('.account', 'the shelf’s Sign in');
  await wait(700);
  check('the identity panel is open', await visible('.signin .identity'));
  check('and carries no check nobody configured', !(await visible('.identity__check')));
  check(
    'no Turnstile script was loaded',
    await page.evaluate(
      () => ![...document.querySelectorAll('script')].some((s) => s.src.includes('challenges.cloudflare.com'))
    )
  );

  // ── 3. the providers, absent ──────────────────────────────────────────────
  console.log('\n3. no client id, no front door — and the dev provider stands');
  check('no provider buttons, with no client id for one', !(await page.$('.identity__providers')));
  check(
    'no provider SDK was fetched either',
    await page.evaluate(
      () =>
        ![...document.querySelectorAll('script')].some(
          (s) => s.src.includes('accounts.google.com') || s.src.includes('appleid.cdn-apple.com')
        )
    )
  );
  check(
    'so the dev provider is the way in, as it always has been',
    Boolean(await page.$('.identity__form, .identity__people'))
  );
  await page.keyboard.press('Escape');
  await wait(400);

  // ── 4. agreements ─────────────────────────────────────────────────────────
  //
  // Through the panel, the way a person signs in — which is where the question
  // is asked and answered. (The programmatic `signInPage` the rest of this suite
  // uses is a harness door, not a person's, and deliberately raises nothing.)
  console.log('\n4. what signing in agrees to');
  await click('.account', 'the shelf’s Sign in');
  await page.waitForSelector('.signin__layer:not([hidden]) .identity', { timeout: 10000 });
  await wait(500);
  await page.evaluate(() => {
    const swap = [...document.querySelectorAll('.signin .linkish')].find((n) =>
      /use an email/i.test(n.textContent)
    );
    swap?.click();
  });
  await page.waitForSelector('.signin #identity-email', { timeout: 10000 });
  await page.click('.signin #identity-email');
  await page.keyboard.type(guest.email, { delay: 4 });
  await page.click('.signin #identity-name');
  await page.keyboard.type(guest.name, { delay: 4 });
  await paceAuth();
  await page.keyboard.press('Enter');
  await page.waitForFunction('!!__steeple.session.currentUser()', { timeout: 20000 });
  await page
    .waitForFunction(() => !!document.querySelector('.signin .identity__legal'), { timeout: 20000 })
    .catch(() => {});
  check('a first sign-in is asked to agree', await visible('.signin .identity__legal'));
  const legal = (await text('.signin .identity__legal')) ?? '';
  check('naming both documents', /Terms & safety/.test(legal) && /Privacy policy/.test(legal), legal);
  const hrefs = await page.$$eval('.signin .identity__legal a', (nodes) => nodes.map((n) => n.getAttribute('href')));
  check('each one a page you can actually read', hrefs.join(' ') === 'terms.html privacy.html', hrefs.join(' '));
  const pages = await Promise.all(hrefs.map((href) => fetch(new URL(href, url).href).then((r) => r.status)));
  check('and both are served', pages.join(' ') === '200 200', pages.join(' '));
  // Scoped to the shelf's panel: the apply sheet keeps an identity step of its
  // own, and an unscoped `.identity` finds whichever is first in the document.
  check(
    'the button says what pressing it does',
    /Agree and continue/.test((await text('.signin .identity .pill--primary')) ?? ''),
    await text('.signin .identity .pill--primary')
  );

  const guestToken = await bearer();
  const before = await call('GET', '/me', { token: guestToken });
  check(
    'nothing is recorded before it is pressed',
    (before.body?.agreements ?? []).length === 0,
    JSON.stringify(before.body?.agreements)
  );
  await clickText('.signin .identity .pill--primary', /Agree and continue/, 'Agree and continue');
  await wait(1800);
  const after = await call('GET', '/me', { token: await bearer() });
  const recorded = (after.body?.agreements ?? []).map((a) => a.docType).sort();
  check('steeple recorded both documents', recorded.join(' ') === 'privacy tos', recorded.join(' '));
  const versions = new Set((after.body?.agreements ?? []).map((a) => a.version));
  check(
    'at the version the app is shipping',
    versions.size === 1 && /^\d{4}-\d{2}-\d{2}$/.test([...versions][0]),
    [...versions].join(' ')
  );
  check('and the panel is done asking', !(await visible('.signin .identity')));

  // The same person again, through the same door: asked once, not every time.
  await page.evaluate('__steeple.session.signOut()');
  await wait(800);
  await click('.account', 'the shelf’s Sign in');
  await page.waitForSelector('.signin__layer:not([hidden]) .identity', { timeout: 10000 });
  await wait(500);
  await page.evaluate(() => {
    const swap = [...document.querySelectorAll('.signin .linkish')].find((n) =>
      /use an email/i.test(n.textContent)
    );
    swap?.click();
  });
  await page.waitForSelector('.signin #identity-email', { timeout: 10000 });
  // Typed, not set: the form is the same DOM it was before the sign-out, and if
  // it still held the last address this would append to it and mint a *second*
  // account — which is exactly what it did until the session-end cleared it.
  check(
    'the box does not keep the last person’s address',
    (await page.$eval('.signin #identity-email', (n) => n.value)) === '',
    await page.$eval('.signin #identity-email', (n) => n.value)
  );
  await page.click('.signin #identity-email');
  await page.keyboard.type(guest.email, { delay: 4 });
  await page.click('.signin #identity-name');
  await page.keyboard.type(guest.name, { delay: 4 });
  await paceAuth();
  await page.keyboard.press('Enter');
  await page.waitForFunction('!!__steeple.session.currentUser()', { timeout: 20000 });
  await wait(2500);
  check('the same account came back', (await bearer()) && (await call('GET', '/me', { token: await bearer() })).body?.id === before.body?.id);
  check('a returning account is not asked again', !(await visible('.signin .identity__legal')));
  check('and the panel simply leaves', !(await visible('.signin .identity')));

  // ── 5. the group asking ───────────────────────────────────────────────────
  //
  // Driven as a real request, and asserted on the bytes that left: the group is
  // the request's own fact now, and the hardcoded email→organization table that
  // used to supply it is gone (D1).
  // Signing in is per-IP rated and this suite is close to the budget, so this
  // section reuses the session §4 left standing rather than minting another.
  console.log('\n5. the group asking is the request’s fact, not the account’s');
  await page.evaluate(
    (v, r) => window.__steeple.setView('apply', { venueId: v, roomId: r }),
    host.venueSlug,
    host.roomSlug
  );
  await page.waitForFunction(() => document.querySelectorAll('.week__cell').length > 0, { timeout: 30000 });
  check('the request sheet asks who is asking', Boolean(await page.$('#letter-organization')));
  const orgLabel = await page.$eval('label[for="letter-organization"]', (n) => n.textContent.trim());
  check('in the product’s own words', /group or organisation/i.test(orgLabel), orgLabel);
  check(
    'and says it is optional',
    /Optional/.test(await page.$eval('#letter-organization', (n) => n.parentElement.textContent))
  );

  await page.click('#letter-intent');
  await page.keyboard.type('A weekly hour for neighbours who would rather not meet in a kitchen.', { delay: 4 });
  await page.click('.choices .choice input');
  await page.click('#letter-size');
  await page.keyboard.type('14', { delay: 4 });
  const group = `Little Sparrows ${stamp}`;
  await page.click('#letter-organization');
  await page.keyboard.type(group, { delay: 4 });
  await wait(200);

  const painted = await page.evaluate(() => {
    const cell = [...document.querySelectorAll('.week__cell:not(.is-inert)')][6];
    if (!cell) return null;
    const box = cell.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });
  check('there is a free hour to paint', Boolean(painted));
  if (painted) await page.mouse.click(painted.x, painted.y);
  await wait(900);

  // What actually leaves this browser, read off the request itself.
  const submits = [];
  page.on('request', (request) => {
    if (/\/api\/v1\/listings\/[^/]+\/applications$/.test(request.url()) && request.method() === 'POST') {
      try {
        submits.push(JSON.parse(request.postData() ?? 'null'));
      } catch {
        submits.push(null);
      }
    }
  });

  await page.click('.letter__foot .pill--primary');
  await page.waitForFunction(
    () => document.querySelector('.letter')?.classList.contains('is-away') || !!document.querySelector('.letter__errors'),
    { timeout: 30000 }
  ).catch(() => {});
  await wait(1200);

  check('the request was really sent', submits.length === 1, `${submits.length} submits`);
  const sent = submits[0] ?? {};
  check('carrying the group that was typed', sent.organizationName === group, JSON.stringify(sent.organizationName));
  check('and a null Turnstile token, with no site key here', sent.turnstileToken === null, JSON.stringify(sent.turnstileToken));

  // And steeple kept it — the host's own read is the second half of the proof.
  const theirs = await call('GET', '/manage/applications', { token: host.token });
  const landed = (theirs.body?.items ?? theirs.body ?? []).find((a) => a.organizationName === group);
  check('steeple holds the group beside the request', Boolean(landed), JSON.stringify(sent.organizationName));

  // ── 6. a write is not a read ──────────────────────────────────────────────
  //
  // A real write this browser stops waiting for, produced by holding the
  // response open past the client's own write timeout. The whole point is the
  // sentence afterwards: the request may be finishing at steeple right now, so
  // nothing may promise the guest that nothing was sent (D8).
  console.log('\n6. a write waits longer than a read, and a timeout is not an absence');
  const second = await browser.newPage();
  try {
    await second.setViewport({ width: 1440, height: 900 });
    await second.goto(url, { waitUntil: 'networkidle0' });
    await second.waitForFunction('window.__steepleReady === true', { timeout: 30000 });
    await second.evaluate('__steeple.roll.set(1)');
    await signInPage(second, waiting.email, waiting.name);
    await second.waitForFunction('!!__steeple.session.currentUser()', { timeout: 20000 });

    await second.evaluate(
      (v, r) => window.__steeple.setView('apply', { venueId: v, roomId: r }),
      host.venueSlug,
      host.roomSlug
    );
    await second.waitForFunction(() => document.querySelectorAll('.week__cell').length > 0, { timeout: 30000 });
    await second.click('#letter-intent');
    await second.keyboard.type('An hour a week for a reading group.', { delay: 4 });
    await second.click('.choices .choice input');
    await second.click('#letter-size');
    await second.keyboard.type('9', { delay: 4 });
    const cell = await second.evaluate(() => {
      const free = [...document.querySelectorAll('.week__cell:not(.is-inert)')];
      const node = free[10] ?? free[free.length - 1];
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    });
    check('the second guest has an hour to ask for', Boolean(cell));
    if (cell) await second.mouse.click(cell.x, cell.y);
    await wait(900);
    check(
      'and a request steeple would accept',
      await second.$eval('.letter__foot .pill--primary', (n) => !n.disabled).catch(() => false)
    );

    // The submit leaves and is never answered. The client's own abort is what
    // has to fire — 15s for a write, where a read would have given up at 4.
    await second.setRequestInterception(true);
    let held = 0;
    second.on('request', (request) => {
      if (/\/api\/v1\/listings\/[^/]+\/applications$/.test(request.url()) && request.method() === 'POST') {
        held += 1;
        return; // neither continue nor abort: the response never comes
      }
      request.continue().catch(() => {});
    });

    const startedAt = Date.now();
    await second.click('.letter__foot .pill--primary');
    // 15s is the write timeout; 24s is long enough to see it fire and short
    // enough that a check about "before a person would" still means something.
    await second
      .waitForFunction(() => !!document.querySelector('.letter__errors')?.textContent?.trim(), {
        timeout: 24000,
      })
      .catch(() => {});
    const waited = Date.now() - startedAt;
    const said = (await second.$eval('.letter__errors', (n) => n.textContent.trim()).catch(() => '')) ?? '';

    check('the send was held open', held === 1, `${held} held`);
    check('the browser waited a write’s timeout, not a read’s', waited > 8000, `${Math.round(waited / 1000)}s`);
    check('and gave up before a person would', waited < 25000, `${Math.round(waited / 1000)}s`);
    check('it is never promised that nothing was sent', !/nothing was sent/i.test(said), said);
    check('it is told this may still have gone through', /may still have gone through/i.test(said), said);
    check('and the written request is still on the page', Boolean(await second.$('#letter-intent')));
  } finally {
    await second.close().catch(() => {});
  }

  // ── 7. the desk's hours are steeple's ─────────────────────────────────────
  console.log('\n7. hours a room keeps, not hours this browser remembers');
  await call('PUT', `/manage/rooms/${host.roomId}/availability`, {
    token: host.token,
    body: {
      days: [{ dayOfWeek: 'tuesday', windows: [{ startTime: '09:00', endTime: '17:00' }] }],
      blackouts: [],
    },
  });

  // This browser becomes the host, having never set an hour in its life.
  await page.evaluate('__steeple.session.signOut()');
  await wait(800);
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__steepleReady === true', { timeout: 30000 });
  await signInPage(page, host.email, host.name);
  await page.waitForFunction('!!__steeple.session.currentUser()', { timeout: 20000 });
  // Reload forgets the memory-only mirror while the cookie restores the
  // session, so whatever the desk prints next came from steeple.
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__steepleReady === true', { timeout: 30000 });
  await page.waitForFunction('!!__steeple.session.currentUser()', { timeout: 20000 });
  await page.evaluate('__steeple.roll.set(1)');
  await wait(800);
  await page.evaluate('__steeple.setMode("host")');
  await page
    .waitForFunction(() => document.querySelectorAll('.desk .tab').length > 0, { timeout: 30000 })
    .catch(() => {});
  await wait(2500);
  // In-page, not by pointer: the desk's own reads redraw the tab strip under a
  // mouse aimed at where a tab used to be.
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll('.desk .tab')].find((n) => /Spaces/.test(n.textContent));
    tab?.click();
  });
  await page
    .waitForFunction(() => document.querySelectorAll('.space__hours').length > 0, { timeout: 30000 })
    .catch(() => {});
  const hours = await page.$$eval('.space__hours', (nodes) => nodes.map((n) => n.textContent.trim()));
  check('the Spaces tab has hours to print', hours.length > 0, hours.join(' | '));
  check('printed from steeple, never told them locally', hours.some((h) => /Tue/.test(h)), hours.join(' | '));
  check('and calls no room with hours empty', !hours.some((h) => /No open hours/.test(h)), hours.join(' | '));
  const mirrored = await store(`openHoursFor('${host.venueSlug}','${host.roomSlug}')`);
  check('the mirror holds steeple’s own window', mirrored?.length === 1 && mirrored[0].day === 2, JSON.stringify(mirrored));

  // ── 8. the SEO floor ──────────────────────────────────────────────────────
  console.log('\n8. what a crawler and a share card are handed');
  const origin = new URL(url).origin;
  const robots = await fetch(new URL('robots.txt', url).href);
  const robotsText = await robots.text();
  check('robots.txt answers as plain text', robots.status === 200 && /^User-agent:/m.test(robotsText), String(robots.status));
  check('and it is not the app shell', !/<!doctype html>/i.test(robotsText));
  // The API renders this file for one reason: sitemaps.org reads `Sitemap:` as a
  // fully-qualified URL and ignores a relative one, so a relative line is an
  // undiscoverable sitemap (docs/contracts/seo.md).
  check(
    'naming the sitemap at an absolute URL, at this very origin',
    robotsText.includes(`Sitemap: ${origin}/sitemap.xml`),
    robotsText.trim().split('\n').pop()
  );

  const sitemap = await fetch(`${API}/sitemap.xml`);
  const xml = await sitemap.text();
  check('the API renders sitemap XML', sitemap.status === 200, String(sitemap.status));
  check('as XML, said so', (sitemap.headers.get('content-type') ?? '').includes('xml'), sitemap.headers.get('content-type'));
  check('to the sitemaps.org schema', xml.includes('http://www.sitemaps.org/schemas/sitemap/0.9'));
  check('with this run’s own listing in it', xml.includes(`/space/${host.venueSlug}/${host.roomSlug}`));
  // Where a public URL comes from: Seo:PublicBaseUrl, or — unset, as here — the
  // request's own origin. Never a header. A stranger who says the site lives at
  // their address gets told the same URLs as everybody else (design.md §7).
  const spoofHeaders = {
    'X-Forwarded-Host': 'steeple.example',
    'X-Forwarded-Prefix': '/steeple',
  };
  const forwarded = await fetch(`${API}/sitemap.xml`, { headers: spoofHeaders }).then((r) => r.text());
  check(
    'and nobody can rename the origin its URLs advertise',
    !forwarded.includes('steeple.example') && !forwarded.includes('/steeple/'),
    forwarded.match(/<loc>[^<]*<\/loc>/)?.[0]
  );
  const forwardedRobots = await fetch(new URL('robots.txt', url).href, { headers: spoofHeaders }).then((r) => r.text());
  check(
    'nor the sitemap robots.txt sends them to',
    forwardedRobots.includes(`Sitemap: ${origin}/sitemap.xml`),
    forwardedRobots.trim().split('\n').pop()
  );

  const shell = await fetch(url).then((r) => r.text());
  check('the page carries an OG title', /property="og:title"/.test(shell));
  check('and an OG description', /property="og:description"/.test(shell));
  check('and a Twitter card', /name="twitter:card"/.test(shell));
  check('and a WebSite JSON-LD block', /application\/ld\+json/.test(shell) && /"@type":\s*"WebSite"/.test(shell));
  check(
    'and no og:image standing one listing in for all of them',
    !/property="og:image"/.test(shell)
  );

  console.log(`\n──── ${checks - failures}/${checks} checks passed · ${problems.length} console problems ────`);
  for (const problem of problems.slice(0, 10)) console.log(`   · ${problem}`);
} catch (error) {
  console.log(`\nthe run stopped: ${error.stack ?? error.message}`);
  failures += 1;
} finally {
  await closeBrowsers();
}

process.exit(failures ? 1 : 0);
