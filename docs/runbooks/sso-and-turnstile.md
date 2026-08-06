# Runbook — production sign-in (Google, Apple) and Turnstile

Owns: turning the sign-in providers and the bot check on for a deployed Steeple, and proving
they work. The **code is already there and already shipped** (`v2_migration` P4, 2026-08-07) —
this is a configuration exercise, not a build one.

Everything below is **fail-safe in both directions**, which is what makes it safe to do
incrementally:

- The web app offers a provider **only when its client id is in the build**
  (`src/Steeple.Web.v2/src/data/providers.js`). No id, no button, no SDK fetched.
- The API accepts a provider's tokens **only when its `ClientIds` list is non-empty**
  (`Auth:Google:ClientIds` / `Auth:Apple:ClientIds`) — an empty list rejects that provider,
  so it fails **closed**.
- Turnstile is off on both sides until keyed: no `VITE_TURNSTILE_SITE_KEY` means no widget and
  a null token, and no `Turnstile__SecretKey` means the API does not check one, so it fails
  **open**. Configure the two together or the check is theatre.

⚠ The **dev provider must keep working in Development** (`Auth:DevLoginEnabled`,
`appsettings.Development.json` only). It is the local loop and every `tools/*.mjs` harness's
only way in. It is not registered outside Development, so there is nothing to turn off in
production.

---

## 1. What has to exist before anything is configured

| Thing | Why |
|---|---|
| The public origin Steeple is served from (e.g. `https://steeple.jeremyvun.com`) | Both providers pin their credentials to exact origins. Decide the final one **before** creating them — changing it later means re-issuing the Apple Services ID. |
| TLS at the edge | Google refuses non-`https` origins other than `localhost`; Apple refuses them outright. Caddy already terminates TLS. |
| An Apple Developer Program membership (~USD 99/yr) | Sign in with Apple has no free tier. Google's is free. |

Google can go live without Apple. Do it first: it is free, it is ten minutes, and it proves
the whole token path end to end before anyone pays Apple.

---

## 2. Google — an OAuth 2.0 Web client

1. <https://console.cloud.google.com> → create a project (`Steeple`) if there is not one.
2. **APIs & Services → OAuth consent screen.** External. Fill in app name, support email,
   developer contact, the app's home page, and the **privacy policy and terms URLs** — those
   are `https://<origin>/privacy.html` and `https://<origin>/terms.html`, which the app now
   serves as real pages (that is one of the reasons they exist).
   Scopes: the default `openid`, `email`, `profile`. Nothing sensitive, so no verification
   review is required.
3. **Credentials → Create credentials → OAuth client ID → Web application.**
   - *Authorised JavaScript origins:* `https://<origin>` — **origin only, no path, no trailing
     slash.** Add `http://localhost:5173` too if a dev-prod parity run is wanted locally.
   - *Authorised redirect URIs:* **none.** Google Identity Services returns the ID token to a
     JavaScript callback; there is no redirect in this flow.
4. Copy the **Client ID** (`…apps.googleusercontent.com`). There is a client *secret* on the
   same screen — Steeple never uses it. Do not deploy it anywhere.

Set:

| Where | Name | Value |
|---|---|---|
| Web build | `VITE_GOOGLE_CLIENT_ID` | the client id |
| API env | `Auth__Google__ClientIds__0` | the same client id |

`ClientIds` is a **list**: the mobile app's own client ids go in `__1`, `__2` … as they land.
Each is an accepted `aud`; a token whose `aud` is not listed is rejected.

---

## 3. Apple — a Services ID

Apple's model is three objects, in this order.

1. <https://developer.apple.com/account> → **Certificates, Identifiers & Profiles →
   Identifiers**.
2. **App ID** (`+` → App IDs → App). Bundle id e.g. `com.jeremyvun.steeple`. Enable the
   **Sign in with Apple** capability. (Needed even for web: the Services ID is grouped under a
   primary App ID.)
3. **Services ID** (`+` → Services IDs). Identifier e.g. `com.jeremyvun.steeple.web` — **this
   string is the web "client id"**, not the bundle id. Enable Sign in with Apple, then
   *Configure*:
   - *Primary App ID:* the App ID above.
   - *Domains and Subdomains:* `steeple.jeremyvun.com` (**no scheme**).
   - *Return URLs:* `https://steeple.jeremyvun.com/` — Apple validates the popup against this
     even though `response_type=code id_token` + `responseMode: web_message` never navigates to
     it. It must match the `VITE_APPLE_REDIRECT_URI` below **exactly**, trailing slash included.
4. **No `.p8` key is needed.** Steeple takes the `id_token` straight out of the authorization
   response and verifies it against Apple's public JWKS, so there is no code exchange, no client
   secret to sign, and no private key to store or rotate (SYSTEM_DESIGN §17, 2026-07-04). If a
   procedure anywhere tells you to create a Sign In with Apple key, it is describing the flow
   Steeple deliberately does not use.

Set:

| Where | Name | Value |
|---|---|---|
| Web build | `VITE_APPLE_CLIENT_ID` | the **Services ID** (`com.jeremyvun.steeple.web`) |
| Web build | `VITE_APPLE_REDIRECT_URI` | the Return URL, exactly |
| API env | `Auth__Apple__ClientIds__0` | the **Services ID** |
| API env | `Auth__Apple__ClientIds__1` | the **App bundle id**, once the mobile app ships — the native SDK's tokens carry the bundle id as `aud`, not the Services ID |

The web button appears only when **both** `VITE_APPLE_*` are set: half a configuration is no
configuration, and Apple refuses the popup without both.

