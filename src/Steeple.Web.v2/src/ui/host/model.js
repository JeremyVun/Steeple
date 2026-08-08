// What the desk needs to know, derived from data/store.js and data/venues.js.
// Nothing here decides anything — it reads the correspondence and says it in
// the words a church administrator would use.

import {
  APP_STATUS,
  DAY_LABELS,
  ORGANIZERS,
  UNDECIDED,
  bookingFor,
  blackoutsFor,
  effectiveRoom,
  materializeDates,
  maskToDays,
  occurrencesFor,
  openHoursFor,
  scheduleConflicts,
  todayIso,
  venueApplications,
  weekdayOf,
} from '../../data/store.js';
import { VENUES, getVenue } from '../../data/venues.js';

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_INITIAL = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const STATUS_WORD = {
  [APP_STATUS.pending]: 'Waiting on you',
  [APP_STATUS.needsInfo]: 'Question asked',
  [APP_STATUS.counterOffered]: 'Counter-offered',
  [APP_STATUS.approved]: 'Approved',
  [APP_STATUS.declined]: 'Declined',
  [APP_STATUS.withdrawn]: 'Withdrawn',
  [APP_STATUS.expired]: 'Expired',
};

// ── time and date, said plainly ─────────────────────────────────────────────

export const minutesOf = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export function fmtTime(time, withMeridiem = true) {
  const [h, m] = time.split(':').map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  const body = m === 0 ? `${hour}` : `${hour}:${String(m).padStart(2, '0')}`;
  return withMeridiem ? `${body} ${h < 12 ? 'am' : 'pm'}` : body;
}

export function fmtTimeRange(start, end) {
  const sameHalf = Number(start.slice(0, 2)) < 12 === Number(end.slice(0, 2)) < 12;
  return sameHalf ? `${fmtTime(start, false)}–${fmtTime(end)}` : `${fmtTime(start)} – ${fmtTime(end)}`;
}

export function fmtDate(isoDate, withWeekday = false) {
  const [, m, d] = isoDate.split('-').map(Number);
  const stem = `${MONTHS[m - 1]} ${d}`;
  return withWeekday ? `${DAY_SHORT[weekdayOf(isoDate)]} ${stem}` : stem;
}

