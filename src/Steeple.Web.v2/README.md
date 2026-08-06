# Steeple — The Village

Steeple is a hyperlocal marketplace for community space: neighborhood venues
rent out their halls, studios and gyms by the hour to the playgroups, classes,
rehearsals and clubs that hold a neighborhood together. Churches are the
beachhead — the demo's five real listings are all churches today — but a
venue is a venue: the same funnel fits a library or a community center just
as well.

This is that discovery funnel with the pages taken away. Instead of separate
pages for search, results, listing and request form, there is one continuous
Three.js scene: a painted miniature of Vienna, Northern Virginia at golden
hour, where five real churches stand at their true relative positions. A real
map takes the page and the results read beside it. Searching lights the churches
that answer. Choosing one flies you to it. Choosing a space opens it like a page
in a pop-up book, and the sheet beside it carries the whole listing.

The funnel does not stop at the listing. Asking for a space opens a request, the
requests you have sent live in an inbox, and the same village turns around into
the view of the church answering them — one world, seen through two lenses.

Every capacity, price, amenity, accessibility feature, house rule and address
comes from `src/data/venues.js`, transcribed from steeple's production seed
data. Nothing is invented, and nothing the real funnel shows is left out — the
Renovation Annex at Oakton Baptist stands in the world under scaffolding
because it is still a draft, unlisted and unpickable, until a host finishes its
listing and publishes it.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
```

No build step is needed to look at it; `npm run build` produces the static
bundle. The project Dockerfile builds that bundle and serves it from nginx on
port 8080; nginx also proxies same-origin `/api` requests to `api:8080` on the
Compose network. The runtime image contains only nginx and the static files.

```bash
npm run build:flat # → dist-flat/, the product with no village in it
```

`build:flat` sets `VITE_WORLD=off`, and the engine, the world and the journey
are behind a dynamic import, so that build does not contain three.js at all —
373 kB against 1.05 MB of JS raw (116 kB against 301 kB gzipped) — and never
asks for a WebGL context. It opens on the
browse surface instead of the title page; every route, the property sheets and
the booking flow work exactly as they do with the village behind them. The
wordmark still rolls up to the title page, which without a village is paper.
`?world=off` is the same thing in development, from the full bundle.

## URL flags

| Flag | Values | What it does |
| --- | --- | --- |
| `?style=` | `diorama` (default), `atlas` | Which scenery the world is staged in. |
| `?q=` | `high` (default), `low` | `low` skips postprocessing and thins the scatter. |
| `?tilt=` | `on`/`1`/`true`, `off`/`0`/`false` | Tilt-shift strength. Absent leaves the tuned default. |
| `?map=` | `simple` (default), `dusk` | Which toning the discovery map's tiles are given. |
| `?letter=` | `stationery` (default), `ledger` | How the guest's requests are set. |
| `?desk=` | `board` (default), `ledger` | How the host's requests are set out. |
| `?lantern=` | `lamp` (default), `window` | How a church shows the requests it holds: a lantern lit by the door, or the building's own windows carrying the whole signal. |
| `?world=` | `on` (default), `off` | `off` leaves the village out entirely: no renderer, no WebGL, straight to the browse surface. What `npm run build:flat` bakes in. |

Every flag is read once at boot, in `src/core/bus.js`, onto `state`; nothing
downstream reads the URL. A value the flag does not know falls back to the
default. The scenery switcher (bottom centre, past arrival) reloads the page with
`?style=` set and the current deep link preserved, so a comparison never loses
your place — it steps aside, with the discovery panel, while a request or the
hosting view is open, since those views have a subject of their own.

### Deep links

- `#/village` — all five churches, the discovery panel open
- `#/venue/<venueId>` — one church and the spaces it rents
- `#/room/<venueId>/<roomId>` — one space, framed and detailed
- `#/apply/<venueId>/<roomId>` — writing the request, at the room's own distance
- `#/journal` — the guest's inbox, the village breathing behind it
- `#/desk[/<venueId>]` — hosting: requests waiting, spaces listed, their
  church at their shoulder
- `#/letter/<applicationId>` — one request opened, in whichever lens it belongs to
  (a cold link carries only the application; the world asks the store where that is)

e.g. `#/room/grace-community-vienna/fellowship-hall`. Deep links restore state
on load and the hash follows you as you move.

## What the village says about your requests

The world is the status board. Nothing here is decoration for its own sake —
every mark is read from the demo store and re-derived on every change.

