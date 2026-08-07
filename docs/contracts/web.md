# Contracts — Steeple.Web.v2 seams

> **Scope:** the frozen seams of the active web frontend (`src/Steeple.Web.v2`) — `api.js`
> (the wire), `session.js` (tokens), `catalog.js` (product vocabulary + offline fallback),
> `store.js` (the demo correspondence store), plus harness truths and the real-vs-demo state.
> Wire shapes themselves live in the endpoint seam files; conventions: `conventions.md`.
> Verified against `src/Steeple.Web.v2/src/data/` and `tools/` (2026-08-05).

Vite + vanilla JS + Leaflet SPA with a Three.js village splash; nginx serves the built assets
in containers and proxies same-origin `/api` to the API (the API emits **no CORS** by design —
the proxy is the missing BFF; in dev, `vite.config.js` does the same to `:5200`).
Layout: `src/{core,data,ui,flows,journey,world,styles}`. Hash routes own navigation:
`#/browse · #/venue/<venueId> · #/room/<venueId>/<roomId> · #/apply/<venueId>/<roomId> ·
#/journal · #/desk[/<venueId>] · #/letter/<applicationId>` (`src/core/bus.js`).
The retired prototype route `#/village` redirects in place to `#/browse` for old links.

**The seam rule:** the day an upstream name changes, exactly one file moves.

## The boot state machine ✅ *(2026-08-07 — build_plan Phase 3.5)*

**Product rule: intent beats scenery.** A press on the printed title page's *Find a space*,
*Host a space* or down affordance is accepted from the first frame it is shown. Three states,
with one owner each:

| State | Owner | Contract |
| --- | --- | --- |
| **printed arrival** | `index.html` markup | the three controls are `<a href="#/browse">` / `#/desk` carrying `data-intent="village\|desk"`, styled as pills. Before any script, a press records its destination in `location.hash` — **the URL is the recovery truth across a reload**. Never a styled `<button>` with no behaviour. |
| **product-first (flat) boot** | `src/core/intent.js` → `src/main.js` | an intent, a **cold** hash deep link, `?world=off` or a `build:flat` bundle. `roll = 1`, canvas + poster removed, `documentElement.dataset.world = 'off'`, destination applied. No village work may delay the product. On the first wordmark return in a village-capable build, restore the poster synchronously, finish the return roll, then lazy-load and attach engine/world/journey to that same roll. `?world=off` and `build:flat` never hydrate or contain/request Three. |
| **live-village boot** | `src/journey/roll.js` | no intent and no hash. Poster → canvas crossfade, then the 1.28s cinematic roll on a press. |

- `src/core/intent.js` is the critical controller: **the entry's first import, importing
  nothing** — no bus, no roll, no session/store, no Leaflet, no panels, no Three, no world.
  It records `{destination, requestedAt}`, sets `data-working="on"` on the pressed control
  (visible progress from the frame of the press) and leaves the native navigation alone.
  It is not inline: the CSP forbids that. A second `<script>` in `index.html` buys nothing —
  Vite folds every extra html entry back into the first as a static import.
- The intent is **claimed exactly once** (`claimArrival()`); `releaseArrival()` hands the page
  to the live roll only when `journey/roll.js` actually exists, and answers a press that
  landed in the last moments of the boot rather than dropping it. `core/bus.js` additionally
  holds one `roll:request` while `roll.js` is still arriving (`drainRollRequest()`).
- **Wire order:** the interface chunk (~106KB gzip) goes first and alone. `core/engine.js`,
  `world/index.js` and `journey/index.js` start only after the interface is interactive, an
  idle opportunity (`requestIdleCallback`, capped at 600ms), and no intent/deep link. There is
  no cancellation for an `import()` in flight, so **sequencing is the bandwidth control** — do
  not add a fetch/blob loader. A press during those transfers lets them land and abandons that
  boot generation (`taken`): no engine is created or started afterwards, and no unhandled
  rejection is raised.
- `window.__steepleReady` means the **chosen** surface is interactive: frame-warm for a village
  boot, UI-ready for a flat one. **No product request waits for it** — `core/idle.js`'s
  `releaseBoot()` opens the `afterBoot` gate the instant the product takes the page.
- `reportArrival(destination, entry)` is the named analytics seam (`entry: direct | cinematic`),
  emitted once when the intent settles — never once on the native press and again on hydration.
  P5's web batcher has not landed; wire it there and add the CONTRACTS §7 row with it.
- ⚠️ Leaflet's tile layer ships **with** the map, never deferred (`ui/map/atlas.js`).
- Driven by `tools/boot-priority-test.mjs` (51 checks, §1–§6) against a `build:debug` bundle.

## `src/data/api.js` — the wire

`/api/v1` names verbatim, **one function per request**; nothing renamed, no enum translated,
no shape invented. Base is the document-relative `'api/v1'` so the same bundle works at `/`
and behind a stripped proxy prefix.

- `ApiError {message, status, problem, code, detail}` — `status: 0` means *nothing answered*
  (the only case a caller may read as "the API is not here"); a failure that arrived carries the
  RFC 9457 problem document verbatim with its stable `code` lifted out.
- Timeouts: **4s** for reads and JSON writes, **20s** for photo upload. `notFoundAsNull` turns a
  404 into `null` for listing reads (an unpublished room is an answer, not a failure).
- Repeatable query params repeat the key (`activities`, `amenities`, `accessibility`,
  `daysOfWeek`); empty string is never sent.

