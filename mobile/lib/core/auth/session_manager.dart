import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'session_state.dart';

/// Owns tokens, refresh, and the sign-in/out state stream (MOBILE_CONTRACTS §6).
///
/// Rules: tokens live only in secure storage; refresh is single-flight
/// (concurrent 401s await one refresh); [forceSignOut] makes no network calls.
/// The apply draft survives sign-in because it lives in a provider keyed
/// outside this state.
abstract class SessionManager {
  /// Exposed to the app as [sessionProvider]; the router's refresh listenable.
  ValueListenable<SessionState> get state;

  /// Restores tokens/user from secure storage at bootstrap; resolves
  /// [SessionUnknown] into SignedIn/SignedOut.
  Future<void> restore();

  /// Runs the provider's native sheet → `POST /auth/sessions` → stores the
  /// token pair. Sheet dismissal returns [SignInCancelled], never an error.
  Future<SignInResult> signIn(SsoProvider provider);

  /// Revoke server-side + run [addSignOutHandler] hooks (device unregister)
  /// while still authenticated + wipe storage.
  Future<void> signOut();

  /// The `token_reuse`/refresh-failure path: wipe local state and emit
  /// `SignedOut(wasForced: true)` — no network calls.
  Future<void> forceSignOut();

  /// Used by the auth interceptor only — returns a non-expired access token,
  /// refreshing (single-flight) when the stored one is stale. Null when
  /// signed out or refresh fails.
  Future<String?> validAccessToken();

  /// Single-flight refresh after a 401 response; true when a new token pair
  /// was obtained. A refresh rejection forces sign-out internally.
  Future<bool> refreshAfter401();

  /// Registers work that must run during [signOut] while the session is still
  /// valid (e.g. `DELETE /me/devices/{token}`). Hooks are best-effort.
  void addSignOutHandler(Future<void> Function() handler);
}

/// The session state the whole app watches (`core` public surface,
/// MOBILE_CONTRACTS §8). Overridden in bootstrap with the real manager's
/// listenable.
final sessionManagerProvider = Provider<SessionManager>(
  (ref) => throw UnimplementedError('sessionManagerProvider is overridden in bootstrap'),
);

final sessionProvider = Provider<SessionState>((ref) {
  final listenable = ref.watch(sessionManagerProvider).state;
  void onChange() => ref.invalidateSelf();
  listenable.addListener(onChange);
  ref.onDispose(() => listenable.removeListener(onChange));
  return listenable.value;
});
