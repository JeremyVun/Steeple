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
import * as session from '../../data/session.js';

// steeple's token registries (CONTRACTS §2.1) against the labels this product
// has always printed. The catalog keeps the same pairs for the reading half of
// the wire; the writing half needs them in the other direction.
const ACTIVITIES = {
  Children: 'children',
  Sports: 'sports',
  Community: 'community',
  Religious: 'religious',
  Arts: 'arts',
  Education: 'education',
  Music: 'music',
};

const AMENITIES = {
  Parking: 'parking',
  Kitchen: 'kitchen',
  Restrooms: 'restrooms',
  'Wi-Fi': 'wifi',
  'Audio/visual': 'audioVisual',
  Tables: 'tables',
  Chairs: 'chairs',
  Heating: 'heating',
  'Air conditioning': 'airConditioning',
  Stage: 'stage',
  Piano: 'piano',
};

const ACCESSIBILITY = {
  'Step-free access': 'stepFreeAccess',
  'Accessible restroom': 'accessibleRestroom',
  'Accessible parking': 'accessibleParking',
  'Hearing loop': 'hearingLoop',
  'Lift access': 'liftAccess',
};

const DAY_TOKENS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** A label the product prints as the token steeple stores. Unknown stays as-is. */
const tokenize = (values, registry) =>
  [...new Set((values ?? []).map((value) => registry[value] ?? camel(value)))];

const camel = (label) =>
  String(label)
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^./, (c) => c.toLowerCase());

export const activityTokens = (labels) => tokenize(labels, ACTIVITIES);
export const amenityTokens = (labels) => tokenize(labels, AMENITIES);
export const accessTokens = (labels) => tokenize(labels, ACCESSIBILITY);

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
 * @returns {Promise<{ok:true,value:object}|{ok:false,reach:'signin'|'offline'|'refused',code?:string,detail:string}>}
 */
async function attempt(work) {
  try {
    return { ok: true, value: await session.withAccess(work) };
  } catch (error) {
    if (error?.status === 401) {
      return { ok: false, reach: 'signin', detail: 'Sign in to list a space.' };
    }
    if (!error?.status) {
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
  return attempt((token) =>
    id
      ? api.updateManagedVenue(id, body, { accessToken: token })
      : api.createManagedVenue(body, { accessToken: token })
  );
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
  return attempt((token) =>
    id
      ? api.updateManagedRoom(id, body, { accessToken: token })
      : api.createManagedRoom(draft.remote.venueId, body, { accessToken: token })
  );
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
