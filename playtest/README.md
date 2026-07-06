# Playtest suites — Steeple's UX regression net + discovery instrument

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

## Environment (dev loop — NOT the compose containers)

Playtest drives the `dotnet run` dev loop, because Development registers the
**dev sign-in** (`Auth:DevLoginEnabled` — a "Dev sign-in" form on `/login`; see
CONTRACTS §4). The compose web/api images run in Production and will 404 it.

```bash
docker compose up -d postgres migrate
ASPNETCORE_ENVIRONMENT=Development dotnet run --project src/Steeple.Api --no-launch-profile --urls http://localhost:5200 &
ASPNETCORE_ENVIRONMENT=Development Api__BaseUrl=http://localhost:5200 dotnet run --project src/Steeple.Web --no-launch-profile --urls http://localhost:5187 &
curl -s http://localhost:5200/api/v1/geofence   # readiness
```

Then:

```bash
playtest playtest/journeys          # regression: first run records baselines, later runs replay
playtest playtest/discovery         # study: one fresh run per case@persona
playtest view                       # inspect runs / review healed journeys
```

Test emails all end in `@steeple.test`. Actors sign in through the real `/login`
page's dev form — the SSO gate flow (draft stash → login → restore) is exercised
for real, not bypassed.

## Reading results

- **Journeys** are the red/green gate for any UI change. Close the loop with the
  `playtest-ci` skill: triage each failure as app bug / app changed (accept heal) /
  agent flake / environment flake. Anything touching apply/approve must also keep
  `dotnet test` green (BookingIntegrityTests).
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
