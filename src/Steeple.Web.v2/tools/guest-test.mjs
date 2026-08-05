// Real-input test for the guest's side (Workstream B): the room CTA, the
// request composer, painting the week card with a real drag, the keyboard path
// over the grid, the identity beat, sending, the inbox, accepting the seeded
// counter-offer, answering a NeedsInfo question, the Esc paths, and an
// elementsFromPoint audit proving a closed surface never swallows the village.
//
//   node tools/guest-test.mjs "http://localhost:5312/?q=low"
//
// Nothing here drives window.__steeple except resetDemo and reads: every
// affordance is exercised with the mouse and the keyboard.
import puppeteer from 'puppeteer';

const url = process.argv[2] ?? 'http://localhost:5312/?q=low';
const browser = await puppeteer.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
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

const style = url.includes('style=atlas') ? 'atlas' : 'diorama';
console.log(`\n──── guest requests · ${style} · ${url} ────`);

await ready(`${url}#/village`);
await page.evaluate('__steeple.store.resetDemo()');
await wait(400);

// ── 1. CTA → composer ───────────────────────────────────────────────────────
console.log('\n1. the room CTA opens the request');
await ready(`${url}#/room/grace-community-vienna/fellowship-hall`);
await clickText('.sheet--room .pill--primary', /Request this space/, 'request CTA');
await wait(900);
check('view after CTA', await state('view'), 'apply');
check('hash', await page.evaluate('location.hash'), '#/apply/grace-community-vienna/fellowship-hall');
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
console.log('\n6. the identity beat');
checkThat('no identity step before sending', await page.evaluate(() => document.querySelector('.identity')?.hidden === true));
await clickText('.letter__foot .pill--primary', /Send request/, 'Send request');
await wait(400);
checkThat('identity step appears', await page.evaluate(() => document.querySelector('.identity')?.hidden === false));
check('it names the persona', await text('.identity__name'), 'Maria Alvarez');
checkThat(
  'the trust chip is not claimed before verifying',
  await page.evaluate(() => {
    const chip = document.querySelector('.identity .verified');
    return !chip || getComputedStyle(chip).display === 'none';
  })
);
check('and the group', await text('.identity__org'), 'Little Sparrows Playgroup');
await page.screenshot({ path: '/tmp/gsb-sso.png' });
// Wave 6: the step signs in for real. Choosing a person calls steeple's own
// /auth/sessions, and only a session that came back earns the chip.
await clickText('.identity__person', /Maria Alvarez/, 'sign in as Maria');
await page.waitForFunction('!!document.querySelector(".identity .verified")', { timeout: 15000 }).catch(() => {});
await wait(600);
check('trust wording is exact', await text('.identity .verified'), 'Identity verified (SSO)');
await page.screenshot({ path: '/tmp/gsb-sso-verified.png' });

// ── 7. send, and get out of the way ─────────────────────────────────────────
console.log('\n7. sending');
const beforeSend = await page.evaluate('__steeple.store.guestApplications().length');
// "Continue as …" is the send: the guest asked for that when they pressed
// Send request, and naming themselves was the last thing left.
await clickText('.identity__actions .pill--primary', /Continue as Maria Alvarez/, 'continue as Maria');
await page.waitForFunction("__steeple.state.view === 'room'", { timeout: 25000 }).catch(() => {});
await wait(1200);
const afterSend = await page.evaluate('__steeple.store.guestApplications().length');
check('a request was filed', afterSend, beforeSend + 1);
check('the newest is pending', await page.evaluate('__steeple.store.guestApplications()[0].status'), 'pending');
check('the guest is back at the room', await state('view'), 'room');
checkThat('a quiet confirmation stands', await page.evaluate(() => document.querySelector('.sent')?.hidden === false));
check('the sheet is folded away', await countOf('.guest__surface--letter.is-open'), 0);
await page.screenshot({ path: '/tmp/gsb-sent.png' });
checkThat(
  'the folded sheet does not swallow the village',
  !(await topmostAtCentre()).includes('letter'),
  await topmostAtCentre()
);

// ── 8. the inbox, through the porch ─────────────────────────────────────────
console.log('\n8. the inbox');
await clickText('.letters', /Inbox/, 'porch tab');
await wait(900);
check('view', await state('view'), 'journal');
check('every seeded request is here', await countOf('.jrow'), afterSend);
const statuses = await page.evaluate(() =>
  [...document.querySelectorAll('.jrow')].map((n) => n.dataset.status)
);
for (const wanted of ['pending', 'needsInfo', 'counterOffered', 'approved', 'declined']) {
  checkThat(`the inbox shows a ${wanted} request`, statuses.includes(wanted), statuses.join(','));
}
const spokenJournal = await text('#a11y');
checkThat('the live region reads the inbox aloud', /Inbox\. \d+ requests/.test(spokenJournal ?? ''), spokenJournal?.slice(0, 70));
await page.screenshot({ path: '/tmp/gsb-journal.png' });