- **A lantern by the door** burns where a church has requests still undecided
  (pending, needs-info or counter-offered). It breathes slowly; it never blinks.
- **Steady window light** means a booking is in the book — no flicker, warmer
  glass, and light spilled on the path. A church that has said no is simply
  quiet. Filters still own the body of the building: a church resting under a
  filter keeps its lantern, dimmed.
- **A week ribbon** is printed on the front lip of a room's card, Sunday to
  Saturday, with the weekdays it is committed to painted terracotta.
- **Sending** folds a request into an envelope in a handful of visible steps and
  flies it to the church door in under two seconds; the lantern lights when it
  lands.
- **Approving** presses wax at the door and rings one soft bell — never before
  the visitor's first gesture, never under `prefers-reduced-motion`.
- **Publishing** the Renovation Annex strikes its scaffolding like scenery
  between acts, and the room takes its place on the grass, pickable like the rest.
- **Placing** a church puts it at its own projected lat/lng, mapped into whichever
  staging you are looking at by the same fit that carries the five.

## The two scenery styles

Both draw the same churches, props and data; what changes is the staging.

- **diorama** — a paper theatre. The ground is a stack of cut contour cards,
  the distance is a set of silhouette flats that parallax as the camera drifts,
  and entering a church unfolds its own little stage set the way a pop-up book
  opens on a page. Low, theatrical, long-lens camera.
- **atlas** — the continuous painted miniature. Rolling sage terrain, honest
  geography, lanes that go somewhere, a pond catching the low sun, seen from a
  gentle drifting orbit inside the valley's own rim.

## The discovery surface

The village arranges the churches for the sake of the picture. The discovery
surface does not — past the roll it is the page. It carries a real map: Leaflet
over OpenStreetMap tiles, pannable and zoomable, with every church at its true
latitude and longitude under a terracotta teardrop pin, holding the left of the
page floor to ceiling.

A pin answers the question a map is asked: **what would this cost**. Beside the
teardrop stands a small paper tag carrying the church's price band — `$15–45/hr`
where it holds spaces at different rates, `$45/hr` where one figure is the whole
truth, `Free` where nothing is charged — read from the search's own answer, so a
narrowed map quotes only the rooms that match and a church with nothing matching
falls back to its name in italic. The church is under the price, out when you
point at one, and first in the pin's accessible name throughout. The tag is the
target: it is the biggest thing a pointer has to aim at here.

Beside it stands the **search pill**: one segmented control asking the four
questions steeple's own funnel asks — Where (a suburb typeahead), When (a date,
or the days you meet, plus a morning/afternoon/evening band), How many (the
smallest space that will hold you), and Filters behind a funnel (what your group
does, what the space has, getting in and around). Every touch of it calls
`searchListings` and the whole surface answers at once: the rows, the count
above them, and which pins stand and which rest. The schedule terms are inert
against the bundled seed and sent anyway — the live search answers them.

Where the search is looking is said once, by the control that changes it: with
no suburb chosen the Where segment carries the geofence's own name for the area.
There used to be an eyebrow saying it again over the results, which repeated the
segment directly above it and went on naming the whole area after the search had
been narrowed to one suburb. The count line has the head to itself.

Under it the spaces themselves, **two cards across**, each under its own
photograph from its `primaryPhotoUrl` — a lettered plate in the brand's tones
when a church has uploaded none — with the name, the church and suburb, and
seats and price on the last line. A room is chosen by the look of it long before
the price is read, so the column gave the map back some of the page and spent it
on the pictures. Pins and cards are the same truth: hovering either warms that
church in the world, choosing either opens it, and the church you are looking at
carries the selected mark. The scene itself is scenery — buildings are never
picked by the pointer — so this is where the village is chosen from. It
withdraws while a request, the inbox or the hosting view is open.

The map is a browsing instrument, so it is paced like one: a notch of the wheel
moves 0.65 of a zoom level and a drag carries the ground 1.3× the pointer.
Both numbers are measured, not asserted — see `tools/map-feel.mjs`.

There is no "you are here". A pin the visitor plants themselves was a promise
the map could not keep: every distance measured from it was a straight line
dressed as a walking time. The map answers where the churches are.

**On a phone.** The cards fall back to rows beside a thumbnail — a sheet is read
a detent at a time, and a detent has to be worth stopping at. At 900px and under
the map takes the whole page and the list is
a sheet drawn up over it on three detents — the list filling the page, the two
sharing it, and the map with the page and the handle peeking off its foot. Drag
the handle, or press it: it is a real button that steps through the detents and
answers the arrow keys. The search pill keeps the top of the page at every
detent, so a different question is always one tap away.

