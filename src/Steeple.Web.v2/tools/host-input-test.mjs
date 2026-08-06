// THE HOSTING PATH UNDER ATTACK (CONTRACT6 §4).
//
// Real keyboard, hostile input: empty, whitespace, enormous, negative,
// non-numeric, emoji, script tags; boundary capacities and prices; a date
// already gone; a publish pressed twice. Every refusal must be either the
// flow's own — the way forward simply not offered, with a line saying what is
// missing — or the service's own words shown verbatim. Never a swallowed
// error, never a wall on a step that did not ask the question, never a second
// write, and never a sheet a host cannot reach the buttons of.
//
// Needs the API on localhost:5200 and the app on the given origin (vite proxies
// /api/v1). Like host-publish-test, each run mints its own venues under its own
// dev account, so runs never collide and no global count is asserted.
//
//   node tools/host-input-test.mjs "http://localhost:5333/?q=low&world=off"
//   node tools/host-input-test.mjs "http://localhost:5333/?q=low" --shots hv

import puppeteer from 'puppeteer';
import { writeRoomPhoto } from './host-photo.mjs';

const url = process.argv[2] ?? 'http://localhost:5333/?q=low&world=off';
const shotPrefix = process.argv.includes('--shots')
  ? process.argv[process.argv.indexOf('--shots') + 1]
  : null;
const API = 'http://localhost:5200/api/v1';
const PHOTO = writeRoomPhoto('/tmp/w7v-room.png');

const stamp = Date.now().toString(36);
const venueName = `Bell Hall ${stamp}`;
const roomName = `Side Room ${stamp}`;
const hostEmail = `hostile-${stamp}@example.org`;

let checks = 0;
let failures = 0;
const problems = [];

function check(label, ok, detail = '') {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
}

const up = await fetch(`${API}/geofence`).then((r) => r.ok).catch(() => false);
if (!up) {
  console.log('\nThe steeple API is not answering on localhost:5200 — this test needs it.');
  process.exit(2);
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
  const text = msg.text();
  if (text.includes('GL Driver Message') || text.includes('GPU stall')) return;
  // A refused write logs itself in the console; that is the browser reporting
  // the status line, not the page failing.
  if (/Failed to load resource/.test(text)) return;
  problems.push(`[console.error] ${text}`);
});

// Every write the page makes, so a double-press can be counted rather than
// guessed at.
const writes = [];
page.on('request', (r) => {
  if (r.method() === 'GET' || !r.url().includes('/api/v1/')) return;
  writes.push(`${r.method()} ${new URL(r.url()).pathname}`);
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const store = (expression) => page.evaluate(`__steeple.store.${expression}`);
const text = (selector) =>
  page.evaluate((s) => document.querySelector(s)?.textContent?.trim() ?? null, selector);
const noticeText = () => text('.listing .notice__text');
const hint = () => text('.listing__hint');
const disabled = (selector) => page.$eval(selector, (n) => n.disabled).catch(() => null);
const onStep = () => text('.steps__step.is-on');
const value = (selector) => page.$eval(selector, (n) => n.value);

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
    return true;
  }
  check(`click ${label}`, false, `no match for ${pattern}`);
  return false;
}

