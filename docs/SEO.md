# Steeple — SEO plan

> **Reminder doc.** The consumer web funnel is a primary **demand-side cold-start lever** (PRD:
> install-free, shareable, read-only discovery). Organic search is how a "Maria" who has never
> heard of Steeple finds a nearby hall — so the web funnel must be properly SEO'd, not an
> afterthought. This is the running checklist; nothing here is built yet unless marked ✅.

## Why SEO is load-bearing here
- The PRD's open question is **demand awareness**. Ranking for hyperlocal intent
  ("church hall hire near me", "affordable community space {suburb}", "cheap room hire {town}")
  is one of the few channels that creates awareness without paid spend — fits the lean ethos.
- Listing pages are **shareable URLs** (`/space/{venue}/{room}`); shares + crawlable pages
  compound. Every concierge-onboarded church is a new indexable page in a tight geo.
- We lead **community-first** — content angles ("welcoming halls in {suburb}",
  "affordable space for playgroups") that commercial competitors don't target.

## Current state (what the SSR/HTMX choice already buys us)
- ✅ **Server-rendered HTML** (Razor + HTMX, no SPA) — fully crawlable, no JS-rendering gap.
  This is a real SEO advantage of the HTMX decision over a React funnel.
- ✅ **Clean canonical URLs** for listings (`/space/{venueSlug}/{roomSlug}`).
- ✅ `/listings/{id}` **301-redirects** to the canonical slug URL (consolidates link equity).
- ✅ Proper **404 status** for unknown listings (no soft-404s).
- ✅ Per-page `<title>` set; system fonts (no render-blocking web-font fetch).

## To build
### 1. `sitemap.xml` (dynamic) — ✅
- Served at `/sitemap.xml` by `Steeple.Web/Controllers/SeoController.cs` (`Sitemap` action):
  home page + every published listing's canonical `/space/{venue}/{room}` URL, `<changefreq>`/
  `<priority>`, `ResponseCache`-d for an hour.
- **Caveat still open:** `<lastmod>` is sourced from `Steeple.Web.Models.SitemapEntry.LastModifiedUtc`,
  which the API currently populates from the listing's row-created time — it won't move on edits
  until an `UpdatedAtUtc` column is added to `rooms` and threaded through. Not done.
- Not done: sitemap index (moot below 50k URLs) and Search Console/Bing submission — see item 9.

### 2. `robots.txt` — ✅
- Served at `/robots.txt` by `Steeple.Web/Controllers/SeoController.cs` (`Robots` action):
  disallows `/search` (faceted crawl-trap) and `/listings/` (id URLs that only 301 to the slug
  URL), references `/sitemap.xml`. Sub-path aware (prefixes disallow rules with `PathBase`).
- There's no separate admin host in this repo yet to disallow (Admin is a distinct project/port).

### 3. Canonicalisation & indexability rules — ✅
- `<link rel="canonical">` emitted per-page from `ViewData["Canonical"]` in
  `Views/Shared/_Layout.cshtml`; set per-route in `Steeple.Web/Controllers/DiscoveryController.cs`
  (listing detail → its own slug URL; non-HTMX `/search` → canonical `/`).
- Filtered `/search` (non-HTMX) responses get `<meta name="robots" content="noindex,follow">` via
  `ViewData["Robots"]` (`DiscoveryController.Results`).
- `/listings/{id}` 301-redirects to the canonical slug URL (`DiscoveryController.DetailById`),
  building the `Location` off the route so the reverse-proxy `PathBase` is preserved.
- Host/trailing-slash policy is a proxy-layer concern (out of `Steeple.Web` scope) — not done here.

### 4. Per-page metadata — ✅
- Unique `<meta name="description">` per listing built from venue/room facts (capacity, price,
  suburb) by `DiscoveryController.BuildListingDescription`, rendered via `ViewData["Description"]`
  in `_Layout.cshtml`. Home/search pages also set a contextual description.
- Title: `ViewData["Title"]` (room/page name) composed with `" · {Brand.Name}"` in `_Layout.cshtml`.

### 5. Open Graph + Twitter cards — ✅ (high value: the funnel is share-driven)
- `og:title`, `og:description`, `og:image` (primary listing photo via `ViewData["OgImage"]`),
  `og:url`, `og:type`, `og:site_name`, and `twitter:card` (`summary_large_image` when an image is
  set, else `summary`) + `twitter:title`/`description`/`image` — all in `_Layout.cshtml`, sourced
  from the same per-page ViewData the canonical/description tags use.

### 6. Structured data — JSON-LD — ✅ (biggest local-SEO lever)
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

### 8. Core Web Vitals / performance — ✅ (app-level items)
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

## Quick wins (cheap, can do alongside the next slice)
✅ robots.txt · ✅ dynamic sitemap.xml · ✅ per-listing meta description · ✅ OG/Twitter tags ·
✅ image width/height for CLS · ✅ JSON-LD on listing pages. All shipped as view/controller
additions over the existing SSR pages. Remaining leverage: area landing pages (item 7) and the
operational Search Console/Bing submission + sitemap `lastmod` accuracy (item 9 / item 1 caveat).
