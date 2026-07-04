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
organizers find and book them, request→approve, starting at free. One beachhead area
(NoVA), concierge-seeded supply, productized demand.

**Decision — equal front doors.** Web and mobile are peer surfaces, not funnel + app:
an organizer can browse *and apply* on either; a venue provider can list and manage on
either (web first). The web funnel remains the SEO/share-driven acquisition lever and the
zero-install path; the mobile app is the "regular" home for recurring users (inbox, push,
rebooking). Nothing authenticated is app-exclusive by design — only by phasing.

| Surface | Tech | Role |
|---|---|---|
| **Steeple.Web** | ASP.NET MVC + HTMX + Leaflet | Discovery + SEO + share links; organizer apply/inbox; provider manage area (web-first) |
| **Mobile app** (`/mobile`) | Flutter (iOS first, Android close behind) | Recurring-user home: browse, apply, inbox, push, rebook |
| **Steeple.Admin** | ASP.NET MVC + HTMX | Operator console: concierge onboarding, moderation, analytics |
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
   (BFF for     (one JSON     (operator       (deployed      (deployed infra,
    browser;     API, /api/v1) console)        infra, SSE)     reads app stdout
    no DB)          │              │              ▲               via Promtail)
        │           │              │              │ SDK (SSE + local eval)
        └─ HTTP ────┤              │              │
                    ▼              ▼              │
   [Flutter app] ──►│         Postgres ◄──────────┘ (flag rules, if/when persisted)
    (bearer)        │      (system of record)
                    │              │
                    ├─► DO Spaces (S3): listing photos (CDN, public-read) + nightly pg backups
                    ├─► Google/Apple JWKS (SSO token verification)
                    ├─► FCM (push, fire-and-forget)  ├─► transactional email (Resend)
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
| **Manage** ✅ | provider self-service venue/room CRUD, moderation gate | `IVenueManagerRepository`, `IManageRepository`, `IGeocodingGateway` |
| **Media** ✅ | photo upload → variants → Spaces (or local disk in dev) | `IMediaStore`, `IImageProcessor` |
| **Ratings** 🔲 | two-way ratings, response-rate stats | `IRatingRepository` |
| **Ingest** ✅ | `POST /api/v1/events` analytics ingest → stdout | `IAnalyticsSink` |

**Module rules** (what keeps extraction cheap): a module's services may depend on another
module only via that module's **service interface**, never its repository or entities in
write paths; cross-module *reads* may share EF queries pragmatically (one DB — don't
pretend otherwise), but anything that mutates goes through the owning module. Contracts
never reference `Steeple.Persistence` types.

## 5. Domain model

The as-built model (venues → rooms → applications → bookings, identity, notifications)
and its DB-enforced invariants live in `ARCHITECTURE.md`. Remaining target additions:

- `bookings 1─* ratings (RaterId, RateeType Organizer|Venue, Stars, Comment)` — Phase 6.

## 6. Identity & auth

Built (see ARCHITECTURE): server-side ID-token verification (Google/Apple JWKS), the
API's own access+refresh tokens with rotating families, the Web BFF encrypted-cookie
pattern, Turnstile + rate limits, account deletion. One `users` table for organizers and
providers — no role wall. Target-state points that remain:

- **Mobile (Phase 4):** native Google/Apple sign-in → ID token (with nonce) →
  `POST /api/v1/auth/sessions` → tokens in Keychain/Keystore; a dio interceptor refreshes
  transparently.
- **Account linking:** deferred — same verified email on a second provider gets
  `409 use_original_provider`, never auto-linking.
- **Abuse step-ups** (phone OTP via `ISmsOtpSender`) only when abuse metrics demand (§16).
- **Admin:** stays a separate surface behind **authelia at the edge**; in-app it trusts
  the forwarded `Remote-User` header for audit attribution and never gets consumer SSO.
  Defense-in-depth (local ASP.NET Identity + TOTP) stays on the backlog.

## 7. Applications & bookings flow

Built end-to-end on web — mechanics in ARCHITECTURE, key decisions in §17 (thread-driven
NeedsInfo, lazy sweeps instead of workers, 48h occurrence-level notice window,
approval-as-one-SaveChanges). The product mechanics the model carries: intent-first
applications (activity/size/frequency shown to the provider), approve/ask/decline,
auto-decline of competing applications for a taken slot, notice-window cancellation
freeing slots, two-way no-show marking feeding ratings, stale applications auto-expired.

## 8. Notifications

- **Inbox = truth** (`notifications` rows), fetched on open / pull-to-refresh — no
  realtime layer at this scale. Built, with transactional email fan-out (Resend behind
  `IEmailGateway`, fire-and-forget after the inbox row; a dropped send loses nothing).
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
- Geocoding/autocomplete: Google, behind `IGeocodingGateway` (stub today), **only** on
  provider address entry and (later) search-box autocomplete — geofenced and per-IP
  rate-limited because it proxies a metered SKU.
- The geofence config becomes an **`areas` table** when area #2 arrives; until then the
  config section stays. Listing pages and area landing pages key off area slug (SEO).

## 11. Feature flags

Consume the deployed flags service through `Steeple.FlagsSdk`: SSE subscribe to
`/flags/stream`, local in-memory evaluation (never on the hot path awaiting network),
`GET /flags` snapshot on boot/fallback. Interim until the SDK has a home in this repo:
config-backed `IFeatureFlags` with the same key names (§17). Naming
`<surface|domain>.<feature>` (e.g. `web.apply_from_browser`, `trust.phone_otp_stepup`).
Every risky new surface ships behind a flag; mobile evaluates via the `GET /api/v1/flags`
proxy (the app never talks to the flags service directly). Admin's flag screen becomes a
client of the flags service (replacing the in-memory mock).

