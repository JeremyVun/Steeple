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
activities[], accessibility[], distanceMeters?`

### `GET /api/v1/listings/by-slug/{venueSlug}/{roomSlug}` ✅ · `GET /api/v1/listings/{id}` ✅
Response `RoomDetail`: summary fields + `description, houseRules, amenities[],
photos[{url, caption?, isPrimary, sortOrder}]`, `venue{name, slug, venueType, addressLine,
suburb, postcode, contactEmail?, parkingInfo, transitInfo, isIdentityVerified, latitude,
longitude}`. 404 (ProblemDetails) when unknown, **not Published** (Draft/Unlisted never
leak via direct URL), or **outside the geofence** (defense in depth).

### `GET /api/v1/suburbs` ✅ → `["Vienna", …]` · `GET /api/v1/sitemap` ✅ → `[{venueSlug, roomSlug, lastModifiedUtc}]` · `GET /api/v1/geofence` ✅ → `{areaName, center, beachhead}`

🔲 v1 additions: `GET /api/v1/areas/{slug}` (area landing-page data), search gains
day/time/recurrence filters when the Bookings slice lands.

## 4. Identity 🔲

### `POST /api/v1/auth/sessions`
```jsonc
// request
{ "provider": "google" | "apple", "idToken": "<provider JWT>", "nonce": "…?",
  "turnstileToken": "…", "device": { "platform": "ios|android|web", "label": "iPhone 15" } }
// 200
{ "accessToken": "<jwt ~15min>", "refreshToken": "<opaque>",
  "user": { "id": "…", "displayName": "…", "email": "…?", "createdAtUtc": "…" },
  "isNewUser": true }
```
Errors: `invalid_id_token`, `turnstile_failed`, `rate_limited`.

### `POST /api/v1/auth/refresh` — `{refreshToken}` → rotated `{accessToken, refreshToken}`; reuse of a rotated token → `401 token_reuse` (family revoked).
### `DELETE /api/v1/auth/sessions` — revoke current session (logout).
### `GET /api/v1/me` — profile + `agreements: [{docType, version, acceptedAtUtc}]`.
### `DELETE /api/v1/me` — account deletion (anonymize; Apple 5.1.1(v) requirement).
### `POST /api/v1/me/agreements` — `{docType: "tos"|"privacy", version}` acceptance record.
### `POST /api/v1/me/devices` — `{fcmToken, platform}` push registration (upsert); `DELETE /api/v1/me/devices/{token}` on logout.

## 5. Applications, bookings, notifications 🔲

### `POST /api/v1/listings/{roomId}/applications` (auth + Turnstile + Idempotency-Key)
```jsonc
{ "activityType": "children", "groupSize": 15,
  "schedule": { "frequency": "recurringWeekly" | "oneOff",
                "startDate": "2026-09-01", "endDate": "2026-12-15",   // endDate mandatory when recurring
                "dayOfWeek": "tuesday", "startTime": "09:00", "endTime": "11:30" },
  "intentText": "Toddler playgroup, ~15 people…", "turnstileToken": "…" }
```
→ `201 Application`. Errors: `geofence_rejected`, `room_not_bookable`, `rate_limited`.

`Application`: `{ id, roomId, roomName, venueName, organizer{id, displayName, ratingSummary?},
activityType, groupSize, schedule{…}, intentText, status, createdAtUtc, decidedAtUtc?,
expiresAtUtc, messages: [{id, senderId, body, sentAtUtc}] }`
`status`: `pending | needsInfo | approved | declined | withdrawn | expired`.

- `GET /api/v1/me/applications` (organizer) · `GET /api/v1/manage/applications` (provider inbox) — paginated, filter by `status`.
- `GET /api/v1/applications/{id}` — full `Application` incl. `messages` (party-scoped: organizer or a `venue_manager` of the room's venue; others 404). The thread screen's fetch.
- `POST /api/v1/applications/{id}/messages` — `{body}` (either party; the "ask" thread).
- `POST /api/v1/applications/{id}/decision` (provider) — `{decision: "approve"|"decline", message?}`.
  Approve runs the booking transaction; `409 slot_taken` if the exclusion constraint fires.
- `POST /api/v1/applications/{id}/withdraw` (organizer).

### Bookings
`Booking`: `{ id, applicationId, roomId, roomName, venueName, venueTimezone, organizerId,
type: "oneOff"|"recurring", startDate, endDate, schedule{…}, status: "confirmed"|"completed"|"cancelled",
occurrences: [{id, startUtc, endUtc, localDate, status: "scheduled"|"occurred"|"noShow"|"cancelled"}],
cancelledBy?, cancelledAtUtc?, cancelReason? }`

- `GET /api/v1/me/bookings` · `GET /api/v1/manage/bookings` · `GET /api/v1/bookings/{id}` (party-scoped)
- `POST /api/v1/bookings/{id}/cancel` — `{reason?}`; notice-window rules enforced server-side.
- `POST /api/v1/occurrences/{id}/no-show` — either party marks the other; feeds ratings.
- `POST /api/v1/bookings/{id}/ratings` — `{stars: 1..5, comment?}` after term/occurrence completion.

### Notifications (inbox = truth)
`GET /api/v1/me/notifications?after=<cursor>` →
`{ items: [{id, type, createdAtUtc, readAt?, payload{…}}], nextCursor? }`
`type` ∈ `applicationReceived | applicationMessage | applicationApproved |
applicationDeclined | bookingCancelled | renewalDue | ratingReceived` (additive).
`POST /api/v1/me/notifications/read` — `{ids: […]}`. FCM pushes carry
`{notificationId, type, deepLink}` only — the inbox row is the payload of record.

## 6. Manage (provider self-service) 🔲

- `GET /api/v1/manage/venues` — venues where the caller is a `venue_manager`.
- `POST /api/v1/manage/venues` · `PATCH /api/v1/manage/venues/{id}` — address changes geocode server-side (geofenced).
- `POST /api/v1/manage/venues/{id}/rooms` · `PATCH /api/v1/manage/rooms/{id}` — includes `status` transitions; unpublish with future confirmed occurrences → `409 has_active_bookings`.
- `POST /api/v1/manage/rooms/{id}/photos` — multipart, ≤10 MB; server strips EXIF, generates variants → `RoomPhoto`. `DELETE …/photos/{photoId}`.

Concierge (Admin) uses the same shapes; Admin reads the DB directly today and migrates to
these endpoints only if/when it stops being DB-coupled (not a priority).

## 7. Analytics events

**Ingest** 🔲: `POST /api/v1/events` (anonymous OK; Turnstile-lite + per-IP rate limit)
```jsonc
{ "sessionId": "<client guid>", "events": [
    { "name": "listing_viewed", "occurredAt": "…Z", "props": { "roomId": "…" } } ] }
