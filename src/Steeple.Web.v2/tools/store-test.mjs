// Status-machine regression test for src/data/store.js — runs in plain node
// (the store falls back to in-memory storage when localStorage is absent).
//   node tools/store-test.mjs
// Exits non-zero on the first failed expectation. Every agent runs this before
// declaring done; if you change the store, prove your new guard bites by
// breaking it once.

import {
  APP_STATUS,
  COUNTER_STATUS,
  GUEST_ID,
  addDays,
  daysToMask,
  nextWeekday,
  store,
  todayIso,
  weekdayOf,
} from '../src/data/store.js';

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

// ---- seed shape: every state demo-able from first load ----------------------
const mine = store.guestApplications();
const statuses = new Set(mine.map((a) => a.status));
expect('seed: guest has 5 letters', mine.length, 5);
for (const s of ['pending', 'needsInfo', 'counterOffered', 'approved', 'declined']) {
  expect(`seed: a ${s} letter exists`, statuses.has(s), true);
}
const desk = store.venueApplications('grace-community-vienna');
expect('seed: the Grace desk holds 4 letters', desk.length, 4);
const approvedSeed = mine.find((a) => a.status === APP_STATUS.approved);
const seedBooking = store.bookingFor(approvedSeed.id);
expect('seed: approved letter has a booking', !!seedBooking, true);
expect(
  'seed: booking has materialized occurrences',
  store.occurrencesFor(seedBooking.id).length,
  (n) => n > 4
);
expect(
  'seed: needsInfo letter carries the host question',
  store.threadFor('app-sparrows-craft').length,
  (n) => n >= 1
);
expect('seed: open counter waits on the guest', !!store.openCounterFor('app-sparrows-stories'), true);
expect(
  'seed: open hours backfilled 08:00-22:00 daily',
  store.openHoursFor('grace-community-vienna', 'fellowship-hall').length,
  7
);

// ---- validation -------------------------------------------------------------
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
  'validate: outside open hours fails',
  store.validateApplication({ ...goodDraft, startTime: '06:00', endTime: '07:00' }).errors.schedule !==
    undefined,
  true
);
expect(
  'validate: intent over 2000 chars fails',
  store.validateApplication({ ...goodDraft, intentText: 'x'.repeat(2001) }).errors.intentText !==
    undefined,
  true
);

// ---- the full loop: submit → needsInfo ⇄ answer → counter → accept ----------
const submitted = store.submitApplication(goodDraft);
expect('submit: accepted', submitted.ok, true);
const id = submitted.application.id;
expect('submit: starts pending', store.getApplication(id).status, APP_STATUS.pending);

store.askQuestion(id, 'Which weeks would you start?');
expect('ask: pending → needsInfo', store.getApplication(id).status, APP_STATUS.needsInfo);
store.sendMessage(id, 'guest', 'From the first Monday of next month.');
expect('answer: needsInfo → pending', store.getApplication(id).status, APP_STATUS.pending);
expect('thread: both messages kept', store.threadFor(id).length, 2);

const counter = store.counterOffer(
  id,
  {
    frequency: 'weekly',
    startDate: nextWeekday(addDays(todayIso(), 7), 2),
    endDate: addDays(nextWeekday(addDays(todayIso(), 7), 2), 28),
    daysOfWeekMask: daysToMask([2]),
    startTime: '18:00',
    endTime: '20:00',
  },
  'Tuesdays suit the room better.'
);
expect('counter: offered', counter.ok, true);
expect('counter: pending → counterOffered', store.getApplication(id).status, APP_STATUS.counterOffered);

const declinedCounter = store.declineCounter(id, 'Tuesdays clash with our other rehearsal.');
expect('counter declined: back to pending', declinedCounter.application.status, APP_STATUS.pending);
expect(
  'counter declined: history kept',
  store.countersFor(id)[0].status,
  COUNTER_STATUS.declinedByOrganizer
);

const counter2 = store.counterOffer(
  id,
  {
    frequency: 'weekly',
    startDate: nextWeekday(addDays(todayIso(), 7), 3),
    endDate: addDays(nextWeekday(addDays(todayIso(), 7), 3), 28),
    daysOfWeekMask: daysToMask([3]),
    startTime: '18:00',
    endTime: '20:00',
  },
  'Would Wednesdays work?'
);
expect('second counter: offered', counter2.ok, true);
const accepted = store.acceptCounter(id);
expect('counter accepted: approved', accepted.ok && accepted.application.status, APP_STATUS.approved);
expect(
  'counter accepted: schedule adopted (Wednesdays)',
  accepted.application.daysOfWeekMask,
  daysToMask([3])
);
expect('counter accepted: occurrences materialized', accepted.occurrences.length, (n) => n >= 4);
expect(
  'occurrences: all on the counter weekday',
  accepted.occurrences.every((o) => weekdayOf(o.date) === 3),
  true
);

// ---- double-booking: the exclusion constraint's demo twin -------------------
const clashDraft = {
  ...goodDraft,
  startDate: accepted.occurrences[0].date,
  endDate: null,
  frequency: 'oneOff',
  daysOfWeekMask: null,
  startTime: '19:00',
  endTime: '21:00',
};
const clashing = store.submitApplication(clashDraft);
expect('clash: submit is allowed (applications never hold slots)', clashing.ok, true);
const blockedApprove = store.approve(clashing.application.id);
expect('clash: approve refuses an overlapping occurrence', blockedApprove.ok, false);
expect('clash: names the collision', blockedApprove.clashes.length, (n) => n >= 1);
store.decline(clashing.application.id, 'That evening is now taken — sorry.');
expect(
  'decline: recorded with the note',
  store.getApplication(clashing.application.id).declineNote !== null,
  true
);

// ---- desk conflict seed: chess club vs chorale ------------------------------
const chess = store.getApplication('app-chess-club');
const chessConflicts = store.scheduleConflicts(chess.venueId, chess.roomId, chess);
expect('seed: chess club collides with the chorale', chessConflicts.clashes.length, (n) => n >= 1);
const esl = store.getApplication('app-esl-evenings');
const eslConflicts = store.scheduleConflicts(esl.venueId, esl.roomId, esl);
expect('seed: the conversation circle is clean', eslConflicts.clashes.length, 0);
const eslApproved = store.approve(esl.id);
expect('desk: approving the clean letter books it', eslApproved.ok, true);

// ---- withdraw, hours, publish gate ------------------------------------------
const withdrawable = store.submitApplication(goodDraft);
store.withdraw(withdrawable.application.id);
expect(
  'withdraw: undecided → withdrawn',
  store.getApplication(withdrawable.application.id).status,
  APP_STATUS.withdrawn
);

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
expect(
  'publish: effective room reads published',
  store.effectiveRoom('oakton-baptist', 'renovation-annex').status,
  'published'
);

// ---- lantern signals --------------------------------------------------------
const signals = store.venueSignals();
expect('signals: Grace shows undecided letters', signals.get('grace-community-vienna').pending, (n) => n >= 1);

store.resetDemo();
expect('reset: seed restored', store.guestApplications().length, 5);
expect('reset: guest id stable', store.guestApplications()[0].organizerId, GUEST_ID);

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nall good');
