// The correspondence store — a MIRROR of what steeple holds, in the product's
// own vocabulary, kept in localStorage so a surface can be drawn before the wire
// answers and redrawn the moment it does.
//
// The server is the record (v2_migration D4). Nothing here decides a status,
// books a date, or invents a row: every application, counter-offer, message and
// booking arrives as steeple's own document through `mirrorApplication` /
// `mirrorBooking`, and those are the only ways in. Losing this cache costs a
// reload, never a fact — clear localStorage mid-flow and the next read from the
// wire puts everything back.
//
// Schema truth for the shapes it mirrors: db/changelog/004-applications.sql,
// 005-bookings.sql, 009-availability.sql.
//   application: pending → (needsInfo ⇄ guest answer returns to pending)
//                → approved | declined | withdrawn | expired
//                counterOffered = live host counter, undecided, guest's court
//   counter:     open → accepted | declinedByOrganizer | superseded | lapsed
//
// One store per person: the localStorage key is `steeple-village-store:{id}`,
// where the id is whoever data/session.js says is signed in, or `anon` when
// nobody is. A shared browser therefore never shows one account another's
// correspondence, and signing out drops what was in memory (D6).
//
// Outside a production build the village also carries a demo fixture — the
// letters the seeded churches have waiting, the hours their rooms keep. It is
// scenery for the 3D village and nothing else: its people are the seed's own
// ids, and a real account's id is a GUID, so no signed-in person ever inherits
// it and no managed desk ever shows it (v2_migration D4, task 7).
//
// Every mutation emits bus 'store:change' ({ type, ...context }); so does a
// change of person ({ type: 'identity' }).

import { bus } from '../core/bus.js';
import * as session from './session.js';
import { ACTIVITY_TYPES, getRoom, getVenue, VENUES } from './venues.js';

// Dev builds carry the demo village; a production bundle starts empty (D4).
// Written as "not a production build" on purpose: `import.meta.env` is absent
// under plain node, where the store's own suite runs, and the fixture is
// exactly what that suite is for.
const DEMO = import.meta.env?.PROD !== true;

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

/** The label the demo fixture's letters are written under. Not an identity. */
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

/** Nobody signed in: drafts and browsing, kept apart from every account. */
const ANON = 'anon';

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

// ---- whose store this is ----------------------------------------------------
//
// A browser is shared. One key per person means signing out cannot leave a
// letter on the screen for the next person to read, and signing in as somebody
// else opens their correspondence rather than inheriting the last one's
// (D6). Signed out, the `:anon` namespace holds drafts and nothing private.
//
// The identity is read from the session on every load rather than pushed in, so
// there is no boot order to get wrong: whoever asks the store a question first
// gets the right person's answer. The subscription below exists only to tell
// the surfaces that the answer has changed.

let heldFor = null;

/**
 * Who this browser's correspondence belongs to: steeple's own user id, or
 * `anon` when nobody is signed in. There is no second identity system — the
 * seeded personas that used to stand in for one died with D4.
 */
export function currentOrganizerId() {
  return session.currentUser()?.id ?? ANON;
}

const keyFor = (organizerId) => `${STORE_KEY}:${organizerId}`;

