#!/usr/bin/env node
// THE ACCOUNT SURFACE, driven for real (v2 migration Phase 1 / design D6).
//
//   node tools/account-test.mjs "http://localhost:5173/?q=low"
//
// Needs the API on :5200 (the vite proxy's target) with Auth:DevLoginEnabled —
// every sign-in here is a real POST /auth/sessions and the sign-out is a real
// DELETE, checked by replaying the refresh token the browser was holding.
// World-ON is the documented state: the suite scrolls the roll down itself.
//
// What it proves:
//   1. a fresh visitor sees no inbox, no badge, no verified chip, and one way in
//   2. the shelf's Sign in opens the same identity panel the flows use
//   3. signing in shows the chip and an empty inbox
//   4. signing out revokes the session at steeple, not just here
//   5. a second account on the same browser inherits none of the first's state
//   6. an expired session says so instead of vanishing

import puppeteer from 'puppeteer';

const url = process.argv[2] ?? 'http://localhost:5173/?q=low';
// The wire is checked from here too — same origin as the page, so the vite
// proxy forwards it to the API exactly as the browser's own calls are.
const origin = new URL(url).origin;

const browser = await puppeteer.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  // Two kinds of noise are not this page's doing: the wire's own refusals are
  // the point of §4 and §6 (a spent token answering 401 is the suite working),
  // and map tiles and photographs come from the open internet, which a sealed
  // machine does not have.
  if (m.type() !== 'error') return;
  const from = m.location()?.url ?? '';
  const text = m.text();
  if (text.includes('GL Driver') || from.includes('/api/v1/')) return;
  if (/ERR_(CONNECTION_REFUSED|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|TIMED_OUT)/.test(text)) return;
  problems.push(`console: ${text} ${from}`);
});

