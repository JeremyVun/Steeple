#!/usr/bin/env node
// THE WHOLE STORY — one request, end to end, in one session.
//
// The wave-2 workstreams each prove their own surface; this one proves they
// are the same conversation. A guest writes a request to a church that has had
// none yet, sends it, and the world flies it to the door and lights the
// lantern. The host finds that request waiting, asks a question; the guest
// answers it from their inbox; the host counter-offers another day; the guest
// accepts. The booking materializes, the church settles to steady window
// light, and the room's week ribbon carries the day the church actually agreed
// to. Then the demo is reset and the village forgets all of it.
//
// Everything is driven with real pointer, keyboard and form input. The store is
// only ever read (and reset) — never used to make the story happen.
//
//   node tools/wave2-test.mjs [baseUrl] [--shots <prefix>]
//     baseUrl  default http://localhost:5315
//
import puppeteer from 'puppeteer';

const base = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://localhost:5315';
const shotPrefix = process.argv.includes('--shots')
  ? process.argv[process.argv.indexOf('--shots') + 1]
  : null;

const STYLES = ['diorama', 'atlas'];
const VENUE = 'merrifield-fellowship'; // nothing seeded here: a clean sheet
const ROOM = 'main-hall';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let checks = 0;
let failures = 0;
function check(label, ok, detail = '') {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
}

