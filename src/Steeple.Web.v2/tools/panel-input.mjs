// REAL-INPUT GATE for the property sheets (CONTRACT5 §3).
//
// Real mouse and real keys only — no debug API for anything a visitor does —
// because screenshots have lied to us before: a closed overlay once intercepted
// every pointer event while every shot looked perfect. What this proves:
//
//   · a click on a space card in the church sheet opens that space
//   · the card answers the pointer at all — hover reaches the bus
//   · the request CTA opens the booking sheet
//   · and the room sheet is STILL THERE behind it: on the page, visible,
//     inert, and not rebuilt (a marker set on its DOM survives the round trip)
//   · leaving the booking sheet gives that same sheet back, live again
//   · nothing dead is over the card, the CTA, or the sheet behind the overlay
//
//   node tools/panel-input.mjs "http://localhost:5322/?q=low"
import { closeBrowsers, launch } from './fixtures.mjs';

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

const url = process.argv[2] ?? 'http://localhost:5322/?q=low';
const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

let failures = 0;
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  if (m.text().includes('GL Driver') || (m.location?.()?.url ?? '').includes('/api/v1/')) return;
  errors.push(`[console] ${m.text()}`);
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const state = (key) => page.evaluate(`__steeple.state.${key}`);

function check(label, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function box(selector) {
  const handle = await page.$(selector);
  const b = await handle?.boundingBox();
  if (!b) throw new Error(`no box for ${selector}`);
  return { ...b, cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
}

/** What the pointer would actually hit, top first. Dead overlays show up here. */
const stack = (x, y) =>
  page.evaluate(
    (px, py) =>
      document
        .elementsFromPoint(px, py)
        .slice(0, 4)
        .map((n) => `${n.tagName.toLowerCase()}.${(n.className.baseVal ?? n.className ?? '').toString().split(' ')[0]}`),
    x,
    y
  );

async function ready(target) {
  await page.goto('about:blank');
  await page.goto(target, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__steepleReady === true', { timeout: 25000 });
  await page.evaluate('__steeple.roll.set(1)');
  await wait(2000);
}

for (const style of ['diorama', 'atlas']) {
  const target = `${url}${url.includes('?') ? '&' : '?'}style=${style}#/venue/grace-community-vienna`;
  console.log(`\n──── ${style} ────`);
  await ready(target);
  await wait(1200);

  // 1. the cards
  const card = await box('.spaces__item:nth-child(2) .spacecard');
  const onCard = await stack(card.cx, card.cy);
  check('the top of the stack over a space card is the card', onCard[0].startsWith('span') || onCard.some((n) => n.includes('spacecard')), onCard.join(' | '));

  await page.mouse.move(card.cx, card.cy);
  await wait(400);
  check('hovering a card reaches the bus', (await state('hoverRoomId')) === 'youth-activity-room', String(await state('hoverRoomId')));

  await page.mouse.click(card.cx, card.cy);
  await wait(1200);
  check(
    'a real click on the card opens that space',
    (await state('view')) === 'room' && (await state('roomId')) === 'youth-activity-room',
    `${await state('view')} / ${await state('roomId')}`
  );

  // A mark on the sheet's own DOM. If the sheet is rebuilt at any point in the
  // round trip below, this is gone — and "exactly as it was left" is a lie.
  await page.evaluate(() => {
    document.querySelector('.sheet--room .sheet__title').dataset.mark = 'w6b';
  });

  // 2. into the booking sheet, with a real click on the CTA
  const cta = await box('.sheet--room .pill--primary');
  const onCta = await stack(cta.cx, cta.cy);
  check('nothing is over the request CTA', onCta[0].includes('pill'), onCta.join(' | '));
  await page.mouse.click(cta.cx, cta.cy);
  await wait(1400);
  check('the CTA opens the booking sheet', (await state('view')) === 'apply', String(await state('view')));

  // 3. THE BACKGROUND GUARANTEE
  const behind = await page.evaluate(() => {
    const sheet = document.querySelector('.sheet--room');
    if (!sheet) return { mounted: false };
    const r = sheet.getBoundingClientRect();
    const css = getComputedStyle(sheet);
    return {
      mounted: true,
      open: sheet.classList.contains('is-open'),
      behindClass: sheet.classList.contains('is-behind'),
      inert: sheet.hasAttribute('inert'),
      hidden: sheet.getAttribute('aria-hidden'),
      visible: css.visibility === 'visible' && Number(css.opacity) > 0.9 && r.width > 100 && r.height > 100,
      onScreen: r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight,
      mark: document.querySelector('.sheet--room .sheet__title')?.dataset.mark ?? null,
      scrollTop: sheet.querySelector('.sheet__body').scrollTop,
    };
  });
  check('the room sheet is still mounted behind the booking sheet', behind.mounted && behind.open, JSON.stringify(behind));
  check('...and visible on the page, not hidden', behind.visible && behind.onScreen);
  check('...and out of reach: inert, aria-hidden', behind.inert && behind.hidden === 'true');
  check('...and not rebuilt', behind.mark === 'w6b', String(behind.mark));

  // A point over the held sheet and clear of the overlay: the backdrop. What
  // lands here must be the page, never the sheet — the sheet behind an overlay
  // must not swallow the click that puts the overlay down.
  const railBox = await box('.sheet--room');
  const overBehind = await stack(railBox.x + railBox.width - 24, railBox.y + railBox.height / 2);
  check(
    'the sheet behind the overlay intercepts nothing',
    !overBehind[0].includes('sheet') && !overBehind[0].includes('spacecard') && !overBehind[0].includes('pill'),
    overBehind.join(' | ')
  );
  const backdropClosed = await page.evaluate((x, y) => {
    // Does a click there reach a listener that could close the overlay, or is
    // it stopped by scenery? Watch the document, click, and report.
    return new Promise((resolve) => {
      const seen = (e) => {
        document.removeEventListener('click', seen, true);
        resolve(e.target.tagName.toLowerCase());
      };
      document.addEventListener('click', seen, true);
      document.elementFromPoint(x, y).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      setTimeout(() => resolve('nothing'), 300);
    });
  }, railBox.x + railBox.width - 24, railBox.y + railBox.height / 2);
  check('a click on the backdrop is seen by the page', backdropClosed !== 'nothing', backdropClosed);

  const composer = await box('.composer, .guest__surface.is-open > *');
  const onComposer = await stack(composer.cx, composer.cy);
  check('the booking sheet itself is on top where it is', onComposer.length > 0, onComposer.join(' | '));

  // 4. and back out, with a real key
  await page.keyboard.press('Escape');
  await wait(1600);
  const back = await page.evaluate(() => {
    const sheet = document.querySelector('.sheet--room');
    return {
      view: __steeple.state.view,
      open: sheet.classList.contains('is-open'),
      behindClass: sheet.classList.contains('is-behind'),
      inert: sheet.hasAttribute('inert'),
      hidden: sheet.getAttribute('aria-hidden'),
      mark: document.querySelector('.sheet--room .sheet__title')?.dataset.mark ?? null,
    };
  });
  check('Esc puts the booking sheet down and returns to the room', back.view === 'room' && back.open, JSON.stringify(back));
  check('...the same sheet, live again', back.mark === 'w6b' && !back.inert && !back.behindClass && back.hidden === 'false');

  const ctaAgain = await box('.sheet--room .pill--primary');
  const onCtaAgain = await stack(ctaAgain.cx, ctaAgain.cy);
  check('the CTA answers the pointer again', onCtaAgain[0].includes('pill'), onCtaAgain.join(' | '));
  await page.mouse.click(ctaAgain.cx, ctaAgain.cy);
  await wait(1400);
  check('...and it still opens the booking sheet', (await state('view')) === 'apply', String(await state('view')));
  await page.keyboard.press('Escape');
  await wait(1200);

  // 5. up to the church again, by its own back link
  const up = await box('.sheet--room .sheet__up');
  await page.mouse.click(up.cx, up.cy);
  await wait(1200);
  check('the sheet climbs back to the church', (await state('view')) === 'venue', String(await state('view')));
  check('the church sheet is the one on the page', await page.evaluate('!!document.querySelector(".sheet--venue.is-open")'));
  check('no sheet scrolls inside itself', await page.evaluate(() => {
    const body = document.querySelector('.sheet--venue .sheet__body');
    return body.scrollHeight <= body.clientHeight;
  }));
}

console.log(errors.length ? `\n${errors.length} console problem(s):\n${errors.join('\n')}` : '\nno console errors');
console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
await closeBrowsers();
process.exit(failures === 0 && errors.length === 0 ? 0 : 1);