let checks = 0;
let failed = 0;
function check(label, ok, detail = '') {
  checks += 1;
  if (!ok) failed += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? `: ${detail}` : ''}`);
}
const eq = (label, actual, wanted) =>
  check(label, String(actual) === String(wanted), `${JSON.stringify(actual)}${String(actual) === String(wanted) ? '' : ` (wanted ${JSON.stringify(wanted)})`}`);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// Opacity counts. `checkVisibility()` says a surface faded to nothing is
// visible, which is exactly the failure a panel that never got its opening
// class produces — and it looks like a pass.
const visible = (selector) =>
  page.evaluate((s) => {
    const node = document.querySelector(s);
    if (!node) return false;
    if (node.checkVisibility ? !node.checkVisibility() : node.hidden) return false;
    for (let at = node; at instanceof Element; at = at.parentElement) {
      if (Number(getComputedStyle(at).opacity) < 0.05) return false;
    }
    return true;
  }, selector);
// Headless app-time runs several times slow, so a fade that takes 180ms on a
// desk takes a second here: wait on the state, never on the clock.
const waitVisible = async (selector, timeout = 15000) => {
  try {
    await page.waitForFunction(
      (s) => {
        const node = document.querySelector(s);
        if (!node) return false;
        if (node.checkVisibility ? !node.checkVisibility() : node.hidden) return false;
        for (let at = node; at instanceof Element; at = at.parentElement) {
          if (Number(getComputedStyle(at).opacity) < 0.9) return false;
        }
        return true;
      },
      { timeout },
      selector
    );
    return true;
  } catch {
    return false;
  }
};

const text = (selector) =>
  page.evaluate((s) => document.querySelector(s)?.textContent?.trim() ?? null, selector);
const clickOn = async (selector) => {
  const handle = await page.$(selector);
  if (!handle) return false;
  const box = await handle.boundingBox();
  if (!box) return false;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await wait(500);
  return true;
};

async function land(target = url) {
  await page.goto(target, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__steepleReady === true', { timeout: 30000 });
  // Down to the product: the shelf only stands once the roll has landed.
  await page.evaluate('__steeple.roll.set(1)');
  await page.waitForFunction('__steeple.state.roll === 1', { timeout: 20000 });
  await wait(900);
}

const stamp = Date.now().toString(36);
const FIRST = { email: `p1-first-${stamp}@demo.steeple.test`, name: 'Ada First' };
const SECOND = { email: `p1-second-${stamp}@demo.steeple.test`, name: 'Bea Second' };

// A panel still sliding into place is a moving target: a click measured before
// the transform lands can arrive somewhere else entirely. Wait for it to stop.
const waitSettled = async (timeout = 20000) => {
  await page.waitForFunction(
    () => {
      const sheet = document.querySelector('.signin');
      const layer = document.querySelector('.signin__layer');
      if (!sheet || !layer || layer.hidden) return false;
      return (
        getComputedStyle(sheet).transform === 'none' && Number(getComputedStyle(layer).opacity) > 0.99
      );
    },
    { timeout }
  );
};

const signInThroughPanel = async (who) => {
  await clickOn('.account');
  await page.waitForSelector('.signin__layer:not([hidden]) .identity', { timeout: 5000 });
  await waitSettled();
  // The panel opens on the people this village knows; anyone else uses the form.
  await page.evaluate(() => {
    const swap = [...document.querySelectorAll('.signin .linkish')].find((n) =>
      /use an email/i.test(n.textContent)
    );
    swap?.click();
  });
  await page.waitForSelector('.signin #identity-email', { timeout: 5000 });
  await waitSettled();
  await page.click('.signin #identity-email');
  await page.keyboard.type(who.email);
  await page.click('.signin #identity-name');
  await page.keyboard.type(who.name);
  const typed = await page.evaluate(() => ({
    email: document.querySelector('.signin #identity-email')?.value ?? '',
    name: document.querySelector('.signin #identity-name')?.value ?? '',
  }));
  eq('the address went into the form', typed.email, who.email);
  eq('and the name beside it', typed.name, who.name);
  await page.keyboard.press('Enter');
  await page.waitForFunction('!!__steeple.session.currentUser()', { timeout: 20000 });
  await wait(800);
};

console.log(`\n──── the account surface · ${url} ────`);

// ── 1. a fresh visitor ──────────────────────────────────────────────────────
console.log('\n1. nobody is signed in');
await land();
eq('the browser holds no session', await page.evaluate('!!__steeple.session.currentUser()'), 'false');
check('no inbox tab on the shelf', !(await visible('.letters')));
check('no badge to count', !(await visible('.letters__count')));
check(
  'no verified chip anywhere on the page',
  await page.evaluate(
    () => ![...document.querySelectorAll('.verified')].some((n) => n.checkVisibility())
  )
);
check('the shelf offers a way in', await visible('.account'));
eq('and it says so plainly', await text('.account'), 'Sign in');
await page.screenshot({ path: '/tmp/steeple-webp1-signed-out.png' });

console.log('\n1b. correspondence cannot be reached by link');
await page.goto(`${origin}/#/journal`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__steepleReady === true', { timeout: 30000 });
await wait(1500);
eq('a cold link to the inbox lands in the village', await page.evaluate('__steeple.state.view'), 'village');

// ── 2. the shelf opens the panel the flows use ──────────────────────────────
console.log('\n2. the way in');
await land();
check('Sign in opens something', await clickOn('.account'));
check('it is the identity panel, fully on the page', await waitVisible('.signin__layer .identity'));
eq('titled for the moment', await text('.signin .identity__title'), 'Sign in to Steeple');
check(
  'no trust chip is claimed before there is a session',
  await page.evaluate(
    () => ![...document.querySelectorAll('.signin .verified')].some((n) => n.checkVisibility())
  )
);
await page.screenshot({ path: '/tmp/steeple-webp1-panel.png' });
await page.keyboard.press('Escape');
await wait(400);
check('Escape puts it away', !(await visible('.signin__layer .identity')));
eq('and takes no view with it', await page.evaluate('__steeple.state.view'), 'village');

