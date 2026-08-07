// THE CATALOG — the product's one data surface (CONTRACT4 §2).
//
// Signatures and shapes are frozen: camelCase room summaries, room detail with
// a photos[] of url/cardUrl/thumbUrl variants, a venue profile, the suburbs, the
// geofence. What changed underneath is where the answers come from — steeple's
// live /api/v1 (see api.js), through the dev proxy, with the bundled seed
// standing behind it. Product-surface code imports these functions and shapes,
// never venues.js, for anything it shows.
//
// Two translations happen here, and only here:
//   · names — the wire says roomName/latitude/longitude/totalCount, the product
//     says name/lat/lng/total, and RoomDetail carries its venue in a block
//     rather than repeating the summary fields;
//   · vocabulary — the wire speaks camelCase enum tokens ('stepFreeAccess'),
//     the product prints labels ('Step-free access'), and the filter chips send
//     labels back. Unknown tokens are humanized rather than dropped: steeple is
//     allowed to add them without a version bump.
//
// The seed stands behind the wire for one case only — nothing served /api/v1 —
// and never for a steeple that answered and said no; see `absent` below, and
// `readFailure` for what a caller says when it did.
//
// The 3D village is deliberately NOT a consumer: it is scenery, staged from the
// bundled seed. The map and list are the truth; the village is the brand.

import * as api from './api.js';
import * as bundled from './bundledCatalog.js';
import {
  ACCESS_LABELS as ACCESSIBILITY,
  ACTIVITY_LABELS as ACTIVITIES,
  AMENITY_LABELS as AMENITIES,
  toLabels as labels,
} from './vocabulary.js';

const PAGE_SIZE = 100;

/** The frame the map opens on, before the geofence has named itself. */
export const AREA_CENTER = bundled.AREA_CENTER;

// After a failed call the catalog stops asking for a while: one dead API should
// cost one timeout, not one per keystroke. It retries eventually, so a backend
// started after the page was opened is picked up without a reload.
const RETRY_AFTER_MS = 30_000;

// A read that failed means one of two things, and the whole honesty of this
// surface is in telling them apart.
//
// ABSENT — nothing served /api/v1 at this origin. Either nothing answered at
// all (status 0: a dead fetch, a timeout), or the thing standing in front of
// the API answered for it: vite in development and nginx in a container both
// say 502 with no upstream, and a static host with no API behind it says 404
// to everything. This is the case the bundled seed was built for, and that
// promise stays — the product is browsable with steeple away.
//
// ANSWERED — steeple itself, saying no: 400, 403, 429, 500. The service is
// there and it did not give the rooms. Handing back the seed here was the bug
// this replaced: the seed cannot answer a schedule term, so an API that
// refused a Tuesday-evening search printed nine rooms as though every one of
// them were free on Tuesday evening. False availability is the one thing this
// surface must never invent, so an answered failure is thrown to the caller,
// which says so in words.
//
// 404 sits with ABSENT deliberately. No read here has a not-found case of its
// own — the only one that could, a listing by slug, is turned into `null` by
// api.js before it can throw, and is vouched for by the sitemap below — so a
// thrown 404 is an origin that does not serve steeple rather than steeple
// saying "no such thing". `neverArrived` in data/correspondence.js is the
// writing half of the same judgement, learned the same way and kept separate
// on purpose: a write must never read a 404 as "steeple is away".
const absent = (status) => status === 0 || status === 404 || status === 502 || status === 503;

let quietUntil = 0;
// Set → reads inside the quiet window fail the same way without asking again;
// null → the seed is what the quiet window answers with.
let quietFailure = null;
let saidSo = false;
let readingSeed = false;

function fallBackToSeed(error) {
  quietUntil = Date.now() + RETRY_AFTER_MS;
  quietFailure = null;
  readingSeed = true;
  if (saidSo) return;
  saidSo = true;
  // Info, never error: this is a working state, not a fault.
  console.info(`[catalog] steeple API unavailable (${error.message}) — reading the bundled seed.`);
}

