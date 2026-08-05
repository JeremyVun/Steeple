// THE WIRE — steeple's /api/v1, and nothing else.
//
// Every function here is one request: build the query the way steeple names its
// parameters, wait no longer than a page is willing to, hand back the JSON as
// it arrived. Nothing is renamed, no enum is translated, no shape is invented —
// that work belongs to catalog.js, which is the only module that calls this one.
// Keeping the seam here means the day a name changes upstream, one file moves.
//
// Requests are same-origin: the dev proxy (vite.config.js) forwards /api to the
// API, because the API deliberately serves no CORS headers.
//
// The reading half of the wire is called only by catalog.js, which is where the
// product's vocabulary is decided. The writing half — sessions, and an
// application submitted for a room — is called by data/session.js and by the
// request sheet's own send path: those carry a bearer token and a person, which
// is not the catalog's business. The seam is the same either way: one function,
// one request, steeple's own names.

const BASE = '/api/v1';

// Long enough for a local API to answer, short enough that a dead one does not
// hold the surface waiting: the catalog falls back to the bundled seed instead.
const TIMEOUT_MS = 4000;

/**
 * A request that never arrived, or arrived as a failure.
 *
 * `status` is 0 when nothing answered at all — the one case a caller may treat
 * as "the API is not here" rather than "the API said no". A failure that did
 * arrive carries steeple's RFC 9457 problem document verbatim in `problem`,
 * with its stable `code` lifted out (CONTRACTS §2): the codes are the contract,
 * the prose in `detail` is for people.
 */
export class ApiError extends Error {
  constructor(message, status = 0, problem = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.problem = problem;
    this.code = problem?.code ?? null;
    this.detail = problem?.detail ?? null;
  }
}

/**
 * steeple's query vocabulary: repeatable values repeat the key (activities,
 * amenities, accessibility, daysOfWeek), and anything absent stays absent —
 * an empty string is a filter, not a blank.
 */
