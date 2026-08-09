import { DAY_LABELS } from './model.js';

const MS_DAY = 86400000;

export const daysToMask = (days) => days.reduce((mask, day) => mask | (1 << day), 0);
export const maskToDays = (mask) => DAY_LABELS.map((_, day) => day).filter((day) => mask & (1 << day));

function fromIso(value) {
  const [year, month, day] = String(value).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function iso(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Today on the browser's own calendar — the one date read in local time. */
export const todayIso = () => {
  const now = new Date();
  return iso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
};

export const addDays = (date, count) => iso(new Date(fromIso(date).getTime() + count * MS_DAY));
export const weekdayOf = (date) => fromIso(date).getUTCDay();

export function nextWeekday(date, weekday) {
  return addDays(date, (weekday - weekdayOf(date) + 7) % 7);
}

export const timeOk = (time) => /^\d{2}:\d{2}$/.test(time);
export const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

export function hoursFit(windows, day, startTime, endTime) {
  return windows.some((window) =>
    window.day === day && window.start <= startTime && endTime <= window.end
  );
}

export function scheduleDays(schedule) {
  return schedule.frequency === 'weekly'
    ? maskToDays(schedule.daysOfWeekMask ?? 0)
    : [weekdayOf(schedule.startDate)];
}

/** Venue-local dates for a schedule, with blackouts omitted. */
export function materializeDates(schedule, blackouts = []) {
  const blocked = new Set(blackouts.map((blackout) => blackout.date));
  if (schedule.frequency !== 'weekly') {
    return blocked.has(schedule.startDate) ? [] : [schedule.startDate];
  }

  const dates = [];
  for (let date = schedule.startDate; date <= schedule.endDate; ) {
    if (schedule.daysOfWeekMask & (1 << weekdayOf(date)) && !blocked.has(date)) dates.push(date);
    const next = addDays(date, 1);
    if (!(next > date)) {
      console.error(`store: the calendar stalled at ${date} — schedule truncated`);
      break;
    }
    date = next;
  }
  return dates;
}

export const millisecondsPerDay = MS_DAY;
