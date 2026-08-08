# Crawlable listings and clean web routes — build plan

> **Status:** Not started. Execute in order. The adopted behaviour and trade-offs live in
> `design.md`; this file owns sequencing, file-level work and proof.
>
> The working tree may contain unrelated host/inbox changes. Re-read every target before editing,
> preserve overlapping work, and do not use a broad reset. Never read a `.env` file.

## Done means

The slice is complete only when all of these are true together:

- `/space/{venueSlug}/{roomSlug}` returns listing-specific HTML and then opens the same map/room
  experience at the same clean URL.
- The selected venue is centred after a direct route, including when its pin arrives
  asynchronously and on the narrow bottom-sheet layout.
- The initial response contains unique metadata, social tags and safe, parseable JSON-LD.
- Missing/non-public listings and unknown paths return designed HTTP 404 pages.
- Every app-emitted route is hash-free; every old hash route still lands correctly.
- Only `/` and valid listing pages are indexable; private routes never enter the sitemap.
- Root and stripped-prefix deployments both resolve documents, assets, API and media.
- `lastmod` regression coverage proves the current room/venue timestamp implementation.
- Relevant browser harnesses, production-nginx checks and `dotnet test` are green.
- `docs/SEO.md`, `docs/ARCHITECTURE.md`, `docs/contracts/web.md`, `docs/contracts/infra.md`,
  `CLAUDE.md` and `SYSTEM_DESIGN.md` describe what actually shipped.

Search Console/Bing submission, suburb landing pages and Core Web Vitals field work are not part
of done.

## P0 — Freeze the contracts and baseline

**Purpose:** make existing failures and concurrent work visible before route changes touch the
boot path used by nearly every web harness.

1. Re-read the current versions/diffs of:
   - `src/Steeple.Web.v2/src/core/bus.js`, `src/main.js`, `src/core/intent.js`;
   - `src/ui/index.js`, `src/ui/map/index.js`, `src/ui/map/atlas.js`;
   - `src/data/catalog.js`, `src/data/api.js`, `src/ui/deepLink.js`;
   - `index.html`, `vite.config.js`, `nginx.conf`, Dockerfile;
   - `ListingsApiController`, `ListingService`, `RoomRepository`; and
   - every dirty file reported by `git status` that overlaps the list.
2. Capture the pre-change behaviour with a small route matrix at Vite and compose origins:
   room, apply, journal, desk, letter, an unknown hash, an unknown path and the Draft seed room.
3. Run the cheapest current gates before editing:

   ```bash
   npm test --prefix src/Steeple.Web.v2
   npm run build --prefix src/Steeple.Web.v2
   dotnet test --no-restore
   ```

4. Record existing red suites exactly as their headers require; do not reinterpret a known-stale
   assertion as a routing regression.
5. Verify the adopted API-document-rendering row in `SYSTEM_DESIGN.md` §17 still matches the
   implementation; amend it in the same commit if the build discovers a real deviation.

**Exit:** baseline results are recorded, overlapping user work is understood, and the decision
log points to `docs/backlog/seo/design.md`.

## P1 — Render truthful route documents in the API

**Purpose:** make clean document URLs return correct content/status before the SPA starts emitting
them.

### P1.1 Renderer seam

Add `src/Steeple.Api/Services/Seo/`:

- `IWebDocumentRenderer` — accepts public base/prefix plus a `RoomDetailDto` or a listing-not-found
  result; returns a small `{statusCode, html, cachePolicy, robots}` result.
- `WebDocumentRenderer` — owns the complete HTML template, listing description formatter,
  absolute photo resolution, JSON-LD graph and listing not-found document.

Rules:

- Renderer depends on contracts, not EF entities or repositories.
- All visible values and attributes use `HtmlEncoder`.
- JSON-LD and bootstrap JSON use `JsonSerializer`; never concatenate user text into a script.
- Listing facts match `RoomDetailDto`; no derived availability/opening-hours claims.
- Public-base building follows the existing trusted forwarded host/proto/prefix rules used by the
  sitemap. Extract a shared helper rather than fork that logic between controllers.
- Documents emit a prefix-aware `<base>`, `route-handoff.js` URL and `index.html` shell URL.

Register the renderer through the existing API composition extension. No package is needed.

### P1.2 Root document controller

Add `src/Steeple.Api/Controllers/WebDocumentController.cs` with explicit root routes for the table
in `design.md`:

- `/space/{venueSlug}/{roomSlug}` resolves through `IListingService.GetBySlugAsync`;
- optional `/listings/{id:guid}` resolves then permanently redirects to `/space/...`.

Controller requirements:

