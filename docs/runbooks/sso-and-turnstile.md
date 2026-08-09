# Production SSO and Turnstile

The Google, Apple, and Turnstile code paths are shipped. Production startup requires Apple and
an explicit mode for both SSO providers and Turnstile; the web image refuses to build without
Apple's Services ID and redirect URI. Use `.env.example` as the deployment input inventory.

## Configure providers

For Google, create a web OAuth client for the production origin. Set
`GOOGLE_SSO_MODE=enabled` and `GOOGLE_CLIENT_ID`; otherwise set the mode to `disabled` and leave
the ID empty.

For Apple, Jeremy must complete these external steps before deployment:

1. Create the Sign in with Apple Services ID.
2. Register the exact production domain and HTTPS return URL in Apple Developer.
3. Set `APPLE_SERVICES_ID` and `APPLE_REDIRECT_URI`. Compose sends the Services ID to the API's
   accepted audiences and bakes both values into the web bundle.
4. Rebuild and redeploy both API and web images.

The code-side smoke is `npm run smoke:providers --prefix src/Steeple.Web.v2`; it builds a
production graph and asserts that Google and Apple controls both render when configured.

## Choose Turnstile mode

Pre-release may set `TURNSTILE_MODE=disabled` with both key values empty. General release must
set `TURNSTILE_MODE=enabled`, `TURNSTILE_SECRET_KEY`, and `TURNSTILE_SITE_KEY`. The API fails
closed when enabled verification cannot complete; the web image rejects enabled-without-site-key
and disabled-with-site-key combinations. Compose and Bake expose the site key to the web build as
a BuildKit secret, not an image argument or environment layer. The key is still public in the
browser bundle by design. If only the site key changes, rebuild the web image without cache because
BuildKit does not invalidate a build step when secret contents change.

## Real Apple acceptance test

This remains an owner-run test because it requires the Apple Developer account and a real Apple
identity. After deployment, verify the first sign-in's once-only name, a private-relay email,
the agreement gate, refresh after reload, sign-out, and repeat sign-in. The repeat must succeed
without relying on Apple returning the name again.