/** Ask the API; answer from the seed if nothing served it; throw if it said no. */
async function live(fromApi, fromSeed) {
  if (Date.now() < quietUntil) {
    if (quietFailure) throw quietFailure;
    return fromSeed();
  }
  try {
    const answer = await fromApi();
    readingSeed = false;
    return answer;
  } catch (error) {
    // A question this browser withdrew is not an answer and not a silence.
    // Reading it as "nothing served /api/v1" would put a working catalog on the
    // seed for thirty seconds every time somebody typed quickly.
    if (error?.aborted) throw error;
    if (absent(error?.status ?? 0)) {
      fallBackToSeed(error);
      return fromSeed();
    }
    // A rate limit is the one answered failure that gets worse for being
    // re-asked, so it — and only it — takes the quiet window with it, and every
    // read inside that window says the same thing rather than adding to the
    // pace. Any other refusal may be about the question rather than the
    // service, so the next question is asked.
    if (error?.status === 429) {
      quietUntil = Date.now() + RETRY_AFTER_MS;
      quietFailure = error;
    }
    throw error;
  }
}

/**
 * What a failed read means, in the vocabulary the correspondence already
 * speaks (data/correspondence.js): 'busy' when steeple asked to be asked again
 * shortly, 'refused' when it answered no, 'absent' when nothing served it at
 * all — which the reads below never throw, because that is the seed's case.
 *
 * The sentence is ours rather than steeple's `detail`: a read's problem
 * document is written for whoever is holding the query, and nobody browsing a
 * map is. Additive, and the only new export on this seam — every read still
 * returns the shape it always has.
 *
 * @param {{status?:number}} error
 * @returns {{reach:'busy'|'refused'|'absent', status:number, message:string}}
 */
export function readFailure(error) {
  const status = error?.status ?? 0;
  if (absent(status)) {
    return { reach: 'absent', status, message: 'Steeple could not be reached just now. Try again in a moment.' };
  }
  if (status === 429) {
    return { reach: 'busy', status, message: 'Steeple is answering a great many questions just now. Try again shortly.' };
  }
  return { reach: 'refused', status, message: 'Steeple could not answer just now. Try again in a moment.' };
}

// ─── vocabulary ──────────────────────────────────────────────────────────────
// The reading half of the shared vocabulary (data/vocabulary.js, imported
// above): steeple's CONTRACTS §2.1 tokens as the labels this product prints.

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const tokenIndex = (registry) =>
  new Map(Object.entries(registry).map(([token, label]) => [label.toLowerCase(), token]));

const ACTIVITY_TOKENS = tokenIndex(ACTIVITIES);
const AMENITY_TOKENS = tokenIndex(AMENITIES);
const ACCESS_TOKENS = tokenIndex(ACCESSIBILITY);

/** Filters arrive as labels from the chips, or as tokens from anything wiser. */
const tokens = (values, index) =>
  (values ?? []).map((value) => index.get(String(value).toLowerCase()) ?? value);

const weekday = (value) => {
  // The wire speaks day names; the pill's chips count like DayOfWeek (Sun=0).
  if (/^\d+$/.test(String(value))) return DAYS[Number(value) % 7];
  const said = String(value).toLowerCase();
  return DAYS.find((day) => day.startsWith(said.slice(0, 3))) ?? said;
};

// ─── shapes ──────────────────────────────────────────────────────────────────

// The wire has no short display name and no venue description. The village's
// bundled seed is keyed by the very same slugs, so it lends both where it can,
// and the venue's own name stands in where it cannot (CONTRACT4 §5).
const scenery = (venueSlug) => bundled.getVenueRecord(venueSlug);

const shortNameFor = (venueSlug, venueName) =>
  scenery(venueSlug)?.shortName ?? venueName.replace(/\s+Church$/, '');

// Cards want a card-sized image; seeded rows carry only the full-size url.
const cardUrl = (photo) => photo.cardUrl ?? photo.url;

function photoFrom(photo) {
  return {
    url: photo.url,
    cardUrl: cardUrl(photo),
    thumbUrl: photo.thumbUrl ?? photo.url,
    caption: photo.caption ?? null,
    isPrimary: photo.isPrimary,
    sortOrder: photo.sortOrder,
  };
}

function summaryFrom(item) {
  return {
    id: `${item.venueSlug}:${item.roomSlug}`,
    venueSlug: item.venueSlug,
    roomSlug: item.roomSlug,
    name: item.roomName,
    venueName: item.venueName,
    venueShortName: shortNameFor(item.venueSlug, item.venueName),
    suburb: item.suburb,
    lat: item.latitude,
    lng: item.longitude,
    capacity: item.capacity,
    pricePerHour: item.pricePerHour,
    currency: item.currency,
    primaryPhotoUrl: item.primaryPhotoUrl ?? null,
    activities: labels(item.activities, ACTIVITIES),
    amenities: labels(item.amenities, AMENITIES),
    accessibility: labels(item.accessibility, ACCESSIBILITY),
  };
}

