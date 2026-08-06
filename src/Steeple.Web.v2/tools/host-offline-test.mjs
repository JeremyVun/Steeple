// A SIGNED-IN HOST LOSES STEEPLE MID-FLOW (CONTRACT6 §3.7, second half).
//
//   node tools/host-offline-test.mjs "http://localhost:5332/?q=low&world=off"
//
// Rewritten 2026-08-06 for v2_migration Phase 3.6 item 4. What this suite used
// to drive — a stranger with no session writing a whole listing while steeple
// was away — is not a promise the product makes any more (P2.5 owner decision 1,
// 2026-08-05): hosting entry needs a session, and a desk exists only for the
// venues `GET /manage/venues` names. The old order is deliberately not restored.
//
// What is still true, and is the subject here: a host who is signed in and
// keeps a venue can lose steeple **in the middle of adding a space**, and every
// sentence they are shown afterwards has to be the truth. Nothing may be
// dressed up as a refusal, nothing may claim the space is live, and the words
// must not read like a rehearsal. The one thing the product does promise is
// that the writing is not thrown away: it is held here, said in those words,
// and marked so the desk says them too.
//
//   §1  the desk is real before anything is cut — it is this host's own venue
//   §2  the wire goes at Describe, and the host is told plainly
//   §3  hours painted with nobody to tell
//   §4  publish with nowhere to publish to: "Kept here", never "sent for review"
//   §5  steeple, asked afterwards, has never heard of the space
//   §6  the desk goes on working, and says On this device
//
// Needs: the API (STEEPLE_API, default http://localhost:5200/api/v1) with
// Auth:DevLoginEnabled, this app on the given origin with its proxy pointed at
// that same API, and `psql` reachable at the dev database (the fixture's venue
// needs the operator's first-listing approve — tools/fixtures.mjs).
// World-OFF is the documented state: this suite is about words, not village.

import { API, apiIsUp, call, closeBrowsers, launch, mintVenue, signInPage, stamp } from './fixtures.mjs';
import { writeRoomPhoto } from './host-photo.mjs';

const url = process.argv[2] ?? 'http://localhost:5332/?q=low&world=off';
const shotPrefix = process.argv.includes('--shots')
  ? process.argv[process.argv.indexOf('--shots') + 1]
  : null;
const PHOTO = writeRoomPhoto(`/tmp/steeple-offline-room-${stamp}.png`);
const newSpace = `Upper Room ${stamp}`;

let checks = 0;
let failures = 0;
const problems = [];

function check(label, ok, detail = '') {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
}

const up = await apiIsUp();
if (!up) {
  console.log(`\nThe steeple API is not answering at ${API} — this suite needs it to build its host.`);
  process.exit(2);
}

// A top-level-await script has no `finally` around it; this is the finally.
async function lastWords(error) {
  await closeBrowsers();
  console.log(`\nthe run stopped: ${error?.message ?? error}`);
  console.log(`${checks - failures}/${checks} checks passed before it stopped`);
  process.exit(1);
}
process.on('uncaughtException', lastWords);
process.on('unhandledRejection', lastWords);

console.log('\nfixture');
const host = await mintVenue({
  email: `host-off-${stamp}@example.org`,
  name: 'Ruth Ellery',
  venueName: `Riverside Rooms ${stamp}`,
  roomName: 'Long Room',
});
check(`fixture: ${host.venueName} is kept by somebody`, host.listingStatus === 200, `status ${host.listingStatus}`);

const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
page.on('console', (msg) => {
  if (msg.type() !== 'error') return;
  const said = msg.text();
  if (said.includes('GL Driver Message') || said.includes('GPU stall')) return;
  // A refused request logs itself in the console; that is the browser talking
  // about the cut this suite made, not the app failing. So does a photograph
  // whose absolute URL points at an API port nobody is listening on any more.
  if (/Failed to (load resource|fetch)|net::ERR/.test(said)) return;
  problems.push(`[console.error] ${said}`);
});

