// Words, dates and numbers for the guest's requests. Everything here reads from
// an application or a schedule as the store holds it — nothing is estimated or
// invented, and no sentence hurries the reader.

import { DAY_LABELS, maskToDays, materializeDates, todayIso } from '../../data/store.js';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const SHORT_MONTHS = MONTHS.map((m) => m.slice(0, 3));

const parts = (isoDate) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return { y, m: m - 1, d, date: new Date(y, m - 1, d) };
};

/** 'August 11' · with weekday 'Tuesday, August 11' · with year when it differs. */
export function formatDate(isoDate, { weekday = false, short = false } = {}) {
  if (!isoDate) return '';
  const { y, m, d, date } = parts(isoDate);
  const month = short ? SHORT_MONTHS[m] : MONTHS[m];
  const thisYear = Number(todayIso().slice(0, 4));
  const tail = y === thisYear ? '' : `, ${y}`;
  const day = weekday ? `${short ? DAY_LABELS[date.getDay()].slice(0, 3) : DAY_LABELS[date.getDay()]}, ` : '';
  return `${day}${month} ${d}${tail}`;
}

/** 'Tuesdays' · 'Tuesdays and Thursdays' · 'Mondays, Wednesdays and Fridays' */
export function formatDays(mask) {
  const names = maskToDays(mask ?? 0).map((d) => `${DAY_LABELS[d]}s`);
  if (names.length === 0) return 'no day yet';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

const meridiem = (time) => (Number(time.slice(0, 2)) < 12 ? 'am' : 'pm');

/** '9:30 am' — 24h stored, 12h shown, as the rest of the funnel shows it. */
export function formatTime(time, { suffix = true } = {}) {
  if (!time) return '';
  const h = Number(time.slice(0, 2));
  const min = time.slice(3);
  const hour = h % 12 === 0 ? 12 : h % 12;
  const body = min === '00' ? `${hour}` : `${hour}:${min}`;
  return suffix ? `${body} ${meridiem(time)}` : body;
}

/** '9:30 – 11:30 am' when the hours share a half of the day, else both marked. */
export function formatTimeRange(start, end) {
  if (!start || !end) return '';
  const same = meridiem(start) === meridiem(end);
  return same
    ? `${formatTime(start, { suffix: false })} – ${formatTime(end)}`
    : `${formatTime(start)} – ${formatTime(end)}`;
}

export function durationText(start, end) {
  const mins =
    Number(end.slice(0, 2)) * 60 + Number(end.slice(3)) -
    (Number(start.slice(0, 2)) * 60 + Number(start.slice(3)));
  if (mins <= 0) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} minutes`;
  if (m === 0) return h === 1 ? 'an hour' : `${h} hours`;
  return `${h} ${h === 1 ? 'hour' : 'hours'} ${m} minutes`;
}

/** The whole schedule in one honest sentence. */
export function scheduleSentence(schedule) {
  if (!schedule?.startDate || !schedule.startTime) return 'No time chosen yet';
  const time = formatTimeRange(schedule.startTime, schedule.endTime);
  if (schedule.frequency !== 'weekly') {
    return `${formatDate(schedule.startDate, { weekday: true })}, ${time}`;
  }
  return `${formatDays(schedule.daysOfWeekMask)}, ${time} — from ${formatDate(
    schedule.startDate
  )} until ${formatDate(schedule.endDate)}`;
}

/** The short form for a list: 'Tuesdays and Thursdays · 9:30 – 11:30 am'. */
export function scheduleLine(schedule) {
  if (!schedule?.startDate || !schedule.startTime) return '';
  const time = formatTimeRange(schedule.startTime, schedule.endTime);
  return schedule.frequency === 'weekly'
    ? `${formatDays(schedule.daysOfWeekMask)} · ${time}`
    : `${formatDate(schedule.startDate, { weekday: true })} · ${time}`;
}

export function occurrenceCount(schedule, blackouts = []) {
  if (!schedule?.startDate || !schedule.startTime) return 0;
  if (schedule.frequency === 'weekly' && (!schedule.endDate || !schedule.daysOfWeekMask)) return 0;
  return materializeDates(schedule, blackouts).length;
}

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** 'today' · 'yesterday' · '4 days ago' · '3 weeks ago' — never a bare timestamp. */
export function timeAgo(isoStamp) {
  if (!isoStamp) return '';
  const then = new Date(isoStamp);
  const days = Math.floor((Date.now() - then.getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `on ${formatDate(
    `${then.getFullYear()}-${String(then.getMonth() + 1).padStart(2, '0')}-${String(
      then.getDate()
    ).padStart(2, '0')}`
  )}`;
}

/**
 * When a message arrived, said so that a column of them can be read in order.
 *
 * `timeAgo` is right for a request that was sent once and then waited — but an
 * inbox where three things arrived this morning prints "today" three times and
 * loses the only ordering a reader has. Anything from today is given its clock
 * time; everything older keeps the plain distance, which is all anybody wants
 * from last week. The day is counted on the calendar, not in milliseconds, so
 * something from 11pm last night is yesterday rather than "today".
 */
export function messageWhen(isoStamp) {
  if (!isoStamp) return '';
  const then = new Date(isoStamp);
  if (Number.isNaN(then.getTime())) return '';
  const now = new Date();
  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(now) - midnight(then)) / 86400000);
  if (days === 0) {
    const h = then.getHours();
    const hour = h % 12 === 0 ? 12 : h % 12;
    return `${hour}:${String(then.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
  }
  if (days === 1) return 'yesterday';
  return timeAgo(isoStamp);
}

// ── Status ──────────────────────────────────────────────────────────────────
// Names the guest would use, not the schema's. The schema's status is still the
// single source of truth; this only chooses the words.

const STATUS = {
  pending: { label: 'Sent', tone: 'waiting' },
  needsInfo: { label: 'A question for you', tone: 'yours' },
  counterOffered: { label: 'Another time suggested', tone: 'yours' },
  approved: { label: 'Booked', tone: 'settled' },
  declined: { label: 'Not this time', tone: 'closed' },
  withdrawn: { label: 'Withdrawn', tone: 'closed' },
  expired: { label: 'Expired', tone: 'closed' },
};

export const statusLabel = (status) => STATUS[status]?.label ?? status;
export const statusTone = (status) => STATUS[status]?.tone ?? 'waiting';

/** Whether this request is waiting on the guest rather than on the host. */
export const isYourMove = (status) => statusTone(status) === 'yours';

/**
 * Whether this booking is over and still owes the organizer's rating.
 *
 * Steeple decides both halves — `canRate` is computed for whoever asked — so
 * this only reads the answer. A booking with no `ratings` block at all (never
 * read, or nothing to say) is not eligible and not ineligible: it is silent.
 */
export function invitesGuestRating(booking) {
  const ratings = booking?.ratings;
  if (!ratings || ratings.byOrganizer) return false;
  return (
    ratings.canRate === true &&
    (booking.status === 'completed' || booking.status === 'cancelled')
  );
}

/**
 * @param {object} app
 * @param {{occurrences?: number, booking?: object|null}} context — `booking` is
 *   what `bookingFor(app.id)` holds, and it is what turns a finished booking's
 *   note into the question the rating loop starts with.
 */
export function statusNote(app, { occurrences = 0, booking = null } = {}) {
  // Asked before the status, because a finished booking is still `approved` and
  // "3 dates held" is the least interesting true thing to say about one.
  if (invitesGuestRating(booking)) return 'Finished — how was the space?';
  switch (app.status) {
    case 'pending':
      return 'Waiting for an answer.';
    case 'needsInfo':
      return 'The host has asked you something.';
    case 'counterOffered':
      return 'Waiting on your answer.';
    case 'approved':
      return occurrences ? `${plural(occurrences, 'date', 'dates')} held.` : 'Confirmed.';
    case 'declined':
      return 'The venue could not host this one.';
    case 'withdrawn':
      return 'You withdrew this request.';
    case 'expired':
      return 'This request expired without an answer.';
    default:
      return '';
  }
}