// ── 3. signing in ───────────────────────────────────────────────────────────
console.log('\n3. signing in through the shelf');
await signInThroughPanel(FIRST);
check('the panel closed itself', !(await visible('.signin__layer .identity')));
eq('the chip names the person', await text('.account__who'), 'Ada');
check('the inbox tab appears', await visible('.letters'));
check('with nothing waiting', !(await visible('.letters__count')));
await clickOn('.letters');
await wait(900);
eq('the inbox opens', await page.evaluate('__steeple.state.view'), 'journal');
eq('and it is empty', await page.evaluate('__steeple.store.guestApplications().length'), '0');
eq('named for whoever signed in', await text('.journal__who'), 'Ada First');
check('the trust chip is earned now', await visible('.journal__aside .verified'));
await page.screenshot({ path: '/tmp/steeple-webp1-signed-in.png' });

// Something of this person's own, so the next account has something to not see.
//
// Filed through the mirror rather than invented locally: since v2_migration
// Phase 2 the store holds steeple's own documents and nothing else, so what
// stands in for a person's correspondence here is an ApplicationDto shaped
// exactly as the wire sends one.
const FIRST_MARK = `only ${FIRST.name} wrote this`;
await page.evaluate(
  (body) => {
    const store = window.__steeple.store;
    if (store.guestApplications().length) return;
    const me = window.__steeple.session.currentUser();
    const startDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    store.mirrorApplication({
      id: '0a0a0a0a-0000-4000-8000-00000000a001',
      roomId: '0b0b0b0b-0000-4000-8000-00000000b001',
      roomName: 'Fellowship Hall',
      venueName: 'Grace Community Church of Vienna',
      venueSlug: 'grace-community-vienna',
      roomSlug: 'fellowship-hall',
      organizer: { id: me.id, displayName: me.displayName, ratingSummary: null },
      activityType: 'community',
      groupSize: 12,
      schedule: {
        frequency: 'oneOff',
        startDate,
        endDate: startDate,
        daysOfWeek: null,
        startTime: '10:00:00',
        endTime: '12:00:00',
      },
      intentText: body,
      status: 'pending',
      createdAtUtc: new Date().toISOString(),
      decidedAtUtc: null,
      expiresAtUtc: new Date(Date.now() + 14 * 86400000).toISOString(),
      bookingId: null,
      messageCount: 0,
      messages: [],
    });
  },
  FIRST_MARK
);
await wait(600);
eq('a request of their own is filed', await page.evaluate('__steeple.store.guestApplications().length'), '1');
await page.evaluate("__steeple.setView('journal')");
await wait(700);
eq('the inbox shows it', await page.evaluate('document.querySelectorAll(".jrow").length'), '1');

// ── 4. signing out revokes the session at steeple ───────────────────────────
console.log('\n4. signing out');
const stored = await page.evaluate("JSON.parse(localStorage.getItem('steeple-village-session'))");
check('storage holds the person', Boolean(stored?.user?.id));
check('and no token of any kind', !stored?.accessToken && !stored?.refreshToken);
check(
  'the refresh token is a cookie script cannot read',
  !(await page.evaluate('document.cookie')).includes('steeple_refresh')
);
const jar = await page.cookies();
const refreshCookie = jar.find((c) => c.name === 'steeple_refresh');
check('but the browser is holding one', Boolean(refreshCookie), refreshCookie?.httpOnly ? 'httpOnly' : '');

