// The discovery surface on a phone: a full-bleed map with the results drawn up
// over it as a sheet on three detents (CONTRACT4 §3). Every gesture here is a
// real touch — the sheet is dragged by its handle with the touchscreen, not by
// calling into it — because a sheet that only moves when JavaScript moves it is
// not a sheet.
//
//   node tools/map-narrow.mjs "http://localhost:5322/?q=low" 390x844
import { closeBrowsers, launch } from './fixtures.mjs';

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

const url = process.argv[2] ?? 'http://localhost:5322/?q=low';
const [w, h] = (process.argv[3] ?? '390x844').split('x').map(Number);

const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: w, height: h, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

let failures = 0;
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('GL Driver')) errors.push(`[console] ${m.text()}`);
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function check(label, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

const rect = (selector) =>
  page.evaluate((s) => {
    const n = document.querySelector(s);
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom) };
  }, selector);

/** A sheet scrolled to its own end: does it stand on the foot of the page, and
 *  is its last line above the fold? A sheet whose box hangs below the window
 *  looks perfectly normal and cannot be read to the end (§9). */
const foot = (selector) =>
  page.evaluate((s) => {
    const sheet = document.querySelector(s);
    const tail = sheet.querySelector('.sheet__body').lastElementChild;
    sheet.scrollTo(0, 99999);
    return {
      hangsBelow: Math.round(sheet.getBoundingClientRect().bottom - window.innerHeight),
      lifted: document.querySelector('.rail').classList.contains('is-lifted'),
      transform: sheet.style.transform || '',
      at: sheet.scrollTop,
      max: sheet.scrollHeight - sheet.clientHeight,
      cut: Math.round(tail.getBoundingClientRect().bottom - window.innerHeight),
    };
  }, selector);

const detent = () => page.evaluate('document.querySelector(".dm-panel").dataset.detent');
const said = () => page.evaluate('document.getElementById("a11y").textContent');
const roll = () => page.evaluate('__steeple.state.roll');

/** Where the pins have ended up, so it can be said whether they can be seen. */
const pinBand = () =>
  page.evaluate(() => {
    const pins = [...document.querySelectorAll('.dm-pin')].map((n) => n.getBoundingClientRect());
    const top = Math.min(...pins.map((p) => p.top));
    const bottom = Math.max(...pins.map((p) => p.bottom));
    return { top: Math.round(top), bottom: Math.round(bottom), middle: Math.round((top + bottom) / 2) };
  });

