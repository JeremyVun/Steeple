# Archived Playtest suites — retired web v1

These baselines specify the retired MVC/HTMX routes. The implementation was deleted on
2026-08-09 and lives only in Git history, so these cases are historical artifacts rather than
runnable regression coverage. Do not run or refresh them against web v2: their stories and
success gates describe a different product surface. Web v2's real-input gates live under
`src/Steeple.Web.v2/tools/`; equivalent Playtest stories remain future work.

Two suites, one shared world:

| Suite | Mode | What it answers |
|---|---|---|
| `journeys/` | journey (regression) | "Did we break a hot path?" — deterministic gates, baseline replay, red/green. |
| `discovery/` | discovery (study) | "Where is the product unpolished, incohesive, or confusing?" — persona runs mined via report questions. |

`shared/reset.sh` runs before **every** case (`app.init`): truncates all mutable state,
keeps the Liquibase seed, recreates two fixed accounts
(`pastor.dave@steeple.test` = manager of Grace Community; `jordan@steeple.test` =
organizer), and files one pending application for Fellowship Hall so host-review
cases always have real work waiting. Both suites are `parallel: 1` **on purpose** —
they share the dev Postgres; do not parallelize without giving each worker its own DB.

## Historical environment

These suites formerly drove a Development-only v1 server at `:5187`. That project no longer
exists in the working tree; the commands and implementation remain available in Git history.

`playtest view` may still be used to inspect recorded artifacts. Never accept or refresh these
baselines as v2 behavior.

## Reading results

- **Journeys** are archived v1 results, not a current red/green gate.
- **Discovery** runs end "explored", never pass/fail. Use the `playtest-discovery`
  skill to run + synthesize. Findings feed the UX punch-list; re-run the same study
  after polish work to verify the friction actually moved.

## Deliberate choices

- **No `element_exists` gates** — the views expose no `data-testid` hooks yet, and
  CSS-class selectors would redden the suite on any restyle. If a gate ever needs a
  selector, add a `data-testid` to the view first.
- **No `accessibility_violations` gates yet** — measure first: run the journeys, read
  the per-rule a11y summary in each grade, fix what's real, then pin `accessibility_violations: 0`
  case by case as they become true. A gate that's red from day one protects nothing.
- **`console_errors: 0` everywhere** (own app, should stay clean) — except the
  draft-room 404 case, where the failed navigation itself logs a console error.
- **Dates are relative** (reset seeds the application ~3 weeks out), so a11y/pixel
  drift on calendar screens is expected occasionally — that's what heal review is for.

## Mobile (Flutter) — authored later, needs one-time setup

The Flutter app is playtestable via the `mobile` driver (Appium + a built binary,
Semantics labels as selectors — there are no test keys). Not set up yet. When ready:
build `--dart-define=STEEPLE_FAKES=true` for a no-backend suite (fixture world,
`FakeSessionManager` signs in instantly), or point `STEEPLE_API_URL` at the dev API
for full-stack runs. Keep suites under `playtest/mobile/`.
