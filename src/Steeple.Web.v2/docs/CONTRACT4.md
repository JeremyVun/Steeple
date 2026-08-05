# CONTRACT4 — wave 5: the product grows up

Base: the wave-4 "roll" checkpoint. Three parallel worktree workstreams (A, B, D),
merged in that order, then a copy pass (C) on main. Each workstream owns whole
files; the seams are this document plus `src/data/catalog.js`.

## §0 Shared ground rules

- Modules talk only through `core/bus.js`, `data/store.js`, `data/catalog.js`.
- Match the repo's voice: sparse why-comments, self-documenting names. No new
  npm dependencies without flagging it in your report.
- Verify empirically: dev server on YOUR port, `tools/shot.mjs` screenshots you
  actually read, `tools/input-test.mjs` green before you finish. A shot with
  console errors is a failed shot.
- Worktree hygiene: your shell may reset cwd to the MAIN repo between commands —
  always use absolute paths inside your worktree; never run a destructive
  command with a relative path. Landmark check before you start:
  `src/data/catalog.js` must exist at your base; if not, merge main's checkpoint.
- Commit your work on your worktree branch in small, titled commits.

Ports and scratch names: A → 5321, `/tmp/steeple-a-*`; B → 5322,
`/tmp/steeple-b-*`; D → 5323, `/tmp/steeple-d-*`.

## §1 Ownership

| Workstream | Owns (may edit) | Must not touch |
|---|---|---|
| A — roll & overlays | `journey/roll.js`, `journey/input.js`, `ui/browse.js`, `ui/nav.js`, `ui/host/**`, `ui/guest/**`, `core/bus.js` (desk-variant change only), `styles/main.css` (roll/ambience/host/guest sections), `styles/host.css`, `styles/guest.css`, `tools/input-test.mjs` | `ui/map/**`, `data/**` |
| B — discovery surface | `ui/map/**`, `styles/map.css`, `styles/main.css` (browse-layout/mobile sections), `ui/venuePanel.js`, `ui/roomPanel.js`, `ui/hoverBanner.js`, `tools/map-test.mjs`, `tools/map-narrow.mjs` | `journey/**`, `ui/host/**`, `ui/guest/**`, `core/bus.js` (extend via your own module instead), `data/catalog.js` internals (consume only) |
| D — live API | `data/catalog.js` internals (signatures frozen), new `data/api.js`, `vite.config.js` (dev proxy) | everything else; NEVER edit `../steeple` |

`styles/main.css` is shared between A and B: keep additions in clearly-sectioned
blocks; merges are sequenced (A, then B, then D) and the orchestrator resolves.

## §2 The catalog seam

`src/data/catalog.js` is the product's one data surface. Signatures and shapes
are frozen (they mirror steeple's `/api/v1`; see the header comment):
`searchListings(query)`, `getListing(venueSlug, roomSlug)`,
`getVenueProfile(venueSlug)`, `getSuburbs()`, `getGeofence()`. B consumes it;
D re-implements its internals over the live API. All functions are async; UI
must tolerate latency (render, then fill) and `primaryPhotoUrl === null`
(lettered placeholder, like steeple's own `_RoomCard.cshtml`).

The 3D village keeps reading bundled `venues.js` — it is scenery. The bus's
`matching` venue-id set still drives splash lighting and pin dimming: B derives
it from catalog results (venueSlug set) and keeps emitting the existing
`filters:change` shape.

## §3 Behavioral contracts

**Roll (A).** One wheel tick anywhere on the splash fires the whole tween —
smooth, eased, no scrub-and-threshold for wheel input; an opposite tick during
the tween reverses it. Touch: a flick commits in its direction. Rolling up
begins the instant it is asked for, from any view: overlay sheets (desk, inbox,
letter, listing flow) choreograph away with the surface — they must never sit
frozen over a running roll. Clicking outside an open desk/inbox sheet dismisses
it instantly (back to `village`, mode preserved). Esc semantics inside panels
are unchanged. `__steeple.roll.{get,set}` stays for the harness.

**Desk variant (A).** Board ↔ ledger switches live, in place — no reload
(`setDesk`'s `reloadWith` is the bug). Budget: under ~100 ms, nothing else on
the page re-renders. Same treatment is welcome for `letter` if cheap, else note.

**Search pill (B).** One segmented control above the results list, per the
reference: Where (suburb typeahead fed by `getSuburbs`) · When ("Just once"
date, or weekly day chips + Morning/Afternoon/Evening bands) · How many (min
capacity) · Filters (the existing activity chips; amenities/accessibility
welcome if they fit quietly). Every change calls `searchListings` and re-renders
list, pins, and count. When-terms may be inert against the bundled seed (the
contract passes them through; D's live search answers them) — the UI must still
send them.

**Banners (B).** Every listing row shows a banner image from `primaryPhotoUrl`
(prefer card-sized variants); venue-level rows may use their first room's photo.
Null photo → lettered placeholder, never a broken image.

**Map (B).** The "you are here" pin and everything attached to it (homeline,
readout, near-line, distances-from-pin) is removed. Wheel-zoom and +/- steps at
least 2× today's speed (`wheelPxPerZoomLevel`/`zoomDelta`).

**Mobile sheet (B).** ≤900px: the list is a sheet over the map with a visible
drag handle and three detents — top (list fills, map hidden), middle (today's
split), bottom (map only, handle peeking). Transform-based, 60fps, works with
the roll and with property sheets. Keyboard/AT path: the handle is a button
cycling detents.

**Browse ambience (A).** The splash's mood carries into the product without
waking WebGL: CSS-only drift — the cloud-shadow wash moving over the paper, an
occasional bird silhouette near the top line. Subtle enough to ignore, off
under reduced motion.

**Live API (D).** Run steeple locally (`docker compose up -d postgres migrate`,
`dotnet run --project src/Steeple.Api` → :5200 — see the scout notes in the
task brief). Vite dev proxy `/api` → `http://localhost:5200`. Re-implement
catalog internals over `GET /api/v1/listings/search`, `by-slug`, `suburbs`,
`geofence`; venue profile derives from a room's venue block. Verify the seeded
slugs line up with the bundled venue ids the village and map use — report any
mismatch loudly. Photos come from `primaryPhotoUrl`/`photos[]`. Graceful
degradation: if the API is unreachable, catalog falls back to the bundled seed
and says so once on the console — the prototype must never white-screen.

## §4 Verification gates

All three: your own shots read and iterated; `node tools/input-test.mjs` green
(A updates it for the new roll semantics; B updates `map-test.mjs`/
`map-narrow.mjs` to the new panel reality — they still assert the deleted
collapse/edge behavior); `npx vite build` clean. D additionally proves live
data end-to-end: a shot whose list provably renders API-served content, and the
fallback path exercised with the API stopped.

## §5 Contract adjustments to raise with steeple (report, do not implement)

Running list — add to it in your report if you find more: (1) CORS absent on
the API — fine behind the dev proxy/BFF, blocks any separately-hosted browser
frontend; (2) no venue-profile endpoint (funnel is room-first) — the venue
sheet wants one; (3) bundled seed still has free rooms while steeple now
requires `PricePerHour > 0` — the demo data diverges from production truth.
