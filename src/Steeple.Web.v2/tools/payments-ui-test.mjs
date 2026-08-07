// THE PAYMENTS SURFACE, DRIVEN FOR REAL (v2 migration Phase 2.5).
//
//   node tools/payments-ui-test.mjs "http://localhost:5275/?q=low&world=off"
//
// Money is the part of this product that cannot be demonstrated with a
// screenshot: every claim it makes — this was paid, this failed, this was
// refunded, this is what you are owed — is only true if steeple says so. So
// every check here is driven in a real browser against real rows, and the
// database is asked afterwards whether the page was telling the truth.
//
//   §1  the desk's IA: an instant venue has Bookings and Spaces and NO Requests
//       tab; a manual venue has all three. Requests is the wrong primary noun
//       under instant-book-by-default, and a tab that can only ever be empty
//       teaches the wrong model of the product.
//   §2  the guest's booking view: the frozen per-session price, the next
//       charge, each date's own charge state — and, on a card that declines
//       every charge (last4 0002), steeple's failure ladder with the fix on it.
//   §3  the rescind lever: two presses, an honest warning, and a refund that
//       shows on both sides and in the database.
//   §4  payouts: the prompt, the mock KYC screen, and the connected state.
//   §5  the booking-mode toggle: flipping a venue changes the public room's
//       apply UX, on the wire and on the page.
//   §6  a reminder, seeded as the notification steeple writes, rendering as the
//       quiet slip a visiting person sees without clicking anything.
//
// Needs: the API (STEEPLE_API, default http://localhost:5215/api/v1) with
// Auth:DevLoginEnabled and payments.enabled, this app on the given origin with
// its proxy pointed at that same API, and `psql` reachable at the dev database.
// psql stands in for two things and only two: the operator's approve on a new
// newly claimed venue's first listing (no API by design), and
// seeding one notification row so §6 is deterministic rather than waiting on
// the 15-minute reminder worker.
//
// World-OFF is the documented state — this suite is about money, not village.
//
// Rate limits are per-account, and `auth` is per-IP (10/min): every sign-in
// here goes through paceAuth().
//
// The fixtures — the host who keeps a venue, the guest with a card, the weekly
// ask — are `tools/fixtures.mjs`, shared with every other wire-era suite.

import {
  API,
  apiIsUp,
  apply,
  call,
  closeBrowsers,
  launch,
  mintGuest,
  mintVenue,
  signInPage as signInAs,
  sql,
  stamp,
} from './fixtures.mjs';

const url = process.argv[2] ?? 'http://localhost:5275/?q=low&world=off';

let checks = 0;
let failures = 0;
const problems = [];
const wireLog = [];

async function lastWords(error) {
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



/** Wait for the post-commit charge to land, whichever way it lands. */
async function settledBooking(bookingId, token, { tries = 30 } = {}) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const read = await call('GET', `/bookings/${bookingId}`, { token });
    const first = read.body?.occurrences?.[0];
    if (first?.paymentStatus && first.paymentStatus !== 'pending') return read.body;
    await new Promise((r) => setTimeout(r, 400));
  }
  const read = await call('GET', `/bookings/${bookingId}`, { token });
  return read.body;
}

// ── the browser ──────────────────────────────────────────────────────────────

