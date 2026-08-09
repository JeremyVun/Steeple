#!/usr/bin/env node
// View-only splash and correspondence-world gate.
//
// Navigation uses real input. Correspondence is posted through the demo store,
// then the suite asserts the visible splash reactions that remain: lanterns,
// post, scaffolding, and a newly placed venue.
//
//   node tools/world-test.mjs [baseUrl]        (default http://localhost:5314)
//
// Screenshots land in /tmp/wld-test-atlas-*.png; look at them.

import { closeBrowsers, isEnvironmentNoise, launch } from './fixtures.mjs';

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

const base = process.argv[2] ?? 'http://localhost:5314';

let failures = 0;
const log = (...a) => console.log(...a);
function check(name, ok, detail = '') {
  if (!ok) failures++;
  log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

{
  const style = 'Atlas';
  log(`\n── ${style} ─────────────────────────────────────────────`);
  const browser = await launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    // A missing local API is an expected catalog-fallback state for this
    // world-only gate; Chromium reports the proxy's 502 as a console error.
    if (
      m.type() === 'error' &&
      !isEnvironmentNoise(m) &&
      !m.text().includes('status of 502')
    ) {
      errors.push(m.text());
    }
  });

  const url = `${base}/?q=low`;
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__steepleReady === true', { timeout: 45000 });
  await page.evaluate('__steeple.store.resetDemo()');
  await wait(500);

  const view = () => page.evaluate('__steeple.state.view');
  const room = () => page.evaluate('__steeple.state.roomId');
  const debug = (expr) => page.evaluate(`__steeple.world.correspondence.debug.${expr}`);

  // 1. Arrival → product and back with real controls.
  await page.click('.arrival__cta');
  await page.waitForFunction('__steeple.state.roll === 1', { timeout: 30000 });
  check('arrival → village by pointer', (await view()) === 'village');
  await page.click('.wordmark');
  await page.waitForFunction('__steeple.state.roll === 0', { timeout: 30000 });
  check('the wordmark restores the title scene', (await view()) === 'arrival');

  // 5. Lanterns read the seeded correspondence.
  const lit = await debug("lantern('grace-community-vienna')");
  const quiet = await debug("lantern('merrifield-fellowship')");
  check('lantern lit where letters wait', lit && lit.waiting > 0.5, JSON.stringify(lit));
  check('lantern quiet where none do', quiet && quiet.waiting < 0.05, JSON.stringify(quiet));

  // 3. A letter is posted: it should be in the air, and the lantern it will
  //    light must wait for it to land.
  await page.evaluate(`
    // Any seeded date will do. Read it from the parish's own post rather than
    // from "your requests": nobody is signed in here, and an inbox belongs to
    // somebody (D6) — signed out there is none to read.
    //
    // The store holds steeple's own documents and nothing else since
    // v2_migration Phase 2, so a letter arrives here the way a real one does:
    // as an ApplicationDto handed to the mirror. The village animates what
    // changed about it, not what a local mutator was called (flows/world).
    const today = __steeple.store.venueApplications('grace-community-vienna')[0].startDate;
    __steeple.store.mirrorApplication({
      id: '0c0c0c0c-0000-4000-8000-00000000c001',
      roomId: '0d0d0d0d-0000-4000-8000-00000000d001',
      roomName: 'Music Room', venueName: 'Vienna Presbyterian Church',
      venueSlug: 'vienna-presbyterian', roomSlug: 'music-room',
      organizer: { id: 'world-test-organizer', displayName: 'Chamber Group', ratingSummary: null },
      activityType: 'music', groupSize: 12,
      schedule: { frequency: 'oneOff', startDate: today, endDate: today,
                  daysOfWeek: null, startTime: '10:00:00', endTime: '12:00:00' },
      intentText: 'A rehearsal for our small chamber group.',
      status: 'pending', createdAtUtc: new Date().toISOString(),
      decidedAtUtc: null, expiresAtUtc: new Date(Date.now() + 12096e5).toISOString(),
      bookingId: null, messageCount: 0, messages: [],
    });
  `);
  await wait(900);
  check('a posted letter is in the air', (await debug('envelopeFlying')) === true);
  await page.screenshot({ path: '/tmp/wld-test-atlas-envelope.png' });
  await wait(9000);
  check('the letter has landed', (await debug('envelopeFlying')) === false);
  await page.waitForFunction(
    "__steeple.world.correspondence.debug.lantern('vienna-presbyterian')?.waiting > 0.5",
    { timeout: 30000 }
  );
  const vp = await debug("lantern('vienna-presbyterian')");
  check('the lantern is lit once it lands', vp && vp.waiting > 0.5, JSON.stringify(vp));

  // 4. An answer: wax at the door (and a bell, silent here — no gesture in
  //    this page yet is impossible, we clicked, so it may ring quietly).
  // Not by standing on the desk: since v2_migration Phase 2 a desk belongs to a
  // signed-in manager and nobody is signed in here (D4). The wax at the door is
  // the world's answer to the answer arriving, wherever the visitor is standing.
  await wait(1200);
  await page.evaluate((id) => {
      // Approving is steeple's, and the village animates the answer arriving:
      // the same request, mirrored back with the status it now has.
      const app = window.__steeple.store.getApplication(id);
      window.__steeple.store.mirrorApplication({
        id: app.id,
        roomId: '0e0e0e0e-0000-4000-8000-00000000e001',
        roomName: app.roomId, venueName: app.venueId,
        venueSlug: app.venueId, roomSlug: app.roomId,
        organizer: { id: app.organizerId, displayName: app.organizerName ?? 'An organizer', ratingSummary: null },
        activityType: String(app.activityType).toLowerCase(), groupSize: app.groupSize,
        schedule: {
          frequency: app.frequency === 'weekly' ? 'recurringWeekly' : 'oneOff',
          startDate: app.startDate, endDate: app.endDate ?? app.startDate,
          daysOfWeek: null, startTime: app.startTime + ':00', endTime: app.endTime + ':00',
        },
        intentText: app.intentText, status: 'approved',
        createdAtUtc: app.createdAt, decidedAtUtc: new Date().toISOString(),
        expiresAtUtc: app.expiresAt, bookingId: null, messageCount: 0, messages: [],
      });
    }, 'app-sparrows-mornings');
  await wait(1400);
  await page.screenshot({ path: '/tmp/wld-test-atlas-seal.png' });
  const settled = await debug("lantern('grace-community-vienna')");
  check('an approved church burns steady', settled && settled.settled > 0.5, JSON.stringify(settled));

  // 5. Publishing the annex strikes the visible scaffolding.
  await page.evaluate(`
    __steeple.store.setOpenHours('oakton-baptist','renovation-annex',
      [0,1,2,3,4,5,6].map((day) => ({ day, start: '08:00', end: '22:00' })));
    __steeple.store.editRoom('oakton-baptist','renovation-annex',{ status: 'published' });
  `);
  await wait(12000);
  await page.screenshot({ path: '/tmp/wld-test-atlas-published.png' });
  check('scaffolding is struck', (await debug('scaffoldStruck')) === true);
  // 6. A church a host places stands in the splash and joins its framing.
  await page.evaluate(`__steeple.store.upsertPlacedVenue({
    id: 'new-hope-vienna', name: 'New Hope Chapel', lat: 38.8955, lng: -77.276,
    address: '900 Courthouse Road, Vienna',
  })`);
  await wait(600);
  const placed = await page.evaluate(`(() => {
    const a = __steeple.world.anchors.get('new-hope-vienna');
    return a ? { x: Math.round(a.position.x), z: Math.round(a.position.z) } : null;
  })()`);
  check('a placed church joins the anchors', Boolean(placed), JSON.stringify(placed));

  // 7. Real Esc walks back up product correspondence.
  await page.evaluate('__steeple.roll.set(1)');
  await page.evaluate(`__steeple.setView('room',{venueId:'dunn-loring-umc',roomId:'art-studio'})`);
  await wait(2600);
  await page.evaluate(`__steeple.setView('apply',{venueId:'dunn-loring-umc',roomId:'art-studio'})`);
  await wait(2600);
  await page.keyboard.press('Escape');
  await wait(2600);
  check(
    'Esc returns from the letter to the room it was written at',
    (await view()) === 'room' && (await room()) === 'art-studio',
    `view=${await view()} room=${await room()}`
  );

  // 8. Esc stops at the product root; the wordmark restores the splash.
  await page.keyboard.press('Escape');
  await wait(2200);
  await page.keyboard.press('Escape');
  await wait(2600);
  check('Esc keeps climbing to the village', (await view()) === 'village', `view=${await view()}`);
  await page.click('.wordmark');
  await page.waitForFunction('__steeple.state.roll === 0', { timeout: 30000 });
  await page.screenshot({ path: '/tmp/wld-test-atlas-village.png' });

  const calls = await page.evaluate('__steeple.engine.renderer.info.render.calls');
  log(`draw calls at village: ${calls}`);
  check('draw calls under budget', calls < 300, `${calls} < 300`);
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  await page.close();
  await closeBrowsers();
}

