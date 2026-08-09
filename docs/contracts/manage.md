# Contracts — Manage: provider self-service (was CONTRACTS §6)

> **Scope:** venue-manager-scoped venue/room CRUD, the moderation model (first-publish gate),
> room availability rules + the guest/host availability reads computed from them, and the photo
> pipeline. Manage resource routes are manager-scoped; address suggestions require only a signed-in
> account, and the two guest availability routes are anonymous.
> Conventions/governance (errors, enum tokens, rate limits): see `conventions.md`.
> Legend: ✅ built & live · 🔲 planned.

## Manage (provider self-service) ✅ *(built 2026-07-04 — ROADMAP Phase 5)*

Manage resource routes are venue-manager-scoped: an id the caller doesn't manage answers `404 not_found`,
identical to an unknown id (no existence leak). Rate limits: `manage` policy (30/min/account) on
every **manage** write below except photo upload, which uses `media` (12/min/account, the
expensive image pipeline); the anonymous availability check uses `availability` (30/min/IP).
Errors are ProblemDetails with `code` ∈ `not_found | invalid_venue | invalid_room |
invalid_photo | invalid_image | invalid_verification | has_active_bookings |
operator_unlisted | no_photos | no_open_hours | invalid_availability | invalid_range |
already_verified | verification_pending` (409 for
`has_active_bookings`, `operator_unlisted`, `already_verified`, `verification_pending`; 404 for
`not_found`; 400 for the rest).

**Manage-only `status` tokens** (never on public reads — `conventions.md` §2.1):
`draft | published | unlisted`.

### Moderation model — one human gate per host ✅ *(reinstated 2026-08-09)*
The gate is a **host's first listing**, and `ManageService` is its single enforcement point.
It applies only while server-side flag `manage.first_listing_review_required` is enabled (the
default); disabling it sends first listings through the same automatic path as trusted hosts.
Trust is derived rather than stored: a caller is trusted when they manage any room whose
`FirstPublishedAtUtc` is set. Any transition to `status: "published"` first clears the automatic gates
(≥1 photo → `no_photos`; open hours behind `manage.open_hours_required` → `no_open_hours`).
Then:

- **Trusted host** — later rooms and venues publish immediately:
  `Published` + `FirstPublishedAtUtc` stamped, no queue, no `publishRequestedAtUtc`.
- **New host** — their first listing stamps `PublishRequestedAtUtc` and waits. Wire
  representation is unchanged: the room reads as `status: "draft"` with `publishRequestedAtUtc`
  set to its manager, and 404s publicly. An explicit `draft`/`unlisted` PATCH withdraws it.
  An operator decides it once in Admin (`docs/ARCHITECTURE.md` owns the queue mechanics):
  approve → `Published` + `FirstPublishedAtUtc` (once, ever) + `listingApproved` notification;
  decline → request cleared, note recorded, `listingDeclined`. Approval makes every later listing
  from that host self-serve, including rooms at a newly created venue.
- **Review flag disabled** — a new host's first listing publishes immediately, stamps
  `FirstPublishedAtUtc`, verifies the venue, and emits `listing_moderated` with
  `actor: "auto:review_disabled"`; it never joins the review queue.
- **Invariant: published ⇒ venue verified.** Every publish path sets
  `Venue.IsIdentityVerified` (`isIdentityVerified: true` on the venue reads) — the badge means
  "belongs to a vetted host". There is no separate venue-verification decision.
- **After first publish, ordinary unlist/relist is provider-controlled.** Edits to an
  already-published room apply immediately (never blocked) but stamp
  `ProviderEditedAtUtc` as a dormant abuse-response seam.
- An operator **Unlist** is a durable abuse takedown: it immediately stamps
  `OperatorUnlistedAtUtc/By`, clears a pending request, and returns `409 operator_unlisted` on
  every manager attempt to republish. Existing bookings remain for separate operator handling.

### Venues
- `GET /api/v1/manage/venues` ✅ → `[{id, name, slug}]` — venues the caller manages (also
  documented in `applications.md`, where clients use it as the provider-surface probe).
- `GET /api/v1/manage/venues/{id}` ✅ → `ManagedVenueDetailDto`: `{id, name, slug, description,
  venueType, addressLine, suburb, postcode, contactEmail?, parkingInfo, transitInfo, latitude,
  longitude, timezone, isIdentityVerified, verificationStatus, verificationRequestedAtUtc?,
  rooms: [ManagedRoomSummaryDto], bookingMode /* additive 2026-08-05: "instant"|"manual" —
  the host's stored choice, in effect as stored (2026-08-08 — no longer gated on
  `payments.enabled`; the public read emits it verbatim, `discovery.md`). The short-lived
  `instantBookingActive` field (2026-08-07) was removed with the decoupling, one day old,
  no released clients. */}`.
  `verificationStatus` ∈ `unverified | pending | verified |
  declined` and summarizes the latest host verification request plus the venue's verified flag.
