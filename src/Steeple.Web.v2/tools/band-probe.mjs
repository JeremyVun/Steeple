#!/usr/bin/env node
// The moving grey band, caught in the act.
//
// The band is a few units of ink over paper — invisible to a diff of raw
// screenshots and obvious once the paper is stretched. This harness samples the
// browse surface at several points along its CSS animation timeline (rather than
// waiting minutes of wall clock), reads the pixels back through a canvas, prints
// a column profile of the panel's own background, and writes a contrast-stretched
// frame per sample so the band can be looked at.
//
//   node tools/band-probe.mjs <url> <outprefix> [--css "<css>"] [--css-file <path>]
//
// --css injects a stylesheet before sampling: the A/B that proves which layer
// the band belongs to, or reinstates an older ambience to compare against.

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
import { readFileSync, writeFileSync } from 'node:fs';

const [url, prefix, ...rest] = process.argv.slice(2);
if (!url || !prefix) {
  console.error('usage: node tools/band-probe.mjs <url> <outprefix> [--css "<css>"] [--css-file <path>]');
  process.exit(2);
}
const opt = (name, fallback) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : fallback;
};
const cssFile = opt('--css-file', null);
const kill = cssFile ? readFileSync(cssFile, 'utf8') : opt('--css', null);

const PHASES = [0, 28000, 56000, 84000, 112000];

const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(url, { waitUntil: 'networkidle0' });
await page.waitForFunction('window.__steepleReady === true', { timeout: 20000 });
await page.evaluate('__steeple.roll.set(1)');
await wait(2500);

if (kill) {
  await page.evaluate((css) => {
    const style = document.createElement('style');
    style.id = 'band-kill';
    style.textContent = css;
    document.head.append(style);
  }, kill);
  await wait(400);
}

// The panel's own paper: a strip of background under the head, clear of the map
// and of any row text.
const strip = await page.evaluate(() => {
  const head = document.querySelector('.dm-head').getBoundingClientRect();
  return { x: Math.round(head.x), y: Math.round(head.y + head.height + 4), w: Math.round(head.width), h: 26 };
});

const profiles = [];
for (const phase of PHASES) {
  await page.evaluate((ms) => {
    for (const a of document.getAnimations()) {
      if (/clouds|browse/.test(String(a.animationName ?? ''))) {
        a.pause();
        a.currentTime = ms;
      }
    }
  }, phase);
  await wait(250);

  const shot = await page.screenshot({ encoding: 'base64' });
  const read = await page.evaluate(
    async (b64, s) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(s.x, s.y, s.w, s.h).data;
      const cols = [];
      for (let x = 0; x < s.w; x += 1) {
        let sum = 0;
        for (let y = 0; y < s.h; y += 1) sum += data[(y * s.w + x) * 4];
        cols.push(sum / s.h);
      }
      // Contrast-stretched copy of the whole frame, so the band can be seen.
      const full = ctx.getImageData(0, 0, c.width, c.height);
      const px = full.data;
      let lo = 255;
      let hi = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i] < lo) lo = px[i];
        if (px[i] > hi) hi = px[i];
      }
      // Stretch around the paper's own value rather than the frame's full range:
      // one dark pin (the map) would otherwise flatten everything back out.
      const mid = cols.reduce((a, b) => a + b, 0) / cols.length;
      for (let i = 0; i < px.length; i += 4) {
        for (let k = 0; k < 3; k += 1) {
          px[i + k] = Math.max(0, Math.min(255, 128 + (px[i + k] - mid) * 14));
        }
      }
      ctx.putImageData(full, 0, 0);
      return { cols, stretched: c.toDataURL('image/png'), lo, hi };
    },
    shot,
    strip
  );

  profiles.push(read.cols);
  writeFileSync(`${prefix}-phase${phase / 1000}.png`, Buffer.from(read.stretched.split(',')[1], 'base64'));
}

// Report: for each phase, where the panel's paper stops being one value.
const fmt = (n) => n.toFixed(2).padStart(7);
console.log(`strip x=${strip.x} w=${strip.w} y=${strip.y}`);
for (let i = 0; i < PHASES.length; i += 1) {
  const cols = profiles[i];
  const min = Math.min(...cols);
  const max = Math.max(...cols);
  const argMin = cols.indexOf(min);
  const argMax = cols.indexOf(max);
  console.log(
    `phase ${String(PHASES[i] / 1000).padStart(4)}s  min${fmt(min)} @x=${strip.x + argMin}` +
      `  max${fmt(max)} @x=${strip.x + argMax}  spread ${fmt(max - min)}`
  );
}
// Where along the strip the darkest point sits, phase by phase: a band that
// sweeps shows this number marching.
console.log(
  'darkest column, phase by phase:',
  profiles.map((cols) => strip.x + cols.indexOf(Math.min(...cols))).join(' → ')
);

await closeBrowsers();
