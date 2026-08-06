#!/usr/bin/env node
// Makes the boot poster: the village's own opening frame, photographed and
// written to public/assets/ as WebP. index.html paints it under the
// transparent canvas so a first visit sees the real splash artwork instead of
// a blank while three.js loads, builds and compiles (styles/main.css
// `#poster`, main.js's crossfade).
//
// One photograph per frame shape, because the composition is a function of the
// frame: journey/composition.js fits the village by aspect, so a narrower
// window stands the camera further back. Each shape is captured at its
// bucket's WIDEST aspect and served to windows at that aspect or narrower
// (index.html's <picture>), so object-fit: cover always fits by height and
// crops width. That matters because the live render opens composed against
// the photograph's own aspect and eases to the window's afterward
// (journey/index.js posterAspect) — height-fit is what makes the photograph
// and that opening render the same picture, edge to edge.
//
// The pose is the visitor's first frame, exactly: the engine is PAUSED the
// moment it is ready and the photograph is of the frozen frame — ambient
// drift, breathing and all, a few hundred app-milliseconds in, which is where
// every real first frame lives. (Do not photograph a running scene "a settle"
// later: the breathing alone is a 2% zoom the crossfade will show.)
//
// The interface layer is hidden for the shot — the title text is real HTML on
// top of the poster — and the page's own #poster is stripped before boot, both
// so it cannot photograph itself into the next poster and so the camera is not
// pinned to the OLD poster's aspect while the new one is being taken.
//
// Filenames carry the frame size and a content hash; /assets/ is served
// immutable (nginx.conf), so a re-run that changes the pixels changes the
// name. Stale poster files are deleted, and the finished <picture> block is
// printed — paste it over the one in index.html when any name changed. The
// `WxH.hash` shape is load-bearing: main.js parses the aspect out of it.
//
// Usage (needs the debug API, so the dev server or a *:debug build):
//   npm run dev -- --port 5610      # any origin serving the app, world ON
//   node tools/poster.mjs http://localhost:5610/
//
// Headless GL (SwiftShader) renders the same frame the client does, only
// slowly — waits are on window.__steepleReady, never wall-clock.

import { createHash } from 'node:crypto';
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const url = process.argv[2] ?? 'http://localhost:5173/';

// Bucket boundaries, widest first — the <picture> is served top-down, first
// matching media wins, and every shape is photographed AT its bucket's upper
// boundary (see above). `media: null` is the <img> fallback: phone portrait,
// anything narrower than the last <source>.
const SHAPES = [
  { w: 2585, h: 1100, quality: 55, media: '(min-aspect-ratio: 15/8)' }, // ultrawide
  { w: 2400, h: 1280, quality: 52, media: '(min-aspect-ratio: 33/20)' }, // 16:9 and wide laptops
  { w: 2376, h: 1440, quality: 52, media: '(min-aspect-ratio: 29/20)' }, // 16:10 / 3:2
  { w: 2088, h: 1440, quality: 52, media: '(min-aspect-ratio: 23/20)' }, // 4:3-ish
  { w: 1656, h: 1440, quality: 55, media: '(min-aspect-ratio: 4/5)' }, // square-ish
  { w: 1280, h: 1600, quality: 58, media: '(min-aspect-ratio: 5/8)' }, // tablet portrait
  { w: 1000, h: 1600, quality: 60, media: null }, // phone portrait
];

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');
await mkdir(outDir, { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  pipe: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});

try {
  const written = [];
  for (const { w, h, quality, media } of SHAPES) {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h });
    // The standing poster must be gone before boot reads it (see header).
    await page.evaluateOnNewDocument(() => {
      addEventListener('DOMContentLoaded', () => document.getElementById('poster')?.remove());
    });
    // Not networkidle: the product surface keeps the wire warm behind the
    // splash. __steepleReady is the only readiness that means anything here.
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction('window.__steepleReady === true', { timeout: 120000 });

    await page.evaluate(() => {
      // Freeze first: the photograph is of this frame, not of a later one.
      window.__steeple.engine.stop();
      // display, not visibility: the open title sheet sets its own
      // `visibility: visible`, which would climb right back out of a hidden
      // parent and print the words into the poster.
      document.getElementById('ui').style.display = 'none';
      document.getElementById('scene').style.opacity = '1';
    });
    // One beat for the compositor to take the style changes.
    await new Promise((resolve) => setTimeout(resolve, 400));

    const shot = await page.screenshot({ type: 'webp', quality });
    const hash = createHash('sha256').update(shot).digest('hex').slice(0, 8);
    const name = `poster-village-${w}x${h}.${hash}.webp`;
    await writeFile(path.join(outDir, name), shot);
    written.push({ name, media });
    console.log(`${name}  ${(shot.length / 1024).toFixed(0)} KiB`);
    await page.close();
  }

  for (const held of await readdir(outDir)) {
    if (held.startsWith('poster-village-') && !written.some(({ name }) => name === held)) {
      await unlink(path.join(outDir, held));
      console.log(`retired ${held}`);
    }
  }

  const sources = written
    .filter(({ media }) => media)
    .map(({ name, media }) => `      <source media="${media}" srcset="assets/${name}" />`)
    .join('\n');
  const fallback = written.find(({ media }) => !media);
  console.log(`\nThe #poster block for index.html:\n
    <picture id="poster" aria-hidden="true">
${sources}
      <img src="assets/${fallback.name}" fetchpriority="high" decoding="async" alt="" />
    </picture>`);
} finally {
  await browser.close();
}
