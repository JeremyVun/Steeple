# CONTRACTS — SEO / crawler surface

> Owns the crawler-facing policy of the web surface: `robots.txt`, sitemap policy and
> `lastmod` truth, clean web routes, listing documents, site metadata/JSON-LD, and which URL
> families are indexable. The sitemap *wire* endpoints belong to `discovery.md`. The clean-route
> listing-document build shipped 2026-08-08; its durable design decisions and as-built contract
> are consolidated here. The former `docs/SEO.md` was dissolved the same day.

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
- **SEO-D12 — `sitemap.xml` is the readable listing set.** `GET /api/v1/sitemap.xml` (wire shape:
  `discovery.md`), aliased at the
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

### Public base and sub-path deployment

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

- **SEO-D3 — `/space/{venueSlug}/{roomSlug}` is the public identity of a listing.** The API
  renders the initial document outside `/api/v1` (`WebDocumentController` → `IWebDocumentRenderer`,
  `src/Steeple.Api/Services/Seo/`): semantic listing HTML with per-listing
  title/description/canonical, OG/Twitter cards (photo when one exists; summary card when not),
  a `WebSite` + `Place` + `Offer` + `BreadcrumbList` `@graph`, the public `RoomDetailDto` as an
  inert `#steeple-listing-bootstrap` JSON block, and a same-origin `route-handoff.js` that
  progressively swaps in the Vite shell at the same URL. nginx proxies only this route (and
  `/sitemap.xml`/`/robots.txt`) to the API; every other clean app route is a static `noindex`
  boot document, so ordinary app boot keeps zero API dependency. Rate policy `documents`
  (240/min per IP) — sized for a full-sitemap crawl, separate from the SPA's `discovery` budget.
- **SEO-D10 — 404 is a transport fact and a designed state.** Unknown, Draft, Unlisted,
  operator-unlisted and out-of-area rooms return one
  byte-identical designed 404 (`X-Robots-Tag: noindex`, no reason leak). A listing-renderer
  outage keeps its 502/503/504 (nginx serves the static boot body under the same status — a
  human can still boot the app, a crawler sees a temporary failure, never a false 200/404).
  Unknown paths are a designed static 404, never the shell at 200.
- **SEO-D9 — Canonicalization is strict.** Lower-case slugs, no trailing slash, no query in
  canonicals; non-canonical spellings 301 to the exact canonical (query string carried, since it
  holds the visual-experiment flags). No `/listings/{id}` family exists.
- **SEO-D11 — Index policy is enforced at both layers.** Only `/` and valid `/space/...` are
  indexable. Browse/venue are `noindex,follow`; apply/journal/desk/letter `noindex,nofollow` +
  `no-store`.
  The client (`src/ui/metadata.js` + `metaText.js`) mirrors the same policy and copy in-session —
  all owned head nodes carry `data-steeple-route-meta` and replace atomically (`index.html`'s
  printed head twins are marked too, so no boot path leaves a duplicate canonical). The shared
  golden table `tests/fixtures/seo-formats.json` pins server and client copy together.
- **SEO-D2 — Old `#/…` links are compatibility entrances, never canonicals.** They are converted
  client-side by one `replaceState`, with the query preserved, and are never emitted anew. Keep
  compatibility until external traffic proves the old links are dead.
- Prior art: web v1's retired server-rendered pages (`src/Steeple.Web.v1`
  `Views/Discovery/Detail.cshtml`, `SeoController`) earned all of this once; the 2026-08-08
  build supersedes them.

## Clean-route application contract

### SEO-D1 — History routes are the one browser-location grammar

`src/Steeple.Web.v2/src/core/router.js` is the only translator between browser locations and
product state. `setView` remains the state transition; routing is an adapter around it, not a
second state machine.

| Product state | Web-v2 route | Index policy |
|---|---|---|
| title | `/` | index |
| browse/map | `/browse` | noindex, follow; no canonical |
| venue sheet | `/venue/{venueSlug}` | noindex, follow; no canonical |
| room sheet | `/space/{venueSlug}/{roomSlug}` | index |
| apply composer | `/apply/{venueSlug}/{roomSlug}` | noindex, nofollow |
| guest inbox | `/journal` | noindex, nofollow |
| host desk | `/desk[/{venueSlug}]` | noindex, nofollow |
| application letter | `/letter/{applicationId}` | noindex, nofollow |

