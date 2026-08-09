// THE HOSTING WIRE — the listing flow's half of steeple's Manage API.
//
// The flow collects what a host means; this file says it in steeple's words and
// carries it to /api/v1/manage. Nothing here decides what the host sees: every
// call answers with either the service's own document or the service's own
// refusal, and the flow renders that answer (CONTRACT6 §1.3).
//
// The order is not a preference, it is the API's:
//   venue  → the caller becomes its first manager, and the address is geocoded
//            server-side (SaveVenueRequest), which is why there is no pin;
//   room   → always created in draft, price must be greater than zero;
//   photo  → publishing is refused outright while a room has none;
//   hours  → publishing is refused without them where the flag is on, which it
//            is in the local loop;
//   publish→ on a room moderation has never approved this records a publish
//            request and answers 200 with the room still in draft.
//
// Three kinds of answer, and the difference matters to the words the host reads:
// the service said yes, the service said no (its `code` and its sentence), or
// nothing answered at all — which is not a refusal and must never be dressed as
// one. The last is when the flow keeps the listing locally instead.

import * as api from '../../data/api.js';
import { neverArrived } from '../../data/correspondence.js';
import * as session from '../../data/session.js';
import {
  ACCESS_LABELS,
  ACTIVITY_LABELS,
  AMENITY_LABELS,
  toTokens,
} from '../../data/vocabulary.js';

const DAY_TOKENS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// The writing half of the shared vocabulary (data/vocabulary.js): the labels
// this product prints as the tokens steeple stores.
export const activityTokens = (labels) => toTokens(labels, ACTIVITY_LABELS);
export const amenityTokens = (labels) => toTokens(labels, AMENITY_LABELS);
export const accessTokens = (labels) => toTokens(labels, ACCESS_LABELS);

/** The painter's windows as the availability contract wants them, Sunday first. */
export function availabilityBody(windows, blackouts, today) {
  const days = DAY_TOKENS.map((dayOfWeek, day) => ({
    dayOfWeek,
    windows: windows
      .filter((w) => w.day === day)
      .sort((a, b) => (a.start < b.start ? -1 : 1))
      .map((w) => ({ startTime: w.start, endTime: w.end })),
  })).filter((entry) => entry.windows.length > 0);

  return {
    days,
    // The service keeps only what is still ahead; a date already past would be
    // refused for the whole payload, so it is left behind here.
    blackouts: (blackouts ?? [])
      .filter((b) => !today || b.date >= today)
      .slice(0, 200)
      .map((b) => ({ date: b.date, reason: b.reason ?? null })),
  };
}

/**
 * A refusal steeple could not even put a sentence to.
 *
 * Its own validation answers with `detail` — "Capacity must be between 1 and
 * 10,000." — and that is what the host reads. A value the request could not be
 * parsed into at all (a fraction where a count belongs, a number past what a
 * decimal holds) never reaches that validation: the answer carries only the
 * field that stopped it. Naming that field is the difference between a host
 * who knows where to look and one who reads "could not accept that".
 */
const FIELD_WORDS = {
  capacity: 'the capacity',
  pricePerHour: 'the price',
  name: 'the name',
  description: 'the description',
  houseRules: 'the house rules',
};

function refusal(error) {
  if (error.detail) return error.detail;
  const offending = Object.keys(error.problem?.errors ?? {})
    .map((key) => key.replace(/^\$\./, ''))
    .find((key) => FIELD_WORDS[key]);
  return offending ? `Steeple could not read ${FIELD_WORDS[offending]}.` : 'Steeple could not accept that.';
}

/**
 * One call to the API, with the token this browser holds.
 *
 * `slow` is not `offline`, and the difference is the whole reason writes carry
 * an idempotency key: a request this browser stopped waiting for may be
 * finishing at steeple right now, so it must never be answered with "kept here
 * instead" the way a dead service is (v2_migration D8). The way out of a slow
 * write is to send it again — the key is what makes that free.
 *
 * @returns {Promise<{ok:true,value:object}|{ok:false,reach:'signin'|'offline'|'slow'|'refused',code?:string,detail:string}>}
 */
async function attempt(work) {
  try {
    return { ok: true, value: await session.withAccess(work) };
  } catch (error) {
    if (error?.status === 401) {
      return { ok: false, reach: 'signin', detail: 'Sign in to list a space.' };
    }
    if (error?.timedOut) {
      return {
        ok: false,
        reach: 'slow',
        detail:
          'Steeple is taking a while to answer. Try again — anything that did go through will not be made twice.',
      };
    }
    // The same reading correspondence.js uses: this app always sits behind a proxy (vite in
    // development, nginx in a container), so a dead API answers 502/503 — a page that treats
    // only a status-less fetch as "away" dresses the one outage people actually meet as a
    // refusal, and the flow's kept-here fallback never fires.
    if (neverArrived(error?.status ?? 0)) {
      return { ok: false, reach: 'offline', detail: 'Steeple could not be reached.' };
    }
    return {
      ok: false,
      reach: 'refused',
      code: error.code ?? null,
      detail: refusal(error),
    };
  }
}

