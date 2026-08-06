// The mirror's regression test — src/data/store.js, in plain node.
//   node tools/store-test.mjs
// Exits non-zero on the first failed expectation. Every agent runs this before
// declaring done; if you change the store, prove your new guard bites by
// breaking it once.
//
// Run it under three clocks — the calendar assertions are the reason:
//   TZ=UTC node tools/store-test.mjs
//   TZ=America/New_York node tools/store-test.mjs
//   TZ=Australia/Sydney node tools/store-test.mjs
// All three must be green. A store that only passes in the timezone the author
// happened to be sitting in is a store that freezes somebody else's browser.
//
// What this suite is for changed with v2_migration Phase 2 (D4). The store no
// longer decides anything: steeple does, and this is the cache of its answers.
// So the assertions are about **fidelity** — that an ApplicationDto, a
// CounterOfferDto and a BookingDto arrive here as exactly what they were — and
// about **ownership**: whose correspondence this browser is holding, and that
// the demo fixture can never be mistaken for somebody's.
//
// A store belongs to somebody (D6): the key is `steeple-village-store:{id}` and
// the id is steeple's own user id, so this suite stands a browser up and signs
// one in before it asks the store anything. localStorage comes first because
// data/session.js and data/store.js both probe for it as they are imported —
// hence the dynamic import below.

function browserStorage() {
  const cells = new Map();
  return {
    getItem: (k) => cells.get(k) ?? null,
    setItem: (k, v) => cells.set(k, String(v)),
    removeItem: (k) => cells.delete(k),
    key: (i) => [...cells.keys()][i] ?? null,
    get length() {
      return cells.size;
    },
  };
}

globalThis.localStorage = browserStorage();

const NADIA = {
  id: '9f1c0f2a-9d0e-4c0a-9d3e-2b6b8f0a1111',
  displayName: 'Nadia Prosser',
  email: 'nadia@example.org',
  createdAtUtc: '2025-09-01T00:00:00Z',
};

// The session record is the non-secret half only — who is signed in, and why
// that last changed. Tokens are memory and an httpOnly cookie (data/session.js).
localStorage.setItem(
  'steeple-village-session',
  JSON.stringify({ user: NADIA, reason: 'signedIn', stamp: Date.now() })
);

const {
  APP_STATUS,
  COUNTER_STATUS,
  GUEST_ID,
  addDays,
  daysToMask,
  nextWeekday,
  store,
  todayIso,
  weekdayOf,
} = await import('../src/data/store.js');
const session = await import('../src/data/session.js');

let failures = 0;
function expect(label, actual, wanted) {
  const ok = typeof wanted === 'function' ? wanted(actual) : actual === wanted;
  if (!ok) {
    failures++;
    console.error(`FAIL  ${label} — got ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok    ${label}`);
  }
}

store.resetDemo();

// ---- the demo fixture is scenery, and cannot be mistaken for a person -------
//
// It still lights the village's lanterns and draws its ribbons, so it is still
// here outside a production build. What it must never do is look like the
// signed-in person's correspondence: its letters are written under the seed's
// own ids, and a real account's id is steeple's GUID.

expect('fixture: the village still has correspondence to light', store.venueApplications('grace-community-vienna').length, 4);
expect('fixture: it is not written under a real account', GUEST_ID, 'maria-alvarez');
expect('fixture: so the signed-in person inherits none of it', store.guestApplications().length, 0);
expect('identity: the store is keyed to steeple’s own user id', store.currentOrganizerId(), NADIA.id);
expect(
  'fixture: open hours are still seeded for the village',
  store.openHoursFor('grace-community-vienna', 'fellowship-hall').length,
  7
);

// ---- the calendar, which must not care what clock the browser keeps ---------
//
// These are venue-local wall-clock dates, not instants. Doing the arithmetic in
// local time meant that on a backward DST transition — a 25-hour day — adding
// 86400000ms landed on the *same* calendar date, and `materializeDates` looped
// on a date that never advanced until the tab died. Run this suite under
// TZ=UTC, TZ=America/New_York and TZ=Australia/Sydney: all three must agree.
//
// 2026-11-01 is when the US falls back; 2026-04-05 is when Sydney does. Both
// are Sundays, which is also what `weekdayOf` has to keep saying about them.