async function ready() {
  await page.goto('about:blank');
  await page.goto(`${url}#/browse`, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__steepleReady === true', { timeout: 25000 });
  // The product lives past the roll; the harness lands there without the tween.
  await page.evaluate('__steeple.roll.set(1)');
  await wait(3000);
}

async function shot(name) {
  await page.screenshot({ path: `/tmp/steeple-b-narrow-${name}.png` });
}

/** One finger, on the handle, moved and let go — with a frame taken mid-way. */
async function dragHandle(dy, { steps = 10, hold = 26, snapAt = null, snapName = '', on = '.dm-grab' } = {}) {
  const grab = await rect(on);
  const x = grab.x + grab.w / 2;
  const y = grab.y + grab.h / 2;
  await page.touchscreen.touchStart(x, y);
  for (let i = 1; i <= steps; i += 1) {
    await page.touchscreen.touchMove(x, y + (dy * i) / steps);
    await wait(hold);
    if (snapAt === i) await shot(snapName);
  }
  await page.touchscreen.touchEnd();
  await wait(700);
}

// ── 1. the phone's shape: map behind, pill on top, list as a sheet ──────────
await ready();

const card = await rect('.dm-card');
const map = await rect('.dm-map');
const search = await rect('.dm-bar');
const panel = await rect('.dm-panel');

console.log(`\n— ${w}x${h} —`);
console.log('shape:', JSON.stringify({ card, map, search, panel }));

check('the map is full bleed under everything', map.x === card.x && map.w === card.w && map.h === card.h, `${map.w}x${map.h} of ${card.w}x${card.h}`);
check('the pill stands over it, clear of the top line', search.y > card.y && search.y < card.y + 30 && search.w > w - 40, JSON.stringify(search));
check('the list is a sheet, not a column', panel.w === card.w && panel.y > search.bottom, `${panel.w}px wide, top ${panel.y}`);
check('it opens on the middle detent', (await detent()) === 'middle', String(await detent()));
check('the handle is on it', (await rect('.dm-grab')) !== null);
check('and the map and the list share the page', panel.y > h * 0.35 && panel.y < h * 0.65, `sheet top at ${panel.y} of ${h}`);
await shot(`${w}x${h}-middle`);

// The map is re-measured for the band that can actually be seen.
const bandMiddle = await pinBand();
check(
  'every pin sits in the strip of map you can see',
  bandMiddle.top > search.bottom - 40 && bandMiddle.bottom < panel.y,
  `pins ${bandMiddle.top}–${bandMiddle.bottom}, visible ${search.bottom}–${panel.y}`
);

// ── 2. dragging it up, with a frame taken mid-drag ──────────────────────────
await dragHandle(-260, { snapAt: 6, snapName: `${w}x${h}-middrag` });
check('a drag up takes it to the top', (await detent()) === 'top', String(await detent()));
const top = await rect('.dm-panel');
check('the list fills the page', top.h > h * 0.75, `${top.h}px of ${h}`);
check('...but the pill is still there to ask something else', top.y > (await rect('.dm-bar')).bottom, `sheet top ${top.y}, pill ends ${(await rect('.dm-bar')).bottom}`);
check('...and the map is behind it', (await rect('.dm-map')).h === card.h);
console.log('  announced:', JSON.stringify(await said()));
await shot(`${w}x${h}-top`);

// ── 3. and down to the foot of the page ────────────────────────────────────
await dragHandle(h, { steps: 12 });
check('a drag down takes it to the foot', (await detent()) === 'bottom', String(await detent()));
const bottom = await rect('.dm-panel');
check('the map has the page', bottom.y > h * 0.85, `sheet top at ${bottom.y} of ${h}`);
check('...with the handle still peeking', bottom.y < h - 20 && (await rect('.dm-grab')).bottom <= h, `handle ends ${(await rect('.dm-grab')).bottom}`);
// The map element never changed size — only how much of it can be seen — so the
// proof that Leaflet was re-measured is that the churches moved down into the
// page the sheet gave back, and still sit inside it.
const bandBottom = await pinBand();
check(
  'the churches move down into the page the sheet gave back',
  bandBottom.middle > bandMiddle.middle + 60,
  `band centre ${bandMiddle.middle} → ${bandBottom.middle}`
);
check(
  '...and still sit where they can be seen',
  bandBottom.top > (await rect('.dm-bar')).bottom - 40 && bandBottom.bottom < bottom.y,
  `pins ${bandBottom.top}–${bandBottom.bottom}, visible to ${bottom.y}`
);
await shot(`${w}x${h}-bottom`);

// ── 4. the handle is a real button ─────────────────────────────────────────
await page.evaluate('document.querySelector(".dm-grab").focus()');
await page.keyboard.press('ArrowUp');
await wait(700);
check('ArrowUp raises it a detent', (await detent()) === 'middle', String(await detent()));
await page.keyboard.press('ArrowUp');
await wait(700);
check('and again', (await detent()) === 'top', String(await detent()));
await page.keyboard.press('ArrowUp');
await wait(700);
check('and stops at the top', (await detent()) === 'top', String(await detent()));
await page.keyboard.press('ArrowDown');
await wait(700);
check('ArrowDown lowers it', (await detent()) === 'middle', String(await detent()));

await page.touchscreen.tap((await rect('.dm-grab')).x + 40, (await rect('.dm-grab')).y + 10);
await wait(700);
check('a tap on the handle steps to the next detent', (await detent()) === 'bottom', String(await detent()));
check('the handle says where it is', (await page.evaluate('document.querySelector(".dm-grab").getAttribute("aria-label")')).includes('map has the page'), await page.evaluate('document.querySelector(".dm-grab").getAttribute("aria-label")'));

// ── 5. it never takes the roll with it ─────────────────────────────────────
check('the page is still the product before the drag', (await roll()) === 1);
await dragHandle(-h * 0.5);
check('dragging the sheet up does not roll the page back', (await roll()) === 1, `roll ${await roll()}`);
await dragHandle(h * 0.5);
check('nor does dragging it down', (await roll()) === 1, `roll ${await roll()}`);

// ── 6. searching from a phone ──────────────────────────────────────────────
const funnel = await rect('.dm-seg--filters');
await page.touchscreen.tap(funnel.x + funnel.w / 2, funnel.y + funnel.h / 2);
await wait(600);
const pop = await rect('.dm-pop');
check('the funnel opens over the map, inside the page', pop && pop.x >= 0 && pop.x + pop.w <= w, JSON.stringify(pop));
const music = await rect('.pill--filter[data-filter="Music"]');
await page.touchscreen.tap(music.x + music.w / 2, music.y + music.h / 2);
await wait(900);
check('a chip filters from the phone too', (await page.evaluate('document.querySelector(".dm-count").textContent')).startsWith('3 spaces'), await page.evaluate('document.querySelector(".dm-count").textContent'));
check('...and the pins rest with it', (await page.evaluate('document.querySelectorAll(".dm-pin.is-resting").length')) > 0);
await shot(`${w}x${h}-filtered`);

// ── 7. a property sheet stands over the map, and can be put down ───────────
// It used to take the whole page, and the way back was a line at the foot of a
// scroll. It is a sheet over the map now (CONTRACT6 §2.2): a band of map above
// it, a handle on it, and the step back at the top of it.
await page.evaluate('__steeple.setView("room",{venueId:"grace-community-vienna",roomId:"fellowship-hall"})');
await wait(1600);
const sheet = await rect('.sheet--room');
check('the property sheet takes the page under a band of map', sheet.h > h * 0.6 && sheet.w > w - 20, JSON.stringify(sheet));
check('...leaving that band above it', sheet.y > 150 && sheet.y < h * 0.4, `sheet top ${sheet.y} of ${h}`);
check('...where the map is still live', (await rect('.dm-map')).h > h * 0.5);
check('...and covers the browse surface rather than fighting it', sheet.y <= (await rect('.dm-panel')).y);
check('the sheet wears a handle to put it down by', (await rect('.sheet--room .sheet__grab')) !== null);
check(
  '...and its step back names one level up, not the map',
  (await page.evaluate('document.querySelector(".sheet--room .sheet__up").textContent')).includes('Grace Community'),
  await page.evaluate('document.querySelector(".sheet--room .sheet__up").textContent')
);
await shot(`${w}x${h}-room`);

// ── 8. the handle pulls both ways, and the sheet reads as one page ─────────
// The handle used to be a one-way door: it put the sheet down and nothing else,
// so the band of map was a wall you could not get past on a long listing. It
// stands in two places now (ui/rail.js), and the sheet scrolls whole — the
// photograph and the name go up with the reading, not just the part under them.
const resting = await rect('.sheet--room');
const scrolls = () =>
  page.evaluate(() => {
    const sheet = document.querySelector('.sheet--room');
    const body = sheet.querySelector('.sheet__body');
    const over = (n) => n.scrollHeight - n.clientHeight;
    return { sheet: over(sheet), body: over(body), at: sheet.scrollTop };
  });

check('the sheet itself is the page that scrolls', (await scrolls()).sheet > 40, JSON.stringify(await scrolls()));
check('...not a body scrolling under a fixed head', (await scrolls()).body === 0, JSON.stringify(await scrolls()));

const headTop = () => rect('.sheet--room .dm-banner--hero').then((r) => r.y);
const before = await headTop();
await page.evaluate('document.querySelector(".sheet--room").scrollBy(0, 200)');
await wait(400);
check('the photograph goes up with the reading', (await headTop()) < before - 100, `hero ${before} → ${await headTop()}`);
check('...and the handle stays put, the way back out of it', (await rect('.sheet--room .sheet__grab')).y <= resting.y + 2, JSON.stringify(await rect('.sheet--room .sheet__grab')));
const roomEnd = await foot('.sheet--room');
check('the room sheet stands on the foot of the page', roomEnd.hangsBelow === 0, JSON.stringify(roomEnd));
check('...so its last line can be read', roomEnd.cut <= 0, JSON.stringify(roomEnd));
await page.evaluate('document.querySelector(".sheet--room").scrollTo(0, 0)');
await wait(300);

await dragHandle(-260, { on: '.sheet--room .sheet__grab', snapAt: 6, snapName: `${w}x${h}-room-lifting` });
const raised = await rect('.sheet--room');
check('a pull up gives the sheet the whole page', raised.y < resting.y - 120, `sheet top ${resting.y} → ${raised.y}`);
check('...all the way to the top line, and no further', raised.y > 20 && raised.y < 100, `sheet top ${raised.y}`);
check('...so more of the listing can be read at once', (await scrolls()).sheet < 40 || raised.h > resting.h + 120, `${resting.h} → ${raised.h}`);
await shot(`${w}x${h}-room-raised`);

await dragHandle(200, { on: '.sheet--room .sheet__grab' });
const back = await rect('.sheet--room');
check('a pull down puts the band of map back', Math.abs(back.y - resting.y) < 4, `sheet top ${back.y}, was ${resting.y}`);
check('...and leaves nothing of the gesture on the page', await page.evaluate('!document.querySelector(".rail").classList.contains("is-lifted") && !document.querySelector(".sheet--room").style.transform'));
check('...without leaving the listing', await page.evaluate('__steeple.state.view === "room"'), await page.evaluate('__steeple.state.view'));

await dragHandle(h * 0.6, { on: '.sheet--room .sheet__grab', steps: 12 });
check('one more puts the sheet down, exactly one level', await page.evaluate('__steeple.state.view === "venue"'), await page.evaluate('__steeple.state.view'));

// ── 9. the last line of a sheet can always be read ────────────────────────
// The sheet's foot must be the page's foot whenever nobody is holding it. A
// sheet left lifted by a gesture that was taken away rather than finished looks
// exactly like one at rest — band of map above it and all — while its foot
// hangs below the window, and the end of the listing quietly cannot be reached.
// That shipped once. These are the checks that would have caught it.
await wait(700);
let end = await foot('.sheet--venue');
check('the church sheet stands on the foot of the page', end.hangsBelow === 0, JSON.stringify(end));
check('...and its last line can be read', end.cut <= 0, JSON.stringify(end));

// A gesture that loses its pointer — a window blur, a capture handed elsewhere,
// a context menu — lands the sheet anyway.
const grabAt = await rect('.sheet--venue .sheet__grab');
await page.touchscreen.touchStart(grabAt.x + grabAt.w / 2, grabAt.y + grabAt.h / 2);
for (let i = 1; i <= 6; i += 1) {
  await page.touchscreen.touchMove(grabAt.x + grabAt.w / 2, grabAt.y + grabAt.h / 2 - i * 10);
  await wait(25);
}
await page.evaluate('document.querySelector(".sheet--venue .sheet__grab").dispatchEvent(new Event("lostpointercapture"))');
await wait(700);
end = await foot('.sheet--venue');
check('a gesture that is taken away lands the sheet anyway', end.hangsBelow === 0 && !end.lifted, JSON.stringify(end));
check('...leaving the last line reachable', end.cut <= 0, JSON.stringify(end));
await page.touchscreen.touchEnd();
await wait(400);

// And by any road not thought of: found lifted at rest, it puts itself back the
// next time anyone touches it.
// From the top of the sheet: lifting it while it is scrolled to its end clamps
// the scroll, and the clamp is itself a touch — the heal beats the probe to it.
await page.evaluate('document.querySelector(".sheet--venue").scrollTo(0, 0)');
await wait(300);
await page.evaluate(() => {
  document.querySelector('.rail').classList.add('is-lifted');
  document.querySelector('.sheet--venue').style.transform = 'translate3d(0, 172px, 0)';
});
await wait(200);
// Read, do not touch: this one is the proof the check above can bite, and the
// heal is quick enough that measuring it through `foot` would cure it first.
const hung = await page.evaluate(() => {
  const sheet = document.querySelector('.sheet--venue');
  return {
    hangsBelow: Math.round(sheet.getBoundingClientRect().bottom - window.innerHeight),
    lifted: document.querySelector('.rail').classList.contains('is-lifted'),
  };
});
check('(a sheet stuck lifted does hang below the page)', hung.hangsBelow > 100, JSON.stringify(hung));
await page.evaluate('document.querySelector(".sheet--venue").dispatchEvent(new WheelEvent("wheel", {deltaY: 40}))');
await wait(300);
end = await foot('.sheet--venue');
check('...and the next touch of it puts it back', end.hangsBelow === 0 && !end.lifted, JSON.stringify(end));
check('...with the last line reachable again', end.cut <= 0, JSON.stringify(end));
await page.evaluate('document.querySelector(".sheet--venue").scrollTo(0, 0)');

// The church sheet's own step back is a chip under the picture, not a caption
// on the line under it: it needs air below it or it reads as part of that line.
await wait(600);
const air = await page.evaluate(() => {
  const up = document.querySelector('.sheet--venue .sheet__up');
  const eyebrow = document.querySelector('.sheet--venue .eyebrow');
  return Math.round(eyebrow.getBoundingClientRect().top - up.getBoundingClientRect().bottom);
});
check('the step back stands clear of the line under it', air >= 10, `${air}px of air`);
await shot(`${w}x${h}-venue`);

await page.evaluate('__steeple.setView("village")');
await wait(1000);
await page.evaluate('document.querySelector(".dm-grab").focus()');
await page.keyboard.press('ArrowUp');
await wait(700);
check('the sheet still answers after a listing closes', (await detent()) === 'middle', String(await detent()));

console.log(errors.length ? `\nconsole/page errors:\n${errors.join('\n')}` : '\nno console errors');
if (errors.length) failures += errors.length;
console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
await closeBrowsers();
process.exit(failures ? 1 : 0);
