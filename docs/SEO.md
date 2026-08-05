# Steeple — SEO plan

> **Reminder doc.** The web surface is a primary **demand-side cold-start lever** (PRD:
> install-free, shareable discovery — and, since the equal-front-doors decision, applying
> and hosting too, not a read-only funnel). Organic search is how a "Maria" who has never
> heard of Steeple finds a nearby hall — so the web funnel must be properly SEO'd, not an
> afterthought. This is the running checklist; nothing here is built yet unless marked ✅.
>
> **Migration status (2026-08-05) — read the marks carefully.** Every ✅ below was earned by
> **web v1's server-rendered Razor pages**, which are deprecated and no longer deployed.
> Active **web v2 is client-rendered** (Vite SPA, hash routes, nginx `try_files … /index.html`),
> so as of today it serves: one static `<title>` + `<meta description>` on `index.html`, **no**
> per-listing metadata, **no** OG/Twitter tags, **no** JSON-LD, **no** canonicals, **no**
> `robots.txt`, **no** `sitemap.xml`, **no** 301s, and **no real 404s** (every unknown path
> returns the SPA shell — soft-404 across the board). Items are therefore re-marked
> **✅ v1 (retired) / 🔲 v2**: the v1 notes stay as the specification of what to rebuild.
> **Re-verification and the crawler-rendering decision** (prerender for bot UAs vs. a
> meta-injection layer vs. accepting degradation) are owned by
> `docs/backlog/v2_migration/` — decision D9, build plan Phase 5 — not by this file.
> The API's `GET /api/v1/sitemap` (data source) still exists; nothing on v2 renders it.

## Why SEO is load-bearing here
- The PRD's open question is **demand awareness**. Ranking for hyperlocal intent
  ("church hall hire near me", "affordable community space {suburb}", "cheap room hire {town}")
  is one of the few channels that creates awareness without paid spend — fits the lean ethos.
- Listing pages are **shareable URLs** (`/space/{venue}/{room}`); shares + crawlable pages
  compound. Every concierge-onboarded church is a new indexable page in a tight geo.
- We lead **community-first** — content angles ("welcoming halls in {suburb}",
  "affordable space for playgroups") that commercial competitors don't target.

## Current state (what v1's SSR bought us — and what v2 gives back)
- ✅ v1 (retired) / 🔲 v2 — **Server-rendered HTML** (Razor + HTMX, no SPA) — fully crawlable,
  no JS-rendering gap. v2 reintroduces exactly the JS-rendering gap this avoided; that trade
  was made knowingly for the product surface, and D9 owns the mitigation.
- ✅ v1 (retired) / 🔲 v2 — **Clean canonical URLs** for listings (`/space/{venueSlug}/{roomSlug}`).
  v2 addresses listings by **hash route**, which crawlers do not treat as distinct URLs.
- ✅ v1 (retired) / 🔲 v2 — `/listings/{id}` **301-redirects** to the canonical slug URL.
- ✅ v1 (retired) / 🔲 v2 — Proper **404 status** for unknown listings. v2's nginx returns the
  SPA shell with 200 for every unmatched path — soft-404s everywhere.
- ✅ v1 (retired) / ⚠️ v2 — Per-page `<title>`; system fonts (no render-blocking web-font
  fetch). v2 has **one** static title/description for the whole app, not per page.

## To build
### 1. `sitemap.xml` (dynamic) — ✅ v1 (retired) / 🔲 v2
- **v2 today:** nothing is served at `/sitemap.xml`. The data source survives —
  `GET /api/v1/sitemap` (`ListingsApiController`) — so the rebuild is a renderer, not a query.
- v1 implementation, kept as the spec:
- Served at `/sitemap.xml` by `Steeple.Web/Controllers/SeoController.cs` (`Sitemap` action):
  home page + every published listing's canonical `/space/{venue}/{room}` URL, `<changefreq>`/
  `<priority>`, `ResponseCache`-d for an hour.
