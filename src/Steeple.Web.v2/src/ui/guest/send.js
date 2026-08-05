// SENDING THE REQUEST — the one place the sheet's state becomes steeple's.
//
// The composer knows about a draft: labels the product prints, a weekday
// bitmask, 'weekly'. The service knows about SubmitApplicationRequest: wire
// tokens, weekday names, 'recurringWeekly'. That translation happens here and
// nowhere else, next to the send that needs it — the same discipline catalog.js
// keeps for everything the funnel reads.
//
// Two ways this can end well:
//   · the API answered — the request is filed there, and the store mirrors what
//     came back so the inbox and the opened letter read from one place;
//   · the API is not there — the store files it alone, exactly as it always
//     has. That is a working state, not a failure, and nothing in the wording
//     the guest sees calls it a demo.
// Anything else is the service saying no, and the guest is told what it said.

import * as api from '../../data/api.js';
import * as session from '../../data/session.js';
import { maskToDays, submitApplication } from '../../data/store.js';
import { organizationFor } from './sso.js';

const ACTIVITY_TOKENS = {
  Children: 'children',
  Sports: 'sports',
  Community: 'community',
  Religious: 'religious',
  Arts: 'arts',
  Education: 'education',
  Music: 'music',
};

const DAY_TOKENS = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
];

/** The draft as SubmitApplicationRequest — steeple's names, steeple's tokens. */
export function toSubmitRequest(draft, { organizationName = null } = {}) {
  const weekly = draft.frequency === 'weekly';
  return {
    activityType: ACTIVITY_TOKENS[draft.activityType] ?? String(draft.activityType ?? '').toLowerCase(),
    groupSize: Number(draft.groupSize),
    schedule: {
      frequency: weekly ? 'recurringWeekly' : 'oneOff',
      startDate: draft.startDate,
      // A one-off carries a single date; the service echoes it back on both.
      endDate: weekly ? draft.endDate : null,
      daysOfWeek: weekly ? maskToDays(draft.daysOfWeekMask ?? 0).map((day) => DAY_TOKENS[day]) : null,
      startTime: draft.startTime,
      endTime: draft.endTime,
    },
    intentText: String(draft.intentText ?? '').trim(),
    turnstileToken: null,
    organizationName,
  };
}

/** Nothing answered at all — as against the service answering "no". */
const unreachable = (error) => error instanceof api.ApiError && error.status === 0;

/**
 * What to tell the guest when the service refuses. steeple's problem documents
 * already read like sentences a person wrote, so they are shown as they came
 * (CONTRACTS §2: `code` is the contract, `detail` is for people). Only the
 * codes with no useful prose get words of our own.
 */
export function problemText(error) {
  if (error?.detail) return error.detail;
  if (error?.status === 401) return 'That sign-in is no longer good. Confirm who you are again.';
  if (error?.status === 403) return 'Steeple could not confirm this browser. Reload the page and try again.';
  if (error?.status === 404) return 'This space is not taking requests at the moment.';
  if (error?.status === 429) return 'That is a few requests in quick succession. Try again in a minute.';
  return 'This request could not be sent just now. Try again in a moment.';
}

/**
 * Send one request.
 *
 * @returns {Promise<
 *   {ok:true, application:object, live:boolean} |
 *   {ok:false, problem:string, signedOut?:boolean}
 * >}
 */
export async function sendRequest(draft) {
  // Held across retries: if an answer is lost on the way back, the replay
  // returns the application that was already filed rather than filing a second.
  draft.idempotencyKey ??= newKey();

  try {
    const listing = await api.getListingBySlug(draft.venueId, draft.roomId);
    // A room this service has never heard of is the bundled-seed case, not a
    // refusal: file it here and say nothing about it.
    if (!listing?.roomId) return locally(draft);

    const dto = await session.withAccess((accessToken) =>
      api.submitApplication(
        listing.roomId,
        toSubmitRequest(draft, {
          organizationName: organizationFor(session.currentUser()?.email),
        }),
        { accessToken, idempotencyKey: draft.idempotencyKey }
      )
    );

    const filed = submitApplication(draft, dto);
    delete draft.idempotencyKey;
    return { ok: true, application: filed.application, live: true };
  } catch (error) {
    if (unreachable(error)) return locally(draft);
    return {
      ok: false,
      problem: problemText(error),
      signedOut: error?.status === 401,
    };
  }
}

function locally(draft) {
  const filed = submitApplication(draft);
  if (!filed.ok) return { ok: false, problem: Object.values(filed.errors)[0] };
  delete draft.idempotencyKey;
  return { ok: true, application: filed.application, live: false };
}

const newKey = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