| Wired (called today) | Caller |
|---|---|
| `searchListings`, `getListingBySlug`, `getSuburbs`, `getGeofence`, `getSitemap`, `getRoomAvailability` | `catalog.js` (and `getListingBySlug` again in `ui/guest/send.js` when a draft has no room id yet; `getGeofence` in `ui/host/manage.js`) |
| `createSession`, `refreshSession`, `getMe`, `deleteSession` | `session.js` only |
| `submitApplication` | `ui/guest/send.js` |
| `getMyApplications`, `getManagedApplications`, `getApplication`, `postApplicationMessage`, `postDecision`, `postWithdraw`, `postCounterOffer`, `postCounterOfferResponse`, `getBooking`, `getMyBookings`, `getManagedBookings`, `cancelBooking`, `getManagedVenues`, `getManagedVenue`, `updateManagedVenue` (booking mode only), `createPaymentSetup`, `confirmMockPaymentSetup`, `getMyPayments`, `getVenuePayments`, `startVenuePayoutOnboarding`, `completeMockVenuePayoutOnboarding`, `getMyNotifications`, `markNotificationsRead` | `correspondence.js` only (the seam every letter, desk, decision and payment goes through) |
| `createManagedVenue`, `updateManagedVenue`, `createManagedRoom`, `updateManagedRoom`, `uploadRoomPhoto`, `saveRoomAvailabilityRules` | `ui/host/manage.js` (the hosting chain) |

**Defined but never called** (the integration to-do list): `getManagedRoom`,
`getRoomAvailabilityRules`.

**Not present in `api.js` at all** (no client function exists yet): occurrence no-show
(`POST /occurrences/{id}/no-show`), ratings, analytics ingest (`POST /events`),
`POST /me/agreements`, `POST /me/devices`.

A request whose body is `undefined` carries no body and declares no content type — the
revocations below are the only such calls; `null` still means the empty JSON document that
every other write sends.

## `src/data/session.js` — who is signed in, and the proof (rewritten 2026-08-06)

Owns identity and **nothing else reads a token**. The two halves live in two places on purpose:

| what | where | why |
|---|---|---|
| refresh token (90d) | httpOnly cookie `steeple_refresh`, set by the API (`refreshTransport:'cookie'`, `identity.md`) | no script can read it; the browser presents it on same-origin `/api` calls by itself |
| access token (~15m) | this module's **memory**, nowhere else | a reload simply asks for another |
| the person + why it last changed | localStorage `steeple-village-session` = `{user, reason, stamp}` (in-memory fallback when storage throws) | shows the right name before the network answers, and is the only channel the **other tabs** hear about a change on |

**No token is ever written to storage again.** A signed-out browser leaves a tombstone
(`{user: null, reason, stamp}`) rather than removing the key, so a sibling tab can relay
`signedOut` vs `expired` rather than guessing.

- `signIn({email, displayName})` → `POST /auth/sessions {provider:'dev', idToken:'email|Name',
  device:{platform:'web'}, refreshTransport:'cookie'}`. Dev provider only
  (`Auth:DevLoginEnabled`, Development-only) — when Google/Apple arrive **only `signIn()` changes**.
- `refresh()` is **single-flight per tab** (one promise memoized) and re-reads storage first, so a
  tab whose sibling signed out does not go to the network at all. It presents nothing: the cookie
  is the credential. It resolves to `null` when steeple *refused* (the session is dropped and
  watchers are told `expired`) and **rejects** when nothing answered — an API that is not running
  must not cost anyone their sign-in. Cross-tab collisions are safe by the server's rotation grace
  (`identity.md`), not by this file.
- `withAccess(work)` runs one bearer-needing piece of work. With no access token in memory — which
  is **every reload of a signed-in browser** — it refreshes first; on a 401 it refreshes once and
  retries; a second 401 is an answer.
- `fetchCurrentUser()` at boot revalidates a remembered session: cookie refresh, then `GET /me`.
  401 signs the browser out; an unreachable API does **not** cost the guest their sign-in.
- `signOut()` clears storage **first**, then calls `DELETE /auth/sessions` **best-effort** — and
  no longer needs a live access token, because the API accepts the refresh cookie for the call.
  The response expires the cookie.
- **Migration:** a legacy record still holding `{accessToken, refreshToken}` is scrubbed on the
  first `load()`, and its refresh token is spent once with `refreshTransport:'cookie'` to move the
  browser onto the cookie in a single rotation.
- `currentUser()`, `isSignedIn()`, `onSessionChange(fn)` are the read surface (signatures
  unchanged). Watchers are called `(session, reason)` with `session.REASON` ∈ `signedIn ·
  signedOut · expired · refreshed`; **`expired` is the only one the person did not ask for**, and
  `ui/notice.js` turns it into a visible "You've been signed out." slip. A `storage` event from a
  sibling tab fires the same channel with the same reasons — a surface never learns about identity
  any other way. Note that a token rotation is **not** a session change and fires nothing.
- Harnesses that need a bearer use `withAccess((t) => Promise.resolve(t))`; there is nothing in
  storage to read. `tools/session-tabs-test.mjs` drives all of the above in two real tabs.

## `src/data/correspondence.js` — the wire for everything after a request is written

The one seam the inbox, an opened letter, the host's desk and all four host decisions go
through (v2_migration D4/D5, 2026-08-05). Each function calls `api.js`, hands steeple's own
answer to `store.js`'s mirror, and returns a verdict — never a guess.

- Reads: `refreshMine()` (`GET /me/applications`), `refreshManaged(venueSlugs)`
  (`GET /manage/applications`), `openApplication(id)` (`GET /applications/{id}`, the thread),
  `managedVenues()` (`GET /manage/venues` + a detail read each, five in flight).
- Guest writes: `sendMessage`, `withdraw`, `respondToCounter(id, accept)`.
- Host writes: `decide(id, 'approve'|'decline', message?)`, `ask` (= `sendMessage`),
  `counterOffer(id, schedule, message)`.
- Payments (guest): `paymentState()`, `startCardSetup()`, `saveMockCard({clientSecret, brand, last4})`.
- Bookings (Phase 2.5, 2026-08-05): `openBooking(id)` — the **detail** read —
  `refreshManagedBookings({limit})`, `refreshMyBookings({limit})`, `cancelBooking(id, reason?)`.
  **A booking list read names bookings and says nothing about the inside of one:** the API sends
  an empty occurrence set on lists by design, so every dated / priced / charge-state fact comes
  from that booking's own detail read. Both refreshers therefore mirror the page and then re-read
  each booking in full, bounded by `limit`. Same rule, same reason as the counter-offer eraser
  below.