- **Caveat still open:** `<lastmod>` is sourced from `Steeple.Web.Models.SitemapEntry.LastModifiedUtc`,
  which the API currently populates from the listing's row-created time — it won't move on edits
  until an `UpdatedAtUtc` column is added to `rooms` and threaded through. Not done.
- Not done: sitemap index (moot below 50k URLs) and Search Console/Bing submission — see item 9.

### 2. `robots.txt` — ✅ v1 (retired) / 🔲 v2
- **v2 today:** no `robots.txt` at all (no `public/` directory, no nginx rule) — a request for
  it falls through to the SPA shell with a 200. This is the cheapest item to put right and the
  build plan's "minimum floor" for launch.
- v1 implementation, kept as the spec:
- Served at `/robots.txt` by `Steeple.Web/Controllers/SeoController.cs` (`Robots` action):
  disallows `/search` (faceted crawl-trap) and `/listings/` (id URLs that only 301 to the slug
  URL), references `/sitemap.xml`. Sub-path aware (prefixes disallow rules with `PathBase`).
- There's no separate admin host in this repo yet to disallow (Admin is a distinct project/port).

### 3. Canonicalisation & indexability rules — ✅ v1 (retired) / 🔲 v2
- **v2 today:** no `<link rel="canonical">`, no per-route robots meta, no id→slug 301s.
  Depends on v2 having crawlable non-hash listing URLs at all (D9).
- `<link rel="canonical">` emitted per-page from `ViewData["Canonical"]` in
  `Views/Shared/_Layout.cshtml`; set per-route in `Steeple.Web/Controllers/DiscoveryController.cs`
  (listing detail → its own slug URL; non-HTMX `/search` → canonical `/`).
- Filtered `/search` (non-HTMX) responses get `<meta name="robots" content="noindex,follow">` via
  `ViewData["Robots"]` (`DiscoveryController.Results`).
- `/listings/{id}` 301-redirects to the canonical slug URL (`DiscoveryController.DetailById`),
  building the `Location` off the route so the reverse-proxy `PathBase` is preserved.
- Host/trailing-slash policy is a proxy-layer concern (out of `Steeple.Web` scope) — not done here.

### 4. Per-page metadata — ✅ v1 (retired) / 🔲 v2
- **v2 today:** a single hardcoded `<title>`/`<meta description>` in `index.html` for every
  route. Client-side `document.title` updates would help users and share previews not at all
  (crawlers/scrapers read the served HTML) — hence the D9 rendering decision.
- Unique `<meta name="description">` per listing built from venue/room facts (capacity, price,
  suburb) by `DiscoveryController.BuildListingDescription`, rendered via `ViewData["Description"]`
  in `_Layout.cshtml`. Home/search pages also set a contextual description.
- Title: `ViewData["Title"]` (room/page name) composed with `" · {Brand.Name}"` in `_Layout.cshtml`.

### 5. Open Graph + Twitter cards — ✅ v1 (retired) / 🔲 v2 (highest-value gap: sharing is the acquisition loop)
- **v2 today:** none. A shared listing link currently unfurls as the generic app title/description
  with no image — directly against the PRD's share-driven demand thesis.
- `og:title`, `og:description`, `og:image` (primary listing photo via `ViewData["OgImage"]`),
  `og:url`, `og:type`, `og:site_name`, and `twitter:card` (`summary_large_image` when an image is
  set, else `summary`) + `twitter:title`/`description`/`image` — all in `_Layout.cshtml`, sourced
  from the same per-page ViewData the canonical/description tags use.

### 6. Structured data — JSON-LD — ✅ v1 (retired) / 🔲 v2 (biggest local-SEO lever)
- **v2 today:** no `ld+json` anywhere. The v1 shape below is the spec to re-emit once v2 can
  serve per-listing HTML.