const US_FALL_BACK = '2026-11-01';
const AU_FALL_BACK = '2026-04-05';

expect('dates: the day after the US falls back is the next day', addDays(US_FALL_BACK, 1), '2026-11-02');
expect('dates: and the day after Sydney does', addDays(AU_FALL_BACK, 1), '2026-04-06');
expect('dates: stepping back over the US transition', addDays('2026-11-02', -1), US_FALL_BACK);
expect('dates: and back over Sydney’s', addDays('2026-04-06', -1), AU_FALL_BACK);
// Spring forward is a 23-hour day — the same arithmetic, the other way.
expect('dates: the day after the US springs forward', addDays('2026-03-08', 1), '2026-03-09');
expect('dates: and after Sydney does', addDays('2026-10-04', 1), '2026-10-05');
expect('dates: a week over the US transition', addDays('2026-10-28', 7), '2026-11-04');
expect('dates: a year of them still lands', addDays('2026-01-01', 365), '2027-01-01');

expect('dates: the US fall-back is a Sunday', weekdayOf(US_FALL_BACK), 0);
expect('dates: so is Sydney’s', weekdayOf(AU_FALL_BACK), 0);
expect('dates: the day after each is a Monday', weekdayOf(addDays(US_FALL_BACK, 1)), 1);
expect('dates: and Sydney’s too', weekdayOf(addDays(AU_FALL_BACK, 1)), 1);

expect('dates: the next Wednesday after the US transition', nextWeekday(US_FALL_BACK, 3), '2026-11-04');
expect('dates: and after Sydney’s', nextWeekday(AU_FALL_BACK, 3), '2026-04-08');
expect('dates: a weekday asked for on its own day is that day', nextWeekday(US_FALL_BACK, 0), US_FALL_BACK);

// The loop itself. Weekly on Sundays, straddling each transition: it has to
// terminate, and land on exactly the three Sundays.
expect(
  'dates: a weekly schedule crosses the US fall-back and ends',
  store
    .materializeDates({
      frequency: 'weekly',
      startDate: '2026-10-25',
      endDate: '2026-11-08',
      daysOfWeekMask: daysToMask([0]),
    })
    .join(),
  '2026-10-25,2026-11-01,2026-11-08'
);
expect(
  'dates: and crosses Sydney’s',
  store
    .materializeDates({
      frequency: 'weekly',
      startDate: '2026-03-29',
      endDate: '2026-04-12',
      daysOfWeekMask: daysToMask([0]),
    })
    .join(),
  '2026-03-29,2026-04-05,2026-04-12'
);
// Every day of the week, so a skipped or repeated date shows up as a wrong set.
expect(
  'dates: no day is skipped or doubled over the US transition',
  store
    .materializeDates({
      frequency: 'weekly',
      startDate: '2026-10-31',
      endDate: '2026-11-03',
      daysOfWeekMask: daysToMask([0, 1, 2, 3, 4, 5, 6]),
    })
    .join(),
  '2026-10-31,2026-11-01,2026-11-02,2026-11-03'
);
expect(
  'dates: nor over Sydney’s',
  store
    .materializeDates({
      frequency: 'weekly',
      startDate: '2026-04-04',
      endDate: '2026-04-07',
      daysOfWeekMask: daysToMask([0, 1, 2, 3, 4, 5, 6]),
    })
    .join(),
  '2026-04-04,2026-04-05,2026-04-06,2026-04-07'
);
expect(
  'dates: a schedule that ends before it starts is no dates at all',
  store.materializeDates({
    frequency: 'weekly',
    startDate: '2026-11-08',
    endDate: '2026-11-01',
    daysOfWeekMask: daysToMask([0]),
  }).length,
  0
);

// Today is the one date read off the browser's own clock, on purpose: it is
// this person's calendar, not a venue's.
const now = new Date();
expect(
  'dates: today is the browser’s own calendar date',
  todayIso(),
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
);

