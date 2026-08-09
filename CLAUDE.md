# CLAUDE.md

Steeple — hyperlocal marketplace connecting churches (spare halls/rooms) with community
organizers. Instant-book by default with per-venue manual-approve opt-in, host-set hourly
pricing, one Washington-metro beachhead. .NET 10 API + Vite web SPA (v2) + HTMX admin + PostgreSQL +
Flutter mobile. Solo-operated; lean (~$100 AUD/mo ceiling).

## Document map — read the owning doc, don't infer from code

Each doc owns one concern; **update the owning doc in the same PR as the change**.

| Doc | Owns |
|---|---|
| `docs/PRD.md` | Product scope, trust model, constraints |
| `docs/SYSTEM_DESIGN.md` | **Target** architecture + decision log (§17); where anything new goes |
| `docs/ARCHITECTURE.md` | **As-built** state: modules, domain invariants, ports, deployment |
| `docs/contracts/` | Every wire contract, port, and client seam — **START HERE for any interface question**; `docs/CONTRACTS.md` resolves "CONTRACTS §n" citations + change rules |
| `docs/backlog/` | What's next (README = index + open decisions). **`reputation-and-launch.md` is next** |
| `docs/MOBILE_DESIGN.md` + `docs/MOBILE_CONTRACTS.md` | Anything under `/mobile`; `mobile/README.md` has the run loop |
| `docs/DESIGN_SYSTEM.md` | Design tokens + component/UX specs — never hardcode values |
| `docs/runbooks/` | Third-party services in production (Resend, SSO, Turnstile) |

Target-state docs describe things that **don't exist yet**; ARCHITECTURE.md and the code
are the as-built truth (CONTRACTS.md marks ✅ built vs 🔲 planned per endpoint).

## Layout & hard rules

```
Web → (HTTP only) → Api → Persistence ← Admin        mobile → (HTTP only) → Api
```

`Steeple.Api` is the one JSON API: `Contracts/` (wire DTOs), thin `Controllers/`,
`Services/` (use-cases + port interfaces), `Proxies/` (adapters), grown by module
subfolder. `Steeple.Persistence` is database-first — `db/changelog` (Liquibase SQL)
**owns the schema; no application ever migrates**; EF configs mirror the SQL by hand.
`Steeple.Admin` has no in-app auth by design (authelia at the edge). Folder-matched
namespaces are global usings (`Namespace = Project.Folder`).

Web/mobile never reference Persistence or Api assemblies. `Api/Contracts` must not leak
Persistence types. Nothing mutates another module's data except through the owning
module's service. Never store PII beyond what the contracts specify — no passwords, gov
IDs, card data, ever.

Production infra not in this repo (flags service, authelia, Loki/Grafana, Caddy):
integrate, don't replace. Flags are config-backed via `IFeatureFlags` for now.

## Build / run / verify

```bash
docker compose up -d --build      # full stack · Web :8080 · Admin :8082/admin
docker compose up -d postgres migrate   # DB only, then:
dotnet run --project src/Steeple.Api    # http://localhost:5200
npm run dev --prefix src/Steeple.Web.v2 # http://localhost:5173 (vite; proxies /api → :5200)
docker compose down -v && docker compose up -d   # full DB reset (re-runs migrate + seed)
```

- Compose is Production-shaped: it needs everything in `.env.example` and fails startup
  with a capability-named error for any missing/Development adapter. Dev SSO and the dev
  mailbox (http://localhost:5200/dev/mailbox) exist only on a Development API.
- **Verify by driving the real flow** (search on :5173, hit the endpoint, check admin) —
  not just by compiling. Debug screenshots don't prove interactivity; real-event tests
  are mandatory.
- `dotnet test` is part of done (integration tests need Docker). Anything touching
  bookings/approval **must** keep `BookingIntegrityTests` green. `/mobile` changes:
  `flutter analyze` + `flutter test`.
- ⚠️ This machine: `cd` into the repo can strip `PATH` (local env hook) — use absolute
  binary paths or avoid `cd`.

## Recipes (follow exactly)

- **Schema change:** new `--changeset author:id` block in `db/changelog` (never edit an
  applied one) → matching EF config + entity by hand → `docker compose up -d migrate`.
- **New/changed endpoint:** CONTRACTS.md §1 checklist is binding — API + web `src/data/api.js`
  + mobile models/fixtures + CONTRACTS.md, all in one commit. Breaking inside `/api/v1`
  only if all clients update in the same commit. New public writable endpoints get rate
  limiting (+ Turnstile if anonymous).
- **Analytics event:** add to the CONTRACTS §7 taxonomy → emit via `IAnalyticsSink` /
  client batchers. Nothing user-visible ships un-instrumented.
- **Feature flag:** `<surface|domain>.<feature>`; local/in-memory evaluation only; clean
  up stable flags.

## Gotchas that bite

- **EF pinned to 10.0.4** (Npgsql constraint) — never bump EF packages above it.
- `/api/v1` emits **stable camelCase tokens** for enums; clients humanize for display;
  multi-value filters are AND. Details: `docs/contracts/conventions.md`.
- Booking schedules are **venue-local wall-clock** materialized per-date in the venue's
  IANA timezone (`ScheduleMaterializer`); DB stores UTC — never add fixed UTC intervals.
- Only Published rooms are publicly visible (Draft/Unlisted → 404); geofence rejects
  **silently** (clamp + empty results, not errors).
- Web identity: refresh token is an httpOnly cookie, access token + profile in memory
  only — **never write a token or profile to browser storage** (`docs/contracts/identity.md`).
- Sub-path hosting: web assets/API base stay document-relative; Admin uses
  `X-Forwarded-Prefix` (ARCHITECTURE.md → Deployment).

## Steeple.Web.v2

Map-first surface (Leaflet + panels) under a Three.js village splash; everything is real
against `/api/v1`. `docs/contracts/web.md` owns the boot state machine, all frozen seams
(`router.js`, `api.js`, `session.js`, `catalog.js`, `store.js`, …), CSS-scoping rules,
and hazards — **read it before touching web code**. The project's own `README.md` +
`docs/CONTRACT2–6.md` are its historical briefs ("CONTRACT4 §5" in comments means those;
"CONTRACTS §n" means `docs/CONTRACTS.md`).

- Product reads never wait on 3D; ⚠ never defer Leaflet's tile layer (NaN-zoom
  boot-killer, `ui/map/atlas.js`).
- Browser harnesses in `tools/*.mjs`: **read `tools/HARNESS.md` first** — inverting a
  suite's documented flags/env produces convincing, meaningless failures.
- Dev builds: `build:flat` (no Three), `build:debug`/`build:flat:debug` (keep
  `window.__steeple`); production builds drop the debug API and the dev sign-in form.

**Design taste (Jeremy):** calm, sophisticated, professional — never childish or tacky.
A/B alternatives behind query params, never branches. Copy says venue/space/host,
never church.

## Working agreements

- Match the idiom: records for DTOs, ports-in-Services/adapters-in-Proxies, thin
  controllers. Comments only for non-obvious constraints.
- No new packages/vendors without checking the cost ceiling + no-lock-in ethos
  (SYSTEM_DESIGN §2).
- Record architecture deviations in SYSTEM_DESIGN §17.
- Ambiguous product intent: PRD > product brief > inference; if still ambiguous, ask
  rather than invent scope.
