# Booking modes — instant book by default, manual approval by choice

> **Status:** Adopted 2026-08-05 (owner decision, in-session). Supersedes the
> request→approve-only model for the parts it names; `payments.md` §5's
> charge-at-T−48h-only rule is **superseded in part** by the charge timing below —
> fold the corrective pass into `payments.md` in the commit that implements this.
> Non-negotiables inherited unchanged from `payments.md` §1: Steeple never stores or
> custodies card data (Stripe holds payment identity); booking-integrity invariants
> stand; no payment call inside the approval transaction.

## Adopted

1. **Per-venue booking mode**, host-chosen, two values:
   - **`instant` (default):** a valid request (schedule fits, card saved) confirms the
     booking immediately — slot taken under the same exclusion constraint as approval;
     first valid request wins. The host holds a **rescind** lever (decline by
     exception, any time).
   - **`manual`:** the existing request→approve flow, unchanged (approve / decline /
     message / counter-offer). Counter-offers exist only in this mode.
2. **Card at request, never stored by us.** The guest saves a payment method with
   Stripe (Elements/SetupIntent; mock gateway until Stripe lands) as part of
   requesting. Steeple's DB holds token IDs + brand/last4 display data only.
3. **Chronic-rescinder signal — deferred (owner todo, do not lose):** hosts who
   repeatedly rescind confirmed bookings give guests a bad experience; the future
   lever is tracking rescind rate and nudging (or forcing) chronic rescinders onto
   `manual` mode, where a slow "no" is a decline, not a cancellation. Deliberately
   not built now; revisit with data once instant mode has volume.

## Charge timing (adopted 2026-08-05)

- **One-off booking: charge the full amount at confirmation** (booking minute, not
  T−48h) — immediate, ticket-like feedback; commitment is real from the start.
- **Recurring booking: first occurrence charges at confirmation; each subsequent
  occurrence charges at T−48h** (per-occurrence machinery from `payments.md` §5
  unchanged — no scary upfront term sum, no proration math).
- **Refund table shifts accordingly:** guest cancel ≥48h before a *charged*
  occurrence → automatic full refund (Steeple eats the non-returnable processing fee
  — cost watch-item); guest cancel <48h → charge stands; **host rescind, any time →
  automatic full refund of everything charged** (the notice window binds only
  guests). Uncharged future occurrences simply free.
- **Funds flow:** destination charges with normal payout schedule (funds route
  through Stripe to the host; refunds claw back via `reverse_transfer` +
  `debit_negative_balances`). True held-funds-until-session-completes (separate
  charges & transfers) noted as an alternative — rejected for v1 (Stripe's 90-day
  platform-balance limit breaks far-future bookings; clawback already handles the
  rescind case).

## Also deferred

- Per-user cap on concurrent upcoming bookings + cancellation-rate tracking — the
  real economic lever against serial book-and-cancel (upfront charging alone doesn't
  punish it: a full refund returns their money and costs *us* the processing fee).
- Partial-refund / cancellation-fee policies — only with evidence of abuse.
