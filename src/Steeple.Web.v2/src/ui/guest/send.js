// SENDING THE REQUEST — the one place the sheet's state becomes steeple's.
//
// The composer knows about a draft: labels the product prints, a weekday
// bitmask, 'weekly'. The service knows about SubmitApplicationRequest: wire
// tokens, weekday names, 'recurringWeekly'. That translation happens here and
// nowhere else, next to the send that needs it — the same discipline catalog.js
// keeps for everything the funnel reads.
//
// There is exactly one way this ends well: steeple filed the request. The
// browser used to file it locally when the API was unreachable while the page
// still said "your request is on its way" — honest in a demo, a lie in
// production, and gone (v2_migration D5). A service that cannot be reached
// leaves a draft, says so, and the draft is still there to send.
//
// Two answers are not failures and are not ordinary successes either:
//   · 402 payment_method_required — steeple needs a card on file before any
//     request can be sent (docs/contracts/payments.md). The sheet asks for one
//     and sends again; nothing about the draft is lost.
//   · 201 with status 'approved' — the venue books instantly, so the request
//     *was* the booking. That is rendered as what it is, not as a request
//     waiting for an answer.

import * as api from '../../data/api.js';
import { neverArrived, problemText, timedOut, toWireSchedule } from '../../data/correspondence.js';
import * as session from '../../data/session.js';
import { mirrorApplication, mirrorBooking } from '../../data/store.js';

const ACTIVITY_TOKENS = {
  Children: 'children',
  Sports: 'sports',
  Community: 'community',
  Religious: 'religious',
  Arts: 'arts',
  Education: 'education',
  Music: 'music',
};

/** The draft as SubmitApplicationRequest — steeple's names, steeple's tokens. */
export function toSubmitRequest(draft, { organizationName = null } = {}) {
  return {
    activityType: ACTIVITY_TOKENS[draft.activityType] ?? String(draft.activityType ?? '').toLowerCase(),
    groupSize: Number(draft.groupSize),
    schedule: toWireSchedule(draft),
    intentText: String(draft.intentText ?? '').trim(),
    turnstileToken: null,
    organizationName,
  };
}

export { problemText };

/**
 * Send one request.
 *
 * `draft.idempotencyKey` is held across every retry and deleted only once
 * steeple has answered. A send that timed out may well have been filed; the key
 * is what makes trying again return that same request instead of filing a
 * second one, so losing it on a timeout was the one thing this must not do.
 *
 * @returns {Promise<
 *   {ok:true, application:object, instant:boolean} |
 *   {ok:false, problem:string, signedOut?:boolean, needsCard?:boolean, offline?:boolean, slow?:boolean, retake?:boolean}
 * >}
 */
export async function sendRequest(draft) {
  draft.idempotencyKey ??= newKey();

  let roomId = draft.remoteRoomId ?? null;
  try {
    if (!roomId) {
      const listing = await api.getListingBySlug(draft.venueId, draft.roomId);
      roomId = listing?.roomId ?? null;
      if (roomId) draft.remoteRoomId = roomId;
    }
  } catch (error) {
    return {
      ok: false,
      problem: problemText(error),
      offline: !timedOut(error) && neverArrived(error?.status),
      slow: timedOut(error),
    };
  }
  if (!roomId) {
    return {
      ok: false,
      problem: 'Steeple is not taking requests for this space at the moment.',
    };
  }

  try {
    const dto = await session.withAccess((accessToken) =>
      api.submitApplication(roomId, toSubmitRequest(draft), {
        accessToken,
        idempotencyKey: draft.idempotencyKey,
      })
    );

    const application = mirrorApplication(dto);
    if (dto.bookingId) {
      // Instant book: the submit was the booking transaction, so the dates are
      // already held and the letter should say so on the first render.
      await session
        .withAccess((token) => api.getBooking(dto.bookingId, token))
        .then((booking) => mirrorBooking(booking))
        .catch(() => null);
    }
    delete draft.idempotencyKey;
    return { ok: true, application, instant: dto.status === 'approved' };
  } catch (error) {
    // The key survives everything below on purpose — every one of these is a
    // state where the request may or may not exist at steeple.
    if (error?.status === 402 || error?.code === 'payment_method_required') {
      return { ok: false, needsCard: true, problem: problemText(error) };
    }
    if (error?.code === 'slot_taken') {
      // Nothing persisted: the slot went to another group between the sheet
      // opening and the send. There is no request to open, only another time to
      // pick.
      return {
        ok: false,
        retake: true,
        problem: 'That time was just taken by another group. Nothing was sent — choose another time.',
      };
    }
    return {
      ok: false,
      problem: problemText(error),
      signedOut: error?.status === 401,
      // A send this browser stopped waiting for is not a send that never
      // happened: it keeps its key and says so, rather than promising the guest
      // that nothing left (D8).
      offline: !timedOut(error) && neverArrived(error?.status),
      slow: timedOut(error),
    };
  }
}

const newKey = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
