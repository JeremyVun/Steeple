// One-off: the lower half of the venue sheet at 2x, to judge the marks at size.
import puppeteer from 'puppeteer';

const url = process.argv[2];
const out = process.argv[3];
const browser = await puppeteer.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'networkidle0' });
await page.waitForFunction('window.__steepleReady === true', { timeout: 25000 });
await page.evaluate("__steeple.roll.set(1); __steeple.setView('venue',{venueId:'oakton-baptist'})");
await new Promise((r) => setTimeout(r, 2200));
const box = await page.evaluate(() => {
  const r = document.querySelector('.sheet--venue .sheet__body').getBoundingClientRect();
  return { x: r.x, y: r.y + r.height * 0.45, width: r.width, height: r.height * 0.55 };
});
await page.screenshot({ path: out, clip: box });
console.log('wrote', out);
await browser.close();
