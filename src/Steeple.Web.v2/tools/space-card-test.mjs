// THE SPACE CARD ON A LETTER — both lenses: legible, pressable, and a way in.
//
//   node tools/space-card-test.mjs
//   STEEPLE_SHOTS=/tmp/spacecard node tools/space-card-test.mjs   (screenshots)
//
// Needs the Development API on :5200 (dev sign-in) and Vite on :5173 with its
// proxy pointed at that same API. Rows are minted; no database reset, no seed
// count asserted.
//
// What it proves (owner review, 2026-08-09):
//   §1 the host's card is a photograph you can recognise a room in, not a
//      stamp — and it survives a phone. The squash it guards against was real:
//      grid sizes the letter's left column to *min-content* when the column is
//      height-constrained, and the card's min-content is its padding, because
//      the photograph's height is specified rather than intrinsic. It came out
//      20px tall with the picture spilling out of it;
//   §2 pressing the host's card opens that space's listing;
//   §3 the guest's letter has the same identification, with a photograph, and
//      pressing it opens the room sheet the request was written from;
//   §4 the guest's letter says WHERE, with the venue's street address, and the
//      address can be taken away in one press;
//   §5 the venue sheet's own room cards are still the venue sheet's. Both
//      surfaces called their card `.spacecard` until 2026-08-09 and host.css
//      loads last, so the letter's small horizontal card had been reshaping the
//      guest sheet's standing photo cards for as long as it existed.
//
// Screenshots are taken LAST: a headless page stops advancing CSS transitions
// after its first `screenshot()`, so anything asserted after one is a lie.

import {
  agreeCurrent,
  apiIsUp,
  apply,
  closeBrowsers,
  isEnvironmentNoise,
  launch,
  mintGuest,
  mintVenue,
  signInPage,
  stamp,
} from './fixtures.mjs';

const APP = process.env.STEEPLE_WEB ?? 'http://localhost:5173/?q=low&world=off';
const SHOTS = process.env.STEEPLE_SHOTS ?? null;

