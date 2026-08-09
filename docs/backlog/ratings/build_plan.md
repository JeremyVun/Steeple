# Ratings on web v2 — build plan

> Executes `design.md` (same folder — read it first; its D-numbers are cited below).
> Everything here is `src/Steeple.Web.v2` + docs. **No API, Persistence, Admin, mobile,
> or schema work** — re-verified 2026-08-08 that the backend is complete and live on the
> reads web v2 already makes. `dotnet test` should pass untouched; if it doesn't, that's
> pre-existing — verify at your baseline before claiming it.
>
> Fits one focused session. Phases are ordered so the app is shippable after each one.
>
> ⚠ **Staged WIP in the checkout (2026-08-08):** Jeremy's uncommitted spam-cap work is
> staged — `ManageService.cs`, `store.js`, `guest/composer.js`, `guest/index.js`,
> `host/desk.js`, five API test files. `instantBookingActive` **no longer exists** in
> store/desk. Work on top of it: never `git restore`/`checkout`/`stash`, never commit,
> re-read any shared file before editing. The `dotnet test` baseline includes these
> staged edits.

## P0 — Orient (30 min, no edits)

1. Read `design.md`, then the files you'll touch: `data/api.js` (bookings block),
   `data/store.js` (`mirrorBooking`, `fromWireApplication`), `data/correspondence.js`
   (`attempt`, `withdraw`, `refreshHosted`, `refreshBookings`), `ui/guest/journal.js`,
   `ui/guest/letter.js` (render composition + `move()` + the withdraw confirm),
   `ui/guest/copy.js` (`statusNote`), `ui/host/letter.js` (current render — redesigned
   2026-08-08 — and `trustBlock`), `ui/host/model.js` (`organizerOf`),
   `ui/map/results.js` (`rowNode`/`render`), `ui/roomPanel.js` (`paint` head),
   `ui/notifications.js`, `ui/deepLink.js` (the `/bookings/{id}` branch).
   Line refs in design.md are 2026-08-08 hints; trust the file.
2. Confirm the D12 question: does the `/bookings/{id}` deep link already fork to the host
   letter for a viewer who isn't the organizer? (`deepLink.js` + how `guest/index.js:58`
   `onOpenHosting` opens one.) Record the answer; it sizes P3.
3. Check the CSS namespace is free: `grep -rn "rate" src/Steeple.Web.v2/src/styles/` —
   pick guest (`.rate__*`) and host (`.ratemark__*`) block names that appear nowhere.

**P0 findings (recorded 2026-08-08, orchestrator pass — trust these, spot-check cheap):**
- **D12: the fork is missing.** `deepLink.js` `openLetter()` always opens the guest
  letter. The host open is `setMode('host')` before `setView('letter', …)`
  (`guest/index.js:58-61`); the predicate available in the mirror is
  `app.organizerId !== session.currentUser()?.id` (`refreshMine` scopes by
  `organizerId`, so every mirrored row carries it). P3.4 is in scope.
- **CSS names are free:** `.rate__*` and `.ratemark__*` collide with nothing
  (`.held__rate` in guest.css and `.booking__rate` in host.css are different blocks).
- **Backend re-verified against the tree:** `POST /bookings/{id}/ratings`
  (`BookingsController.cs:74`), viewer-scoped `Ratings` on **both** list reads
  (`BookingService.cs:186` organizer, `:214` manager), `RoomSummaryDto.Rating` /
  `RoomDetailDto.Rating`, `OrganizerDto.RatingSummary`. Neither `catalog.js` nor
  `store.js` carries any rating field yet — P1 is all-new, nothing to reconcile.
- **`refreshManagedBookings({limit: 0})`** = whole list mirrored, zero detail reads
  (`correspondence.js:508-524`) — exactly D7's mechanism.
- **Environment:** compose stack is up (postgres :5433, admin :8082 — same DB a
  Development API on :5200 uses, so first-listing approval works from :8082). A vite
  dev server may already be running on :5173; reuse it if its proxy points at :5200,
  never start a second API.

