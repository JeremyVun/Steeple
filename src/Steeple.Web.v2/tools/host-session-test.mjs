// A SESSION THAT DIES MID-DRAFT — the one thing the Verify step was still for.
//
// The listing flow lost its Verify step on 2026-08-06: hosting cannot be entered
// without a session, so the step confirmed a fact nobody disputed. Its one real
// job was the session that ends underneath a half-written listing, and that job
// moved to the Publish step's own blocker — which opens the single sign-in panel
// steeple has, over the flow.
//
// That is a stacking claim, an inertness claim and a continuity claim, and none
// of the three survives a screenshot. So it is driven: a whole listing written
// to the point of the press, the session killed, and then real keys into the
// real panel and the real publish afterwards, with the API asked at the end
// whether the row the dead session started actually exists.
//
// Needs the API on localhost:5200 and the app on the given origin.
//
//   node tools/host-session-test.mjs "http://localhost:5341/?q=low&world=off"
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
import { writeRoomPhoto } from './host-photo.mjs';

const url = process.argv[2] ?? 'http://localhost:5332/?q=low&world=off';
const API = 'http://localhost:5200/api/v1';
const PHOTO = writeRoomPhoto('/tmp/steeple-host-session-room.png');
const stamp = Date.now().toString(36);
const venueName = `Lantern Hall ${stamp}`;
const hostEmail = `signin-probe-${stamp}@example.org`;

let checks = 0;
let failures = 0;
const problems = [];
const check = (label, ok, detail = '') => {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
};

