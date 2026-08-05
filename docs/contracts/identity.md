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
  "device": { "platform": "ios|android|web", "label": "iPhone 15" } }
// 200
{ "accessToken": "<jwt ~15min>", "refreshToken": "<opaque>",
  "user": { "id": "…", "displayName": "…", "email": "…?", "createdAtUtc": "…" },
  "isNewUser": true }
```
`displayName` is an optional hint honored only when the account is first created — Apple sends
the person's name once, in the authorization response, never in the ID token. `turnstileToken`
is required wherever Turnstile is enabled (deployed env); environments without a configured
secret skip the check. Rate limited per IP (shared `auth` policy with `refresh`).

**Development only:** provider `"dev"` accepts `idToken` = `email` or `email|Display Name`
(no signature) for the local dev loop and automated playtests. Its verifier is registered
solely when `Auth:DevLoginEnabled` is true (`appsettings.Development.json`); everywhere else
provider `dev` → `401 invalid_id_token`. The deprecated Web v1 BFF pairs it with a dev sign-in
form on `/login` + `POST /auth/dev/callback` behind the same-named Web config flag. Active web
v2 instead calls this API contract from its in-flow identity step through the Vite dev proxy.

Errors: `401 invalid_id_token`, `403 turnstile_failed`, `409 use_original_provider` (the
verified email already belongs to an account on the other provider — no auto-linking),
`429 rate_limited`.

### `POST /api/v1/auth/refresh` ✅ — `{refreshToken}` → rotated `{accessToken, refreshToken}`. `401 invalid_refresh_token` (unknown/expired); reuse of a rotated token → `401 token_reuse` (whole family revoked).
### `DELETE /api/v1/auth/sessions` ✅ — revoke current session (logout; session = the access token's `sid`).
### `GET /api/v1/me` ✅ — profile + `agreements: [{docType, version, acceptedAtUtc}]`.
### `DELETE /api/v1/me` ✅ — account deletion (anonymize + revoke all sessions; Apple 5.1.1(v) requirement).
### `DELETE /api/v1/me/sessions` ✅ — revoke every session ("sign out everywhere").
### `POST /api/v1/me/agreements` ✅ — `{docType: "tos"|"privacy", version}` acceptance record; idempotent per (user, doc, version). `400 unknown_doc_type`.
### `POST /api/v1/me/devices` ✅ *(built 2026-07-04 — Phase 4)* — `{fcmToken, platform}` push registration (upsert by `fcmToken`; re-registering under a different account moves it); `DELETE /api/v1/me/devices/{token}` on logout, deletes only if owned by the caller (204 either way). `400 invalid_device` (platform not `ios`/`android`/`web`, or `fcmToken` empty/over 512 chars). Account deletion removes the caller's device rows.

> Deviation note: `Idempotency-Key` (`conventions.md` §2) is not yet honored on
> `auth/sessions` — a replayed sign-in just issues another session, which is harmless. It is
> real on `applications`, where replays would create duplicate rows.
