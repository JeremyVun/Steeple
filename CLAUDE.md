# CLAUDE.md

Steeple — hyperlocal marketplace connecting churches (spare halls/rooms) with community
organizers. Instant-book by default with per-venue manual-approve opt-in (2026-08-05,
`docs/backlog/booking-modes.md`; was request→approve), required host-set hourly pricing
(free listings removed 2026-07-07), one NoVA beachhead.
.NET 10 API + Vite web SPA (v2) + HTMX admin + PostgreSQL + Flutter mobile
(`/mobile`, Phase 4). The v1 HTMX web funnel is deprecated and retained only as reference.
The API, web v2, and mobile implement the full discovery → SSO → apply/instant-book →
booking → payments (mock-gateway era) loop; web v2's real-API migration **completed
2026-08-07** — production Google/Apple/Turnstile are shipped, env-gated, and go live by
configuration alone (`docs/runbooks/sso-and-turnstile.md`). Solo-operated; lean
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
| `docs/backlog/` | Implementation plans for what's next (README = index + phase history + **open decisions & recorded gaps**) | What to build next and what's deliberately deferred. `v2_migration/` completed 2026-08-07 (its `design.md` D1–D9 remain the rationale of record); **`phase-6-reputation-and-launch.md` is what's next** |
| `docs/MOBILE_DESIGN.md` | Flutter app design | Anything under `/mobile` |
| `docs/MOBILE_CONTRACTS.md` | Mobile in-app seams (interfaces, routes, providers, shared widgets) | What a `/mobile` feature builds against |
| `docs/DESIGN_SYSTEM.md` | Canonical design tokens + component/UX specs (all surfaces) | Any styling/visual decision — never hardcode values |
| `docs/SEO.md` | SEO checklist | SEO to-dos |
| `docs/runbooks/` | Operational procedures (email/Resend; SSO providers + Turnstile) | Setting up or debugging a third-party service in production |

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
- `/db/changelog` — Liquibase formatted SQL (`001…018-*.sql` + master manifest).
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

- Compose needs `AUTH_JWT_SIGNING_KEY` (env or `.env`) and **refuses the repository dev
  key** — its containers run Production and the security-round guard fails closed
  (api crash-loops). Generate one: `openssl rand -base64 48`.
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
## Steeple.Web.v2 — the active frontend (real-API migration complete, 2026-08-07)

Built 2026-08-03→05 as the `animated-web` experiment ("Steeple — The Village"),
consolidated here 2026-08-05, and carried onto the real API by `docs/backlog/v2_migration`
(D1–D9, closed 2026-08-07). Map-first product surface (Leaflet ~58% + list/filters +
panels) under a Three.js village splash joined by a scroll-scrubbed "roll" (`state.roll`
0→1; the engine fully pauses at roll=1 — Three.js does zero work in-product). Its own
`README.md` and `docs/CONTRACT2–6.md` (the historical wave briefs) live inside the
project; code comments citing "CONTRACT4 §5" etc. mean those files, while "CONTRACTS §n"
means this repo's `docs/CONTRACTS.md`.

**Boot is a three-state machine** (P3.5): printed arrival (the title CTAs are real links
in `index.html` — a press is answered from the first frame), product-first **flat boot**
(any intent or deep link before the village is ready opens the product with no engine,
world, or Three fetch; a cold `#/…` hash is always a flat boot), and the live-village boot
(poster → canvas crossfade, cinematic roll). A flat-boot visitor's first return to the
title restores the poster immediately and lazily raises the village there; explicit
`?world=off`/`build:flat` visits remain flat. Product reads never wait on 3D; ⚠ never defer
Leaflet's tile layer (NaN-zoom boot-killer, `ui/map/atlas.js`).

**Run/verify:** `npm run dev` (vite :5173, proxies `/api` → API :5200 — the API serves no
CORS by design, the proxy is the missing BFF; `STEEPLE_API_ORIGIN` moves the target);
`npm run build:flat` = no-Three build for A/B; `build:debug`/`build:flat:debug` keep
`window.__steeple` for suites that drive a built bundle (production builds drop it, and an
unkeyed production bundle honestly refuses sign-in — the dev email form is dev-build-only).
Harnesses in `tools/*.mjs` drive real browser events; **each documents its own flags/env in
its header — inverting them produces convincing, meaningless failures.** Headless GL runs
app-time ~6× slow: suites wait on state, never wall-clock.

