# Crawlable listings and clean web routes — design

> **Status:** Adopted 2026-08-08; not built. This replaces
> `docs/backlog/seo-crawlable-listings.md` as the implementation source of truth for the
> unfinished web-v2 work in `docs/SEO.md`. `build_plan.md` beside this file is the execution
> order.
>
> **Product decision:** a canonical listing URL opens the existing map product, with that room's
> sheet open and the map centred on its venue. It is not a separate SEO landing page. The server
> supplies a truthful listing document first; JavaScript progressively replaces its body with the
> existing Vite application at the same URL.

## 1. Outcome

This URL becomes the public identity of a listing:

```text
https://<host>[/<prefix>]/space/{venueSlug}/{roomSlug}
```

A direct visit has two honest outcomes:

- With JavaScript, the current product-first boot opens the map, opens the named room, and pans
  the venue into the visible map area. The URL never gains a `#`.
- Without JavaScript, the response remains a useful listing page with the room's name, venue,
  locality, photograph, description, capacity, price, amenities and an apply link.

The same response carries the listing's title, description, canonical, social-card tags and
JSON-LD. Unknown, unpublished, operator-unlisted and out-of-area rooms return a designed HTML
page with HTTP 404. Private application/account routes remain usable but are excluded from search.

## 2. Why the current shape fails

Today `/#/room/dunn-loring-umc/art-studio` works because the browser requests only `/`, then
`src/core/bus.js` interprets the fragment and calls `setView('room', ...)`. The server never sees
the fragment. Every room therefore starts from the same `index.html`, `<title>`, description and
site-level social tags. nginx also falls back to that document with status 200 for every unknown
path.

The room name shown in the sheet is already unique UI content. It is not a unique HTTP document:
social scrapers do not run the application, a fragment is not a canonical page, and the server
cannot return a listing-specific status before JavaScript runs.

Changing only the address-bar syntax would make the URL prettier, not finish SEO. This design
changes both layers:

```text
request path -> truthful HTTP document/status -> existing SPA state -> existing map UI
```

## 3. Goals and non-goals

### Goals

- Remove hashes from every web-v2 route the product emits.
- Make `/space/{venueSlug}/{roomSlug}` the one canonical, sitemap and share URL.
- Preserve the current map-first experience and product-first/no-Three cold boot.
- Render per-listing metadata and structured data in the initial HTTP response.
- Return real HTTP status codes for direct listing requests and unknown paths.
- Keep old hash links working without creating duplicate canonicals.
- Preserve root and stripped-prefix deployment from one web build.
- Add no new service, vendor or browser-facing API dependency.

### Non-goals

- Server-rendering Leaflet, the room sheet or the whole SPA.
- Indexing browse filters, venue sheets, applications, inbox, letters or the host desk.
- Changing listing slugs or putting a street address in the URL.
- Changing the public-address policy. Exact address and coordinates remain deliberate public
  marketplace data under `docs/contracts/discovery.md`.
- Search Console/Bing submission and suburb landing pages; both are explicitly deferred.
- A Core Web Vitals programme. This work must avoid obvious regressions, but field measurement is
  deferred.
- Removing the deprecated web-v1 reference implementation.

## 4. Decisions

### SEO-D1 — Clean routes use the History API; the fragment router retires

`src/core/router.js` becomes the one translator between browser locations and product state.
`setView` remains the state transition; routing is an adapter around it, not a second state
machine.

| Product state | Canonical web-v2 route | Index policy |
|---|---|---|
| title | `/` | index |
| browse/map | `/browse` | noindex, follow; canonical `/` |
| venue sheet | `/venue/{venueSlug}` | noindex, follow |
| room sheet | `/space/{venueSlug}/{roomSlug}` | index |
| apply composer | `/apply/{venueSlug}/{roomSlug}` | noindex, nofollow |
| guest inbox | `/journal` | noindex, nofollow |
| host desk | `/desk[/{venueSlug}]` | noindex, nofollow |
| application letter | `/letter/{applicationId}` | noindex, nofollow |

