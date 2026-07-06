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

.NET 10 (ASP.NET Core MVC) · HTMX + Leaflet (no SPA) · PostgreSQL 18 (schema owned by
Liquibase) · EF Core (database-first) · Flutter mobile app planned (`/mobile`) ·
self-hosted, no lock-in.

## Prerequisites

- **.NET SDK 10**
- **Docker** (Postgres + the one-shot Liquibase migrate service; also Testcontainers for integration tests)
- _(optional)_ `psql` for poking the database

## Quick start

```bash
# Full stack (order enforced: postgres → migrate → api/admin → web)
docker compose up -d --build
# Web  → http://localhost:8080        Admin → http://localhost:8082/admin

# Or the local dev loop (hot reload):
docker compose up -d postgres migrate      # provision + seed the DB
dotnet run --project src/Steeple.Api     # http://localhost:5200
dotnet run --project src/Steeple.Web     # http://localhost:5187 (calls the API via Api:BaseUrl)
dotnet run --project src/Steeple.Admin   # http://localhost:5198
```

Only `web` and `admin` publish host ports; `api` is internal to the compose network.
Postgres binds to `127.0.0.1:5433` for the local dev loop. Compose containers run in
**Production**; the `dotnet run` loop is Development.

| Service | Host URL | Notes |
|---|---|---|
| Web | http://localhost:8080 | funnel (compose) / :5187 (`dotnet run`) |
| Admin | http://localhost:8082/admin | operator console (authelia-gated in deployed env) |
| API | _internal_ `http://api:8080` | :5200 via `dotnet run` |
| Postgres | 127.0.0.1:5433 | container port 5432 |

### What you get

The current slice is the **read-only discovery funnel**: geo-fenced map search + filters +
shareable listing pages, seeded with 5 Northern-Virginia churches / 10 rooms around Vienna.

| URL | What |
|---|---|
| `/` | Map + filterable listing grid |
| `/space/{venue}/{room}` | Shareable listing detail page |
| `/listings/{id}` | 301 → canonical slug URL |
| `/robots.txt`, `/sitemap.xml` | SEO |

## Database — Liquibase owns the schema

**No application migrates.** The schema + seed live in [`db/changelog/`](db/changelog/)
(formatted SQL); the one-shot `migrate` compose service applies them between
Postgres-healthy and app startup. `Steeple.Persistence` is **database-first**: its EF
entity configurations are kept in sync with the SQL by hand.

- **Schema change** = add a new `--changeset` block to the SQL (never edit an applied one)
  **and** update the matching EF config — see the recipe in [`CLAUDE.md`](CLAUDE.md).
- Connection string key **`ConnectionStrings:SteepleDb`** — dev in each app's
  `appsettings.Development.json` (localhost:5433); Docker via env
  `ConnectionStrings__SteepleDb`. Web has **no DB** — it gets `Api:BaseUrl` instead.
- Reset local data: `docker compose down -v && docker compose up -d`

## Project structure

```
docs/                      product + design docs (PRD, system design, roadmap, mobile, SEO, analytics)
db/changelog/              Liquibase changelog — owns schema + seed
src/Steeple.Persistence  domain entities, value objects, enums, DbContext, EF configs
src/Steeple.Api          the one JSON API (web + mobile): Contracts/Controllers/Services/Proxies
src/Steeple.Web          MVC + HTMX + Leaflet funnel — no DB, no shared server assembly
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
- Views hot-reload in Development; C# changes need rebuild/restart.
- What's next (ratings & reputation, launch hardening, payments) lives in
  [`docs/backlog/`](docs/backlog/); as-built state is [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
- Feature flags, admin edge-auth (authelia), and the Loki/Grafana telemetry stack are
  **deployed-environment infra services** — integrated by the app, not part of this repo.
