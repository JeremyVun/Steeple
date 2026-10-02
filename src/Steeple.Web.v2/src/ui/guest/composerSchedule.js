import { addDays, hoursFit, maskToDays, materializeDates, weekdayOf } from '../../data/store/schedule.js';

export function venueToday(timezone, now = new Date()) {
  if (!timezone) return null;
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return null;
  }
}

const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') &&
  Number(value.slice(0, 4)) > 0 && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const validTime = (value) => /^(?:[01]\d|2[0-3]):(?:00|30)$/.test(value ?? '');

export function scheduleErrors(draft, { today = null, windows = null } = {}) {
  const errors = {};
  if (!validDate(draft.startDate)) errors.startDate = 'Choose a date.';
  else if (today && draft.startDate < today) errors.startDate = 'Choose a date that has not passed at the venue.';
  if (!validTime(draft.startTime)) errors.startTime = 'Choose a start time.';
  if (!validTime(draft.endTime)) errors.endTime = 'Choose an end time.';
  else if (validTime(draft.startTime) && draft.endTime <= draft.startTime) errors.endTime = 'Choose an end time after the start.';
  if (draft.frequency === 'weekly') {
    if (!validDate(draft.endDate)) errors.endDate = 'Choose the last date for your weekly booking.';
    else if (validDate(draft.startDate) && draft.endDate < draft.startDate) errors.endDate = 'Choose a last date on or after the first date.';
    else if (validDate(draft.startDate) && draft.endDate > addDays(draft.startDate, 366)) errors.endDate = 'Keep your weekly booking within 366 days of the first date.';
    if (!Number.isInteger(draft.daysOfWeekMask) || draft.daysOfWeekMask < 1 || draft.daysOfWeekMask > 127) errors.daysOfWeekMask = 'Choose at least one weekday.';
  } else if (draft.frequency !== 'oneOff') errors.frequency = 'Choose one time or every week.';
  if (windows?.length && !errors.startDate && !errors.daysOfWeekMask && !timeChoices(draft, windows).some(({ allowed }) => allowed)) {
    errors.schedule = 'There are no shared opening hours for these days. Choose another date or weekday.';
  }
  if (Object.keys(errors).length) return errors;
  const dates = materializeDates(draft);
  if (!dates.length) return { endDate: 'None of your weekdays fall between these dates. Change the dates or weekdays.' };
  if (windows?.length && dates.some((date) => !hoursFit(windows, weekdayOf(date), draft.startTime, draft.endTime))) {
    errors.schedule = 'These hours fall outside the space’s opening hours. Choose another time or weekday.';
  }
  return errors;
}

export function estimateSchedule(draft, rate) {
  if (Object.keys(scheduleErrors(draft)).length || !Number.isFinite(rate) || rate < 0) return null;
  const minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const hours = (minutes(draft.endTime) - minutes(draft.startTime)) / 60;
  const dates = materializeDates(draft);
  const halfCents = Math.round(rate * 100) * (hours * 2);
  const wholeCents = Math.floor(halfCents / 2);
  // BookingService rounds each visit's half-cent ties to even.
  const perSessionCents = wholeCents + (halfCents % 2 === 1 && wholeCents % 2 === 1 ? 1 : 0);
  return { dates, hours, sessions: dates.length, perSession: perSessionCents / 100, total: perSessionCents * dates.length / 100 };
}

export function timeChoices(draft, windows, end = false) {
  let days = draft.frequency === 'weekly' ? maskToDays(draft.daysOfWeekMask ?? 0) :
    validDate(draft.startDate) ? [weekdayOf(draft.startDate)] : [];
  if (draft.frequency === 'weekly' && validDate(draft.startDate) && validDate(draft.endDate) &&
      draft.endDate >= draft.startDate && draft.endDate <= addDays(draft.startDate, 366)) {
    days = [...new Set(materializeDates(draft).map(weekdayOf))];
  }
  return Array.from({ length: 48 }, (_, index) => {
    const time = `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`;
    const next = `${String(Math.floor((index + 1) / 2)).padStart(2, '0')}:${(index + 1) % 2 ? '30' : '00'}`;
    const start = end ? (validTime(draft.startTime) ? draft.startTime : null) : time;
    const finish = end ? time : next;
    const allowed = (!start || start < finish) && (!windows?.length || !days.length || days.every((day) =>
      windows.some((window) => window.day === day && (start ? window.start <= start : window.start < finish) && finish <= window.end)));
    return { time, allowed: allowed && (end || index < 47) };
  });
}