Search/filter state and the existing visual experiment parameters remain query parameters or
in-memory state as they are today. They do not create indexable URL families in this slice.

Navigation initiated by a person uses `history.pushState`. Initial normalization, redirects and
state corrections use `replaceState`. `popstate` applies browser Back/Forward without writing a
second history entry. A route application must be re-entrancy guarded so `popstate -> setView ->
route write` cannot loop.

### SEO-D2 — Old hash links are compatibility entrances, never canonicals

On first boot, the router recognizes every existing shape and replaces it in place while
preserving the query string:

| Legacy | Replacement |
|---|---|
| `/#/browse` or `/#/village` | `/browse` |
| `/#/venue/{venue}` | `/venue/{venue}` |
| `/#/room/{venue}/{room}` | `/space/{venue}/{room}` |
| `/#/apply/{venue}/{room}` | `/apply/{venue}/{room}` |
| `/#/journal` | `/journal` |
| `/#/desk[/{venue}]` | `/desk[/{venue}]` |
| `/#/letter/{application}` | `/letter/{application}` |

No HTTP redirect can see a fragment, so this conversion is necessarily client-side. It uses
`replaceState`, leaving no duplicate entry in browser history. New HTML, notifications and UI
links emit only clean paths. Hash support can be removed only after external traffic proves the
old links are dead; there is no deadline in this plan.

### SEO-D3 — The API renders listing documents; nginx remains the web host

nginx continues to serve the Vite bundle and proxy `/api` and `/media`. It proxies only the
data-dependent `/space/{venueSlug}/{roomSlug}` document route to a new root-level API controller.
This is an intentional exception to “the API is JSON”: the API already has the discoverability
rules and `RoomDetailDto`, so it is the only existing process that can produce a correct listing
response and status without another runtime.

The controller returns a **listing document**: semantic public content, complete
metadata/JSON-LD, public boot data and the route-handoff script. The other known clean app routes
use tiny static generic documents containing “Opening Steeple”, `noindex`, no user data and the
same handoff script. Their depth-correct relative base points to the deployment root. This keeps
ordinary app boot independent of API availability while avoiding a second copy of generated
Vite asset names.

The controller is outside `/api/v1`; it is a web document endpoint, not a new JSON wire contract.
It calls existing services and adds no persistence access from the Web bundle. nginx applies the
same CSP and security headers to API-rendered and static route documents.

If the listing renderer is unavailable, nginx internally serves the depth-correct static generic
document while preserving the upstream 502/503/504 status. A human browser can still hand off to
the app and use its existing bundled-catalog fallback; a crawler sees a temporary server failure,
never a false 200 or 404.

Unknown paths do not fall through to the SPA. After explicit static-file and known-route
locations, nginx returns the static designed 404 with status 404.

### SEO-D4 — Route documents progressively hand off to the existing Vite shell

The API does not copy or know Vite's hashed asset names. A small stable file in `public/`,
`route-handoff.js`, performs the bridge:

1. Read the prefix-aware application base and shell URL from data attributes emitted by the
   route document.
2. Fetch that deployment's `index.html` from the same origin.
3. Parse it without executing its scripts.
4. Resolve its stylesheet, module, image and `srcset` URLs against the fetched shell URL.
5. Load the application styles; once ready, replace the route document's body with the Vite
   shell body.
6. Append fresh module-script elements so the normal entry executes.

The route document's head remains. Listing metadata and boot JSON therefore survive the body
handoff; generic site metadata is not copied over them. If any handoff step fails, a semantic
listing stays readable and its apply/browse links still work; a generic document remains an
honest loading/failure state. There is no redirect, iframe, headless browser, UA sniffing or
crawler-only response.