**Seams (frozen — the day an upstream name changes, one file moves):**
- `src/data/api.js` — the wire, `/api/v1` names verbatim, one function per request; reads
  time out at 4s, writes at 15s, and a timeout classifies as *unknown*, never unreachable.
- `src/data/catalog.js` — product vocabulary over the wire, with `bundledCatalog.js`
  fallback when the API is down (seed slugs match the bundled ids 1:1).
- `src/data/session.js` — identity (httpOnly-cookie refresh token, in-memory access token,
  `withAccess()` 401-retry-once, cross-tab `storage` sync; harnesses read a bearer via
  `withAccess((t) => Promise.resolve(t))`, never storage). Dev sign-in
  (`provider:"dev"`, Development-only) and the real providers share one `signIn()` seam.
- `src/data/providers.js` — Google/Apple, the only file that knows a third party exists; a
  provider with no `VITE_*` client id is not offered at all, SDKs load on first attempt.
- `src/data/turnstile.js` — the widget; no `VITE_TURNSTILE_SITE_KEY` ⇒ no widget and null
  tokens (the API fails open without a secret — key both sides or neither).
- `src/data/agreements.js` — the two legal documents at shipping versions; a first *panel*
  sign-in is asked to agree inline, and a session that still owes an acceptance is gated —
  the panel returns until they agree or sign out, and declining/dismissing signs out
  (2026-08-07); bump versions with the page.
- `src/data/correspondence.js` — the wire for everything after a request is written (inbox,
  thread, withdraw, counter response, host decisions, method-on-file). Verdicts' `reach` is
  `refused | offline | signedOut | unavailable` — never a guess (D4/D5).
- `src/data/store.js` — a localStorage **mirror** of what steeple holds, keyed per person
  (`steeple-village-store:{userId}`, `:anon` signed out — D6). It decides nothing; clearing
  it costs a reload, never a fact. The demo fixture is dev-build village scenery only.
- `src/data/analytics.js` — the interaction batcher to `POST /api/v1/events` (CONTRACTS
  §7); nothing user-visible ships dark.
- `src/data/photo.js` — a picked file made into the file that is sent: EXIF orientation
  applied, drawn to 1600px (the widest variant steeple keeps, never upscaled), re-encoded
  JPEG, so GPS never leaves the device and a 12 MP photo does not spend 12 MB of somebody's
  uplink to be thrown away on arrival. The server remains the gate. `tools/photo-prepare-test.mjs`
  drives it with no API at all — Chrome is only the runtime (`createImageBitmap`/canvas).

