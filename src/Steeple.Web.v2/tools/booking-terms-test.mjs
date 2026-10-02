// node tools/booking-terms-test.mjs — saved terms, legacy review and contextual support.
// Owns fixture-only Vite on :5488 and a unique Chrome profile; both close before exit.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer as createVite } from 'vite';
import puppeteer from 'puppeteer';
import { addDays, nextWeekday, todayIso, materializeDates } from '../src/data/store/schedule.js';
import { quoteSessionAmount } from '../src/ui/bookingTerms.js';
import { DOCUMENTS } from '../src/data/agreements.js';
const output = await fs.mkdtemp('/private/tmp/steeple-booking-terms-web-');
process.env.VITE_WORLD = 'off';
process.env.VITE_DEBUG = 'on';
const vite = await createVite({ envDir: false, server: { host: '127.0.0.1', port: 5488, strictPort: true } });
await vite.listen();
const port = 5488;
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
const hostApplication={quote:{pricePerHour:15,currency:'USD',houseRules:rules},id:'44444444-4444-4444-4444-444444444444',roomId,roomSlug:room.roomSlug,roomName:room.roomName,venueName:room.venue.name,venueSlug:room.venue.slug,organizer:{id:'99999999-9999-9999-9999-999999999999',displayName:'Maria Alvarez'},organizationName:'Little Sparrows Playgroup',activityType:'children',groupSize:24,intentText:plans,status:'pending',createdAtUtc:'2026-10-01T00:00:00Z',schedule:{frequency:'recurringWeekly',startDate:dates.first,endDate:dates.last,daysOfWeek:['tuesday','thursday'],startTime:'09:30',endTime:'11:30'},messages:[],hasPaymentMethod:false};
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
  if (pathname.endsWith('/withdraw')) { writes.push({pathname}); hostApplication.status = 'withdrawn'; return answer(hostApplication); }
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
  await page.setViewport({width,height:width===1440?900:width===320?568:844,deviceScaleFactor:2});
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await page.setRequestInterception(true);
  page.on('request',request=>void intercept(request));
  page.on('pageerror',e=>pageErrors.push(e.message));
  await page.goto(origin+route+'?world=off',{waitUntil:'networkidle0'});
  await page.waitForFunction('window.__steepleReady === true');
  await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});
}
try {
  check('Saved quote supports minute-level schedules and half-even amounts', quoteSessionAmount({pricePerHour:9.01}, {startTime:'09:15',endTime:'10:45'}) === 13.52 && quoteSessionAmount({pricePerHour:9.03}, {startTime:'09:15',endTime:'10:45'}) === 13.54);
  const listener=execFileSync('lsof',['-tiTCP:'+port,'-sTCP:LISTEN'],{encoding:'utf8'}).trim();
  assert.ok(execFileSync('lsof',['-a','-p',listener,'-d','cwd','-Fn'],{encoding:'utf8'}).includes(process.cwd()));
  browser=await puppeteer.launch({headless:true,pipe:true,userDataDir:path.join(output,'chrome-profile'),args:['--no-sandbox']});
  for (const width of [320,390,1440]) {
    hostApplication.quote={pricePerHour:9,currency:'USD',houseRules:'Saved rule: leave tables in place.'};
    hostApplication.status='pending';
    await openRoute('/desk',width,true);
    await press('[role=tab][data-tab=letters]'); await press('.desk .card');
    await page.waitForSelector('.letterpage.is-open',{visible:true});
    await (await page.$('.letterpage .booking-terms')).scrollIntoView();
    check('Host sees saved price, rules and support '+width,await page.$eval('.letterpage',n=>n.textContent.replaceAll('\u00a0',' ').includes('USD 9.00')&&n.textContent.replaceAll('\u00a0',' ').includes('USD 18.00')&&n.textContent.includes('Saved rule:')));
    check('Host approval available for reviewed request '+width,!!await page.$('.letterpage [data-action=approve]'));
    await capture('host-saved-'+width);
    hostApplication.organizer=user;
    hostApplication.status='counterOffered';
    hostApplication.counterOffer={id:'counter-1',status:'open',schedule:{...hostApplication.schedule,endTime:'13:30'},createdAtUtc:new Date().toISOString()};
    await openRoute('/letter/'+hostApplication.id,width,true);
    await page.waitForSelector('.opened .counter',{visible:true});
    await (await page.$('.opened .counter')).scrollIntoView();
    check('Guest counter uses saved rate for longer duration '+width,await page.$eval('.opened .counter .booking-terms',n=>n.textContent.replaceAll('\u00a0',' ').includes('USD 36.00')));
    await capture('guest-counter-'+width);
    hostApplication.counterOffer=null;
    hostApplication.status='pending';
    hostApplication.organizer={id:'99999999-9999-9999-9999-999999999999',displayName:'Maria Alvarez'};
    hostApplication.quote=null;
    await openRoute('/desk',width,true);
    await press('[role=tab][data-tab=letters]'); await press('.desk .card');
    await page.waitForSelector('.letterpage.is-open',{visible:true});
    await (await page.$('.letterpage .booking-terms')).scrollIntoView();
    check('Legacy host cannot approve or counter '+width,!await page.$('.letterpage [data-action=approve]')&&!await page.$('.letterpage [data-action=counter]'));
    check('Legacy host gets review explanation '+width,await page.$eval('.letterpage .booking-terms',n=>n.textContent.includes('guest must withdraw')));
    await capture('host-legacy-'+width);
    hostApplication.organizer=user;
    await openRoute('/letter/'+hostApplication.id,width,true);
    await page.waitForSelector('.opened .booking-terms',{visible:true});
    await (await page.$('.opened .booking-terms')).scrollIntoView();
    check('Legacy guest never sees current rate as saved '+width,await page.$eval('.opened',n=>n.textContent.includes('no saved price')&&!n.textContent.includes('$15/hr')));
    const support=await page.$eval('.opened .booking-support',n=>n.href);
    check('Support contains request ID only '+width,support.includes('jvun@steepleapp.co')&&support.includes(hostApplication.id)&&!support.includes(user.email));
    await capture('guest-legacy-'+width);
    page.once('dialog',dialog=>dialog.accept());
    const review=await page.$('button::-p-text(Withdraw and review a new request)');
    await review.scrollIntoView(); await review.click();
    await page.waitForSelector('#letter-intent',{visible:true});
    check('Legacy withdrawal opens prefilled current review '+width,hostApplication.status==='withdrawn'&&await page.$eval('#letter-intent',(n,p)=>n.value===p,plans)&&await page.$eval('.composer__rules',n=>n.textContent.includes('Adult supervision')));
    await page.$eval('.composer',n=>n.scrollTop=n.scrollHeight);
    await capture('legacy-new-review-'+width);
    hostApplication.organizer={id:'99999999-9999-9999-9999-999999999999',displayName:'Maria Alvarez'};
  }
  check('No runtime errors',pageErrors.length===0);
} finally {
  await fs.writeFile(path.join(output,'checks.json'),JSON.stringify(checks,null,2));
  await fs.writeFile(path.join(output,'measurements.json'),JSON.stringify(measurements,null,2));
  await fs.writeFile(path.join(output,'errors.json'),JSON.stringify(pageErrors,null,2));
  await browser?.close(); await vite.close();
  console.log('Cleaned Chrome and Vite; '+output);
}
process.exit(0);
