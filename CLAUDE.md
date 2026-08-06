# CLAUDE.md

Steeple — hyperlocal marketplace connecting churches (spare halls/rooms) with community
organizers. Instant-book by default with per-venue manual-approve opt-in (2026-08-05,
`docs/backlog/booking-modes.md`; was request→approve), required host-set hourly pricing
(free listings removed 2026-07-07), one NoVA beachhead.
.NET 10 API + Vite web SPA (v2) + HTMX admin + PostgreSQL + Flutter mobile
(`/mobile`, Phase 4). The v1 HTMX web funnel is deprecated and retained only as reference.
The API/mobile and v1 reference implement the full discovery → SSO → apply → approve →
booking loop; v2's real-API integration is still incomplete. Solo-operated; lean
(~$100 AUD/mo ceiling).

## Read this first — document map

**If a doc here answers your question, trust it over inference from code.** Each doc owns
one concern; update the owning doc in the same PR as the change it describes.

| Doc | Owns | Trust it for |
|---|---|---|
| `docs/PRD.md` | Product scope & why | What's in/out of v1, trust model, constraints |
| `docs/SYSTEM_DESIGN.md` | **Target** architecture + decision log (§17) | Where anything new should go; seams; unbuilt designs (media, payments, flags) |
| `docs/ARCHITECTURE.md` | **As-built** state | What exists today: modules, domain model + invariants, ports, deployment |
| `docs/contracts/` | Seam index: every wire contract, port, and client seam, one small file each | **START HERE for any interface question** — load only the file you need |
| `docs/CONTRACTS.md` | The §-number index into `docs/contracts/` (change rules + where each § now lives) | Resolving a "CONTRACTS §n" citation to its seam file |
| `docs/backlog/` | Implementation plans for what's next (README = index + phase history) | What to build next and what's deliberately deferred. **`backlog/v2_migration/` is the active plan** (web v2 → production; decisions D1–D9) |
| `docs/MOBILE_DESIGN.md` | Flutter app design | Anything under `/mobile` |
| `docs/MOBILE_CONTRACTS.md` | Mobile in-app seams (interfaces, routes, providers, shared widgets) | What a `/mobile` feature builds against |
| `docs/DESIGN_SYSTEM.md` | Canonical design tokens + component/UX specs (all surfaces) | Any styling/visual decision — never hardcode values |
| `docs/SEO.md` | SEO checklist | SEO to-dos |
| `docs/runbooks/` | Operational procedures (email/Resend today) | Setting up or debugging a third-party service in production |

Target-state docs describe things that **don't exist yet** — don't assume an endpoint or
table exists because SYSTEM_DESIGN/CONTRACTS mentions it; ARCHITECTURE.md and the code are
the as-built truth (CONTRACTS.md marks ✅ built vs 🔲 planned per endpoint).

## Layout & dependency rule

```
Web → (HTTP only) → Api → Persistence ← Admin        mobile → (HTTP only) → Api
```

- `/src/Steeple.Persistence` — domain entities, value objects, enums, `SteepleDbContext`,
  EF configs. Provider-agnostic; **database-first** (mirrors Liquibase SQL by hand).
- `/src/Steeple.Api` — the one JSON API (all clients). `Contracts/` (wire DTOs),
  `Controllers/`, `Services/` (use-cases + **port** interfaces), `Proxies/` (adapters),
  `Configuration/ Extensions/ Utils/` — each grown by **module subfolder**
  (e.g. `Services/Applications/`) — see SYSTEM_DESIGN §4.
- `/src/Steeple.Web.v1` — deprecated MVC + HTMX + Leaflet implementation, retained as
  reference and excluded from the solution and deployment builds.
- `/src/Steeple.Web.v2` — the active web frontend (Vite + vanilla JS + Leaflet; Three.js
  splash only), served by nginx in containers. nginx/Vite proxy same-origin `/api` requests
  to the API; the frontend has no DB or shared server assembly. See its section below.
