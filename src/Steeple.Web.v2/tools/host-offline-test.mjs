// THE HOSTING JOURNEY WITH THE API BLOCKED (CONTRACT6 §3.7, second half).
//
// Everything /api/v1 is refused at the network, so the flow meets the one
// condition it must never dress up as a refusal: nothing answered. A host must
// still be able to describe a space and keep it, must be told plainly that
// steeple was not reached, and must never be told the listing is live when no
// service has heard of it. The words are checked as closely as the state: no
// demo language, no exclamation marks, nothing that reads like a rehearsal.
//
//   node tools/host-offline-test.mjs "http://localhost:5332/?q=low&world=off"

import puppeteer from 'puppeteer';

const url = process.argv[2] ?? 'http://localhost:5332/?q=low&world=off';
const shotPrefix = process.argv.includes('--shots')
  ? process.argv[process.argv.indexOf('--shots') + 1]
  : null;

let checks = 0;
let failures = 0;
const problems = [];

function check(label, ok, detail = '') {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
}

const browser = await puppeteer.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
page.on('console', (msg) => {
  if (msg.type() !== 'error') return;
  const said = msg.text();
  if (said.includes('GL Driver Message') || said.includes('GPU stall')) return;
  // A refused request logs itself in the console; that is the browser talking
  // about the block this test installed, not the app failing.
  if (/Failed to (load resource|fetch)|net::ERR/.test(said)) return;
  problems.push(`[console.error] ${said}`);
});

