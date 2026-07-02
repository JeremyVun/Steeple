# Steeple — analytics & observability plan

> **Reminder doc.** Decided direction for the funnel-instrumentation pipeline (PRD: "instrument
> the funnel, nothing important goes un-instrumented", self-hosted, no lock-in). **Not built
> yet** — today the app emits events through the `IAnalyticsSink` port into a placeholder
> Postgres sink. That sink gets swapped for the model below; the port stays.

## Decision (2026-06-13)
- **Frontend-batched events → backend ingest endpoint.** A tiny dependency-free client batcher
  queues interaction events (listing views, map use, filter changes, funnel steps), and flushes
  on an interval / `visibilitychange` / `navigator.sendBeacon` on unload → `POST /api/events`.
- **App logs structured events to stdout.** The ingest endpoint and the *server-authoritative*
  events (search outcomes — incl. **zero-result**, the PRD liquidity proxy — and result counts)
  each write one structured JSON line to stdout via `ILogger`.
- **Promtail ships stdout → Loki.** The app runs in a Docker container; **Promtail tails the
  container logs** and pushes to Loki. The app has **no runtime coupling** to the analytics
  backend — a Loki outage never touches a request (the container log is the buffer).
- **Loki stores chunks + index on Spaces (S3).** Queried in **Grafana** with **LogQL** (which
  also computes rates / counts / aggregations over the event stream).
- **No Prometheus for now.** Overkill at POC scale — LogQL metric queries over Loki cover the
  funnel aggregates. Add Prometheus (+ a `/metrics` endpoint) later *only* if real-time alerting
  or high-frequency operational metrics are needed. The stack is additive.

## Pipeline
```
  [browser batcher] --POST /api/events--> [Web edge: validate + log JSON to stdout]
  [server events: search outcome, listing view] --------------------------------> stdout
                                                                                     |
                                               (Docker container stdout)             |
                                                                                     v
                                            [Promtail] --push--> [Loki] --chunks--> [Spaces/S3]
                                                                       ^
                                                              [Grafana / LogQL]
```

## What the analytics slice will build
- **`POST /api/events`** ingest endpoint on the Web edge: schema-validated event envelope,
  **Cloudflare Turnstile + per-IP rate-limit** (it's public *and* writable), writes structured
  log lines (no DB).
- **Replace `PostgresAnalyticsSink` with a `StdoutLogAnalyticsSink`** (ILogger, JSON scope) —
  keeps the `IAnalyticsSink` port and removes the request-path DB write entirely (this also
  retires the "analytics shares the request DbContext" smell noted in review).
- **Frontend event batcher** (tiny, `sendBeacon`).
- **docker-compose additions:** Promtail (tails the app container) + Loki (Spaces-backed chunk
  store) + Grafana. The app already logs to stdout by default in a container.
- **Event taxonomy** derived from the PRD funnel metrics (names + fields).

## Event taxonomy (from the PRD funnel) — draft
`search_performed` (filters, result_count, zero_result) · `listing_viewed` ·
`application_started` · `application_submitted` · `sso_started` · `sso_completed` ·
`map_interacted` · `booking_confirmed` · `rating_submitted` …

**Split:** server-authoritative outcomes (`zero_result`, `result_count`, approvals) stay
**server-emitted**; interaction events (views, clicks, map, funnel steps) are **client-batched**.
This protects the metrics the founder most needs from ad-blockers/spoofing while keeping the
high-volume interaction stream off the request path.
