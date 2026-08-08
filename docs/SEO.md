# Steeple — SEO plan

> **Reminder doc.** The web surface is a primary **demand-side cold-start lever** (PRD:
> install-free, shareable discovery — and, since the equal-front-doors decision, applying
> and hosting too, not a read-only funnel). Organic search is how a "Maria" who has never
> heard of Steeple finds a nearby hall — so the web funnel must be properly SEO'd, not an
> afterthought. This is the running checklist; nothing here is built yet unless marked ✅.
>
> **Migration status (2026-08-05) — read the marks carefully.** Every ✅ below was earned by
> **web v1's server-rendered Razor pages**, which are deprecated and no longer deployed.
> Active **web v2 is client-rendered** (Vite SPA, hash routes, nginx `try_files … /index.html`).
> Items are re-marked **✅ v1 (retired) / 🔲 v2**: the v1 notes stay as the specification of
> what to rebuild.
>
> **The floor landed 2026-08-07 (D9, build plan P5 task 5).** v2 now serves
> `robots.txt` (static, `src/Steeple.Web.v2/public/`), a real `sitemap.xml` rendered by the API
> (`GET /api/v1/sitemap.xml` — same rows as the JSON `sitemap`, absolute URLs derived from the
> forwarded request) and aliased at the edge by `nginx.conf`, and site-level `og:*`/`twitter:*`
> tags plus a `WebSite` JSON-LD block on `index.html`. Still absent, by decision rather than by
> oversight: **per-listing** metadata, OG images, `Place`/`BreadcrumbList` JSON-LD, canonicals,
> id→slug 301s and real 404s — all of which need per-URL rendered HTML, which is the item below.

## The crawler-rendering decision (D9) — adopted, not yet built

**Serve real HTML for `/space/{venueSlug}/{roomSlug}` from the API, then progressively open the
existing map product at that same clean URL.** The map opens the room sheet and centres its venue;
without JavaScript, the semantic listing document remains useful. This supersedes the earlier
standalone-landing-page proposal: the SEO document and the product are two stages of one URL, not
two destinations. The API already holds everything the renderer needs (`ListingService`,
`RoomDetailDto`, photos, price, geo), so this adds no runtime, headless browser or vendor. The
adopted architecture and execution order live in `docs/backlog/seo/design.md` and
`docs/backlog/seo/build_plan.md`.

Rejected, with reasons:

- **Prerender-for-bot-UA at nginx** (a headless-Chrome service, self-hosted or rented): the most
  faithful output and the most moving parts — a second runtime to keep alive inside a ~$100/mo
  ceiling, UA sniffing that has to be maintained, and a cloaking posture to defend. Not worth it
  for five listings.
- **A meta-injection layer in front of the SPA:** cheaper than prerender but it reintroduces a
  BFF — the very thing v2's nginx-and-static-bundle shape removed. If a server has to exist for
  listing URLs anyway, the API is already that server.
- **Accept the degradation:** honest, and wrong for this product. Share-driven discovery is the
  PRD's demand thesis, and a shared listing that unfurls as the generic app title is the loop
  failing at its first link.

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
### 1. `sitemap.xml` (dynamic) — ✅ v1 (retired) / ✅ v2 *(2026-08-07)*
- **v2 today:** `GET /api/v1/sitemap.xml` (`ListingsApiController.SitemapXml`) renders the same
  rows the JSON `sitemap` returns as sitemaps.org XML: the home page plus every published
  listing's `/space/{venue}/{room}` URL with `lastmod`/`changefreq`/`priority`, cached an hour.
  Absolute URLs come from the forwarded request (`X-Forwarded-Proto`/`-Host`/`-Prefix`), so one
  API serves whatever origin and stripped prefix it sits behind with no new configuration.
  `nginx.conf` aliases `/sitemap.xml` onto it, which is where `robots.txt` points.
- v1 implementation, kept as the spec:
- Served at `/sitemap.xml` by `Steeple.Web/Controllers/SeoController.cs` (`Sitemap` action):
  home page + every published listing's canonical `/space/{venue}/{room}` URL, `<changefreq>`/
  `<priority>`, `ResponseCache`-d for an hour.
- `<lastmod>` is the later of the room's and venue's existing `UpdatedAtUtc`; manage/Admin writes
  stamp those records. The SEO build plan adds regression coverage and removes remaining stale
  documentation rather than adding another schema change.
- Not done: sitemap index (moot below 50k URLs) and Search Console/Bing submission — see item 9.

### 2. `robots.txt` — ✅ v1 (retired) / ✅ v2 *(2026-08-07)*
- **v2 today:** `src/Steeple.Web.v2/public/robots.txt`, copied verbatim into the bundle by Vite
  and served as a real file. It allows everything and names the sitemap: v1's disallow rules
  were about its faceted `/search` URLs and its id→slug redirects, and this app has neither.
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

### 5. Open Graph + Twitter cards — ✅ v1 (retired) / ⚠️ v2 site-level only *(2026-08-07)*
- **v2 today:** `index.html` carries `og:type`/`og:site_name`/`og:title`/`og:description` and
  `twitter:card=summary` + title/description, so a link to Steeple unfurls as Steeple. There is
  no `og:image` and no `og:url`, because both would be lies at the app level: the image would be
  one listing's photograph standing for all of them, and the URL is not knowable in a bundle
  deployable at either `/` or a stripped prefix. **Per-listing** cards — the ones the acquisition
  loop actually needs — wait on the rendering decision above.
- `og:title`, `og:description`, `og:image` (primary listing photo via `ViewData["OgImage"]`),
  `og:url`, `og:type`, `og:site_name`, and `twitter:card` (`summary_large_image` when an image is
  set, else `summary`) + `twitter:title`/`description`/`image` — all in `_Layout.cshtml`, sourced
  from the same per-page ViewData the canonical/description tags use.

### 6. Structured data — JSON-LD — ✅ v1 (retired) / ⚠️ v2 site-level only (biggest local-SEO lever)
- **v2 today:** one static `WebSite` block on `index.html` (2026-08-07). The `Place` +
  `BreadcrumbList` per listing — which is where the local-SEO value is — needs per-URL rendered
  HTML; the v1 shape below is the spec to re-emit once v2 can serve it.
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
~~robots.txt~~ ✅ · ~~dynamic sitemap.xml~~ ✅ · ~~site-level OG/Twitter~~ ✅ ·
per-listing meta description · per-listing OG/Twitter · image width/height for CLS · JSON-LD on
listing pages. On v1 these were view/controller additions over server-rendered pages; on a
client-rendered v2 the remaining ones are blocked on the D9 rendering decision above
(`docs/backlog/seo/`).
Still open regardless of surface: area landing pages (item 7) and Search Console/Bing submission
(item 9); both are explicitly deferred from the clean-route/listing-document build.
