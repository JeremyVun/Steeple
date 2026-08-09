# Crawlable listings and clean web routes — build plan (completed 2026-08-08)

> **Status: executed to completion, 2026-08-08.** This file is the dated history stub the
> plan required of itself; the full phase-by-phase work orders it contained are superseded by
> what shipped. `design.md` beside it remains the rationale of record (SEO-D1…D12);
> `docs/contracts/seo.md` is the as-built crawler contract; `docs/contracts/web.md`,
> `docs/ARCHITECTURE.md`, `docs/contracts/infra.md` and `CLAUDE.md` carry the surface truths.

## How it landed

Six sequenced build agents, one adversarial review, two fix rounds — all phases in the
planned order, in one shared working tree:

- **P0** — baseline: all gates green; the soft-404 recorded (every path served the same
  7,281-byte shell at 200).
- **P1** — API document layer: `Services/Seo/` renderer + `WebDocumentController`
  (`/space/{v}/{r}` → 200/301/404), `IPublicBaseResolver` (`Seo:PublicBaseUrl`; the
  forwarded-header sitemap helper deleted), `documents` rate policy (240/min/IP), 46 tests.
- **P2** — edge join: `<base href="./">`, `route-handoff.js` (parse-inert shell fetch,
  execute-once, style-before-swap, honest failure), depth-correct `noindex` boot documents,
  static `404.html`, nginx precedence with status-preserving 502/503/504 fallback, Vite
  dev/preview parity, `tools/seo-route-test.mjs` (97 checks).
- **P3** — router: `src/core/router.js` (grammar, base freeze, legacy-hash matrix,
  push/replace/popstate intent), `bus.js` off `location.hash` (69 call sites by intent),
  both boot readers taught the pathname, printed links → clean paths, the `syncHash`
  query-drop bug fixed, 16 suites updated, `router-test`/`route-test` added.
- **P4** — product completion: bootstrap adoption in `catalog.js` (one read, one
  `listing_viewed`, non-provisional venue), `ui/metadata.js` + `metaText.js` +
  `tests/fixtures/seo-formats.json` golden table, the three atlas centring defects fixed,
  `ui/unavailable.js`, `listing-test`/`metadata-test` added. Two design defects caught by
  hostile screenshot review and fixed (dangling breadcrumb, void under the unavailable CTA).
- **P5** — crawl-policy proof: sitemap bounds threaded (`GetPublishedForSitemapAsync(BoundingBox)`,
  inclusive edges), the two missing `lastmod` stamps (availability saves, Admin rating
  hide/unhide), sitemap XML tests, loc ≡ canonical ≡ og:url ≡ Offer.url ≡ breadcrumb proven
  byte-identical, `docs/contracts/seo.md` gaps flipped. All new guards proven to bite.
- **Adversarial review (Fable)** — every named invariant held under live attack (hostile-text
  injection through real DB rows, grammar disagreements, status honesty, prefix contract,
  header poisoning, privacy). Two real defects found and fixed in a follow-up round:
  `robots.txt`'s relative `Sitemap:` line (now API-rendered and absolute; static file
  deleted) and the never-consumed `X-Forwarded-Prefix` forwarding (deleted; a latched
  warning now names `Seo:PublicBaseUrl` when a prefix arrives unconfigured).
- **P6** — independent verification sweep: every gate and harness green or in its documented
  stale set (pre-existing reds proven identical at HEAD); the full production route matrix
  including a browser-driven stripped-prefix pass; manual no-JS/JSON-LD/history checks. Its
  findings (duplicate head on `index.html`-shell boots, compose `Seo__PublicBaseUrl`
  passthrough, a settle-window harness flake) fixed and re-proven.

Final state: `dotnet test` 492 + 115; `npm test` green; `seo-route-test` 97/97;
`listing-test` 34/34; `hardening-test` 66/66; `boot-priority-test` green at `/` and `?q=low`.

## Deviations from the written plan (each recorded where it lives)

- `robots.txt` became API-rendered (review finding; the plan assumed the static file stood).
- `AggregateRating` attaches to the venue node, not the room (the DTO's rating is
  venue-level); `addressCountry: "US"` is a commented constant; coordinates appear in
  JSON-LD only, never visible copy.
- The 404 document carries no handoff script (design §5's lifecycle, kept deliberately).
- P4.2's "canonical `/` for browse" plan line was corrected to design SEO-D7's no-canonical.
- The client router's segment charset is a deliberate superset of the API slug shape.

## Still open (owner decisions, in `docs/contracts/seo.md` / `reputation-and-launch.md`)

- Search Console/Bing submission; share-card scraper + Rich Results passes (need a public
  hostname); suburb landing pages; CWV field work.
- Deployment prerequisite: set `SEO_PUBLIC_BASE_URL` in production compose.
- `index.html`'s site description still reads "Five real listings, explored as one
  continuous scene" — now false; site copy was out of the slice's scope and awaits the owner.
