// One-off probe: the Place step's address typeahead must not grow the sheet's
// scrollable overflow, and a picked suggestion must raise a real Leaflet
// minimap with loaded tiles and a pin. Needs the API on :5200 and vite on the
// given origin (default :5173). Screenshots land in /tmp/minimap-probe-*.png.
//
//   node tools/minimap-probe.mjs "http://localhost:5173/?world=off"

import { agreeCurrent, closeBrowsers, launch, signIn, signInPage } from './fixtures.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/?world=off';
let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launch();
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('response', (r) => {
    if (r.url().includes('address-suggestions') || r.url().includes('auth/sessions'))
      console.log(`  wire  ${r.status()} ${new URL(r.url()).pathname}`);
  });
  page.on('pageerror', (e) => console.log(`  pageerror ${e.message}`));

  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__steepleReady === true', { timeout: 25000 });
  await wait(1200);
  await page.evaluate('__steeple.roll.set(1)');
  // Minted and agreed ahead of the browser sign-in, or the agreements gate
  // interrupts and dismissing it signs the account out.
  const email = `minimap-${Date.now().toString(36)}@demo.steeple.test`;
  const minted = await signIn(email, 'Probe Host');
  await agreeCurrent(minted.accessToken);
  await signInPage(page, email, 'Probe Host');
  await page.waitForFunction('!!__steeple.session.currentUser()', { timeout: 25000 });
  await page.evaluate('__steeple.setMode("host")');
  await page.waitForFunction('!!document.querySelector(".listing")', { timeout: 30000 });
  await wait(1200);

  await page.click('#place-name');
  await page.keyboard.type('Probe Hall', { delay: 1 });
  await page.click('#place-description');
  await page.keyboard.type('A probe venue.', { delay: 1 });

  // The scroll container the dropdown used to grow. Find whichever ancestor of
  // the address field actually scrolls.
  const before = await page.evaluate(() => {
    let n = document.querySelector('#place-address');
    while (n && n !== document.body) {
      const s = getComputedStyle(n);
      if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > 0) {
        n.dataset.probeScroller = '1';
        return { scrollHeight: n.scrollHeight, clientHeight: n.clientHeight };
      }
      n = n.parentElement;
    }
    return null;
  });
  check('found the sheet scroll container', !!before);

  await page.screenshot({ path: '/tmp/minimap-probe-waiting.png' });
  await page.click('#place-address');
  await page.keyboard.type('400 maple', { delay: 20 });
  const listCame = await page
    .waitForSelector('.suggest:not([hidden]) .suggest__item', { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  check('suggestions arrive for "400 maple"', listCame);

  check('the map slot is reserved before any pick', !!(await page.$('.place__mark .minimap--waiting')));
  const sheetHeight = () => page.evaluate(() => document.querySelector('.listing').getBoundingClientRect().height);
  const heightBefore = await sheetHeight();

  if (listCame) {
    const reading = await page.evaluate(() => {
      const scroller = document.querySelector('[data-probe-scroller]');
      const list = document.querySelector('.suggest:not([hidden])');
      const input = document.querySelector('#place-address');
      const listBox = list.getBoundingClientRect();
      const inputBox = input.getBoundingClientRect();
      return {
        scrollHeight: scroller.scrollHeight,
        position: getComputedStyle(list).position,
        underField: Math.abs(listBox.top - inputBox.bottom - 4) < 2 && Math.abs(listBox.left - inputBox.left) < 2,
        items: list.querySelectorAll('.suggest__item').length,
      };
    });
    check(
      'the open list does not grow the sheet scroll area',
      reading.scrollHeight === before.scrollHeight,
      `before ${before.scrollHeight}, after ${reading.scrollHeight}`
    );
    check('the list is fixed to the viewport', reading.position === 'fixed');
    check('and sits under the field', reading.underField);
    await page.click('.suggest__item');
    await wait(800);
  }

  const minimapUp = await page
    .waitForSelector('.place__mark .minimap .leaflet-tile-loaded', { timeout: 12000 })
    .then(() => true)
    .catch(() => false);
  check('picking a suggestion raises a real minimap with loaded tiles', minimapUp);
  const heightAfter = await sheetHeight();
  check('the sheet does not change size when the map arrives', heightAfter === heightBefore, `${heightBefore} → ${heightAfter}`);
  check('the pin stands on it', !!(await page.$('.minimap .minimap__pin svg')));
  const words = await page.evaluate(
    () => document.querySelector('.place__mark')?.textContent?.replace(/©.*$/, '').trim() ?? ''
  );
  check('the map stands uncaptioned', words === '', words);
  check('suburb and ZIP inputs are gone', !(await page.$('#place-suburb')) && !(await page.$('#place-postcode')));
  check(
    'a picked address is enough to continue',
    (await page.$eval('[data-action="advance"]', (n) => n.disabled)) === false
  );

  await wait(600);
  await page.screenshot({ path: '/tmp/minimap-probe-place.png' });
} finally {
  await closeBrowsers();
}
console.log(failures ? `\n${failures} FAILURES` : '\nall good');
process.exit(failures ? 1 : 0);
