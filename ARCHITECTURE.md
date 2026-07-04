# Steeple — Architecture (build notes)

> Companion to `docs/PRD.md`. This documents the **as-built** backend + web app: how the
> code is laid out, the layering rules, and what is in / out of the current slice.
> It is updated as the build progresses.
>
> The **target-state** architecture (full product: web + mobile + API + seams) lives in
> `docs/SYSTEM_DESIGN.md`; wire contracts in `CONTRACTS.md`; the phased plan in
> `docs/ROADMAP.md`; the Flutter app design in `docs/MOBILE_DESIGN.md`.

## What's built so far — Slice 1: read-only discovery (vertical)

The first vertical slice is the **install-free, shareable discovery** half of the demand
funnel (PRD "In Scope" → consumer web funnel; "POC-first slice" → geo-fenced map + nearby
listings + listing detail + search/filter). It exercises **every layer end to end** so the
contracts can be reviewed before the project builds outward.

**In this slice**
- Geo-fenced listing **search/filter** (proximity via bounding-box, capacity, free-vs-paid, activity-fit, accessibility).
- Rich **listing detail** pages with shareable URLs (`/space/{venue}/{room}`).
- Map-based browse (Leaflet, light JS) + HTMX-driven filtering — no SPA framework (PRD: HTMX + light JS, no React/Next).
- Postgres system of record, EF Core, seed data for a Northern-Virginia beachhead.
- Analytics events logged to Postgres (PRD: instrument the funnel; no-lock-in sink).

**Hardening pass (2026-07-03) — ROADMAP Phase 0**
- **`/api/v1`** versioned base path; wire enums normalized to **stable camelCase tokens**
  (`"stepFreeAccess"`, `"church"`) with clients humanizing for display; contracts now
  self-contained (`GeoPointDto`/`BoundingBoxDto` — no Persistence types on the wire);
  404s return RFC 9457 **ProblemDetails**. See `CONTRACTS.md`.
- **Listing visibility gate:** direct id/slug detail lookups now 404 for non-Published
  rooms (previously Draft/Unlisted leaked via guessed URLs; search already filtered).
- **Analytics sink swapped** to `StdoutLogAnalyticsSink` (structured JSON log line →
  container stdout → deployed Promtail/Loki/Grafana); Production uses the JSON console
  formatter; the request-path Postgres write is gone (`analytics_events` is legacy/read-only).
- **SEO completed** on listing pages: full JSON-LD (`Place`/`PlaceOfWorship`, `Offer` +
  `UnitPriceSpecification` for paid rooms, `BreadcrumbList`), dynamic preconnect hints for
  photo origins, explicit image dimensions. `docs/SEO.md` tracks the remaining items.
- **Tests:** `tests/Steeple.Api.Tests` (unit: geofence, geo math, listing visibility) and
  `tests/Steeple.Integration.Tests` (Testcontainers Postgres, Liquibase SQL applied raw,
  repository behavior against real seed data).

**Deferred to later slices (interfaces/seams left clean, not yet implemented)**
- Apply → approve → booking, the application/booking state machine, and the
  `btree_gist` no-double-booking exclusion constraint over materialised occurrences.
- SSO (Google/Apple), notifications (FCM/email), real Maps/geocoding — currently **stubbed behind ports**.
- The Flutter **mobile client** (the `Steeple.Api` backend it will consume now exists, serving the web funnel today).
- Admin **auth/moderation** workflows — the HTMX dashboard now reads live Postgres data (listings/analytics); users/bookings/flags are still placeholders.

## Solution layout

```
Steeple.slnx
├─ db/changelog              — Liquibase: schema + seed (owns the DB; no app migrates)
├─ src/Steeple.Persistence — domain/persistence: entities, value objects, enums, DbContext, Configurations/
├─ src/Steeple.Api         — backend JSON API (web + mobile edges). Owns its web contracts + the services:
│    Contracts/    — the web DTOs the API exposes (maps domain → these)
│    Controllers/  — JSON endpoints under /api
│    Services/     — use-case logic + ports (IListingService, IGeofencePolicy)
│    Proxies/      — port adapters: EF repository, geocoding stub, analytics sink
│    Configuration/ Extensions/ Utils/  — GeofenceOptions, AddSteepleApi + mappings, GeoMath
├─ src/Steeple.Web         — MVC + HTMX + Leaflet funnel. No DB, no shared project; own view models; calls the API.
├─ src/Steeple.Admin       — HTMX dashboard; reads Postgres directly via Steeple.Persistence.
└─ tests/                    — Steeple.Api.Tests (unit) + Steeple.Integration.Tests (Testcontainers Postgres)
```

