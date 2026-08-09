# CONTRACTS — SEO / crawler surface

> Owns the crawler-facing policy of the web surface: `robots.txt`, sitemap policy and
> `lastmod` truth, site metadata/JSON-LD, and which URL families are indexable. The sitemap
> *wire* endpoints belong to `discovery.md`; the clean-route listing-document build **shipped
> 2026-08-08** (`docs/backlog/seo/design.md` is its rationale of record). Dissolved out of the
> former `docs/SEO.md` 2026-08-08.

Why this surface is load-bearing: the PRD's demand thesis is share-driven, install-free
discovery. Organic hyperlocal search ("church hall hire near me", "{suburb} hall hire") creates
awareness without paid spend, and every shared listing URL that unfurls as the generic app title
is that loop failing at its first hop.

## As-built (✅)

- **`robots.txt`** — **API-rendered** (2026-08-08): `GET /robots.txt` on `WebDocumentController`
  (body from `IWebDocumentRenderer.RenderRobots`), aliased at the web edge by `nginx.conf`
  `location = /robots.txt` exactly as `/sitemap.xml` is, and proxied the same way by
  `vite.config.js` for dev parity. There is no static copy: `public/robots.txt` was deleted the
  same day, so one file is the truth. Allows everything; there are no faceted URL families to
  disallow, and robots is never used to hide private routes — authorization is the boundary, and
  blocking a crawler does not make a URL secret.
  - **The `Sitemap:` line is absolute** and built from `IPublicBaseResolver`
    (`Sitemap: {base}/sitemap.xml`) — the shipped static file named `/sitemap.xml` relatively,
    which the sitemaps.org protocol ignores, and autodiscovery is this deployment's only sitemap
    discovery while Search Console is deferred. It is therefore also the reason the file is
    rendered at all: only the API knows the public base.
  - Cached 1h, as `/sitemap.xml` is. **API down ⇒ the edge answers 502**, deliberately: a crawler
    retries, and the only static fallback available would be the stale relative line.
- **`sitemap.xml`** — `GET /api/v1/sitemap.xml` (wire shape: `discovery.md`), aliased at the
  web edge by `nginx.conf` `location = /sitemap.xml` (where `robots.txt` points). Home page +
  every Published, non-operator-unlisted room **inside the served area** as
  `/space/{venueSlug}/{roomSlug}`; cached 1h.
  - **The advertised set is the readable set** (2026-08-08): `ListingService` passes
    `IGeofencePolicy.Bounds` into `IRoomRepository.GetPublishedForSitemapAsync`, whose SQL uses
    the same inclusive comparison as `BoundingBox.Contains` and the search predicate — so an
    out-of-area row can never be advertised, and an edge-sitting venue is never hidden. The
    persistence adapter is told the bounds; it does not know the beachhead.
  - **One spelling per room** (2026-08-08): `loc` is built from the same
    `PublicBase` + `WebDocumentRenderer.ListingPath` as the listing document's canonical, and
    the base comes from `IPublicBaseResolver` (`Seo:PublicBaseUrl`, request-origin fallback in
    Development only). Forwarded headers no longer reach any crawler-facing URL. A room's
    sitemap `loc`, `<link rel=canonical>`, `og:url`, `Offer.url` and its breadcrumb item are
    byte-identical (proven per-DTO in `SitemapXmlTests` and across the live sitemap).
  - **`lastmod` truth:** the later of `Room.UpdatedAtUtc`/`Venue.UpdatedAtUtc`, date-only.
    Every write that changes a listing document stamps one of them — room and venue edits,
    photo add/caption/delete, publish, unlist, operator takedown, and (from 2026-08-08)
    availability-rule saves and Admin rating hide/unhide, the two paths that were verified
    missing. Moderating a **venue-directed** rating stamps the venue, because its star average
    rides every one of that venue's room pages; organizer-directed ratings appear on no listing
    document and move nothing. Time-based rating reveal changes the public average with **no
    row write** — `lastmod` deliberately does not cover it.
- **The public base is configuration, never a header** (2026-08-08) — `Seo:PublicBaseUrl` decides
  the origin *and* the sub-path prefix of every crawler-facing URL (canonicals, `og:url`, the
  document `<base>`, absolute photo URLs, sitemap `loc`, the `Sitemap:` line). Unset, the API falls
  back to the request's own scheme/host: a **root-origin Development convenience**, not a
  deployment mode.
  - **A deployment reached under a stripped sub-path REQUIRES `Seo:PublicBaseUrl`.** Forwarded
    headers are never consulted: nothing maps `X-Forwarded-Prefix` into `PathBase`, and `nginx.conf`
    no longer sets it on the way to the API (it did, and no reader ever existed — removed
    2026-08-08). It is not stripped either, so a prefix an edge describes still *reaches* the API —
    for one purpose. Left unset behind a prefix, every published URL silently omits it; the resolver
    logs one warning (latched, once per process) naming the key when a request arrives describing a
    prefix it will not obey, and the startup warning for an unset key outside Development remains.
    A stranger's invented prefix therefore buys a log line and never a URL.
