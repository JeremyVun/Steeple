// THE HOST'S SIDE, AS A PLACE YOU ENTER AND LEAVE — driven with real mouse and
// keyboard, never the debug API.
//
//   node tools/host-test.mjs "http://localhost:5313/?q=low"
//   node tools/host-test.mjs "http://localhost:5313/?q=low&desk=ledger" --shots hsc-ledger
//
// Re-baselined 2026-08-06 for v2_migration Phase 3.6 item 2. Every section of
// this suite used to enter through a desk opened by the porch switch with **no
// session at all**, and read the demo fixture's letters at a seeded church.
// That desk died with D4: hosting needs a session, and a desk exists only for
// the venues `GET /manage/venues` names. What replaced each part:
//
//   · the correspondence itself (ask, counter-offer, decide) → `correspondence-test.mjs`,
//     real wire traffic between two people in two browsers
//   · the listing flow, end to end → `host-publish-test.mjs`
//   · the flow's own fields and validation → `host-input-test.mjs`
//   · the session boundary → `host-session-test.mjs`
//   · the desk's plumbing (porch switch over an open desk, board ↔ ledger)
//     → `input-test.mjs` §11b–§12
//
// What is left is what was only ever this suite's, and it is worth keeping:
// **hosting as a place — the way in, the way back out, and the promise that
// nothing of the host's is left lying over the village afterwards.** A closed
// modal overlay that intercepted every pointer event in the experience is the
// bug this file was written for, and it is not caught by any of the suites
// above: they never leave hosting.
//
// Needs: the API (STEEPLE_API, default http://localhost:5200/api/v1) with
// Auth:DevLoginEnabled and payments.enabled, this app on the given origin with
// its proxy pointed at that same API, and `psql` reachable at the dev database
// (the fixture's first listing needs the operator's approve — tools/fixtures.mjs).
// World-ON is the documented state: the way out of hosting is the village.

import {
  agreeCurrent,
  apiIsUp,
  apply,
  closeBrowsers,
  launch,
  mintGuest,
  mintVenue,
  signInPage,
  stamp,
} from './fixtures.mjs';

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

const url = process.argv[2] ?? 'http://localhost:5313/?q=low';
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

if (!(await apiIsUp())) {
  console.log('\nThe steeple API is not answering — this suite needs it to be somebody.');
  process.exit(2);
}

// A host who keeps a venue, in **manual** mode with one request waiting on it:
// a letter to open is what §3's Esc paths are about, and only a manual venue
// keeps a request as a request.
console.log('\nfixture');
const host = await mintVenue({
  email: `host-place-${stamp}@example.org`,
  name: 'Ruth Callaghan',
  venueName: `Saint Bride Hall ${stamp}`,
  roomName: 'Long Room',
  bookingMode: 'manual',
});
check(`fixture: ${host.venueName} is kept, in ${host.bookingMode} mode`, host.bookingMode === 'manual' && host.listingStatus === 200,
  `${host.bookingMode} · listing ${host.listingStatus}`);
// The host agrees up front, or the P4 ask opens over the porch switch and the
// press that should enter hosting dismisses it — which signs the account out.
await agreeCurrent(host.token);
const guest = await mintGuest({ email: `host-place-guest-${stamp}@example.org`, name: 'Nadia Prosser' });
const request = await apply(guest, host);
check('fixture: a request is waiting on it', request?.status === 'pending', request?.status);

