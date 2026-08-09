// Real-input test for the printed layer: the filter chips inside the discovery
// panel, the room rows on the venue sheet, and the request CTA (→ apply view),
// driven with actual mouse and keyboard events.
//   node tools/ui-test.mjs "http://localhost:5395/?q=low"
import { at, closeBrowsers, launch, routes } from './fixtures.mjs';

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

const url = process.argv[2] ?? 'http://localhost:5395/?q=low';
const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

let failures = 0;
page.on('pageerror', (e) => {
  failures += 1;
  console.log('[pageerror]', e.message);
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const state = (key) => page.evaluate(`__steeple.state.${key}`);

function check(label, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function ready(target) {
  await page.goto(target, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__steepleReady === true', { timeout: 25000 });
  await wait(2600);
}

/** Click the first visible element matching `selector` whose text matches, and
 *  report what the pointer would actually have hit there. */
async function clickText(selector, pattern, label) {
  for (const handle of await page.$$(selector)) {
    const text = (await handle.evaluate((n) => n.textContent)).trim();
    if (!pattern.test(text)) continue;
    const box = await handle.boundingBox();
    if (!box) continue;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const top = await page.evaluate(
      (px, py) => document.elementsFromPoint(px, py)[0]?.className ?? '?',
      x,
      y
    );
    await page.mouse.click(x, y);
    await wait(1600);
    check(`${label}: clicked ${JSON.stringify(text)}`, true, `topmost at point: ${top}`);
    return true;
  }
  check(`${label}: found something matching ${pattern}`, false);
  return false;
}

await ready(at(url, routes.browse()));
console.log('boot view:', await state('view'));

// The chips are behind the search pill's funnel now — the segment is the
// affordance. (Workstream B, CONTRACT4 §3: same chips, same bus contract.)
await clickText('.dm-seg--filters', /^Filter/, 'filter segment');
await clickText('.dm-filters .pill--filter', /^Music$/, 'filter chip');
check('the chip filters', (await page.evaluate('[...__steeple.state.filters].join()')) === 'Music', await page.evaluate('[...__steeple.state.filters].join()'));
await clickText('.dm-filters .pill--filter', /^Music$/, 'filter chip again');
check('...and unfilters', (await page.evaluate('__steeple.state.filters.size')) === 0);

await ready(at(url, routes.venue('grace-community-vienna')));
await clickText('.spacecard', /Fellowship Hall/, 'space card');
check('a room row opens the room', (await state('view')) === 'room' && (await state('roomId')) === 'fellowship-hall', `${await state('view')} / ${await state('roomId')}`);

await clickText('.sheet--room .pill--primary', /Request this space/, 'request CTA');
check('the CTA opens the request step', (await state('view')) === 'apply', `${await state('view')} · ${await page.evaluate('location.pathname')}`);
await page.keyboard.press('Escape');
await wait(1800);
check('Esc comes back to the room', (await state('view')) === 'room' && (await state('roomId')) === 'fellowship-hall', `${await state('view')} / ${await state('roomId')}`);

check(
  'the demo disclaimer is gone',
  (await page.evaluate('document.querySelector(".sheet--room .sheet__disclaimer")')) === null,
  await page.evaluate('document.querySelector(".sheet--room .sheet__disclaimer")?.textContent')
);

// The right rail is the right rail: the sheet sits opposite the discovery panel.
const geometry = await page.evaluate(() => {
  const sheet = document.querySelector('.sheet--room').getBoundingClientRect();
  const panel = document.querySelector('.dm-card').getBoundingClientRect();
  return { sheetLeft: sheet.left, sheetRight: sheet.right, panelRight: panel.right, width: innerWidth };
});
check('the property sheet is on the right rail', geometry.sheetRight > geometry.width - 60, JSON.stringify(geometry));
check('the sheet leaves the map on the page beside it', geometry.sheetLeft > geometry.width * 0.25, `sheet starts at ${Math.round(geometry.sheetLeft)}px of ${geometry.width}`);

const topmost = await page.evaluate(() =>
  document.elementsFromPoint(720, 450).map((n) => `${n.tagName.toLowerCase()}.${(n.className.baseVal ?? n.className) || ''}`).slice(0, 3)
);
check('the live map is the topmost thing in the middle of the page', /leaflet-container/.test(topmost[0]), topmost.join(' | '));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
await closeBrowsers();
process.exit(failures ? 1 : 0);
