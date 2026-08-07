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

→ `201 Application` (an `Idempotency-Key` replay returns the original as `200` — including a
replay that raced a concurrent identical submit: the unique index resolves the winner and the
loser answers with it, 2026-08-07). Errors:
`400 invalid_application` (bad token / malformed or unbounded schedule / past start date —
judged against the **venue's local** today, not UTC's (2026-08-07) / a recurring term none of
whose selected weekdays occur between its dates — it would materialize zero occurrences),
`402 payment_method_required` *(additive 2026-08-05, while `payments.enabled` — save a method
via `payments.md` first; applies to every room, instant or manual)*,
`403 turnstile_failed`, `404 room_not_bookable` (unknown **and** unpublished rooms answer
identically — no existence leak), `404 geofence_rejected` (reserved, defense in depth),
`409 schedule_unavailable` (any occurrence outside open hours / on a blackout / already booked —
body carries the per-date conflict list, `manage.md` "Guest availability reads"; skipped for
rooms with no availability rules), `409 slot_taken` *(instant venues only, below)*,
`429 rate_limited` (per-account `apply` policy, shared with messages — **not** with card
setup, which has its own `payments` policy since 2026-08-05; see `api-ports.md`).

**Instant book ✅ *(2026-08-05 — `docs/backlog/booking-modes.md`; behind `payments.enabled`)*:**
when the room's venue is in `instant` mode (`RoomDetail.bookingMode`, `discovery.md`), the
submit **is the booking transaction** — the same one-SaveChanges machinery approval uses, under
the same exclusion constraint; first valid request wins. The `201` response is the application
with `status: "approved"` and `bookingId` set; losing a race answers `409 slot_taken` and
**nothing persists** (no application row — unlike approval's auto-decline, there was nothing to
decline). Post-commit, the first occurrence charges (`payments.md`); the organizer gets the
booking-confirmed notification/email (`applicationApproved`, `deepLink: /bookings/{id}`) and
the venue's managers get a `bookingReceived` notice. The host's lever is **rescind** = the
normal booking cancel, which refunds in full any time. `manual` venues keep the entire
request→approve flow below unchanged; counter-offers exist only in manual mode.

`Application` ✅: `{ id, roomId, roomName, venueName, venueSlug, roomSlug,
organizer{id, displayName, ratingSummary?{averageStars, ratingCount, noShowCount,
completedBookings}}, activityType, groupSize,
schedule{…}, intentText, organizationName? /* additive 2026-07-08: "Who's asking" */,
status, createdAtUtc, decidedAtUtc?, expiresAtUtc,
bookingId? /* set once approved — the booking it created */, messageCount,
messages: [{id, senderId, body, sentAtUtc}],
hasPaymentMethod /* additive 2026-08-05: the organizer has a card on file — host-visible
trust signal; always true for applications submitted behind the 402 gate */ }`
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
  filter by `status`. The filter (and `totalCount`) matches **effective** status (2026-08-07):
  an undecided application past `expiresAtUtc` already counts as `expired` even before a read
  has persisted the lazy sweep's flip — `?status=pending` can never return an expired row.
