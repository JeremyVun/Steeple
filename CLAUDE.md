# CLAUDE.md

Steeple — hyperlocal marketplace connecting churches (spare halls/rooms) with community
organizers. Request→approve booking (not instant-book), free-first, one NoVA beachhead.
.NET 10 API + HTMX web + HTMX admin + PostgreSQL + Flutter mobile (`/mobile`, Phase 4).
Shipped (ROADMAP Phases 0–3): the full web loop — discovery → SSO → apply → approve →
booking with DB-enforced integrity. Solo-operated; lean (~$100 AUD/mo ceiling).

## Read this first — document map

**If a doc here answers your question, trust it over inference from code.** Each doc owns
one concern; update the owning doc in the same PR as the change it describes.

| Doc | Owns | Trust it for |
|---|---|---|
| `docs/PRD.md` | Product scope & why | What's in/out of v1, trust model, constraints |
| `docs/SYSTEM_DESIGN.md` | **Target** architecture + decision log (§17) | Where anything new should go; seams; unbuilt designs (media, payments, flags) |
| `docs/ARCHITECTURE.md` | **As-built** state | What exists today: modules, domain model + invariants, ports, deployment |
| `docs/CONTRACTS.md` | Every wire contract + change rules | DTO shapes, conventions, endpoint specs, event taxonomy |
| `docs/ROADMAP.md` | Phase order & exit criteria | What to build next and what's deliberately deferred |
| `docs/MOBILE_DESIGN.md` | Flutter app design | Anything under `/mobile` |
| `docs/MOBILE_CONTRACTS.md` | Mobile in-app seams (interfaces, routes, providers, shared widgets) | What a `/mobile` feature builds against |
| `docs/DESIGN_SYSTEM.md` | Canonical design tokens + component/UX specs (all surfaces) | Any styling/visual decision — never hardcode values |
| `docs/SEO.md` | SEO checklist | SEO to-dos |

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
- `/src/Steeple.Web` — MVC + HTMX + Leaflet BFF. **No DB, no shared server assembly.**
  Mirrors API JSON in `Models/ApiModels.cs` by convention (CONTRACTS.md governs).
- `/src/Steeple.Admin` — operator dashboard; reads Postgres via Persistence. No in-app
  auth **by design** — authelia gates it at the edge proxy in the deployed environment.
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
(same key names; ROADMAP carry-over).

## Build / run / verify

```bash
docker compose up -d --build      # full stack: postgres → migrate → api/admin → web
                                  # Web http://localhost:8080 · Admin http://localhost:8082/admin
docker compose up -d postgres migrate   # DB only, then:
dotnet run --project src/Steeple.Api    # http://localhost:5200
dotnet run --project src/Steeple.Web    # http://localhost:5187 (needs Api:BaseUrl)
dotnet run --project src/Steeple.Admin
docker compose down -v && docker compose up -d   # full DB reset (re-runs migrate + seed)
```

- Razor views hot-reload in Development; C# changes need restart.
- Verify a change by driving the real flow (search on `:5187`, hit the API endpoint, check
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
`Api/Contracts` + controller/service/proxy → Web `ApiModels.cs` + views → mobile models
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
localhost:5433; Docker: `ConnectionStrings__SteepleDb` env). Web has **no** DB — it gets
`Api:BaseUrl` / `Api__BaseUrl`. Geofence bounds = `Geofence` section in Api appsettings.

## Gotchas that bite

- **EF pinned to 10.0.4** (Npgsql provider constraint) — do not bump EF packages above it.
- **Sub-path hosting:** Web + Admin live behind `X-Forwarded-Prefix` (e.g. `/steeple`).
  Never hardcode root-relative URLs: `~/…` for `href`/`action`/`src`,
  `@Url.Content("~/…")` for HTMX `hx-get`/`hx-post` and server-built paths, route-based
  redirects. Details: ARCHITECTURE.md → "Deployment".
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
- **Web sign-in state:** the API token pair lives in the encrypted `steeple.auth` cookie;
  DataProtection keys must persist (compose volume `steeple_web_keys`) or every deploy
  signs everyone out.
- Compose runs containers in **Production** (HSTS, secure cookies); the dotnet-run loop is
  Development. Only web/admin publish host ports; api is compose-internal.

## Working agreements

- Match the codebase's idiom: records for DTOs, ports-in-Services/adapters-in-Proxies,
  thin controllers, folder-namespace convention. Comments only for non-obvious constraints.
- Don't add packages/vendors without checking the cost ceiling and no-lock-in ethos
  (SYSTEM_DESIGN §2); prefer the escape-hatch-friendly option.
- Update the owning doc with the change (doc map above); record architecture deviations in
  SYSTEM_DESIGN §17's decision log.
- When product intent is ambiguous, PRD > product brief > inference; if still ambiguous,
  ask rather than invent scope.
