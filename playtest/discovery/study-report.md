# Discovery study report — 2026-07 (pre-handoff UX hardening)

**Runs:** `runs/2026-07-06T1533-65e3/` (organizer side, 2026-07-06),
`runs/2026-07-07T2217-a6a4/` (host side + cohesion, 2026-07-07), and
`runs/2026-07-07T2301-2e41/` (host-review re-run after the fixture fix). All seven runs
ended `explored`; one give-up (host-review run 1) was fixture-caused and re-run. The
ranked, file-level punch-list distilled from this report lives at
**`playtest/PUNCHLIST.md`**. Film-strip evidence: `playtest view`, or the cited
`runs/<run-id>/<case>/steps/NNN.png`.

Personas: **Maria** (first-timer, skims, bails after two consecutive confusions),
**Sam** (methodical planner, voices friction, pushes through), **Pastor Dave** (host),
**Rachel** (skeptical evaluator). Cases: `find-space-weekly-group` (Maria + Sam),
`apply-and-track` (Maria), `host-onboarding`, `host-review-request` (Dave),
`product-cohesion-audit` (Rachel).

---

## Headline: search intent does not survive surface boundaries

The strongest convergent finding across **all three organizer runs**: what the user told
the product in the search pill (time band, day, capacity) is silently discarded at each
hand-off — search → listing → apply form → sign-in round-trip. Every persona paid a
remediation tax; Maria nearly abandoned.

| Boundary | What is lost | Evidence |
|---|---|---|
| search → listing link | "Evening" flattens to the room's whole open window (`startTime=08:00&endTime=22:00`) | sam steps/10, maria-fsw steps/10 |
| listing → apply form | Capacity resets to default 10 (searched 15); time defaults to 8:00–10:00 AM after an *evening* search | sam steps/15,21; maria-fsw steps/14,20 |
| apply → sign-in → back | Selected date/window/duration dropped; message + people survive. Banner says "your request is still here" — over-promising | maria-a&t steps/14–22 |

Compounding bug: with a stale "To" time, changing "From" produces a **negative duration**
— summary reads "6:00 PM–10:00 AM · **-8 hours**" while a "2 hours" preset is selected
(sam steps/22, maria-fsw steps/20–21). Both personas called it out as a trust-breaker
("a bad contradiction I have to fix before trusting it" — sam).

