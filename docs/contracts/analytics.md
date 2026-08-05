# Contracts — Analytics events (was CONTRACTS §7)

> **Scope:** the client event-ingest endpoint (`POST /api/v1/events`) and the complete event
> taxonomy — every event name, its source (server-authoritative vs client), and its key props.
> Adding an event = update this table + emit + (if client-sourced) add to both client batchers.
> Conventions/governance: see `conventions.md`. Legend: ✅ built & live · 🔲 planned.

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
| `search_performed` ✅ | server | filters, resultCount, zeroResult (+ additive: hasWhenFilter, whenMode `oneOff\|recurring\|none`, timeOfDay?, weekdayCount?, amenities[]) |
| `listing_viewed` ✅ | server | roomId, venueId |
| `map_interacted` ✅ | client | kind (pan/zoom/pin) |
| `application_started` ✅ / `application_submitted` ✅ | web BFF¹ / server | roomId; activityType, frequency, groupSize |
| `sso_started` ✅ / `sso_completed` ✅ | web BFF¹ / server | provider?, surface, trigger / provider, surface, isNewUser |
| `application_decided` ✅ | server | outcome, timeToDecisionHours (+ `autoDeclined, reason: "slot_taken"` on the race-lost path; additive `viaCounterOffer`) |
| `booking_confirmed` ✅ / `booking_cancelled` ✅ / `no_show_marked` ✅ | server | bookingId, type, occurrenceCount (+ additive `weekdayCount`, `viaCounterOffer`) / cancelledBy / markedBy |
| `rating_submitted` ✅ | server | rateeType, stars, hasComment |
| `notification_sent` ✅ / `notification_opened` ✅ | server / client | type, channel, recipientCount |
| `venue_created` ✅ / `room_created` ✅ | server | venueId, suburb / roomId, venueId |
| `venue_verification_requested` ✅ | server | venueId, documentCount |
| ~~`venue_verification_decided`~~ | retired 2026-08-05 (`v2_migration` D2 — the separate verification decision is gone; the first-listing `listing_moderated` covers it) | — |
| `listing_publish_requested` ✅ | server | roomId, venueId |
| `photo_uploaded` ✅ | server | roomId, photoId |
| `open_hours_updated` ✅ | server | roomId, windowCount, blackoutCount |
| `availability_viewed` ✅ | server | roomId, dayCount |
| `availability_checked` ✅ | server | roomId, available, conflictCount |
| `counter_offer_sent` ✅ | server | applicationId, roomId, superseded (bool) |
| `counter_offer_responded` ✅ | server | applicationId, decision, timeToResponseHours |
| `listing_moderated` ✅ | Admin (stdout, same log-line shape) **and** server (`IAnalyticsSink`, on a trusted host's auto-publish) | roomId, venueId, outcome (approved/declined), actor — `actor` is the operator's `Remote-User`, or `"auto:trusted_host"` when `ManageService` published without a human (`v2_migration` D2) |
| `listing_unlisted_by_operator` ✅ | Admin (stdout only) | roomId, venueId, actor — the abuse/DMCA takedown lever |

¹ The deprecated v1 BFF emits these client-ish funnel events server-side (`IWebAnalytics`,
same stdout log line shape). Active web v2 does not yet emit them; it must call the built
`POST /api/v1/events` endpoint. `sso_started` at the apply gate carries `trigger` instead of
`provider` (the provider isn't chosen yet at that point). `map_interacted` and
`notification_opened` are the two client-sourced rows the mobile app (and, once migrated, Web)
call the Ingest endpoint for directly; the Ingest allowlist is exactly these four rows
(`map_interacted`, `application_started`, `sso_started`, `notification_opened`) — everything else
is server-authoritative and rejected if a client attempts to submit it.

Naming: `snake_case`, past tense.
