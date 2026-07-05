---
name: verify
description: Drive Steeple's real flows (API/Web/Admin) to verify a change at runtime — build/launch recipe, dev auth handle, and gotchas for this repo.
---

# Verifying Steeple changes at runtime

## Launch (dev loop — compose images go stale, see gotchas)

```bash
docker compose up -d postgres migrate          # DB on localhost:5433 + changelog applied
ASPNETCORE_ENVIRONMENT=Development /usr/local/share/dotnet/dotnet run \
  --project src/Steeple.Api  --no-launch-profile --urls http://localhost:5200 &
ASPNETCORE_ENVIRONMENT=Development Api__BaseUrl=http://localhost:5200 \
  /usr/local/share/dotnet/dotnet run \
  --project src/Steeple.Web  --no-launch-profile --urls http://localhost:5187 &
# Admin (no auth by design): dotnet run --project src/Steeple.Admin --urls http://localhost:5299
```

Wait for readiness with `curl -s http://localhost:5200/api/v1/geofence` (anonymous, cheap).

## Authenticated API calls without SSO

There is no fake SSO verifier, but the dev JWT signing key is committed
(`src/Steeple.Api/appsettings.Development.json`, `Auth:Jwt:SigningKey`), validation is
signature-only (HS256, iss `steeple-api`, aud `steeple`, claims `sub`/`sid`/`name`), and no
per-request session lookup happens. So:

1. Insert a user row (and a `venue_managers` row for provider endpoints) straight into
   Postgres: `docker exec steeple-postgres psql -U steeple -d steeple ...`.
2. Mint a token — HMAC-SHA256 over `base64url(header).base64url(payload)` with the
   base64-decoded key; 15-min expiry. openssl one-liner works
   (`openssl dgst -sha256 -mac HMAC -macopt hexkey:...`).
3. `Authorization: Bearer <jwt>`. Turnstile is disabled in dev (empty secret) — pass any
   `turnstileToken`. Application submits need an `Idempotency-Key` header.

Seeded room handy for flows: Fellowship Hall `10000000-0000-0000-0000-000000000001`
(venue `11111111-1111-1111-1111-111111111111`, slug `grace-community-vienna/fellowship-hall`,
tz America/New_York). Draft room `renovation-annex` must stay 404 publicly.

**Web submit flows can't be driven headlessly** — the `steeple.auth` cookie is
DataProtection-encrypted and unforgeable. Verify Web GET renders + BFF mapping code, and
drive the mutation at the API surface instead.

## Gotchas

- `cd` into the repo can strip PATH (local env hook) — use absolute paths
  (`/usr/local/share/dotnet/dotnet`) and `git -C` / `--project`, avoid `cd`.
- The compose api/web/admin images are only as new as the last `--build`; a 200 from the
  compose stack does NOT clear the working tree. Runtime-verify via dotnet run, or
  `docker compose up -d --build` first. Check image age with `docker image inspect`.
- Apply-endpoint rate limiting (per-account `apply` policy) bites after a handful of
  probe submits — space probes or expect 429s.
- Integration tests: `tests/Steeple.Integration.Tests/Fixtures/PostgresDatabaseFixture.cs`
  hardcodes the changelog file list — new `db/changelog/0XX-*.sql` files must be added
  there or every seeding test fails on missing columns.
- Full reset (`docker compose down -v && docker compose up -d`) re-runs the whole
  changelog + seed; incremental `docker compose up -d migrate` applies only new changesets.
- Rate-limit and lazy-sweep behavior make responses time-dependent; assert on shape, not
  exact counts, where sweeps are involved.