// The cut, held open until the moment the story needs it. Everything before it
// is a host with a working steeple, because that is the only way to be a host.
let cut = false;
let refused = 0;
await page.setRequestInterception(true);
page.on('request', (request) => {
  if (cut && request.url().includes('/api/v1')) {
    refused += 1;
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
const disabled = (selector) => page.$eval(selector, (n) => n.disabled).catch(() => null);

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

// ── 1. a host with a desk, while steeple is still there ───────────────────
console.log(`\n── a host loses steeple mid-flow · ${url} ──`);
console.log('\n1. the desk, before anything is cut');
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__steepleReady === true', { timeout: 30000 });
await wait(1500);
// The desk is a sheet over the browse surface, and no sheet is on the page until
// the roll has landed: with `?world=off` the page boots there, and with a
// village behind it the harness lands it without the tween.
await page.evaluate('__steeple.roll.set(1)');
await wait(300);
await signInPage(page, host.email, host.name);
await page.waitForFunction('!!__steeple.session.currentUser()', { timeout: 25000 });
await page.evaluate('__steeple.setMode("host")');
await page.waitForFunction('!!document.querySelector(".desk")', { timeout: 30000 }).catch(() => {});
await wait(1600);
check('the desk opened for a host who keeps a venue', await visible('.desk'));
check('and it is this host’s own venue', new RegExp(host.venueName).test((await text('.desk .desk__head')) ?? ''), await text('.desk .desk__head'));
await clickText('.tab', /^Spaces/, 'Spaces tab');
check('with the space steeple holds on it', new RegExp(host.roomName).test((await text('.desk .spaces')) ?? ''), (await text('.desk .spaces'))?.slice(0, 90));
await shot('01-desk');

// ── 2. the wire goes, with a space half described ─────────────────────────
console.log('\n2. describing a space, and losing steeple while doing it');
await click('[data-action="add-space"]', 'Add a space');
await wait(1200);
check('the flow opens on Describe, because the venue is settled', (await text('.steps__step.is-on')) === '1Describe', await text('.steps__step.is-on'));
await type('#room-name', newSpace, { clear: true });
await type('#room-description', 'A quiet room with tall windows over the river and chairs for thirty.');
await type('#room-capacity', '30', { clear: true });
await type('#room-price', '24', { clear: true });
await (await page.$('#room-photo')).uploadFile(PHOTO);
await wait(500);
check('the photograph shows as chosen', await visible('.shotpick__thumb'));

// Everything written; now nothing answers.
cut = true;
await click('[data-action="advance"]', 'Set availability');
await wait(2500);
check('steeple was reached for, and did not answer', refused > 0, `${refused} refused calls`);
const notice = (await text('.notice__text')) ?? '';
check('the host is told steeple could not be reached', /could not be reached/i.test(notice), notice);
check('and is not told they did something wrong', !/invalid|error|failed/i.test(notice), notice);
check('nor sold a rehearsal', !/(demo|sample|pretend|for now)/i.test(notice), notice);
check('and the flow did not throw them out of it', await visible('.listing'));
await shot('02-describe-offline');

// ── 3. the hours, painted with nobody to tell ─────────────────────────────
console.log('\n3. the hours, with nobody to tell');
check('Availability is next anyway — the writing is not held hostage', (await text('.steps__step.is-on')) === '2Availability', await text('.steps__step.is-on'));
await clickText('.paint__quick .linkish', /Open every day/, 'the standard week');
await wait(600);
const local = (await store('placedVenues()')).find((v) => v.id === host.venueSlug);
const draftRoom = local?.rooms?.find((r) => r.name === newSpace);
check('the space is kept in this browser’s own record', Boolean(draftRoom), JSON.stringify(local?.rooms?.map((r) => r.name)));
check('with the hours painted', (await store(`openHoursFor('${host.venueSlug}','${draftRoom?.id}')`)).length === 7);
await click('[data-action="advance"]', 'Review and publish');
await wait(2000);
check('Publish is next', (await text('.steps__step.is-on')) === '3Publish', await text('.steps__step.is-on'));

// ── 4. publishing into a service that is not there ────────────────────────
console.log('\n4. publishing with nowhere to publish to');
check('publishing is offered — the local record can hold it', (await disabled('[data-action="advance"]')) === false);
await shot('03-review-offline');
await click('[data-action="advance"]', 'Publish this space');
await wait(3500);
await shot('04-kept');
const kept = (await text('.guide')) ?? '';
check('the host is told it is held here', /kept here|held on this device/i.test(kept), kept.slice(0, 120));
check('and told why', /could not be reached/i.test(kept), kept.slice(0, 120));
check('and never told steeple has it', !/(sent for review|with a moderator)/i.test(kept), kept.slice(0, 120));
check('nor that it is live', !/(is published|on the map now)/i.test(kept), kept.slice(0, 120));
check('no exclamation marks', !/!/.test((await text('.listing')) ?? ''));
check('no demo-flavoured words', !/(demo|sample|pretend|dummy|fake)/i.test((await text('.listing')) ?? ''));
const room = await store(`effectiveRoom('${host.venueSlug}','${draftRoom?.id}')`);
check('the local record holds the space', room?.name === newSpace, room?.name);
check('it is published in this browser’s own record', room?.status === 'published', room?.status);
check('and marked as not yet sent', room?.keptLocally === true, JSON.stringify(room?.keptLocally));
check('no publish request was invented', !room?.publishRequestedAt, JSON.stringify(room?.publishRequestedAt));

// ── 5. and steeple, asked itself, has never heard of it ───────────────────
//
// The one claim a page cannot make on its own behalf. A listing "kept here" is
// only honest if it really is only here.
console.log('\n5. steeple’s own answer, from outside the browser');
const atSteeple = await call('GET', `/manage/venues/${host.venueId}`, { token: host.token });
const names = atSteeple.body?.rooms?.map((r) => r.name) ?? [];
check('steeple has never heard of the space', !names.includes(newSpace), JSON.stringify(names));
check('and still holds only the one it was given', names.length === 1, JSON.stringify(names));

// ── 6. the desk goes on working ───────────────────────────────────────────
console.log('\n6. the desk afterwards');
await click('[data-action="advance"]', 'Done');
await wait(1200);
check('the flow closed', !(await visible('.listing')));
check('the desk kept its head', await visible('.desk__head'));
await clickText('.tab', /^Spaces/, 'Spaces tab');
const spaces = (await text('.desk .spaces')) ?? '';
check('the space is on the desk', new RegExp(newSpace).test(spaces), spaces.slice(0, 120));
check('shown as held on this device', /On this device/.test(spaces), spaces.slice(0, 160));
await shot('05-desk-after');

console.log(`\n${failures ? 'FAILURES' : 'all clear'}: ${checks - failures}/${checks} checks passed`);
console.log(`${refused} calls to steeple were refused during the run`);
if (problems.length) {
  console.log('\nconsole/page errors:');
  for (const problem of [...new Set(problems)]) console.log(`  ${problem}`);
} else {
  console.log('zero console errors');
}

await closeBrowsers();
process.exit(failures || problems.length ? 1 : 0);
