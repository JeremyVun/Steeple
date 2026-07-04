import '../models/models.dart';

/// Which native SSO sheet to run (PRD: SSO-only auth, Google + Apple).
enum SsoProvider { google, apple }

extension SsoProviderWire on SsoProvider {
  /// The wire token for `POST /auth/sessions` (CONTRACTS §4).
  String get wireToken => switch (this) {
        SsoProvider.google => 'google',
        SsoProvider.apple => 'apple',
      };
}

/// Auth state machine (MOBILE_CONTRACTS §6). `SessionUnknown` only exists
/// during the storage restore at cold start — the router holds splash on it,
/// so restore must resolve well inside the cold-start budget.
sealed class SessionState {
  const SessionState();
}

class SessionUnknown extends SessionState {
  const SessionUnknown();
}

class SignedOut extends SessionState {
  const SignedOut({this.wasForced = false});

  /// True on the `token_reuse`/refresh-failure path — the router redirects
  /// and the shell shows the one "You've been signed out" snackbar.
  final bool wasForced;
}

class SignedIn extends SessionState {
  const SignedIn(this.user);

  final UserProfile user;
}

/// Outcome of a sign-in attempt. `cancelled` is a normal user action (sheet
/// dismissed) — callers stay put and never render it as an error.
sealed class SignInResult {
  const SignInResult();
}

class SignInSuccess extends SignInResult {
  const SignInSuccess(this.user, {required this.isNewUser});

  final UserProfile user;
  final bool isNewUser;
}

class SignInCancelled extends SignInResult {
  const SignInCancelled();
}

class SignInFailed extends SignInResult {
  const SignInFailed(this.error);

  /// An AppError from `core/api` (e.g. `use_original_provider` conflict —
  /// surfaced with provider-specific copy at the SSO gate).
  final Object error;
}
