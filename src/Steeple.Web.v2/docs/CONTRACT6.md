# CONTRACT6 — Wave 7: the surface earns its polish, the host journey earns its API

Owner brief, condensed: a round of guest-surface UX fixes from mobile screenshots,
and the hosting "list a space" flow taken from local-store theatre to a real
end-to-end publish against the steeple API. Brand rules stay in force: calm
professional voice, no exclamation marks, "Identity verified (SSO)" verbatim,
serif prices, Free in sage. CONTRACT.md §guardrails and CONTRACT5 §0 remain law.

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
  tools/map-shot.mjs / tools/map-narrow.mjs patterns), Read the PNG, judge,
  iterate. Screenshots do not prove interactivity: finish with a real-input
  pass (puppeteer real mouse/keyboard/wheel, tools/input-test.mjs pattern) and
  audit `document.elementsFromPoint` for invisible overlays.
- Live-probe verification ranks equal with tests. A green suite proves the
  suite, not the feature.
- The steeple repo (/Users/jeremy/projects/steeple) is the product/schema
  source of truth and is READ-ONLY this wave. The API is already running on
  localhost:5200 (vite proxies /api/v1 to it); postgres runs in docker. Do not
  stop, restart, or reseed either.
- Before claiming a test failure is pre-existing, prove it fails at your own
  baseline sha.
- Commit in your worktree as you land pieces. Final report is a complete
  handoff (changes, decisions, rejected alternatives, evidence, hazards) and
  ends with "What the next agent must know".

## §1 Shared behavioral contract

1. **Session is one thing.** `src/data/session.js` owns tokens, refresh, and
   `me`. G may extend it (additive: sign-out, profile read). H consumes it and
   `src/ui/guest/sso.js` (H may refactor sso.js for reuse in the host flow —
   G must not touch it). The header's account affordance (G) and the host
   flow's sign-in gate (H) must both read the same session, so a host who
   signs in to publish sees themself in the header afterwards without either
   agent calling the other's code — the existing bus + session storage is the
   only channel.
2. **Back means one level.** On every surface, a back affordance retreats
   exactly one step: room → venue → map/results → (world, only via the
   world toggle). Esc follows the same path. Nothing labelled or iconed as
   "back" may jump to the splash/world view.
3. **Publish tells the truth.** After any write to the Manage API, the shown
   state is re-read from the server's response, not assumed. A room the
   moderation gate holds back is presented calmly as under review, not as
   published.
