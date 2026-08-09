// The correspondence store — an in-memory MIRROR of what steeple holds, in the
// product's own vocabulary, redrawn whenever the wire answers.
//
// The server is the record (v2_migration D4). Nothing here decides a status,
// books a date, or invents a row: every application, counter-offer, message and
// booking arrives as steeple's own document through `mirrorApplication` /
// `mirrorBooking`, and those are the only ways in. A reload discards the mirror
// and any unfinished local work; real reads fill it again.
//
// Schema truth for the shapes it mirrors: db/changelog/004-applications.sql,
// 005-bookings.sql, 009-availability.sql.
//   application: pending → (needsInfo ⇄ guest answer returns to pending)
//                → approved | declined | withdrawn | expired
//                counterOffered = live host counter, undecided, guest's court
//   counter:     open → accepted | declinedByOrganizer | superseded | lapsed
//
// One in-memory store per active identity. A shared browser therefore never
// shows one account another's correspondence, and signing out drops what was
// in memory (D6). Legacy persisted mirrors are purged at boot and sign-out.
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
import { ACTIVITY_TYPES, getRoom, VENUES } from './venues.js';
import {
  APP_STATUS,
  COUNTER_STATUS,
  DAY_LABELS,
  DAY_TOKENS,
  GUEST_ID,
  ORGANIZERS,
  UNDECIDED,
} from './store/model.js';
import {
  addDays,
  daysToMask,
  hoursFit,
  maskToDays,
  materializeDates,
  nextWeekday,
  overlaps,
  scheduleDays,
  timeOk,
  todayIso,
  weekdayOf,
} from './store/schedule.js';
import {
  fromWireApplication,
  fromWireCounter,
  fromWireRoom,
  fromWireSchedule,
} from './store/mapping.js';
import { createStoreSeed } from './store/fixtures.js';
import { createDraftStore } from './store/drafts.js';
import { createHostState } from './store/host-state.js';

export {
  APP_STATUS,
  COUNTER_STATUS,
  DAY_LABELS,
  GUEST_ID,
  ORGANIZERS,
  UNDECIDED,
  addDays,
  daysToMask,
  hoursFit,
  maskToDays,
  materializeDates,
  nextWeekday,
  todayIso,
  weekdayOf,
  fromWireApplication,
};

// Dev builds carry the demo village; a production bundle starts empty (D4).
// Written as "not a production build" on purpose: `import.meta.env` is absent
// under plain node, where the store's own suite runs, and the fixture is
// exactly what that suite is for.
const DEMO = import.meta.env?.PROD !== true;

const STORE_KEY = 'steeple-village-store';

/** Nobody signed in: drafts and browsing, kept apart from every account. */
const ANON = 'anon';

// ---- venue-local time helpers (dates 'YYYY-MM-DD', times 'HH:mm') ----------

// ---- memory and legacy cleanup ---------------------------------------------

/** Private mirrors from pre-P2 builds must not survive an upgrade or sign-out. */
function purgeLegacyStores() {
  for (const area of [globalThis.localStorage, globalThis.sessionStorage]) {
    try {
      for (let i = area?.length - 1; i >= 0; i -= 1) {
        const key = area.key(i);
        if (key?.startsWith(`${STORE_KEY}:`)) area.removeItem(key);
      }
    } catch {
      // Disabled storage cannot contain a readable legacy mirror.
    }
  }
}

purgeLegacyStores();

let data = null;

// ---- whose store this is ----------------------------------------------------
//
// A browser is shared. Changing identity throws the entire mirror away, so a
// letter cannot remain on screen for the next person and signed-out drafts do
// not survive a sign-in (D6).
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

function load() {
  const organizerId = currentOrganizerId();
  if (data && heldFor === organizerId) return data;
  heldFor = organizerId;
  data = seed();
  return data;
}

// The person changed: drop what is in memory — nothing of theirs may survive
// the sign-out — and tell the surfaces, which re-read from whoever is here now.
session.onSessionChange((held) => {
  if (!held) purgeLegacyStores();
  if (heldFor === currentOrganizerId()) return;
  data = null;
  heldFor = null;
  bus.emit('store:change', { type: 'identity' });
});

