# Steeple — CONTRACTS.md

> **The single source of truth for every wire contract in the system**: the JSON API
> (`Steeple.Api` ↔ Web, mobile), the analytics event taxonomy, and the integration
> contracts with deployed infra (flags service, edge auth). Clients mirror these shapes
> **by convention, not by shared assembly** — this document is what keeps the mirrors honest.
>
> Legend: ✅ built & live · 🔲 planned (shape agreed, not yet implemented). Planned shapes
> may still evolve; built shapes may not change except by the rules in §1.

## 1. Governance — how contracts change

**The API owns the contract.** `Steeple.Api/Contracts/` is the reference implementation;
`Steeple.Web/Models/ApiModels.cs` and `/mobile/lib/**/models/` are hand-kept mirrors.

**Change rules:**
1. **Additive is free.** New optional fields, new endpoints, new enum *values* — allowed
   any time. Clients must tolerate unknown JSON fields (Web: default; Flutter: don't use
   `checked: true` deserialization against unknown keys).
2. **Breaking requires a version bump** (`/api/v1` → `/api/v2`): removing/renaming fields,
   changing types/semantics, changing an enum's wire representation. With no external
   consumers yet, a break inside `/api/v1` is acceptable **only** if API + Web + mobile
   land in the same commit.
3. **Every contract change is one commit** touching: `Api/Contracts` → Web `ApiModels.cs`
   → mobile models (once `/mobile` exists) → **this file**. If this file disagrees with
   the code, the code is wrong or this file must be fixed in the same PR — never leave
   them diverged.
4. Deprecations: mark the field/endpoint here with the date + replacement; remove after
   all shipped clients (incl. the oldest supported mobile build) stop reading it. Mobile
   makes deprecation real: **assume any wire shape a released app build reads lives for
   ≥6 months.**

## 2. Conventions (all `/api/v1` endpoints)

| Concern | Convention |
|---|---|
| Base path | `/api/v1` ✅ (normalized 2026-07-03; the old unversioned `/api` paths were removed — no external consumers existed) |
| Casing | `camelCase` JSON (System.Text.Json defaults) |
| Timestamps | ISO 8601 UTC with `Z` suffix (`2026-07-03T14:00:00Z`) |
| Local times | Schedule fields (booking times) are **venue-local** wall-clock (`HH:mm`) + dates (`yyyy-MM-dd`); the venue's IANA `timezone` travels with them |
| IDs | GUID strings |
| Enums | Stable camelCase strings on the wire (`"children"`, `"stepFreeAccess"`, `"church"`); flags enums = string arrays. Clients humanize for display. ✅ (normalized 2026-07-03; decision log SYSTEM_DESIGN §17) |
| Pagination | Request `page` (1-based) + `pageSize` (≤100, default 24); response `{ items, totalCount, page, pageSize }` |
| Errors | RFC 9457 ProblemDetails + `code` extension: `{ type, title, status, detail?, code }`. Stable `code` values documented per endpoint (e.g. `slot_taken`, `geofence_rejected`, `turnstile_failed`, `rate_limited`) |
| Auth | `Authorization: Bearer <accessToken>` (mobile & Web-BFF server-side). Anonymous allowed on all Discovery reads |
| Idempotency | `Idempotency-Key` header (client GUID) honored on `POST` create endpoints (applications, sessions); replays return the original result |
| Rate limits | `429` + `Retry-After`. Public writable endpoints additionally require a Turnstile token field where noted |
| Unknown fields | Clients must ignore them (see §1.1) |

### 2.1 Wire enum token registry ✅

The canonical token sets (camelCase of the Persistence enum member — `FlagEnumExtensions`
is the projection). Clients must tolerate tokens not listed here (additive rule §1.1) and
humanize for display:

| Enum | Tokens |
|---|---|
| `activities` (flags) | `children, sports, community, religious, arts, education, music` |
| `amenities` (flags) | `parking, kitchen, restrooms, wifi, audioVisual, tables, chairs, heating, airConditioning, stage, piano` |
| `accessibility` (flags) | `stepFreeAccess, accessibleRestroom, accessibleParking, hearingLoop, liftAccess` |
| `daysOfWeek` (flags, `Weekdays`) | `sunday, monday, tuesday, wednesday, thursday, friday, saturday` — emitted sorted Sunday-first |
| `venueType` | `church, publicSpace, other` |
| `status` (room, Manage §6 only — never on public reads) | `draft, published, unlisted` |

Application/booking/occurrence status and notification-type tokens are enumerated at
their shapes in §5.

## 3. Discovery (✅ built at `/api/v1`)