## P1 — Data layer (the whole wire diff)

All in `src/Steeple.Web.v2/src/data/`:

| File | Change |
|---|---|
| `api.js` | `submitRating(bookingId, {stars, comment}, {accessToken})` → `send('POST', '/bookings/{id}/ratings', …)`; 204 → null is already `send()`'s behavior. JSDoc the wire shape from design.md. |
| `store.js` | `mirrorBooking`: `ratings: dto.ratings ?? null` (beside the `payment` line — identical from list and detail, plain copy). `fromWireApplication`: `organizerRating: dto.organizer?.ratingSummary ?? null`. |
| `catalog.js` | `summaryFrom` + `listingFrom` keep `rating` (`{averageStars, count}|null`). No bundled-catalog rating data. |
| `correspondence.js` | `rateBooking(bookingId, {stars, comment})` — copy `withdraw()`: `attempt(token => api.submitRating(...))`; on ok `return openBooking(bookingId)` (D3 re-read). `refreshHosted()`: after `refreshManaged(slugs, {withBookings:false})`, when `slugs.length`, also `await refreshManagedBookings({limit: 0})` (list-only mirror, D7). Update both functions' doc comments — they currently assert hosting rows need no booking reads. |

**Verify:** `npm run dev` against a Development API (`dotnet run --project
src/Steeple.Api`); sign in, open a booked request, and in the console confirm the store
row for the booking carries `ratings` (read via the app's own module, or a temporary log —
`window.__steeple` exists only in debug builds). Nothing user-visible changes yet.

## P2 — Guest surface

1. **`ui/guest/letter.js`** — `ratingBlock(app, venue, booking)` after `occurrenceBlock`
   in the render composition. Four states + copy exactly per design.md §Guest letter;
   gate is D2 (`status ∈ {completed, cancelled} && ratings?.canRate` for the form;
   presence of own/their rating for the fact states; whole block absent otherwise — D4).
   Two-step confirm copied from the withdraw confirm; submit via `move()` with
   `rateBooking`; refusal lands on the letter's existing refusal line untouched (D5: no
   "not available here yet" branch). Success: `announce('Your rating is in.')`; the
   returned booking re-renders the block into its rated state.
2. **`ui/guest/copy.js`** — `statusNote` gains the `booking` option; rate-eligible +
   unrated → "Finished — how was the space?".
3. **`ui/guest/journal.js`** — pass `bookingFor(app.id)` into `statusNote`; row
   `dataset.nudge='rate'`; tally includes rate-eligible guest letters, copy per D8
   ("N waiting on you" once the count isn't purely requests).
4. **`styles/guest.css`** — the `.rate__*` block: stars as a radio group (text `★`,
   `:checked ~` fill or per-input labels — keyboard first), sized off existing tokens
   (`docs/DESIGN_SYSTEM.md`); no hardcoded colors.

**Verify (real flow, not screenshots):** mint a rateable booking (recipe below), open the
inbox — the settled row carries the nudge and the tally counts it — open the letter, rate
with keyboard only, confirm the announce, reload, see state 2 ("Your rating — ★…").

## P3 — Host surface

1. **`ui/guest/journal.js`** (Hosting section) — second population: hosted apps whose
   booking passes the D2 gate with `!ratings.byVenue`; rendered through `hostingRow` with
   label "Finished" / note "How was the group? You can rate them.", appended after
   undecided rows, same `onOpenHosting`, counted in the tally. Update the
   "Decided ones live on the desk's record" comment (journal.js:172-174) to the new truth.
2. **`ui/host/model.js`** — `organizerOf()` threads `ratingSummary` (store field
   `organizerRating`); the `ORGANIZERS` fixture branch returns `null` for it.
3. **`ui/host/letter.js`** — trust chip in `trustBlock` ("★ 4.7 · 12 ratings", plus
   "N no-shows this year" only when `noShowCount > 0`; null summary → nothing). Rate form:
   guest letter's four states with sides swapped (own = `byVenue`, theirs =
   `byOrganizer`), heading "How was the group?", placed after the outcome section in the
   letter's own idiom, submits via the host letter's `move()`. **Check the letter renders
   a booked/finished application cleanly** — rate rows open decided letters, which may be
   a new state for it; extend its status handling if needed.
