import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Which backend this build points at (MOBILE_CONTRACTS §3).
enum SteepleEnv { dev, prod }

/// Compile-time configuration, parsed once from `--dart-define`s in [main].
/// The app holds nothing but public config — no secrets in the binary
/// (MOBILE_DESIGN §2). Defaults are the dev loop against a local API.
class EnvConfig {
  const EnvConfig({
    required this.env,
    required this.apiBaseUrl,
    required this.sentryDsn,
    required this.useFakes,
    required this.canonicalWebHost,
    required this.buildNumber,
  });

  /// `--dart-define=STEEPLE_ENV=dev|prod`.
  final SteepleEnv env;

  /// Dev: `http://localhost:5200` (Android emulator: `http://10.0.2.2:5200`).
  final Uri apiBaseUrl;

  /// Null in dev → Sentry stays off entirely.
  final String? sentryDsn;

  /// `--dart-define=STEEPLE_FAKES=true` → fixture-backed fake repositories
  /// (MOBILE_CONTRACTS §11); how UI work proceeds without a running backend.
  final bool useFakes;

  /// For universal-link parsing (e.g. `steeple.example`).
  final String canonicalWebHost;

  /// Integer build number sent as `?build=` to the flags proxy so server-side
  /// rules (`mobile.force_upgrade`) can evaluate against it (CONTRACTS §8).
  final int buildNumber;

  static EnvConfig fromDartDefines() {
    const envRaw = String.fromEnvironment('STEEPLE_ENV', defaultValue: 'dev');
    const apiUrl = String.fromEnvironment('STEEPLE_API_URL', defaultValue: 'http://localhost:5200');
    const dsn = String.fromEnvironment('STEEPLE_SENTRY_DSN');
    const fakes = bool.fromEnvironment('STEEPLE_FAKES');
    const host = String.fromEnvironment('STEEPLE_WEB_HOST', defaultValue: 'steeple.example');
    const build = int.fromEnvironment('STEEPLE_BUILD', defaultValue: 1);
    return EnvConfig(
      env: envRaw == 'prod' ? SteepleEnv.prod : SteepleEnv.dev,
      apiBaseUrl: Uri.parse(apiUrl),
      sentryDsn: dsn.isEmpty ? null : dsn,
      useFakes: fakes,
      canonicalWebHost: host,
      buildNumber: build,
    );
  }
}

/// Overridden with the parsed config in `bootstrap.dart` — reading it without
/// the override is a wiring bug, so fail loudly.
final envProvider = Provider<EnvConfig>(
  (ref) => throw UnimplementedError('envProvider must be overridden in ProviderScope'),
);
