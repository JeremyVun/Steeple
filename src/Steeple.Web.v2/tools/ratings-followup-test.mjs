#!/usr/bin/env node
// Live gate for public reviews and two-party no-show marking.
//
// Run only against a disposable, migrated Development database; the fixtures seed direct referee rows.
//
//   STEEPLE_DB='<disposable database URL>' node tools/ratings-followup-test.mjs \
//     "http://localhost:5173/?q=low&world=off"

import { AxePuppeteer } from '@axe-core/puppeteer';
import {
  API,
  agreeCurrent,
  apiIsUp,
  apply,
  at,
  call,
  closeBrowsers,
  isEnvironmentNoise,
  launch,
  mintGuest,
  mintVenue,
  nextWeekday,
  routes,
  signInPage,
  sql,
  stamp,
} from './fixtures.mjs';

for (const fatal of ['uncaughtException', 'unhandledRejection']) {
  process.on(fatal, async (error) => {
    await closeBrowsers();
    console.log(`\nthe run stopped: ${error?.stack ?? error?.message ?? error}`);
    process.exit(1);
  });
}

const APP = process.argv[2] ?? 'http://localhost:5173/?q=low&world=off';
const MODE = process.argv[3] ?? 'all';
const SHOTS = {
  desktop: '/tmp/steeple-ratings-followup-desktop.png',
  noShowDesktop: '/tmp/steeple-ratings-followup-no-show-desktop.png',
  mobile: '/tmp/steeple-ratings-followup-mobile.png',
  noShowMobile: '/tmp/steeple-ratings-followup-no-show-mobile.png',
};
const XSS_COMMENT = '<img src=x onerror="window.__ratingsXss=true"> Neighbours & friends';
const HIDDEN_COMMENT = 'HIDDEN REVIEW MUST NEVER LEAVE STEEPLE';
const BLIND_COMMENT = 'BLIND REVIEW MUST NEVER LEAVE STEEPLE';

let checks = 0;
let failures = 0;
const problems = [];
const expectedFailures = new Set();

function check(label, ok, detail = '') {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

function eq(label, actual, expected) {
  check(label, Object.is(actual, expected), `wanted ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const settle = (page) => page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));

async function openPage(label, viewport = { width: 1440, height: 900 }) {
  const browser = await launch();
  const page = await browser.newPage();
  await page.setViewport(viewport);
  page.on('pageerror', (error) => problems.push(`[${label}] ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error' || isEnvironmentNoise(message)) return;
    const location = message.location()?.url ?? '';
    if ([...expectedFailures].some((part) => location.includes(part))) return;
    problems.push(`[${label}] ${message.text()}`);
  });
  return page;
}

async function boot(page, url = APP) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    () => window.__steepleReady === true && window.__steeple?.state?.roll >= 1,
    { timeout: 30000 }
  );
}

async function until(page, fn, arg = null, what = 'the condition', timeout = 30000) {
  try {
    await page.waitForFunction(fn, { timeout, polling: 120 }, arg);
  } catch {
    const state = await page.evaluate(() => ({
      view: window.__steeple?.state?.view ?? null,
      mode: window.__steeple?.state?.mode ?? null,
      applicationId: window.__steeple?.state?.applicationId ?? null,
      path: location.pathname,
    }));
    throw new Error(`${what} never came true — page was ${JSON.stringify(state)}`);
  }
}

