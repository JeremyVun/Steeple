// The correspondence store — steeple's application/booking model, venue-local,
// persisted in localStorage so every state survives a reload and is demo-able
// from first load. Schema truth: the repo's db/changelog/004-applications.sql,
// 005-bookings.sql, 009-availability.sql. Nothing here is invented; statuses,
// schedule shapes and validation mirror those files.
//
// Status machine (exact):
//   application: pending → (needsInfo ⇄ guest answer returns to pending)
//                → approved | declined | withdrawn | expired
//                counterOffered = live host counter, undecided, guest's court
//   counter:     open → accepted | declinedByOrganizer | superseded | lapsed
// Approval materializes booking occurrences; live occurrences are the only
// authority on double-booking. Open hours and blackouts are advisory at
// decision time but validated at submit, as in the real service.
//
// Every mutation emits bus 'store:change' ({ type, ...context }).

import { bus } from '../core/bus.js';
import { ACTIVITY_TYPES, getRoom, getVenue, VENUES } from './venues.js';

export const APP_STATUS = {
  pending: 'pending',
  needsInfo: 'needsInfo',
  counterOffered: 'counterOffered',
  approved: 'approved',
  declined: 'declined',
  withdrawn: 'withdrawn',
  expired: 'expired',
};

export const UNDECIDED = new Set([
  APP_STATUS.pending,
  APP_STATUS.needsInfo,
  APP_STATUS.counterOffered,
]);

export const COUNTER_STATUS = {
  open: 'open',
  accepted: 'accepted',
  declinedByOrganizer: 'declinedByOrganizer',
  superseded: 'superseded',
  lapsed: 'lapsed',
};

// Bit n = day n, Sunday = 0 — the .NET DayOfWeek convention the schema uses.
export const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const daysToMask = (days) => days.reduce((m, d) => m | (1 << d), 0);
export const maskToDays = (mask) => DAY_LABELS.map((_, d) => d).filter((d) => mask & (1 << d));

export const GUEST_ID = 'maria-alvarez';
export const ORGANIZERS = {
  'maria-alvarez': { name: 'Maria Alvarez', org: 'Little Sparrows Playgroup', verified: true, joined: '2025-09' },
  'daniel-okafor': { name: 'Daniel Okafor', org: 'Vienna Woods Chess Club', verified: true, joined: '2024-11' },
  'priya-raman': { name: 'Priya Raman', org: 'ESL Conversation Circle', verified: true, joined: '2025-03' },
  'sam-whitfield': { name: 'Sam Whitfield', org: 'Vienna Community Chorale', verified: true, joined: '2024-06' },
};

const EXPIRY_DAYS = 14;
const STORE_KEY = 'steeple-village-store';
const SEED_VERSION = 1;

// ---- venue-local time helpers (dates 'YYYY-MM-DD', times 'HH:mm') ----------

const MS_DAY = 86400000;

function iso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fromIso(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const todayIso = () => iso(new Date());
export const addDays = (isoDate, n) => iso(new Date(fromIso(isoDate).getTime() + n * MS_DAY));
export const weekdayOf = (isoDate) => fromIso(isoDate).getDay();

/** The first date on weekday `dow` that is on or after `isoDate`. */
export function nextWeekday(isoDate, dow) {
  return addDays(isoDate, (dow - weekdayOf(isoDate) + 7) % 7);
}

const timeOk = (t) => /^\d{2}:\d{2}$/.test(t);
const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

// ---- persistence ------------------------------------------------------------

const memoryFallback = new Map();
const storage = (() => {
  try {
    const probe = '__steeple-probe';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return {
      getItem: (k) => memoryFallback.get(k) ?? null,
      setItem: (k, v) => memoryFallback.set(k, v),
      removeItem: (k) => memoryFallback.delete(k),
    };
  }
})();

let data = null;

function load() {
  if (data) return data;
  try {
    const raw = storage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.seedVersion === SEED_VERSION) data = parsed;
    }
  } catch {
    data = null;
  }
  if (!data) {
    data = seed();
    save();
  }
  sweepExpiry();
  return data;
}

function save() {
  storage.setItem(STORE_KEY, JSON.stringify(data));
}

function emit(type, context = {}) {
  save();
  bus.emit('store:change', { type, ...context });
}

const roomKey = (venueId, roomId) => `${venueId}/${roomId}`;
const nowIso = () => new Date().toISOString();

// ---- reads ------------------------------------------------------------------

const byNewest = (a, b) => (a.createdAt < b.createdAt ? 1 : -1);

export function guestApplications() {
  return load().applications.filter((a) => a.organizerId === GUEST_ID).sort(byNewest);
}

export function venueApplications(venueId) {
  return load().applications.filter((a) => a.venueId === venueId).sort(byNewest);
}

export function getApplication(applicationId) {
  return load().applications.find((a) => a.id === applicationId) ?? null;
}

export function threadFor(applicationId) {
  return load()
    .messages.filter((m) => m.applicationId === applicationId)
    .sort((a, b) => (a.sentAt < b.sentAt ? -1 : 1));
}

