# Web v2 harness truths (paid for; keep)

Read this before running or writing any `tools/*.mjs` suite. Each suite also documents
its own flags/env in its header — inverting them produces convincing, meaningless
failures. Headless GL runs app-time ~6× slow: suites wait on state, never wall-clock.

## Invocation

- ONE API per run: export `STEEPLE_API` **and** point the vite proxy (`STEEPLE_API_ORIGIN`)
  at the same instance. `host-input-test`/`host-session-test` hardcode :5200 — bind the one
  dev API to both ports (`--urls "http://localhost:5218;http://localhost:5200"`), never run
  a second API. `boot-priority-test` drives `build:debug` via `vite preview --outDir
  dist-debug`, never the dev graph; `world-off-test`'s built-bundle half needs
  `build:flat:debug` (plain `build:flat` has no `__steeple`).
- Sign-in is 10/min per-IP: `fixtures.paceAuth` paces within a process; give back-to-back
  auth-heavy suites breathing room.
- `map-test` asserts seed venue counts — green only after a DB reset; every other suite
  mints its own rows and never collides.
- Console-noise discipline: dead-port media 404s and GL narration are environmental —
  `fixtures.isEnvironmentNoise` is the shared filter; judge the check lines.

## Defects only one suite can see

- **`surface-scope-test.mjs` is the only guard on CSS surface scoping.** `postcss.config.js`
  scopes `guest.css` to `.guest` and `host.css` to `.hostdesk`, so markup mounted outside both
  roots — the shelf's sign-in/card modals, the porch, anything both surfaces render — silently
  renders as a bare UA control if its rules were authored in a scoped sheet. It compiles, every
  other suite stays green, and it shows up only in a screenshot: that is how the porch switch
  and the whole SSO panel shipped undressed on 2026-08-09. Shared chrome belongs in `main.css`
  (`docs/contracts/web.md`). Run this suite after touching `src/styles/` or after moving markup
  between mount points. It needs a debug build (`window.__steeple`) and signs in once.

## Product behaviors that trip suites

- **The agreements ask interrupts real-input suites**: a fixture account that never
  agreed gets the gate at boot/sign-in, and **dismissing it signs the account out**. Call
  `fixtures.agreeCurrent(token)` on minted accounts (versions are read from
  `src/data/agreements.js`, no drift) — except in `hardening-test` §4, whose subject is the
  un-agreed state.
- **Notifications are `.jmsg` rows in the inbox** (no slips), so those assertions are DOM
  state and never timing — `data-unread` until opened, the sentence read off
  `.jmsg__line span:last-child` (a visually-hidden "Unread. " prefix rides in front of it
  while unread), the one way on read off `.jmsg__go`'s *text* (it is opacity-0 until hover
  but always in the DOM). The inbox redraws when a read answers, so a press needs the
  detach-retry `press()` helper, never a synthetic `.click()` (`inbox-messages-test`,
  `payments-ui-test` §6, `booking-notification-test`). `.slip` still exists for one thing
  only — `ui/notice.js`'s sign-out/deep-link confirmation, whose live gate is
  `account-test` §6.
- **Routes are paths; `location.hash` is inert.** A suite says where it means to be with
  `fixtures.at(url, routes.room(v, r))` — origin and query preserved — and moves a page
  that is already standing with `fixtures.goRoute(page, path)`, which writes the entry and
  sends the popstate the browser would have. Assigning `location.hash` navigates nothing:
  there is no `hashchange` listener left. The old `#/…` links are still honoured as
  compatibility entrances (the matrix is `tools/router-test.mjs` §2, driven end-to-end by
  `tools/route-test.mjs` §3), so an address-bar assertion reads `location.pathname`, never
  the fragment. A cold `/space/…` is a **document the API renders**, so it needs the API
  up; the other clean routes are static boot documents and open with it down.

## Known-stale sets (documented in the suites' own headers)

- `guest-test` 41/45 (map-first hit-test drift: canvas-topmost at village, venue, and room;
  porch reachability behind an open request) ·
  `world-test` Atlas-only: 6 stale (header has the exact set) · `booking-flow-test` fails
  from §5 (seed venues became instant-book; correspondence-test is the live gate for both
  flows). `world-off-test` §7 is **not a "load flake"**: it was the agreements gate
  standing over the wordmark, and the suite now answers it on the wire and waits on the
  roll instead of a clock. `input-test`'s opening roll beats are a **load reading**
  (headless GL under load), not a verdict.

## Headless-Chrome physics

- All suites launch Chrome on a **pipe** and close in `finally` — a SIGKILL mid-run leaves
  zero orphaned "Chrome for Testing" processes.
- Headless pages stop advancing CSS transitions after an earlier `page.screenshot()` in
  the run — computed opacity then reads 0 forever, which mimics a broken affordance. For
  timing claims assert on DOM state (`aria-busy`, class dwell), shoot last; each
  `deviceScaleFactor:2` shot costs 1–2.5s, so tight sampling loops silently span seconds.
- **A fade needs a rendered frame, and headless Chromes share the machine.** Two *pages of
  one browser* freeze each other outright — the one not in front stops advancing
  transitions, so an opened surface sits at opacity 0 forever and `steady()` correctly
  calls it never-arrived (one browser per page, not per person). And concurrent *browsers*
  starve it: a transient measured at opacity 1 with one in flight peaked at 0.26 with
  three. Put finished browsers down before any section whose claim is a fade — and before
  any section waiting on slow chained reads, which is why `payments-ui-test` §6 still does
  it now that its own claim is DOM state rather than a fade.

## Environment hazards

- Dev geocoding = `StubGeocodingGateway`: every address → village centre, so
  geofence-rejection paths are locally unreachable and locally-listed venues stack on one
  map point — drive pins by keyboard or assert "aimed === opened", never a pointer at a
  named pin.
- Search reads one page of 100: a venue beyond it has no pin or row until a narrower
  search reaches it (its sheet works by slug; paging the map is unbuilt).
- Behind a proxy, a dead API answers **502** (nginx may answer **504** on a stopped
  upstream); `neverArrived()` covers 0/502/503 and deliberately not 504 — a timeout may
  have committed.
- Shared-database rows whose bytes live in another worktree's media-store can 404 as local
  console noise.
