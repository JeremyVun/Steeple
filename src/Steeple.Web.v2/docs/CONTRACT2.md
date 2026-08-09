# CONTRACT2 — Wave 2: The Wayfinder & The Correspondence

> **Superseded 2026-08-08 — the hash routes named here are gone from the product.**
> `src/core/router.js` owns clean History-API paths (`/browse`, `/venue/{v}`,
> `/space/{v}/{r}`, `/apply/{v}/{r}`, `/journal`, `/desk[/{v}]`, `/letter/{id}`);
> every `#/…` shape it names still *opens* and is replaced in place by its clean
> path, with no deadline for removal. This brief is kept as the record of what
> was asked for at the time — see `docs/backlog/seo/design.md` SEO-D1/D2 and
> `docs/contracts/web.md` for what is true now.


Binding brief for the next build wave. It extends CONTRACT.md (still in force: art
direction §3, canonical Atlas amendment §3.1, module rules §4, verification §5) with three new
workstreams. Read CONTRACT.md first; this document only adds.

## 0. Standing guardrails (owner-set, non-negotiable)

- **Decorative richness lives in the world; instruments are calm.** Maps, panels,
  forms, and controls must read as sophisticated professional tools — never cluttered,
  never a "child's play toy" that talks down to the user. The world may be a storybook;
  the instruments are set like fine print.
- **Explorations ship as query-param feature flags** (`?tilt=`, `?map=`). The owner A/B
  tests live until an owner decision makes one presentation canonical.
  Variants share truth and interaction; only rendering language differs.
- **Design agents propose, not just execute.** Each workstream must deliver the
  canonical direction described here AND is invited to add one flagged variant of its
  own devising where marked. Cheap experiments welcome; canonical quality first.
- **Real-input verification is mandatory.** Debug-API screenshots prove rendering
  only. Every interactive affordance must be proven with real pointer/keyboard/wheel
  events (extend `tools/input-test.mjs` patterns; run against canonical Atlas). A
  closed overlay must never intercept hit-testing (`elementsFromPoint` audit — this
  bug already bit us once).
- All product facts come from `src/data/venues.js` and the demo store (§3). Statuses,
  schedule shapes, and validation mirror the real steeple schema — nothing invented.

## 1. Workstream A — The Wayfinder (geographic truth)

Discovery must be mediated by a map: users need to understand where things are in
real space. An inset map, available everywhere past arrival (expandable; unobtrusive
when collapsed), rendered as DOM/SVG in the overlay (not a three.js scene).

**Geographic truth:** church positions from real lat/lng in `data/venues.js`; the
W&OD trail; the Metro Orange Line with Vienna/Fairfax-GMU and Dunn Loring–Merrifield
stations; principal roads (Maple Ave, Park St, Blake Ln, Gallows Rd, Eskridge Rd);
scale bar; north indicator. Project lat/lng directly (equirectangular around the data
CENTER is fine at this extent) — the map never lies, even where the village compresses.

