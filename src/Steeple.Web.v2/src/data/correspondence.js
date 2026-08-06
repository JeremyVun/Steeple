// THE CORRESPONDENCE — everything that happens to a request after it is written.
//
// The inbox, the opened letter, the host's desk and all four of a host's
// decisions come through here. Each function is the same three beats: call the
// wire, hand steeple's own answer to the store's mirror, and give the caller a
// verdict it can say something calm about. Nothing is decided locally and
// nothing is written locally that the service did not answer with — a status
// this browser flipped on its own would be a claim about the world it has no
// standing to make (v2_migration D4/D5).
//
// The failure vocabulary is the whole point of this seam:
//   'refused'  — steeple answered no, and its own sentence is what to print;
//   'offline'  — nothing answered at all, so nothing happened, and the surface
//                says so rather than pretending;
//   'signedOut'— the session died under the person; the way back is signing in;
//   'unavailable' — the route is not there (a flag off server-side, CONTRACTS
//                §5 counter-offers): a feature that is absent, not an error.
//
// A verdict is never `ok` on a guess. `ok` means steeple answered.

import * as api from './api.js';
import * as session from './session.js';
import {
  maskToDays,
  mirrorApplication,
  mirrorApplications,
  mirrorBooking,
  forgetApplication,
} from './store.js';

const DAY_TOKENS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** A product schedule as steeple's ScheduleDto. */
export function toWireSchedule(schedule) {
  const weekly = schedule.frequency === 'weekly';
  return {
    frequency: weekly ? 'recurringWeekly' : 'oneOff',
    startDate: schedule.startDate,
    // A one-off carries a single date; the service echoes it back on both.
    endDate: weekly ? schedule.endDate : null,
    daysOfWeek: weekly ? maskToDays(schedule.daysOfWeekMask ?? 0).map((day) => DAY_TOKENS[day]) : null,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
  };
}

/**
 * What to tell somebody when the service refuses. steeple's problem documents
 * already read like sentences a person wrote, so they are shown as they came
 * (CONTRACTS §2: `code` is the contract, `detail` is for people). Only the
 * codes with no useful prose, and the failures that never reached the service
 * at all, get words of our own.
 */
/**
 * Whether a failure means the request never reached steeple at all.
 *
 * Not just a dead fetch: this app is always served from behind a proxy (vite in
 * development, nginx in a container), and a proxy with nothing to talk to
 * answers **502** — the page never sees a network error. Treating only
 * `status === 0` as unreachable meant that the one case a person actually meets,
 * an API being restarted, got the vaguest sentence of the set and no promise
 * that nothing had been sent.
 *
 * 504 is deliberately not here. A gateway *timeout* is the case where the
 * request may well have landed, so it must not be promised away; the
 * idempotency key is what makes retrying it safe.
 */
export const neverArrived = (status) => status === 0 || status === 502 || status === 503;

export function problemText(error) {
  if (neverArrived(error?.status)) {
    return 'Steeple could not be reached just now — nothing was sent. Try again in a moment.';
  }
  if (error?.code === 'slot_taken') {
    return 'That time was taken while this was open. Nothing was booked — choose another.';
  }
  if (error?.detail) return error.detail;
  if (error?.status === 401) return 'That sign-in is no longer good. Confirm who you are again.';
  if (error?.status === 403) return 'Steeple could not confirm this browser. Reload the page and try again.';
  if (error?.status === 404) return 'That is no longer here.';
  if (error?.status === 409) return 'That is no longer possible — the request has moved on.';
  if (error?.status === 429) return 'That is a few in quick succession. Try again in a minute.';
  return 'Steeple could not do that just now. Try again in a moment.';
}

/**
 * One bearer-carrying call, with its failure sorted into the vocabulary above.
 *
 * @template T
 * @param {(accessToken:string) => Promise<T>} work
 * @returns {Promise<{ok:true,value:T}|{ok:false,reach:string,code:string|null,problem:string,status:number}>}
 */
async function attempt(work) {
  try {
    return { ok: true, value: await session.withAccess(work) };
  } catch (error) {
    const status = error?.status ?? 0;
    const reach =
      neverArrived(status) ? 'offline' : status === 401 ? 'signedOut' : status === 404 ? 'unavailable' : 'refused';
    return { ok: false, reach, status, code: error?.code ?? null, problem: problemText(error) };
  }
}

/** The booking an approved application made, held beside it. Best effort. */
async function pullBooking(dto) {
  if (!dto?.bookingId) return null;
  const answer = await attempt((token) => api.getBooking(dto.bookingId, token));
  if (!answer.ok) return null;
  return mirrorBooking(answer.value);
}

/** Mirror one ApplicationDto and, when it names one, the booking behind it. */
async function hold(dto, { thread = false } = {}) {
  const application = mirrorApplication(dto, thread ? { thread: true } : {});
  await pullBooking(dto);
  return application;
}

// ── reads ────────────────────────────────────────────────────────────────────