function profileFrom(venue) {
  const bundledVenue = scenery(venue.slug);
  return {
    slug: venue.slug,
    name: venue.name,
    shortName: shortNameFor(venue.slug, venue.name),
    description: bundledVenue?.description ?? null,
    // The wire keeps the street, the suburb and the postcode apart; the sheet
    // prints one line.
    addressLine: [venue.addressLine, [venue.suburb, venue.postcode].filter(Boolean).join(' ')]
      .filter(Boolean)
      .join(', '),
    suburb: venue.suburb,
    lat: venue.latitude,
    lng: venue.longitude,
    parkingInfo: venue.parkingInfo,
    transitInfo: venue.transitInfo,
    contactEmail: venue.contactEmail,
    isIdentityVerified: venue.isIdentityVerified,
  };
}

/**
 * The room's weekly open hours in the product's own window shape
 * (`{day, start, end}`, Sunday = 0 — the .NET DayOfWeek convention the schema
 * and the week card both count in). Null when the wire did not carry them,
 * which is not the same as a room that keeps no hours.
 */
function openHoursFrom(detail) {
  if (!Array.isArray(detail.openHours)) return null;
  const windows = [];
  for (const entry of detail.openHours) {
    const day = DAYS.indexOf(String(entry.dayOfWeek ?? '').toLowerCase());
    if (day < 0) continue;
    for (const w of entry.windows ?? []) {
      windows.push({ day, start: w.startTime.slice(0, 5), end: w.endTime.slice(0, 5) });
    }
  }
  return windows.sort((a, b) => a.day - b.day || (a.start < b.start ? -1 : 1));
}

// RoomDetail does not repeat the summary fields — the venue block and photos[]
// carry them instead — so the listing is assembled from both.
function listingFrom(detail) {
  const venue = detail.venue;
  const photos = [...(detail.photos ?? [])]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(photoFrom);
  const cover = photos.find((photo) => photo.isPrimary) ?? photos[0] ?? null;

  return {
    id: `${venue.slug}:${detail.roomSlug}`,
    // steeple's own id for the room. The product navigates by slug pair, but
    // every write and the availability feed are addressed by this, so it comes
    // along rather than being fetched a second time at the commitment point.
    roomId: detail.roomId,
    // 'instant' | 'manual' — whether a request is the booking or an ask
    // (docs/contracts/payments.md). Absent on the bundled seed, where the honest
    // answer is that this browser does not know.
    bookingMode: detail.bookingMode ?? null,
    openHours: openHoursFrom(detail),
    venueSlug: venue.slug,
    roomSlug: detail.roomSlug,
    name: detail.roomName,
    venueName: venue.name,
    venueShortName: shortNameFor(venue.slug, venue.name),
    suburb: venue.suburb,
    lat: venue.latitude,
    lng: venue.longitude,
    capacity: detail.capacity,
    pricePerHour: detail.pricePerHour,
    currency: detail.currency,
    primaryPhotoUrl: cover?.cardUrl ?? null,
    activities: labels(detail.activities, ACTIVITIES),
    amenities: labels(detail.amenities, AMENITIES),
    accessibility: labels(detail.accessibility, ACCESSIBILITY),
    description: detail.description,
    houseRules: detail.houseRules,
    photos,
    venue: profileFrom(venue),
  };
}

// ─── venue presence ──────────────────────────────────────────────────────────
//
// steeple's funnel is room-first and has no venue endpoint (CONTRACT4 §5), so a
// venue is never fetched — it is assembled, from the two answers that carry one:
//
//   · a search answer, whose every room summary names its venue and says where
//     it stands. That is enough for a pin and enough for the head of a sheet,
//     and it arrives with the results, so a row is openable the moment it is on
//     the page;
//   · RoomDetail, whose venue block carries the address, the parking, the
//     transit and the verification, and whose rooms the sitemap enumerates. That
//     is the rest of the sheet, and it lands a moment later.
//
// One record per slug, filled in as answers arrive. `heldVenue` is what is known
// right now — synchronous, for the first paint; `readVenue` is the whole of it.
//
// This is the seam that data/venues.js used to be. The bundled seed still lends
// what the wire has no field for (a short name, a description, and the one line
// a sheet says about a space being prepared), and it stands in whole when
// nothing served /api/v1 — but no product surface reads it directly any more.

