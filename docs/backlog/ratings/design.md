# Ratings on web v2 — MVP design

> **Status:** Adopted 2026-08-08. Delivers the web half of
> `docs/backlog/reputation-and-launch.md` Slice 1 (ratings & reviews), whose API, mobile,
> and Admin sides shipped 2026-07-05 and were re-verified against the current tree
> 2026-08-08. **The backend needs zero changes for this MVP** — every field and endpoint
> below already exists and is already served on reads web v2 makes today.
> `build_plan.md` beside this file is the execution order.
>
> File:line references were verified against the 2026-08-08 working tree (which includes
> the uncommitted host-letter/unified-inbox work). Treat them as strong hints, not
> gospel — re-read the target file before editing.

## The one-paragraph product

A booking that has finished asks each side, from the **inbox**, how it went. The inbox is
where you learn you have something to do; the **letter** (guest letter for organizers,
host letter for venue keepers) is where you do it. Ratings are 1–5 stars with an optional
short note, immutable, double-blind (you see theirs when you've rated back, or when the
14-day window closes), and steeple alone decides who may rate and until when. Earned
averages then appear wherever a space is being judged: the search cards and the room
sheet. No new pages, no desk changes, no bell.

## As-built wire truth (build against this, verbatim)

```
POST /api/v1/bookings/{id}/ratings          auth; 204 No Content
  body { stars: 1..5, comment?: string ≤1000 }
  400 invalid_rating | 409 invalid_state (not eligible / window closed / already rated)
  404 not_found (not your booking — never "feature off") | 429 (apply policy: 5/min/account)
  Direction is inferred server-side: organizer → rates venue; venue manager → rates organizer.

BookingDto.ratings?   — carried on GET /bookings/{id}, /me/bookings, /manage/bookings
                        (list and detail rows carry the identical block), and on the
                        responses of /cancel and /no-show
  { byOrganizer?: { stars, comment?, createdAtUtc },   ← what the ORGANIZER wrote (about the venue)
    byVenue?:     { stars, comment?, createdAtUtc },   ← what the VENUE wrote (about the organizer)
    canRate: boolean,                                  ← viewer-scoped, computed at read time
    rateByUtc?: string }
  Your own direction is always present once written; the other side's appears only when
  revealed. byOrganizer/byVenue name the AUTHOR, not the subject.

RoomSummaryDto.rating? / RoomDetailDto.rating?  → { averageStars, count }   (venue-level,
  averageStars rounded to 2dp; null until the venue has ≥1 revealed, unhidden rating)

ApplicationDto.organizer.ratingSummary?  → { averageStars, ratingCount, noShowCount,
  completedBookings }   (manager-facing application reads only; null until the organizer
  has ≥1 revealed rating — by design, so no-show counts are also invisible until then)
```

Server truths that shape the UI: eligibility opens at the first past `occurred`/`noShow`
occurrence and closes 14 days after the booking reaches `completed`/`cancelled`; the
status sweep is lazy and runs on every booking read, so mirrored data is as fresh as the
last refresh; one rating per direction per booking, no edits ever; hidden (moderated)
ratings vanish from aggregates and reveal; `ratingReceived` (a real notification type,
enum 6) is written at submission, content-free, email CTA "Open the booking" deep-linking
`/bookings/{id}`; `rating_submitted` analytics is **server-emitted** — the client sends
nothing.

## Scope

| In MVP | Cut from MVP (and when it returns) |
|---|---|
| Guest rates venue from the guest letter | **Public reviews block** (paginated comments on the room sheet) — revisit when there are revealed comments worth reading; recipe preserved in "Deferred" below |
| Host rates organizer from the host letter | No-show marking UI (API exists; web UI later) |
| Inbox drive: row nudges + tally + rate-eligible hosting rows | Organizer trust signal on the instant-book path (needs an additive `BookingDto` field; instant hosts make no accept decision, so no chip is missing a moment) |
| `organizer.ratingSummary` chip on the host letter (manual venues) | `web.ratings` feature flag / a web flags client — the kill switch is "render nothing when the server sends no `rating`/`ratings` field" |
| ★ average + count on search cards and the room sheet headline | Venue-panel average (secondary placement) |
| `ratingReceived` in ambient notifications + email CTA landing right | Desk "Finished bookings" record (bookkeeping, not the loop) |
| Optional comment **input** on the rate form; the other side's comment shown booking-scoped once revealed | Public display of comments (that *is* the reviews block) |