for (const style of STYLES) {
  console.log(`\n──── the whole story · ${style} · ${base} ────`);

  // A browser per style: software GL is slow enough that two villages in one
  // process starve each other's render loop.
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const problems = [];
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (text.includes('GL Driver Message') || text.includes('GPU stall')) return;
    problems.push(`[console.error] ${text}`);
  });

  const url = `${base}/?style=${style}&q=low`;
  const state = (key) => page.evaluate(`__steeple.state.${key}`);
  const store = (expression) => page.evaluate(`__steeple.store.${expression}`);
  const world = (expression) => page.evaluate(`__steeple.world.correspondence.debug.${expression}`);
  const text = (selector) =>
    page.evaluate((s) => document.querySelector(s)?.textContent?.trim() ?? null, selector);

  async function shot(name) {
    if (!shotPrefix) return;
    await page.screenshot({ path: `/tmp/${shotPrefix}-${style}-${name}.png` });
    console.log(`        (shot /tmp/${shotPrefix}-${style}-${name}.png)`);
  }

  async function ready(target) {
    await page.goto(target, { waitUntil: 'networkidle0' });
    await page.waitForFunction('window.__steepleReady === true', { timeout: 45000 });
    await wait(2400);
  }

  /** Real mouse click at the middle of a selector, once it is on screen. */
  async function click(selector, label = selector) {
    const handle = await page.$(selector);
    if (!handle) return check(`click ${label}`, false, 'no such element') ?? false;
    await handle.evaluate((n) => n.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await wait(150);
    const box = await handle.boundingBox();
    if (!box) return check(`click ${label}`, false, 'not laid out') ?? false;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await wait(700);
    return true;
  }

  /** Real mouse click on the first element under `selector` reading `pattern`. */
  async function clickText(selector, pattern, label) {
    for (const handle of await page.$$(selector)) {
      const content = (await handle.evaluate((n) => n.textContent)).trim();
      if (!pattern.test(content)) continue;
      await handle.evaluate((n) => n.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await wait(180);
      const box = await handle.boundingBox();
      if (!box) continue;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await wait(700);
      return true;
    }
    check(`click ${label}`, false, `nothing reads ${pattern}`);
    return false;
  }

  /**
   * Light in this world eases: a lantern warms over a second or two and cools
   * the same way. Poll the world's own value until it says what we are waiting
   * for, or until it has plainly had long enough.
   */
  async function eventually(expression, settled, timeout = 12000) {
    const deadline = Date.now() + timeout;
    let value = await world(expression);
    while (!settled(value) && Date.now() < deadline) {
      await wait(400);
      value = await world(expression);
    }
    return value;
  }

  /** The centre of one week-card square. */
  async function cell(day, slot) {
    const handle = await page.$(`.week__cell[data-day="${day}"][data-slot="${slot}"]`);
    const box = handle && (await handle.boundingBox());
    return box && { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  /** A weekday whose 10 am square is genuinely free this week, `except` aside. */
  const freeWeekday = (except = -1) =>
    page.evaluate((skip) => {
      for (const day of [2, 3, 4, 5, 6, 1, 0]) {
        if (day === skip) continue;
        const node = document.querySelector(`.week__cell[data-day="${day}"][data-slot="4"]`);
        if (node && node.getAttribute('aria-disabled') !== 'true') return day;
      }
      return null;
    }, except);

  await ready(`${url}#/village`);
  await store('resetDemo()');
  await wait(600);

  // ── 1. the request, written and sent ───────────────────────────────────────
  console.log('\n1. a request written to a church with none waiting');
  await ready(`${url}#/room/${VENUE}/${ROOM}`);
  const quietBefore = await world(`lantern('${VENUE}')`);
  check(
    'the church is quiet before any request',
    quietBefore && quietBefore.waiting < 0.05,
    JSON.stringify(quietBefore)
  );

  await clickText('.sheet--room .pill--primary', /Request this space/, 'the room CTA');
  check('the CTA opens the composer', (await state('view')) === 'apply', await state('view'));
  check('the heading names the room', (await text('.letter__title')) === 'Main Hall');

  await page.click('#letter-intent');
  await page.keyboard.type(
    'Little Sparrows would like a weekly morning in the hall: songs, free play and a shared snack, with a parent alongside every child.'
  );
  await clickText('.letter__col--note .choice', /^Community$/, 'the activity');
  await page.click('#letter-size');
  await page.keyboard.type('24');

  const day = await freeWeekday();
  check('the week card offers a free morning', day !== null, `weekday ${day}`);
  const from = await cell(day, 4);
  const to = await cell(day, 7);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await wait(500);
  check('the drag paints one band', (await page.$$('.mark--band')).length === 1);
  await clickText('.choice--segment', /Every week/, 'every week');
  const until = await page.evaluate(() => document.querySelector('#letter-until')?.value ?? '');
  check('a weekly request is given an end date', /^\d{4}-\d{2}-\d{2}$/.test(until), until);
  await shot('composer');

  await clickText('.letter__foot .pill--primary', /Send request/, 'send request');
  check('the identity beat stands at the commitment point', await page.evaluate(
    () => document.querySelector('.identity')?.hidden === false
  ));
  // Wave 6: the step signs in for real against steeple's /auth/sessions, and
  // "Continue as …" is the send itself.
  await clickText('.identity__person', /Maria Alvarez/, 'sign in as Maria');
  await page.waitForFunction('!!document.querySelector(".identity .verified")', { timeout: 15000 }).catch(() => {});
  await wait(500);
  check('the trust wording is exact', (await text('.identity .verified')) === 'Identity verified (SSO)');
  await clickText('.identity__actions .pill--primary', /Continue as Maria Alvarez/, 'continue as Maria');
  await page.waitForFunction("__steeple.state.view === 'room'", { timeout: 25000 }).catch(() => {});
  await wait(1200);

  const application = await store('guestApplications()[0]');
  const id = application?.id;
  check('a request was filed', Boolean(id), id);
  check('it went to this room', application?.venueId === VENUE && application?.roomId === ROOM);
  check('it is pending', application?.status === 'pending', application?.status);
  check('it carries what was typed', /Little Sparrows/.test(application?.intentText ?? ''));
  check('and the whole recurrence', application?.frequency === 'weekly' && Boolean(application?.endDate),
    `${application?.frequency} until ${application?.endDate}`);
  check('the guest is put back at the room', (await state('view')) === 'room', await state('view'));

  // ── 2. the world carries it ────────────────────────────────────────────────
  console.log('\n2. the world flies it to the door');
  await shot('inflight');
  const flying = await world('envelopeFlying');
  check('the request is in the air', flying === true, String(flying));
  const landed = await eventually('envelopeFlying', (v) => v === false, 20000);
  check('and it lands', landed === false, String(landed));
  const litAfter = await eventually(`lantern('${VENUE}')`, (v) => v && v.waiting > 0.5);
  check(
    'the lantern lights where it landed',
    litAfter && litAfter.waiting > 0.5,
    `waiting ${quietBefore?.waiting?.toFixed?.(2)} → ${litAfter?.waiting?.toFixed?.(2)}`
  );
  await shot('landed');

  // ── 3. the same request, on the church's side ──────────────────────────────
  console.log('\n3. the church finds it');
  await click('.porchswitch', 'the mode switch');
  check('the lens turns to the host', (await state('mode')) === 'host', await state('mode'));
  check('and lands on the requests', (await state('view')) === 'desk', await state('view'));
  await page.select('#desk-venue', VENUE);
  await wait(1000);
  check('it is the church the request went to', (await store('hostVenueId()')) === VENUE);
  const card = await text(`[data-application="${id}"]`);
  check('the new request is on the board', Boolean(card), (card ?? '').slice(0, 48).replace(/\s+/g, ' '));
  check('it is the guest who wrote it', /Little Sparrows/.test(card ?? ''));
  await shot('desk');
  await click(`[data-application="${id}"]`, 'the new request');
  check('the request opens in the host lens', (await state('view')) === 'letter' && (await state('mode')) === 'host');
  check('the schedule ribbon is drawn', (await page.$$('.letterpage .lane')).length > 0);
  await shot('request-host');

  // ── 4. a question, and an answer from the inbox ────────────────────────────
  console.log('\n4. a question, answered');
  await click('[data-action="ask"]', 'Ask a question');
  await page.click('#ask-body');
  await page.keyboard.type('How many adults will be with the children, and would you like the small tables out?');
  await click('[data-action="send-question"]', 'Send the question');
  check('the request now needs information', (await store(`getApplication('${id}').status`)) === 'needsInfo',
    await store(`getApplication('${id}').status`));
  check('the question is in the thread', (await store(`threadFor('${id}').length`)) === 1);

  await click('.porchswitch', 'back to browsing');
  check('the lens turns back to the guest', (await state('mode')) === 'guest', await state('mode'));
  await clickText('.letters', /Inbox/, 'the porch tab');
  check('the inbox opens', (await state('view')) === 'journal', await state('view'));
  const row = await text(`.jrow[data-id="${id}"]`);
  check('the request is waiting on the guest', /question/i.test(row ?? ''), (row ?? '').slice(0, 60).replace(/\s+/g, ' '));
  await shot('inbox');
  await click(`.jrow[data-id="${id}"]`, 'the request in the inbox');
  await page.click('#letter-reply');
  await page.keyboard.type('Six adults will be with us, and the small tables would be very welcome. Thank you for asking.');
  await clickText('.reply .pill', /Send your answer/, 'send the answer');
  await wait(600);
  check('answering returns it to the church', (await store(`getApplication('${id}').status`)) === 'pending',
    await store(`getApplication('${id}').status`));
  check('both sides of the exchange are kept', (await store(`threadFor('${id}').length`)) === 2);

  // ── 5. the church suggests another day ─────────────────────────────────────
  console.log('\n5. a counter-offer');
  await click('.porchswitch', 'back to hosting');
  await click(`[data-application="${id}"]`, 'the request again');
  await click('[data-action="counter"]', 'Counter-offer');
  const other = await freeWeekday(day);
  await click(`.day[data-day="${day}"]`, 'take the asked-for day off');
  await click(`.day[data-day="${other}"]`, 'offer another day');
  await page.click('#counter-message');
  await page.keyboard.type('That morning is held by our toddler group until the winter. The hall is free and yours on the day below.');
  await wait(400);
  check(
    'their own request is ghosted behind the offer',
    (await page.$$('.letterpage .lane__ghost')).length >= 1
  );
  await shot('counter');
  await click('[data-action="send-counter"]', 'Send the counter-offer');
  check('the request is counter-offered', (await store(`getApplication('${id}').status`)) === 'counterOffered',
    await store(`getApplication('${id}').status`));
  const counter = await store(`countersFor('${id}').at(-1)`);
  check('the offer carries the day the church can do', counter?.daysOfWeekMask === 1 << other,
    `mask ${counter?.daysOfWeekMask} for weekday ${other}`);

  // ── 6. the guest accepts, and the village says so ──────────────────────────
  console.log('\n6. accepted — and the world keeps the record');
  await click('.porchswitch', 'back to browsing');
  await clickText('.letters', /Inbox/, 'the porch tab');
  await click(`.jrow[data-id="${id}"]`, 'the counter-offered request');
  check('the counter stands beside the guest’s own time', (await page.$$('.counter__side')).length === 2);
  await clickText('.counter .pill--primary', /Accept this time/, 'accept this time');
  await wait(1200);
  check('the request is approved', (await store(`getApplication('${id}').status`)) === 'approved',
    await store(`getApplication('${id}').status`));
  const booking = await store(`bookingFor('${id}')`);
  check('a booking exists', Boolean(booking), booking?.id);
  const occurrences = await page.evaluate(
    `__steeple.store.occurrencesFor(__steeple.store.bookingFor('${id}').id)`
  );
  check('its dates were materialized', occurrences.length > 0, `${occurrences.length} dates`);
  check(
    'and they fall on the day the church offered',
    occurrences.every((o) => new Date(`${o.date}T00:00:00`).getDay() === other),
    occurrences.slice(0, 3).map((o) => o.date).join(', ')
  );
  check('the dates are held on the page', (await page.$$('.held__item')).length > 0);
  await shot('accepted');

  const settled = await eventually(`lantern('${VENUE}')`, (v) => v && v.settled > 0.5);
  check('the church window burns steady', settled && settled.settled > 0.5, JSON.stringify(settled));
  const mask = await world(`ribbonMask('${VENUE}','${ROOM}')`);
  check('the room’s week ribbon carries that weekday', (mask & (1 << other)) !== 0, `mask ${mask}`);

  // ── 7. reset puts the village back ─────────────────────────────────────────
  console.log('\n7. reset');
  await ready(`${url}#/village`);
  const seeded = await store('resetDemo()');
  void seeded;
  await wait(1600);
  check('the request is gone', (await store(`getApplication('${id}')`)) === null,
    JSON.stringify(await store(`getApplication('${id}')`)));
  const afterReset = await eventually(
    `lantern('${VENUE}')`,
    (v) => v && v.waiting < 0.05 && v.settled < 0.05
  );
  check('and the church is quiet again', afterReset && afterReset.waiting < 0.05 && afterReset.settled < 0.05,
    JSON.stringify(afterReset));
  check('and the room keeps no ribbon', (await world(`ribbonMask('${VENUE}','${ROOM}')`)) === 0);
  await shot('village-after');

  const calls = await page.evaluate('__steeple.engine.renderer.info.render.calls');
  check('draw calls at village stay under budget', calls < 300, `${calls} < 300`);
  check('zero console errors', problems.length === 0, [...new Set(problems)].slice(0, 3).join(' | '));

  await page.close();
  await browser.close();
}

console.log(`\n${failures ? `${failures} FAILURE(S)` : 'all clear'}: ${checks - failures}/${checks} checks passed\n`);
process.exit(failures ? 1 : 0);
