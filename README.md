# Steeple

> A hyperlocal, community-first marketplace connecting churches with spare halls to local
> organizers (playgroups, classes, clubs, non-profits) who need affordable, nearby space.
> Proof-of-concept.

**Docs:** [`docs/PRD.md`](docs/PRD.md) (product requirements) ·
[`docs/STEEPLE_PRODUCT.md`](docs/STEEPLE_PRODUCT.md) (brief) ·
[`docs/SYSTEM_DESIGN.md`](docs/SYSTEM_DESIGN.md) (target architecture) ·
[`ARCHITECTURE.md`](ARCHITECTURE.md) (as-built) ·
[`CONTRACTS.md`](CONTRACTS.md) (wire contracts) ·
[`docs/backlog/`](docs/backlog/) (what's next) ·
[`docs/MOBILE_DESIGN.md`](docs/MOBILE_DESIGN.md) (Flutter app design).
Agents: start with [`CLAUDE.md`](CLAUDE.md).

## Stack

.NET 10 API · Vite + vanilla JS + Leaflet SPA · HTMX admin · PostgreSQL 18 (schema
owned by Liquibase) · EF Core (database-first) · Flutter mobile · self-hosted, no lock-in.

## Prerequisites

- **.NET SDK 10**
- **Node.js + npm** (Web v2 development server)
- **Docker** (Postgres + the one-shot Liquibase migrate service; also Testcontainers for integration tests)
- _(optional)_ `psql` for poking the database

## Quick start

```bash
# Full stack (order enforced: postgres → migrate → api/admin → web)
docker compose up -d --build
# Web  → http://localhost:8080        Admin → http://localhost:8082/admin

# Or run the complete Development loop (Ctrl-C stops the apps; Postgres stays up):
./deploy.sh
# Uses 5173/5198/5200 when available and prints the alternatives it selects when they are not.
# STEEPLE_{POSTGRES,WEB,ADMIN,API}_PORT forces a specific port instead.

# The equivalent manual commands:
docker compose up -d postgres migrate      # provision + seed the DB
dotnet run --project src/Steeple.Api     # http://localhost:5200
npm run dev --prefix src/Steeple.Web.v2  # http://localhost:5173 (proxies /api to :5200)
dotnet run --project src/Steeple.Admin   # http://localhost:5198
```

Only `web` and `admin` publish host ports; `api` is internal to the compose network.
Postgres binds to `127.0.0.1:5433` for the local dev loop. Compose containers run in
**Production**; the `dotnet run` loop is Development.

| Service | Host URL | Notes |
|---|---|---|
| Web | http://localhost:8080 | SPA (compose) / :5173 (Vite) |
| Admin | http://localhost:8082/admin | operator console (authelia-gated in deployed env) |
| API | _internal_ `http://api:8080` | :5200 via `dotnet run` |
| Postgres | 127.0.0.1:5433 | container port 5432 |

### What you get

The web app is a map-first discovery and booking surface, seeded with Northern Virginia
venues and connected to the API for catalog, identity, applications, and host management.

| URL | What |
|---|---|
| `/` | Map + filterable listing grid |
| `#/venue/{venueId}` | Venue panel |
| `#/room/{venueId}/{roomId}` | Room detail |
| `#/apply/{venueId}/{roomId}` | Application flow |

## Database — Liquibase owns the schema

**No application migrates.** The schema + seed live in [`db/changelog/`](db/changelog/)
(formatted SQL); the one-shot `migrate` compose service applies them between
Postgres-healthy and app startup. `Steeple.Persistence` is **database-first**: its EF
entity configurations are kept in sync with the SQL by hand.

- **Schema change** = add a new `--changeset` block to the SQL (never edit an applied one)
  **and** update the matching EF config — see the recipe in [`CLAUDE.md`](CLAUDE.md).
- Connection string key **`ConnectionStrings:SteepleDb`** — dev in each app's
  `appsettings.Development.json` (localhost:5433); Docker via env
  `ConnectionStrings__SteepleDb`. Web has **no DB**; its nginx/Vite host proxies
  same-origin `/api` requests to the API.
- Reset local data: `docker compose down -v && docker compose up -d`

## Project structure

```
docs/                      product + design docs (PRD, system design, roadmap, mobile, SEO, analytics)
db/changelog/              Liquibase changelog — owns schema + seed
src/Steeple.Persistence  domain entities, value objects, enums, DbContext, EF configs
src/Steeple.Api          the one JSON API (web + mobile): Contracts/Controllers/Services/Proxies
src/Steeple.Web.v2        Vite + vanilla JS + Leaflet SPA; nginx host in containers
src/Steeple.Web.v1        deprecated MVC + HTMX implementation; excluded from active builds
src/Steeple.Admin        HTMX operator dashboard — reads Postgres via Persistence
tests/                     xUnit unit tests + Testcontainers integration tests
mobile/                    Flutter app (planned — docs/MOBILE_DESIGN.md)
docker-compose.yml         postgres → migrate → api/admin → web
```

Dependency rule: `Web → (HTTP) → Api → Persistence ← Admin`. Web and mobile share no
assembly with the server — they mirror the API's JSON per [`CONTRACTS.md`](CONTRACTS.md).

## Testing

```bash
dotnet test          # unit + integration (integration tests spin Postgres via Testcontainers/Docker)
```

## Notes

- EF stack pinned to **10.0.4** (Npgsql provider constraint) — don't bump EF above it.
- Vite hot-reloads the web app in development; server-side C# changes need restart.
- What's next (ratings & reputation, launch hardening, payments) lives in
  [`docs/backlog/`](docs/backlog/); as-built state is [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
- Feature flags, admin edge-auth (authelia), and the Loki/Grafana telemetry stack are
  **deployed-environment infra services** — integrated by the app, not part of this repo.