### `GET /api/v1/listings/search` ✅
Query: `centerLat, centerLng, radiusMeters` **or** `minLat/maxLat/minLng/maxLng`;
`suburb, minCapacity, freeOnly, page, pageSize`; repeatable `activities` &
`accessibility` params. **Matching semantics:** repeated values combine into one bitmask
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
primaryPhotoUrl?, capacity, isFree, pricePerHour?, currency, latitude, longitude,
activities[], accessibility[], distanceMeters?, rating?{averageStars, count},
matchedWindow?{date?, startTime, endTime}`. `rating` is the venue-level aggregate across
all rooms and appears only when at least one rating is revealed. `matchedWindow` is
additive *(availability plan commit 6)* and present only on searches with a When filter:
the free window that satisfied the filter ("Free 6–9 PM"); `date` is set for one-off
searches, absent for recurring ones.

**When filter (time-first search) ✅ *(built 2026-07-05 — availability plan commit 6)*:**

- One-off: `date=yyyy-MM-dd` (venue-local, ≥ today) plus either
  `timeOfDay=morning|afternoon|evening` (bands 08:00–12:00 / 12:00–17:00 / 17:00–22:00) or
  explicit `startTime`/`endTime` (`HH:mm`); `date` alone means "any free window that day".
- Recurring: repeatable `daysOfWeek=tuesday&daysOfWeek=thursday` (§2.1 tokens, bound
  manually like the flags params) plus the same band/range; a room matches only when the
  slot is free on **every** matching date within the next 28 days (horizon fixed — honest
  against real bookings, cheap at beachhead scale).
- `durationMinutes` (default 120): a room matches only if a free window fits the duration;
  with an explicit `startTime`/`endTime` the requested range itself must be free.
- Semantics: free = open hours − blackouts − **confirmed** occurrences (same engine as §6
  guest reads). Malformed When params → `400 invalid_when` (never silently ignored).
  `date` + `daysOfWeek` together → `400 invalid_when`. Behind `listing.availability`
  (flag off: When params are ignored and results carry no `matchedWindow`).

### `GET /api/v1/listings/by-slug/{venueSlug}/{roomSlug}` ✅ · `GET /api/v1/listings/{id}` ✅
Response `RoomDetail`: summary fields + `description, houseRules, amenities[],
photos[{url, caption?, isPrimary, sortOrder}]`, `venue{name, slug, venueType, addressLine,
suburb, postcode, contactEmail?, parkingInfo, transitInfo, isIdentityVerified, latitude,
longitude}`, `rating?{averageStars, count}`. 404 (ProblemDetails) when unknown, **not Published** (Draft/Unlisted never
leak via direct URL), or **outside the geofence** (defense in depth).

### `GET /api/v1/venues/{id}/ratings` ✅
Public, revealed venue review comments, newest first. Returns an empty page unless the venue has
at least one Published room inside the beachhead. Hidden rows and unrevealed double-blind ratings
are excluded. Response:
`{items:[{stars, comment?, raterName, createdAtUtc}], totalCount, page, pageSize}`.

### `GET /api/v1/suburbs` ✅ → `["Vienna", …]` · `GET /api/v1/sitemap` ✅ → `[{venueSlug, roomSlug, lastModifiedUtc}]` · `GET /api/v1/geofence` ✅ → `{areaName, center, beachhead}`

🔲 v1 additions: `GET /api/v1/areas/{slug}` (area landing-page data), search gains
day/time/recurrence filters when the Bookings slice lands.

## 4. Identity ✅ *(built 2026-07-04)*

### `POST /api/v1/auth/sessions` ✅
```jsonc
// request
{ "provider": "google" | "apple", "idToken": "<provider JWT>", "nonce": "…?",
  "turnstileToken": "…?", "displayName": "…?",
  "device": { "platform": "ios|android|web", "label": "iPhone 15" } }
// 200
{ "accessToken": "<jwt ~15min>", "refreshToken": "<opaque>",
  "user": { "id": "…", "displayName": "…", "email": "…?", "createdAtUtc": "…" },
  "isNewUser": true }