async function untilLocal(fn, what, timeout = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (fn()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${what} never came true`);
}

async function steady(page, selector, timeout = 30000) {
  await page.waitForSelector(selector, { visible: true, timeout });
  await page.waitForFunction(
    (target) => {
      const node = document.querySelector(target);
      if (!node) return false;
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && Number(style.opacity) > 0.9;
    },
    { timeout, polling: 120 },
    selector
  );
}

async function press(page, selector, tries = 6) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      await steady(page, selector);
      await page.click(selector);
      return;
    } catch (error) {
      if (attempt === tries - 1) throw new Error(`could not press ${selector}: ${error.message}`);
      await settle(page);
    }
  }
}

async function wheelIntoView(page, selector, scrollerSelector = '.sheet--room .sheet__body') {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const target = await page.$(selector);
    if (!target) throw new Error(`nothing at ${selector}`);
    const box = await target.boundingBox();
    if (box && box.y >= 0 && box.y + box.height <= (await page.evaluate(() => innerHeight))) {
      await settle(page);
      return;
    }
    const scroller = await page.$(scrollerSelector);
    const scrollBox = await scroller?.boundingBox();
    if (!scrollBox) throw new Error('the room sheet has no scroll box');
    await page.mouse.move(scrollBox.x + scrollBox.width / 2, scrollBox.y + scrollBox.height / 2);
    await page.mouse.wheel({ deltaY: 600 });
    await settle(page);
  }
  throw new Error(`${selector} did not scroll into view`);
}

async function tabTo(page, selector, presses = 100) {
  for (let index = 0; index < presses; index += 1) {
    if (await page.evaluate((target) => document.activeElement?.matches(target) ?? false, selector)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`keyboard focus did not reach ${selector}`);
}

async function audit(page, name, selector) {
  const result = await new AxePuppeteer(page)
    .include(selector)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  const severe = result.violations.filter((item) => item.impact === 'critical' || item.impact === 'serious');
  check(`${name} has no serious axe findings`, severe.length === 0, severe.map((item) => item.id).join(', '));
}

async function oneOff(guest, room, dow, key) {
  const date = nextWeekday(dow, 7);
  const answer = await call('POST', `/listings/${room.roomId}/applications`, {
    token: guest.token,
    key: `${key}-${stamp}`,
    body: {
      activityType: 'community',
      groupSize: 10,
      intentText: 'A neighbourhood gathering used by the live ratings follow-up gate.',
      organizationName: null,
      turnstileToken: null,
      schedule: {
        frequency: 'oneOff',
        startDate: date,
        endDate: null,
        daysOfWeek: null,
        startTime: '18:00',
        endTime: '20:00',
      },
    },
  });
  if (answer.status !== 200 && answer.status !== 201) {
    throw new Error(`${key} booking answered ${answer.status} ${JSON.stringify(answer.body)}`);
  }
  return answer.body;
}

function clonePastBooking(baseBookingId, daysAgo) {
  return sql(`
    with ids as materialized (
      select gen_random_uuid() as application_id, gen_random_uuid() as booking_id, gen_random_uuid() as occurrence_id
    ), copied_application as (
      insert into applications (
        "Id", "RoomId", "OrganizerId", "ActivityType", "GroupSize", "Frequency", "StartDate", "EndDate",
        "StartTime", "EndTime", "IntentText", "Status", "IdempotencyKey", "CreatedAtUtc", "DecidedAtUtc",
        "ExpiresAtUtc", "DaysOfWeekMask", "OrganizationName"
      )
      select ids.application_id, a."RoomId", a."OrganizerId", a."ActivityType", a."GroupSize", 0,
        current_date - ${daysAgo}, null, a."StartTime", a."EndTime", a."IntentText", 2, null,
        now() - interval '${daysAgo} days', now() - interval '${daysAgo} days', now() + interval '14 days', null,
        a."OrganizationName"
      from bookings source
      join applications a on a."Id" = source."ApplicationId"
      cross join ids
      where source."Id" = '${baseBookingId}'
      returning "Id"
    ), copied_booking as (
      insert into bookings (
        "Id", "ApplicationId", "RoomId", "OrganizerId", "Type", "StartDate", "EndDate", "StartTime", "EndTime",
        "Status", "CancelledBy", "CancelledAtUtc", "CancelReason", "RenewalNudgeSentAtUtc", "CreatedAtUtc",
        "DaysOfWeekMask", "PricePerOccurrence", "Currency"
      )
      select ids.booking_id, ids.application_id, b."RoomId", b."OrganizerId", 0, current_date - ${daysAgo},
        current_date - ${daysAgo}, b."StartTime", b."EndTime", 1, null, null, null, null,
        now() - interval '${daysAgo} days', null, b."PricePerOccurrence", b."Currency"
      from bookings b
      cross join ids
      cross join copied_application
      where b."Id" = '${baseBookingId}'
      returning "Id", "RoomId"
    ), copied_occurrence as (
      insert into booking_occurrences ("Id", "BookingId", "RoomId", "StartUtc", "EndUtc", "LocalDate", "Status", "NoShowMarkedBy")
      select ids.occurrence_id, ids.booking_id, copied_booking."RoomId",
        date_trunc('day', now()) - interval '${daysAgo} days' + interval '10 hours',
        date_trunc('day', now()) - interval '${daysAgo} days' + interval '12 hours',
        current_date - ${daysAgo}, 1, null
      from ids cross join copied_booking
    )
    select booking_id from ids;
  `);
}

function insertRating({ bookingId, venueId, organizerId, raterId, stars, comment, createdHoursAgo, hidden = false, pair = true }) {
  const escaped = comment === null ? 'null' : `'${comment.replaceAll("'", "''")}'`;
  sql(`
    insert into ratings ("Id", "BookingId", "RaterId", "RateeType", "Stars", "Comment", "CreatedAtUtc", "HiddenAtUtc", "VenueId", "OrganizerId")
    values (gen_random_uuid(), '${bookingId}', '${raterId}', 2, ${stars}, ${escaped}, now() - interval '${createdHoursAgo} hours',
      ${hidden ? 'now()' : 'null'}, '${venueId}', '${organizerId}');
    ${pair ? `insert into ratings ("Id", "BookingId", "RaterId", "RateeType", "Stars", "Comment", "CreatedAtUtc", "HiddenAtUtc", "VenueId", "OrganizerId")
      select gen_random_uuid(), '${bookingId}', vm."UserId", 1, 5, null, now() - interval '${createdHoursAgo} hours', null,
        '${venueId}', '${organizerId}' from venue_managers vm where vm."VenueId" = '${venueId}' limit 1;` : ''}
  `);
}

if (!(await apiIsUp())) {
  console.log(`\nThe steeple API is not answering at ${API} — this suite needs it.`);
  process.exit(2);
}

let reviewPage;
let staleRoomPage;
let firstFailurePage;
let guestPage;
let staleGuestPage;
let hostPage;

try {
  console.log('\nfixtures');
  const host = await mintVenue({
    email: `ratings-followup-host-${stamp}@example.org`,
    name: 'Marisol Grant',
    venueName: `Wren Assembly Rooms ${stamp}`,
    roomName: 'Wren Hall',
    bookingMode: 'instant',
  });
  await agreeCurrent(host.token);
  const singleHost = await mintVenue({
    email: `ratings-single-host-${stamp}@example.org`,
    name: 'Anika Shah',
    venueName: `Linden Meeting House ${stamp}`,
    roomName: 'Linden Room',
    bookingMode: 'instant',
  });
  await agreeCurrent(singleHost.token);
  const reviewGuest = await mintGuest({
    email: `ratings-review-guest-${stamp}@example.org`,
    name: 'June Okafor',
  });
  await agreeCurrent(reviewGuest.token);
  const guest = await mintGuest({
    email: `ratings-no-show-guest-${stamp}@example.org`,
    name: 'Theo Lennox',
  });
  await agreeCurrent(guest.token);
  eq('fixture: the review room is public', host.listingStatus, 200);

  const reviewBase = await oneOff(reviewGuest, host, 3, 'review-base');
  const singleReviewBase = await oneOff(reviewGuest, singleHost, 2, 'single-review');
  const guestNoShow = await apply(guest, host, { dow: 4, weeks: 3 });
  const hostNoShow = await oneOff(guest, host, 5, 'host-no-show');
  check('fixture: all four applications booked immediately', [reviewBase, singleReviewBase, guestNoShow, hostNoShow].every((item) => item.bookingId));

  const reviewGuestId = reviewGuest.user.id;
  const guestId = guest.user.id;
  const visible = Array.from({ length: 11 }, (_, index) => ({
    comment: index === 0 ? XSS_COMMENT : `Review ${String(index + 1).padStart(2, '0')} from the live gate`,
    stars: 5 - (index % 3),
  }));
  for (const [index, item] of visible.entries()) {
    const bookingId = clonePastBooking(reviewBase.bookingId, 30 + index);
    insertRating({
      bookingId,
      venueId: host.venueId,
      organizerId: reviewGuestId,
      raterId: reviewGuestId,
      stars: item.stars,
      comment: item.comment,
      createdHoursAgo: index + 1,
    });
  }
  const noCommentBooking = clonePastBooking(reviewBase.bookingId, 50);
  insertRating({
    bookingId: noCommentBooking,
    venueId: host.venueId,
    organizerId: reviewGuestId,
    raterId: reviewGuestId,
    stars: 5,
    comment: null,
    createdHoursAgo: 20,
  });
  const hiddenBooking = clonePastBooking(reviewBase.bookingId, 51);
  insertRating({
    bookingId: hiddenBooking,
    venueId: host.venueId,
    organizerId: reviewGuestId,
    raterId: reviewGuestId,
    stars: 1,
    comment: HIDDEN_COMMENT,
    createdHoursAgo: 0,
    hidden: true,
  });
  const blindBooking = clonePastBooking(reviewBase.bookingId, 3);
  insertRating({
    bookingId: blindBooking,
    venueId: host.venueId,
    organizerId: reviewGuestId,
    raterId: reviewGuestId,
    stars: 2,
    comment: BLIND_COMMENT,
    createdHoursAgo: 0,
    pair: false,
  });
  const singleBooking = clonePastBooking(singleReviewBase.bookingId, 35);
  insertRating({
    bookingId: singleBooking,
    venueId: singleHost.venueId,
    organizerId: reviewGuestId,
    raterId: reviewGuestId,
    stars: 4,
    comment: 'One quiet, singular review.',
    createdHoursAgo: 1,
  });

  const rawReviews = await call('GET', `/venues/${host.venueId}/ratings?page=1&pageSize=50`);
  eq('the public review endpoint answers', rawReviews.status, 200);
  eq('only revealed comments count as public reviews', rawReviews.body?.totalCount, visible.length);
  eq('reviews are newest first on the wire', rawReviews.body?.items?.map((item) => item.comment).join('|'), visible.map((item) => item.comment).join('|'));
  check('hidden referee copy never leaves the API', !JSON.stringify(rawReviews.body).includes(HIDDEN_COMMENT));
  check('blind referee copy never leaves the API', !JSON.stringify(rawReviews.body).includes(BLIND_COMMENT));

  if (MODE !== 'no-show') {
  console.log('\n1 · public reviews on the room sheet');
  reviewPage = await openPage('reviews');
  let failLaterPage = true;
  await reviewPage.setRequestInterception(true);
  reviewPage.on('request', async (request) => {
    const requestUrl = new URL(request.url());
    if (
      failLaterPage &&
      requestUrl.pathname === `/api/v1/venues/${host.venueId}/ratings` &&
      Number(requestUrl.searchParams.get('page')) > 1
    ) {
      failLaterPage = false;
      expectedFailures.add(`/venues/${host.venueId}/ratings`);
      await request.respond({
        status: 503,
        contentType: 'application/problem+json',
        body: JSON.stringify({ code: 'unavailable', detail: 'Review service paused for the live gate.' }),
      });
      return;
    }
    await request.continue();
  });
  await boot(reviewPage);
  await press(reviewPage, `.dm-row[data-venue="${host.venueSlug}"][data-room="${host.roomSlug}"]`);
  await until(reviewPage, () => Boolean(document.querySelector('.reviews')), null, 'the first review page');

  // DOM selectors below are the public-reviews implementation contract.
  const firstPage = await reviewPage.evaluate(() => ({
    comments: [...document.querySelectorAll('.review__comment')].map((node) => node.textContent),
    rows: document.querySelectorAll('.review').length,
    total: document.querySelector('.reviews')?.dataset.reviewCount ?? null,
    aggregate: document.querySelector('.headline__rating')?.textContent?.trim() ?? '',
    firstName: document.querySelector('.review__name')?.textContent ?? null,
    firstStars: document.querySelector('.review__stars')?.textContent ?? null,
    firstDate: document.querySelector('.review__date')?.getAttribute('datetime') ?? null,
    firstFact: document.querySelector('.review__fact .visually-hidden')?.textContent ?? null,
    followsRules: Boolean(
      document.querySelector('.block--rules')?.compareDocumentPosition(document.querySelector('.reviews')) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ),
    htmlImages: document.querySelectorAll('.review__comment img').length,
    xssRan: window.__ratingsXss === true,
    body: document.body.textContent,
  }));
  eq('the newest public comment leads', firstPage.comments[0], XSS_COMMENT);
  eq('the first page starts with ten comments', firstPage.rows, 10);
  check('the aggregate counts the commentless rating too', /12 ratings/.test(firstPage.aggregate), firstPage.aggregate);
  eq('the review feed names its author', firstPage.firstName, reviewGuest.name);
  eq('and prints its stars', firstPage.firstStars, '★★★★★');
  check('and carries a machine-readable date', !Number.isNaN(Date.parse(firstPage.firstDate)), firstPage.firstDate);
  check('the star fact is spoken once in a full sentence', /Review by June Okafor\. 5 out of 5 stars\./.test(firstPage.firstFact ?? ''), firstPage.firstFact);
  eq('reviews follow the house rules', firstPage.followsRules, true);
  eq('malicious-looking review copy stays text', firstPage.htmlImages, 0);
  eq('review copy did not execute', firstPage.xssRan, false);
  check('hidden review copy is absent from the page', !firstPage.body.includes(HIDDEN_COMMENT));
  check('blind review copy is absent from the page', !firstPage.body.includes(BLIND_COMMENT));

  await tabTo(reviewPage, '.sheet--room .sheet__body');
  eq('the details region accepts sequential keyboard focus', await reviewPage.evaluate(() => document.activeElement?.getAttribute('role')), 'region');
  eq('the details region names the room', await reviewPage.$eval('.sheet--room .sheet__body', (node) => node.getAttribute('aria-label')), `Details for ${host.roomName}`);
  await settle(reviewPage);
  await reviewPage.keyboard.press('PageDown', { delay: 150 });
  await reviewPage.waitForFunction(
    () => (document.querySelector('.sheet--room .sheet__body')?.scrollTop ?? 0) > 0,
    { timeout: 5000, polling: 60 }
  );
  check('PageDown scrolls the focused details region', true);

  const initialRows = firstPage.rows;
  await wheelIntoView(reviewPage, '.reviews [data-review-action="page"]');
  const reviewScroll = await reviewPage.$eval('.sheet--room .sheet__body', (node) => node.scrollTop);
  await press(reviewPage, '.reviews [data-review-action="page"]');
  await until(reviewPage, () => Boolean(document.querySelector('.reviews__problem')), null, 'the later-page refusal');
  const afterFailure = await reviewPage.evaluate(() => ({
    rows: document.querySelectorAll('.review').length,
    text: document.querySelector('.reviews__problem')?.textContent?.trim() ?? '',
    retry: document.querySelector('.reviews [data-review-action="page"]')?.textContent?.trim() ?? null,
    active: document.activeElement?.getAttribute('data-review-action') ?? null,
    scroll: document.querySelector('.sheet--room .sheet__body')?.scrollTop ?? null,
  }));
  eq('a later-page failure preserves the reviews already read', afterFailure.rows, initialRows);
  check('the failure is said without discarding the section', Boolean(afterFailure.text), afterFailure.text);
  eq('the failed page offers a retry', afterFailure.retry, 'Try again');
  eq('focus returns to the review pager after failure', afterFailure.active, 'page');
  check('the failed repaint preserves scroll', Math.abs(afterFailure.scroll - reviewScroll) <= 2, `${reviewScroll} → ${afterFailure.scroll}`);

  await press(reviewPage, '.reviews [data-review-action="page"]');
  await until(reviewPage, (count) => document.querySelectorAll('.review').length > count, initialRows, 'the retried page');
  const loadedAfterRetry = await reviewPage.evaluate(() => ({
    comments: [...document.querySelectorAll('.review__comment')].map((node) => node.textContent),
    scroll: document.querySelector('.sheet--room .sheet__body')?.scrollTop ?? null,
  }));
  eq('retry appends the next reviews in order', loadedAfterRetry.comments.join('|'), visible.slice(0, loadedAfterRetry.comments.length).map((item) => item.comment).join('|'));
  check('the successful repaint preserves scroll too', Math.abs(loadedAfterRetry.scroll - reviewScroll) <= 2, `${reviewScroll} → ${loadedAfterRetry.scroll}`);

  while (await reviewPage.$('.reviews [data-review-action="page"]')) {
    const before = await reviewPage.$$eval('.review', (nodes) => nodes.length);
    const beforeScroll = await reviewPage.$eval('.sheet--room .sheet__body', (node) => node.scrollTop);
    await press(reviewPage, '.reviews [data-review-action="page"]');
    await until(reviewPage, (count) => document.querySelectorAll('.review').length > count, before, 'another review page');
    const afterScroll = await reviewPage.$eval('.sheet--room .sheet__body', (node) => node.scrollTop);
    check('paging preserves the room sheet scroll', Math.abs(afterScroll - beforeScroll) <= 2, `${beforeScroll} → ${afterScroll}`);
  }
  const allComments = await reviewPage.$$eval('.review__comment', (nodes) => nodes.map((node) => node.textContent));
  eq('every public comment appears once, newest first', allComments.join('|'), visible.map((item) => item.comment).join('|'));
  eq('the final page hands focus to its last review', await reviewPage.evaluate(() => document.activeElement?.dataset.reviewEnd ?? null), '');
  eq('the review section labels its count accessibly', await reviewPage.$eval('.reviews h2', (node) => node.getAttribute('aria-label')), '11 reviews');
  await audit(reviewPage, 'review section', '.sheet--room');
  await reviewPage.screenshot({ path: SHOTS.desktop });

  await reviewPage.keyboard.press('Escape');
  await until(reviewPage, () => window.__steeple.state.view === 'venue', null, 'the review venue');
  await reviewPage.keyboard.press('Escape');
  await until(reviewPage, () => window.__steeple.state.view === 'village', null, 'the search after reviews');
  await press(reviewPage, `.dm-row[data-venue="${singleHost.venueSlug}"][data-room="${singleHost.roomSlug}"]`);
  await until(reviewPage, () => document.querySelector('.reviews')?.dataset.reviewCount === '1', null, 'the singular review');
  eq('one comment is announced as one review', await reviewPage.$eval('.reviews h2', (node) => node.getAttribute('aria-label')), '1 review');

  staleRoomPage = await openPage('review-race');
  await staleRoomPage.setRequestInterception(true);
  let heldReview = null;
  staleRoomPage.on('request', async (request) => {
    const requestUrl = new URL(request.url());
    if (!heldReview && requestUrl.pathname === `/api/v1/venues/${host.venueId}/ratings`) {
      heldReview = request;
      return;
    }
    await request.continue();
  });
  await boot(staleRoomPage, at(APP, routes.room(host.venueSlug, host.roomSlug)));
  await until(staleRoomPage, () => Boolean(document.querySelector('.sheet--room.is-open')), null, 'the review room');
  await untilLocal(() => Boolean(heldReview), 'the held old-room review read');
  await staleRoomPage.keyboard.press('Escape');
  await until(staleRoomPage, () => window.__steeple.state.view === 'venue', null, 'the venue above the old room');
  await staleRoomPage.keyboard.press('Escape');
  await until(staleRoomPage, () => window.__steeple.state.view === 'village', null, 'the search behind the old venue');
  const seedRoom = await staleRoomPage.waitForFunction((oldVenue) => {
    const row = [...document.querySelectorAll('.dm-row')].find((node) => node.dataset.venue !== oldVenue);
    return row ? { venue: row.dataset.venue, room: row.dataset.room } : false;
  }, { timeout: 30000 }, host.venueSlug).then((handle) => handle.jsonValue());
  await press(staleRoomPage, `.dm-row[data-venue="${seedRoom.venue}"][data-room="${seedRoom.room}"]`);
  await until(staleRoomPage, (room) => window.__steeple.state.roomId === room, seedRoom.room, 'the next room');
  void heldReview.continue().catch(() => {});
  await settle(staleRoomPage);
  await settle(staleRoomPage);
  const staleState = await staleRoomPage.evaluate(() => ({
    room: window.__steeple.state.roomId,
    leaked: document.body.textContent.includes('Review 02 from the live gate'),
    reviews: document.querySelectorAll('.reviews').length,
  }));
  eq('a late response leaves the newly opened room current', staleState.room, seedRoom.room);
  eq('the old room review never paints into it', staleState.leaked, false);
  eq('a room with no comments says nothing about reviews', staleState.reviews, 0);

  firstFailurePage = await openPage('review-first-failure');
  await firstFailurePage.setRequestInterception(true);
  let firstReviewFailed = false;
  firstFailurePage.on('request', async (request) => {
    const requestUrl = new URL(request.url());
    if (!firstReviewFailed && requestUrl.pathname === `/api/v1/venues/${singleHost.venueId}/ratings`) {
      firstReviewFailed = true;
      expectedFailures.add(`/venues/${singleHost.venueId}/ratings`);
      await request.respond({
        status: 503,
        contentType: 'application/problem+json',
        body: JSON.stringify({ code: 'unavailable', detail: 'Review service paused for the live gate.' }),
      });
      return;
    }
    await request.continue();
  });
  await boot(firstFailurePage, at(APP, routes.room(singleHost.venueSlug, singleHost.roomSlug)));
  await untilLocal(() => firstReviewFailed, 'the first review refusal');
  await settle(firstFailurePage);
  const firstFailureState = await firstFailurePage.evaluate(() => ({
    sections: document.querySelectorAll('.reviews').length,
    errorCopy: document.body.textContent.includes("reviews couldn't be loaded"),
  }));
  eq('a failed first page renders no review section', firstFailureState.sections, 0);
  eq('and no orphaned review error', firstFailureState.errorCopy, false);
  for (const page of [reviewPage, staleRoomPage, firstFailurePage]) await page.browser().close();
  }

  console.log('\n2 · either party can mark a no-show');
  const guestOccurrenceIds = sql(`select "Id" from booking_occurrences where "BookingId" = '${guestNoShow.bookingId}' order by "StartUtc";`).split('\n');
  sql(`
    update booking_occurrences set "StartUtc" = now() - interval '3 days', "EndUtc" = now() - interval '3 days' + interval '2 hours',
      "LocalDate" = current_date - 3, "Status" = 1 where "Id" = '${guestOccurrenceIds[0]}';
    update booking_occurrences set "Status" = 3 where "Id" = '${guestOccurrenceIds[2]}';
  `);
  const hostOccurrenceId = sql(`select "Id" from booking_occurrences where "BookingId" = '${hostNoShow.bookingId}' limit 1;`);
  sql(`
    update booking_occurrences set "StartUtc" = now() - interval '2 days', "EndUtc" = now() - interval '2 days' + interval '2 hours',
      "LocalDate" = current_date - 2, "Status" = 1 where "Id" = '${hostOccurrenceId}';
    update bookings set "StartDate" = current_date - 2, "EndDate" = current_date - 2 where "Id" = '${hostNoShow.bookingId}';
  `);

  guestPage = await openPage('guest-no-show');
  staleGuestPage = await openPage('guest-no-show-stale');
  for (const page of [guestPage, staleGuestPage]) {
    await boot(page);
    await signInPage(page, guest.email, guest.name);
    await page.evaluate(() => window.__steeple.setView('journal'));
    await until(page, (id) => Boolean(document.querySelector(`.jrow[data-id="${id}"]`)), guestNoShow.id, 'the guest booking row');
    await press(page, `.jrow[data-id="${guestNoShow.id}"]`);
    await until(page, () => Boolean(document.querySelector('.guest__surface--opened')), null, 'the guest letter');
    await until(page, (id) => Boolean(document.querySelector(`[data-occurrence="${id}"][data-status="occurred"]`)), guestOccurrenceIds[0], 'the past occurrence');
  }

  const guestActions = await guestPage.evaluate((ids) => Object.fromEntries(ids.map((id) => [
    id,
    Boolean(document.querySelector(`[data-occurrence="${id}"][data-action="no-show-open"]`)),
  ])), guestOccurrenceIds);
  eq('the past occurred date offers the guest a no-show action', guestActions[guestOccurrenceIds[0]], true);
  eq('a future date offers no no-show action', guestActions[guestOccurrenceIds[1]], false);
  eq('a cancelled date offers no no-show action', guestActions[guestOccurrenceIds[2]], false);

  await press(guestPage, `[data-occurrence="${guestOccurrenceIds[0]}"][data-action="no-show-open"]`);
  await until(guestPage, () => Boolean(document.querySelector('[data-action="no-show-confirm"]')), null, 'the guest confirmation');
  const guestConfirm = await guestPage.$eval(`[data-occurrence="${guestOccurrenceIds[0]}"][data-status="occurred"]`, (node) => node.textContent.trim());
  check('the guest confirmation names the venue and says the mark is final', guestConfirm.includes(host.venueName) && /final/i.test(guestConfirm), guestConfirm);
  eq('the final action receives focus', await guestPage.evaluate(() => document.activeElement?.getAttribute('data-action')), 'no-show-confirm');
  await press(guestPage, '[data-action="no-show-cancel"]');
  eq('leaving confirmation returns focus to its opening action', await guestPage.evaluate(() => document.activeElement?.getAttribute('data-action')), 'no-show-open');
  await press(guestPage, `[data-occurrence="${guestOccurrenceIds[0]}"][data-action="no-show-open"]`);
  await press(guestPage, '[data-action="no-show-confirm"]');
  await until(guestPage, (id) => document.querySelector(`[data-occurrence="${id}"][data-status="noShow"]`), guestOccurrenceIds[0], 'the guest-marked no-show');
  eq('the guest result receives focus', await guestPage.evaluate(() => document.activeElement?.getAttribute('data-result')), 'no-show');

  const guestMarked = await call('GET', `/bookings/${guestNoShow.bookingId}`, { token: guest.token });
  const guestOccurrence = guestMarked.body?.occurrences?.find((item) => item.id === guestOccurrenceIds[0]);
  eq('the server records the guest-marked occurrence as noShow', guestOccurrence?.status, 'noShow');
  eq('the server marker identity is the guest', guestOccurrence?.noShowMarkedBy, guestId);
  const guestMirrorMarker = await guestPage.evaluate((id) => window.__steeple.store.occurrencesFor(id).find((item) => item.status === 'noShow')?.noShowMarkedBy ?? null, guestNoShow.bookingId);
  eq('the booking mirror preserves the server marker', guestMirrorMarker, guestId);
  check('the guest letter attributes the mark to their group', await guestPage.$eval(`[data-result="no-show"][data-occurrence="${guestOccurrenceIds[0]}"]`, (node) => /Your group marked .* as absent\./.test(node.textContent)), '');
  await guestPage.screenshot({ path: SHOTS.noShowDesktop });
  await guestPage.browser().close();

  expectedFailures.add(`/occurrences/${guestOccurrenceIds[0]}/no-show`);
  await press(staleGuestPage, `[data-occurrence="${guestOccurrenceIds[0]}"][data-action="no-show-open"]`);
  await press(staleGuestPage, '[data-action="no-show-confirm"]');
  await until(staleGuestPage, () => Boolean(document.querySelector('.opened__refusal')?.textContent?.trim()), null, 'the duplicate refusal');
  const duplicateRefusal = await staleGuestPage.$eval('.opened__refusal', (node) => node.textContent.trim());
  check('a stale duplicate reports the server 409 detail', /already marked/i.test(duplicateRefusal), duplicateRefusal);
  eq('the duplicate did not replace the original marker', sql(`select "NoShowMarkedBy" from booking_occurrences where "Id" = '${guestOccurrenceIds[0]}';`), guestId);
  await staleGuestPage.browser().close();

  hostPage = await openPage('host-no-show');
  await boot(hostPage);
  await signInPage(hostPage, host.email, host.name);
  await hostPage.evaluate(() => window.__steeple.setView('journal'));
  await until(hostPage, (id) => Boolean(document.querySelector(`.jrow--hosting[data-id="${id}"]`)), hostNoShow.id, 'the host booking row');
  await press(hostPage, `.jrow--hosting[data-id="${hostNoShow.id}"]`);
  await until(hostPage, () => Boolean(document.querySelector('.letterpage.is-open')), null, 'the host letter');
  await until(hostPage, (id) => Boolean(document.querySelector(`[data-occurrence="${id}"]`)), hostOccurrenceId, 'the host occurrence');
  await press(hostPage, `[data-occurrence="${hostOccurrenceId}"][data-action="no-show-open"]`);
  await until(hostPage, () => Boolean(document.querySelector('[data-action="no-show-confirm"]')), null, 'the host confirmation');
  const hostConfirm = await hostPage.$eval(`[data-occurrence="${hostOccurrenceId}"][data-status="occurred"]`, (node) => node.textContent.trim());
  check('the host confirmation names the organizer and says the mark is final', /Theo Lennox/.test(hostConfirm) && /final/i.test(hostConfirm), hostConfirm);
  eq('the host final action receives focus', await hostPage.evaluate(() => document.activeElement?.getAttribute('data-action')), 'no-show-confirm');
  await press(hostPage, '[data-action="no-show-confirm"]');
  await until(hostPage, (id) => document.querySelector(`[data-occurrence="${id}"][data-status="noShow"]`), hostOccurrenceId, 'the host-marked no-show');
  eq('the host result receives focus', await hostPage.evaluate(() => document.activeElement?.getAttribute('data-result')), 'no-show');

  const hostMarked = await call('GET', `/bookings/${hostNoShow.bookingId}`, { token: host.token });
  const hostOccurrence = hostMarked.body?.occurrences?.find((item) => item.id === hostOccurrenceId);
  eq('the server records the host-marked occurrence as noShow', hostOccurrence?.status, 'noShow');
  eq('the server marker identity is the host', hostOccurrence?.noShowMarkedBy, host.user.id);
  check('the host letter attributes the mark to the venue', await hostPage.$eval(`[data-result="no-show"][data-occurrence="${hostOccurrenceId}"]`, (node) => /marked Theo Lennox as absent\./.test(node.textContent)), '');

  const hostRating = await call('POST', `/bookings/${hostNoShow.bookingId}/ratings`, {
    token: host.token,
    body: { stars: 3, comment: 'They missed this date.' },
  });
  const guestRating = await call('POST', `/bookings/${hostNoShow.bookingId}/ratings`, {
    token: guest.token,
    body: { stars: 5, comment: 'The venue handled this kindly.' },
  });
  eq('fixture: the host rating is accepted', hostRating.status, 204);
  eq('fixture: rating back reveals the organizer rating', guestRating.status, 204);

  await hostPage.keyboard.press('Escape');
  await until(hostPage, () => window.__steeple.state.view === 'desk', null, 'the host desk');
  await hostPage.evaluate(() => window.__steeple.setView('journal'));
  await until(hostPage, () => window.__steeple.state.view === 'journal', null, 'the host inbox');
  await press(hostPage, `.jrow--hosting[data-id="${hostNoShow.id}"]`);
  await until(hostPage, () => /1 no-show this year/i.test(document.querySelector('.letterpage')?.textContent ?? ''), null, 'the revealed organizer trust summary');
  const trustText = await hostPage.$eval('.letterpage', (node) => node.textContent);
  check('a revealed organizer rating carries the host-marked no-show into trust', /3\.0 out of 5/i.test(trustText) && /1 no-show this year/i.test(trustText), trustText.replace(/\s+/g, ' ').slice(0, 300));
  await audit(hostPage, 'host no-show letter', '.letterpage');

  await hostPage.setViewport({ width: 430, height: 932, deviceScaleFactor: 2 });
  await settle(hostPage);
  await hostPage.screenshot({ path: SHOTS.mobile });
  await wheelIntoView(hostPage, `[data-result="no-show"][data-occurrence="${hostOccurrenceId}"]`, '.letterpage__cols');
  await hostPage.screenshot({ path: SHOTS.noShowMobile });
} finally {
  await closeBrowsers();
}

if (problems.length) {
  console.log('\npage problems:');
  for (const problem of [...new Set(problems)]) console.log(`  ${problem}`);
  failures += new Set(problems).size;
}

console.log(`\n${checks - failures}/${checks} checks passed`);
console.log(`screenshots: ${Object.values(SHOTS).join(', ')}`);
process.exit(failures ? 1 : 0);
