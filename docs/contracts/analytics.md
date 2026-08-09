# Contracts — Analytics events (was CONTRACTS §7)

> **Scope:** the client event-ingest endpoint (`POST /api/v1/events`) and the complete event
> taxonomy — every event name, its source (server-authoritative vs client), and its key props.
> Adding an event = update this table + emit + (if client-sourced) add to the allowlist and each
> client batcher whose surface can produce it.
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
| `map_interacted` ✅ | client | kind (pan/zoom/pin/locate) |
| `application_started` ✅ / `application_submitted` ✅ | client / server | roomId; activityType, frequency, groupSize |
| `sso_started` ✅ / `sso_completed` ✅ | client / server | provider?, surface, trigger / provider, surface, isNewUser |
| `application_decided` ✅ | server | outcome, timeToDecisionHours (+ `autoDeclined, reason: "slot_taken"` on the race-lost path; additive `viaCounterOffer`) |
| `booking_confirmed` ✅ / `booking_cancelled` ✅ / `no_show_marked` ✅ | server | bookingId, type, occurrenceCount (+ additive `weekdayCount`, `viaCounterOffer`; + additive 2026-08-05 `instant`, `isPaid`) / cancelledBy (+ additive `cancelledBy: "system"`, `reason: "payment_failure"`, `cancelRemainingTerm` on the failure-ladder path) / markedBy |
| `rating_submitted` ✅ | server | rateeType, stars, hasComment |
| `notification_sent` ✅ / `notification_opened` ✅ | server / client | type, channel, recipientCount (`notification_sent` means durable inbox/outbox commit; provider terminal failures are worker error logs) |
| `booking_reminder_sent` ✅ | server | bookingId, kind (`comingUp` \| `tomorrow`), recipientCount — one per claimed reminder, both parties counted together |
| `venue_created` ✅ / `room_created` ✅ | server | venueId, suburb / roomId, venueId |
| `venue_verification_requested` ✅ | server | venueId, documentCount |
| ~~`venue_verification_decided`~~ | retired 2026-08-05 (the separate verification decision is gone; the first-listing `listing_moderated` covers it) | — |
| `listing_publish_requested` ✅ | server | roomId, venueId |
| `photo_uploaded` ✅ | server | roomId, photoId |
| `open_hours_updated` ✅ | server | roomId, windowCount, blackoutCount |
| `availability_viewed` ✅ | server | roomId, dayCount |
| `availability_checked` ✅ | server | roomId, available, conflictCount |
| `counter_offer_sent` ✅ | server | applicationId, roomId, superseded (bool) |
| `counter_offer_responded` ✅ | server | applicationId, decision, timeToResponseHours |
| `listing_moderated` ✅ | Admin (stdout, same log-line shape) **and** server (`IAnalyticsSink`, for later rooms at a verified venue) | roomId, venueId, outcome (approved/declined), actor — `actor` is the operator's `Remote-User`, or `"auto:verified_venue"` when `ManageService` publishes without another review |
| `listing_unlisted_by_operator` ✅ | Admin (stdout only) | roomId, venueId, actor — the abuse/DMCA takedown lever |
| `application_submitted` gains additive `instant` ✅ *(2026-08-05)* | server | (dimension on the existing row above) |
| `payment_method_saved` ✅ | server | brand |
| `payment_succeeded` ✅ / `payment_failed` ✅ | server | bookingId, occurrenceId, amount, currency / bookingId, occurrenceId, failureCode |
| `refund_issued` ✅ | server | bookingId, occurrenceId, amount, currency |
| `payout_onboarding_started` ✅ / `payout_onboarding_completed` ✅ | server | venueId |
| `inbox_opened` ✅ *(2026-08-07)* | client | surface (`guest` \| `host`) |
| `decision_pressed` ✅ *(2026-08-07)* | client | decision (`approve`\|`decline`\|`ask`\|`counter`\|`message`\|`withdraw`\|`counterAccept`\|`counterDecline`), surface |
| `card_step_opened` ✅ *(2026-08-07)* | client | reason (`apply` \| `account` \| `failure`) |
| `payout_step_opened` ✅ *(2026-08-07)* | client | state (`prompt` \| `onboarding` \| `connected`) |
| `arrival_settled` ✅ *(2026-08-07)* | client | destination (`village` \| `desk`), entry (`cinematic` \| `direct`) — one per press the boot actually answered (`src/core/intent.js`, production migration P3.5) |
| `address_suggestion_picked` 🔲 | client | — (the UI calls `track`, but the current web batcher and API allowlist both drop this name) |

¹ The deprecated v1 BFF emitted these client-ish funnel events server-side (`IWebAnalytics`, same
stdout log line shape) and retired with it. **Web v2 and mobile emit their applicable rows from
their own batchers.** Web's `src/data/analytics.js` queues up to 25, flushes after 4 seconds, and
uses `sendBeacon` on `pagehide`/hidden — which carries no `Authorization` header, so those final
events reach steeple **without a `userId`**. Mobile's
`mobile/lib/core/analytics/analytics_service.dart` flushes at 20 queued events, every 15 seconds,
or on lifecycle pause; a failed flush is re-queued within a 100-event cap. Both `track()` calls
return without delaying the interaction. `sso_started` at the web apply gate carries `trigger`
instead of `provider` (the provider isn't chosen yet at that point).

Web's event queue is memory-only. Its sole browser-storage value is the anonymous random
`steeple-analytics-session` id in sessionStorage: one tab visit, with no free text, profile,
identity, or location. It is not a durable client id and disappears with the tab.

`notification_opened` on web means **a press**, since 2026-08-09: notifications render as unread
rows in the inbox and the event is emitted when one is opened (`channel: 'web'`), alongside the
read receipt. It previously fired when a corner slip appeared — an impression, not an opening —
so web counts before and after that date are not comparable. Mobile's push channel is unchanged.

The Ingest allowlist (`EventIngestService.AllowedEventNames`) is exactly the nine **built**
client-sourced rows in the table — `map_interacted`, `application_started`, `sso_started`,
`notification_opened`, `inbox_opened`, `decision_pressed`, `card_step_opened`,
`payout_step_opened`, `arrival_settled`. Everything else is server-authoritative and silently
rejected if a client attempts to submit it. Web keeps the same nine-name list; mobile currently
emits the shared first four rows because the other five are web-only surfaces.

Naming: `snake_case`, past tense.
