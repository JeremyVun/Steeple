// THE GUEST LETTER, READ — what stays put, what scrolls, and how you leave.
//
//   node tools/letter-scroll-test.mjs
//   STEEPLE_SHOTS=/tmp/letterscroll node tools/letter-scroll-test.mjs
//
// Needs the Development API on :5200 (dev sign-in) and Vite on :5173 with its
// proxy pointed at that same API. Every row is minted; no seed count asserted.
//
// What it proves (owner review, 2026-08-09):
//   §1 a long letter opens at the newest thing said on it, not at the top of
//      the thread — and the reader's own place survives a redraw;
//   §2 only the correspondence scrolls: the room's name, the status and the
//      when/who/what stay on the sheet no matter how far down the thread goes,
//      and the sheet itself never scrolls — until §2b, where a window too short
//      to hold both (a phone on its side) gives the pinning up and scrolls as
//      one piece, so nothing is ever out of reach;
//   §3 a click on the village behind the letter puts the whole inbox down —
//      back to the map, not back to the inbox.
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
const eq = (label, got, want) =>
  check(label, got === want, `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

const problems = [];

// A cold browser profile carries no refresh cookie, so steeple's first question
// of the page — is anybody remembered here? — is answered 401 before anyone has
// signed in. That is the session seam working, not the page failing.
const isColdRefresh = (message) =>
  message.text().includes('401') && (message.location?.().url ?? '').includes('/auth/refresh');

/** The letter as the reader meets it: what is on the sheet, and where it sits. */
const letterState = (page) =>
  page.evaluate(() => {
    const sheet = document.querySelector('.opened');
    const scroll = document.querySelector('.opened__scroll');
    if (!sheet || !scroll) return null;
    const box = sheet.getBoundingClientRect();
    const seen = (node) => {
      if (!node) return false;
      const r = node.getBoundingClientRect();
      return r.height > 0 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1;
    };
    const last = [...scroll.querySelectorAll('.thread__item')].at(-1) ?? null;
    return {
      sheetScrollTop: sheet.scrollTop,
      sheetOverflows: sheet.scrollHeight > sheet.clientHeight + 1,
      scrollTop: Math.round(scroll.scrollTop),
      scrollable: scroll.scrollHeight - scroll.clientHeight,
      headSeen: seen(sheet.querySelector('.opened__head')),
      particularsSeen: seen(sheet.querySelector('.particulars')),
      lastMessageSeen: seen(last),
      lastMessage: last?.querySelector('.thread__body')?.textContent ?? null,
      messages: scroll.querySelectorAll('.thread__item').length,
      threadInScroller: Boolean(scroll.querySelector('.thread')),
      headInScroller: Boolean(scroll.querySelector('.opened__head')),
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

const venueName = `Longthread Parish ${stamp}`;
const roomName = `Reading Room ${stamp}`;
let page = null;

try {
  // ── the world: a booking with a thread too long for one screen ────────────
  const host = await mintVenue({
    email: `scroll-host-${stamp}@example.org`,
    name: 'Host Hana',
    venueName,
    roomName,
    bookingMode: 'instant',
  });
  await agreeCurrent(host.token);
  const guest = await mintGuest({ email: `scroll-guest-${stamp}@example.org`, name: 'Guest Gia' });
  await agreeCurrent(guest.token);
  const booked = await apply(guest, host);
  eq('the guest booked it there and then', booked.status, 'approved');

  const said = [];
  for (let i = 1; i <= 8; i += 1) {
    const who = i % 2 ? host : guest;
    const body = `${i % 2 ? 'From the hall' : 'From the group'} — message ${i} of 8.`;
    const answer = await call('POST', `/applications/${booked.id}/messages`, {
      token: who.token,
      body: { body },
    });
    if (answer.status !== 200) throw new Error(`message ${i} answered ${answer.status}`);
    said.push(body);
  }
  check('a thread of eight is on the booking', said.length === 8);

  // ── the page ──────────────────────────────────────────────────────────────
  const browser = await launch();
  page = await browser.newPage();
  // Short on purpose: the letter must overflow on a laptop, not only a phone.
  await page.setViewport({ width: 1440, height: 800 });
  page.on('pageerror', (error) => problems.push(`page: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !isEnvironmentNoise(message) && !isColdRefresh(message)) {
      problems.push(`page: ${message.text()} (${message.location?.().url ?? 'no url'})`);
    }
  });
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__steepleReady === true && window.__steeple?.state?.roll >= 1, {
    timeout: 30000,
  });
  await signInPage(page, guest.email, guest.name);
  await page.evaluate(() => window.__steeple.setView('journal'));
  await page.waitForSelector('.journal', { timeout: 15000 });
  await page.waitForFunction((id) => Boolean(document.querySelector(`.jrow[data-id="${id}"]`)), {
    timeout: 30000,
  }, booked.id);
  await page.click(`.jrow[data-id="${booked.id}"]`);
  await page.waitForFunction(
    (n) => document.querySelectorAll('.opened .thread__item').length >= n,
    { timeout: 30000 },
    8
  );

  // ── §1 it opens where the newest thing is ─────────────────────────────────
  const opened = await letterState(page);
  check('the letter has more to say than fits', opened.scrollable > 40, `${opened.scrollable}px over`);
  check(
    'and it opens at the bottom of the thread',
    opened.scrollable - opened.scrollTop <= 2,
    `${opened.scrollTop} of ${opened.scrollable}`
  );
  eq('so the last thing said is on the sheet', opened.lastMessageSeen, true);
  eq('and it is the last thing that was said', opened.lastMessage, said.at(-1));

  // ── §2 only the correspondence moves ──────────────────────────────────────
  eq('the head is not in the scrolling part', opened.headInScroller, false);
  eq('the thread is', opened.threadInScroller, true);
  eq('the room and its status stay on the sheet', opened.headSeen, true);
  eq('so does the when/who/what', opened.particularsSeen, true);
  eq('and the sheet itself does not scroll', opened.sheetOverflows, false);
  eq('nor has it been scrolled', opened.sheetScrollTop, 0);

  // Read from the top: the reader's own place, and it must survive a redraw.
  await page.evaluate(() => {
    document.querySelector('.opened__scroll').dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
    document.querySelector('.opened__scroll').scrollTop = 0;
  });
  const top = await letterState(page);
  eq('scrolled back to the top, the head is still there', top.headSeen, true);
  eq('and the sheet still has not moved', top.sheetScrollTop, 0);
  await page.evaluate(() => window.__steeple.bus.emit('store:change', {}));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
  const redrawn = await letterState(page);
  eq('a redraw does not throw the reader back to the bottom', redrawn.scrollTop, 0);
  eq('and the thread is still whole', redrawn.messages, 8);

  // ── §2b a window too short to pin anything gives the pinning up ───────────
  // A phone on its side has no room for a fixed head *and* a thread; the sheet
  // must go back to scrolling as one piece rather than squeeze the letter into
  // a slot, and nothing may end up out of reach.
  await page.setViewport({ width: 812, height: 375 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
  const short = await page.evaluate(() => {
    const sheet = document.querySelector('.opened');
    const scroll = document.querySelector('.opened__scroll');
    // The foot of a letter is the box you answer it in, not the last message,
    // so reachability is asked of both: scrolled to, each must be on the sheet.
    const last = [...scroll.querySelectorAll('.thread__item')].at(-1);
    const onSheet = (node) => {
      node.scrollIntoView({ block: 'nearest' });
      const box = sheet.getBoundingClientRect();
      const seat = node.getBoundingClientRect();
      return seat.top >= box.top - 1 && seat.bottom <= box.bottom + 1;
    };
    return {
      sheetScrolls: sheet.scrollHeight > sheet.clientHeight + 1,
      innerScrolls: scroll.scrollHeight > scroll.clientHeight + 1,
      lastReachable: onSheet(last),
      replyReachable: onSheet(scroll.querySelector('#letter-reply')),
    };
  });
  eq('on a short window the sheet scrolls as one', short.sheetScrolls, true);
  eq('and the correspondence has no scroller of its own', short.innerScrolls, false);
  eq('the end of the thread is still reachable', short.lastReachable, true);
  eq('and so is the box you answer in', short.replyReachable, true);
  await page.setViewport({ width: 1440, height: 800 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));

  // ── §3 clicking away puts the whole inbox down ────────────────────────────
  await page.mouse.click(60, 700);
  await page.waitForFunction(() => window.__steeple.state.view === 'village', { timeout: 10000 });
  const away = await page.evaluate(() => ({
    view: window.__steeple.state.view,
    letterOpen: Boolean(document.querySelector('.guest__surface--opened.is-open')),
    journalOpen: Boolean(document.querySelector('.journal')?.closest('.guest__surface.is-open')),
    map: Boolean(document.querySelector('.leaflet-container')),
  }));
  eq('a click on the village behind the letter leaves for the village', away.view, 'village');
  eq('the letter is down', away.letterOpen, false);
  eq('the inbox with it — not standing behind it', away.journalOpen, false);
  eq('and the map is what is there', away.map, true);

  // ── shots, last ───────────────────────────────────────────────────────────
  if (SHOTS) {
    await page.evaluate((id) => window.__steeple.setView('letter', { applicationId: id }), booked.id);
    await page.waitForFunction((n) => document.querySelectorAll('.opened .thread__item').length >= n, {}, 8);
    await new Promise((r) => setTimeout(r, 500));
    await shot(page, 'letter-opened-at-the-bottom');
    await page.evaluate(() => {
      document.querySelector('.opened__scroll').dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
      document.querySelector('.opened__scroll').scrollTop = 0;
    });
    await shot(page, 'letter-scrolled-to-the-top');
  }
} finally {
  await closeBrowsers();
}

for (const problem of problems) check(`no console trouble: ${problem}`, false);
console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
