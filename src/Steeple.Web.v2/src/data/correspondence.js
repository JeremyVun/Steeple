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
//   'slow'     — this browser gave up waiting, which is not the same fact: the
//                write may have landed, so nothing may promise that it did not;
//   'signedOut'— the session died under the person; the way back is signing in;
//   'unavailable' — the route is not there (a flag off server-side, CONTRACTS
//                §5 counter-offers): a feature that is absent, not an error.
//
// A verdict is never `ok` on a guess. `ok` means steeple answered.

import * as api from './api.js';
import { track } from './analytics.js';
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

/**
 * Whether this browser stopped waiting rather than failing to reach steeple.
 *
 * A timeout wears `status: 0` like a dead connection does, and reads exactly the
 * same to {@link neverArrived} — but it is the opposite fact. The request may
 * have landed and may be finishing right now, so the one thing that must never
 * be said about it is "nothing was sent" (v2_migration D8). It has to be tested
 * before `neverArrived`, and it is why writes carry an idempotency key.
 */
export const timedOut = (error) => error?.timedOut === true;

export function problemText(error) {
  if (timedOut(error)) {
    return 'Steeple is taking longer than usual to answer. This may still have gone through — give it a moment before trying again.';
  }
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
    const reach = timedOut(error)
      ? 'slow'
      : neverArrived(status)
        ? 'offline'
        : status === 401
          ? 'signedOut'
          : status === 404
            ? 'unavailable'
            : 'refused';
    return { ok: false, reach, status, code: error?.code ?? null, problem: problemText(error) };
  }
}

// ── reading many things at once, and reading each of them once ───────────────

/**
 * Run `work` over every item with at most `AT_ONCE` of them in flight, and
 * answer in the items' own order.
 *
 * Opening a desk is dozens of reads that do not depend on one another — a venue
 * detail per venue, a booking detail per approval. One at a time made that a
 * visible wait for nothing (fifty round trips end to end); all at once is a
 * burst the browser queues at six connections anyway and steeple sees as a
 * stampede. A handful in flight is the whole of the difference.
 */
const AT_ONCE = 5;

async function together(items, work) {
  const answers = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(AT_ONCE, items.length) }, async () => {
    for (let at = next++; at < items.length; at = next++) answers[at] = await work(items[at], at);
  });
  await Promise.all(runners);
  return answers;
}

/**
 * A **pass**: the window in which the several reads that open a surface count as
 * one act.
 *
 * The applications page names the bookings its approvals made, and the bookings
 * page names those same bookings — so a desk that reads both fetches every
 * booking's detail twice. A pass holds, for its own lifetime only, the read
 * already under way for each booking id, so the second asker gets the first
 * asker's answer.
 *
 * It opens with the first refresh and closes a *timer tick* after the last one
 * settles, which is exactly what makes `await refreshManaged(); await
 * refreshManagedBookings();` one pass: a resumed `await` is a microtask, and
 * every pending microtask drains before any timer runs, so the second refresh
 * always re-opens the pass before it can close. Two refreshes separated by real
 * work — a render, a click, another round trip — do not share one, which is the
 * point: nothing here is a cache, and a mirror that serves yesterday's answer
 * would be lying about a booking somebody has since cancelled.
 */
let pass = null;

function openPass() {
  if (pass) clearTimeout(pass.closing);
  else pass = { reading: new Map(), depth: 0, closing: null };
  pass.depth += 1;
  return pass;
}

function closePass(open) {
  open.depth -= 1;
  if (open.depth > 0 || pass !== open) return;
  open.closing = setTimeout(() => {
    if (pass === open) pass = null;
  }, 0);
}

/**
 * One booking read in full and mirrored — at most once per pass.
 *
 * The mirroring lives inside the shared promise on purpose: two callers of the
 * same read must produce one mirror write, not two identical ones racing.
 * `open` is null for the reads that are somebody's deliberate act (opening a
 * booking, or the booking behind a decision just made), which must always be
 * fresh.
 */