- `GET /api/v1/applications/{id}` ✅ — full `Application` incl. `messages` (party-scoped: organizer or a `venue_manager` of the room's venue; others 404). The thread screen's fetch.
- `POST /api/v1/applications/{id}/messages` ✅ — `{body}` (either party; the "ask" thread). A
  provider message on `pending` → `needsInfo`; the organizer's answer → back to `pending`.
  Errors: `409 invalid_state` once decided, `400 invalid_application`, `429 rate_limited`.
- `POST /api/v1/applications/{id}/decision` ✅ (provider, `apply` limit since 2026-08-07) —
  `{decision: "approve"|"decline", message?}`.
  `403 not_venue_manager` · `409 invalid_state` once decided. ✅ Phase 3: **approve is the
  booking transaction** (status flip + booking + occurrences commit atomically); when the
  exclusion constraint fires → `409 slot_taken` and the application is **auto-declined**
  with the organizer notified.
- `POST /api/v1/applications/{id}/withdraw` ✅ (organizer, `apply` limit since 2026-08-07).
  `409 invalid_state` once decided.

**Transitions are serialized (2026-08-07):** every state-changing write (decision, withdraw,
message status flips, counter-offer, counter response, expiry sweep) saves through the
application row's concurrency token (Postgres `xmin` — no schema change), so two callers
racing on one application leave exactly one winner and a booking that agrees with it; the
loser answers `409 invalid_state` ("changed while the request was in flight") instead of
silently overwriting. Approve-vs-withdraw in either order is proven by
`ApplicationConcurrencyTests` alongside `BookingIntegrityTests`.

Manager detail reads of undecided applications additionally carry an additive `conflicts?`
digest (host-only) — specified with the availability engine in `manage.md`.

### `GET /api/v1/manage/venues` ✅ → `[{id, name, slug}]` — venues where the caller is a `venue_manager` (empty for non-providers); clients use it to decide whether to show a provider surface. Full CRUD lives in `manage.md`.

### Bookings ✅ *(built 2026-07-04 — created only by approval; there is deliberately no `POST /bookings`)*
`Booking` ✅: `{ id, applicationId, roomId, roomName, venueName, venueSlug, roomSlug,
venueTimezone, organizerId, organizerName, type: "oneOff"|"recurring", startDate, endDate,
schedule{…}, status: "confirmed"|"completed"|"cancelled", createdAtUtc,
cancelledBy? /* null on a cancelled booking = system (payment-failure term cancel) */,
cancelledAtUtc?, cancelReason?,
nextOccurrence? /* the next live occurrence — set on lists too */,
occurrences: [{id, startUtc, endUtc, localDate, status: "scheduled"|"occurred"|"noShow"|"cancelled", noShowMarkedBy?,
  paymentStatus? /* additive 2026-08-05: "pending"|"requiresAction"|"succeeded"|"failed"|"refunded"|"disputed";
  absent while never charged and on offline bookings */}],
payment /* additive 2026-08-05 (payments.md): {mode: "inApp"|"offline", perOccurrenceAmount?,
  currency?, nextChargeAtUtc? /* when the next unpaid occurrence charges; null when nothing
  remains or offline */} */,
ratings?{byOrganizer?{stars, comment?, createdAtUtc}, byVenue?{stars, comment?, createdAtUtc}, canRate, rateByUtc?} }`
List endpoints return `occurrences: []` (the set stays behind the detail fetch);
`nextOccurrence` is always populated where one exists. `localDate` and `schedule` are
venue-local; `startUtc/endUtc` are the DST-correct instants. Reads apply the lazy sweeps
(past occurrences → `occurred`, finished terms → `completed`, the one renewal-due nudge) —
no background worker.

- `GET /api/v1/me/bookings` ✅ · `GET /api/v1/manage/bookings` ✅ (empty list for
  non-managers) · `GET /api/v1/bookings/{id}` ✅ (party-scoped; others 404) — pagination per
  `conventions.md`, filter by `status`. The filter (and `totalCount`) matches **effective**
  status (2026-08-07): a confirmed booking with no scheduled time left ahead already counts as
  `completed` before the sweep persists it — `?status=confirmed` never returns finished terms.
- `POST /api/v1/bookings/{id}/cancel` ✅ — `{reason?}` (≤500 chars), either party.
  **Asymmetric since 2026-08-05 (booking-modes.md refund table — SYSTEM_DESIGN §17):**
  a **guest** cancel frees occurrences beyond the 48h notice window (nearer ones stand,
  their charges stand, and they remain no-show markable); a **host** cancel/rescind frees
  **every** scheduled occurrence immediately — the window binds only guests — and every
  charge on a freed occurrence refunds in full automatically (`payments.md`). Other party
  notified. Errors: `409 invalid_state` (not confirmed), `400 invalid_booking`,
  `429 rate_limited`.
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
listingDeclined | paymentFailed | occurrenceRefunded | bookingReceived |
bookingReminder` (additive; `paymentFailed`/`occurrenceRefunded` go to the
organizer, `bookingReceived` is the host-side instant-booking notice, and
`bookingReminder` is the reminder worker's nudge — payments payloads carry the
booking display fields + `bookingId`, `occurrenceId?`, `amount?`, `currency?`,
`deepLink: "/bookings/{id}"`).
`payload` for the application types: `{applicationId, roomId, roomName, venueName, venueSlug,
roomSlug, organizerName, status, deepLink}` (deepLink = the canonical path registry in
`infra.md`); for `bookingCancelled`/`renewalDue`: the same display fields with `bookingId` and
`deepLink: "/bookings/{id}"`; for `ratingReceived`: the same booking display fields with
`bookingId` and `deepLink: "/bookings/{id}"` but no stars/comment; for `bookingReminder` (the T−7d / T−1d
sweep, `api-ports.md`): the booking display fields plus `{bookingId, occurrenceId,
reminderKind: "comingUp" | "tomorrow", startsAtUtc, localDate, deepLink: "/bookings/{id}"}` —
one row per party per occurrence, deduped by the `booking_reminders` ledger; for
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
Every email ends with one CTA line the **dispatcher** composes from the payload's own `deepLink`
— `{Email:WebBaseUrl}/?goto=<url-encoded deepLink>` (`web.md`), or nothing at all where no web
origin is configured. Composition sites never build URLs; gateways never edit bodies.