const venues = new Map();

// The seed's venues stand on the map from the first frame: a map that opens
// empty and fills in is a map that flickers, and these are the same five
// steeple serves. They are provisional — the first answer that actually came
// from steeple clears them, so a live catalog with other venues never leaves a
// phantom pin behind.
let seededRoster = true;

function record(venueSlug) {
  let held = venues.get(venueSlug);
  if (held) return held;
  held = scenery(venueSlug) ?? {
    id: venueSlug,
    slug: venueSlug,
    name: venueSlug,
    shortName: venueSlug,
    suburb: '',
    lat: null,
    lng: null,
    address: null,
    description: null,
    parking: null,
    transit: null,
    contactEmail: null,
    verified: false,
    rooms: [],
  };
  held.provisional = true;
  venues.set(venueSlug, held);
  return held;
}

for (const slug of bundled.venueSlugs()) record(slug);

/** Later answers add; they never blank a field an earlier one filled. */
const said = (values) =>
  Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null && v !== undefined));

function noteRoom(venue, room) {
  const at = venue.rooms.findIndex((held) => held.id === room.id);
  if (at < 0) venue.rooms.push({ status: 'published', ...said(room) });
  else venue.rooms[at] = { ...venue.rooms[at], ...said(room) };
}

const roomFromSummary = (item) => ({
  id: item.roomSlug,
  name: item.name,
  capacity: item.capacity,
  pricePerHour: item.pricePerHour,
  currency: item.currency,
  primaryPhotoUrl: item.primaryPhotoUrl,
  activities: item.activities,
  amenities: item.amenities,
  accessibility: item.accessibility,
  status: 'published',
});

const roomFromListing = (listing) => ({
  ...roomFromSummary(listing),
  roomId: listing.roomId,
  bookingMode: listing.bookingMode,
  openHours: listing.openHours,
  description: listing.description,
  houseRules: listing.houseRules,
  photos: listing.photos,
});

/** What a page of results says about the venues standing behind its rooms. */
function noteSummaries(items, fromSeed) {
  if (!fromSeed && seededRoster) {
    for (const [slug, held] of venues) if (held.provisional) venues.delete(slug);
    seededRoster = false;
  }
  for (const item of items) {
    const venue = record(item.venueSlug);
    venue.provisional = fromSeed;
    Object.assign(
      venue,
      said({
        name: item.venueName,
        shortName: item.venueShortName,
        suburb: item.suburb,
        lat: item.lat,
        lng: item.lng,
      })
    );
    noteRoom(venue, roomFromSummary(item));
  }
}

/** What one listing says — the venue block behind it, and the room itself. */
function noteListing(listing, fromSeed) {
  const venue = record(listing.venueSlug);
  const profile = listing.venue ?? {};
  venue.provisional = fromSeed;
  Object.assign(
    venue,
    said({
      name: profile.name ?? listing.venueName,
      shortName: profile.shortName ?? listing.venueShortName,
      suburb: profile.suburb ?? listing.suburb,
      lat: profile.lat ?? listing.lat,
      lng: profile.lng ?? listing.lng,
      address: profile.addressLine,
      description: profile.description,
      parking: profile.parkingInfo,
      transit: profile.transitInfo,
      contactEmail: profile.contactEmail,
      verified: profile.isIdentityVerified,
    })
  );
  noteRoom(venue, roomFromListing(listing));
  return venue;
}

/**
 * The venue as it is known this instant, or null if the catalog has never
 * answered with it. Synchronous on purpose: a sheet opened from a row must be
 * on the page in the same frame as the press that opened it.
 */
export function heldVenue(venueSlug) {
  return (venueSlug && venues.get(venueSlug)) || null;
}

/** One space of it, the same way. */
export function heldRoom(venueSlug, roomSlug) {
  return heldVenue(venueSlug)?.rooms.find((room) => room.id === roomSlug) ?? null;
}

/**
 * Every venue the catalog has answered with, positioned — the map's roster.
 * Which of them answer the search in hand is a separate question, and the
 * search's own answer decides it (ui/map/atlas.js `setMatching`).
 */
export function knownVenues() {
  return [...venues.values()].filter(
    (venue) => Number.isFinite(venue.lat) && Number.isFinite(venue.lng)
  );
}

