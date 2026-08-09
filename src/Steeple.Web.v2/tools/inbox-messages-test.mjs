// THE INBOX, AFTER THE SLIPS — messages as rows, hosting rows for settled
// bookings, unread until opened.
//
//   node tools/inbox-messages-test.mjs
//   STEEPLE_SHOTS=/tmp/inbox node tools/inbox-messages-test.mjs   (screenshots)
//
// Needs the Development API on :5200 (dev sign-in) and Vite on :5173 with its
// proxy pointed at that same API. Rows are minted under unique accounts; no
// database reset is needed and no seed count is asserted.
//
// What it proves, in the order a person meets it:
//   §1 a host on an instant-book venue whose space was just booked opens the
//      inbox and finds a message (unread) and a settled hosting row;
//   §2 the unread state survives a reload — the old mark-on-view is gone;
//   §3 a press on the message lands on the surface that owns the fact, marks
//      that row read **on the wire**, and it renders read after a reload;
//   §4 a press on the hosting row opens the host letter with its thread;
//   §5 no slip is drawn anywhere, and the console stays clean;
//   §6 the guest side is unregressed: request groups, and the guest empty state
//      for a genuinely new account;
//   §7 the owner's own sequence (2026-08-09): a host writes to a guest on a
//      *booked* request, signs out, and the guest signs in **in the same tab**.
//      The message is unread — dot, "N unread", and a porch badge that counts
//      it — and pressing it drains all three. This section is the guard on the
//      mark-on-sight the slips used to do: restore that one line in
//      `ui/notifications.js` and every claim in here goes red.
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
const eq = (label, got, want) => check(label, got === want, `got ${JSON.stringify(got)}`);

const problems = [];

/** One browser per page: two pages of one browser freeze each other's fades. */
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

/**
 * A real press on a row that may be re-rendered under the pointer.
 *
 * The inbox redraws whenever a read answers, and a node resolved a moment
 * before the click can be detached by the time puppeteer scrolls to it. Retried
 * rather than worked around with a synthetic `.click()`: the point of these
 * suites is that a real browser event reaches a real handler.
 */
async function press(page, selector, tries = 6) {
  for (let attempt = 1; ; attempt += 1) {
    await page.waitForSelector(selector, { timeout: 30000 });
    try {
      return await page.click(selector);
    } catch (error) {
      if (attempt >= tries || !/detached/i.test(error.message)) throw error;
      await new Promise((r) => setTimeout(r, 400));
    }
  }
}

const shot = async (page, name) => {
  if (!SHOTS) return;
  await page.screenshot({ path: `${SHOTS}/${name}.png` }).catch(() => {});
};

if (!(await apiIsUp())) {
  console.log('The steeple API is not answering; this test needs the Development API.');
  process.exit(2);
}

const venueName = `Trinity Community Centre ${stamp}`;
const roomName = `Fellowship Hall ${stamp}`;
let hostPage = null;
let guestPage = null;
let newcomerPage = null;
let switcherPage = null;

