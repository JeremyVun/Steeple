// THE BOOKED LETTER — what a host sees after a yes, and what they can still do.
//
//   node tools/booked-letter-test.mjs
//   STEEPLE_SHOTS=/tmp/booked node tools/booked-letter-test.mjs   (screenshots)
//
// Needs the Development API on :5200 (dev sign-in) and Vite on :5173 with its
// proxy pointed at that same API. Every row is minted; no database reset, no
// seed count asserted.
//
// What it proves, in the order the owner met it:
//   §1 opened from the INBOX, the letter reads as a booking record — eyebrow
//      "Booking · Confirmed", legend "This booking", the week says what is held;
//   §2 the booking does not collide with itself: no clash note, no "collides";
//   §3 the host can write on the booked thread, and the guest receives it — the
//      guest can write back, and the host sees that too (both on the wire and
//      on the page), and neither message moves the status;
//   §4 clicking outside the letter returns to the inbox it came from; the back
//      link does the same, while a letter opened from the desk returns there;
//   §5 "Cancel this booking" is a quiet line, asks twice, frees the dates,
//      refunds, and the letter redraws as the cancelled thing it now is.
//
// Screenshots are taken LAST: a headless page stops advancing CSS transitions
// after its first `screenshot()`, so anything asserted after one is a lie.

import {
  agreeCurrent,
  apiIsUp,
  apply,
  call,
  closeBrowsers,
  isEnvironmentNoise,
  launch,
  mintGuest,
  mintVenue,
  signInPage,
  stamp,
} from './fixtures.mjs';

const APP = process.env.STEEPLE_WEB ?? 'http://localhost:5173/?q=low&world=off';
const SHOTS = process.env.STEEPLE_SHOTS ?? null;

let checks = 0;
let failures = 0;
function check(label, ok, detail = '') {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
}
const eq = (label, got, want) => check(label, got === want, `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

const problems = [];

async function openPage(name) {
  const browser = await launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  page.on('pageerror', (error) => problems.push(`${name}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !isEnvironmentNoise(message)) problems.push(`${name}: ${message.text()}`);
  });
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__steepleReady === true && window.__steeple?.state?.roll >= 1, {
    timeout: 30000,
  });
  return page;
}

const openInbox = async (page) => {
  await page.evaluate(() => window.__steeple.setView('journal'));
  await page.waitForSelector('.journal', { timeout: 15000 });
};

/** A real press on a row the surface may redraw under the pointer. */
async function press(page, selector, tries = 6) {
  for (let attempt = 1; ; attempt += 1) {
    await page.waitForSelector(selector, { visible: true, timeout: 30000 });
    try {
      return await page.click(selector);
    } catch (error) {
      if (attempt >= tries || !/detached|not clickable/i.test(error.message)) throw error;
      await new Promise((r) => setTimeout(r, 400));
    }
  }
}

/**
 * Type into a box the surface may redraw underneath the keyboard.
 *
 * The letter re-renders when its detail reads land, which replaces the reply
 * box — words typed a moment before are then gone, and the press that follows
 * is answered with "write the message first" and no request at all. So the
 * value is read back before the send, and the typing repeated if it was lost.
 */
async function write(page, selector, text, tries = 5) {
  for (let attempt = 1; ; attempt += 1) {
    await page.waitForSelector(selector, { visible: true, timeout: 30000 });
    let held = '';
    try {
      await page.click(selector);
      await page.type(selector, text);
      held = await page.$eval(selector, (n) => n.value);
    } catch (error) {
      // A box replaced or hidden by a redraw between the wait and the press is
      // the thing this loop exists for; anything else is a real failure.
      if (!/detached|not clickable/i.test(error.message)) throw error;
    }
    if (held.includes(text)) return;
    if (attempt >= tries) throw new Error(`${selector} would not hold its words (got ${JSON.stringify(held)})`);
    await new Promise((r) => setTimeout(r, 600));
  }
}