export function fmtDateRange(from, to) {
  return from === to ? fmtDate(from) : `${fmtDate(from)} – ${fmtDate(to)}`;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** The weekdays a schedule lands on, in week order. */
export function scheduleDays(schedule) {
  return schedule.frequency === 'weekly'
    ? maskToDays(schedule.daysOfWeekMask ?? 0)
    : [weekdayOf(schedule.startDate)];
}

export function dayNames(schedule, { plural: asPlural = true } = {}) {
  const days = scheduleDays(schedule);
  const names = days.map((d) => (asPlural ? `${DAY_LABELS[d]}s` : DAY_LABELS[d]));
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** One line that carries the whole ask: days, hours, span. */
export function scheduleLine(schedule) {
  const time = fmtTimeRange(schedule.startTime, schedule.endTime);
  if (schedule.frequency !== 'weekly') {
    return `${DAY_LABELS[weekdayOf(schedule.startDate)]} ${fmtDate(schedule.startDate)}, ${time}`;
  }
  return `${dayNames(schedule)}, ${time} · ${fmtDateRange(schedule.startDate, schedule.endDate)}`;
}

export function scheduleSpoken(schedule) {
  return scheduleLine(schedule).replace(/·/g, ',').replace(/–/g, ' to ');
}

// ── people and rooms ────────────────────────────────────────────────────────

/**
 * The person who asked, as the request itself names them.
 *
 * `verified` is a fact about the account steeple recorded the request against —
 * every request on this desk came through a real session, which is what the
 * chip has always meant. The village's own fixture stands in only for the
 * seeded letters it wrote itself.
 */
export function organizerOf(application) {
  if (application.organizerName) {
    return {
      name: application.organizerName,
      org: application.organizationName ?? null,
      verified: true,
      joined: null,
      hasPaymentMethod: application.hasPaymentMethod === true,
      // Steeple's, or nothing: null until this organizer has a revealed rating
      // somewhere, which is also why their no-show count stays invisible until
      // then. Absence of a reputation is not a bad one (D4).
      ratingSummary: application.organizerRating ?? null,
    };
  }
  return {
    name: 'An organizer',
    org: null,
    verified: false,
    joined: null,
    ...(ORGANIZERS[application.organizerId] ?? {}),
    // The village's fixture people have no standing at steeple to report.
    ratingSummary: null,
  };
}

export function joinedText(organizer) {
  if (!organizer.joined) return null;
  const [y, m] = organizer.joined.split('-').map(Number);
  return `On Steeple since ${MONTHS[m - 1]} ${y}`;
}

export function scheduleOf(source) {
  return {
    frequency: source.frequency,
    startDate: source.startDate,
    endDate: source.endDate ?? null,
    daysOfWeekMask: source.daysOfWeekMask ?? null,
    startTime: source.startTime,
    endTime: source.endTime,
  };
}

/**
 * The venues this person actually keeps the doors of — steeple's answer to
 * `GET /manage/venues`, mirrored into the store as placed venues, and nothing
 * else. The desk used to offer all five seeded churches to anybody who pressed
 * the switch; a desk you can open onto somebody else's venue is not a desk
 * (v2_migration D4).
 */
export function deskVenues(placed = []) {
  return placed
    .filter((v) => v.remoteId)
    .map((v) => ({
      id: v.id,
      name: v.name,
      shortName: v.shortName ?? getVenue(v.id)?.shortName ?? v.name,
      suburb: v.suburb ?? '',
    }));
}

/**
 * One venue as the desk reads it. What steeple holds about a venue this person
 * manages wins — its name, its address, whether it is verified — and the
 * village's scenery fills in only what steeple has no field for.
 */
export function venueOf(venueId, placed = []) {
  const scenery = getVenue(venueId) ?? null;
  const managed = placed.find((v) => v.id === venueId) ?? null;
  if (!managed) return scenery;
  return {
    ...scenery,
    ...managed,
    shortName: managed.shortName ?? scenery?.shortName ?? managed.name,
  };
}

export function roomsOf(venueId, placed = []) {
  const venue = venueOf(venueId, placed);
  if (!venue) return [];
  return venue.rooms.map((room) => effectiveRoom(venueId, room.id) ?? room);
}

// ── the desk's two piles ────────────────────────────────────────────────────

export function deskLetters(venueId) {
  const all = venueApplications(venueId);
  return {
    live: all.filter((a) => UNDECIDED.has(a.status)),
    record: all.filter((a) => !UNDECIDED.has(a.status)),
  };
}

/** Bookings this room already stands behind, with who holds them. */
export function standingBookings(venueId, roomId, exceptApplicationId = null) {
  const today = todayIso();
  const byBooking = new Map();
  for (const app of venueApplications(venueId)) {
    if (app.roomId !== roomId || app.status !== APP_STATUS.approved) continue;
    if (app.id === exceptApplicationId) continue;
    const booking = bookingFor(app.id);
    if (!booking) continue;
    byBooking.set(booking.id, {
      application: app,
      organizer: organizerOf(app),
      occurrences: occurrencesFor(booking.id).filter((o) => o.date >= today),
    });
  }
  return [...byBooking.values()].filter((b) => b.occurrences.length > 0);
}

/**
 * The week as the ribbon draws it: for each weekday, the hours the room is
 * open, the bars it is already committed to, and where the proposal falls.
 */
export function weekLanes(venueId, roomId, proposal, { exceptApplicationId = null } = {}) {
  const windows = openHoursFor(venueId, roomId);
  const standing = standingBookings(venueId, roomId, exceptApplicationId);
  const proposedDays = proposal ? new Set(scheduleDays(proposal)) : new Set();

  const lanes = DAY_LABELS.map((label, day) => ({
    day,
    label,
    short: DAY_SHORT[day],
    open: windows.filter((w) => w.day === day).map((w) => ({ start: w.start, end: w.end })),
    booked: [],
    proposed: proposedDays.has(day)
      ? { start: proposal.startTime, end: proposal.endTime }
      : null,
  }));

  for (const entry of standing) {
    const seen = new Set();
    for (const occurrence of entry.occurrences) {
      const day = weekdayOf(occurrence.date);
      const key = `${day}/${occurrence.start}/${occurrence.end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lanes[day].booked.push({
        start: occurrence.start,
        end: occurrence.end,
        label: entry.organizer.org ?? entry.organizer.name,
      });
    }
  }

  for (const lane of lanes) {
    lane.booked.sort((a, b) => (a.start < b.start ? -1 : 1));
    lane.clash = lane.proposed
      ? lane.booked.some(
          (b) => lane.proposed.start < b.end && b.start < lane.proposed.end
        )
      : false;
  }

  const stamps = [];
  for (const lane of lanes) {
    for (const w of [...lane.open, ...lane.booked, lane.proposed].filter(Boolean)) {
      stamps.push(minutesOf(w.start), minutesOf(w.end));
    }
  }
  const lo = stamps.length ? Math.min(...stamps) : 8 * 60;
  const hi = stamps.length ? Math.max(...stamps) : 22 * 60;
  const axis = {
    start: Math.max(0, Math.floor(lo / 60) * 60 - 60),
    end: Math.min(24 * 60, Math.ceil(hi / 60) * 60 + 60),
  };

  return { lanes, axis, standing };
}

/**
 * What stands between this proposal and a yes, in the order a host cares:
 * collisions first (the hard stop), then hours, then blackouts.
 */
export function readSchedule(venueId, roomId, proposal) {
  const conflicts = scheduleConflicts(venueId, roomId, proposal);
  const blackouts = blackoutsFor(venueId, roomId);
  const dates = materializeDates(proposal, blackouts);
  const clashDates = [...new Set(conflicts.clashes.map((c) => c.date))].sort();
  const holders = new Set();
  const standing = standingBookings(venueId, roomId);
  for (const clash of conflicts.clashes) {
    const owner = standing.find((s) => s.occurrences.some((o) => o.bookingId === clash.bookingId));
    if (owner) holders.add(owner.organizer.org ?? owner.organizer.name);
  }

  const notes = [];
  if (clashDates.length) {
    const who = [...holders];
    notes.push({
      tone: 'clash',
      text: `${plural(clashDates.length, 'date collides', 'dates collide')} with ${
        who.length ? who.join(' and ') : 'a booking already made'
      } — ${clashDates.slice(0, 3).map((d) => fmtDate(d)).join(', ')}${
        clashDates.length > 3 ? ` and ${clashDates.length - 3} more` : ''
      }.`,
    });
  }
  // A room whose hours this browser has not been told is not a room that keeps
  // none: with nothing to compare against, nothing is said about hours at all.
  if (openHoursFor(venueId, roomId).length && conflicts.outsideHours.length) {
    notes.push({
      tone: 'hours',
      text: `The room is not open ${conflicts.outsideHours
        .map((d) => `${DAY_LABELS[d]}s`)
        .join(', ')} at that hour. You can still say yes, and the hours will hold.`,
    });
  }
  if (conflicts.blackoutDates.length) {
    const reasons = blackouts
      .filter((b) => conflicts.blackoutDates.includes(b.date))
      .map((b) => b.reason)
      .filter(Boolean);
    notes.push({
      tone: 'blackout',
      text: `${plural(conflicts.blackoutDates.length, 'date falls', 'dates fall')} on a closed day${
        reasons.length ? ` (${[...new Set(reasons)].join(', ')})` : ''
      } and would be skipped.`,
    });
  }
  if (!notes.length && dates.length) {
    const hours = openHoursFor(venueId, roomId).length ? ' during your open hours' : '';
    notes.push({
      tone: 'clear',
      text:
        dates.length === 1
          ? `This date is free${hours}.`
          : `All ${dates.length} dates are free${hours}.`,
    });
  }

  return {
    ...conflicts,
    dates,
    clashDates,
    blocked: clashDates.length > 0,
    notes,
    countLine: dates.length
      ? `${plural(dates.length, 'date', 'dates')} · ${fmtDateRange(dates[0], dates.at(-1))}`
      : 'No dates fall in that span.',
  };
}

// ── open hours, said in a line ──────────────────────────────────────────────

export function hoursSummary(venueId, roomId) {
  const windows = openHoursFor(venueId, roomId);
  if (!windows.length) return 'No open hours set';
  const byDay = new Map();
  for (const w of windows) {
    const list = byDay.get(w.day) ?? [];
    list.push(`${fmtTime(w.start, false)}–${fmtTime(w.end)}`);
    byDay.set(w.day, list);
  }
  const signatures = new Map();
  for (const [day, list] of byDay) {
    const key = list.join(', ');
    signatures.set(key, [...(signatures.get(key) ?? []), day]);
  }
  if (signatures.size === 1 && byDay.size === 7) return `Every day, ${[...signatures.keys()][0]}`;
  return [...signatures.entries()]
    .map(([hours, days]) => `${days.map((d) => DAY_SHORT[d]).join(' ')} ${hours}`)
    .join(' · ');
}

/** Amenity / accessibility vocabularies, taken from the real listings only. */
function vocabulary(field) {
  const set = new Set();
  for (const venue of VENUES) for (const room of venue.rooms) for (const v of room[field]) set.add(v);
  return [...set].sort();
}

export const AMENITY_VOCABULARY = vocabulary('amenities');
export const ACCESS_VOCABULARY = vocabulary('accessibility');