4. **`ui/deepLink.js`** — the D12 fork if P0.2 found it missing: `/bookings/{id}` opened
   by a viewer who isn't the application's organizer opens the host letter (the
   `onOpenHosting` path), signed-out visitors keep the existing sign-in-then-resume.
5. **`styles/host.css`** — the `.ratemark__*` block. Grep-verify no collision with
   main/map/panels/guest (host.css loads last and bleeds — the `.letter__sheet` incident).

**Verify:** two browsers (recipe below): host inbox shows the Finished hosting row and
tally; the host letter shows the trust chip **only after** the organizer has a revealed
rating (cold start renders silence — check both); host rates; both sides now see both
ratings (reveal). The original email leg was retired 2026-08-09: `ratingReceived` is
inbox/push-only passive engagement, so neither side gets mail.

## P4 — Discovery surfaces + ambience + design system

1. **`ui/map/results.js`** — rating folded into the meta line ("Seats 40 · ★ 4.6 (12)")
   *and* the aria-label; written into the kept node (rows are never rebuilt); null →
   meta unchanged. No new layout node; map pins untouched.
2. **`ui/roomPanel.js`** — "★ 4.6 · 12 ratings" in `.headline` beside price/capacity;
   null → nothing.
3. **`ui/notifications.js`** — `ratingReceived` in `AMBIENT`, `lineFor` (content-free:
   "{name} rated a booking with you — rate back to see it."), `ACTION_LABEL` ("Open the
   booking").
4. **`docs/DESIGN_SYSTEM.md`** — new §8.x: the star row, the rating chip, the rate form
   (states, sizes, tokens used, the cold-start-silence rule). Same PR as the UI (doc-map
   rule).

**Verify:** with a revealed rating in the DB, search shows the card chip and the room
sheet headline; a venue with no ratings shows neither (not "0"). Screen-reader row text
includes the rating.

## P5 — Harness + verification wave

1. **Extend `tools/correspondence-test.mjs`** (the live gate for both flows) with a
   ratings section: mint → backdate → guest rates (assert own visible, theirs absent) →
   host row + letter → host rates → both revealed → duplicate submit answers the 409
   problem line politely. Assert DB rows as referee (`ratings` table: two rows, correct
   `RateeType`). Keep the suite's own header truths: one API for both `STEEPLE_API` and
   the vite proxy; minted accounts get `fixtures.agreeCurrent(token)`; sign-in paced
   (`fixtures.paceAuth`); Chrome on a pipe, closed in `finally`; slips asserted from
   records, never sampled live.
2. **Suite hygiene sweep:** run `discovery-test.mjs` (cards/sheet untouched-null path)
   and `payments-ui-test.mjs` (the letter and desk sections it owns now contain new
   blocks). Judge failures against each suite's documented known-stale sets before
   touching anything; re-run any failing suite once with its header-documented flags
   before diagnosing (the wave-7 lesson).
3. **Rate-limit note for the new section:** the POST is 5/min/account — a section
   submitting more than a couple of ratings per minted account must pace.

### Recipe — minting a rateable booking (no seed booking qualifies)

1. Two minted accounts (dev sign-in), both `agreeCurrent`. Host account: create venue →
   room → photo → hours → publish (first listing needs the Admin review approve at
   http://localhost:8082/admin — the integration suites' fixtures helper may already do
   venue setup; check `tools/fixtures` first). Instant venue is fine — instant bookings
   still create the application row everything keys off.
2. Guest account books a **single near-future date**.
3. Push it into the past directly in Postgres (localhost:5433, the suites' referee
   connection): shift that booking's occurrence `StartUtc`/`EndUtc` back ~2 days (column
   names per `db/changelog/005-bookings.sql`). Single-date is deliberate: all occurrences
   past ⇒ the booking sweeps to `completed`.
