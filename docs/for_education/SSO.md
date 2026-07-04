# How Steeple's SSO actually works (educational notes)

> Learning notes, not a spec. The binding designs live in `docs/SYSTEM_DESIGN.md` §6 and
> `docs/CONTRACTS.md`; this file explains the *why* behind what's in the code, with pointers
> to the real files. If this drifts from the code, the code wins.

## The one-paragraph version

Steeple never sees or stores passwords. Google or Apple authenticates the person and hands
the browser a signed **ID token** (a JWT) that says "this is subject `10769…`, email X, and
it was minted for client-id Y". The Web app (acting as a **Backend-for-Frontend**, "BFF")
forwards that token to the Steeple API, which verifies the signature against the provider's
published public keys, then finds-or-creates a local user and issues *Steeple's own* token
pair: a 15-minute access JWT plus a 90-day rotating refresh token. The BFF hides that pair
inside an encrypted cookie — the browser never sees a bearer token of any kind.

Three parties, three trust boundaries:

```
 Browser ──(provider ID token)──▶ Steeple.Web (BFF) ──(exchange)──▶ Steeple.Api
    ▲                                    │                              │
    │                                    ▼                              ▼
 Google / Apple                 encrypted auth cookie          users, user_logins,
 (authenticates the human)      (holds the API tokens)         refresh_tokens (Postgres)
```

## Background: OIDC ID tokens in 60 seconds

OpenID Connect layers *identity* on top of OAuth 2.0. The artifact that matters here is the
**ID token**: a JWT signed by the provider whose claims include

- `iss` — who minted it (`https://accounts.google.com`, `https://appleid.apple.com`)
- `sub` — the provider's permanent, opaque user id (the thing you key accounts on; emails change)
- `aud` — the client id it was minted *for* (prevents token-for-app-A being replayed at app-B)
- `exp` / `iat` — lifetime
- `nonce` — optional echo of a caller-supplied random value (replay protection)
- profile claims — `email`, `email_verified`, `name` (Google; Apple mostly omits profile claims)

