// One-off runtime verification of the agreements gate (2026-08-07).
//
// Flags/env: same as every suite — ONE API per run. Dev graph only:
//   STEEPLE_API defaults to http://localhost:5200/api/v1, page is
//   http://localhost:5173 (vite dev, proxies /api → :5200).
//
// What it proves, with real browser events:
//   1. a fresh panel sign-in is shown the agreement ask in plain words
//      (title swap, the two bullets, both document links)
//   2. "Not now — sign out" signs out
//   3. Escape on the panel while an acceptance is owed signs out
//   4. a programmatic (harness-door) sign-in that never agrees gets the gate
//      raised over it by the watchdog
//   5. a reload with an un-agreed session held gets the gate at boot
//   6. "Agree and continue" records both documents and ends the asking
//   7. a flow waiting on the sign-in ("I have space to share") does not open
//      behind a decline — and still opens after an agree
import { call, launch, closeBrowsers, paceAuth, signInPage, stamp } from './fixtures.mjs';

const URL = process.env.STEEPLE_WEB ?? 'http://localhost:5173/';
let failures = 0;
const check = (name, ok, detail = '') => {
  failures += ok ? 0 : 1;
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launch();
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const boot = async () => {
    await page.evaluate('__steeple.roll.set(1)');
    await page.waitForFunction('__steeple.state.roll === 1', { timeout: 20000 });
    await page.waitForSelector('.account', { timeout: 30000 });
  };
  await page.goto(URL, { waitUntil: 'networkidle2' });
  await boot();

  const visible = (sel) =>
    page.evaluate((s) => {
      const node = document.querySelector(s);
      return Boolean(node) && (node.checkVisibility ? node.checkVisibility() : !node.hidden);
    }, sel);
  const text = (sel) => page.evaluate((s) => document.querySelector(s)?.textContent ?? '', sel);
  const signedIn = () => page.evaluate(() => Boolean(window.__steeple.session.currentUser()));
  const clickLinkish = (pattern) =>
    page.evaluate((p) => {
      const button = [...document.querySelectorAll('.signin .linkish, .signin .pill')].find((n) =>
        new RegExp(p, 'i').test(n.textContent)
      );
      if (!button) return false;
      button.click();
      return true;
    }, String(pattern));

  // ── 1. a fresh sign-in through the shelf panel sees the ask, plainly ──────
  console.log('1. the ask, in plain words');
  const guest = { email: `gate-${stamp}@demo.steeple.test`, name: 'Gate Verifier' };
  await page.click('.account');
  await page.waitForSelector('.signin__layer:not([hidden]) .identity', { timeout: 10000 });
  await clickLinkish('use an email');
  await page.waitForSelector('.signin #identity-email', { timeout: 10000 });
  await page.click('.signin #identity-email');
  await page.keyboard.type(guest.email, { delay: 4 });
  await page.click('.signin #identity-name');
  await page.keyboard.type(guest.name, { delay: 4 });
  await paceAuth();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !!document.querySelector('.signin .identity__legal'), {
    timeout: 20000,
  });
  check('the title stops saying "Sign in"', /Before you carry on/.test(await text('.signin .identity__title')), await text('.signin .identity__title'));
  const legal = await text('.signin .identity__legal');
  check('the legal line names both documents', /Terms & safety/.test(legal) && /Privacy policy/.test(legal), legal);

  // ── 2. "Not now — sign out" does what it says ─────────────────────────────
  console.log('2. declining signs out');
  check('the decline says what it does', await clickLinkish('Not now — sign out'));
  await wait(600);
  check('the session is gone', !(await signedIn()));
  check('the panel is gone', !(await visible('.signin .identity')));

  // ── 3. Escape while owed is also declining ────────────────────────────────
  console.log('3. Escape while owed signs out');
  await page.click('.account');
  await page.waitForSelector('.signin__layer:not([hidden]) .identity', { timeout: 10000 });
  await clickLinkish('use an email');
  await page.waitForSelector('.signin #identity-email', { timeout: 10000 });
  await page.click('.signin #identity-email');
  await page.keyboard.type(guest.email, { delay: 4 });
  await page.click('.signin #identity-name');
  await page.keyboard.type(guest.name, { delay: 4 });
  await paceAuth();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !!document.querySelector('.signin .identity__legal'), {
    timeout: 20000,
  });
  await page.keyboard.press('Escape');
  await wait(600);
  check('Escape signed the un-agreed account out', !(await signedIn()));

  // ── 4. the harness door raises no ask — the watchdog does ─────────────────
  console.log('4. a sign-in that skipped the panel is gated');
  await signInPage(page, guest.email, guest.name);
  await page.waitForFunction(() => !!window.__steeple.session.currentUser(), { timeout: 20000 });
  await page.waitForFunction(
    () => {
      const node = document.querySelector('.signin .identity__legal');
      return Boolean(node) && node.checkVisibility();
    },
    { timeout: 15000 }
  );
  check('the gate rose on its own', true);

  // ── 5. a reload with the debt still owed is gated at boot ─────────────────
  console.log('5. the gate returns at boot');
  await page.reload({ waitUntil: 'networkidle2' });
  await boot();
  await page.waitForFunction(
    () => {
      const node = document.querySelector('.signin .identity__legal');
      return Boolean(node) && node.checkVisibility();
    },
    { timeout: 25000 }
  );
  check('an un-agreed session is met by the gate', true);

  // ── 6. agreeing records and ends the asking ───────────────────────────────
  console.log('6. agreeing settles it');
  check('the button still says what pressing it does', await clickLinkish('Agree and continue'));
  await wait(1800);
  const token = await page.evaluate(() =>
    window.__steeple.session.withAccess((t) => Promise.resolve(t))
  );
  const me = await call('GET', '/me', { token });
  const recorded = (me.body?.agreements ?? []).map((a) => a.docType).sort();
  check('both documents recorded', recorded.join(' ') === 'privacy tos', recorded.join(' '));
  check('still signed in', await signedIn());
  await wait(2500);
  check('the gate stays down once agreed', !(await visible('.signin .identity')));
  await page.reload({ waitUntil: 'networkidle2' });
  await boot();
  await wait(5000);
  check('and stays down across a reload', !(await visible('.signin .identity')));
  check('with the session kept', await signedIn());

  // ── 7. a waiting flow is not opened by a declined sign-in ─────────────────
  console.log('7. "I have space to share" waits for the whole answer');
  await page.evaluate('__steeple.session.signOut()');
  await wait(800);
  const hopeful = { email: `gate-host-${stamp}@demo.steeple.test`, name: 'Hopeful Host' };
  const signInFromSwitch = async () => {
    await page.click('.porchswitch');
    await page.waitForSelector('.signin__layer:not([hidden]) .identity', { timeout: 10000 });
    await clickLinkish('use an email');
    await page.waitForSelector('.signin #identity-email', { timeout: 10000 });
    await page.click('.signin #identity-email');
    await page.keyboard.type(hopeful.email, { delay: 4 });
    await page.click('.signin #identity-name');
    await page.keyboard.type(hopeful.name, { delay: 4 });
    await paceAuth();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !!document.querySelector('.signin .identity__legal'), {
      timeout: 20000,
    });
  };
  await signInFromSwitch();
  await clickLinkish('Not now — sign out');
  await wait(1200);
  check('declining signed the hopeful host out', !(await signedIn()));
  check('and the listing flow did not open behind it', !(await visible('.listing')));
  // The desk hides by is-open/inert, not display — class, not checkVisibility.
  check('nor a desk', !(await page.$('.desk.is-open')));

  await signInFromSwitch();
  await clickLinkish('Agree and continue');
  await page.waitForFunction(
    () => {
      const node = document.querySelector('.listing');
      return Boolean(node) && node.checkVisibility();
    },
    { timeout: 20000 }
  );
  check('while agreeing carries the flow through to the listing sheet', true);
  check('signed in', await signedIn());
} finally {
  await closeBrowsers();
}
console.log(failures ? `\n${failures} FAILED` : '\nall green');
process.exit(failures ? 1 : 0);
