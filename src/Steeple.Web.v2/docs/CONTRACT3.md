# CONTRACT3 — Wave 3: the instrument earns its place

Owner steers, 2026-08-04. Binding for both workstreams. CONTRACT.md §1–3 and
CONTRACT2.md remain in force where not superseded.

## The steers

1. **Scene picking is gone** (done on main, `80a3f8e`): the pointer never
   selects a building. Churches and rooms are chosen through the instruments —
   map pins, lists, keyboard. Hover from instruments still warms the world.
2. **No letter role-play.** "Your letters" becomes **Inbox**; letters become
   requests; plain product language throughout.
3. **The Wayfinder becomes a real map**: Leaflet 1.9.4 + OpenStreetMap raster
   tiles — the exact stack of `../steeple`'s web funnel — pannable, zoomable,
   browseable.
4. **The map moves to a left-docked discovery panel**; the chosen property's
   sheet opens on the right. One coherent reading: *where* on the left, *the
   world* in the middle, *the thing you chose* on the right.
5. **Every affordance and every line of text must earn its place.** The
   freestanding bottom filter bar is deleted; filtering folds into the
   discovery panel, progressively disclosed (steeple DESIGN_SYSTEM §8.12b
   spirit: primary line always visible, facets behind one quiet trigger).

## Binding design — the discovery panel (Workstream A)

- Left-docked card, visible in `village` / `venue` / `room`; absent in
  `arrival` and all CORRESPONDENCE_VIEWS (same withdrawal rule as the old
  Wayfinder). Collapsible to a slim edge affordance; remember state in-session.
- Contents, top to bottom:
  1. **Head**: area name ("Vienna & Merrifield, Virginia") + live result line
     from `copy.js` `resultLine(state.filters)`.
  2. **The map**: Leaflet, `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`,
     maxZoom 19, attribution `© OpenStreetMap contributors` (mandatory, keep
     legible). Tile pane toned to the paper palette via CSS filter; `?map=`
     flag keeps `simple` (default) and `dusk` as the two tonings. Terracotta
     teardrop `L.divIcon` pins per steeple DESIGN_SYSTEM §8.6 (30×38, paper
     stroke, white dot; selected = scale 1.15 + ink stroke). Filtered-out
     churches: pin dimmed, still labeled.
  3. **Results list**: the five churches as compact rows (name, suburb,
     published-space count, price range). Rows and pins are the same truth.
  4. **Filters**: one quiet disclosure ("Filter · n" when active) opening the
     activity chips; `setFilters` on the bus unchanged; matching still lights
     the world. The draft-room note does not appear here (the venue sheet
     already carries it).
- **Behavioral contract** (interaction semantics — read twice):
  - Pin/row hover → `setHover(venueId, null)`; leave → clear. (Camera framing
    bias on hover is intended.)
  - Pin/row click → `setView('venue', { venueId })`. Current venue pin/row
    carries the selected state, synced on `view:change`.
  - Pointer events on the panel must `stopPropagation` (register in
    `ui/index.js`'s surface list) — wheel over the map zooms the map, never
    dollies the camera.
  - While the panel owns focus, Esc collapses/blurs the panel and must
    `stopPropagation`; otherwise Esc keeps its world meaning (ascend).
  - "You are here": keep the store home pin (`store.js` home-pin) as a
    draggable Leaflet marker + the distance readouts feeding the sheets.
  - Two-way sync stays: `view:change` marks current pin; `store:change`
    (`venue-placed`) shows unpublished placed churches as quiet non-clickable
    marks.
- **Right side**: `venuePanel` / `roomPanel` stay on the right rail;
  reformat for balance against the left panel (spacing, width, hierarchy) —
  no behavior change. Fix `roomPanel.js`'s demo line to plain language:
  "A demo of the request step — everything stays in this browser."
- Narrow viewports: panel becomes a bottom sheet (map above list), verified at
  420×860.

## Copy voice — Workstream B

- Guest tab and crumbs: **Inbox** (badge count stays). Letter → **request**
  everywhere user-facing; writing one is "sending a request"; the host
  "answers requests". Nav crumb "A letter" → the request's plain subject
  ("Request to <shortName>" or similar, your taste). "Your letter" (apply)
  → "Your request".
- Host side: same de-lettering ("Letters · 3" tab → "Requests · 3", etc.).
  "Desk" may survive only if it reads as a plain word, not costume; prefer
  plain: "Requests", "Your spaces".
- Voice: calm, product-first, no exclamation marks, no urgency. Trust wording
  exactly "Identity verified (SSO)". Prices serif; Free in sage (unchanged).
- **Unchanged**: hash routes (`#/journal`, `#/letter/...`), CSS class names,
  store status machine, function/variable names, bus events. This is a copy
  pass, not a refactor.
- Update string assertions in `tools/guest-test.mjs`, `tools/host-test.mjs`,
  `tools/wave2-test.mjs`; all three must run green. Retitle README's
  letter-language where it describes UI labels (minimal edits; the README
  must still read as one document).

## File ownership (disjoint — do not cross)

| Workstream | Owns |
| --- | --- |
| A (map + panel + layout) | `src/ui/map/**`, `src/ui/filters.js` (delete), `src/ui/index.js`, `src/ui/venuePanel.js`, `src/ui/roomPanel.js`, `src/ui/hoverBanner.js`, `src/styles/**`, `src/core/bus.js` (flag plumbing only), `package.json` + lockfile (leaflet), `index.html`, `tools/map-*.mjs`, `tools/input-test.mjs`, `tools/ui-test.mjs` |
| B (copy) | `src/ui/guest/**`, `src/ui/host/**`, `src/ui/nav.js`, `src/ui/copy.js` (strings only), `tools/guest-test.mjs`, `tools/host-test.mjs`, `tools/wave2-test.mjs`, `README.md` |

Merge order: B first, then A (A merges main before its final verify pass).

## Verification (both workstreams, non-negotiable)

- Empirical loop: `tools/shot.mjs <url> <out.png>` → Read the PNG → judge as
  art → iterate. Both `?style=diorama` and `?style=atlas`; A also 420×860.
- Real-input gate: puppeteer real mouse/keyboard. A rewrites
  `tools/input-test.mjs` for the new semantics (click pin → venue view; drag
  on map pans map, not camera; wheel over map zooms map; Esc semantics above)
  and audits `document.elementsFromPoint` for dead overlays. B runs
  guest/host/wave2 tests green.
- A shot with console errors is a failed shot.