/** The rooms of the last search answer — what the surface is currently saying. */
let lastItems = [];
export const heldResults = () => lastItems;

// A venue is read once and held: it changes when a listing is published, not
// while somebody is browsing. `forgetVenues` is the other half — publishing or
// editing a space is exactly the moment the held answer stops being true.
const reads = new Map();
const whole = new Set();

export function forgetVenues() {
  reads.clear();
  whole.clear();
}

/**
 * The venue in full: the sitemap says which rooms it has, and each room's
 * detail carries the venue block and the room's own words. Answers from what is
 * already held when steeple cannot be reached, and null when nothing anywhere
 * knows the slug.
 */
export function readVenue(venueSlug) {
  if (!venueSlug) return Promise.resolve(null);
  if (whole.has(venueSlug)) return Promise.resolve(heldVenue(venueSlug));
  let reading = reads.get(venueSlug);
  if (!reading) {
    reading = assemble(venueSlug).finally(() => reads.delete(venueSlug));
    reads.set(venueSlug, reading);
  }
  return reading;
}

async function assemble(venueSlug) {
  let roomSlugs;
  try {
    const entries = await sitemapEntries();
    roomSlugs = entries.filter((entry) => entry.venueSlug === venueSlug).map((e) => e.roomSlug);
  } catch {
    // Nothing served the sitemap. The seed answers for its own venues and for
    // nothing else, which is the same promise every read here makes.
    const seeded = scenery(venueSlug);
    if (seeded) {
      const { rooms, ...place } = seeded;
      const venue = record(venueSlug);
      Object.assign(venue, said(place), { provisional: true });
      for (const room of rooms) noteRoom(venue, room);
      return venue;
    }
    return heldVenue(venueSlug);
  }

  // Each read keeps itself (see getListing) — the venue is what they add up to.
  const listings = (
    await Promise.all(roomSlugs.map((roomSlug) => getListing(venueSlug, roomSlug).catch(() => null)))
  ).filter(Boolean);
  if (listings.length === 0) return heldVenue(venueSlug);
  whole.add(venueSlug);
  return heldVenue(venueSlug);
}

// ─── the surface ─────────────────────────────────────────────────────────────

/**
 * Search published rooms. Accepts steeple's search vocabulary: suburb,
 * capacity, the three tag families, and the schedule terms (date, daysOfWeek,
 * timeOfDay, startTime/endTime, durationMinutes) which the live search answers
 * against real open hours and confirmed bookings.
 *
 * Throws the ApiError when steeple answered and refused — the seed cannot
 * honour a schedule term, so standing in for a refused search would be a claim
 * about free hours nobody made. `readFailure` turns it into a sentence.
 *
 * `signal` takes a superseded question off the wire (ui/map/search.js). An
 * abort is not an answer and not a silence: it is rethrown as it is, so nothing
 * here mistakes it for a steeple that is away and starts reading the seed.
 */
export async function searchListings(query = {}, { signal = null } = {}) {
  const answer = await live(
    async () => {
      // The live search's schedule grammar, learned from the wire: time terms
      // must be anchored to a date or weekdays, and a time-of-day band stands
      // in place of an explicit start/end, never alongside one. The pill sends
      // both; only what the grammar allows goes out.
      const daysOfWeek = (query.daysOfWeek ?? []).map(weekday);
      const anchored = Boolean(query.date) || daysOfWeek.length > 0;
      const timeOfDay =
        anchored && query.timeOfDay ? String(query.timeOfDay).toLowerCase() : null;
      const result = await api.searchListings(
        {
          suburb: query.suburb ?? null,
          minCapacity: query.minCapacity || null,
          activities: tokens(query.activities, ACTIVITY_TOKENS),
          amenities: tokens(query.amenities, AMENITY_TOKENS),
          accessibility: tokens(query.accessibility, ACCESS_TOKENS),
          date: query.date ?? null,
          daysOfWeek,
          timeOfDay,
          startTime: anchored && !timeOfDay ? (query.startTime ?? null) : null,
          endTime: anchored && !timeOfDay ? (query.endTime ?? null) : null,
          durationMinutes: anchored ? (query.durationMinutes ?? null) : null,
          page: query.page ?? null,
          pageSize: query.pageSize ?? PAGE_SIZE,
        },
        { signal }
      );
      return { items: result.items.map(summaryFrom), total: result.totalCount };
    },
    () => bundled.searchListings(query)
  );
  noteSummaries(answer.items, readingSeed);
  lastItems = answer.items;
  return answer;
}

