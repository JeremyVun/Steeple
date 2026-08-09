// Real-input test for the guest's side (Workstream B): the room CTA, the
// request composer, painting the week card with a real drag, the keyboard path
// over the grid, the identity beat, sending, the inbox, accepting the seeded
// counter-offer, answering a NeedsInfo question, the Esc paths, and an
// elementsFromPoint audit proving a closed surface never swallows the village.
//
//   node tools/guest-test.mjs "http://localhost:5312/?q=low"
//
// The correspondence itself (send, inbox, counter-offer, answer, withdraw) is
// NOT here: it is real wire traffic now and lives in correspondence-test.mjs.
// This suite is the composer under real input — pointer, drag, keyboard, Esc.
//
// Nothing here drives window.__steeple except resetDemo and reads: every
// affordance is exercised with the mouse and the keyboard.
import { at, closeBrowsers, launch, routes } from './fixtures.mjs';

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

const url = process.argv[2] ?? 'http://localhost:5312/?q=low';
const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

const problems = [];
page.on('pageerror', (e) => {
  problems.push(`pageerror: ${e.message}`);
  console.log('[pageerror]', e.message);
});
page.on('console', (m) => {
  if (m.type() === 'error') {
    problems.push(`console: ${m.text()}`);
    console.log('[console.error]', m.text());
  }
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const state = (key) => page.evaluate(`__steeple.state.${key}`);
const text = (selector) =>
  page.evaluate((s) => document.querySelector(s)?.textContent?.trim() ?? null, selector);
const countOf = (selector) => page.evaluate((s) => document.querySelectorAll(s).length, selector);

let checks = 0;
let failed = 0;
function check(label, actual, expected) {
  checks += 1;
  const ok = String(actual) === String(expected);
  if (!ok) failed += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}: ${JSON.stringify(actual)}${ok ? '' : ` (wanted ${JSON.stringify(expected)})`}`);
}
function checkThat(label, ok, detail = '') {
  checks += 1;
  if (!ok) failed += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? `: ${detail}` : ''}`);
}

