// Booking decisions and host messages, from real writes to the real v2 inbox.
//
//   node tools/booking-notification-test.mjs
//
// Needs the Development API on :5200 and Vite on :5173, both using the shared
// dev Postgres. Rows are minted under unique accounts; no reset is needed.

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
  await page.waitForFunction(
    (copy) => {
      const slip = document.querySelector('.slip');
      return (
        !slip?.hidden &&
        slip.classList.contains('is-open') &&
        slip.querySelector('.slip__line')?.textContent === copy &&
        Number(getComputedStyle(slip).opacity) > 0.9
      );
    },
    { timeout: 30000 },
    approvalCopy
  );

  const slip = await page.evaluate(() => ({
    line: document.querySelector('.slip__line')?.textContent ?? '',
    action: document.querySelector('.slip__actions button')?.textContent ?? '',
  }));
  check('the approval pops up in plain booking language', slip.line === approvalCopy, slip.line);
  check('the combined popup calls out the host note', slip.action === 'See booking & message', slip.action);

  await page.waitForFunction(
    (approval, message) => {
      const lines = [...document.querySelectorAll('.jnotes__line')].map((line) => line.textContent);
      return lines.includes(approval) && lines.includes(message);
    },
    { timeout: 30000 },
    approvalCopy,
    `${venueName} sent you a message about ${roomName} at ${venueName}.`
  );
  check('the inbox keeps both the approval and standalone message', true);

  await page.click('.slip__actions button');
  await page.waitForFunction(
    (id) => window.__steeple.state.view === 'letter' && window.__steeple.state.applicationId === id,
    { timeout: 10000 },
    application.id
  );
  check('the notification opens the booking conversation', true);
  check('the browser stayed free of app errors', pageProblems.length === 0, pageProblems.join(' | '));
} finally {
  await closeBrowsers();
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