`index.html` gains `<base href="./">`. Before its first history write, the router resolves that
value against the root document and replaces it with the resulting absolute pathname; a relative
`<base>` alone may be re-resolved after `pushState` and is not a sufficient invariant. A root-loaded
app therefore keeps its asset and document-relative `api/v1` base fixed when the visible path
changes. API-rendered route documents emit an explicit prefix-aware `<base
href="/<prefix>/">`. This preserves the existing one-build root/sub-path contract.

The extra `index.html` fetch occurs only on a cold clean-route visit. Root visits still receive
the existing static document directly, and client-side navigation after boot performs no document
request.

### SEO-D5 — The listing response primes the catalog

The listing document embeds the public `RoomDetailDto` as inert JSON:

```html
<script id="steeple-listing-bootstrap" type="application/json">...</script>
```

`System.Text.Json` produces the payload with its default HTML-safe encoder. The client catalog
consumes it once before UI construction, runs it through the same `listingFrom` mapping used for
API responses, and primes the normal listing/venue caches. It is not a second DTO shape.

This has three effects:

- the map knows the venue before it creates its pins;
- the room panel does not wait for or repeat the detail request; and
- `listing_viewed` is emitted once by the server-side `IListingService` read, rather than once for
  the document and again for client hydration.

Bundled seed data must never overwrite a server-bootstrapped listing. After the value is consumed,
normal cache invalidation and live reads behave exactly as they do today.

### SEO-D6 — The clean listing route boots into the same map experience

A non-root pathname is a product intent, just as a non-empty hash is today. A cold clean route:

- skips the title and Three.js village boot;
- releases product reads immediately;
- applies the route after the interface can receive it;
- opens the room sheet; and
- centres the venue in the visible map band.

The current `atlas.setCurrent` already knows how to pan while accounting for the mobile sheet.
The gap is ordering: a deep-linked venue can arrive after `setCurrent` first runs, and adding the
marker does not retry the centring. The fix must make “marker became available while current”
call the same centring path. It must not add a second camera implementation or centre by guessed
coordinates.

On desktop, the venue lands in the map area not covered by the side panel. On narrow layouts it
lands in the band above the bottom sheet. Reduced-motion mode makes the move immediate.

### SEO-D7 — Server metadata is authoritative; the client keeps it correct in-session

The listing document emits:

- title: `{Room} at {Venue}, {Suburb} · Steeple`;
- a factual description using room, venue, suburb, capacity and hourly price;
- an absolute self-canonical `/space/{venueSlug}/{roomSlug}`;
- `og:type`, `og:site_name`, `og:title`, `og:description`, `og:url` and the primary photograph;
- Twitter summary-large-image equivalents when a photograph exists;
- absolute, publicly resolvable image URLs; and
- `robots=index,follow`.

The body visibly contains every material fact used in metadata or structured data. Descriptions
are length-bounded and whitespace-normalized; user text is HTML-encoded, never interpolated raw.

The static root document carries a deployment-relative self-canonical (`href="./"` after its
fixed base), so the same build resolves correctly at `/` and at a stripped prefix. Browse keeps
that root canonical and is `noindex,follow`; private routes have no canonical.

Client navigation does not make another HTTP document request, so `src/ui/metadata.js` updates
the browser title and marked head elements when state changes. It uses the same formatting rules
as the server. Remote scrapers still get the correct metadata because sharing the resulting URL
causes a fresh server request. Private routes replace the listing head with `noindex,nofollow`
and remove listing JSON-LD.

All owned head nodes carry `data-steeple-route-meta`; updates replace that set atomically rather
than accumulate duplicate canonicals or JSON-LD blocks.

### SEO-D8 — JSON-LD describes the real room and nothing more

The server emits one `application/ld+json` block with an `@graph` containing:

