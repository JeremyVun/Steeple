# Steeple

> A hyperlocal, community-first marketplace connecting churches with spare halls to local
> organizers (playgroups, classes, clubs, non-profits) who need affordable — often free —
> nearby space. Proof-of-concept.

Product context: [`docs/PRD.md`](docs/PRD.md) (technical) · [`docs/STEEPLE_PRODUCT.md`](docs/STEEPLE_PRODUCT.md) (brief).
Design & layering: [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Stack

.NET 10 (ASP.NET Core MVC) · HTMX + Leaflet (no SPA) · PostgreSQL 18 + EF Core · self-hosted, no lock-in.

## Prerequisites

- **.NET SDK 10**
- **Docker** (for local Postgres)
- **EF CLI** (for migrations): `dotnet tool install --global dotnet-ef`
- _(optional)_ `psql` for poking the database

## Quick start

```bash
# 1. Start the container stack
docker compose up -d

# 2. Run the web app — in Development it auto-applies EF migrations and seeds demo data
dotnet run --project src/Steeple.Web
```

Then open **http://localhost:5187**.

For local HTTPS: `dotnet run --project src/Steeple.Web --launch-profile https` → https://localhost:5188.

Container ports:

Only `web` and `admin` publish host ports; `api` and `flags` are internal to the compose network
(reached by other services via their service name). Postgres is bound to localhost for local dev.

| Service | Host URL | Container port |
|---|---:|---:|
| Web | http://localhost:8080 | 8080 |
| Admin | http://localhost:8082/admin | 8080 |
| API | _internal_ (`http://api:8080`) | 8080 |
| Flags | _internal_ (`http://flags:8080`) | 8080 |
| Postgres | 127.0.0.1:5433 | 5432 |

Direct `dotnet run` launch ports:

| Project | URL |
|---|---|
| `Steeple.Web` | http://localhost:5187 |
| `Steeple.Web` HTTPS profile | https://localhost:5188 |
| `Steeple.Admin` | http://localhost:5198 |

### What you get

The current slice is the **read-only discovery funnel**: geo-fenced map search + filters + shareable
listing pages, seeded with 5 Northern-Virginia churches / 10 rooms around Vienna.

| URL | What |
|---|---|
| `/` | Map + filterable listing grid |
| `/space/{venue}/{room}` | Shareable listing detail page |
| `/listings/{id}` | 301 → canonical slug URL |
| `/robots.txt`, `/sitemap.xml` | SEO |

## Database

- Local Postgres runs via [`docker-compose.yml`](docker-compose.yml) on host port **5433**
  (5433, not 5432, to avoid clashing with a local Postgres). Credentials default from `.env`.
- Connection string key: **`ConnectionStrings:SteepleDb`**
  - dev → `src/Steeple.Web/appsettings.Development.json`
  - prod → env var `ConnectionStrings__SteepleDb` (the base `appsettings.json` carries no password)
- In **Development** the app migrates and seeds automatically on startup.

### Migrations (EF Core)

```bash
# add a migration
dotnet ef migrations add <Name> -p src/Steeple.Infrastructure -s src/Steeple.Infrastructure

# apply manually (otherwise applied automatically on dev startup)
dotnet ef database update -p src/Steeple.Infrastructure -s src/Steeple.Infrastructure
```

A design-time factory reads the `STEEPLE_DB` env var (falling back to `localhost:5433`), so
`dotnet ef` works without running the app.

### Reset local data

```bash
docker compose down -v && docker compose up -d
```

## Project structure

```
docs/                         product + design docs (PRD, brief, SEO, analytics)
src/Steeple.Domain          entities, enums, value objects        (no dependencies)
src/Steeple.Application     DTOs, services, ports (interfaces)    → Domain
src/Steeple.Infrastructure  EF Core, repositories, gateways,
                              seed, migrations                      → Application
src/Steeple.Web             ASP.NET Core MVC + HTMX + Leaflet     → Application + Infrastructure
src/Steeple.Admin           ASP.NET Core MVC + HTMX admin         (mock data for now)
src/Steeple.FlagsService    Runtime feature flag service
docker-compose.yml            local Postgres + containerised apps
```

Layering is **Controller (Web) → Service (Application) → Proxy/Adapter (Infrastructure)**; see
[`ARCHITECTURE.md`](ARCHITECTURE.md).

## Configuration

- **`Geofence`** section (appsettings) — the allowed beachhead bounding box + centre
  (default: Vienna, Northern Virginia). The server only honours listings inside it.
- SSO, notifications, and maps/geocoding are **stubbed behind ports** in this slice — the app
  runs fully locally with just Docker Postgres.

## Notes

- EF Core is pinned to **10.0.4** to match the Npgsql provider — don't bump `Microsoft.EntityFrameworkCore.Design` above the EF version Npgsql ships against.
- Views hot-reload in Development (Razor runtime compilation); C# changes need a rebuild/restart.
- No tests yet; no auth / apply / booking yet — those are the next planned slices (see `ARCHITECTURE.md`).