- **Reads that do not depend on one another go together, five in flight** (`together()`), and
  a **pass** (2026-08-06) makes the several reads that open one surface count as one act:
  within a pass a booking's detail is read at most **once**, so the applications page and the
  bookings page — which name the same bookings — no longer fetch every one of them twice. A
  pass opens with the first refresh and closes a *timer tick* after the last settles, which is
  precisely what makes `await refreshManaged(); await refreshManagedBookings();` one pass (a
  resumed `await` is a microtask; microtasks all drain before any timer) and two refreshes
  separated by real work two. **Nothing survives a pass — this is not a cache**, and
  `openBooking(id)` is deliberately outside every pass because it is somebody's own act.
  Ordering inside a refresh is a guarantee, not luck: the whole page is mirrored
  *synchronously* before the first detail read is asked for, so no thin page row can land on
  top of a detail answer. Held to it by `correspondence-test.mjs` §8.
- **A page is not a list.** `mirrorApplications({scope})` deletes every held row the answer did
  not carry, so reading one page of 100 and calling it the list silently erased somebody's
  hundred-and-first request. Every list read now **walks its pages to the end**
  (`readAllPages`, 100 a page, hard cap 10 pages, page one first because page one carries
  `totalCount`, then the rest together). When the cap cuts the walk short, or a later page
  never arrives, the pass **upserts only and deletes nothing** — an incomplete list has no
  standing to say what does not exist. Held to it by `correspondence-test.mjs` §9.
- Payouts (host): `venuePayments(venueId)`, `startPayouts(venueId)`, `finishMockPayouts(venueId)`.
- Notifications: `notifications({pageSize})`, `markNotificationsRead(ids)`.
- Venue settings: `setBookingMode(venueId, 'instant'|'manual')` (`PATCH /manage/venues/{id}`).
- `toWireSchedule(schedule)` and `problemText(error)` are shared with `ui/guest/send.js`.

**The failure vocabulary is the contract.** Every verdict is `{ok:true, value}` or
`{ok:false, reach, code, problem, status}` with `reach` ∈ `refused` (steeple said no; its own
`detail` is the sentence to print) · `offline` (`status: 0` — *nothing happened*, and the
surface says so) · `signedOut` (401) · `unavailable` (404 — a route that is not there, e.g.
counter-offers with `booking.counter_offers` off: an absent feature, not an error).
An approve that answers `409 slot_taken` is a product moment, not a failure message.

## `src/data/catalog.js` — product vocabulary over the wire

The single data surface the product surfaces import (never `venues.js` directly). Two
translations happen here and only here: **names** (wire `roomName/latitude/longitude/totalCount`
→ product `name/lat/lng/total`) and **vocabulary** (wire camelCase tokens → printed labels,
unknown tokens humanized rather than dropped).

Exports: `searchListings(query, {signal})`, `getListing`, `getVenueProfile`, `getSuburbs`,
`getGeofence`, `getRoomAvailability`, `readFailure(error)`, `isLive()`, and the venue-presence
seam below (`heldVenue`, `heldRoom`, `knownVenues`, `heldResults`, `readVenue`, `forgetVenues`,
`AREA_CENTER`). `getListing` additionally carries steeple's own `roomId`
(every write and the availability feed are addressed by it), `bookingMode`
(`instant | manual | null`) and `openHours` translated into the product's `{day, start, end}`
windows. **`getRoomAvailability(roomId, {from, to})` has no bundled fallback and answers
`null` when the API cannot** — an invented calendar is the one thing this surface must never
hand somebody about to commit to a date. The 3D village is deliberately **not** a consumer — it
is staged from the bundled seed; the map and list are the truth.

**The seed stands in for an absent steeple, never for a refusal** (2026-08-06). The catalog
sorts a failed read into two cases and they are the contract:

| | statuses | what a read does |
|---|---|---|
| **absent** — nothing served `/api/v1` | `0` (dead fetch / 4s timeout), `502`, `503`, `404` | answers from `bundledCatalog.js` (same signatures; seed slugs match the bundled ids 1:1), goes quiet **30s** so one dead API costs one timeout rather than one per keystroke, logs `console.info` **once** — a working state, never an error — and `isLive()` reads `false` |
| **answered** — steeple said no | `400`, `401`, `403`, `429`, `500`, … | **throws the `ApiError`**; the caller says so |

`502`/`503` sit with *absent* because this page is always served from behind a proxy: vite in
development and nginx in a container both answer **502** for a dead API, so the browser never
sees a network error (the same lesson `neverArrived` in `correspondence.js` records — the two
predicates are deliberately alike and deliberately separate, because a *write* must never read
a 404 as "steeple is away"). `404` sits with *absent* because no read here has a not-found case
of its own — the only one that could, a listing by slug, is `null` before it can throw, vouched
for by the sitemap — so a thrown 404 is an origin that does not serve steeple (a static host, an
unwired proxy: `tools/surface-test.mjs` §2.5).

Serving the seed for an answered refusal was review issue 4: the seed cannot honour a schedule
term, so an API that refused a Tuesday-evening search printed nine rooms as though every one of
them were free on Tuesday evening. Only **429** takes the quiet window with it (re-asking a
service that refused for pace is the one retry that makes it worse); any other refusal may be
about the question rather than the service, so the next question is asked.

`readFailure(error)` → `{reach, status, message}`, `reach` ∈ `busy` (429) · `refused` · `absent`,
with our own calm sentence rather than steeple's `detail` (a read's problem document is written
for whoever holds the query, and nobody browsing a map is). Consumers: the list shows the
sentence and a **Try again** in place of rows, the count reads "No answer just now", the pins
lose their prices and rest (`ui/map/{search,index,results}.js`); the request sheet refuses to
open on a room steeple would not describe (`ui/guest/composer.js` — no hours means no honest
calendar at the commitment point); the two property sheets lose only a photograph. Driven by
`tools/catalog-honesty-test.mjs` (35/35, §1–§6), which needs two dev servers — one proxying a
live API, one with a dead target — and proves the 502 case against a real proxy.