/**
 * A key that survives a retry of the same logical create — same idiom as
 * `send.js`'s `draft.idempotencyKey`: held across every retry, deleted only
 * once steeple has answered. A write waits fifteen seconds rather than a read's
 * four (`api.js`), but the abort can still fire after steeple has already
 * committed the row; the wizard's own retry (the host pressing the
 * same step again, or `withAccess`'s own 401-refresh replay) must land on the
 * request that already happened rather than open a second one. Kept on the
 * draft's own `remote` block — the one thing about this draft that already
 * persists — so it outlives the attempt that lost the race with the timeout.
 * An update never carries one: PATCH has no double-create to guard.
 */
const newKey = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;

/**
 * Address suggestions for the Place step. Quiet by design: signed out, superseded by the next
 * keystroke, or a downed provider all answer `[]` — a typeahead never gets to interrupt typing.
 */
export async function suggestAddresses(q, { signal = null } = {}) {
  if (!session.isSignedIn()) return [];
  try {
    return await session.withAccess((token) => api.suggestAddresses(q, token, { signal }));
  } catch {
    return [];
  }
}

/** Create the venue, or update the one this draft already made. */
export function saveVenue(draft) {
  const body = {
    name: draft.venue.name.trim(),
    description: draft.venue.description.trim(),
    addressLine: draft.venue.addressLine.trim(),
    suburb: draft.venue.suburb.trim(),
    postcode: draft.venue.postcode.trim(),
  };
  const id = draft.remote.venueId;
  return attempt(async (token) => {
    if (id) return api.updateManagedVenue(id, body, { accessToken: token });
    draft.remote.venueIdempotencyKey ??= newKey();
    const value = await api.createManagedVenue(body, {
      accessToken: token,
      idempotencyKey: draft.remote.venueIdempotencyKey,
    });
    delete draft.remote.venueIdempotencyKey;
    return value;
  });
}

/** Create the room, or update the one this draft already made. */
export function saveRoom(draft) {
  const room = draft.room;
  const body = {
    name: room.name.trim(),
    description: room.description.trim(),
    capacity: Number(room.capacity),
    pricePerHour: Number(room.pricePerHour),
    houseRules: room.houseRules?.trim() ?? '',
    activities: activityTokens(room.activities),
    amenities: amenityTokens(room.amenities),
    accessibility: accessTokens(room.accessibility),
  };
  const id = draft.remote.roomId;
  return attempt(async (token) => {
    if (id) return api.updateManagedRoom(id, body, { accessToken: token });
    // draft.roomId is always 'main-space' locally (a second room per venue
    // collides in the store), but the idempotency key is keyed to this
    // logical create attempt, not to that id, so it does not assume one room.
    draft.remote.roomIdempotencyKey ??= newKey();
    const value = await api.createManagedRoom(draft.remote.venueId, body, {
      accessToken: token,
      idempotencyKey: draft.remote.roomIdempotencyKey,
    });
    delete draft.remote.roomIdempotencyKey;
    return value;
  });
}

/**
 * The full room as steeple holds it — description, rules and the three
 * vocabularies included, which the venue-detail summary omits. The listing flow
 * reads this before it lets an edit PATCH an existing room: a form seeded from
 * the summary's blanks would otherwise send those blanks back as the truth.
 */
export function readRoom(roomId) {
  return attempt((token) => api.getManagedRoom(roomId, token));
}

/** The saved availability needed to resume a half-written listing after reauthentication. */
export function readHours(roomId) {
  return attempt((token) => api.getRoomAvailabilityRules(roomId, token));
}

/** Send the photograph the room cannot be published without. */
export function savePhoto(draft) {
  const file = draft.room.photo?.file;
  if (!file) return Promise.resolve({ ok: true, value: null });
  return attempt((token) =>
    api.uploadRoomPhoto(draft.remote.roomId, file, { accessToken: token })
  );
}

/** Replace the room's whole rule set: the saved state is exactly this payload. */
export function saveHours(draft, windows, blackouts, today) {
  return attempt((token) =>
    api.saveRoomAvailabilityRules(draft.remote.roomId, availabilityBody(windows, blackouts, today), {
      accessToken: token,
    })
  );
}

/** Ask for the room to go live. What comes back is the answer, not the ask. */
export function askToPublish(draft) {
  return attempt((token) =>
    api.updateManagedRoom(draft.remote.roomId, { status: 'published' }, { accessToken: token })
  );
}

/**
 * What a ManagedRoomDto means for the host, in one word:
 *   published — it is on the map and open to requests;
 *   review    — the publish request is recorded and a moderator has it;
 *   draft     — nothing has been asked for yet.
 */
export function publishState(room) {
  if (room?.status === 'published') return 'published';
  if (room?.publishRequestedAtUtc || room?.publishRequestedAt) return 'review';
  return 'draft';
}

/** Whether this browser has a session at all — the flow's own sign-in gate. */
export const signedIn = () => session.isSignedIn();
export const whoAmI = () => session.currentUser();

/**
 * Told when the session appears or goes. The sign-in panel belongs to the guest
 * surface and answers to itself; a flow gated on being signed in has to hear
 * about it too, or its own buttons go stale the moment someone signs in.
 */
export const onSession = (watch) => session.onSessionChange(watch);

/**
 * Is steeple answering at all? Asked without a token and against the cheapest
 * public read there is, because the question is put on behalf of someone who
 * has not signed in yet — and a host who cannot sign in deserves to be told
 * that the service is away rather than that they got their address wrong.
 */
export async function reachable() {
  try {
    await api.getGeofence();
    return true;
  } catch {
    return false;
  }
}
