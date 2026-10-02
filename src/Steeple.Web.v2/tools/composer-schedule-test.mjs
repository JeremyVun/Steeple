// npm run test:composer-schedule — exact submitted dates, half-hour inputs and estimates; no API.
import assert from 'node:assert/strict';
import { estimateSchedule, scheduleErrors, timeChoices, venueToday } from '../src/ui/guest/composerSchedule.js';
const weekly = { frequency: 'weekly', startDate: '2026-10-13', endDate: '2026-12-22', daysOfWeekMask: 20, startTime: '09:30', endTime: '11:30' };
const estimate = estimateSchedule(weekly, 15);
assert.equal(estimate.sessions, 21);
assert.equal(estimate.perSession, 30);
assert.equal(estimate.total, 630);
assert.equal(estimate.dates[0], '2026-10-13');
assert.equal(estimate.dates.at(-1), '2026-12-22');
assert.equal(estimateSchedule({ ...weekly, frequency: 'oneOff' }, 15).total, 30);
assert.equal(estimateSchedule({ ...weekly, endTime: '10:00' }, 15.75).perSession, 7.88);
assert.equal(estimateSchedule({ ...weekly, endTime: '10:00' }, 15.75).total, 165.48);
for (const patch of [{ startDate: null }, { startDate: '2026-13-01' }, { startDate: '2026-02-30' }, { startTime: '24:00' }, { startTime: '09:15' }, { endTime: '09:30' }, { endDate: null }, { endDate: '2027-10-15' }, { daysOfWeekMask: 0 }, { daysOfWeekMask: 128 }, { endDate: '2026-10-14', daysOfWeekMask: 2 }]) {
  assert.ok(Object.keys(scheduleErrors({ ...weekly, ...patch })).length, JSON.stringify(patch));
  assert.equal(estimateSchedule({ ...weekly, ...patch }, 15), null, JSON.stringify(patch));
}
assert.equal(estimateSchedule(weekly, NaN), null);
assert.equal(estimateSchedule({ ...weekly, endDate: '2027-10-14', daysOfWeekMask: 127 }, 15).sessions, 367);
assert.equal(estimateSchedule({ ...weekly, endDate: weekly.startDate }, 15).sessions, 1);
assert.equal(venueToday('America/New_York', new Date('2026-10-02T01:00:00Z')), '2026-10-01');
assert.equal(venueToday('Australia/Sydney', new Date('2026-10-02T01:00:00Z')), '2026-10-02');
assert.ok(scheduleErrors(weekly, { today: '2026-10-14' }).startDate);
const windows = [2, 4].map((day) => ({ day, start: '09:00', end: '12:00' }));
assert.deepEqual(scheduleErrors(weekly, { windows }), {});
assert.ok(scheduleErrors({ ...weekly, endTime: '12:30' }, { windows }).schedule);
assert.ok(scheduleErrors({ ...weekly, daysOfWeekMask: 22 }, { windows }).schedule);
assert.equal(timeChoices(weekly, windows).find(({ time }) => time === '08:30').allowed, false);
assert.equal(timeChoices(weekly, windows).find(({ time }) => time === '11:30').allowed, true);
assert.equal(timeChoices(weekly, windows, true).find(({ time }) => time === '09:30').allowed, false);
assert.equal(timeChoices(weekly, windows, true).find(({ time }) => time === '12:00').allowed, true);
assert.equal(timeChoices({ ...weekly, endDate: weekly.startDate, daysOfWeekMask: 5 }, windows).find(({ time }) => time === '09:30').allowed, true);
assert.ok(scheduleErrors({ ...weekly, frequency: 'oneOff', startDate: '2026-10-12', startTime: null, endTime: null }, { windows }).schedule);
console.log('PASS composer schedule: exact 21-session total, single date, rounding, invalid/zero/366-day recurrence, timezone boundary, half-hour/open-hour options');