- `Views/Discovery/Detail.cshtml` emits two `application/ld+json` blocks, serialized with
  `System.Text.Json` (not string concatenation) into `Html.Raw`:
  - A `Place` for the room: `name`, `description`, `url` (canonical), `address` (`PostalAddress`),
    `geo` (`GeoCoordinates`), `maximumAttendeeCapacity`, `photo` (array), `amenityFeature`
    (`LocationFeatureSpecification` per amenity *and* accessibility flag, humanized).
    `containedInPlace` is `PlaceOfWorship` when the venue's `venueType` is `church`, else
    `Place`. Every room emits an `offers` (`Offer` + `UnitPriceSpecification` with
    `price`/`priceCurrency`) — prices are required product-wide.
  - A `BreadcrumbList` (Home → Venue → Room).
  - Validated by round-tripping the extracted `<script>` contents through `json.tool` —
    see verification below.

### 7. Area landing pages — 🔲 (as GTM expands)
- Indexable `"Community & church halls in {Suburb}"` pages aggregating local listings —
  strong match for "{suburb} hall hire" intent and a natural fit for the suburb-by-suburb
  beachhead strategy. One per onboarded area. Not started.

### 8. Core Web Vitals / performance — ✅ v1 (retired) / 🔲 v2 (needs re-measuring, not re-porting)
- **v2 today:** unmeasured. Different engine entirely — a Three.js splash and a Leaflet map
  dominate the loading picture, so v1's CLS/preconnect work below doesn't transfer; v2 needs its
  own field pass (the flat, no-Three build `npm run build:flat` exists precisely for this A/B).
- **Explicit image dimensions (CLS):** listing-card photos (`Views/Discovery/_RoomCard.cshtml`)
  and detail-page gallery photos (`Views/Discovery/Detail.cshtml`) carry `width="1200"
  height="800"` attributes; `wwwroot/css/site.css` also reserves the box via CSS `aspect-ratio`
  on the containers (`.card-photo` 4/3, `.gallery-primary`/`.gallery-placeholder` 16/10) with
  `object-fit: cover` on the `<img>` so the crop is preserved either way — belt and suspenders
  against layout shift.
- **`preconnect`/`dns-prefetch` to the image origin:** `SteepleControllerBase.SetPreconnectOrigins`
  derives up to 2 distinct scheme+host origins from the page's actual photo URLs (dynamic, not
  hardcoded — legacy seeded rooms still serve picsum.photos, provider-uploaded photos now serve
  from DO Spaces/CDN or the dev local-disk fallback per `ARCHITECTURE.md`'s Media module; the
  dynamic derivation covers all of them without a code change), stashed in
  `ViewData["PreconnectOrigins"]` and emitted as `<link rel="preconnect">` +
  `<link rel="dns-prefetch">` in `_Layout.cshtml`. Wired on the discovery home/search pages and
  the listing detail page.
- Long cache headers on static assets and gzip/brotli compression are **edge-proxy concerns**
  (Caddy in front of Web/Admin per `ARCHITECTURE.md`), not something `Steeple.Web` itself sets —
  intentionally left to the deployed edge, not done in-app.

### 9. Operational — 🔲
- Search Console + Bing Webmaster verification; submit sitemap; monitor Coverage/Enhancements.
- `hreflang`: N/A while single-region (note for later multi-region — which the PRD defers anyway).

## Quick wins — all of these were shipped on v1 and must be re-earned on v2
robots.txt · dynamic sitemap.xml · per-listing meta description · OG/Twitter tags ·
image width/height for CLS · JSON-LD on listing pages. On v1 these were view/controller
additions over server-rendered pages; on a client-rendered v2 they are blocked on the D9
rendering decision, **except** `robots.txt` + a sitemap route, which are static-file work and
are the floor the migration commits to at launch (v2_migration build plan Phase 5).
Still open regardless of surface: area landing pages (item 7), Search Console/Bing submission
and sitemap `lastmod` accuracy (item 9 / item 1 caveat).
