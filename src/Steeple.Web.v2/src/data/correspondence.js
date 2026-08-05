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
  DAY_LABELS,
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
export function problemText(error) {
  if (error?.status === 0) {
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
      status === 0 ? 'offline' : status === 401 ? 'signedOut' : status === 404 ? 'unavailable' : 'refused';
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

/** Weekday names for a counter-offer's spoken form — one vocabulary, one place. */
export const dayNamesOf = (mask) => maskToDays(mask ?? 0).map((day) => DAY_LABELS[day]);