Search/filter state and visual-experiment parameters remain query parameters or in-memory state;
they do not create indexable URL families. Person-initiated navigation uses `pushState`; initial
normalization, redirects and state corrections use `replaceState`; `popstate` applies Back/Forward
without writing another entry. Route application is re-entrancy guarded.

Legacy hashes normalize as follows, preserving the query string:

| Legacy entrance | Clean replacement |
|---|---|
| `/#/browse`, `/#/village` | `/browse` |
| `/#/venue/{venue}` | `/venue/{venue}` |
| `/#/room/{venue}/{room}` | `/space/{venue}/{room}` |
| `/#/apply/{venue}/{room}` | `/apply/{venue}/{room}` |
| `/#/journal` | `/journal` |
| `/#/desk[/{venue}]` | `/desk[/{venue}]` |
| `/#/letter/{application}` | `/letter/{application}` |

### SEO-D4 — Route documents progressively hand off to the Vite shell

The API does not know Vite's hashed assets. Stable `public/route-handoff.js` reads the
prefix-aware application base and shell URL, fetches and inertly parses `index.html`, resolves its
asset URLs against the shell URL, loads styles before swapping the body, then appends fresh module
scripts so the normal entry executes. It preserves the route document's authoritative head,
listing metadata and bootstrap data. There is no redirect, iframe, UA sniffing, crawler-only
response or headless-rendering service.

`index.html` uses `<base href="./">`; the router freezes its resolved absolute pathname before any
history write. API-rendered documents emit an explicit prefix-aware `<base>`. A cold clean-route
visit pays one extra same-origin shell fetch; root visits and in-app navigation do not. If the
handoff fails, semantic listing content and ordinary links remain usable.

### SEO-D5 — The listing document primes the normal catalog

The document embeds the public `RoomDetailDto` verbatim as HTML-safe inert JSON:

```html
<script id="steeple-listing-bootstrap" type="application/json">...</script>
```

The catalog consumes it once through the same `listingFrom` mapping as API responses and primes
the normal listing and venue caches before UI construction. Bundled seed data must not overwrite
it. The room opens without a duplicate detail request, and `listing_viewed` is emitted once by the
server-side listing read. Malformed bootstrap JSON falls back to the normal public detail read.

### SEO-D6 — A clean listing route opens the existing map product

A non-root route is product intent. A cold listing route skips the title/Three.js boot, releases
product reads immediately, opens the room sheet and centres the venue in the map area not covered
by the desktop side panel or mobile bottom sheet. A marker that arrives after selection must retry
the same centring path; reduced-motion mode moves immediately. Do not introduce a second camera
implementation or centre on guessed coordinates.

### SEO-D7 — Server metadata is authoritative; the client keeps it correct in-session

The listing document emits:

- title `{Room} at {Venue}, {Suburb} · Steeple`;
- a length-bounded, whitespace-normalized factual description using room, venue, suburb, capacity
  and hourly price;
- an absolute self-canonical with no query;
- `og:type`, `og:site_name`, `og:title`, `og:description`, `og:url` and the primary public photo;
- matching Twitter summary-large-image fields when a photo exists, otherwise a summary card; and
- `robots=index,follow`.

Every material metadata fact is visible in the semantic body. User text is encoded. In-session
navigation updates the title and all `data-steeple-route-meta` head nodes atomically using the same
formatting rules as the server; it removes stale listing JSON-LD and never accumulates duplicate
canonicals. The shared `tests/fixtures/seo-formats.json` table pins client and server copy.

### SEO-D8 — JSON-LD describes the real room and nothing more

The API serializes one `application/ld+json` `@graph` containing:

- Steeple as `WebSite`;
- the room as `Place`, with public description, canonical URL, images, `PostalAddress`,
  `GeoCoordinates` and `maximumAttendeeCapacity`;
- amenities and physical-accessibility facts as `LocationFeatureSpecification` values under
  `amenityFeature`;
- its venue as `containedInPlace`, typed `PlaceOfWorship` for a church and `Place` otherwise;
- an hourly `Offer` with stored amount/currency and a one-hour `UnitPriceSpecification`
  (`unitCode: HUR`, `unitText: hour`);
- `AggregateRating` only when the public summary exists and its count is positive; and
- `BreadcrumbList` containing Steeple and the room, not the deliberately noindex venue route.

