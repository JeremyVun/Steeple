#!/usr/bin/env node
// Real-input gate for the correspondence world layer (CONTRACT2 §6).
//
// Everything here is driven the way a visitor drives it — real pointer moves,
// real clicks, real key presses — except the correspondence itself, which is
// posted through the demo store exactly as the guest and host surfaces will.
// Then it asserts what the world did about it: lanterns lit, ribbons printed,
// a letter in the air, scaffolding struck, the annex out on the grass and
// pickable.
//
//   node tools/world-test.mjs [baseUrl]        (default http://localhost:5314)
//
// Screenshots land in /tmp/wld-test-<style>-*.png; look at them.

import puppeteer from 'puppeteer';

const base = process.argv[2] ?? 'http://localhost:5314';
const styles = ['diorama', 'atlas'];

let failures = 0;
const log = (...a) => console.log(...a);
function check(name, ok, detail = '') {
  if (!ok) failures++;
  log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

for (const style of styles) {
  log(`\n── ${style} ─────────────────────────────────────────────`);
  // A browser per style: software GL takes its time building a village, and a
  // second page in the same process starves the first one's render loop.
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  const url = `${base}/?style=${style}&q=low`;
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__steepleReady === true', { timeout: 45000 });
  await page.evaluate('__steeple.store.resetDemo()');
  await wait(500);

  const view = () => page.evaluate('__steeple.state.view');
  const venue = () => page.evaluate('__steeple.state.venueId');
  const room = () => page.evaluate('__steeple.state.roomId');
  const debug = (expr) => page.evaluate(`__steeple.world.correspondence.debug.${expr}`);

  // 1. Arrival → village with a real click on the real button.
  for (const b of await page.$$('button')) {
    const t = (await b.evaluate((n) => n.textContent)).trim();
    if (!/find|space/i.test(t)) continue;
    const box = await b.boundingBox();
    if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    break;
  }
  await wait(3000);
  check('arrival → village by pointer', (await view()) === 'village');

  // 2. Keyboard: cycle to a church and descend.
  await page.keyboard.press('Tab');
  await wait(400);
  await page.keyboard.press('Enter');
  await wait(3200);
  const venueId = await venue();
  check('keyboard descends to a venue', (await view()) === 'venue', `venue=${venueId}`);

  // 3. Keyboard into a room of that venue.
  await page.keyboard.press('Tab');
  await wait(400);
  await page.keyboard.press('Enter');
  await wait(3000);
  check('keyboard descends to a room', (await view()) === 'room', `room=${await room()}`);

  // 4. The scenery is scenery: sweeping the pointer across the room card (or
  //    anywhere in the world) must not change what is hovered — buildings are
  //    chosen through the instruments, never picked by the pointer.
  await page.evaluate('__steeple.setHover(null, null)');
  const cardPoint = await page.evaluate(() => {
    const { engine, world, state } = window.__steeple;
    const spot = world.anchors.get(state.venueId)?.rooms?.get(state.roomId);
    if (!spot) return null;
    const v = spot.position.clone();
    v.project(engine.camera);
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
  });
  if (cardPoint) {
    await page.mouse.move(cardPoint.x, cardPoint.y);
    await wait(400);
    await page.mouse.move(cardPoint.x + 40, cardPoint.y + 20);
    await wait(400);
    const hovered = await page.evaluate(
      '[__steeple.state.hoverVenueId, __steeple.state.hoverRoomId]'
    );
    check(
      'pointer over the world picks nothing',
      hovered[0] === null && hovered[1] === null,
      `hover=${JSON.stringify(hovered)}`
    );
  } else {
    check('pointer over the world picks nothing', false, 'no card on screen');
  }

  // 5. Lanterns read the seeded correspondence.
  const lit = await debug("lantern('grace-community-vienna')");
  const quiet = await debug("lantern('merrifield-fellowship')");
  check('lantern lit where letters wait', lit && lit.waiting > 0.5, JSON.stringify(lit));
  check('lantern quiet where none do', quiet && quiet.waiting < 0.05, JSON.stringify(quiet));

  // 6. Booking ribbons: the chorale holds Thursdays in the fellowship hall.
  const mask = await debug("ribbonMask('grace-community-vienna','fellowship-hall')");
  check('ribbon marks the committed weekday', (mask & (1 << 4)) !== 0, `mask=${mask}`);
  const empty = await debug("ribbonMask('grace-community-vienna','youth-activity-room')");
  check('no ribbon where nothing is booked', empty === 0, `mask=${empty}`);

  // 7. A letter is posted: it should be in the air, and the lantern it will
  //    light must wait for it to land.
  await page.evaluate(`__steeple.setView('apply',{venueId:'vienna-presbyterian',roomId:'music-room'})`);
  await wait(2600);
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
  await page.screenshot({ path: `/tmp/wld-test-${style}-envelope.png` });
  await wait(9000);
  check('the letter has landed', (await debug('envelopeFlying')) === false);
  const vp = await debug("lantern('vienna-presbyterian')");
  check('the lantern is lit once it lands', vp && vp.waiting > 0.5, JSON.stringify(vp));

  // 8. An answer: wax at the door (and a bell, silent here — no gesture in
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
  await page.screenshot({ path: `/tmp/wld-test-${style}-seal.png` });
  const settled = await debug("lantern('grace-community-vienna')");
  check('an approved church burns steady', settled && settled.settled > 0.5, JSON.stringify(settled));

  // 9. Publish the annex: scaffolding struck, the room joins the world.
  const picksBefore = await page.evaluate('__steeple.world.pickables.length');
  await page.evaluate(`__steeple.setView('venue',{venueId:'oakton-baptist'})`);
  await wait(3000);
  await page.evaluate(`
    __steeple.store.setOpenHours('oakton-baptist','renovation-annex',
      [0,1,2,3,4,5,6].map((day) => ({ day, start: '08:00', end: '22:00' })));
    __steeple.store.editRoom('oakton-baptist','renovation-annex',{ status: 'published' });
  `);
  await wait(12000);
  await page.screenshot({ path: `/tmp/wld-test-${style}-published.png` });
  check('scaffolding is struck', (await debug('scaffoldStruck')) === true);
  const annexState = await page.evaluate(`(() => {
    const w = __steeple.world;
    const anchor = w.anchors.get('oakton-baptist');
    return {
      anchored: anchor.rooms.has('renovation-annex'),
      pickable: w.pickables.some((p) => p.userData.roomId === 'renovation-annex'),
      picks: w.pickables.length,
    };
  })()`);
  check('the annex has an anchor', annexState.anchored);
  check('the annex is pickable', annexState.pickable, `picks ${picksBefore} → ${annexState.picks}`);

  // 10. A church a host places stands in the world and can be framed.
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

  // 11. Real Esc walks back up the correspondence: apply → room it was opened from.
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

  // 12. And the world is still legible at the top.
  await page.keyboard.press('Escape');
  await wait(2200);
  await page.keyboard.press('Escape');
  await wait(2600);
  check('Esc keeps climbing to the village', (await view()) === 'village', `view=${await view()}`);
  await page.screenshot({ path: `/tmp/wld-test-${style}-village.png` });

  const calls = await page.evaluate('__steeple.engine.renderer.info.render.calls');
  log(`draw calls at village: ${calls}`);
  check('draw calls under budget', calls < 300, `${calls} < 300`);
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  await page.close();
  await browser.close();
}

// ── reduced motion ──────────────────────────────────────────────────────────
// The correspondence still happens; it just stops performing. No bell, no
// drift, and the camera cuts through paper instead of flying.
{
  log('\n── reduced motion (diorama) ─────────────────────────────');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  // `#/desk/...` would land in the village now — hosting is somebody's, and
  // this page is nobody (D4). The village is where this half of the story is.
  await page.goto(`${base}/?style=diorama&q=low#/village`, {
    waitUntil: 'networkidle0',
  });
  await page.waitForFunction('window.__steepleReady === true', { timeout: 45000 });
  await wait(2500);
  check('reduced motion is honoured', (await page.evaluate('__steeple.state.reducedMotion')) === true);
  await page.mouse.click(720, 500); // a real gesture, so only the setting can silence the bell
  await wait(1200);
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
  await browser.close();
}

log(`\n${failures === 0 ? 'all good' : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