// ---- validation, which is still this browser's to do live -------------------

const monday = nextWeekday(addDays(todayIso(), 7), 1);
const goodDraft = {
  venueId: 'vienna-presbyterian',
  roomId: 'music-room',
  activityType: 'Music',
  groupSize: 12,
  frequency: 'weekly',
  startDate: monday,
  endDate: addDays(monday, 28),
  daysOfWeekMask: daysToMask([1]),
  startTime: '18:00',
  endTime: '20:00',
  intentText: 'A community choir looking for a weekly rehearsal hour.',
};
const HOURS = [{ day: 1, start: '08:00', end: '22:00' }];

expect('validate: a sound weekly draft passes', store.validateApplication(goodDraft).ok, true);
expect(
  'validate: recurring without endDate fails',
  store.validateApplication({ ...goodDraft, endDate: null }).errors.endDate !== undefined,
  true
);
expect(
  'validate: groupSize over capacity fails',
  store.validateApplication({ ...goodDraft, groupSize: 999 }).errors.groupSize !== undefined,
  true
);
expect(
  'validate: activity the room does not host fails',
  store.validateApplication({ ...goodDraft, activityType: 'Sports' }).errors.activityType !== undefined,
  true
);
expect(
  'validate: intent over 2000 chars fails',
  store.validateApplication({ ...goodDraft, intentText: 'x'.repeat(2001) }).errors.intentText !==
    undefined,
  true
);
// Hours are steeple's now, and are only checked when the caller has been told
// them. A browser with no hours refuses nothing on its own account.
expect(
  'validate: outside the hours it was given fails',
  store.validateApplication({ ...goodDraft, startTime: '06:00', endTime: '07:00' }, { windows: HOURS })
    .errors.schedule !== undefined,
  true
);
expect(
  'validate: with no hours given, nothing is invented',
  store.validateApplication({ ...goodDraft, startTime: '06:00', endTime: '07:00' }).errors.schedule,
  undefined
);
// A room only the catalog knows is still a room the draft can be checked against.
expect(
  'validate: a room handed in stands in for one the village has no scenery for',
  store.validateApplication(
    { ...goodDraft, venueId: 'saint-bride-hall', roomId: 'long-room' },
    { room: { name: 'Long Room', capacity: 40, activities: ['Music'] } }
  ).ok,
  true
);

// ---- fidelity: steeple's documents, held exactly ----------------------------

const APPLICATION_ID = '11111111-1111-1111-1111-111111111111';
const ROOM_GUID = '22222222-2222-2222-2222-222222222222';

const dto = (over = {}) => ({
  id: APPLICATION_ID,
  roomId: ROOM_GUID,
  roomName: 'Music Room',
  venueName: 'Vienna Presbyterian Church',
  venueSlug: 'vienna-presbyterian',
  roomSlug: 'music-room',
  organizer: { id: NADIA.id, displayName: 'Nadia Prosser', ratingSummary: null },
  activityType: 'music',
  groupSize: 12,
  schedule: {
    frequency: 'recurringWeekly',
    startDate: monday,
    endDate: addDays(monday, 28),
    daysOfWeek: ['monday'],
    startTime: '18:00:00',
    endTime: '20:00:00',
  },
  intentText: 'A community choir looking for a weekly rehearsal hour.',
  status: 'pending',
  createdAtUtc: '2026-08-01T09:00:00Z',
  decidedAtUtc: null,
  expiresAtUtc: '2026-08-15T09:00:00Z',
  bookingId: null,
  messageCount: 0,
  messages: [],
  organizationName: 'Vienna Community Chorale',
  hasPaymentMethod: true,
  ...over,
});