/**
 * One room, in full: the listing page's truth. Null when it is not published;
 * throws when steeple answered and refused (`readFailure`).
 */
export async function getListing(venueSlug, roomSlug) {
  const listing = await live(
    async () => {
      const detail = await api.getListingBySlug(venueSlug, roomSlug);
      if (detail) return listingFrom(detail);
      // A null here is a 404, and a 404 has two meanings that must not be
      // confused: steeple saying "no such published room", and an origin where
      // /api/v1 is not served at all answering the way it answers everything.
      // Every other call on this surface throws on a 404 and therefore falls
      // back to the seed; this one alone would accept the silence as an answer
      // and hand the room sheet a listing with no photograph in it. So the
      // sitemap is asked to vouch for steeple first — it has no not-found case,
      // so if it answers, the 404 above was steeple speaking and null is true.
      // If it cannot answer, this throws and live() reads the seed like the rest.
      await sitemapEntries();
      return null;
    },
    () => bundled.getListing(venueSlug, roomSlug)
  );
  // Every listing read is also the answer to "who is this venue" — the block
  // behind it is the only place the address, the parking and the transit are
  // ever said. Keeping it is what lets a sheet open on a venue nobody searched.
  if (listing) noteListing(listing, readingSeed);
  return listing;
}

// Which rooms a venue has, asked the only way steeple offers: the sitemap. Held
// for the session — it changes when a listing is published, not while browsing.
let sitemap = null;

function sitemapEntries() {
  sitemap ??= api.getSitemap().catch((error) => {
    sitemap = null;
    throw error;
  });
  return sitemap;
}

async function anyRoomOf(venueSlug) {
  const entries = await sitemapEntries();
  return entries.find((entry) => entry.venueSlug === venueSlug)?.roomSlug ?? null;
}

/**
 * The venue as a place: what the venue sheet prints. steeple has no venue
 * endpoint today — its funnel is room-first and carries the venue block inside
 * RoomDetail — so this is derived from one of the venue's own rooms.
 * Flagged in CONTRACT4 §5 as a candidate API addition.
 */
export async function getVenueProfile(venueSlug) {
  return live(
    async () => {
      const roomSlug = await anyRoomOf(venueSlug);
      if (!roomSlug) return null;
      const detail = await api.getListingBySlug(venueSlug, roomSlug);
      return detail ? profileFrom(detail.venue) : null;
    },
    () => bundled.getVenueProfile(venueSlug)
  );
}

/**
 * A room's real free hours, day by day: open hours minus blackouts minus the
 * bookings already confirmed. Addressed by steeple's room id (`listing.roomId`).
 *
 * There is deliberately no bundled fallback. An invented calendar is the one
 * thing this surface must never hand a guest about to commit to a date, so a
 * service that cannot answer answers null and the week card says so.
 *
 * @returns {Promise<{timezone:string,days:Array<{date:string,isBlackout:boolean,free:Array<{start:string,end:string}>}>}|null>}
 */
export async function getRoomAvailability(roomId, { from, to } = {}) {
  if (!roomId) return null;
  try {
    const answer = await api.getRoomAvailability(roomId, { from, to });
    if (!answer) return null;
    return {
      timezone: answer.timezone,
      days: (answer.days ?? []).map((day) => ({
        date: day.date,
        isBlackout: day.isBlackout,
        free: (day.freeWindows ?? []).map((w) => ({
          start: w.startTime.slice(0, 5),
          end: w.endTime.slice(0, 5),
        })),
      })),
    };
  } catch {
    return null;
  }
}

/** The Where segment's vocabulary. Throws on a refusal, like every read here. */
export async function getSuburbs() {
  return live(
    () => api.getSuburbs(),
    () => bundled.getSuburbs()
  );
}

/** The search area's own name and centre — the frame the map opens on. */
export async function getGeofence() {
  return live(
    async () => {
      const fence = await api.getGeofence();
      return {
        areaName: fence.areaName,
        center: { lat: fence.center.latitude, lng: fence.center.longitude },
      };
    },
    () => bundled.getGeofence()
  );
}

/** Where the last answer came from — additive, for harnesses and diagnostics. */
export const isLive = () => !readingSeed;