A church or a room opened on a phone is **a sheet over the map, not a page
instead of it**. A band of map stands above it with the church you chose panned
into it, so you never lose your place — and the fastest way to the next church
is not back-then-tap, it is tapping its tag through the band and letting the
sheet change under your thumb. The sheet wears the same handle the list does and
is put down by dragging it down: a short drag springs back, a real one or a
flick retreats exactly one level, room to church and church to the map. The
handle is a button as well, and the same step is written at the top of the sheet
— the church sheet's used to be a line at the foot of a scroll you had to reach
the end of to find. None of it ever goes to the title page: that is the
wordmark's chevron, and now the only thing that means it.

Both `?map=` tonings show the same tiles, pins and interactions; only the
grading differs.

- **simple** — the tiles warmed and quieted toward the brand's paper, so the
  cartography reads as part of the page rather than pasted onto it.
- **dusk** — the same truth read by lamplight: the land goes to ink and the
  roads keep their own colours. The village's golden hour, inside the
  instrument.

## Asking for a space

Requesting a space opens one sheet over the village rather than a form page: a
heading naming the room, a note in your own words, the two facts a church needs,
and a **week card** — the room's real open hours, drawn from its published
availability, where you drag down a day to choose your hours and set one-off or
*weekly until*. Hours another group already holds are drawn as quietly
unavailable. One identity step stands at the commitment point and nowhere else.
Sent requests live in the **Inbox**, where a question can be answered, a
church's suggested time accepted or declined, a booking's dates read, and a
request withdrawn.

Two `?letter=` renderings share exactly the same truth and the same
interaction; only the hand changes.

- **stationery** (default) — a printed sheet: warm paper, an engraved rule under
  the heading, serif for names, dates and prices, generous margins.
- **ledger** — the parish register: hairline rules, no rounded corners, the
  inbox as a ruled table of columns, the week card as a plain timetable.

| Key | Where | What |
| --- | --- | --- |
| `←` `→` `↑` `↓` | week card | Move over the grid, week to week at the edges |
| `Enter` / `Space` | week card | Paint an hour, or add and remove a weekday |
| `Shift` + `↑` `↓` | week card | Trim or extend the end of the chosen hours |
| `PageUp` / `PageDown` | week card | Previous or next week |

## Hosting — the church's side

"I have space to share" on the porch turns the same village around: instead of
looking for a room you are the church that has one. Hosting is the requests
waiting on an answer, each opening to what was asked, who is asking (with the
trust the platform can actually vouch for), and the
**schedule ribbon** — the requested week laid over the room's real open hours,
its blackout dates and the bookings it already stands behind, with any
collision drawn where it happens. Four decisions follow: approve (which seals
the booking and materializes its dates), ask a question, decline with a kind
note written for you, or counter-offer a different time in an editor whose
every change redraws the ribbon live.

The listing flow — Place, Verify, Describe, Availability, Publish — puts a new
church on the map with a dragged pin, and takes the scaffolding off a draft
room. Publishing needs open hours first; the weekly painter is a drag along a
day (or arrows and Space) and writes windows straight through `setOpenHours`.
Discovery answers immediately: the published space joins its church's list of
spaces to rent, the village counts it, and the note about a space still being
prepared is gone, because those surfaces read the store rather than the seed.

Two rendering languages share that truth, chosen with `?desk=`:

- **board** — each waiting request stands as a card, quoted and docketed, laid
  out on a board the way post is laid on a table.
- **ledger** — the same requests ruled into a parish day-book: one line each,
  with the schedule ribbon drawn small beside it, so a week of collisions can
  be read down a column.

## Keyboard and accessibility

Accessibility is part of steeple's brand, not a bolt-on.