const letterState = (page) =>
  page.evaluate(() => {
    const sheet = document.querySelector('.letterpage');
    if (!sheet) return null;
    return {
      eyebrow: sheet.querySelector('.letterpage__head .eyebrow')?.textContent ?? null,
      back: sheet.querySelector('[data-action="back"]')?.textContent ?? null,
      meta: sheet.querySelector('.letterpage__meta')?.textContent ?? null,
      when: sheet.querySelector('.letterpage__week .eyebrow')?.textContent ?? null,
      legend: [...sheet.querySelectorAll('.legend__item')].map((n) => n.textContent),
      count: sheet.querySelector('.verdict__count')?.textContent ?? null,
      notes: [...sheet.querySelectorAll('.verdict__note')].map((n) => ({
        tone: [...n.classList].find((c) => c.startsWith('verdict__note--')) ?? null,
        text: n.textContent,
      })),
      lanes: [...sheet.querySelectorAll('.lane__note')].map((n) => n.textContent),
      actions: [...sheet.querySelectorAll('.letterpage__actions button')].map((n) => ({
        label: n.textContent,
        cls: n.className,
      })),
      reply: Boolean(sheet.querySelector('.thread__reply #reply-body')),
      thread: [...sheet.querySelectorAll('.thread__item')].map((n) => n.textContent),
      outcome: sheet.querySelector('.outcome')?.textContent ?? null,
    };
  });

const shot = async (page, name) => {
  if (!SHOTS) return;
  await page.screenshot({ path: `${SHOTS}/${name}.png` }).catch(() => {});
};

if (!(await apiIsUp())) {
  console.log('The steeple API is not answering; this test needs the Development API.');
  process.exit(2);
}

const venueName = `Sherwood Parish Centre ${stamp}`;
const roomName = `Long Hall ${stamp}`;
let hostPage = null;
let guestPage = null;