- Public listing reads use the discovery rate policy.
- Null from the existing discoverability gate returns rendered HTML status 404, not ProblemDetails.
- A matching non-canonical case/trailing slash returns a permanent redirect to the exact canonical.
- API/upstream exceptions continue through normal 5xx handling; never turn them into 404.
- Response `Content-Type` is `text/html; charset=utf-8`.
- Listing and 404 responses use `Cache-Control: no-cache`; non-indexable responses also send
  `X-Robots-Tag`.

### P1.3 Renderer/controller tests

Add focused API tests covering:

- unique title/description/canonical/OG values for a known room;
- no `og:image` and a summary card when there is no photo;
- document-relative `media/...` converted to the public absolute URL;
- correct prefix in base, canonical, handoff and shell URLs;
- church/non-church `containedInPlace` type;
- Offer amount/currency, `availableAtOrFrom`, hourly reference quantity, capacity, amenity-backed
  accessibility facts and optional aggregate rating;
- parseable `@graph` and bootstrap JSON;
- hostile room/venue/description/photo-caption strings containing quotes, `<`, `>`, `&` and
  `</script>` cannot escape their nodes;
- null optional values omitted rather than emitted as empty claims;
- missing/Draft/Unlisted/operator-unlisted/out-of-area all produce the same 404 body/status;
- canonical-case and stable-id redirects; and
- untrusted forwarding headers cannot manufacture a canonical host.

Prefer testing the renderer as a pure service plus a small controller result test. Do not stand up
Postgres for escaping/formatting cases.

**Exit:** direct API listing documents are truthful and fully unit-tested, but no production web
link uses them yet.

## P2 — Join nginx/Vite to the documents and hand off to the Vite shell

**Purpose:** make direct clean routes work through both supported web hosts without adding a
runtime or duplicating Vite's generated asset names.

### P2.1 Fixed application base

Add `<base href="./">` and a root self-canonical resolved through that base near the top of
`src/Steeple.Web.v2/index.html`. Verify from `/` and a stripped prefix that:

- built `./assets/...` references still resolve;
- `api/v1` and `media/...` remain same-origin under the prefix; and
- router initialization resolves the relative base once and writes its absolute prefix path back
  to the element before any `pushState`; and
- changing `history` later does not change `document.baseURI`.

Do this before any client path navigation.

### P2.2 Progressive handoff

Add:

- `public/route-handoff.js` — dependency-free external script implementing SEO-D4;
- `public/route-document.css` — only the semantic listing/static-app/404 documents, using values from
  `DESIGN_SYSTEM.md`; and
- `public/route-documents/app-depth-{1,2,3}.html` — committed noindex boot documents with
  `<base href="./">`, `../` and `../../` respectively; and
- `public/404.html` — static fallback for paths that no route owner recognizes.

The three app documents are one intentionally tiny shape repeated only to make their relative
base correct at the browser's visible route. Add a test that normalizes the base value and proves
the files are otherwise identical. nginx serves them only through internal locations; a direct
`/route-documents/...` request is not a public route. They contain no user or listing data.

The handoff must:

- fetch only the same-origin `data-shell` URL;
- reject a cross-origin shell even if markup is tampered with;
- resolve stylesheet/module/body asset URLs against the shell response URL;
- handle `srcset` entries, not only `src`;
- wait for app styles before swapping the body;
- clone module scripts so parsed inert scripts execute exactly once;
- keep the route document head, `<base>` and bootstrap data;
- remove or mark the fallback body after handoff so duplicate landmarks do not remain;
- leave the semantic document untouched on failure; and
- write at most one concise console error, with no listing/user content.

Do not copy generated asset filenames into C#, nginx or this script.

### P2.3 Production nginx

Update `nginx.conf` with explicit precedence:

1. `/api/`, `/media/`, `/sitemap.xml` and `/assets/` retain their existing owners.
2. Root/public files (`/`, `/index.html`, legal pages, handoff, fallback CSS) stay static.
3. `/space/{venue}/{room}` (and optional `/listings/{id}`) proxy to the API without rewriting.
4. `/browse`, `/venue/...`, `/apply/...`, `/journal`, `/desk...` and `/letter/...` internally
   serve the matching depth-correct static app document with route-specific robots/cache headers.
5. Everything else serves `404.html` with status 404; remove the catch-all
   `try_files ... /index.html` soft-404.

Intercept only listing-upstream 502/503/504 responses and internally serve the depth-three app
document without changing that status. This preserves the existing human fallback when the API is
down while accurately telling crawlers the listing document is temporarily unavailable. Pass
API-rendered 404 responses through unchanged.