async function openPage(label) {
  const browser = await launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('pageerror', (e) => problems.push(`[${label}] ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // Shared-database photo bytes may live in another worktree's media-store —
    // environmental, not this suite's.
    if (/Failed to load resource|402|409|ERR_/.test(text)) return;
    problems.push(`[${label}] ${text}`);
  });
  page.on('response', (response) => {
    const at = response.url();
    if (!at.includes('/api/v1')) return;
    wireLog.push(`[${label}] ${response.status()} ${response.request().method()} ${at.replace(/^https?:\/\/[^/]+/, '')}`);
  });
  return page;
}

const settle = (page) => page.evaluate(() => new Promise((r) => setTimeout(r, 200)));

// A photograph proves nothing about interactivity — every claim in this file is
// driven with real events. `STEEPLE_SHOTS=/some/dir` is for the other job a
// harness is good for: looking at what was built, on the way past.
const SHOTS = process.env.STEEPLE_SHOTS ?? null;
const shot = async (page, name) => {
  if (!SHOTS) return;
  await page.screenshot({ path: `${SHOTS}/${name}.png` }).catch(() => {});
};

/** Wait for something to be there and to have stopped moving. */
async function steady(page, selector, timeout = 15000) {
  await page.waitForSelector(selector, { timeout });
  try {
    await page.waitForFunction(
      (sel) => {
        const node = document.querySelector(sel);
        if (!node) return false;
        const box = (node.closest('label') ?? node).getBoundingClientRect();
        if (box.width < 1 || box.height < 1) return false;
        for (let at = node.parentElement; at && at !== document.documentElement; at = at.parentElement) {
          const style = getComputedStyle(at);
          if (style.visibility === 'hidden' || Number(style.opacity) < 0.9) return false;
        }
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
            faded.push(`${at.tagName.toLowerCase()}.${String(at.className).trim().split(/\s+/)[0]} opacity=${style.opacity}`);
          }
        }
        if (faded.length) return `a container never came in: ${faded.join(' / ')}`;
        return `it is still moving (box now ${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.width)})`;
      }, selector)
      .catch(() => 'the page would not answer');
    throw new Error(`${selector} never settled — ${why}`);
  }
}

/** A real click on a surface that redraws itself. */
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

async function boot(page, at = url) {
  await page.goto(at, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__steepleReady === true, { timeout: 30000 });
  // The app writes its first view onto the address bar a moment after boot. That
  // is a same-document navigation, and one landing in the middle of an
  // `evaluate` is reported as "execution context was destroyed" — a sentence
  // that describes the harness's timing and nothing about the app. Wait for the
  // hash to be there before anything is asked of the page.
  await page.waitForFunction(() => window.location.hash !== '', { timeout: 10000 }).catch(() => {});
  await settle(page);
}

async function signInPage(page, email, name) {
  await signInAs(page, email, name);
  await settle(page);
}

/** Put the page on the product surface, the way the roll does. */
const arrive = (page) => page.evaluate(() => window.__steeple.roll?.set?.(1));

const shape = (page) =>
  page
    .evaluate(() => ({
      view: window.__steeple?.state?.view ?? null,
      mode: window.__steeple?.state?.mode ?? null,
      roll: window.__steeple?.state?.roll ?? null,
      signedIn: window.__steeple?.session?.isSignedIn?.() ?? null,
      tabs: [...document.querySelectorAll('.desk .tab')].map((t) => t.dataset.tab),
      surfaces: [...document.querySelectorAll('[class*="is-open"]')].map((n) => String(n.className)),
    }))
    .catch(() => null);

async function until(page, fn, arg = null, timeout = 30000, what = 'the condition') {
  try {
    await page.waitForFunction(fn, { timeout, polling: 120 }, arg);
  } catch (error) {
    throw new Error(`${what} never came true within ${timeout}ms — page was ${JSON.stringify(await shape(page))}`);
  }
}

/** Open the desk as a signed-in host, through the affordance a host uses. */
async function openDesk(page) {
  await press(page, '.porchswitch');
  await until(
    page,
    () => window.__steeple.state.mode === 'host' && window.__steeple.state.view === 'desk',
    null,
    30000,
    'the desk opened'
  );
  await until(page, () => document.querySelectorAll('.desk .tab').length > 0, null, 30000, 'the desk drew its tabs');
  await settle(page);
}

const tabsOf = (page) =>
  page.evaluate(() => [...document.querySelectorAll('.desk .tab')].map((t) => t.dataset.tab));

const textOf = (page, selector) =>
  page.evaluate((sel) => document.querySelector(sel)?.textContent?.trim() ?? null, selector);

// ── the run ──────────────────────────────────────────────────────────────────

const up = await apiIsUp();
if (!up) {
  console.log(`\nThe steeple API is not answering at ${API} — this suite needs it.`);
  process.exit(2);
}

// `mintVenue` throws when steeple refuses; the two things worth naming as checks
// are what it hands back — the mode the venue is really in, and that the public
// can read the room.
function kept(fixture) {
  if (fixture.bookingModeAsked) {
    eq(`fixture: ${fixture.venueName} is in ${fixture.bookingModeAsked} mode`, fixture.bookingMode, fixture.bookingModeAsked);
  }
  check(`fixture: ${fixture.roomName} is published and readable`, fixture.listingStatus === 200, `status ${fixture.listingStatus}`);
  return fixture;
}

console.log('\nfixtures');
const instant = kept(
  await mintVenue({
    email: `pay-host-i-${stamp}@example.org`,
    name: 'Owen Marsh',
    venueName: `Cedar Rooms ${stamp}`,
    roomName: 'Garden Room',
    bookingMode: null,
  })
);
const manual = kept(
  await mintVenue({
    email: `pay-host-m-${stamp}@example.org`,
    name: 'Ruth Callaghan',
    venueName: `Saint Bride Hall ${stamp}`,
    roomName: 'Long Room',
    bookingMode: 'manual',
  })
);

const payer = await mintGuest({ email: `pay-guest-${stamp}@example.org`, name: 'Nadia Prosser' });
const decliner = await mintGuest({
  email: `pay-decline-${stamp}@example.org`,
  name: 'Tom Reddick',
  last4: '0002',
});

const paidApplication = await apply(payer, instant, { dow: 3 });
eq('an instant venue books the ask on the spot', paidApplication.status, 'approved');
check('and the booking is named on the answer', Boolean(paidApplication.bookingId));
const paidBooking = await settledBooking(paidApplication.bookingId, payer.token);
eq('the first date charges at confirmation', paidBooking.occurrences?.[0]?.paymentStatus, 'succeeded');
eq('the booking carries an in-app payment block', paidBooking.payment?.mode, 'inApp');
check(
  'with the price snapshot frozen on it',
  Number(paidBooking.payment?.perOccurrenceAmount) === 40,
  `got ${paidBooking.payment?.perOccurrenceAmount}`
);

const failedApplication = await apply(decliner, instant, { dow: 5 });
const failedBooking = await settledBooking(failedApplication.bookingId, decliner.token);
eq('a card that declines every charge fails the first date', failedBooking.occurrences?.[0]?.paymentStatus, 'failed');

// ── 1. the desk's IA ────────────────────────────────────────────────────────

console.log('\n1 · Bookings · Requests · Spaces');

const instantHostPage = await openPage('instant-host');
await boot(instantHostPage);
await arrive(instantHostPage);
await signInPage(instantHostPage, instant.email, instant.name);
await openDesk(instantHostPage);

const instantTabs = await tabsOf(instantHostPage);
check('an instant venue leads with Bookings', instantTabs[0] === 'bookings', JSON.stringify(instantTabs));
check('it keeps Spaces', instantTabs.includes('spaces'), JSON.stringify(instantTabs));
check('and it has no Requests tab at all', !instantTabs.includes('letters'), JSON.stringify(instantTabs));
eq(
  'the desk opens on Bookings, not on a pile of requests',
  await instantHostPage.evaluate(() => document.querySelector('.desk .tab.is-on')?.dataset.tab),
  'bookings'
);

const bookingCards = await instantHostPage.evaluate(() =>
  [...document.querySelectorAll('.desk .booking')].map((node) => ({
    room: node.querySelector('.booking__room')?.textContent,
    who: node.querySelector('.booking__who')?.textContent,
    next: node.querySelector('.booking__next')?.textContent ?? null,
    charges: [...node.querySelectorAll('.dates__charge')].map((c) => c.textContent),
    canCancel: Boolean(node.querySelector('[data-action="cancel"]')),
  }))
);
check('both confirmed bookings stand on it', bookingCards.length === 2, `saw ${bookingCards.length}`);
check(
  'each names the group holding it',
  bookingCards.every((card) => card.who && card.who.length > 1),
  JSON.stringify(bookingCards.map((c) => c.who))
);
check(
  'a paid date reads as paid',
  bookingCards.some((card) => card.charges.includes('Paid')),
  JSON.stringify(bookingCards.map((c) => c.charges))
);
check(
  'a failed date reads as failed, on the host side too',
  bookingCards.some((card) => card.charges.includes('Payment failed')),
  JSON.stringify(bookingCards.map((c) => c.charges))
);
check(
  'the next payment is said in money and a date',
  bookingCards.some((card) => /Next payment \$\d/.test(card.next ?? '')),
  JSON.stringify(bookingCards.map((c) => c.next))
);
check('and every booking carries the rescind lever', bookingCards.every((card) => card.canCancel));
await shot(instantHostPage, '1-desk-bookings');

const manualHostPage = await openPage('manual-host');
await boot(manualHostPage);
await arrive(manualHostPage);
await signInPage(manualHostPage, manual.email, manual.name);
await openDesk(manualHostPage);
const manualTabs = await tabsOf(manualHostPage);
check(
  'a manual venue keeps all three',
  manualTabs.includes('bookings') && manualTabs.includes('letters') && manualTabs.includes('spaces'),
  JSON.stringify(manualTabs)
);

// ── 2. the guest's booking view ─────────────────────────────────────────────

console.log('\n2 · what a booking costs, and what has been paid');

const payerPage = await openPage('payer');
await boot(payerPage);
await arrive(payerPage);
await signInPage(payerPage, payer.email, payer.name);
await payerPage.evaluate((id) => window.__steeple.setView('letter', { applicationId: id }), paidApplication.id);
await until(payerPage, () => Boolean(document.querySelector('.held')), null, 30000, 'the held dates drew');
await settle(payerPage);

const paidView = await payerPage.evaluate(() => ({
  rate: document.querySelector('.held__rate')?.textContent ?? null,
  next: document.querySelector('.held__next')?.textContent ?? null,
  paid: document.querySelector('.held__paid')?.textContent ?? null,
  charges: [...document.querySelectorAll('.held__charge')].map((c) => c.textContent),
  failed: Boolean(document.querySelector('.held__failed')),
}));
check('the frozen per-session price is printed', /\$40/.test(paidView.rate ?? ''), JSON.stringify(paidView.rate));
check('so is when the next payment falls', /Next payment \$\d/.test(paidView.next ?? ''), JSON.stringify(paidView.next));
check('and what has already been taken', /1 date paid so far/.test(paidView.paid ?? ''), JSON.stringify(paidView.paid));
check('the charged date says Paid', paidView.charges.includes('Paid'), JSON.stringify(paidView.charges));
eq('a booking whose card is good says nothing about failure', paidView.failed, false);
await shot(payerPage, '2-guest-paid');

// The card is the account's, not the send's: it has to be answerable from the
// shelf at any moment, not only in the middle of a request.
await press(payerPage, '.porch .account');
await until(
  payerPage,
  () => Boolean(document.querySelector('.account__method')),
  null,
  20000,
  'the account card opened'
);
await until(
  payerPage,
  () => document.querySelector('.account__method')?.textContent !== 'Checking…',
  null,
  20000,
  'the account card read the method on file'
);
eq(
  'the account carries the card on file, as brand and four digits',
  await textOf(payerPage, '.account__method'),
  'Visa ···· 4242'
);
await shot(payerPage, '2-account-card');
await press(payerPage, '[data-action="card"]');
await until(
  payerPage,
  () => Boolean(document.querySelector('.cardpanel__layer.is-open')),
  null,
  20000,
  'the account opens the same card panel'
);
check('and one way to replace it, which is the same panel the letter opens', true);
await payerPage.keyboard.press('Escape');
await settle(payerPage);

const declinerPage = await openPage('decliner');
await boot(declinerPage);
await arrive(declinerPage);
await signInPage(declinerPage, decliner.email, decliner.name);
await declinerPage.evaluate((id) => window.__steeple.setView('letter', { applicationId: id }), failedApplication.id);
await until(declinerPage, () => Boolean(document.querySelector('.held__failed')), null, 30000, 'the failure ladder drew');

const ladder = await declinerPage.evaluate(() => ({
  title: document.querySelector('.held__failedtitle')?.textContent ?? '',
  body: document.querySelector('.held__failed .prose')?.textContent ?? '',
  fix: Boolean(document.querySelector('[data-action="fix-payment"]')),
  charges: [...document.querySelectorAll('.held__charge')].map((c) => c.textContent),
}));
check('a failed charge is named plainly', /did not go through/i.test(ladder.title), ladder.title);
check(
  'and the ladder says what happens next, in steeple’s own terms',
  /released 24 hours before/i.test(ladder.body),
  ladder.body
);
check('the date itself carries the state', ladder.charges.includes('Payment failed'), JSON.stringify(ladder.charges));
check('with the one thing that fixes it a press away', ladder.fix);
await shot(declinerPage, '2-guest-failed');

await press(declinerPage, '[data-action="fix-payment"]');
await until(
  declinerPage,
  () => Boolean(document.querySelector('.cardpanel__layer.is-open')),
  null,
  20000,
  'the card panel opened'
);
// The panel asks steeple what card it holds rather than assuming: a card saved
// on another device is still this person's card.
await until(
  declinerPage,
  () => Boolean(document.querySelector('.cardheld__brand')),
  null,
  20000,
  'the card on file was read back'
);
const panel = await declinerPage.evaluate(() => ({
  held: document.querySelector('.cardheld__brand')?.textContent ?? null,
  numberField: Boolean(document.querySelector('.cardpanel input[autocomplete="cc-number"], .cardpanel input[name*="number" i]')),
  fields: [...document.querySelectorAll('.cardpanel input')].map((i) => i.id),
}));
check(
  'it shows the card on file as brand and four digits',
  panel.held === 'Visa ···· 0002',
  JSON.stringify(panel.held)
);
eq('and there is no field a card number could travel in', panel.numberField, false);
check(
  'the only fields are the brand and the last four',
  panel.fields.every((id) => id === 'card-brand' || id === 'card-last4'),
  JSON.stringify(panel.fields)
);
await shot(declinerPage, '2-card-panel');
await declinerPage.keyboard.press('Escape');
await settle(declinerPage);

// ── 4. payouts ───────────────────────────────────────────────────────────────
//
// Before §3, deliberately: rescinding turns the paid date into a refunded one,
// and the prompt is about money that has actually landed.

console.log('\n4 · setting up payouts');

const beforePayouts = await call('GET', `/manage/venues/${instant.venueId}/payments`, { token: instant.token });
eq('steeple says payouts are not set up yet', beforePayouts.body?.payoutsEnabled, false);

const prompt = await instantHostPage.evaluate(() => ({
  shown: Boolean(document.querySelector('.desk .payout')),
  words: document.querySelector('.desk .payout .prose')?.textContent ?? '',
  connected: Boolean(document.querySelector('.desk .payout--done')),
}));
check('the desk asks for them, once there is money behind it', prompt.shown);
check('and says how much is waiting', /Set up payouts to receive \$\d/.test(prompt.words), prompt.words);
eq('it does not claim to be connected', prompt.connected, false);
await shot(instantHostPage, '4-payout-prompt');

await press(instantHostPage, '[data-action="payouts"]');
await until(
  instantHostPage,
  () => Boolean(document.querySelector('.payoutscreen__layer.is-open')),
  null,
  20000,
  'the payout screen opened'
);
// The way on does not exist until onboarding has actually begun at steeple —
// finishing what was never started answers 400, and that would be this screen's
// own fault rather than the host's.
await until(
  instantHostPage,
  () => Boolean(document.querySelector('[data-action="payouts-finish"]')),
  null,
  20000,
  'the payout screen finished opening onboarding'
);
const started = await call('GET', `/manage/venues/${instant.venueId}/payments`, { token: instant.token });
eq('opening the screen started onboarding at steeple', started.body?.onboardingStarted, true);
eq('but nothing is enabled by opening it', started.body?.payoutsEnabled, false);

await press(instantHostPage, '[data-action="payouts-finish"]');
await until(
  instantHostPage,
  () => /Payouts are set up/.test(document.querySelector('.payoutscreen')?.textContent ?? ''),
  null,
  20000,
  'the payout screen showed the connected state'
);
await shot(instantHostPage, '4-payout-connected');
const afterPayouts = await call('GET', `/manage/venues/${instant.venueId}/payments`, { token: instant.token });
eq('steeple now says payouts are enabled', afterPayouts.body?.payoutsEnabled, true);
eq('and the venue is opted in', afterPayouts.body?.optedIn, true);
check(
  'the screen is honest that the money is simulated',
  /simulated|test gateway/i.test(await textOf(instantHostPage, '.payoutscreen')),
  ''
);

await press(instantHostPage, '.payoutscreen__actions .pill--primary');
await until(
  instantHostPage,
  () => Boolean(document.querySelector('.desk .payout--done')),
  null,
  20000,
  'the desk showed the connected state'
);
eq(
  'and the prompt is gone from the desk',
  await instantHostPage.evaluate(() => Boolean(document.querySelector('.desk .payout [data-action="payouts"]'))),
  false
);

// ── 5. the booking-mode toggle ──────────────────────────────────────────────

console.log('\n5 · how a venue takes bookings');

await press(manualHostPage, '.desk .tab[data-tab="spaces"]');
await until(manualHostPage, () => Boolean(document.querySelector('.settings')), null, 20000, 'the settings drew');
const modeBefore = await manualHostPage.evaluate(() => ({
  on: document.querySelector('.mode.is-on .mode__label')?.textContent ?? null,
  choices: [...document.querySelectorAll('.mode__label')].map((c) => c.textContent),
  blurbs: [...document.querySelectorAll('.mode__blurb')].map((c) => c.textContent),
}));
eq('the venue reads as manual', modeBefore.on, 'I approve each request');
check('both modes are offered, each with its own sentence', modeBefore.choices.length === 2, JSON.stringify(modeBefore.choices));
// The scope of a mode change is told when it is made (the slip below), not in a
// standing paragraph under the choice.
check('and each sentence is one short sentence', modeBefore.blurbs.every((b) => b.length < 90 && b.split('.').length <= 2), JSON.stringify(modeBefore.blurbs));
await shot(manualHostPage, '5-booking-mode');

const guestBeforeFlip = await openPage('mode-guest');
await boot(guestBeforeFlip, `${url}#/apply/${manual.venueSlug}/${manual.roomSlug}`);
await arrive(guestBeforeFlip);
await until(
  guestBeforeFlip,
  () => Boolean(document.querySelector('.letter__foot .pill--primary')),
  null,
  30000,
  'the apply sheet drew'
);
eq(
  'a manual venue asks the guest to send a request',
  await textOf(guestBeforeFlip, '.letter__foot .pill--primary'),
  'Send request'
);

await press(manualHostPage, '.mode__input[value="instant"]');
await until(
  manualHostPage,
  () => document.querySelector('.mode.is-on .mode__label')?.textContent === 'Books instantly',
  null,
  30000,
  'the venue flipped to instant'
);
const flipped = await call('GET', `/listings/by-slug/${manual.venueSlug}/${manual.roomSlug}`);
eq('steeple holds the new mode', flipped.body?.bookingMode, 'instant');

// A reload, not a second goto: the address is the same but for its hash, so a
// goto would be a same-document navigation and nothing would be re-read.
await guestBeforeFlip.reload({ waitUntil: 'domcontentloaded' });
await guestBeforeFlip.waitForFunction(() => window.__steepleReady === true, { timeout: 30000 });
await arrive(guestBeforeFlip);
await until(
  guestBeforeFlip,
  () => document.querySelector('.letter__foot .pill--primary')?.textContent === 'Book this space',
  null,
  30000,
  'the apply sheet followed the new mode'
);
check('and the public room now offers to book on the spot', true);
await guestBeforeFlip.close();

// ── 3. the rescind lever ────────────────────────────────────────────────────

console.log('\n3 · the host cancels, and the money comes back');

await press(instantHostPage, '.desk .tab[data-tab="bookings"]');
await until(instantHostPage, () => Boolean(document.querySelector('.desk .booking')), null, 20000, 'the bookings drew');

const target = paidApplication.bookingId;
await press(instantHostPage, `.booking[data-booking="${target}"] [data-action="cancel"]`);
await until(
  instantHostPage,
  (id) => Boolean(document.querySelector(`.booking[data-booking="${id}"] .booking__confirm`)),
  target,
  20000,
  'the confirm step opened'
);
const warning = await instantHostPage.evaluate(
  (id) => document.querySelector(`.booking[data-booking="${id}"] .booking__warning`)?.textContent ?? '',
  target
);
await shot(instantHostPage, '3-rescind-confirm');
check('a cancel is a considered action, not a casual one', /frees every remaining date/i.test(warning), warning);
check('and it says the refund is full', /refunds everything already charged, in full/i.test(warning), warning);
eq(
  'nothing has happened yet at steeple',
  (await call('GET', `/bookings/${target}`, { token: instant.token })).body?.status,
  'confirmed'
);

await press(instantHostPage, `.booking[data-booking="${target}"] [data-action="cancel-confirm"]`);
await until(
  instantHostPage,
  (id) => !document.querySelector(`.booking[data-booking="${id}"]`),
  target,
  30000,
  'the cancelled booking left the desk'
);

let cancelled = null;
for (let attempt = 0; attempt < 30; attempt += 1) {
  cancelled = (await call('GET', `/bookings/${target}`, { token: instant.token })).body;
  if (cancelled?.occurrences?.some((o) => o.paymentStatus === 'refunded')) break;
  await new Promise((r) => setTimeout(r, 400));
}
eq('steeple holds the booking as cancelled', cancelled?.status, 'cancelled');
check(
  'every remaining date is freed',
  cancelled?.occurrences?.every((o) => o.status === 'cancelled'),
  JSON.stringify(cancelled?.occurrences?.map((o) => o.status))
);
check(
  'and the charge that was taken is refunded',
  cancelled?.occurrences?.some((o) => o.paymentStatus === 'refunded'),
  JSON.stringify(cancelled?.occurrences?.map((o) => o.paymentStatus))
);
eq(
  'the refund is in the database, not only in the answer',
  sql(`select count(*) from payments where "BookingId" = '${target}' and "Status" = 4;`),
  '1'
);

await payerPage.reload({ waitUntil: 'domcontentloaded' });
await payerPage.waitForFunction(() => window.__steeple, { timeout: 30000 });
await arrive(payerPage);
await payerPage.evaluate((id) => window.__steeple.setView('letter', { applicationId: id }), paidApplication.id);
await until(
  payerPage,
  () => [...document.querySelectorAll('.held__charge')].some((c) => c.textContent === 'Refunded'),
  null,
  30000,
  'the guest’s letter shows the refund'
);
check('the group sees the refund on the same dates, without being told twice', true);

// ── 6. a reminder, arriving without a click ─────────────────────────────────

console.log('\n6 · the quiet reminder');

// Seeded rather than waited for: the reminder worker runs on a 15-minute
// cadence, and a suite that waits on a worker is a suite nobody runs.
const upcoming = failedBooking.occurrences?.[0];
const payload = JSON.stringify({
  bookingId: failedBooking.id,
  occurrenceId: upcoming.id,
  roomId: instant.roomId,
  roomName: instant.roomName,
  venueName: instant.venueName,
  venueSlug: instant.venueSlug,
  roomSlug: instant.roomSlug,
  organizerName: decliner.name,
  reminderKind: 'tomorrow',
  startsAtUtc: upcoming.startUtc,
  localDate: upcoming.localDate,
  deepLink: `/bookings/${failedBooking.id}`,
}).replace(/'/g, "''");
sql(
  `insert into notifications ("Id","UserId","Type","PayloadJson","CreatedAtUtc") values (gen_random_uuid(), '${decliner.user.id}', 21, '${payload}', now());`
);

const visitor = await openPage('reminded');
await boot(visitor);
// The slip is a **transient**, and the harness must not have to catch it live.
//
// It is shown the moment the notifications read answers — which is the moment
// the session changes, before any wait this suite could start — it fades in
// over 220ms, and `ui/notice.js` takes it away again twelve seconds later. A
// check that samples the live element is therefore racing a compositor: on a
// loaded machine the fade is stretched five-fold and more, and a poll that
// lands either side of the readable window reads 0 both times and calls a slip
// that really was on screen a slip that never came. That is a measurement, not
// a defect, and it cost this suite two red runs.
//
// So the page keeps its own record from before the sign-in, and the assertion
// reads the record. It is the stricter instrument, not the looser one: it
// cannot miss a window it was watching the whole time, and it still says
// nothing about a slip that only ever existed at opacity 0.
await visitor.evaluate(() => {
  const slip = document.querySelector('.slip');
  window.__slipTrace = [];
  const note = (why) =>
    window.__slipTrace.push({
      at: Math.round(performance.now()),
      why,
      hidden: slip.hidden,
      open: slip.classList.contains('is-open'),
      opacity: Number(getComputedStyle(slip).opacity),
      line: slip.querySelector('.slip__line')?.textContent ?? '',
    });
  note('installed');
  new MutationObserver(() => note('attribute')).observe(slip, { attributes: true });
  for (const type of ['transitionend', 'transitioncancel']) {
    slip.addEventListener(type, (event) => {
      if (event.propertyName === 'opacity') note(type);
    });
  }
  // The fade itself moves no attribute and fires nothing until it is over, so
  // the peak is sampled while it is open. 100ms is well inside the 12s linger
  // even when the machine stretches the fade many times over.
  setInterval(() => {
    if (!slip.hidden) note('sample');
  }, 100);
});
await signInPage(visitor, decliner.email, decliner.name);
await arrive(visitor);
// Not merely un-hidden: **on screen**. A slip nobody could have read — opacity
// 0.0 for its whole life — is not a slip that appeared.
try {
  await until(
    visitor,
    () => (window.__slipTrace ?? []).some((seen) => !seen.hidden && seen.opacity > 0.9),
    null,
    30000,
    'a slip appeared, and finished appearing, for a visitor with a booking tomorrow'
  );
} catch (error) {
  const trace = await visitor.evaluate(() => window.__slipTrace ?? []);
  console.log(`  slip trace: ${JSON.stringify(trace)}`);
  throw error;
}
const slip = await visitor.evaluate(() => ({
  line: document.querySelector('.slip__line')?.textContent ?? '',
  action: document.querySelector('.slip__actions button')?.textContent ?? null,
}));
check('a visitor is told, without clicking anything', /^Tomorrow: /.test(slip.line), slip.line);
check('and the space is named', slip.line.includes(instant.roomName), slip.line);
check('with one way on', Boolean(slip.action), JSON.stringify(slip.action));
await shot(visitor, '6-reminder-slip');

const marked = sql(
  `select count(*) from notifications where "UserId" = '${decliner.user.id}' and "Type" = 21 and "ReadAtUtc" is not null;`
);
eq('showing it is delivering it — steeple is told it was read', marked, '1');

// The same fact stays legible in the inbox, so a slip missed is a reminder
// missed and never a fact lost.
await visitor.evaluate(() => window.__steeple.setView('journal'));
await until(visitor, () => Boolean(document.querySelector('.jnotes')), null, 30000, 'the inbox carried the lines');
const notes = await visitor.evaluate(() =>
  [...document.querySelectorAll('.jnotes__line')].map((n) => n.textContent)
);
await shot(visitor, '6-inbox-lines');
check('the inbox keeps it as a quiet line', notes.some((line) => /^Tomorrow: /.test(line)), JSON.stringify(notes));
check(
  'alongside the failed payment it already knew about',
  notes.some((line) => /did not go through/.test(line)),
  JSON.stringify(notes)
);
eq(
  'and there is no notifications tab bolted onto the shelf',
  await visitor.evaluate(() =>
    [...document.querySelectorAll('.porch button')].some((b) => /notification/i.test(b.textContent))
  ),
  false
);

// ── done ─────────────────────────────────────────────────────────────────────

await closeBrowsers();

if (problems.length) {
  console.log('\npage problems:');
  for (const line of [...new Set(problems)]) console.log(`  ${line}`);
}
console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