```
`202` always (fire-and-forget). Server enriches (userId if authed, UA class, area) and
writes one JSON line per event to stdout → Promtail → Loki (`docs/ANALYTICS.md`).

**Taxonomy** (PRD funnel; server-authoritative events are *only* ever emitted server-side):

| Event | Source | Key props |
|---|---|---|
| `search_performed` ✅ | server | filters, resultCount, zeroResult |
| `listing_viewed` ✅ | server | roomId, venueId |
| `map_interacted` 🔲 | client | kind (pan/zoom/pin) |
| `application_started` / `application_submitted` 🔲 | client / server | roomId; activityType, frequency |
| `sso_started` / `sso_completed` 🔲 | client / server | provider, surface |
| `application_decided` 🔲 | server | outcome, timeToDecisionHours |
| `booking_confirmed` / `booking_cancelled` / `no_show_marked` 🔲 | server | bookingId, type, cancelledBy |
| `rating_submitted` 🔲 | server | rateeType, stars |
| `notification_sent` / `notification_opened` 🔲 | server / client | type, channel |

Naming: `snake_case`, past tense. Adding an event = update this table + emit + (if
client-sourced) add to both client batchers.

## 8. Feature flags service (deployed infra)

- `GET /flags` → snapshot `[{key, enabled/rule-set …}]`; `GET /flags/stream` → SSE updates.
  Steeple services consume via `Steeple.FlagsSdk` (in-memory cache, local evaluation,
  Perchd rule semantics: ordered condition rules, AND groups, default rule, deterministic
  percentage rollouts). Never block a request on the flags service.
- **Mobile/web-client flags** are proxied: `GET /api/v1/flags?platform=ios|android&build=<int>` 🔲
  returns the **public** flags evaluated for the caller's context as `{key: bool}` —
  clients never talk to the flags service directly, and private/ops flags never leave the
  backend. The `platform`/`build` query params feed rule conditions server-side, so
  value-shaped concerns stay boolean on the wire (e.g. `mobile.force_upgrade` is a rule
  over `build < N`, and the client just sees `true` → forced-upgrade screen).
- Naming: `<surface|domain>.<feature>` — e.g. `web.apply_from_browser`,
  `booking.recurring_materialization`, `trust.phone_otp_stepup`.

## 9. Non-API integration contracts

- **Admin edge auth (authelia):** Admin is only reachable through the authelia-gated
  hostname; it trusts the forwarded identity header (`Remote-User`) for audit
  attribution. Containers must not be reachable except via the edge proxy.
- **`X-Forwarded-Prefix`:** Web & Admin map it to `PathBase` (sub-path hosting). All
  emitted URLs must derive from `~/`-relative helpers — see CLAUDE.md.
- **Deep links** 🔲: Web serves `/.well-known/apple-app-site-association` and
  `/.well-known/assetlinks.json`; the canonical listing URL
  `https://<host>/space/{venueSlug}/{roomSlug}` must open the app's listing screen when
  installed (fallback: web page). Custom scheme `steeple://` for auth callbacks only.
- **Push payload:** FCM data messages `{notificationId, type, deepLink}`; render from the
  inbox, never trust push content as the record. `deepLink` is a **path-only canonical
  path** from the client deep-link registry (`docs/MOBILE_CONTRACTS.md` §7):
  `/inbox/applications/{id}`, `/bookings/{id}`, `/inbox`, `/space/{venueSlug}/{roomSlug}`.
  Clients route unknown values to browse, never an error.