| Key | Where | What |
| --- | --- | --- |
| `Tab` / `Shift+Tab` | anywhere in the scene | Cycle churches (or the current church's spaces) with visible focus |
| `←` `→` `↑` `↓` | in the scene | Same cycle |
| `Enter` / `Space` | in the scene | Go one level deeper into whatever is focused |
| `Esc` | anywhere | Come back up one level; an open drawer, or the opened map, closes first |
| `Esc` | in a request | Back to wherever that request was opened from — the room, the inbox, hosting |
| `↓` / `Enter` / scroll | arrival | Come down into the village |
| `Tab` then `Enter` | on a map pin or list row | Open that church from the panel |
| `↑` `↓` | on the sheet's handle (narrow) | Raise or lower it a detent |
| `Esc` | while the panel owns focus | Step out of the panel without leaving the view |

The overlay keeps its own tab order — while focus is inside a panel, `Tab`
belongs to the panel. `#a11y` is a live region that mirrors every view change
in words: where you are, what matched, and the full contents of a listing
including price, accessibility, amenities, accepted activities and house rules.
`prefers-reduced-motion` replaces every camera flight with a soft paper
crossfade and stills the ambient drift. Text meets WCAG AA on its own paper.

## Verification tools

Rendering is judged by looking, not by whether it throws.

```bash
# screenshot any state (prints console errors, exits non-zero if any)
node tools/shot.mjs "http://localhost:5173/?q=low#/village" /tmp/village.png --wait 3000

# a batch of states, in parallel; names prefixed with the style to render
tools/shots.sh myprefix "diorama-village:/village" "atlas-room:/room/oakton-baptist/gymnasium"

# real mouse/wheel/keyboard through the scene (no debug API)
node tools/input-test.mjs "http://localhost:5173/?q=low"

# real clicks through the printed layer: pills, space cards, modal, switcher
node tools/ui-test.mjs "http://localhost:5173/?q=low"

# the request layer in the world, both styles: lanterns, ribbons, a sent
# request in flight, wax at the door, the annex published, a church placed
node tools/world-test.mjs "http://localhost:5173"

# the demo store's status machine and validation
node tools/store-test.mjs

# real clicks, keys and typing through the search pill, the rows, the pins and
# the zoom (run per ?map=)
node tools/map-test.mjs "http://localhost:5173/?q=low" simple

# close-up of the surface, with a panel of the pill open if you want one
node tools/map-shot.mjs "http://localhost:5173/?q=low" simple filters

# the phone: a real finger on the sheet's handle, through all three detents
node tools/map-narrow.mjs "http://localhost:5173/?q=low" 390x844

# do the church and room sheets stand on the page, or do they scroll inside
# themselves? every seeded listing measured, at a viewport and a map share
node tools/panel-fit.mjs "http://localhost:5173/?q=low" 1440x900 [58%]

# real clicks through the sheets: a space card, the request CTA, and the room
# still on the page behind the booking sheet — both scenery styles
node tools/panel-input.mjs "http://localhost:5173/?q=low"

# the guest surface's own guards: pins that price the map, the phone's way back
# (real taps and real drags), the account chip, the address copying, and the
# room sheet keeping its photograph when /api/v1 is not there at all
node tools/surface-test.mjs "http://localhost:5173/"

# how much map a gesture actually buys — real wheel, real drag, both measured
node tools/map-feel.mjs "http://localhost:5173/?q=low"

# the paper, stretched fourteen times, so a wash a few units of grey deep can
# be looked at; --css-file reinstates an older ambience to compare against
node tools/band-probe.mjs "http://localhost:5173/?q=low" /tmp/band

# the product with no village: no WebGL asked for, and the whole funnel by hand
node tools/world-off-test.mjs "http://localhost:5173/?q=low&world=off"
node tools/world-off-test.mjs "http://localhost:4173"   # against the flat dist

# real clicks, drags and typing through the guest's side: CTA → composer →
# week card → identity → send → inbox → counter → answer → Esc,
# plus an elementsFromPoint audit of every closed surface
node tools/guest-test.mjs "http://localhost:5173/?q=low"
node tools/guest-test.mjs "http://localhost:5173/?q=low&letter=ledger"

# real clicks through the host's side: mode switch, requests, the four
# decisions, the hours painter, the listing flow, Esc and hit-testing
node tools/host-test.mjs "http://localhost:5173/?q=low"
node tools/host-test.mjs "http://localhost:5173/?q=low&style=atlas&desk=ledger"

# the hosting journey against the real steeple API on :5200 — an empty draft to
# a room the service holds — then the same journey with every call refused, then
# the same flow given hostile input at every field
node tools/host-publish-test.mjs "http://localhost:5173/?q=low&world=off"
node tools/host-offline-test.mjs "http://localhost:5173/?q=low&world=off"
node tools/host-input-test.mjs   "http://localhost:5173/?q=low&world=off"

# the whole story in one session, both styles: a request written and sent, the
# world flying it, the church answering, the counter accepted, the village reset
node tools/wave2-test.mjs "http://localhost:5173" --shots w2
```

`shot.mjs` accepts `--eval "<js>"` to drive `window.__steeple`
(`setView`, `setFilters`, `setHover`, `state`, `engine`, `world`) before the
shot. Headless uses software GL, so judge composition and grade there, never
performance.

## Module map

```
index.html            canvas, #ui overlay, #a11y live region
src/main.js           boot order (two of them: with the village, and without)
                      and the window.__steeple debug API
src/core/
  engine.js           renderer, scene, camera, frame loop
  bus.js              state machine, events, hash deep links, URL flags
src/data/venues.js    the five churches and their spaces — the only source of truth
src/world/            everything you look at
  index.js            builds the world, exposes anchors/pickables/highlight/filter/view
  sky.js backdrop.js  golden-hour light, paper sky, silhouette ridges
  stage-diorama.js    paper-theatre staging: contour cards, flats, pop-up sets
  stage-atlas.js      terrain, roads, pond, scatter
  churches.js         the five landmarks, each a character built from its data
  rooms.js            a space as a pop-up model of itself
  props.js ambient.js annex, parking, metro motif, clouds, birds, motes
  builder.js materials.js palette.js  merged geometry, paper shading, brand color
src/flows/world/      the requests, in the world
  index.js            reads the store, drives the rest of this folder
  lanterns.js         lantern by the door, light in the windows (?lantern=)
  envelope.js         a sent request's fold and flight, and the wax seal
  bell.js             one soft bell, gesture-gated and reduced-motion aware
  ribbons.js          the committed week, printed on a room's doorstep
  placed.js           churches a host has placed, at their projected lat/lng
src/journey/          everything you feel but never see
  composition.js      where the camera wants to be, per style and depth
  rig.js              flights, retargeting, the reduced-motion cut
  input.js            pointer, wheel, keyboard, and the way back out of a request
  post.js             bloom, tilt-shift, warm grade, vignette
src/ui/               the printed layer over the world
  arrival.js nav.js venuePanel.js roomPanel.js
  hoverBanner.js styleSwitcher.js announcer.js copy.js dom.js
  account.js          who you are, on the porch — and the way to stop being them
  rail.js             the phone's way back: a property sheet you can put down
  map/                the discovery surface — the product past the roll
    index.js          the surface: head, count, scene sync, withdrawal
    atlas.js          Leaflet + OSM tiles, pins, framing around what can be seen
    search.js         the segmented search pill; the one caller of searchListings
    banner.js         a room's photograph, or a lettered plate in its place
    sheet.js          the narrow page's three-detent drag sheet
    results.js        the spaces as cards, sharing the pins' states
    filters.js        the chip groups behind the funnel segment
  guest/              requests: the one you send and the ones you keep
    index.js          mounts the surfaces, the porch tab, the sent slip
    composer.js       the apply flow as stationery
    weekCard.js       the room's real week, painted by pointer or keyboard
    sso.js            the identity beat at the commitment point
    journal.js        the inbox, sorted by whose move it is
    letter.js         one request opened: thread, counter-offer, dates held
  host/               hosting — the church's whole lens
    index.js          the mode switch, routing, the host's two views
    desk.js           requests waiting and spaces listed (board and ledger)
    letter.js         one request opened, and the four decisions
    ribbon.js         the schedule ribbon: a request over a real week
    painter.js        the weekly open-hours painter
    listing.js        Place · Verify · Describe · Availability · Publish
    model.js          what the host's side knows, read out of data/store.js
src/data/store.js     applications, bookings, threads — the demo store
src/styles/main.css   design tokens, the roll, the shared type primitives
src/styles/map.css    the discovery panel, in both ?map= tonings
src/styles/panels.css the church sheet and the room sheet in the right rail
src/styles/guest.css  the stationery and the ledger variant
src/styles/host.css   hosting, a request, the ribbon, the painter
tools/                screenshot and real-input harnesses
docs/CONTRACT*.md     the wave briefs — the decisions the code's comments cite
```

## Honesty

The one action in the experience — **Request this space** — is real: the guest
signs in (the dev provider in development, SSO in production), and the request
is submitted to the steeple API under that person's name. When the API cannot
be reached, the request is kept in the browser and says nothing else. No
countdowns, no scarcity, no dark patterns. The churches, the rooms, the prices
and the open hours are real, and so is the booking.
