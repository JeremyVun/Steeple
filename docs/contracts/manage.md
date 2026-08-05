# Contracts — Manage: provider self-service (was CONTRACTS §6)

> **Scope:** venue-manager-scoped venue/room CRUD, the moderation model (first-publish gate),
> room availability rules + the guest/host availability reads computed from them, and the photo
> pipeline. Every route here is manager-scoped.
> Conventions/governance (errors, enum tokens, rate limits): see `conventions.md`.
> Legend: ✅ built & live · 🔲 planned.

## Manage (provider self-service) ✅ *(built 2026-07-04 — ROADMAP Phase 5)*

All routes are venue-manager-scoped: an id the caller doesn't manage answers `404 not_found`,
identical to an unknown id (no existence leak). Rate limits: `manage` policy (30/min/account) on
every write below except photo upload, which uses `media` (12/min/account, the expensive image
pipeline). Errors are ProblemDetails with `code` ∈ `not_found | invalid_venue | invalid_room |
invalid_photo | invalid_image | invalid_verification | geofence_rejected | has_active_bookings |
no_photos | already_verified | verification_pending` (409 for `has_active_bookings`,
`already_verified`, `verification_pending`; 404 for `not_found`; 400 for the rest).

**Manage-only `status` tokens** (never on public reads — `conventions.md` §2.1):
`draft | published | unlisted`.

### Moderation model
A room that has **never** been approved (`FirstPublishedAtUtc IS NULL`) asking for
`status: "published"` doesn't publish — it stamps `PublishRequestedAtUtc` and lands in the Admin
moderation queue (`docs/ARCHITECTURE.md` owns the queue mechanics). Admin approval sets
`Published` + stamps `FirstPublishedAtUtc` (once, ever) and writes a `listingApproved`
notification to the venue's managers; decline clears the request and writes `listingDeclined`.
Listing approval is blocked until the venue is verified (a separate venue-verification
decision, below). **After first publish, unlist/relist is entirely provider-controlled** — no
further moderation. Edits a provider makes to an already-published room apply immediately
(never blocked) but stamp `ProviderEditedAtUtc`, which surfaces the room in Admin's review feed
without gating the edit.

⚠ superseded-by-adopted-decision: see `docs/backlog/v2_migration/design.md` D2 — not yet built.
(D2 replaces the two-step gate with a single human gate on a host's *first* listing, decided in
`ManageService`; trusted hosts auto-publish. The under-review wire representation — room reads
as `draft` + `publishRequestedAtUtc` — is unchanged by it.)

### Venues
- `GET /api/v1/manage/venues` ✅ → `[{id, name, slug}]` — venues the caller manages (also
  documented in `applications.md`, where clients use it as the provider-surface probe).
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
- `PATCH /api/v1/manage/rooms/{id}` ✅ — `SaveRoomRequest` (`null` = unchanged; `pricePerHour`
  is required on create and must be positive whenever supplied — `400 invalid_room` otherwise);
  `status` drives the moderation model above. Leaving `published` is
  blocked by future confirmed occurrences → `409 has_active_bookings`. Any transition **to**
  `published` (publish request or relist) requires ≥1 photo → `400 no_photos`.

Slugs (`Utils/Slugs.cs`) are derived from the name at creation and **immutable** thereafter —
renames never break a shared listing URL or SEO equity.

`Idempotency-Key` is **not** honored on the two create endpoints today (`POST /manage/venues`,
`POST /manage/venues/{id}/rooms`); a retried create makes a second row.
⚠ superseded-by-adopted-decision: see `docs/backlog/v2_migration/design.md` D8 — not yet built.

### Room availability rules (open hours + blackouts) ✅ *(built 2026-07-05 — availability plan commit 4)*

All times are venue-local wall-clock `HH:mm` (24h) strings; weekday tokens per
`conventions.md` §2.1 (`sunday`…`saturday`). Windows are `[start, end)` — end after start,
never crossing midnight.

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
  no rules rows) on the listing detail reads (`discovery.md`).

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
- **Submit hard block** ✅: `POST /listings/{roomId}/applications` rejects schedules with
  any conflicting occurrence → `409 schedule_unavailable`; the problem body carries the same
  `{available, totalOccurrences, conflicts[]}` payload. Rooms with **no** availability rules
  (legacy, pre-gate) skip the block entirely. The `booking_occurrences` exclusion constraint
  remains the final race authority (`slot_taken` on approval is unchanged).

**Host review & venue calendar ✅ *(built 2026-07-05 — availability plan commit 7)*:**

- `Application` gains additive `conflicts?` — **manager detail reads only** (never on lists or
  organizer-scoped reads; pending demand and other organizers stay host-only):
  `{totalOccurrences, conflicts: [{date, reason}], pendingOverlaps: [{applicationId,
  organizerName, overlappingDateCount}]}`. `conflicts` uses the "Guest availability reads"
  engine above (rules + confirmed bookings); `pendingOverlaps` lists other undecided
  applications for the same room whose projected dates + time ranges intersect this one's.
  Present only on undecided applications; null otherwise or when the room has no availability
  rules.
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
  `thumbUrl`, `cardUrl` are additive (`conventions.md` §1 rule); `url` stays the full-size image
  for both new and legacy (seeded) rows. Cards prefer `cardUrl`, falling back to `url` when
  unset.

Concierge (Admin) uses the same Manage/Media endpoints for onboarding — one pipeline, no
seeded-URL side door — except for the moderation decision itself, which is Admin-only (Admin
reads/writes the DB directly for its own panels; see `ARCHITECTURE.md`).
