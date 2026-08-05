#!/usr/bin/env node
// How much map a gesture actually buys, measured with a real wheel and a real
// drag rather than read off the options object. Leaflet puts the wheel through
// a sigmoid and the drag through a handler, so neither number in the source is
// the number in the hand.
//
//   node tools/map-feel.mjs "http://localhost:5321/?q=low"
//
// Reports, averaged over several gestures:
//   zoom   — zoom levels moved per 60px notch of the wheel (pins measured apart)
//   pan    — map pixels moved per pixel of pointer travel (a pin followed)

import puppeteer from 'puppeteer';

const url = process.argv[2] ?? 'http://localhost:5321/?q=low';

const browser = await puppeteer.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function ready() {
  await page.goto('about:blank');
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__steepleReady === true', { timeout: 25000 });
  await page.evaluate('__steeple.roll.set(1)');
  await wait(2600);
}

/** The map's scale as a visitor sees it: how far apart two pins stand. */
const pinSpread = () =>
  page.evaluate(() => {
    const pins = [...document.querySelectorAll('.dm-pin')].map((n) => n.getBoundingClientRect());
    return Math.hypot(pins[0].x - pins.at(-1).x, pins[0].y - pins.at(-1).y);
  });

/** Where one pin stands on the page — the ground itself, followed. */
const pinAt = () =>
  page.evaluate(() => {
    const r = document.querySelector('.dm-pin').getBoundingClientRect();
    return { x: r.x, y: r.y };
  });

const mapBox = async () => {
  const b = await (await page.$('.dm-map')).boundingBox();
  return { cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
};

// ── the wheel ───────────────────────────────────────────────────────────────
const NOTCH = 60;
const zoomRuns = [];
for (const run of [0, 1, 2]) {
  await ready();
  const { cx, cy } = await mapBox();
  const before = await pinSpread();
  await page.mouse.move(cx, cy);
  await page.mouse.wheel({ deltaY: -NOTCH });
  await wait(1500);
  zoomRuns.push(Math.log2((await pinSpread()) / before));
  if (run === 2) console.log(`wheel: ${zoomRuns.map((n) => n.toFixed(3)).join(', ')}`);
}

// ── the drag ────────────────────────────────────────────────────────────────
const TRAVEL = 240;
const panRuns = [];
for (const run of [0, 1, 2]) {
  await ready();
  const { cx, cy } = await mapBox();
  const before = await pinAt();
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let step = 1; step <= 12; step += 1) {
    await page.mouse.move(cx + (TRAVEL * step) / 12, cy);
    await wait(16);
  }
  await page.mouse.up();
  await wait(700);
  const after = await pinAt();
  panRuns.push((after.x - before.x) / TRAVEL);
  if (run === 2) console.log(`drag:  ${panRuns.map((n) => n.toFixed(3)).join(', ')}`);
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
console.log('');
console.log(`zoom  ${mean(zoomRuns).toFixed(3)} levels per ${NOTCH}px notch`);
console.log(`pan   ${mean(panRuns).toFixed(3)} map px per pointer px (over ${TRAVEL}px)`);

await browser.close();