### Venue presence — the seam that `venues.js` used to be (2026-08-06, review issue 7)

steeple has **no venue endpoint** (`docs/CONTRACT4.md` §5): its funnel is room-first. So a
venue is never fetched, it is **assembled**, from the two answers that carry one — a search
summary (venue name, short name, suburb, lat/lng, and the rooms that matched) and `RoomDetail`'s
venue block (address, parking, transit, `isIdentityVerified`), with the sitemap saying which
rooms a venue has. One record per slug, filled in as answers land:

| export | | |
|---|---|---|
| `heldVenue(slug)` | sync | the venue as known **this instant**, or `null`. A sheet opened from a row must be on the page in the same frame as the press. |
| `heldRoom(venueSlug, roomSlug)` | sync | one space of it, the same way |
| `knownVenues()` | sync | every venue the catalog has answered with, positioned — **the map's roster** |
| `heldResults()` | sync | the rooms of the last search answer (what the surface is currently saying) |
| `readVenue(slug)` | async | the venue **in full**: sitemap → `getListing` per room. Held for the session; answers from what is held when steeple cannot be reached; `null` when nothing anywhere knows the slug. |
| `forgetVenues()` | | publishing or editing a space is the one moment a held venue stops being true (`ui/map/index.js`, on `store:change`) |

The bundled seed still lends what the wire has no field for — a short display name, a venue
description, and the one line a sheet says about a space being **prepared** (a Draft never
leaves the API, so the live catalog cannot contradict it; it only adds) — and stands in whole
when nothing served `/api/v1`. The seed's five are on the map from the first frame, marked
**provisional**: the first answer that actually came from steeple clears them, so a live catalog
with other venues never leaves a phantom pin.

**The rule this replaced:** pins and the two property sheets were built from `src/data/venues.js`
— the 3D village's scenery — while the results came from the catalog. A venue a host listed had
a row and nothing else: no pin, no sheet, and no way into its apply flow but a hand-typed
`#/apply/<venueSlug>/<roomSlug>`. `venues.js` is now scenery and the seed behind
`bundledCatalog.js`, and **no product surface reads it**. Consumers that moved: `ui/index.js`,
`ui/map/atlas.js`, `ui/copy.js`, `ui/nav.js`, `ui/announcer.js`, `ui/guest/{composer,letter,
journal,index}.js`, `core/bus.js`.

Three rules that fall out of it, and are asserted:

- **The map follows the answer.** Every venue the catalog has answered with is pinned; the
  search in hand decides which stand and which rest, and which are priced (`atlas.setVenues`
  reconciles rather than rebuilds, so a pin never loses the focus a keyboard was holding).
- **A sheet paints what is known and completes itself.** `heldVenue` gives the head at once;
  `readVenue` fills the street address, the parking, the transit and the spaces the search did
  not return. For a seed venue the record is already whole, so the second paint is invisible.
  The room sheet does the same with `getListing` (paragraph, house rules, photograph).
- **`ui/copy.js` `liveRoom` is `heldRoom` first, `effectiveRoom` second, host edits over the
  top.** The old order read the scenery and applied edits to *that*, which showed a seed space
  as the scenery described it however far steeple had moved on — no photographs among other
  things, because the scenery keeps photo ids and the catalog keeps URLs.

`state.matching` is no longer derived from the scenery by `bus.setFilters`: only the search
knows which venues answered, and it publishes the set with every answer.

**One question per settled gesture** (`ui/map/search.js`). Every control calls `ask()`, which
waits **150ms** for the hand to stop before going to steeple; `search()` — the boot read, the
**Try again** press, a filter set from elsewhere — goes immediately. Each run aborts whatever is
still in flight and passes its `AbortSignal` down through `catalog.searchListings(query,
{signal})` to `api.js`'s `get`. A withdrawn request throws an `ApiError` carrying
**`aborted: true`**, and that flag is load-bearing in two places: `catalog.js`'s `live()`
rethrows it *before* the `absent` test (otherwise a fast typist would put a healthy catalog on
the bundled seed for thirty seconds), and the pill drops it silently rather than printing a
failure the next answer is about to replace. The sequence number stays — it stopped a stale
answer being *painted*; the signal stops the request holding a connection and a rate-limit slot
for a question nobody is waiting on.

A **Draft is not a listing**, and `ui/index.js` opens the room sheet only on a published room.
steeple settles this for everything it knows (Draft and Unlisted answer 404 to the public); the
guard is for the two Drafts this browser knows of itself — the seed's deliberate
`renovation-annex`, and a space a host has written but not yet sent.

The **verified mark** on the venue sheet (and in the announcer) is gated on
`isIdentityVerified`. It was printed unconditionally while the only venues that could be opened
were the seed's, every one of which is verified.

Driven end to end by `tools/discovery-test.mjs` (57/57): a venue minted through the real hosting
chain and a seed venue take the same journey — search → pin (mouse **and** keyboard) → venue
sheet → room sheet → Request → composer.

## `src/data/store.js` — the mirror, one per person

A localStorage **cache of what steeple holds**, in the product's vocabulary, so a surface can
be drawn before the wire answers and redrawn the moment it does (D4, 2026-08-05). It decides
nothing: there is one way in per shape and no local status machine to disagree with the
server's. Clearing localStorage mid-flow costs a reload, never a fact.

