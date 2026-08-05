# UX punch-list — ranked, from the 2026-07 discovery study

Source of findings: `playtest/discovery/study-report.md` (evidence citations live there).
Ordering: hot path (discovery → apply → inbox) first, then host review, then
cohesion/polish. Work top-down. **After each fix:** re-run the affected journeys
(`playtest playtest/journeys`, accept legitimate heals), `dotnet test`, and for
hot-path items re-run the matching discovery case to confirm the friction moved.
Styling changes must use `docs/DESIGN_SYSTEM.md` tokens — never hardcode values.
Contract-touching items follow `docs/CONTRACTS.md` §1 (API + Web + mobile + doc in one
commit).

> **Status 2026-07-08:** items 1–7 FIXED. 1–6: slot-picker.js + Apply view/CSS +
> DiscoveryController + WhenCarry + ApplyController; DESIGN_SYSTEM §8.13a records the new
> spec. 7: `amenities` search param end-to-end (API + Web chip/card cues + mobile models +
> CONTRACTS §3/§7) — CONTRACTS §1 one-commit unit. Verified: curl matrices (search 500,
> carry chain incl. GroupSize/time prefill, amenities filter), `dotnet test` 404 green,
> `flutter analyze` + 89 tests green. Also done: **8b** (withdraw/cancel confirm labels
> disambiguated + `.account-confirm` scroll-into-view on open), **12a/b** (publish button
> disabled-with-reason + anchor to the uploader when photos are missing — verified rendering
> both branches), **16** (Manage empty states on the shared anatomy + DS §8.7 patch).
> Fixture fix #2: reset.sh's photo cleanup used a date cutoff that deleted the SEED photos
> (CreatedAtUtc defaults to now() at migrate time) — now id-prefix-based; seed re-applied.
> Also done: **10a/10b** (venue-owning accounts land on `/manage/applications` after
> sign-in when no returnUrl — verified both roles; inbox cross-link badges "N waiting" —
> verified with the seeded request). 10c (global-nav badge) deferred: needs per-request
> host data in the layout — design a cached claim/flag first, don't ad-hoc an API call
> into `_Layout`.
> **Verification chain closed 2026-07-08 PM (post-quota-reset):**
> - Baselines re-recorded (`runs/2026-07-08T0322-475f`): apply-signed-out-gate 74,
>   search-and-open-listing 88 — **`console_errors: 0` now passes on apply** (the old
>   StartDate soft-fail is gone; item 3's fix confirmed at the gate level).
> - Full-suite replay (`runs/2026-07-08T0332-e765`): 5/6 passed, all healed (benign
>   drifts: nav-step reindexing ×3, a flaky map-pin click recovered via the list, a
>   no-longer-needed settle wait). `organizer-withdraw` failed — triaged as a **playtest
>   harness bug**, not an app bug: the a11y snapshot leaked the hidden "Yes, withdraw it"
>   button inside the *closed* `<details>`, so the agent clicked the invisible confirm
>   forever and never opened the disclosure. Fixed in `~/projects/playtest`
>   (`src/harness/snapshot-injected.js`: closed-`<details>` children excluded; 165 tests
>   green, uncommitted). Rerun (`runs/2026-07-08T0359-8f4e`): **94 (+26)**, withdraw POST
>   verified — item 8b's UX works as designed. Human accepts pending:
>   `playtest accept runs/2026-07-08T0332-e765/<case>` ×5 and
>   `playtest accept runs/2026-07-08T0359-8f4e/organizer-withdraw`.
> - Find-space discovery re-run (`runs/2026-07-08T0402-aa14`): maria **84** (was 82),
>   sam **82** (was 76). Item 1 (negative duration): no longer occurs. Item 6 (band
>   flattening): gone — evening window survives to the request. Item 7 (parking): filter
>   found where expected by both personas, cards show it (residue: active filter collapses
>   to "Filters 1", so sam still re-checked cards). Item 5: default-value complaints gone;
>   residue: sam hand-picked 4 Tuesday dates instead of using the weekly repeat control.
>   New findings from the re-run: **"Next open: Wednesday" cue on the detail page
>   contradicts a Tuesday-evening search context** (sam, major — cost Fellowship Hall the
>   booking; make the cue When-aware or suppress it when a day filter is active), and
>   widespread **ARIA structure violations** on filter/calendar controls (both graders,
>   major) — folded into item 19.
> - Also from replay triage: the apply calendar's **selected state is invisible in the
>   accessibility layer** (`aria-pressed` flips but the accessible name never changes) —
>   an AT user can't tell a selected date from an open one, and it's what made the replay
>   agent re-tap July 29 and accidentally deselect it after sign-in (the slot restore
>   itself works end-to-end; verified server-side). Folded into item 19.
> Also done: **11** (decision card names all three moves + "The time isn't held until you
> approve"; cautious pair co-located under "Not ready to decide?"; ask-link anchors to the
> reply box — verified rendering, host + organizer views). Two finds while doing it:
> `booking.counter_offers` was missing from Web dev flags (the study never rendered the
> counter-offer UI — its "never noticed" finding is void, re-test); and the thread view's
> `_CounterOffer` partial 500'd from the manage route (controller-relative resolution) —
> fixed with a full path.
> Also done: **9** — `organizationName` end-to-end (011 changeset + EF + API validate/map +
> Web form field "Your group or organization (optional)" + host "Who's asking" lead fact on
> detail and list + mobile models/fixtures + CONTRACTS §5 + reset.sh seeds "Fairfax Literacy
> Collective"). Deliberately **optional**, not required — requiring it would tax the apply
> hot path and change PRD scope; prominent capture + host-side display fixes what actually
> blocked approval (the host had *nothing*). Verified end-to-end; 342+62+89 tests green.
> NOTE for test authors: `tests/Steeple.Integration.Tests/Fixtures/PostgresDatabaseFixture.cs`
> hand-lists changelog files — every new changeset must be added there too.
> Also done: **14** (header "Become a host" now signed-out only + one CTA label — "List your
> space" — everywhere; verified by auth state), **15** (host-setup trail partial
> `_HostSetupSteps` on venue form / new-room form / never-published room page — verified
> rendering), **17** (weekly Until seeds the 8-weeks preset on every arming path; When
> popover says "You'll pick the exact start date when you ask to book"), **19** (map pins
> carry alt/title/aria-label with room+venue+price; in-text links underlined —
> `.prose a`/`.auth-consent a`), and 18's copy items ("about ten minutes" everywhere;
> "onboard personally / hand to hold" → honest "we review every new listing personally").
> **Remaining: 13** (product-styled form validation + DS spec — the largest un-started
> item), **18-rest** (trust-links reachability, app badges, hours-editor clutter, blackout
> inputs, map dominance, apply photo de-emphasis, calendar cell affordance, trust-promise
> copy), **10c** (global-nav pending badge, needs design). All shipped changes: 342 API +
> 62 integration + 89 Flutter tests green.

## P0 — hot-path trust-breakers (bugs, not polish)

### 1. Apply form: changing "From" can produce a negative duration
`src/Steeple.Web/wwwroot/js/slot-picker.js` (~lines 200–280: `applyDuration`,
`updateReadout`, the `[data-range-*]` handlers). Setting From=6:00 PM with a stale
To=10:00 AM shows "6:00 PM–10:00 AM · **-8 hours**" even while a "2 hours" duration pill
is selected. Fix: when From changes, re-derive To from the selected duration pill (and
never render a negative readout — if no valid To, say so).
Both personas hit it and called it a trust-breaker.
Evidence: sam find-space steps/22; maria find-space steps/20–21.
Verify: re-run `find-space-weekly-group` discovery case; journeys `apply-signed-out-gate`,
`search-and-open-listing`.

### 2. Apply draft loses the selected time slot across the sign-in round-trip
Apply flow (`src/Steeple.Web/Views/Apply/Index.cshtml` + the draft stash/restore path —
the SSO gate flow per CONTRACTS §4). Message, activity, people survive; the selected
date/window/duration is dropped — while the post-login banner says "Welcome back — your
request is still here" and the header still says "Asking for: Tuesday, July 28". Fix:
stash the slot with the rest of the draft and rehydrate it; if it genuinely can't be
restored (availability changed), say that explicitly instead of over-promising.
Evidence: maria apply-and-track steps/14–22 (~6 wasted recovery steps, near-abandon).
Verify: journey `apply-signed-out-gate` (this exact flow is its story) + re-run
`apply-and-track` discovery case.

### 3. "Send request" silently no-ops when no time slot is selected
Apply form submit (`Views/Apply/Index.cshtml` + `wwwroot/js/apply.js`). With no slot,
clicking Send request changes nothing on screen — no navigation, no error. **Root cause
(confirmed by the journey baseline):** the form carries a required hidden `StartDate`
input; native validation blocks the submit and logs "An invalid form control with
name='StartDate' is not focusable." Fix: inline validation anchored at the calendar/time
section ("Pick a time before sending"), scroll it into view; never leave the click
unanswered — and don't rely on native validation for hidden fields. Also fix
the contradictory state copy: "Asking for: <date>" must not coexist with "Pick a date on
the calendar…" (one source of truth for the selected-slot summary).
Evidence: maria apply-and-track steps/18–19 (her persona's textbook bail trigger).
Verify: journey `apply-signed-out-gate`; `dotnet test`.

### 4. Web `/search` 500s when a time band is chosen with no day/date
Repro: `GET /search?timeOfDay=evening` → 500. The API deliberately 400s
(`invalid_when`: "A time-of-day filter needs a date or days of the week"); the Web BFF
(`src/Steeple.Web/Controllers/DiscoveryController.cs` `BuildViewModelAsync` /
`SteepleApiClient.SearchAsync`) doesn't handle it. HTMX swallows the error so the panel
just goes dead. Preferred fix: make the Web When-popover not emit `timeOfDay` without a
day/date **and** surface the API's message as inline guidance if it ever comes back;
alternatively relax the API rule (evening-alone is a legitimate intent) — that's a
CONTRACTS §1 change, decide deliberately, don't drift into it.
Evidence: maria find-space steps/3 (both console errors in that run).
Verify: curl matrix above + journey `search-and-open-listing`.

## P1 — hot-path intent carry-through (the study's headline)

### 5. Carry search intent into the apply form
Apply form defaults (`Views/Apply/Index.cshtml`, `Controllers` apply GET, `WhenCarry`
in `DiscoveryController.cs:69–82` already carries *some* of it). Capacity searched 15 →
form defaults 10; evening search → form defaults 8:00–10:00 AM. Prefill "How many
people" from the search's capacity and the time window from the search's time band, as
editable defaults. Graders on both find-space runs named this the single biggest
path-shortener ("treat When as one shared booking object from search through Apply").
Evidence: sam steps/15,21; maria find-space steps/14,20.
Verify: re-run `find-space-weekly-group` discovery case (both personas' friction should
collapse); journeys `search-and-open-listing`, `apply-signed-out-gate`.

### 6. Search→listing link flattens the chosen time band to the room's whole open window
The result-card link carries `startTime=08:00&endTime=22:00` after an *evening* search
(`Views/Discovery/_RoomCard.cshtml` / wherever the card href is built + `WhenCarry`).
Carry the band (or resolved band times), not the room's open window — this is the first
hand-off where "Evening" dies, item 5 is downstream of it.
Evidence: sam steps/10; maria find-space steps/10.
Verify: click-through URL inspection + re-run `find-space-weekly-group`.

### 7. Parking: filterable and visible at a glance
Two halves, one taxonomy fix:
a) **Filter**: the only parking-ish filter is "Accessible parking" (Accessibility).
   Plain "Parking" exists as an amenity on listings but not as a filter — both personas
   settled for the wrong facet with a shrug. Add "Parking" to the Filters panel amenity
   section (`Views/Discovery/Index.cshtml` filter popover; the `Amenity` flags enum
   already has it — wire the checkbox, no schema change).
b) **Cards**: parking/step-free are decision-critical and invisible on result cards —
   both personas opened detail pages just to check. Add compact amenity cues to
   `_RoomCard.cshtml` (respect DESIGN_SYSTEM chip specs; don't invent a new chip style).
Evidence: sam steps/8,10,13; maria find-space steps/1,7–10,12.
Verify: re-run `find-space-weekly-group`; journey `search-and-open-listing`.

### 8. Listing detail: availability preview must resolve promptly
"When it's open" sat on "Loading availability…" long enough to block confidence — for
maria it never resolved during the visit (`Views/Discovery/_AvailabilityPreview.cshtml`
+ its HTMX endpoint). Diagnose the latency (likely the availability materialization
call); target: resolved within the settle window, with a skeleton per DESIGN_SYSTEM
§8.7 while loading.
Evidence: sam steps/12; maria find-space steps/12.
Verify: journey `search-and-open-listing` (add a step assertion only if a data-testid is
added first — see playtest/README "deliberate choices").

### 8b. Withdraw confirmation is flaky-to-invisible (from journey baseline, not the study)
`organizer-withdraw` journey (score 68): the confirmation control repeatedly failed as
"not visible" — four failed activation attempts nearly blocked the task — and the flow
uses two near-identical labels ("Withdraw this request" opens it, "Withdraw request"
confirms). Inbox thread withdraw panel (Web `Views/Inbox/…`). Fix: make the confirm
affordance actually visible when the panel opens (scroll-into-view / no off-screen
rendering), and rename so the opener and confirmer are unmistakably different (e.g.
danger-outlined opener "Withdraw…" → confirm dialog per DESIGN_SYSTEM §8.1 destructive
spec).
Evidence: `runs/2026-07-07T2309-a34a/organizer-withdraw/` grade.json (major finding).
Verify: journey `organizer-withdraw` (score should jump well above 68).

## P2 — host side

### 9. Requests must say who is asking (organization + onsite responsibility)
The one thing that blocked approval: the request showed only free-text "our nonprofit".
This is a **CONTRACTS §1 change** (application create DTO + request detail DTO + form +
mobile models + fixtures): capture organization/group name and an onsite-responsible
contact at apply time, render a "Who's asking" block on
`/manage/applications/{id}` (Web `Views/Manage` application detail). Keep PII minimal
per the hard rules — name/role only, no IDs.
Evidence: host-review re-run steps/8–10 (grade.json major finding).
Verify: `dotnet test` (BookingIntegrityTests must stay green), journeys
`host-approve-request`, `apply-signed-out-gate`; re-run `host-review-request` discovery.

### 10. Give hosts a route to their waiting work
Three convergent findings, one theme (double-confirmed across both host-review runs):
a) post-sign-in, a venue-owning account lands on the renter search home;
b) global-nav "Inbox" is organizer-outbound only — the host queue hides behind a small
   "Requests for your spaces →" top-right link;