Every new HTML location repeats the complete security-header set because nginx `add_header` does
not merge. Forward one canonical client IP, trusted scheme/host and prefix. Keep the current
request-size and abuse ceilings.

Give stable handoff/fallback files `no-cache`; hashed assets remain immutable.

### P2.4 Vite dev and preview parity

Proxy `/space` and optional `/listings` to the API. Preserve the route path and forward host/proto
information so API-rendered local canonicals name the Vite origin. Add a small dev/preview
middleware that serves the same depth-correct static app documents for the other known clean
routes. Unknown paths must be tested separately against production nginx because Vite's own
fallback is not the production 404 authority.

The dev/preview wrapper must also turn a listing-proxy connection failure into the depth-three
static body while retaining its 502 status, matching the production resilience contract.

### P2.5 Handoff harness

Create `tools/seo-route-test.mjs` and first prove only the transport/handoff layer:

- no-JS fetch sees semantic listing HTML;
- browser visit swaps to the ordinary `#ui` shell without redirect or iframe;
- module entry runs once;
- shell fetch or script blocking leaves the semantic document readable;
- direct route loads assets/API from the correct root/prefix;
- API-down `/space/...` keeps a 502/503/504 response while its body can still boot the bundled
  fallback in a browser;
- `/browse` and private clean routes boot while the API is down; and
- compose unknown path is a real 404.

**Exit:** `/space/...` works through Vite and compose and reaches the existing app shell, while the
application still uses its old hash router internally.

## P3 — Replace the hash router with one clean-route seam

**Purpose:** make location and state agree without changing product views.

### P3.1 Router module

Add `src/core/router.js` with no data/UI imports. It owns:

- the route table in `design.md`;
- base-prefix removal/addition using `document.baseURI`;
- strict segment decoding/encoding;
- `location -> {view, venueId, roomId, applicationId}`;
- state -> canonical path;
- `navigate`, `replace`, initial apply and `popstate`;
- known legacy-hash parsing and replacement; and
- route classification (`index`, `noindexFollow`, `private`).

Malformed percent encoding or an invalid segment count is an unknown route, never an exception.
The route grammar must not accept `//`, `.`/`..`, an absolute URL or an extra suffix.

### P3.2 State/history integration

Refactor `bus.js` so it no longer reads/writes `location.hash`. Preserve `setView` as the product
state mutation and make history intent explicit:

- person-initiated navigation pushes;
- initial route, legacy conversion and corrections replace;
- `popstate` mutates state without another write; and
- redraw/store events never touch history.

Update the 74 `setView` call sites by intent, not with a blind replacement. Calls that merely
restore a sheet or apply a server deep link may need replace/no-write semantics; clicks that move
between views push.

### P3.3 Boot and printed-arrival invariants

Update `main.js`, `core/intent.js`, `index.html` and `ui/arrival.js`:

- any non-root clean route counts as a cold product intent;
- the map interface wins the wire and Three is never imported for that boot;
- printed links use clean `/browse` and `/desk` paths resolved against the base;
- a press before the main bundle still survives reload as a real URL;
- once the cinematic owns a press, it prevents native navigation exactly as today; and
- `?world=off` and flat builds keep their current contract.

### P3.4 Deep links and links emitted elsewhere

Update all web producers and docs/tests found by:

```bash
rg -n '#/' src/Steeple.Web.v2 src/Steeple.Api docs/contracts docs/ARCHITECTURE.md CLAUDE.md
```

Do not mechanically rewrite historical `src/Steeple.Web.v2/docs/CONTRACT*.md`; update only living
contracts and add a supersession note where a historical brief intentionally records hashes.

Keep `?goto=` and the path-only notification registry. `ui/deepLink.js` should route through the
new navigation seam rather than construct a second grammar. A listing-approved `/space/...` link
now lands directly as well as through `?goto=`.

### P3.5 Router tests

Add browser/module coverage for:

- every clean route round-trips state -> path -> state;
- every old hash converts via replace while retaining query parameters;
- click navigation adds one history entry;
- Back/Forward restores one prior state without loops;
- reload on every route family restores that view;
- malformed/unknown input reaches the unavailable/browse policy safely;
- base-prefix parsing and formatting; and
- root/flat/live-village boot remains unchanged.

Update affected harness URLs and address-bar assertions. Do not delete legacy-hash test cases;
consolidate them into the compatibility matrix.

**Exit:** the app emits no hashes, existing shared hashes still work, and all view behaviour except
the separately tracked deep-link pan is unchanged.

## P4 — Prime the listing, own metadata and guarantee map centring

**Purpose:** finish the “same behaviour” promise and prevent duplicate work after the document
handoff.

