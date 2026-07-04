import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import '../models/models.dart';
import 'session_manager.dart';
import 'session_state.dart';

/// Fixture-backed [SessionManager] for `STEEPLE_FAKES=true` builds, widget
/// tests, and the integration-test happy path (mock SSO — MOBILE_DESIGN §7).
/// Signs in instantly with the `auth_session.json` fixture user; no native
/// sheets, no storage, no network.
class FakeSessionManager implements SessionManager {
  FakeSessionManager({this.startSignedIn = false});

  final bool startSignedIn;
  final _state = ValueNotifier<SessionState>(const SessionUnknown());
  final List<Future<void> Function()> _signOutHandlers = [];

  /// Set to make the next [signIn] fail or cancel — error-state UI work.
  SignInResult? nextSignInResult;

  @override
  ValueListenable<SessionState> get state => _state;

  @override
  Future<void> restore() async {
    _state.value = startSignedIn ? SignedIn(await _fixtureUser()) : const SignedOut();
  }

  @override
  Future<SignInResult> signIn(SsoProvider provider) async {
    await Future<void>.delayed(const Duration(milliseconds: 300));
    final scripted = nextSignInResult;
    if (scripted != null) {
      nextSignInResult = null;
      return scripted;
    }
    final user = await _fixtureUser();
    _state.value = SignedIn(user);
    return SignInSuccess(user, isNewUser: false);
  }

  @override
  Future<void> signOut() async {
    for (final handler in List.of(_signOutHandlers)) {
      try {
        await handler();
      } catch (_) {}
    }
    _state.value = const SignedOut();
  }

  @override
  Future<void> forceSignOut() async {
    _state.value = const SignedOut(wasForced: true);
  }

  @override
  Future<String?> validAccessToken() async =>
      _state.value is SignedIn ? 'fake-access-token' : null;

  @override
  Future<bool> refreshAfter401() async => _state.value is SignedIn;

  @override
  void addSignOutHandler(Future<void> Function() handler) => _signOutHandlers.add(handler);

  Future<UserProfile> _fixtureUser() async {
    final raw = await rootBundle.loadString('test/fixtures/auth_session.json');
    final session = AuthSession.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    return session.user;
  }
}