function emit(type, context = {}) {
  bus.emit('store:change', { type, ...context });
}

const roomKey = (venueId, roomId) => `${venueId}/${roomId}`;

export const {
  mirrorRoomAvailability,
  setOpenHours,
  addBlackout,
  removeBlackout,
  editRoom,
} = createDraftStore({
  DAY_LABELS,
  DAY_TOKENS,
  emit,
  effectiveRoom,
  fromWireRoom,
  load,
  openHoursFor,
  overlaps,
  roomKey,
  timeOk,
});

export const {
  upsertPlacedVenue,
  adoptVenueSlug,
  adoptRoomSlug,
  setHomePin,
  setHostVenue,
} = createHostState({ emit, load });

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

/**
 * The requests other people have sent to the venues this person keeps — the
 * hosting side of one unified inbox. Scoped to venues steeple has confirmed
 * (`remoteId`), and never to a request they sent themselves: that one is
 * already in the inbox as theirs.
 */
export function hostedApplications() {
  const me = currentOrganizerId();
  if (me === ANON) return [];
  const kept = new Set(load().placedVenues.filter((v) => v.remoteId).map((v) => v.id));
  return load()
    .applications.filter((a) => kept.has(a.venueId) && a.organizerId !== me)
    .sort(byNewest);
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

export function getBooking(bookingId) {
  return load().bookings.find((b) => b.id === bookingId) ?? null;
}

/**
 * The bookings held at one venue, soonest first.
 *
 * The desk's Bookings tab is this list; each row's occurrences and payment
 * detail come from that booking's own detail read, never from the page that
 * named it (docs/contracts/payments.md — a list read is authoritative for which
 * bookings exist and for nothing inside one).
 */
export function venueBookings(venueId) {
  return load()
    .bookings.filter((b) => b.venueId === venueId)
    .sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
}

/** The bookings this browser holds for the signed-in guest, soonest first. */
export function guestBookings() {
  const me = currentOrganizerId();
  return load()
    .bookings.filter((b) => b.organizerId === me)
    .sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
}

/** Live occurrences a room is committed to, used by schedule conflict checks. */
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
  const edits = roomEdits(venueId, roomId);
  return edits ? { ...base, ...edits } : base;
}

/**
 * Just the edits — what this browser is holding about a space that steeple has
 * not been told about yet. They are an overlay, and the product surface lays
 * them over the catalog's answer rather than over the village's scenery
 * (ui/copy.js `liveRoom`): a space steeple knows and the scenery does not is the
 * ordinary case now.
 */