const held = store.mirrorApplication(dto());
expect('mirror: the id is steeple’s', held.id, APPLICATION_ID);
expect('mirror: the slugs become the product’s ids', held.venueId, 'vienna-presbyterian');
expect('mirror: and the room’s', held.roomId, 'music-room');
expect('mirror: steeple’s room id travels alongside', held.remoteRoomId, ROOM_GUID);
expect('mirror: the wire’s activity token becomes the printed label', held.activityType, 'Music');
expect('mirror: recurringWeekly becomes weekly', held.frequency, 'weekly');
expect('mirror: weekday names become the schema’s mask', held.daysOfWeekMask, daysToMask([1]));
expect('mirror: seconds are cut off the times', held.startTime, '18:00');
expect('mirror: the organizer is steeple’s account', held.organizerId, NADIA.id);
expect('mirror: the group travels with the request', held.organizationName, 'Vienna Community Chorale');
expect('mirror: the card-on-file signal is kept', held.hasPaymentMethod, true);
expect('mirror: it is now this person’s', store.guestApplications().length, 1);

// A one-off is echoed with endDate equal to startDate; here it is one date.
const oneOff = store.mirrorApplication(
  dto({
    id: '33333333-3333-3333-3333-333333333333',
    schedule: {
      frequency: 'oneOff',
      startDate: monday,
      endDate: monday,
      daysOfWeek: null,
      startTime: '10:00:00',
      endTime: '12:00:00',
    },
  })
);
expect('mirror: a one-off has no end', oneOff.endDate, null);
expect('mirror: and no weekday mask', oneOff.daysOfWeekMask, null);

// The thread arrives with the detail read, and only then. A message present is
// its own proof of one: a list read hardcodes `messages: []`.
store.mirrorApplication(
  dto({
    status: 'needsInfo',
    messageCount: 2,
    messages: [
      { id: 'm1', senderId: 'host-user', body: 'How many tables?', sentAtUtc: '2026-08-02T09:00:00Z' },
      { id: 'm2', senderId: NADIA.id, body: 'Six, please.', sentAtUtc: '2026-08-02T10:00:00Z' },
    ],
  })
);
const thread = store.threadFor(APPLICATION_ID);
expect('mirror: the whole thread is held', thread.length, 2);
expect('mirror: the sender is read off the organizer’s id', thread[0].sender, 'host');
expect('mirror: and the other side is the guest', thread[1].sender, 'guest');
expect('mirror: the status came with it', store.getApplication(APPLICATION_ID).status, APP_STATUS.needsInfo);

// A list read carries no thread; the one already held survives it.
store.mirrorApplication(dto({ status: 'pending', messageCount: 2, messages: [] }));
expect('mirror: a list read does not empty the thread', store.threadFor(APPLICATION_ID).length, 2);

// The counter-offer, and only the live one — steeple returns no history.
const COUNTER = {
  id: 'c1',
  schedule: {
    frequency: 'recurringWeekly',
    startDate: addDays(monday, 2),
    endDate: addDays(monday, 30),
    daysOfWeek: ['wednesday'],
    startTime: '18:00:00',
    endTime: '20:00:00',
  },
  message: 'Wednesdays suit the room better.',
  status: 'open',
  createdAtUtc: '2026-08-03T09:00:00Z',
  respondedAtUtc: null,
};

// A counter can arrive on a detail read of a request nobody has written on:
// `messages: []`, exactly as a list read looks. Only lists hardcode
// `counterOffer: null`, so carrying one *is* the proof of a detail read, and
// the counter must be held whether or not the caller declared itself.
store.mirrorApplication(dto({ status: 'counterOffered', messageCount: 0, messages: [], counterOffer: COUNTER }));
const counter = store.openCounterFor(APPLICATION_ID);
expect('mirror: the open counter is held', counter?.status, COUNTER_STATUS.open);
expect('mirror: on the weekday steeple named', counter.daysOfWeekMask, daysToMask([3]));
expect('mirror: with its note', counter.message, 'Wednesdays suit the room better.');
expect('mirror: an undeclared counter did not cost the held thread', store.threadFor(APPLICATION_ID).length, 2);

// A list read of the same request — `counterOffer: null` because lists always
// say null, never because the counter went away. It must erase neither.
store.mirrorApplication(dto({ status: 'counterOffered', messageCount: 2, messages: [], counterOffer: null }));
expect(
  'mirror: a list read does not forget a live counter',
  store.openCounterFor(APPLICATION_ID)?.status,
  COUNTER_STATUS.open
);
expect('mirror: nor the thread beside it', store.threadFor(APPLICATION_ID).length, 2);

