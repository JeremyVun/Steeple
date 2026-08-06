# Contracts — Identity (was CONTRACTS §4)

> **Scope:** SSO sign-in and the API's own token pair (`/auth/*`), plus the account surface
> (`/me`, agreements, deletion, sign-out-everywhere, push device registration).
> Conventions/governance (errors, auth header, rate limits): see `conventions.md`.
> Legend: ✅ built & live · 🔲 planned.

## Identity ✅ *(built 2026-07-04)*

### `POST /api/v1/auth/sessions` ✅
```jsonc
// request
{ "provider": "google" | "apple", "idToken": "<provider JWT>", "nonce": "…?",
  "turnstileToken": "…?", "displayName": "…?",
  "device": { "platform": "ios|android|web", "label": "iPhone 15" },
  "refreshTransport": "body" | "cookie" }   // optional, default "body"
// 200
{ "accessToken": "<jwt ~15min>", "refreshToken": "<opaque>",   // omitted on cookie transport
  "user": { "id": "…", "displayName": "…", "email": "…?", "createdAtUtc": "…" },
  "isNewUser": true }
```
`displayName` is an optional hint honored only when the account is first created — Apple sends
the person's name once, in the authorization response, never in the ID token. `turnstileToken`
is required wherever Turnstile is enabled (deployed env); environments without a configured
secret skip the check. Rate limited per IP (`auth`; refresh has its own policy below).

**Development only:** provider `"dev"` accepts `idToken` = `email` or `email|Display Name`
(no signature) for the local dev loop and automated playtests. Its verifier is registered
solely when `Auth:DevLoginEnabled` is true (`appsettings.Development.json`); everywhere else
provider `dev` → `401 invalid_id_token`. The deprecated Web v1 BFF pairs it with a dev sign-in
form on `/login` + `POST /auth/dev/callback` behind the same-named Web config flag. Active web
v2 instead calls this API contract from its in-flow identity step through the Vite dev proxy.

Errors: `401 invalid_id_token`, `403 turnstile_failed`, `409 use_original_provider` (the
verified email already belongs to an account on the other provider — no auto-linking),
`429 rate_limited`.

Production validates `Auth:Jwt:SigningKey` eagerly: it must be deployment-supplied base64 for
at least 32 bytes, and both repository-known development keys are rejected. Compose has no
fallback and refuses configuration without `AUTH_JWT_SIGNING_KEY`. After deployment, run
`node tools/security-smoke-test.mjs https://<web-origin>`; a token signed with the former public
fallback must answer `401`. If that fallback ever ran in production, rotate before redeploying.

### `POST /api/v1/auth/refresh` ✅ — `{refreshToken?, refreshTransport?}` → rotated `{accessToken, refreshToken}`. `401 invalid_refresh_token` (unknown/expired/none presented); reuse of a rotated token → `401 token_reuse` (whole family revoked, subject to the grace window below). Both body fields are optional and the body itself may be absent: with no `refreshToken` the cookie is read instead. Rate limited per IP on its own `refresh` policy (60/min), **not** the shared `auth` one — every reload of a signed-in browser spends one, and starving sign-in behind a NAT for that would be absurd.
### `DELETE /api/v1/auth/sessions` ✅ — revoke current session (logout; session = the access token's `sid`). Accepts **either** a bearer token **or** the refresh cookie: the access token lives fifteen minutes and the cookie ninety days, so most sign-outs arrive with a stale bearer, and one that revoked nothing was the worst of both worlds. `401` only when neither credential is present. The response expires the cookie.

## Refresh transport ✅ *(built 2026-08-06)*

`refreshTransport` decides where the rotating token lives. **`body`** (default) puts it in the
JSON — native clients hold it in the OS keychain, and mobile is unaffected by any of this.
**`cookie`** omits it from the JSON entirely and sets:

| attribute | value | why |
|---|---|---|
| name | `steeple_refresh` (`Auth:RefreshCookieName`) | |
| `HttpOnly` | always | a ninety-day credential in `localStorage` is in reach of anything that gets onto the page |
| `SameSite` | `Strict` | it is only ever needed on requests the SPA makes from its own origin; the one cross-site entry (an email CTA) is a top-level navigation whose *document* then makes same-site calls |
| `Path` | `/` | web can live behind a stripped reverse-proxy prefix — a path scoped to the un-stripped route would never be sent |
| `Max-Age` | `Auth:RefreshTokenDays` (90d); `0` on revoke | |
| `Secure` | when the request is https | read from `Request.IsHttps`, after trusted one-hop forwarded-proto processing; direct client headers are ignored |

**Whichever way a token arrived is the way its successor leaves.** A body token sent with
`refreshTransport: "cookie"` is the one exception: that is a client migrating itself onto the
cookie in a single rotation, which is how web moved off its old `localStorage` pair.

## Rotation grace ✅ *(built 2026-08-06)*

Rotation with reuse detection assumes one client per family. A browser breaks that: two tabs share
one session, and when the access token expires both 401 and both present the same refresh token
within milliseconds. Presenting an **already-rotated** token within `Auth:RefreshReuseGraceSeconds`
(default 30) of its rotation is therefore answered with the successor pair the winner received —
not `token_reuse`, and the family is **not** revoked. Outside that window, or for an older
ancestor, reuse still revokes the whole family.

Two things enforce it together. The database decides who actually rotated: the revoke is
conditional on the row still being unrevoked, so of two simultaneous callers exactly one writes a
successor and one family can never fork into two live branches. The in-memory grace map decides
what the loser is *told*: raw tokens are stored hashed, so the successor's raw value exists only in
the process that minted it, and it is remembered there for the grace window and no longer. Sign-out,
family revocation, sign-out-everywhere and account deletion all drop the matching entries at once,
so a grace entry can never hand out a pair for a session that has just been killed.

A restart mid-race, or a second API instance, degrades to the old behaviour — the losing tab is
signed out — never to a security hole, because the conditional update is still the arbiter.
### `GET /api/v1/me` ✅ — profile + `agreements: [{docType, version, acceptedAtUtc}]`.
### `DELETE /api/v1/me` ✅ — account deletion (anonymize + revoke all sessions; Apple 5.1.1(v) requirement).
### `DELETE /api/v1/me/sessions` ✅ — revoke every session ("sign out everywhere").
### `POST /api/v1/me/agreements` ✅ — `{docType: "tos"|"privacy", version}` acceptance record; idempotent per (user, doc, version). `400 unknown_doc_type`.
### `POST /api/v1/me/devices` ✅ *(built 2026-07-04 — Phase 4)* — `{fcmToken, platform}` push registration (upsert by `fcmToken`; re-registering under a different account moves it); `DELETE /api/v1/me/devices/{token}` on logout, deletes only if owned by the caller (204 either way). `400 invalid_device` (platform not `ios`/`android`/`web`, or `fcmToken` empty/over 512 chars). Account deletion removes the caller's device rows.

> Deviation note: `Idempotency-Key` (`conventions.md` §2) is not yet honored on
> `auth/sessions` — a replayed sign-in just issues another session, which is harmless. It is
> real on `applications` and on the two manage creates (`manage.md`), where replays would
> create duplicate rows.