const browser = await launch();
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const said = m.text();
    if (said.includes('GL Driver Message') || said.includes('GPU stall')) return;
    problems.push(`[console.error] ${said}`);
  });

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const text = (s) => page.evaluate((sel) => document.querySelector(sel)?.textContent?.trim() ?? null, s);
  const visible = (s) =>
    page.evaluate((sel) => {
      const node = document.querySelector(sel);
      return node ? (node.checkVisibility ? node.checkVisibility() : node.offsetParent !== null) : false;
    }, s);
  async function click(selector, label = selector) {
    const handle = await page.$(selector);
    if (!handle) return check(`click ${label}`, false, 'no element');
    await handle.evaluate((n) => n.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await wait(120);
    const box = await handle.boundingBox();
    if (!box) return check(`click ${label}`, false, 'not laid out');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const top = await page.evaluate(
      (px, py) => {
        const n = document.elementsFromPoint(px, py)[0];
        return n ? `${n.tagName.toLowerCase()}.${n.className || ''}`.slice(0, 60) : '?';
      },
      x,
      y
    );
    await page.mouse.click(x, y);
    await wait(600);
    check(`click ${label}`, true, `topmost: ${top}`);
    return true;
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
  const bearer = () => page.evaluate('__steeple.session.withAccess((t) => Promise.resolve(t))');

  console.log(`\n── a session that dies mid-draft · ${url} ──`);
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__steepleReady === true', { timeout: 25000 });
  await wait(1500);
  await page.evaluate('__steeple.store.resetDemo()');
  await page.evaluate('__steeple.roll.set(1)');
  await wait(300);
  await page.evaluate(`__steeple.session.signIn({email:'${hostEmail}',displayName:'Nell Baird'})`);
  await page.waitForFunction('!!__steeple.session.currentUser()', { timeout: 25000 });
  await page.evaluate('__steeple.setMode("host")');
  await page.waitForFunction('!!document.querySelector(".listing__layer:not([hidden])")', { timeout: 30000 });
  await wait(1200);

  // A whole listing, right up to the press.
  await type('#place-name', venueName);
  await type('#place-description', 'A hall off the lane, lit late, used most evenings.');
  await type('#place-address', '4 Lantern Lane');
  await type('#place-suburb', 'Vienna');
  await type('#place-postcode', '22180');
  await click('[data-action="advance"]', 'Continue');
  await wait(2600);
  await type('#room-name', `Lantern Room ${stamp}`, { clear: true });
  await type('#room-description', 'A square room with high windows and a piano against the wall.');
  await type('#room-capacity', '40', { clear: true });
  await type('#room-price', '24', { clear: true });
  await (await page.$('#room-photo')).uploadFile(PHOTO);
  await wait(400);
  await click('[data-action="advance"]', 'Set availability');
  await wait(2400);
  await page.$$eval('.paint__quick .linkish', (nodes) => {
    for (const n of nodes) if (/Open every day/.test(n.textContent)) n.click();
  });
  await wait(600);
  await click('[data-action="advance"]', 'Review and publish');
  await wait(2400);
  check('standing on Publish with nothing missing', !(await page.$eval('[data-action="advance"]', (n) => n.disabled)));

  // ── the session dies ────────────────────────────────────────────────────
  console.log('\nthe session dies under the draft');
  await page.evaluate('__steeple.session.signOut()');
  await wait(1800);
  check('the draft is still on the page', await visible('.listing'), 'the wizard must outlive the session');
  check('and still on its Publish step', (await text('.steps__step.is-on')) === '4Publish', await text('.steps__step.is-on'));
  check('publishing is not offered while nobody is signed in', await page.$eval('[data-action="advance"]', (n) => n.disabled));
  check('and the step names the session as what is missing', /signed-in account/.test((await text('.guide__list')) ?? ''), await text('.guide__list'));
  check('with a way to answer it', Boolean(await page.$('[data-action="fix-session"]')));
  // Signing out swaps the store to its `:anon` namespace (D6), so the hours
  // written a moment ago are not readable by nobody — they come back with the
  // person. The step is right to name them while they cannot be seen.
  await page.screenshot({ path: '/tmp/steeple-host-session-1-gone.png' });

  // ── the sign-in panel, over the flow ────────────────────────────────────
  console.log('\nthe blocker opens the one sign-in there is');
  await click('[data-action="fix-session"]', 'Sign in');
  await wait(800);
  check('the sign-in panel opened', await visible('.signin'));
  const stacking = await page.evaluate(() => {
    const sheet = document.querySelector('.signin');
    const box = sheet.getBoundingClientRect();
    const stack = document.elementsFromPoint(box.x + box.width / 2, box.y + 24).map(
      (n) => `${n.tagName.toLowerCase()}.${n.className}`
    );
    const layer = document.querySelector('.signin__layer');
    return {
      stack: stack.slice(0, 3),
      inert: layer.hasAttribute('inert') || sheet.closest('[inert]') !== null,
      overListing: stack.findIndex((n) => /signin/.test(n)) < stack.findIndex((n) => /listing/.test(n)) || !stack.some((n) => /listing/.test(n)),
    };
  });
  check('it is the topmost thing where it is drawn', stacking.overListing, stacking.stack.join(' > '));
  check('and nothing has made it inert', !stacking.inert);
  await page.screenshot({ path: '/tmp/steeple-host-session-2-signin.png' });

  // A dev build opens the panel on its one-tap addresses; the way back to the
  // same account is the email form beside them.
  if (!(await page.$('.signin #identity-email'))) {
    await page.$$eval('.signin .identity__actions .linkish', (nodes) => {
      for (const n of nodes) if (/use an email/.test(n.textContent)) n.click();
    });
    await wait(500);
  }
  // Real keys into the real panel, over the open flow.
  const emailField = await page.$('.signin #identity-email');
  check('the panel offers a real sign-in form', Boolean(emailField));
  if (emailField) {
    await type('.signin #identity-email', hostEmail);
    await type('.signin #identity-name', 'Nell Baird');
    await click('.signin .identity__form .pill', 'Continue (sign in again)');
    await wait(3000);
  }
  check('signed back in', Boolean(await page.evaluate('__steeple.session.currentUser()')));
  check('the sign-in panel let itself out', !(await visible('.signin')));
  check('and the draft is still where it was left', await visible('.listing'));
  check('still on Publish', (await text('.steps__step.is-on')) === '4Publish', await text('.steps__step.is-on'));
  await page.screenshot({ path: '/tmp/steeple-host-session-3-back.png' });

  // ── and the publish goes through ────────────────────────────────────────
  console.log('\nand the listing finishes');
  check('publishing is offered again', !(await page.$eval('[data-action="advance"]', (n) => n.disabled)), await text('.listing__hint'));
  await click('[data-action="advance"]', 'Publish this space');
  await wait(4500);
  const token = await bearer();
  const venues = await fetch(`${API}/manage/venues`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json());
  const mine = venues.find((v) => v.name === venueName);
  check('steeple holds the venue the dead session started', Boolean(mine), JSON.stringify(venues));
  const detail = mine
    ? await fetch(`${API}/manage/venues/${mine.id}`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json())
    : null;
  check('with the space on it', detail?.rooms?.length === 1, JSON.stringify(detail?.rooms?.map((r) => r.name)));
  check('and a publish request against it', Boolean(detail?.rooms?.[0]?.publishRequestedAtUtc), detail?.rooms?.[0]?.publishRequestedAtUtc);
  await page.screenshot({ path: '/tmp/steeple-host-session-4-published.png' });

  console.log(`\n${failures ? 'FAILURES' : 'all clear'}: ${checks - failures}/${checks} checks passed`);
  if (problems.length) for (const p of [...new Set(problems)]) console.log(`  ${p}`);
  else console.log('zero console errors');
} finally {
  await closeBrowsers();
}
process.exit(failures ? 1 : 0);
