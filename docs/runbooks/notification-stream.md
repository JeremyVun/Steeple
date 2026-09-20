# Runbook — notification stream

The web inbox uses `GET /api/v1/me/notifications/stream` as an invalidation signal. The
stream carries no notification content; each `invalidate` event prompts the existing
authenticated inbox snapshot read. PostgreSQL remains the durable source of truth.

## Rollout order

1. Apply `022-notification-stream.sql` through Liquibase and confirm the changeset is
   recorded before starting the new API.
2. Start the API. Confirm its PostgreSQL listener reports ready, then open an authenticated
   stream and receive the initial `invalidate` frame promptly.
3. Release the web bundle. Old clients continue to use snapshots; the new bundle falls back
   to bounded snapshot recovery while the stream is unavailable.
4. Probe the deployed Caddy route before calling delivery live. The initial frame and a
   later committed event must arrive while one response remains open.

Do not deploy the web bundle before the API. The API never creates or repairs its trigger.
An API started against an unmigrated database keeps stream admission unavailable and returns
`503 notification_stream_unavailable` with `Retry-After: 5`.

## Healthy behavior

- An authenticated request returns `200` with `text/event-stream`, `Cache-Control: no-store,
  no-transform`, and an immediate `event: invalidate` frame.
- An idle connection receives `: heartbeat` every 30 seconds.
- A committed insert in `notifications` produces another invalidation for that recipient.
  A rolled-back insert produces none.
- A stream closes at JWT expiry or after five minutes, then the browser renews through the
  existing session flow.
- Four concurrent streams are allowed per user and 256 per API process. Admission above
  either cap returns `429 rate_limited` with `Retry-After: 60`.
- Listener loss closes active streams and blocks admission. Recovery reopens admission; the
  initial event forces a snapshot that finds rows committed during the outage.

## Listener diagnostics

Check API logs for listener failure and recovery without increasing the log level first.
The log records aggregate admission state and connection lifecycle only; it must never include
database credentials, bearer tokens, notification payloads, or recipient IDs.

Confirm the trigger and listener from PostgreSQL:

```sql
select t.tgname, t.tgenabled
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where c.relname = 'notifications'
  and not t.tgisinternal;

select pid, application_name, state, xact_start, wait_event_type, wait_event, query_start
from pg_stat_activity
where application_name = 'Steeple notification listener'
order by query_start;
```

The dedicated listener must not remain inside a transaction after `LISTEN` is established.
If it is `idle in transaction`, find the oldest transaction before restarting anything:

```sql
select pid, usename, application_name, client_addr, xact_start, state, wait_event, query
from pg_stat_activity
where xact_start is not null
order by xact_start;
```

The current query is usually `SELECT 1` after a health probe, so do not identify the listener
by query text. Copy the PID from the exact application-name query above, confirm that it belongs
to the disposable API, then terminate that PID only:

```sql
select pg_terminate_backend(12345); -- replace with the confirmed disposable listener PID
```

Do not terminate an unidentified database session or reset a shared database.

## Notification queue pressure

`NOTIFY` delivery occurs at commit. A full PostgreSQL notification queue can therefore fail
the transaction that inserts an inbox row. Treat queue pressure as a write-path incident,
not as a disposable realtime failure.

```sql
select pg_notification_queue_usage();

select pid, usename, application_name, client_addr, xact_start, state, query
from pg_stat_activity
where xact_start is not null
order by xact_start;
```

At low usage, continue monitoring and inspect PostgreSQL warnings for the session preventing
queue cleanup. At sustained or rising usage, identify and end the responsible long-running
transaction using the normal database incident process. Never disable the trigger merely to
hide queue pressure: that loses the all-writer delivery guarantee. After the queue drains,
verify ordinary notification writes, listener recovery, and a fresh snapshot before clearing
the incident.

If notification commits are failing, pause the producer causing the load when operationally
possible, preserve the PostgreSQL logs, and restore transaction health first. Rows from failed
transactions do not exist and must be regenerated through the owning product workflow.

## Proxy verification

The response headers alone do not prove streaming. A valid probe observes both the initial
frame and a later database-triggered frame before the response closes. Run the reusable probe
against the direct API, Vite, nginx, and the deployment's stripped-prefix entrance:

```bash
STEEPLE_API=http://127.0.0.1:5218/api/v1 \
STEEPLE_DB=postgresql://sse_acceptance:sse_acceptance_pw@127.0.0.1:55432/sse_acceptance \
STEEPLE_PROXY_ORIGINS='vite=http://127.0.0.1:55173,nginx=http://127.0.0.1:58080,nginx-prefix=http://127.0.0.1:58081/steeple' \
STEEPLE_JWT_SIGNING_KEY="$DISPOSABLE_SSE_JWT_KEY" \
node src/Steeple.Web.v2/tools/notification-stream-proxy-test.mjs
```

Use a disposable signing key and database. Do not paste a production bearer token into a URL,
command line, log, screenshot, or evidence file. The probe sends authorization only in the
request header and prints neither token nor recipient ID.

For Caddy, route the same probe through the public root and any deployed stripped prefix. If
direct API and local proxies pass but Caddy does not deliver bytes promptly, inspect the exact
event-stream route for response buffering or compression before changing shared proxy policy.
Keep the existing forwarded headers, client IP accounting, sub-path stripping, and rate limits.

## Recovery checks

Use a disposable stack and one browser process per page. Keep an authenticated inbox open,
then test these separately:

1. Stop only the owned API, commit a notification while it is down, restart it, and confirm the
   browser recovers the row without a second arrival.
2. Terminate only the dedicated listener connection, commit during the listener outage, and
   confirm listener recovery closes the old stream and the replacement stream's initial event
   heals the snapshot.
3. Put a controlled TCP proxy between the API listener and PostgreSQL, silently stall traffic,
   and confirm the 30-second probe reaches its five-second deadline, closes subscriptions, and
   reconnects after the proxy is restored.
4. Hide the browser tab, commit a row, and confirm no automatic snapshot or reconnect occurs.
   Show it again and confirm the immediate refresh finds the missed row.

Use request, DOM, and stream events as causal evidence. Take screenshots only after the
interaction assertions have passed.

## Rollback

Roll back the web bundle first so clients stop opening streams, then roll back the API. Remove
the trigger through the Liquibase rollback only after no API process depends on listener
readiness. Ordinary notification snapshots and the outbox remain unchanged. Confirm a normal
notification write and inbox read after rollback.