4. **File ownership** (disjoint; the merge depends on it):
   - G: `src/ui/map/**`, `src/ui/venuePanel.js`, `src/ui/roomPanel.js`,
     `src/ui/nav.js`, `src/ui/index.js`, `src/ui/hoverBanner.js`,
     `src/ui/copy.js`, `src/styles/map.css`, `src/styles/panels.css`,
     `src/styles/main.css`, `src/data/session.js` (additive),
     `src/data/catalog.js` + `src/data/venues.js` (minimal mapping fix only,
     with evidence).
   - H: `src/ui/host/**`, `src/styles/host.css`, `src/ui/guest/sso.js`,
     `src/data/api.js` (additive), `src/data/store.js` (host paths).
   - Neither touches `src/ui/guest/**` (other than sso.js, H's),
     `src/styles/guest.css`, world/journey files (except G if a fix
     genuinely requires it — justify in the report).
5. Ports/tmp: G 5331 `/tmp/w7g-*` · H 5332 `/tmp/w7h-*` · V 5333 `/tmp/w7v-*`.
   Merge order into main: G → H; V runs after the merge.

## §2 Agent G — the guest surface

1. **Markers price the map.** Map pins currently label the venue name; a pin
   should answer "what would this cost" — show price. A venue holds one to
   three spaces at different rates, so choose a truthful compact form
   ("from $15/hr", "$15–45" — your taste). Keep the venue name in the
   accessible label and the hover linkage to the results cards.
2. **The mobile hot path: pin → panel → back → next pin.** On a phone,
   tapping a pin opens the venue full-screen and the way back is invisible;
   people will reach for the "^" world toggle and be dumped at the splash.
   The loop of glance-at-a-space / return-to-map must be fast, obvious, and
   pleasant — this is the core mobile interaction, design it with intent
   (persistent back affordance, partial sheet over the map, whatever earns
   it), not with a bolted-on button. §1.2 back semantics are law. Verify at
   ~390×844 with real taps, including venue → room → back → back → map.
3. **The verified chip earns its place.** "Identity verified (SSO)" (text
   verbatim) currently sits as a loud pill under the address; present it more
   gracefully.
4. **The address copies.** A small copy affordance beside the venue address —
   clipboard write, quiet confirmation, keyboard accessible.
5. **The room banner shows the room.** The room panel still renders the
   lettered monogram instead of the photograph (venue panel shows photos
   fine). Root-cause it — likely the detail-fetch → hero field mapping —
   fix at the seam with evidence, no guess-patching.
6. **An account has a face and a door out.** There is no way to see who you
   are or sign out. Give the header a session-aware account affordance:
   signed out it stays quiet; signed in it shows the person and offers
   sign-out (clears session, returns the surface to its signed-out state).
7. **The search bar sweats the details.** The hover highlight on search
   segments reads as a stray oval — reshape it to fit the bar's geometry.
   And "Vienna & Merrifield, Virginia" is hardcoded over the results; derive
   a truthful heading from the loaded data or let the search bar's Where
   field carry the location and drop the eyebrow — judge what serves the
   design, note the decision.
8. Everything verified with canonical Atlas, with `?world=off`, at
   desktop and ~390×844. Update stale tool-test assertions you invalidate;
   prove any new regression test bites.

## §3 Agent H — the hosting journey, for real

The flow today writes only to the local store and "Publish this space"
bounces back to Availability. This wave it becomes a real journey: a signed-in
host creates a venue and room in steeple, paints availability, and publishes —
with the local store kept as mirror and fallback, per the booking flow's
pattern (store.js submit path).

1. **The pin goes; the address stays.** Server-side geocoding runs on venue
   create/update (SaveVenueRequest — read it), so the map pin picker is
   redundant UX honey. Remove it. Place is address fields (line, suburb,
   postcode — what the contract requires), and after a successful create the
   venue's server-geocoded position appears on the host's map as quiet
   confirmation. No typeahead in MVP.
2. **Welcome is the default.** "Activities you welcome" makes hosts do
   checkbox homework; hosts think in exclusions, not inclusions. Rework the
   step so welcoming everything is the effortless default (an "all" path)
   with graceful narrowing for those who care. The data model stays the API's
   activities list — welcome-all simply sends the full set. Your design
   taste; note the decision.
3. **A price is a number.** The price selector is buggy and redundant —
   replace it with a single price input; 0 reads as Free (sage, per brand).
   PricePerHour must be positive on the API create — decide and document how
   Free maps onto the contract (read the validation; if the API refuses 0,
   surface that honestly rather than inventing a price).
4. **Copy review, whole path.** Sweep every hosting-path string for the
   verbose and the pedantic: "say what the room is, plainly" and the seats
   helper text are the flagged examples, not the whole list. Calm,
   professional, brief.
5. **Availability presents itself.** The Availability step's closed-days
   form is wonky (misaligned inputs, orphaned labels) and the sub-flow reads
   as an afterthought. Recompose it.
6. **Publish works and tells the truth.** Fix the root cause of the
   Availability bounce. Then wire the journey end-to-end: dev sign-in if no
   session (reuse sso.js per §1.1), POST venue, POST room, PUT availability
   (the server refuses publish without open hours — sequence accordingly),
   then request publish and render the server's answer (§1.3): published, or
   held for review, in calm words. Mirror into the local store so the host
   desk keeps working; fall back to local-only cleanly when the API is down,
   without demo-flavored language.
7. **Prove it end-to-end**: a real-input test under tools/ that walks list-a-
   space from empty draft to a server-confirmed room (assert via
   `GET /api/v1/manage/venues` with the bearer token), plus the fallback path
   with the API blocked. Keep both.

## §4 Agent V — validation, after the dust

After G and H merge: an adversarial input-validation review of the hosting
path. Empty, enormous, negative, non-numeric, emoji, whitespace-only, script
tags; boundary capacities and prices; malformed dates; double-submit; API
validation errors surfaced vs swallowed. Fix what you find in place (own the
whole repo this round, minimally), prove each fix bites, report what was
already sound.