- `/src/Steeple.Admin` — operator dashboard; reads Postgres via Persistence. No in-app
  auth **by design** — authelia gates it at the edge proxy in the deployed environment.
  Four screens only (2026-08-05, D3): overview, `/admin/review` (first-listing decisions +
  rating hide/unhide), `/admin/listings` (Unlist takedown), `/admin/venue-managers`.
- `/db/changelog` — Liquibase formatted SQL (`001…005-*.sql` + master manifest).
  **Owns the schema; no application ever migrates.**
- `/tests` — `Steeple.Api.Tests` (xUnit unit: geofence, geo math, listing visibility,
  `ScheduleMaterializer` DST) + `Steeple.Integration.Tests` (Testcontainers Postgres,
  Liquibase SQL applied raw; includes `BookingIntegrityTests` concurrency proof).
- `/mobile` — Flutter app (organizer v1, Phase 4). MOBILE_DESIGN.md is the spec,
  MOBILE_CONTRACTS.md's seams are binding, `mobile/README.md` has the run loop
  (`flutter run --dart-define=STEEPLE_FAKES=true` needs no backend);
  `flutter analyze` + `flutter test` are part of done for `/mobile` changes.
- Folder-matched namespaces are global usings per `.csproj` — no per-file usings needed;
  keep new folders following the `Namespace = Project.Folder` convention.

**Hard rules:** Web/mobile never reference Persistence or Api assemblies. `Api/Contracts`
must not leak Persistence types. Nothing mutates another module's data except through the
owning module's service. Never store PII beyond what CONTRACTS/SYSTEM_DESIGN specify —
no passwords, gov IDs, card data, ever.

## Deployed-infra context (exists in production, not in this repo)

Feature-flags service (Perchd-pattern; SSE + snapshot — CONTRACTS §8), authelia edge auth
for Admin, Loki/Promtail/Grafana telemetry, Caddy edge proxy, self-hosted registry.
Integrate against them; don't design replacements. The flags SDK's source lives outside
this repo — until it has a home here, flags are config-backed via `IFeatureFlags`
(same key names; launch-checklist carry-over — `docs/backlog/phase-6-reputation-and-launch.md`).

## Build / run / verify

```bash
docker compose up -d --build      # full stack: postgres → migrate → api/admin → web
                                  # Web http://localhost:8080 · Admin http://localhost:8082/admin
docker compose up -d postgres migrate   # DB only, then:
dotnet run --project src/Steeple.Api    # http://localhost:5200
npm run dev --prefix src/Steeple.Web.v2 # http://localhost:5173 (vite; proxies /api → :5200)
dotnet run --project src/Steeple.Admin
docker compose down -v && docker compose up -d   # full DB reset (re-runs migrate + seed)
```

- Emails sent locally are captured at http://localhost:5200/dev/mailbox (`.json` for
  harnesses) — Development only, and their CTAs are real links into the SPA.
- Razor views hot-reload in Development; C# changes need restart.
- Verify a change by driving the real flow (search on `:5173`, hit the API endpoint, check
  the admin screen) — not just by compiling.
- `dotnet test` is part of done (unit tests are instant; integration tests need Docker for
  Testcontainers). Anything touching bookings/approval **must** keep
  `BookingIntegrityTests` (concurrent-approval exclusion) green.
- ⚠️ This machine: `cd` into the repo can strip `PATH` (local env hook) — script with
  absolute binary paths or avoid `cd`.

## Recipes (follow exactly)

**Schema change:** add a new `--changeset author:id` block to `db/changelog/00X-*.sql`
(never edit an applied changeset) → update the matching EF config + entity in Persistence
by hand → `docker compose up -d migrate` (or full reset) → keep SQL and EF in sync
column-for-column. Indexes/constraints live in SQL first.