// Decided: the counter is gone because steeple stopped sending it — and this is
// a detail read saying so, which is the only read allowed to clear one.
store.mirrorApplication(
  dto({ status: 'approved', bookingId: '44444444-4444-4444-4444-444444444444' }),
  { thread: true }
);
expect('mirror: a decided request has no live counter', store.openCounterFor(APPLICATION_ID), null);
expect('mirror: and reads approved', store.getApplication(APPLICATION_ID).status, APP_STATUS.approved);
// Clearing is the declared read's alone — which is the whole reason `thread`
// still exists now that a carried thread proves itself.
expect('mirror: a declared detail read is what empties a thread', store.threadFor(APPLICATION_ID).length, 0);

// The booking, with its payment posture passed through untouched.
const booking = store.mirrorBooking({
  id: '44444444-4444-4444-4444-444444444444',
  applicationId: APPLICATION_ID,
  roomId: ROOM_GUID,
  roomName: 'Music Room',
  venueName: 'Vienna Presbyterian Church',
  venueSlug: 'vienna-presbyterian',
  roomSlug: 'music-room',
  venueTimezone: 'America/New_York',
  organizerId: NADIA.id,
  organizerName: 'Nadia Prosser',
  type: 'recurring',
  startDate: monday,
  endDate: addDays(monday, 28),
  schedule: {
    frequency: 'recurringWeekly',
    startDate: monday,
    endDate: addDays(monday, 28),
    daysOfWeek: ['monday'],
    startTime: '18:00:00',
    endTime: '20:00:00',
  },
  status: 'confirmed',
  createdAtUtc: '2026-08-03T09:00:00Z',
  cancelledBy: null,
  cancelledAtUtc: null,
  cancelReason: null,
  nextOccurrence: null,
  occurrences: [
    { id: 'o1', startUtc: '2026-08-10T22:00:00Z', endUtc: '2026-08-11T00:00:00Z', localDate: monday, status: 'scheduled', noShowMarkedBy: null, paymentStatus: 'succeeded' },
    { id: 'o2', startUtc: '2026-08-17T22:00:00Z', endUtc: '2026-08-18T00:00:00Z', localDate: addDays(monday, 7), status: 'scheduled', noShowMarkedBy: null },
  ],
  ratings: null,
  payment: { mode: 'inApp', perOccurrenceAmount: 40, currency: 'USD', nextChargeAtUtc: '2026-08-15T22:00:00Z' },
});
expect('booking: it is the application’s', store.bookingFor(APPLICATION_ID)?.id, booking.id);
expect('booking: occurrences are held', store.occurrencesFor(booking.id).length, 2);
expect('booking: dated venue-locally', store.occurrencesFor(booking.id)[0].date, monday);
expect('booking: with the schedule’s hours', store.occurrencesFor(booking.id)[0].start, '18:00');
expect(
  'booking: a charge status passes through untouched',
  store.occurrencesFor(booking.id)[0].paymentStatus,
  'succeeded'
);
expect(
  'booking: and one never charged stays absent',
  store.occurrencesFor(booking.id)[1].paymentStatus,
  null
);
expect('booking: the payment block passes through whole', store.bookingFor(APPLICATION_ID)?.payment?.mode, 'inApp');
expect(
  'booking: including the next charge steeple planned',
  store.bookingFor(APPLICATION_ID)?.payment?.nextChargeAtUtc,
  '2026-08-15T22:00:00Z'
);
expect('booking: the room it holds is the ribbon’s', store.roomOccurrences('vienna-presbyterian', 'music-room').length, 2);

// ---- a page is the whole of its scope --------------------------------------
//
// Whatever the page did not carry, within the scope it speaks for, is gone —
// which is how a request withdrawn on another device leaves this browser.