Comment decision spelled out (D6): "no review comments for MVP" cuts the **public**
comments surface. The form keeps its optional note because the API takes it, mobile
already displays it, and the booking-scoped reveal between the two parties is
correspondence, not reviews. If zero comments anywhere is wanted instead, delete the
textarea from §Guest-letter/§Host-letter and nothing else changes.

## Decisions

- **D1 — Inbox-driven.** The unified inbox (2026-08-08) is the only "you have something
  to do" surface; letters are the only place a rating is written. No new routes, no desk
  work. Rationale: settled guest rows already persist in the inbox; hosting rows already
  open the host letter; a rating-eligible booking is exactly "what still moves".
- **D2 — The rate CTA gates on `status ∈ {completed, cancelled} && ratings.canRate`,**
  not raw `canRate`. The API legally permits rating mid-term (first past occurrence), but
  the rating is immutable and one-per-direction — a week-one rating of a year term burns
  it. Cancelled is deliberately included: past occurrences survive cancellation and a
  no-show-then-cancel is precisely when a warning rating matters.
- **D3 — Eligibility is steeple's, everywhere.** No client date math on `rateByUtc`, no
  local reveal logic. The mirror (`store.js`) carries `ratings` verbatim and decides
  nothing. After a successful POST (204 carries nothing) the booking is **re-read**
  (`openBooking`) — never optimistically patched, because reveal can only come from the
  server.
- **D4 — Cold start renders as silence.** Null `rating`, `ratings`, or `ratingSummary`
  renders *nothing* — no "0 ratings", no empty stars, no "No ratings yet". Absence of
  signal must not read as negative signal (backlog line 60; Maria's cold start).
- **D5 — 404 is never "feature off" here.** `attempt()` maps 404 → `reach:'unavailable'`,
  which the counter-offer code renders as "not available here yet" — but a rating POST
  404s for a booking that isn't yours. All rating UI gates on the **presence of the
  server's `ratings`/`rating` block**, and a refused submit prints the problem line, never
  the counter-offer copy.
- **D6 — Comment kept in the form, public display deferred.** See Scope.
- **D7 — Host-side inbox data comes from one list read.** `refreshHosted()` gains a
  list-only managed-bookings pass (`refreshBookings(read, 0)` — zero detail reads),
  because list rows carry the full `ratings` block and status, which is all a row nudge
  needs. The per-application detail reads stay the desk's alone (the §8 double-read rule
  in `correspondence.js` stands).
- **D8 — The tally counts rateables.** `journal.js`'s "N requests waiting on you" becomes
  "N waiting on you" when the count includes rate-eligible letters. A nudge that never
  reaches the top line is a nudge nobody sees — this was the point of inbox-driven.