// ── reduced motion ──────────────────────────────────────────────────────────
// The correspondence still happens; it just stops performing. No bell or drift.
{
  log('\n── reduced motion (Atlas) ─────────────────────────────');
  const browser = await launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (
      m.type() === 'error' &&
      !isEnvironmentNoise(m) &&
      !m.text().includes('status of 502')
    ) {
      errors.push(m.text());
    }
  });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  // `/desk/...` would land in the village now — hosting is somebody's, and
  // this page is nobody (D4). The village is where this half of the story is.
  //
  // Loaded at the root, and put past the roll afterwards: a cold *route* is a
  // product-first boot (docs/contracts/seo.md SEO-D6) — no engine, no world, nothing for a
  // world suite to ask about — while the village's own arrival still raises
  // one. Same place, through the door this suite is about.
  await page.goto(`${base}/?q=low`, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__steepleReady === true', { timeout: 45000 });
  check('reduced motion is honoured', (await page.evaluate('__steeple.state.reducedMotion')) === true);
  check(
    'the bell stays silent',
    (await page.evaluate('__steeple.world.correspondence.debug.bellArmed')) === false
  );
  await page.evaluate((id) => {
      // Approving is steeple's, and the village animates the answer arriving:
      // the same request, mirrored back with the status it now has.
      const app = window.__steeple.store.getApplication(id);
      window.__steeple.store.mirrorApplication({
        id: app.id,
        roomId: '0e0e0e0e-0000-4000-8000-00000000e001',
        roomName: app.roomId, venueName: app.venueId,
        venueSlug: app.venueId, roomSlug: app.roomId,
        organizer: { id: app.organizerId, displayName: app.organizerName ?? 'An organizer', ratingSummary: null },
        activityType: String(app.activityType).toLowerCase(), groupSize: app.groupSize,
        schedule: {
          frequency: app.frequency === 'weekly' ? 'recurringWeekly' : 'oneOff',
          startDate: app.startDate, endDate: app.endDate ?? app.startDate,
          daysOfWeek: null, startTime: app.startTime + ':00', endTime: app.endTime + ':00',
        },
        intentText: app.intentText, status: 'approved',
        createdAtUtc: app.createdAt, decidedAtUtc: new Date().toISOString(),
        expiresAtUtc: app.expiresAt, bookingId: null, messageCount: 0, messages: [],
      });
    }, 'app-chess-club');
  await wait(1500);
  await page.screenshot({ path: '/tmp/wld-test-reduced-seal.png' });
  const settled = await page.evaluate(
    "__steeple.world.correspondence.debug.lantern('grace-community-vienna')"
  );
  check('the church still shows its answer', settled && settled.settled > 0.4, JSON.stringify(settled));
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await closeBrowsers();
}

log(`\n${failures === 0 ? 'all good' : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
