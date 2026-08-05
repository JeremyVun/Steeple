#!/usr/bin/env node
// THE WHOLE FUNNEL, END TO END, WITH A REAL MOUSE AND REAL KEYS (CONTRACT5 §4.5).
//
//   title → results → room → request sheet → fill it in → sign in → send
//   → the application exists in steeple's own database.
//
// The last step is the point: the browser is never asked whether it thinks it
// sent something. The test signs in to the API separately, as the same person,
// and reads back `GET /me/applications` looking for the note it typed. Nothing
// but a real POST can put it there.
//
// Needs the local steeple API running (the dev server proxies /api to it) and a
// dev server of this app:
//   npx vite --port 5323 --strictPort
//   node tools/booking-flow-test.mjs "http://localhost:5323/?q=low"

import puppeteer from 'puppeteer';

const url = process.argv[2] ?? 'http://localhost:5323/?q=low';
const API = process.env.STEEPLE_API ?? 'http://localhost:5200/api/v1';

const PERSON = { email: 'maria@demo.steeple.test', name: 'Maria Alvarez' };
const VENUE = 'grace-community-vienna';
const ROOM = 'fellowship-hall';
// The one string that proves this run reached the database and no other did.
const MARK = `w6c-${Date.now().toString(36)}`;
const NOTE =
  `Little Sparrows would love a regular morning in the hall for songs and free ` +
  `play, with a parent alongside every child. [${MARK}]`;

let failed = 0;
const errors = [];

function check(label, ok, detail = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

/** Equality, said out loud — never `check(label, value, expected)`, which reads
 *  the expectation as a boolean and passes on anything truthy. */
function is(label, got, want) {
  const ok = got === want;
  if (!ok) failed += 1;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${label} — ${JSON.stringify(got)}${ok ? '' : ` (wanted ${JSON.stringify(want)})`}`
  );
}

// ── is the API even there? ──────────────────────────────────────────────────
const apiUp = await fetch(`${API}/geofence`)
  .then((r) => r.ok)
  .catch(() => false);
if (!apiUp) {
  console.log(`\nThe steeple API is not answering at ${API}.`);
  console.log('This test is about the real wire; start the API and run it again.');
  process.exit(2);
}

/** A session of our own, to read back what the browser filed. */
async function apiSession() {
  const response = await fetch(`${API}/auth/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider: 'dev',
      idToken: `${PERSON.email}|${PERSON.name}`,
      turnstileToken: null,
    }),
  });
  if (!response.ok) throw new Error(`sign-in answered ${response.status}`);
  return response.json();
}

const beforeSession = await apiSession();
const countFor = async (token) => {
  const response = await fetch(`${API}/me/applications?pageSize=100`, {
    headers: { authorization: `Bearer ${token}` },
  });
  return response.json();
};
const before = await countFor(beforeSession.accessToken);

// ── the browser ─────────────────────────────────────────────────────────────
const browser = await puppeteer.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  if (m.text().includes('GL Driver')) return;
  // The browser writes its own line for every request to an API that is not
  // answering. Section 9 cuts the wire on purpose; that is a state the funnel
  // is built for, not a page fault.
  if ((m.location?.()?.url ?? '').includes('/api/v1/')) return;
  errors.push(`[console] ${m.text()}`);
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const view = () => page.evaluate('__steeple.state.view');
const text = (selector) => page.$eval(selector, (n) => n.textContent.trim()).catch(() => null);