**Apple sends the person's name exactly once**, in the first authorization response, never in
the token and never again. The client passes it as `displayName` and the API honours it only
while creating the account. If a test account comes out named wrongly, delete it at
<https://appleid.apple.com> → *Sign in with Apple* → stop using the app, then sign in again —
that is the only way to make Apple re-send the name.

---

## 4. Turnstile

1. Cloudflare dashboard → **Turnstile → Add site**. Hostname `steeple.jeremyvun.com`. Widget
   mode **Managed**. Free at any volume Steeple will see.
2. Copy the **site key** (public) and the **secret key**.

| Where | Name | Value |
|---|---|---|
| Web build | `VITE_TURNSTILE_SITE_KEY` | site key |
| API env | `Turnstile__SecretKey` | secret key |

Set both or neither. Site key alone renders a widget whose token nothing verifies; secret alone
rejects every sign-in and every request, because the client sends null.

Two writes carry a token: `POST /auth/sessions` and `POST /listings/{id}/applications`. Both
already have the field on the wire.

For a staging run, Cloudflare publishes **test keys** — site `1x00000000000000000000AA` (always
passes) and `2x00000000000000000000AB` (always blocks), with secrets `1x0000…`/`2x0000…` on the
same page. The blocking pair is the only cheap way to see the refusal copy and the widget reset
on a real screen.

---

## 5. The rest of the identity env

Independent of the providers, and already required:

| Name | Notes |
|---|---|
| `Auth__Jwt__SigningKey` | base64, **≥32 bytes**. The API **fails to start without it** — a misconfigured production fails closed rather than issuing unverifiable tokens. Generate with `openssl rand -base64 48`. Rotating it signs everyone out; there is no key-id rollover. |
| `Auth__Jwt__Issuer` / `Audience` | defaults (`steeple-api` / `steeple`) are fine |
| `Auth__RefreshTokenDays` | default 90 |
| `Auth__RefreshReuseGraceSeconds` | default 30. Do not set to 0: it is what stops two browser tabs refreshing at the same instant from revoking each other's family (`docs/contracts/identity.md`). |

---

## 6. Build-time vs run-time — the trap

`VITE_*` variables are **baked into the bundle at `npm run build`**, not read by nginx at
start-up. A container built without them serves an app with no provider buttons however the
environment is set afterwards. They must be present in the **image build**, which means the
build workstream's Dockerfile/bake definition, not the compose `environment:` block. The
`Auth__*` / `Turnstile__SecretKey` values are the opposite — ordinary API env, changeable with a
restart.

The client ids are **public by design** (they travel in every sign-in request). Baking them into
a bundle leaks nothing. The secrets — `Turnstile__SecretKey`, `Auth__Jwt__SigningKey` — are
API-side only and must never appear in a `VITE_` name.

The edge already allows what these need: `nginx.conf`'s CSP carries the Google, Apple and
Turnstile script/frame/connect origins, written in ahead of go-live precisely so that no policy
edit is needed on the day.

---

## 7. Proving it

In order, stopping at the first failure:

1. **The build offers them.** Load the deployed app signed out, open the sign-in panel from the
   header: a Google button and/or "Continue with Apple", and **no** email form or persona list
   (those are dev-build only). If they are missing, the `VITE_*` values did not reach the build.
2. **The console is clean.** No CSP violation for `accounts.google.com`, `appleid.cdn-apple.com`
   or `challenges.cloudflare.com`. A violation here means the edge is not serving this repo's
   `nginx.conf`.
3. **Google end to end.** Sign in. Expect a new account, the identity chip, and — on a first
   sign-in — the agreement prompt naming Terms & safety and Privacy policy. Then
   `GET /api/v1/me` with the resulting bearer: `agreements` holds both `docType`s at the version
   in `src/data/agreements.js`.
   - `401 invalid_id_token` ⇒ the `aud` is not in `Auth__Google__ClientIds` (usually: the id was
     set on the web build but not on the API, or vice versa).
   - The button never renders and the console says the origin is not allowed ⇒ the *Authorised
     JavaScript origin* does not match, character for character.
4. **Apple end to end.** Same, from a real device or browser — the popup does not work from a
   headless harness, which is why this step is the deployed environment's and not CI's.
   - `invalid_client` in Apple's own popup ⇒ Services ID, domain or Return URL mismatch.
5. **Turnstile.** With the always-blocking test key configured, a sign-in is refused in
   Steeple's own words and the widget asks for a fresh check; swap to the real key and the same
   sign-in succeeds. A token is spent by the verification it fails as surely as by one it
   passes, which is why the client resets the widget on refusal.
6. **Nothing regressed locally.** `Auth:DevLoginEnabled` is Development-only, so a production
   deployment has no dev provider at all; confirm the local loop and `tools/hardening-test.mjs`
   still run against a Development API afterwards.

## 8. What is deliberately not here

- **Account linking across providers.** One person signing in with Google and later with Apple
  on the same email gets `409 use_original_provider` and is told which to use. Merging accounts
  is not built and is not a launch gate.
- **Provider avatars.** The CSP allows `googleusercontent.com` images, but nothing renders one:
  Steeple draws a monogram. The allowance is there so that turning it on later is not a
  security-header change.
- **Legal review.** `public/terms.html` and `public/privacy.html` are the founder's
  plain-English preview text and say so on the page. A lawyer's version is a launch gate
  (`docs/backlog/phase-6-reputation-and-launch.md`), and bumping the words means bumping the
  versions in `src/data/agreements.js` in the same commit — that is what makes everyone
  re-accept.