4. Any authed booking read then runs the lazy sweep (`Scheduled → Occurred`,
   `Confirmed → Completed`) — the next inbox refresh makes both sides rate-eligible.
   No API restart needed.

## Done means

- [x] The full two-way loop drives clean on `:5173`: nudge → letter → rate → double-blind
      → reveal, both sides, plus the email CTA leg landing role-correct. Driven with real
      browser events rather than by hand — `correspondence-test.mjs` §10 is the loop, and
      the CTA leg was driven separately: the organizer's and the venue's `ratingReceived`
      emails carry the **identical** `?goto=%2Fbookings%2F{id}`, and it opens the host
      letter for the keeper (`mode:'host'`, `.letterpage`) and the guest letter for the
      organizer (D12 resolved client-side).
- [x] Cold-start silence verified everywhere a rating *could* render, live on `:5173`:
      an unrated room's card meta reads `Seats 40` and nothing else, its `aria-label`
      likewise, and the room sheet has no `.headline__rating` at all; a rated one reads
      `Seats 40 · ★ 4.0 (1)` and `★ 4.0 · 1 rating`. The host letter's trust chip is
      absent for an unrated group (§10), and the letter block is absent until the D2 gate
      opens.
- [x] `correspondence-test.mjs` green including the new section — **108/108** (was 69;
      §10 is 39 checks). `discovery-test` **55/57**, both failures the ones already
      attributed to the fixture and the stub geocoder (`mintVenue` marks its venue
      identity-verified; every locally-listed venue stacks on the village centre, so
      nothing "rests"). `payments-ui-test` **65/65** after two suite repairs — see below.
      `map-test`'s seats assertion no longer strips the rating digits out of the meta
      line; the suite's remaining reds are its documented seed-count staleness (this
      database holds 50 venues from harness minting, not the five seed churches).
- [x] `dotnet test` untouched-green — **421/421** in `Steeple.Api.Tests`, with zero
      backend edits in this change. (Integration/`BookingIntegrityTests` not re-run: no
      bookings code was touched.)
- [x] Docs in the same change: `docs/backlog/reputation-and-launch.md` Slice 1 caveat
      rewritten (web surfaces built, reviews block + no-show UI still open, citing this
      folder); `docs/contracts/web.md` gains `submitRating` and its "not present" list now
      names only the reviews read, no-show and devices; `DESIGN_SYSTEM.md` §8.14 landed;
      CLAUDE.md's Web.v2 "Everything is real" paragraph gains ratings. **No SYSTEM_DESIGN
      §17 entry** — nothing here deviated from the target architecture (no API, schema,
      port or module change); the feature-level deviations stay in `design.md`.
- [x] No client `rating_submitted` (grep-verified: the only mention in `src/` is the
      comment in `correspondence.js` saying the server owns it); no flags client; no venue
      GUID threading (that ships with the deferred reviews block — see design.md
      §Deferred).

### Suite repairs made in P5 (neither caused by ratings)

- `payments-ui-test.mjs` never called `fixtures.agreeCurrent`, so the P4 agreements ask
  (2026-08-07) opened over its first desk and **signed the account out** — the suite died
  at §1 with 9/58 and a `DELETE /auth/sessions` as its last word.
- Its §6 then failed on the slip's fade: measured on this machine, a slip reaches opacity
  1 with one headless browser in flight and peaks at **0.26 with three**, and by §6 the
  suite had six of its own open. The strict "finished appearing" instrument was reading
  its own company, not the app. The suite now puts every earlier browser down before §6,
  which nothing after that line needs.
- A third, recorded rather than repaired: two **pages of one browser** freeze each other's
  CSS transitions outright — the page that is not in front stops advancing them, so a
  surface that has opened sits at opacity 0 for as long as anybody waits. §10 gives one
  person two *browsers* for that reason.