export function countersFor(applicationId) {
  return load()
    .counterOffers.filter((c) => c.applicationId === applicationId)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

export function openCounterFor(applicationId) {
  return countersFor(applicationId).find((c) => c.status === COUNTER_STATUS.open) ?? null;
}

export function bookingFor(applicationId) {
  return load().bookings.find((b) => b.applicationId === applicationId) ?? null;
}

export function occurrencesFor(bookingId) {
  return load()
    .occurrences.filter((o) => o.bookingId === bookingId)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Live occurrences a room is committed to — the ribbons on its week. */
export function roomOccurrences(venueId, roomId) {
  const key = roomKey(venueId, roomId);
  return load()
    .occurrences.filter((o) => o.roomKey === key && o.status !== 'cancelled')
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function openHoursFor(venueId, roomId) {
  return load().openHours[roomKey(venueId, roomId)] ?? [];
}

export function blackoutsFor(venueId, roomId) {
  return load().blackouts[roomKey(venueId, roomId)] ?? [];
}

/** Room data with any host edits (describe flow, publish) applied. */
export function effectiveRoom(venueId, roomId) {
  const base = getRoom(venueId, roomId) ?? placedRoom(venueId, roomId);
  if (!base) return null;
  const edits = load().roomEdits[roomKey(venueId, roomId)];
  return edits ? { ...base, ...edits } : base;
}

export function placedVenues() {
  return load().placedVenues;
}

function placedRoom(venueId, roomId) {
  const venue = load().placedVenues.find((v) => v.id === venueId);
  return venue?.rooms.find((r) => r.id === roomId) ?? null;
}

export function homePin() {
  return load().homePin;
}

export function hostVenueId() {
  return load().hostVenueId;
}

/** Per-venue correspondence counts, for the world's lanterns and the desk badge. */
export function venueSignals() {
  const signals = new Map();
  for (const app of load().applications) {
    const s =
      signals.get(app.venueId) ??
      { pending: 0, needsInfo: 0, counterOffered: 0, approved: 0, declined: 0 };
    if (s[app.status] !== undefined) s[app.status] += 1;
    signals.set(app.venueId, s);
  }
  return signals;
}

// ---- validation -------------------------------------------------------------

/** True when [start, end] fits inside one of the day's open windows. */
export function hoursFit(windows, day, startTime, endTime) {
  return windows.some((w) => w.day === day && w.start <= startTime && endTime <= w.end);
}

function scheduleDays(app) {
  return app.frequency === 'weekly' ? maskToDays(app.daysOfWeekMask ?? 0) : [weekdayOf(app.startDate)];
}

/**
 * Submit-time validation, mirroring the Applications service: intent required
 * and ≤ 2000 chars, one activity the room accepts, group fits capacity,
 * recurrence bounded (endDate required), and the schedule inside open hours.
 * Returns { ok, errors: { field: message } } so composers can validate live.
 */
export function validateApplication(draft) {
  const errors = {};
  const room = effectiveRoom(draft.venueId, draft.roomId);
  if (!room) return { ok: false, errors: { roomId: 'Choose a space to apply for.' } };

  const intent = (draft.intentText ?? '').trim();
  if (!intent) errors.intentText = 'Tell the church what your group would like to do.';
  else if (intent.length > 2000) errors.intentText = 'Keep your note under 2000 characters.';

  if (!ACTIVITY_TYPES.includes(draft.activityType))
    errors.activityType = 'Choose one activity type.';
  else if (!room.activities.includes(draft.activityType))
    errors.activityType = `${room.name} does not host ${draft.activityType} activities.`;

  const size = Number(draft.groupSize);
  if (!Number.isInteger(size) || size < 1) errors.groupSize = 'How many people will come?';
  else if (size > room.capacity)
    errors.groupSize = `${room.name} seats up to ${room.capacity}.`;

  if (!draft.startDate) errors.startDate = 'Choose a date.';
  else if (draft.startDate < todayIso()) errors.startDate = 'Choose a date that has not passed.';

  if (!timeOk(draft.startTime ?? '') || !timeOk(draft.endTime ?? ''))
    errors.startTime = 'Choose a start and end time.';
  else if (draft.startTime >= draft.endTime) errors.endTime = 'End after the start.';

  if (draft.frequency === 'weekly') {
    if (!draft.endDate) errors.endDate = 'Weekly bookings need an end date.';
    else if (draft.endDate <= draft.startDate) errors.endDate = 'End after the first week.';
    else if (draft.endDate > addDays(draft.startDate, 366))
      errors.endDate = 'Keep the booking within a year — renewals are a new letter.';
    if (!(draft.daysOfWeekMask > 0 && draft.daysOfWeekMask < 128))
      errors.daysOfWeekMask = 'Choose at least one weekday.';
  } else if (draft.frequency !== 'oneOff') {
    errors.frequency = 'One-off or weekly.';
  }

  if (!errors.startDate && !errors.startTime && !errors.endTime && !errors.daysOfWeekMask) {
    const windows = openHoursFor(draft.venueId, draft.roomId);
    const days = scheduleDays(draft);
    const closed = days.filter((d) => !hoursFit(windows, d, draft.startTime, draft.endTime));
    if (closed.length)
      errors.schedule = `${room.name} is not open ${closed
        .map((d) => `${DAY_LABELS[d]}s`)
        .join(', ')} at that time.`;
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

// ---- occurrence materialization & conflicts ---------------------------------

/** The venue-local dates a schedule lands on, blackouts skipped (advisory). */
export function materializeDates(schedule, blackouts = []) {
  const blocked = new Set(blackouts.map((b) => b.date));
  if (schedule.frequency !== 'weekly') {
    return blocked.has(schedule.startDate) ? [] : [schedule.startDate];
  }
  const dates = [];
  for (let d = schedule.startDate; d <= schedule.endDate; d = addDays(d, 1)) {
    if (schedule.daysOfWeekMask & (1 << weekdayOf(d)) && !blocked.has(d)) dates.push(d);
  }
  return dates;
}

/**
 * What stands between a schedule and this room: clashes with live occurrences
 * (the only hard stop, as in the exclusion constraint), open-hours misses and
 * blackout skips (advisory — the desk shows them, the host decides).
 */
export function scheduleConflicts(venueId, roomId, schedule) {
  const windows = openHoursFor(venueId, roomId);
  const blackouts = blackoutsFor(venueId, roomId);
  const outsideHours = scheduleDays(schedule).filter(
    (d) => !hoursFit(windows, d, schedule.startTime, schedule.endTime)
  );
  const blocked = new Set(blackouts.map((b) => b.date));
  const skipped = materializeDates(schedule, []).filter((d) => blocked.has(d));

  const live = roomOccurrences(venueId, roomId);
  const clashes = [];
  for (const date of materializeDates(schedule, blackouts)) {
    for (const o of live) {
      if (o.date === date && overlaps(schedule.startTime, schedule.endTime, o.start, o.end)) {
        clashes.push({ date, start: o.start, end: o.end, bookingId: o.bookingId });
      }
    }
  }
  return { clashes, outsideHours, blackoutDates: skipped };
}

// ---- mutations: guest -------------------------------------------------------

let idCounter = 0;
const freshId = (prefix) => `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

/**
 * File a request.
 *
 * With no second argument this is the store acting alone, as it always has: the
 * rules are checked here and the row is invented here.
 *
 * With `remote` — steeple's own ApplicationDto, straight off the wire — the
 * request has already been filed with the service, and this only mirrors it so
 * the inbox, the journal and the opened letter go on working from one place.
 * The server is then the authority: its id, its status, its timestamps, its
 * normalized schedule. Nothing is re-validated, because refusing locally what
 * the service accepted would be a phantom failure after a real success.
 *
 * `organizerId` stays this browser's guest either way — it is what "your
 * requests" means here — while the person the service actually recorded rides
 * alongside as `organizerName` / `organizationName`.
 */
export function submitApplication(draft, remote = null) {
  load();
  if (!remote) {
    const check = validateApplication(draft);
    if (!check.ok) return { ok: false, errors: check.errors };
  }
  const mirrored = remote ? fromWireApplication(remote) : null;
  const application = {
    id: mirrored?.id ?? freshId('app'),
    venueId: draft.venueId,
    roomId: draft.roomId,
    organizerId: draft.organizerId ?? GUEST_ID,
    activityType: draft.activityType,
    groupSize: mirrored?.groupSize ?? Number(draft.groupSize),
    frequency: mirrored?.frequency ?? draft.frequency,
    startDate: mirrored?.startDate ?? draft.startDate,
    endDate: mirrored ? mirrored.endDate : draft.frequency === 'weekly' ? draft.endDate : null,
    daysOfWeekMask: mirrored
      ? mirrored.daysOfWeekMask
      : draft.frequency === 'weekly'
        ? draft.daysOfWeekMask
        : null,
    startTime: mirrored?.startTime ?? draft.startTime,
    endTime: mirrored?.endTime ?? draft.endTime,
    intentText: (mirrored?.intentText ?? draft.intentText).trim(),
    status: mirrored?.status ?? APP_STATUS.pending,
    createdAt: mirrored?.createdAt ?? nowIso(),
    decidedAt: mirrored?.decidedAt ?? null,
    expiresAt: mirrored?.expiresAt ?? new Date(Date.now() + EXPIRY_DAYS * MS_DAY).toISOString(),
    ...(mirrored
      ? { organizerName: mirrored.organizerName, organizationName: mirrored.organizationName }
      : {}),
  };
  // A replayed submission (same Idempotency-Key) comes back as the request that
  // is already here: hold one row, not two.
  const at = data.applications.findIndex((a) => a.id === application.id);
  if (at >= 0) data.applications[at] = application;
  else data.applications.push(application);
  emit('submit', { applicationId: application.id, venueId: application.venueId, roomId: application.roomId });
  return { ok: true, application };
}

/** steeple's ApplicationDto in this store's own vocabulary. */
function fromWireApplication(dto) {
  const schedule = dto.schedule ?? {};
  const weekly = schedule.frequency === 'recurringWeekly';
  const days = (schedule.daysOfWeek ?? []).map((name) =>
    DAY_LABELS.findIndex((label) => label.toLowerCase() === String(name).toLowerCase())
  );
  return {
    id: dto.id,
    groupSize: dto.groupSize,
    intentText: dto.intentText ?? '',
    status: dto.status,
    frequency: weekly ? 'weekly' : 'oneOff',
    startDate: schedule.startDate ?? null,
    // A one-off is echoed with endDate equal to startDate; here it is simply
    // a request with one date and no end.
    endDate: weekly ? (schedule.endDate ?? null) : null,
    daysOfWeekMask: weekly ? daysToMask(days.filter((d) => d >= 0)) : null,
    startTime: (schedule.startTime ?? '').slice(0, 5),
    endTime: (schedule.endTime ?? '').slice(0, 5),
    createdAt: dto.createdAtUtc ?? nowIso(),
    decidedAt: dto.decidedAtUtc ?? null,
    expiresAt: dto.expiresAtUtc ?? null,
    organizerName: dto.organizer?.displayName ?? null,
    organizationName: dto.organizationName ?? null,
  };
}

export function withdraw(applicationId) {
  const app = getApplication(applicationId);
  if (!app || !UNDECIDED.has(app.status)) return { ok: false };
  app.status = APP_STATUS.withdrawn;
  app.decidedAt = nowIso();
  lapseOpenCounter(applicationId, COUNTER_STATUS.lapsed);
  emit('withdraw', { applicationId, venueId: app.venueId });
  return { ok: true, application: app };
}

/** Either party writes while undecided; a guest's answer resolves NeedsInfo. */
export function sendMessage(applicationId, sender, body) {
  const app = getApplication(applicationId);
  const text = (body ?? '').trim();
  if (!app || !UNDECIDED.has(app.status) || !text || text.length > 2000) return { ok: false };
  data.messages.push({
    id: freshId('msg'),
    applicationId,
    sender,
    body: text,
    sentAt: nowIso(),
  });
  if (sender === 'guest' && app.status === APP_STATUS.needsInfo) {
    app.status = APP_STATUS.pending;
  }
  emit('message', { applicationId, venueId: app.venueId, sender });
  return { ok: true };
}

export function acceptCounter(applicationId) {
  const app = getApplication(applicationId);
  const counter = openCounterFor(applicationId);
  if (!app || !counter || app.status !== APP_STATUS.counterOffered) return { ok: false };
  const schedule = counterSchedule(counter);
  const { clashes } = scheduleConflicts(app.venueId, app.roomId, schedule);
  if (clashes.length) return { ok: false, clashes };
  Object.assign(app, schedule);
  counter.status = COUNTER_STATUS.accepted;
  counter.respondedAt = nowIso();
  const booked = book(app);
  emit('counter-accepted', { applicationId, venueId: app.venueId, roomId: app.roomId });
  return { ok: true, application: app, ...booked };
}

export function declineCounter(applicationId, note) {
  const app = getApplication(applicationId);
  const counter = openCounterFor(applicationId);
  if (!app || !counter || app.status !== APP_STATUS.counterOffered) return { ok: false };
  counter.status = COUNTER_STATUS.declinedByOrganizer;
  counter.respondedAt = nowIso();
  app.status = APP_STATUS.pending;
  if (note?.trim()) sendMessage(applicationId, 'guest', note);
  emit('counter-declined', { applicationId, venueId: app.venueId });
  return { ok: true, application: app };
}

// ---- mutations: host --------------------------------------------------------

export function askQuestion(applicationId, body) {
  const app = getApplication(applicationId);
  if (!app || app.status !== APP_STATUS.pending) return { ok: false };
  app.status = APP_STATUS.needsInfo;
  data.messages.push({
    id: freshId('msg'),
    applicationId,
    sender: 'host',
    body: (body ?? '').trim(),
    sentAt: nowIso(),
  });
  emit('needs-info', { applicationId, venueId: app.venueId });
  return { ok: true, application: app };
}

export function approve(applicationId) {
  const app = getApplication(applicationId);
  if (!app || !UNDECIDED.has(app.status)) return { ok: false };
  const { clashes } = scheduleConflicts(app.venueId, app.roomId, app);
  if (clashes.length) return { ok: false, clashes };
  lapseOpenCounter(applicationId, COUNTER_STATUS.superseded);
  const booked = book(app);
  emit('approve', { applicationId, venueId: app.venueId, roomId: app.roomId });
  return { ok: true, application: app, ...booked };
}

export function decline(applicationId, note) {
  const app = getApplication(applicationId);
  if (!app || !UNDECIDED.has(app.status)) return { ok: false };
  if (note?.trim()) sendMessage(applicationId, 'host', note);
  app.status = APP_STATUS.declined;
  app.decidedAt = nowIso();
  app.declineNote = note?.trim() || null;
  lapseOpenCounter(applicationId, COUNTER_STATUS.superseded);
  emit('decline', { applicationId, venueId: app.venueId });
  return { ok: true, application: app };
}

export function counterOffer(applicationId, schedule, message) {
  const app = getApplication(applicationId);
  if (!app || !UNDECIDED.has(app.status)) return { ok: false };
  if (schedule.frequency === 'weekly' && (!schedule.endDate || !(schedule.daysOfWeekMask > 0)))
    return { ok: false, errors: { schedule: 'A weekly counter needs an end date and weekdays.' } };
  if (!timeOk(schedule.startTime) || !timeOk(schedule.endTime) || schedule.startTime >= schedule.endTime)
    return { ok: false, errors: { schedule: 'Counter times must be a valid range.' } };
  lapseOpenCounter(applicationId, COUNTER_STATUS.superseded);
  const counter = {
    id: freshId('counter'),
    applicationId,
    frequency: schedule.frequency,
    startDate: schedule.startDate,
    endDate: schedule.frequency === 'weekly' ? schedule.endDate : null,
    daysOfWeekMask: schedule.frequency === 'weekly' ? schedule.daysOfWeekMask : null,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    message: message?.trim() || null,
    status: COUNTER_STATUS.open,
    createdAt: nowIso(),
    respondedAt: null,
  };
  data.counterOffers.push(counter);
  app.status = APP_STATUS.counterOffered;
  emit('counter', { applicationId, venueId: app.venueId });
  return { ok: true, counter };
}

/** Replace-all weekly windows for a room, as the Manage service does. */
export function setOpenHours(venueId, roomId, windows) {
  load();
  for (const w of windows) {
    if (!(w.day >= 0 && w.day <= 6) || !timeOk(w.start) || !timeOk(w.end) || w.start >= w.end)
      return { ok: false, errors: { hours: 'Each window needs a weekday and a valid time range.' } };
  }
  for (const a of windows) {
    for (const b of windows) {
      if (a !== b && a.day === b.day && overlaps(a.start, a.end, b.start, b.end))
        return { ok: false, errors: { hours: `Two ${DAY_LABELS[a.day]} windows overlap.` } };
    }
  }
  data.openHours[roomKey(venueId, roomId)] = windows
    .map((w) => ({ day: w.day, start: w.start, end: w.end }))
    .sort((a, b) => a.day - b.day || (a.start < b.start ? -1 : 1));
  emit('open-hours', { venueId, roomId });
  return { ok: true };
}

export function addBlackout(venueId, roomId, date, reason) {
  load();
  const key = roomKey(venueId, roomId);
  const list = (data.blackouts[key] ??= []);
  if (!list.some((b) => b.date === date)) list.push({ date, reason: reason?.trim() || null });
  list.sort((a, b) => (a.date < b.date ? -1 : 1));
  emit('blackout', { venueId, roomId });
  return { ok: true };
}

export function removeBlackout(venueId, roomId, date) {
  load();
  const key = roomKey(venueId, roomId);
  data.blackouts[key] = (data.blackouts[key] ?? []).filter((b) => b.date !== date);
  emit('blackout', { venueId, roomId });
  return { ok: true };
}

/**
 * The describe flow: host edits over the canonical room, publish included.
 *
 * With no third argument this is the store acting alone, as it always has: the
 * publish rule is checked here and the state is decided here.
 *
 * With `remote` — steeple's own ManagedRoomDto, straight off the wire — the
 * write has already happened at the service, and this only mirrors it. The
 * server's status is recorded as it stands (a room the moderation gate holds
 * comes back `draft` with a publish request against it), and the local gate is
 * not re-run, because refusing here what the service accepted would be a
 * phantom failure after a real success.
 */
export function editRoom(venueId, roomId, patch, remote = null) {
  load();
  const room = effectiveRoom(venueId, roomId);
  if (!room) return { ok: false };
  if (!remote && patch.status === 'published' && room.status !== 'published') {
    if (openHoursFor(venueId, roomId).length === 0)
      return { ok: false, errors: { status: 'Set open hours before publishing.' } };
  }
  const key = roomKey(venueId, roomId);
  const mirrored = remote ? fromWireRoom(remote) : {};
  data.roomEdits[key] = { ...(data.roomEdits[key] ?? {}), ...patch, ...mirrored };
  const published = (mirrored.status ?? patch.status) === 'published';
  emit('room-edit', { venueId, roomId, published });
  return { ok: true, room: effectiveRoom(venueId, roomId) };
}

/**
 * steeple's ManagedRoomDto in this store's own vocabulary. `status` needs no
 * translation — draft/published/unlisted are the words both sides use — and
 * `publishRequestedAt` is what tells the desk a room is with a moderator
 * rather than merely unfinished.
 */
function fromWireRoom(dto) {
  return {
    remoteId: dto.id,
    // Whatever this browser was holding alone, the service is now holding too.
    keptLocally: false,
    name: dto.name,
    description: dto.description,
    capacity: dto.capacity,
    pricePerHour: dto.pricePerHour,
    houseRules: dto.houseRules ?? '',
    status: dto.status,
    publishRequestedAt: dto.publishRequestedAtUtc ?? null,
    photo: dto.photos?.find((p) => p.isPrimary)?.cardUrl ?? dto.photos?.[0]?.cardUrl ?? null,
  };
}

/**
 * A venue the host has listed, kept on the Wayfinder beside the five. Where it
 * stands is not this browser's guess: steeple geocodes the address on create
 * and the position it answers with is what lands here.
 */
export function upsertPlacedVenue(venue) {
  load();
  const existing = data.placedVenues.findIndex((v) => v.id === venue.id);
  if (existing >= 0) {
    // A partial upsert changes what it names and nothing else. Merging a
    // defaulted `rooms: []` over a venue that already had rooms emptied it —
    // and an emptied venue has no room to publish.
    const before = data.placedVenues[existing];
    const entry = { ...before, ...venue, rooms: venue.rooms ?? before.rooms ?? [] };
    data.placedVenues[existing] = entry;
    emit('venue-placed', { venueId: entry.id });
    return { ok: true, venue: entry };
  }
  const entry = { rooms: [], published: false, placed: true, ...venue };
  data.placedVenues.push(entry);
  emit('venue-placed', { venueId: entry.id });
  return { ok: true, venue: entry };
}

export function setHomePin(pin) {
  load();
  data.homePin = pin ? { lat: pin.lat, lng: pin.lng } : null;
  emit('home-pin', { pin: data.homePin });
  return { ok: true };
}

export function setHostVenue(venueId) {
  load();
  data.hostVenueId = venueId;
  emit('host-venue', { venueId });
  return { ok: true };
}

// ---- internals --------------------------------------------------------------

function counterSchedule(counter) {
  return {
    frequency: counter.frequency,
    startDate: counter.startDate,
    endDate: counter.endDate,
    daysOfWeekMask: counter.daysOfWeekMask,
    startTime: counter.startTime,
    endTime: counter.endTime,
  };
}

function lapseOpenCounter(applicationId, status) {
  const counter = openCounterFor(applicationId);
  if (counter) {
    counter.status = status;
    counter.respondedAt = nowIso();
  }
}

function book(app) {
  const booking = {
    id: freshId('booking'),
    applicationId: app.id,
    venueId: app.venueId,
    roomId: app.roomId,
    organizerId: app.organizerId,
    frequency: app.frequency,
    startDate: app.startDate,
    endDate: app.endDate ?? app.startDate,
    daysOfWeekMask: app.daysOfWeekMask,
    startTime: app.startTime,
    endTime: app.endTime,
    status: 'confirmed',
    createdAt: nowIso(),
  };
  const key = roomKey(app.venueId, app.roomId);
  const occurrences = materializeDates(app, blackoutsFor(app.venueId, app.roomId)).map((date) => ({
    id: `${booking.id}-${date}`,
    bookingId: booking.id,
    roomKey: key,
    date,
    start: app.startTime,
    end: app.endTime,
    status: 'scheduled',
  }));
  data.bookings.push(booking);
  data.occurrences.push(...occurrences);
  app.status = APP_STATUS.approved;
  app.decidedAt = nowIso();
  return { booking, occurrences };
}

/** Lazy expiry, as the real service sweeps: undecided past expiresAt expires. */
function sweepExpiry() {
  let swept = false;
  const now = nowIso();
  for (const app of data.applications) {
    if (UNDECIDED.has(app.status) && app.expiresAt < now) {
      app.status = APP_STATUS.expired;
      lapseOpenCounter(app.id, COUNTER_STATUS.lapsed);
      swept = true;
    }
  }
  if (swept) save();
}

export function resetDemo() {
  data = seed();
  emit('reset', {});
  return { ok: true };
}

// ---- seed: in-flight correspondence, believable and calm --------------------

function seed() {
  const today = todayIso();
  const at = (daysAgo) => new Date(Date.now() - daysAgo * MS_DAY).toISOString();
  const expiry = (createdAt) => new Date(Date.parse(createdAt) + EXPIRY_DAYS * MS_DAY).toISOString();

  const openHours = {};
  for (const venue of VENUES) {
    for (const room of venue.rooms) {
      if (room.status !== 'published') continue;
      openHours[roomKey(venue.id, room.id)] = DAY_LABELS.map((_, day) => ({
        day,
        start: '08:00',
        end: '22:00',
      }));
    }
  }

  const festival = nextWeekday(addDays(today, 15), 6);
  const blackouts = {
    'grace-community-vienna/fellowship-hall': [{ date: festival, reason: 'Parish festival' }],
  };

  const applications = [];
  const counterOffers = [];
  const messages = [];
  const bookings = [];
  const occurrences = [];

  const add = (app) => (applications.push(app), app);
  const bookSeed = (app) => {
    const booking = {
      id: `booking-${app.id}`,
      applicationId: app.id,
      venueId: app.venueId,
      roomId: app.roomId,
      organizerId: app.organizerId,
      frequency: app.frequency,
      startDate: app.startDate,
      endDate: app.endDate ?? app.startDate,
      daysOfWeekMask: app.daysOfWeekMask,
      startTime: app.startTime,
      endTime: app.endTime,
      status: 'confirmed',
      createdAt: app.decidedAt,
    };
    bookings.push(booking);
    const key = roomKey(app.venueId, app.roomId);
    for (const date of materializeDates(app, blackouts[key] ?? [])) {
      occurrences.push({
        id: `${booking.id}-${date}`,
        bookingId: booking.id,
        roomKey: key,
        date,
        start: app.startTime,
        end: app.endTime,
        status: 'scheduled',
      });
    }
  };

  // Maria, pending — the letter the host desk will find waiting.
  add({
    id: 'app-sparrows-mornings',
    venueId: 'grace-community-vienna',
    roomId: 'youth-activity-room',
    organizerId: GUEST_ID,
    activityType: 'Children',
    groupSize: 24,
    frequency: 'weekly',
    startDate: nextWeekday(addDays(today, 7), 2),
    endDate: addDays(nextWeekday(addDays(today, 7), 2), 70),
    daysOfWeekMask: daysToMask([2, 4]),
    startTime: '09:30',
    endTime: '11:30',
    intentText:
      'Little Sparrows is a parent-run playgroup for children under four. We would love a regular Tuesday and Thursday morning: songs, free play and a shared snack, with every child accompanied by a parent or carer. We bring our own mats and toys and leave the room as we found it.',
    status: APP_STATUS.pending,
    createdAt: at(2),
    decidedAt: null,
    expiresAt: expiry(at(2)),
  });

  // Maria, needsInfo — a question in the thread, ball in her court.
  add({
    id: 'app-sparrows-craft',
    venueId: 'dunn-loring-umc',
    roomId: 'art-studio',
    organizerId: GUEST_ID,
    activityType: 'Children',
    groupSize: 18,
    frequency: 'oneOff',
    startDate: nextWeekday(addDays(today, 10), 6),
    endDate: null,
    daysOfWeekMask: null,
    startTime: '10:00',
    endTime: '12:00',
    intentText:
      'A one-off family craft morning for our playgroup: simple painting and collage for little ones, with parents alongside. Around twelve children and six adults.',
    status: APP_STATUS.needsInfo,
    createdAt: at(4),
    decidedAt: null,
    expiresAt: expiry(at(4)),
  });
  messages.push({
    id: 'msg-craft-question',
    applicationId: 'app-sparrows-craft',
    sender: 'host',
    body: 'Lovely to hear from you. Could you tell us how many adults will be with the children, and whether you plan to use paints? We cover the tables for messy work and can have that ready.',
    sentAt: at(1),
  });

  // Maria, counterOffered — the host proposed Thursdays instead.
  add({
    id: 'app-sparrows-stories',
    venueId: 'vienna-presbyterian',
    roomId: 'garden-meeting-room',
    organizerId: GUEST_ID,
    activityType: 'Community',
    groupSize: 14,
    frequency: 'weekly',
    startDate: nextWeekday(addDays(today, 7), 2),
    endDate: addDays(nextWeekday(addDays(today, 7), 2), 56),
    daysOfWeekMask: daysToMask([2]),
    startTime: '10:00',
    endTime: '11:30',
    intentText:
      'A quiet weekly story and rhyme hour for parents and babies, run with our neighborhood library volunteer. We would keep numbers small and the room calm.',
    status: APP_STATUS.counterOffered,
    createdAt: at(5),
    decidedAt: null,
    expiresAt: expiry(at(5)),
  });
  counterOffers.push({
    id: 'counter-stories-thursday',
    applicationId: 'app-sparrows-stories',
    frequency: 'weekly',
    startDate: nextWeekday(addDays(today, 7), 4),
    endDate: addDays(nextWeekday(addDays(today, 7), 4), 56),
    daysOfWeekMask: daysToMask([4]),
    startTime: '10:00',
    endTime: '11:30',
    message:
      'Tuesday mornings are held by our quilting circle through the autumn. Thursdays at the same hour are free, and the garden is at its quietest then — would that suit your group?',
    status: COUNTER_STATUS.open,
    createdAt: at(1),
    respondedAt: null,
  });

  // Maria, approved — a booking mid-term, occurrences behind and ahead.
  const lounge = add({
    id: 'app-sparrows-lounge',
    venueId: 'dunn-loring-umc',
    roomId: 'community-lounge',
    organizerId: GUEST_ID,
    activityType: 'Community',
    groupSize: 16,
    frequency: 'weekly',
    startDate: nextWeekday(addDays(today, -21), 3),
    endDate: addDays(nextWeekday(addDays(today, -21), 3), 63),
    daysOfWeekMask: daysToMask([3]),
    startTime: '09:30',
    endTime: '11:30',
    intentText:
      'A weekly coffee morning for new parents in the neighborhood — a chance to meet, share advice and let the littlest ones nap in the quiet.',
    status: APP_STATUS.approved,
    createdAt: at(31),
    decidedAt: at(28),
    expiresAt: expiry(at(31)),
  });
  bookSeed(lounge);

  // Maria, declined — a kind no, kept in the record.
  add({
    id: 'app-sparrows-sports',
    venueId: 'oakton-baptist',
    roomId: 'gymnasium',
    organizerId: GUEST_ID,
    activityType: 'Children',
    groupSize: 40,
    frequency: 'oneOff',
    startDate: nextWeekday(addDays(today, -14), 6),
    endDate: null,
    daysOfWeekMask: null,
    startTime: '15:00',
    endTime: '17:00',
    intentText:
      'An afternoon of soft play and parachute games for our playgroup families and friends — a summer get-together before the new term.',
    status: APP_STATUS.declined,
    createdAt: at(20),
    decidedAt: at(16),
    declineNote:
      'Thank you for thinking of us. The gym floor is being resurfaced that fortnight and we cannot host visiting groups. Grace Community or Vienna Presbyterian may well have space — we are sorry to miss you.',
    expiresAt: expiry(at(20)),
  });
  messages.push({
    id: 'msg-sports-decline',
    applicationId: 'app-sparrows-sports',
    sender: 'host',
    body: 'Thank you for thinking of us. The gym floor is being resurfaced that fortnight and we cannot host visiting groups. Grace Community or Vienna Presbyterian may well have space — we are sorry to miss you.',
    sentAt: at(16),
  });

  // The chorale, approved — Thursday evenings in the hall the chess club wants.
  const chorale = add({
    id: 'app-chorale-thursdays',
    venueId: 'grace-community-vienna',
    roomId: 'fellowship-hall',
    organizerId: 'sam-whitfield',
    activityType: 'Music',
    groupSize: 48,
    frequency: 'weekly',
    startDate: nextWeekday(addDays(today, -35), 4),
    endDate: addDays(nextWeekday(addDays(today, -35), 4), 105),
    daysOfWeekMask: daysToMask([4]),
    startTime: '19:00',
    endTime: '21:30',
    intentText:
      'The Vienna Community Chorale rehearses weekly ahead of our winter concerts. We are around fifty singers, we use the stage and piano, and we finish by half past nine.',
    status: APP_STATUS.approved,
    createdAt: at(42),
    decidedAt: at(40),
    expiresAt: expiry(at(42)),
  });
  bookSeed(chorale);

  // The chess club, pending — asks for Thursday evenings too. The desk's
  // schedule ribbon shows exactly where it collides with the chorale.
  add({
    id: 'app-chess-club',
    venueId: 'grace-community-vienna',
    roomId: 'fellowship-hall',
    organizerId: 'daniel-okafor',
    activityType: 'Community',
    groupSize: 24,
    frequency: 'weekly',
    startDate: nextWeekday(addDays(today, 5), 4),
    endDate: addDays(nextWeekday(addDays(today, 5), 4), 84),
    daysOfWeekMask: daysToMask([4]),
    startTime: '18:30',
    endTime: '21:00',
    intentText:
      'Vienna Woods Chess Club is looking for a regular club night. Twenty to twenty-four players, quiet by nature; we bring our own boards and clocks and only need tables, chairs and good light.',
    status: APP_STATUS.pending,
    createdAt: at(1),
    decidedAt: null,
    expiresAt: expiry(at(1)),
  });

  // The conversation circle, pending and clean — approvable on the spot.
  add({
    id: 'app-esl-evenings',
    venueId: 'grace-community-vienna',
    roomId: 'youth-activity-room',
    organizerId: 'priya-raman',
    activityType: 'Education',
    groupSize: 16,
    frequency: 'weekly',
    startDate: nextWeekday(addDays(today, 6), 1),
    endDate: addDays(nextWeekday(addDays(today, 6), 1), 77),
    daysOfWeekMask: daysToMask([1, 3]),
    startTime: '18:00',
    endTime: '19:30',
    intentText:
      'Our ESL conversation circle pairs new neighbors with volunteer partners for an hour and a half of practice and coffee. We are settled, friendly and tidy — sixteen of us on a good evening.',
    status: APP_STATUS.pending,
    createdAt: at(3),
    decidedAt: null,
    expiresAt: expiry(at(3)),
  });

  return {
    seedVersion: SEED_VERSION,
    applications,
    counterOffers,
    messages,
    bookings,
    occurrences,
    openHours,
    blackouts,
    roomEdits: {},
    placedVenues: [],
    homePin: null,
    hostVenueId: 'grace-community-vienna',
  };
}

// Convenient single handle for the debug API and for consumers that prefer a
// namespace over named imports.
export const store = {
  guestApplications,
  venueApplications,
  getApplication,
  threadFor,
  countersFor,
  openCounterFor,
  bookingFor,
  occurrencesFor,
  roomOccurrences,
  openHoursFor,
  blackoutsFor,
  effectiveRoom,
  placedVenues,
  homePin,
  hostVenueId,
  venueSignals,
  validateApplication,
  materializeDates,
  scheduleConflicts,
  hoursFit,
  submitApplication,
  withdraw,
  sendMessage,
  acceptCounter,
  declineCounter,
  askQuestion,
  approve,
  decline,
  counterOffer,
  setOpenHours,
  addBlackout,
  removeBlackout,
  editRoom,
  upsertPlacedVenue,
  setHomePin,
  setHostVenue,
  resetDemo,
};