- `mirrorApplication(dto, {thread?})` — one `ApplicationDto`, held whole. A **list** read
  carries no thread (`messages: []`) and leaves the one already held alone; a **detail** read
  replaces it. `counterOffer` is the latest live counter — steeple returns no history, so
  neither does this (the host's "times you have offered" list shows the live one only).
  The thread and the counter answer to **their own evidence**, not to one shared switch: a
  list read hardcodes `messages: []` *and* `counterOffer: null` (`ApplicationMappings.ToDto`,
  `includeThread: false`), and `Messages` is non-nullable, so anything the payload carries
  proves a detail read and is held, while emptiness proves nothing — a list read and a detail
  read of a request nobody has written on are byte-identical. `thread: true` is therefore the
  only thing that may **clear** either, and every detail path in `correspondence.js` passes it.
  (Reading both off `messages.length > 0` once dropped a live counter-offer that arrived with
  an empty thread.)
- `mirrorApplications(dtos, {scope})` — a page as the whole of a scope: anything matching
  `scope` that the page did not carry is dropped, which is how a withdrawal made on another
  device leaves this browser.
- `mirrorBooking(dto)` — the booking and its occurrences, plus the names it is printed under
  (`roomName`, `venueName`; a host-listed room is in no bundled scenery). `payment {mode,
  perOccurrenceAmount, currency, nextChargeAtUtc}` and each occurrence's `paymentStatus` pass
  through untouched, and **only a detail read may replace an occurrence set**. Read back with
  `getBooking(id)`, `venueBookings(venueSlug)`, `guestBookings()`.
- `mirrorManagedVenues(venues)` — `GET /manage/venues` + details, held under steeple's slug
  with its id as `remoteId`; a venue the listing flow placed under a guessed slug before
  steeple answered is replaced rather than duplicated.
- `forgetApplication(id)` — a 404 on re-read; stop showing it.
- `fromWireApplication(dto)` is exported for suites: the slug pair becomes the product's
  `venueId`/`roomId`, `roomId` (the GUID) rides along as `remoteRoomId`, activity tokens
  become printed labels, `recurringWeekly` becomes `weekly`, weekday names become the
  schema's mask, and `HH:mm:ss` is cut to `HH:mm`.
- Still local, and still the store's own: `validateApplication(draft, {windows?, room?})`
  (live form validation — hours are only checked when the caller has been told them, and the
  room may be handed in because it may be one only the catalog knows), `setOpenHours`,
  blackouts, `editRoom`, `upsertPlacedVenue` — the listing flow's working copy.

**Calendar arithmetic is UTC, always.** `addDays`, `weekdayOf`, `nextWeekday` and
`materializeDates` handle venue-local wall-clock **dates**, not instants, so they parse with
`Date.UTC` and read back with `getUTC*` — UTC is the only clock without DST. Doing it in local
time meant a 25-hour day absorbed the `+86400000ms` and the date never advanced, which froze
`materializeDates` (and the tab) on the US fall-back and Sydney's. `todayIso()` is the single
deliberate exception: it is this person's own calendar date, read in local time.
`materializeDates` additionally refuses to loop without forward progress. `tools/store-test.mjs`
pins all of it and **must be run under `TZ=UTC`, `TZ=America/New_York` and
`TZ=Australia/Sydney`** — a UTC-only run cannot see the bug class at all.

**The key is `steeple-village-store:{organizerId}`** (Phase 1, D6), where the id is
**steeple's own user id** or `'anon'`. `currentOrganizerId()` reads `session.currentUser()`
on every load — no boot order to get wrong. Signed out, `guestApplications()` is empty by
definition: an inbox belongs to somebody. The seeded-persona table (`PERSONA_IDS`) that used
to stand in for an identity in dev builds **is gone** (D4).

A change of person drops the in-memory copy, leaves every other key untouched, and emits
`store:change {type:'identity'}`; surfaces re-read from whoever is here now.

**The demo fixture** loads only when `import.meta.env.PROD !== true`. It is scenery for the
3D village — the lanterns and ribbons read `venueSignals()`/`roomOccurrences()` from it — and
it is contained by construction: its letters are written under the seed's own ids
(`maria-alvarez`…), a real account's id is a GUID, and the desk is scoped to
`GET /manage/venues`, so no signed-in person ever inherits it and no desk ever shows it.

## Real vs demo, as of 2026-08-05

- **Real:** catalog reads; auth sessions (dev provider); application submit (`Idempotency-Key`,
  result mirrored into the local store); the whole hosting chain — dev SSO → `POST` venue →
  room → photo upload → `PUT` availability → `PATCH {status:'published'}` (publish requires a
  photo; moderation answers `draft` + `publishRequestedAtUtc`).
- **Real (Phase 1, 2026-08-05):** the account surface. The porch carries the account in both
  states — a monogram + card with Sign out signed in, one quiet "Sign in"
  chip signed out, which opens the identity panel the flows use (`ui/signIn.js` wraps
  `ui/guest/sso.js` in the shared `.modal__layer`). The inbox tab, its badge, the journal and
  an opened letter render only for a signed-in guest; a cold link to `#/journal` or
  `#/letter/…` while signed out lands in the village **and the address bar is corrected with
  it**. "Identity verified (SSO)" is gated on fact everywhere it is printed: the session
  (`journal.js`), the organizer's own `verified` (`host/desk.js` cards), the venue's
  (`host/desk.js` head), the session again (`host/listing.js`).
- **Real (Phase 2, 2026-08-05):** the whole of the correspondence. The guest inbox is
  `GET /me/applications`, read on sign-in and on every open of the inbox or a letter; the
  thread comes from `GET /applications/{id}`; withdraw, counter accept/decline and messages
  are wire writes that re-mirror the answer. The host desk **exists only when
  `GET /manage/venues` is non-empty** and is scoped to those venues — the seeded-venue
  chooser is gone, and somebody who keeps no venue is taken to the listing flow instead of an
  empty desk. Approve / decline / ask / counter-offer are wire writes; `409 slot_taken` on
  approve is rendered as what it is (the dates went elsewhere, steeple declined the request,
  the group was told). Submissions **require the API** (D5): unreachable leaves a draft and
  says so, and the `Idempotency-Key` survives a timeout so a retry returns the same request
  rather than filing a second. The apply calendar is `RoomDetail.openHours` +
  `GET /listings/{id}/availability`, so a production build can file a request at all. A
  `402 payment_method_required` opens a minimal mock-card step (`ui/guest/payment.js`) and
  the send picks up by itself; instant venues answer the submit with the booking and the copy
  says so (`Book this space`, "Booked."). `?goto=` deep links from email CTAs are followed at
  boot (`ui/deepLink.js`). **Driven end to end** by `tools/correspondence-test.mjs` §§0–9 —
  two people, two browsers, real rows, localStorage cleared twice mid-flow.
- **Three seams the driving corrected (2026-08-05), worth knowing before touching them:**
  - a **counter-offer rides the detail read only**. The API omits `counterOffer` from list
    reads by design (like the thread — `ApplicationMappings.ToDto`), so `mirrorApplication`
    replaces it only when passed `{thread:true}` and `mirrorApplications` never touches it.
    Reading it off a list read means reading `null` and forgetting a live counter under a
    letter somebody is standing in front of.
  - the **host desk re-reads on arrival**, not once per page load. `readDesk({again})` is
    passed the desk-entry transition; anything else would make the answer's own mirror
    trigger the next read and the board would poll itself.
  - **"never arrived" is 0, 502 and 503**, not just 0 (`correspondence.js:neverArrived`).
    The app is always behind a proxy, and a proxy whose upstream is down answers 502 — the
    page never sees a network error, so the plainest outage got the vaguest sentence.
    **504 is excluded on purpose:** a gateway timeout may well have landed, so it must not
    be promised away; the idempotency key is what makes retrying it safe.
- **Real (Phase 2.5, 2026-08-05):** the money, on both sides.
  - **The desk is `Bookings · Requests · Spaces`** and opens on **Bookings** — confirmed
    bookings with dates still to come, each with the group, the schedule, the frozen
    per-session price, the next charge, every date's own `paymentStatus`, and the host's
    cancel behind a two-press warning that says what it costs (every remaining date freed,
    everything charged refunded in full). **Requests renders only where requests exist:** a
    venue in `manual` mode, or one that has just left manual with answers still owed — an
    instant venue's desk has no Requests tab at all. `?desk=board|ledger` is offered on the
    Requests tab only, because that is the only pile it sets.
  - **The guest's opened letter carries the booking's payment truth** from the detail read: the
    price snapshot, `nextChargeAtUtc`, what has been paid, and per-date charge words. A
    `failed` date prints steeple's own ladder (retried; released 24h before the session if it
    cannot complete) with a way to the card step.
  - **The card on file is reachable outside a send** — `ui/cardPanel.js` wraps the same step
    (`ui/guest/payment.js`, now with a replace mode and a `Visa ···· 4242` line) and is opened
    from the account card on the shelf and from that failure ladder. Still brand + last4 only,
    and **no field a card number could travel in**.
  - **Payouts:** once a venue holds a priced booking and `GET …/payments` says payouts are off,
    the desk prompts once ("Set up payouts to receive $X"). It is a prompt, never a gate — in
    the mock era payout state gates nothing. `ui/host/payouts.js` renders the mock's own KYC
    stand-in (the returned `url` is deliberately not navigable) and finishes through
    `…/onboarding/mock-complete`; the connected state says plainly that payments are simulated.
  - **Booking mode** is a two-option setting on the desk's Spaces tab (`PATCH /manage/venues/{id}`),
    one honest sentence each, scoped in copy to new asks only.
  - **Notifications are ambient, not a tab** (`ui/notifications.js`). `GET /me/notifications` is
    read on sign-in and on arriving at the product surface; the newest unread of
    `bookingReminder | paymentFailed | occurrenceRefunded | bookingReceived` is shown once as a
    `.slip` — with the same deep-link follower an email CTA uses (`followDeepLink`) — and marked
    read. The inbox keeps the last few as quiet lines (`.jnotes`). Losing a slip loses a
    reminder, never a fact: every fact it names lives on the letter or the desk.
  - Driven end to end by `tools/payments-ui-test.mjs` §§1–6 (65/65).