function load() {
  const organizerId = currentOrganizerId();
  if (data && heldFor === organizerId) return data;
  data = null;
  heldFor = organizerId;
  try {
    const raw = storage.getItem(keyFor(organizerId));
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
  return data;
}

function save() {
  storage.setItem(keyFor(heldFor ?? currentOrganizerId()), JSON.stringify(data));
}

// The person changed: drop what is in memory — nothing of theirs may survive
// the sign-out — and tell the surfaces, which re-read from whoever is here now.
// Other people's keys are left exactly where they are.
session.onSessionChange(() => {
  if (heldFor === currentOrganizerId()) return;
  data = null;
  heldFor = null;
  bus.emit('store:change', { type: 'identity' });
});

function emit(type, context = {}) {
  save();
  bus.emit('store:change', { type, ...context });
}

const roomKey = (venueId, roomId) => `${venueId}/${roomId}`;
const nowIso = () => new Date().toISOString();

// ---- reads ------------------------------------------------------------------

const byNewest = (a, b) => (a.createdAt < b.createdAt ? 1 : -1);

/**
 * The signed-in person's own requests. Signed out there are none to have: an
 * inbox belongs to somebody, and this browser is nobody at the moment.
 */
export function guestApplications() {
  const me = currentOrganizerId();
  if (me === ANON) return [];
  return load().applications.filter((a) => a.organizerId === me).sort(byNewest);
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
 * recurrence bounded (endDate required), and — when the caller knows them — the
 * schedule inside the room's open hours.
 *
 * `windows` is passed in rather than read from here: the room's real hours come
 * off the wire now (`catalog.getListing().openHours`), and a browser that has
 * not been told them must not invent a refusal the service would not make. The
 * service is the authority either way (`409 schedule_unavailable`).
 *
 * Returns { ok, errors: { field: message } } so composers can validate live.
 */
export function validateApplication(draft, { windows = null, room = null } = {}) {
  const errors = {};
  // The room may be one steeple published and this village has never had
  // scenery for, in which case the caller has it and this does not.
  const space = room ?? effectiveRoom(draft.venueId, draft.roomId);
  if (!space) return { ok: false, errors: { roomId: 'Choose a space to apply for.' } };

  const intent = (draft.intentText ?? '').trim();
  if (!intent) errors.intentText = 'Tell the church what your group would like to do.';
  else if (intent.length > 2000) errors.intentText = 'Keep your note under 2000 characters.';

  if (!ACTIVITY_TYPES.includes(draft.activityType))
    errors.activityType = 'Choose one activity type.';
  else if (!space.activities.includes(draft.activityType))
    errors.activityType = `${space.name} does not host ${draft.activityType} activities.`;

  const size = Number(draft.groupSize);
  if (!Number.isInteger(size) || size < 1) errors.groupSize = 'How many people will come?';
  else if (size > space.capacity)
    errors.groupSize = `${space.name} seats up to ${space.capacity}.`;

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

  if (windows && !errors.startDate && !errors.startTime && !errors.endTime && !errors.daysOfWeekMask) {
    const days = scheduleDays(draft);
    const closed = days.filter((d) => !hoursFit(windows, d, draft.startTime, draft.endTime));
    if (closed.length)
      errors.schedule = `${space.name} is not open ${closed
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

// ---- the mirror: steeple's documents, in this store's vocabulary ------------
//
// One way in. Every application state — filed, questioned, answered,
// counter-offered, approved, declined, withdrawn — arrives here as the
// ApplicationDto the service answered the write with, and the row is replaced
// wholesale. There is no local status machine to disagree with the server's,
// because there is no second record.

/** The wire's activity token as the label this product prints. */
const ACTIVITY_LABELS = Object.fromEntries(
  ACTIVITY_TYPES.map((label) => [label.toLowerCase(), label])
);

/** steeple's ScheduleDto in this store's own vocabulary. */
function fromWireSchedule(schedule = {}) {
  const weekly = schedule.frequency === 'recurringWeekly';
  const days = (schedule.daysOfWeek ?? []).map((name) =>
    DAY_LABELS.findIndex((label) => label.toLowerCase() === String(name).toLowerCase())
  );
  return {
    frequency: weekly ? 'weekly' : 'oneOff',
    startDate: schedule.startDate ?? null,
    // A one-off is echoed with endDate equal to startDate; here it is simply
    // a request with one date and no end.
    endDate: weekly ? (schedule.endDate ?? null) : null,
    daysOfWeekMask: weekly ? daysToMask(days.filter((d) => d >= 0)) : null,
    startTime: (schedule.startTime ?? '').slice(0, 5),
    endTime: (schedule.endTime ?? '').slice(0, 5),
  };
}

/**
 * steeple's ApplicationDto in this store's own vocabulary.
 *
 * The product navigates by slug pair (`grace-community-vienna/fellowship-hall`)
 * and the wire carries both slugs on every application, so the two id spaces
 * meet here and nowhere else. `roomId` — steeple's GUID — travels alongside as
 * `remoteRoomId` for the writes that need it.
 */
export function fromWireApplication(dto) {
  return {
    id: dto.id,
    venueId: dto.venueSlug,
    roomId: dto.roomSlug,
    remoteRoomId: dto.roomId,
    roomName: dto.roomName ?? null,
    venueName: dto.venueName ?? null,
    organizerId: dto.organizer?.id ?? null,
    organizerName: dto.organizer?.displayName ?? null,
    organizationName: dto.organizationName ?? null,
    hasPaymentMethod: dto.hasPaymentMethod === true,
    activityType: ACTIVITY_LABELS[String(dto.activityType ?? '').toLowerCase()] ?? dto.activityType,
    groupSize: dto.groupSize,
    intentText: dto.intentText ?? '',
    status: dto.status,
    ...fromWireSchedule(dto.schedule),
    createdAt: dto.createdAtUtc ?? nowIso(),
    decidedAt: dto.decidedAtUtc ?? null,
    expiresAt: dto.expiresAtUtc ?? null,
    bookingId: dto.bookingId ?? null,
    messageCount: dto.messageCount ?? 0,
  };
}

/** steeple's CounterOfferDto, flattened the way the desk and the letter read it. */
function fromWireCounter(dto, applicationId) {
  return {
    id: dto.id,
    applicationId,
    ...fromWireSchedule(dto.schedule),
    message: dto.message ?? null,
    status: dto.status,
    createdAt: dto.createdAtUtc ?? nowIso(),
    respondedAt: dto.respondedAtUtc ?? null,
  };
}

const upsertBy = (list, row) => {
  const at = list.findIndex((entry) => entry.id === row.id);
  if (at >= 0) list[at] = { ...list[at], ...row };
  else list.push(row);
};

/**
 * Hold one ApplicationDto, exactly as it arrived.
 *
 * A list read carries no thread (`messages: []`, `messageCount` set), so the
 * thread this browser already holds is left alone; a detail read carries the
 * whole thread and replaces it. `counterOffer` is the latest live counter — the
 * service returns no history, so neither does this.
 *
 * @param {object} dto steeple's ApplicationDto
 * @param {{thread?: boolean}} options `thread` when the dto carries the full one
 * @returns {object} the mirrored application
 */
export function mirrorApplication(dto, { thread = Array.isArray(dto?.messages) && dto.messages.length > 0 } = {}) {
  load();
  const application = fromWireApplication(dto);
  // What changed, for the surfaces that animate a change rather than draw a
  // state — the village posts a letter and seals a door (flows/world/index.js).
  const before = data.applications.find((a) => a.id === application.id) ?? null;
  const filed = !before;
  const settled = before?.status !== APP_STATUS.approved && application.status === APP_STATUS.approved;
  upsertBy(data.applications, application);

  if (thread) {
    const organizerId = dto.organizer?.id ?? null;
    data.messages = data.messages.filter((m) => m.applicationId !== application.id);
    for (const message of dto.messages ?? []) {
      data.messages.push({
        id: message.id,
        applicationId: application.id,
        // The wire names the sender by id; this surface only ever needed to know
        // which side of the correspondence it came from.
        sender: message.senderId === organizerId ? 'guest' : 'host',
        body: message.body,
        sentAt: message.sentAtUtc,
      });
    }
  }

  data.counterOffers = data.counterOffers.filter((c) => c.applicationId !== application.id);
  if (dto.counterOffer) data.counterOffers.push(fromWireCounter(dto.counterOffer, application.id));

  emit('mirror', {
    applicationId: application.id,
    venueId: application.venueId,
    roomId: application.roomId,
    status: application.status,
    filed,
    settled,
  });
  return application;
}

/**
 * Hold a page of applications as the whole of one scope.
 *
 * `scope` is a predicate over already-held rows saying which of them this page
 * is authoritative for — the guest's own inbox, or one venue's desk. Anything
 * matching it that the page did not carry is gone, which is how a withdrawal
 * made on another device disappears from this one.
 */
export function mirrorApplications(dtos, { scope = null } = {}) {
  load();
  const arriving = new Set(dtos.map((dto) => dto.id));
  if (scope) {
    const dropped = data.applications.filter((a) => scope(a) && !arriving.has(a.id));
    for (const gone of dropped) {
      data.messages = data.messages.filter((m) => m.applicationId !== gone.id);
      data.counterOffers = data.counterOffers.filter((c) => c.applicationId !== gone.id);
    }
    data.applications = data.applications.filter((a) => !scope(a) || arriving.has(a.id));
  }
  const mirrored = dtos.map((dto) => {
    const application = fromWireApplication(dto);
    upsertBy(data.applications, application);
    data.counterOffers = data.counterOffers.filter((c) => c.applicationId !== application.id);
    if (dto.counterOffer) data.counterOffers.push(fromWireCounter(dto.counterOffer, application.id));
    return application;
  });
  emit('mirror-list', { count: mirrored.length });
  return mirrored;
}

/**
 * Hold one BookingDto and the occurrences it carries.
 *
 * The payment block and each occurrence's `paymentStatus` travel through
 * untouched: this browser does not yet render them, and a mirror that drops
 * fields it does not understand is a mirror that lies to the next surface built
 * on it (docs/contracts/payments.md).
 */
export function mirrorBooking(dto) {
  load();
  const schedule = fromWireSchedule(dto.schedule);
  const key = roomKey(dto.venueSlug, dto.roomSlug);
  const booking = {
    id: dto.id,
    applicationId: dto.applicationId,
    venueId: dto.venueSlug,
    roomId: dto.roomSlug,
    remoteRoomId: dto.roomId,
    organizerId: dto.organizerId,
    organizerName: dto.organizerName ?? null,
    ...schedule,
    endDate: schedule.endDate ?? dto.endDate ?? schedule.startDate,
    status: dto.status,
    createdAt: dto.createdAtUtc,
    cancelledAt: dto.cancelledAtUtc ?? null,
    cancelReason: dto.cancelReason ?? null,
    venueTimezone: dto.venueTimezone ?? null,
    payment: dto.payment ?? null,
  };
  upsertBy(data.bookings, booking);

  // A list read carries no occurrence set; only a detail read may replace one.
  if (Array.isArray(dto.occurrences) && dto.occurrences.length) {
    data.occurrences = data.occurrences.filter((o) => o.bookingId !== booking.id);
    for (const occurrence of dto.occurrences) {
      data.occurrences.push({
        id: occurrence.id,
        bookingId: booking.id,
        roomKey: key,
        date: occurrence.localDate,
        start: schedule.startTime,
        end: schedule.endTime,
        status: occurrence.status,
        paymentStatus: occurrence.paymentStatus ?? null,
      });
    }
  }
  emit('mirror-booking', { bookingId: booking.id, applicationId: booking.applicationId });
  return booking;
}

/**
 * Hold the venues this person manages, and the rooms on each.
 *
 * The product navigates venues by slug, so a managed venue lands under its own
 * slug and carries steeple's id alongside as `remoteId`. A venue the listing
 * flow placed here under a guessed slug before steeple answered is replaced by
 * the one steeple named — two records of one venue is how a desk ends up
 * showing an empty copy of itself.
 */
export function mirrorManagedVenues(venues) {
  load();
  const remoteIds = new Set(venues.map((v) => v.id));
  data.placedVenues = data.placedVenues.filter(
    (v) => !(v.remoteId && remoteIds.has(v.remoteId) && !venues.some((m) => m.slug === v.id))
  );

  for (const venue of venues) {
    const rooms = (venue.rooms ?? []).map((room) => ({
      id: room.slug,
      remoteId: room.id,
      name: room.name,
      description: '',
      capacity: room.capacity,
      pricePerHour: Number(room.pricePerHour),
      houseRules: '',
      status: room.status,
      publishRequestedAt: room.publishRequestedAtUtc ?? null,
      photo: room.primaryPhotoUrl ?? null,
      amenities: [],
      accessibility: [],
      activities: [],
    }));
    upsertPlacedVenue({
      id: venue.slug,
      remoteId: venue.id,
      name: venue.name,
      shortName: venue.name.split(/\s+/).slice(0, 2).join(' '),
      description: venue.description ?? '',
      address: [venue.addressLine, [venue.suburb, venue.postcode].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(', '),
      suburb: venue.suburb,
      lat: venue.latitude,
      lng: venue.longitude,
      verified: venue.isIdentityVerified === true,
      bookingMode: venue.bookingMode ?? null,
      rooms,
    });
    // A venue the village already carries as scenery keeps its own rooms; what
    // steeple says about each of them — its status, whether a moderator has it,
    // its cover — is written over the top so the desk reads the same either way.
    for (const room of rooms) {
      const key = roomKey(venue.slug, room.id);
      data.roomEdits[key] = {
        ...(data.roomEdits[key] ?? {}),
        remoteId: room.remoteId,
        keptLocally: false,
        name: room.name,
        capacity: room.capacity,
        pricePerHour: room.pricePerHour,
        status: room.status,
        publishRequestedAt: room.publishRequestedAt,
        ...(room.photo ? { photo: room.photo } : {}),
      };
    }
  }
  emit('managed-venues', { count: venues.length });
  return venues;
}

/** Forget one application and everything hanging off it (a 404 on re-read). */
export function forgetApplication(applicationId) {
  load();
  data.applications = data.applications.filter((a) => a.id !== applicationId);
  data.messages = data.messages.filter((m) => m.applicationId !== applicationId);
  data.counterOffers = data.counterOffers.filter((c) => c.applicationId !== applicationId);
  emit('mirror', { applicationId, gone: true });
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
//
// Expiry used to be swept here, in the store, the way the service sweeps it
// lazily on read. It is gone: the service's sweep is the one that counts, and a
// mirror that ages a row on its own would show a status steeple never wrote.

export function resetDemo() {
  heldFor = currentOrganizerId();
  data = seed();
  emit('reset', {});
  return { ok: true };
}

// ---- seed: in-flight correspondence, believable and calm --------------------

/** An empty village: what a production build starts from, and starts with. */
function empty() {
  return {
    seedVersion: SEED_VERSION,
    applications: [],
    counterOffers: [],
    messages: [],
    bookings: [],
    occurrences: [],
    openHours: {},
    blackouts: {},
    roomEdits: {},
    placedVenues: [],
    homePin: null,
    hostVenueId: 'grace-community-vienna',
  };
}

function seed() {
  // The demo correspondence is a fixture of the dev village — the letters the
  // desk finds waiting, the hours its rooms keep. It is not somebody's data and
  // it does not ship: a production build starts every namespace empty.
  if (!DEMO) return empty();

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
  currentOrganizerId,
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
  mirrorApplication,
  mirrorApplications,
  mirrorBooking,
  mirrorManagedVenues,
  forgetApplication,
  fromWireApplication,
  setOpenHours,
  addBlackout,
  removeBlackout,
  editRoom,
  upsertPlacedVenue,
  setHomePin,
  setHostVenue,
  resetDemo,
};