c) no pending-count badge anywhere.
Fix as one item: venue-owning accounts land on (or get a prominent banner to)
`/manage/applications`; promote the host queue to a first-class nav item; add a
pending-count badge (Inbox nav + `/manage` Requests tab). Web `Views/Shared/_Layout*`
nav + auth redirect logic.
Evidence: re-run steps/4–6; invalidated run steps/5–8,17.
Verify: journeys `host-approve-request`, `host-create-room`; re-run
`host-review-request` discovery.

### 11. Request detail: give the cautious paths equal footing, and say whether the slot is held
Approve/Decline sit in a prominent right-hand card; "Send question" falls below the
fold; **"Suggest another time" was never noticed in any run — the counter-offer UI is
still unvalidated**. Co-locate Ask / Suggest another time / Approve / Decline as one
decision cluster with comparable weight (per DESIGN_SYSTEM button hierarchy: one
primary). Add plain copy on the post-decision state: whether the requested time is
held/locked while awaiting the organizer, and what the organizer now sees.
Evidence: re-run steps/8–10.
Verify: journey `host-approve-request`; targeted re-run of `host-review-request`
watching specifically for suggest-a-time discovery.

### 12. Publish path: connect the photo blocker to the photo control, and never block silently
Convergent between host-onboarding (dave) and cohesion (rachel):
a) The room page's Visibility card names the photo requirement and owns "Request
   publish", but the upload control lives far below the fold in Room details, unlinked —
   add an "Add a photo" affordance in/next to the Visibility card (or move Photos
   directly under it) (`Views/Manage/Room*.cshtml`).