## 12. Analytics & observability

Built pipeline: client batchers (web JS still server-side via `IWebAnalytics`, Flutter directly)
→ `POST /api/v1/events` ✅ (rate-limited per IP; abuse defense is a client-sourced-event
allowlist + payload-size drops, not Turnstile — CONTRACTS §7) → structured JSON to stdout →
Promtail → **Loki → Grafana** (deployed infra). Server-authoritative events (search outcomes,
decisions, bookings) are emitted
server-side and never trusted from clients; the PRD funnel taxonomy is the contract
(`CONTRACTS.md` §7). Ops: uptime monitor → phone, DO snapshots + nightly `pg_dump` to
Spaces, **restore drills** (untested backup ≠ backup), one-page runbook with RTO target.

## 13. SEO, marketing & growth seams

`SEO.md` is the checklist (sitemap, robots, canonicals, per-listing meta, OG, JSON-LD,
area landing pages, CWV). Architecture hooks it needs:

- `UpdatedAtUtc` on rooms/venues (sitemap lastmod) — built.
- **Area landing pages** (`/halls/{area-slug}`) — the multi-metro seam doubles as the SEO
  page-per-area lever.
- **Universal/app links:** Web serves `/.well-known/apple-app-site-association` +
  `assetlinks.json` so shared listing URLs open the app when installed (share loop ↔
  mobile bridge).
- **UTM/referral capture** into the analytics envelope (which church shared the link that
  converted — supply-side attribution for the founder's GTM).
- Brandable via `BrandOptions` already; keep marketing copy in views, not code.

## 14. Legal & regulatory seams (US / Virginia first)

Design-for now, build when triggered:

| Concern | Stance now | Seam in the design |
|---|---|---|
| Platform liability | Neutral platform (PRD Option A): not a party to bookings; ToS disclaims; organizers attest coverage | `user_agreements` records **which ToS version** each user accepted, at apply time |
| ToS / Privacy docs | Versioned markdown → rendered pages; acceptance recorded per version (built) | Re-acceptance flow on version bump (flag-gated) |
| Safeguarding / children | v1 Option A: "Identity-verified (SSO)" only, explicit *no vetting* disclaimer; churches surface their own requirements | Listing field for church-stated requirements |
| Privacy (VA CDPA etc.) | Under thresholds, but build the plumbing: data minimization, PII inventory, export + delete | `DELETE /api/v1/me` (anonymize, built); PII confined to `users`/`user_logins`/`applications` text |
| PII custody | Never hold gov IDs, cards, phone numbers (until OTP step-up — then verify-only via Twilio/Plivo) | Delegation ports: `IIdTokenVerifier`, later `ISmsOtpSender`, Stripe |
| UGC / DMCA | Provider self-service photo uploads are live (Phase 5); takedown path exists today as Admin unlist + the moderation feed (§17) | Registering a DMCA agent with the Copyright Office is the remaining ops carry-over (ROADMAP) — not code |
| Email/SMS law | Transactional email only (CAN-SPAM exempt); no marketing sends without consent + unsubscribe; TCPA applies if SMS ever ships | Consent columns before any marketing channel |
| Accessibility | WCAG 2.2 AA target for Web (ADA exposure is real for public accommodations); accessibility filters already first-class | Semantic HTML/HTMX already; audit in launch phase |
| Tax / payments | Nothing until payments; then Stripe Connect handles KYC + 1099-K | §15 |

## 15. Payments seam (deferred, designed-for)

When paid bookings arrive: **Stripe Connect** (Express accounts for churches, destination
charges, application fee = the invisible commission). Steeple never touches funds (avoids
money-transmitter exposure); Stripe owns KYC/payouts/1099-K. Schema seam:
`bookings.PriceAmount/Currency` nullable columns + a `payments` table keyed by booking;
port `IPaymentGateway`; webhook endpoint under Ingest. Verified badges (Stripe
Identity/Persona) reuse the same "delegate, don't custody" port pattern. None of this is
built before real paid demand exists (PRD).

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
| Notifications scale | Fan-out on write, fire-and-forget | Volume / retry needs | Outbox table + background worker; same ports |
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
| 2026-07-04 | **Transactional email = Resend** behind `IEmailGateway` (plain-text, fire-and-forget after the inbox row is written; log-only without a key) | Free tier fits the cost ceiling; one HTTP adapter to swap (SES/Postmark are drop-in behind the port) |
| 2026-07-04 | **Web BFF emits `application_started`/`sso_started` server-side** (`IWebAnalytics`, same stdout log shape as the API sink) | The Ingest module (`POST /events` + client batchers) isn't built; the funnel must be measurable from day one (PRD). Moves client-side with Ingest |
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
| 2026-07-04 | **Dev compose publishes a loopback API port** (`127.0.0.1:8081`) for local-disk media | Browsers must be able to fetch photo URLs when Spaces isn't configured and the API falls back to serving `/media` itself; deviates from "api is compose-internal" but is dev-only and closes once `MEDIA_*` env points at real Spaces |
| 2026-07-04 | **Slugs are immutable after creation** | Slugs are the public URL identifier (SEO + shared links); allowing renames would silently break every outstanding link, bookmark, and indexed search result |
