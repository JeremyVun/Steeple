# Steeple mobile

Flutter app for Steeple — the organizer's home for finding and booking
neighborhood church spaces. Design: `docs/MOBILE_DESIGN.md`. In-app seams
(interfaces, routes, providers — **binding contracts**): `docs/MOBILE_CONTRACTS.md`.
Wire shapes: `docs/CONTRACTS.md`. Tokens/UX: `docs/DESIGN_SYSTEM.md`.

## Run it

```bash
# Fixture-backed, no backend needed — how most UI work happens:
flutter run --dart-define=STEEPLE_FAKES=true

# Against a local API (docker compose up -d, or dotnet run in src/Steeple.Api):
flutter run                                            # iOS sim → localhost:5200
flutter run --dart-define=STEEPLE_API_URL=http://10.0.2.2:5200   # Android emulator

flutter analyze && flutter test   # part of done for every PR (MOBILE_CONTRACTS §12)
```

All `--dart-define`s (see `lib/app/env_config.dart`): `STEEPLE_ENV` (dev|prod),
`STEEPLE_API_URL`, `STEEPLE_FAKES`, `STEEPLE_SENTRY_DSN`, `STEEPLE_WEB_HOST`,
`STEEPLE_BUILD` (int; feeds `?build=` on the flags proxy).

## Orientation (10 lines)

- `lib/app/` — bootstrap (composition root; deferred-init order is budgeted),
  router (`core/navigation/route_names.dart` holds the route-name contract),
  theme (`tokens.dart` is the ONLY file with raw hex).
- `lib/core/` — api (dio chain + `AppError`, the only error type repos throw),
  auth (`SessionManager`), models (freezed wire mirrors + `wire_tokens.dart`),
  analytics (batcher), flags, push (noop until Firebase config exists),
  widgets (the §9 shared kit — never re-implement a status chip or card).
- `lib/features/<x>/` — `data/` (repo + `fake/`), `application/` (notifiers),
  `presentation/` (widgets only). Cross-feature access ONLY via a feature's
  `providers.dart`. Riverpod 3 **without codegen** (plain `Notifier`/
  `AsyncNotifier`; family args via constructor — see any `providers.dart`).
- `test/fixtures/*.json` — verbatim CONTRACTS.md shapes; bundled as assets so
  `Fake*Repository` serves them at runtime too. A failing fixture round-trip
  test means the wire contract moved: update model + fixture + CONTRACTS.md.

## Not wired yet (deliberate, release-time setup)

- **Firebase/FCM**: no `google-services.json`/`GoogleService-Info.plist` in the
  repo; bootstrap catches init failure and push stays a no-op. Add the config
  files + apply the google-services gradle plugin when the Firebase project exists.
- **Google Maps keys**: Android `-PMAPS_API_KEY=…` gradle property; iOS
  `GoogleMapsApiKey` in Info.plist. Empty = blank map tiles, all else works.
- **SSO client ids**: `google_sign_in` iOS URL scheme + serverClientId, and the
  Apple Services ID, land with the production SSO setup (launch checklist —
  `docs/backlog/phase-6-reputation-and-launch.md`).
- **`ios/Runner/Runner.entitlements`** (applinks, Sign in with Apple, aps) is
  written but must be attached to the Runner target in Xcode when signing is
  set up. The Google SSO button uses a text-only stand-in pending the official
  brand asset.
- **Turnstile**: the apply repo sends an empty token; only enforced in
  environments with a configured secret.
