// A LOOK AT THE DESCRIBE STEP — the listing flow's room, filled in.
//
// Signs a host in, writes the venue, walks to Describe, fills it the way a host
// would, and shoots the step at a few window sizes. It reports how tall the
// step's body is against the room it was given, which is the question this step
// kept failing: whether a host can finish it without scrolling. It also reports
// the picture's own size and what stands empty under either column — the step's
// second failing, a stamp-sized photograph with a hand's depth of nothing under
// it. A measurement, not a suite — the checks live in host-publish-test.mjs.
//
// Needs the API (STEEPLE_API, default http://localhost:5200/api/v1) and the app
// on the given origin with its proxy pointed at that same API. DESCRIBE_PHOTO
// puts a real room in the frame instead of the generated fixture, which is the
// only way to judge the proportion the picture is held at.
//
//   node tools/describe-shot.mjs "http://localhost:5332/?world=off" d1
//   DESCRIBE_PHOTO=/tmp/hall.jpg node tools/describe-shot.mjs "http://localhost:5332/?world=off" d2

import { agreeCurrent, closeBrowsers, launch, signIn } from './fixtures.mjs';

// A top-level-await script has no `finally` around it, so this is the finally:
// whatever kills the run, the browsers it opened go with it. (The pipe transport
// covers the ungraceful deaths — v2_migration Phase 3.6 item 7.)
for (const fatal of ['uncaughtException', 'unhandledRejection']) {
  process.on(fatal, async (error) => {
    await closeBrowsers();
    console.log(`\nthe run stopped: ${error?.message ?? error}`);
    process.exit(1);
  });
}
import { writeRoomPhoto } from './host-photo.mjs';

const url = process.argv[2] ?? 'http://localhost:5332/?world=off';
const prefix = process.argv[3] ?? 'describe';
// The generated fixture proves the plumbing; a real room proves the frame. Point
// DESCRIBE_PHOTO at any image on disk to see the step hold a photograph.
const PHOTO = process.env.DESCRIBE_PHOTO ?? writeRoomPhoto('/tmp/steeple-describe-room.png');
const stamp = Date.now().toString(36);
const hostEmail = `look-${stamp}@example.org`;

const browser = await launch();

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
  // Minted and agreed first: an un-agreed account meets the agreements ask over
  // the sheet, and dismissing it signs the account out.
  await agreeCurrent((await signIn(hostEmail, 'Ruth Ellery')).accessToken);
  await page.evaluate(`__steeple.session.signIn({email:'${hostEmail}',displayName:'Ruth Ellery'})`);
  await page.waitForFunction('!!__steeple.session.currentUser()', { timeout: 25000 });
  await page.evaluate('__steeple.setMode("host")');
  await page.waitForSelector('.listing__layer:not([hidden])', { timeout: 30000 });
  await wait(800);

  await type('#place-name', `Trinity Hall ${stamp}`);
  await type('#place-description', 'A stone hall behind the church, used by the parish through the week.');
  await type('#place-address', '18 Church Street, Vienna 22180');
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

  // The picture with a pointer on it: the way back to the picker is a veil over
  // the photograph, so it only exists in a hovered shot.
  const picture = await (await page.$('.shotpick')).boundingBox();
  await page.mouse.move(picture.x + picture.width / 2, picture.y + picture.height / 2);
  await wait(400);
  await page.screenshot({ path: `/tmp/${prefix}-hovered.png` });
  await page.mouse.move(4, 4);
  await wait(300);

  // The two columns against each other: how big the photograph actually is, and
  // how much of either column is standing empty under its last field. A hole
  // under the picture is the shape of that number, so the number is printed.
  const columns = await page.evaluate(() => {
    const box = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return { w: Math.round(rect.width), h: Math.round(rect.height), bottom: Math.round(rect.bottom) };
    };
    return { grid: box('.describe'), words: box('.describe__words'), facts: box('.describe__facts'), tile: box('.shotpick') };
  });
  console.log(
    `photograph ${columns.tile?.w}×${columns.tile?.h}px · row ${columns.grid?.h}px ` +
      `· empty under the words ${columns.grid.bottom - columns.words.bottom}px ` +
      `· empty under the picture ${columns.grid.bottom - columns.facts.bottom}px`
  );

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
  await closeBrowsers();
}
