// LIVE RECOVERY — keep a signed-in inbox open while the owned Development API
// restarts, then terminate only its PostgreSQL listener.
//
// Start this test, wait for READY_FOR_API_STOP, stop only the API named by
// STEEPLE_API, and restart that same API against the same disposable database.

import {
  agreeCurrent,
  apiIsUp,
  closeBrowsers,
  launch,
  mintGuest,
  mintNotification,
  signInPage,
  sql,
  stamp,
} from './fixtures.mjs';

const APP = process.env.STEEPLE_WEB ?? 'http://localhost:5173/?q=low&world=off';

let checks = 0;
let failures = 0;
function check(label, ok, detail = '') {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
}
const eq = (label, got, want) => check(label, got === want, `got ${JSON.stringify(got)}`);

async function waitForApi(expected, timeout = 120_000) {
  const started = Date.now();
  let consecutive = 0;
  while (Date.now() - started < timeout) {
    if (await apiIsUp() === expected) consecutive += 1;
    else consecutive = 0;
    if (consecutive >= (expected ? 1 : 8)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`API did not become ${expected ? 'ready' : 'unavailable'}`);
}

function insertFor(person, label) {
  return mintNotification({
    userId: person.user.id,
    type: 7,
    payload: {
      roomName: `${label} Room`,
      venueName: `${label} Venue`,
      deepLink: '/browse',
    },
  });
}

function streamResponse(response) {
  return response.url().includes('/api/v1/me/notifications/stream') && response.status() === 200;
}

let browser = null;
try {
  const person = await mintGuest({ email: `stream-recovery-${stamp}@example.org`, name: 'Recovery Rae' });
  await agreeCurrent(person.token);

  browser = await launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  const streamUrls = [];
  page.on('response', (response) => {
    if (streamResponse(response)) streamUrls.push(response.url());
  });
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__steepleReady === true && window.__steeple?.state?.roll >= 1, {
    timeout: 30000,
  });
  const initialStream = page.waitForResponse(streamResponse, { timeout: 30000 });
  await signInPage(page, person.email, person.name);
  await initialStream;
  await page.evaluate(() => window.__steeple.setView('journal'));
  await page.waitForSelector('.journal', { timeout: 15000 });
  const initialCount = await page.evaluate(() => document.querySelectorAll('.jmsg').length);
  const initialPath = await page.evaluate(() => location.pathname);
  console.log('READY_FOR_API_STOP');

  await waitForApi(false);
  const restartId = insertFor(person, 'Restart');
  console.log('ARRIVAL_COMMITTED_WHILE_API_DOWN');
  await waitForApi(true);
  await page.waitForFunction(
    (id) => Boolean(document.querySelector(`.jmsg[data-id="${id}"]`)),
    { timeout: 90000 },
    restartId
  );
  eq('an arrival committed while the API was down appears without navigation', await page.evaluate(() => location.pathname), initialPath);
  eq('the recovered arrival increases the inbox rows once', await page.evaluate(() => document.querySelectorAll('.jmsg').length), initialCount + 1);
  check('the browser opened a replacement stream after API restart', streamUrls.length >= 2, String(streamUrls.length));

  const streamsBeforeTermination = streamUrls.length;
  const listenerPids = sql(
    `select pid from pg_stat_activity where application_name = 'Steeple notification listener' order by pid;`
  ).split('\n').filter(Boolean);
  eq('the disposable API owns one notification listener', listenerPids.length, 1);
  if (listenerPids.length !== 1 || !/^\d+$/.test(listenerPids[0])) {
    throw new Error(`refusing to terminate ambiguous listener pids: ${JSON.stringify(listenerPids)}`);
  }
  sql(`select pg_terminate_backend(${listenerPids[0]});`);
  const listenerId = insertFor(person, 'Listener recovery');
  await page.waitForFunction(
    (id) => Boolean(document.querySelector(`.jmsg[data-id="${id}"]`)),
    { timeout: 90000 },
    listenerId
  );
  check('listener termination causes a replacement browser stream', streamUrls.length > streamsBeforeTermination, String(streamUrls.length));
  check('the reconnect snapshot finds the arrival committed across listener loss', true);
} finally {
  await closeBrowsers();
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
