# Steeple — The Village · Interface Contract & Art Direction

> **Superseded 2026-08-08 — the hash routes named here are gone from the product.**
> `src/core/router.js` owns clean History-API paths (`/browse`, `/venue/{v}`,
> `/space/{v}/{r}`, `/apply/{v}/{r}`, `/journal`, `/desk[/{v}]`, `/letter/{id}`);
> every `#/…` shape it names still *opens* and is replaced in place by its clean
> path, with no deadline for removal. This brief is kept as the record of what
> was asked for at the time — see `docs/backlog/seo/design.md` SEO-D1/D2 and
> `docs/contracts/web.md` for what is true now.


This is the binding contract for the three parallel subsystems (**world**, **journey**,
**interface**) and the integration pass. If your code disagrees with this document, your
code is wrong. The scaffold files in `src/core/`, `src/data/`, `src/main.js`, and
`tools/` are **shared and frozen** — read them, code against them, do not edit them
(the integration pass may amend them; parallel agents may not).

## 1. What this is

A demo that answers: *what if a marketplace website were not pages at all?* Steeple's
discovery funnel (map search → filter → listing detail → "request this space") rebuilt
as a single continuous Three.js experience: a painted miniature of Vienna, Northern
Virginia at golden hour, where five real churches stand at their true relative
positions, and browsing is a guided camera journey instead of navigation between pages.