function readBooking(open, bookingId) {
  const held = open?.reading.get(bookingId);
  if (held) return held;
  const reading = attempt((token) => api.getBooking(bookingId, token)).then((answer) =>
    answer.ok ? { ok: true, value: mirrorBooking(answer.value) } : answer
  );
  open?.reading.set(bookingId, reading);
  return reading;
}

/** The booking an approved application made, held beside it. Best effort. */
async function pullBooking(dto, open = null) {
  if (!dto?.bookingId) return null;
  const answer = await readBooking(open, dto.bookingId);
  return answer.ok ? answer.value : null;
}

/** Mirror one ApplicationDto and, when it names one, the booking behind it. */
async function hold(dto, { thread = false } = {}) {
  const application = mirrorApplication(dto, thread ? { thread: true } : {});
  await pullBooking(dto);
  return application;
}

// ── a list read is a *list*, not the first hundred of one ────────────────────

const PAGE_SIZE = 100;
/** No walk is unbounded: a person with more than a thousand open rows is a bug. */
const PAGE_CAP = 10;

/**
 * Read a paged list to its end, and say whether that is really where it ended.
 *
 * Asking for one page of 100 and treating the answer as the whole list is the
 * quiet kind of wrong: `mirrorApplications({scope})` deletes every held row the
 * page did not carry, so the hundred-and-first request would simply vanish from
 * somebody's inbox. So the walk goes on to the end — page one first, because it
 * is page one that says how many there are, then the rest of them together.
 *
 * `whole` is false when the cap stopped the walk short or a later page never
 * arrived. It is the caller's cue to *upsert only*: an incomplete list has no
 * standing to say what does not exist, and a tidy mirror is worth nothing next
 * to an honest one.
 *
 * @param {(accessToken:string, params:{page:number,pageSize:number}) => Promise<{items:object[],totalCount:number}>} read
 * @returns {Promise<{ok:true,items:object[],whole:boolean}|{ok:false,reach:string,problem:string,status:number}>}
 */
async function readAllPages(read) {
  const first = await attempt((token) => read(token, { page: 1, pageSize: PAGE_SIZE }));
  if (!first.ok) return first;

  const items = [...(first.value?.items ?? [])];
  const total = Number(first.value?.totalCount);
  // A page shorter than the one asked for is the end of the list, whatever a
  // count claims; a count that is not a number leaves page one as all there is.
  const pages = items.length < PAGE_SIZE || !Number.isFinite(total) ? 1 : Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return { ok: true, items, whole: true };

  const rest = [];
  for (let page = 2; page <= Math.min(pages, PAGE_CAP); page += 1) rest.push(page);
  let whole = pages <= PAGE_CAP;
  const answers = await together(rest, (page) =>
    attempt((token) => read(token, { page, pageSize: PAGE_SIZE }))
  );
  for (const answer of answers) {
    if (answer.ok) items.push(...(answer.value?.items ?? []));
    // A page that never arrived is a page whose rows are unaccounted for.
    else whole = false;
  }
  return { ok: true, items, whole };
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
  const open = openPass();
  try {
    const read = await readAllPages((token, params) => api.getMyApplications(token, params));
    if (!read.ok) return read;
    // Authoritative only when the whole list arrived. A truncated walk upserts
    // and deletes nothing — the alternative is erasing rows that exist.
    mirrorApplications(read.items, { scope: read.whole ? (a) => a.organizerId === me : null });
    // Every list row is mirrored before the first detail read is even asked
    // for, so no page can land on top of a detail answer within this pass.
    await together(read.items, (dto) => pullBooking(dto, open));
    return { ok: true, value: read.items.length };
  } finally {
    closePass(open);
  }
}

/**
 * The requests waiting at the venues this person manages. `venueSlugs` is the
 * scope the page is authoritative for, so a request decided elsewhere leaves
 * the desk rather than lingering on it.
 */
