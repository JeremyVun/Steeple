#!/usr/bin/env node
// THE WEEK CARD, UNDER A REAL MOUSE — the regression that guards CONTRACT5 §4.2.
//
// The bug this was written for: paint Wednesday 11–12, then click a Tuesday
// square without moving the cursor, and the band left Wednesday and reappeared
// on Tuesday still reading 11–12 — the hours the guest had just clicked on were
// thrown away. A click must land where it was aimed.
//
// Every gesture here is a real puppeteer mouse press: the DOM says nothing
// about whether pointer capture, the drag/click discrimination and the grid's
// own hit test agree, and that disagreement is where the bug lived.
//
//   node tools/week-card-test.mjs "http://localhost:5323/?q=low"

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

const url = process.argv[2] ?? 'http://localhost:5323/?q=low';
const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

let failed = 0;
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  if (m.text().includes('GL Driver') || (m.location?.()?.url ?? '').includes('/api/v1/')) return;
  errors.push(`[console] ${m.text()}`);
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (selector) => page.$eval(selector, (n) => n.textContent.trim()).catch(() => null);
const countOf = (selector) => page.$$eval(selector, (n) => n.length).catch(() => 0);

function check(label, got, want) {
  const ok = got === want;
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label} — ${JSON.stringify(got)}${ok ? '' : ` (wanted ${JSON.stringify(want)})`}`);
}

function checkThat(label, ok, detail = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

/** The centre of one week-card square, in page coordinates. */
async function cellBox(day, slot) {
  const handle = await page.$(`.week__cell[data-day="${day}"][data-slot="${slot}"]`);
  const box = await handle?.boundingBox();
  if (!box) throw new Error(`no square at day ${day} slot ${slot}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** A press and release at one square, with no movement at all in between. */
async function tap(day, slot) {
  const at = await cellBox(day, slot);
  await page.mouse.move(at.x, at.y);
  await wait(60);
  await page.mouse.down();
  await wait(60);
  await page.mouse.up();
  await wait(450);
}

/** A real drag down one column, square to square. */
async function drag(day, fromSlot, toSlot) {
  const from = await cellBox(day, fromSlot);
  const to = await cellBox(day, toSlot);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await wait(450);
}

console.log(`\n──── the week card under a real mouse · ${url} ────`);

await page.goto('about:blank');
await page.goto(`${url}#/apply/grace-community-vienna/fellowship-hall`, { waitUntil: 'networkidle0' });
await page.waitForFunction('window.__steepleReady === true', { timeout: 25000 });
await page.evaluate('__steeple.store.resetDemo()');
await page.evaluate('__steeple.roll.set(1)');
await page.evaluate("__steeple.setView('apply',{venueId:'grace-community-vienna',roomId:'fellowship-hall'})");
await wait(1200);

checkThat('the request sheet is open', (await countOf('.guest__surface--letter.is-open')) === 1);

// Next week, so every square in play is in the future whatever day it is today.
await page.click('.week__step[aria-label="Next week"]');
await wait(500);

// Open hours run 08:00–22:00, so slot 6 is 11:00 and each square is half an hour.
const SLOT_11AM = 6;
const SLOT_9AM = 2;
const WED = 3;
const TUE = 2;

// ── 1. paint Wednesday 11–1 with a real drag ────────────────────────────────
// Two hours, not one, so the next check can tell "an hour where you clicked"
// apart from "the hours it came from" and from "the length it came from".
console.log('\n1. paint Wednesday 11 am – 1 pm');
await drag(WED, SLOT_11AM, SLOT_11AM + 3);
check('one band stands', await countOf('.mark--band'), 1);
check('it reads its hours', await text('.mark--band .mark__label'), '11–1');
const painted = await text('.letter__summaryline');
checkThat('the summary says Wednesday, 11 am – 1 pm', /Wednesday, \w+ \d+, 11 am – 1 pm/.test(painted ?? ''), painted);

// ── 2. a bare click on a Tuesday square, cursor never moving ────────────────
console.log('\n2. click a Tuesday square at 9 am, without moving the cursor');
await tap(TUE, SLOT_9AM);
const moved = await text('.letter__summaryline');
check('still exactly one band', await countOf('.mark--band'), 1);
checkThat('the band moved to Tuesday', /Tuesday/.test(moved ?? ''), moved);
checkThat(
  'and it landed on the hour that was clicked, not the hours it came from',
  /Tuesday, \w+ \d+, 9 – 10 am/.test(moved ?? ''),
  moved
);
checkThat(
  'neither the old hours nor the old length travelled with it',
  !/11 am/.test(moved ?? '') && !/9 – 11 am/.test(moved ?? ''),
  moved
);
check('the band label follows', await text('.mark--band .mark__label'), '9–10');
await page.screenshot({ path: '/tmp/w6c-weekcard-click.png' });

// ── 3. the same rule inside one column ──────────────────────────────────────
console.log('\n3. a click below the band on its own day moves it there too');
await tap(TUE, SLOT_11AM + 4); // 13:00
const later = await text('.letter__summaryline');
checkThat('the band moved to the hour clicked', /Tuesday, \w+ \d+, 1 – 2 pm/.test(later ?? ''), later);

// ── 4. weekly still adds a weekday rather than moving the band ──────────────
console.log('\n4. weekly: a click on an unchosen day adds it, band unchanged');
for (const handle of await page.$$('.choice--segment')) {
  const label = (await handle.evaluate((n) => n.textContent)).trim();
  if (label !== 'Every week') continue;
  const box = await handle.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  break;
}
await wait(500);
await tap(4, SLOT_11AM + 4); // Thursday, same hours
check('two days painted', await countOf('.mark--band'), 2);
const weekly = await text('.letter__summaryline');
checkThat('both weekdays are named at the one time', /Tuesdays and Thursdays, 1 – 2 pm/.test(weekly ?? ''), weekly);

// ── 5. nothing invisible sits over the grid ─────────────────────────────────
console.log('\n5. the grid is what the pointer hits');
const at = await cellBox(TUE, SLOT_9AM);
const stack = await page.evaluate(
  (x, y) =>
    document
      .elementsFromPoint(x, y)
      .slice(0, 2)
      .map((n) => `${n.tagName.toLowerCase()}.${(typeof n.className === 'string' ? n.className : '') || '-'}`),
  at.x,
  at.y
);
checkThat('a week square is the topmost thing at a week square', /week__cell|mark/.test(stack[0] ?? ''), stack.join(' | '));

for (const line of errors) console.log(line);
console.log(`\n${failed === 0 && errors.length === 0 ? 'PASS' : `FAIL — ${failed} check(s), ${errors.length} page error(s)`}`);
await closeBrowsers();
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
