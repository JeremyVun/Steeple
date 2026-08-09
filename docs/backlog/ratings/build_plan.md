# Ratings on web v2 — remaining build plan

> **Status: active backlog.** The core two-way ratings loop shipped on 2026-08-08;
> `design.md` preserves that rationale. This plan contains only the web work that has not
> shipped. The API, schema, Admin, and mobile implementations already exist. Current wire
> truth lives in `docs/contracts/discovery.md` and `docs/contracts/applications.md`.

## 1. Public reviews on the room sheet

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