function queryString(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value)) {
      for (const one of value) if (one !== null && one !== undefined && one !== '') search.append(key, one);
    } else {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

async function get(path, params, { notFoundAsNull = false, accessToken = null } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${BASE}${path}${queryString(params)}`, {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
    });
  } catch (cause) {
    throw new ApiError(
      cause.name === 'AbortError' ? `${path} timed out after ${TIMEOUT_MS}ms` : `${path} did not answer`
    );
  } finally {
    clearTimeout(timer);
  }
  // A 404 is an answer — an unpublished or unknown listing — not a failure.
  if (response.status === 404 && notFoundAsNull) return null;
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new ApiError(`${path} answered ${response.status}`, response.status, text ? safeJson(text) : null);
  }
  return response.json();
}

/**
 * A write: one JSON body out, one JSON document back. A failure is raised with
 * whatever problem document came with it, so callers can tell "group size must
 * be between 1 and 1000" from "nothing answered".
 */
async function send(method, path, body, { accessToken = null, headers = {}, timeoutMs = TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
      },
      body: JSON.stringify(body ?? {}),
    });
  } catch (cause) {
    throw new ApiError(
      cause.name === 'AbortError' ? `${path} timed out after ${timeoutMs}ms` : `${path} did not answer`
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  const document = text ? safeJson(text) : null;
  if (!response.ok) {
    throw new ApiError(`${path} answered ${response.status}`, response.status, document);
  }
  return document;
}

/**
 * A write whose body is a file: multipart, and the browser sets the boundary,
 * so `content-type` is deliberately not passed. An image takes longer to travel
 * and longer to process than a JSON row, hence its own timeout.
 */
async function upload(path, form, { accessToken = null, timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: form,
    });
  } catch (cause) {
    throw new ApiError(
      cause.name === 'AbortError' ? `${path} timed out after ${timeoutMs}ms` : `${path} did not answer`
    );
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  const document = text ? safeJson(text) : null;
  if (!response.ok) throw new ApiError(`${path} answered ${response.status}`, response.status, document);
  return document;
}

const safeJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/**
 * @typedef {object} WireRoomSummary
 * @property {string} roomId          GUID
 * @property {string} venueId         GUID
 * @property {string} roomSlug
 * @property {string} venueSlug
 * @property {string} roomName
 * @property {string} venueName
 * @property {string} suburb
 * @property {string|null} primaryPhotoUrl
 * @property {number} capacity
 * @property {number} pricePerHour    always present and positive
 * @property {string} currency
 * @property {number} latitude
 * @property {number} longitude
 * @property {string[]} activities    camelCase tokens, CONTRACTS §2.1
 * @property {string[]} amenities
 * @property {string[]} accessibility
 * @property {number|null} [distanceMeters]
 * @property {{averageStars:number,count:number}|null} [rating]
 * @property {{date?:string,startTime:string,endTime:string}|null} [matchedWindow]
 */

/**
 * @typedef {object} WireRoomPhoto
 * @property {string} id
 * @property {string} url             full size; the only URL seeded rows carry
 * @property {string|null} cardUrl
 * @property {string|null} thumbUrl
 * @property {string|null} caption
 * @property {boolean} isPrimary
 * @property {number} sortOrder
 */

/**
 * @typedef {object} WireVenue
 * @property {string} venueId
 * @property {string} name
 * @property {string} slug
 * @property {string} venueType
 * @property {string} addressLine     street only; suburb and postcode are separate
 * @property {string} suburb
 * @property {string} postcode
 * @property {string|null} contactEmail
 * @property {string} parkingInfo
 * @property {string} transitInfo
 * @property {boolean} isIdentityVerified
 * @property {number} latitude
 * @property {number} longitude
 */

/**
 * @typedef {object} WireRoomDetail
 * @property {string} roomId
 * @property {string} roomSlug
 * @property {string} roomName
 * @property {string} description
 * @property {number} capacity
 * @property {number} pricePerHour
 * @property {string} currency
 * @property {string} houseRules
 * @property {string[]} amenities
 * @property {string[]} accessibility
 * @property {string[]} activities
 * @property {WireRoomPhoto[]} photos
 * @property {WireVenue} venue
 * @property {{averageStars:number,count:number}|null} [rating]
 * @property {Array<{dayOfWeek:string,windows:Array<{startTime:string,endTime:string}>}>|null} [openHours]
 */

/**
 * `GET /listings/search`. Filters are steeple's own names; the repeatable ones
 * combine as AND (a room must accept every value asked for).
 *
 * @param {object} params
 * @param {string} [params.suburb]
 * @param {number} [params.minCapacity]
 * @param {string[]} [params.activities]     camelCase tokens
 * @param {string[]} [params.amenities]
 * @param {string[]} [params.accessibility]
 * @param {string} [params.date]             yyyy-MM-dd, one-off search
 * @param {string[]} [params.daysOfWeek]     sunday…saturday, recurring search
 * @param {string} [params.timeOfDay]        morning | afternoon | evening
 * @param {string} [params.startTime]        HH:mm
 * @param {string} [params.endTime]          HH:mm
 * @param {number} [params.durationMinutes]
 * @param {number} [params.page]             1-based
 * @param {number} [params.pageSize]         ≤100
 * @returns {Promise<{items:WireRoomSummary[],totalCount:number,isZeroResult:boolean,page:number,pageSize:number}>}
 */
export function searchListings(params) {
  return get('/listings/search', params);
}

/**
 * `GET /listings/by-slug/{venueSlug}/{roomSlug}` — the listing page's truth.
 * Null when the room is unknown, unpublished, or outside the geofence.
 * @returns {Promise<WireRoomDetail|null>}
 */
export function getListingBySlug(venueSlug, roomSlug) {
  const path = `/listings/by-slug/${encodeURIComponent(venueSlug)}/${encodeURIComponent(roomSlug)}`;
  return get(path, null, { notFoundAsNull: true });
}

/** `GET /suburbs` → `["Vienna", …]`, already sorted. @returns {Promise<string[]>} */
export function getSuburbs() {
  return get('/suburbs');
}

/**
 * `GET /geofence` — the beachhead's name, centre and bounding box.
 * @returns {Promise<{areaName:string,center:{latitude:number,longitude:number},beachhead:object}>}
 */
export function getGeofence() {
  return get('/geofence');
}

/**
 * `GET /sitemap` — every published listing as a slug pair. The cheapest way to
 * ask "which rooms does this venue have?", since the funnel is room-first.
 * @returns {Promise<Array<{venueSlug:string,roomSlug:string,lastModifiedUtc:string}>>}
 */
export function getSitemap() {
  return get('/sitemap');
}

/**
 * `GET /listings/{roomId}/availability` — free windows per day, venue-local.
 * Null when the room is unknown or unpublished.
 * @returns {Promise<{roomId:string,timezone:string,from:string,to:string,days:Array<{date:string,isBlackout:boolean,freeWindows:Array<{startTime:string,endTime:string}>}>}|null>}
 */
export function getRoomAvailability(roomId, { from, to } = {}) {
  return get(`/listings/${encodeURIComponent(roomId)}/availability`, { from, to }, { notFoundAsNull: true });
}

// ─── identity, and the one thing a signed-in person does here ────────────────

/**
 * @typedef {object} WireSessionUser
 * @property {string} id            GUID
 * @property {string} displayName
 * @property {string|null} email
 * @property {string} createdAtUtc
 */

/**
 * @typedef {object} WireSession
 * @property {string} accessToken   short-lived JWT
 * @property {string} refreshToken  rotates on every use; reuse revokes the family
 * @property {WireSessionUser} user
 * @property {boolean} isNewUser
 */

/**
 * `POST /auth/sessions` — exchange a provider ID token for steeple's own pair.
 *
 * `provider` is a wire token. In development the API registers a `dev` verifier
 * (Auth:DevLoginEnabled, appsettings.Development.json only) whose "ID token" is
 * `email` or `email|Display Name`, and which creates the account on first use.
 * `turnstileToken` is required only where Turnstile is enabled; locally it is
 * null. A 401 carries `code: invalid_id_token`, a 409 `use_original_provider`.
 *
 * @returns {Promise<WireSession>}
 */
export function createSession({ provider, idToken, nonce = null, turnstileToken = null, displayName = null, device = null }) {
  return send('POST', '/auth/sessions', {
    provider,
    idToken,
    nonce,
    turnstileToken,
    displayName,
    device,
  });
}

/**
 * `POST /auth/refresh` — rotate the pair. The old refresh token dies here; using
 * it twice revokes every session in its family, so a caller must keep exactly
 * one refresh in flight.
 * @returns {Promise<{accessToken:string,refreshToken:string}>}
 */
export function refreshSession(refreshToken) {
  return send('POST', '/auth/refresh', { refreshToken });
}

/**
 * `GET /me` — the signed-in person, plus their recorded legal acceptances.
 * @returns {Promise<{id:string,displayName:string,email:string|null,createdAtUtc:string,agreements:Array<{docType:string,version:string,acceptedAtUtc:string}>}>}
 */
export function getMe(accessToken) {
  return get('/me', null, { accessToken });
}

/**
 * @typedef {object} WireSchedule  venue-local wall clock, CONTRACTS §2
 * @property {'oneOff'|'recurringWeekly'} frequency
 * @property {string} startDate            yyyy-MM-dd
 * @property {string|null} endDate         required when recurring
 * @property {string[]|null} daysOfWeek    'sunday'…'saturday', required when recurring
 * @property {string} startTime            HH:mm
 * @property {string} endTime              HH:mm
 */

/**
 * `POST /listings/{roomId}/applications` — the ask, authorized.
 *
 * `roomId` is steeple's GUID, not the product's `venueSlug:roomSlug`. The body
 * is SubmitApplicationRequest verbatim; `organizationName` is optional and is
 * shown to the host as "Who's asking". An `Idempotency-Key` makes a replay
 * return the original application rather than filing a second one — the answer
 * is then 200 instead of 201, and identical either way.
 *
 * Failures arrive as problem documents: `invalid_application` (400),
 * `schedule_unavailable` / `slot_taken` (409), `turnstile_failed` (403).
 *
 * @param {string} roomId
 * @param {{activityType:string,groupSize:number,schedule:WireSchedule,intentText:string,turnstileToken:string|null,organizationName?:string|null}} body
 * @returns {Promise<object>} ApplicationDto
 */
export function submitApplication(roomId, body, { accessToken, idempotencyKey = null } = {}) {
  return send('POST', `/listings/${encodeURIComponent(roomId)}/applications`, body, {
    accessToken,
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
  });
}

/**
 * `GET /me/applications` — the organizer's own inbox, newest first. Here for
 * harnesses and for reconciling what the server holds against what this
 * browser remembers.
 * @returns {Promise<{items:object[],totalCount:number,page:number,pageSize:number}>}
 */
export function getMyApplications(accessToken, { status = null, page = null, pageSize = null } = {}) {
  return get('/me/applications', { status, page, pageSize }, { accessToken });
}

// ─── manage: the provider's own venues, rooms, hours and photos ──────────────
//
// Every route below is venue-manager-scoped: the caller who creates a venue
// becomes its first manager, and a venue nobody manages answers 404 to them
// exactly as an unknown one does (no existence leak). Unchanged fields are sent
// as null on a PATCH — null means "leave it".

/**
 * @typedef {object} WireManagedVenue      ManagedVenueDetailDto
 * @property {string} id
 * @property {string} name
 * @property {string} slug
 * @property {string} description
 * @property {string} venueType
 * @property {string} addressLine
 * @property {string} suburb
 * @property {string} postcode
 * @property {number} latitude             geocoded server-side from the address
 * @property {number} longitude
 * @property {string} timezone
 * @property {boolean} isIdentityVerified
 * @property {string} verificationStatus
 * @property {Array<object>} rooms         ManagedRoomSummaryDto[]
 */

/**
 * @typedef {object} WireManagedRoom        ManagedRoomDto
 * @property {string} id
 * @property {string} venueId
 * @property {string} name
 * @property {string} slug
 * @property {string} description
 * @property {number} capacity
 * @property {number} pricePerHour          always positive; the API refuses 0
 * @property {string} status                draft | published | unlisted
 * @property {string|null} publishRequestedAtUtc   set when moderation holds it
 * @property {string|null} firstPublishedAtUtc
 * @property {string[]} activities
 * @property {string[]} amenities
 * @property {string[]} accessibility
 * @property {WireRoomPhoto[]} photos
 */

/** `GET /manage/venues` — the venues this person manages (empty for everyone else). */
export function getManagedVenues(accessToken) {
  return get('/manage/venues', null, { accessToken });
}

/** `GET /manage/venues/{id}` — the editor's whole view of one venue. */
export function getManagedVenue(venueId, accessToken) {
  return get(`/manage/venues/${encodeURIComponent(venueId)}`, null, { accessToken });
}

/**
 * `POST /manage/venues` — create, geocoded and geofenced server-side from
 * address/suburb/postcode. Name, description and the three address fields are
 * required; a location outside the beachhead answers `geofence_rejected` and an
 * address that resolves to nothing answers `invalid_venue`.
 * @param {{name:string,description:string,addressLine:string,suburb:string,postcode:string,venueType?:string,contactEmail?:string|null}} body
 * @returns {Promise<WireManagedVenue>}
 */
export function createManagedVenue(body, { accessToken } = {}) {
  return send('POST', '/manage/venues', body, { accessToken });
}

/** `PATCH /manage/venues/{id}` — null fields stay as they are; address changes re-geocode. */
export function updateManagedVenue(venueId, body, { accessToken } = {}) {
  return send('PATCH', `/manage/venues/${encodeURIComponent(venueId)}`, body, { accessToken });
}

/**
 * `POST /manage/venues/{id}/rooms` — a room, always created in draft.
 * `pricePerHour` is required and must be greater than zero, and `description`
 * may not be empty: both answer `invalid_room` otherwise.
 * @returns {Promise<WireManagedRoom>}
 */
export function createManagedRoom(venueId, body, { accessToken } = {}) {
  return send('POST', `/manage/venues/${encodeURIComponent(venueId)}/rooms`, body, { accessToken });
}

/**
 * `PATCH /manage/rooms/{id}` — edits and status transitions in one shape.
 *
 * Asking for `published` on a room moderation has never approved does not
 * publish it: the API records a publish request and answers 200 with the room
 * still `draft` and `publishRequestedAtUtc` set. Publishing is refused outright
 * while the room has no photos (`no_photos`) or, where the flag is on, no open
 * hours (`no_open_hours`).
 * @returns {Promise<WireManagedRoom>}
 */
export function updateManagedRoom(roomId, body, { accessToken } = {}) {
  return send('PATCH', `/manage/rooms/${encodeURIComponent(roomId)}`, body, { accessToken });
}

/** `GET /manage/rooms/{id}` — the manager's view, moderation state included. */
export function getManagedRoom(roomId, accessToken) {
  return get(`/manage/rooms/${encodeURIComponent(roomId)}`, null, { accessToken });
}

/**
 * `POST /manage/rooms/{id}/photos` — one photo, ≤10 MB, JPEG/PNG/WebP. The
 * pipeline strips EXIF and returns the variant URLs; the first photo on a room
 * becomes its cover. `invalid_image` when the bytes are not a decodable image.
 * @param {File|Blob} file
 * @returns {Promise<WireRoomPhoto>}
 */
export function uploadRoomPhoto(roomId, file, { caption = null, accessToken } = {}) {
  const form = new FormData();
  form.append('file', file, file.name ?? 'photo.jpg');
  if (caption) form.append('caption', caption);
  return upload(`/manage/rooms/${encodeURIComponent(roomId)}/photos`, form, { accessToken });
}

/** `GET /manage/rooms/{id}/availability` — all seven days, Sunday first. */
export function getRoomAvailabilityRules(roomId, accessToken) {
  return get(`/manage/rooms/${encodeURIComponent(roomId)}/availability`, null, { accessToken });
}

/**
 * `PUT /manage/rooms/{id}/availability` — replace-all: the saved state is
 * exactly this payload. Days may be sparse (an omitted weekday is closed);
 * ≤6 windows a day, no overlaps, ≤200 blackouts, none of them in the past.
 * @param {{days:Array<{dayOfWeek:string,windows:Array<{startTime:string,endTime:string}>}>,blackouts:Array<{date:string,reason:string|null}>}} body
 */
export function saveRoomAvailabilityRules(roomId, body, { accessToken } = {}) {
  return send('PUT', `/manage/rooms/${encodeURIComponent(roomId)}/availability`, body, { accessToken });
}
