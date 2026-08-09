# CONTRACT5 — Wave 6: the booking flow, end to end

Owner brief: polish the desktop booking funnel until a stakeholder can search →
open a venue → open a room → request it → sign in → send, with the request
landing in the real steeple API. CONTRACT.md §guardrails and the brand rules in
HANDOFF.md remain in force (calm voice, no exclamation marks, "Identity
verified (SSO)" verbatim, serif prices, Free in sage).

## §0 Guardrails (verbatim in every brief)

- Work only inside your git worktree (absolute paths always). Subagent shells
  reset cwd between commands — never run a destructive or linking command with
  a relative path.
- Landmark check before any work: `git merge-base --is-ancestor <BASE_SHA> HEAD`
  must pass; if not, `git merge <BASE_SHA>` first.
- `npm install` in your own worktree. Use only your assigned dev port and /tmp
  prefix. NEVER read a .env file.
- Own only your listed files. If a fix genuinely belongs in another agent's
  file, do not edit it — put the finding in your report (or message the
  orchestrator mid-flight) and continue.
- Empirical loop is mandatory: run the dev server, screenshot (tools/shot.mjs /
  tools/map-shot.mjs patterns), Read the PNG, judge, iterate. Screenshots do
  not prove interactivity: finish with a real-input pass (puppeteer real
  mouse/keyboard/wheel, tools/input-test.mjs pattern) and audit
  `document.elementsFromPoint` for invisible overlays.
- The steeple repo (/Users/jeremy/projects/steeple) is the product/schema
  source of truth. Read-only for everyone except Agent D.
- Commit in your worktree as you land pieces. Final report is a complete
  handoff (changes, decisions, rejected alternatives, evidence, hazards) and
  ends with "What the next agent must know".

## §1 Shared behavioral contract

1. **View graph**: search(map+results) → venue → room → `apply` (booking sheet)
   → identity step → sent letter. Opening `apply` is an overlay: the room/venue
   panel behind it stays mounted and visible under the scrim. Leaving `apply`
   (Esc, backdrop click, or the back arrow) returns to the room view exactly as
   it was left. Today the background wrongly reverts to the search surface —
   that regression dies this wave. B owns the background guarantee; C owns the
   sheet. Neither changes the other's files.
2. **Canonical renames** (C implements): eyebrow "Your request" → "Booking
   request"; "How many will come" → "Group size"; "What your group would like
   to do" → a matching calm noun phrase (C's taste; e.g. "Your plans");
   "Not now — back to the space" link → replaced by a back arrow at the sheet's
   top-left (aria-label "Back to the space").
3. **Identity, for real**: the local steeple API (proxied at `/api/v1`, dev
   server proxy already configured) has `Auth:DevLoginEnabled` — 
   `POST /api/v1/auth/sessions` `{provider:"dev", idToken:"email|Display Name",
   turnstileToken:null}` issues real access+refresh tokens; accounts are
   created on first sign-in. Applications submit via
   `POST /api/v1/listings/{roomId}/applications` (authorized). Contracts live
   in /Users/jeremy/projects/steeple/src/Steeple.Api/{Contracts,Controllers} —
   read them, do not guess shapes.
4. **World-less build** (A implements): building with `VITE_WORLD=off` (script
   `npm run build:flat`) produces a dist that never initializes WebGL and boots
   straight to the browse surface; every route and the whole booking flow work
   without the world. Dev keeps a `?world=off` query flag for the same thing
   (owner A/B pattern).
5. Ports/tmp: A 5321 `/tmp/w6a-*` · B 5322 `/tmp/w6b-*` · C 5323 `/tmp/w6c-*`
   · D 5324 `/tmp/w6d-*`. Merge order into main: A → B → C; D is independent.

## §2 Agent A — browse surface, map feel, world flag

Files: `src/ui/map/results.js`, `src/ui/map/index.js`, `src/ui/map/atlas.js`,
`src/ui/map/search.js` (only if the grid forces it), `src/styles/map.css`
(results/search/panel-shell sections only — do NOT touch venue/room panel
rules, B is moving those out), `src/main.js`, `index.html`, `vite.config.js`,
`package.json` (scripts), and world/journey files only as needed for the
grey-line fix.

1. Results panel: two listing cards per row on desktop, banner image on top
   (larger, roughly 16:10), name / venue · suburb / seats / price. The panel
   itself gets narrower — more map, bigger pictures. Keep hover↔pin linkage,
   keyboard nav, a11y, and the mobile sheet exactly as they behave today.
2. The moving grey line: a horizontal grey band sweeps left→right on the
   search view after "Find a space". Reproduce it first (frame sequence),
   find the actual cause (three.js canvas bleeding under translucent panels?
   a CSS animation?), fix at the root, prove with before/after frames. No
   guess-patching.
3. Map pan/zoom ≈30% faster (wheel zoom rate and drag/scroll speed). Measure
   real wheel/drag deltas before and after with the input-test pattern.
4. The `VITE_WORLD=off` flat build + `?world=off` dev flag per §1.4. Verify the
   flat dist end-to-end (serve it, click through search→venue→room→sheet).

## §3 Agent B — venue & room composition, background guarantee

Files: `src/ui/venuePanel.js`, `src/ui/roomPanel.js`, `src/ui/nav.js`,
`src/ui/index.js`, new `src/styles/panels.css` (+ its import), `src/styles/map.css`
only to delete the venue/room rules you move (verbatim block moves — provide a
line-multiset diff as evidence). Merge latest main into your worktree before
finalizing (A lands first).

1. Venue panel: hero stays, then title/address/verified chip, then **Spaces to
   rent moves up** directly after the title block — each space a prominent
   clickable card (image, name, seats, price, obvious affordance), before
   description/parking/transit. At a typical desktop viewport (~1440×900) a
   two-space venue must not need internal vertical scroll: tighten the hero and
   type scale until it fits.
2. Room panel: add the room's hero image (photos are on the room detail), keep
   "Request this space" as the unmissable primary CTA, and compose so typical
   content fits without vertical scroll at 1440×900.
3. Background guarantee (§1.1): when `apply` opens, the room panel must remain
   mounted behind the scrim; leaving `apply` restores it untouched. Diagnose
   the current regression; if the root cause is in `src/ui/guest/*` (C's
   files), do not edit — report precisely and message the orchestrator.
4. Both panels verified with canonical Atlas and with `?world=off`.

## §4 Agent C — booking sheet, calendar, identity wire

Files: `src/ui/guest/**`, `src/styles/guest.css`, `src/data/api.js` (additive
only — the wire keeps its one-file-seam discipline), new `src/data/session.js`,
`src/data/store.js` (submit path only). Do not touch `src/ui/nav.js` or
`src/ui/index.js` (B owns them); drive everything through the existing bus.

1. Sheet chrome: renames per §1.2; back arrow top-left replacing the "Not now"
   link; clicking the backdrop or pressing Esc closes the sheet back to the
   room (emit the same bus path the back arrow uses). Number picker becomes a
   proper stepper (−  value  +), serif numeral, clamped 1..capacity, keyboard
   and screen-reader accessible.
2. Calendar bug: create a slot Wed 11–12, then click (no drag) a Tue cell —
   today the Wed slot jumps to Tue keeping its hours. Fix the root cause in
   `weekCard.js`. Add a real-input regression test under tools/ and prove it
   bites by temporarily reverting the fix.
3. Identity, end to end (§1.3): when the guest reaches "Confirm who you are"
   without a session, offer sign-in — two or three seeded demo personas (reuse
   the ORGANIZERS voice from store.js; e.g. maya@demo.steeple.test) plus a
   calm email+name entry; any email works (dev provider creates the account).
   `src/data/session.js` owns tokens (localStorage), refresh-once-on-401, and
   `GET me`. Signed-in state shows the person card + "Continue as …"; the
   verified chip appears only after a real session exists.
4. Send request, for real: map the sheet state onto SubmitApplicationRequest
   (read the steeple contract), POST with the bearer token, surface validation
   problems calmly, and on success mirror the application into the local store
   (journal/inbox keep working) and show the sent letter from the server's
   answer. If the API is down, fall back to the local store without any
   demo-flavored language.
5. Full-flow real-input test: search → room → sheet → fill → sign in → send →
   assert a new row via the API. Run it and keep it in tools/.

## §5 Agent D — photographs that sell the rooms

Scope: the steeple repo's seed data plus the running dev database, and
`src/data/venues.js` photo URLs in animated-web (fallback catalog parity).
Nothing else in either repo.

1. Every `room_photos` URL in the seed is a picsum placeholder (hence a bear
   in "Music Room"). Curate a real, venue-appropriate photograph per room —
   halls, gyms, classrooms, music rooms, art studios, lounges, garden rooms —
   light, calm, matching the brand. Use stable `images.unsplash.com` URLs with
   explicit sizing params (and card/thumb variants if the schema carries them).
   Download and LOOK at every image (Read the file) before accepting it;
   verify HTTP 200 and image content-type.
2. The seed lives in Liquibase changelogs (`db/changelog/002-seed.sql`).
   Editing an applied changeset breaks checksums — read steeple's db/README or
   conventions first and add a new changeset if that is the repo's way.
   Apply the same updates to the RUNNING dev database (find it via
   docker-compose) so the frontend shows them immediately; verify via
   `GET /api/v1/listings/search`.
3. In steeple, commit on a branch `photo-curation`; do not push, do not touch
   main there. In animated-web, update `src/data/venues.js` picsum generation
   to the same curated URLs and commit on main (no worktree; only this file).
4. Evidence: the before/after of three listings from the live API, and a
   screenshot of the results panel showing the new photos.
