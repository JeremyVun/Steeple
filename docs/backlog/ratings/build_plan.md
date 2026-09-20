# Ratings on web v2 — follow-up build plan

> **Status: historical rationale, completed 2026-09-05. Ready for closeout.**
> The core two-way ratings loop shipped on 2026-08-08; `design.md` preserves that rationale.
> Both web follow-ups below are implemented and verified. The API, schema, Admin, and mobile implementations
> already exist. Current behavior lives in `docs/contracts/web.md`,
> `docs/contracts/discovery.md` and `docs/contracts/applications.md`.

## 1. Public reviews on the room sheet

**Done and verified.** Includes abort/stale-response guards, pagination retry and focus
preservation, and a named, focusable details scroller for keyboard access.

Show revealed review comments beneath a room's house rules once real comments exist. Reviews
are venue-level, so every room at a venue shows the same feed.

### Data

1. Keep the API's existing `venueId` in the catalog model:
   - `summaryFrom`: `RoomSummaryDto.venueId`.
   - `profileFrom`: `RoomDetailDto.venue.venueId`.
   - `noteSummaries` and `noteListing`: carry it onto the held venue record without replacing
     the slug used for navigation.
2. Add `api.getVenueReviews(venueId, {page, pageSize})` for
   `GET /venues/{id}/ratings`.
3. Add a catalog read that returns
   `{items:[{stars, comment, raterName, createdAtUtc}], totalCount, page, pageSize}`. Do not use
   `live()` or bundled seed data: an unavailable review service renders no review section.

### Surface

1. In `ui/roomPanel.js`, render a `section.block` after House rules when the first page contains
   reviews. A venue with no returned comments renders nothing.
2. Render the reviewer name, 1–5 star fact row, comment, and date using the rating semantics and
   tokens in `docs/DESIGN_SYSTEM.md` §8.14. Never treat `rating.count` as the review count:
   ratings without comments contribute to the aggregate but not this endpoint's `totalCount`.
3. Fetch subsequent pages from an explicit “More reviews” control until the loaded count reaches
   `totalCount`. Preserve the sheet's `scrollTop` across each repaint, and preserve already-loaded
   rows if a later page fails.
4. Prevent a late response for a previously opened room from painting into the current room.

### Verification

- Extend the live discovery harness to prove newest-first ordering, pagination, stable scroll,
  singular/plural accessible copy, and the no-comments silence path.
- Use hidden and unrevealed rows as referee data and prove neither reaches the browser.
- Re-run the room-sheet and map journeys because the catalog model and room panel are shared.

## 2. No-show marking from booking letters

**Done and verified.** Both roles pass the 30-check focused live gate, including server
refusal, marker fidelity, focus and the revealed organizer trust summary. The host letter
also reuses `openApplication`'s booking read instead of issuing a duplicate detail read.

Let either party mark the other as absent for a past, non-cancelled occurrence. This is an
irreversible booking action, not a rating.

### Data

1. Add `api.markOccurrenceNoShow(occurrenceId, {accessToken})` for
   `POST /occurrences/{id}/no-show` with no request body; its response is the updated
   `BookingDto`.
2. Add a correspondence move that submits through `attempt()` and mirrors the returned booking.
   The server owns eligibility and the resulting occurrence state; do not patch either locally.
3. Preserve `noShowMarkedBy` in `store.js` when mirroring occurrence details so both letters can
   distinguish who recorded the mark.

### Surface

1. Add the action to each past `occurred` occurrence in the guest and host booking letters. Do
   not offer it for future, cancelled, or already-`noShow` occurrences.
2. Use a two-step confirmation that names the occurrence and the party being marked. State that
   the mark is final and contributes to trust history; do not style the initial action as an
   accusation or overdue task.
3. Submit through each letter's existing move/refusal path. On success, re-render from the
   server-returned booking; on `409 invalid_state`, show the server's detail rather than inventing
   client-side eligibility copy.
4. Keep analytics server-owned: `no_show_marked` already emits from the API.

### Verification

- Extend the correspondence harness for guest-marked and host-marked paths using real browser
  events. Assert the occurrence changes to `noShow`, the marker identity is retained, and a
  duplicate attempt is refused.
- Prove future and cancelled occurrences expose no action, and that a host-marked organizer
  no-show contributes to the organizer trust summary under the existing reveal rules.
- Run `BookingIntegrityTests`, the correspondence journey, and the ratings loop because no-show
  state affects rating eligibility.

## Done means

- Public review comments paginate on room sheets without inventing fallback data or conflating
  comment count with the venue's rating aggregate.
- Both parties can mark an eligible occurrence as a no-show, with a final confirmation and a
  server-returned result.
- `docs/contracts/web.md` moves both endpoints from “Not present” to the wired table, and the
  relevant design-system and as-built docs describe the shipped surfaces.
- The live journeys above pass against the Development API, and `dotnet test` is green.

## Verification (2026-09-05)

- Combined live ratings follow-ups: 61/61, followed by focused verification of the keyboard
  fix; both roles, review privacy, pagination/refusals,
  stale responses, marker fidelity, trust summary and targeted axe checks.
- Discovery: 58/58. Listing/room sheet: 34/34. Accessibility: 4/4. Surface scoping: 3/3.
- Web unit checks, ESLint, typecheck and production build pass; production audit reports
  zero vulnerabilities. Store tests also pass in UTC, New York and Sydney.
- .NET: 573 unit and 149 PostgreSQL integration tests pass, including `BookingIntegrityTests`.
- Correspondence: 108/108, including the full double-blind/reveal loop. Desktop/mobile
  screenshots are readable; measured mobile letter and legend bounds show no overflow.
- Trusted-key checks verify PageDown, End and unconsumed boundary keys on the final room
  scroller implementation; child controls keep their own keyboard behavior.
- Clean-seed map: 70/70, with no console errors against the refreshed Development API.

The repeatable live follow-up gate is `npm run test:ratings`; prerequisites are documented
in `src/Steeple.Web.v2/tools/HARNESS.md`. The existing correspondence suite still owns the
full two-way rating journey.