/** Type into a field the way a person does — maxlength included. */
async function type(selector, said, { clear = false } = {}) {
  await page.$eval(selector, (n) => n.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.click(selector);
  if (clear) {
    await page.keyboard.press('End');
    const length = await page.$eval(selector, (n) => n.value.length);
    for (let i = 0; i < length; i += 1) await page.keyboard.press('Backspace');
  }
  if (said) await page.keyboard.type(said, { delay: 1 });
  await wait(120);
}

/**
 * Set a field's value outright: what a paste, an autofill or a record written
 * by an older build puts there, with no keystroke and no maxlength in the way.
 */
async function put(selector, said) {
  await page.$eval(
    selector,
    (n, v) => {
      n.value = v;
      n.dispatchEvent(new Event('input', { bubbles: true }));
    },
    said
  );
  await wait(150);
}

// The access token lives in the session module's memory and the refresh token in
// an httpOnly cookie — neither is in localStorage any more. `withAccess` is the
// public way to be handed one, which is what the app itself uses.
const bearer = () => page.evaluate('__steeple.session.withAccess((token) => Promise.resolve(token))');

async function api(path, token) {
  const response = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${token}` } });
  return response.ok ? response.json() : { status: response.status };
}

/** Nothing a host typed may push the sheet, or its buttons, off the screen. */
async function sheetIsReachable(label) {
  const reading = await page.evaluate(() => {
    const sheet = document.querySelector('.listing');
    const button = document.querySelector('[data-action="advance"]');
    const box = button.getBoundingClientRect();
    const topmost = document.elementsFromPoint(box.x + box.width / 2, box.y + box.height / 2)[0];
    return {
      sheetRight: sheet.getBoundingClientRect().right,
      window: window.innerWidth,
      buttonRight: box.right,
      reaches: topmost === button || button.contains(topmost),
    };
  });
  check(
    `${label}: the sheet stays inside the window`,
    reading.sheetRight <= reading.window + 1,
    `sheet ends at ${Math.round(reading.sheetRight)} of ${reading.window}`
  );
  check(
    `${label}: and the button under the pointer is the button`,
    reading.reaches,
    `button ends at ${Math.round(reading.buttonRight)}`
  );
}

console.log(`\n── the hosting path under attack · ${url} ──`);
await page.goto(url, { waitUntil: 'networkidle0' });
await page.waitForFunction('window.__steepleReady === true', { timeout: 25000 });
await wait(1500);
await store('resetDemo()');
await page.evaluate('__steeple.roll.set(1)');
await wait(300);
await page.evaluate('localStorage.removeItem("steeple-village-session")');

// Re-baselined for v2_migration Phase 2 (D4). The flow used to be reached by
// pressing "List a space" on a desk that opened for anybody. There is no desk
// for somebody who keeps no venue now — and a person in that position is taken
// *to this flow* instead of to an empty board, which is the way in this suite
// should be attacking. So: be somebody, ask for hosting, and the flow opens
// itself.
await page.evaluate(
  `__steeple.session.signIn({email:'host-input-${Date.now().toString(36)}@demo.steeple.test',displayName:'Ada Newcomer'})`
);
await page.waitForFunction('!!__steeple.session.currentUser()', { timeout: 25000 });
await page.evaluate('__steeple.setMode("host")');
await page
  .waitForFunction('!!document.querySelector(".listing.is-open, .listing__layer")', { timeout: 30000 })
  .catch(() => {});
await wait(1400);

// ── 1. Place: nothing, whitespace, and markup ─────────────────────────────
console.log('\n1. Place — nothing, whitespace, and a script tag');
check('a person who keeps no venue is taken to the flow that would give them one', (await onStep()) === '1Place');
check('an empty draft cannot continue', (await disabled('[data-action="advance"]')) === true);

await type('#place-name', '   ');
await type('#place-description', '   ');
await type('#place-address', '        ');
await type('#place-suburb', '   ');
await type('#place-postcode', '     ');
check('whitespace is not an address', (await disabled('[data-action="advance"]')) === true, await hint());

const XSS = '<script>window.__pwned = true</script>';
await type('#place-name', `${XSS} ${venueName}`, { clear: true });
await type('#place-description', 'A stone hall behind the church, used by the parish.', { clear: true });
await type('#place-address', '18 Church Street', { clear: true });
await type('#place-suburb', 'Vienna', { clear: true });
await type('#place-postcode', '22180', { clear: true });
check('markup does not run', (await page.evaluate('window.__pwned')) === undefined);
check('and nothing was injected into the sheet', (await page.$$('.listing script')).length === 0);
await shot('01-place');
await click('[data-action="advance"]', 'Continue');
check('Verify is next', (await onStep()) === '2Verify', await onStep());

// ── 2. Verify ─────────────────────────────────────────────────────────────
//
// Re-baselined for v2_migration Phase 2. This step used to be where a host
// signed in, because the flow could be reached by a stranger. It cannot be
// reached by a stranger any more (D4: no desk, and no way to hosting, without a
// session), so by the time anybody stands here they are already somebody — the
// step shows them who, and asks them to carry on rather than to sign in again.
//
// ⚠ Note for whoever owns the flow next: the signed-*out* half of this step is
// now unreachable in the product's own order. Either the flow should be openable
// before signing in (and this step is the gate), or the step should be dropped
// and the flow entered already-identified. That is a product call, not a
// harness one — it is written up in `docs/backlog/v2_migration/build_plan.md`.
console.log('\n2. Verify — the session it will be written under');
check('the step does not ask a signed-in host to sign in again', (await page.$('#identity-email')) === null);
check('it shows who the listing will belong to', (await page.$('.listing .identity .verified')) !== null);
await clickText('.listing .identity__actions .pill--primary', /^Continue as/, 'carry on as this person');
await wait(2600);
check('Describe is next', (await onStep()) === '3Describe', await onStep());
const token = await bearer();
const held = await api('/manage/venues', token);
const mine = held.find?.((v) => v.name.includes(venueName));
check('steeple stored the name as typed, markup and all', Boolean(mine), JSON.stringify(held).slice(0, 100));
check('and it is text, not markup', mine?.name?.startsWith('<script>') === true, mine?.name?.slice(0, 30));
const venueId = mine?.id;

// ── 3. Describe: the numbers the step does ask for, and the one it does not ─
console.log('\n3. Describe — capacity is asked for, a price is not');
await type('#room-name', roomName, { clear: true });
await type('#room-description', 'A long room with a wooden floor and chairs for sixty.', { clear: true });

await type('#room-capacity', '0', { clear: true });
check('nobody fits in a room for nobody', (await disabled('[data-action="advance"]')) === true);
await type('#room-capacity', '-4', { clear: true });
check('a negative capacity is no capacity', (await disabled('[data-action="advance"]')) === true);
await type('#room-capacity', 'sixty', { clear: true });
check(
  'letters are not a capacity',
  (await disabled('[data-action="advance"]')) === true,
  `the field reads ${JSON.stringify(await value('#room-capacity'))}`
);
await type('#room-capacity', '2.5', { clear: true });
check('half a seat is not a seat', (await disabled('[data-action="advance"]')) === true, await hint());
check('and the host is told why', (await hint()) === 'Seats are counted in whole numbers.', await hint());
await type('#room-capacity', '60', { clear: true });

const chooser = await page.$('#room-photo');
await chooser.uploadFile(PHOTO);
await wait(500);

// The price belongs to Publish, which says so. Describe must not turn the
// service's "set an hourly price" into a wall on a step that never asked.
await type('#room-price', '', { clear: true });
check('an unpriced draft may leave Describe', (await disabled('[data-action="advance"]')) === false);
await click('[data-action="advance"]', 'Set availability, unpriced');
await wait(2600);
check(
  'and is not stranded there by the service',
  (await onStep()) === '4Availability',
  `${await onStep()} · ${await noticeText()}`
);
const beforePrice = await api(`/manage/venues/${venueId}`, token);
check('steeple was told nothing it would refuse', (beforePrice.rooms ?? []).length === 0, `${beforePrice.rooms?.length} rooms`);

// The price, where the flow says it belongs: Publish asks for it, names it as
// what is missing, and walks the host back to the field.
await clickText('.paint__quick .linkish', /Open every day/, 'the standard week');
await wait(500);
await click('[data-action="advance"]', 'Review and publish, unpriced');
await wait(2600);
check('an unpriced draft reaches Publish', (await onStep()) === '5Publish', await onStep());
check('but publishing is not offered', (await disabled('[data-action="advance"]')) === true);
check('Publish names the price as what is missing', /hourly price/.test((await text('.guide')) ?? ''), (await text('.guide'))?.slice(0, 90));
check('and offers the way to it', Boolean(await page.$('[data-action="fix-price"]')));
await click('[data-action="fix-price"]', 'Set an hourly price');
await wait(600);
check('which is Describe', (await onStep()) === '3Describe', await onStep());
await type('#room-price', '0', { clear: true });
check('zero reads as Free', (await text('.listing .price--free')) === 'Free');
await type('#room-price', '-5', { clear: true });
check('minus five does not read as Free', (await text('.listing .price--free')) === null, await text('.listing .price--sm'));
await type('#room-price', '30', { clear: true });
await click('[data-action="advance"]', 'Set availability');
await wait(3000);
check('a priced room advances', (await onStep()) === '4Availability', await onStep());
const withRoom = await api(`/manage/venues/${venueId}`, token);
const remoteRoom = withRoom.rooms?.[0];
check('and now steeple holds it', remoteRoom?.name === roomName, JSON.stringify(remoteRoom?.name));
check('with the price it was finally given', Number(remoteRoom?.pricePerHour) === 30, String(remoteRoom?.pricePerHour));

// ── 4. Describe under attack: the boundaries, room already at steeple ──────
console.log('\n4. Describe — the boundaries, on a room steeple already holds');
await clickText('.steps__step', /Describe/, 'back to Describe');
await wait(600);

async function refused(label, field, said) {
  await type(field, said, { clear: true });
  await wait(150);
  if ((await disabled('[data-action="advance"]')) === true) {
    check(`${label}: the way forward is withheld`, true, await hint());
    return;
  }
  await click('[data-action="advance"]', `advance with ${label}`);
  await wait(2800);
  const step = await onStep();
  const said2 = (await noticeText()) ?? '';
  check(`${label}: the step does not move on`, step === '3Describe', step);
  check(`${label}: and the refusal is a sentence, not a shrug`, Boolean(said2) && said2 !== 'Steeple could not accept that.', said2.slice(0, 70));
}

await refused('a capacity of 10001', '#room-capacity', '10001');
check('the service’s own limit is quoted', /between 1 and 10,000/.test((await noticeText()) ?? ''), await noticeText());
await type('#room-capacity', '60', { clear: true });

await refused('a price of 999999999', '#room-price', '999999999');
check('the service’s own range is quoted', /out of range/.test((await noticeText()) ?? ''), await noticeText());

// A number no decimal can hold never reaches the service's validation: the
// answer names the field and nothing else, and the host must still be told
// which field it was.
await refused('a price of 1e30', '#room-price', '1e30');
check('the unreadable field is named', /the price/.test((await noticeText()) ?? ''), await noticeText());
await type('#room-price', '30', { clear: true });

await put('#room-description', 'x'.repeat(5000));
await refused('a 5000-character description', '#room-name', roomName);
check('the service’s own limit is quoted', /4000 characters/.test((await noticeText()) ?? ''), await noticeText());
await put('#room-description', 'A long room with a wooden floor and chairs for sixty.');
await sheetIsReachable('after 5000 characters of description');
await shot('04-boundaries');

await click('[data-action="advance"]', 'Set availability');
await wait(2800);
check('and a sound room still advances', (await onStep()) === '4Availability', await onStep());

// ── 5. Availability: dates and reasons that do not belong ─────────────────
console.log('\n5. Availability — a day gone, a day twice, a reason nobody reads');
await clickText('.paint__quick .linkish', /Open every day/, 'the standard week');
await wait(500);
const venueKey = await store('hostVenueId()');
const blackouts = () => store(`blackoutsFor('${venueKey}','main-space')`);

const setDate = (said) => put('#blackout-date', said);
const today = new Date().toISOString().slice(0, 10);
const ahead = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

await setDate('');
await click('[data-action="add-blackout"]', 'Add closed day with no date');
check('an empty date sets nothing aside', (await blackouts()).length === 0);

await setDate(ahead(-30));
await type('#blackout-reason', 'Last month', { clear: true });
await click('[data-action="add-blackout"]', 'Add a closed day that has gone');
check('a day already gone is not set aside', (await blackouts()).length === 0, JSON.stringify(await blackouts()));

await setDate(ahead(20));
await type('#blackout-reason', 'Parish festival', { clear: true });
await click('[data-action="add-blackout"]', 'Add a closed day ahead');
await click('[data-action="add-blackout"]', 'Add the same day again');
check('the same date is not set aside twice', (await blackouts()).filter((b) => b.date === ahead(20)).length === 1, JSON.stringify(await blackouts()));

await setDate(ahead(21));
await type('#blackout-reason', 'r'.repeat(240), { clear: true });
check(
  'a reason stops at the length steeple keeps',
  (await value('#blackout-reason')).length === 200,
  `${(await value('#blackout-reason')).length} characters`
);
await click('[data-action="add-blackout"]', 'Add a closed day with a long reason');

// What a paste, or a record an older build wrote, can still put there.
await setDate(ahead(22));
await put('#blackout-reason', 'r'.repeat(500));
await click('[data-action="add-blackout"]', 'Add a closed day with an unbroken 500-character reason');
await sheetIsReachable('with 500 unbroken characters in the list');
await shot('05-availability');
await click('[data-action="advance"]', 'Review and publish');
await wait(3000);
check(
  'the service refuses it in its own words',
  /200 characters/.test((await noticeText()) ?? ''),
  `${await onStep()} · ${(await noticeText() ?? '').slice(0, 70)}`
);
check('and the host is still on the step that owns it', (await onStep()) === '4Availability', await onStep());

const rows = await page.$$('.blackouts__item .linkish');
await rows.at(-1)?.click();
await wait(500);
await click('[data-action="advance"]', 'Review and publish, once more');
await wait(3000);
check('undoing it carries the host on', (await onStep()) === '5Publish', `${await onStep()} · ${await noticeText()}`);

const tokenNow = await bearer();
const roomId = (await api(`/manage/venues/${venueId}`, tokenNow)).rooms?.[0]?.id;
const rules = await api(`/manage/rooms/${roomId}/availability`, tokenNow);
check('steeple holds no date already gone', !(rules.blackouts ?? []).some((b) => b.date < today), JSON.stringify(rules.blackouts));
check('and the open week it was painted', (rules.days ?? []).filter((d) => d.windows.length).length === 7, `${(rules.days ?? []).filter((d) => d.windows.length).length} days`);

// ── 6. Publish, pressed twice in one breath ───────────────────────────────
console.log('\n6. Publish — pressed twice in one breath');
check('publishing is offered', (await disabled('[data-action="advance"]')) === false);
writes.length = 0;
await page.evaluate(() => {
  const button = document.querySelector('[data-action="advance"]');
  button.click();
  button.click();
});
await wait(4500);
// One press carries everything steeple has not been told and then asks: the
// availability replace-all runs exactly once inside that sequence, so a second
// run of it is the signature of a second press getting through.
const runs = writes.filter((w) => w.endsWith('/availability')).length;
check('one press, one run of the sequence', runs === 1, writes.join(' · ') || 'no writes');
const answer = await api(`/manage/rooms/${roomId}`, tokenNow);
check('steeple recorded the request', Boolean(answer.publishRequestedAtUtc), answer.publishRequestedAtUtc);
check('and the host reads what the service said', /sent for review|is published/.test((await text('.listing__body')) ?? ''), (await text('.listing__body'))?.slice(0, 80));
await shot('06-published');

// ── 7. Two spaces, one name ───────────────────────────────────────────────
console.log('\n7. Two listings that share a name');
await clickText('.listing__buttons .pill--primary', /^Done$/, 'Done');
await wait(800);
const before = (await store('placedVenues()')).length;
for (const address of ['2 Windmill Lane', '77 Orchard Way']) {
  await clickText('.desk button', /^List a space$/, 'List a space');
  await type('#place-name', `Bell Hall ${stamp} twin`, { clear: true });
  await type('#place-description', 'A parish hall behind the church.', { clear: true });
  await type('#place-address', address, { clear: true });
  await type('#place-suburb', 'Vienna', { clear: true });
  await type('#place-postcode', '22180', { clear: true });
  await click('[data-action="advance"]', `Continue with ${address}`);
  await wait(2600);
  await clickText('.listing__buttons .linkish', /^Close$/, 'Close');
  await wait(700);
}
const after = await store('placedVenues()');
check('one name, two records', after.length === before + 2, `${before} → ${after.length}`);
check('each keeps its own address', new Set(after.map((v) => v.address)).size === after.length, JSON.stringify(after.map((v) => v.address)));

// ── the tally ─────────────────────────────────────────────────────────────
console.log(`\n${failures ? 'FAILURES' : 'all clear'}: ${checks - failures}/${checks} checks`);
if (problems.length) {
  console.log('\npage problems:');
  for (const p of [...new Set(problems)]) console.log(`  ${p}`);
}
await browser.close();
process.exit(failures || problems.length ? 1 : 0);