**New/changed endpoint:** CONTRACTS.md §1 checklist is binding — update
`Api/Contracts` + controller/service/proxy → Web v2 `src/data/api.js` and its consumer → mobile models
(`mobile/lib/core/models/` + the matching `test/fixtures/*.json`) → CONTRACTS.md itself,
all in one commit. Additive is free;
breaking inside `/api/v1` only if all clients update in the same commit. New public
writable endpoints get rate limiting (+ Turnstile if anonymous).

**Analytics event:** add to the CONTRACTS §7 taxonomy table → emit via `IAnalyticsSink`
(server-authoritative events server-side only; interaction events via the client
batchers). Nothing user-visible ships un-instrumented (PRD commitment).

**Feature flag:** name it `<surface|domain>.<feature>`; risky surfaces ship behind one;
evaluation is local/in-memory — never a blocking network call on the request path;
clean up stable flags.

**Config:** connection string `ConnectionStrings:SteepleDb` (dev: `appsettings.Development.json`,
localhost:5433; Docker: `ConnectionStrings__SteepleDb` env). Web has **no** DB; Vite in
development and nginx in containers proxy same-origin `/api`. Geofence bounds = `Geofence`
section in Api appsettings.

## Gotchas that bite

- **EF pinned to 10.0.4** (Npgsql provider constraint) — do not bump EF packages above it.
- **Sub-path hosting:** Web + Admin can live behind a stripped prefix (e.g. `/steeple`).
  Web v2's build assets and API base must stay document-relative; Admin uses
  `X-Forwarded-Prefix`/`PathBase` and `~/…` URLs. Details: ARCHITECTURE.md → "Deployment".
- **Enums on the wire:** flags enums (`ActivityType`, `Amenity`, `AccessibilityFeature`)
  persist as int bitmasks; query binding re-reads repeated query params manually
  (see `ListingsApiController.ReadFlags`). `/api/v1` emits **stable camelCase tokens**
  (`"stepFreeAccess"`) — clients humanize for display (Web: `DiscoveryViewModel.Humanize`).
  Multi-value filter matching is **AND** ("accepts all requested"), by design.
- **Times:** DB stores UTC; booking schedules are **venue-local** wall-clock, materialized
  per-date in the venue's IANA timezone by `ScheduleMaterializer` (DST rules pinned by
  unit tests — never add fixed UTC intervals).
- **Only Published rooms are publicly visible** — search filters status in SQL *and*
  `ListingService` gates direct id/slug lookups (Draft/Unlisted → 404); the seed contains
  one deliberate Draft room to prove it (`renovation-annex`).
- **Geofence rejects, silently by design:** out-of-area search input clamps to the
  beachhead (empty results, not errors); detail lookups 404.
- **Web sign-in state (rewritten 2026-08-06):** v2's `src/data/session.js` owns identity.
  The refresh token is an **httpOnly cookie the API sets** (`refreshTransport:'cookie'` —
  not the v1 BFF), the access token lives in module memory only, and localStorage holds
  just `{user, reason, stamp}` for cross-tab `storage`-event sync. Refresh is single-flight
  per tab; concurrent tabs survive by the API's rotation reuse-grace
  (`docs/contracts/identity.md`). Never write a token to storage.
- Compose runs server containers in **Production** and serves web v2 from nginx. Only
  web/admin publish general host ports; api is compose-internal apart from dev media loopback.

## Steeple.Web.v2 — the active frontend (integration in progress)

Built 2026-08-03→05 as the `animated-web` experiment ("Steeple — The Village"); the
direction succeeded and it was consolidated here 2026-08-05. Map-first product surface
(Leaflet ~58% + list/filters + panels) under a Three.js village splash joined by a
scroll-scrubbed "roll" (`state.roll` 0→1; the engine fully pauses at roll=1 — Three.js
does zero work in-product). Its own `README.md` and `docs/CONTRACT2–6.md` (the historical
wave briefs) live inside the project; code comments citing "CONTRACT4 §5" etc. mean those
files, while "CONTRACTS §n" means this repo's `docs/CONTRACTS.md`.