// The block: every call to steeple is refused outright, as it would be with
// nothing listening on the port.
let apiCalls = 0;
await page.setRequestInterception(true);
page.on('request', (request) => {
  if (request.url().includes('/api/v1')) {
    apiCalls += 1;
    request.abort('connectionrefused').catch(() => {});
    return;
  }
  request.continue().catch(() => {});
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const store = (expression) => page.evaluate(`__steeple.store.${expression}`);
const text = (selector) =>
  page.evaluate((s) => document.querySelector(s)?.textContent?.trim() ?? null, selector);
const visible = (selector) =>
  page.evaluate((s) => {
    const node = document.querySelector(s);
    if (!node) return false;
    return node.checkVisibility ? node.checkVisibility() : node.offsetParent !== null;
  }, selector);
const disabled = (selector) => page.$eval(selector, (n) => n.disabled);

async function shot(name) {
  if (!shotPrefix) return;
  await page.screenshot({ path: `/tmp/${shotPrefix}-${name}.png`, fullPage: true });
}

async function click(selector, label = selector) {
  const handle = await page.$(selector);
  if (!handle) {
    check(`click ${label}`, false, 'no element');
    return false;
  }
  await handle.evaluate((n) => n.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await wait(120);
  const box = await handle.boundingBox();
  if (!box) {
    check(`click ${label}`, false, 'not laid out');
    return false;
  }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await wait(500);
  check(`click ${label}`, true);
  return true;
}

async function clickText(selector, pattern, label) {
  for (const handle of await page.$$(selector)) {
    const said = (await handle.evaluate((n) => n.textContent)).trim();
    if (!pattern.test(said)) continue;
    await handle.evaluate((n) => n.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await wait(120);
    const box = await handle.boundingBox();
    if (!box) continue;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await wait(500);
    check(`click ${label}`, true, JSON.stringify(said.slice(0, 34)));
    return true;
  }
  check(`click ${label}`, false, `no match for ${pattern}`);
  return false;
}

async function type(selector, value, { clear = false } = {}) {
  await page.$eval(selector, (n) => n.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.click(selector);
  if (clear) {
    await page.keyboard.press('End');
    const length = await page.$eval(selector, (n) => n.value.length);
    for (let i = 0; i < length; i += 1) await page.keyboard.press('Backspace');
  }
  await page.keyboard.type(value, { delay: 5 });
  await wait(120);
}

console.log(`\n── the hosting journey with steeple away · ${url} ──`);
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__steepleReady === true', { timeout: 30000 });
await wait(2000);
await store('resetDemo()');
// The desk is a sheet over the browse surface, and no sheet is on the page
// until the roll has landed (see host-publish-test): this suite means the same
// thing with a village behind the page as it does with `?world=off`.
await page.evaluate('__steeple.roll.set(1)');
await wait(300);
await page.evaluate('localStorage.removeItem("steeple-village-session")');
await page.evaluate('__steeple.setMode("host")');
await wait(1400);
check('the surface came up without the API', await visible('.desk'));
check('and it did try to reach it', apiCalls > 0, `${apiCalls} refused calls`);

// ── 1. a listing can still be written ─────────────────────────────────────
console.log('\n1. the flow still opens, and still asks for the same things');
await clickText('.desk button', /^List a space$/, 'List a space');
check('it opens at Place', (await text('.steps__step.is-on')) === '1Place');
await type('#place-name', 'Riverside Rooms');
await type('#place-description', 'Two rooms over the old bank, let by the parish since the bank left.');
await type('#place-address', '9 Bridge Street');
await type('#place-suburb', 'Vienna');
await type('#place-postcode', '22180');
await click('[data-action="advance"]', 'Continue');
check('Verify is next', (await text('.steps__step.is-on')) === '2Verify', await text('.steps__step.is-on'));

// ── 2. the sign-in that cannot happen is said plainly ─────────────────────
console.log('\n2. the sign-in that cannot happen');
await page.waitForFunction(
  () => Boolean(document.querySelector('.notice__text')),
  { timeout: 15000 }
).catch(() => {});
const notice = (await text('.notice__text')) ?? '';
check('the host is told steeple could not be reached', /could not be reached/i.test(notice), notice);
check('and is not told they did something wrong', !/invalid|error|failed/i.test(notice), notice);
check('nor sold a rehearsal', !/(demo|sample|pretend|for now)/i.test(notice), notice);
await shot('01-verify-offline');
check('the way forward is open anyway', !(await disabled('[data-action="advance"]')));
await click('[data-action="advance"]', 'Describe the space');
check('Describe is next', (await text('.steps__step.is-on')) === '3Describe', await text('.steps__step.is-on'));

// ── 3. describing, and keeping it ─────────────────────────────────────────
console.log('\n3. describing a space nobody can be told about yet');
await type('#room-name', 'Upper Room', { clear: true });
await type('#room-description', 'A quiet room with tall windows over the river and chairs for thirty.');
await type('#room-capacity', '30', { clear: true });
await type('#room-price', '0', { clear: true });
check('free is still free', (await text('.listing .price--free')) === 'Free');
check('and steeple’s rule is not quoted at a host it cannot reach', ((await text('.field__hint')) ?? '') !== 'Steeple lists spaces by the hour, so a free space cannot be published yet.');
await click('[data-action="advance"]', 'Set availability');
check('Availability is next', (await text('.steps__step.is-on')) === '4Availability', await text('.steps__step.is-on'));
await clickText('.paint__quick .linkish', /Open every day/, 'the standard week');
await wait(400);
const placed = await store('placedVenues()');
const venueId = placed.find((v) => v.name === 'Riverside Rooms')?.id;
check('the venue is kept locally', Boolean(venueId), venueId);
check('with the hours painted', (await store(`openHoursFor('${venueId}','main-space')`)).length === 7);
await click('[data-action="advance"]', 'Review and publish');
check('Publish is next', (await text('.steps__step.is-on')) === '5Publish', await text('.steps__step.is-on'));

// ── 4. publishing into a service that is not there ────────────────────────
console.log('\n4. publishing with nowhere to publish to');
check('publishing is offered — the local record can hold it', !(await disabled('[data-action="advance"]')));
await shot('02-review-offline');
await click('[data-action="advance"]', 'Publish this space');
await wait(3000);
await shot('03-kept');
const kept = (await text('.guide')) ?? '';
check('the host is told it is held here', /kept here|held on this device/i.test(kept), kept.slice(0, 110));
check('and told why', /could not be reached/i.test(kept));
check('and never told steeple has it', !/(sent for review|with a moderator)/i.test(kept));
check('no exclamation marks', !/!/.test((await text('.listing')) ?? ''));
check('no demo-flavoured words', !/(demo|sample|pretend|dummy|fake)/i.test((await text('.listing')) ?? ''));
const room = await store(`effectiveRoom('${venueId}','main-space')`);
check('the local record holds the space', room?.name === 'Upper Room', room?.name);
check('it is published in this browser’s own record', room?.status === 'published', room?.status);
check('and marked as not yet sent', room?.keptLocally === true, JSON.stringify(room?.keptLocally));
check('no publish request was invented', !room?.publishRequestedAt);

// ── 5. the desk goes on working ───────────────────────────────────────────
console.log('\n5. the desk afterwards');
await click('[data-action="advance"]', 'Done');
await wait(900);
check('the flow closed', !(await visible('.listing')));
await clickText('.tab', /^Spaces/, 'Spaces tab');
const spaces = (await text('.desk .spaces')) ?? '';
check('the space is on the desk', /Upper Room/.test(spaces), spaces.slice(0, 90));
check('shown as held on this device', /On this device/.test(spaces), spaces.slice(0, 120));
check('the desk kept its head', await visible('.desk__head'));

console.log(`\n${failures ? 'FAILURES' : 'all clear'}: ${checks - failures}/${checks} checks passed`);
console.log(`${apiCalls} calls to steeple were refused during the run`);
if (problems.length) {
  console.log('\nconsole/page errors:');
  for (const problem of [...new Set(problems)]) console.log(`  ${problem}`);
} else {
  console.log('zero console errors');
}

await browser.close();
process.exit(failures || problems.length ? 1 : 0);