b) "Request publish" with no photo silently 302s; the reason appears only as an alert
   buried lower. Surface the block reason at the button (inline or disable-with-reason).
c) "Upload photo" with no file selected gives zero feedback — show the chosen filename
   after "Add a photo" and a plain validation message when empty.
Evidence: host-onboarding steps/38–43; cohesion steps/52,62.
Verify: journey `host-create-room`; re-run `host-onboarding` discovery.

## P3 — cohesion & polish

### 13. Replace native browser validation with product-styled inline errors (venue + room forms)
Rachel's highest-frequency complaint; reads "unfinished". `Views/Manage/Venue*.cshtml`,
`Room*.cshtml` forms. **DESIGN_SYSTEM gap: patch it in the same PR** — §8.7 has
ErrorView (mobile) but no web form-validation spec; add one (inline error text style,
error summary placement, focus behavior) and implement to it.
Evidence: cohesion steps/25–27,37–39; host-onboarding steps/38–41 echo it.
Verify: journey `host-create-room`.

### 14. Header: retire "Become a host" once the account hosts; unify the listing-CTA label
The CTA persists (and visually competes) all through host management; the same action
also wears three labels ("Sign in to list your space" / "List your space" /
"Get started →"). Pick one label; hide or swap the header CTA for venue-owning accounts.
`Views/Shared/_Layout*.cshtml`, host landing page views.
Evidence: cohesion steps/17,18,22–35,52.
Verify: journeys `host-create-room`, `host-approve-request`.