The discovery half was four projects (`Domain` / `Application` / `Infrastructure` / `Web`), briefly
merged into one, and is now split along the **runtime topology** with a strict dependency rule
(`Web → HTTP → Api → Persistence ← Admin`): `Persistence` owns the domain model (entities, value
objects, enums) + EF mapping; `Api` owns its **web contracts** and the use-case services/adapters, and
maps domain → contracts; `Web` is a thin presentation tier that **shares no assembly with the server** —
it deserializes the API's JSON into its own view models. `Admin` reads the DB directly via `Persistence`.
Folder-matched namespaces are registered as project-wide global usings per csproj.

## Layering — `controller → service → proxy` (inside the API)

| Tier | Lives in | Responsibility |
|---|---|---|
| **Edge** | `Web/Controllers` + `Api/Controllers` | HTTP edges. Web binds requests and renders Razor/HTMX over data fetched from the API; the API exposes JSON. |
| **Service** | `Api/Services` | Use-case logic: geofence resolution, search orchestration, mapping, analytics. Defines **ports** (interfaces) for everything external. |
| **Proxy / adapter** | `Api/Proxies` | Implements the ports: EF Core repositories (DB proxy) + outbound gateways (Maps/geocoding, etc.). |

Services define the ports; Proxies provide the adapters. `AddSteepleApi` (in the API's
`Extensions/ServiceCollectionExtensions.cs`) wires the adapters into the container. The **same API
service layer** serves both the web funnel (over `ISteepleApiClient`) and, later, the Mobile JSON
edge — exactly as the PRD's two-edge design requires.

### Ports (Services) → Adapters (Proxies)

| Port (interface) | Adapter (this slice) | Real impl later |
|---|---|---|
| `IRoomRepository` | `RoomRepository` (EF Core, bounding-box query) | — |
| `IGeocodingGateway` | `StubGeocodingGateway` (returns beachhead centre) | Google Geocoding / Apple MapKit |
| `IAnalyticsSink` | `StdoutLogAnalyticsSink` (structured JSON log line → stdout → Promtail/Loki) | (same) |
| `IGeofencePolicy` | `GeofencePolicy` (pure logic over config) | — |

## Domain model (this slice)

```
Venue (church / community space)  1───* Room (the listing)  1───* RoomPhoto
   lat/long, slug, address,            capacity, price (null = FREE),
   IsIdentityVerified, type            amenities/accessibility/accepted-activities (flags),
                                       house rules, status (Draft/Published/Unlisted)

AnalyticsEvent  — funnel instrumentation (event type + JSON payload + session)
```

- **Listing = a Room.** A venue lists one or several rooms, each with its own photos,
  capacity, amenities, and price (PRD church-admin story).
- **Flags enums** (`Amenity`, `AccessibilityFeature`, `ActivityType`) store as `int`;
  filtering is a bitwise mask in SQL ("room accepts **all** requested activities").
- **Geo** lives on the Venue (lat/long, indexed). Search is a **bounding-box** query — no
  PostGIS at one-suburb scale (PRD). Distance is haversine, computed in-process after the
  box narrows the rows.

## Geofence

A single hardcoded beachhead (config section `Geofence`) — currently **Vienna & nearby,
Northern Virginia** (`lat 38.84–38.96, lng -77.34–-77.12`). `GeofencePolicy` clamps any
requested viewport/radius **into** the beachhead and rejects out-of-area detail lookups, so
the server only ever honours allowed locations (PRD: geo-fenced backend, cost + focus).
The founder swaps the box for her chosen suburb at launch — one config change.

## Data / persistence

- **Postgres** = system of record. Local dev via `docker-compose.yml` (Postgres 18, host port **5433**).
- **Schema + seed are owned by a one-shot Liquibase service** (`db/changelog/`, formatted SQL). It runs
  in compose between Postgres-healthy and the apps, then exits — **no application migrates**.