- **Site-level metadata** — `index.html` carries the one static title/description,
  `og:*`/`twitter:card=summary` and a `WebSite` JSON-LD block. Deliberately no site-level
  `og:image`/`og:url`: both would lie for a single bundle deployable at `/` or a stripped
  prefix, and per-listing values need per-URL documents.

## As-built (✅) — clean-route listing documents (shipped 2026-08-08)

- **`/space/{venueSlug}/{roomSlug}` is the public identity of a listing.** The API renders the
  initial document outside `/api/v1` (`WebDocumentController` → `IWebDocumentRenderer`,
  `src/Steeple.Api/Services/Seo/`): semantic listing HTML with per-listing
  title/description/canonical, OG/Twitter cards (photo when one exists; summary card when not),
  a `WebSite` + `Place` + `Offer` + `BreadcrumbList` `@graph`, the public `RoomDetailDto` as an
  inert `#steeple-listing-bootstrap` JSON block, and a same-origin `route-handoff.js` that
  progressively swaps in the Vite shell at the same URL. nginx proxies only this route (and
  `/sitemap.xml`/`/robots.txt`) to the API; every other clean app route is a static `noindex`
  boot document, so ordinary app boot keeps zero API dependency. Rate policy `documents`
  (240/min per IP) — sized for a full-sitemap crawl, separate from the SPA's `discovery` budget.
- **Real statuses.** Unknown, Draft, Unlisted, operator-unlisted and out-of-area rooms return one
  byte-identical designed 404 (`X-Robots-Tag: noindex`, no reason leak). A listing-renderer
  outage keeps its 502/503/504 (nginx serves the static boot body under the same status — a
  human can still boot the app, a crawler sees a temporary failure, never a false 200/404).
  Unknown paths are a designed static 404, never the shell at 200.
- **Strict canonicalization.** Lower-case slugs, no trailing slash, no query in canonicals;
  non-canonical spellings 301 to the exact canonical (query string carried, since it holds the
  visual-experiment flags). No `/listings/{id}` family exists.
- **Index policy, enforced at both layers.** Only `/` and valid `/space/...` are indexable.
  Browse/venue are `noindex,follow`; apply/journal/desk/letter `noindex,nofollow` + `no-store`.
  The client (`src/ui/metadata.js` + `metaText.js`) mirrors the same policy and copy in-session —
  all owned head nodes carry `data-steeple-route-meta` and replace atomically (`index.html`'s
  printed head twins are marked too, so no boot path leaves a duplicate canonical). The shared
  golden table `tests/fixtures/seo-formats.json` pins server and client copy together.
- Old `#/…` links are compatibility entrances: converted client-side by one `replaceState`,
  query preserved, never emitted anew.
- Prior art: web v1's retired server-rendered pages (`src/Steeple.Web.v1`
  `Views/Discovery/Detail.cshtml`, `SeoController`) earned all of this once; the 2026-08-08
  build supersedes them.

## Recorded gaps (accepted 2026-08-08, not oversights)

- **Malformed bootstrap JSON double-counts `listing_viewed`**: the degraded path (client ignores
  a bad bootstrap and performs the normal detail read) emits a second server-side event. Within
  design §10's contract; the happy path is single-count and harness-asserted.
- **The sitemap is one flat `<urlset>`** — no 50k/50MB index split. A cliff far beyond beachhead
  scale; split when a second metro ships.
- **A new rating's arrival stamps no `lastmod`** (same class as the time-based reveal: the
  visible average moves with no room/venue row write).
- The client router's segment charset (`[A-Za-z0-9._~-]`) is a superset of the API's
  slug shape (`[A-Za-z0-9-]`) — safe direction: every server-valid slug parses client-side, and
  the server 404 is authoritative for the rest.
- `/route-documents/*.html` requested directly 404s with nginx's bare body, not the designed
  page (they are internal-only locations; cosmetic).

## Deferred (owner decision, not oversight)

- Area landing pages ("halls in {suburb}", one per onboarded area) — with GTM expansion
  (`docs/backlog/reputation-and-launch.md` slice 5).
- Search Console + Bing verification and sitemap submission.
- Google Rich Results Test + share-card scraper/debugger passes — both need a public hostname;
  run at deployment (local JSON-LD schema sanity was verified 2026-08-08).
- Core Web Vitals field measurement on v2 (`npm run build:flat` exists for the Three-vs-flat
  A/B; v1's CLS/preconnect work does not transfer to the map+splash engine).
- `hreflang` — N/A while single-region.