The data is real (`src/data/venues.js`, transcribed from steeple's production seed).
Every capacity, price, amenity, house rule, and address shown must come from that file.
Nothing is invented; nothing is omitted that the real funnel shows.

## 2. The experience script

1. **arrival** — Paper-warm sky, the serif wordmark, one line of copy, one call to
   action. The village is visible far below/beyond, softened by atmosphere. Calm, not a
   loading screen.
2. **village** (the "map") — The camera sweeps down into a slow, gentle drifting orbit
   over the valley. All five churches visible as landmarks. Hovering a church lifts a
   name banner and warms its lighting; a filter bar lets the visitor select activity
   types (Children, Sports, Community, Religious, Arts, Education, Music) — churches
   with a published room matching **all** selected filters stay lit (lantern/window
   glow); the rest visibly rest (dimmed, never hidden — honesty over drama).
3. **venue** — Clicking a church flies the camera there in one confident, snappy move
   (~1.2s, eased, never a slow float). The church fills the frame; its rooms present
   themselves as pickable elements in the world around/inside it. A restrained overlay
   gives the venue's name, suburb, verification state, parking/transit.
4. **room** — Picking a room moves the camera into an intimate framing and opens the
   detail panel: description, capacity, price (serif, `$45/hr` or `Free`), amenities,
   accessibility features, accepted activities, house rules, and the primary CTA
   **"Request this space"** (terracotta, the one action). CTA opens a small honest
   modal: this is a demo — link out to the real steeple funnel pattern.
5. **Back navigation** at every depth (Esc, breadcrumb, and clicking empty ground zooms
   out one level). Deep links `#/browse`, `#/venue/<id>`, `#/room/<venueId>/<roomId>`
   restore state on load (already wired in `core/bus.js`).

The Renovation Annex (status `draft`) exists in the world as a small building under
renovation (scaffolding) but is not pickable and never appears in filters — the world
honestly reflects what discovery hides.

## 3. Art direction — "a neighbourly noticeboard, painted"

Steeple's brand (docs/DESIGN_SYSTEM.md in the steeple repo) is warm paper, sage, and
terracotta; serif for moments, sans for work; honest and calm — no urgency mechanics,
no dark patterns. The 3D translation:

- **Palette is the brand**: sky/atmosphere from paper `#FBF7F0` through warm gold;
  terrain in sage family (`#5B7553`, tints toward `#E7EEE3`); roofs, doors, map-pin
  moments in terracotta (`#C0623F`); ink `#2A2620` only for text. Fog is paper-colored
  — the world dissolves into the page.
- **Painted miniature, not photorealism**: stylized low-poly forms with hand-tuned
  vertex color gradients, soft long-shadow golden-hour light, gentle bloom, a hint of
  vignette. Think storybook / tilt-shift model village. No textures from photos,
  no PBR-realism, no gray concrete.
- **Each church is a distinct character** matching its data: Grace Community (large
  fellowship hall, welcoming, classic white steeple), Vienna Presbyterian (historic,
  by the W&OD trail ribbon), Oakton Baptist (suburban, big gym volume + parking lot),
  Dunn Loring UMC (friendly, near a tiny Metro station motif), Merrifield Fellowship
  (modern, clean geometry, near the Mosaic District). Landmarks small in count, big in
  silhouette.
- **Life, quietly**: drifting clouds, birds, swaying trees, dust motes/fireflies in the
  golden light, windows that glow. Motion is slow and ambient — the village breathes,
  it never performs.
- **Type**: serif `Iowan Old Style, Palatino Linotype, Palatino, Georgia, serif` for
  names/prices/moments; platform sans for labels/body. Never body text in serif; never
  uppercase the serif.

### 3.1 Amendment — Atlas is canonical

**Superseded 2026-08-09:** the runtime scenery comparison was retired by owner
decision. Atlas is the one village presentation: continuous rolling terrain, honest
relative geography, a gentle orbit, and tilt-shift model-village intimacy. World and
Journey derive framing from `World.anchors`; there is no scenery-selection state or
query flag. The flat/world-off path remains because it is a functional performance,
accessibility, and deep-link fallback rather than a competing art direction.

## 4. Module contracts

Communication only via `src/core/bus.js` (`bus`, `state`, `setView`, `setFilters`,
`setHover`) and the `World` object below. Import nothing across subsystem directories.

### World — owns `src/world/**` (agent A)

```js
export async function buildWorld(engine) -> World
World = {
  anchors: Map<venueId, {
    position: THREE.Vector3,          // ground point of the church
    rooms: Map<roomId, {
      position: THREE.Vector3,        // where the room presents itself
      normal?: THREE.Vector3,         // suggested approach direction for the camera
    }>,
  }>,
  pickables: THREE.Object3D[],        // meshes with userData.venueId (and userData.roomId
                                      // for room affordances); journey raycasts these
  setHighlight(venueId|null, roomId|null),  // hover feedback in-world
  setFiltered(Set<venueId>),          // lit vs resting (all lit when filter empty)
  setView(view, venueId, roomId),     // world reacts to depth (e.g. present rooms)
  update(dt, elapsed),                // ambient animation; no per-frame allocation
}
```

World also listens on `bus` if convenient, but the four methods above are the required
surface. Room pickables should exist (at least) once their venue is entered. The sky,
lighting, terrain, vegetation, buildings, and ambient life all belong to world.

### Journey — owns `src/journey/**` (agent B)

```js
export function createJourney(engine, world) -> { update(dt, elapsed) }
```

Owns: the camera at all times, view transitions (snappy eased flights, ~1.0–1.4s;
crossfade under `state.reducedMotion`), the ambient village orbit drift, pointer
raycasting against `world.pickables` (hover → `setHover` + `world.setHighlight`,
click → `setView`), keyboard navigation (Tab/arrows cycle venues or rooms with visible
focus via `setHover`, Enter descends, Esc ascends), scroll-to-descend on arrival, and
postprocessing (may replace `engine.render`; subtle bloom + vignette; respect
`state.quality === 'low'` by skipping post). Clicking bare ground/sky ascends one
level. Never fight the user: input during a transition retargets it.

### Interface — owns `src/ui/**` and `src/styles/**` (agent C)

DOM overlay inside `#ui` (`pointer-events: none` root; interactive children opt in).
Owns: arrival title + CTA, filter bar (activity pills, sage when selected, result count
"9 spaces · 5 churches" honestly updated), hovered-venue name banner, venue overlay
(name, suburb, "Identity verified (SSO)" chip — exact wording, parking/transit),
room detail panel (all fields from data, price in serif, Free shown as `Free`, CTA
"Request this space" → honest demo modal), breadcrumb/back affordance, the `#a11y`
live-region mirror (announce view changes and panel content textually), and a
reduced-motion-friendly experience. Keep `:root` tokens; restyle everything else as
needed. All panels enter/exit with quick soft transitions (CSS, 150–250ms). WCAG AA
contrast on all text.

### Scaffold (frozen for parallel agents)

`core/engine.js` — renderer/scene/camera/loop; `engine.onUpdate(fn)`; `engine.render`
replaceable by journey. Sets `window.__steepleReady` after 10 frames (do not remove).
`core/bus.js` — state machine + events + hash deep links. `main.js` — boot order and
`window.__steeple` debug API. `data/venues.js` — canonical data.

## 5. Verification protocol (mandatory, every iteration)

You cannot judge this work from code. After every meaningful change:

```bash
cd <YOUR_WORKTREE_ABSOLUTE_PATH>
npx vite --port <YOUR_PORT> &   # once, keep running (background)
node tools/shot.mjs "http://localhost:<YOUR_PORT>/?q=low" /tmp/<YOUR_PREFIX>-arrival.png --wait 2000
node tools/shot.mjs "http://localhost:<YOUR_PORT>/?q=low" /tmp/<YOUR_PREFIX>-village.png --eval "__steeple.setView('village')" --wait 3000
node tools/shot.mjs "http://localhost:<YOUR_PORT>/?q=low" /tmp/<YOUR_PREFIX>-venue.png --eval "__steeple.setView('venue',{venueId:'grace-community-vienna'})" --wait 3000
node tools/shot.mjs "http://localhost:<YOUR_PORT>/?q=low" /tmp/<YOUR_PREFIX>-room.png --eval "__steeple.setView('room',{venueId:'grace-community-vienna',roomId:'fellowship-hall'})" --wait 3000
```

Then **open each PNG with the Read tool and look at it**. Judge it as art direction:
composition, palette, readability, whether it would surprise and delight. Iterate until
it does — "renders without errors" is nowhere near done. The harness exits non-zero and
prints console errors; zero errors is the floor. Screenshot at least the four canonical
states before declaring done. (Headless uses software GL — slightly flat output and a
missing effect or two is acceptable there; broken geometry/composition is not.)

## 6. Budgets & hygiene

- 60fps target on Apple Silicon at `q=high`; the `q=low` path must stay legible.
  Draw calls < ~300 (merge geometry, reuse materials); zero per-frame allocations in
  `update` hot paths (preallocate vectors).
- No new runtime dependencies. Three.js addons via `three/addons/...` are fine.
- Accessibility is brand: everything reachable by keyboard, `#a11y` announces state,
  reduced motion honored.
- Copy follows the brand: calm, precise, no exclamation marks, trust wording exactly
  "Identity verified (SSO)".