### 15. Host onboarding: add a lightweight progress indicator
Venue → room → hours → photos → publish is 5 surfaces with no sense of position;
both dave (checklist read) and rachel (no indicator) touch it. Even a static "Step 2 of
4" line per DESIGN_SYSTEM type tokens beats the current nothing. Also stops forms
"ending abruptly into the footer" reading as flow-end (cohesion steps/24,37,51).
Evidence: cohesion steps/23–41.
Verify: journey `host-create-room`; re-run `host-onboarding` discovery.

### 16. Manage-area empty states: adopt the shared anatomy
`Views/Manage/Index.cshtml:16`, `Views/Manage/_CalendarGrid.cshtml:11`,
`Views/Manage/Venue.cshtml:26` hand-roll `<h2>/<p>` inside `.empty-state` — no
`empty-emoji`/`empty-title`/`empty-body`, no `role="status"` — while
Discovery/_Results, Inbox/Unavailable, _ApplicationList, _BookingList follow the shared
anatomy. Align the markup. **DESIGN_SYSTEM §8.7 patch in the same PR**: EmptyState says
"optional secondary button" — Manage's empty states correctly use a primary CTA when the
empty state is the screen's sole content and the CTA is the screen's one main action
(§8.1); write that allowance down.
Evidence: code pass (pre-study), consistent with rachel's re-implementation complaints.
Verify: visual check of the three views; journeys unaffected.