- **D9 — Rating is an invitation, not a task.** Row notes read as questions ("How was the
  space?"), rows never change bucket for rateability, nothing turns red, and when the
  window closes the nudge simply stops (server-driven via `canRate`) — no "expired" state
  is ever shown.
- **D10 — `ratingReceived` joins the ambient surface** (`AMBIENT` + `lineFor` +
  `ACTION_LABEL` in `ui/notifications.js`): one slip, a quiet "Lately" line in the inbox,
  and the email CTA. Copy stays content-free ("rate back to see it") — honest under
  double-blind and the reciprocity nudge in one line.
- **D11 — No client analytics event.** `rating_submitted` is server-authoritative and
  already emitted. The client allowlist in `analytics.js` must not grow a rating row.
- **D12 — The `/bookings/{id}` deep link must fork by role.** `ui/deepLink.js:79-88`
  resolves it to the **guest** letter. A host clicking their `ratingReceived` (or
  `bookingReceived`) email must land on the **host** letter — resolve the application,
  and when the viewer is not its organizer (they're a party, so they're the venue's
  keeper), open it the way `onOpenHosting` does. Verify whether the 2026-08-08 inbox work
  already forked this; build it if not.

## The surfaces

### Guest letter (`src/ui/guest/letter.js`) — rate the venue

Insertion: a `ratingBlock(app, venue, booking)` composed immediately after
`occurrenceBlock(app)` in `render()` (~line 516) — after "what this booking was", before
the thread. Data: `bookingFor(app.id)` (store.js:275), already populated at inbox render
because `refreshMine()` pulls the booking behind every request (correspondence.js:291).

States (exactly one renders; the block is absent when none apply — D4):
1. **Eligible, not yet rated** (D2 gate passes, no own rating): heading **"How was the
   space?"**, five stars (radio group, keyboard-reachable, labels "1 star"…"5 stars"),
   optional note — label **"A few words, if you like (optional)"**, ≤1000 — and a
   two-step commit copied from the withdraw confirm (letter.js:443-469): press "Rate this
   space" → confirm line **"Your rating is final — steeple doesn't allow edits."** with a
   primary pill + `linkish` cancel. Submit through `move()` (letter.js:60-77); a refusal
   lands on the letter's existing refusal line (:513), verbatim from `problemText()`.
   Below the form, one quiet line: **"{Venue} sees your rating once they've rated you
   back, or after the window closes."**
2. **Rated, theirs unrevealed:** own rating shown as a fact line ("Your rating — ★★★★☆"
   + note if given), plus **"{Venue}'s rating arrives when it's revealed."**
3. **Both revealed:** both fact lines, theirs with its note when present.
4. **Theirs exists, yours doesn't, still eligible** (they rated first): state 1's form
   with the reveal line sharpened: **"{Venue} has rated this booking — rate back to see
   it."**

After a successful submit: `announce()` one sentence ("Your rating is in.") and re-read
via the returned refreshed booking (D3). No slip is required beyond the announce.

### Guest inbox row (`src/ui/guest/journal.js` + `src/ui/guest/copy.js`)

`statusNote(app, { occurrences })` gains a `booking` argument; when the D2 gate passes
and `!ratings.byOrganizer`, the note reads **"Finished — how was the space?"** (falls
through to today's notes otherwise). The row also gets `dataset.nudge = 'rate'` for
styling/harness hooks. The tally (`needing`, journal.js:181-183) adds rate-eligible
guest letters; copy per D8.

### Host inbox row (`src/ui/guest/journal.js` — the Hosting section)

Today `hosted` filters to `UNDECIDED` (journal.js:174). Add a second population: hosted
applications whose booking (`bookingFor(app.id)`, from D7's list read) passes the D2 gate
with `!ratings.byVenue`. Render with the existing `hostingRow` shape — status label
**"Finished"**, note **"How was the group? You can rate them."** — appended after the
undecided rows, opening via the same `onOpenHosting(app)`. These also count in the tally.
The "Decided ones live on the desk's record" comment must be updated to tell the new
truth: decided-and-done rows return exactly while a rating is invited.

### Host letter (`src/ui/host/letter.js`) — rate the organizer + trust chip

- **Trust chip:** `trustBlock(organizer)` (~:560-574) renders `organizer.ratingSummary`
  as a sibling chip inside `.trust__signals`: **"★ 4.7 · 12 ratings"**, and when
  `noShowCount > 0` a second chip **"3 no-shows this year"**. Null summary → no chip at
  all (D4; the block already does this for `org` and `joinedText`). Plumbing:
  `fromWireApplication` keeps the field (store), `organizerOf()` in `host/model.js`
  (~:103-121) passes it through — and its `ORGANIZERS` fixture fallback branch must
  return `null` for it, never a number.
- **Rate form:** same four states and copy shape as the guest letter with sides swapped —
  heading **"How was the group?"**, own = `ratings.byVenue`, theirs = `ratings.byOrganizer`,
  reveal line names the organizer. Placement: after the letter's outcome/decision
  section, before the thread — read the letter's current `render()` first (it was
  redesigned 2026-08-08) and mirror the guest letter's position in its own idiom. Submits
  go through the host letter's own `move()` wrapper; refusals to its existing refusal line.
  Note: the host letter must render cleanly for a **booked/finished** application it may
  not have rendered before (rate rows open decided letters) — verify and extend its
  status handling as part of this work.

### Discovery surfaces

- **Search cards** (`src/ui/map/results.js`): fold into the existing meta line at
  `render()` (~:120) — `Seats 40 · ★ 4.6 (12)` — and into the aria-label composition
  (~:123-126) so the accessible row agrees with the visible one. Rows are kept and
  rewritten in place, never rebuilt — write into the existing node. No sixth layout node
  (that would mean touching both `map.css` layout blocks); no change to map pins.
- **Room sheet** (`src/ui/roomPanel.js`): `★ 4.6 · 12 ratings` in the `.headline` div
  (~:87) beside price/capacity. Null → nothing (D4).

### Ambience (`src/ui/notifications.js`)

`ratingReceived` added to `AMBIENT` (:36), `lineFor()` (**"{Venue} rated a booking with
you — rate back to see it."** / organizer-name variant for hosts, built from the payload's
names), and `ACTION_LABEL` (**"Open the booking"**). The deep link then rides D12. The
journal's "Lately" block picks it up automatically from the same cache.

## Plumbing (the whole data-layer diff)

1. `src/data/api.js` — one new function beside the bookings block (~:571):
   `submitRating(bookingId, { stars, comment }, { accessToken })` — a `send('POST', …)`;
   `send()` already maps 204 → null.
2. `src/data/store.js` — `mirrorBooking` (~:693-750) keeps `ratings: dto.ratings ?? null`
   (the `payment` line at ~:717 is the exact precedent; list and detail carry the
   identical block, so no thin-over-thick hazard — unlike occurrences);
   `fromWireApplication` (~:538-561) keeps `organizerRating: dto.organizer?.ratingSummary
   ?? null`.
3. `src/data/catalog.js` — `summaryFrom` (~:194-213) and `listingFrom` (~:258-296) keep
   `rating` (`{averageStars, count} | null`). `bundledCatalog.js` grows **no** rating
   data — a bundled fallback shows no stars, honestly.
4. `src/data/correspondence.js` — `rateBooking(bookingId, { stars, comment })` in the
   moves region (~:397-469), copying `withdraw()`'s shape: `attempt(...)`, and on ok
   `return openBooking(bookingId)` so the caller receives the refreshed booking (D3).
   `refreshHosted()` (~:328-338) gains, when the person keeps venues, a trailing
   `refreshManagedBookings({ limit: 0 })` — list-only, mirrors rows, zero detail reads
   (D7); update its doc comment and the `withBookings:false` comment in `refreshManaged`.
5. `src/ui/host/model.js` — `organizerOf()` threads `ratingSummary` (fixture branch →
   null).
6. `src/ui/deepLink.js` — the D12 role fork.

## Hazards (each one has already cost a round somewhere)

- **CSS bleed:** stylesheets load `main → map → panels → guest → host`; host.css loads
  last and silently restyles any shared class (the `.letter__sheet` incident). Guest-side
  rating styles live in guest.css under a fresh block (proposed `.rate__*`), host-side in
  host.css under a **different** fresh block (proposed `.ratemark__*`); before committing
  to either name, `grep -rn "rate\|ratemark" src/Steeple.Web.v2/src/styles/` and pick
  clean ones. The star glyph: text `★` or an SVG **literal** only (the `PENCIL_ICON`
  rule) — never markup from data. Shared primitives (`.block`, `.chip`, `.pill`) are fine
  to borrow; they're the panels.css contract.
- **Viewer-scoped fields in one mirror:** `canRate` and reveal are computed for the
  caller; a person who is both organizer and keeper on the same booking gets
  last-writer-wins in the mirror. Accepted — self-booking is degenerate — but don't
  "fix" surprising harness reads of it.
- **Absent ≠ ineligible:** a booking whose `ratings` block was never read (e.g. a
  fallback-era mirror row) renders no rating UI — never `canRate:false` styling, never an
  error.
- **The refusal copy for 409:** `problemText()` prints steeple's `detail` verbatim, which
  is right; do not add the counter-offer "not available here yet" branch anywhere in
  rating code (D5).
- **Slips are transients** — harnesses record from before the action and assert the
  record, never sample the live element.
- **No seed booking is rateable.** Seed venues are instant-book with future-only
  availability; every verification loop must mint its own booking and push its occurrence
  into the past (recipe in `build_plan.md`).

## Deferred, with the map back

- **Public reviews block** (the cut): `GET /api/v1/venues/{id}/ratings?page&pageSize`
  exists (public, 120/min, pageSize ≤50, returns only ratings **with comments** — its
  `totalCount` legitimately differs from `rating.count`, so never render them as the same
  number). It is GUID-addressed and **web v2 holds no venue GUID** — thread `venueId`
  through `catalog.js` `profileFrom`/`summaryFrom`/`noteListing` exactly the way `roomId`
  already is (catalog.js:269-272 states the precedent). Fetch lives in `catalog.js`
  without the `live()` seed fallback (follow `getRoomAvailability` — an invented review
  is worse than none). Render as a `section.block` after House rules in `roomPanel.js`,
  reusing the held-scrollTop idiom for "more".
- **No-show marking on web** (`POST /occurrences/{id}/no-show` exists); note
  `noShowCount` only counts host-marked no-shows and only surfaces once the organizer has
  a revealed rating.
- **Instant-path organizer trust** — an additive organizer summary on `BookingDto`
  manager reads, decided against for MVP (no decision moment), recorded here so the gap
  stays deliberate.
- **DESIGN_SYSTEM.md** gains the rating component spec (stars, chip, form) in the same PR
  that ships the UI — there is currently **no** star/rating spec or token; nearest tonal
  precedents are `.verified--quiet` (a footnote, not a badge) and the trust `.chip`.
