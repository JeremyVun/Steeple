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
| `searchListings`, `getListingBySlug`, `getSuburbs`, `getGeofence`, `getSitemap` | `catalog.js` (and `getListingBySlug` again in `ui/guest/send.js` to resolve the roomId before submit; `getGeofence` in `ui/host/manage.js`) |
| `createSession`, `refreshSession`, `getMe` | `session.js` only |
| `submitApplication` | `ui/guest/send.js` |
| `createManagedVenue`, `updateManagedVenue`, `createManagedRoom`, `updateManagedRoom`, `uploadRoomPhoto`, `saveRoomAvailabilityRules` | `ui/host/manage.js` (the hosting chain) |

**Defined but never called** (the integration to-do list): `getRoomAvailability`,
`getMyApplications`, `getManagedVenues`, `getManagedVenue`, `getManagedRoom`,
`getRoomAvailabilityRules`.

**Not present in `api.js` at all** (no client function exists yet): the application thread and
decision endpoints (`GET /applications/{id}`, `/messages`, `/decision`, `/withdraw`,
`/counter-offer[/respond]`, `GET /manage/applications`), notifications
(`GET /me/notifications`, `/read`), bookings, ratings, analytics ingest (`POST /events`),
`DELETE /auth/sessions`, `DELETE /me/sessions`, `POST /me/agreements`, `POST /me/devices`.

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
- `signOut()` is **local only** — it clears storage; `DELETE /auth/sessions` is not called.
- `currentUser()`, `isSignedIn()`, `onSessionChange(fn)` are the read surface.

## `src/data/catalog.js` — product vocabulary over the wire

The single data surface the product surfaces import (never `venues.js` directly). Two
translations happen here and only here: **names** (wire `roomName/latitude/longitude/totalCount`
→ product `name/lat/lng/total`) and **vocabulary** (wire camelCase tokens → printed labels,
unknown tokens humanized rather than dropped).

Exports: `searchListings`, `getListing`, `getVenueProfile`, `getSuburbs`, `getGeofence`,
`isLive()`. Each call goes live-first and falls back to `bundledCatalog.js` (the offline seed,
same signatures; seed slugs match the bundled ids 1:1). After a failure the catalog goes quiet
for **30s** so one dead API costs one timeout, not one per keystroke — then retries, so a
backend started after page load is picked up without a reload. Falling back logs `console.info`,
never an error: it is a working state. The 3D village is deliberately **not** a consumer — it is
staged from the bundled seed; the map and list are the truth.

## `src/data/store.js` — the demo correspondence store

localStorage (`steeple-village-store`) model mirroring `db/changelog/004/005/009` exactly:
application + counter-offer status machines, booking occurrences as the double-booking
authority, open hours/blackouts, validation, 14-day expiry. Every mutation emits
`bus 'store:change'`. It is still the source for the guest inbox/letters and host request
decisions.

**Hazard — `GUEST_ID = 'maria-alvarez'` is hardcoded** (`store.js`, read by
`ui/guest/journal.js` and `ui/host/index.js`): the inbox, its badge, every letter and every host
decision run as that seeded persona **regardless of who is signed in**, and
`GET /me/applications` is never called. Signed-out visitors see seeded demo letters.

## Real vs demo, as of 2026-08-05

- **Real:** catalog reads; auth sessions (dev provider); application submit (`Idempotency-Key`,
  result mirrored into the local store); the whole hosting chain — dev SSO → `POST` venue →
  room → photo upload → `PUT` availability → `PATCH {status:'published'}` (publish requires a
  photo; moderation answers `draft` + `publishRequestedAtUtc`).
- **Demo:** guest inbox/letters and host request decisions run on `store.js` under the
  hardcoded `GUEST_ID`; `ui/guest/send.js` falls back to filing an application **locally** when
  the API is unreachable while the UI still says the request is on its way (honest in a demo, a
  lie in production); no signed-out header affordance (the account chip is hidden when signed
  out — sign-in only appears mid-flow); dev provider only; `turnstileToken` is hardcoded `null`.

⚠ superseded-by-adopted-decision: see `docs/backlog/v2_migration/design.md` **D4** (server is
truth for correspondence; `store.js` becomes a cache, `GUEST_ID` dies) and **D5** (no silent
local filing — submissions require the API) — **not yet built**. Related and also unbuilt: D6
(always-present account surface + real sign-out), D7 (Turnstile, agreements, real providers),
D8 (idempotency + longer write timeouts), D9 (CSP, `window.__steeple` gated to dev).

## Known hazards (unfixed)

- The 4s abort timeout on writes can **double-create venues**: a timed-out create retried by the
  user creates twice — manage creates have no `Idempotency-Key` API-side (D8).
- `draft.roomId` is always `'main-space'` in the listing flow — a second room per venue collides.
- Dev geocoding is `StubGeocodingGateway`: every address resolves to the village centre, so
  geofence-rejection paths are locally unreachable.
- API gaps compiled for steeple live in this project's `docs/CONTRACT4.md` §5 (CORS,
  venue-profile endpoint, missing RoomDetail fields, no vocabulary endpoint, …).

## Harness truths (`tools/*.mjs`)

- Real-browser Puppeteer suites driving **real** pointer/keyboard events — debug screenshots
  never count as proof of interactivity.
- **Each harness documents its own URL/flags in its header** (some expect world-ON, some
  world-OFF, some a specific `?q=`/port). **Inverting a suite's documented flags produces
  convincing, meaningless failures** — rerun with the header's own invocation before believing
  a regression.
- Headless GL runs app-time ~6× slow: tests **wait on state, never wall-clock**.
- `window.__steeple` (`main.js`) is the debug/verification API the harnesses read
  (`bus, state, setView, setFilters, setHover, setStyle, setMode, setMap, store`, plus
  `resetDemo`); `window.__steepleReady` is the boot gate they await. Suites drive affordances
  with input and use `__steeple` only for reset and reads.
- E2E suites mint real accounts/venues/applications against the local API each run.
- Known-stale failure sets predating wave 7: guest-test 3, wave2-test 6, world-test 12.
- Builds: `npm run dev` (vite :5173) · `npm run build` · `npm run build:flat`
  (`VITE_WORLD=off`, ~310kB vs ~988kB — three.js compiled out, no query can ask for a world
  that was never shipped).
- A/B alternatives are **query params, never branches**, read once at boot into `state`
  (`src/core/bus.js`): `?style= ?map= ?tilt= ?world=on|off ?letter=stationery|ledger
  ?desk=board|ledger ?lantern=lamp|window`.

> Naming note: code comments citing "CONTRACT4 §5" mean this project's own
> `src/Steeple.Web.v2/docs/CONTRACT2–6.md` wave briefs; "CONTRACTS §n" means the repo's
> `docs/contracts/` seam files.

## Deep links from email/push into the SPA (spine contract, 2026-08-05)

- Notification payloads carry `deepLink` paths (existing grammar: `/bookings/{id}`,
  `/inbox/applications/{id}`).
- Email CTAs build `{Email:WebBaseUrl}/?goto=<url-encoded deepLink>` — a query param, not
  a path, because the SPA ships no server-side routes and nginx soft-404s unknown paths.
- The SPA reads `goto` once at boot: if it names a resource the current session can see,
  open that letter/booking view directly (if signed out, run sign-in first and preserve
  `goto` through it); otherwise fall back to the village with a quiet notice.
