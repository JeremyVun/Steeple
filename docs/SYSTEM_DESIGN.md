# Steeple — System Design (target architecture)

> **Status:** Adopted 2026-07-03. The **target-state** design for the full Steeple product
> — web, mobile, API, and the seams that let it scale without rework. Sits between
> `PRD.md` (what & why) and `ARCHITECTURE.md` (as-built). Phases 0–3 are built, so much of
> §4–§8 is now reality — the as-built detail lives in ARCHITECTURE; this doc keeps the
> intent, the not-yet-built parts, and the decision log. Decisions here supersede the PRD
> where they conflict; each deviation is recorded in
> [§17](#17-decision-log--deviations-from-the-prd). Doc map: `CLAUDE.md`.

## 1. Product shape & surfaces

Steeple is a two-sided, hyperlocal marketplace: churches list spare rooms; community
organizers find and book them, request→approve, at a host-set hourly rate. One beachhead
area (NoVA), concierge-seeded supply, productized demand.

**Decision — equal front doors.** Web and mobile are peer surfaces, not funnel + app:
an organizer can browse *and apply* on either; a venue provider can list and manage on
either (web first). The web funnel remains the SEO/share-driven acquisition lever and the
zero-install path; the mobile app is the "regular" home for recurring users (inbox, push,
rebooking). Nothing authenticated is app-exclusive by design — only by phasing.

| Surface | Tech | Role |
|---|---|---|
| **Steeple.Web.v2** | Vite + vanilla JS + Leaflet SPA (Three.js splash), served by nginx (same-origin `/api` proxy) | Discovery + share links; organizer apply/inbox; provider manage area (web-first). Replaced the ASP.NET MVC + HTMX cookie-BFF on 2026-08-05; retired source lives in Git history. |
| **Mobile app** (`/mobile`) | Flutter (iOS first, Android close behind) | Recurring-user home: browse, apply, inbox, push, rebook |
| **Steeple.Admin** | ASP.NET MVC + HTMX | Operator console, reduced to its real shape 2026-08-05: first-listing review queue, venue-manager linking, rating hide/unhide, plus a single-room Unlist takedown — nothing else (users/analytics/flags panels and the fake login/MFA screens are gone) |
| **Steeple.Api** | ASP.NET Core, JSON | The one backend all clients speak to |

## 2. Design principles

1. **Boring, lean, no lock-in.** Self-hosted Postgres + droplet + DO Spaces; ~$100 AUD/mo
   ceiling is a hard constraint. Managed vendors only where they remove liability
   (OAuth, Stripe, FCM, transactional email).
2. **Postgres is the system of record**; Liquibase owns the schema; applications never migrate.
3. **One API deployable, client-agnostic contracts.** Web, mobile, and future surfaces are
   peers of the same `/api/v1`. Split into separate edges only when a real force appears
   (see [§16 seams](#16-seams--scaling-triggers)).
4. **Modular monolith.** The API grows by module, each with its own ports and adapters.
   Modules are extraction candidates, never premature services.
5. **Delegate trust, don't custody it.** No passwords, no raw IDs, no card numbers, no
   custody of funds. Google/Apple hold identity; Stripe (later) holds payment identity.
6. **Integrity lives in the database.** No-double-booking is a `btree_gist` exclusion
   constraint, not an app-level check. State machines are enforced in transactions.
7. **Instrument everything** (PRD funnel taxonomy); push is an optimization, the inbox
   (Postgres) is truth.
8. **Friction scales with stakes.** Anonymous browse → SSO at apply → step-ups only where
   data shows abuse.

## 3. System topology (target)

```
                 Cloudflare DNS (orange) ─ Turnstile on public writable endpoints
                          │
                    Caddy edge proxy (deployed infra; authelia gates admin)
        ┌───────────┬─────┴────────┬──────────────┬───────────────┐
        ▼           ▼              ▼              ▼               ▼
   Steeple.Web  Steeple.Api   Steeple.Admin   flags svc      Grafana/Loki
   (v2 SPA on   (one JSON     (operator       (deployed      (deployed infra,
    nginx; /api  API, /api/v1) console)        infra, SSE)     reads app stdout
    proxied;        │              │              ▲               via Promtail)
    no DB)          │              │              │
        │           │              │              │ SDK (SSE + local eval)
        └─ HTTP ────┤              │              │
                    ▼              ▼              │
   [Flutter app] ──►│         Postgres ◄──────────┘ (flag rules, if/when persisted)
    (bearer)        │      (system of record)
                    │              │
                    ├─► DO Spaces (S3): listing photos (CDN, public-read) + nightly pg backups
                    ├─► Google/Apple JWKS (SSO token verification)
                    ├─► FCM (push, durable outbox)   ├─► transactional email (Resend, outbox)
                    └─► Google Geocoding/Places (metered, geofenced + rate-limited)
```

**Existing deployed infra services** (present in the deployed environment; integrated,
not built here): the **feature-flags service** (Perchd-pattern rules, `GET /flags` +
`GET /flags/stream` SSE, consumed via `Steeple.FlagsSdk`), **authelia** (edge auth gating
the admin hostname), and the **Loki/Promtail/Grafana** telemetry stack. Integration
contracts: `CONTRACTS.md` §8–9.

## 4. API internal architecture — modular monolith

`controller → service (ports) → proxy (adapters)` layering; growth is by **module**, and
folder-matched namespaces keep the global-usings scheme working:

```
Steeple.Api/
  Contracts/<Module>/     — wire DTOs (the only types clients see)
  Controllers/<Module>/   — thin JSON edges under /api/v1
  Services/<Module>/      — use-case logic + port interfaces
  Proxies/<Module>/       — adapters: EF repositories, gateways (email, push, flags, geocode, storage)
  Configuration/ Extensions/ Utils/
```

Modules (target set — ✅ built · 🔲 planned):

| Module | Owns | Key ports |
|---|---|---|
| **Discovery** ✅ | search, listing detail, suburbs, sitemap, geofence | `IRoomRepository`, `IGeofencePolicy`, `IGeocodingGateway` |
| **Identity** ✅ | SSO verify, users, sessions, agreements, account deletion | `IIdTokenVerifier`, `IIdentityRepository`, `IAccessTokenIssuer` |
| **Applications** ✅ | apply → ask → approve/decline state machine, threads | `IApplicationRepository`, `INotificationDispatcher` |
| **Bookings** ✅ | bookings, materialized occurrences, cancel, no-show | `IBookingRepository` (exclusion-constraint aware) |
| **Notifications** ✅ | inbox rows (truth), fan-out to push + email | `IPushGateway` (FCM), `IEmailGateway` |
| **Manage** ✅ | provider self-service venue/room CRUD, host-scoped first-listing moderation + durable operator takedowns | `IVenueManagerRepository`, `IManageRepository`, `IGeocodingGateway` |
| **Media** ✅ | photo upload → variants → Spaces (or local disk in dev) | `IMediaStore`, `IImageProcessor` |
| **Ratings** ✅/🔲 | ratings, review comments, double-blind reveal; response-rate stats planned | `IRatingRepository` |
| **Ingest** ✅ | `POST /api/v1/events` analytics ingest → stdout | `IAnalyticsSink` |

**Module rules** (what keeps extraction cheap): a module's services may depend on another
module only via that module's **service interface**, never its repository or entities in
write paths; cross-module *reads* may share EF queries pragmatically (one DB — don't
pretend otherwise), but anything that mutates goes through the owning module. Contracts
never reference `Steeple.Persistence` types.

## 5. Domain model

The as-built model (venues → rooms → applications → bookings → ratings, identity,
notifications) and its DB-enforced invariants live in `ARCHITECTURE.md`. Remaining target
addition in this reputation area: response-rate stats (full design:
`docs/backlog/reputation-and-launch.md`).

## 6. Identity & auth

Built (see ARCHITECTURE): server-side ID-token verification (Google/Apple JWKS), the
API's own access+refresh tokens with rotating families, Turnstile + rate limits, account
deletion. One `users` table for organizers and providers — no role wall.

**Web uses cookie transport without persisting identity.** `Web.v2` is a static SPA: the API
sets the rotating refresh token in an httpOnly, SameSite=Strict cookie; the access token and
profile stay in module memory. Reload restores through the cookie, tabs exchange only opaque
signed-in/out events through `BroadcastChannel`, and no credential or profile is written to
browser storage. A strict CSP and security headers remain defense in depth. Rotation keeps a
30-second committed-successor grace for simultaneous tabs, after which family-wide reuse
revocation contains a stolen token (`docs/contracts/identity.md`). Target-state points that remain:

- **Mobile (Phase 4):** native Google/Apple sign-in → ID token (with nonce) →
  `POST /api/v1/auth/sessions` → tokens in Keychain/Keystore; a dio interceptor refreshes
  transparently.
- **Account linking:** deferred — same verified email on a second provider gets
  `409 use_original_provider`, never auto-linking.
- **Abuse step-ups** (phone OTP via `ISmsOtpSender`) only when abuse metrics demand (§16).
- **Admin:** stays a separate surface behind **authelia at the edge**; in-app it trusts
  the forwarded `Remote-User` header for audit attribution and never gets consumer SSO.
  Defence-in-depth via local ASP.NET Identity + TOTP is **dropped** (2026-08-05, §17):
  authelia *is* the auth story, and the non-functional login/MFA screens were deleted.

## 7. Applications & bookings flow

Built end-to-end on web — mechanics in ARCHITECTURE, key decisions in §17 (thread-driven
NeedsInfo, lazy sweeps instead of workers, 48h occurrence-level notice window,
approval-as-one-SaveChanges). The product mechanics the model carries: intent-first
applications (activity/size/frequency shown to the provider), approve/ask/decline,
auto-decline of competing applications for a taken slot, notice-window cancellation
freeing slots, two-way no-show marking feeding ratings, stale applications auto-expired.

## 8. Notifications

- **Inbox = truth** (`notifications` rows), fetched on open / pull-to-refresh — no
  realtime layer at this scale. Built, with transactional email/push fan-out persisted in
  `notification_outbox` in the same transaction as the inbox row; a bounded worker retries
  provider failure and process loss with an at-least-once guarantee.
- ✅ **FCM push** joins the same `INotificationDispatcher` fan-out (registered `devices`;
  data messages carry `{notificationId, type, deepLink}` only — CONTRACTS §9).
- Email is transactional-only until a real marketing consent flow exists (CAN-SPAM:
  transactional exempt from unsubscribe requirements; anything promotional needs one).

## 9. Media pipeline ✅ (Phase 5)

Built as designed — mechanics in `ARCHITECTURE.md` (Media module), wire shape in
`CONTRACTS.md` §6. One deviation from the original design (§17): variants are **JPEG-only**,
not JPEG+WebP — WebP is deferred until a `<picture>` negotiation exists on the serving side to
make it worth the extra encode. Proxy-through-API (not presigned direct-to-Spaces) stands as
designed — fine at this scale, keeps validation server-side; Admin uses the same endpoints for
concierge onboarding, no separate path.

## 10. Geo & search

- As-built bounding-box + haversine stands until multi-area (trigger table §16).
- Geocoding/autocomplete: explicit Apple or Google production adapters behind
  `IGeocodingGateway`, with the development stub rejected in Production. Provider address entry
  is geofenced and rate-limited because it proxies a metered SKU; public search autocomplete
  remains deferred.
- The geofence config becomes an **`areas` table** when area #2 arrives; until then the
  config section stays. Listing pages and area landing pages key off area slug (SEO).

## 11. Feature flags

Consume the deployed flags service through `Steeple.FlagsSdk`: SSE subscribe to
`/flags/stream`, local in-memory evaluation (never on the hot path awaiting network),
`GET /flags` snapshot on boot/fallback. Interim until the SDK has a home in this repo:
config-backed `IFeatureFlags` with the same key names (§17). Naming
`<surface|domain>.<feature>` (e.g. `web.apply_from_browser`, `trust.phone_otp_stepup`).
Every risky new surface ships behind a flag; mobile evaluates via the `GET /api/v1/flags`
proxy (the app never talks to the flags service directly). Flags have no Admin screen —
the mock panel is deleted (2026-08-05, §17); the flags service owns its own console.

## 12. Analytics & observability

Built pipeline: web and Flutter client batchers
→ `POST /api/v1/events` ✅ (rate-limited per IP; abuse defense is a client-sourced-event
allowlist + payload-size drops, not Turnstile — CONTRACTS §7) → structured JSON to stdout →
Promtail → **Loki → Grafana** (deployed infra). Server-authoritative events (search outcomes,
decisions, bookings) are emitted
server-side and never trusted from clients; the PRD funnel taxonomy is the contract
(`CONTRACTS.md` §7). Ops: uptime monitor → phone, DO snapshots + nightly `pg_dump` to
Spaces, **restore drills** (untested backup ≠ backup), one-page runbook with RTO target.

## 13. SEO, marketing & growth seams

`docs/contracts/seo.md` owns the built crawler surface (sitemap, robots, clean canonical routes,
per-listing HTML/meta/OG/JSON-LD, and real 404s); `docs/backlog/seo/` preserves its historical
rationale and current deferrals (area landing pages, CWV). Remaining architecture hooks:

- `UpdatedAtUtc` on rooms/venues (sitemap lastmod) — built.
- **Area landing pages** (`/halls/{area-slug}`) — the multi-metro seam doubles as the SEO
  page-per-area lever.
- **Universal/app links:** the deployed web surface must add
  `/.well-known/apple-app-site-association` + `assetlinks.json` so shared listing URLs open the
  app when installed (share loop ↔ mobile bridge). This remains unbuilt.
- **UTM/referral capture** into the analytics envelope (which church shared the link that
  converted — supply-side attribution for the founder's GTM).
- Brand/marketing copy stays in the surface's own templates, not in code (`BrandOptions`
  was a `Web.v1` construct and retired with it; v2 has no equivalent yet).

## 14. Legal & regulatory seams (US / Virginia first)

Design-for now, build when triggered:

| Concern | Stance now | Seam in the design |
|---|---|---|
| Platform liability | Neutral platform (PRD Option A): not a party to bookings; ToS disclaims; organizers attest coverage | `user_agreements` records **which ToS version** each user accepted, at apply time |
| ToS / Privacy docs | Versioned markdown → rendered pages; acceptance recorded per version (built) | Re-acceptance flow on version bump (flag-gated) |
| Safeguarding / children | v1 Option A: "Identity-verified (SSO)" only, explicit *no vetting* disclaimer; churches surface their own requirements | Listing field for church-stated requirements |
| Privacy (VA CDPA etc.) | Under thresholds, but build the plumbing: data minimization, PII inventory, export + delete | `DELETE /api/v1/me` (anonymize, built); PII confined to `users`/`user_logins`/`applications` text |
| PII custody | Never hold gov IDs, cards, phone numbers (until OTP step-up — then verify-only via Twilio/Plivo) | Delegation ports: `IIdTokenVerifier`, later `ISmsOtpSender`, Stripe |
| UGC / DMCA | Provider self-service photo uploads are live (Phase 5). Takedown path since 2026-08-05: the single-room **Unlist** action on `/admin/listings` (routes through the same lifecycle rule as `/manage` — a room with upcoming confirmed occurrences can't leave Published, cancel those first), with psql as the backstop for anything Unlist refuses. The host's own unlist via `/manage` remains the everyday path | Registering a DMCA agent with the Copyright Office is the remaining ops carry-over (backlog phase-6 launch checklist) — not code |
| Email/SMS law | Transactional email only (CAN-SPAM exempt); no marketing sends without consent + unsubscribe; TCPA applies if SMS ever ships | Consent columns before any marketing channel |
| Accessibility | WCAG 2.2 AA target for Web (ADA exposure is real for public accommodations); accessibility filters already first-class | Web v2 is a JS-driven SPA with a canvas splash and clean History-API routes; focused axe coverage is built, while a deployed assistive-technology audit remains a launch task |
| Tax / payments | Nothing until payments; then Stripe Connect handles KYC + 1099-K | §15 |

## 15. Payments seam (rails built 2026-08-05, mock era; Stripe adapter deferred)

The rails exist: the **Payments module** (`IPaymentGateway` port + `MockPaymentGateway`,
`payments`/`venue_payment_accounts` tables, method-on-file, per-occurrence charging with the
failure ladder, refunds, payout-onboarding stub, the `PaymentSweeper` worker) behind the
`payments.enabled` flag, plus per-venue **booking modes** (instant default / manual opt-in —
`docs/backlog/booking-modes.md`). As-built wire truth: `docs/contracts/payments.md`.
What stays deferred to the Phase 7 trigger: the **Stripe Connect** adapter (Express accounts,
destination charges, application fee = the invisible commission), webhooks +
`webhook_events`, disputes, and the §11-of-payments.md legal/policy work. Steeple never
touches funds or card data (mock stores display brand/last4 only); Stripe owns
KYC/payouts/1099-K at swap time — one adapter behind the existing port. **The full design is
`docs/backlog/payments.md`** (read its 2026-08-05 supersession notes); this section stays the
seam summary.

## 16. Seams & scaling triggers

Every seam, what opens it, and what it costs when opened:

| Seam | Exists as | Opens when | Cost then |
|---|---|---|---|
| Web ↔ Api split | HTTP boundary, no shared assembly (built) | already open | — |
| Mobile edge / BFF split | Client-agnostic `/api/v1`; contracts owned by API | Clients' needs genuinely diverge | New thin BFF in front of same services |
| Module → service extraction | Module folders + port interfaces + "mutate via owning module" rule | A module needs independent scaling/deploy | Lift module + its tables; ports become HTTP |
| Geo at scale | Bounding-box behind `IRoomRepository`; `IGeocodingGateway` | >1 area or slow geo queries | Swap to PostGIS + `areas` table; one adapter |
| Maps cost | Native SDKs free; geocode proxied + rate-limited | Google pricing turns hostile | MapLibre + Protomaps + self-hosted geocoder (PRD escape hatch) |
| DB scale | Single Postgres on droplet; nightly backups | Droplet contention / durability worry | DO Managed Postgres; connection string change |
| Notifications scale | Transactional outbox + bounded background worker (built 2026-08-09) | Sustained batch lag / provider quotas | Tune batch/cadence; split channel workers behind the same ports |
| Trust escalation | Tiered stack; `ISmsOtpSender` port unimplemented | Abuse metrics demand it | Plivo/Twilio Verify adapter + flag |
| Payments | Nullable price columns + `IPaymentGateway` port (unbuilt) | Paid bookings materialize | Stripe Connect adapter, ToS bump |
| Multi-metro | Geofence config → `areas` table; area slugs in URLs/SEO | Beachhead #2 committed | Liquibase changeset + landing pages; **GTM is the hard part, not the tech** |
| Deploy scale | compose stacks; single VM | VM #2 | orchestrator path (deployed-infra concern) |
| Analytics scale | Loki/LogQL, no Prometheus | Real-time alerting needs | Add Prometheus + `/metrics`; additive |

## 17. Decision log — deviations from the PRD

| Date | Decision | Rationale |
|---|---|---|
| 2026-07-03 | **One API deployable** (not the PRD's two edge APIs), client-agnostic `/api/v1`, BFF split deferred behind a seam | Solo-operated, $100/mo, one contract to govern; split stays cheap |
| 2026-07-03 | **Equal front doors** — web gets apply + provider self-service, superseding "web = read-only funnel, apply converts to app" | Founder direction; installs must never gate conversion; matches product brief |
| 2026-07-03 | **Flutter maps = `google_maps_flutter` on both platforms** (not MapKit-on-iOS) | Official, stable plugin (the reason Flutter was chosen); Google's native mobile SDK loads are unbilled on iOS *and* Android, so cost parity; one code path. Revisit only if Google mobile-SDK pricing changes |
| 2026-07-03 | **Flags / admin-edge-auth / telemetry are existing deployed infra services** — integrated, not built here | They already run in the deployed environment |
| 2026-07-03 | Wire enums move to **stable machine-readable strings** in `/api/v1` (humanized strings were a web-display convenience) | Mobile needs stable values; display formatting belongs in clients (`CONTRACTS.md` §2) |
| 2026-07-04 | **Google web sign-in = GIS button + same-origin credential POST** (not a cross-site redirect POST) | The GIS callback submits our own form, so the antiforgery token protects the callback and no SameSite=None cookie gymnastics are needed; Apple stays form_post (unavoidable) guarded by a signed state cookie |
| 2026-07-04 | **Apple web flow uses `response_type=code id_token`** and never exchanges the code | The ID token arrives directly in the form_post, so sign-in needs no Apple client-secret JWT / `.p8` handling at all (that machinery becomes necessary only if we ever need Apple refresh tokens) |
| 2026-07-04 | **Feature flags are config-backed for now** (`Flags` section → `IFeatureFlags`), same key names as the flags service | The flags SDK source still lives outside this repo (ROADMAP Phase 0 leftover); the port keeps the swap to SSE-backed evaluation a one-implementation change |
| 2026-07-04 | `Idempotency-Key` deferred on `auth/sessions` (documented in CONTRACTS §4) | A replayed sign-in only issues an extra revocable session; the idempotency store earns its keep with Phase 2 applications |
| 2026-07-04 | **Application expiry is a lazy sweep on read**, not a background worker | Solo-scale: no scheduler to operate; an expired Pending can never be *seen* stale, which is the actual invariant. A worker (or pg_cron) slots in behind the same status if Phase 6 tuning needs push-based expiry nudges |
| 2026-07-04 | **NeedsInfo is driven by the thread**: a provider message on Pending → NeedsInfo; the organizer's reply → Pending. No separate "request info" endpoint | One less endpoint and the state always matches the conversation; approve/decline stay the only explicit decisions |
| 2026-07-04 | **Transactional email = Resend** behind `IEmailGateway`. **Superseded 2026-08-09 → the transactional-outbox decision below:** the original fire-and-forget delivery mechanic no longer governs. | Free tier fits the cost ceiling; one HTTP adapter to swap (SES/Postmark are drop-in behind the port). Hardened 2026-08-06: unconfigured sends log no recipient, subject, or body. |
| 2026-07-04 | **Web BFF emits `application_started`/`sso_started` server-side. Superseded 2026-08-07 → `docs/contracts/analytics.md`: web v2 emits the client-owned events through its own batcher.** | The original BFF emitter kept the funnel measurable before Ingest existed. The BFF later retired; the shared ingest endpoint and client batchers now own interaction events. |
| 2026-07-04 | Unknown and unpublished rooms answer application submits identically (`404 room_not_bookable`) | Same no-existence-leak stance as the listing visibility gate |
| 2026-07-04 | **Exclusion constraint is an expression** — `EXCLUDE USING gist (RoomId WITH =, tstzrange(StartUtc, EndUtc) WITH &&) WHERE (Status <> Cancelled)` over two `timestamptz` columns, not a stored `During tstzrange` column | Persistence stays provider-agnostic (no `NpgsqlRange` types in entities); the partial predicate makes "cancellation frees slots" a pure status flip; the SQL changelog owns the constraint outright |
| 2026-07-04 | **Approval atomicity = one `SaveChanges`**: the Applications service flips status (owning its data), the Bookings service saves booking + occurrences, and the shared scoped DbContext commits all of it in one implicit transaction; `EfBookingRepository` translates SQLSTATE 23P01 → slot-taken | No explicit transaction plumbing or cross-module repository access; the module-ownership rule holds (each module mutates only its own rows) while the DB still guarantees all-or-nothing |
| 2026-07-04 | **Cancellation notice window = 48h, occurrence-level**: cancelling frees only occurrences starting ≥48h out; nearer ones still stand (and stay no-show markable) | The other party was owed notice — near-term commitments shouldn't evaporate under someone's feet; keeps last-minute cancellations visible to the Phase 6 reputation loop instead of silently freeing the slot |
| 2026-07-04 | **DST resolution rules**: materialize per-date in the venue zone; nonexistent (spring-forward) wall times shift forward by the gap; ambiguous (fall-back) times resolve to standard time | Deterministic, matches human intent ("9am is 9am"), and `TimeZoneInfo.ConvertTimeToUtc`'s documented behavior — pinned by unit tests |
| 2026-07-04 | **Booking sweeps are lazy on read** (occurrence → Occurred, term → Completed, renewal nudge once inside the last 14 days), extending the Phase 2 lazy-expiry decision | Same solo-scale rationale: no scheduler to operate; nothing user-visible can render stale because every read sweeps first |
| 2026-07-04 | **FirebaseAdmin SDK adopted behind `IPushGateway`** for FCM data-message delivery (Phase 4) | Official Google SDK, Apache-2.0, $0; a `LoggingPushGateway` stand-in covers dev/unconfigured environments, and the port keeps swapping providers (or dropping to raw HTTP v1 calls) a one-adapter change |
| 2026-07-04 | **ImageSharp pinned to 3.1.x** (not 4.x) | 4.x requires a paid commercial license above certain revenue/usage thresholds; 3.1.x is the last fully free major version and covers everything the Media pipeline needs |
| 2026-07-04 | **Media variants are JPEG-only**, WebP deferred | §9 originally specified JPEG+WebP; WebP only pays for itself once the serving side can `<picture>`-negotiate format — that doesn't exist yet, so it's a follow-up, not a Phase 5 blocker |
| 2026-07-04 | **Moderation is nullable timestamps on `rooms`/`venues`** (`PublishRequestedAtUtc`, `FirstPublishedAtUtc`, `ProviderEditedAtUtc`), not a separate queue table | Partial indexes make the Admin queue/feed scans just as cheap as a dedicated table would, with no new entity, no join, and no state to keep in sync with `RoomStatus` |
| 2026-07-04 | **Admin writes notification-inbox rows directly** on a moderation decision — no email/push fan-out from Admin | Same "inbox = truth" principle as the API's `INotificationDispatcher` (§8); at Admin's decision volume a provider checking their inbox is the whole deal, and it avoids giving Admin its own copy of the email/push adapters |
| 2026-07-04 | **Dev compose publishes a loopback API port** (`127.0.0.1:8081`) | Retained for mobile/direct API development. **Refined 2026-08-07:** browsers no longer use this origin for local media; web and Admin proxy origin-independent `media/...` paths to the compose-internal API. |
| 2026-07-04 | **Slugs are immutable after creation** | Slugs are the public URL identifier (SEO + shared links); allowing renames would silently break every outstanding link, bookmark, and indexed search result |
| 2026-07-05 | **`schedule.dayOfWeek` → `daysOfWeek: string[]` as a clean break inside `/api/v1`** (no compatibility shim), stored as a `Weekdays` int bitmask (bit n = .NET `DayOfWeek` n, Sunday = bit 0) on `applications`/`bookings` | Pre-launch with zero released mobile builds, so the §1 "breaking only if all clients update in the same commit" rule is satisfiable at trivial cost now and never again; the bitmask matches the repo's flags-as-int idiom (`Amenity` etc.) and makes multi-weekday recurrence ("Tue+Thu weekly") one application → one booking → one exclusion-constraint check instead of N parallel requests |
| 2026-07-05 | **Open hours are required to publish** (`no_open_hours` gate behind `manage.open_hours_required`), with the 009 migration backfilling 7×08:00–22:00 windows for every already-published room | The guest calendar is only trustworthy if every bookable room has rules; the generous backfill means turning the flag on never unpublishes anyone — hosts tighten from a working default instead of being blocked |
| 2026-07-05 | **Availability is advisory; the exclusion constraint stays authoritative.** Guest reads subtract *confirmed* occurrences only (pending demand never leaks), and the submit-time **hard block** (`409 schedule_unavailable` with a per-date conflict list) rejects schedules that can't fit — but approval still runs through the `booking_occurrences` constraint, and `slot_taken` handling is unchanged | User decision (hard-block over advisory-only): guests should never submit a request that's dead on arrival, yet no computed view can be the booking authority under concurrency — two pending requests for one slot must still race at approval, decided by the DB. Rooms with no rules rows (legacy) skip the block so the gate rolls out gradually |
| 2026-07-05 | **Time-first search refines after the SQL prefilter and paginates after refinement.** Open-hours/blackout EXISTS clauses prefilter in SQL; real free-window math (confirmed occurrences subtracted) runs in-process over the candidate set; pages are cut from the refined list | Correct pages beat clever pages: refining after pagination would under-fill pages and break counts. The candidate set is geofence-bounded (beachhead scale), so the in-process pass is cheap. If supply outgrows this, the seam is a materialized per-day free-window table — noted here so the optimization lands behind the same `AvailabilityFilter` without a wire change |
| 2026-07-07 | **Free listings removed from the product.** `pricePerHour` is required and positive (DB `NOT NULL` + `CHECK > 0` in 010, mirrored in ManageService validation); `isFree` and the `freeOnly` search filter left the wire contract; every Free badge/filter/pin affordance stripped from web + mobile; the availability-sense "Free 6–9 PM" matched-window copy became "Open 6–9 PM" so nothing reads as a price signal | Founder decision superseding the PRD's free-first positioning: free venues aren't going to be a thing. Pre-launch, so the §1 breaking-change rule (all clients update in one commit) is satisfiable cheaply now |
| 2026-07-05 | **Counter-offers keep the organizer's original ask on the application; accepting books the counter schedule via a `ScheduleSpec` override on the booking transaction.** At most one counter is `open` (partial unique index); posting again supersedes; decline returns the application to `pending`; approve is blocked while `counterOffered` | The ask/offer history must stay honest for the thread (and any later dispute) — mutating the application's schedule would erase what the organizer actually requested. The spec override keeps approval and counter-accept on the identical single-SaveChanges booking path, so the exclusion-constraint race handling (`slot_taken` + auto-decline) is one code path, not two |
| 2026-08-05 | **One human gate for moderation (D2).** A new host's first listing goes "under review"; **one operator decision verifies the venue *and* publishes the listing**. "Trusted host" is *derived* — any manager of a room with `FirstPublishedAtUtc` set — so a trusted host's further rooms and venues **auto-publish** (stamping `IsIdentityVerified` if unset). New invariant: **published ⇒ venue verified**. The standalone venue-verification decision is retired; evidence submission survives as review *input*, not a precondition. The whole rule moves into `ManageService` (single enforcement point); Admin only records the operator's decision. **Supersedes the two-step model recorded 2026-07-04** (separate venue verification + per-room first-publish approval); that date's *storage* decision (moderation as nullable timestamps) still stands, and no schema change is needed. **Built 2026-08-05** (v2_migration Phase 3): `ManageService.IsTrustedHostAsync` + the invariant enforced on every publish path; unit + integration tests cover both paths and the live loop was driven end to end | The two-step gate cost the founder two decisions and a state to keep in sync for one real judgement ("is this host and this listing legitimate?"), and it had already drifted (Admin's bulk listing-status write published rooms bypassing verification entirely). PRD's fraud-prevention commitment is satisfied by the human review itself, and after the first approval every host is self-serve forever |
| 2026-08-05 | **Steeple.Admin shrinks to the review queue (D3).** Kept: first-listing review queue, venue-manager linking, rating hide/unhide. Deleted: users panel (in-memory mock), analytics panel (reads a table nothing writes — Loki superseded it), feature-flags panel (mutates a disconnected mock), login/MFA/trusted-device screens, application force-status repair, bulk listing-status changes, the `ProviderEditedAtUtc` review-feed screen (column + stamping stay as the dormant abuse seam). **Authelia-only auth is the settled stance**, superseding the backlogged "defence-in-depth local ASP.NET Identity + TOTP" item (phase-7 deferred-items table). **Built 2026-08-05** (v2_migration Phase 3). Two additions the build made: the takedown lever the bulk screen was carrying is now a single-room **Unlist** on `/admin/listings` (honors upcoming confirmed occurrences; the host can relist), and Admin's CSP `img-src` is config-pinned to the media origin — it was blocking every queue photo, so the operator was deciding blind | Every deleted screen was either theatre (the login/MFA screens never authenticated anything — authelia already gates the hostname), a mock, or an invariant-bypassing write. Finishing them would cost real work to duplicate a control the edge proxy already provides |
| 2026-08-05 | **Web v2 (Vite + vanilla JS SPA) is the web surface; the MVC + HTMX cookie BFF (`Web.v1`) was retired.** Its implementation was deleted from the working tree on 2026-08-09 and remains in Git history. **Superseded 2026-08-09 → `docs/contracts/identity.md`:** the initial localStorage token/profile transport was replaced by an httpOnly refresh cookie plus in-memory access token/profile and opaque `BroadcastChannel` events. | The animated-web prototype won on product terms (map-first, one continuous surface), and keeping two web front-ends was not affordable solo. The later cookie/memory design recovers the important no-durable-JS-credential property without reintroducing a BFF. |
| 2026-08-05 | **Wire contracts split into `docs/contracts/` — one small file per seam** (README, conventions, discovery, identity, applications, manage, analytics, infra, api-ports, persistence, web, mobile), with `CONTRACTS.md` kept as a thin §-number-preserving index | Every "§n" citation in code comments and docs keeps resolving, while an agent (or human) answering one interface question loads one small file instead of the whole contract book |
| 2026-08-05 | **Upcoming-booking reminders run on a `BackgroundService`** — a `booking_reminders` sent-ledger (unique `(OccurrenceId, Kind)`, claimed before dispatch) makes it idempotent; "coming up" fires T−7d for a booking's *first* upcoming occurrence only, "tomorrow" fires T−1d for *every* occurrence; both parties receive inbox/push, while email is limited to T−1d for the booking's first occurrence. | The lazy-sweep-on-read decisions hold for anything a reader can observe, but a reminder exists to reach someone who is not looking. The DB-level claim makes restart or multiple replicas safe. |
| 2026-08-05 | **Email CTAs are composed by the dispatcher, from the notification payload's own `deepLink`** (`{Email:WebBaseUrl}/?goto=<url-encoded deepLink>`); `IEmailGateway` takes `EmailContent` and is transport-only (the previous `/inbox` link appended inside `ResendEmailGateway` is gone). A Development-only `IDevMailbox` decorator captures sends for a browsable `/dev/mailbox` | One composition point means email, push and the inbox row can never disagree about where an event lives, and adding a notification type can't forget its link. Local sends were previously only log lines — a log line's CTA can't be clicked, so nothing in the deep-link grammar was verifiable end-to-end without a real mail provider |
| 2026-08-09 | **Email and push delivery use a transactional outbox.** `NotificationDispatcher` commits inbox + delivery envelopes together; `NotificationOutboxWorker` leases bounded batches in fresh scopes, retries with exponential backoff, and stamps/logs terminal failure. Leases make process loss retryable; the provider-accept/stamp seam makes the guarantee at-least-once, not exactly-once. | Request-scoped fire-and-forget tasks could outlive their transient gateway/DbContext scope or vanish on process termination. The outbox makes decided work durable without holding user requests open on provider latency. |
| 2026-08-05 | **Web-v2 migration decisions D1–D9. Superseded 2026-08-07 → the migration is closed; current behavior lives in `ARCHITECTURE.md` and the owning contracts.** | The original plan is historical material in Git, not an active source of requirements. Its deviations and completion are retained in this decision log. |
| 2026-08-05 | **Instant book is the product default; request→approve is a per-venue host opt-in** (`venues.BookingMode`, `docs/backlog/booking-modes.md`; behind `payments.enabled`). An instant submit *is* the booking transaction — the identical one-`SaveChanges` + exclusion-constraint machinery as approval, `slot_taken` on a lost race with **nothing persisted** (no auto-decline: there was no application to decline). Supersedes the PRD's "request → approve, not instant-book" stance | Owner decision: with a card at request and a host rescind lever (cancel any time → full refund), the slow "no" costs more than it protects; hosts who want the gate keep it by choosing `manual`. One booking path means the double-booking proof never forked |
| 2026-08-07 | **Same-room booking creates take a transaction-scoped room-row lock before `SaveChanges`.** The GiST exclusion constraint remains the final overlap authority; unrelated rooms remain concurrent. Refines the 2026-07-04 implicit-transaction decision: the transaction is now explicit but contained entirely inside `EfBookingRepository`. | Concurrent overlapping GiST inserts can deadlock (`40P01`) before one reaches the expected exclusion violation (`23P01`). A canonical per-room lock order makes the documented loser reliably become `slot_taken` instead of an intermittent 500, without transaction plumbing in services. |
| 2026-08-05 | **Charge timing supersedes payments.md §5 in part:** first occurrence (= the whole of a one-off) charges **at confirmation**, post-commit; later occurrences keep the T−48h rule. **Idempotency key = occurrence id** at the gateway + a partial unique index (`payments (OccurrenceId) WHERE Status <> Failed`, claim-before-charge) make double-charging impossible by construction | Immediate, ticket-like commitment at booking time; the claim-first row means even concurrent sweepers race on an index insert, not on money. Recorded here because payments.md predates it (its §5 carries the supersession note) |
| 2026-08-05 | **Provider-cancel asymmetry shipped:** a host cancel/rescind frees **every** scheduled occurrence and auto-refunds everything charged on them, any time; the 48h notice window binds only guest cancels (<48h occurrences stand, charges stand). One declarative refund rule — *succeeded charge on a cancelled occurrence ⇒ full refund* — enforced immediately post-cancel and re-run by every sweep (crash-safe). Supersedes the 2026-07-04 symmetric-window decision for money and free bookings alike | The window existed to protect the counterparty; a provider breaking their own commitment is the case it must not protect (payments.md §6's reasoning, now live). The declarative rule collapses host-rescind, guest-early-cancel, and term-cancel refunds into one code path that can't lose a refund to a crash |
| 2026-08-05 | **First background worker: `PaymentSweeper`** (`IHostedService`, ~5-min cadence, Postgres advisory lock, intervals config-tunable) — exactly the trigger the lazy-sweep decisions reserved: money movement must not depend on someone opening a page. Scope is deliberately minimal: charge due occurrences, surface the failure ladder's auto-cancels (executed via the Bookings service), re-run the refund rule. Everything else stays lazy-on-read | pg_cron can't call the gateway SDK; a worker inside the API adds no infra. The advisory lock makes it correct today on one instance and safe if instances multiply |
| 2026-08-05 | **Payments run on a mock gateway until Stripe** (`MockPaymentGateway`: synthetic ids, instant success, card ending 0002 declines) with a **mock-era simplification: venue payout-onboarding state gates nothing** — priced bookings charge regardless, so the full loop is drivable against seed data. At Stripe-time, payout readiness + opt-in become the payments.md §4 confirmation-time gate | The whole product surface (gate, instant book, ladder, refunds, wire shapes) ships and hardens now; the Stripe swap is one adapter behind `IPaymentGateway`, not a redesign. The simplification is documented in `contracts/payments.md` so nobody mistakes the stub for the gate |
| 2026-08-05 | **Idempotent manage creates use a per-user ledger table, not the applications module's per-row column (D8, deviation).** `idempotency_records` PK `(UserId, Scope, Key) → ResourceId` (changeset 016; the original migration plan expected no schema change) is written in the same `SaveChanges` as the venue/room it buys, so the primary key is the race guard. Applications keep their 004 column unchanged. | Applications' filtered unique `(OrganizerId, IdempotencyKey)` works because an application carries its owner as a column; a venue does not — ownership lives in `venue_managers`, so the per-user uniqueness that makes the guard race-safe can't be expressed on `venues`. The ledger generalizes to future creates for the cost of one small table. |
| 2026-08-05 | **Web v2's correspondence is server-truth, and `store.js` is strictly its mirror (D4/D5, built).** One client seam, `data/correspondence.js`, owns every read and write after a request is written; the store has one entry point per wire shape and no local status machine. The hosting entry point is a routing decision, not a screen, and the demo fixture stays in dev builds as contained village scenery. **Hardened 2026-08-09:** the mirror and unfinished drafts became memory-only and legacy persisted namespaces are purged. | A cache that can also decide things is two records, and the second one eventually lies. Server truth plus a disposable memory mirror prevents browser storage from becoming a private correspondence database. |
| 2026-08-06 | **The web refresh token moves to an httpOnly cookie, and rotation gets a 30-second reuse grace.** Cookie transport leaves the access token in memory; logout accepts the cookie; refresh has its own limiter. **Superseded 2026-08-09 → `docs/contracts/identity.md`:** no profile/tombstone remains in storage, and concurrent callers await one committed rotation task before any successor credential is returned. | Two tabs are one session and may rotate together. A conditional database update prevents family forks; the in-memory grace avoids treating the honest loser as theft. Commit-first task sharing ensures a failed database write cannot leak an unusable successor. The remaining 30-second predecessor-theft window is explicit and monitored. |
| 2026-08-06 | **Production security hardening supersedes global host trust and reversible Admin unlisting.** Review is scoped to `Venue.IsIdentityVerified`: the first listing at every newly claimed venue waits; approval unlocks later rooms only there. Admin Unlist stamps `OperatorUnlistedAtUtc/By`, applies even with bookings, and managers cannot clear it. Production rejects repository-known JWT keys and enabled mock payments; `mock-*` routes are Development-only; changeset 017 removes synthetic payment state. Forwarded headers are one-hop/private-proxy only, nginx + API enforce total/discovery limits, image headers are bounded before two-slot decoding, and missing email config emits no PII logs | The security audit demonstrated cross-venue trust escalation, relistable takedowns, a forgeable fallback key, mock-money activation risk, spoofable rate partitions, decompression allocation, and private-content logs. Each control now fails closed at its owning boundary |
| 2026-08-07 | **The web v2 production migration (D1–D9) is complete and closed by its P6 sweep.** The owner's five-step E2E was driven as three humans against the compose stack + a Development API; `dotnet test` 403+96 passed and every web suite was green under its documented flags or had its known stale set recorded. | The original plan lives in Git history. Current behavior is in `ARCHITECTURE.md` and `docs/contracts/`; this row preserves the completion result and where its residue landed. |
| 2026-08-07 | **Local-disk media paths are origin-independent; CDN URLs stay absolute.** `LocalDiskMediaStore` persists `media/{key}` and web nginx/Admin proxy it to the API; Vite already did, and mobile resolves it against `STEEPLE_API_URL`. Changeset 018 rewrites earlier loopback URLs. S3/Spaces continues to persist the configured absolute CDN URL. | A port is deployment topology, not durable listing data. Baking `:5200`/`:8081` into Postgres caused CSP failures and orphaned rows whenever clients or API instances changed; same-origin browser paths also keep the strict CSP. CDN URLs need to remain absolute for public object delivery, so only their permanent origin is configuration. |
| 2026-08-07 | **The beachhead is a policy, not an architecture: `IGeofencePolicy` is the declared served-area seam.** The port's members went area-neutral (`Bounds`, `IsServed`, `TimezoneId` — the controller's hardcoded `America/New_York` moved into the `Geofence` config section), the geocode address string builds without a region token when `Geocoding:Region` is empty, and provider country scoping is `Geocoding:LimitToCountries` (empty = worldwide). Owner intent recorded: the single NoVA beachhead is a *release strategy* for product-market fit, not the product's shape. What is already global-capable and must stay so: the search wire (`centerLat/centerLng/radiusMeters` or viewport bbox, `appliedBounds` echoed back), venue rows (lat/lng + host-set IANA timezone), the suburbs vocabulary (derived from published rooms, not configured). Going multi-area/global = a new `IGeofencePolicy` implementation + additive wire changes (a multi-area `geofence` answer), plus the product work the backlog records: currency, search paging, out-of-area honesty copy, geocoding quota on any public path | Every beachhead judgement already flowed through one port (search clamp, detail 404, venue-placement rejection, rating eligibility) — the audit found only two leaks (the controller timezone const and the US-shaped geocode string), both closed here. Renaming the members is what keeps the next contributor from re-baking the assumption: an interface that says `IsWithinBeachhead` invites callers to mean it |
| 2026-08-08 | **Instant book decouples from `payments.enabled`; guest-side spam is answered by uncarded caps.** Reverses the 2026-08-05 row's "behind `payments.enabled`" clause (everything else in it stands): the host's stored `bookingMode` is now in effect — and publicly reported — regardless of the flag, and an instant submit confirms with or without a charge (the charge kick was already a no-op without a price snapshot). The guest-side guard the card was standing in for becomes explicit: a guest with **no payment method on file** may hold at most 3 upcoming bookings per venue / 10 overall; an over-cap instant submit falls back to request→approve (`201` + `status:"pending"`, never an error). The count is a Bookings-module read (`IBookingService.CountUpcomingForOrganizerAsync`, same effective-status predicate as `?status=confirmed`); a verified method lifts both caps, and while payments are on the 402 gate has already proven one | Owner decision: the coupling punished the wrong party — the abuse risk is a guest spam-booking a calendar, and the answer was silently disabling the feature the *host* chose (prod runs payments-off, so "instant" venues were manual everywhere it mattered). A card isn't much of a spam deterrent anyway (rescind auto-refunds in full), so the caps bind on the actual resource being hoarded — upcoming calendar time — and SSO, the `apply` rate limit, Turnstile, the geofence, and rescind remain the backstops |
| 2026-08-08 | **Canonical web listing URLs are clean `/space/{venueSlug}/{roomSlug}` History-API routes that progressively become the existing map product at the same URL; the API may render their initial HTML document outside `/api/v1`.** nginx remains the static host and proxies only data-dependent listing documents. The API applies the existing discoverability gate and returns semantic listing HTML, per-listing metadata/JSON-LD/bootstrap data or a real 404; a stable same-origin handoff then loads the generated Vite shell, whose client router opens and centres the room without a redirect. Other clean app routes use static `noindex` boot documents, so they do not gain an API dependency. A listing-renderer outage may return that static boot body for human fallback but retains its 502/503/504 status. Old hashes remain compatibility entrances. **Built 2026-08-08** (six sequenced agents + a Fable adversarial review; every invariant held under live attack). Two corrections landed by the review: `robots.txt` joined the API-rendered set (the `Sitemap:` directive must be a fully-qualified URL, and autodiscovery is the only shipping discovery mechanism), and the never-consumed `X-Forwarded-Prefix` forwarding was deleted — `Seo:PublicBaseUrl` is the one canonical source, required for any prefix deployment. Full design: `docs/backlog/seo/design.md`; as-built: `docs/contracts/seo.md`. | A client-only clean listing route would still return one generic document and soft-404; a separate SEO page would violate the required “shared link opens the map and room” behaviour; bot-UA prerendering is a cloaking/operations burden; and a second BFF/runtime is waste at beachhead scale. The API already owns visibility and the public DTO, so this narrow HTML exception produces the only truthful status/document without copying those rules. Static documents preserve today's API-down app boot. The cold deep link pays one extra same-origin shell fetch; root visits and all in-app navigation remain static/zero-document-reload. |
| 2026-08-09 | **Host supply entry is global even while discovery remains beachhead-scoped.** `ManageService` geocodes create/edit addresses but no longer asks `IGeofencePolicy` to accept their coordinates; any resolved location can be stored. Search, public detail, sitemap, suburbs, and rating eligibility retain the served-area policy, so out-of-area supply stays manager-visible but is not publicly discoverable until that policy expands. | Owner direction: hosts must be able to create anywhere. Supply interest outside the served area is useful expansion evidence and does not require prematurely widening the public marketplace. This also keeps the beachhead where it belongs—as a launch/discovery policy rather than a data-entry validation. |
| 2026-08-09 | **The single public discovery area expands from Vienna/NoVA to the Washington metropolitan area.** The configured bounds are `38.30–39.55, -78.25–-76.35`, centered on Washington, DC; this covers DC and nearby Maryland, Virginia, and West Virginia while retaining the existing one-area wire and policy. Static web metadata and the mobile fallback frame use the same regional description. Host geocoding remains worldwide (`Region` and `LimitToCountries` empty), independent of discovery scope. | Owner direction: public discovery should represent the broader Washington-area market rather than only NoVA. A wider single box is sufficient now; the `areas` table remains reserved for genuinely separate metros. |
| 2026-08-09 | **Moderation returns to one review per host, with an operator-capacity escape hatch.** A host's first listing waits for an operator; approval derives host trust from any managed room with `FirstPublishedAtUtc` set, after which all of that host's later rooms and venues auto-publish. Server-side flag `manage.first_listing_review_required` defaults on but may be turned off to auto-publish first listings when the founder cannot service the queue; photo/open-hours gates and durable takedowns remain. Each automatic publish verifies its venue, preserving **published ⇒ venue verified**, and identifies whether trust or the disabled review flag allowed it in analytics. This reinstates the 2026-08-05 host-scoped gate and supersedes only the venue-scoping clause of the 2026-08-06 hardening decision; its other controls stand. | Owner direction: review establishes the host once; repeatedly reviewing the same host at each new venue adds operator work without a corresponding trust decision, and an unattended queue must not halt supply when no operator time is available. |
