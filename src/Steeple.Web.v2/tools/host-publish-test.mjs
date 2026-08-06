// THE HOSTING JOURNEY, END TO END, AGAINST THE REAL API (CONTRACT6 §3.7).
//
// Real mouse and keyboard from an empty draft to a room steeple holds: sign in
// through the dev provider, create the venue (geocoded server-side), create the
// room, upload the photograph publishing needs, replace the availability rules,
// ask to publish — then read it all back with the bearer token this browser
// obtained, because a green screen is not evidence that a service was written
// to. Everything asserted twice: what the host sees, and what the API answers.
//
// §7–§10 are the second half of the story, added 2026-08-06 with the Verify step
// removed: a venue is a property and a space is a room in it, and a host who has
// one must be able to add another, correct the venue's own details, and never be
// stranded at a venue with no spaces (the owner's own trap — a venue registered,
// the wizard abandoned, and the desk's only button offering to register another
// venue). §7 also holds the root cause as a named check: the local record takes
// the slug steeple minted the moment the create answers, or the desk's own
// re-read drops the draft and everything keyed under it.
//
// Needs the API on localhost:5200 and the app on the given origin (vite proxies
// /api/v1). Nothing here is reset or reseeded: each run mints its own venue
// under its own dev account, so runs never collide.
//
//   node tools/host-publish-test.mjs "http://localhost:5332/?q=low&world=off"
//   node tools/host-publish-test.mjs "http://localhost:5332/?q=low" --shots hp

import puppeteer from 'puppeteer';
import { writeRoomPhoto } from './host-photo.mjs';

const url = process.argv[2] ?? 'http://localhost:5332/?q=low&world=off';
const shotPrefix = process.argv.includes('--shots')
  ? process.argv[process.argv.indexOf('--shots') + 1]
  : null;
const API = 'http://localhost:5200/api/v1';
const PHOTO = writeRoomPhoto('/tmp/steeple-host-room.png');

const stamp = Date.now().toString(36);
const venueName = `Trinity Hall ${stamp}`;
const roomName = `Long Room ${stamp}`;
const hostEmail = `host-${stamp}@example.org`;
// The second venue: registered, abandoned before it has a space, and picked up
// again from the desk — the owner's trap, driven.
const strandedName = `Chapel Yard ${stamp}`;
const renamedName = `Chapel Yard Rooms ${stamp}`;
const firstSpace = `Upper Room ${stamp}`;
const secondSpace = `Lower Room ${stamp}`;

let checks = 0;
let failures = 0;
const problems = [];

function check(label, ok, detail = '') {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
}

// The API has to be there for this test to mean anything.
const up = await fetch(`${API}/geofence`).then((r) => r.ok).catch(() => false);
if (!up) {
  console.log('\nThe steeple API is not answering on localhost:5200 — this test needs it.');
  console.log('(The API-down half of the story is tools/host-offline-test.mjs.)');
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
  problems.push(`[console.error] ${text}`);
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

/** Real mouse click, reporting what was actually topmost where it landed. */
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
      return node ? `${node.tagName.toLowerCase()}.${node.className || ''}`.slice(0, 50) : '?';
    },
    x,
    y
  );
  await page.mouse.click(x, y);
  await wait(500);
  check(`click ${label}`, true, `topmost: ${top}`);
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

/** Type into a field the way a person does: click it, then use the keys. */
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

// The access token lives in the session module's memory and the refresh token in
// an httpOnly cookie — neither is in localStorage any more. `withAccess` is the
// public way to be handed one, which is what the app itself uses.
const bearer = () => page.evaluate('__steeple.session.withAccess((token) => Promise.resolve(token))');

