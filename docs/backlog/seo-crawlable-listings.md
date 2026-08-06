# Crawlable listing pages (the D9 rendering decision, scoped)

**Status:** 🔲 not started. **Owns:** the half of `docs/SEO.md` that the v2 migration's
floor deliberately left undone — per-listing metadata, OG cards with the listing's own
photograph, `Place`/`BreadcrumbList` JSON-LD, canonicals, id→slug 301s, real 404s.

## Why this exists

Web v2 is a static bundle behind nginx with hash routes, so there is exactly one document
and one set of tags for the whole app. The migration landed the site-level floor
(`robots.txt`, `sitemap.xml`, site OG + `WebSite` JSON-LD — build plan P5 task 5) and stopped
there on purpose: everything else on the SEO checklist needs **HTML that differs per URL**,
which is a rendering decision, not a tag.

The PRD's demand thesis is share-driven discovery. A shared listing link that unfurls as the
generic app title is that loop failing at its first hop, and a listing page a crawler cannot
read is a hyperlocal query Steeple cannot win. This is load-bearing work, not polish.

## The shape recommended in SEO.md

Serve real HTML for **one URL family** — `/space/{venueSlug}/{roomSlug}` — from the API, and
route that family to the API at the edge instead of to the SPA shell.

- The API already holds everything the page needs (`ListingService` → `RoomDetailDto`: photos,
  price, capacity, geo, amenities, house rules), so this is a renderer over existing data.
- One document for everybody — humans get the same page and it links straight into the app
  (`#/apply/{venueSlug}/{roomSlug}`), so there is no UA sniffing and no cloaking posture.
- No new runtime, no headless browser, no vendor, nothing new to keep alive.

Alternatives and why they lost: prerender-for-bot-UA (a second runtime and a maintained UA
list inside a ~$100/mo ceiling); a meta-injection layer in front of the SPA (reintroduces the
BFF v2's shape removed — if a server must exist, the API is already it); accepting the
degradation (honest, and wrong for a share-driven product). Full reasoning: `docs/SEO.md`.

## Sketch of the work

1. **Decide where the renderer lives.** The API serving HTML is a deviation worth logging in
   `SYSTEM_DESIGN.md` §17 — an alternative is a tiny separate deployable that calls the API,
   which costs a container to keep the API purely JSON. Pick one, record why.
2. **The page:** title, meta description built from venue/room facts, canonical, `og:*` +
   `twitter:card=summary_large_image` with the room's primary photo, `Place` + `offers` +
   `BreadcrumbList` JSON-LD (v1's `Views/Discovery/Detail.cshtml` is the spec — it was built
   and validated once already), and a visible, useful page for the person who lands on it.
3. **Edge routing:** `/space/…` to the renderer; the SPA keeps everything else. (The
   `/sitemap.xml` alias already landed with the floor — `nginx.conf`, 2026-08-07.)
4. **Status truth:** unknown listing → 404 (not the SPA shell); `/listings/{id}` → 301 to the
   slug URL.
5. **`lastmod` accuracy** (SEO.md item 1's open caveat): `rooms` has no `UpdatedAtUtc`, so
   sitemap `lastmod` is the row's creation time. A changeset + threading it through is the fix.
6. **Then item 9:** Search Console + Bing verification and sitemap submission.

## Not in scope here

Area landing pages (SEO.md item 7) and Core Web Vitals re-measurement (item 8) are their own
work and do not block this.
