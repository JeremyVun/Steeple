// npm run test:composer [--quick] — owns a flat Vite server and isolated Chrome profile.
// API responses are deterministic intercepted fixtures; no live records or payment calls.
// All form actions use real pointer/keyboard events. Dates shift from today. Screenshots
// and geometry reports live in a unique /private/tmp/steeple-composer-a-visual-web-* directory.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import puppeteer from 'puppeteer';
import { AxePuppeteer } from '@axe-core/puppeteer';
import { addDays, nextWeekday, todayIso, materializeDates } from '../src/data/store/schedule.js';
import { DOCUMENTS } from '../src/data/agreements.js';
const output = await fs.mkdtemp('/private/tmp/steeple-composer-a-visual-web-');
const port = await new Promise((resolve) => { const probe = createServer(); probe.listen(0, '127.0.0.1', () => { const n = probe.address().port; probe.close(() => resolve(n)); }); });
const origin = `http://127.0.0.1:${port}`;
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { env: { ...process.env, VITE_WORLD: 'off', VITE_DEBUG: 'on' }, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
let serverLog = '';
vite.stderr.on('data', (chunk) => { serverLog += chunk; });
const dates = { first: nextWeekday(addDays(todayIso(), 7), 2) };
dates.last = addDays(dates.first, 70);
const rules = 'Adult supervision required for under-18 groups. Leave the room as you found it.';
const plans = 'Little Sparrows is a parent-run playgroup for children under four. We would love a regular Tuesday and Thursday morning: songs, free play and a shared snack, with every child accompanied by a parent or carer. We bring our own mats and toys and leave the room as we found it.';
const dayTokens = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const roomId = '11111111-1111-1111-1111-111111111111';
const user = { id: '22222222-2222-2222-2222-222222222222', displayName: 'Composer Reader', email: 'composer@example.test', createdAtUtc: '2026-01-01T00:00:00Z' };
const room = { roomId, roomSlug: 'youth-activity-room', roomName: 'Youth Activity Room', description: 'A carpeted multipurpose room ideal for children’s programs, tutoring, and small group activities.', capacity: 30, pricePerHour: 15, currency: 'USD', houseRules: rules, activities: ['children', 'education'], amenities: [], accessibility: [], photos: [], rating: null, venue: { venueId: '33333333-3333-3333-3333-333333333333', name: 'Grace Community', slug: 'grace-community-vienna', suburb: 'Vienna', postcode: '22180', latitude: 38.9, longitude: -77.2, addressLine: '123 Community Lane', venueType: 'church' }, openHours: dayTokens.map((dayOfWeek) => ({ dayOfWeek, windows: [{ startTime: '08:00', endTime: '22:00' }] })) };
let state = { signedIn: false, mode: 'manual', payments: false, availability: 'ready', submit: 'error', long: false, emptyRules: false, checks: [], posts: [] };
let lastApplication = null;
const recorded = [];
const pageErrors = [];
const checks = [];
function check(name, condition) { assert.ok(condition, name); checks.push(name); console.log(`PASS ${name}`); }
function scheduleDates(wire) { return materializeDates({ ...wire, frequency: wire.frequency === 'recurringWeekly' ? 'weekly' : 'oneOff', daysOfWeekMask: (wire.daysOfWeek ?? []).reduce((mask, token) => mask | (1 << dayTokens.indexOf(token)), 0) }); }
async function intercept(request) {
  const url = new URL(request.url());
  if (url.origin !== origin) return request.abort();
  if (!url.pathname.startsWith('/api/')) return request.continue();
  const pathname = url.pathname.replace('/api/v1', '');
  const answer = (body, status = 200) => request.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (pathname === '/flags') return answer({ 'payments.enabled': state.payments, 'listing.availability': true });
  if (pathname === '/auth/refresh') return state.signedIn ? answer({ accessToken: 'composer-fixture', user }) : answer({}, 401);
  if (pathname === '/auth/sessions' && request.method() === 'POST') { state.signedIn = true; return answer({ accessToken: 'composer-fixture', user }); }
  if (pathname === '/me') return answer({ ...user, agreements: DOCUMENTS.map(({ docType, version }) => ({ docType, version, acceptedAtUtc: '2026-10-01T00:00:00Z' })) });
  if (pathname.startsWith('/listings/by-slug/')) return answer({ ...room, bookingMode: state.mode, houseRules: state.emptyRules ? '' : state.long ? rules.repeat(18) : rules, roomName: state.long ? 'Youth Activity Room for Community Classes, Rehearsals and After-school Groups' : room.roomName });
  if (pathname === `/listings/${roomId}/availability/check`) {
    const body = JSON.parse(request.postData()); state.checks.push(body.schedule);
    const occurrences = scheduleDates(body.schedule);
    if (state.availability === 'failed') return answer({}, 503);
    if (state.availability === 'delayed') { await new Promise((resolve) => setTimeout(resolve, 900)); return answer({ available: false, totalOccurrences: occurrences.length, conflicts: [{ date: occurrences[0], reason: 'blackout' }] }); }
    return answer({ available: state.availability !== 'conflict', totalOccurrences: occurrences.length, conflicts: state.availability === 'conflict' ? [{ date: occurrences[0], reason: 'blackout' }, ...(occurrences.length > 1 ? [{ date: occurrences.at(-1), reason: 'booked' }] : [])] : [] });
  }
  if (pathname === `/listings/${roomId}/availability`) {
    if (state.feedUnavailable) return answer({}, 503);
    const from = url.searchParams.get('from'), to = url.searchParams.get('to');
    const days = [];
    for (let date = from; date <= to; date = addDays(date, 1)) days.push({ date, isBlackout: false, freeWindows: [{ startTime: '08:00', endTime: '22:00' }] });
    return answer({ roomId, timezone: 'America/New_York', from, to, days });
  }
  if (pathname === `/listings/${roomId}/applications`) {
    const body = JSON.parse(request.postData()); state.posts.push({ body, key: request.headers()['idempotency-key'] });
    if (state.submit === 'error') return answer({ code: 'temporarily_unavailable', detail: 'Try again shortly.' }, 503);
    if (state.submit === 'slot_taken') return answer({ code: 'slot_taken' }, 409);
    if (state.submit === 'card') return answer({ code: 'payment_method_required' }, 402);
    lastApplication = { id: '44444444-4444-4444-4444-444444444444', roomId, roomSlug: room.roomSlug, roomName: room.roomName, venueName: room.venue.name, venueSlug: room.venue.slug, organizer: user, ...body, status: state.submit === 'instant' ? 'approved' : 'pending', createdAtUtc: new Date().toISOString(), messages: [], messageCount: 0, hasPaymentMethod: state.payments };
    return answer(lastApplication, 201);
  }
  if (pathname.startsWith('/applications/')) return answer(lastApplication ?? {}, lastApplication ? 200 : 404);
  if (pathname === '/me/applications') return answer({items: lastApplication ? [lastApplication] : [],totalCount: lastApplication ? 1 : 0,page:1,pageSize:25});
  if (pathname === '/manage/venues') return answer([]);
  if (pathname === '/me/payments/setup/mock-confirm') { await new Promise(resolve => setTimeout(resolve, 150)); state.submit = 'pending'; return answer({ hasPaymentMethod: true, method: {brand:'visa',last4:'4242'}, mock:true }); }
  if (pathname === '/me/payments/setup') return answer({ clientSecret: 'fixture-secret', publishableKey: 'pk_mock_steeple', mock: true });
  if (pathname === '/me/payments') return answer({ hasPaymentMethod: false, mock: true });
  if (pathname === '/listings') return answer({ items: [], totalCount: 0, page: 1, pageSize: 100 });
  if (pathname === '/sitemap' || pathname === '/suburbs') return answer([]);
  if (pathname === '/geofence') return answer({ areaName: 'Vienna', center: { latitude: 38.9, longitude: -77.2 }, beachhead: { south: 38, north: 40, west: -78, east: -76 } });
  if (pathname === '/notifications/stream') return request.respond({ status: 503, body: '' });
  if (pathname === '/events') return request.respond({ status: 204 });
  return answer({ items: [], totalCount: 0, page: 1, pageSize: 25 });
}
let page;
async function start(overrides = {}, width = 390) {
  lastApplication = null;
  state = { signedIn: false, mode: 'manual', payments: false, availability: 'ready', submit: 'error', long: false, emptyRules: false, checks: [], posts: [], ...overrides };
  if (page) await page.close();
  page = await browser.newPage();
  await page.setViewport({ width, height: width === 390 ? 844 : 900, deviceScaleFactor: 2 });
  await page.emulateTimezone('Australia/Sydney');
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-color-scheme', value: 'light' }]);
  await page.setRequestInterception(true);
  page.on('request', (request) => void intercept(request));
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`${origin}/apply/grace-community-vienna/youth-activity-room?world=off`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#letter-date', { visible: true });
  await page.waitForFunction(text => document.querySelector('#composer-timezone')?.textContent.includes(text), {}, state.feedUnavailable ? 'could not be loaded' : 'America/New York');
  await page.evaluate(() => document.fonts.ready);
}
async function press(selector) { const target = await page.$(selector); await target.scrollIntoView(); await target.click(); }
async function dateInput(selector, value) {
  await press(selector);
  await page.focus(selector);
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
  const [year, month, day] = value.split('-');
  await page.keyboard.type(day + month + year); await page.keyboard.press('Tab');
  assert.equal(await page.$eval(selector, (node) => node.value), value, `date keyboard ${selector}`);
}
async function choose(selector, value) {
  await page.focus(selector);
  const label = await page.$eval(selector, (node, value) => [...node.options].find((option) => !option.disabled && option.value === value)?.textContent, value);
  assert.ok(label, `${value} is selectable in ${selector}`);
  await page.keyboard.type(label);
  await page.keyboard.press('Tab');
  assert.equal(await page.$eval(selector, (node) => node.value), value);
}
async function type(selector, value) { await press(selector); await page.keyboard.down('Meta'); await page.keyboard.press('KeyA', { commands: ['selectAll'] }); await page.keyboard.up('Meta'); await page.keyboard.type(value); await page.keyboard.press('Tab'); assert.equal(await page.$eval(selector, node => node.value), value); }
async function schedule(recurring = false, expected = 'available right now') {
  if (recurring) await press('label[for="letter-freq-weekly"]');
  await dateInput('#letter-date', dates.first);
  if (recurring) { await dateInput('#letter-until', dates.last); await press('label[for="letter-day-4"]'); }
  await choose('#letter-start', '09:30'); await choose('#letter-end', '11:30');
  await page.waitForFunction((text) => document.querySelector('.composer__availability').textContent.includes(text), {}, expected);
}
async function event() { await choose('#letter-activity', 'Children'); await type('#letter-size', '24'); await type('#letter-organization', 'Little Sparrows Playgroup'); await type('#letter-intent', plans); }
async function shot(name, at = 'top') {
  if (at === 'top') await page.$eval('.composer', (node) => { node.scrollTop = 0; });
  if (at === 'bottom') await page.$eval('.composer', (node) => { node.scrollTop = node.scrollHeight; });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  const geometry = await page.evaluate(() => {
    const sheet = document.querySelector('.composer');
    const controls = [...sheet.querySelectorAll('button,input,select,textarea,summary,[role="gridcell"],.choice > span')].filter((node) => node.checkVisibility() && getComputedStyle(node).opacity !== '0');
    const small = controls.filter((node) => { const r = node.getBoundingClientRect(); return r.width < 43.9 || r.height < 43.9; }).map((node) => ({ tag: node.tagName, id: node.id, cls: node.className, width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height }));
    const spills = [...sheet.querySelectorAll('p,h1,h2,h3,label,select,input,textarea')].filter((node) => node.checkVisibility() && !['TEXTAREA','INPUT'].includes(node.tagName) && node.scrollWidth > node.clientWidth + 1).map((node) => ({ tag: node.tagName, cls: node.className, text: node.textContent.slice(0, 60) }));
    return { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, scroll: sheet.scrollTop, scrollHeight: sheet.scrollHeight, clientHeight: sheet.clientHeight, horizontalOverflow: sheet.scrollWidth > sheet.clientWidth + 1, small, spills };
  });
  if (geometry.small.length || geometry.spills.length) console.log(JSON.stringify(geometry));
  const desktop = name.includes('1440');
  check(`${name} viewport and geometry`, geometry.width === (desktop ? 1440 : 390) && geometry.height === (desktop ? 900 : 844) && geometry.dpr === 2 && !geometry.horizontalOverflow && !geometry.small.length && !geometry.spills.length);
  recorded.push({ name, ...geometry });
  const filename = path.join(output, `${name}.png`); await page.screenshot({ path: filename });
  console.log(filename);
}
try {
  for (let i = 0; i < 100; i += 1) { try { if ((await fetch(origin)).ok) break; } catch (error) { serverLog = error.message; } await new Promise((resolve) => setTimeout(resolve, 100)); }
  const listener = execFileSync('lsof', ['-tiTCP:' + port, '-sTCP:LISTEN'], { encoding: 'utf8' }).trim();
  const cwd = execFileSync('lsof', ['-a', '-p', listener, '-d', 'cwd', '-Fn'], { encoding: 'utf8' });
  assert.ok(cwd.includes(process.cwd()), 'owned listener cwd');
  console.log(`Owned Vite ${origin}, cwd verified. Artifacts: ${output}`);
  browser = await puppeteer.launch({ headless: true, pipe: true, userDataDir: path.join(output, 'chrome-profile'), args: ['--no-sandbox', '--lang=en-US'] });
  await start();
  await shot('new-390');
  await schedule(true); await event();
  check('exact estimate for all 21 dates', (await page.$eval('.composer__total', (node) => node.textContent)).includes('630.00'));
  await shot('recurring-390'); await shot('recurring-390-deep', 'bottom');
  if (!process.argv.includes('--quick')) {
    await press('.composer button[type="submit"]');
    await page.waitForSelector('.composer .identity:not([hidden])', { visible: true });
    check('signed-out submit opens sign-in without sending', state.posts.length === 0);
    await shot('sign-in-390');
    await page.keyboard.press('Escape');
    check('Escape returns to preserved draft and submit focus', await page.$eval('#letter-intent', (node, plans) => node.value === plans && document.activeElement.type === 'submit', plans));

    state.availability = 'failed'; await choose('#letter-end', '12:00');
    await page.waitForFunction(() => document.querySelector('.composer__availability').textContent.includes('could not be checked'));
    await press('.composer button[type="submit"]');
    check('availability outage blocks send and preserves plans', state.posts.length === 0 && await page.$eval('#letter-intent', (node, plans) => node.value === plans, plans));
    await shot('unavailable-390');
    state.availability = 'ready'; await press('.composer__retry');
    await page.waitForFunction(() => document.querySelector('.composer__availability').textContent.includes('available right now'));
    check('availability retry succeeds with unchanged schedule', state.checks.at(-1).endTime === '12:00');

    state.availability = 'conflict'; await choose('#letter-end', '12:30');
    await page.waitForFunction(() => document.querySelector('.composer__availability').textContent.includes('2 of 21'));
    check('blackout and booked dates stay in estimate and full conflict list', await page.$eval('.composer', (node) => node.textContent.includes('945.00') && node.textContent.includes('not skipped') && node.textContent.includes('already booked')));
    await shot('conflicts-390');
    state.availability = 'delayed'; await choose('#letter-end', '13:00');
    await page.waitForFunction(() => document.querySelector('.composer__availability').textContent.includes('Checking'));
    await new Promise((resolve) => setTimeout(resolve, 550));
    state.availability = 'ready'; await choose('#letter-end', '13:30');
    await page.waitForFunction(() => document.querySelector('.composer__availability').textContent.includes('available right now'));
    check('stale availability result cannot replace newer schedule', state.checks.at(-1).endTime === '13:30' && !await page.$eval('.composer__availability', (node) => node.textContent.includes('unavailable')));

    await start(); await press('.composer button[type="submit"]');
    check('blank submit focuses date with inline error', await page.$eval('#letter-date', (node) => node === document.activeElement && node.getAttribute('aria-invalid') === 'true'));
    await shot('invalid-390');
    await schedule(true); await event();
    await dateInput('#letter-until', addDays(dates.first, 1));
    await press('label[for="letter-day-2"]'); await press('label[for="letter-day-4"]'); await press('label[for="letter-day-1"]');
    await press('.composer button[type="submit"]');
    check('zero-occurrence term has no total and does not send', state.posts.length === 0 && await page.$eval('.composer', (node) => node.textContent.includes('None of your weekdays') && !node.querySelector('.composer__total')));
    await dateInput('#letter-until', addDays(dates.first, 367));
    check('term beyond 366 days is explained', await page.$eval('#composer-schedule-error', (node) => node.textContent.includes('366 days')));
    await press('label[for="letter-freq-oneOff"]');
    await choose('#letter-end', '11:30');
    await page.waitForFunction(() => document.querySelector('.composer__availability').textContent.includes('available right now'));
    check('one-off clears recurring wire fields', state.checks.at(-1).frequency === 'oneOff' && state.checks.at(-1).endDate === null && state.checks.at(-1).daysOfWeek === null);
    await type('#letter-size', '31'); await press('.composer button[type="submit"]');
    check('capacity validation remains active', state.posts.length === 0 && await page.$eval('#composer-size-note', (node) => node.textContent.includes('30')));
    await type('#letter-size', '24'); await type('#letter-intent', 'x'.repeat(2001));
    check('plan limit remains active', await page.$eval('#composer-intent-note', (node) => node.textContent.includes('2000')));

    await start({ signedIn: true }); await schedule(true); await event();
    await press('.composer button[type="submit"]');
    await page.waitForFunction(() => !!document.querySelector('.letter__error'));
    check('manual submit preserves exact full schedule and event fields', state.posts[0].body.schedule.daysOfWeek.join(',') === 'tuesday,thursday' && state.posts[0].body.schedule.startDate === dates.first && state.posts[0].body.schedule.endDate === dates.last && state.posts[0].body.intentText === plans && state.posts[0].body.groupSize === 24);
    await press('.composer button[type="submit"]'); await page.waitForFunction(() => !!document.querySelector('.letter__error'));
    check('retry reuses idempotency key and body', state.posts.length === 2 && state.posts[0].key === state.posts[1].key && JSON.stringify(state.posts[0].body) === JSON.stringify(state.posts[1].body));
    state.submit = 'pending'; await press('.composer button[type="submit"]');
    await page.waitForSelector('.sent:not([hidden])', { visible: true });
    check('manual success returns to room with sent confirmation', state.posts.length === 3 && await page.$eval('.sent', node => node.textContent.includes('on its way')));

    await start({ signedIn: true, mode: 'instant', submit: 'slot_taken' }); await schedule(); await event();
    check('instant commitment and action are explicit', await page.$eval('.letter__foot', (node) => node.textContent.includes('confirm your booking immediately') && node.querySelector('button[type="submit"]').textContent === 'Book this space'));
    await shot('instant-390-deep', 'bottom'); await press('.composer button[type="submit"]');
    await page.waitForFunction(() => document.querySelector('.letter__error')?.textContent.includes('just taken'));
    check('instant race refusal returns focus to visible time input', await page.$eval('#letter-start', (node) => node === document.activeElement));
    state.submit = 'instant'; await press('.composer button[type="submit"]');
    await page.waitForSelector('.sent:not([hidden])', { visible: true });
    check('instant confirmation uses returned status', state.posts.length === 2 && await page.$eval('.sent', node => node.textContent.includes('Booked.')));

    await start({ signedIn: true, mode: 'instant', submit: 'pending' }); await schedule(); await event(); await press('.composer button[type="submit"]');
    await page.waitForSelector('.sent:not([hidden])', { visible: true });
    check('instant cap fallback accepts pending outcome', state.posts.length === 1 && await page.$eval('.sent', node => node.textContent.includes('to approve')));

    await start({ signedIn: true, payments: true, submit: 'card' }); await schedule(); await event();
    check('enabled mock payments are labelled as test payments', await page.$eval('.letter__foot', (node) => node.textContent.includes('Test payments') && node.textContent.includes('No real money')));
    await shot('payments-enabled-390-deep', 'bottom'); await press('.composer button[type="submit"]');
    await page.waitForSelector('#card-last4', { visible: true });
    check('payment step keeps test capability explicit', await page.$eval('.identity--card', node => node.textContent.includes('No real money is charged') && node.textContent.includes('Use sample details')));
    await shot('payment-step-390');
    await press('.identity--card button[type="submit"]');
    check('invalid nested payment form cannot resubmit the booking', state.posts.length === 1);
    await type('#card-last4', '4242'); await press('.identity--card button[type="submit"]');
    await page.waitForSelector('.sent:not([hidden])', { visible: true });
    check('402 payment step resumes same submission', state.posts.length === 2 && state.posts[0].key === state.posts[1].key);

    await start({ feedUnavailable: true }); await schedule(false, 'could not be checked');
    check('missing venue timezone does not claim ready availability', state.checks.length === 0 && await page.$eval('#composer-timezone', node => node.textContent.includes('could not be loaded')));
    await shot('timezone-unavailable-390');
    state.feedUnavailable = false; await press('.composer__retry');
    await page.waitForFunction(() => document.querySelector('.composer__availability').textContent.includes('available right now'));
    check('retry reloads venue timezone before checking schedule', await page.$eval('#composer-timezone', node => node.textContent.includes('America/New York')));

    await start({ emptyRules: true });
    check('missing house rules leave no empty rules card', await page.$eval('.composer__rules', (node) => node.hidden));
    await press('.composer__calendar summary');
    await page.waitForSelector('.week__grid [data-day]', { visible: true });
    await shot('calendar-390');
    const first = await page.$('.week__grid [role="gridcell"]:not([aria-disabled])');
    assert.ok(first, 'available calendar cell'); await first.scrollIntoView(); await first.click();
    check('calendar pointer selection synchronizes explicit inputs', await page.$eval('#letter-start', (node) => Boolean(node.value)));
    await page.focus('.week__grid [tabindex="0"]');
    const previousEnd = await page.$eval('#letter-end', node => node.value);
    await page.keyboard.down('Shift'); await page.keyboard.press('ArrowDown'); await page.keyboard.up('Shift');
    check('calendar keyboard extends time and retains focus', await page.$eval('#letter-end', (node, previous) => node.value > previous && document.activeElement.classList.contains('week__cell'), previousEnd));

    await start({}, 1440); await shot('new-1440');
    await schedule(true); await event(); await shot('recurring-1440'); await shot('recurring-1440-deep', 'bottom');
    const axe = await new AxePuppeteer(page).include('.composer').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
    await fs.writeFile(path.join(output, 'axe.json'), JSON.stringify(axe.violations, null, 2));
    check('composer axe has no violations', axe.violations.length === 0);
    const sheets = {};
    for (const file of ['main.css','map.css','panels.css','guest.css','host.css']) sheets[file] = (await fs.readFile(`src/styles/${file}`, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
    const scoped = {'guest.css':'.guest','host.css':'.hostdesk'};
    const misses = [];
    for (const cls of await page.evaluate(() => [...new Set([...document.querySelectorAll('*')].flatMap((node) => [...node.classList]))])) {
      if (['identity__body','spaces'].includes(cls)) continue;
      const pattern = new RegExp('\\.' + cls + '(?![\\w-])');
      const owners = Object.keys(sheets).filter((file) => pattern.test(sheets[file]));
      if (!owners.length || owners.some((file) => !scoped[file])) continue;
      const roots = owners.map((file) => scoped[file]);
      if (await page.evaluate((cls,roots) => [...document.querySelectorAll('.'+CSS.escape(cls))].some((node) => !roots.some((root) => node.closest(root))), cls, roots)) misses.push(cls);
    }
    check('live composer and shared chrome CSS stays within declared surfaces', misses.length === 0);
    state.availability = 'failed'; await choose('#letter-end', '12:00');
    await page.waitForFunction(() => document.querySelector('.composer__availability').textContent.includes('could not be checked'));
    await shot('unavailable-1440');
    await start({ long: true }); await schedule(true); await event(); await type('#letter-intent', plans.repeat(6));
    await shot('long-390'); await shot('long-390-deep', 'bottom');
    check('long rules and event text remain complete', await page.$eval('.composer__rules p', (node, value) => node.textContent === value, rules.repeat(18)) && await page.$eval('#letter-intent', (node, value) => node.value === value, plans.repeat(6)));
    await start({ long: true }, 1440); await schedule(true); await event(); await type('#letter-intent', plans.repeat(6)); await shot('long-1440'); await shot('long-1440-deep', 'bottom');
  }
  if (pageErrors.length) console.log(pageErrors);
  check('no browser runtime errors', pageErrors.length === 0);
} finally {
  await fs.writeFile(path.join(output, 'measurements.json'), JSON.stringify(recorded, null, 2));
  await fs.writeFile(path.join(output, 'checks.json'), JSON.stringify(checks, null, 2));
  await browser?.close();
  if (vite.exitCode === null) {
    vite.kill('SIGTERM');
    await new Promise((resolve) => vite.once('exit', resolve));
  }
  console.log(`Cleaned browser and Vite. ${checks.length} checks. ${output}`);
}