async function api(path, token) {
  const response = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${token}` } });
  return response.ok ? response.json() : { status: response.status };
}

console.log(`\n── the hosting journey · ${url} ──`);
await page.goto(url, { waitUntil: 'networkidle0' });
await page.waitForFunction('window.__steepleReady === true', { timeout: 25000 });
await wait(1500);
await store('resetDemo()');
// The desk is a sheet over the browse surface, and no sheet is on the page
// until the roll has landed: with `?world=off` the page boots there, and with a
// village behind it the harness lands it without the tween, exactly as map-test
// does. Without this the suite reads the same store through a title page.
await page.evaluate('__steeple.roll.set(1)');
await wait(300);
// A journey from nothing: no session remembered, no venue placed.
await page.evaluate('localStorage.removeItem("steeple-village-session")');

// Re-baselined for v2_migration Phase 2 (D4). The flow used to be reached from a
// desk that opened for anybody, and the host signed in at the Verify step. There
// is no desk without a managed venue now, and no way into hosting without a
// session — so the order the product actually has is: be somebody, ask for
// hosting, and the flow opens itself because you keep no venue yet.
await page.evaluate(`__steeple.session.signIn({email:'${hostEmail}',displayName:'Ruth Ellery'})`);
await page.waitForFunction('!!__steeple.session.currentUser()', { timeout: 25000 });
await page.evaluate('__steeple.setMode("host")');
await page
  .waitForFunction('!!document.querySelector(".listing.is-open, .listing__layer")', { timeout: 30000 })
  .catch(() => {});
await wait(1400);

// ── 1. Place: address fields, no pin ──────────────────────────────────────
console.log('\n1. Place — the address, and no pin to drop');
check('a host who keeps no venue is taken straight to the flow', (await text('.steps__step.is-on')) === '1Place');
check('the flow is four steps, not five', (await page.$$eval('.steps__step', (n) => n.length)) === 4, await page.$$eval('.steps__step', (n) => n.map((s) => s.textContent).join(' ')));
check('and none of them is Verify', !/Verify/.test((await text('.steps')) ?? ''));
check('the pin picker is gone', !(await page.$('.plan[role="application"]')), 'no draggable plan');
check('there is nowhere to drop a pin', (await page.$$('.place__pin')).length === 0);
check('the step asks for an address', await visible('#place-address'));
check('and for the parts the API requires', (await page.$('#place-suburb')) && (await page.$('#place-postcode')) !== null);
check('cannot continue while it is empty', await disabled('[data-action="advance"]'));

await type('#place-name', venueName);
await type('#place-description', 'A stone hall behind the church, used by the parish through the week.');
await type('#place-address', '18 Church Street');
await type('#place-suburb', 'Vienna');
check('still not enough without a ZIP', await disabled('[data-action="advance"]'));
await type('#place-postcode', '22180');
check('the whole address earns the way forward', !(await disabled('[data-action="advance"]')));
await shot('01-place');
await click('[data-action="advance"]', 'Continue');
await wait(2500);

// The venue is created on the way out of Place — there is no Verify step to
// wait for, because there is no way into hosting without a session. Where it
// stands is steeple's answer to the address, which is the pin's replacement.
check('Describe is next', (await text('.steps__step.is-on')) === '2Describe', await text('.steps__step.is-on'));
const placedNote = await text('.notice__text');
check('the host is told the venue is on the map', /on the map/.test(placedNote ?? ''), placedNote);
const signedIn = await page.evaluate('__steeple.session.currentUser()');
check('a real session exists', Boolean(signedIn?.id), signedIn?.displayName);
check('the API agrees who that is', (await api('/me', await bearer())).email === hostEmail);
const token = await bearer();
const managed = await api('/manage/venues', token);
check('steeple holds exactly this venue', managed.some?.((v) => v.name === venueName), JSON.stringify(managed));
const venueId = managed.find?.((v) => v.name === venueName)?.id;
const venue = await api(`/manage/venues/${venueId}`, token);
check('with the address as typed', venue.addressLine === '18 Church Street' && venue.suburb === 'Vienna' && venue.postcode === '22180');
check('geocoded server-side', Number.isFinite(venue.latitude) && Number.isFinite(venue.longitude), `${venue.latitude}, ${venue.longitude}`);
const mirrored = (await store('placedVenues()')).find((v) => v.name === venueName);
check('and the local mirror holds the server’s position, not a guess', mirrored?.lat === venue.latitude && mirrored?.lng === venue.longitude, `${mirrored?.lat}, ${mirrored?.lng}`);
// The root cause of the stranding bug, as a named check: a record kept under a
// guessed slug is a second record of one venue, and the desk's re-read drops it.
check('the local record took the slug steeple minted', mirrored?.id === venue.slug, `${mirrored?.id} vs ${venue.slug}`);
check('and there is exactly one record of it', (await store('placedVenues()')).filter((v) => v.name === venueName).length === 1);

// ── 2. Describe: one price, one photograph, welcome-all by default ─────────
console.log('\n2. Describe — a price, a photograph, and everyone welcome');
check('there is one price field and no price segments', (await page.$$('[data-price]')).length === 0);
check('the seats helper is gone', !/How many people it seats/.test((await text('.listing__body')) ?? ''));
check('"say what the room is, plainly" is gone', !/plainly/.test((await text('.listing__body')) ?? ''));
check('everyone is welcome by default', (await page.$eval('[data-welcome="all"]', (n) => n.getAttribute('aria-pressed'))) === 'true');
check('and there is no checkbox homework to do', (await page.$$('.welcome__chips .chip--toggle')).length === 0);

await type('#room-name', roomName, { clear: true });
await type('#room-description', 'A long room with a wooden floor, a piano at the far end, and chairs for sixty.');
await type('#room-capacity', '60', { clear: true });

// Free is shown as Free, in sage, and says plainly why it cannot be published.
await type('#room-price', '0', { clear: true });
check('zero reads as Free', (await text('.listing .price--free')) === 'Free');
const sage = await page.evaluate(() => {
  const probe = document.createElement('span');
  probe.style.color = 'var(--sage-deep)';
  document.body.append(probe);
  const said = getComputedStyle(probe).color;
  probe.remove();
  return said;
});
check('in sage, as the brand asks', (await page.$eval('.listing .price--free', (n) => getComputedStyle(n).color)) === sage, sage);
check('and says what steeple cannot do with it', /by the hour/.test((await text('.field__hint')) ?? ''));
await type('#room-price', '30', { clear: true });
check('a real price clears the note', (await page.$('.listing .price--free')) === null);

const chooser = await page.$('#room-photo');
await chooser.uploadFile(PHOTO);
await wait(400);
check('the photograph shows as chosen', await visible('.shotpick__thumb'));

await clickText('.welcome .segment', /Some activities only/, 'narrow to some activities');
const chips = await page.$$eval('.welcome__chips .chip--toggle.is-on', (n) => n.length);
check('narrowing starts from everything, not nothing', chips === 7, `${chips} on`);
await clickText('.welcome__chips .chip--toggle', /^Sports$/, 'turn Sports off');
await shot('03-describe');
await click('[data-action="advance"]', 'Set availability');
await wait(2200);
check('Availability is next', (await text('.steps__step.is-on')) === '3Availability', await text('.steps__step.is-on'));

const roomAfter = await api(`/manage/venues/${venueId}`, token);
const remoteRoom = roomAfter.rooms?.[0];
check('steeple holds the room', remoteRoom?.name === roomName, JSON.stringify(remoteRoom?.name));
check('as a draft, because publishing is moderated', remoteRoom?.status === 'draft');
check('with the photograph uploaded', remoteRoom?.photoCount === 1, `${remoteRoom?.photoCount} photos`);
check('the price it was given', Number(remoteRoom?.pricePerHour) === 30, String(remoteRoom?.pricePerHour));
check('and the capacity it was given', remoteRoom?.capacity === 60, String(remoteRoom?.capacity));
const roomDetail = await api(`/manage/rooms/${remoteRoom.id}`, token);
check('six activities, Sports excluded', roomDetail.activities?.length === 6 && !roomDetail.activities.includes('sports'), roomDetail.activities?.join(' '));
// The room's own slug, adopted the same way the venue's was. It used to be the
// constant 'main-space', which is a collision waiting for a second space.
const roomSlug = (await store('placedVenues()')).find((v) => v.id === mirrored.id)?.rooms?.[0]?.id;
check('the local room took the slug steeple minted', roomSlug === remoteRoom.slug, `${roomSlug} vs ${remoteRoom.slug}`);
check('and it is not the old constant', roomSlug !== 'main-space');

// ── 3. Availability: the painter, and a closed day ─────────────────────────
console.log('\n3. Availability — the week, and a day set aside');
check('the closed-days form is one composed block', await visible('.closed__form'));
const labelsAligned = await page.$$eval('.closed__form .eyebrow', (nodes) =>
  nodes.every((n) => Math.abs(n.getBoundingClientRect().top - nodes[0].getBoundingClientRect().top) < 2)
);
check('its labels sit on one line, none orphaned', labelsAligned);
check('the wordy closed-days blurb is gone', !/fortnight of repairs/.test((await text('.closed')) ?? ''));
await clickText('.paint__quick .linkish', /Open every day/, 'the standard week');
await wait(400);
check('seven windows are painted', (await store(`openHoursFor('${mirrored.id}','${roomSlug}')`)).length === 7);
const closedDay = new Date(Date.now() + 25 * 86400000).toISOString().slice(0, 10);
await page.$eval(
  '#blackout-date',
  (n, value) => {
    n.value = value;
    n.dispatchEvent(new Event('input', { bubbles: true }));
  },
  closedDay
);
await type('#blackout-reason', 'Parish festival');
await click('[data-action="add-blackout"]', 'Add closed day');
check('the closed day is listed', /Parish festival/.test((await text('.blackouts')) ?? ''));
await shot('04-availability');
await click('[data-action="advance"]', 'Review and publish');
await wait(2500);
check('Publish is next', (await text('.steps__step.is-on')) === '4Publish', await text('.steps__step.is-on'));

const rules = await api(`/manage/rooms/${remoteRoom.id}/availability`, token);
const openDays = rules.days?.filter((d) => d.windows.length > 0) ?? [];
check('steeple holds seven open days', openDays.length === 7, `${openDays.length} days`);
check('with the painted hours', openDays[0]?.windows[0]?.startTime === '08:00' && openDays[0]?.windows[0]?.endTime === '22:00', JSON.stringify(openDays[0]?.windows));
check('and the closed day', rules.blackouts?.some((b) => b.date === closedDay), JSON.stringify(rules.blackouts));

// ── 4. Publish: the ask, and the answer the server gave ───────────────────
console.log('\n4. Publish — and the service’s own answer to it');
check('nothing is missing, so publishing is offered', !(await disabled('[data-action="advance"]')));
check('the button says what it does', (await text('[data-action="advance"]')) === 'Publish this space');
check('the review shows where steeple put it', await visible('.placed .plan'));
// The one disclosure the Verify step used to make, in the place it belongs: the
// host's name goes out with the listing, and the mark is a fact about the
// session rather than a decoration.
check('the review says whose listing it will be', /Listed by/.test((await text('.listing .facts')) ?? ''), (await text('.listing .facts'))?.slice(-60));
check('under the name steeple holds', /Ruth Ellery/.test((await text('.facts__by')) ?? ''), await text('.facts__by'));
check('with the brand words exact', /Identity verified \(SSO\)/.test((await text('.listing .verified')) ?? ''));
await shot('05-review');
await click('[data-action="advance"]', 'Publish this space');
await wait(4000);
await shot('06-published');

const answer = await api(`/manage/rooms/${remoteRoom.id}`, token);
check('steeple recorded a publish request', Boolean(answer.publishRequestedAtUtc), answer.publishRequestedAtUtc);
check('and the room is still a draft, because a moderator has it', answer.status === 'draft', answer.status);
const said = (await text('.guide')) ?? '';
check('the host is told exactly that', /sent for review/.test(said), said.slice(0, 90));
check('and not told it is live', !/is published/.test(said));
check('no exclamation marks anywhere on the step', !/!/.test((await text('.listing')) ?? ''));
const localRoom = await store(`effectiveRoom('${mirrored.id}','${roomSlug}')`);
check('the local mirror carries the server’s state', localRoom?.status === 'draft' && Boolean(localRoom?.publishRequestedAt), JSON.stringify({ status: localRoom?.status, requested: localRoom?.publishRequestedAt }));
check('and the server’s photograph', typeof localRoom?.photo === 'string' && localRoom.photo.includes('/media/'), localRoom?.photo);

// ── 5. the way out, and the desk afterwards ───────────────────────────────
console.log('\n5. the way out, and the desk it leads to');
check('the button is now a way out', (await text('[data-action="advance"]')) === 'Done');
await click('[data-action="advance"]', 'Done');
await wait(900);
check('the flow closed', !(await visible('.listing')));
check('the desk is back', await visible('.desk'));
await clickText('.tab', /^Spaces/, 'Spaces tab');
check('the new venue is the one being kept', /Trinity Hall/.test((await text('.desk .desk__head')) ?? ''), await text('.desk .desk__head'));
check('and its space reads as with steeple, not as a draft', /With Steeple/.test((await text('.desk .spaces')) ?? ''), (await text('.desk .spaces'))?.slice(0, 80));
await shot('07-desk');

// ── 6. the desk's two ways on ─────────────────────────────────────────────
//
// One button reading "List a space" that restarted venue registration was the
// trap: a host with a venue and no space had no way to add one.
console.log('\n6. the desk offers a space and a venue, and they are different things');
check('the primary way on is another space here', await visible('[data-action="add-space"]'));
check('and it says so', (await text('[data-action="add-space"]')) === 'Add a space');
check('a whole new venue is offered quietly beside it', (await text('[data-action="new-venue"]')) === 'List another venue');
check('the venue itself can be corrected from Spaces', await visible('[data-action="edit-venue"]'));

// ── 7. the trap: a venue registered and abandoned before its first space ───
console.log('\n7. a venue abandoned at Place — the desk still has a way on');
await click('[data-action="new-venue"]', 'List another venue');
await wait(900);
check('it opens on Place, the whole four steps', (await text('.steps__step.is-on')) === '1Place', await text('.steps__step.is-on'));
await type('#place-name', strandedName);
await type('#place-description', 'A yard behind the chapel with two rooms off it.');
await type('#place-address', '9 Yard Lane');
await type('#place-suburb', 'Vienna');
await type('#place-postcode', '22180');
await click('[data-action="advance"]', 'Continue');
await wait(2600);
const stranded = (await api('/manage/venues', token)).find((v) => v.name === strandedName);
check('steeple holds the second venue', Boolean(stranded?.id), JSON.stringify(stranded));
const strandedLocal = (await store('placedVenues()')).find((v) => v.name === strandedName);
check('and this browser holds it under steeple’s own slug', strandedLocal?.id === stranded?.slug, `${strandedLocal?.id} vs ${stranded?.slug}`);

// The abandonment itself: away before the space is described.
await click('[data-action="close"]', 'Close before describing anything');
await wait(2600);
check('the desk is back', await visible('.desk'));
check('on the venue just registered', new RegExp(strandedName).test((await text('.desk .desk__head')) ?? ''), await text('.desk .desk__head'));
check('and the venue survived the desk’s own re-read', (await store('placedVenues()')).some((v) => v.id === stranded.slug));
await clickText('.tab', /^Spaces/, 'Spaces tab');
const empty = (await text('.desk .desk__count')) ?? '';
check('a venue with no spaces says so, and says what to do', /No spaces here yet/.test(empty), empty);
check('and does not count nothing at you', !/0 spaces are published/.test(empty));
await shot('08-empty-spaces');

console.log('\n   …and Add a space is the way out of it');
await click('[data-action="add-space"]', 'Add a space');
await wait(900);
check('the flow opens on Describe', (await text('.steps__step.is-on')) === '1Describe', await text('.steps__step.is-on'));
check('three steps, because the venue is settled', (await page.$$eval('.steps__step', (n) => n.length)) === 3);
check('and there is no Place step to walk back into', !/Place/.test((await text('.steps')) ?? ''));
check('the title names the venue this space belongs to', new RegExp(`A space at ${strandedName}`).test((await text('#listing-title')) ?? ''), await text('#listing-title'));
check('the eyebrow says what is happening', (await text('.listing__head .eyebrow')) === 'Add a space');
await shot('09-add-space');

await type('#room-name', firstSpace, { clear: true });
await type('#room-description', 'A quiet upstairs room with a long table and eight chairs.');
await type('#room-capacity', '18', { clear: true });
await type('#room-price', '22', { clear: true });
await (await page.$('#room-photo')).uploadFile(PHOTO);
await wait(400);
await click('[data-action="advance"]', 'Set availability');
await wait(2400);
check('Availability is next', (await text('.steps__step.is-on')) === '2Availability', await text('.steps__step.is-on'));
await clickText('.paint__quick .linkish', /Open every day/, 'the standard week');
await wait(400);
await click('[data-action="advance"]', 'Review and publish');
await wait(2400);
await click('[data-action="advance"]', 'Publish this space');
await wait(4000);
const afterFirst = await api(`/manage/venues/${stranded.id}`, token);
check('steeple holds the space at that venue', afterFirst.rooms?.some((r) => r.name === firstSpace), JSON.stringify(afterFirst.rooms?.map((r) => r.name)));
await click('[data-action="advance"]', 'Done');
await wait(2600);
await clickText('.tab', /^Spaces/, 'Spaces tab');
check('the desk lists it', new RegExp(firstSpace).test((await text('.desk .spaces')) ?? ''), (await text('.desk .spaces'))?.slice(0, 80));

// ── 8. a second space at the same venue ───────────────────────────────────
//
// The old flow could not do this at all: every local room was 'main-space', so
// a second one overwrote the first — its hours, its state and all.
console.log('\n8. a second space at the same venue');
await click('[data-action="add-space"]', 'Add a space');
await wait(900);
check('the title knows there is already one', new RegExp(`Another space at ${strandedName}`).test((await text('#listing-title')) ?? ''), await text('#listing-title'));
await type('#room-name', secondSpace, { clear: true });
await type('#room-description', 'The room off the yard, with its own door and a kitchenette.');
await type('#room-capacity', '30', { clear: true });
await type('#room-price', '26', { clear: true });
await (await page.$('#room-photo')).uploadFile(PHOTO);
await wait(400);
await click('[data-action="advance"]', 'Set availability');
await wait(2400);
await clickText('.paint__quick .linkish', /Open every day/, 'the standard week');
await wait(400);
await click('[data-action="advance"]', 'Review and publish');
await wait(2400);
await click('[data-action="advance"]', 'Publish this space');
await wait(4000);
await click('[data-action="advance"]', 'Done');
await wait(2600);

const bothRooms = await api(`/manage/venues/${stranded.id}`, token);
check('steeple holds two spaces at the venue', bothRooms.rooms?.length === 2, JSON.stringify(bothRooms.rooms?.map((r) => r.name)));
check('with slugs of their own', new Set(bothRooms.rooms?.map((r) => r.slug)).size === 2, JSON.stringify(bothRooms.rooms?.map((r) => r.slug)));
const localRooms = (await store('placedVenues()')).find((v) => v.id === stranded.slug)?.rooms ?? [];
check('and this browser keeps them apart too', new Set(localRooms.map((r) => r.id)).size === 2, JSON.stringify(localRooms.map((r) => r.id)));
const hoursApart = await Promise.all(
  localRooms.map((r) => store(`openHoursFor('${stranded.slug}','${r.id}')`))
);
check('each with its own open hours, not one shared set', hoursApart.every((h) => h.length === 7), JSON.stringify(hoursApart.map((h) => h.length)));
await clickText('.tab', /^Spaces/, 'Spaces tab');
check('the desk lists both', new RegExp(secondSpace).test((await text('.desk .spaces')) ?? '') && new RegExp(firstSpace).test((await text('.desk .spaces')) ?? ''));
await shot('10-two-spaces');

// ── 9. the venue's own details, corrected ─────────────────────────────────
console.log('\n9. Edit venue details — a rename steeple agrees to');
await click('[data-action="edit-venue"]', 'Edit venue details');
await wait(900);
check('it opens as one step, with no rail over it', !(await visible('.listing .steps')), await page.$eval('.listing .steps', (n) => n.hidden));
check('prefilled with the venue as it stands', (await page.$eval('#place-name', (n) => n.value)) === strandedName);
check('and the address it was geocoded from', (await page.$eval('#place-address', (n) => n.value)) === '9 Yard Lane');
check('the button saves rather than continues', (await text('[data-action="advance"]')) === 'Save changes');
await shot('11-venue-editor');
await type('#place-name', renamedName, { clear: true });
await click('[data-action="advance"]', 'Save changes');
await wait(2600);
const renamed = await api(`/manage/venues/${stranded.id}`, token);
check('steeple holds the new name', renamed.name === renamedName, renamed.name);
check('and the slug never moved — a rename must not break a link', renamed.slug === stranded.slug, `${renamed.slug} vs ${stranded.slug}`);
check('the host is told it is saved', /is saved/.test((await text('.notice__text')) ?? ''), await text('.notice__text'));
check('and the button is a way out', (await text('[data-action="advance"]')) === 'Done');
await click('[data-action="advance"]', 'Done');
await wait(2600);
check('the desk agrees', new RegExp(renamedName).test((await text('.desk .desk__head')) ?? ''), await text('.desk .desk__head'));
await shot('12-renamed');

// Nothing invisible left over the surface.
const audit = await page.evaluate(() => {
  const offenders = [];
  for (const [x, y] of [[720, 450], [200, 300], [1200, 700], [400, 820]]) {
    for (const node of document.elementsFromPoint(x, y)) {
      const name = `${node.tagName.toLowerCase()}.${node.className || ''}`;
      if (/listing/.test(name)) offenders.push(`${x},${y} → ${name}`);
    }
  }
  return offenders;
});
check('the closed flow intercepts nothing', audit.length === 0, audit.join(' | '));

console.log(`\n${failures ? 'FAILURES' : 'all clear'}: ${checks - failures}/${checks} checks passed`);
if (problems.length) {
  console.log('\nconsole/page errors:');
  for (const problem of [...new Set(problems)]) console.log(`  ${problem}`);
} else {
  console.log('zero console errors');
}
console.log(`(this run left ${venueName} and ${renamedName} on the API under ${hostEmail})`);

await browser.close();
process.exit(failures || problems.length ? 1 : 0);
