# Runbook — transactional email (Resend)

Owns: getting Steeple's outbound mail from "no-send" to "actually delivered", and proving it.
Receiving is already solved (inbound routing on `admin@jeremyvun.com`) — this is sending only.

Steeple sends nothing but transactional mail: a request arrived, a decision was made, a booking
is coming up. No marketing, no lists, no unsubscribe machinery to run. Inbox rows remain the
record of truth (SYSTEM_DESIGN §8) — a dropped email loses nothing, which is why every step here
is safe to do incrementally.

## 1. Account

1. Create a Resend account (<https://resend.com>) with the founder address. Free tier:
   **100 emails/day, 3 000/month, 1 custom domain** — comfortably inside the ~$100 AUD/mo
   ceiling and the beachhead's volume (a busy launch week is tens of emails a day).
2. Enable 2FA. The API key is a production secret.

## 2. Verify the sending domain

Add `jeremyvun.com` as a domain in Resend (region: `us-east-1` unless there's a reason not to)
and publish the records it generates at the DNS host. They look like this — **copy the values
from the Resend dashboard, don't retype these**:

| Type | Host | Value | Why |
|---|---|---|---|
| `TXT` | `send.jeremyvun.com` | `v=spf1 include:amazonses.com ~all` | SPF: authorises Resend's senders for the subdomain it sends from |
| `TXT` | `resend._domainkey.jeremyvun.com` | `p=MIGfMA0…` (long RSA key) | DKIM: signs each message so receivers can verify it |
| `MX` | `send.jeremyvun.com` | `feedback-smtp.us-east-1.amazonses.com` (priority 10) | bounce/complaint feedback |

Then add a DMARC record (recommended, not required by Resend — it's what stops someone else
spoofing the domain, and Gmail/Yahoo bulk-sender rules expect one):

| Type | Host | Value |
|---|---|---|
| `TXT` | `_dmarc.jeremyvun.com` | `v=DMARC1; p=none; rua=mailto:admin@jeremyvun.com; fo=1` |

Start at `p=none` (monitor only) and read the aggregate reports for a couple of weeks; move to
`p=quarantine` once every legitimate sender for the domain passes. Never jump straight to
`p=reject` — one unlisted sender (a form, a newsletter tool) and real mail disappears silently.

Verification is usually minutes; Resend shows each record as verified. Sending before the
domain verifies is what gets accounts rate-limited, so wait for green.

## 3. From address

Use a role address on the verified domain, with a display name:

```
Email__From="Steeple <steeple@jeremyvun.com>"
```

- Not `no-reply@` — hosts and organizers *do* reply to these, and the owner already receives
  mail for the domain. A reply that lands somewhere real is worth more than a tidy convention.
- Not a bare address — the display name is what recipients see in a crowded inbox.
- `onboarding@resend.dev` (the code default) only works for sending to your own account address;
  it is a smoke-test sender, never a production one.

## 4. Configuration

Production Compose inputs (deployment environment, never committed):

```
EMAIL_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=Steeple <steeple@jeremyvun.com>
EMAIL_WEB_BASE_URL=https://steeple.jeremyvun.com
```

Compose forwards these to ASP.NET's `Email__ApiKey`, `Email__From`, and
`Email__WebBaseUrl`; use those nested names when running the API directly.

- **`EMAIL_API_KEY` / `Email__ApiKey`** — absent = no-send mode: the inbox row is still written, and recipient,
  subject, and body are neither sent nor logged. That is correct for environments that should not mail.
- **`EMAIL_WEB_BASE_URL` / `Email__WebBaseUrl`** — the public web origin *including any sub-path*. Empty means emails
  carry no links at all (a link to nowhere is worse than none). Every email's CTA is built from
  it as `{WebBaseUrl}/?goto=<url-encoded deepLink>` — a query param, not a path, because the SPA
  ships no server-side routes (`docs/contracts/web.md`).
- **`Email__DevMailboxEnabled`** — Development only, and base appsettings omits it by
  construction. Never set it in production: it would capture recipient addresses and bodies to
  disk and expose them unauthenticated at `/dev/mailbox`.

## 5. Verify it works

1. **Domain**: Resend dashboard shows the domain verified (SPF + DKIM green).
2. **Send**: sign in to production as a test organizer and submit a real application to a venue
   you manage; the host address receives "New request for …".
3. **Headers**: in the received message, view source and confirm `DKIM=pass` and `SPF=pass`
   (Gmail: "Show original"). A `dkim=neutral` means DNS didn't propagate — re-check the record.
4. **CTA**: click the link at the bottom. It must open the SPA on that request/booking, not the
   village fallback. If it lands on the village, `Email__WebBaseUrl` or the deep link is wrong.
5. **Logs**: Grafana/Loki — `Resend rejected an email` warnings mean the API key or From address
   is wrong; the send is best-effort so nothing else surfaces the failure.
6. **Volume**: the Resend dashboard's daily count is the free-tier canary. Reminder emails scale
   with confirmed bookings × parties (2 per occurrence-reminder), so watch it after launch.

## 6. Local development

No account or key needed. `appsettings.Development.json` sets `Email:WebBaseUrl` to the Vite dev
server and turns on the dev mailbox, so every send the API makes is browsable:

- `http://localhost:5200/dev/mailbox` — the list, newest first; open one and its CTA is a real
  clickable link into `http://localhost:5173`.
- `http://localhost:5200/dev/mailbox.json` (`?to=` to filter) — the same thing for E2E harnesses.

Captured mail is stored under `src/Steeple.Api/dev-mailbox/mail.jsonl` (git-ignored, capped at
200) so it survives an API restart. Delete the file to clear the mailbox.
