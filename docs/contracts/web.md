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
`#/village · #/venue/<venueId> · #/room/<venueId>/<roomId> · #/apply/<venueId>/<roomId> ·
#/journal · #/desk[/<venueId>] · #/letter/<applicationId>` (`src/core/bus.js`).

**The seam rule:** the day an upstream name changes, exactly one file moves.

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
| `createSession`, `refreshSession`, `getMe`, `deleteSession`, `deleteAllSessions` | `session.js` only |
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

## `src/data/session.js` — the token pair

Owns the API token pair and **nothing else reads a token**. localStorage key
`steeple-village-session` (in-memory fallback when storage throws), holding
`{accessToken, refreshToken, user}`.

- `signIn({email, displayName})` → `POST /auth/sessions {provider:'dev', idToken:'email|Name',
  device:{platform:'web'}}`. Dev provider only (`Auth:DevLoginEnabled`, Development-only) —
  when Google/Apple arrive **only `signIn()` changes**.
- `refresh()` is **single-flight** (one promise memoized; concurrent callers await it). A failed
  refresh clears the session rather than leaving a dead one.
- `withAccess(work)` runs one bearer-needing piece of work, retries **once** after a 401 with a
  fresh token, and rethrows if the retry has none.
- `fetchCurrentUser()` at boot revalidates a remembered session: 401 signs the browser out; an
  unreachable API does **not** cost the guest their sign-in.
- `signOut({everywhere})` clears storage **first**, then calls `DELETE /auth/sessions`
  (or `DELETE /me/sessions`) **best-effort**: a revocation that cannot be delivered must never
  leave somebody signed in on a browser they asked to be signed out of. It returns a promise
  that resolves once the attempt is over; callers do not have to await it.
- `currentUser()`, `isSignedIn()`, `onSessionChange(fn)` are the read surface. Watchers are
  called `(session, reason)` with `session.REASON` ∈ `signedIn · signedOut · expired ·
  refreshed`; **`expired` is the only one the person did not ask for**, and `ui/notice.js`
  turns it into a visible "You've been signed out." slip. This is the one channel a surface
  learns about identity through — subscribe, never poll.

## `src/data/correspondence.js` — the wire for everything after a request is written

The one seam the inbox, an opened letter, the host's desk and all four host decisions go
through (v2_migration D4/D5, 2026-08-05). Each function calls `api.js`, hands steeple's own
answer to `store.js`'s mirror, and returns a verdict — never a guess.

- Reads: `refreshMine()` (`GET /me/applications`), `refreshManaged(venueSlugs)`
  (`GET /manage/applications`), `openApplication(id)` (`GET /applications/{id}`, the thread),
  `managedVenues()` (`GET /manage/venues` + a detail read each).
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

Exports: `searchListings`, `getListing`, `getVenueProfile`, `getSuburbs`, `getGeofence`,
`getRoomAvailability`, `isLive()`. `getListing` additionally carries steeple's own `roomId`
(every write and the availability feed are addressed by it), `bookingMode`
(`instant | manual | null`) and `openHours` translated into the product's `{day, start, end}`
windows. **`getRoomAvailability(roomId, {from, to})` has no bundled fallback and answers
`null` when the API cannot** — an invented calendar is the one thing this surface must never
hand somebody about to commit to a date. Every other call goes live-first and falls back to
`bundledCatalog.js` (the offline seed,
same signatures; seed slugs match the bundled ids 1:1). After a failure the catalog goes quiet
for **30s** so one dead API costs one timeout, not one per keystroke — then retries, so a
backend started after page load is picked up without a reload. Falling back logs `console.info`,
never an error: it is a working state. The 3D village is deliberately **not** a consumer — it is
staged from the bundled seed; the map and list are the truth.

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
  states — a monogram + card (Sign out · Sign out everywhere) signed in, one quiet "Sign in"
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
  boot (`ui/deepLink.js`). **Driven end to end** by `tools/correspondence-test.mjs` §§0–7 —
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

⚠ Still unbuilt: D7 (Turnstile, agreements, real providers), D8's client half (client-sent
idempotency keys on manage creates, longer write timeouts), D9 (CSP, `window.__steeple`
gated to dev).

## Known hazards (unfixed)

- The 4s abort timeout on writes can **double-create venues**: a timed-out create retried by
  the user creates twice. The API *does* honour `Idempotency-Key` on manage creates now
  (`ManageIdempotencyIntegrationTests`); the missing half is the client, which does not send
  one (D8). The guest's submit does, and is proven to keep it across a failed send
  (`correspondence-test.mjs` §7).
- `draft.roomId` is always `'main-space'` in the listing flow — a second room per venue collides.
- Dev geocoding is `StubGeocodingGateway`: every address resolves to the village centre, so
  geofence-rejection paths are locally unreachable.
- API gaps compiled for steeple live in this project's `docs/CONTRACT4.md` §5 (CORS,
  venue-profile endpoint, missing RoomDetail fields, no vocabulary endpoint, …).
- **The property sheets are still scenery-backed.** `ui/index.js` builds the venue and room
  panels from `venues.js` (`liveRoom`), so a venue a host listed has no detail sheet and no
  clickable way into the apply flow — `#/apply/<venueSlug>/<roomSlug>` opens it perfectly
  (the composer is catalog-backed since Phase 2), but nothing on the map leads there. The map
  and list are catalog-backed and do show it. This is the next real gap on the discovery
  surface.
- Sign-out's revocation uses the access token it was holding. A token already expired means
  the `DELETE` answers 401 and the refresh-token family outlives the sign-out (until its own
  expiry); the local half is unconditional either way.
- `.notice` belongs to the listing flow (`styles/host.css`). The session slip is `.slip`, and
  the ambient notification surface borrows it.
- **`.choice*` belongs to the request sheet** (`styles/guest.css`, the composer's radios) and
  guest.css loads after host.css. The desk's booking-mode radios are `.mode*` for that reason —
  the first version reused `.choice` and was silently restyled into an unreadable block.
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
- A fade is not proof: headless app-time runs ~6× slow, so a panel's opening transition takes
  a second or more. `checkVisibility()` calls an element at opacity 0 visible — wait on the
  computed opacity (and on a transform settling) before clicking, or a click lands on whatever
  the moving box has slid off.
- E2E suites mint real accounts/venues/applications against the local API each run.
- Known-stale failure sets predating wave 7: guest-test 3, wave2-test 6, world-test 12.
- `tools/correspondence-test.mjs` is Phase 2's live probe: two browsers complete the manual
  loop (402 → card → send → question → answer → counter → accept → booking) and the instant
  loop, with localStorage cleared on both sides mid-flow, the dev mailbox's CTA followed, and
  every state read back from the database. It mints its own venues per run and uses `psql`
  for exactly one thing — the operator's approve on a new host's first listing, which has no
  API by design (D2). `STEEPLE_API` / `STEEPLE_PSQL` / `STEEPLE_DB` move its targets.
- `tools/payments-ui-test.mjs` is Phase 2.5's: the desk's IA per booking mode, the guest's
  booking view (including a `0002`-card failure — the mock gateway's decline card), the payout
  prompt through mock onboarding to connected, the mode toggle changing the public apply UX,
  the rescind lever with its refund proven in the `payments` table, and a seeded
  `bookingReminder` rendering as the slip. Same env vars; `STEEPLE_SHOTS=<dir>` additionally
  photographs each surface on the way past (a photograph proves nothing about interactivity —
  it is for looking at what was built).
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