- **Demo:** dev provider only, `turnstileToken` hardcoded `null` (D7); `organizationName` is
  sent as `null` — the group beside a name is whatever came back on a request, and the input
  that would set it belongs to Phase 4; the card step is deliberately plain and the mock
  gateway's own (`saveMockCard` retires at Stripe-time), and the payout screen is the mock's
  stand-in for hosted KYC.

⚠ Still unbuilt: D7 (Turnstile, agreements, real providers), D8's longer-write-timeouts half
(the idempotency-key half is done — see below).

D9 landed 2026-08-06: the CSP (and gzip, nosniff, Referrer-Policy) live in
`src/Steeple.Web.v2/nginx.conf` — ARCHITECTURE.md → Deployment owns the policy and the one
coupling it carries — and `window.__steeple` is published only when `import.meta.env.DEV`
or the build was made with `VITE_DEBUG=on`. Boot gained its missing failure path in the same
change: any failure raising the village (a refused WebGL context, a 3D chunk that never
arrives) is one `console.warn` and then `bootFlat` — the flat product, interactive.

## Known hazards (unfixed)

- ~~The 4s abort timeout on writes can double-create venues~~ — fixed for the in-session retry
  path (D8's client half): `createManagedVenue`/`createManagedRoom` (`data/api.js`) now accept
  and send `Idempotency-Key`, and `ui/host/manage.js`'s `saveVenue`/`saveRoom` generate one
  `crypto.randomUUID()` per logical create, hold it on `draft.remote.{venue,room}IdempotencyKey`
  across every retry (same idiom as `guest/send.js`'s `draft.idempotencyKey`), and delete it
  only once steeple has answered — so the wizard's own retry (or `withAccess`'s 401-refresh
  replay) lands on the request that already happened. The API already honoured
  `Idempotency-Key` on manage creates (`ManageIdempotencyIntegrationTests`). Residual gap: the
  key lives only on the in-memory `draft` for that flow session, so a full page reload between
  the timed-out request and the retry still mints a fresh key (the guest submit path shares
  this same shape). The 4s timeout itself is unchanged (D8's other half).
- `draft.roomId` is always `'main-space'` in the listing flow — a second room per venue collides.
- Dev geocoding is `StubGeocodingGateway`: every address resolves to the village centre, so
  geofence-rejection paths are locally unreachable — **and every venue a host has ever listed
  locally stacks on one point of the map.** Nothing is wrong with the pins (a press opens the
  chip that was under it), but a harness must not aim a pointer at a named pin and expect that
  venue: use the keyboard, or assert the invariant (`discovery-test.mjs` §1, `surface-test.mjs`
  §2.1). It also broke two rulers that measured the map's scale between the *first and last*
  pins on the page — both were zero, and every zoom figure derived from them was `NaN`; they
  now measure between two named pins (`map-test.mjs`, `map-feel.mjs` `pinSpread`).
- API gaps compiled for steeple live in this project's `docs/CONTRACT4.md` §5 (CORS,
  venue-profile endpoint, missing RoomDetail fields, no vocabulary endpoint, …).
- ~~The property sheets are scenery-backed~~ — fixed 2026-08-06 (review issue 7). Pins and both
  property sheets are the catalog's; see "Venue presence" above.
- **A search answers one page.** `searchListings` asks for `pageSize: 100` and the surface shows
  what came back, so with more published rooms than that (the shared dev database holds ~108) a
  venue past the end of the first page has no pin and no row until a narrower search reaches it.
  Its *sheet* works either way — `readVenue` goes by slug through the sitemap — so a deep link
  or an email CTA lands correctly. The count line says what is on the page, not `totalCount`.
  Paging the map is unbuilt.
- Sign-out's revocation uses the access token it was holding. A token already expired means
  the `DELETE` answers 401 and the refresh-token family outlives the sign-out (until its own
  expiry); the local half is unconditional either way.
- `.notice` belongs to the listing flow (`styles/host.css`). The session slip is `.slip`, and
  the ambient notification surface borrows it.
- **`.choice*` belongs to the request sheet** (`styles/guest.css`, the composer's radios) and
  guest.css loads after host.css. The desk's booking-mode radios are `.mode*` for that reason —
  the first version reused `.choice` and was silently restyled into an unreadable block.
  `.chosen*` is a different thing in a different file: the listing flow's label-left rows for
  the vocabularies a host picks from (amenities, accessibility, who may use it, `host.css`).
- A `.segments` control is `inline-flex`, so a grid cell stretches it into a full-width track
  with the switch huddled at one end. Every placement inside a `.field`/`.chosen__value` must
  set `justify-self`/`justify-items: start`.
- The desk's Spaces tab reads open hours from the **local** store (`hoursSummary` ←
  `openHoursFor`), so a room whose hours only exist at steeple reads "No open hours set" in red.
  Pre-existing, and now visible beside real bookings; the fix is a managed-availability read.
- `ui/guest/letter.js` prints an hourly price only when this browser has a listing for the room.
  A missing figure means *unknown*, never free (free listings were removed 2026-07-07) — and
  `priceParts` answers "Free" to a price it was not given, which is how a host-listed room's
  letterhead used to say Free above a $40-a-session booking.

## Harness truths (`tools/*.mjs`)

- Real-browser Puppeteer suites driving **real** pointer/keyboard events — debug screenshots
  never count as proof of interactivity.
- **Each harness documents its own URL/flags in its header** (some expect world-ON, some
  world-OFF, some a specific `?q=`/port). **Inverting a suite's documented flags produces
  convincing, meaningless failures** — rerun with the header's own invocation before believing
  a regression.
- Headless GL runs app-time ~6× slow: tests **wait on state, never wall-clock**.
- `window.__steeple` (`main.js`) is the debug/verification API the harnesses read
  (`bus, state, setView, setFilters, setHover, setStyle, setMode, setMap, store, session`);
  `window.__steepleReady` is the boot gate they await. Suites drive affordances with input and
  use `__steeple` only for reset, reads, and — since correspondence needs an owner — signing a
  real person in against the local API (`__steeple.session.signIn`).
  It is **not in a production bundle** (2026-08-06): the dev server always publishes it, a
  build only with `VITE_DEBUG=on` — `npm run build:debug`, or `build:flat:debug` for the one
  suite that drives a built bundle (`world-off-test.mjs`'s second invocation). Every other
  suite drives `npm run dev` and is unaffected. `__steepleReady` is ungated: `core/engine.js`
  reads it itself to know whether the loop may be put down.
- A fade is not proof: headless app-time runs ~6× slow, so a panel's opening transition takes
  a second or more. `checkVisibility()` calls an element at opacity 0 visible — wait on the
  computed opacity (and on a transform settling) before clicking, or a click lands on whatever
  the moving box has slid off.
- E2E suites mint real accounts/venues/applications against the local API each run.
- Known-stale failure sets predating wave 7: guest-test 3, wave2-test 6, world-test 12.
- ⚠️ **A cold hash is a product-first boot** (2026-08-07): `page.goto(url + '#/browse')` now
  boots flat, so `__steeple.engine`/`.world` are `null` and any camera read throws. A suite
  that wants a route *and* a village must load with no hash, wait on `__steepleReady`, then
  set `location.hash` and `__steeple.roll.set(1)`. `tools/world-test.mjs`'s reduced-motion
  section is the worked example; **`tools/input-test.mjs`'s `ready()` still needs the same
  change** (it crashes at its map-drag section otherwise).
- `tools/boot-priority-test.mjs` is Phase 3.5's gate (51 checks, §1–§6). It is the one suite
  that drives a **non-flat built bundle**: `npm run build:debug` then
  `npx vite preview --outDir dist-debug --port 5279 --strictPort`. It holds named chunk
  responses open over CDP (slow-4G + 4× CPU) so "before the interface arrives" is a real
  interval, and it **clicks before waiting on `__steepleReady`** — waiting first was the blind
  spot that let a lost click ship. Its own trap: `performance.getEntriesByType('resource')`
  only learns of a request when it *finishes*, so catching a download in flight needs the
  node-side `page.on('request')` log, not the page's timeline.
- `tools/correspondence-test.mjs` is Phase 2's live probe: two browsers complete the manual
  loop (402 → card → send → question → answer → counter → accept → booking) and the instant
  loop, with localStorage cleared on both sides mid-flow, the dev mailbox's CTA followed, and
  every state read back from the database. It mints its own venues per run and uses `psql`
  for exactly one thing — the operator's approve on a newly claimed venue's first listing, which has no
  API by design (D2). `STEEPLE_API` / `STEEPLE_PSQL` / `STEEPLE_DB` move its targets. §8 counts
  the desk's `GET /bookings/{id}` requests (one per booking, never two) and §9 answers for
  steeple with a fabricated page of a hundred whose `totalCount` says twenty-five, proving the
  truncated walk erases nothing it did not see — 69 checks in all.
- `tools/payments-ui-test.mjs` is Phase 2.5's: the desk's IA per booking mode, the guest's
  booking view (including a `0002`-card failure — the mock gateway's decline card), the payout
  prompt through mock onboarding to connected, the mode toggle changing the public apply UX,
  the rescind lever with its refund proven in the `payments` table, and a seeded
  `bookingReminder` rendering as the slip. Same env vars; `STEEPLE_SHOTS=<dir>` additionally
  photographs each surface on the way past (a photograph proves nothing about interactivity —
  it is for looking at what was built).
- `tools/discovery-test.mjs` is the venue-presence probe (2026-08-06, 57 checks, world-OFF):
  a venue minted through the real hosting chain and a seed venue take the same journey — search
  → pin → venue sheet → room sheet → Request → composer — plus the Draft staying invisible, the
  pins and the rows being one answer, and a superseded search leaving the wire. Pass the live
  venue's slug pair as argv 3 and 4, or it finds a non-scenery venue on the wire itself. Two
  things it learned so the next agent does not have to: the dev geocoder stacks every
  host-listed venue on one point, so a *pointer* cannot be aimed at a named pin (it asserts the
  invariant — the sheet that opens is the pin that was pressed — and uses the keyboard when it
  needs a particular venue); and a superseded search cannot be caught by typing fast against a
  local API that answers in 20ms, so §5 holds the first request open with `setRequestInterception`
  and waits for `net::ERR_ABORTED`.
- `tools/catalog-honesty-test.mjs` guards the line between an absent steeple and a refusing
  one (the table under `catalog.js` above). It wants **two** dev servers — `npx vite --port
  5177` and `STEEPLE_API_ORIGIN=http://localhost:59999 npx vite --port 5179` — because §6 is
  the one case that cannot be faked in the browser: what the *proxy* answers for a dead API is
  the whole point (502, not a network error). §2–§5 fake the status with request interception,
  the way `surface-test.mjs` §2.5 does.
- `tools/session-tabs-test.mjs` is the identity probe (2026-08-06, 35 checks): two pages of one
  browser sharing one cookie jar. It proves the refresh token is an httpOnly cookie no script can
  read, that a sibling tab adopts a sign-in and lets go of a sign-out through the `storage` event
  with the right reason, and — the point — that **concurrent rotations of one cookie all succeed
  and the family survives**. Its own trap, learned the hard way: a second tab that adopts a person
  immediately does authed work and *re-mints the cookie*, so the section that stages a dead session
  closes the other tab first, and it deletes the httpOnly cookie through CDP `Network.deleteCookies`
  (puppeteer's `page.deleteCookie` round-trips through `setCookies` and silently fails on one whose
  value it never read). World-OFF; `?world=off`.
- **A slip is not "on screen" because it is not `hidden`.** It fades in, and headless GL runs
  app-time ~6× slow, so a check that only asks whether it exists passes on something nobody
  could have read. Wait on computed opacity.
- Builds: `npm run dev` (vite :5173) · `npm run build` · `npm run build:flat`
  (`VITE_WORLD=off`, ~310kB vs ~988kB — three.js compiled out, no query can ask for a world
  that was never shipped).
- A/B alternatives are **query params, never branches**, read once at boot into `state`
  (`src/core/bus.js`): `?style= ?map= ?tilt= ?world=on|off ?letter=stationery|ledger
  ?desk=board|ledger ?lantern=lamp|window`.

> Naming note: code comments citing "CONTRACT4 §5" mean this project's own
> `src/Steeple.Web.v2/docs/CONTRACT2–6.md` wave briefs; "CONTRACTS §n" means the repo's
> `docs/contracts/` seam files.

## Deep links from email/push into the SPA ✅ *(built 2026-08-05 — `src/ui/deepLink.js`)*

- Notification payloads carry `deepLink` paths (existing grammar: `/bookings/{id}`,
  `/inbox/applications/{id}`, `/inbox`, `/space/{venueSlug}/{roomSlug}`).
- Email CTAs build `{Email:WebBaseUrl}/?goto=<url-encoded deepLink>` — a query param, not
  a path, because the SPA ships no server-side routes and nginx soft-404s unknown paths.
- `createDeepLink()` runs once from `ui/index.js`, after the surfaces exist:
  - the parameter is **claimed and removed from the address bar immediately**, so a reload
    lands where the person now is rather than where the email pointed;
  - only a path beginning `/` (and not `//`) is followed — never an absolute URL in a query;
  - the page is rolled down to the product first (`rollTo(1)`): somebody sent by an email is
    not arriving at the front door;
  - `/bookings/{id}` is resolved through `GET /bookings/{id}` to its `applicationId` and
    opens **that letter**, which is where this app renders a booking today;
  - signed out (or a remembered session that fails `GET /me`) opens the identity panel, holds
    the link, and follows it on the next `signedIn`;
  - unresolvable ⇒ the village and one quiet `.slip`.