### P4.1 Bootstrap adoption

In `data/catalog.js` (or one tiny adjacent bootstrap reader imported by it):

- find and parse `#steeple-listing-bootstrap` once;
- validate the minimum `RoomDetailDto` fields before accepting it;
- map it through the existing `listingFrom` function;
- `noteListing` before `createDiscovery` asks `knownVenues()`;
- seed the `getListing(venueSlug, roomSlug)` read cache; and
- remove/mark the data block consumed without removing listing JSON-LD.

Malformed data falls back to the normal API read. A valid bootstrap prevents that read. Add a
harness assertion on request counts and the single `listing_viewed` event path.

### P4.2 Route-aware metadata owner

Add `src/ui/metadata.js`, initialized once by `createUI`:

- site defaults for `/`;
- listing title/description/canonical/social/JSON-LD after detail is known;
- canonical `/` + `noindex,follow` for browse;
- `noindex,follow` for venue;
- `noindex,nofollow` with all listing metadata removed for apply/correspondence/desk; and
- unavailable title + noindex for a missing client-side detail.

Owned nodes use `data-steeple-route-meta` and replace atomically. Server and client share tested
format examples so copy cannot silently drift. Do not rely on client metadata for remote scrapers;
the server response remains the authority.

### P4.3 Map centring race

Fix the existing order gap in `ui/map/index.js`/`atlas.js`:

- when `setVenues` adds the marker for `state.venueId`, run the existing current-marker centring;
- if layout coverage changes before the first centre, centre against the settled visible band;
- do not re-pan on unrelated searches, ratings, room changes inside the same venue or redraws;
- allow a deliberate user pan after the initial centre; and
- honour reduced motion.

Add deterministic assertions for:

- seeded venue direct route;
- API-created venue absent from the first search page;
- desktop side panel;
- narrow bottom sheet;
- multiple venues with the same stub-geocoded coordinates (assert selected marker/current id, not
  a guessed pixel); and
- switching rooms within one venue does not repeatedly yank the map.

### P4.4 Missing listing in the live app

Add one designed unavailable component/state using the same copy/actions as the server 404. A
failed client-side room lookup opens it rather than silently leaving an empty map. It removes
listing metadata and marks noindex. Do not force a reload just to manufacture a status code; the
next direct request already has the correct 404 contract.

**Exit:** direct and internal listing routes open one room, one panel and one correctly centred
venue with one detail/view read.

## P5 — Canonical, sitemap and crawl-policy proof

**Purpose:** ensure crawlers are shown one coherent URL set.

1. Add/extend `RoomRepositoryTests` to prove sitemap rows:
   - include only Published, non-operator-unlisted rooms inside the served bounds;
   - order deterministically;
   - carry the later of `Room.UpdatedAtUtc` and `Venue.UpdatedAtUtc`.
   Thread `IGeofencePolicy.Bounds` through the service/repository sitemap query rather than
   hardcoding NoVA or teaching the persistence adapter about product configuration.
2. Add manage/admin regression tests where coverage is missing so public room edits, photo changes,
   publication/unlisting and public venue edits stamp the timestamp their sitemap row uses.
3. Add controller tests for sitemap XML:
   - absolute prefix-aware URLs;
   - `/` plus `/space/...` only;
   - no fragments, `/apply`, journal, desk, letter, Draft or duplicate route;
   - `lastmod` in the existing date format.
4. Verify `robots.txt` still names the root sitemap and does not attempt to secure private routes.
5. Fetch a canonical listing and assert that sitemap loc, `<link rel=canonical>`, `og:url`, Offer
   URL and Breadcrumb room URL are byte-for-byte identical.
6. Update the stale `lastmod` caveat in `docs/SEO.md`; no schema changeset belongs here because
   room/venue timestamps already exist in the current tree.

**Exit:** sitemap, documents and client links name one canonical family and timestamp it from
existing as-built fields.

## P6 — Full verification and documentation closeout

### P6.1 Automated verification

Run:

```bash
npm test --prefix src/Steeple.Web.v2
npm run build --prefix src/Steeple.Web.v2
npm run build:flat --prefix src/Steeple.Web.v2
dotnet test
```

Then run every web harness whose header supports the current real-API setup, with special focus on:

- `seo-route-test.mjs` (new);
- `hardening-test.mjs`;
- `boot-priority-test.mjs`;
- `world-off-test.mjs`;
- `discovery-test.mjs` and `map-test.mjs`;
- `guest-test.mjs`, `input-test.mjs`, `account-test.mjs`;
- correspondence/payment/notification deep-link suites; and
- host/desk suites.