Room availability is not business opening time and must not appear as `openingHours`. Do not emit
claims absent from `RoomDetailDto`, raw camelCase amenity tokens, or empty optional values. JSON is
framework-serialized with HTML-safe encoding, never assembled by concatenation.

## Delivery, ownership and failure contract

| Concern | Owner |
|---|---|
| Route grammar, history and legacy hashes | `src/Steeple.Web.v2/src/core/router.js` |
| Product state | `src/Steeple.Web.v2/src/core/bus.js` |
| Discoverability lookup | `IListingService` |
| Listing HTML, metadata, JSON-LD, robots and listing 404 | `src/Steeple.Api/Services/Seo/` |
| Root-level web documents | `src/Steeple.Api/Controllers/WebDocumentController.cs` |
| Static noindex route documents and 404 | `src/Steeple.Web.v2/public/` |
| Route proxying, security headers and unknown-path 404 | `src/Steeple.Web.v2/nginx.conf` |
| Dev/preview route parity | `src/Steeple.Web.v2/vite.config.js` |
| Progressive shell handoff | `src/Steeple.Web.v2/public/route-handoff.js` |
| Bootstrap adoption | `src/Steeple.Web.v2/src/data/catalog.js` |
| In-session head state | `src/Steeple.Web.v2/src/ui/metadata.js` |
| Map centring | `src/Steeple.Web.v2/src/ui/map/index.js`, `atlas.js` |
| Sitemap rows | `IRoomRepository.GetPublishedForSitemapAsync` |
| Canonical origin and prefix | `Seo:PublicBaseUrl`, resolved by `IPublicBaseResolver` |

The renderer accepts `RoomDetailDto` and resolved public-base information. It does not query EF,
know nginx, or duplicate listing visibility rules.

### Cache policy

| Response | Policy |
|---|---|
| valid listing HTML | `no-cache` |
| static public app document | `no-cache` |
| static private app document | `no-store` |
| listing 404 | `no-cache` |
| hashed Vite assets | one-year immutable |
| `route-handoff.js`, fallback CSS | `no-cache` while filenames remain stable |
| `robots.txt`, `sitemap.xml` | 1 hour |

### Security and privacy

- The API uses the existing Published, non-operator-unlisted, in-area discoverability gate.
- HTML values are encoded; JSON-LD and bootstrap blocks use the framework's HTML-safe serializer.
- Bootstrap data is exactly the already-public DTO: no tokens, session data, unpublished listings
  or manager-only fields. Its optional public venue contact email remains public by contract.
- CSP remains external-script-only; the two JSON script types are inert data.
- Exact address and coordinates remain public for current public-facing venues. Any future
  visibility mode must change the DTO, semantic HTML and JSON-LD together; CSS hiding is invalid.
- Route parameters are bounded and validated; unknown input is encoded in logs and not reflected.
- Private route documents contain no private data. Authorization, not `robots.txt`, protects it.

### Required failure behavior

| Failure | Required behavior |
|---|---|
| listing is not discoverable | indistinguishable semantic 404; no canonical, JSON-LD or reason leak |
| listing renderer is unavailable | static handoff body with original 502/503/504 preserved |
| handoff or shell fetch fails | semantic listing remains usable; at most one quiet console error |
| JavaScript is disabled | semantic listing and ordinary links work |
| bootstrap JSON is malformed | ignore it and perform the normal public detail read |
| client detail becomes 404 | designed unavailable state and `noindex` |
| image is absent | no `og:image`; summary card and reserved visual placeholder |
| image URL is relative | resolve it against the configured public base |
| legacy hash is unknown | fall back to browse with `noindex` |
| clean path is unknown | designed static 404, never `index.html` with 200 |

### Verification surfaces

`SitemapXmlTests`, `PublicBaseResolverTests`, `WebDocumentRendererTests` and
`WebDocumentControllerTests` pin the server contract. Web harnesses `router-test.mjs`,
`route-test.mjs`, `seo-route-test.mjs`, `listing-test.mjs` and `metadata-test.mjs` pin clean
routing, transport/handoff, bootstrap behavior and metadata parity. The production route matrix
must also pass at root and under a stripped prefix.

## Recorded gaps (accepted 2026-08-08, not oversights)

- **Malformed bootstrap JSON double-counts `listing_viewed`**: the degraded path (client ignores
  a bad bootstrap and performs the normal detail read) emits a second server-side event. This is
  accepted degraded behavior; the happy path is single-count and harness-asserted.
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