export async function refreshManaged(venueSlugs = []) {
  const scoped = new Set(venueSlugs);
  const open = openPass();
  try {
    const read = await readAllPages((token, params) => api.getManagedApplications(token, params));
    if (!read.ok) return read;
    mirrorApplications(read.items, {
      scope: scoped.size && read.whole ? (a) => scoped.has(a.venueId) : null,
    });
    await together(read.items, (dto) => pullBooking(dto, open));
    return { ok: true, value: read.items.length };
  } finally {
    closePass(open);
  }
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
  const summaries = listed.value ?? [];
  const details = await together(summaries, (summary) =>
    attempt((token) => api.getManagedVenue(summary.id, token))
  );
  // A venue whose detail did not come back is still a venue this person keeps —
  // it is shown with no rooms rather than dropped out from under them.
  return {
    ok: true,
    value: summaries.map((summary, at) => (details[at].ok ? details[at].value : { ...summary, rooms: [] })),
  };
}

// ── the guest's three moves ──────────────────────────────────────────────────
//
// Every move either party makes passes through this file, which is why the
// `decision_pressed` event is emitted here rather than at seven buttons: the
// press is what steeple never sees on its own — an approve that was refused, or
// a counter-offer the flag had turned off, writes nothing server-side and would
// otherwise be invisible (`docs/contracts/analytics.md`).

export async function sendMessage(applicationId, body) {
  track('decision_pressed', { decision: 'message', surface: 'letter' });
  const answer = await attempt((token) =>
    api.postApplicationMessage(applicationId, body, { accessToken: token })
  );
  if (!answer.ok) return answer;
  return { ok: true, value: await hold(answer.value, { thread: true }) };
}

export async function withdraw(applicationId) {
  track('decision_pressed', { decision: 'withdraw', surface: 'guestLetter' });
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
  track('decision_pressed', {
    decision: accept ? 'counterAccept' : 'counterDecline',
    surface: 'guestLetter',
  });
  const answer = await attempt((token) =>
    api.postCounterOfferResponse(applicationId, accept ? 'accept' : 'decline', { accessToken: token })
  );
  if (!answer.ok) return answer;
  return { ok: true, value: await hold(answer.value, { thread: true }) };
}

// ── the host's four ──────────────────────────────────────────────────────────

/** Approve or decline. Approving is the booking transaction. */
export async function decide(applicationId, decision, message = null) {
  track('decision_pressed', { decision, surface: 'desk' });
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
  track('decision_pressed', { decision: 'counter', surface: 'desk' });
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

/**
 * One booking in full — every occurrence, with its charge state.
 *
 * Deliberately outside any pass: this is somebody opening a booking, and the
 * answer to that is always read fresh.
 */
export async function openBooking(bookingId) {
  return readBooking(null, bookingId);
}

/**
 * Mirror a whole list of bookings, then read each of the first `limit` in full.
 *
 * The order is the guarantee. Every page row is mirrored **synchronously**,
 * before a single detail read is asked for, so within this pass no thinner page
 * version of a booking can land on top of the detail answer for it.
 * (`mirrorBooking` already refuses to replace an occurrence set from a page; a
 * page and a detail otherwise carry the same fields from the same mapper —
 * Api/Extensions/BookingMappings.cs — so a list mirror that crossed with another
 * surface's pass would restate the truth, not overwrite it.)
 *
 * `limit` bounds the detail reads — a desk shows the coming weeks, not a
 * lifetime of them — while the list itself is walked whole, because a page that
 * stops at a hundred is a mirror that stops at a hundred.
 */
async function refreshBookings(read, limit) {
  const open = openPass();
  try {
    const listed = await readAllPages(read);
    if (!listed.ok) return listed;
    for (const dto of listed.items) mirrorBooking(dto);
    await together(listed.items.slice(0, limit), (dto) => readBooking(open, dto.id));
    return { ok: true, value: listed.items.length };
  } finally {
    closePass(open);
  }
}

/** The bookings standing at the venues this person manages, each read in full. */
export function refreshManagedBookings({ limit = 25 } = {}) {
  return refreshBookings((token, params) => api.getManagedBookings(token, params), limit);
}

/** The signed-in guest's own bookings, each read in full. */
export function refreshMyBookings({ limit = 25 } = {}) {
  return refreshBookings((token, params) => api.getMyBookings(token, params), limit);
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