/**
 * The signed-in person's own inbox, as steeple holds it. Replaces every request
 * this browser thought was theirs — a withdrawal made on another device is gone
 * from here the moment this answers.
 */
export async function refreshMine() {
  const me = session.currentUser()?.id ?? null;
  if (!me) return { ok: false, reach: 'signedOut', problem: 'Sign in to see your requests.' };
  const answer = await attempt((token) => api.getMyApplications(token, { pageSize: 100 }));
  if (!answer.ok) return answer;
  const items = answer.value.items ?? [];
  mirrorApplications(items, { scope: (a) => a.organizerId === me });
  for (const dto of items) await pullBooking(dto);
  return { ok: true, value: items.length };
}

/**
 * The requests waiting at the venues this person manages. `venueSlugs` is the
 * scope the page is authoritative for, so a request decided elsewhere leaves
 * the desk rather than lingering on it.
 */
export async function refreshManaged(venueSlugs = []) {
  const scoped = new Set(venueSlugs);
  const answer = await attempt((token) => api.getManagedApplications(token, { pageSize: 100 }));
  if (!answer.ok) return answer;
  const items = answer.value.items ?? [];
  mirrorApplications(items, { scope: scoped.size ? (a) => scoped.has(a.venueId) : null });
  for (const dto of items) await pullBooking(dto);
  return { ok: true, value: items.length };
}

/** One request in full — the thread included. This is what opens a letter. */
export async function openApplication(applicationId) {
  const answer = await attempt((token) => api.getApplication(applicationId, token));
  if (!answer.ok) {
    // A 404 here is not a missing feature, it is a request that is not ours (or
    // no longer there): stop showing it.
    if (answer.status === 404) forgetApplication(applicationId);
    return answer;
  }
  return { ok: true, value: await hold(answer.value, { thread: true }) };
}

/**
 * The venues this person manages, and the rooms on each. Empty is the honest
 * answer for somebody who keeps no doors — it is what decides whether there is
 * a desk at all (D4).
 *
 * @returns {Promise<{ok:true,value:Array<object>}|{ok:false,reach:string,problem:string}>}
 */
export async function managedVenues() {
  if (!session.isSignedIn()) return { ok: true, value: [] };
  const listed = await attempt((token) => api.getManagedVenues(token));
  if (!listed.ok) return listed;
  const venues = [];
  for (const summary of listed.value ?? []) {
    const detail = await attempt((token) => api.getManagedVenue(summary.id, token));
    venues.push(detail.ok ? detail.value : { ...summary, rooms: [] });
  }
  return { ok: true, value: venues };
}

// ── the guest's three moves ──────────────────────────────────────────────────

export async function sendMessage(applicationId, body) {
  const answer = await attempt((token) =>
    api.postApplicationMessage(applicationId, body, { accessToken: token })
  );
  if (!answer.ok) return answer;
  return { ok: true, value: await hold(answer.value, { thread: true }) };
}

export async function withdraw(applicationId) {
  const answer = await attempt((token) => api.postWithdraw(applicationId, { accessToken: token }));
  if (!answer.ok) return answer;
  return { ok: true, value: await hold(answer.value, { thread: true }) };
}

/**
 * Accept or decline the host's suggested time. Accepting is a booking
 * transaction at steeple: `409 slot_taken` means somebody else took it in the
 * meantime and the request was auto-declined — which the answer already says.
 */
export async function respondToCounter(applicationId, accept) {
  const answer = await attempt((token) =>
    api.postCounterOfferResponse(applicationId, accept ? 'accept' : 'decline', { accessToken: token })
  );
  if (!answer.ok) return answer;
  return { ok: true, value: await hold(answer.value, { thread: true }) };
}

// ── the host's four ──────────────────────────────────────────────────────────

/** Approve or decline. Approving is the booking transaction. */
export async function decide(applicationId, decision, message = null) {
  const answer = await attempt((token) =>
    api.postDecision(applicationId, decision, message, { accessToken: token })
  );
  if (!answer.ok) return answer;
  return { ok: true, value: await hold(answer.value, { thread: true }) };
}

/** Ask a question — the same thread endpoint the guest answers on. */
export const ask = sendMessage;

/**
 * Offer another time. The route lives behind `booking.counter_offers`; with the
 * flag off it is simply not there, which arrives as 'unavailable' rather than as
 * something broken.
 */
export async function counterOffer(applicationId, schedule, message) {
  const answer = await attempt((token) =>
    api.postCounterOffer(
      applicationId,
      { schedule: toWireSchedule(schedule), message: message?.trim() || null },
      { accessToken: token }
    )
  );
  if (!answer.ok) return answer;
  return { ok: true, value: await hold(answer.value, { thread: true }) };
}