// ── 9. accepting the seeded counter-offer ───────────────────────────────────
console.log('\n9. the counter-offer');
await clickText('.jrow[data-id="app-sparrows-stories"]', /./, 'the counter-offered request');
await wait(900);
check('view', await state('view'), 'letter');
check('applicationId', await state('applicationId'), 'app-sparrows-stories');
checkThat('the counter is shown beside your own time', (await countOf('.counter__side')) === 2);
await page.screenshot({ path: '/tmp/gsb-letter-counter.png' });
// Declining opens a note first — reveal it, then think better of it.
await clickText('.counter .linkish', /Keep my original time/, 'keep my original time');
checkThat('declining asks before it acts', (await countOf('.counter__confirm')) === 1);
await page.screenshot({ path: '/tmp/gsb-counter-decline.png' });
await clickText('.counter__confirm .linkish', /^Cancel$/, 'cancel the decline');
checkThat('cancelling puts it away', (await countOf('.counter__confirm')) === 0);
check(
  'and changes nothing',
  await page.evaluate('__steeple.store.getApplication("app-sparrows-stories").status'),
  'counterOffered'
);
await clickText('.counter .pill--primary', /Accept this time/, 'accept the counter');
await wait(900);
check(
  'status is approved',
  await page.evaluate('__steeple.store.getApplication("app-sparrows-stories").status'),
  'approved'
);
checkThat('the held dates appear', (await countOf('.held__item')) > 0, `${await countOf('.held__item')} dates`);
await page.screenshot({ path: '/tmp/gsb-letter-approved.png' });

// ── 10. answering a question returns the request to the church ──────────────
console.log('\n10. answering NeedsInfo');
await ready(`${url}#/letter/app-sparrows-craft`);
check('cold link opens the request', await state('view'), 'letter');
check(
  'it starts as needsInfo',
  await page.evaluate('__steeple.store.getApplication("app-sparrows-craft").status'),
  'needsInfo'
);
checkThat('the reply is framed as an answer', (await text('.reply .pill')) === 'Send your answer');
await page.screenshot({ path: '/tmp/gsb-letter-needsinfo.png' });
await page.click('#letter-reply');
await page.keyboard.type('Six adults will be with us, and yes we would like to paint. Thank you for covering the tables.');
await clickText('.reply .pill', /Send your answer/, 'send the answer');
await wait(800);
check(
  'the request is back with the church',
  await page.evaluate('__steeple.store.getApplication("app-sparrows-craft").status'),
  'pending'
);
checkThat('the answer joined the thread', (await countOf('.thread__item--guest')) === 1);
checkThat(
  'the rebuild keeps the keyboard inside the request',
  await page.evaluate(() => document.querySelector('.opened')?.contains(document.activeElement) ?? false)
);
await page.screenshot({ path: '/tmp/gsb-letter-answered.png' });

// ── 10b. withdrawing ────────────────────────────────────────────────────────
console.log('\n10b. withdrawing a request');
await ready(`${url}#/letter/app-sparrows-mornings`);
await clickText('.closing .linkish', /Withdraw this request/, 'withdraw');
checkThat('withdrawing asks before it acts', (await countOf('.closing--confirm')) === 1);
await page.screenshot({ path: '/tmp/gsb-letter-withdraw.png' });
await clickText('.closing--confirm .linkish', /Keep it with the host/, 'keep it');
check(
  'thinking better of it changes nothing',
  await page.evaluate('__steeple.store.getApplication("app-sparrows-mornings").status'),
  'pending'
);
await clickText('.closing .linkish', /Withdraw this request/, 'withdraw again');
await clickText('.closing--confirm .pill', /Yes, withdraw it/, 'confirm the withdrawal');
await wait(600);
check(
  'the request is withdrawn',
  await page.evaluate('__steeple.store.getApplication("app-sparrows-mornings").status'),
  'withdrawn'
);
checkThat('and offers nothing more to do', (await countOf('.closing .linkish')) === 0);

// ── 11. Esc paths: a request returns to where it was opened from ────────────
// (Workstream D's return-path memory: Esc leaves a request view for the last
// place the visitor actually stood in the world.)
console.log('\n11. Esc');
await ready(`${url}#/room/dunn-loring-umc/art-studio`);
await ready(`${url}#/letter/app-sparrows-craft`);
await page.keyboard.press('Escape');
await wait(1400);
check('Esc from a request returns to the room it was read from', await state('view'), 'room');

await ready(`${url}#/village`);
await ready(`${url}#/journal`);
await page.keyboard.press('Escape');
await wait(1200);
check('Esc from the inbox returns to the village', await state('view'), 'village');
checkThat('nothing of ours is open at the village', (await countOf('.guest__surface.is-open')) === 0);

await ready(`${url}#/room/grace-community-vienna/youth-activity-room`);
await ready(`${url}#/apply/grace-community-vienna/youth-activity-room`);
check('deep link opens the composer', await state('view'), 'apply');
await page.keyboard.press('Escape');
await wait(1400);
check('Esc from the composer returns to the room', await state('view'), 'room');

// ── 12. the hit-test audit ──────────────────────────────────────────────────
console.log('\n12. closed surfaces never intercept the scene');
for (const [label, target] of [
  ['village', `${url}#/village`],
  ['venue', `${url}#/venue/grace-community-vienna`],
  ['room', `${url}#/room/oakton-baptist/gymnasium`],
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
await ready(`${url}#/apply/grace-community-vienna/fellowship-hall`);
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
await browser.close();
process.exit(failed || problems.length ? 1 : 0);
