// A LOOK AT THE DESCRIBE STEP — the listing flow's room, filled in.
//
// Signs a host in, writes the venue, walks to Describe, fills it the way a host
// would, and shoots the step at a few window sizes. It reports how tall the
// step's body is against the room it was given, which is the question this step
// kept failing: whether a host can finish it without scrolling. A measurement,
// not a suite — the checks live in host-publish-test.mjs.
//
// Needs the API on localhost:5200 and the app on the given origin.
//
//   node tools/describe-shot.mjs "http://localhost:5332/?world=off" d1

import puppeteer from 'puppeteer';
import { writeRoomPhoto } from './host-photo.mjs';

const url = process.argv[2] ?? 'http://localhost:5332/?world=off';
const prefix = process.argv[3] ?? 'describe';
const PHOTO = writeRoomPhoto('/tmp/steeple-describe-room.png');
const stamp = Date.now().toString(36);
const hostEmail = `look-${stamp}@example.org`;

const browser = await puppeteer.launch({
  headless: true,
  pipe: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function type(selector, value, { clear = false } = {}) {
    await page.click(selector);
    if (clear) {
      await page.keyboard.press('End');
      const length = await page.$eval(selector, (n) => n.value.length);
      for (let i = 0; i < length; i += 1) await page.keyboard.press('Backspace');
    }
    await page.keyboard.type(value, { delay: 2 });
  }

  async function clickText(selector, pattern) {
    for (const handle of await page.$$(selector)) {
      const said = (await handle.evaluate((n) => n.textContent)).trim();
      if (!pattern.test(said)) continue;
      const box = await handle.boundingBox();
      if (!box) continue;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await wait(400);
      return true;
    }
    return false;
  }

  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__steepleReady === true', { timeout: 25000 });
  await page.evaluate('__steeple.roll.set(1)');
  await page.evaluate('localStorage.removeItem("steeple-village-session")');
  await page.evaluate(`__steeple.session.signIn({email:'${hostEmail}',displayName:'Ruth Ellery'})`);
  await page.waitForFunction('!!__steeple.session.currentUser()', { timeout: 25000 });
  await page.evaluate('__steeple.setMode("host")');
  await page.waitForSelector('.listing__layer:not([hidden])', { timeout: 30000 });
  await wait(800);

  await type('#place-name', `Trinity Hall ${stamp}`);
  await type('#place-description', 'A stone hall behind the church, used by the parish through the week.');
  await type('#place-address', '18 Church Street');
  await type('#place-suburb', 'Vienna');
  await type('#place-postcode', '22180');
  await page.click('[data-action="advance"]');
  await wait(900);
  await clickText('.listing .identity__actions .pill--primary', /^Continue as/);
  await wait(2600);

  await type('#room-name', `Long Room ${stamp}`, { clear: true });
  await type('#room-description', 'A long room with a wooden floor, a piano at the far end, and chairs for sixty.');
  await type('#room-capacity', '60', { clear: true });
  await type('#room-price', '30', { clear: true });
  await type('#room-rules', 'No alcohol. Chairs stacked at the end.');
  await page.screenshot({ path: `/tmp/${prefix}-nophoto.png` });
  await (await page.$('#room-photo')).uploadFile(PHOTO);
  await wait(600);
  await clickText('.toggles .chip--toggle', /^Kitchen$/);
  await clickText('.toggles .chip--toggle', /^Step-free access$/);

  // How the step stands at a few window heights, filled in.
  for (const height of [760, 900, 1050]) {
    await page.setViewport({ width: 1440, height });
    await wait(500);
    const fit = await page.evaluate(() => {
      const body = document.querySelector('.listing__body');
      return { content: body.scrollHeight, room: body.clientHeight };
    });
    console.log(
      `${height}px window — body ${fit.room}px, content ${fit.content}px ` +
        (fit.content <= fit.room + 1 ? '· fits' : `· ${fit.content - fit.room}px of scroll`)
    );
    await page.screenshot({ path: `/tmp/${prefix}-everyone-${height}.png` });
  }

  await page.setViewport({ width: 1440, height: 900 });
  await wait(400);
  await clickText('.welcome .segment', /Some activities only/);
  await wait(400);
  const narrowed = await page.evaluate(() => {
    const body = document.querySelector('.listing__body');
    return { content: body.scrollHeight, room: body.clientHeight };
  });
  console.log(
    `narrowed to some activities — body ${narrowed.room}px, content ${narrowed.content}px ` +
      (narrowed.content <= narrowed.room + 1 ? '· fits' : `· ${narrowed.content - narrowed.room}px of scroll`)
  );
  await page.screenshot({ path: `/tmp/${prefix}-narrowed-900.png` });

  // The welcome field alone, which is what the owner was looking at. Clipped
  // from the page: an element screenshot of a node inside a scroller hangs here.
  const frame = await page.$eval('.welcome', (n) => {
    const box = n.getBoundingClientRect();
    return { x: box.x - 12, y: box.y - 12, width: box.width + 24, height: box.height + 24 };
  });
  await page.screenshot({ path: `/tmp/${prefix}-welcome.png`, clip: frame });

  // And the sheet where it has to fold: a narrow window, and a phone.
  for (const [width, height] of [[880, 900], [560, 900]]) {
    await page.setViewport({ width, height });
    await wait(500);
    const fold = await page.evaluate(() => {
      const body = document.querySelector('.listing__body');
      return { content: body.scrollHeight, room: body.clientHeight };
    });
    console.log(
      `${width}px wide — body ${fold.room}px, content ${fold.content}px ` +
        (fold.content <= fold.room + 1 ? '· fits' : `· ${fold.content - fold.room}px of scroll`)
    );
    await page.screenshot({ path: `/tmp/${prefix}-w${width}.png` });
  }

  console.log(`shots: /tmp/${prefix}-*.png`);
} finally {
  await browser.close();
}
