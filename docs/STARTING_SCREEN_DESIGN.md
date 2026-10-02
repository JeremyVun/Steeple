# Starting screen design

Status: Jeremy selected B, Village opening, for Astra implementation and visual verification.
Implement the selected composition with the concrete Opus refinements below. Deployment
is not part of this implementation pass.

## Jeremy's brief verbatim

> do you reckon you could make the starting screen look better? what do you think?

Proposed assignment:

> May I assign Astra to critique the current starting screen and create three desktop/mobile design options, with a recommendation? Your AGENTS.md requires your approval for each specific Astra assignment.

Jeremy's authorization:

> proceed

After seeing Astra's recommendation, Jeremy requested:

> ask opus 5.5 as well using claude -p

Implementation assignment question:

> Which starting-screen direction should Astra implement and visually verify? The comparison sheet is open, and all three preserve the existing guest and host entry behavior.

Jeremy's direction:

> i also agree with B

## Intent and constraints

Improve the first impression while preserving Jeremy's established direction:
“calm, sophisticated, professional — never childish or tacky.” Astra owns the visual
assessment, implementation and visual verification. The lead handles nonvisual contracts
and verification. The selected composition is B, Village opening.

Keep anonymous browsing and a clear route for both guests and hosts. Existing route,
first-frame intent, reduced-motion and deferred-renderer contracts remain binding.
Use actual product materials and honest claims; do not invent inventory, photographs,
reviews, popularity, prices or trust guarantees. The current miniature is view-only
scenery, not a live inventory representation.

## Round 1 — 2 October 2026

Baseline: app `42f67aa` (deployed product code `5fe6524`).

Workshop: `/private/tmp/steeple-starting-screen-r1-web-7pWbbZ`.
Isolated source: the workshop's `source/` Git worktree.

Completed: Astra reviewed the live starting screen and isolated baseline, created three
distinct desktop/mobile concepts, and iterated after inspecting captures. The contact
sheet compares the current screen and the same frames for each concept, including narrow
phones and the immediate static/poster state.

Jeremy selected B after the independent second opinion. The approved desktop, phone and
narrow-phone exemplars are preserved under `assets/starting-screen/`; the workshop keeps
the underlying HTML/CSS and discarded alternatives.

### Accepted direction — 2 October 2026

Implement B's full-screen village, service-led reading area, header host entry and primary
guest action. Apply Opus's concrete refinements: keep the phone primary action clear of
the church, use “Washington, DC area”, provide a clean desktop reading background, simplify
the supporting text, and remove unsupported affordability claims. Preserve all frozen
entry/boot behavior. Astra chooses the visual treatment needed to meet those requirements
and checks both the initial poster and live scene. Any framing change needs matched
poster generation and verified handoff.

Approved calibration:
[desktop](../assets/starting-screen/approved-b-desktop.png),
[phone](../assets/starting-screen/approved-b-phone.png),
[narrow phone](../assets/starting-screen/approved-b-narrow.png).

Implementation plan: create an isolated implementation worktree from this recorded
decision; Astra owns arrival markup/copy/styles, any necessary matching scenery changes,
visual regression and owning design/web docs. The lead reviews nonvisual boot/route
behavior and runs applicable repository gates, then integrates the verified result.

### B implementation — 2 October 2026

Astra is implementing the selected direction in
`/private/tmp/steeple-starting-screen-build-web-dvrhhj/source`.
The full-window camera and all seven matched poster variants remain unchanged.
The chosen phone refinement is Opus's paper-coverage option: the reading area and
primary action stand on solid paper, fading into the village below the control.
Desktop uses a clean paper reading column and a softer transition beyond it.

The heading is “Space to rent by the hour.” and the supporting copy is “For
playgroups, classes, rehearsals and clubs.” This names the service and intended
uses without promising currently published gyms, studios or low prices. The location
is shortened to “Washington, DC area”. Host stays in the header and the down action
keeps its native browse destination, now with a 48px target and “Browse spaces” label.

Initial poster checks pass at 1440×900, 390×844 and 320×740, DPR2. Visual iteration
keeps “by the hour” together as a phrase. Enlarged-text verification and actual input
checks are in progress; the implementation is not yet integrated or deployed.

### Astra's findings and recommendation

Astra recommends **A, Open page**. Its critique: the current landscape has character,
but the wordmark dominates the service description, which wraps to five lines at 320px;
the central wash also obscures the buildings. The existing down control is 36px wide,
below the 44px minimum, and reduced motion shifts the current content vertically.

