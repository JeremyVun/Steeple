// Diagnostic: what the guest letter's scroller holds, first time and on return.
import {
  agreeCurrent, apiIsUp, apply, closeBrowsers, launch, mintGuest, mintVenue, signInPage, stamp,
} from './fixtures.mjs';

const APP = process.env.STEEPLE_WEB ?? 'http://localhost:5173/?q=low&world=off';

const dump = (page, when) =>
  page.evaluate((label) => {
    const scroll = document.querySelector('.opened__scroll');
    return {
      when: label,
      children: [...(scroll?.children ?? [])].map((n) => ({
        cls: n.className,
        h: Math.round(n.getBoundingClientRect().height),
      })),
      card: Boolean(document.querySelector('.openedspace')),
    };
  }, when);

if (!(await apiIsUp())) process.exit(2);

try {
  const host = await mintVenue({
    email: `probe-host-${stamp}@example.org`, name: 'Host Hana',
    venueName: `Probe Parish ${stamp}`, roomName: `Probe Room ${stamp}`, bookingMode: 'instant',
  });
  await agreeCurrent(host.token);
  const guest = await mintGuest({ email: `probe-guest-${stamp}@example.org`, name: 'Guest Gia' });
  await agreeCurrent(guest.token);
  const booked = await apply(guest, host);

  const browser = await launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__steepleReady === true && window.__steeple?.state?.roll >= 1, { timeout: 30000 });
  await signInPage(page, guest.email, guest.name);
  await page.evaluate((id) => window.__steeple.setView('letter', { applicationId: id }), booked.id);
  await page.waitForSelector('.opened__scroll', { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));
  console.log(JSON.stringify(await dump(page, 'first open'), null, 1));

  await page.click('.openedspace');
  await page.waitForFunction(() => window.__steeple.state.view === 'room', { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 800));
  await page.evaluate((id) => window.__steeple.setView('letter', { applicationId: id }), booked.id);
  await page.waitForSelector('.opened__scroll', { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 1500));
  console.log(JSON.stringify(await dump(page, 'back again'), null, 1));

  await page.evaluate(() => { document.querySelector('.opened__scroll').scrollTop = 0; });
  await page.screenshot({ path: '/tmp/spacecard/guest-letter-top.png' });
  await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2 });
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => { document.querySelector('.opened__scroll').scrollTop = 0; });
  await page.screenshot({ path: '/tmp/spacecard/guest-letter-phone.png' });
  await page.close();

  const hostBrowser = await launch();
  const hostPage = await hostBrowser.newPage();
  await hostPage.setViewport({ width: 1440, height: 900 });
  await hostPage.goto(APP, { waitUntil: 'domcontentloaded' });
  await hostPage.waitForFunction(() => window.__steepleReady === true && window.__steeple?.state?.roll >= 1, { timeout: 30000 });
  await signInPage(hostPage, host.email, host.name);
  await hostPage.evaluate(() => window.__steeple.setView('journal'));
  await hostPage.waitForFunction((id) => Boolean(document.querySelector(`.jrow--hosting[data-id="${id}"]`)), { timeout: 30000 }, booked.id);
  for (let i = 0; i < 6; i += 1) {
    try { await hostPage.click(`.jrow--hosting[data-id="${booked.id}"]`); break; }
    catch { await new Promise((r) => setTimeout(r, 400)); }
  }
  await hostPage.waitForSelector('.letterpage.is-open .spacecard', { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1200));
  await hostPage.screenshot({ path: '/tmp/spacecard/host-letter.png' });
  await hostPage.setViewport({ width: 430, height: 932, deviceScaleFactor: 2 });
  await new Promise((r) => setTimeout(r, 600));
  await hostPage.screenshot({ path: '/tmp/spacecard/host-letter-phone.png' });
} finally {
  await closeBrowsers();
}
