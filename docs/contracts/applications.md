# Contracts — Applications, bookings, notifications (was CONTRACTS §5)

> **Scope:** the request→approve loop — application submit, thread messages, counter-offers,
> decisions/withdrawal; bookings, occurrences, cancellation, no-show, ratings writes; and the
> notification inbox. Also the `GET /manage/venues` stub clients use to decide whether to show
> a provider surface (full manage CRUD lives in `manage.md`).
> Conventions/governance (errors, pagination, idempotency, enum tokens): see `conventions.md`.
> Legend: ✅ built & live · 🔲 planned.

## Applications, notifications ✅ *(built 2026-07-04 — ROADMAP Phase 2)*, bookings ✅ *(built 2026-07-04 — Phase 3)*

### `POST /api/v1/listings/{roomId}/applications` ✅ (auth + Turnstile + Idempotency-Key + rate limit)
```jsonc
{ "activityType": "children", "groupSize": 15,
  "schedule": { "frequency": "recurringWeekly" | "oneOff",
                "startDate": "2026-09-01", "endDate": "2026-12-15",   // endDate mandatory when recurring
                "daysOfWeek": ["tuesday", "thursday"], "startTime": "09:00", "endTime": "11:30" },
  "intentText": "Toddler playgroup, ~15 people…", "turnstileToken": "…",
  "organizationName": "Vienna Toddler Playgroup" }  // optional ≤200 chars, additive 2026-07-08
```
`schedule.daysOfWeek` *(replaced `dayOfWeek: string` 2026-07-05 — clean break, no released
clients)*: array of weekday tokens (`"sunday"`…`"saturday"` — `conventions.md` §2.1),
**one or more, distinct, emitted sorted Sunday-first**; required when `frequency` is
`recurringWeekly`, must be null/absent for `oneOff`. Multi-day = one application/booking
(e.g. Tue+Thu weekly is a single request materializing occurrences on both days).

→ `201 Application` (an `Idempotency-Key` replay returns the original as `200`). Errors:
`400 invalid_application` (bad token / malformed or unbounded schedule / past start date),
`403 turnstile_failed`, `404 room_not_bookable` (unknown **and** unpublished rooms answer
identically — no existence leak), `404 geofence_rejected` (reserved, defense in depth),
`409 schedule_unavailable` (any occurrence outside open hours / on a blackout / already booked —
body carries the per-date conflict list, `manage.md` "Guest availability reads"; skipped for
rooms with no availability rules), `429 rate_limited` (per-account `apply` policy, shared with
messages).

`Application` ✅: `{ id, roomId, roomName, venueName, venueSlug, roomSlug,
organizer{id, displayName, ratingSummary?{averageStars, ratingCount, noShowCount,
completedBookings}}, activityType, groupSize,
schedule{…}, intentText, organizationName? /* additive 2026-07-08: "Who's asking" */,
status, createdAtUtc, decidedAtUtc?, expiresAtUtc,
bookingId? /* set once approved — the booking it created */, messageCount,
messages: [{id, senderId, body, sentAtUtc}] }`
`status`: `pending | needsInfo | counterOffered | approved | declined | withdrawn | expired`.
List endpoints return `messages: []` (thread stays behind the detail fetch); `messageCount` is
always set. Undecided applications auto-expire 14 days after submission (lazy sweep on read —
no worker).

**Counter-offers ✅ *(built 2026-07-05 — availability plan commit 8; behind `booking.counter_offers`)*:**

`Application` gains additive `counterOffer?` — the latest non-superseded counter
(`CounterOfferDto`): `{id, schedule: ScheduleDto, message?, status, createdAtUtc,
respondedAtUtc?}`, `status` ∈ `open | accepted | declinedByOrganizer | superseded | lapsed`.
At most one counter is ever `open` (DB partial unique index); history rows stay on the thread.

- `POST /api/v1/applications/{id}/counter-offer` ✅ (venue manager, `apply` limit) —
  `{schedule, message?}`. Validates like a submit (incl. the availability check against
  rules + confirmed bookings → `409 schedule_unavailable`, `manage.md`). Supersedes any open
  counter, moves the application to `counterOffered`, refreshes the 14-day expiry, notifies the
  organizer (`CounterOfferReceived`). `409 invalid_state` once decided.
- `POST /api/v1/applications/{id}/counter-offer/respond` ✅ (organizer, `apply` limit) —
  `{decision: "accept"|"decline"}`. **Accept is a booking transaction on the counter
  schedule** (the application keeps the original ask); an exclusion-constraint race →
  `409 slot_taken` and the application is auto-declined, identical to approval. Decline →
  application returns to `pending`, counter becomes `declinedByOrganizer`, host notified.
  `409 invalid_state` when no counter is open.
- While `counterOffered`: messages flow normally (and do **not** flip the status the way the
  pending⇄needsInfo thread rule does); host **decline** stays allowed; host **approve** is
  blocked (`409 invalid_state` — the ball is in the organizer's court). Expiry, withdrawal,
  and decline all mark an open counter `lapsed`.

- `GET /api/v1/me/applications` ✅ (organizer) · `GET /api/v1/manage/applications` ✅ (provider
  inbox; empty list — not an error — for non-managers) — pagination per `conventions.md`,
  filter by `status`.
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

Manager detail reads of undecided applications additionally carry an additive `conflicts?`
digest (host-only) — specified with the availability engine in `manage.md`.

### `GET /api/v1/manage/venues` ✅ → `[{id, name, slug}]` — venues where the caller is a `venue_manager` (empty for non-providers); clients use it to decide whether to show a provider surface. Full CRUD lives in `manage.md`.

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
  non-managers) · `GET /api/v1/bookings/{id}` ✅ (party-scoped; others 404) — pagination per
  `conventions.md`, filter by `status`.
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
roomSlug, organizerName, status, deepLink}` (deepLink = the canonical path registry in
`infra.md`); for `bookingCancelled`/`renewalDue`: the same display fields with `bookingId` and
`deepLink: "/bookings/{id}"`; for `ratingReceived`: the same booking display fields with
`bookingId` and `deepLink: "/bookings/{id}"` but no stars/comment; for
`listingApproved`/`listingDeclined` (written by Admin on a
moderation decision, `manage.md`): `{roomId, roomName, venueName, venueSlug, roomSlug,
status: "published" | "declined", note?, deepLink}` (`note` is the operator's optional
decline/approve comment; `deepLink` is `/space/{venueSlug}/{roomSlug}` on approval, `/inbox`
on decline).
`POST /api/v1/me/notifications/read` — `{ids: […]}` (foreign/unknown ids ignored). FCM pushes
carry `{notificationId, type, deepLink}` only — the inbox row is the payload of record.
Email fan-out (Resend adapter behind `IEmailGateway`) and push fan-out (FCM adapter behind
`IPushGateway` ✅, built 2026-07-04) are both fire-and-forget on the same events; without a
configured `Email:ApiKey` / `Push:ServiceAccountJson[Path]` the API logs sends instead (dev).
