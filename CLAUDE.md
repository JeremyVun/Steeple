# CLAUDE.md

Steeple — POC marketplace connecting churches (spare halls) with local community organizers.
.NET 10 backend API + HTMX web funnel + HTMX admin + PostgreSQL. Product: `docs/PRD.md`. Design: `ARCHITECTURE.md`.

## Layout

Postgres is the system of record. Its **schema + seed are owned by a one-shot Liquibase migration
service** (`db/changelog/`) — no application migrates. The backend `Steeple.Api` and the
`Steeple.Admin` dashboard both read the DB through the shared `Steeple.Persistence` library;
`Steeple.Web` is a pure frontend that calls the API over HTTP.

- `/docs` — product & design docs (PRD, product brief, SEO plan, analytics plan)
- `/db/changelog` — Liquibase changelog: `db.changelog-master.yaml` (include manifest) + `001-schema.sql` + `002-seed.sql` (formatted SQL)
- `/src/Steeple.Persistence` — the domain/persistence layer (provider-agnostic EF): entities + value objects `GeoPoint`/`BoundingBox` (`Models/`), enums (`Constants/`), `SteepleDbContext`, `Configurations/`. Consumed by Api + Admin (they pick the Npgsql provider). **Web never references this.**
- `/src/Steeple.Api` — backend JSON API for the web funnel **and** the future mobile edge. It owns its **web contracts** and maps domain → them. Folders: `Contracts` (the DTOs it exposes), `Controllers` (JSON endpoints under `/api`), `Services` (use-case logic + ports `IListingService`/`IGeofencePolicy`), `Proxies` (EF repository, geocoding stub, analytics sink), `Configuration` (`GeofenceOptions`), `Extensions` (`AddSteepleApi`, mappings/flags), `Utils` (`GeoMath`). References Persistence.
- `/src/Steeple.Web` — ASP.NET Core MVC + HTMX + Leaflet funnel. **No DB and no shared project** — it speaks HTTP/JSON to the API and deserializes into its own view models. Folders: `Controllers`, `Services` (`ISteepleApiClient` typed HttpClient), `Models` (view models mirroring the API's JSON), `Configuration` (`BrandOptions`), `Extensions` (`AddSteeple` → brand + API client).
- `/src/Steeple.Admin` — standalone HTMX dashboard; reads Postgres directly via `Steeple.Persistence` (`PostgresAdminWorkspace`). Listings/analytics are live; users/bookings/flags are still in-memory placeholders (no schema yet).
- `/src/Steeple.FlagsSdk`, `/src/Steeple.FlagsService` — separate, standalone projects
- `docker-compose.yml` — full stack on a private `steeple` network. Only **web** (**8080**) and **admin** (**8082**) publish host ports; **api** and **flags** are internal-only (reached over the compose network); Postgres is bound to **127.0.0.1:5433** for the local dev loop only. One-shot `migrate` gates the apps; containers run **Production** (HSTS, Secure cookies, error pages). Admin sits behind caddy/authelia at the edge.
- `ARCHITECTURE.md` — layering + current slice scope

**Dependency rule:** `Web → (HTTP) → Api → Persistence ← Admin`. Web shares no assembly with the server;
its `Models/` mirror the API's web contract by convention. Folder-matched namespaces
(`Steeple.Api.Contracts`, `Steeple.Persistence.Models`, `Steeple.Web.Models`, …) are exposed
project-wide as global usings in each `.csproj`, so files reference each other without per-file usings.

## Run

- `docker compose up -d --build` — full stack. Order is enforced: postgres (healthy) → `migrate` (applies changelog, exits 0) → `api`/`admin` → `web`. Only Web (http://localhost:8080) and Admin (http://localhost:8082/admin) are published; the API and flags service are internal to the compose network. Containers run in **Production**; the local `dotnet run` loop below stays Development (hot reload).
- Local (non-Docker) dev: `docker compose up -d postgres migrate` first (provisions + seeds the DB), then `dotnet run --project src/Steeple.Api` (http://localhost:5200) and `dotnet run --project src/Steeple.Web` (http://localhost:5187, reads `Api:BaseUrl`). Admin: `dotnet run --project src/Steeple.Admin`.
- Build: `dotnet build` (solution is `Steeple.slnx`, the XML format).

## DB / migrations

- **Liquibase owns the schema** (`db/changelog/`). Applications never migrate — `Steeple.Persistence` is database-first; its EF entity configs must be kept in sync with the SQL by hand.
- Schema change = add a new `--changeset` to the SQL files (and update the matching EF config). The one-shot `migrate` service applies it on next `docker compose up`. (To bootstrap SQL from the EF model you can temporarily scaffold a migration and `dotnet ef migrations script`, but Liquibase is the source of truth.)
- Connection string `ConnectionStrings:SteepleDb`: dev in each app's `appsettings.Development.json` (localhost:5433); in Docker via env `ConnectionStrings__SteepleDb`. Web instead uses `Api:BaseUrl` / `Api__BaseUrl` — it has no DB connection.
- Reset data: `docker compose down -v && docker compose up -d` (re-runs `migrate` from scratch).

## Notes

- EF stack pinned to **10.0.4** (Npgsql provider constraint) — don't bump EF above it. Persistence references `Microsoft.EntityFrameworkCore.Relational`; Api/Admin add `Npgsql.EntityFrameworkCore.PostgreSQL`.
- Views hot-reload in Development (Razor runtime compilation); C# changes need rebuild/restart.
- **Sub-path hosting:** Web and Admin are path-base aware — the edge proxy sends `X-Forwarded-Prefix` (e.g. `/steeple`) and both `Program.cs` enable `ForwardedHeaders.XForwardedPrefix` → `Request.PathBase`. So **never hardcode root-relative URLs**: use `~/…` for `href`/`action`/`src`, `@Url.Content("~/…")` for HTMX `hx-get`/`hx-post` and server-built paths, and route-based redirects. With no prefix header (local dev / compose) everything resolves at `/`. Full topology + caddy rules in `ARCHITECTURE.md` → "Deployment — reverse proxy & sub-path hosting".
- Current build = read-only discovery slice only (no auth / apply / booking yet); SSO, notifications, maps are stubbed behind ports in the API.
- This machine: `cd` into the repo can strip `PATH` (a local env hook) — when scripting, use absolute binary paths or avoid `cd`.
