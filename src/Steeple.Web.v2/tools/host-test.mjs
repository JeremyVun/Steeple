// Real-input test for the host's side (CONTRACT2 §5): the quiet mode switch,
// the requests, the schedule ribbon, the four decisions, the open-hours
// painter and the listing flow — all driven with actual mouse and keyboard
// events, never the debug API. Store state is read afterwards to prove the
// mutation really happened.
//
//   node tools/host-test.mjs "http://localhost:5313/?q=low"
//   node tools/host-test.mjs "http://localhost:5313/?q=low&style=atlas&desk=ledger" --shots hsc-ledger
import puppeteer from 'puppeteer';

const url = process.argv[2] ?? 'http://localhost:5313/?q=low';
const shotPrefix = process.argv.includes('--shots')
  ? process.argv[process.argv.indexOf('--shots') + 1]
  : null;

const browser = await puppeteer.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

const problems = [];
let checks = 0;
let failures = 0;

page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
page.on('console', (msg) => {
  if (msg.type() !== 'error') return;
  const text = msg.text();
  if (text.includes('GL Driver Message') || text.includes('GPU stall')) return;
  problems.push(`[console.error] ${text}`);
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const state = (key) => page.evaluate(`__steeple.state.${key}`);
const store = (expression) => page.evaluate(`__steeple.store.${expression}`);

function check(label, ok, detail = '') {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function shot(name) {
  if (!shotPrefix) return;
  await page.screenshot({ path: `/tmp/${shotPrefix}-${name}.png` });
  console.log(`        (shot /tmp/${shotPrefix}-${name}.png)`);
}

async function ready(target = url) {
  await page.goto(target, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__steepleReady === true', { timeout: 25000 });
  await wait(2200);
}

/** Real mouse click on a selector, reporting what is actually topmost there. */
async function click(selector, label = selector) {
  const handle = await page.$(selector);
  if (!handle) {
    check(`click ${label}`, false, 'no element');
    return false;
  }
  await handle.evaluate((n) => n.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await wait(120);
  const box = await handle.boundingBox();
  if (!box) {
    check(`click ${label}`, false, 'not laid out');
    return false;
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const top = await page.evaluate(
    (px, py) => {
      const node = document.elementsFromPoint(px, py)[0];
      return node ? `${node.tagName.toLowerCase()}.${node.className || ''}`.slice(0, 60) : '?';
    },
    x,
    y
  );
  await page.mouse.click(x, y);
  await wait(700);
  check(`click ${label}`, true, `topmost: ${top}`);
  return true;
}

/** Click a button by its text inside a scope. */
async function clickText(selector, pattern, label) {
  for (const handle of await page.$$(selector)) {
    const text = (await handle.evaluate((n) => n.textContent)).trim();
    if (!pattern.test(text)) continue;
    await handle.evaluate((n) => n.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await wait(120);
    const box = await handle.boundingBox();
    if (!box) continue;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await wait(700);
    check(`click ${label}`, true, JSON.stringify(text.slice(0, 40)));
    return true;
  }
  check(`click ${label}`, false, `no match for ${pattern}`);
  return false;
}

const text = (selector) =>
  page.evaluate((s) => document.querySelector(s)?.textContent?.trim() ?? null, selector);

const visible = (selector) =>
  page.evaluate((s) => {
    const node = document.querySelector(s);
    if (!node) return false;
    return node.checkVisibility ? node.checkVisibility() : node.offsetParent !== null;
  }, selector);

console.log(`\n── hosting · ${url} ──`);
await ready();
await store("resetDemo()");
await wait(300);

// ── 1. the quiet mode switch ───────────────────────────────────────────────
console.log('\n1. the quiet mode switch');
await clickText('.arrival__cta', /Find a space/, 'arrival CTA');
// Headless GL runs app-time several times slow, so the roll takes many times
// its own duration in wall clock. Wait on the roll itself: the porch the next
// click needs is not on the page until the surface has landed.
await page.waitForFunction('__steeple.state.roll >= 0.999', { timeout: 30000 }).catch(() => {});
await wait(800);
check('porch switch reads as an offer', (await text('.porchswitch')) === 'I have space to share');
await click('.porchswitch', 'mode switch');
check('mode is host', (await state('mode')) === 'host', await state('mode'));
check('view is the host view', (await state('view')) === 'desk', await state('view'));
check('hash deep-links it', /#\/desk/.test(await page.evaluate('location.hash')));
check('documentElement carries data-mode', (await page.evaluate('document.documentElement.dataset.mode')) === 'host');
check('the switch offers the way back', (await text('.porchswitch')) === 'Back to browsing');
const deskCards = await page.$$eval('[data-application]', (nodes) => nodes.length);
check('four requests at Grace (3 waiting + 1 answered)', deskCards === 4, `${deskCards} found`);
const said = await text('#a11y');
check(
  'the live region says the waiting requests out loud',
  /Grace Community/.test(said ?? '') && /waiting/.test(said ?? ''),
  `${(said ?? '').slice(0, 90)}…`
);
await shot('desk');

// ── 2. the chess request: the clash is legible ─────────────────────────────
console.log('\n2. the chess request — a collision, shown honestly');
await click('[data-application="app-chess-club"]', 'chess request');
check('view is the request', (await state('view')) === 'letter');
check('lens stayed host', (await state('mode')) === 'host');
const clashNote = await text('.verdict__note--clash');
check('the verdict names the collision', /collide/.test(clashNote ?? ''), clashNote);
const clashLanes = await page.$$eval('.letterpage .lane--clash', (n) => n.length);
check('exactly one lane is drawn as colliding', clashLanes === 1, `${clashLanes}`);
const collideBars = await page.$$eval('.letterpage .lane__collide', (n) => n.length);
check('the overlap itself is drawn', collideBars >= 1, `${collideBars} hatched segments`);
check('what already holds the room is named', /Chorale/.test((await text('.held')) ?? ''));
const letterSaid = await text('#a11y');
check(
  'the ribbon is spoken, lane by lane',
  /Thursday/.test(letterSaid ?? '') && /collides/.test(letterSaid ?? ''),
  `${(letterSaid ?? '').slice(-110)}`
);
await shot('request-chess');

// ── 3. approve refuses, honestly, and steers to a counter ──────────────────
console.log('\n3. approve on a clash → the collision, then a counter-offer');
await click('[data-action="approve"]', 'Approve');
check('still pending after a blocked approve', (await store("getApplication('app-chess-club').status")) === 'pending');
check('the collision drawer opened', await visible('.clashlist'));
await shot('request-clash');
await click('[data-action="counter-instead"]', 'Offer another time');
check('counter editor open', await visible('[data-action="send-counter"]'));
check(
  'their request is ghosted behind the offer',
  (await page.$$eval('.letterpage .lane__ghost', (n) => n.length)) >= 1
);

// real form input: move the club off Thursday and onto Tuesday
await click('.day[data-day="4"]', 'Thursday off');
await click('.day[data-day="2"]', 'Tuesday on');
await page.click('#counter-message');
await page.keyboard.type('Thursday evenings are held by our chorale until the winter concerts. Tuesdays are free and the hall is yours from six.');
await wait(400);
const counterVerdict = await text('.verdict__note--clear');
check('the ribbon says the new time is free', /free/i.test(counterVerdict ?? ''), counterVerdict);
const sendDisabled = await page.$eval('[data-action="send-counter"]', (n) => n.disabled);
check('send is allowed once the collision clears', sendDisabled === false);
await shot('request-counter');
await click('[data-action="send-counter"]', 'Send the counter-offer');
check(
  'application is counterOffered',
  (await store("getApplication('app-chess-club').status")) === 'counterOffered',
  await store("getApplication('app-chess-club').status")
);
const counterDays = await store("countersFor('app-chess-club').at(-1).daysOfWeekMask");
check('the counter carries Tuesday, not Thursday', counterDays === 4, `mask ${counterDays}`);
check('the counter kept its message', /chorale/i.test(await store("countersFor('app-chess-club').at(-1).message")));
check('counter history is on the page', /Times you have offered/.test((await text('.counters')) ?? ''));

// ── 4. Esc closes a drawer before it leaves the request ────────────────────
console.log('\n4. Esc paths');
await click('[data-action="ask"]', 'Write back');
check('ask drawer open', await visible('#ask-body'));
await page.keyboard.press('Escape');
await wait(500);
check('Esc closed the drawer, not the request', (await state('view')) === 'letter');
check('the drawer is gone', !(await visible('#ask-body')));
await page.keyboard.press('Escape');
await wait(1400);
check('Esc again returns to the request list', (await state('view')) === 'desk', await state('view'));

// ── 5. approve a clean request → a booking exists ──────────────────────────
console.log('\n5. the clean request — approve');
await click('[data-application="app-esl-evenings"]', 'ESL request');
check('the verdict is clear', /free/i.test((await text('.verdict__note--clear')) ?? ''));
await click('[data-action="approve"]', 'Approve');
check('approved', (await store("getApplication('app-esl-evenings').status")) === 'approved');
const booking = await store("bookingFor('app-esl-evenings')");
check('a booking was made', Boolean(booking), booking?.id);
const occurrences = await page.evaluate(
  "__steeple.store.occurrencesFor(__steeple.store.bookingFor('app-esl-evenings').id).length"
);
check('occurrences were materialized', occurrences > 20, `${occurrences} dates`);
check('the confirmation shows', await visible('.seal__card'));
await shot('request-approved');
// It steps aside on its own after a beat; take the way back before it does.
await click('[data-action="back-to-desk"]', 'Back to requests');
await wait(900);
check('back at the request list', (await state('view')) === 'desk', await state('view'));
check('the approved request moved to the answered list', /ESL Conversation Circle/.test((await text('.record')) ?? ''));

// ── 6. ask a question → needsInfo ──────────────────────────────────────────
console.log('\n6. ask a question');
await click('[data-application="app-sparrows-mornings"]', 'sparrows request');
await click('[data-action="ask"]', 'Ask a question');
await clickText('.starters .linkish', /How many adults/, 'a question starter');
await page.click('#ask-body');
await page.keyboard.type(' We can have the small tables out for you.');
await click('[data-action="send-question"]', 'Send the question');
check(
  'the request now needs info',
  (await store("getApplication('app-sparrows-mornings').status")) === 'needsInfo',
  await store("getApplication('app-sparrows-mornings').status")
);
const thread = await store("threadFor('app-sparrows-mornings').length");
check('the question is in the thread', thread === 1, `${thread} messages`);
check('the thread is shown', /How many adults/.test((await text('.thread')) ?? ''));

// ── 7. decline with an edited note ─────────────────────────────────────────
console.log('\n7. decline, kindly, with an edited note');
await click('[data-action="decline"]', 'Decline');
const draft = await page.$eval('#decline-note', (n) => n.value);
check('a note is written for the host', draft.length > 60 && !/!/.test(draft), `${draft.length} chars`);
await page.click('#decline-note');
await page.keyboard.press('End');
await page.keyboard.type(' The nursery is being repainted through September.');
await shot('request-decline');
await click('[data-action="send-decline"]', 'Send the decline');
check('declined', (await store("getApplication('app-sparrows-mornings').status")) === 'declined');
check(
  'the edited words were kept',
  /repainted/.test(await store("getApplication('app-sparrows-mornings').declineNote")),
);
check('back at the request list after deciding', (await state('view')) === 'desk');

// ── 8. the listing flow: the annex at Oakton, end to end ───────────────────
console.log('\n8. the listing flow — publishing the Renovation Annex');
await page.select('#desk-venue', 'oakton-baptist');
await wait(900);
check('the church was switched', (await store('hostVenueId()')) === 'oakton-baptist');
check('the page follows', /Oakton Baptist/.test((await text('.desk__head')) ?? ''));
await clickText('.tab', /^Spaces/, 'Spaces tab');
// `.spaces` is also the venue panel's list on the guest surface behind this
// one, so the desk's own list is asked for by name.
check('the draft annex is listed', /Renovation Annex/.test((await text('.desk .spaces')) ?? ''));
check('and it has no hours yet', /No open hours/.test((await text('.desk .spaces')) ?? ''), (await text('.desk .spaces'))?.slice(0, 70));
await shot('desk-spaces');
await clickText('.space__side .pill', /Finish this listing/, 'Finish this listing');
check('the listing flow opened', await visible('.listing'));
check('it opens at Describe', (await text('.steps__step.is-on')) === '3Describe');
await page.click('#room-name');
await page.keyboard.press('End');
await page.keyboard.type(' — West Wing');
await clickText('.toggles .chip--toggle', /^Education$/, 'welcome Education too');
await shot('listing-describe');
await click('[data-action="advance"]', 'Set availability');
check('the describe edits were saved', /West Wing/.test(await store("effectiveRoom('oakton-baptist','renovation-annex').name")));
check('the painter is on screen', await visible('.paint__grid'));

// paint Wednesday with a real drag
const from = await page.$('.paint__row:nth-child(4) .paint__cell[data-slot="4"]');
const to = await page.$('.paint__row:nth-child(4) .paint__cell[data-slot="27"]');
const fromBox = await from.boundingBox();
const toBox = await to.boundingBox();
await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
await page.mouse.down();
await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, { steps: 12 });
await page.mouse.up();
await wait(600);
const painted = await store("openHoursFor('oakton-baptist','renovation-annex')");
check('the drag painted a window', painted.length === 1, JSON.stringify(painted));
check(
  'and it is Wednesday, starting at 8 am',
  painted[0]?.day === 3 && painted[0]?.start === '08:00',
  JSON.stringify(painted[0])
);

// keyboard path: arrow to Thursday and open a half hour with Space
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowUp');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Space');
await wait(400);
const afterKey = await store("openHoursFor('oakton-baptist','renovation-annex').length");
check('the keyboard paints too', afterKey === 2, `${afterKey} windows`);
await clickText('.paint__quick .linkish', /Copy the first day/, 'copy the day across');
const copied = await store("openHoursFor('oakton-baptist','renovation-annex')");
check('copied across the week', copied.length === 7, `${copied.length} windows`);
await shot('listing-hours');

// a blackout date
await page.$eval('#blackout-date', (n) => {
  const soon = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
  n.value = soon;
  n.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.click('#blackout-reason');
await page.keyboard.type('Floor sealing');
await click('[data-action="add-blackout"]', 'Set the day aside');
const blackouts = await store("blackoutsFor('oakton-baptist','renovation-annex').length");
check('a closed day was recorded', blackouts === 1, `${blackouts}`);

await click('[data-action="advance"]', 'Review and publish');
check('publish step', (await text('.steps__step.is-on')) === '5Publish');
await shot('listing-publish');
await page.evaluate(() => {
  window.__publishEvents = [];
  window.__steeple.bus.on('store:change', (e) => window.__publishEvents.push(e));
});
await click('[data-action="advance"]', 'Publish this space');
check(
  'the annex is published',
  (await store("effectiveRoom('oakton-baptist','renovation-annex').status")) === 'published'
);
const events = await page.evaluate('JSON.stringify(window.__publishEvents)');
check(
  'the world is told: room-edit published',
  /"type":"room-edit".*"published":true/.test(events),
  events.slice(0, 120)
);
await click('[data-action="close"]', 'Close the flow');
check('the flow is closed', !(await visible('.listing')));
check('the request list is back', await visible('.desk'));

// ── 9. the publish gate is guidance, not a scold ───────────────────────────
console.log('\n9. the publish gate on a room with no hours');
await store("resetDemo()");
await wait(600);
await clickText('.tab', /^Spaces/, 'Spaces tab');
await clickText('.space__side .pill', /Finish this listing/, 'Finish this listing');
await clickText('.steps__step', /Availability/, 'jump to Availability');
check('cannot advance without hours', await page.$eval('[data-action="advance"]', (n) => n.disabled));
check('and says why, kindly', /Paint at least one open window/.test((await text('.listing__hint')) ?? ''));

// The bounce (CONTRACT6 §3.6). The rail has always let a host look at Publish
// before the room is ready. What must never happen again is the button being
// offered there and answering the press by moving them to another step.
await clickText('.steps__step', /Publish/, 'look at Publish with no hours');
check('the publish step can be looked at', (await text('.steps__step.is-on')) === '5Publish');
check(
  'but publishing is not offered while a rule forbids it',
  await page.$eval('[data-action="advance"]', (n) => n.disabled)
);
check('and what is missing is named', /Open hours/.test((await text('.guide__list')) ?? ''), await text('.guide__list'));
await click('[data-action="fix-hours"]', 'Set the open hours');
check(
  'the way to fix it is an offer the host takes, not a bounce',
  (await text('.steps__step.is-on')) === '4Availability',
  await text('.steps__step.is-on')
);
await clickText('.steps__step', /Describe/, 'back to Describe');
await click('[data-action="advance"]', 'Set availability');
await clickText('.paint__quick .linkish', /Open every day/, 'the standard week');
check('hours saved', (await store("openHoursFor('oakton-baptist','renovation-annex').length")) === 7);
await click('[data-action="advance"]', 'Review and publish');
check('the guidance is gone once there are hours', !(await visible('.guide')));
await page.keyboard.press('Escape');
await wait(500);
check('Esc closes the listing flow', !(await visible('.listing')));
check('and does not throw the host out of the request list', (await state('view')) === 'desk');

// ── 10. hit-testing: a closed surface never swallows the scene ─────────────
console.log('\n10. elementsFromPoint audit');
await page.keyboard.press('Escape');
await wait(1600);
check('Esc leaves hosting for the village', (await state('view')) === 'village', await state('view'));
check('and the lens goes back to guest', (await state('mode')) === 'guest');
const audit = await page.evaluate(() => {
  const points = [
    [720, 450],
    [200, 300],
    [1200, 700],
    [400, 820],
    [1100, 160],
  ];
  // The host's own surfaces, by exact class: the map's results list is
  // `dm-listing`, which a substring match on "listing" wrongly accused.
  const HOST = new Set(['hostdesk', 'listing', 'listing__layer', 'letterpage', 'desk', 'seal']);
  const offenders = [];
  for (const [x, y] of points) {
    for (const node of document.elementsFromPoint(x, y)) {
      const classes = [...node.classList];
      if (classes.some((one) => HOST.has(one))) {
        offenders.push(`${x},${y} → ${node.tagName.toLowerCase()}.${node.className}`);
      }
    }
  }
  return { offenders, centre: document.elementsFromPoint(720, 450).map((n) => n.tagName).join('>') };
});
check('no closed host surface intercepts the scene', audit.offenders.length === 0, audit.offenders.join(' | '));
// Since the map era the map surface sits over the world; what matters here is
// that the scene is reachable and nothing of the host's is in front of it.
check('the world canvas is still in the stack at centre', audit.centre.includes('CANVAS'), audit.centre);
await shot('village-after');

// hosting itself must be reachable again and its own clicks must land on it
await click('.porchswitch', 'back to hosting');
check('re-entering hosting opens the requests', (await text('.tab.is-on')) === 'Requests · 3');
const deskTop = await page.evaluate(() => {
  const card = document.querySelector('[data-application]');
  const box = card.getBoundingClientRect();
  const node = document.elementsFromPoint(box.x + box.width / 2, box.y + box.height / 2)[0];
  return `${node.tagName.toLowerCase()}.${node.className}`;
});
check('a request card is the topmost thing at its own centre', /card|row/.test(deskTop), deskTop);

// ── 11. the host side's own rendering flag ─────────────────────────────────
console.log('\n11. the ?desk= variant switch');
const before = await page.evaluate('location.search');
const wanted = before.includes('desk=ledger') ? /^Board$/ : /^Ledger$/;
await clickText('.desk__variant .segment', wanted, 'the other layout');
await wait(1200);
check(
  'the layout switched in place, without a reload',
  (await page.evaluate('location.search')) === before,
  await page.evaluate('location.search')
);
check('and landed back in hosting', (await state('view')) === 'desk', await page.evaluate('location.href'));
check(
  'the other rendering language is in force',
  (await page.$$eval('.rows, .cards', (n) => n.length)) === 1
);

console.log(`\n${failures ? 'FAILURES' : 'all clear'}: ${checks - failures}/${checks} checks passed`);
if (problems.length) {
  console.log('\nconsole/page errors:');
  for (const problem of [...new Set(problems)]) console.log(`  ${problem}`);
} else {
  console.log('zero console errors');
}

await browser.close();
process.exit(failures || problems.length ? 1 : 0);
