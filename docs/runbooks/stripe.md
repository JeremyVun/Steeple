# Stripe host onboarding

Host onboarding supports Stripe **sandbox only**. Guest charging/refunds still use the
Development mock; keep `payments.enabled=false` with Stripe onboarding. A host's opt-in
records intent for a future payment release and never starts taking money in this slice.

## Configuration

The platform account is Australian (owner confirmed 2026-09-06). This does not establish
eligibility to pay US venues. Stripe's hosted flow offers countries enabled for the platform;
Steeple does not set an account country or override Stripe restrictions. Confirm the final
charge model and AU-to-US support with Stripe before live activation. See
[Connect cross-border availability](https://docs.stripe.com/connect/cross-border-payouts).

Compose forwards these root environment variables to `Payments:Connect`:

| Variable | Meaning |
|---|---|
| `STRIPE_SECRET_KEY` | Sandbox secret, supplied by operator; never print it |
| `STRIPE_PUBLISHABLE_KEY` | Existing guest-form public key; host onboarding does not need it |
| `STRIPE_CONNECT_MODE` | `stripe` for sandbox integration; default `disabled` |
| `STRIPE_ONBOARDING_ENABLED` | Public `payments.onboarding` flag; default false in Compose |
| `STRIPE_CONNECT_WEB_BASE_URL` | Absolute web origin plus hosting prefix; defaults to `EMAIL_WEB_BASE_URL` |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Signing secret for the Connect event destination; optional for local polling |

`Payments:Connect:TestMode` is fixed true in Compose. Startup rejects live keys, unsupported
modes, unsafe callback bases, and mock guest charging alongside enabled Stripe onboarding.
For direct `dotnet run`, use equivalent process variables (`Payments__Connect__SecretKey`,
`Payments__Connect__Mode`, `Payments__Connect__WebBaseUrl`,
`Payments__Connect__WebhookSecret`, `Flags__payments.onboarding`) and set
`Flags__payments.enabled=false`. .NET does not automatically read the root `.env`.

Apply migration **023** through Liquibase before starting the updated API. Rebuild/restart
API and web after configuring. Do not use `docker compose config` without redaction: it
prints resolved secrets. The repository prohibits agents from reading `.env`.

## Stripe Dashboard setup

1. Select the same sandbox as the configured secret key. Enable/configure Connect and its
   branding/onboarding options. Choose supported host countries and required capabilities
   for the intended integration; account creation uses Express with no forced country or
   capabilities, allowing those Dashboard settings to govern hosted collection.
2. Add a **connected-account** event destination for `account.updated`, targeting the public
   `/api/v1/payments/webhook` URL, including the hosting prefix. Use API version
   `2026-08-26.dahlia` for Stripe.net 52.4.1; incompatible versions are rejected by verification.
3. Store that destination's signing secret as `STRIPE_CONNECT_WEBHOOK_SECRET`, then restart API.
   Until supplied, webhook calls return 503; authenticated status reads still retrieve Stripe
   state. A Stripe CLI forwarding session has its own signing secret, not the Dashboard secret.
4. From a managed venue in Steeple, open Payments/Set up payouts, continue to Stripe, enter
   sandbox test information, and return. Revisit unfinished setup, check pending verification,
   and open the dashboard after details are submitted. Returning from Stripe is never proof
   that onboarding completed.

Account links are authenticated, temporary, and single-use. Never email/log/cache them.
The backend constructs `/desk?paymentVenue=<id>&paymentReturn=return|refresh`; web restores
identity before selecting the managed venue. Refresh consumes the marker and obtains a fresh
link. Mobile opens the external browser and refreshes status when foregrounded; this slice
uses a web return and does not register a new mobile universal-link association.

## Recovery and diagnostics

- Provider error: UI retains a retry path and API returns safe `503 payment_provider_unavailable`.
  Check Connect configuration and Stripe request history privately; never paste secret-bearing
  output. A newly saved provisioning row may legitimately have no provider account id yet.
- Provider changes: mock rows can be promoted to Stripe by starting setup, clearing synthetic
  readiness and opt-in. Switching back to mock never completes or changes a Stripe account.
- Account creation: the durable provisioning key ties provider metadata/idempotency to the venue.
  Recovery searches connected account metadata before issuing another create, including after
  Stripe's idempotency retention window. Do not replace the provisioning key to retry a timeout.
- Readiness: GET/start/webhook refresh Stripe account state. Per-account database locks serialize
  retrieval and persistence. Provider updates do not change the manager's saved preference.
  Readiness loss blocks opt-in, but opt-out remains available.
- Webhooks: verify raw-body signatures before writing a minimal `payment_webhook_events` ledger.
  No raw payload/KYC/card data is retained. Duplicate processed events return success; failures
  return non-2xx so Stripe retries. Processing retrieves current account state instead of trusting
  event ordering. This onboarding-only endpoint processes inline; there is no background replay
  worker. Replay failures from Stripe's Dashboard; GET also repairs readiness on the next visit.
- Missing callback state: reopen Payments from the venue. Unknown/unmanaged venue ids never
  authorize a Stripe link. Check WebBaseUrl and proxy prefix if the return page is wrong.
- Rollback: disable `STRIPE_ONBOARDING_ENABLED` to hide onboarding intake. The webhook remains
  available with configured Stripe credentials/signing secret. Do not remove provisioning rows.

Live mode, actual charges, transfers, payout scheduling, disputes, refund recovery, guest
payment setup, and live legal/policy acceptance remain in [payments backlog](../backlog/payments.md).
Connect onboarding does not prove live cross-border eligibility, move money, or select the final
merchant-of-record model.