And when the slot is missing after the sign-in round-trip, **Send request no-ops
silently** — no navigation, no error (maria-a&t steps/18–19: "the last click on Send
request changed nothing, so I do not trust that it submitted"). Near-give-up moment;
also the run's one console error.

## Report questions — organizer side, across personas

### Search pill (Where / When / How many / Filters)
- **Where** earned zero engagement from both personas — the pre-scoped "Vienna & nearby"
  was trusted and the textbox never touched (maria-fsw steps/6,10).
- **When** read coherently for both (Just once/Weekly, time bands, weekday chips) and the
  pill summarized correctly ("Weekly · Tue · Evening"). Two gaps: no **start-date**
  control for a weekly booking (sam steps/5 — "a little concerning for a real booking"),
  and selecting a time band **before** any weekday **500s the search** (maria-fsw
  steps/3): the API deliberately 400s (`invalid_when` — "A time-of-day filter needs a
  date or days of the week") and the Web BFF converts it to an error page; HTMX swallows
  it so the UI just goes dead.
- **How many** was clean for both (spinbutton, typed 15).
- **Filters** exposed a **parking taxonomy gap**: both personas wanted plain parking; the
  only filter is "Accessible parking" (Accessibility group). Both settled for it with a
  shrug (sam steps/8, maria-fsw steps/8) — while the listing page shows a plain
  "✓ Parking" amenity (maria-fsw steps/12). Filter vocabulary ≠ amenity vocabulary.

### When-choice carry-through
Coherent at the pill; carried into results (URL + "Open …" copy on cards); **not**
carried past the listing link (see headline table).

### Side-by-side comparison — what cards lack
**Parking** (and step-free access) — the decision-critical amenity is invisible on
result cards; both personas opened detail pages solely to check it (sam steps/10,13;
maria-fsw steps/1,7,9,10). Cards already carry price, capacity, open hours, activity tags.

### Price clarity
No inconsistency anywhere: $45/hr identical on card, detail, apply summary, review
(sam steps/5,8,10,20; maria-fsw steps/10,12,25). Neither persona used the map popup —
map markers are **empty-label buttons** (`button ""`, sam steps/10), so the map surface
is unusable for comparison via the a11y tree (also an a11y defect).

### Free-listing residue
**None seen in either run.** Only "free" token anywhere is the accessibility feature
"Step free access". Hero copy reinforces the paid model ("Simple hourly pricing, no
membership required").

### Apply flow & post-submit understanding (apply-and-track@maria)
- The availability calendar's *content* helped (cells announce "open, 1 open window";
  green "✓ That time looks open" + plain-language summary). Its *placement* hurt: a
  large venue photo pushes calendar, time picker and Send below the fold — four separate
  scroll hunts (maria-a&t steps/5,8,15,17).
- Pre-submit sign-in copy set expectations well ("You'll sign in before this sends…
  Your words will be kept") and the post-login banner was noticed — but the draft was
  only **partially** intact (see headline).
- Post-submit is the **strongest screen in the product**: Maria could state her status
  in her own words — pending, the church decides, reply arrives in this thread, expires
  Jul 20 if undecided (maria-a&t steps/23). Copy that did it: "Your request is on its
  way to Grace Community Church of Vienna. They'll reply here." + "Pending" badge +
  "Asked just now · expires Jul 20 if undecided."
- Inbox/thread felt like the same product as browsing — same nav, same banner component,
  same tone. No app-crossing feeling.

### Give-up points
None — but Maria's steps/18–19 (silent Send no-op on a form whose header still said
"Asking for: Tuesday, July 28" while the calendar said "Pick a date") is a textbook
instance of her stated bail trigger; a stricter first-timer walks there.

### Detail-page availability
"When it's open" sat on "Loading availability…" long enough to block confidence for both
personas; for maria-fsw it **never resolved** during the visit (sam steps/12, maria-fsw
steps/12).

## Host side

### Becoming a host (host-onboarding@pastor-dave) — mostly a success story

- **Entry is frictionless.** "Become a host" was the first thing he spotted ("its orange
  fill makes it the clearest place to start", steps/1); the `/host` page read as
  unambiguously for him; sign-in deep-linked back to venue creation. No lost-door moment.
- **The required hourly price felt natural** — $30 entered without friction; "you can
  change it any time" helper explicitly reassuring (steps/19). **Zero residue of a free
  option** — he never looked for one. (Free-removal validated host-side too.)
- The "Leave blank to keep contact inside Steeple" helper on Contact email worked exactly
  as designed for a control-anxious host (steps/12).
- Publish path read as a **checklist, learned before being blocked** ("It starts as a
  draft — add photos next, then request publish when it's ready", steps/16; Visibility
  card: "Draft / Only you can see this room / Add at least one photo before publishing",
  steps/31).
- **Where the checklist frays into a soft wall — the photo step** (steps/38–43):
  1. The Visibility card names the photo requirement and owns "Request publish", but the
     actual upload controls sit far below the fold inside Room details, unlinked.
  2. "Request publish" with no photo **silently 302s back** — no error at the button; the
     reason appears only as an alert buried lower in the page (steps/38–39).
  3. "Upload photo" with no file selected does nothing — no filename display, no
     validation message (steps/41).
- Ended as a graceful, satisfied stop (saved Draft, knew exactly what was missing), not a
  give-up.
- **QA note:** all 10 manifest `confusion_events` in this run are harness `no_effect`
  false-positives on styled-label checkboxes — real confusion events: zero. Don't read
  manifest confusion totals at face value for form-heavy cases.

### Reviewing a request (host-review-request@pastor-dave) — run 1 fixture-invalidated, re-run valid

Two runs. The first (`runs/2026-07-07T2217-a6a4/`) is a **give-up caused by the fixture,
not the product**: reset.sh's SQL half had silently never executed (see Fixture
integrity), so the request was invisible to the signed-in host. The **valid re-run**
(`runs/2026-07-07T2301-2e41/`, after the fix) scored 82/100, full completion, zero
confusion events, 10 steps.

**The major finding (valid re-run): the request doesn't tell a host who they're letting
into the building.** The application blurb said only "our nonprofit" — no organization
name, no onsite person responsible. Dave explicitly refused to approve on that basis and
used the Ask box instead: "could you confirm the nonprofit name and who will be
responsible on site for locking up, resetting the chairs, and leaving Fellowship Hall as
found by 8pm?" (steps/8–9). Post-question state was clear enough (Messages "You · just
now", badge Pending → **Needs info**, "Jordan Rivera gets notified either way") but
**whether the slot is held while waiting was never explicit** — he inferred it (steps/10).

The three decision moves were **not** equally weighted: Approve/Decline dominate a
right-hand "Your decision" card; "Send question" sat below the fold ("easy to miss");
"Suggest another time" was never noticed at all (steps/8–9). **Post-study correction
(2026-07-08): it could not have been noticed — `booking.counter_offers` was missing from
the Web's Development flags, so the counter-offer UI never rendered during the study.**
Enabling it also exposed a latent 500 (the thread view's `_CounterOffer` partial resolves
against the active controller's folder; the manage route missed it — fixed). The
counter-offer UX remains genuinely untested; re-test after the flag fix.

Findings confirmed by both runs (fixture-independent):
- **Two easily-conflated inboxes**: `/inbox` ("Your requests", organizer outbound) vs
  `/manage/applications` ("Requests for your spaces", host inbound). In both runs his
  first click went to the wrong one; the cross-link is a small top-right arrow, "easy to
  miss even though it is exactly the path I need" (first run steps/6; re-run steps/5–6).
- **No pending-request count/badge anywhere in nav** — nothing advertises waiting work
  (first run steps/7,8).
- **Post-sign-in landing dumps a host on the public renter home** ("Find a friendly
  hall" hero), not a host surface (both runs; re-run steps/4–5: "it still feels like a
  renter-facing page").
- From the invalidated run, the give-up quote is still the host-trust stake in the
  ground: "I would stop here and ring the Steeple person rather than risk missing a real
  building-use request" (steps/17) — what happens when a host *can't find* a request.

## Fixture integrity (meta-finding, affects how to read all runs)

`playtest/shared/reset.sh` — the before-every-case world reset — had never actually
reset anything: `docker exec steeple-postgres psql <<SQL` (no `-i`) feeds psql an empty
stdin, so the TRUNCATE + fixed-accounts + venue-manager SQL exited 0 having done nothing,
while the curl half (Jordan's pending application) worked. Consequences: state
accumulated across every run to date (stale users/applications, a duplicate
"Grace Community Church of Vienna" venue created by the onboarding case), the fixed
`pastor.dave`/`jordan` accounts never existed (dev sign-ins auto-provisioned fresh
users), and host-review-request was unrunnable. **Fixed 2026-07-08** (`docker exec -i`
+ comment). Organizer-side runs are unaffected in substance (they exercised public
search + fresh accounts); host-onboarding accidentally got a *more* realistic fresh-host
world; host-review-request is invalid and re-run. Journey baselines were not yet
recorded, so no baseline was polluted.

## Cohesion audit (product-cohesion-audit@rachel)

62 steps, ended at the 15-minute discovery ceiling mid-host-onboarding; public room
detail, Inbox/Bookings/Account remain unaudited by this persona. Tonally she judged it
one product (cream/serif/pills carried everywhere) but "finished-looking, visibly
pre-launch". No free-of-charge residue anywhere she looked — pricing copy consistently
paid across hero, About, host page, and forms (steps/1,10,18,40–41,52).

**Affordance-language inconsistencies** (all step refs in `runs/2026-07-07T2217-a6a4/product-cohesion-audit@rachel-skeptical-evaluator/`):
1. Listing-CTA label drift: "Sign in to list your space" (button) vs "List your space"
   (button) vs "Get started →" (text link) for the same action (steps/17,18,22).
2. "Become a host" rendered three ways: header button, footer text link, inline arrow
   link (steps/9–11,18).
3. "Become a host" header CTA persists while signed in and deep inside host management
   ("still competes for attention even though I am already in host management",
   steps/22–35,52).
4. Duplicate "Your spaces" label at two nav levels on the venue dashboard (steps/34,52).
5. Primary-commit verb changes every step: "Save and add rooms" / "Save draft" /
   "Save hours" / "Request publish" (steps/24,37,57,52).
6. Category taxonomy dressed differently across room form (pill checkboxes), search
   cards (chips), and room-management edit (plain checkboxes) (steps/36,42,9,53).
7. Failed saves fall back to **native browser validation bubbles** instead of the
   product's inline error styling — "no obvious error summary, red text, or step
   guidance" (steps/25–27,37–39).

**Visual-polish defects:** trust/legal links only reachable after ~8 scrolls, no header
route (steps/1–9); dead "Coming soon" App Store/Google Play badges (steps/9,11,16,18);
no progress indicator across the venue→room→hours→photos→publish onboarding
(steps/23–41); "Request publish" prominent while the required photo control sits below
the fold (steps/52,62 — same defect the host-onboarding run hit); hours editor clutter
(per-day "copy to" checkboxes before any hours exist, steps/54–56); cramped/clipped
blackout date inputs (steps/58–60); map dominates the results column above the fold
(steps/1–8).

**Copy over-promise (mild):** "we onboard new venues personally… you'll have a hand to
hold" vs fully self-service reality (steps/17); "list it in a few minutes" (About) vs
"takes about ten minutes" (host page) (steps/10,17).

## Grades

| Run | Score | Verdict (condensed) |
|---|---|---|
| find-space-weekly-group@maria | 82/100, completion full | Goal completed but path longer than necessary: search intent only partially survived into listing + request form. |
| find-space-weekly-group@sam | 76/100, completion full | Ready-to-send reached, but only after rebuilding booking details the search already knew. Recommends treating When as one shared booking object from search through Apply. |
| apply-and-track@maria | 76/100, completion full | Trust recovered only after a post-login state loop. Recommends pinning a compact booking summary through sign-in and disabling Send with inline reasons until a valid slot is selected. |
| host-review-request@dave (re-run) | 82/100, completion full | Decision reached (asked for identity info rather than approving). Recommends first-class host queue, org-name + onsite-contact capture, one decision cluster, explicit held/not-held copy. |
| host-onboarding@dave | 80/100, completion full | Venue + draft room set up cleanly, but "public visibility felt like a late-stage blocker rather than a guided checklist"; publish button gave no feedback when blocked. Recommends a persistent ready-to-publish checklist + disable/intercept Request publish with an inline reason + photo-upload feedback states. |
| product-cohesion-audit@rachel | 74/100, completion full | "A polished prototype rather than a finished, association-ready platform." Biggest trust risk: public copy implies venue verification while legal copy narrows it to identity sign-in only. Recommends global trust/legal nav, product-level validation states, publish-readiness checklist. |

## Punch-list

Distilled to **`playtest/PUNCHLIST.md`** — 19 ranked items: P0 hot-path trust-breakers
(negative duration, draft slot loss, silent Send, search 500), P1 intent carry-through
(the study headline) + parking + availability latency, P2 host side (applicant identity,
route-to-waiting-work, decision-cluster weighting, publish path), P3 cohesion/polish
(validation styling, header CTA, progress indicator, Manage empty states, small-polish
batch, a11y pair). Each item carries file pointers, evidence refs, and its verification
loop (journeys + discovery re-runs).

Also fixed during the study itself: `shared/reset.sh` silent no-op (`docker exec -i`),
grading timeouts (`PLAYTEST_LLM_TIMEOUT_MS` via the playtest working tree).

## Journey baselines (recorded 2026-07-08, `runs/2026-07-07T2309-a34a/`)

All six journeys recorded: apply-signed-out-gate **76 (soft-fail: 1 console error)**,
draft-room-stays-hidden 95, host-approve-request 88, host-create-room 92,
organizer-withdraw **68**, search-and-open-listing 91. Triage: the apply console error
is the punch-list P0 silent-Send bug's root cause (required hidden `StartDate` blocks
native validation: "invalid form control … is not focusable"); organizer-withdraw's low
score exposed a **new** app bug (withdraw confirmation control not visible — four failed
attempts — plus confusable opener/confirmer labels), added as punch-list item 8b. Both
are app bugs; no agent or environment flakes; baselines are valid replay anchors.

### Post-fix verification (2026-07-08 PM, after punch-list items 1–12 + 14–17 + 19-part)

- **Re-recorded baselines** (`runs/2026-07-08T0322-475f`, app deliberately diverged):
  apply-signed-out-gate 74, search-and-open-listing 88. The apply journey's
  `console_errors: 0` check now **passes** — the silent-Send/StartDate defect is gone at
  the gate level; Send with no date now produces a visible validation alert.
- **Full-suite replay** (`runs/2026-07-08T0332-e765`): 5/6 passed, all healed with
  benign drifts; scores apply 82, draft-room 94, host-approve 94 (+6), host-create 93,
  search 88. `organizer-withdraw` failed, triaged to a **harness** defect (the a11y
  snapshot included the confirm button hidden inside a closed `<details>`; fixed in
  playtest's `snapshot-injected.js`), then passed at **94 (+26 vs the 68 baseline)** in
  `runs/2026-07-08T0359-8f4e` — 8b's disclosure works. Heal accepts left to the human.
- **Replay triage byproduct**: the apply calendar's selected state is conveyed only by
  `aria-pressed`, with an unchanged accessible name — invisible to AT (and to the replay
  agent, which deselected the restored July 29 by re-tapping it). The sign-in slot
  restore itself (item 2) verified working end-to-end. Recorded under punch-list item 19.
- **find-space-weekly-group re-run** (`runs/2026-07-08T0402-aa14`): maria **84** (was
  82), sam **82** (was 76). The headline intent-carry frictions moved: negative duration
  (item 1) and evening→whole-window flattening (item 6) did not recur; parking (item 7)
  was found under Filters by both personas and is visible on cards; capacity/time
  defaults (item 5) drew no complaints, though sam rebuilt the weekly series by picking
  four dates manually (repeat-control discoverability). New top frictions, recorded in
  the punch-list: the detail page's "Next open: Wednesday" cue contradicting a
  Tuesday-evening search (sam abandoned the cheaper candidate over it), and widespread
  ARIA structure violations on filter/calendar controls (both graders, major).
