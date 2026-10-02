// node tools/review-visual-fixes.mjs [--setup]
// Real pointer/keyboard checks with intercepted API fixtures. Owns Vite on :5487
// with environment-file loading disabled and a unique Chromium profile; both close
// before exit. Captures and measurements are written to a unique /private/tmp folder.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer as createVite } from 'vite';
import puppeteer from 'puppeteer';
import { AxePuppeteer } from '@axe-core/puppeteer';
import { addDays, nextWeekday, todayIso, materializeDates } from '../src/data/store/schedule.js';
import { writeRoomPhoto } from './host-photo.mjs';
import { DOCUMENTS } from '../src/data/agreements.js';
const output = await fs.mkdtemp('/private/tmp/steeple-review-visual-fixes-web-');
process.env.VITE_WORLD = 'off';
process.env.VITE_DEBUG = 'on';
const vite = await createVite({ envDir: false, server: { host: '127.0.0.1', port: 5487, strictPort: true } });
await vite.listen();
const port = 5487;
const origin = `http://127.0.0.1:${port}`;
let browser;
const dates = { first: nextWeekday(addDays(todayIso(), 7), 2) };
dates.last = addDays(dates.first, 70);
const rules = 'Adult supervision required for under-18 groups. Leave the room as you found it.';
const plans = 'Little Sparrows is a parent-run playgroup for children under four. We would love a regular Tuesday and Thursday morning: songs, free play and a shared snack, with every child accompanied by a parent or carer. We bring our own mats and toys and leave the room as we found it.';
const dayTokens = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const roomId = '11111111-1111-1111-1111-111111111111';
const user = { id: '22222222-2222-2222-2222-222222222222', displayName: 'Composer Reader', email: 'composer@example.test', createdAtUtc: '2026-01-01T00:00:00Z' };
const room = { roomId, roomSlug: 'youth-activity-room', roomName: 'Youth Activity Room', description: 'A carpeted multipurpose room ideal for children’s programs, tutoring, and small group activities.', capacity: 30, pricePerHour: 15, currency: 'USD', houseRules: rules, activities: ['children', 'education'], amenities: [], accessibility: [], photos: [], rating: null, venue: { venueId: '33333333-3333-3333-3333-333333333333', name: 'Grace Community', slug: 'audit-community-vienna', suburb: 'Vienna', postcode: '22180', latitude: 38.9, longitude: -77.2, addressLine: '123 Community Lane', venueType: 'church' }, openHours: dayTokens.map((dayOfWeek) => ({ dayOfWeek, windows: [{ startTime: '08:00', endTime: '22:00' }] })) };
const venueManaged={id:room.venue.venueId,slug:room.venue.slug,name:room.venue.name,bookingMode:'manual',addressLine:room.venue.addressLine,suburb:'Vienna',postcode:'22180',latitude:38.9,longitude:-77.2,isIdentityVerified:true,rooms:[{id:roomId,slug:room.roomSlug,name:room.roomName,capacity:30,pricePerHour:15,status:'published'}]};
const hostApplication={id:'44444444-4444-4444-4444-444444444444',roomId,roomSlug:room.roomSlug,roomName:room.roomName,venueName:room.venue.name,venueSlug:room.venue.slug,organizer:{id:'99999999-9999-9999-9999-999999999999',displayName:'Maria Alvarez'},organizationName:'Little Sparrows Playgroup',activityType:'children',groupSize:24,intentText:plans,status:'pending',createdAtUtc:'2026-10-01T00:00:00Z',schedule:{frequency:'recurringWeekly',startDate:dates.first,endDate:dates.last,daysOfWeek:['tuesday','thursday'],startTime:'09:30',endTime:'11:30'},messages:[],hasPaymentMethod:false};
let state = { signedIn: false, mode: 'manual', payments: false, availability: 'ready', submit: 'error', long: false, emptyRules: false, checks: [], posts: [] };
let lastApplication = null;
let newVenue = null;
let newRoom = null;
let writes = [];
const recorded = [];
const pageErrors = [];
const checks = [];
function check(name, condition) { assert.ok(condition, name); checks.push(name); console.log(`PASS ${name}`); }
function scheduleDates(wire) { return materializeDates({ ...wire, frequency: wire.frequency === 'recurringWeekly' ? 'weekly' : 'oneOff', daysOfWeekMask: (wire.daysOfWeek ?? []).reduce((mask, token) => mask | (1 << dayTokens.indexOf(token)), 0) }); }
async function intercept(request) {
  const url = new URL(request.url());
  if (url.origin !== origin) return request.abort();
  if (url.pathname === '/fixture-room.png') return request.respond({status:200,contentType:'image/png',body:await fs.readFile(path.join(output,'room.png'))});
  if (!url.pathname.startsWith('/api/')) return request.continue();
  const pathname = url.pathname.replace('/api/v1', '');
  const answer = (body, status = 200) => request.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (state.newHost && pathname.startsWith('/manage/')) {
    const body = request.method() === 'GET' || pathname.endsWith('/photos') ? {} : JSON.parse(request.postData() || '{}');
    if (request.method() !== 'GET') writes.push({ pathname, body });
    if (pathname === '/manage/venues' && request.method() === 'GET') return answer(newVenue ? [{...newVenue, rooms: newRoom ? [newRoom] : []}] : []);
    if (pathname === '/manage/venues' && request.method() === 'POST') {
      newVenue = {...venueManaged, ...body, rooms: [], bookingMode: 'instant'};
      return answer(newVenue, 201);
    }
    if (pathname.endsWith('/rooms') && request.method() === 'POST') {
      newRoom = {id: roomId, slug: room.roomSlug, venueId: room.venue.venueId, ...body, status: 'draft', photos: []};
      return answer(newRoom, 201);
    }
    if (pathname.endsWith('/photos')) return answer({id:'photo',cardUrl: '/fixture-room.png', heroUrl: '/fixture-room.png'},201);
    if (pathname.endsWith('/availability')) return answer({roomId, timezone:'America/New_York', days:room.openHours, blackouts:[]});
    if (pathname === `/manage/rooms/${roomId}`) {
      if (body.status && state.failMode) return answer({detail:'Mode must save before publish.'},409);
      newRoom = {...newRoom, ...body};
      return answer(newRoom);
    }
    if (pathname === `/manage/venues/${room.venue.venueId}`) {
      if (body.bookingMode && state.failMode) return answer({code:'temporarily_unavailable',detail:'Booking preferences could not be saved. Try again.'},503);
      newVenue = {...newVenue,...body}; return answer({...newVenue, rooms: newRoom ? [newRoom] : []});
    }
  }
  if (pathname === '/flags') return answer({ 'payments.enabled': state.payments, 'listing.availability': true });
  if (pathname === '/auth/refresh') return state.signedIn ? answer({ accessToken: 'composer-fixture', user }) : answer({}, 401);
  if (pathname === '/auth/sessions' && request.method() === 'POST') { state.signedIn = true; return answer({ accessToken: 'composer-fixture', user }); }
  if (pathname === '/me') return answer({ ...user, agreements: DOCUMENTS.map(({ docType, version }) => ({ docType, version, acceptedAtUtc: '2026-10-01T00:00:00Z' })) });
  if (pathname.startsWith('/listings/by-slug/')) return answer({ ...room, bookingMode: state.mode, houseRules: state.emptyRules ? '' : state.long ? rules.repeat(18) : rules, roomName: state.long ? 'Youth Activity Room for Community Classes, Rehearsals and After-school Groups' : room.roomName });
  if (pathname === `/listings/${roomId}/availability/check`) {
    const body = JSON.parse(request.postData()); state.checks.push(body.schedule);
    const occurrences = scheduleDates(body.schedule);
    if (state.availability === 'unsupported') return answer({}, 404);
    if (state.availability === 'failed') return answer({}, 503);
    if (state.availability === 'delayed') { await new Promise((resolve) => setTimeout(resolve, 900)); return answer({ available: false, totalOccurrences: occurrences.length, conflicts: [{ date: occurrences[0], reason: 'blackout' }] }); }
    return answer({ available: state.availability !== 'conflict', totalOccurrences: occurrences.length, conflicts: state.availability === 'conflict' ? [{ date: occurrences[0], reason: 'blackout' }, ...(occurrences.length > 1 ? [{ date: occurrences.at(-1), reason: 'booked' }] : [])] : [] });
  }
  if (pathname === `/listings/${roomId}/availability`) {
    if (state.availability === 'unsupported') return answer({}, 404);
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
  if (pathname.endsWith('/counter-offer')) { writes.push({pathname,body:JSON.parse(request.postData())}); return answer(hostApplication); }
  if (pathname.endsWith('/decision')) { writes.push({pathname,body:JSON.parse(request.postData())}); return answer({...hostApplication,status:'approved',decidedAtUtc:new Date().toISOString()}); }
  if (pathname.startsWith('/applications/')) return answer(hostApplication);
  if (pathname === '/me/applications') return answer({items: lastApplication ? [lastApplication] : [],totalCount: lastApplication ? 1 : 0,page:1,pageSize:25});
  if (pathname === '/manage/venues') return answer([venueManaged]); if(pathname.startsWith('/manage/venues/')) return answer(venueManaged); if(pathname === '/manage/applications') return answer({items:[hostApplication],totalCount:1,page:1,pageSize:100}); if(pathname.startsWith('/manage/rooms/')&&pathname.endsWith('/availability')) return answer({roomId,timezone:'America/New_York',days:room.openHours});
  if (pathname === '/me/payments/setup/mock-confirm') { await new Promise(resolve => setTimeout(resolve, 150)); state.submit = 'pending'; return answer({ hasPaymentMethod: true, method: {brand:'visa',last4:'4242'}, mock:true }); }
  if (pathname === '/me/payments/setup') return answer({ clientSecret: 'fixture-secret', publishableKey: 'pk_mock_steeple', mock: true });
  if (pathname === '/me/payments') return answer({ hasPaymentMethod: false, mock: true });
  if (pathname === '/listings/search') return answer({ items: [{...room, venueSlug:room.venue.slug, venueName:room.venue.name, suburb:room.venue.suburb, latitude:room.venue.latitude,longitude:room.venue.longitude}], totalCount: 1, page: 1, pageSize: 100 });
  if (pathname === '/sitemap') return answer([{venueSlug:room.venue.slug,roomSlug:room.roomSlug}]); if (pathname === '/suburbs') return answer(['Vienna']);
  if (pathname === '/geofence') return answer({ areaName: 'Vienna', center: { latitude: 38.9, longitude: -77.2 }, beachhead: { south: 38, north: 40, west: -78, east: -76 } });
  if (pathname === '/notifications/stream') return request.respond({ status: 503, body: '' });
  if (pathname === '/events') return request.respond({ status: 204 });
  return answer({ items: [], totalCount: 0, page: 1, pageSize: 25 });
}
const measurements = [];
async function capture(name) {
  await page.evaluate(() => document.fonts.ready);
  await new Promise(r => setTimeout(r, 350));
  const data = await page.evaluate(() => ({
    text: document.body.innerText,
    overflow:document.documentElement.scrollWidth > innerWidth,
    small:[...document.querySelectorAll('button,a,input,select,summary')].filter(n=>n.checkVisibility()&&!n.closest('[inert]')).map(n=>({text:(n.textContent||n.getAttribute('aria-label')||n.placeholder||'').trim().slice(0,70),cls:n.className,rect:(()=>{let r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()})).filter(n=>n.rect.x>=0&&n.rect.y>=0&&n.rect.y<innerHeight&&(n.rect.w<44||n.rect.h<44))
  }));
  measurements.push({name,...data});
  await page.screenshot({path:path.join(output,name+'.png')});
}
let page;
async function dateInput(selector, value) {
  await press(selector); await page.focus(selector);
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
  const [year,month,day]=value.split('-');
  await page.keyboard.type(day+month+year); await page.keyboard.press('Tab');
  assert.equal(await page.$eval(selector,n=>n.value),value);
}
async function type(selector, value) { await press(selector); await page.keyboard.down('Meta'); await page.keyboard.press('KeyA', {commands:['selectAll']}); await page.keyboard.up('Meta'); await page.keyboard.type(value); await page.keyboard.press('Tab'); assert.equal(await page.$eval(selector,n=>n.value),value); }
async function press(selector) { const target = await page.waitForSelector(selector,{visible:true}); assert.ok(target, selector); await target.scrollIntoView(); await target.click(); }
async function openRoute(route,width=390,sign=false){
  state.signedIn=sign;
  if(page) await page.close();
  page=await browser.newPage();
  await page.setViewport({width,height:width===1440?900:844,deviceScaleFactor:2});
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await page.setRequestInterception(true);
  page.on('request',request=>void intercept(request));
  page.on('pageerror',e=>pageErrors.push(e.message));
  await page.goto(origin+route+'?world=off',{waitUntil:'networkidle0'});
  await page.waitForFunction('window.__steepleReady === true');
  await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});
}
try {
  const listener=execFileSync('lsof',['-tiTCP:'+port,'-sTCP:LISTEN'],{encoding:'utf8'}).trim();
  const cwd=execFileSync('lsof',['-a','-p',listener,'-d','cwd','-Fn'],{encoding:'utf8'});
  assert.ok(cwd.includes(process.cwd()));
  writeRoomPhoto(path.join(output,'room.png'));
  browser=await puppeteer.launch({headless:true,pipe:true,userDataDir:path.join(output,'chrome-profile'),args:['--no-sandbox']});
  for(const width of process.argv.includes('--setup') ? [] : [320,390,1440]) {
    await openRoute('/browse',width);
    await capture('browse-'+width);
    check('Discovery controls meet 44px target '+width, await page.$$eval('.dm-map .leaflet-bar a,.dm-seg__input,.dm-seg__open,.dm-seg--filters,.porch button,.wordmark',nodes=>nodes.filter(n=>n.checkVisibility()).every(n=>{const r=n.getBoundingClientRect();return r.width>=43.9&&r.height>=43.9;})));
    await press('.dm-seg--when .dm-seg__open');
    await press('.dm-switch__option[data-mode=weekly]');
    await press('.pill--day[data-day="2"]');
    await capture('search-weekly-'+width);
    check('Weekly filter controls fit '+width,await page.$eval('.dm-pop',n=>n.scrollWidth<=n.clientWidth+1));
    await page.keyboard.press('Escape');
    await press('.dm-seg--filters');
    await capture('filters-'+width);
    check('Filters within viewport '+width, await page.$eval('.dm-pop:not([hidden])',n=>n.getBoundingClientRect().bottom<=innerHeight));
    await page.keyboard.press('Escape');
    await press('.dm-row');
    await page.waitForSelector('.sheet--room.is-open',{visible:true});
    await capture('room-'+width);
    check('Room controls meet 44px target '+width,await page.$$eval('.sheet--room .sheet__grab,.sheet--room .sheet__up,.sheet--room .sheet__foot button',nodes=>nodes.filter(n=>n.checkVisibility()).every(n=>{const r=n.getBoundingClientRect();return r.width>=43.9&&r.height>=43.9;})));
    await openRoute('/desk',width);
    await capture('host-entry-'+width);
    check('Host-specific sign-in '+width, await page.$eval('.signin__host-guide',n=>n.checkVisibility()));
    await openRoute('/desk',width,true);
    await press('[role=tab][data-tab=letters]');
    await page.waitForSelector('.desk .card',{visible:true}); await press('.desk .card');
    await page.waitForSelector('.letterpage.is-open',{visible:true});
    await capture('host-letter-'+width);
    check('Schedule precedes plans on phone '+width, await page.evaluate(()=>innerWidth>1120||document.querySelector('.letterpage__week').getBoundingClientRect().y<document.querySelector('.intent').getBoundingClientRect().y));
    const tickRects=await page.$$eval('.letterpage .ribbon__tick',nodes=>nodes.map(n=>({left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right,text:n.textContent})));
    check('Schedule labels do not overlap '+width,tickRects.every((r,i)=>!i||r.left>=tickRects[i-1].right+4));
    console.log('Decision geometry',width,await page.$eval('.letterpage__actions',n=>n.getBoundingClientRect().toJSON()));
    await press('.letterpage__actions [data-action="counter"]');
    await capture('host-counter-'+width);
    await press('.letterpage__drawer [data-frequency=oneOff]');
    check('One-off offer shows date and hides weekly fields '+width,await page.evaluate(()=>document.querySelector('#counter-start').checkVisibility()&&!document.querySelector('#counter-end').checkVisibility()&&!document.querySelector('.letterpage .days').checkVisibility()));
    await dateInput('#counter-start',addDays(dates.first,1));
    await capture('host-counter-oneoff-'+width);
    await press('.letterpage__drawer [data-action=send-counter]');
    await page.waitForFunction(()=>!document.querySelector('.letterpage__drawer').classList.contains('is-open'));
    check('One-off offer sends selected date '+width,writes.some(w=>w.pathname.endsWith('/counter-offer')&&w.body.schedule.frequency==='oneOff'&&w.body.schedule.startDate===addDays(dates.first,1)&&!w.body.schedule.endDate&&!w.body.schedule.daysOfWeek));
    await press('.letterpage__actions [data-action=counter]');
    await press('.letterpage__drawer [data-frequency=weekly]');
    check('Weekly offer restores date range and weekdays '+width,await page.evaluate(()=>document.querySelector('#counter-start').checkVisibility()&&document.querySelector('#counter-end').checkVisibility()&&document.querySelector('.letterpage .days').checkVisibility()));
    await press('.letterpage__actions [data-action=approve]');
    await page.waitForFunction(()=>document.querySelector('.seal').textContent.includes('Approved'));
    check('Approval reaches decision API '+width,writes.some(w=>w.body.decision==='approve'));
    await capture('host-approved-'+width);
  }
  for(const [width,height] of process.argv.includes('--setup') ? [] : [[320,568],[568,320],[390,360]]) {
    await openRoute('/browse',width);
    await page.setViewport({width,height,deviceScaleFactor:2});
    await press('.dm-seg--filters');
    const box=await page.$eval('.dm-pop:not([hidden])',n=>n.getBoundingClientRect().toJSON());
    await page.mouse.move(box.right-20,box.bottom-20); await page.mouse.wheel({deltaY:1000});
    await new Promise(r=>setTimeout(r,180));
    check('Filters scroll '+width+'x'+height,await page.$eval('.dm-pop:not([hidden])',n=>n.scrollTop>0&&n.getBoundingClientRect().bottom<=innerHeight));
    await press('.dm-pop button[data-filter="Lift access"]');
    check('Lift access selected '+width+'x'+height,await page.$eval('.dm-pop button[data-filter="Lift access"]',n=>n.getAttribute('aria-pressed')==='true'));
    await press('.dm-group__clear');
    check('Clear filters remains reachable '+width+'x'+height,await page.$eval('.dm-pop button[data-filter="Lift access"]',n=>n.getAttribute('aria-pressed')==='false'));
    await capture('filters-scrolled-'+width+'x'+height);
  }
  for (const [width,mode] of [[320,'instant'],[390,'manual'],[1440,'instant']]) {
    state.newHost = true; newVenue = null; newRoom = null; writes = [];
    await openRoute('/desk',width,true);
    await page.waitForSelector('#place-name',{visible:true});
    await type('#place-name','Community Hall');
    await type('#place-address','400 Maple Avenue West, Vienna, VA 22180');
    await type('#place-description','A venue for community classes and meetings.');
    await press('.listing [data-action="advance"]');
    await page.waitForSelector('#room-name',{visible:true});
    await type('#room-name','Meeting room');
    await type('#room-description','A bright room for small community groups.');
    await type('#room-capacity','30');
    await type('#room-price','15');
    await (await page.$('#room-photo')).uploadFile(path.join(output,'room.png'));
    await page.waitForSelector('.shotpick__thumb');
    await press('.listing [data-action="advance"]');
    await page.waitForSelector('.paint__quick',{visible:true});
    await press('.paint__quick button');
    await press('.listing [data-action="advance"]');
    await page.waitForSelector('.listing__booking',{visible:true});
    check('Instant booking preselected '+width,await page.$eval('[name="listing-booking-mode"][value="instant"]',n=>n.checked));
    if(mode==='manual') await press('[name="listing-booking-mode"][value="manual"]');
    check('Choice and summary agree '+width,await page.$eval('.listing__booking-summary',(n,mode)=>n.textContent===(mode==='manual'?'Manual approval':'Instant booking'),mode));
    await capture('booking-choice-'+width);
    check('Publish button and full label fit '+width,await page.$eval('.listing [data-action=advance]',n=>{const r=n.getBoundingClientRect(),s=n.closest('.listing').getBoundingClientRect();return r.left>=s.left&&r.right<=s.right&&n.scrollWidth<=n.clientWidth+1;}));
    state.failMode = mode==='manual';
    await press('.listing [data-action="advance"]');
    if(state.failMode) {
      await page.waitForFunction(()=>document.querySelector('.listing').innerText.includes('could not be reached'));
      check('Mode failure prevents publication', !writes.some(w=>w.body.status==='published'));
      state.failMode = false;
      await press('.listing [data-action="advance"]');
    }
    await page.waitForFunction(()=>document.querySelector('.listing').innerText.includes('is published'));
    check('Chosen mode saved before publish '+width,writes.findIndex(w=>w.body.bookingMode===mode)<writes.findIndex(w=>w.body.status==='published'));
    check('Chosen mode saved '+width,newVenue.bookingMode===mode);
    await capture('booking-published-'+width);
    state.newHost=false;
  }

  check('No browser runtime errors',pageErrors.length===0);
}finally{
  await fs.writeFile(path.join(output,'measurements.json'),JSON.stringify(measurements,null,2));
  await fs.writeFile(path.join(output,'errors.json'),JSON.stringify(pageErrors,null,2));
  await fs.writeFile(path.join(output,'checks.json'),JSON.stringify(checks,null,2));
  await browser?.close();
  await vite.close();
  console.log('Cleaned own Chrome and Vite; '+output);
}

process.exit(0);
