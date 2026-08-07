// ROOM-EDIT HYDRATION PROBE — a fresh browser edits an existing listing.
//
// The venue-detail summary (`GET /manage/venues/{id}`) omits a room's
// description, house rules and the three vocabularies, and until 2026-08-07 the
// editor opened straight over the mirror's fabricated blanks — re-saving then
// wiped the room's optional fields at steeple (PATCH means what it says). The
// fix reads the full room (`GET /manage/rooms/{id}`) and folds it into the
// draft before any PATCH may leave. This probe drives the real thing:
//
//   §1  a browser that has never seen the room opens its editor from the desk
//   §2  the editor shows steeple's words, not blanks (hydration folded)
//   §3  advancing the describe step (the PATCH) wipes nothing at steeple
//
//   node tools/room-edit-probe.mjs "http://localhost:5332/?q=low&world=off"
//
// Needs the dev API on STEEPLE_API (default http://localhost:5200/api/v1) with
// Auth:DevLoginEnabled, `psql` reachable (fixtures.mjs mintVenue does the
// operator's first-listing approve), and the app on the given origin with its
// proxy pointed at that same API. Dev graph or debug build — never production.

import {
  agreeCurrent,
  apiIsUp,
  call,
  closeBrowsers,
  launch,
  mintVenue,
  signInPage,
  stamp,
} from './fixtures.mjs';

const url = process.argv[2] ?? 'http://localhost:5332/?q=low&world=off';

let failed = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'ok   ' : 'FAIL '} ${label}${ok || !extra ? '' : ` — ${extra}`}`);
  if (!ok) failed += 1;
};

const settle = (page) => page.evaluate(() => new Promise((r) => setTimeout(r, 200)));

async function until(page, fn, arg = null, timeout = 30000, what = 'the condition') {
  try {
    await page.waitForFunction(fn, { timeout, polling: 120 }, arg);
  } catch {
    throw new Error(`${what} never came true within ${timeout}ms`);
  }
}

async function press(page, selector) {
  await page.waitForSelector(selector, { timeout: 20000 });
  await settle(page);
  await page.click(selector);
}

if (!(await apiIsUp())) {
  console.log('\nThe steeple API is not answering — this probe needs it.');
  process.exit(1);
}

// The room whose fields are at stake, read back before anything touches it.
const host = await mintVenue({
  email: `edit-${stamp}@example.org`,
  name: 'Edith Editor',
  venueName: `Editable Hall ${stamp}`,
  roomName: `Reading Room ${stamp}`,
});
await agreeCurrent(host.token);
const before = (await call('GET', `/manage/rooms/${host.roomId}`, { token: host.token })).body;
check('§1 the fixture room carries the fields the summary omits',
  before.description.length > 0 && before.houseRules.length > 0 && before.amenities.length > 0);

try {
  const browser = await launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__steepleReady === true, { timeout: 30000 });
  await page.evaluate(() => window.__steeple.roll?.set?.(1));
  await signInPage(page, host.email, host.name);
  await until(page, () => window.__steeple?.session?.isSignedIn?.() === true, null, 30000, 'the sign-in');

  await press(page, '.porchswitch');
  await until(
    page,
    () => window.__steeple.state.mode === 'host' && window.__steeple.state.view === 'desk',
    null, 30000, 'the desk'
  );
  await press(page, '.desk .tab[data-tab="spaces"]');
  await press(page, `button[data-room="${host.roomSlug}"][data-action="edit"]`);
  await page.waitForSelector('#room-description', { timeout: 20000 });

  // §2 — the editor must fill with steeple's words as the read lands.
  await until(
    page,
    (want) => document.querySelector('#room-description')?.value === want,
    before.description, 15000, 'the description hydrating'
  ).catch(() => {});
  const shown = await page.evaluate(() => ({
    description: document.querySelector('#room-description')?.value ?? null,
    rules: document.querySelector('#room-rules')?.value ?? null,
    name: document.querySelector('#room-name')?.value ?? null,
    capacity: document.querySelector('#room-capacity')?.value ?? null,
  }));
  check('§2 the description is steeple\'s, not blank', shown.description === before.description, JSON.stringify(shown.description));
  check('§2 the house rules are steeple\'s', shown.rules === before.houseRules, JSON.stringify(shown.rules));
  check('§2 the name survived the summary', shown.name === host.roomName, JSON.stringify(shown.name));
  check('§2 the capacity is the room\'s', Number(shown.capacity) === before.capacity, String(shown.capacity));

  // §3 — advance the describe step: this is the PATCH an edit sends. One field
  // is really changed first, because a step that changes nothing now sends
  // nothing (2026-08-07: an edit nobody made is still an edit at steeple) — and
  // a PATCH that never leaves would make this section prove nothing.
  await page.click('#room-capacity');
  await page.keyboard.press('End');
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('Backspace');
  await page.keyboard.type('41', { delay: 8 });
  await press(page, '[data-action="advance"]');
  await until(page, () => !document.querySelector('#room-description'), null, 20000, 'the step advancing');
  await settle(page);

  const after = (await call('GET', `/manage/rooms/${host.roomId}`, { token: host.token })).body;
  const same = (a, b) => JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...(b ?? [])].sort());
  check('§3 the description survived the save', after.description === before.description, JSON.stringify(after.description));
  check('§3 the house rules survived', after.houseRules === before.houseRules, JSON.stringify(after.houseRules));
  check('§3 the amenities survived', same(after.amenities, before.amenities), JSON.stringify(after.amenities));
  check('§3 the accessibility features survived', same(after.accessibility, before.accessibility), JSON.stringify(after.accessibility));
  check('§3 the activities survived', same(after.activities, before.activities), JSON.stringify(after.activities));
  check('§3 the room is still published', after.status === 'published', after.status);
  check('§3 and the edit itself landed — the PATCH really left', after.capacity === 41, String(after.capacity));
} finally {
  await closeBrowsers();
}

console.log(failed ? `\n${failed} failed` : '\nall good');
process.exit(failed ? 1 : 0);
