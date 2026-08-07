// Scratch probe — verify the request-sheet fixes against :8080
// (production compose bundle). Real pointer events only.
// Run: node tools/scratch-letter-probe.mjs
import puppeteer from 'puppeteer';

const ORIGIN = process.env.STEEPLE_WEB ?? 'http://localhost:8080';
const ROUTE = '#/apply/dunn-loring-umc/art-studio';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failed += 1;
};

const browser = await puppeteer.launch({
  headless: 'new',
  pipe: true,
  defaultViewport: { width: 1000, height: 743 },
});
try {
  const page = await browser.newPage();
  await page.goto(`${ORIGIN}/${ROUTE}`, { waitUntil: 'networkidle2' });
  await sleep(3000);

  const sheetInfo = () =>
    page.evaluate(() => {
      const sheet = document.querySelector('.letter__sheet');
      const org = document.getElementById('letter-organization');
      const cs = getComputedStyle(sheet);
      const r = org?.getBoundingClientRect();
      return {
        scrollHeight: sheet.scrollHeight,
        clientHeight: sheet.clientHeight,
        scrollTop: sheet.scrollTop,
        overflowY: cs.overflowY,
        orgOnScreen: r ? r.top >= 0 && r.bottom <= innerHeight : false,
      };
    });

  const before = await sheetInfo();
  check('sheet is a scroll container again', before.overflowY === 'auto', JSON.stringify(before));

  await page.mouse.move(500, 400);
  await page.mouse.wheel({ deltaY: 600 });
  await sleep(400);
  const after = await sheetInfo();
  check('wheel scrolls the sheet', after.scrollTop > 0, `scrollTop ${after.scrollTop}`);
  check('organisation input reachable by scrolling', after.orgOnScreen || (await (async () => {
    await page.mouse.wheel({ deltaY: 900 });
    await sleep(400);
    return (await sheetInfo()).orgOnScreen;
  })()));

  // Bring the week card on screen — which scrolling now allows.
  await page.evaluate(() => {
    document.querySelector('.week__grid')?.scrollIntoView({ block: 'center' });
  });
  await sleep(200);

  // ── paint a band on a free, on-screen cell ──
  const cell = await page.evaluate(() => {
    const free = [...document.querySelectorAll('.week__cell:not(.is-inert)')].filter((c) => {
      const r = c.getBoundingClientRect();
      return r.top > 0 && r.bottom < innerHeight;
    });
    const pick = free[2] ?? free[0];
    if (!pick) return null;
    const r = pick.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  check('a free week cell is on screen', Boolean(cell), JSON.stringify(cell));

  const foot = async () =>
    page.evaluate(() => ({
      summary: document.querySelector('.letter__summary')?.textContent?.trim() ?? '',
      bands: document.querySelectorAll('.mark--band:not(.is-preview)').length,
      previews: document.querySelectorAll('.mark--band.is-preview').length,
      sendDisabled: document.querySelector('.letter__foot .pill--primary')?.disabled,
      unready: document.querySelector('.letter__unready')?.textContent ?? '',
    }));

  check('send starts disabled', (await foot()).sendDisabled === true, JSON.stringify(await foot()));

  if (cell) {
    await page.mouse.move(cell.x, cell.y);
    await page.mouse.down();
    await page.mouse.move(cell.x, cell.y + 18, { steps: 4 });
    await page.mouse.up();
    await sleep(300);
    const painted = await foot();
    check('drag paints a band and the summary says so', painted.bands === 1 && painted.summary.length > 0, JSON.stringify(painted));

    // Tap inside the band → deselect: band gone, summary gone, no stale preview.
    await page.mouse.click(cell.x, cell.y + 4);
    await sleep(300);
    const cleared = await foot();
    check('tap inside band clears the band', cleared.bands === 0, JSON.stringify(cleared));
    check('…and the summary text', cleared.summary === '');
    check('…with no stale dashed preview left behind', cleared.previews === 0);
    check('…and the send goes back to disabled', cleared.sendDisabled === true);

    // Paint again, fill the rest, and watch the button wake up.
    await page.mouse.move(cell.x, cell.y);
    await page.mouse.down();
    await page.mouse.move(cell.x, cell.y + 18, { steps: 4 });
    await page.mouse.up();
    await page.type('#letter-intent', 'Weekly art class for a small group.');
    await page.evaluate(() => {
      document.querySelector('.choices .choice__input')?.click();
      const size = document.getElementById('letter-size');
      size.value = '4';
      size.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(300);
    const ready = await foot();
    check('a complete request enables the send', ready.sendDisabled === false, JSON.stringify(ready));
    check('…and the unready caption goes away', ready.unready === '');

    // Press it: on this unkeyed production build the identity step must appear
    // and say sign-in is unavailable — not silence.
    const btn = await page.$('.letter__foot .pill--primary');
    const box = await btn.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await sleep(700);
    const identity = await page.evaluate(() => {
      const step = document.querySelector('.identity');
      const r = step?.getBoundingClientRect();
      return {
        hidden: step?.hidden,
        onScreen: r ? r.top >= 0 && r.bottom <= innerHeight && r.height > 0 : false,
        text: step?.textContent?.slice(0, 160) ?? '',
      };
    });
    check(
      'send answers with the identity step, visible on screen',
      identity.hidden === false && identity.onScreen,
      JSON.stringify(identity)
    );
  }

  await page.screenshot({ path: '/tmp/letter-probe-jv-after.png' });
} finally {
  await browser.close();
}
console.log(failed ? `\n${failed} FAILED` : '\nall good');
process.exit(failed ? 1 : 0);