// The cookie alone rotates, which is what the session's whole boot depends on.
const stillGood = await page.evaluate(async () => {
  const response = await fetch('api/v1/auth/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  return response.status;
});
eq('which steeple honours while the session lives', stillGood, 200);

await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction('window.__steepleReady === true', { timeout: 30000 });
await page.evaluate('__steeple.roll.set(1)');
await wait(1200);

await clickOn('.account');
await wait(300);
check('the card offers a way out', await visible('.account__out'));
check(
  'and no global sign-out action',
  await page.evaluate(
    () =>
      ![...document.querySelectorAll('#account-card button')].some(
        (button) => button.textContent?.trim() === 'Sign out everywhere'
      )
  )
);
await page.screenshot({ path: '/tmp/steeple-webp1-card.png' });
// Held for the replay below. Only the harness can read this: it is httpOnly, so
// the page itself has no way to, which is the point of §4's first checks.
const live = (await page.cookies()).find((c) => c.name === 'steeple_refresh')?.value;
await clickOn('.account__out');
await wait(1200);

eq('the browser holds nobody', await page.evaluate('!!__steeple.session.currentUser()'), 'false');
eq(
  'and storage names nobody either',
  await page.evaluate("String(JSON.parse(localStorage.getItem('steeple-village-session') ?? 'null')?.user)"),
  'null'
);
check(
  'the refresh cookie is gone with it',
  !(await page.cookies()).some((c) => c.name === 'steeple_refresh' && c.value)
);
check('the inbox tab is gone', !(await visible('.letters')));
eq('the shelf offers the way back in', await text('.account'), 'Sign in');
eq('and the view is the village', await page.evaluate('__steeple.state.view'), 'village');
check(
  'no verified chip survives the sign-out',
  await page.evaluate(
    () => ![...document.querySelectorAll('.verified')].some((n) => n.checkVisibility())
  )
);

// The token the cookie was carrying, replayed from outside the browser: the
// sign-out has to have ended it at steeple, not merely here.
const replayed = await fetch(`${origin}/api/v1/auth/refresh`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ refreshToken: live }),
});
eq('steeple has revoked the family — replaying the refresh token', replayed.status, 401);

// ── 5. the next person on the same browser ──────────────────────────────────
console.log('\n5. somebody else, same browser');
await signInThroughPanel(SECOND);
eq('the chip names them', await text('.account__who'), 'Bea');
eq('their inbox is their own', await page.evaluate('__steeple.store.guestApplications().length'), '0');
await page.evaluate("__steeple.setView('journal')");
await wait(800);
eq('nothing of the first account is on the page', await page.evaluate('document.querySelectorAll(".jrow").length'), '0');
check(
  'and none of their words are in memory',
  !(await page.evaluate(
    (mark) => JSON.stringify(window.__steeple.store.guestApplications()).includes(mark),
    FIRST_MARK
  ))
);
await page.screenshot({ path: '/tmp/steeple-webp1-second.png' });

// ── 6. a session that ends without being asked ──────────────────────────────
console.log('\n6. a session that expires under them');
// The person is still written down; the credential that proves it is not. Taking
// the httpOnly cookie is the only way to stage this now — which is the point.
const held = (await page.cookies()).find((c) => c.name === 'steeple_refresh');
const cdp = await page.createCDPSession();
await cdp.send('Network.deleteCookies', { name: held.name, domain: held.domain, path: held.path });
await cdp.detach();
check(
  'the credential really is gone before the reload',
  !(await page.cookies()).some((c) => c.name === 'steeple_refresh' && c.value)
);
// Not networkidle0: with no access token in memory the session now expires in
// the first breath of boot, and the slip lives twelve seconds. Waiting for the
// map's blocked tiles to give up first can spend the whole of it.
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__steepleReady === true', { timeout: 30000 });
await page.evaluate('__steeple.roll.set(1)');
await page.waitForFunction('!__steeple.session.currentUser()', { timeout: 20000 }).catch(() => {});
eq('the dead session is dropped', await page.evaluate('!!__steeple.session.currentUser()'), 'false');
check('and the page says so rather than going quiet', await waitVisible('.slip'));
eq('in words', await text('.slip__line'), "You've been signed out.");
await page.screenshot({ path: '/tmp/steeple-webp1-expired.png' });
check('with a way back in', await waitVisible('.slip .linkish'));
await clickOn('.slip .linkish');
check('which opens the panel', await waitVisible('.signin__layer .identity'));

console.log(`\n──── ${checks - failed}/${checks} checks passed · ${problems.length} console problems ────`);
for (const problem of problems.slice(0, 8)) console.log(`      ${problem}`);
console.log('');
await browser.close();
process.exit(failed || problems.length ? 1 : 0);
