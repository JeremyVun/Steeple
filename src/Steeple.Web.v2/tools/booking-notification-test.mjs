// Booking decisions and host messages, from real writes to the real v2 inbox.
//
//   node tools/booking-notification-test.mjs
//   STEEPLE_WEB=http://localhost:5173/?q=low&world=off node tools/…   (another origin)
//
// Needs the Development API on :5200 (STEEPLE_API moves it) and Vite on :5173
// with its proxy pointed at that same API. Rows are minted under unique
// accounts; no database reset is needed and no seed count is asserted.
//
// The bug this suite exists for: a guest who is **already on the page** when the
// host acts. Opening the inbox has to re-read the notification feed rather than
// reuse the one fetched at sign-in — so the press on `.letters` here is a real
// press and nothing reloads the page.
//
// Since 2026-08-09 there are no corner slips: what steeple wrote arrives as a
// `.jmsg` row in the one inbox, unread until it is opened, and pressing it lands
// on the conversation that owns the fact. Two DOM truths this suite depends on:
// `.jmsg__line` carries a visually-hidden "Unread. " prefix while unread (so the
// sentence is read off `span:last-child`), and `.jmsg__go` is opacity-0 until
// hover but always present (so its text is read, never its visibility).

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
const roomName = `Fellowship Hall ${stamp}`;
const venueName = `Trinity Community Centre ${stamp}`;

let checks = 0;
let failures = 0;
function check(label, ok, detail = '') {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
}

/**
 * A real press on a row that may be re-rendered under the pointer.
 *
 * The inbox redraws whenever a read answers, so a node resolved a moment before
 * the click can be detached by the time puppeteer scrolls to it. Retried rather
 * than worked around with a synthetic `.click()`: the point of this suite is
 * that a real browser event reaches a real handler.
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

if (!(await apiIsUp())) {
  console.log('The steeple API is not answering; this test needs the Development API.');
  process.exit(2);
}

try {
  const host = await mintVenue({
    email: `notification-host-${stamp}@example.org`,
    name: 'Host Hana',
    venueName,
    roomName,
    bookingMode: 'manual',
  });
  await agreeCurrent(host.token);

  const guest = await mintGuest({
    email: `notification-guest-${stamp}@example.org`,
    name: 'Guest Gia',
  });
  await agreeCurrent(guest.token);
  const application = await apply(guest, host);

  // The guest is already here before the host acts. This is the bug's real
  // shape: opening the inbox later must refresh notifications, not reuse the
  // feed fetched at sign-in.
  const browser = await launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const pageProblems = [];
  page.on('pageerror', (error) => pageProblems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !isEnvironmentNoise(message)) pageProblems.push(message.text());
  });
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__steepleReady === true && window.__steeple?.state?.roll >= 1, {
    timeout: 30000,
  });
  await signInPage(page, guest.email, guest.name);
  await page.evaluate(() => window.__steeple.setView('village'));

  const message = await call('POST', `/applications/${application.id}/messages`, {
    token: host.token,
    body: { body: 'Your dates work well for us.' },
  });
  check('the host sent a standalone message', message.status === 200, `answered ${message.status}`);

  const decision = await call('POST', `/applications/${application.id}/decision`, {
    token: host.token,
    body: { decision: 'approve', message: 'We look forward to welcoming you.' },
  });
  check('the host approved the booking with a note', decision.status === 200, `answered ${decision.status}`);

  const notifications = await call('GET', '/me/notifications?pageSize=24', { token: guest.token });
  const rows = notifications.body?.items ?? [];
  const messageRow = rows.find((row) => row.type === 'applicationMessage');
  const approvalRow = rows.find((row) => row.type === 'applicationApproved');
  check('steeple wrote the message event', messageRow?.payload?.senderName === venueName);
  check('steeple wrote one combined approval-and-note event', approvalRow?.payload?.messageAdded === true);

  // A real press opens the inbox. That press is what must fetch events written
  // since sign-in; no reload or internal refresh hook is used here.
  await page.click('.letters');
  const approvalCopy = `Your booking is confirmed — ${roomName} at ${venueName}. There\u2019s also a message from ${venueName}.`;
  const messageCopy = `${venueName} sent you a message about ${roomName} at ${venueName}.`;

  await page.waitForFunction(
    (id) => Boolean(document.querySelector(`.jmsg[data-id="${id}"]`)),
    { timeout: 30000 },
    approvalRow.id
  );
  const approval = await page.evaluate((id) => {
    const row = document.querySelector(`.jmsg[data-id="${id}"]`);
    return {
      line: row.querySelector('.jmsg__line span:last-child')?.textContent ?? '',
      go: row.querySelector('.jmsg__go')?.textContent ?? '',
      unread: row.dataset.unread ?? null,
      pressable: row.tagName,
    };
  }, approvalRow.id);
  check('the approval reached the inbox in plain booking language', approval.line === approvalCopy, approval.line);
  check('the combined message calls out the host note', approval.go === 'See booking & message', approval.go);
  check(
    'it is waiting there, unread and pressable',
    approval.unread === 'yes' && approval.pressable === 'BUTTON',
    JSON.stringify(approval)
  );

  await page.waitForFunction(
    (id) => Boolean(document.querySelector(`.jmsg[data-id="${id}"]`)),
    { timeout: 30000 },
    messageRow.id
  );
  const standalone = await page.evaluate(
    (id) => document.querySelector(`.jmsg[data-id="${id}"] .jmsg__line span:last-child`)?.textContent ?? '',
    messageRow.id
  );
  check('and the standalone message is a row of its own', standalone === messageCopy, standalone);

  await press(page, `.jmsg[data-id="${approvalRow.id}"]`);
  await page.waitForFunction(
    (id) => window.__steeple.state.view === 'letter' && window.__steeple.state.applicationId === id,
    { timeout: 30000 },
    application.id
  );
  check('following the message lands on the booking conversation', true);
  check('the browser stayed free of app errors', pageProblems.length === 0, pageProblems.join(' | '));
} finally {
  await closeBrowsers();
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