- `POST /api/v1/manage/venues` ✅ — `SaveVenueRequest` (name/description/address required on
  create; suburb/postcode optional since 2026-08-07 — the web form stopped asking and derives
  them from the picked suggestion, falling back to parsing its label); the caller becomes the
  first `venue_manager`. Address is geocoded server-side (`IGeocodingGateway`); any geocodable
  location is accepted. `201` with the created `ManagedVenueDetailDto`.
- `GET /api/v1/manage/address-suggestions?q=` ✅ *(additive 2026-08-07)* — address typeahead
  for the venue address form. Signed-in, `manage` rate-limit policy. →
  `[{label, latitude, longitude, addressLine?, suburb?, postcode?}]` (≤ 6; structured parts
  null when the provider doesn't break the address down — clients fall back to the label).
  Input under 3 chars **and** provider outages both answer `[]`, never an error. Backed by
  `IGeocodingGateway.AutocompleteAsync` (Apple Maps Server adapter in production; canned local
  suggestions from the dev stub).
- `PATCH /api/v1/manage/venues/{id}` ✅ — same `SaveVenueRequest` shape; `null` fields mean
  "unchanged". Address-affecting changes re-geocode and stamp
  `ProviderEditedAtUtc`.
- `SaveVenueRequest.bookingMode` ✅ *(additive 2026-08-05 — `docs/backlog/booking-modes.md`)* —
  `"instant" | "manual"`; null = unchanged; create default **instant**. Unknown token →
  `400 invalid_venue`. Read at submit time only: flipping the mode never touches pending
  applications or confirmed bookings.
- `SaveVenueRequest.timezone` ✅ *(additive 2026-07-05)* — IANA identifier (must contain `/`
  and resolve, e.g. `"America/New_York"`); invalid → `400 invalid_venue`. Create default:
  `America/New_York` (single-timezone beachhead). Changing it while the venue has upcoming
  confirmed occurrences → `409 has_active_bookings` (existing bookings were promised at their
  current venue-local times); same value re-sent is always fine.
- `POST /api/v1/manage/venues/{id}/verification` ✅ — evidence for the first-listing review;
  it has no decision of its own (the listing decision marks it decided, so a declined host can
  resubmit). `SubmitVenueVerificationRequest`:
  `{contactName, contactEmail?, evidenceSummary, attestedAuthority, documents:[{label,url}]}`
  where `documents` has 1–5 HTTP(S) links to externally hosted/signed proof documents (lease,
  deed, authorization letter, etc.). The API stores labels/links and review metadata only; it
  does **not** store raw document contents. `200 ManagedVenueDetailDto` with
  `verificationStatus: "pending"`. Errors: `400 invalid_verification`, `409 already_verified`,
  `409 verification_pending`.

### Venue payments (payout onboarding) ✅ *(2026-08-05 — full shapes + mock-era caveats: `payments.md`)*
`POST /manage/venues/{id}/payments/onboarding` → `{url, mock}` ·
`POST …/payments/onboarding/mock-complete` (Development-only one-step completion; absent in Production) ·
`GET …/payments` → `{onboardingStarted, detailsSubmitted, chargesEnabled, payoutsEnabled,
optedIn, dashboardUrl?, mock}`. Manager-scoped like everything here; state is owned by the
Payments module and read through its service.

### Rooms
- `GET /api/v1/manage/rooms/{id}` ✅ → `ManagedRoomDto`: `{id, venueId, venueName, venueSlug,
  name, slug, description, capacity, pricePerHour, currency, houseRules, status,
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

### Idempotent creates ✅ *(built 2026-08-05 — v2 migration D8)*

`POST /manage/venues` and `POST /manage/venues/{id}/rooms` honor the `Idempotency-Key` header
(`conventions.md` §2), same replay-returns-original semantics as the applications submit:

- **First request** → `201` with the created resource. **Replay of the same key by the same
  user** → `200` with the *original* resource, byte-identical (same id, same slug); the request
  body of the replay is ignored entirely.
- **Scope is the authenticated user**, not the venue: user A can never resolve user B's key, and
  two users sending the same key each get their own resource. The key is also partitioned per
  endpoint, so one key spent on a venue create is still spendable on a room create.
- A **room** key resolves the room it originally created regardless of which venue the retry is
  posted to — the key identifies the request, not the path.
- **No header → unchanged behavior** (every POST creates). A header that isn't a GUID is treated
  as absent — the create proceeds *unguarded*, it is not a `400`.
- **Keys remain replayable for 30 days.** After that window the retention sweep may remove the
  ledger row, so a very late reuse is a new create.
- Two *overlapping* requests with one key (the real hazard: a client write timeout fires while
  the first create is still running server-side) still yield one resource — the loser's whole
  transaction rolls back and it answers with the winner's `200`.

Backing store: `idempotency_records` keyed `(UserId, Scope, Key) → ResourceId`
(`persistence.md`). Keys remain replayable for 30 days; the retention sweep then deletes ledger
rows and clears applications' older column-based keys without touching the created resource.

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

- `GET /api/v1/listings/{roomId}/availability?from&to` ✅ (anonymous; behind
  `listing.availability`; flag off → 404; published-gated — Draft/
  Unlisted answer 404 like every public listing read) → `RoomAvailabilityDto`: `{roomId,
  timezone, from, to, days: [{date, isBlackout, freeWindows: [{startTime, endTime}]}]}`.
  `freeWindows` = open hours − blackouts − **confirmed** booked time (pending demand is never
  leaked), `[)` venue-local intervals. Limits: `from` ≥ today (venue-local), `to` ≥ `from`,
  range ≤ 92 days → `400 invalid_range`.
- `POST /api/v1/listings/{roomId}/availability/check` ✅ (anonymous, behind
  `listing.availability`; flag off → 404; per-IP `availability`
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
  Stored-undecided rows past `expiresAtUtc` are effectively expired and excluded even before
  the lazy expiry sweep persists their status.
  Present only on undecided applications; null otherwise or when the room has no availability
  rules.
- `GET /api/v1/manage/venues/{id}/calendar?from&to` ✅ (manager-scoped; range ≤ 92 days →
  `400 invalid_range`) → `VenueCalendarDto`: `{venueId, timezone, from, to, rooms: [{id,
  name}], occurrences: [{bookingId, roomId, organizerName, localDate, startTime, endTime,
  status}], pending: [{applicationId, roomId, organizerName, startTime, endTime, dates: []}]}`.
  Occurrences are confirmed bookings' scheduled/occurred occurrences in the range; `pending`
  projects unexpired undecided applications' would-be dates (an overlay, not a commitment).

### Photos
- `POST /api/v1/manage/rooms/{id}/photos` ✅ — multipart `file` (≤10 MB, enforced by Kestrel
  before the pipeline runs) + optional `caption`. Server decodes (decode failure → `400
  invalid_image`). It identifies headers before decoding and rejects animation, dimensions over
  12,000px, or more than 30 MP; processing is capped at two concurrent images. Accepted images
  auto-orient from EXIF, strip **all** metadata (EXIF/XMP/IPTC — GPS included), and encode JPEG
  variants at 400/800/1600px (no upscaling smaller sources). Each photo row owns its immutable
  `rooms/{roomId}/{photoId}` object prefix; identical bytes are not deduplicated. A partial variant
  upload or later database failure deletes every object written by that attempt. `201 RoomPhotoDto`.
  Web v2 sends an already-prepared
  1600px JPEG (`docs/contracts/web.md` → `data/photo.js`); the cap and every check above are
  still the gate, because no client's word about its own bytes is worth anything.
- `PATCH /api/v1/manage/photos/{photoId}` ✅ — `UpdatePhotoRequest {caption?, isPrimary?,
  sortOrder?}`; setting `isPrimary` demotes the previous cover. `400 invalid_photo`.
  `sortOrder` is **move-to-position, not a raw column write** (2026-08-09): the photo takes that
  index and its siblings re-sequence around it to a gap-free `0…n-1`, so an occupied position is
  an ordinary move rather than a conflict, and a value past the end lands last. Every other
  photo's `sortOrder` may therefore change; re-read the room's photos after the call. Omitting
  `sortOrder` leaves the order (gaps included) exactly as it was.
- `DELETE /api/v1/manage/photos/{photoId}` ✅ — deletes the row first, then best-effort deletes
  the stored variants. `204`. Deleting the cover promotes the next photo by display order and
  leaves the surviving positions untouched (a gap is legal). Legacy rows that once shared
  content-hash objects retain their render URLs but have `StorageKey = null`, so deleting either
  row never deletes bytes another row still renders.
- `RoomPhotoDto` ✅: `{id, url, thumbUrl?, cardUrl?, caption?, isPrimary, sortOrder}` — `id`,
  `thumbUrl`, `cardUrl` are additive (`conventions.md` §1 rule); `url` stays the full-size image
  for both new and legacy (seeded) rows. Cards prefer `cardUrl`, falling back to `url` when
  unset. Object-store/legacy URLs are absolute. Local-disk uploads use origin-independent
  document-relative `media/...` paths: web and Admin proxy that path to the API; mobile resolves
  it against its configured API base URL.

Concierge (Admin) uses the same Manage/Media endpoints for onboarding — one pipeline, no
seeded-URL side door — except for the moderation decision itself, which is Admin-only (Admin
reads/writes the DB directly for its own panels; see `ARCHITECTURE.md`).