**Run/verify:** `npm run dev` (vite :5173, proxies `/api` → API :5200 — the API serves no
CORS by design, the proxy is the missing BFF); `npm run build:flat` = no-Three build
(~373kB vs ~1.05MB raw; 116kB vs 301kB gzipped) for A/B; `build:debug`/`build:flat:debug`
keep `window.__steeple` for suites that drive a built bundle (production builds drop it). Harnesses in `tools/*.mjs` drive real browser events; each
documents its own flags/env in its header (some are world-ON, some world-OFF —
**inverting a suite's documented flags produces convincing, meaningless failures**).
Headless GL runs app-time ~6× slow: tests wait on state, never wall-clock. Known-stale
failure sets that predate wave 7: guest-test 3, wave2-test 6, world-test 12.
E2E suites mint real accounts/venues/applications on the local API each run.

**Seams (frozen — the day an upstream name changes, one file moves):**
- `src/data/api.js` — the wire, `/api/v1` names verbatim, one function per request.
- `src/data/catalog.js` — product vocabulary over the wire, with `bundledCatalog.js`
  fallback when the API is down (seed slugs match the bundled ids 1:1).
- `src/data/session.js` — identity (httpOnly-cookie refresh token, in-memory access token,
  `withAccess()` 401-retry-once, cross-tab `storage` sync; harnesses read a bearer via
  `withAccess((t) => Promise.resolve(t))`, never storage). Sign-in = dev SSO
  (`POST /auth/sessions {provider:"dev", idToken:"email|Name", refreshTransport:"cookie"}`,
  DevLoginEnabled — Development only); Google/Apple later swap only `signIn()`.
- `src/data/correspondence.js` — the wire for everything after a request is written (inbox,
  thread, withdraw, counter response, host decisions, the payments method-on-file). Calls
  `api.js`, mirrors steeple's answer into `store.js`, returns a verdict whose `reach` is
  `refused | offline | signedOut | unavailable` — never a guess (v2_migration D4/D5).
- `src/data/store.js` — a localStorage **mirror** of what steeple holds, in the product's
  vocabulary (shapes from db/changelog 004/005/009), keyed **per person**
  (`steeple-village-store:{userId}`, `:anon` signed out — D6). It decides nothing; clearing
  it costs a reload, never a fact. The demo fixture loads only outside production builds and
  is scenery for the 3D village alone.

**Real vs demo (the integration work):** Real — catalog reads, auth sessions (sign-in **and
sign-out**, `DELETE /auth/sessions` best-effort), application submit (`Idempotency-Key`,
mirrors into local store), the whole hosting chain (dev SSO → POST venue → room → photo
upload → PUT availability → PATCH published; publish requires a photo; an unverified venue's
first publish answers `draft` + `publishRequestedAtUtc`, while later rooms at that verified
venue answer `published` outright), and the account surface — a "Sign in" chip on the porch when signed out, chip +
card when signed in, inbox/badge/journal/letters and every "Identity verified (SSO)" chip
gated on fact (v2_migration Phase 1), **and the whole correspondence** (Phase 2, D4/D5): the
guest inbox is `GET /me/applications`, the thread `GET /applications/{id}`, and withdraw /
counter accept-decline / messages / all four host decisions are wire writes that re-mirror
the answer. The host desk exists only when `GET /manage/venues` is non-empty and is scoped
to those venues; `409 slot_taken` on approve renders as the product moment it is. The apply
calendar reads `RoomDetail.openHours` + `GET /listings/{id}/availability`, so a built bundle
can file a request. A `402 payment_method_required` opens a minimal mock-card step and the
send resumes itself; instant venues answer the submit with the booking and say so. Email CTA
deep links (`?goto=`) are followed at boot. All of it is **driven end to end** by
`tools/correspondence-test.mjs` (69/69, §0–§9), two people in two browsers against real rows,
including D5's honest-offline send. **Real (Phase 2.5, 2026-08-05) — the money, both sides:**
the desk is **Bookings · Requests · Spaces** and opens on Bookings (Requests renders only for a
manual venue, or one still owing answers after leaving manual); a confirmed booking carries the
frozen per-session price, the next charge, each date's `paymentStatus`, and the host's cancel
behind a two-press warning (it frees every remaining date and refunds everything charged); the
guest's letter prints the same truth and, on a failed charge, steeple's own ladder with the
card step a press away; the card on file is reachable from the account chip through one shared
panel (`ui/cardPanel.js`, brand + last4 only); the payout prompt → mock KYC → connected state
lives on the desk; booking mode is a setting on Spaces; and `GET /me/notifications` renders as
**ambience** — one slip on arrival, quiet lines in the inbox, no bell and no new nav tab.
Driven by `tools/payments-ui-test.mjs` (65/65). Demo — dev provider only, no Turnstile;
`organizationName` is sent as `null` until Phase 4's input; the card step and the payout screen
are the mock gateway's own stand-ins. Accounts-consolidation order agreed 2026-08-05: signed-out
header state (**done**) → inbox onto `/me/applications` (**done**) → real providers.

**Hazards found in the waves (unfixed):** the desk's Spaces tab reads open hours from the
**local** store, so a room whose hours only exist at steeple reads "No open hours set" in red;
`.choice*` is the request sheet's class in `styles/guest.css`, which loads after `host.css` —
host surfaces must not reuse it (the booking-mode radios are `.mode*` for exactly this reason;
`.pill--quiet` in `host.css` loads after `map.css`, so map surfaces style their own);
`host-offline-test.mjs` is **not re-baselinable**: hosting requires a session, so writing a
listing while steeple is away is no longer a promise the product makes (owner call 2026-08-05);
room photo URLs are stored **absolute** from `Media:PublicBaseUrl`, so moving the media host
orphans every photo already written (and, locally, rows from other agents' API ports 404 or
refuse outright, and the suites that count console errors — input-test, world-off-test — go
red on that noise alone while every check line is green: judge the check lines —
also add any new media origin to nginx.conf's CSP `img-src` or photos silently stop loading);
`draft.roomId` is always `'main-space'` (second room per venue collides);
dev geocoding = `StubGeocodingGateway` (every address → village centre, so geofence-rejection
paths are locally unreachable, and every locally host-listed venue stacks on one map point —
harnesses drive pins by keyboard or assert "aimed === opened", never a pointer at a named pin);
search reads one page of 100, so a venue beyond it has no pin or row until a narrower search
reaches it (its sheet works by slug either way; paging the map is unbuilt);
`surface-test.mjs` §5 crashes on the account monogram (`outBox.cx` null) and truncates its run.
API gaps compiled for steeple: v2 `docs/CONTRACT4.md` §5
(CORS, venue-profile endpoint, missing RoomDetail fields, no vocabulary endpoint…).

**Design taste (Jeremy):** calm, sophisticated, professional — never childish or tacky;
A/B alternatives ship behind query params (`?style= ?map= ?desk= ?letter= ?world=off`),
never branches. Copy says venue/space/host, never church. Verify by driving the real
flow — debug screenshots don't prove interactivity; real-event tests are mandatory.

## Working agreements

- Match the codebase's idiom: records for DTOs, ports-in-Services/adapters-in-Proxies,
  thin controllers, folder-namespace convention. Comments only for non-obvious constraints.
- Don't add packages/vendors without checking the cost ceiling and no-lock-in ethos
  (SYSTEM_DESIGN §2); prefer the escape-hatch-friendly option.
- Update the owning doc with the change (doc map above); record architecture deviations in
  SYSTEM_DESIGN §17's decision log.
- When product intent is ambiguous, PRD > product brief > inference; if still ambiguous,
  ask rather than invent scope.