// ── bookings: what a yes actually made ───────────────────────────────────────
//
// A list read says **which** bookings exist and nothing about the inside of one:
// the occurrence set is deliberately absent from it (`BookingDto.Occurrences` is
// empty on lists), so every dated, priced, charge-state fact comes from the
// booking's own detail read. Mirroring a list over a detail is exactly the
// mistake the counter-offer eraser was (v2_migration Phase 2, defect 3) —
// `mirrorBooking` will not replace an occurrence set from a page, and nothing
// here should try to make it.

/** One booking in full — every occurrence, with its charge state. */
export async function openBooking(bookingId) {
  const answer = await attempt((token) => api.getBooking(bookingId, token));
  if (!answer.ok) return answer;
  return { ok: true, value: mirrorBooking(answer.value) };
}

/**
 * The bookings standing at the venues this person manages, each read in full.
 *
 * The page names them; the detail read is what the desk prints. `limit` bounds
 * the second read — a desk shows the coming weeks, not a lifetime of them.
 */
export async function refreshManagedBookings({ limit = 25 } = {}) {
  const listed = await attempt((token) => api.getManagedBookings(token, { pageSize: 100 }));
  if (!listed.ok) return listed;
  const items = listed.value.items ?? [];
  for (const dto of items) mirrorBooking(dto);
  for (const dto of items.slice(0, limit)) await openBooking(dto.id);
  return { ok: true, value: items.length };
}

/** The signed-in guest's own bookings, each read in full. */
export async function refreshMyBookings({ limit = 25 } = {}) {
  const listed = await attempt((token) => api.getMyBookings(token, { pageSize: 100 }));
  if (!listed.ok) return listed;
  const items = listed.value.items ?? [];
  for (const dto of items) mirrorBooking(dto);
  for (const dto of items.slice(0, limit)) await openBooking(dto.id);
  return { ok: true, value: items.length };
}

/**
 * End a booking. For a host this is the rescind lever, and it is not symmetric:
 * a host's cancel frees **every** remaining date and refunds every charge
 * already taken, because the notice window binds only guests
 * (docs/contracts/payments.md — the refund table). Steeple decides all of that;
 * this only carries the ask and mirrors the answer.
 */
export async function cancelBooking(bookingId, reason = null) {
  const answer = await attempt((token) =>
    api.cancelBooking(bookingId, { reason: reason?.trim() || null }, { accessToken: token })
  );
  if (!answer.ok) return answer;
  return { ok: true, value: mirrorBooking(answer.value) };
}

// ── how a venue takes bookings, and how it gets paid ─────────────────────────

/** `instant` or `manual`, as steeple holds it. Changing it binds new requests only. */
export async function setBookingMode(venueId, bookingMode) {
  return attempt((token) => api.updateManagedVenue(venueId, { bookingMode }, { accessToken: token }));
}

/** Where this venue stands with payouts. Never a gate in the mock era — a prompt. */
export async function venuePayments(venueId) {
  return attempt((token) => api.getVenuePayments(venueId, token));
}

/**
 * Begin payout onboarding. The `url` that comes back is **not navigable** under
 * the mock gateway; the client shows its own screen and finishes below. At
 * Stripe-time that url is the hosted account link and is followed as it stands.
 */
export async function startPayouts(venueId) {
  return attempt((token) => api.startVenuePayoutOnboarding(venueId, { accessToken: token }));
}

/** Finish the mock's stand-in for hosted KYC. Retires with the mock gateway. */
export async function finishMockPayouts(venueId) {
  return attempt((token) => api.completeMockVenuePayoutOnboarding(venueId, { accessToken: token }));
}

// ── what steeple wrote to you while you were away ────────────────────────────

/** The notification inbox, newest first. Read quietly; never polled. */
export async function notifications({ pageSize = 24 } = {}) {
  if (!session.isSignedIn()) return { ok: false, reach: 'signedOut', problem: 'Sign in to see this.' };
  return attempt((token) => api.getMyNotifications(token, { pageSize }));
}

/** Mark rows read. Best effort — a slip that showed was still delivered. */
export async function markNotificationsRead(ids) {
  if (!ids?.length) return { ok: true, value: null };
  return attempt((token) => api.markNotificationsRead(ids, { accessToken: token }));
}

// ── the method on file a request cannot be sent without ──────────────────────

/** Whether steeple holds a card for this person (docs/contracts/payments.md). */
export async function paymentState() {
  const answer = await attempt((token) => api.getMyPayments(token));
  if (!answer.ok) return answer;
  return { ok: true, value: answer.value };
}

/** Open a setup intent. Under the mock gateway `mock: true` comes back with it. */
export async function startCardSetup() {
  return attempt((token) => api.createPaymentSetup({ accessToken: token }));
}

/**
 * Record the card's display data — brand and last four digits, and nothing
 * else. There is deliberately no field a card number could travel in, here or
 * at steeple (docs/contracts/payments.md).
 */
export async function saveMockCard({ clientSecret, brand, last4 }) {
  return attempt((token) =>
    api.confirmMockPaymentSetup({ clientSecret, brand, last4 }, { accessToken: token })
  );
}