Anyone can *read* a JWT (it's just base64), but only the provider can *sign* one. Providers
publish their current public keys as a **JWKS** (JSON Web Key Set) at a well-known URL, so a
server can verify a token offline, with no shared secret and no callback to the provider per
sign-in. That's why **no client secret exists anywhere in Steeple**: both flows are chosen
specifically so the only artifact leaving the provider is an ID token, and verifying an ID
token needs only public keys. (A secret is required for the *authorization-code exchange*
flavor of OIDC — a flow Steeple deliberately avoids; see the Apple section.)

## Why a BFF? (the pattern that shapes everything else)

`Steeple.Web` is a "Backend-for-Frontend": the browser only ever talks to it, and it holds
the API credentials server-side. From `AuthController`'s summary comment: *"the BFF
exchanges it at the API — keeping the API token pair server-side inside the encrypted auth
cookie. The browser never sees a token."*

What that buys:

- **No tokens in JS-reachable storage.** XSS on the site cannot exfiltrate a bearer token,
  because there isn't one in the page, localStorage, or a readable cookie. The auth cookie is
  `HttpOnly` and its *contents* are ciphertext (ASP.NET DataProtection), so even the user
  can't read their own tokens out of it.
- **Web stays a pure frontend.** It has no database (hard rule in `CLAUDE.md`); everything a
  logged-in page needs comes from the API using the access token unpacked from the cookie.
- **The mobile app reuses the exact same API.** Flutter will do the provider dance natively
  and call the same `create session` endpoint with `platform: "mobile"` — the BFF is just one
  client among several.

Key files:

| Concern | File |
|---|---|
| Login page (flag-gated UI states) | `src/Steeple.Web/Views/Site/Login.cshtml` |
| Browser glue (GIS button, Turnstile) | `src/Steeple.Web/wwwroot/js/auth.js` |
| BFF endpoints (both providers, sign-out) | `src/Steeple.Web/Controllers/AuthController.cs` |
| Silent token refresh inside the cookie | `src/Steeple.Web/Services/SteepleCookieEvents.cs` |
| API: session/refresh/verify orchestration | `src/Steeple.Api/Services/Identity/IdentityService.cs` |
| API: shared OIDC verification | `src/Steeple.Api/Proxies/Identity/OidcIdTokenVerifier.cs` (+ per-provider `GoogleIdTokenVerifier.cs`, `AppleIdTokenVerifier.cs`) |
| Config (public ids only, Web side) | `src/Steeple.Web/Configuration/AuthFlowOptions.cs` |

## Flow 1 — Google (Google Identity Services, all in the browser)

Google's GIS library replaces the classic redirect dance with an in-page flow: the library
renders the official button, pops Google's account chooser, and hands your JS callback a
signed ID token (GIS calls it a "credential"). No redirect, no authorization code, no secret.

```
Browser                          Steeple.Web (BFF)                 Steeple.Api
  │ 1. GIS button → Google popup    │                                 │
  │    Google returns ID token      │                                 │
  │    to the JS callback           │                                 │
  │ 2. JS drops token into hidden   │                                 │
  │    form, submits same-origin ──▶│ POST /auth/google/callback      │
  │    (antiforgery token applies)  │ 3. exchange ──────────────────▶ │ verify sig/iss/aud/exp
  │                                 │                                 │ find-or-create user
  │                                 │ ◀── access + refresh tokens ─── │ issue token pair
  │ ◀─ Set-Cookie (encrypted) ──────│ 4. SignInAsync + redirect       │
```

Details worth noticing in the code:

- **The form-submit trick** (`auth.js` + `Login.cshtml`): GIS could POST the credential to
  us itself (`data-login_uri`), but that arrives as a cross-site POST which the antiforgery
  filter would reject. Instead the JS callback writes the credential into a hidden
  *same-origin* form carrying `@Html.AntiForgeryToken()` and submits that. CSRF protection
  stays the boring, default kind.
- **No nonce for Google** (`GoogleCallback` passes `nonce: null`): the GIS callback delivers
  the token directly to the page that requested it, so there's no cross-context hop for an
  attacker to inject a replayed token into. Apple's flow does hop contexts — hence its nonce.
- **CSP forbids inline scripts**, which is why all behavior lives in `auth.js` and the page
  passes config via `data-*` attributes on `#auth-config`.

## Flow 2 — Apple (redirect + cross-site form_post)

Apple has no GIS-equivalent JS library, so Steeple runs the classic OIDC redirect flow — with
one crucial parameter choice that eliminates the need for a client secret:

> `response_type=code id_token` puts the ID token straight in the form_post — no code
> exchange, so no Apple client-secret JWT is needed for sign-in. (`AuthController.cs:98`)

With plain `response_type=code` you'd get only an authorization code, and redeeming it at
Apple's token endpoint requires a client secret (for Apple, an ES256 JWT you sign with a
private key from your developer account — key management Steeple gets to skip entirely). By
asking for the `id_token` directly in the response, the code that comes along with it can
simply be ignored.

```
Browser                          Steeple.Web (BFF)                 Steeple.Api
  │ 1. POST /auth/apple/start ─────▶│ mint state + nonce              │
  │                                 │ seal {state, nonce, returnUrl,  │
  │                                 │  turnstileToken} into a         │
  │ ◀─ Set-Cookie steeple.apple ────│  DataProtection cookie (10 min) │
  │ ◀─ 302 appleid.apple.com ───────│  …/authorize?client_id=<ServicesId>
  │                                 │   &response_type=code+id_token
  │ 2. user authenticates at Apple  │   &response_mode=form_post
  │                                 │   &scope=name+email&state&nonce │
  │ 3. Apple form_posts BACK ──────▶│ POST /auth/apple/callback       │
  │    (cross-site POST!)           │ verify state == cookie's state  │
  │                                 │ 4. exchange (token + nonce) ──▶ │ verify sig/iss/aud/exp
  │                                 │                                 │ + nonce claim matches
  │ ◀─ Set-Cookie + redirect ───────│ ◀───── token pair ───────────── │
```