try {
  // ── the world ─────────────────────────────────────────────────────────────
  const host = await mintVenue({
    email: `inbox-host-${stamp}@example.org`,
    name: 'Host Hana',
    venueName,
    roomName,
    bookingMode: 'instant',
  });
  eq('the venue books instantly', host.bookingMode, 'instant');
  await agreeCurrent(host.token);

  const guest = await mintGuest({ email: `inbox-guest-${stamp}@example.org`, name: 'Guest Gia' });
  await agreeCurrent(guest.token);
  const booked = await apply(guest, host);
  eq('the guest booked it there and then', booked.status, 'approved');

  const wrote = await call('GET', '/me/notifications?pageSize=24', { token: host.token });
  const received = (wrote.body?.items ?? []).find((row) => row.type === 'bookingReceived');
  check('steeple wrote the host a message about it', Boolean(received), JSON.stringify(wrote.status));
  check('and the message carries the way to the fact', Boolean(received?.payload?.deepLink), received?.payload?.deepLink);

  // ── §1 the host's inbox ───────────────────────────────────────────────────
  hostPage = await openPage('host');
  await signInPage(hostPage, host.email, host.name);
  await openInbox(hostPage);

  await hostPage.waitForFunction(
    (id) => Boolean(document.querySelector(`.jmsg[data-id="${id}"]`)),
    { timeout: 30000 },
    received.id
  );
  const message = await hostPage.evaluate(
    (id) => {
      const row = document.querySelector(`.jmsg[data-id="${id}"]`);
      return {
        unread: row.dataset.unread ?? null,
        line: row.querySelector('.jmsg__line')?.textContent ?? '',
        go: row.querySelector('.jmsg__go')?.textContent ?? '',
        pressable: row.tagName,
      };
    },
    received.id
  );
  check('the news is a message in the inbox', message.pressable === 'BUTTON', message.pressable);
  eq('it arrives unread', message.unread, 'yes');
  check('in plain booking language', /booked/.test(message.line), message.line);
  check('and it names the space', message.line.includes(roomName), message.line);
  eq('with one way on', message.go, 'Open it');

  // The hosting side is a second, slower read than the notification feed —
  // managed venues, then their applications — so it is waited for rather than
  // sampled the instant the first message lands.
  await hostPage.waitForFunction(
    (id) => Boolean(document.querySelector(`.jrow--hosting[data-id="${id}"]`)),
    { timeout: 30000 },
    booked.id
  );
  const hosting = await hostPage.evaluate((id) => {
    const row = document.querySelector(`.jrow--hosting[data-id="${id}"]`);
    if (!row) return null;
    return {
      label: row.querySelector('.jrow__status span:last-child')?.textContent ?? '',
      note: row.querySelector('.jrow__note')?.textContent ?? '',
      bucket: row.closest('ul')?.dataset.bucket ?? null,
    };
  }, booked.id);
  check('the settled booking is in the inbox too', Boolean(hosting), JSON.stringify(hosting));
  eq('called what it is', hosting?.label, 'Booked');
  eq('in the settled bucket', hosting?.bucket, 'settled');

  const emptiness = await hostPage.evaluate(() => ({
    tally: document.querySelector('.journal__tally')?.textContent ?? null,
    empty: document.querySelector('.journal__empty')?.textContent ?? null,
    lately: Boolean(document.querySelector('.jnotes')),
    unread: document.querySelector('.journal__unread')?.textContent ?? null,
  }));
  eq('nothing tells the host they have no requests', emptiness.empty, null);
  eq('and nothing is waiting on them, which is the truth', emptiness.tally, 'Nothing waiting on you');
  // The head used to say only that, over a bold unread message — true, and read
  // as a denial. Unread mail is counted on its own line and never folded into
  // the tally, which stays about requests (D8).
  eq('while the unread mail is still owned up to', emptiness.unread, '1 unread');
  check('the passive "Lately" list is gone', emptiness.lately === false);

  // ── §5 no slip ────────────────────────────────────────────────────────────
  const slip = await hostPage.evaluate(() => {
    const node = document.querySelector('.slip');
    return node ? { hidden: node.hidden, open: node.classList.contains('is-open') } : null;
  });
  check('no slip was drawn', !slip || (slip.hidden && !slip.open), JSON.stringify(slip));

  // ── §2 unread survives a reload ───────────────────────────────────────────
  await hostPage.reload({ waitUntil: 'domcontentloaded' });
  await hostPage.waitForFunction(() => window.__steepleReady === true, { timeout: 30000 });
  await openInbox(hostPage);
  await hostPage.waitForFunction(
    (id) => Boolean(document.querySelector(`.jmsg[data-id="${id}"]`)),
    { timeout: 30000 },
    received.id
  );
  const afterReload = await hostPage.evaluate(
    (id) => document.querySelector(`.jmsg[data-id="${id}"]`)?.dataset.unread ?? null,
    received.id
  );
  eq('a message nobody opened is still unread after a reload', afterReload, 'yes');
  const wireBefore = await call('GET', '/me/notifications?pageSize=24', { token: host.token });
  const stillUnread = (wireBefore.body?.items ?? []).find((row) => row.id === received.id)?.readAt ?? null;
  eq('and steeple agrees it is unread', stillUnread, null);

  // ── §3 a press opens the fact and marks it read ───────────────────────────
  await press(hostPage, `.jmsg[data-id="${received.id}"]`);
  await hostPage.waitForFunction(
    (id) => window.__steeple.state.view === 'letter' && window.__steeple.state.applicationId === id,
    { timeout: 30000 },
    booked.id
  );
  check('the message opened the request the booking came from', true);
  eq('in the host lens, which is whose it is', await hostPage.evaluate(() => window.__steeple.state.mode), 'host');

  let readAt = null;
  for (let attempt = 0; attempt < 20 && !readAt; attempt += 1) {
    const answer = await call('GET', '/me/notifications?pageSize=24', { token: host.token });
    readAt = (answer.body?.items ?? []).find((row) => row.id === received.id)?.readAt ?? null;
    if (!readAt) await new Promise((r) => setTimeout(r, 250));
  }
  check('opening it marked it read on the wire', Boolean(readAt), String(readAt));

  await hostPage.reload({ waitUntil: 'domcontentloaded' });
  await hostPage.waitForFunction(() => window.__steepleReady === true, { timeout: 30000 });
  await openInbox(hostPage);
  await hostPage.waitForFunction(
    (id) => Boolean(document.querySelector(`.jmsg[data-id="${id}"]`)),
    { timeout: 30000 },
    received.id
  );
  const afterOpen = await hostPage.evaluate(
    (id) => document.querySelector(`.jmsg[data-id="${id}"]`)?.dataset.unread ?? null,
    received.id
  );
  eq('and it renders read from then on', afterOpen, null);

  // ── §4 the hosting row opens the host letter ──────────────────────────────
  await hostPage.evaluate(() => window.__steeple.setMode('guest'));
  await openInbox(hostPage);
  await press(hostPage, `.jrow--hosting[data-id="${booked.id}"]`);
  await hostPage.waitForFunction(() => Boolean(document.querySelector('.letterpage.is-open')), {
    timeout: 30000,
  });
  check('the hosting row opens the host letter', true);
  check(
    'with the correspondence on it',
    await hostPage.evaluate(() => Boolean(document.querySelector('.letterpage .thread__list, .letterpage__drawer')))
  );

  // ── §6 the guest side ─────────────────────────────────────────────────────
  guestPage = await openPage('guest');
  await signInPage(guestPage, guest.email, guest.name);
  await openInbox(guestPage);
  await guestPage.waitForSelector(`.jrow[data-id="${booked.id}"]`, { timeout: 30000 });
  const guestSide = await guestPage.evaluate((id) => ({
    groups: [...document.querySelectorAll('.jgroup')].map((n) => n.querySelector('.eyebrow')?.textContent),
    status: document.querySelector(`.jrow[data-id="${id}"] .jrow__status span:last-child`)?.textContent ?? null,
    messages: document.querySelectorAll('.jmsg').length,
  }), booked.id);
  eq('the guest sees their booking as booked', guestSide.status, 'Booked');
  check('the request groups are still grouped', guestSide.groups.includes('Settled'), JSON.stringify(guestSide.groups));
  check('and the guest has messages of their own', guestSide.messages > 0, String(guestSide.messages));

  newcomerPage = await openPage('newcomer');
  const newcomer = await mintGuest({ email: `inbox-new-${stamp}@example.org`, name: 'New Nia' });
  await agreeCurrent(newcomer.token);
  await signInPage(newcomerPage, newcomer.email, newcomer.name);
  await openInbox(newcomerPage);
  await newcomerPage.waitForSelector('.journal__empty', { timeout: 30000 });
  const newcomerSide = await newcomerPage.evaluate(() => ({
    empty: document.querySelector('.journal__empty')?.textContent ?? null,
    tally: document.querySelector('.journal__tally')?.textContent ?? null,
    cta: document.querySelector('.journal__body .pill')?.textContent ?? null,
  }));
  check(
    'a genuinely new person is still invited to find a space',
    /Find a space that suits your group/.test(newcomerSide.empty ?? ''),
    newcomerSide.empty
  );
  eq('and told there is nothing yet', newcomerSide.tally, 'No requests yet');
  eq('with the one thing to do', newcomerSide.cta, 'Find a space');

  // ── §7 the owner's sequence: host writes, signs out, guest signs in here ──
  const wrote2 = await call('POST', `/applications/${booked.id}/messages`, {
    token: host.token,
    body: { body: 'One more thing about the hall door — it sticks in the wet.' },
  });
  check('the host writes to the guest on the booked request', wrote2.status === 200, String(wrote2.status));

  const guestFeed = await call('GET', '/me/notifications?pageSize=24', { token: guest.token });
  const letterMsg = (guestFeed.body?.items ?? []).find((row) => row.type === 'applicationMessage');
  check('steeple wrote it to the guest', Boolean(letterMsg), JSON.stringify(guestFeed.status));

  switcherPage = await openPage('switcher');
  await signInPage(switcherPage, host.email, host.name);
  await openInbox(switcherPage);
  await switcherPage.evaluate(() => window.__steeple.session.signOut());
  await switcherPage.waitForFunction(() => window.__steeple.session.isSignedIn() === false, {
    timeout: 15000,
  });
  await signInPage(switcherPage, guest.email, guest.name);
  await openInbox(switcherPage);
  await switcherPage.waitForFunction(
    (id) => Boolean(document.querySelector(`.jmsg[data-id="${id}"]`)),
    { timeout: 30000 },
    letterMsg.id
  );

  const inTheSameTab = await switcherPage.evaluate((id) => {
    const row = document.querySelector(`.jmsg[data-id="${id}"]`);
    const badge = document.querySelector('.letters__count');
    return {
      unread: row?.dataset.unread ?? null,
      mark: row ? getComputedStyle(row.querySelector('.jmsg__mark')).backgroundColor : null,
      head: document.querySelector('.journal__unread')?.textContent ?? null,
      badge: badge && !badge.hidden ? badge.textContent : null,
      label: document.querySelector('.letters')?.getAttribute('aria-label') ?? null,
    };
  }, letterMsg.id);
  eq('a message written to the guest is unread when they sign in in that tab', inTheSameTab.unread, 'yes');
  check(
    'the head owns up to it',
    /^\d+ unread$/.test(inTheSameTab.head ?? ''),
    String(inTheSameTab.head)
  );
  // The dot is the whole of "unread" at a glance: terracotta, the attention
  // colour, and never the paper it sits on (DESIGN_SYSTEM — accent).
  eq('the unread mark is drawn in the attention colour', inTheSameTab.mark, 'rgb(192, 98, 63)');
  const badgeCount = Number(inTheSameTab.badge);
  const headUnread = Number((inTheSameTab.head ?? '').split(' ')[0]);
  check('and the porch badge counts it', badgeCount >= headUnread && badgeCount > 0, String(inTheSameTab.badge));
  check(
    'the badge says what it counts',
    /unread message/.test(inTheSameTab.label ?? ''),
    String(inTheSameTab.label)
  );
  const wireUnread = (await call('GET', '/me/notifications?pageSize=24', { token: guest.token })).body?.items
    ?.find((row) => row.id === letterMsg.id)?.readAt ?? null;
  eq('steeple agrees nobody has opened it', wireUnread, null);

  // A press drains all three at once — the row, the head and the badge.
  await press(switcherPage, `.jmsg[data-id="${letterMsg.id}"]`);
  await switcherPage.waitForFunction(
    (id) => window.__steeple.state.view === 'letter' && window.__steeple.state.applicationId === id,
    { timeout: 30000 },
    booked.id
  );
  await openInbox(switcherPage);
  await switcherPage.waitForFunction(
    (id) => document.querySelector(`.jmsg[data-id="${id}"]`)?.dataset.unread === undefined,
    { timeout: 30000 },
    letterMsg.id
  );
  const drained = await switcherPage.evaluate((id) => {
    const badge = document.querySelector('.letters__count');
    return {
      unread: document.querySelector(`.jmsg[data-id="${id}"]`)?.dataset.unread ?? null,
      head: document.querySelector('.journal__unread')?.textContent ?? null,
      badge: badge && !badge.hidden ? badge.textContent : null,
    };
  }, letterMsg.id);
  eq('pressing it marks that row read', drained.unread, null);
  const drainedUnread = drained.head ? Number(drained.head.split(' ')[0]) : 0;
  check('the head count drops with it', drainedUnread === headUnread - 1, `${drained.head} after ${inTheSameTab.head}`);
  check(
    'and so does the porch badge',
    Number(drained.badge ?? 0) === badgeCount - 1,
    `${drained.badge} after ${inTheSameTab.badge}`
  );

  check('the browsers stayed free of app errors', problems.length === 0, problems.join(' | '));

  // ── shots, last ───────────────────────────────────────────────────────────
  await hostPage.evaluate(() => window.__steeple.setView('journal'));
  await hostPage.waitForSelector('.journal', { timeout: 15000 });
  await shot(hostPage, 'inbox-host');
  await shot(guestPage, 'inbox-guest');
  await shot(newcomerPage, 'inbox-newcomer');
  await shot(switcherPage, 'inbox-same-tab');
} finally {
  await closeBrowsers();
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
