// THE BUNDLED CATALOG — the same data surface, answered from the seed we ship.
//
// This is the catalog as it stood before the API existed, kept whole and kept
// honest: every shape here is the shape catalog.js promises. It is the ground
// the product stands on when steeple is not running — a prototype that
// white-screens because a container is down is no prototype at all — and it is
// the reference the live adapter is measured against.
//
// Nothing outside data/ imports this module: the product asks catalog.js, which
// answers from the API and falls back to here.
//
// The 3D village is deliberately NOT a consumer either: it is scenery, staged
// from the bundled seed. The map and list are the truth; the village is the brand.

import { CENTER, VENUES, photoUrl } from './venues.js';
import { effectiveRoom } from './store.js';

const CURRENCY = 'USD';

// The same photographs steeple's seed carries after 012-room-photo-curation.sql, at the same
// three crops the API's Url / CardUrl / ThumbUrl columns serve. Rooms the guest placed
// themselves have no photographs yet; the UI only ever sees a URL or null.
const photos = (room) =>
  (room.photos ?? []).map((photo, i) => ({
    url: photoUrl(photo.id, 1600, 1000),
    cardUrl: photoUrl(photo.id, 800, 500),
    thumbUrl: photoUrl(photo.id, 400, 250),
    caption: photo.caption,
    isPrimary: i === 0,
    sortOrder: i,
  }));

const coverUrl = (room) =>
  room.photos?.[0] ? photoUrl(room.photos[0].id, 800, 500) : null;

function summary(venue, room) {
  return {
    id: `${venue.id}:${room.id}`,
    venueSlug: venue.id,
    roomSlug: room.id,
    name: room.name,
    venueName: venue.name,
    venueShortName: venue.shortName,
    suburb: venue.suburb,
    lat: venue.lat,
    lng: venue.lng,
    capacity: room.capacity,
    pricePerHour: room.pricePerHour,
    currency: CURRENCY,
    primaryPhotoUrl: coverUrl(room),
    activities: room.activities,
    amenities: room.amenities,
    accessibility: room.accessibility,
  };
}

/**
 * Search published rooms. Accepts steeple's search vocabulary; the bundled seed
 * can answer suburb / capacity / tag filters, while the schedule terms (date,
 * daysOfWeek, startTime/endTime, timeOfDay, durationMinutes) are accepted and
 * passed over — the live implementation answers them server-side.
 */
export async function searchListings(query = {}) {
  const {
    suburb = null,
    minCapacity = 0,
    activities = [],
    amenities = [],
    accessibility = [],
  } = query;

  const items = [];
  for (const venue of VENUES) {
    if (suburb && venue.suburb.toLowerCase() !== suburb.toLowerCase()) continue;
    for (const room of venue.rooms) {
      const live = effectiveRoom(venue.id, room.id) ?? room;
      if (live.status !== 'published') continue;
      if (minCapacity && live.capacity < minCapacity) continue;
      if (!activities.every((a) => live.activities.includes(a))) continue;
      if (!amenities.every((a) => live.amenities.includes(a))) continue;
      if (!accessibility.every((a) => live.accessibility.includes(a))) continue;
      items.push(summary(venue, live));
    }
  }
  return { items, total: items.length };
}

/** One room, in full: the listing page's truth. Null when it is not published. */
export async function getListing(venueSlug, roomSlug) {
  const venue = VENUES.find((v) => v.id === venueSlug);
  const room = venue && (effectiveRoom(venueSlug, roomSlug) ?? null);
  if (!venue || !room || room.status !== 'published') return null;
  return {
    ...summary(venue, room),
    description: room.description,
    houseRules: room.houseRules,
    photos: photos(room),
    venue: await getVenueProfile(venueSlug),
  };
}

/**
 * The venue as a place: what the venue sheet prints. steeple has no venue
 * endpoint today — its funnel is room-first and carries the venue block inside
 * RoomDetail — so the live implementation derives this from a room fetch.
 * Flagged in CONTRACT4 §5 as a candidate API addition.
 */
export async function getVenueProfile(venueSlug) {
  const venue = VENUES.find((v) => v.id === venueSlug);
  if (!venue) return null;
  return {
    slug: venue.id,
    name: venue.name,
    shortName: venue.shortName,
    description: venue.description,
    addressLine: venue.address,
    suburb: venue.suburb,
    lat: venue.lat,
    lng: venue.lng,
    parkingInfo: venue.parking,
    transitInfo: venue.transit,
    contactEmail: venue.contactEmail,
    isIdentityVerified: venue.verified,
  };
}

/** The Where segment's vocabulary. */
export async function getSuburbs() {
  return [...new Set(VENUES.map((v) => v.suburb))].sort();
}

/** The search area's own name and centre — the frame the map opens on. */
export async function getGeofence() {
  return {
    areaName: 'Vienna & Merrifield, Virginia',
    center: { lat: CENTER.lat, lng: CENTER.lng },
  };
}