- `WebSite` for Steeple;
- a room [`Place`](https://schema.org/Place) with name, description, canonical URL, images, exact
  public `PostalAddress`, `GeoCoordinates` and `maximumAttendeeCapacity`;
- amenities and physical-accessibility facts represented as `amenityFeature` entries whose values
  are `LocationFeatureSpecification` nodes; do not misuse `accessibilityFeature` (media/content
  accessibility) or `isAccessibleForFree` (free admission) for wheelchair access;
- `containedInPlace`, typed `PlaceOfWorship` for a church venue and `Place` otherwise;
- an hourly [`Offer`](https://schema.org/Offer) connected to the room through
  `availableAtOrFrom`, plus `UnitPriceSpecification` using the stored amount/currency and a
  one-hour `referenceQuantity` (`unitCode: HUR`, `unitText: hour`);
- `AggregateRating` only when the public rating summary is non-null and count is positive; and
- `BreadcrumbList`: Steeple -> `{Room} at {Venue}`. Do not invent a crawlable venue breadcrumb
  until venue pages themselves have truthful server documents; Google breadcrumb items should
  not point at the deliberately noindex client-only venue route.

Room availability is not business opening hours and is not emitted as `openingHours`. Host-entered
claims absent from the public contract are not invented. Empty optional values are omitted.

JSON is serialized, not assembled with string concatenation. Tests include hostile text containing
quotes, angle brackets and `</script>` and prove the script cannot be escaped.

### SEO-D9 — Canonicalization is strict

- The sitemap, internal listing links, social tags and JSON-LD all name `/space/{venue}/{room}`.
- Upper-case or otherwise non-canonical slug spellings that resolve are permanently redirected
  to the DTO's lower-case slugs.
- A trailing slash redirects to the no-trailing-slash form.
- Query parameters never enter the canonical.
- A public `/listings/{roomId}` compatibility endpoint may resolve by stable id and 301 to the
  slug pair; it never renders duplicate content.
- `/room/...` is not introduced as a second clean route. Only the old hash grammar uses “room”.

Venue and room slugs remain stable after creation. A later slug-renaming feature would need an
alias table and redirects; it is not part of this work.

### SEO-D10 — 404 is a transport fact and a designed state

For a direct `/space/...` request, the API uses the same discoverability gate as public detail
reads. Unknown, Draft, Unlisted, operator-unlisted and out-of-geofence rooms are indistinguishable:

```http
HTTP/1.1 404 Not Found
Content-Type: text/html; charset=utf-8
X-Robots-Tag: noindex
```

The page says the space is unavailable, offers “Browse spaces” and “Steeple home”, and reveals no
moderation or geofence reason. It carries no canonical and no listing JSON-LD. An API outage is a
502/503/504 and must not be misreported as “not found”.

An in-app navigation can discover a stale listing only after the current document already returned
200; JavaScript cannot change that past response status. It renders the same not-found content and
marks the document `noindex`. A direct visit or refresh to that URL returns the real 404, which is
the crawler and sharing contract.

### SEO-D11 — Index policy is enforced at both document and application layers

Only `/` and valid `/space/...` documents are indexable in this slice. Static generic route
documents receive `X-Robots-Tag: noindex` at their nginx locations before JavaScript. The client
repeats the matching robots meta after handoff. Private pages are absent from the sitemap and from
structured data.

`robots.txt` is not used to protect private content: blocking a crawler does not make a URL secret.
Authorization remains the boundary for inbox, letters and desk data, and generic route documents
contain none of that data.

### SEO-D12 — Sitemap discovery is already present; timestamp truth is verified, not redesigned

`GET /api/v1/sitemap.xml` already emits `/space/{venueSlug}/{roomSlug}` for Published,
non-operator-unlisted rooms, and nginx already exposes it at `/sitemap.xml`. The build must add
the discoverability gate's in-area predicate to the sitemap repository/service path so a manually
inserted or legacy out-of-area Published row cannot advertise a URL that correctly returns 404.

The current tree also already stores `Room.UpdatedAtUtc` and `Venue.UpdatedAtUtc`, stamps them on
managed changes, and emits the later value as `lastmod`. This design therefore requires regression
coverage and stale documentation cleanup, not a new schema changeset. The listing document avoids
time-sensitive availability content that those timestamps do not own.

## 5. Request lifecycles

### Direct canonical listing

```text
GET /space/dunn-loring-umc/art-studio
  -> nginx proxies the known document route
  -> API resolves the published RoomDetail
  -> 200 semantic listing HTML + metadata + JSON-LD + bootstrap JSON
  -> route-handoff.js fetches /index.html
  -> existing Vite shell replaces the body
  -> clean router applies room state without writing the URL
  -> bootstrap primes catalog before the map builds
  -> map + room sheet open; venue pans into view
```

### Internal listing navigation

```text
result click
  -> navigate('room', slugs)
  -> history.pushState('/space/...')
  -> existing catalog/detail path supplies the room
  -> metadata owner updates the head
  -> map + room sheet open and centre
```

No document request occurs until refresh/share/open-in-new-tab, when the first lifecycle applies.

### Missing listing

```text
GET /space/known-looking/missing
  -> API discoverability lookup returns null
  -> 404 semantic not-found HTML, no bootstrap, no canonical, no handoff
```

### Legacy shared link

```text
GET /#/room/dunn-loring-umc/art-studio  (server receives GET /)
  -> static Vite shell
  -> router parses the legacy fragment
  -> replaceState('/space/dunn-loring-umc/art-studio')
  -> existing client detail read
  -> same map + sheet + centre
```

## 6. Component ownership

| Concern | Owner |
|---|---|
| Route grammar, parsing, formatting, history and legacy hashes | `src/Steeple.Web.v2/src/core/router.js` |
| Product state | existing `src/core/bus.js` |
| Listing lookup/discoverability | existing `IListingService` |
| Listing HTML, metadata, JSON-LD and listing 404 rendering | new `src/Steeple.Api/Services/Seo/` |
| Root-level listing document endpoints | new `src/Steeple.Api/Controllers/WebDocumentController.cs` |
| Static noindex app documents | new depth-correct files under `src/Steeple.Web.v2/public/` |
| Listing proxy, static app routing, unknown-path 404 and security headers | `src/Steeple.Web.v2/nginx.conf` |
| Dev/preview document-route parity | `src/Steeple.Web.v2/vite.config.js` |
| Progressive shell handoff | new `src/Steeple.Web.v2/public/route-handoff.js` |
| No-JS listing/404 presentation | new scoped public stylesheet; tokens copied from `DESIGN_SYSTEM.md` |
| Bootstrap adoption | `src/Steeple.Web.v2/src/data/catalog.js` |
| In-session head state | new `src/Steeple.Web.v2/src/ui/metadata.js` |
| Map centring | existing `src/ui/map/index.js` + `atlas.js` |
| Sitemap source | existing `IRoomRepository.GetPublishedForSitemapAsync` |

The API renderer accepts `RoomDetailDto` and public-base information. It does not query EF, know
nginx, or duplicate listing visibility rules.

## 7. Sub-path and forwarding contract

At `https://example.com/steeple/space/v/r`, Caddy strips `/steeple` before nginx and sends the
trusted prefix. nginx forwards one canonical scheme, host and prefix to the API. The renderer
therefore emits:

```html
<base href="/steeple/">
<link rel="canonical" href="https://example.com/steeple/space/v/r">
<script src="/steeple/route-handoff.js" data-shell="/steeple/index.html" defer></script>
```

The client router freezes and derives its base from `document.baseURI`; it never hardcodes `/`.
Route parsing removes only that base prefix. Route formatting adds it exactly once. API and media
requests stay document-relative and therefore continue to resolve under the prefix.

Forwarded host/proto/prefix are accepted only through the existing Caddy -> nginx -> API trust
boundary. Direct client headers must not control canonical URLs.

## 8. Response and cache policy

| Response | Cache policy | Reason |
|---|---|---|
| valid listing HTML | `no-cache` | may be reused only after revalidation; publication and edits must disappear promptly |
| static public app document | `no-cache` | shell and route policy may change with a deploy |
| static private app document | `no-store` | contains no private data, but no authenticated route document should enter a shared cache |
| listing 404 | `no-cache` | a Draft may later publish at the same slug |
| hashed Vite assets | existing one-year immutable | unchanged |
| `route-handoff.js` and scoped fallback CSS | `no-cache` unless content-hashed later | stable filenames must revalidate |

The renderer does not cache DTOs. Existing database/query scale is sufficient for the beachhead;
the sitemap remains cached for one hour.

## 9. Security and privacy

- Every HTML text/attribute value is encoded. JSON-LD and bootstrap JSON use the framework
  serializer's HTML-safe encoder.
- Only Published, non-operator-unlisted, in-area listings render. The renderer consumes the
  existing service gate rather than reimplementing it.
- Boot JSON contains only the already-public `RoomDetailDto`; never tokens, session data,
  unpublished rooms or manager-only fields.
- CSP stays external-script-only. `application/json` and `application/ld+json` are inert data
  blocks, not executable inline scripts.
- The full street address and exact coordinates remain public because the current product is for
  public-facing churches/community venues. If a future location-visibility mode is adopted, the
  public DTO, visible HTML and JSON-LD must all omit/blur together; hiding CSS alone is forbidden.
- Route parameters are bounded/validated before lookup. Unknown input is encoded in logs and
  never reflected into HTML.

## 10. Failure modes

| Failure | Required behaviour |
|---|---|
| API cannot resolve a listing | 404 page; no reason leak |
| API unavailable for a listing document | static generic handoff body, but preserve 502/503/504; never a false 200 or 404 |
| handoff script blocked/fails | semantic listing remains usable |
| shell fetch fails | semantic listing remains; one quiet console error only |
| JS disabled | semantic listing and ordinary links work |
| bootstrap JSON malformed | ignore it, perform normal public detail read, never crash boot |
| client detail becomes 404 during navigation | designed unavailable state + noindex |
| image absent | no `og:image`; summary card; reserved visual placeholder |
| image URL document-relative | resolve against public base before metadata/JSON-LD |
| bad/old hash route | normalize known grammar; unknown falls back to browse with noindex |
| unknown clean path | nginx/static 404, never `index.html` with 200 |

## 11. Acceptance criteria

1. Opening `/space/dunn-loring-umc/art-studio` at Vite and compose origins leaves that exact clean
   path in the address bar, opens Art Studio, and centres Dunn Loring UMC on desktop and mobile.
2. The cold clean route does not download or initialize Three.js.
3. Fetching the same URL without running JavaScript returns status 200, listing-specific visible
   text, unique metadata, canonical, social image when present and parseable JSON-LD.
4. A Draft, Unlisted, operator-unlisted, out-of-area or unknown slug returns indistinguishable
   designed HTML with status 404 and `noindex`.
5. `/space/...` works behind a stripped prefix; its canonical, handoff, assets, API and media all
   retain that prefix.
6. Clicking between results changes clean URLs without reload. Back/Forward restores the previous
   view once per entry.
7. Every old hash shape opens the same state and is replaced with its clean path.
8. Apply, journal, desk and letter documents are `noindex` and absent from the sitemap.
9. The sitemap contains only `/` and canonical `/space/...` URLs for discoverable in-area rooms;
   `lastmod` is the later room/venue timestamp and changes after either public record is edited.
10. No direct clean route performs a duplicate listing-detail read or double-counts
    `listing_viewed`.
11. Hostile listing text cannot add tags, attributes or executable script.
12. Existing product-first boot, email `?goto=`, sign-in, apply, correspondence, hosting, flat
    builds and root/sub-path asset loading remain green.
13. `/browse` and private clean routes still boot when the API is unavailable. A direct listing
    may show the generic human fallback in that case, but its original HTTP status remains
    502/503/504.

## 12. Deferred

- Search Console and Bing verification/submission.
- Indexable suburb/area landing pages.
- Core Web Vitals field measurement and any Three-vs-flat SEO experiment.
- Indexable venue-only pages.
- Address-visibility choices for residential/sensitive venue categories.
- Slug history/renames.