### 17. When popover: a start-date affordance for weekly bookings, and a non-blank "Until" default
Sam flagged no start-date/"next month" control in the pill ("a little concerning for a
real booking", steps/5); on the apply form the weekly "Until" end date defaults blank
and is easy to miss (steps/20,23) — the slot-picker seeds an 8-week preset
(`slot-picker.js` `data-until="56"`) but the *form* Sam saw didn't reflect a default.
Either default the Until to the 8-week/3-month preset visibly, or make its emptiness a
required visible state. For the pill, a "starts next month"-class hint may be copy, not
controls — smallest change that kills the doubt.
Evidence: sam steps/5,19,20,23.
Verify: re-run `find-space-weekly-group` (sam).

### 18. Small-polish batch (one PR is fine)
- Trust/legal links unreachable without ~8 scrolls; no header route (cohesion steps/1–9).
- "Coming soon" App Store / Google Play badges look dead — activate or remove
  (cohesion steps/9–18).
- Hours editor: hide per-day "copy to" checkboxes until hours exist; declutter repeated
  day cards (cohesion steps/54–56; dave used it fine but rachel read it as clutter).
- Blackout date inputs cramped/clipped (cohesion steps/58–60).
- Copy pass: "list it in a few minutes" (About) vs "takes about ten minutes" (host page);
  "we onboard new venues personally… hand to hold" vs self-service reality
  (cohesion steps/10,17).
- **Trust-promise mismatch** (cohesion grader's "biggest trust risk"): public copy
  implies venues are verified while legal/preview copy narrows verification to identity
  sign-in only — align the public claim with what verification actually covers (PRD's
  trust model is the arbiter; don't strengthen the claim, weaken the copy).
- Apply page: shrink/de-prioritize the right-rail venue photo so calendar/time/Send sit
  higher (maria apply-and-track steps/5,8,15,17; grader: "reduce visual competition from
  non-actionable right-side media").
- Calendar open-cells could look more actionable/selected (maria apply-and-track steps/6).

### 19. A11y batch (compounds several items above)
- Leaflet map pins are unlabeled buttons (`button ""` / axe `aria-command-name`, 9
  nodes) — name them (room + price), which also makes the map usable for comparison
  (`wwwroot/js/map.js`). *Partially done 2026-07-08 (pins named); the 2026-07-08 PM
  replay still saw a map-pin click time out — re-verify interactivity, not just labels.*
- `link-in-text-block` on login consent links (terms/privacy), 6 nodes. *Done 2026-07-08.*
- **Calendar selected state is name-invisible** (from 2026-07-08 PM replay triage): the
  apply calendar day toggles `aria-pressed` but its accessible name stays
  "…— open, 1 open window" either way, and there's no "Asking for" recap adjacent to the
  grid. Append "— selected" to the label (server partial `apply/calendar` + the
  slot-picker toggle path) or switch to `aria-selected`. **Heads-up: changes snapshot
  text → journeys touching the calendar will diverge and need heal-accepts.**
- **ARIA structure violations** (both 2026-07-08 discovery graders, major): axe reports
  broken required parent/child relationships and invalid attributes across the
  filter/calendar controls (e.g. `role="gridcell"` buttons not inside `role="row"`).
  Audit the grid/list roles on the When popover, filters and calendars against the ARIA
  spec before pinning `accessibility_violations: 0`.
Evidence: sam steps/10; host-review re-run grade.json a11y finding; login steps/1–3.
Verify: per-rule a11y summaries in journey grades (see playtest/README a11y-gate plan —
fix first, then pin `accessibility_violations: 0` case by case).

## Non-app items recorded during the study (already fixed)

- `playtest/shared/reset.sh` never executed its SQL (`docker exec` without `-i`) —
  fixed 2026-07-08; world verified. Study runs before the fix accumulated state; see
  study-report "Fixture integrity" for which conclusions are affected (none materially,
  except host-review-request run 1, which was re-run).
- Playtest's 60s per-attempt LLM cap times out codex-gateway grading calls; the playtest
  working tree adds `PLAYTEST_LLM_TIMEOUT_MS` — export it (e.g. 420000) for any grading
  until a release ships it.
- Harness `no_effect` false-positives on styled-label checkboxes inflate
  `confusion_events` in form-heavy runs (host-onboarding: 10/10 were false) — read
  trajectories, not counters.