store.mirrorApplications([dto({ status: 'pending' })], { scope: (a) => a.organizerId === NADIA.id });
expect('scope: the page replaced the person’s whole inbox', store.guestApplications().length, 1);
expect('scope: and it is the one the page carried', store.guestApplications()[0].id, APPLICATION_ID);
expect('scope: the village fixture is untouched by it', store.venueApplications('grace-community-vienna').length, 4);

store.forgetApplication(APPLICATION_ID);
expect('forget: the request is gone', store.getApplication(APPLICATION_ID), null);
expect('forget: and so is its thread', store.threadFor(APPLICATION_ID).length, 0);

// ---- the venues steeple says this person manages ----------------------------

store.mirrorManagedVenues([
  {
    id: '55555555-5555-5555-5555-555555555555',
    name: 'Saint Bride Hall',
    slug: 'saint-bride-hall',
    description: 'A hall kept for the neighbourhood.',
    addressLine: '10 Maple Avenue East',
    suburb: 'Vienna',
    postcode: '22180',
    latitude: 38.9,
    longitude: -77.26,
    isIdentityVerified: true,
    bookingMode: 'manual',
    rooms: [
      {
        id: '66666666-6666-6666-6666-666666666666',
        name: 'Long Room',
        slug: 'long-room',
        status: 'published',
        publishRequestedAtUtc: null,
        capacity: 40,
        pricePerHour: 20,
        currency: 'USD',
        primaryPhotoUrl: null,
        photoCount: 1,
        updatedAtUtc: '2026-08-04T09:00:00Z',
      },
    ],
  },
]);
const placed = store.placedVenues();
expect('manage: the venue is held under steeple’s slug', placed.some((v) => v.id === 'saint-bride-hall'), true);
expect(
  'manage: with steeple’s id alongside',
  placed.find((v) => v.id === 'saint-bride-hall')?.remoteId,
  '55555555-5555-5555-5555-555555555555'
);
expect(
  'manage: and the room’s status is steeple’s',
  store.effectiveRoom('saint-bride-hall', 'long-room')?.status,
  'published'
);

// ---- hours and the publish gate, which the listing flow still keeps ---------

expect(
  'hours: overlapping windows rejected',
  store.setOpenHours('vienna-presbyterian', 'music-room', [
    { day: 1, start: '08:00', end: '12:00' },
    { day: 1, start: '11:00', end: '14:00' },
  ]).ok,
  false
);
expect(
  'hours: replace-all accepted',
  store.setOpenHours('vienna-presbyterian', 'music-room', [
    { day: 1, start: '08:00', end: '12:00' },
    { day: 1, start: '13:00', end: '21:00' },
  ]).ok,
  true
);

expect(
  'publish gate: annex without open hours refuses to publish',
  store.editRoom('oakton-baptist', 'renovation-annex', { status: 'published' }).ok,
  false
);
store.setOpenHours('oakton-baptist', 'renovation-annex', [{ day: 6, start: '09:00', end: '17:00' }]);
expect(
  'publish gate: with hours set, the scaffolding can come off',
  store.editRoom('oakton-baptist', 'renovation-annex', { status: 'published' }).ok,
  true
);

// ---- one store per person (D6) ----------------------------------------------

store.mirrorApplication(dto());
expect('identity: their key exists', localStorage.getItem(`steeple-village-store:${NADIA.id}`) !== null, true);
const hersBefore = localStorage.getItem(`steeple-village-store:${NADIA.id}`);

await session.signOut();
expect('identity: signed out, the browser is nobody', store.currentOrganizerId(), 'anon');
expect('identity: signed out, there is no inbox', store.guestApplications().length, 0);
expect(
  'identity: signing out leaves their store where it was',
  localStorage.getItem(`steeple-village-store:${NADIA.id}`),
  hersBefore
);
store.venueApplications('grace-community-vienna');
const anon = JSON.parse(localStorage.getItem('steeple-village-store:anon') ?? 'null');
expect('identity: the anonymous namespace is its own', anon !== null, true);
expect(
  'identity: and holds none of her correspondence',
  anon.applications.some((a) => a.id === APPLICATION_ID),
  false
);

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nall good');