async function ready(target) {
  await page.goto(target, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__steepleReady === true', { timeout: 20000 });
  await wait(2200);
}

/** Click the first visible element matching `selector` whose text matches. */
async function clickText(selector, pattern, label) {
  for (const handle of await page.$$(selector)) {
    const content = (await handle.evaluate((n) => n.textContent)).trim();
    if (!pattern.test(content)) continue;
    // Sheets scroll: bring it into view the way a person would before clicking.
    await handle.evaluate((n) => n.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await wait(200);
    const box = await handle.boundingBox();
    if (!box) continue;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const top = await page.evaluate(
      (px, py) => document.elementsFromPoint(px, py)[0]?.className ?? '?',
      x,
      y
    );
    await page.mouse.click(x, y);
    await wait(500);
    console.log(`      clicked ${label} ${JSON.stringify(content.slice(0, 40))} (topmost: ${top})`);
    return true;
  }
  console.log(` FAIL ${label}: no element matching ${pattern}`);
  failed += 1;
  checks += 1;
  return false;
}

/** The centre of one week-card square, in page coordinates. */
async function cellBox(day, slot) {
  const handle = await page.$(`.week__cell[data-day="${day}"][data-slot="${slot}"]`);
  if (!handle) return null;
  const box = await handle.boundingBox();
  return box && { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** What the pointer would actually hit at the middle of the scene. */
async function topmostAtCentre() {
  return page.evaluate(() =>
    document
      .elementsFromPoint(720, 470)
      .slice(0, 3)
      .map((n) => `${n.tagName.toLowerCase()}.${(typeof n.className === 'string' ? n.className : '') || '-'}`)
      .join(' | ')
  );
}

console.log(`\n──── guest requests · ${url} ────`);

await ready(at(url, routes.browse()));
await page.evaluate('__steeple.store.resetDemo()');
await wait(400);

// ── 1. CTA → composer ───────────────────────────────────────────────────────
console.log('\n1. the room CTA opens the request');
await ready(at(url, routes.room('grace-community-vienna', 'fellowship-hall')));
await clickText('.sheet--room .pill--primary', /Request this space/, 'request CTA');
await wait(900);
check('view after CTA', await state('view'), 'apply');
check('the address', await page.evaluate('location.pathname'), '/apply/grace-community-vienna/fellowship-hall');
checkThat('composer is open', await countOf('.guest__surface--letter.is-open') === 1);
check('the heading names the room', await text('.letter__title'), 'Fellowship Hall');
// The shared announcer speaks first for every view; ours must land last.
const spokenApply = await text('#a11y');
checkThat('the live region describes the request, not the listing', /Your request to/.test(spokenApply ?? ''), spokenApply?.slice(0, 70));

// ── 2. writing the request with the keyboard ────────────────────────────────
console.log('\n2. writing');
await page.click('#letter-intent');
await page.keyboard.type(
  'Little Sparrows would love a regular morning in the hall for songs and free play, with a parent alongside every child.'
);
await clickText('.letter__col--note .choice', /^Community$/, 'activity Community');
await page.click('#letter-size');
await page.keyboard.type('28');
check('intent recorded', (await page.$eval('#letter-intent', (n) => n.value)).slice(0, 15), 'Little Sparrows');
check('group size recorded', await page.$eval('#letter-size', (n) => n.value), '28');
checkThat(
  'activity is chosen',
  await page.evaluate(() => document.querySelector('input[name="letter-activity"]:checked')?.value) === 'Community'
);

// ── 3. painting the week card with a real drag ──────────────────────────────
console.log('\n3. painting the week card');
// Wednesday (day 3) from 10:00 (slot 4) down to 11:30 (slot 7).
const from = await cellBox(3, 4);
const to = await cellBox(3, 7);
checkThat('week grid has squares', Boolean(from && to));
await page.mouse.move(from.x, from.y);
await page.mouse.down();
await page.mouse.move(to.x, to.y, { steps: 8 });
await page.mouse.up();
await wait(500);
check('one band painted', await countOf('.mark--band'), 1);
check('band reads its hours', await text('.mark--band .mark__label'), '10–12');
const summary1 = await text('.letter__summaryline');
checkThat('summary states the date and time', /Wednesday, August \d+, 10 am – 12 pm/.test(summary1 ?? ''), summary1);
await page.screenshot({ path: '/tmp/gsb-painted.png' });

// ── 4. weekly, multi-day, and an end date ───────────────────────────────────
console.log('\n4. weekly and multi-day');
await clickText('.choice--segment', /Every week/, 'Every week');
check('frequency is weekly', await page.evaluate(() => document.querySelector('input[name="letter-frequency"]:checked')?.value), 'weekly');
const friday = await cellBox(5, 5);
await page.mouse.click(friday.x, friday.y);
await wait(400);
check('two days painted', await countOf('.mark--band'), 2);
const untilValue = await page.evaluate(() => document.querySelector('#letter-until')?.value ?? '');
checkThat('an end date is offered', /^\d{4}-\d{2}-\d{2}$/.test(untilValue), untilValue);
const summary2 = await text('.letter__summaryline');
checkThat('summary names both weekdays', /Wednesdays and Fridays/.test(summary2 ?? ''), summary2);
checkThat('summary counts the dates', /date/.test((await text('.letter__summarycount')) ?? ''), await text('.letter__summarycount'));
await page.screenshot({ path: '/tmp/gsb-weekly.png' });

// ── 5. the keyboard path over the grid ──────────────────────────────────────
console.log('\n5. keyboard over the grid');
await page.focus('.week__cell[tabindex="0"]');
const before = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowRight');
const after = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
checkThat('arrow keys move the cursor', before !== after, `${before} → ${after}`);
const bandsBefore = await countOf('.mark--band');
await page.keyboard.press('Enter');
await wait(350);
const bandsAfter = await countOf('.mark--band');
checkThat('Enter changes the selection', bandsBefore !== bandsAfter || (await text('.mark--band .mark__label')) !== null,
  `${bandsBefore} → ${bandsAfter}`);
// Put it back to a clean two-day weekly slot for sending.
await clickText('.choice--segment', /One time/, 'One time');
const send1 = await cellBox(3, 4);
await page.mouse.move(send1.x, send1.y);
await page.mouse.down();
await page.mouse.move((await cellBox(3, 7)).x, (await cellBox(3, 7)).y, { steps: 6 });
await page.mouse.up();
await wait(400);

// ── 6. the identity beat, exactly at the commitment point ───────────────────
//
// Re-baselined for v2_migration Phase 2. Two things this used to assert are no
// longer true and were not regressions:
//
//   · the primary pill said "Send request" because every venue was
//     request→approve. Venues are **instant by default** now (booking-modes,
//     2026-08-05) and the seeded ones are, so the pill says what the venue
//     actually does — this reads the mode off the wire rather than hardcoding
//     either sentence;
//   · pressing through the step filed a request into the demo store as a seeded
//     persona. Sending is a real account, a real card and a real row at steeple
//     now, and it is driven end to end in `correspondence-test.mjs` — which is
//     also where the inbox, the counter-offer, the answered question and the
//     withdrawal moved (§§1–7 there). What is left here is what this suite is
//     uniquely for: that the beats of the composer happen under real input, in
//     the right order, at the right moment.
console.log('\n6. the identity beat');
checkThat('no identity step before sending', await page.evaluate(() => document.querySelector('.identity')?.hidden === true));
const filedBefore = await page.evaluate('__steeple.store.guestApplications().length');

const mode = await page.evaluate(async () => {
  const venue = window.__steeple.state.venueId;
  const room = window.__steeple.state.roomId;
  const answer = await fetch(`/api/v1/listings/by-slug/${venue}/${room}`).then((r) => r.json());
  return answer?.bookingMode ?? null;
});
const wantedLabel = mode === 'manual' ? 'Send request' : 'Book this space';
check('the send says what this venue actually does', await text('.letter__foot .pill--primary'), wantedLabel);

await clickText('.letter__foot .pill--primary', new RegExp(wantedLabel), wantedLabel);
await wait(400);
checkThat('identity step appears', await page.evaluate(() => document.querySelector('.identity')?.hidden === false));
checkThat(
  'the trust chip is not claimed before verifying',
  await page.evaluate(() => {
    const chip = document.querySelector('.identity .verified');
    return !chip || getComputedStyle(chip).display === 'none';
  })
);
// The way in is offered here, to somebody who is nobody yet: this is the
// commitment point, and it is the first moment steeple asks who you are.
checkThat(
  'and the step offers a way in rather than assuming one',
  (await countOf('.identity__person')) > 0 || (await countOf('.identity input')) > 0
);
await page.screenshot({ path: '/tmp/gsb-sso.png' });

// Escaping the commitment leaves the written request exactly where it was —
// nothing is filed, and nothing is lost, by backing out of signing in.
const writtenBefore = await page.evaluate(() => document.querySelector('#letter-intent')?.value ?? null);
await page.keyboard.press('Escape');
await wait(600);
check('backing out of the identity step keeps the words', await page.evaluate(() => document.querySelector('#letter-intent')?.value ?? null), writtenBefore);
check('and files nothing', await page.evaluate('__steeple.store.guestApplications().length'), filedBefore);

// §§7–10b used to live here: sending, the inbox, accepting a counter-offer,
// answering a question and withdrawing — all of them against the demo store's
// seeded personas and seeded requests. Every one of those is a wire write now
// (v2_migration Phase 2, D4), so asserting them against a fixture would be
// asserting a thing the product no longer does. They are driven for real, by
// two people in two browsers against real rows at steeple, in
// `tools/correspondence-test.mjs` §§1–7.

// ── 11. Esc paths: a request returns to where it was opened from ────────────
// (Workstream D's return-path memory: Esc leaves a request view for the last
// place the visitor actually stood in the world.)
console.log('\n11. Esc');
// This used to open the letter route for app-sparrows-craft and press Esc. Two Phase 1/2
// changes make that unaskable here rather than broken: a cold link to a letter
// **while signed out** lands in the village and corrects the address bar with
// it, and the store is keyed per person, so a seeded demo request is not in any
// real account's inbox to open. The return path from an opened letter is driven
// where opened letters now come from — correspondence-test.mjs. What this suite
// can still say about that link is the thing Phase 1 promised about it.
await ready(at(url, routes.room('dunn-loring-umc', 'art-studio')));
await ready(at(url, routes.letter('app-sparrows-craft')));
check('a letter nobody is signed in to read lands in the village', await state('view'), 'village');
check(
  '...and the address bar is corrected with it, not left lying',
  await page.evaluate('location.pathname'),
  '/browse'
);

// The compatibility entrances, kept deliberately (SEO-D2): every old `#/…` link
// that was ever shared still opens the same state, and is replaced in place by
// its clean path so no duplicate entry or canonical is left behind. The full
// matrix is tools/router-test.mjs §2; this is the one driven end to end.
await ready(`${url}#/village`);
check('the retired village route still opens browse', await state('view'), 'village');
check('...and is replaced by the public route', await page.evaluate('location.pathname'), '/browse');
check('...with the fragment gone', await page.evaluate('location.hash'), '');
await ready(`${url}#/room/grace-community-vienna/fellowship-hall`);
check('an old room link opens the room', await state('roomId'), 'fellowship-hall');
check(
  '...at the canonical listing address',
  await page.evaluate('location.pathname'),
  '/space/grace-community-vienna/fellowship-hall'
);

await ready(at(url, routes.browse()));
await ready(at(url, routes.journal()));
await page.keyboard.press('Escape');
await wait(1200);
check('Esc from the inbox returns to the village', await state('view'), 'village');
checkThat('nothing of ours is open at the village', (await countOf('.guest__surface.is-open')) === 0);

await ready(at(url, routes.room('grace-community-vienna', 'youth-activity-room')));
await ready(at(url, routes.apply('grace-community-vienna', 'youth-activity-room')));
check('deep link opens the composer', await state('view'), 'apply');
await page.keyboard.press('Escape');
await wait(1400);
check('Esc from the composer returns to the room', await state('view'), 'room');

// ── 12. the hit-test audit ──────────────────────────────────────────────────
console.log('\n12. closed surfaces never intercept the scene');
for (const [label, target] of [
  ['village', at(url, routes.browse())],
  ['venue', at(url, routes.venue('grace-community-vienna'))],
  ['room', at(url, routes.room('oakton-baptist', 'gymnasium'))],
]) {
  await ready(target);
  const top = await topmostAtCentre();
  checkThat(`at ${label} the canvas is topmost`, top.startsWith('canvas'), top);
  const strays = await page.evaluate(() =>
    [...document.querySelectorAll('.guest__surface, .guest__wash, .sent, .identity')]
      .filter((n) => {
        const style = getComputedStyle(n);
        return style.pointerEvents !== 'none' && style.visibility !== 'hidden' && !n.hidden;
      })
      .map((n) => n.className)
  );
  checkThat(`no guest surface takes pointer events at ${label}`, strays.length === 0, strays.join(','));
}

// One more, with a request genuinely open: the sheet takes the pointer, the
// margin around it does not, so the wordmark and the porch stay live.
await ready(at(url, routes.apply('grace-community-vienna', 'fellowship-hall')));
const overSheet = await page.evaluate(() => {
  const box = document.querySelector('.letter__sheet').getBoundingClientRect();
  return document.elementsFromPoint(box.x + box.width / 2, box.y + 40)[0]?.className ?? '?';
});
checkThat('the open sheet takes its own clicks', /letter|field|eyebrow/.test(overSheet), overSheet);
const overPorch = await page.evaluate(() => {
  const box = document.querySelector('.letters').getBoundingClientRect();
  return document.elementsFromPoint(box.x + box.width / 2, box.y + box.height / 2)[0]?.className ?? '?';
});
checkThat('the porch stays reachable behind an open request', /letters/.test(overPorch), overPorch);

console.log(`\n──── ${checks - failed}/${checks} checks passed · ${problems.length} console problems ────\n`);
await closeBrowsers();
process.exit(failed || problems.length ? 1 : 0);