The interesting engineering is all around that **cross-site callback**:

- **Antiforgery must be bypassed** (`[IgnoreAntiforgeryToken]`) because the POST comes from
  `appleid.apple.com`, which cannot know our antiforgery token. Its replacement is the
  **state cookie**: `/auth/apple/start` seals a random `state` (plus the nonce, Turnstile
  token, and return URL) into a DataProtection-encrypted, HttpOnly, 10-minute cookie, and the
  callback only proceeds if the `state` field Apple echoes back matches the one inside the
  cookie. An attacker can't forge the cookie (it's encrypted and integrity-protected) and
  can't read the state out of it — so a forged callback POST fails the comparison.
- **`SameSite=None; Secure`** on that cookie, with a comment explaining why: a `Lax` cookie
  wouldn't travel on a cross-site POST at all, and `None` requires `Secure`. This is also why
  *Apple sign-in is untestable on plain-http localhost* — Apple additionally refuses
  non-https redirect URIs.
- **The nonce closes the replay hole.** Because the token arrives via a browser redirect,
  a token minted in one context could in principle be injected into another. The nonce minted
  at `/start` rides inside the sealed cookie *and* is embedded by Apple into the ID token;
  the API refuses the token unless the two match (`OidcIdTokenVerifier.cs:83-90`). A stolen
  Apple ID token can't be replayed through someone else's sign-in attempt.
- **Apple sends the person's name exactly once** — as a JSON `user` form field on the very
  first authorization, never in the ID token. `ExtractAppleName` captures it that one time
  and passes it as a display-name hint; miss it and the user is forever `"Neighbor"` (well,
  or their email local-part — see `IdentityService.FirstNonEmpty`).
- **User cancellation isn't an error**: Apple reports `user_cancelled_authorize` via the
  `error` field, and the callback just returns the person to the login page quietly.

## At the API: verification and account rules

`POST` session-create lands in `IdentityService.CreateSessionAsync`, which runs:

1. **Turnstile** (bot check) if configured — before any crypto work.
2. **Token verification** via the provider's port (`IIdTokenVerifier`, resolved by provider
   name — the ports-and-adapters seam; verifiers live in `Proxies/Identity/`). The shared
   base class `OidcIdTokenVerifier`:
   - pulls the provider's **JWKS via its OIDC discovery document**, cached and auto-refreshed
     by `ConfigurationManager` (so Google/Apple key rotation just works, and steady-state
     sign-ins make no network call to the provider);
   - validates **signature, issuer, audience, lifetime** in one `ValidateTokenAsync` call;
   - **fails closed**: an environment with no configured client ids rejects *all* tokens for
     that provider (`ValidAudiences.Count == 0` → reject). This is why an empty
     `GOOGLE_CLIENT_ID` means "sign-in dark", not "sign-in insecure";
   - enforces the **nonce** match when either side supplied one.
   The audience check is the anti-confused-deputy control: a valid Google token minted for
   some *other* app's client id is rejected here, so "any Google token" is never enough.
3. **Find-or-create by `(provider, subject)`** — never by email. `sub` is the stable key;
   emails are mutable and, for Apple, possibly a private relay address.
4. **The email-collision rule**: if a *new* `(provider, subject)` arrives whose verified
   email already belongs to an existing user, sign-in fails with `use_original_provider`
   rather than silently creating a doppelgänger account. Automatic account-linking is
   deliberately deferred (SYSTEM_DESIGN §6) — linking accounts based on email alone is a
   classic account-takeover vector when one provider's email verification is weaker.
5. **Issue Steeple's own token pair** (next section) and emit the `sso_completed` analytics
   event. Provider tokens are never stored; from here on the provider is out of the picture.

## Steeple's own tokens: short access + rotating refresh families

Once identity is established, the API mints credentials *it* controls (so sessions can be
revoked server-side — something you can't do to a provider's ID token):

- **Access token**: a JWT signed with the API's own HMAC key (`Auth:Jwt:SigningKey`),
  15-minute lifetime. Short enough that revocation lag is bounded; verified statelessly on
  every API call.