```
`displayName` is an optional hint honored only when the account is first created — Apple sends
the person's name once, in the authorization response, never in the ID token. `turnstileToken`
is required wherever Turnstile is enabled (deployed env); environments without a configured
secret skip the check. Rate limited per IP (shared `auth` policy with `refresh`).

Errors: `401 invalid_id_token`, `403 turnstile_failed`, `409 use_original_provider` (the
verified email already belongs to an account on the other provider — no auto-linking),
`429 rate_limited`.

### `POST /api/v1/auth/refresh` ✅ — `{refreshToken}` → rotated `{accessToken, refreshToken}`. `401 invalid_refresh_token` (unknown/expired); reuse of a rotated token → `401 token_reuse` (whole family revoked).
### `DELETE /api/v1/auth/sessions` ✅ — revoke current session (logout; session = the access token's `sid`).
### `GET /api/v1/me` ✅ — profile + `agreements: [{docType, version, acceptedAtUtc}]`.
### `DELETE /api/v1/me` ✅ — account deletion (anonymize + revoke all sessions; Apple 5.1.1(v) requirement).
### `DELETE /api/v1/me/sessions` ✅ — revoke every session ("sign out everywhere").
### `POST /api/v1/me/agreements` ✅ — `{docType: "tos"|"privacy", version}` acceptance record; idempotent per (user, doc, version). `400 unknown_doc_type`.
### `POST /api/v1/me/devices` ✅ *(built 2026-07-04 — Phase 4)* — `{fcmToken, platform}` push registration (upsert by `fcmToken`; re-registering under a different account moves it); `DELETE /api/v1/me/devices/{token}` on logout, deletes only if owned by the caller (204 either way). `400 invalid_device` (platform not `ios`/`android`/`web`, or `fcmToken` empty/over 512 chars). Account deletion removes the caller's device rows.

> Deviation note: `Idempotency-Key` (§2) is not yet honored on `auth/sessions` — a replayed
> sign-in just issues another session, which is harmless. It becomes real with
> `applications` (Phase 2), where replays would create duplicate rows.

## 5. Applications, notifications ✅ *(built 2026-07-04 — ROADMAP Phase 2)*, bookings ✅ *(built 2026-07-04 — Phase 3)*

### `POST /api/v1/listings/{roomId}/applications` ✅ (auth + Turnstile + Idempotency-Key + rate limit)
```jsonc
{ "activityType": "children", "groupSize": 15,
  "schedule": { "frequency": "recurringWeekly" | "oneOff",
                "startDate": "2026-09-01", "endDate": "2026-12-15",   // endDate mandatory when recurring
                "daysOfWeek": ["tuesday", "thursday"], "startTime": "09:00", "endTime": "11:30" },
  "intentText": "Toddler playgroup, ~15 people…", "turnstileToken": "…" }
