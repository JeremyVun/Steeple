#!/usr/bin/env node
// THE GUEST SURFACE, wave 7 (CONTRACT6 §2). Every check here guards a bug that
// was real, and each one was proven to bite by putting its bug back:
//
//   §2.1 a pin answers "what would this cost", and quotes only what matches
//   §2.2 a phone's way back is on the page, and is never the way out
//   §2.3 the verified mark is a footnote, not a badge
//   §2.4 the address copies
//   §2.5 the room sheet keeps its photograph when /api/v1 is not there
//   §2.6 an account has a face and a door out
//   §2.7 the search bar's highlight is a share of the bar, not an oval on it
//
//   node tools/surface-test.mjs "http://localhost:5331/"
//
// Two viewports, because half of this is about the phone. The API is used as it
// stands; §2.5 fakes an origin that answers 404 on the listing endpoints, which
// is what a static host or an unwired proxy does.

import { agreeCurrent, at, closeBrowsers, launch, routes, signIn } from './fixtures.mjs';

const url = process.argv[2] ?? 'http://localhost:5331/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launch();
await browser
  .defaultBrowserContext()
  .overridePermissions(new URL(url).origin, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

// A top-level-await script has no `finally` around it, so this is the finally:
// whatever kills the run, the browser it opened goes with it. (The pipe
// transport covers the ungraceful deaths; this covers the throw.)
async function lastWords(error) {
  await closeBrowsers();
  console.log(`\nthe run stopped: ${error?.message ?? error}`);
  process.exit(1);
}
process.on('uncaughtException', lastWords);
process.on('unhandledRejection', lastWords);

/** A page on the browse surface, landed past the roll, with nobody signed in. */
async function surface({ width, height, block = null } = {}) {
  const page = await browser.newPage();
  await page.setViewport({
    width,
    height,
    hasTouch: height > width,
    isMobile: height > width,
    deviceScaleFactor: 2,
  });
  page.on('pageerror', (e) => check(`no page error: ${e.message}`, false));
  if (block) {
    await page.setRequestInterception(true);
    page.on('request', (r) =>
      block.test(r.url())
        ? r.respond({ status: 404, contentType: 'text/html', body: '<!doctype html><title>404</title>' })
        : r.continue()
    );
  }
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(at(url, routes.browse()), { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__steepleReady === true', { timeout: 25000 });
  await page.evaluate('__steeple.roll.set(1)');
  await wait(3000);
  return page;
}

const rectOf = (page, sel) =>
  page.evaluate((s) => {
    const n = document.querySelector(s);
    if (!n) return null;
    const b = n.getBoundingClientRect();
    return {
      x: Math.round(b.x), y: Math.round(b.y),
      w: Math.round(b.width), h: Math.round(b.height),
      bottom: Math.round(b.bottom), right: Math.round(b.right),
      cx: b.x + b.width / 2, cy: b.y + b.height / 2,
    };
  }, sel);

const textOf = (page, sel) => page.evaluate((s) => document.querySelector(s)?.textContent ?? null, sel);
const shownIn = (page, sel) =>
  page.evaluate((s) => {
    const n = document.querySelector(s);
    return n ? (n.checkVisibility ? n.checkVisibility() : n.offsetParent !== null) : false;
  }, sel);
const stackAt = (page, x, y) =>
  page.evaluate((a, b) => document.elementsFromPoint(a, b).slice(0, 4).map((n) => `${n.tagName}.${String(n.className).slice(0, 36)}`), x, y);

// A missing affordance is a failing check, not an exception: this suite has
// seven independent sections and one absent button used to end the run before
// the phone half of it was ever driven.
async function press(page, sel, { touch = false } = {}) {
  const r = await rectOf(page, sel);
  if (!r) {
    check(`there is a ${sel} to press`, false);
    return false;
  }
  if (touch) await page.touchscreen.tap(r.cx, r.cy);
  else await page.mouse.click(r.cx, r.cy);
  return true;
}

// ═══ 1. desktop: pins, the head, the standing line, the search bar ══════════
{
  const page = await surface({ width: 1440, height: 900 });
  console.log('\n1. the map answers what it costs (§2.1)');

  const pins = await page.evaluate(() =>
    [...document.querySelectorAll('.dm-pin')].map((n) => ({
      v: n.dataset.venue,
      shows: n.dataset.shows,
      says: n.querySelector('.dm-pin__price').textContent,
      who: n.querySelector('.dm-pin__who').textContent,
      aria: n.getAttribute('aria-label'),
    }))
  );
  check('every pin quotes a price', pins.every((p) => p.shows === 'price' && /^(\$|Free)/.test(p.says)), pins.map((p) => p.says).join(' '));
  check('...as a band when the venue holds spaces at different rates', pins.some((p) => p.says.includes('–')), pins.map((p) => p.says).join(' '));
  check('...never as $0/hr', pins.every((p) => !p.says.includes('$0')), pins.map((p) => p.says).join(' '));
  // The accessible name leads with the place and ends with the price — the two
  // things a pin is for, in that order. It used to be checked by looking for the
  // word "Church" in it, which held only while the map drew the five the village
  // stages; it draws whatever the catalog answers with now, most of it listed by
  // hosts who are not churches, and the product's own copy says venue anyway.
  check(
    'a pin leads with its venue and its suburb, and ends with the price',
    pins.every((p) => /^.+, .+\. (\$|Free|free).*\.$/.test(p.aria ?? '')),
    pins[0].aria
  );
  check('...and its short name is on the tag, under the price', pins.every((p) => p.who.length > 0), pins[0].who);

  // The tag is a target, not a caption: it is the biggest thing a pointer has
  // to aim at on this map, and pressing one must open the venue it belongs to
  // and no other's. Aimed at from the same opening framing each time, because
  // opening a venue pans the map to it.
  //
  // Which tag the pointer finds is not fixed any more: the map draws every
  // venue the catalog answers with, and locally the dev geocoder puts every
  // address a host types on the village centre, so tags do cross other pins.
  // That is not the bug this guards — a press opening something other than what
  // was under it is, and that is what is asserted.
  for (const id of ['grace-community-vienna', 'oakton-baptist', 'merrifield-fellowship', 'dunn-loring-umc']) {
    // A goto that only changes the hash is not a navigation: the page would keep
    // the pan the last venue left the map on.
    await page.goto('about:blank');
    await page.goto(at(url, routes.browse()), { waitUntil: 'networkidle0' });
    await page.waitForFunction('window.__steepleReady === true', { timeout: 25000 });
    await page.evaluate('__steeple.roll.set(1)');
    await wait(3000);
    const tag = await page.evaluate((v) => {
      const n = document.querySelector(`.dm-pin[data-venue="${v}"] .dm-pin__tag`);
      if (!n) return null;
      const b = n.getBoundingClientRect();
      const map = document.querySelector('.dm-map').getBoundingClientRect();
      const at = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      const found = document
        .elementsFromPoint(at.x, at.y)
        .map((e) => e.closest?.('.dm-pin'))
        .find(Boolean);
      return {
        ...at,
        aimed: found?.dataset.venue ?? null,
        onMap: at.x > map.x && at.x < map.right && at.y > map.y && at.y < map.bottom,
      };
    }, id);
    check(`the price tag for ${id} is on the map to be aimed at`, Boolean(tag?.onMap), JSON.stringify(tag));
    if (!tag?.onMap) continue;
    await page.mouse.click(tag.x, tag.y);
    await wait(1100);
    check(
      '...and pressing it opens the venue whose tag it is',
      (await page.evaluate('__steeple.state.venueId')) === tag.aimed,
      `aimed ${tag.aimed}, opened ${await page.evaluate('__steeple.state.venueId')}`
    );
  }
  await page.evaluate('__steeple.setView("village")');
  await wait(1000);

  // Narrow the search: a venue with nothing matching has no price to quote.
  await page.evaluate('__steeple.setFilters(["Music"])');
  await wait(1500);
  const filtered = await page.evaluate(() =>
    [...document.querySelectorAll('.dm-pin')].map((n) => ({
      shows: n.dataset.shows,
      resting: n.classList.contains('is-resting'),
      says: n.querySelector('.dm-pin__price').textContent,
    }))
  );
  check('a narrowed search quotes only the rooms that match', filtered.filter((p) => p.shows === 'price').every((p) => !p.says.includes('–')), filtered.map((p) => p.says).join(' '));
  check('...and a venue with nothing matching says its name instead of a price', filtered.filter((p) => p.resting).every((p) => p.shows === 'name'), JSON.stringify(filtered.filter((p) => p.resting)));
  await page.evaluate('__steeple.setFilters([])');
  await wait(1200);

  console.log('\n2. the head over the results is the answer (§2.7)');
  check('there is no eyebrow naming the area over the results', !(await page.$('.dm-area')));
  check('the Where segment names the area instead', /\w/.test(await page.evaluate('document.querySelector("#dm-where").placeholder')), await page.evaluate('document.querySelector("#dm-where").placeholder'));
  check('the count is the heading', (await page.evaluate('document.querySelector(".dm-count").tagName')) === 'H2');

  console.log('\n3. the search bar\'s highlight fits the bar (§2.7)');
  const radii = await page.evaluate(() =>
    [...document.querySelectorAll('.dm-bar > .dm-seg')].map((n) => getComputedStyle(n).borderRadius)
  );
  check('the middle segments are not ovals', radii.slice(1, -1).every((r) => r === '0px'), radii.join(' | '));
  check('the ends take the bar\'s own rounding', /^999px 0px 0px 999px$/.test(radii[0]) && /^0px 999px 999px 0px$/.test(radii.at(-1)), radii.join(' | '));
  const seg = await rectOf(page, '.dm-seg--when');
  const bar = await rectOf(page, '.dm-bar');
  check('...and it is as tall as the bar', seg.h >= bar.h - 3, `${seg.h} of ${bar.h}`);

  console.log('\n4. the venue sheet\'s standing line (§2.3, §2.4)');
  await page.evaluate('__steeple.setView("venue",{venueId:"grace-community-vienna"})');
  await wait(2000);
  check('the verified mark says the words verbatim', (await textOf(page, '.verified')).includes('Identity verified (SSO)'), await textOf(page, '.verified'));
  const quiet = await page.evaluate(() => {
    const n = document.querySelector('.sheet--venue .verified');
    const css = getComputedStyle(n);
    return { cls: n.className, bg: css.backgroundColor, padding: css.padding };
  });
  check('...quietly: no ground under it', quiet.cls.includes('verified--quiet') && /rgba\(0, 0, 0, 0\)|transparent/.test(quiet.bg), JSON.stringify(quiet));

  const copy = await rectOf(page, '.copyaddr');
  check('the address has a copy affordance beside it', copy !== null);
  if (copy) {
    const copyStack = await stackAt(page, copy.cx, copy.cy);
    check('...with nothing invisible over it', copyStack.some((n) => /copyaddr/.test(n)), copyStack.join(' < '));
    await press(page, '.copyaddr');
    await wait(500);
    check('...and pressing it takes the address', (await page.evaluate('navigator.clipboard.readText()')) === (await textOf(page, '.sheet__address')), await page.evaluate('navigator.clipboard.readText()'));
    check('...with a word about what happened', /copied/i.test(await textOf(page, '.copyaddr__said') ?? ''), await textOf(page, '.copyaddr__said'));
    await page.evaluate('document.querySelector(".copyaddr").focus()');
    check('...reachable by keyboard', (await page.evaluate('document.activeElement.className')).includes('copyaddr'));
  }

  console.log('\n5. an account has a face, a door out and a way in (§2.6, D6)');
  // Re-baselined for the v2 migration: the shelf used to be empty until
  // somebody signed in, and the way in belonged to the flows. It is always
  // there now — a monogram when there is somebody, one quiet word when there
  // is not — because who you are must be answerable at any moment.
  check('signed out, the shelf offers a way in', await shownIn(page, '.account'));
  check('...in one quiet word', (await textOf(page, '.account')) === 'Sign in', await textOf(page, '.account'));
  await press(page, '.account');
  await wait(600);
  check(
    '...which opens the same identity panel the flows use',
    await shownIn(page, '.signin__layer .identity')
  );
  await page.keyboard.press('Escape');
  await wait(400);
  // This section is about the shelf card, not the first-sign-in agreement
  // gate. Accept on the wire before the browser signs the same person in or
  // Escape would dismiss the gate, sign her out, and move the correspondence
  // view back to the village (HARNESS.md — product behavior, not card state).
  const ruth = await signIn('ruth.abara@example.org', 'Ruth Abara');
  await agreeCurrent(ruth.accessToken);
  await page.evaluate(async () => (await import('/src/data/session.js')).signIn({ email: 'ruth.abara@example.org', displayName: 'Ruth Abara' }));
  await wait(900);
  check('signed in, the person is on the shelf', await shownIn(page, '.account'));
  check('...as a monogram', (await textOf(page, '.account__mark')) === 'RA', await textOf(page, '.account__mark'));
  await press(page, '.account');
  await wait(400);
  check('...opening a card with the email on it', (await textOf(page, '.account__email')) === 'ruth.abara@example.org');
  await page.keyboard.press('Escape');
  await wait(400);
  check('...which Escape closes without ascending a view', !(await shownIn(page, '.account__card')) && (await page.evaluate('__steeple.state.view')) === 'venue', await page.evaluate('__steeple.state.view'));

  // The card must not open under a letter or a desk: it is a layer of its own.
  await page.evaluate('__steeple.setView("journal")');
  await wait(1000);
  await press(page, '.account');
  // Wait for the card's own way out to be there, rather than for 400ms and a
  // hope: the inbox behind it is a real fetch, and on a busy machine the card
  // opens later than it does on a quiet one. Reading `.cx` off a null rect is
  // what used to end this run here with a TypeError and leave §6 and §7 unrun.
  const opened = await page
    .waitForSelector('.account__out', { visible: true, timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  check('the card offers the way out', opened);
  const outBox = opened ? await rectOf(page, '.account__out') : null;
  const outStack = outBox ? await stackAt(page, outBox.cx, outBox.cy) : [];
  check('the card stands over an open inbox, not under it', /account__out/.test(outStack[0] ?? ''), outStack.join(' < '));
  await press(page, '.account__out');
  await wait(800);
  check('signing out clears the session', (await page.evaluate(async () => (await import('/src/data/session.js')).isSignedIn())) === false);
  check('...puts the shelf back to the way in', (await textOf(page, '.account')) === 'Sign in', await textOf(page, '.account'));
  check('...and leaves the inbox, which belonged to somebody', (await page.evaluate('__steeple.state.view')) === 'village', await page.evaluate('__steeple.state.view'));

  await page.close();
}

// ═══ 6. the room sheet keeps its photograph with no API behind it (§2.5) ════
//
// A 404 has two meanings: steeple saying "no such published room", and an
// origin where /api/v1 is not served at all answering the way it answers
// everything. api.js turns the listing-detail 404 into null; accepting it as an
// answer left the room sheet with a monogram over a room the bundled seed can
// describe in full, while every other call — which throws on the same 404 —
// fell back and kept its pictures. Here the listing endpoints are absent and
// the rest of the API is not, which is the case the quiet window cannot cover.
{
  const page = await surface({ width: 1440, height: 900, block: /\/api\/v1\/(listings\/by-slug|sitemap)/ });
  console.log('\n6. no listing endpoint, and the room sheet still shows the room (§2.5)');
  const live = await page.evaluate(async () => (await import('/src/data/catalog.js')).isLive());
  check('the rest of the API is answering', live === true, `isLive ${live}`);
  await page.evaluate('__steeple.setView("room",{venueId:"grace-community-vienna",roomId:"fellowship-hall"})');
  await wait(2600);
  const hero = await page.evaluate(() => {
    const el = document.querySelector('.sheet--room .dm-banner--hero');
    const img = el?.querySelector('img');
    return { lettered: el?.classList.contains('is-lettered'), loaded: img?.naturalWidth > 0, src: img?.getAttribute('src') ?? null };
  });
  check('the room banner is a photograph, not a monogram', hero.lettered === false && hero.loaded === true, JSON.stringify(hero));
  await page.close();
}

// ═══ 7. the phone's hot path: pin → panel → back → next pin (§2.2) ══════════
{
  const w = 390;
  const h = 844;
  const page = await surface({ width: w, height: h });
  console.log('\n7. a phone puts a sheet down (§2.2)');

  const tapPin = async () => {
    const p = await page.evaluate(() => {
      const n = [...document.querySelectorAll('.dm-pin')]
        .map((e) => ({ e, b: e.getBoundingClientRect() }))
        .find(({ b }) => b.top > 70 && b.bottom < window.innerHeight - 60 && b.left > 10 && b.right < window.innerWidth - 10);
      return n ? { v: n.e.dataset.venue, x: n.b.x + n.b.width / 2, y: n.b.y + n.b.height * 0.8 } : null;
    });
    if (!p) throw new Error('no pin on the page');
    await page.touchscreen.tap(p.x, p.y);
    await wait(1300);
    return p.v;
  };

  /** One finger on the sheet's handle, dragged and let go. */
  async function putDown(dy, { steps = 10, hold = 24 } = {}) {
    const g = await rectOf(page, '.sheet.is-open .sheet__grab');
    if (!g || g.h === 0) {
      check('there is a handle to put the sheet down by', false);
      return;
    }
    await page.touchscreen.touchStart(g.cx, g.cy);
    for (let i = 1; i <= steps; i += 1) {
      await page.touchscreen.touchMove(g.cx, g.cy + (dy * i) / steps);
      await wait(hold);
    }
    await page.touchscreen.touchEnd();
    await wait(700);
  }

  const first = await tapPin();
  check('a pin opens its church', (await page.evaluate('__steeple.state.view')) === 'venue');
  const sheet = await rectOf(page, '.sheet--venue');
  check('...as a sheet over the map, not a page instead of it', sheet.y > 150 && sheet.y < h * 0.4, `sheet top ${sheet.y} of ${h}`);
  const bandStack = await stackAt(page, w / 2, sheet.y - 40);
  check('...leaving a band of live map above it', bandStack.some((n) => /leaflet|dm-map|dm-pin/.test(n)), bandStack.join(' < '));
  const currentPin = await page.evaluate(() => {
    const n = document.querySelector('.dm-pin.is-current');
    return n ? Math.round(n.getBoundingClientRect().bottom) : null;
  });
  check('...with the church you chose inside it', currentPin !== null && currentPin > 0 && currentPin < sheet.y, `pin ends ${currentPin}, band ends ${sheet.y}`);

  check('the step back is at the top of the sheet, in words', /All spaces/.test(await textOf(page, '.sheet--venue .sheet__up')), await textOf(page, '.sheet--venue .sheet__up'));
  check('...and not at the foot of a scroll', !(await page.$('.sheet--venue .sheet__foot')));
  check('the sheet wears a handle', (await rectOf(page, '.sheet--venue .sheet__grab')) !== null);

  // The next church without going back at all. Which pin a finger lands on is
  // not the pin whose box was measured: the dev geocoder puts every address a
  // host types on the village centre, so locally-listed venues stack, and the
  // topmost one at that point is whichever the map drew last. That is not the
  // bug this guards — going back to the map first, or opening nothing, is. So
  // the tap is aimed and then asked what was actually under it (the same
  // discipline §1 uses on the price tags).
  const other = await page.evaluate((skip) => {
    const top = document.querySelector('.sheet--venue').getBoundingClientRect().top;
    const n = [...document.querySelectorAll('.dm-pin')].find(
      (p) => p.dataset.venue !== skip && p.getBoundingClientRect().bottom < top
    );
    if (!n) return null;
    const b = n.getBoundingClientRect();
    const at = { x: b.x + b.width / 2, y: b.y + b.height * 0.8 };
    const under = document
      .elementsFromPoint(at.x, at.y)
      .map((e) => e.closest?.('.dm-pin'))
      .find(Boolean);
    return { v: n.dataset.venue, aimed: under?.dataset.venue ?? null, ...at };
  }, first);
  check('another church is standing in the band', other !== null && other.aimed !== null, JSON.stringify(other));
  if (other?.aimed) {
    await page.touchscreen.tap(other.x, other.y);
    await wait(1300);
    const opened = await page.evaluate('__steeple.state.venueId');
    check('...and tapping it swaps the sheet without going back first', opened === other.aimed, `aimed ${other.aimed}, opened ${opened} (from ${first})`);
    check('...for another church, not the one already open', opened !== first, `${first} → ${opened}`);
  }

  // room → venue → map, one level at a time
  await press(page, '.sheet--venue .spacecard', { touch: true });
  await wait(1600);
  check('a space card opens the room', (await page.evaluate('__steeple.state.view')) === 'room');
  await putDown(h * 0.45);
  check('putting the room down gives its church back, not the map', (await page.evaluate('__steeple.state.view')) === 'venue', await page.evaluate('__steeple.state.view'));
  await putDown(h * 0.45);
  check('putting the church down gives the map', (await page.evaluate('__steeple.state.view')) === 'village', await page.evaluate('__steeple.state.view'));
  check('...and none of it ever rolled the page back to the title', (await page.evaluate('__steeple.state.roll')) === 1, `roll ${await page.evaluate('__steeple.state.roll')}`);

  // a short drag is not a decision; the handle is a button as well
  await wait(1500);
  await tapPin();
  await putDown(40, { steps: 6, hold: 40 });
  check('a short drag springs back rather than leaving', (await page.evaluate('__steeple.state.view')) === 'venue', await page.evaluate('__steeple.state.view'));
  await page.evaluate('document.querySelector(".sheet--venue .sheet__grab").focus()');
  await page.keyboard.press('Enter');
  await wait(900);
  check('the handle is a button too, and goes back one level', (await page.evaluate('__steeple.state.view')) === 'village', await page.evaluate('__steeple.state.view'));

  // Escape keeps the same meaning
  await page.evaluate('__steeple.setView("room",{venueId:"oakton-baptist",roomId:"gymnasium"})');
  await wait(1200);
  await page.keyboard.press('Escape');
  await wait(800);
  check('Escape from a room lands on its church', (await page.evaluate('__steeple.state.view')) === 'venue', await page.evaluate('__steeple.state.view'));
  await page.keyboard.press('Escape');
  await wait(800);
  check('...and again on the map, never the title', (await page.evaluate('__steeple.state.view')) === 'village' && (await page.evaluate('__steeple.state.roll')) === 1);

  await page.close();
}

await closeBrowsers();
console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