- **Refresh token**: a high-entropy random string, ~90-day lifetime, stored **hashed** in
  Postgres (a DB leak doesn't yield usable tokens — same reasoning as password hashing).
- **Rotation with family-wide reuse detection** (`IdentityService.RefreshAsync`): every
  refresh *consumes* the presented token and issues a new one, both linked by a `FamilyId`
  (one family ≈ one signed-in device/session). If a token that was **already rotated** is
  presented again, two parties are holding tokens from the same family — the legitimate
  client and a thief — and you can't tell which one you're talking to. The response is to
  revoke the entire family: *"Kill every descendant so a stolen token can't keep a session
  alive."* Both holders get signed out; the legitimate user just signs in again, the thief
  is done. `FamilyId` doubles as the session id, which is what "sign out" and "sign out
  everywhere" revoke.

## The cookie session, silent refresh, and sign-out

`SteepleCookieEvents.ValidatePrincipal` runs on every authenticated request to the Web app:

- The ticket inside the cookie stores `access_token`, `refresh_token`, and a nominal
  `expires_at` (kept alongside so the BFF never parses its own JWT).
- While the access token has >1 minute left (`ExpirySkew` — so in-flight requests don't race
  a dying token), do nothing.
- Past that, rotate the pair at the API and renew the cookie (`ShouldRenew = true`). The
  user experiences a permanent session while the underlying API credential changes every
  ~14 minutes.
- **Rotation refused** (family revoked, expired, reuse-detected) → reject the principal and
  sign the browser out. This is how a server-side "sign out everywhere" propagates to a
  browser that still holds a syntactically valid cookie.
- **API unreachable** is deliberately *not* a sign-out: "signing everyone out on a blip
  would be worse" — the request's real API call will fail visibly instead.

Sign-out (`/auth/signout`) is the mirror image: best-effort revoke of the API-side family,
then clear the cookie. If revocation fails, the cookie still dies; the orphaned family just
idle-expires server-side.

## The supporting cast

- **Feature flag `web.sign_in_enabled`** gates every auth endpoint *and* the login UI
  (config-backed until the flags SDK is wired). Off = the greyed-out "coming soon" buttons.
  Note the endpoints check it too — dark-launching UI without closing the endpoints would
  leave the feature reachable by anyone who knows the URLs.
- **Turnstile** (Cloudflare's CAPTCHA-alternative) is optional by config: the login page
  hides the provider buttons until the widget produces a token; the token rides along with
  the sign-in (Apple: sealed inside the state cookie across the redirect) and the *API*
  verifies it server-side with the secret key. Empty keys = check disabled, locally.
- **Legal agreements**: the consent copy says continuing accepts the ToS + Privacy versions,
  so after a successful sign-in the BFF records both acceptances (idempotent per version;
  best-effort, re-recorded next sign-in on a miss).

## Recap: which threat does each piece answer?

| Threat | Countermeasure |
|---|---|
| Password database breach | No passwords exist — SSO only |
| Forged/altered ID token | Provider JWKS signature check (`OidcIdTokenVerifier`) |
| Token minted for another app replayed here | `aud` must be a configured client id; empty config fails closed |
| Apple ID token replayed via redirect flow | Nonce bound into sealed state cookie, echoed in token, compared at API |
| CSRF on Google sign-in POST | Same-origin form + standard antiforgery token |
| CSRF/forgery on Apple's cross-site callback | DataProtection-sealed `state` cookie comparison |
| XSS stealing bearer tokens | No token ever reaches the browser (BFF; HttpOnly encrypted cookie) |
| Stolen refresh token replay | Rotation + family-wide revocation on reuse |
| Refresh tokens leaked from the DB | Stored hashed |
| Revocation ("sign out everywhere") | Short-lived access JWT + family revoke; cookie rejected on failed rotation |
| Account takeover via cross-provider email match | `use_original_provider` refusal; auto-linking deferred |
| Bot sign-ups | Optional Turnstile, verified server-side at the API |