export function roomEdits(venueId, roomId) {
  return load().roomEdits[roomKey(venueId, roomId)] ?? null;
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
/**
 * What stands between a schedule and this room: clashes with live occurrences
 * (the only hard stop, as in the exclusion constraint), open-hours misses and
 * blackout skips (advisory — the desk shows them, the host decides).
 *
 * `exceptBookingId` leaves one booking's own occurrences out of the reckoning:
 * an approved request laid against the week it was approved into would otherwise
 * collide with itself, and report the group as their own rival.
 */
export function scheduleConflicts(venueId, roomId, schedule, { exceptBookingId = null } = {}) {
  const windows = openHoursFor(venueId, roomId);
  const blackouts = blackoutsFor(venueId, roomId);
  const outsideHours = scheduleDays(schedule).filter(
    (d) => !hoursFit(windows, d, schedule.startTime, schedule.endTime)
  );
  const blocked = new Set(blackouts.map((b) => b.date));
  const skipped = materializeDates(schedule, []).filter((d) => blocked.has(d));

  const live = roomOccurrences(venueId, roomId).filter(
    (o) => !exceptBookingId || o.bookingId !== exceptBookingId
  );
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

// The wire's activity token reads as a label through the shared vocabulary
// (imported above) — the map this file used to build from ACTIVITY_TYPES.

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
 * Wire fact this reads by: a list read hardcodes both `messages: []` and
 * `counterOffer: null` (`ApplicationMappings.ToDto`, `includeThread: false` —
 * "lists omit it, matching the thread/conflicts"), and `Messages` is
 * non-nullable, so `[]` is sent rather than omitted. Two consequences:
 *
 * - Anything the payload *carries* proves a detail read, so it is always held.
 * - Emptiness proves nothing — a list read and a detail read of a request
 *   nobody has written on are byte-identical. Only the caller knows, which is
 *   what `thread` is for, and it is therefore the only thing that may *clear*.
 *
 * The old gate read `messages.length > 0` as the mode for both blocks, so a
 * detail read carrying a live counter and no messages was taken for a list read
 * and the counter was dropped on the floor. The two blocks answer to their own
 * evidence now.
 *
 * @param {any} dto steeple's ApplicationDto; the wire seam validates its shape
 * @param {{thread?: boolean}} options `thread` when the dto is a detail read
 * @returns {object} the mirrored application
 */
export function mirrorApplication(dto, { thread = false } = {}) {
  load();
  const application = fromWireApplication(dto);
  // What changed, for the surfaces that animate a change rather than draw a
  // state — the village posts a letter and seals a door (flows/world/index.js).
  const before = data.applications.find((a) => a.id === application.id) ?? null;
  const filed = !before;
  const settled = before?.status !== APP_STATUS.approved && application.status === APP_STATUS.approved;
  upsertBy(data.applications, application);

  // A message present proves a detail read; only a declared one may empty it.
  if (thread || dto?.messages?.length > 0) {
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

  // And a counter present proves the same, on its own evidence — reading it off
  // the thread's switch is what lost one behind a background inbox refresh.
  if (thread || dto?.counterOffer) {
    data.counterOffers = data.counterOffers.filter((c) => c.applicationId !== application.id);
    if (dto.counterOffer) data.counterOffers.push(fromWireCounter(dto.counterOffer, application.id));
  }

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
  // A page never carries counter-offers (or threads), so it is authoritative for
  // which applications exist and for nothing inside one. Counters belong to the
  // detail read; the only ones dropped here are those of applications that went.
  const mirrored = dtos.map((dto) => {
    const application = fromWireApplication(dto);
    upsertBy(data.applications, application);
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
    // Every name a booking is printed under travels with the booking. A desk
    // must be able to say which room and whose it is before it has read the
    // venue back — and a room a host listed is in no bundled scenery at all.
    roomName: dto.roomName ?? null,
    venueName: dto.venueName ?? null,
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
    // How each side said it went, exactly as steeple scoped it for this viewer:
    // `{byOrganizer?, byVenue?, canRate, rateByUtc?}`, where the names say who
    // WROTE it. `canRate` and whether the other side's rating is present at all
    // are computed at read time for the caller — so this is copied and never
    // reasoned about here, and a row that never carried the block (a booking
    // mirrored before this existed) stays null and renders as silence.
    //
    // Unlike `occurrences`, list and detail reads carry the identical block, so
    // there is no thin-over-thick hazard in mirroring it from a page.
    ratings: dto.ratings ?? null,
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
 * slug and carries steeple's id alongside as `remoteId`. The filter below drops
 * a second record of one venue kept under a guessed slug — two records of one
 * venue is how a desk ends up showing an empty copy of itself. It is a backstop
 * rather than the fix: the listing flow adopts the server's slug the moment a
 * create answers (`adoptVenueSlug`), so by the time this runs there is one
 * record and nothing to drop.
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

// The fixture is isolated from the mirror so production memory state has no
// dependency on demo correspondence beyond this one explicit construction.
function seed() {
  return createStoreSeed({
    demo: DEMO,
    venues: VENUES,
    today: todayIso(),
    roomKey,
    materializeDates,
  });
}


// Convenient single handle for the debug API and for consumers that prefer a
// namespace over named imports.
export const store = {
  currentOrganizerId,
  guestApplications,
  hostedApplications,
  venueApplications,
  getApplication,
  threadFor,
  countersFor,
  openCounterFor,
  bookingFor,
  getBooking,
  venueBookings,
  guestBookings,
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
  mirrorRoomAvailability,
  addBlackout,
  removeBlackout,
  editRoom,
  upsertPlacedVenue,
  adoptVenueSlug,
  adoptRoomSlug,
  setHomePin,
  setHostVenue,
  resetDemo,
};