const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
page.on('console', (msg) => {
  if (msg.type() !== 'error') return;
  const text = msg.text();
  if (text.includes('GL Driver Message') || text.includes('GPU stall')) return;
  // A shared dev DB can reference media stored in another worktree; tiles
  // come from the open internet.
  if (/Failed to load resource|net::ERR_/.test(text)) return;
  problems.push(`[console.error] ${text}`);
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const state = (key) => page.evaluate(`__steeple.state.${key}`);

async function shot(name) {
  if (!shotPrefix) return;
  await page.screenshot({ path: `/tmp/${shotPrefix}-${name}.png` });
  console.log(`        (shot /tmp/${shotPrefix}-${name}.png)`);
}

async function ready(target = url) {
  await page.goto(target, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__steepleReady === true', { timeout: 25000 });
  await wait(2200);
}

/** Real mouse click on a selector, reporting what is actually topmost there. */
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
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const top = await page.evaluate(
    (px, py) => {
      const node = document.elementsFromPoint(px, py)[0];
      return node ? `${node.tagName.toLowerCase()}.${node.className || ''}`.slice(0, 60) : '?';
    },
    x,
    y
  );
  await page.mouse.click(x, y);
  await wait(700);
  check(`click ${label}`, true, `topmost: ${top}`);
  return true;
}

/** Click a button by its text inside a scope. */
async function clickText(selector, pattern, label) {
  for (const handle of await page.$$(selector)) {
    const text = (await handle.evaluate((n) => n.textContent)).trim();
    if (!pattern.test(text)) continue;
    await handle.evaluate((n) => n.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await wait(120);
    const box = await handle.boundingBox();
    if (!box) continue;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await wait(700);
    check(`click ${label}`, true, JSON.stringify(text.slice(0, 40)));
    return true;
  }
  check(`click ${label}`, false, `no match for ${pattern}`);
  return false;
}

const text = (selector) =>
  page.evaluate((s) => document.querySelector(s)?.textContent?.trim() ?? null, selector);

const visible = (selector) =>
  page.evaluate((s) => {
    const node = document.querySelector(s);
    if (!node) return false;
    return node.checkVisibility ? node.checkVisibility() : node.offsetParent !== null;
  }, selector);

console.log(`\n── hosting, as a place · ${url} ──`);
await ready();
await signInPage(page, host.email, host.name);
await page.waitForFunction('!!__steeple.session.currentUser()', { timeout: 25000 });

// ── 1. the way in: down off the title page, then the porch switch ──────────
console.log('\n1. the way in');
await clickText('.arrival__cta', /Find a space/, 'arrival CTA');
// Headless GL runs app-time several times slow, so the roll takes many times
// its own duration in wall clock. Wait on the roll itself: the porch the next
// click needs is not on the page until the surface has landed.
await page.waitForFunction('__steeple.state.roll >= 0.999', { timeout: 40000 }).catch(() => {});
await wait(800);
check('porch switch reads as an offer', (await text('.porchswitch')) === 'Host a space', await text('.porchswitch'));
await click('.porchswitch', 'the mode switch');
await page.waitForFunction('!!document.querySelector(".desk")', { timeout: 30000 }).catch(() => {});
await wait(1200);
check('mode is host', (await state('mode')) === 'host', await state('mode'));
check('view is the host view', (await state('view')) === 'desk', await state('view'));
check('the address deep-links it', /^\/desk(\/|$)/.test(await page.evaluate('location.pathname')), await page.evaluate('location.pathname'));
check('documentElement carries data-mode', (await page.evaluate('document.documentElement.dataset.mode')) === 'host');
check('the switch offers the way back', (await text('.porchswitch')) === 'Back to browsing', await text('.porchswitch'));

// ── 2. the desk is this host's, by server truth ────────────────────────────
console.log('\n2. whose desk it is');
check('the desk names the venue steeple says is theirs', new RegExp(host.venueName).test((await text('.desk .desk__head')) ?? ''), await text('.desk .desk__head'));
check('and offers no chooser full of churches nobody manages', await page.evaluate('!document.querySelector("#desk-venue")'));
const said = await text('#a11y');
check('the live region says what is waiting, out loud', /\w/.test(said ?? ''), `${(said ?? '').slice(0, 90)}…`);
await shot('desk');

// ── 3. Esc, in the host lens ───────────────────────────────────────────────
//
// Esc goes back up one level and never rolls: a host reading a request lands on
// their own board, and from the board lands in the village — never on the title
// page, which is the roll's job and the roll's alone.
console.log('\n3. Esc paths');
await clickText('.tab', /^Requests/, 'Requests tab');
await click('[data-application]', 'the request waiting');
check('the request opens in the host lens', (await state('view')) === 'letter' && (await state('mode')) === 'host', `${await state('view')} / ${await state('mode')}`);
check('the schedule ribbon is drawn', (await page.$$('.letterpage .lane')).length > 0, `${(await page.$$('.letterpage .lane')).length} lanes`);
await shot('letter');

// The ask drawer became the thread's reply box (no drawer); the decline drawer
// is the Esc subject now.
await click('[data-action="decline"]', 'Decline');
check('the drawer opens', await visible('#decline-note'));
await page.keyboard.press('Escape');
await wait(700);
check('Esc closed the drawer, not the request', (await state('view')) === 'letter', await state('view'));
check('and the drawer is gone', !(await visible('#decline-note')));
await page.keyboard.press('Escape');
await wait(1600);
check('Esc again returns to the board', (await state('view')) === 'desk', await state('view'));
check('...and never to the title page', (await state('roll')) === 1, String(await state('roll')));

// ── 4. the way out, and nothing left lying over the village ────────────────
console.log('\n4. the way out — elementsFromPoint audit');
await page.keyboard.press('Escape');
await wait(1800);
check('Esc leaves hosting for the village', (await state('view')) === 'village', await state('view'));
check('and the lens goes back to guest', (await state('mode')) === 'guest', await state('mode'));
const audit = await page.evaluate(() => {
  const points = [
    [720, 450],
    [200, 300],
    [1200, 700],
    [400, 820],
    [1100, 160],
  ];
  // The host's own surfaces, by exact class: the map's results list is
  // `dm-listing`, which a substring match on "listing" wrongly accused.
  const HOST = new Set(['hostdesk', 'listing', 'listing__layer', 'letterpage', 'desk', 'seal']);
  const offenders = [];
  for (const [x, y] of points) {
    for (const node of document.elementsFromPoint(x, y)) {
      const classes = [...node.classList];
      if (classes.some((one) => HOST.has(one))) {
        offenders.push(`${x},${y} → ${node.tagName.toLowerCase()}.${node.className}`);
      }
    }
  }
  return { offenders, centre: document.elementsFromPoint(720, 450).map((n) => n.tagName).join('>') };
});
check('no closed host surface intercepts the scene', audit.offenders.length === 0, audit.offenders.join(' | '));
// Since the map era the map surface sits over the world; what matters here is
// that the scene is reachable and nothing of the host's is in front of it.
check('the world canvas is still in the stack at centre', audit.centre.includes('CANVAS'), audit.centre);
await shot('village-after');

// ── 5. and hosting is reachable again, with its own clicks landing on it ───
console.log('\n5. back in again');
await click('.porchswitch', 'back to hosting');
await page.waitForFunction('!!document.querySelector(".desk")', { timeout: 30000 }).catch(() => {});
await wait(1200);
check('re-entering hosting opens the desk', (await state('view')) === 'desk', await state('view'));
await clickText('.tab', /^Requests/, 'Requests tab');
const deskTop = await page.evaluate(() => {
  const card = document.querySelector('[data-application]');
  if (!card) return null;
  const box = card.getBoundingClientRect();
  const node = document.elementsFromPoint(box.x + box.width / 2, box.y + box.height / 2)[0];
  return `${node.tagName.toLowerCase()}.${node.className}`;
});
check('a request card is the topmost thing at its own centre', deskTop !== null && /card|row|record/.test(deskTop), String(deskTop));

console.log(`\n${failures ? 'FAILURES' : 'all clear'}: ${checks - failures}/${checks} checks passed`);
if (problems.length) {
  console.log('\nconsole/page errors:');
  for (const problem of [...new Set(problems)]) console.log(`  ${problem}`);
} else {
  console.log('zero console errors');
}

await closeBrowsers();
process.exit(failures || problems.length ? 1 : 0);
