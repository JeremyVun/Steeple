# Steeple — System Design (target architecture)

> **Status:** Adopted 2026-07-03. This is the **target-state** design for the full Steeple
> product — web, mobile, API, and the seams that let it scale without rework. It sits between
> the PRD (what & why) and `ARCHITECTURE.md` (as-built notes, updated as slices land).
> Decisions here supersede the PRD where they conflict; each deviation is recorded in
> [§17 Decision log](#17-decision-log--deviations-from-the-prd).

**Document map**

| Doc | Answers | Update when |
|---|---|---|
| `docs/PRD.md` | What we're building and why; product scope | Product scope changes |
| `docs/STEEPLE_PRODUCT.md` | Non-technical product brief | Positioning changes |
| **`docs/SYSTEM_DESIGN.md`** (this) | Target architecture, domain model, seams | An architectural decision is made |
| `ARCHITECTURE.md` | What is actually built so far | A slice ships |
| `CONTRACTS.md` | Wire contracts between API ↔ clients + conventions | Any contract change (checklist inside) |
| `docs/MOBILE_DESIGN.md` | Flutter app technical design | Mobile architecture decisions |
| `docs/MOBILE_CONTRACTS.md` | Mobile in-app contracts: interfaces, routes, providers, shared widgets | A mobile seam changes |
| `docs/DESIGN_SYSTEM.md` | Canonical design tokens & component specs (web + mobile) | A visual/UX standard changes |
| `docs/ROADMAP.md` | Phased implementation plan | Priorities shift / phase completes |
| `docs/ANALYTICS.md`, `docs/SEO.md` | Analytics pipeline & SEO checklists | Those workstreams progress |
| `CICD.md` | Deployment system design (deployctl / GitOps) | Infra decisions |

---

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
4. **Modular monolith.** The API grows by module (Discovery, Identity, Applications,
   Bookings, …), each with its own ports and adapters. Modules are extraction candidates,
   never premature services.
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
                    Caddy edge proxy (per CICD.md; authelia gates admin)
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
                    ├─► FCM (push, fire-and-forget)  ├─► transactional email (SES/Postmark/Resend)
                    └─► Google Geocoding/Places (metered, geofenced + rate-limited)
```

**Existing deployed infra services** (present in the deployed environment; not designed
here, only integrated): the **feature-flags service** (Perchd-pattern rules, `GET /flags`
+ `GET /flags/stream` SSE, consumed via `Steeple.FlagsSdk`), **authelia** (edge auth gating
the admin hostname), and the **Loki/Promtail/Grafana** telemetry stack. Integration
contracts are in `CONTRACTS.md` §6–7.

## 4. API internal architecture — modular monolith

The as-built `controller → service (ports) → proxy (adapters)` layering stays. Growth is
by **module**, and folder-matched namespaces keep the global-usings scheme working:

```
Steeple.Api/
  Contracts/<Module>/     — wire DTOs (the only types clients see)
  Controllers/<Module>/   — thin JSON edges under /api/v1
  Services/<Module>/      — use-case logic + port interfaces
  Proxies/<Module>/       — adapters: EF repositories, gateways (email, push, flags, geocode, storage)
  Configuration/ Extensions/ Utils/
```

Modules (target set):

| Module | Owns | Key ports |
|---|---|---|
| **Discovery** (built) | search, listing detail, suburbs, sitemap, geofence | `IRoomRepository`, `IGeofencePolicy`, `IGeocodingGateway` |
| **Identity** | SSO verify, users, sessions, agreements, account deletion | `IIdTokenVerifier` (Google/Apple), `ISessionStore` |
| **Applications** | apply → ask → approve/decline state machine, threads | `IApplicationRepository`, `INotificationDispatcher` |
| **Bookings** | bookings, materialized occurrences, cancel, no-show | `IBookingRepository` (exclusion-constraint aware) |
| **Notifications** | inbox rows (truth), fan-out to push + email | `IPushGateway` (FCM), `IEmailGateway` |
| **Media** | photo upload → variants → Spaces | `IMediaStore` (S3), `IImageProcessor` |
| **Manage** | provider self-service venue/room CRUD (authz over Discovery data) | `IVenueManagerRepository` |
| **Ratings** | two-way ratings, response-rate stats | `IRatingRepository` |
| **Ingest** | `POST /api/v1/events` analytics ingest → stdout | `IAnalyticsSink` |

**Module rules** (what keeps extraction cheap): a module's services may depend on another
module only via that module's **service interface**, never its repository or entities in
write paths; cross-module *reads* may share EF queries pragmatically (one DB — don't
pretend otherwise), but anything that mutates goes through the owning module. Contracts
never reference `Steeple.Persistence` types (fix the current `GeoPoint`/`BoundingBox` leak
when `/api/v1` lands — see `CONTRACTS.md` §2).

**Cross-cutting middleware** (target): forwarded headers → request logging (structured,
stdout) → rate limiting (ASP.NET `RateLimiter`, per-IP buckets on public writable
endpoints) → auth (bearer JWT) → ProblemDetails error envelope → controllers.

## 5. Domain model (target)

As-built (`venues`, `rooms`, `room_photos`, `analytics_events`) plus:

```
users 1─* user_logins (Provider, Subject) unique      users 1─* refresh_tokens (hashed, rotating)
users 1─* user_agreements (DocType, Version, AcceptedAtUtc)
users 1─* devices (FcmToken, Platform)                users 1─* notifications (inbox = truth)

venues 1─* venue_managers *─1 users        ← provider self-service authz seam
venues: + Timezone (IANA, e.g. America/New_York), + UpdatedAtUtc
rooms:  + UpdatedAtUtc (SEO lastmod)

rooms 1─* applications *─1 users(organizer)
  applications: ActivityType, GroupSize, Frequency(OneOff|Recurring),
                proposed schedule (StartDate, EndDate?, DayOfWeek?, StartTime, EndTime — venue-local),
                IntentText, Status, DecidedAtUtc, ExpiresAtUtc
  applications 1─* application_messages (the "ask" thread; SenderId, Body, SentAtUtc)

applications 1─0..1 bookings (created on approval)
  bookings: RoomId, OrganizerId, Type, StartDate, EndDate (bounded — always), Status,
            CancelledBy/At/Reason
  bookings 1─* booking_occurrences: RoomId (denormalized), During tstzrange, Status,
            NoShowMarkedBy — EXCLUDE USING gist (RoomId WITH =, During WITH &&)

bookings 1─* ratings (RaterId, RateeType Organizer|Venue, Stars, Comment)
```

**Invariants (DB-enforced where possible):**

- **No double-booking:** occurrence rows exist **only for confirmed bookings**; the
  `btree_gist` exclusion constraint rejects any overlap atomically. Approval = one
  transaction: flip application → Approved, insert booking + all occurrences; an exclusion
  violation aborts it (→ "slot taken" outcome, application auto-declined with notice).
  First-approval-wins falls out of this for free. Applications never hold slots.
- **Bounded recurrence:** `EndDate` is mandatory; occurrences are a finite set materialized
  at approval. Renewal = a *new* booking re-checking availability (the renewal seam).
- **Timezone correctness:** proposed schedules are **venue-local** ("9am Tuesday" means
  9am in `venues.Timezone`, across DST). Occurrences are computed per-date in the venue
  zone → stored as UTC `tstzrange`. Never materialize by adding fixed UTC intervals.
- **Listing lifecycle honors bookings:** unpublishing/deleting a room with future confirmed
  occurrences is blocked; ending commitments requires explicit cancellation with notice.
- **State machines:** application `Pending → (NeedsInfo ⇄) → Approved | Declined |
  Withdrawn | Expired`; booking `Confirmed → Completed | Cancelled`; occurrence
  `Scheduled → Occurred | NoShow | Cancelled`. Transitions validated in the service,
  status stored as int (repo convention), exposed as strings on the wire.

## 6. Identity & auth

**Consumers (organizers + providers — one `users` table, no role wall):** SSO only
(Google/Apple), exactly as the PRD decided. The API verifies provider ID tokens
server-side (JWKS, `aud`/`iss`/`exp`, nonce for mobile), find-or-create by
`(provider, sub)`, then issues **its own tokens**:

- **Access token:** short-lived (~15 min) JWT signed by the API. Claims: `sub` (user id),
  `sid` (session id), roles.
- **Refresh token:** opaque 256-bit, **stored hashed**, rotating on use, revocable,
  device-labeled, idle-expiry ~90 days. Reuse of a rotated token revokes the family.

**Per-surface mechanics:**

- **Mobile:** native Google/Apple sign-in → ID token → `POST /api/v1/auth/sessions` →
  tokens in Keychain/Keystore; a dio interceptor refreshes transparently.
- **Web (BFF pattern):** `Steeple.Web` runs the browser OAuth dances (Google redirect;
  Apple web `form_post`), exchanges the resulting ID token at the same API endpoint, and
  keeps the API tokens **server-side inside an encrypted, HttpOnly auth cookie** — the
  browser never sees tokens; Web forwards bearer per request. ⚠️ This requires
  **persisted DataProtection keys** for Web (a mounted volume in compose) or every deploy
  logs everyone out. CSRF antiforgery on every authenticated Web POST.
- **Apple caveats** (PRD): persist name/relay-email on first auth only; generate the Apple
  client-secret JWT programmatically from the `.p8` (short TTL, never a stored 6-month
  secret); alert on login failures. Account linking across providers: deferred; if the
  same verified email appears on a second provider, surface "sign in with your original
  provider" rather than auto-linking.
- **Abuse controls at the gate:** Cloudflare **Turnstile + per-IP rate limits** on
  `POST /auth/sessions`, `POST /…/applications`, and `POST /events` (public + writable).
  Per-account rate limits on applications.
- **Account deletion** (Apple App Store requirement, and CDPA hygiene): in-product
  delete → anonymize user row (keep bookings/ratings integrity), revoke sessions, purge
  devices/PII fields. `DELETE /api/v1/me`.

**Admin:** stays a separate surface behind **authelia at the edge** (deployed infra —
user/pw + MFA solved there). In-app, Admin trusts the authelia-forwarded identity header
(`Remote-User`) for audit attribution; it never gets consumer SSO. Defense-in-depth
(local ASP.NET Identity + TOTP inside Admin) stays on the backlog, not the critical path.

## 7. Applications & bookings flow

```
Organizer                         API (one transaction per arrow)            Provider
  apply (intent + schedule) ──► application(Pending) ── notify ──► inbox+push+email
                                   │  ask ⇄ answer (application_messages)
                                   ▼
                       decision: approve ────────────────────────── decline
                                   │                                   │
                    booking(Confirmed) + occurrences               notify organizer
                    (gist exclusion may abort → "slot taken")
                                   │
                    notify organizer · lock slots · appear in both calendars
                                   │
             cancel (either side, notice window) / mark no-show per occurrence
                                   │
                    term ends → renewal nudge → new bounded booking
```

Product mechanics from the PRD that this model carries: intent-first applications
(activity/size/frequency shown to the provider), approve/ask/decline, auto-decline of
competing applications for a taken slot, notice-window cancellation freeing slots,
two-way no-show marking feeding ratings, stale applications auto-`Expired`.

## 8. Notifications

- **Inbox = truth** (`notifications` rows), fetched on open / pull-to-refresh. No
  realtime layer at this scale.
- **Fan-out on write** via `INotificationDispatcher`: insert inbox row, then best-effort
  **FCM push** (registered `devices`) and **transactional email** (SES/Postmark/Resend —
  never SMTP from the droplet) for the decision-loop events: new application, message,
  approved, declined, cancelled, renewal nudge. All sends are fire-and-forget with logged
  failures; a dropped push loses nothing.
- Email is transactional-only until a real marketing consent flow exists (CAN-SPAM:
  transactional exempt from unsubscribe requirements; anything promotional needs one).

## 9. Media pipeline

Provider photo upload (self-service phase): multipart to the API (10 MB cap, per-account
rate limit) → validate type → **strip EXIF** (GPS!) → generate variants (thumb 400w /
card 800w / full 1600w, JPEG+WebP via ImageSharp) → content-hash keys on **DO Spaces**
(public-read, CDN) → persist keys on `room_photos`. Presigned direct-to-Spaces upload is
the later optimization; proxy-through-API is fine at this scale and keeps validation
server-side. Admin uses the same endpoint for concierge onboarding.

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
`GET /flags` snapshot on boot/fallback. Naming `<surface|domain>.<feature>`
(e.g. `web.apply_from_browser`, `booking.recurring_materialization`,
`trust.phone_otp_stepup`). Every risky new surface ships behind a flag: apply flow,
booking materialization, provider self-service, mobile-only experiments (mobile evaluates
via `GET /api/v1/flags` proxy — the app never talks to the flags service directly).
Admin's flag screen becomes a client of the flags service (replacing the in-memory mock).

## 12. Analytics & observability

Per `docs/ANALYTICS.md` (decided): client batchers (web JS + Flutter) →
`POST /api/v1/events` (Turnstile + rate-limited) → structured JSON to stdout → Promtail →
**Loki → Grafana** (deployed infra). Server-authoritative events (search outcomes,
zero-results, decisions, bookings) are emitted server-side and never trusted from clients.
`PostgresAnalyticsSink` is swapped for `StdoutLogAnalyticsSink` behind the same port.
The PRD funnel taxonomy is the contract (`CONTRACTS.md` §7). Ops: uptime monitor → phone,
DO snapshots + nightly `pg_dump` to Spaces, **restore drills** (untested backup ≠ backup),
one-page runbook with RTO target.

## 13. SEO, marketing & growth seams

`docs/SEO.md` is the checklist (sitemap, robots, canonicals, per-listing meta, OG,
JSON-LD `Place`/`PlaceOfWorship`, area landing pages, CWV). Architecture hooks it needs:

- `UpdatedAtUtc` on rooms/venues (sitemap lastmod) — in the target schema above.
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
| ToS / Privacy docs | Versioned markdown → rendered pages; acceptance recorded per version | Re-acceptance flow on version bump (flag-gated) |
| Safeguarding / children | v1 Option A: "Identity-verified (SSO)" only, explicit *no vetting* disclaimer; churches surface their own requirements | Listing field for church-stated requirements; future `docs/vetting-program.md` link-out |
| Privacy (VA CDPA etc.) | Under thresholds, but build the plumbing: data minimization, PII inventory, export + delete | `DELETE /api/v1/me` (anonymize), PII confined to `users`/`user_logins`/`applications` text |
| PII custody | Never hold gov IDs, cards, phone numbers (until OTP step-up — then verify-only via Twilio/Plivo) | Delegation ports: `IIdTokenVerifier`, later `ISmsOtpSender`, Stripe |
| UGC / DMCA | Concierge supply ⇒ founder-vetted content; register DMCA agent when provider self-service opens photo uploads | Admin moderation queue + takedown path (Manage module) |
| Email/SMS law | Transactional email only (CAN-SPAM exempt); no marketing sends without consent + unsubscribe; TCPA applies if SMS ever ships | Consent columns before any marketing channel |
| Accessibility | WCAG 2.2 AA target for Web (ADA exposure is real for public accommodations); accessibility filters already first-class in the product | Semantic HTML/HTMX already; audit in launch phase |
| Tax / payments | Nothing until payments; then Stripe Connect handles KYC + 1099-K | §15 |

## 15. Payments seam (deferred, designed-for)

When paid bookings arrive: **Stripe Connect** (Express accounts for churches,
destination charges, application fee = the invisible commission). Steeple never touches
funds (avoids money-transmitter exposure); Stripe owns KYC/payouts/1099-K. Schema seam:
`bookings.PriceAmount/Currency` nullable columns + a `payments` table keyed by booking;
port `IPaymentGateway`; webhook endpoint under Ingest. Verified badges (Stripe
Identity/Persona) reuse the same "delegate, don't custody" port pattern. None of this is
built before real paid demand exists (PRD).

## 16. Seams & scaling triggers

The explicit answer to "scales without complication" — every seam, what opens it, and
what it costs when opened:

| Seam | Exists as | Opens when | Cost then |
|---|---|---|---|
| Web ↔ Api split | HTTP boundary, no shared assembly (built) | already open | — |
| Mobile edge / BFF split | Client-agnostic `/api/v1`; contracts owned by API | Clients' needs genuinely diverge (payload shapes, release cadence) | New thin BFF in front of same services; contracts already versioned |
| Module → service extraction | Module folders + port interfaces + "mutate via owning module" rule | A module needs independent scaling/deploy (unlikely pre-multi-metro) | Lift module + its tables; ports become HTTP |
| Geo at scale | Bounding-box behind `IRoomRepository`; `IGeocodingGateway` | >1 area or slow geo queries | Swap to PostGIS + `areas` table; one adapter |
| Maps cost | Native SDKs free; geocode proxied + rate-limited | Google pricing turns hostile | MapLibre + Protomaps + self-hosted geocoder (PRD escape hatch) |
| DB scale | Single Postgres on droplet; nightly backups | Droplet contention / durability worry | DO Managed Postgres; connection string change |
| Notifications scale | Fan-out on write, fire-and-forget | Volume / retry needs | Outbox table + background worker; same ports |
| Trust escalation | Tiered stack; `ISmsOtpSender` port unimplemented | Abuse metrics demand it | Plivo/Twilio Verify adapter + flag |
| Payments | Nullable price columns + `IPaymentGateway` port (unbuilt) | Paid bookings materialize | Stripe Connect adapter, ToS bump |
| Multi-metro | Geofence config → `areas` table; area slugs in URLs/SEO | Beachhead #2 committed | Liquibase changeset + landing pages; **GTM is the hard part, not the tech** |
| Deploy scale | compose stacks per CICD.md; deployctl design | VM #2 | `hosts/vm2.yaml`; Swarm/Komodo path per CICD.md §16 |
| Analytics scale | Loki/LogQL, no Prometheus | Real-time alerting needs | Add Prometheus + `/metrics`; additive |

## 17. Decision log — deviations from the PRD

| Date | Decision | Rationale |
|---|---|---|
| 2026-07-03 | **One API deployable** (not the PRD's two edge APIs), client-agnostic `/api/v1`, BFF split deferred behind a seam | Solo-operated, $100/mo, one contract to govern; split stays cheap |
| 2026-07-03 | **Equal front doors** — web gets apply + provider self-service, superseding "web = read-only funnel, apply converts to app" | Founder direction; installs must never gate conversion; matches product brief |
| 2026-07-03 | **Flutter maps = `google_maps_flutter` on both platforms** (not MapKit-on-iOS) | Official, stable plugin (the reason Flutter was chosen); Google's native mobile SDK loads are unbilled on iOS *and* Android, so cost parity; one code path. Revisit only if Google mobile-SDK pricing changes |
| 2026-07-03 | **Flags / admin-edge-auth / telemetry are existing deployed infra services** — integrated, not built here | They already run in the deployed environment |
| 2026-07-03 | Wire enums move to **stable machine-readable strings** in `/api/v1` (humanized strings were a web-display convenience) | Mobile needs stable values; display formatting belongs in clients (`CONTRACTS.md` §2) |