**Interaction (shared by all map variants):**
- Two-way scene sync: current focus (venue/room's venue) highlighted on the map;
  clicking a church pin = `setView('venue', …)` with the normal camera flight;
  clicking the map background at village depth does nothing (no accidental ascents).
- **"You are here" pin**: draggable home marker (persisted in localStorage). When set,
  every venue overlay/panel shows straight-line distance and an honest walk estimate
  ("~12 min walk"; ">1 hr" collapses to "by car"). No geolocation API in the demo —
  the pin is the mechanism. A "near me" sort/emphasis follows on the filter bar's
  result line where natural.
- Keyboard accessible (pins tabbable, pin-drag has a keyboard alternative), a11y
  announcements for map interactions.

**Canonical variant `?map=simple` (default):** the owner's reference is Google Maps'
"simple" basemap layer translated into brand: soft sage land, paper-cream roads with
clear width hierarchy, W&OD as a confident green ribbon, Orange Line as a single
accent stroke with dot stations, small terracotta pins, sparse well-set labels
(sans for roads, serif only for church names), generous margins. Vibrant like the
splash screen, calm like a tool. NOT monochrome ink/survey-plate style (owner
explicitly rejected), NOT cartoon.

**Agent-proposed variant(s):** at least one additional `?map=` value of the agent's
own devising, same truth + interaction. Document each variant in README.

## 2. The flows (analytical ground truth for Workstreams B & C)

**Guest — booking a space:** Orient (map + filters: activity, day/time, group size,
accessibility, price incl. Free) → Compare (shortlist; capacity/price/open-hours
fit/distance) → Inspect (one room: description, rules, accessibility, real weekly
open hours) → Commit (application: intent text ≤2000 chars, ONE activity type, group
size validated ≤ capacity, schedule = one-off date OR bounded weekly recurrence
{startDate, endDate required, daysOfWeek set, startTime–endTime}, checked against the
room's open hours; mock SSO exactly at this commitment point) → Await & respond
(track status; answer NeedsInfo; accept/decline a CounterOffer — accept books it,
decline returns it to Pending; withdraw) → Confirmed (see materialized occurrences).

**Host — listing & operating:** Place (church onto the Wayfinder: address → pin;
geography is the host's first act) → Verify (mock SSO → "Identity verified (SSO)"
chip, exact wording) → Describe rooms (name, capacity, price-or-free, amenities,
accessibility, accepted activities, house rules — the room's painted card
materializes in-world as fields are filled) → Set availability (weekly open-hours
painter + blackout dates) → Publish (draft → published; in-world the scaffolding
comes off) → Operate (the desk: incoming applications with intent + trust signals +
schedule-vs-availability conflict view; Approve / Ask a question / Decline /
Counter-offer a different schedule).

**Status model (mirror exactly):** Pending → (NeedsInfo ⇄ answer returns to Pending)
→ Approved | Declined | Withdrawn | Expired; CounterOffered counts as undecided,
ball in guest's court. Approval materializes booking occurrences (dates between
start/end on the chosen weekdays). Message thread open to both parties while
undecided.

## 3. Shared spine (built by the orchestrator BEFORE agents launch)

- `src/core/bus.js` extension: `state.mode: 'guest' | 'host'`, new views
  (`'apply'`, `'journal'`, `'desk'`, `'letter'`), hash routes for each, `?map=` flag.
- `src/data/store.js`: localStorage-backed application/booking store with the exact
  status machine above, validation (recurring requires endDate; groupSize ≤ capacity),
  occurrence materialization, message threads, counter-offers with history, and
  seeded in-flight correspondence (≥1 pending, 1 needs-info with thread, 1 approved
  with occurrences, 1 declined history; believable calm copy) so every state is
  demo-able from first load. Emits bus events on every mutation.
- Demo personas: guest "Maria Alvarez — Little Sparrows Playgroup"; host = admin of a
  chosen venue (switchable in host mode).
- Room open hours: seed per real steeple data (published rooms 08:00–22:00 all days),
  stored per-room so hosts can edit theirs.
- CTA rewire: room panel "Request this space" → `setView('apply', …)`.

## 3.1 Spine as built (binding — code against this, not against §3's sketch)

The spine landed on main. Frozen for parallel agents (the integration pass may
amend): `core/bus.js`, `core/engine.js`, `data/venues.js`, `data/store.js`,
`main.js`, `ui/index.js`, `ui/nav.js`, `ui/announcer.js`, `ui/dom.js`,
`index.html`, `tools/*`. If your workstream needs a spine change, ask the
orchestrator — do not edit these files.

**Bus** (`core/bus.js`): `state.mode` ('guest'|'host'), `state.applicationId`,
`state.map` (?map=, default 'simple'); `setMode(mode)`, `setMap(map)` (reloads,
route preserved); `setView(view, { venueId, roomId,
applicationId })`. Views 'apply' and 'journal' switch mode to guest, 'desk' to
host, 'letter' keeps the current lens. Hash routes: `#/apply/<v>/<r>`,
`#/journal`, `#/desk[/<venueId>]`, `#/letter/<applicationId>`. A cold-loaded
letter link carries only `applicationId` — resolve venue/room via the store.
New event: `'mode:change' ({ mode })`.

**Store** (`data/store.js`, localStorage-backed, in-memory in node; every
mutation emits `'store:change' ({ type, ... })`). Read the file header — it
names the schema files it mirrors. Surface: reads `guestApplications`,
`venueApplications(venueId)`, `getApplication`, `threadFor`, `countersFor`,
`openCounterFor`, `bookingFor`, `occurrencesFor`, `roomOccurrences`,
`openHoursFor`, `blackoutsFor`, `effectiveRoom` (host edits applied — prefer it
over `getRoom` wherever host edits should show), `placedVenues`, `homePin`,
`hostVenueId`, `venueSignals()` (per-venue status counts — the lanterns feed);
validation `validateApplication(draft)` → `{ ok, errors }` (live-validate with
it), `materializeDates`, `scheduleConflicts(venueId, roomId, schedule)` →
`{ clashes, outsideHours, blackoutDates }` (clashes are the only hard stop —
the desk shows the rest and the host decides), `hoursFit`; mutations
`submitApplication`, `withdraw`, `sendMessage(id, 'guest'|'host', body)` (a
guest answer resolves NeedsInfo), `acceptCounter`, `declineCounter`,
`askQuestion`, `approve`, `decline`, `counterOffer`, `setOpenHours`
(replace-all), `addBlackout`/`removeBlackout`, `editRoom` (publish gate: open
hours first), `upsertPlacedVenue`, `setHomePin`, `setHostVenue`, `resetDemo`.
Helpers/constants: `APP_STATUS`, `COUNTER_STATUS`, `UNDECIDED`, `DAY_LABELS`,
`daysToMask`/`maskToDays`, `todayIso`/`addDays`/`weekdayOf`/`nextWeekday`,
`GUEST_ID`, `ORGANIZERS`. Dates are 'YYYY-MM-DD', times 'HH:mm', venue-local.
Seeded correspondence covers every status; `tools/store-test.mjs` is the
regression gate — run it, and if you extend the store, prove new guards bite.

**UI mounts** (`ui/index.js` instantiates these; each module is self-managing —
subscribe to bus events yourself, control your own visibility, never assume
another module's views):
- A owns `src/ui/map/**` + `src/styles/map.css` — replace the stub;
  `createWayfinder({ announce, porch }) -> { element }`. A may also touch
  `ui/filters.js` (result-line distance emphasis) and `ui/venuePanel.js` /
  `ui/roomPanel.js` (a single distance line) — smallest possible diffs there.
- B owns `src/ui/guest/**` + `src/styles/guest.css` — replace the stub
  (including the placeholder apply sheet and its `.sheet--placeholder` CSS);
  `createGuestFlows({ announce, porch }) -> { element }`. The room CTA already
  routes to `setView('apply', …)`; `ui/requestModal.js` is deleted.
- C owns `src/ui/host/**` + `src/styles/host.css` — replace the stub;
  `createHostFlows({ announce, porch }) -> { element }`.
- D owns `src/journey/**`, `src/world/**`, and new `src/flows/world/**`. The
  spine left placeholder staging for the new views in
  `journey/composition.js` (marked "Wave-2 placeholder") and a placeholder
  ascend map in `journey/input.js` — replace both with real staging.
- `porch` is the shared top-right shelf (`.porch` in main.css). Mount order:
  journal tab (B), mode switch (C), map toggle (A, optional). Keep porch items
  small — a word, not a toolbar.
- `announce` writes to the `#a11y` live region; do not edit `ui/announcer.js`.
- `document.documentElement` carries `data-view` and `data-mode` for CSS hooks.

**Placeholders you must replace, not work around:** the guest stub's apply
sheet (B), the composition/ascend placeholders (D), the `.wayfinder`/`.hostdesk`
empty divs (A/C).

## 4. Workstream B — Guest correspondence ("the application is a letter")

Owns the guest-mode surfaces: the apply flow (letter composer as beautiful
stationery over the scene: intent, activity, group size, and the **week card** — a
7-day × time grid showing the room's real open hours where the guest paints a slot
and sets one-off vs "weekly until <date>", multi-day supported), the mock-SSO beat,
send (hand off to the world layer for the envelope flight), the **journal** (guest's
applications with statuses, threads as correspondence, counter-offer accept/decline),
and matching a11y announcements. The instruments bar applies hard here: the week
card and letter must feel like a fine printed form, not a toy.

## 5. Workstream C — Host correspondence ("keeping the doors")

Owns host mode: the quiet mode switch ("I have space to share"), venue selection,
the **desk** (letter board of incoming applications; each letter opens to intent +
trust signals + schedule ribbon vs the room's open hours and existing bookings),
the four decisions (approve → seal + occurrences; ask → thread; decline → kind
editable note; counter-offer → schedule proposal), the listing flow (place on map →
describe rooms → availability painter → publish), and host-side a11y.

## 6. Workstream D — Correspondence world layer (scene & camera)

Owns the in-world vocabulary both lenses share: envelope fold + flight to the church
door, lantern states at churches (pending = lit lantern, approved = warm steady
window glow, declined = quiet), wax-seal moment, soft bell on approval, booking
ribbons on room cards' week, scaffolding-off on publish, and the camera staging for
new views (`apply` = dolly to the room card desk-distance; `desk` = from-the-church
outward stance; `journal`/`letter` framing). Extends `src/journey/` and adds
`src/flows/world/`; must not regress wave-1 framing (re-run the canonical eight).

## 7. Division, order, verification

Suggested agents: A (Wayfinder), B (guest), C (host), D (world/camera) — parallel in
worktrees against this contract after the spine commit; distinct ports (5311–5314)
and /tmp prefixes; sequenced merges D → A → B → C, then an integration/tuning pass.
Every agent: CONTRACT.md §5 screenshot loop AND real-input tests for each new
affordance, both styles, plus `?map=` variants where relevant. Zero console errors.
Budgets: cumulative draw calls < 300 at village; no per-frame allocations.
