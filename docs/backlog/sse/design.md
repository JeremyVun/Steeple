# Live inbox delivery over SSE — design

> **Status:** Recorded 2026-08-09, not scheduled. Written the day the inbox became the one
> in-app channel (unread-until-opened messages, porch badge — `docs/contracts/web.md`,
> `docs/contracts/applications.md` "Notifications"). Everything here is additive; nothing
> in the shipped inbox needs reshaping first — that was checked deliberately before this
> was written.

## 1. Outcome

A signed-in web session learns that new mail exists without re-opening the inbox. The porch
badge and the Messages section update while the person is mid-task; the documented cadence gap
closes (today the feed wakes only on sign-in, the roll landing, and `view:change` to the
journal — a message arriving while the inbox stands open is invisible until the next wake).

Explicitly **not** the outcome: a second delivery channel for content. The stream only ever
says "something new for you"; the inbox row remains the payload of record, exactly as it does
for FCM push (`applications.md` — pushes carry `{notificationId, type, deepLink}` only). A
dropped stream loses a nudge, never a fact.

## 2. Shape: snapshot + stream

The deployed flags service already uses this pattern (SSE + snapshot, CONTRACTS §8), and the
inbox already has the snapshot half built:

- **Snapshot** — `GET /api/v1/me/notifications` (exists, unchanged).
- **Stream** — `GET /api/v1/me/notifications/stream` (new): held open, relays content-free
  events for the authenticated user. On any event the client re-reads the snapshot. The
  stream carries at most `{type}` per event — no payload, no ids worth trusting over a read.

Single API instance, solo-operated: the broadcaster is in-memory, no backplane. If the API
ever scales horizontally this seam is where a Redis/postgres LISTEN fan-out would slot in;
designing that now would violate the cost ceiling for zero benefit.

## 3. Server seams (one new port, one adapter, one endpoint, one dispatcher line)

- **Port** `INotificationStream` in `Api/Services/Notifications/` — `Publish(userId)` +
  a way for the endpoint to subscribe a connection. Singleton.
- **Adapter** in `Api/Proxies/Notifications/` — in-memory broadcaster (per-user channel
  list, bounded, drop-oldest; a slow consumer must never hold memory unbounded).
- **Endpoint** in `NotificationsController` — holds the response open, writes SSE frames,
  heartbeat comment every ~30 s so intermediaries don't reap the connection.
- **Dispatcher** — `NotificationDispatcher.NotifyAsync` publishes per recipient **after**
  `AddRangeAsync` persists the rows, fire-and-forget alongside email/push, under the same
  standing rule the dispatcher already documents: nothing request-scoped (DbContext) is
  touched from the unawaited path; the singleton broadcaster is safe to outlive the request.

## 4. Web client seam (already in place — verified 2026-08-09)

`src/ui/notifications.js` is the single owner of the feed; every consumer (journal rows,
unread dots, porch badge) redraws off `notifications:change` and reads through `rows()`.
The SSE consumer is one small addition there: on a stream event, call `wake()` (re-read +
screen-reader announcement, already idempotent and single-flight). No journal, badge, or
letter change.

Connection lifecycle: open on sign-in when the product surface is up, close on sign-out
(`session.onSessionChange` hook exists), reconnect with backoff + jitter; on reconnect,
`wake()` once — the snapshot covers anything missed, so the stream needs no resume cursor.

## 5. Known traps (each verified against the current code/config, 2026-08-09)

1. **Auth.** The access token lives in module memory only and native `EventSource` cannot
   set headers. Do not put tokens in query strings. Consume the stream with `fetch()` +
   `ReadableStream` via `session.withAccess()` (bearer supplied, 401-retry-once seam
   reused). Same-origin through the existing Vite/nginx proxy — no CORS change, keeping
   the "API serves no CORS by design" stance.
2. **Proxies buffer streams into silence.** The web nginx (`Steeple.Web.v2/nginx.conf`)
   and the Vite dev proxy both need buffering off for this one route
   (`proxy_buffering off` / `X-Accel-Buffering: no`); the Caddy edge presumably already
   handles this for the flags service — copy that treatment.
3. **Rate limiting.** One held connection is not a request burst: the stream route needs
   its own policy (or an exemption) in `RateLimitingExtensions`, plus a per-user cap on
   concurrent streams (a person with six tabs should hold few connections, not six —
   or accept six and bound the broadcaster instead; decide at build time, record in
   `docs/contracts/infra.md`).
4. **Access tokens are short-lived; the stream outlives one.** Either the connection is
   allowed to die at token expiry and the reconnect loop re-authenticates (simplest,
   recommended — the snapshot heals the gap), or the endpoint validates only at connect
   and bounds connection lifetime server-side. Never re-validate mid-stream by parsing
   frames.
5. **Headless harness time.** Suites wait on state, never wall-clock (CLAUDE.md); a
   stream test asserts on the `notifications:change` consequence (badge count, row
   appearing), not on SSE frame timing.

## 6. Out of scope

- Mobile: already has FCM push; SSE is web-only.
- Presence, typing indicators, read receipts to the other party: different products.
- Multi-instance fan-out (see §2).
- True live *content* updates (thread messages appearing inside an open letter): the
  letter re-reads on open; if that gap ever matters it is a separate decision on top of
  the same stream.

## 7. Verification sketch (for the build round)

Drive the real flow: guest's inbox standing open in one browser; host (second browser)
sends a thread message; assert the guest's badge and Messages section update without any
navigation, the row is unread on the wire, and one press drains dot + header + badge.
Kill the API mid-stream and assert the client reconnects and heals via snapshot. Prove the
rate-limit policy admits the stream while the normal read policy still binds. The
`notifications:change` seam means `tools/inbox-messages-test.mjs` keeps its meaning
untouched; add the live-arrival case to it rather than a new suite.
