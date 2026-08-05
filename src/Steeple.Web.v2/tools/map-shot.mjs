// Close-up screenshots of the discovery surface, at the size it is actually
// drawn — the map's toning cannot be judged from a 1440px page shot.
//   node tools/map-shot.mjs <url> <name> [where] [filters] [full]
// Writes /tmp/steeple-panel-<name>.png clipped to the surface, and with
// `full` the whole frame beside it.
import puppeteer from 'puppeteer';

const [url, name, ...rest] = process.argv.slice(2);
if (!url || !name) {
  console.error('usage: node tools/map-shot.mjs <url> <name> [where] [filters] [full]');
  process.exit(2);
}

const browser = await puppeteer.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('GL Driver')) errs.push(m.text());
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto(url, { waitUntil: 'networkidle0' });
await page.waitForFunction('window.__steepleReady === true', { timeout: 20000 });
// The surface only exists past the roll.
await page.evaluate('__steeple.roll.set(1)');
await wait(2500);

if (rest.includes('where')) await page.evaluate('document.querySelector(".dm-seg__input").focus()');
if (rest.includes('filters')) await page.evaluate('document.querySelector(".dm-seg--filters").click()');
await wait(1200);

const box = await page.evaluate(() => {
  const r = document.querySelector('.dm-card').getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
});
console.log('surface box', JSON.stringify(box));
await page.screenshot({
  path: `/tmp/steeple-panel-${name}.png`,
  clip: { x: box.x - 12, y: box.y - 12, width: box.width + 24, height: box.height + 24 },
});
if (rest.includes('full')) await page.screenshot({ path: `/tmp/steeple-panel-${name}-full.png` });
console.log(name, errs.length ? `ERRORS: ${errs.join(' | ')}` : 'clean');
await browser.close();
process.exit(errs.length ? 1 : 0);