async function box(selector) {
  const handle = await page.$(selector);
  const b = await handle?.boundingBox();
  if (!b) throw new Error(`no box for ${selector}`);
  return { ...b, cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
}

async function clickOn(selector, label) {
  const b = await box(selector);
  await page.mouse.move(b.cx, b.cy);
  await wait(80);
  await page.mouse.click(b.cx, b.cy);
  await wait(700);
  console.log(`      clicked ${label}`);
}

/** Click the first thing under `selector` whose words match. */
async function clickWords(selector, pattern, label) {
  for (const handle of await page.$$(selector)) {
    const content = (await handle.evaluate((n) => n.textContent)).trim();
    if (!pattern.test(content)) continue;
    await handle.evaluate((n) => n.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await wait(180);
    const b = await handle.boundingBox();
    if (!b) continue;
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await wait(700);
    console.log(`      clicked ${label} ${JSON.stringify(content.slice(0, 42))}`);
    return true;
  }
  check(label, false, `nothing under ${selector} matching ${pattern}`);
  return false;
}

console.log(`\n──── the whole funnel · ${url} ────`);
console.log(`      the note carries the mark ${MARK}`);

await page.goto('about:blank');
await page.goto(url, { waitUntil: 'networkidle0' });
await page.waitForFunction('window.__steepleReady === true', { timeout: 30000 });
// Nobody is signed in when a stakeholder opens this for the first time.
await page.evaluate("localStorage.removeItem('steeple-village-session')");
await page.evaluate('__steeple.store.resetDemo()');
await wait(1200);

// ── 1. the title page rolls down into the product ───────────────────────────
console.log('\n1. arriving');
check('a bare URL opens at the title page', (await page.evaluate('__steeple.state.roll')) === 0);
await clickOn('.arrival__cta', 'the call to action');
await page
  .waitForFunction('Math.abs(__steeple.state.roll - 1) < 0.001', { timeout: 30000 })
  .catch(() => {});
await wait(600);
check('it lands on the browse surface', (await page.evaluate('__steeple.state.roll')) === 1);

// ── 2. a listing from the results, then the room ────────────────────────────
console.log('\n2. from the results into the room');
const row = `[data-venue="${VENUE}"][data-room="${ROOM}"]`;
// The results come off the wire, so they arrive when they arrive.
await page.waitForSelector(row, { timeout: 15000 }).catch(() => {});
const rowThere = (await page.$(row)) !== null;
check('the search results carry the room', rowThere, row);
if (rowThere) await clickOn(row, 'the Fellowship Hall listing');
check('the room opens', (await view()) === 'room', String(await view()));
check('and the sheet with it', await page.evaluate('!!document.querySelector(".sheet--room")'));

// ── 3. the request sheet ────────────────────────────────────────────────────
console.log('\n3. asking for the space');
await clickWords('.sheet--room .pill--primary', /Request this space/, 'Request this space');
check('the request sheet is open', (await view()) === 'apply', String(await view()));
is('the eyebrow was renamed', await text('.letter__head .eyebrow'), 'Booking request');
is('the note is asked for by its new name', await text('.letter__col--note .field__label'), 'Your plans');
is('the way back is an arrow, labelled', await page.$eval('.letter__back', (n) => n.getAttribute('aria-label')), 'Back to the space');
check('the old footnote link is gone', (await page.$('.letter__footnote')) === null);

// ── 4. filling it in, by hand ───────────────────────────────────────────────
console.log('\n4. filling it in');
await page.click('#letter-intent');
await page.keyboard.type(NOTE);
await clickWords('.letter__col--note .choice', /^Community$/, 'the Community activity');

// The stepper, with a real mouse: eight presses of +, then typed to 28.
const more = (await page.$$('.stepper__step'))[1];
const mb = await more.boundingBox();
for (let i = 0; i < 8; i += 1) {
  await page.mouse.click(mb.x + mb.width / 2, mb.y + mb.height / 2);
  await wait(70);
}
is('the stepper counts up', await page.$eval('#letter-size', (n) => n.value), '8');
// Clicking into the number and typing replaces it — the field selects itself.
await page.click('#letter-size');
await page.keyboard.type('900');
await wait(200);
is('a typed number replaces what was there', await page.$eval('#letter-size', (n) => n.value), '900');
// Past what the room seats, it holds at the capacity rather than pretending.
await page.click('#letter-intent');
await wait(300);
is('and clamps to the room', await page.$eval('#letter-size', (n) => n.value), '200');
await page.click('#letter-size');
await page.keyboard.type('28');
await page.click('#letter-intent');
await wait(300);
is('then takes the real number', await page.$eval('#letter-size', (n) => n.value), '28');

// Next week, so the hours chosen are always in the future.
await clickOn('.week__step[aria-label="Next week"]', 'next week');
const cell = async (day, slot) => box(`.week__cell[data-day="${day}"][data-slot="${slot}"]`);
const from = await cell(3, 6); // Wednesday 11:00
const to = await cell(3, 7);
await page.mouse.move(from.cx, from.cy);
await page.mouse.down();
await page.mouse.move(to.cx, to.cy, { steps: 8 });
await page.mouse.up();
await wait(600);
const summary = await text('.letter__summaryline');
check('the hours are chosen', /Wednesday, \w+ \d+, 11 am – 12 pm/.test(summary ?? ''), summary);

// ── 5. who is asking ────────────────────────────────────────────────────────
console.log('\n5. signing in');
check('no identity step before sending', await page.evaluate(() => document.querySelector('.identity')?.hidden === true));
await clickWords('.letter__foot .pill--primary', /Send request/, 'Send request');
check('the identity step appears', await page.evaluate(() => document.querySelector('.identity')?.hidden === false));
check(
  'the trust chip is not claimed before a session exists',
  await page.evaluate(() => {
    const chip = document.querySelector('.identity .verified');
    return !chip || getComputedStyle(chip).display === 'none';
  })
);
const people = await page.$$eval('.identity__person .identity__name', (n) => n.map((x) => x.textContent.trim()));
check('demo people are offered by name', people.length >= 2 && people[0] === PERSON.name, people.join(', '));
await page.screenshot({ path: '/tmp/w6c-flow-signin.png' });

// Anyone not on the list signs in with a plain email; it is one link away.
await clickWords('.identity__actions .linkish', /Someone else/, 'someone else');
check('a calm email entry is offered', (await page.$('#identity-email')) !== null);
check('with a name beside it', (await page.$('#identity-name')) !== null);
await page.screenshot({ path: '/tmp/w6c-flow-signin-email.png' });
await clickWords('.identity__actions .linkish', /Choose from the list/, 'back to the list');

await clickWords('.identity__person', new RegExp(PERSON.name), `sign in as ${PERSON.name}`);
await page.waitForFunction('!!document.querySelector(".identity .verified")', { timeout: 15000 }).catch(() => {});
await wait(600);
check('a real session now exists', await page.evaluate("!!localStorage.getItem('steeple-village-session')"));
is('the trust wording is exact', await text('.identity .verified'), 'Identity verified (SSO)');
is('the person card names them', await text('.identity__card .identity__name'), PERSON.name);
await page.screenshot({ path: '/tmp/w6c-flow-signedin.png' });

// ── 6. sending it for real ──────────────────────────────────────────────────
console.log('\n6. sending');
await clickWords('.identity__actions .pill--primary', new RegExp(`Continue as ${PERSON.name}`), 'Continue as');
await page.waitForFunction("__steeple.state.view === 'room'", { timeout: 25000 }).catch(() => {});
await wait(1200);
check('the guest is put back on the room', (await view()) === 'room', String(await view()));
check('a quiet confirmation stands', await page.evaluate(() => document.querySelector('.sent')?.hidden === false));

const filed = await page.evaluate('__steeple.store.guestApplications()[0]');
check('the store holds the request', Boolean(filed), filed?.id);
check('...with the note as typed', filed?.intentText?.includes(MARK) === true);
check(
  '...under the id steeple gave it, not one of ours',
  /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(filed?.id ?? ''),
  filed?.id
);
is('...as pending', filed?.status, 'pending');
await page.screenshot({ path: '/tmp/w6c-flow-sent.png' });

// ── 7. the letter the server answered with ──────────────────────────────────
console.log('\n7. the sent letter');
await clickWords('.sent .linkish', /Open it in your inbox/, 'open it in the inbox');
check('the letter opens', (await view()) === 'letter', String(await view()));
is('it is the one just sent', await page.evaluate('__steeple.state.applicationId'), filed?.id);
is('signed by the person who signed in', await text('.opened__sign'), PERSON.name);
is('and their group', await text('.opened__signorg'), 'Little Sparrows Playgroup');
await page.screenshot({ path: '/tmp/w6c-flow-letter.png' });

// ── 8. the database, asked directly ─────────────────────────────────────────
console.log('\n8. what steeple actually holds');
const afterSession = await apiSession();
const after = await countFor(afterSession.accessToken);
check('the API holds one more application than before', after.totalCount === before.totalCount + 1, `${before.totalCount} → ${after.totalCount}`);
const landed = after.items.find((a) => a.intentText.includes(MARK));
check('and this run is the one that arrived', Boolean(landed), landed?.id);
is('the ids agree', landed?.id, filed?.id);
is('the room is right', landed?.roomSlug, ROOM);
is('the activity crossed as a wire token', landed?.activityType, 'community');
is('the group size crossed', landed?.groupSize, 28);
is('the schedule crossed as a one-off', landed?.schedule?.frequency, 'oneOff');
is('with the hours as painted', `${landed?.schedule?.startTime}–${landed?.schedule?.endTime}`, '11:00–12:00');
is('the organizer is the person who signed in', landed?.organizer?.displayName, PERSON.name);
is('their group rode along', landed?.organizationName, 'Little Sparrows Playgroup');

// ── 9. the same request with the wire cut ───────────────────────────────────
// The API being absent is a working state, not a fault: the store files the
// request alone and nothing the guest reads mentions a demo, a fallback or an
// error. Every request to /api is refused at the network layer here — the same
// shape of failure as an API that is simply not running.
console.log('\n9. with the wire cut');
await page.setRequestInterception(true);
page.on('request', (request) => {
  if (request.url().includes('/api/v1/')) request.abort('failed').catch(() => {});
  else request.continue().catch(() => {});
});

const heldBefore = await page.evaluate('__steeple.store.guestApplications().length');
await page.evaluate("__steeple.setView('apply',{venueId:'oakton-baptist',roomId:'gymnasium'})");
await wait(900);
await page.click('#letter-intent');
await page.keyboard.type('The Saturday club would use the gym for an hour of indoor football.');
await clickWords('.letter__col--note .choice', /^Sports$/, 'the Sports activity');
await page.click('#letter-size');
await page.keyboard.type('14');
await clickOn('.week__step[aria-label="Next week"]', 'next week');
const offline = await cell(5, 8); // Friday, 12:00
await page.mouse.move(offline.cx, offline.cy);
await page.mouse.down();
await page.mouse.move((await cell(5, 9)).cx, (await cell(5, 9)).cy, { steps: 6 });
await page.mouse.up();
await wait(600);
await clickWords('.letter__foot .pill--primary', /Send request/, 'Send request');
await clickWords('.identity__actions .pill--primary', new RegExp(`Continue as ${PERSON.name}`), 'Continue as');
await page.waitForFunction("__steeple.state.view === 'room'", { timeout: 25000 }).catch(() => {});
await wait(1200);

const alone = await page.evaluate('__steeple.store.guestApplications()[0]');
check('the request is filed even with nothing answering', (await page.evaluate('__steeple.store.guestApplications().length')) === heldBefore + 1);
check('...with an id of the store\'s own making', /^app-/.test(alone?.id ?? ''), alone?.id);
is('...and it is pending like any other', alone?.status, 'pending');
const said = await page.evaluate(() => document.querySelector('.sent')?.textContent ?? '');
check('nothing said calls it a demo, a sample or an error', !/demo|sample|offline|error|failed/i.test(said), JSON.stringify(said));
await page.screenshot({ path: '/tmp/w6c-flow-offline.png' });

for (const line of errors) console.log(line);
console.log(
  `\n${failed === 0 && errors.length === 0 ? 'PASS' : `FAIL — ${failed} check(s), ${errors.length} page error(s)`}`
);
await browser.close();
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
