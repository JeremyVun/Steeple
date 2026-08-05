#!/usr/bin/env node
// Screenshot verification harness. Loads the app headless, waits for the
// render loop to warm up, optionally drives app state via the window.__steeple
// debug API, then screenshots. All page console output and errors are echoed
// to stdout — a shot with errors is a failed shot.
//
// Usage:
//   node tools/shot.mjs <url> <outfile.png> [options]
// Options:
//   --eval "js"    run in page after ready, e.g. "__steeple.setView('venue',{venueId:'oakton-baptist'})"
//   --wait <ms>    settle time after eval before the shot (default 1200)
//   --size WxH     viewport (default 1440x900)
// Example:
//   node tools/shot.mjs "http://localhost:5301/?q=low" /tmp/steeple3d-world-village.png \
//     --eval "__steeple.setView('village')" --wait 2500

import puppeteer from 'puppeteer';

const [url, out, ...rest] = process.argv.slice(2);
if (!url || !out) {
  console.error('usage: node tools/shot.mjs <url> <outfile.png> [--eval js] [--wait ms] [--size WxH]');
  process.exit(2);
}

const opt = (name, fallback) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : fallback;
};
const evalJs = opt('--eval', null);
const settle = Number(opt('--wait', 1200));
const [w, h] = opt('--size', '1440x900').split('x').map(Number);

const browser = await puppeteer.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});

let hadError = false;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h });

  page.on('console', (msg) => {
    const type = msg.type();
    if (type !== 'error' && type !== 'warn') return;
    const text = msg.text();
    if (text.includes('GL Driver Message') || text.includes('GPU stall')) return;
    // The browser writes its own error line for every request to a backend that
    // is not running. That is a state the catalog is built for — it falls back
    // to the bundled seed and says so with a console.info — not a page fault.
    if ((msg.location?.()?.url ?? '').includes('/api/v1/')) {
      console.log(`[api-absent] ${text}`);
      return;
    }
    hadError ||= type === 'error';
    console.log(`[console.${type}] ${text}`);
  });
  page.on('pageerror', (err) => {
    hadError = true;
    console.log(`[pageerror] ${err.message}`);
  });
  page.on('requestfailed', (req) => {
    console.log(`[requestfailed] ${req.url()} ${req.failure()?.errorText ?? ''}`);
  });

  await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
  await page
    .waitForFunction('window.__steepleReady === true', { timeout: 15000 })
    .catch(() => {
      hadError = true;
      console.log('[harness] TIMEOUT waiting for window.__steepleReady — render loop never warmed up');
    });

  if (evalJs) {
    await page.evaluate(evalJs).catch((e) => {
      hadError = true;
      console.log(`[harness] --eval threw: ${e.message}`);
    });
  }
  await new Promise((r) => setTimeout(r, settle));

  await page.screenshot({ path: out });
  console.log(`[harness] wrote ${out}${hadError ? '  (WITH ERRORS — see above)' : ''}`);
} finally {
  await browser.close();
}
process.exit(hadError ? 1 : 0);