- **EF Core 10 + Npgsql** is **database-first**: `Steeple.Persistence` maps to the Liquibase-owned
  schema; its entity configs are kept in sync with the SQL by hand. Connection string key `SteepleDb`.
- Indexes: unique `Venue.Slug`, unique `Room(VenueId, Slug)`, composite `Venue(Latitude, Longitude)`, `Room.Status`.

## Running it locally

```bash
docker compose up -d --build                # full stack: postgres → migrate → api/admin → web
# or, for non-Docker dev:
docker compose up -d postgres migrate       # provision + seed the DB first
dotnet run --project src/Steeple.Api      # http://localhost:5200
dotnet run --project src/Steeple.Web      # http://localhost:5187 (reads Api:BaseUrl)
```

Web routes (rendered from API data):
- `/`                              — map + filterable listing grid
- `/search?...`                    — HTMX partial (filter updates)
- `/space/{venueSlug}/{roomSlug}`  — shareable listing detail
- `/listings/{id}`                 — canonical redirect to the slug URL

API routes (JSON, also for the future mobile edge — full specs in `CONTRACTS.md`):
`/api/v1/listings/search`, `/api/v1/listings/{id}`, `/api/v1/listings/by-slug/{venue}/{room}`,
`/api/v1/suburbs`, `/api/v1/sitemap`, `/api/v1/geofence`.

## Deployment — reverse proxy & sub-path hosting

Both front ends are **path-base aware**, so the whole stack can sit behind a single domain under a
sub-path (e.g. `jeremyvun.com/steeple` → Web, `jeremyvun.com/steeple/admin` → Admin) as well as
at a domain root. The mechanism:

- The edge proxy (caddy) sends **`X-Forwarded-Prefix: /steeple`**; both `Program.cs` enable
  `ForwardedHeaders.XForwardedPrefix`, which maps that header into `Request.PathBase`.
- Every emitted link derives from `PathBase` rather than hardcoding `/…`: views use `~/…`
  (tag-helper-resolved) for `href`/`action`/`src` and `@Url.Content("~/…")` for HTMX
  `hx-get`/`hx-post` and server-built `/space/…` URLs; controllers use route-based redirects and
  `Url.Content`; `SteepleControllerBase.BaseUrl` appends `Request.PathBase` so SEO
  (canonical/OG/`sitemap.xml`/`robots.txt`) carries the prefix too.
- The apps stay prefix-agnostic: with **no** `X-Forwarded-Prefix` (local `dotnet run`,
  `docker compose`) everything resolves at `/`. The prefix lives **only** in the proxy config.

Proxy rules (admin first — more specific): Web uses `handle_path /steeple/*` (strips the whole
prefix; app sees `/`). Admin uses `handle /steeple/admin*` + `uri strip_prefix /steeple`
(strips **only** `/steeple`, keeping the app's own `/admin` route segment) so `PathBase=/steeple`
+ route `/admin/…` lands at `…/steeple/admin`. Both add `header_up X-Forwarded-Prefix /steeple`;
caddy already forwards `X-Forwarded-For/Proto/Host`.

> **Trust note:** both apps clear `KnownProxies`/`KnownIPNetworks`, so `X-Forwarded-Prefix` is trusted
> from any source. Keep the containers reachable **only via caddy** (don't publish the dev host ports
> publicly), or restrict `KnownProxies` to the caddy network, so the prefix can't be spoofed.

## Next slices (planned)

1. **Apply → approve** — application entity + intent fields, SSO at the apply step (Google/Apple), church approve/ask/decline, notifications (FCM + email ports).
2. **Booking integrity** — confirmed bookings, bounded recurring occurrences materialised as `(room_id, time_range)` rows, `btree_gist` `EXCLUDE` constraint for atomic no-double-booking (PRD's headline DB requirement).
3. **Mobile edge** — the Flutter client over the existing `Steeple.Api` JSON endpoints.
4. **Admin dashboard** — auth (own user/pw + TOTP) + concierge onboarding + moderation, on the now-real-data HTMX shell.
5. **Ratings/reputation**, renewal nudges (fast-follow).