Use each suite's documented flags and one API per run. Preserve documented known-stale sets unless
the route change legitimately replaces their assertion; explain every changed expectation.

### P6.2 Production-stack route matrix

Against `http://localhost:8080`, verify with raw HTTP and a real browser:

| Case | Expected |
|---|---|
| `/` | 200 static site document |
| valid `/space/v/r` | 200 listing HTML; browser becomes map + room |
| Draft/missing `/space/v/r` | 404 HTML, noindex, no leak |
| `/apply/v/r` | 200 noindex generic doc; browser becomes composer |
| `/journal`, `/desk`, `/letter/id` | 200 noindex generic doc; existing auth/product behaviour |
| old `/#/...` shapes | 200 root then clean replace, correct state |
| `/definitely-not-a-route` | 404 static HTML, never app shell |
| `/assets/missing.js` | 404, unchanged |
| `/sitemap.xml`, `/robots.txt` | 200 correct content types and canonical locs |

Repeat the valid listing/app/asset/API/media cases through a stripped-prefix proxy. A header-only
unit test is insufficient for this acceptance criterion.

### P6.3 Manual content checks

- View source, not only DevTools DOM: title, description, canonical, OG/Twitter, JSON-LD and
  visible listing content must already be present.
- Parse extracted JSON-LD with `System.Text.Json`/`json.tool` and run a representative page through
  Google's Rich Results Test when network access is available. Fix errors; document warnings that
  do not apply to `Place`.
- Test share-card output with at least one scraper/debugger after deployment configuration has a
  public hostname.
- Navigate listing -> apply -> back -> another listing -> back/forward; confirm one history step
  per action and no stale title/canonical.
- Disable JavaScript and confirm the listing and 404 pages remain comprehensible and keyboard
  navigable.
- Throttle/block `index.html` during handoff and confirm fallback content remains.

### P6.4 Owning-document updates

In the shipping commit:

- mark completed items in `docs/SEO.md` and retain the explicit Search Console/area/CWV deferrals;
- update `docs/ARCHITECTURE.md` with document routing, handoff and nginx status behaviour;
- update `docs/contracts/web.md` from hash routes to the clean route/history/boot contract;
- update `docs/contracts/infra.md` deep-link and sub-path truth;
- update `CLAUDE.md` boot, route and harness guidance;
- finalize the §17 decision-log row in `SYSTEM_DESIGN.md`;
- prune this build plan to a dated completion/history stub; and
- keep `docs/backlog/seo-crawlable-listings.md` as a short pointer or delete it once no external
  reference remains.

Search Console/Bing and suburb landing pages stay open by owner decision, not accidentally marked
done.

**Exit:** all acceptance criteria in `design.md` are evidenced, as-built docs match code, and no
known route or private state depends on a fragment.

## Rollout and rollback

This is assembled in stages but released, not A/B tested:

1. Land/test API documents and edge proxying without changing emitted client links.
2. Land/test clean client routing, bootstrap adoption and map centring.
3. Deploy P1–P4 together. The existing sitemap already advertises `/space/...`, so production
   must never receive the intermediate state where that URL hands off to an app that cannot parse
   its pathname.
4. Keep hash parsing indefinitely; it is the rollback/compatibility path.

A runtime feature flag does not own canonical routing: emitting two URL families would create the
duplicate SEO state this work removes, and the public route must work for crawlers before client
flags load. Rollback changes newly emitted links back to hashes while leaving `/space/...`
documents valid; it does not remove or redirect the canonical URLs already shared/indexed.

## Risks to watch during implementation

| Risk | Guard |
|---|---|
| Relative assets/API resolve under `/space/...` | fixed `<base>` + prefix browser test before History routing |
| API renderer and client copy drift | one table of golden formatting examples exercised in both test suites |
| direct route counts two listing reads/views | bootstrap primes existing catalog cache; request-count assertion |
| semantic fallback flashes before map styles | handoff loads app CSS before body swap; fallback is presentable, not blank |
| parsed shell scripts execute twice/not at all | parsed scripts remain inert; append one fresh module node; harness counter |
| map centres before marker exists | retry existing `setCurrent` when current marker enters atlas |
| Back creates loops | popstate applies state under no-write guard |
| private content leaks into initial HTML/cache | generic document has no user data; no-store + noindex; auth remains API-side |
| 404 hides an outage | only a successful null lookup becomes 404; exceptions remain 5xx |
| user text breaks HTML/JSON-LD | framework encoders + hostile-string tests |
| nginx location loses CSP or prefix | repeat full header set; compose + stripped-prefix raw-header tests |
| full suite churn from hundreds of hash literals | route helper in fixtures; preserve a small explicit legacy matrix |