let checks = 0;
let failures = 0;
function check(label, ok, detail = '') {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
}
const eq = (label, got, want) =>
  check(label, got === want, `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

const problems = [];
// A cold browser profile carries no refresh cookie, so steeple's first question
// of the page is answered 401 before anyone has signed in. That is the session
// seam working, not the page failing.
const isColdRefresh = (message) =>
  message.text().includes('401') && (message.location?.().url ?? '').includes('/auth/refresh');

/** A real press on a surface that may redraw under the pointer. */
async function press(page, selector, tries = 6) {
  for (let attempt = 1; ; attempt += 1) {
    await page.waitForSelector(selector, { visible: true, timeout: 30000 });
    try {
      return await page.click(selector);
    } catch (error) {
      if (attempt >= tries || !/detached|not clickable/i.test(error.message)) throw error;
      await new Promise((r) => setTimeout(r, 400));
    }
  }
}

/** What a card measures, and whether its picture is inside it. */
const cardState = (page, selector) =>
  page.evaluate((sel) => {
    const card = document.querySelector(sel);
    if (!card) return null;
    const photo = card.querySelector('img, [class$="__photo"]');
    const box = card.getBoundingClientRect();
    const shot = photo?.getBoundingClientRect() ?? null;
    return {
      tag: card.tagName,
      height: Math.round(box.height),
      width: Math.round(box.width),
      photoHeight: shot ? Math.round(shot.height) : null,
      photoInside: shot ? shot.bottom <= box.bottom + 1 && shot.top >= box.top - 1 : false,
      loaded: photo instanceof HTMLImageElement ? photo.naturalHeight > 0 : false,
      name: card.querySelector('[class$="__name"]')?.textContent ?? null,
      meta: card.querySelector('[class$="__meta"]')?.textContent ?? null,
    };
  }, selector);

const shot = async (page, name) => {
  if (!SHOTS) return;
  await page.screenshot({ path: `${SHOTS}/${name}.png` }).catch(() => {});
};

if (!(await apiIsUp())) {
  console.log('The steeple API is not answering; this test needs the Development API.');
  process.exit(2);
}

const roomName = `Card Room ${stamp}`;
let hostPage = null;
let guestPage = null;

try {
  const host = await mintVenue({
    email: `card-host-${stamp}@example.org`,
    name: 'Host Hana',
    venueName: `Cardwell Parish ${stamp}`,
    roomName,
    bookingMode: 'instant',
  });
  await agreeCurrent(host.token);
  const guest = await mintGuest({ email: `card-guest-${stamp}@example.org`, name: 'Guest Gia' });
  await agreeCurrent(guest.token);
  const booked = await apply(guest, host);
  eq('the guest booked it there and then', booked.status, 'approved');

  // ── §1 the host's card, on a laptop and on a phone ────────────────────────
  const hostBrowser = await launch();
  hostPage = await hostBrowser.newPage();
  await hostPage.setViewport({ width: 1440, height: 900 });
  hostPage.on('pageerror', (error) => problems.push(`host: ${error.message}`));
  hostPage.on('console', (message) => {
    if (message.type() === 'error' && !isEnvironmentNoise(message) && !isColdRefresh(message)) {
      problems.push(`host: ${message.text()}`);
    }
  });
  await hostPage.goto(APP, { waitUntil: 'domcontentloaded' });
  await hostPage.waitForFunction(
    () => window.__steepleReady === true && window.__steeple?.state?.roll >= 1,
    { timeout: 30000 }
  );
  await signInPage(hostPage, host.email, host.name);
  await hostPage.evaluate(() => window.__steeple.setView('journal'));
  await hostPage.waitForFunction(
    (id) => Boolean(document.querySelector(`.jrow--hosting[data-id="${id}"]`)),
    { timeout: 30000 },
    booked.id
  );
  await press(hostPage, `.jrow--hosting[data-id="${booked.id}"]`);
  await hostPage.waitForFunction(
    () => Boolean(document.querySelector('.letterpage.is-open .letterspace img')),
    { timeout: 30000 }
  );
  // The photograph is a fetch; a card judged before it lands is judged on a box.
  await hostPage.waitForFunction(
    // Scoped to the letter: the desk keeps space cards of its own, and the
    // first one in the document is not the one being judged.
    () => document.querySelector('.letterpage .letterspace img')?.naturalHeight > 0,
    { timeout: 30000 }
  );

  const laptop = await cardState(hostPage, '.letterpage .letterspace');
  eq('the host card is a button', laptop.tag, 'BUTTON');
  eq('with the room named on it', laptop.name, roomName);
  check('and the two facts a decision leans on', /Seats 40/.test(laptop.meta) && /\$20\/hr/.test(laptop.meta), laptop.meta);
  check('its photograph is big enough to recognise a room in', laptop.photoHeight >= 72, `${laptop.photoHeight}px`);
  check('and it really loaded', laptop.loaded);
  check('the card is as tall as what is in it', laptop.height >= laptop.photoHeight, `${laptop.height}px`);

  await hostPage.setViewport({ width: 430, height: 932 });
  await hostPage.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
  const phone = await cardState(hostPage, '.letterpage .letterspace');
  check('on a phone the card is not squashed', phone.height >= 90, `${phone.height}px`);
  eq('and the picture is inside it', phone.photoInside, true);
  eq('the name is still on it', phone.name, roomName);
  await hostPage.setViewport({ width: 1440, height: 900 });
  await hostPage.evaluate(() => new Promise((r) => requestAnimationFrame(r)));

  // ── §2 pressing it opens the listing ──────────────────────────────────────
  await press(hostPage, '.letterpage .letterspace');
  await hostPage.waitForFunction(() => Boolean(document.querySelector('.listing')), { timeout: 30000 });
  const opened = await hostPage.evaluate(() => ({
    listing: Boolean(document.querySelector('.listing')),
    title: document.querySelector('.listing .listing__title, .listing h1')?.textContent ?? null,
  }));
  eq('pressing the host card opens the listing', opened.listing, true);

  // ── §3 the guest's own identification ─────────────────────────────────────
  const guestBrowser = await launch();
  guestPage = await guestBrowser.newPage();
  await guestPage.setViewport({ width: 1440, height: 900 });
  guestPage.on('pageerror', (error) => problems.push(`guest: ${error.message}`));
  guestPage.on('console', (message) => {
    if (message.type() === 'error' && !isEnvironmentNoise(message) && !isColdRefresh(message)) {
      problems.push(`guest: ${message.text()}`);
    }
  });
  await guestPage.goto(APP, { waitUntil: 'domcontentloaded' });
  await guestPage.waitForFunction(
    () => window.__steepleReady === true && window.__steeple?.state?.roll >= 1,
    { timeout: 30000 }
  );
  await signInPage(guestPage, guest.email, guest.name);
  await guestPage.evaluate(() => window.__steeple.setView('journal'));
  await guestPage.waitForFunction((id) => Boolean(document.querySelector(`.jrow[data-id="${id}"]`)), {
    timeout: 30000,
  }, booked.id);
  await press(guestPage, `.jrow[data-id="${booked.id}"]`);
  await guestPage.waitForFunction(() => Boolean(document.querySelector('.opened .openedspace')), {
    timeout: 30000,
  });
  await guestPage.waitForFunction(
    () => document.querySelector('.openedspace img')?.naturalHeight > 0,
    { timeout: 30000 }
  );

  const card = await cardState(guestPage, '.opened .openedspace');
  eq('the guest card is a button too', card.tag, 'BUTTON');
  eq('naming the space', card.name, roomName);
  // The head above it already names the room and the venue; the card says the
  // two things it does not.
  check('with what the letterhead does not say', card.meta === 'Seats 40 · $20/hr', card.meta);
  check('a photograph you can see', card.photoHeight >= 72 && card.loaded, `${card.photoHeight}px`);

  // ── §4 where, and taking it with you ──────────────────────────────────────
  const where = await guestPage.evaluate(() => {
    const terms = [...document.querySelectorAll('.opened .particulars dt')].map((n) => n.textContent);
    const row = [...document.querySelectorAll('.opened .particulars dt')].find(
      (n) => n.textContent === 'Where'
    );
    return {
      terms,
      address: row?.nextElementSibling?.querySelector('.particulars__address')?.textContent ?? null,
      copy: Boolean(row?.nextElementSibling?.querySelector('.copyaddr')),
    };
  });
  check('the particulars now say where', where.terms.includes('Where'), where.terms.join(' · '));
  check('with the venue street steeple holds', /Maple Avenue East/.test(where.address ?? ''), where.address);
  check('and the suburb and postcode with it', /Vienna 22180/.test(where.address ?? ''), where.address);
  eq('and one press takes a copy of it', where.copy, true);

  await press(guestPage, '.opened .particulars .copyaddr');
  await guestPage.waitForFunction(
    () => Boolean(document.querySelector('.opened .copyaddr__said')?.textContent?.trim()),
    { timeout: 10000 }
  );
  const said = await guestPage.$eval('.opened .copyaddr__said', (n) => n.textContent.trim());
  check(
    'and says which of the two things it did',
    said === 'Address copied' || said === 'Selected — copy it from here',
    said
  );
  const stillThere = await guestPage.evaluate(() => window.__steeple.state.view);
  eq('taking a copy is not asking to go anywhere', stillThere, 'letter');

  // ── §3b pressing the card opens the space ─────────────────────────────────
  await press(guestPage, '.opened .openedspace');
  await guestPage.waitForFunction(() => window.__steeple.state.view === 'room', { timeout: 15000 });
  const room = await guestPage.evaluate(() => ({
    view: window.__steeple.state.view,
    roomId: window.__steeple.state.roomId,
    sheet: Boolean(document.querySelector('.sheet--room, .roomsheet, .sheet')),
  }));
  eq('pressing the guest card opens the space', room.view, 'room');
  eq('the one the request is about', room.roomId, host.roomSlug);

  // ── §5 the venue sheet's own cards are still its own ──────────────────────
  // `.spacecard` belonged to two surfaces at once until 2026-08-09, and
  // host.css loads last: the letter's little horizontal card was reshaping the
  // venue sheet's standing photo cards. This is the guard on the two names
  // staying apart (CLAUDE.md's hazard, in the one place it actually bit).
  await guestPage.evaluate((slug) => window.__steeple.setView('venue', { venueId: slug }), host.venueSlug);
  await guestPage.waitForSelector('.sheet--venue .spacecard', { timeout: 30000 });
  const venueCard = await guestPage.evaluate(() => {
    const card = document.querySelector('.sheet--venue .spacecard');
    const photo = card.querySelector('.spacecard__photo');
    return {
      display: getComputedStyle(card).display,
      photoWidth: Math.round(photo.getBoundingClientRect().width),
      cardWidth: Math.round(card.getBoundingClientRect().width),
      letterCard: card.classList.contains('letterspace'),
    };
  });
  eq('the venue sheet still stacks its cards', venueCard.display, 'flex');
  check(
    'and its photograph is the width of the card, not a thumbnail beside it',
    venueCard.photoWidth >= venueCard.cardWidth - 2,
    `${venueCard.photoWidth} of ${venueCard.cardWidth}`
  );
  eq('the letter has not lent it its own name', venueCard.letterCard, false);

  // ── shots, last ───────────────────────────────────────────────────────────
  if (SHOTS) {
    await shot(guestPage, 'guest-room-sheet');
    await guestPage.evaluate((id) => window.__steeple.setView('letter', { applicationId: id }), booked.id);
    await guestPage.waitForSelector('.opened .openedspace', { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 600));
    await shot(guestPage, 'guest-letter-card');
    await shot(hostPage, 'host-listing-from-card');
  }
} finally {
  await closeBrowsers();
}

for (const problem of problems) check(`no console trouble: ${problem}`, false);
console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