```
`schedule.daysOfWeek` *(replaced `dayOfWeek: string` 2026-07-05 — clean break, no released
clients)*: array of §2.1 weekday tokens (`"sunday"`…`"saturday"`), **one or more, distinct,
emitted sorted Sunday-first**; required when `frequency` is `recurringWeekly`, must be
null/absent for `oneOff`. Multi-day = one application/booking (e.g. Tue+Thu weekly is a
single request materializing occurrences on both days).

→ `201 Application` (an `Idempotency-Key` replay returns the original as `200`). Errors:
`400 invalid_application` (bad token / malformed or unbounded schedule / past start date),
`403 turnstile_failed`, `404 room_not_bookable` (unknown **and** unpublished rooms answer
identically — no existence leak), `404 geofence_rejected` (reserved, defense in depth),
`409 schedule_unavailable` (any occurrence outside open hours / on a blackout / already booked —
body carries the per-date conflict list, §6 "Guest availability reads"; skipped for rooms with
no availability rules), `429 rate_limited` (per-account `apply` policy, shared with messages).

`Application` ✅: `{ id, roomId, roomName, venueName, venueSlug, roomSlug,
organizer{id, displayName, ratingSummary?{averageStars, ratingCount, noShowCount,
completedBookings}}, activityType, groupSize,
schedule{…}, intentText, status, createdAtUtc, decidedAtUtc?, expiresAtUtc,
bookingId? /* set once approved — the booking it created */, messageCount,
messages: [{id, senderId, body, sentAtUtc}] }`
`status`: `pending | needsInfo | approved | declined | withdrawn | expired`. List endpoints
return `messages: []` (thread stays behind the detail fetch); `messageCount` is always set.
Undecided applications auto-expire 14 days after submission (lazy sweep on read — no worker).

- `GET /api/v1/me/applications` ✅ (organizer) · `GET /api/v1/manage/applications` ✅ (provider
  inbox; empty list — not an error — for non-managers) — §2 pagination, filter by `status`.
- `GET /api/v1/applications/{id}` ✅ — full `Application` incl. `messages` (party-scoped: organizer or a `venue_manager` of the room's venue; others 404). The thread screen's fetch.
- `POST /api/v1/applications/{id}/messages` ✅ — `{body}` (either party; the "ask" thread). A
  provider message on `pending` → `needsInfo`; the organizer's answer → back to `pending`.
  Errors: `409 invalid_state` once decided, `400 invalid_application`, `429 rate_limited`.
- `POST /api/v1/applications/{id}/decision` ✅ (provider) — `{decision: "approve"|"decline", message?}`.
  `403 not_venue_manager` · `409 invalid_state` once decided. ✅ Phase 3: **approve is the
  booking transaction** (status flip + booking + occurrences commit atomically); when the
  exclusion constraint fires → `409 slot_taken` and the application is **auto-declined**
  with the organizer notified.
- `POST /api/v1/applications/{id}/withdraw` ✅ (organizer). `409 invalid_state` once decided.

### `GET /api/v1/manage/venues` ✅ → `[{id, name, slug}]` — venues where the caller is a `venue_manager` (empty for non-providers); clients use it to decide whether to show a provider surface. Full CRUD lives in §6.

### Bookings ✅ *(built 2026-07-04 — created only by approval; there is deliberately no `POST /bookings`)*
`Booking` ✅: `{ id, applicationId, roomId, roomName, venueName, venueSlug, roomSlug,
venueTimezone, organizerId, organizerName, type: "oneOff"|"recurring", startDate, endDate,
schedule{…}, status: "confirmed"|"completed"|"cancelled", createdAtUtc,
cancelledBy?, cancelledAtUtc?, cancelReason?,
nextOccurrence? /* the next live occurrence — set on lists too */,
occurrences: [{id, startUtc, endUtc, localDate, status: "scheduled"|"occurred"|"noShow"|"cancelled", noShowMarkedBy?}],
ratings?{byOrganizer?{stars, comment?, createdAtUtc}, byVenue?{stars, comment?, createdAtUtc}, canRate, rateByUtc?} }`
List endpoints return `occurrences: []` (the set stays behind the detail fetch);
`nextOccurrence` is always populated where one exists. `localDate` and `schedule` are
venue-local; `startUtc/endUtc` are the DST-correct instants. Reads apply the lazy sweeps
(past occurrences → `occurred`, finished terms → `completed`, the one renewal-due nudge) —
no background worker.

- `GET /api/v1/me/bookings` ✅ · `GET /api/v1/manage/bookings` ✅ (empty list for
  non-managers) · `GET /api/v1/bookings/{id}` ✅ (party-scoped; others 404) — §2 pagination,
  filter by `status`.
- `POST /api/v1/bookings/{id}/cancel` ✅ — `{reason?}` (≤500 chars), either party.
  **Notice window (48h):** occurrences starting beyond it are cancelled and freed;
  nearer ones still stand (and remain no-show markable). Other party notified.
  Errors: `409 invalid_state` (not confirmed), `400 invalid_booking`, `429 rate_limited`.
- `POST /api/v1/occurrences/{id}/no-show` ✅ — no body; either party marks the other on a
  past, non-cancelled occurrence (feeds ratings, Phase 6). `409 invalid_state` when future,
  cancelled, or already marked.
- `POST /api/v1/bookings/{id}/ratings` ✅ — `{stars: 1..5, comment?}` (`comment` ≤1000
  chars, trimmed, whitespace-only stored as null); party-scoped, direction inferred
  from the caller (organizer → venue, venue manager → organizer), one immutable row per
  direction. Opens after the booking has a past `occurred`/`noShow` occurrence; closes 14 days
  after completion/cancellation. `204` on success. Errors: `400 invalid_rating`,
  `409 invalid_state`, `404 not_found`, `429 rate_limited`.

### Notifications (inbox = truth) ✅
`GET /api/v1/me/notifications?after=<cursor>&pageSize=` →
`{ items: [{id, type, createdAtUtc, readAt?, payload{…}}], nextCursor? }` — newest first;
`after` is the opaque `nextCursor` from the previous page (unreadable cursors read from the top).
`type` ∈ `applicationReceived | applicationMessage | applicationApproved |
applicationDeclined | bookingCancelled | renewalDue | ratingReceived | listingApproved |
listingDeclined` (additive).
`payload` for the application types: `{applicationId, roomId, roomName, venueName, venueSlug,
roomSlug, organizerName, status, deepLink}` (deepLink = the §9 canonical path); for
`bookingCancelled`/`renewalDue`: the same display fields with `bookingId` and
`deepLink: "/bookings/{id}"`; for `ratingReceived`: the same booking display fields with
`bookingId` and `deepLink: "/bookings/{id}"` but no stars/comment; for
`listingApproved`/`listingDeclined` (written by Admin on a
moderation decision, §6): `{roomId, roomName, venueName, venueSlug, roomSlug, status: "published"
| "declined", note?, deepLink}` (`note` is the operator's optional decline/approve comment;
`deepLink` is `/space/{venueSlug}/{roomSlug}` on approval, `/inbox` on decline).
`POST /api/v1/me/notifications/read` — `{ids: […]}` (foreign/unknown ids ignored). FCM pushes
carry `{notificationId, type, deepLink}` only — the inbox row is the payload of record.
Email fan-out (Resend adapter behind `IEmailGateway`) and push fan-out (FCM adapter behind
`IPushGateway` ✅, built 2026-07-04) are both fire-and-forget on the same events; without a
configured `Email:ApiKey` / `Push:ServiceAccountJson[Path]` the API logs sends instead (dev).

## 6. Manage (provider self-service) ✅ *(built 2026-07-04 — ROADMAP Phase 5)*

All routes are venue-manager-scoped: an id the caller doesn't manage answers `404 not_found`,
identical to an unknown id (no existence leak). Rate limits: `manage` policy (30/min/account) on
every write below except photo upload, which uses `media` (12/min/account, the expensive image
pipeline). Errors are ProblemDetails with `code` ∈ `not_found | invalid_venue | invalid_room |
invalid_photo | invalid_image | invalid_verification | geofence_rejected | has_active_bookings |
no_photos | already_verified | verification_pending` (409 for `has_active_bookings`,
`already_verified`, `verification_pending`; 404 for `not_found`; 400 for the rest).

**Manage-only `status` tokens** (never on public reads — §2.1): `draft | published | unlisted`.

### Moderation model
A room that has **never** been approved (`FirstPublishedAtUtc IS NULL`) asking for
`status: "published"` doesn't publish — it stamps `PublishRequestedAtUtc` and lands in the Admin
moderation queue (`docs/ARCHITECTURE.md` owns the queue mechanics). Admin approval sets
`Published` + stamps `FirstPublishedAtUtc` (once, ever) and writes a `listingApproved`
notification to the venue's managers; decline clears the request and writes `listingDeclined`.
**After first publish, unlist/relist is entirely provider-controlled** — no further moderation.
Edits a provider makes to an already-published room apply immediately (never blocked) but stamp
`ProviderEditedAtUtc`, which surfaces the room in Admin's review feed without gating the edit.

### Venues
- `GET /api/v1/manage/venues` ✅ → `[{id, name, slug}]` — venues the caller manages (§5).
- `GET /api/v1/manage/venues/{id}` ✅ → `ManagedVenueDetailDto`: `{id, name, slug, description,
  venueType, addressLine, suburb, postcode, contactEmail?, parkingInfo, transitInfo, latitude,
  longitude, timezone, isIdentityVerified, verificationStatus, verificationRequestedAtUtc?,
  rooms: [ManagedRoomSummaryDto]}`. `verificationStatus` ∈ `unverified | pending | verified |
  declined` and summarizes the latest host verification request plus the venue's verified flag.
- `POST /api/v1/manage/venues` ✅ — `SaveVenueRequest` (name/description/address/suburb/postcode
  required on create); the caller becomes the first `venue_manager`. Address is geocoded
  server-side (`IGeocodingGateway`) and geofence-checked → `400 geofence_rejected` outside the
  beachhead. `201` with the created `ManagedVenueDetailDto`.
- `PATCH /api/v1/manage/venues/{id}` ✅ — same `SaveVenueRequest` shape; `null` fields mean
  "unchanged". Address-affecting changes re-geocode (same geofence check) and stamp
  `ProviderEditedAtUtc`.
- `SaveVenueRequest.timezone` ✅ *(additive 2026-07-05)* — IANA identifier (must contain `/`
  and resolve, e.g. `"America/New_York"`); invalid → `400 invalid_venue`. Create default:
  `America/New_York` (single-timezone beachhead). Changing it while the venue has upcoming
  confirmed occurrences → `409 has_active_bookings` (existing bookings were promised at their
  current venue-local times); same value re-sent is always fine.
- `POST /api/v1/manage/venues/{id}/verification` ✅ — `SubmitVenueVerificationRequest`:
  `{contactName, contactEmail?, evidenceSummary, attestedAuthority, documents:[{label,url}]}`
  where `documents` has 1–5 HTTP(S) links to externally hosted/signed proof documents (lease,
  deed, authorization letter, etc.). The API stores labels/links and review metadata only; it
  does **not** store raw document contents. `200 ManagedVenueDetailDto` with
  `verificationStatus: "pending"`. Errors: `400 invalid_verification`, `409 already_verified`,
  `409 verification_pending`.

### Rooms
- `GET /api/v1/manage/rooms/{id}` ✅ → `ManagedRoomDto`: `{id, venueId, venueName, venueSlug,
  name, slug, description, capacity, pricePerHour?, currency, houseRules, status,
  publishRequestedAtUtc?, firstPublishedAtUtc?, activities[], amenities[], accessibility[],
  photos: [RoomPhotoDto], updatedAtUtc}`.
- `POST /api/v1/manage/venues/{id}/rooms` ✅ — `SaveRoomRequest`; creates the room in `draft`
  under the managed venue. `201`.
- `PATCH /api/v1/manage/rooms/{id}` ✅ — `SaveRoomRequest` (`null` = unchanged; non-positive
  `pricePerHour` = free); `status` drives the moderation model above. Leaving `published` is
  blocked by future confirmed occurrences → `409 has_active_bookings`. Any transition **to**
  `published` (publish request or relist) requires ≥1 photo → `400 no_photos`.

Slugs (`Utils/Slugs.cs`) are derived from the name at creation and **immutable** thereafter —
renames never break a shared listing URL or SEO equity.

### Room availability rules (open hours + blackouts) ✅ *(built 2026-07-05 — availability plan commit 4)*

All times are venue-local wall-clock `HH:mm` (24h) strings; weekday tokens per §2.1
(`sunday`…`saturday`). Windows are `[start, end)` — end after start, never crossing midnight.

- `GET /api/v1/manage/rooms/{id}/availability` ✅ (manager-scoped) → `RoomAvailabilityRulesDto`:
  `{roomId, timezone, days: [{dayOfWeek, windows: [{startTime, endTime}]}], blackouts:
  [{date, reason?}]}`. Always emits all seven days Sunday-first (closed day = empty `windows`);
  blackouts sorted ascending.
- `PUT /api/v1/manage/rooms/{id}/availability` ✅ (manager-scoped) — `{days?, blackouts?}`,
  **replace-all** (the saved state is exactly the payload; omitted weekday = closed). `200` with
  the saved rules. `400 invalid_availability` when: unknown/duplicate weekday token, bad `HH:mm`,
  end ≤ start, >6 windows in a day, overlapping windows within a day (touching endpoints are
  fine), >200 blackouts, past blackout date, or `reason` >200 chars.
- **Publish gate**: behind flag `manage.open_hours_required`, any transition to `published`
  additionally requires ≥1 open-hours window → `400 no_open_hours` (mirrors `no_photos`; the
  009 backfill seeded every already-published room, so nothing unpublishes when the flag turns on).
- Public `RoomDetailDto` gains additive `openHours?` (same `days` shape, null when the room has
  no rules rows) on the listing detail reads.
**Guest availability reads ✅ *(built 2026-07-05 — availability plan commit 5)*:**

- `GET /api/v1/listings/{roomId}/availability?from&to` ✅ (anonymous; published-gated — Draft/
  Unlisted answer 404 like every public listing read) → `RoomAvailabilityDto`: `{roomId,
  timezone, from, to, days: [{date, isBlackout, freeWindows: [{startTime, endTime}]}]}`.
  `freeWindows` = open hours − blackouts − **confirmed** booked time (pending demand is never
  leaked), `[)` venue-local intervals. Limits: `from` ≥ today (venue-local), `to` ≥ `from`,
  range ≤ 92 days → `400 invalid_range`.
- `POST /api/v1/listings/{roomId}/availability/check` ✅ (anonymous, per-IP `availability`
  policy 30/min) — `{schedule: ScheduleDto}` (same shape the apply form submits) →
  `ScheduleCheckResultDto`: `{available, totalOccurrences, conflicts: [{date, reason}]}` with
  `reason` ∈ `outsideOpenHours | blackout | booked`. Advisory dry-run of the submit-time block.
- **Submit hard block** ✅: `POST /listings/{roomId}/applications` now rejects schedules with
  any conflicting occurrence → `409 schedule_unavailable`; the problem body carries the same
  `{available, totalOccurrences, conflicts[]}` payload. Rooms with **no** availability rules
  (legacy, pre-gate) skip the block entirely. The `booking_occurrences` exclusion constraint
  remains the final race authority (`slot_taken` on approval is unchanged).

**Host review & venue calendar ✅ *(built 2026-07-05 — availability plan commit 7)*:**

- `Application` gains additive `conflicts?` — **manager detail reads only** (never on lists or
  organizer-scoped reads; pending demand and other organizers stay host-only):
  `{totalOccurrences, conflicts: [{date, reason}], pendingOverlaps: [{applicationId,
  organizerName, overlappingDateCount}]}`. `conflicts` uses the §"Guest availability reads"
  engine (rules + confirmed bookings); `pendingOverlaps` lists other undecided applications
  for the same room whose projected dates + time ranges intersect this one's. Present only on
  undecided applications; null otherwise or when the room has no availability rules.
- `GET /api/v1/manage/venues/{id}/calendar?from&to` ✅ (manager-scoped; range ≤ 92 days →
  `400 invalid_range`) → `VenueCalendarDto`: `{venueId, timezone, from, to, rooms: [{id,
  name}], occurrences: [{bookingId, roomId, organizerName, localDate, startTime, endTime,
  status}], pending: [{applicationId, roomId, organizerName, startTime, endTime, dates: []}]}`.
  Occurrences are confirmed bookings' scheduled/occurred occurrences in the range; `pending`
  projects undecided applications' would-be dates (an overlay, not a commitment).

### Photos
- `POST /api/v1/manage/rooms/{id}/photos` ✅ — multipart `file` (≤10 MB, enforced by Kestrel
  before the pipeline runs) + optional `caption`. Server decodes (decode failure → `400
  invalid_image`), auto-orients from EXIF, strips **all** metadata (EXIF/XMP/IPTC — GPS
  included), encodes JPEG variants at 400/800/1600px (no upscaling smaller sources), and keys
  them by a SHA-256 content hash. `201 RoomPhotoDto`.
- `PATCH /api/v1/manage/photos/{photoId}` ✅ — `UpdatePhotoRequest {caption?, isPrimary?,
  sortOrder?}`; setting `isPrimary` demotes the previous cover. `400 invalid_photo`.
- `DELETE /api/v1/manage/photos/{photoId}` ✅ — deletes the row first, then best-effort deletes
  the stored variants. `204`.
- `RoomPhotoDto` ✅: `{id, url, thumbUrl?, cardUrl?, caption?, isPrimary, sortOrder}` — `id`,
  `thumbUrl`, `cardUrl` are additive (§1 rule); `url` stays the full-size image for both new and
  legacy (seeded picsum) rows. Cards prefer `cardUrl`, falling back to `url` when unset.

Concierge (Admin) uses the same Manage/Media endpoints for onboarding — one pipeline, no
seeded-URL side door — except for the moderation decision itself, which is Admin-only (Admin
reads/writes the DB directly for its own panels; see `ARCHITECTURE.md`).

## 7. Analytics events

**Ingest** ✅ *(built 2026-07-04 — ROADMAP Phase 4)*: `POST /api/v1/events` (anonymous OK — a
valid bearer token still enriches with `userId`; per-IP `events` rate-limit policy, 60/min; no
Turnstile — the allowlist + drop rules below are the abuse defense)
```jsonc
{ "sessionId": "<client guid>", "events": [
    { "name": "map_interacted", "occurredAt": "…Z", "props": { "kind": "pan" } } ] }