| Direction | Proposal | Main tradeoff |
|---|---|---|
| A — Open page | Clear service headline and grouped actions on paper, with the village beside or below. | Medium implementation effort; requires matched scenery viewport, camera and posters. |
| B — Village opening | Retain full-screen scenery with service copy at its edge. | Small implementation effort; text remains dependent on gradient coverage. |
| C — Type first | Large space-category typography and a landscape ribbon. | Medium implementation effort; more assertive than Jeremy's calm brief. |

[Comparison sheet](/private/tmp/steeple-starting-screen-r1-web-7pWbbZ/index.html),
[desktop comparison](/private/tmp/steeple-starting-screen-r1-web-7pWbbZ/shots/comparison-desktop.png),
[narrow-phone comparison](/private/tmp/steeple-starting-screen-r1-web-7pWbbZ/shots/comparison-narrow.png),
[full critique and rerun evidence](/private/tmp/steeple-starting-screen-r1-web-7pWbbZ/OPTIONS.md).
The sheet opened in the browser and decisive images opened in Preview. The Sol lead read
the report and checked nonvisual constraints; Astra performed all visual review and QA.

Astra reports 45 final scenario probes and 21 native routing checks passed. All final
concept controls meet 44px targets, no text spill or horizontal overflow remains, and
minimum measured text contrast is 4.94:1. The workshop contains 87 verified 2× captures.
There is no shipped dark theme; dark-preference probes preserve the existing light scheme.

The concepts use existing posters and the real isolated renderer in proposed viewports.
They do not implement the production poster-to-canvas transition. A/C need coordinated
camera/poster work after selection. Full application boot regression, 200% text scaling,
screen-reader flow and touch hardware remain implementation-stage checks. Production data
and tracked product source are unchanged; all capture servers and browsers stopped.

### Independent second opinion

Opus 5.5 completed the review through `claude -p --model claude-opus-5-5`, with read-only
tools. CLI metadata confirms `claude-opus-5-5` and successful completion. It inspected all
twelve poster frames plus selected live/focus/scroll frames, formed its view before reading
Astra's recommendation, and produced a [second-opinion report](/private/tmp/steeple-starting-screen-opus-web-9zQke4/REVIEW.md).
No new comps or product edits were made.

**Opus recommends B, with revisions**, disagreeing with Astra's choice of A. It values the
full-screen village's distinctiveness and the smaller structural change. Both reviewers
agree on the hierarchy problem, the obscuring central wash, A's stronger phone layout,
and C's weaker fit with the calm brief.

Opus requests that a revised B keep the primary action clear of the church on phones,
shorten the location label to “Washington, DC area”, keep the desktop text column on
clean paper, and omit unsupported affordability claims. It also prefers one consistent
body-copy treatment. If A is selected instead, it requests removing the repeated footer
caption and “Affordable”, fixing the isolated “space,” line, and resolving the desktop
paper/sky boundary. These are reviewer recommendations, not Jeremy's accepted verdict.

Engineering caveat: Opus proposes reframing the phone camera as its preferred B fix;
that would also require matched phone posters and handoff verification. The original
small-cost estimate for B assumed unchanged camera/posters, so that estimate does not
automatically cover the proposed revision. Its suggested paper-coverage fallback avoids
that particular camera dependency. Opus relied on Astra's contrast/target measurements
and did not inspect every scenario or run new probes.

## Nonvisual implementation constraints checked

The opening content exists in three places: static `index.html`, the fallback builder
in `src/ui/arrival.js`, and `ARRIVAL` in `src/ui/copy.js`. Any eventual implementation
must keep those equivalent, including the no-JavaScript links.

The `data-intent` values `village` and `desk` are consumed before the main interface
loads. Guest and host actions must retain their base-relative `browse` and `desk`
destinations, keyboard behavior and early loading acknowledgement. The boot controller
records a request once and abandons pending renderer work when a visitor enters the
product. A design must not make either action wait for the scene.

The poster filenames encode aspect ratios used during the handoff to the renderer.
If a chosen composition changes the scene framing, regenerate the matching poster
variants with the existing instrument rather than changing one background in isolation.
`boot-priority-test.mjs` is the relevant later regression gate for early presses,
renderer delays and direct product links. No product code changed in this round.

The current phone poster is 39,722 bytes on disk; the widest referenced poster is
94,318 bytes. These are asset sizes, not loading-time measurements. A later build
should compare the selected direction's transfer cost against this baseline.
