# Steeple — SEO plan

> **Reminder doc.** The consumer web funnel is a primary **demand-side cold-start lever** (PRD:
> install-free, shareable, read-only discovery). Organic search is how a "Maria" who has never
> heard of Steeple finds a nearby hall — so the web funnel must be properly SEO'd, not an
> afterthought. This is the running checklist; nothing here is built yet unless marked ✅.

## Why SEO is load-bearing here
- The PRD's open question is **demand awareness**. Ranking for hyperlocal intent
  ("church hall hire near me", "free community space {suburb}", "cheap room hire {town}")
  is one of the few channels that creates awareness without paid spend — fits the lean ethos.
- Listing pages are **shareable URLs** (`/space/{venue}/{room}`); shares + crawlable pages
  compound. Every concierge-onboarded church is a new indexable page in a tight geo.
- We lead **community-first / free-first** — content angles ("free halls in {suburb}") that
  commercial competitors don't target.

## Current state (what the SSR/HTMX choice already buys us)
- ✅ **Server-rendered HTML** (Razor + HTMX, no SPA) — fully crawlable, no JS-rendering gap.
  This is a real SEO advantage of the HTMX decision over a React funnel.
- ✅ **Clean canonical URLs** for listings (`/space/{venueSlug}/{roomSlug}`).
- ✅ `/listings/{id}` **301-redirects** to the canonical slug URL (consolidates link equity).
- ✅ Proper **404 status** for unknown listings (no soft-404s).
- ✅ Per-page `<title>` set; system fonts (no render-blocking web-font fetch).

## To build
### 1. `sitemap.xml` (dynamic) — 🔲
- Generate from the DB: all **Published** listing pages + key landing pages, with `<lastmod>`
  from a listing `UpdatedAtUtc` (add this column), sensible `<changefreq>`/`<priority>`.
- Serve at `/sitemap.xml` (controller action, cached, regenerated on listing change).
- Move to a **sitemap index** if it ever exceeds 50k URLs / 50 MB (won't for a while).
- Submit in Google Search Console + Bing Webmaster Tools.

### 2. `robots.txt` — 🔲
- Allow the discovery home + all `/space/...` listing pages.
- **Disallow `/search`** and any faceted/filter query URLs — filter combinations are an
  infinite crawl-trap and duplicate content. (We already render full pages for shared
  `/search` URLs, but they should be `noindex` + disallowed for crawl, canonical → `/`.)
- Disallow the future admin host entirely.
- Reference the sitemap.

### 3. Canonicalisation & indexability rules — 🔲
- `<link rel="canonical">` on every listing → its own slug URL.
- Filtered `/search` responses: `<meta name="robots" content="noindex,follow">` + canonical → `/`.
- One consistent host (apex vs www) + trailing-slash policy, enforced at the proxy.

### 4. Per-page metadata — 🔲
- Unique `<meta name="description">` per listing, generated from venue/room (capacity, free/price,
  activities, suburb) — currently the description is generic in `_Layout`.
- Title pattern: `"{Room} at {Venue}, {Suburb} · Steeple"`.

### 5. Open Graph + Twitter cards — 🔲 (high value: the funnel is share-driven)
- `og:title`, `og:description`, `og:image` (primary listing photo), `og:url`, `og:type`,
  `twitter:card=summary_large_image`. Makes every shared listing a rich preview.

### 6. Structured data — JSON-LD — 🔲 (biggest local-SEO lever)
- Each listing: `Place` / `CivicStructure` (or `Product`+`Offer` when priced) with
  `address` (PostalAddress), `geo` (GeoCoordinates), `maximumAttendeeCapacity`,
  `amenityFeature` (LocationFeatureSpecification per amenity/accessibility flag),
  `photo`, `isAccessibleForFree` / price, `url`.
- Venue: `Organization` / `PlaceOfWorship` (for churches) with NAP.
- `BreadcrumbList` for the breadcrumb. Validate with Google's Rich Results Test.

### 7. Area landing pages — 🔲 (as GTM expands)
- Indexable `"Community & church halls in {Suburb}"` pages aggregating local listings —
  strong match for "{suburb} hall hire" intent and a natural fit for the suburb-by-suburb
  beachhead strategy. One per onboarded area.

### 8. Core Web Vitals / performance — 🔲
- **Set explicit width/height (or aspect-ratio) on all images** to kill CLS (the gallery +
  card images currently have none — a measurable layout-shift hit and a ranking signal).
- `preconnect`/`dns-prefetch` to the image origin (DO Spaces CDN); long cache headers on
  static assets; gzip/brotli at the proxy. SSR already keeps LCP/TBT low.

### 9. Operational — 🔲
- Search Console + Bing Webmaster verification; submit sitemap; monitor Coverage/Enhancements.
- `hreflang`: N/A while single-region (note for later multi-region — which the PRD defers anyway).

## Quick wins (cheap, can do alongside the next slice)
robots.txt · dynamic sitemap.xml · per-listing meta description · OG/Twitter tags ·
image width/height for CLS · JSON-LD on listing pages. These are mostly view/controller
additions over the existing SSR pages — low risk, high local-SEO leverage.