```
`202` always (fire-and-forget; never throws). Only the client-sourced taxonomy rows below are
accepted — everything else, plus batches over 50 events, names over 64 chars, and props over
~2KB serialized, is silently dropped. Server enriches accepted events (`userId` if authed,
`uaClass`: mobile/desktop/bot from a cheap User-Agent sniff, `sessionId`, `occurredAt` (client) +
`receivedAt` (server clock)) and writes one JSON line per event to stdout → Promtail → Loki
(SYSTEM_DESIGN §12) via the existing `IAnalyticsSink`.

**Taxonomy** (PRD funnel; server-authoritative events are *only* ever emitted server-side):

| Event | Source | Key props |
|---|---|---|
| `search_performed` ✅ | server | filters, resultCount, zeroResult (+ additive: hasWhenFilter, whenMode `oneOff\|recurring\|none`, timeOfDay?, weekdayCount?) |
| `listing_viewed` ✅ | server | roomId, venueId |
| `map_interacted` ✅ | client | kind (pan/zoom/pin) |
| `application_started` ✅ / `application_submitted` ✅ | web BFF¹ / server | roomId; activityType, frequency, groupSize |
| `sso_started` ✅ / `sso_completed` ✅ | web BFF¹ / server | provider?, surface, trigger / provider, surface, isNewUser |
| `application_decided` ✅ | server | outcome, timeToDecisionHours (+ `autoDeclined, reason: "slot_taken"` on the race-lost path) |
| `booking_confirmed` ✅ / `booking_cancelled` ✅ / `no_show_marked` ✅ | server | bookingId, type, occurrenceCount / cancelledBy / markedBy |
| `rating_submitted` ✅ | server | rateeType, stars, hasComment |
| `notification_sent` ✅ / `notification_opened` ✅ | server / client | type, channel, recipientCount |
| `venue_created` ✅ / `room_created` ✅ | server | venueId, suburb / roomId, venueId |
| `venue_verification_requested` ✅ | server | venueId, documentCount |
| `venue_verification_decided` ✅ | Admin (stdout only) | venueId, requestId, outcome (approved/declined), actor |
| `listing_publish_requested` ✅ | server | roomId, venueId |
| `photo_uploaded` ✅ | server | roomId, photoId |
| `open_hours_updated` ✅ | server | roomId, windowCount, blackoutCount |
| `availability_viewed` ✅ | server | roomId, dayCount |
| `availability_checked` ✅ | server | roomId, available, conflictCount |
| `listing_moderated` ✅ | Admin (stdout only — not `IAnalyticsSink`; same log-line shape) | roomId, outcome (approved/declined), actor |

¹ Interim: these client-ish funnel events are still emitted server-side by the Web BFF
(`IWebAnalytics`, same stdout log line shape) rather than by calling the now-built
`POST /api/v1/events` from the browser — that migration is separate follow-up work, not part of
landing the Ingest endpoint itself. `sso_started` at the apply gate carries `trigger` instead of
`provider` (the provider isn't chosen yet at that point). `map_interacted` and
`notification_opened` are the two client-sourced rows the mobile app (and, once migrated, Web)
call the Ingest endpoint for directly; the Ingest allowlist is exactly these four rows
(`map_interacted`, `application_started`, `sso_started`, `notification_opened`) — everything else
is server-authoritative and rejected if a client attempts to submit it.

Naming: `snake_case`, past tense. Adding an event = update this table + emit + (if
client-sourced) add to both client batchers.

## 8. Feature flags service (deployed infra)

- `GET /flags` → snapshot `[{key, enabled/rule-set …}]`; `GET /flags/stream` → SSE updates.
  Steeple services consume via `Steeple.FlagsSdk` (in-memory cache, local evaluation,
  Perchd rule semantics: ordered condition rules, AND groups, default rule, deterministic
  percentage rollouts). Never block a request on the flags service.
- **Mobile/web-client flags** are proxied: `GET /api/v1/flags?platform=ios|android|web&build=<int>` ✅
  *(built 2026-07-04 — ROADMAP Phase 4)* returns the **public** flags evaluated for the caller's
  context as `{key: bool}` — clients never talk to the flags service directly, and private/ops
  flags never leave the backend. The public set is an explicit hardcoded allowlist in
  `PublicFlagsService`: `mobile.apply_enabled`, `mobile.manage_enabled`, `mobile.force_upgrade`.
  The `platform`/`build` query params feed rule conditions server-side, so value-shaped concerns
  stay boolean on the wire — today only `mobile.force_upgrade` reads `build` (a config-backed
  `Flags:MobileMinSupportedBuild` threshold: enabled when `build` is present and below it). Like
  Web's flags (CLAUDE.md carry-over), the Api's `IFeatureFlags` is config-backed
  (`Flags:<key>` section) until the flags SDK has a home in this repo — evaluation is local
  config reads only, never a network call either way.
- Naming: `<surface|domain>.<feature>` — e.g. `web.apply_from_browser`,
  `booking.recurring_materialization`, `trust.phone_otp_stepup`.

## 9. Non-API integration contracts

- **Admin edge auth (authelia):** Admin is only reachable through the authelia-gated
  hostname; it trusts the forwarded identity header (`Remote-User`) for audit
  attribution. Containers must not be reachable except via the edge proxy.
- **`X-Forwarded-Prefix`:** Web & Admin map it to `PathBase` (sub-path hosting). All
  emitted URLs must derive from `~/`-relative helpers — see CLAUDE.md.
- **Deep links** ✅ *(Web files built 2026-07-04 — ROADMAP Phase 4)*: Web serves
  `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`, config-driven
  (`DeepLinks:AppleAppId`, `DeepLinks:AndroidPackage`, `DeepLinks:AndroidSha256Fingerprints`) —
  absent config 404s both rather than serving a bogus association (dev default, until the mobile
  app is registered). AASA covers `applinks.details[].paths: ["/space/*"]`. The canonical listing
  URL `https://<host>/space/{venueSlug}/{roomSlug}` must open the app's listing screen when
  installed (fallback: web page). Custom scheme `steeple://` for auth callbacks only.
- **Push payload** ✅ *(built 2026-07-04 — ROADMAP Phase 4, `IPushGateway`)*: FCM data messages
  `{notificationId, type, deepLink}`; render from the inbox, never trust push content as the
  record. `deepLink` is a **path-only canonical path** from the client deep-link registry
  (`docs/MOBILE_CONTRACTS.md` §7): `/inbox/applications/{id}`, `/bookings/{id}`, `/inbox`,
  `/space/{venueSlug}/{roomSlug}`. Clients route unknown values to browse, never an error.