try {
  // ── the world ─────────────────────────────────────────────────────────────
  const host = await mintVenue({
    email: `booked-host-${stamp}@example.org`,
    name: 'Host Hana',
    venueName,
    roomName,
    bookingMode: 'instant',
  });
  await agreeCurrent(host.token);
  const guest = await mintGuest({ email: `booked-guest-${stamp}@example.org`, name: 'Guest Gia' });
  await agreeCurrent(guest.token);
  const booked = await apply(guest, host);
  eq('the guest booked it there and then', booked.status, 'approved');

  // A second booking on another weekday, kept whole: §5 cancels the first, and
  // the screenshot at the end has to be of a letter that still stands.
  const other = await mintGuest({ email: `booked-other-${stamp}@example.org`, name: 'Guest Otto' });
  await agreeCurrent(other.token);
  const standing = await apply(other, host, { dow: 5 });
  eq('and so did a second group, on another evening', standing.status, 'approved');

  // ── §1 the letter, opened from the inbox ──────────────────────────────────
  hostPage = await openPage('host');
  await signInPage(hostPage, host.email, host.name);
  await openInbox(hostPage);
  await hostPage.waitForFunction(
    (id) => Boolean(document.querySelector(`.jrow--hosting[data-id="${id}"]`)),
    { timeout: 30000 },
    booked.id
  );
  await press(hostPage, `.jrow--hosting[data-id="${booked.id}"]`);
  await hostPage.waitForFunction(() => Boolean(document.querySelector('.letterpage.is-open')), {
    timeout: 30000,
  });
  await hostPage.waitForFunction(
    () => document.querySelector('.letterpage__head .eyebrow')?.textContent?.startsWith('Booking'),
    { timeout: 30000 }
  );

  // The dates come from the booking's own read, which lands after the letter is
  // first drawn: waited for, so the record is judged whole rather than mid-read.
  await hostPage.waitForFunction(
    () => /dates held/.test(document.querySelector('.letterpage .outcome')?.textContent ?? ''),
    { timeout: 30000 }
  );

  let letter = await letterState(hostPage);
  eq('a confirmed booking says so', letter.eyebrow, 'Booking · Confirmed');
  check('and is dated by when it was booked, not sent', /^About .*· Booked /.test(letter.meta), letter.meta);
  eq('the week states what is held', letter.when, 'What is held');
  check('the legend calls the bars this booking', letter.legend.includes('This booking'), JSON.stringify(letter.legend));
  check(
    'and offers no key to a collision that cannot happen',
    !letter.legend.some((l) => /collide/i.test(l)),
    JSON.stringify(letter.legend)
  );
  check(
    'the left column reads as a record of what is held',
    /space is theirs/i.test(letter.outcome ?? '') && /still to come/.test(letter.outcome ?? ''),
    letter.outcome
  );

  // ── §2 it does not collide with itself ────────────────────────────────────
  check('nothing on the letter says the booking collides', !letter.notes.some((n) => /collide/i.test(n.text)), JSON.stringify(letter.notes));
  check('no lane is marked as colliding', !letter.lanes.includes('collides'), JSON.stringify(letter.lanes));
  check('the week says who holds it instead', letter.notes.some((n) => n.tone === 'verdict__note--held'), JSON.stringify(letter.notes));
  check('and still counts the dates', /date/.test(letter.count ?? ''), letter.count);

  // ── §3 the thread outlives the decision ───────────────────────────────────
  check('the reply box is on the booked letter', letter.reply === true);
  const hostSays = `The side door is locked — use the hall entrance. ${stamp}`;
  await write(hostPage, '#reply-body', hostSays);
  await press(hostPage, '.letterpage [data-action="send-reply"]');
  await hostPage.waitForFunction(
    (text) => [...document.querySelectorAll('.letterpage .thread__item')].some((n) => n.textContent.includes(text)),
    { timeout: 30000 },
    hostSays
  );
  check('the host wrote on a booked thread and it landed', true);

  const afterHost = await call('GET', `/applications/${booked.id}`, { token: guest.token });
  check(
    'steeple took the message',
    (afterHost.body?.messages ?? []).some((m) => m.body === hostSays),
    JSON.stringify(afterHost.status)
  );
  eq('and the booking is still approved', afterHost.body?.status, 'approved');

  guestPage = await openPage('guest');
  await signInPage(guestPage, guest.email, guest.name);
  await guestPage.evaluate((id) => window.__steeple.setView('letter', { applicationId: id }), booked.id);
  await guestPage.waitForFunction(
    (text) => [...document.querySelectorAll('.thread__item')].some((n) => n.textContent.includes(text)),
    { timeout: 30000 },
    hostSays
  );
  check("the host's words reached the guest's letter", true);

  const guestSays = `Understood — we'll come in by the hall. ${stamp}`;
  await write(guestPage, '#letter-reply', guestSays);
  const guestSend = (await guestPage.$$('.reply button')).at(-1);
  await guestSend.click();
  await guestPage.waitForFunction(
    (text) => [...document.querySelectorAll('.thread__item')].some((n) => n.textContent.includes(text)),
    { timeout: 30000 },
    guestSays
  );
  check('the guest can write back on a booked thread', true);

  const afterGuest = await call('GET', `/applications/${booked.id}`, { token: host.token });
  check(
    'and steeple took that too',
    (afterGuest.body?.messages ?? []).some((m) => m.body === guestSays),
    JSON.stringify(afterGuest.status)
  );
  eq('with the status still where it was', afterGuest.body?.status, 'approved');

  // ── §4 every way out returns where the letter came from ──────────────────
  letter = await letterState(hostPage);
  eq('opened from the inbox, the way back is the inbox', letter.back, '← Inbox');

  const letterBox = await hostPage.$eval('.letterpage__sheet', (node) => {
    const box = node.getBoundingClientRect();
    return { right: box.right, top: box.top, height: box.height };
  });
  await hostPage.mouse.click(
    Math.min(letterBox.right + 80, 1430),
    letterBox.top + letterBox.height / 2
  );
  await hostPage.waitForFunction(() => window.__steeple.state.view === 'journal', { timeout: 30000 });
  eq(
    'clicking outside the letter returns to its inbox',
    await hostPage.evaluate(() => window.__steeple.state.view),
    'journal'
  );
  eq(
    'and restores the inbox lens',
    await hostPage.evaluate(() => window.__steeple.state.mode),
    'guest'
  );

  await press(hostPage, `.jrow--hosting[data-id="${booked.id}"]`);
  await hostPage.waitForFunction(() => Boolean(document.querySelector('.letterpage.is-open')), {
    timeout: 30000,
  });
  letter = await letterState(hostPage);
  eq('reopened from the inbox, the back control still names it', letter.back, '← Inbox');
  await press(hostPage, '.letterpage [data-action="back"]');
  await hostPage.waitForFunction(() => window.__steeple.state.view === 'journal', { timeout: 30000 });
  eq('and it goes there', await hostPage.evaluate(() => window.__steeple.state.view), 'journal');
  eq(
    'in the guest lens the inbox belongs to',
    await hostPage.evaluate(() => window.__steeple.state.mode),
    'guest'
  );

  // The same letter from the desk: the desk is where it must return.
  await hostPage.evaluate(() => window.__steeple.setView('desk'));
  await hostPage.waitForFunction(() => window.__steeple.state.view === 'desk', { timeout: 30000 });
  await hostPage.evaluate(
    (id) => window.__steeple.setView('letter', { applicationId: id }),
    booked.id
  );
  await hostPage.waitForFunction(() => Boolean(document.querySelector('.letterpage.is-open')), {
    timeout: 30000,
  });
  const fromDesk = await letterState(hostPage);
  check('opened from the desk, the way back is the desk', /Requests/.test(fromDesk.back ?? ''), fromDesk.back);
  await press(hostPage, '.letterpage [data-action="back"]');
  await hostPage.waitForFunction(() => window.__steeple.state.view === 'desk', { timeout: 30000 });
  eq('and it goes there', await hostPage.evaluate(() => window.__steeple.state.view), 'desk');

  // ── §5 the cancel ─────────────────────────────────────────────────────────
  await openInbox(hostPage);
  await press(hostPage, `.jrow--hosting[data-id="${booked.id}"]`);
  await hostPage.waitForFunction(
    () => Boolean(document.querySelector('.letterpage [data-action="rescind"]')),
    { timeout: 30000 }
  );
  letter = await letterState(hostPage);
  const rescind = letter.actions.find((a) => a.label === 'Cancel this booking');
  check('the booked letter offers the cancel', Boolean(rescind), JSON.stringify(letter.actions));
  check('as a quiet line, not a button', /linkish/.test(rescind?.cls ?? ''), rescind?.cls);
  check('and nothing else is offered on a decided letter', letter.actions.length === 1, String(letter.actions.length));

  await press(hostPage, '.letterpage [data-action="rescind"]');
  await hostPage.waitForSelector('.letterpage [data-action="rescind-confirm"]', {
    visible: true,
    timeout: 30000,
  });
  const confirm = await hostPage.evaluate(() => ({
    warning: document.querySelector('.letterpage__drawer .prose')?.textContent ?? null,
    keep: [...document.querySelectorAll('.letterpage__drawer button')].map((n) => n.textContent),
  }));
  check('one press asks rather than acts', /refunds everything already charged/.test(confirm.warning ?? ''), confirm.warning);
  check('and the way out of it is offered', confirm.keep.includes('Keep the booking'), JSON.stringify(confirm.keep));

  await write(hostPage, '#letter-rescind-note', 'The roof is being repaired that month.');
  await press(hostPage, '.letterpage [data-action="rescind-confirm"]');
  await hostPage.waitForFunction(
    () => document.querySelector('.letterpage__head .eyebrow')?.textContent === 'Booking · Cancelled',
    { timeout: 30000 }
  );
  letter = await letterState(hostPage);
  eq('the second press cancels it', letter.eyebrow, 'Booking · Cancelled');
  eq('and the week speaks in the past', letter.when, 'What was held');
  check('the record says what happened to the money', /refunded in full/.test(letter.outcome ?? ''), letter.outcome);
  check('the cancel is not offered twice', letter.actions.length === 0, JSON.stringify(letter.actions));

  const wire = await call('GET', `/bookings/${booked.bookingId ?? afterGuest.body?.bookingId}`, {
    token: host.token,
  });
  eq('steeple holds it as cancelled', wire.body?.status, 'cancelled');
  const live = (wire.body?.occurrences ?? []).filter((o) => o.status !== 'cancelled');
  check('every remaining date was freed', live.length === 0, JSON.stringify(live.map((o) => o.date)));

  check('the browsers stayed free of app errors', problems.length === 0, problems.join(' | '));

  // ── shots, last ───────────────────────────────────────────────────────────
  await shot(hostPage, 'booked-letter-cancelled');
  await hostPage.evaluate(() => window.__steeple.setView('journal'));
  await hostPage.waitForSelector('.journal', { timeout: 15000 });
  await press(hostPage, `.jrow--hosting[data-id="${standing.id}"]`);
  await hostPage.waitForFunction(
    () => document.querySelector('.letterpage__head .eyebrow')?.textContent === 'Booking · Confirmed',
    { timeout: 30000 }
  );
  await shot(hostPage, 'booked-letter-confirmed');
  await shot(guestPage, 'booked-letter-guest');
} finally {
  await closeBrowsers();
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
