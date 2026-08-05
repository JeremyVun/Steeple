# Contracts — Discovery (was CONTRACTS §3)

> **Scope:** the anonymous public read surface at `/api/v1` — listing search (incl. the When
> filter), listing detail by id/slug, venue ratings, suburbs, sitemap, geofence.
> Conventions/governance (casing, errors, pagination, enum tokens): see `conventions.md`.
> Legend: ✅ built & live · 🔲 planned.

## Discovery (✅ built at `/api/v1`)

### `GET /api/v1/listings/search` ✅
Query: `centerLat, centerLng, radiusMeters` **or** `minLat/maxLat/minLng/maxLng`;
`suburb, minCapacity, page, pageSize`; repeatable `activities`, `accessibility` &
`amenities` params (`amenities` additive 2026-07-08 — `conventions.md` §2.1 tokens, e.g.
`amenities=parking`). **Matching semantics:** repeated values combine into one bitmask
and a room matches only if it accepts/provides **all** requested values (AND — deliberate:
"accepts children AND music", "has step-free access AND accessible restroom"). Geofence
clamps all input to the beachhead (out-of-area → empty result, never an error).

Response `ListingSearchResult`:
```jsonc
{
  "items": [RoomSummary],
  "totalCount": 42, "isZeroResult": false,          // zeroResult = the liquidity metric
  "appliedBounds": {"minLat":…,"maxLat":…,"minLng":…,"maxLng":…},
  "center": {"latitude":…,"longitude":…} | null,
  "page": 1, "pageSize": 24
}
```

`RoomSummary`: `roomId, venueId, roomSlug, venueSlug, roomName, venueName, suburb,
primaryPhotoUrl?, capacity, pricePerHour, currency, latitude, longitude,
activities[], accessibility[], amenities[], distanceMeters?, rating?{averageStars, count},
matchedWindow?{date?, startTime, endTime}`. `amenities[]` is additive (2026-07-08; powers
card-level cues like "Parking"). `pricePerHour` is always present and positive —
free listings were removed from the product (SYSTEM_DESIGN §17). `rating` is the venue-level
aggregate across all rooms and appears only when at least one rating is revealed.
`matchedWindow` is additive *(availability plan commit 6)* and present only on searches with
a When filter: the open window that satisfied the filter (rendered "Open 6–9 PM"); `date` is
set for one-off searches, absent for recurring ones.

**When filter (time-first search) ✅ *(built 2026-07-05 — availability plan commit 6)*:**

- One-off: `date=yyyy-MM-dd` (venue-local, ≥ today) plus either
  `timeOfDay=morning|afternoon|evening` (bands 08:00–12:00 / 12:00–17:00 / 17:00–22:00) or
  explicit `startTime`/`endTime` (`HH:mm`); `date` alone means "any free window that day".
- Recurring: repeatable `daysOfWeek=tuesday&daysOfWeek=thursday` (`conventions.md` §2.1
  tokens, bound manually like the flags params) plus the same band/range; a room matches only
  when the slot is free on **every** matching date within the next 28 days (horizon fixed —
  honest against real bookings, cheap at beachhead scale).
- `durationMinutes` (default 120): a room matches only if a free window fits the duration;
  with an explicit `startTime`/`endTime` the requested range itself must be free.
- Semantics: free = open hours − blackouts − **confirmed** occurrences (same engine as the
  guest availability reads in `manage.md`). Malformed When params → `400 invalid_when`
  (never silently ignored). `date` + `daysOfWeek` together → `400 invalid_when`. Behind
  `listing.availability` (flag off: When params are ignored and results carry no
  `matchedWindow`).

### `GET /api/v1/listings/by-slug/{venueSlug}/{roomSlug}` ✅ · `GET /api/v1/listings/{id}` ✅
Response `RoomDetail`: summary fields + `description, houseRules, amenities[],
photos[{url, caption?, isPrimary, sortOrder}]`, `venue{name, slug, venueType, addressLine,
suburb, postcode, contactEmail?, parkingInfo, transitInfo, isIdentityVerified, latitude,
longitude}`, `rating?{averageStars, count}`. 404 (ProblemDetails) when unknown, **not
Published** (Draft/Unlisted never leak via direct URL), or **outside the geofence**
(defense in depth).

`RoomDetail` also carries additive `openHours?` (the `days` shape from the availability rules
in `manage.md`; null when the room has no rules rows).

### `GET /api/v1/venues/{id}/ratings` ✅
Public, revealed venue review comments, newest first. Returns an empty page unless the venue has
at least one Published room inside the beachhead. Hidden rows and unrevealed double-blind ratings
are excluded. Response:
`{items:[{stars, comment?, raterName, createdAtUtc}], totalCount, page, pageSize}`.

### `GET /api/v1/suburbs` ✅ → `["Vienna", …]` · `GET /api/v1/sitemap` ✅ → `[{venueSlug, roomSlug, lastModifiedUtc}]` · `GET /api/v1/geofence` ✅ → `{areaName, center, beachhead}`

Anonymous guest availability reads for a listing (`GET /listings/{roomId}/availability`,
`POST /listings/{roomId}/availability/check`) are specified in `manage.md` alongside the rules
that produce them.

🔲 v1 additions: `GET /api/v1/areas/{slug}` (area landing-page data).
