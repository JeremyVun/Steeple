// The discovery surface on a phone: a full-bleed map with the results drawn up
// over it as a sheet on three detents (CONTRACT4 §3). Every gesture here is a
// real touch — the sheet is dragged by its handle with the touchscreen, not by
// calling into it — because a sheet that only moves when JavaScript moves it is
// not a sheet.
//
//   node tools/map-narrow.mjs "http://localhost:5322/?q=low" 390x844
import puppeteer from 'puppeteer';

const url = process.argv[2] ?? 'http://localhost:5322/?q=low';
const [w, h] = (process.argv[3] ?? '390x844').split('x').map(Number);

const browser = await puppeteer.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
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
  await page.goto(`${url}#/village`, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__steepleReady === true', { timeout: 25000 });
  // The product lives past the roll; the harness lands there without the tween.
  await page.evaluate('__steeple.roll.set(1)');
  await wait(3000);
}

async function shot(name) {
  await page.screenshot({ path: `/tmp/steeple-b-narrow-${name}.png` });
}

/** One finger, on the handle, moved and let go — with a frame taken mid-way. */
async function dragHandle(dy, { steps = 10, hold = 26, snapAt = null, snapName = '' } = {}) {
  const grab = await rect('.dm-grab');
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

await page.evaluate('__steeple.setView("village")');
await wait(1000);
await page.evaluate('document.querySelector(".dm-grab").focus()');
await page.keyboard.press('ArrowUp');
await wait(700);
check('the sheet still answers after a listing closes', (await detent()) === 'middle', String(await detent()));

console.log(errors.length ? `\nconsole/page errors:\n${errors.join('\n')}` : '\nno console errors');
if (errors.length) failures += errors.length;
console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
await browser.close();
process.exit(failures ? 1 : 0);