**Everything is real.** Catalog, sign-in/out, agreements, the apply calendar
(`openHours` + availability), submit (`Idempotency-Key`, org-name input, 402 → mock card
step → the send resumes itself), instant book, one unified inbox (sent requests plus
**hosting rows** for venue keepers — a hosting row opens the host letter; 2026-08-08),
threads/withdraw/counters, all four host decisions (on the letter: Approve · Decline ·
a reply box **on the thread** · a quiet "Suggest another time" link; `409 slot_taken`
renders as the product moment — "Already taken", steeple declined it as it happened), the
desk (only when `GET /manage/venues` answers; Bookings ·
Requests · Spaces, Requests only for manual venues or live leftovers; hours are steeple's),
the hosting chain (venue → room → photo → hours → publish; first listing → Admin review,
later rooms self-serve), payments truth both sides (frozen price, per-date charge state,
failure ladder + card panel, rescind → auto-refund, mock payout onboarding), ratings once a
booking is over (both letters ask, the inbox nudges and counts it, the double blind holds
until both have written, and the earned ★ average then rides the search cards, the room
sheet and the organizer's trust chip — a venue nobody has rated shows nothing, never a zero;
`docs/backlog/ratings/`, 2026-08-08),
`GET /me/notifications` as ambience (one slip + quiet inbox lines, no bell), and `?goto=`
email CTAs at boot. Counter-offers behind a server flag render "not available here yet"
when off, never an error. Mock-era residue: the dev provider locally, the mock card step
and payout screen (gateway stand-ins), no Turnstile until keyed.

**Harness truths (paid for; keep):**
- ONE API per run: export `STEEPLE_API` **and** point the vite proxy (`STEEPLE_API_ORIGIN`)
  at the same instance. `host-input-test`/`host-session-test` hardcode :5200 — bind the one
  dev API to both ports (`--urls "http://localhost:5218;http://localhost:5200"`), never run
  a second API. `boot-priority-test` drives `build:debug` via `vite preview --outDir
  dist-debug`, never the dev graph; `world-off-test`'s built-bundle half needs
  `build:flat:debug` (plain `build:flat` has no `__steeple`).
- Sign-in is 10/min per-IP: `fixtures.paceAuth` paces within a process; give back-to-back
  auth-heavy suites breathing room.
- **The P4 agreements ask interrupts real-input suites**: a fixture account that never
  agreed gets the gate at boot/sign-in, and **dismissing it signs the account out**
  (2026-08-07). Call
  `fixtures.agreeCurrent(token)` on minted accounts (versions are read from
  `src/data/agreements.js`, no drift) — except in `hardening-test` §4, whose subject is the
  un-agreed state.
- Slips are **transients** (fade in, gone in 12s): record from before sign-in and assert
  the record, never sample the live element (`payments-ui-test` §6 shows the pattern).
- `map-test` asserts seed venue counts — green only after a DB reset; every other suite
  mints its own rows and never collides.
- Console-noise discipline: dead-port media 404s and GL narration are environmental —
  `fixtures.isEnvironmentNoise` is the shared filter; judge the check lines.
- Known-stale sets (documented in the suites' own headers): `guest-test` 31/42 (map-first
  roll drift) · `world-test` exactly 12, symmetric per style — asymmetry is real ·
  `booking-flow-test` fails from §5 (seed venues became instant-book 2026-08-05;
  correspondence-test is the live gate for both flows).
  `input-test`'s opening roll beats are a **load reading** (headless GL under load), not a
  verdict.
- All suites launch Chrome on a **pipe** and close in `finally` — a SIGKILL mid-run leaves
  zero orphaned "Chrome for Testing" processes (verified in the P6 sweep).
- Headless pages stop advancing CSS transitions after an earlier `page.screenshot()` in
  the run — computed opacity then reads 0 forever, which mimics a broken affordance. For
  timing claims assert on DOM state (`aria-busy`, class dwell), shoot last; each
  `deviceScaleFactor:2` shot costs 1–2.5s, so tight sampling loops silently span seconds.
- **A fade needs a rendered frame, and headless Chromes share the machine** (2026-08-08).
  Two *pages of one browser* freeze each other outright — the one not in front stops
  advancing transitions, so an opened surface sits at opacity 0 forever and `steady()`
  correctly calls it never-arrived (one browser per page, not per person). And concurrent
  *browsers* starve it: a slip measured at opacity 1 with one in flight peaked at 0.26 with
  three. Put finished browsers down before any section whose claim is a fade
  (`payments-ui-test` §6 does).

**Hazards (each verified against code, 2026-08-07):**
- Class names are never shared across guest and host surfaces: stylesheets load
  main → map → panels → guest → host, so a shared name means `host.css` silently restyles
  the guest surface. The booking-mode radios are `.mode*` (not the sheet's `.choice*`),
  and the host's opened letter is `.letterpage__*` (2026-08-07 — its `.letter__sheet` rule
  had bled `overflow:hidden` onto the guest request sheet and made it unscrollable);
  `.pill--quiet` in `host.css` loads after `map.css`, so map surfaces style their own.
- Local-disk room photos store origin-independent `media/...` paths; Vite/web nginx/Admin proxy
  them and mobile resolves them against its API base. Object-storage photos remain absolute at
  the permanent CDN origin, which must be added to web nginx CSP `img-src` and
  `Admin:MediaImageOrigins` before enabling the adapter. Shared-database rows whose bytes live
  in another worktree's media-store can still 404 as local console noise.
- Dev geocoding = `StubGeocodingGateway`: every address → village centre, so
  geofence-rejection paths are locally unreachable and locally-listed venues stack on one
  map point — harnesses drive pins by keyboard or assert "aimed === opened", never a
  pointer at a named pin.
- Search reads one page of 100: a venue beyond it has no pin or row until a narrower
  search reaches it (its sheet works by slug; paging the map is unbuilt).
- Behind a proxy, a dead API answers **502** (nginx may answer **504** on a stopped
  upstream); `neverArrived()` covers 0/502/503 and deliberately not 504 — a timeout may
  have committed.
- The compose stack runs Production and **refuses the repository dev JWT key**
  (security-round guard): set `AUTH_JWT_SIGNING_KEY` to `openssl rand -base64 48` output
  or the api container crash-loops. Dev SSO and the dev mailbox exist only on a
  Development API — compose (:8080) cannot sign anybody in until the owner keys a provider.

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
