import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

import '../api/app_error.dart';
import '../models/models.dart';
import 'session_manager.dart';
import 'session_state.dart';

/// Real [SessionManager] over secure storage + `POST /api/v1/auth/sessions`.
///
/// Uses its own bare [Dio] (base URL only, no auth interceptor) — auth
/// endpoints never carry a bearer token, and this breaks the dio↔session
/// dependency cycle.
@visibleForTesting
class NativeSsoCredential {
  const NativeSsoCredential({
    required this.idToken,
    this.rawNonce,
    this.displayName,
  });

  final String idToken;
  final String? rawNonce;
  final String? displayName;
}

@visibleForTesting
typedef NativeSsoCredentialProvider =
    Future<NativeSsoCredential> Function(SsoProvider provider);

class ApiSessionManager implements SessionManager {
  ApiSessionManager({
    required Dio authDio,
    FlutterSecureStorage? storage,
    @visibleForTesting NativeSsoCredentialProvider? credentialProvider,
  }) : _dio = authDio,
       _storage = storage ?? const FlutterSecureStorage(),
       _credentialProvider = credentialProvider;

  static const _accessKey = 'steeple.access';
  static const _refreshKey = 'steeple.refresh';
  static const _userKey = 'steeple.user';

  final Dio _dio;
  final FlutterSecureStorage _storage;
  final NativeSsoCredentialProvider? _credentialProvider;
  final _state = ValueNotifier<SessionState>(const SessionUnknown());
  final List<Future<void> Function()> _signOutHandlers = [];

  String? _accessToken;
  String? _refreshToken;
  Future<bool>? _inflightRefresh;
  Future<void> _storageTail = Future.value();
  var _identityGeneration = 0;
  int? _signInGeneration;

  @override
  ValueListenable<SessionState> get state => _state;

  @override
  int get identityGeneration => _identityGeneration;

  @override
  Future<void> restore() async {
    final generation = _advanceIdentity();
    try {
      final stored = await Future.wait([
        _storage.read(key: _accessKey),
        _storage.read(key: _refreshKey),
        _storage.read(key: _userKey),
      ]);
      if (!_isCurrent(generation)) return;
      final accessToken = stored[0];
      final refreshToken = stored[1];
      final userJson = stored[2];
      if (refreshToken != null && userJson != null) {
        // Optimistic: trust the cached profile; a stale access token heals
        // itself through the interceptor's refresh on first use.
        final user = UserProfile.fromJson(
          jsonDecode(userJson) as Map<String, dynamic>,
        );
        _accessToken = accessToken;
        _refreshToken = refreshToken;
        _state.value = SignedIn(user);
      } else {
        _accessToken = null;
        _refreshToken = null;
        _state.value = const SignedOut();
      }
    } catch (_) {
      // Unreadable storage (OS keychain hiccough, migration) → signed out,
      // never a crash at boot.
      if (_isCurrent(generation)) {
        _accessToken = null;
        _refreshToken = null;
        _state.value = const SignedOut();
      }
    }
  }

  @override
  Future<SignInResult> signIn(SsoProvider provider) async {
    final generation = _advanceIdentity();
    _signInGeneration = generation;
    try {
      final credential =
          await (_credentialProvider?.call(provider) ??
              _nativeCredential(provider));
      if (!_isCurrentSignIn(generation)) return const SignInCancelled();
      final response = await _dio.post<Map<String, dynamic>>(
        '/api/v1/auth/sessions',
        data: {
          'provider': provider.wireToken,
          'idToken': credential.idToken,
          if (credential.rawNonce != null) 'nonce': credential.rawNonce,
          if (credential.displayName != null)
            'displayName': credential.displayName,
          'device': {
            'platform': Platform.isIOS ? 'ios' : 'android',
            'label': Platform.isIOS ? 'iPhone' : 'Android device',
          },
        },
      );
      final session = AuthSession.fromJson(response.data!);
      if (!_isCurrentSignIn(generation)) return const SignInCancelled();
      await _persistSession(session, generation);
      if (!_isCurrentSignIn(generation)) return const SignInCancelled();
      _state.value = SignedIn(session.user);
      return SignInSuccess(session.user, isNewUser: session.isNewUser);
    } on _SsoCancelled {
      return const SignInCancelled();
    } catch (e) {
      return SignInFailed(toAppError(e));
    } finally {
      if (_signInGeneration == generation) _signInGeneration = null;
    }
  }

  @override
  Future<void> signOut() async {
    final generation = _advanceIdentity();
    final accessToken = _accessToken;
    // Hooks run first, while the session is still valid (device unregister).
    for (final handler in List.of(_signOutHandlers)) {
      try {
        await handler();
      } catch (_) {
        // Best-effort by contract.
      }
    }
    try {
      await _dio.delete<void>(
        '/api/v1/auth/sessions',
        options: Options(headers: {'Authorization': 'Bearer $accessToken'}),
      );
    } catch (_) {
      // Local sign-out must succeed even when the network doesn't.
    }
    await _wipe(generation);
    if (_isCurrent(generation)) _state.value = const SignedOut();
  }

  @override
  Future<void> forceSignOut() async {
    final generation = _advanceIdentity();
    await _wipe(generation);
    if (_isCurrent(generation)) _state.value = const SignedOut(wasForced: true);
  }

  @override
  Future<String?> validAccessToken() async {
    final generation = _identityGeneration;
    final token = _accessToken;
    if (token != null && !_isExpiring(token)) return token;
    final refreshed = await refreshAfter401();
    return refreshed && _isCurrent(generation) ? _accessToken : null;
  }

  @override
  Future<bool> refreshAfter401() {
    // Single-flight: concurrent 401s share one refresh round-trip.
    final generation = _identityGeneration;
    return _inflightRefresh ??= _refresh(
      generation,
    ).whenComplete(() => _inflightRefresh = null);
  }

  Future<bool> _refresh(int generation) async {
    // A sign-in supersedes the current identity. Its result is the only
    // credential mutation allowed while the native sheet/API exchange runs.
    if (_signInGeneration == generation) return false;
    final refreshToken = _refreshToken;
    if (refreshToken == null) return false;
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/api/v1/auth/refresh',
        data: {'refreshToken': refreshToken},
      );
      final data = response.data!;
      if (!_isCurrentRefresh(generation, refreshToken)) return false;
      await _persistRefresh(
        accessToken: data['accessToken'] as String,
        refreshToken: data['refreshToken'] as String,
        generation: generation,
      );
      return _isCurrentRefresh(generation, null);
    } on DioException catch (e) {
      // invalid_refresh_token / token_reuse → the session is gone for good;
      // anything transient (offline) keeps the session for a later retry.
      if (e.response?.statusCode == 401 &&
          _isCurrentRefresh(generation, refreshToken)) {
        await _forceSignOutCurrent(generation, refreshToken);
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  @override
  void addSignOutHandler(Future<void> Function() handler) =>
      _signOutHandlers.add(handler);

  int _advanceIdentity() => ++_identityGeneration;

  bool _isCurrent(int generation) => generation == _identityGeneration;

  bool _isCurrentSignIn(int generation) =>
      _isCurrent(generation) && _signInGeneration == generation;

  bool _isCurrentRefresh(int generation, String? refreshToken) =>
      _isCurrent(generation) &&
      _signInGeneration != generation &&
      (refreshToken == null || _refreshToken == refreshToken);

  Future<void> _persistSession(AuthSession session, int generation) =>
      _mutateStorage(generation, () async {
        await _storage.write(key: _accessKey, value: session.accessToken);
        await _storage.write(key: _refreshKey, value: session.refreshToken);
        await _storage.write(
          key: _userKey,
          value: jsonEncode(session.user.toJson()),
        );
        if (_isCurrent(generation)) {
          _accessToken = session.accessToken;
          _refreshToken = session.refreshToken;
        }
      });

  Future<void> _persistRefresh({
    required String accessToken,
    required String refreshToken,
    required int generation,
  }) => _mutateStorage(generation, () async {
    await _storage.write(key: _accessKey, value: accessToken);
    await _storage.write(key: _refreshKey, value: refreshToken);
    if (_isCurrent(generation)) {
      _accessToken = accessToken;
      _refreshToken = refreshToken;
    }
  });

  Future<void> _forceSignOutCurrent(int generation, String refreshToken) async {
    if (!_isCurrentRefresh(generation, refreshToken)) {
      return;
    }
    final forcedGeneration = _advanceIdentity();
    await _wipe(forcedGeneration);
    if (_isCurrent(forcedGeneration)) {
      _state.value = const SignedOut(wasForced: true);
    }
  }

  Future<void> _wipe(int generation) => _mutateStorage(generation, () async {
    await _storage.delete(key: _accessKey);
    await _storage.delete(key: _refreshKey);
    await _storage.delete(key: _userKey);
    if (_isCurrent(generation)) {
      _accessToken = null;
      _refreshToken = null;
    }
  });

  Future<void> _mutateStorage(
    int generation,
    Future<void> Function() mutation,
  ) {
    final operation = _storageTail.then((_) async {
      if (_isCurrent(generation)) await mutation();
    });
    _storageTail = operation.catchError((_) {});
    return operation;
  }

  /// True when the JWT's `exp` is within 30s of now (or unparseable).
  static bool _isExpiring(String jwt) {
    try {
      final parts = jwt.split('.');
      final payload =
          jsonDecode(
                utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))),
              )
              as Map<String, dynamic>;
      final exp = DateTime.fromMillisecondsSinceEpoch(
        (payload['exp'] as num).toInt() * 1000,
      );
      return DateTime.now().isAfter(exp.subtract(const Duration(seconds: 30)));
    } catch (_) {
      return true;
    }
  }

  Future<NativeSsoCredential> _nativeCredential(SsoProvider provider) =>
      switch (provider) {
        SsoProvider.google => _googleCredential(),
        SsoProvider.apple => _appleCredential(),
      };

  Future<NativeSsoCredential> _googleCredential() async {
    final signIn = GoogleSignIn.instance;
    await signIn.initialize();
    try {
      final account = await signIn.authenticate();
      final idToken = account.authentication.idToken;
      if (idToken == null) {
        throw const AppError(
          kind: AppErrorKind.auth,
          retryable: false,
          code: 'invalid_id_token',
        );
      }
      return NativeSsoCredential(
        idToken: idToken,
        displayName: account.displayName,
      );
    } on GoogleSignInException catch (e) {
      if (e.code == GoogleSignInExceptionCode.canceled) {
        throw const _SsoCancelled();
      }
      rethrow;
    }
  }

  Future<NativeSsoCredential> _appleCredential() async {
    // Apple wants the SHA-256 of the nonce in the request and gives us the
    // raw one to send to our API for verification (CONTRACTS §4).
    final rawNonce = _randomNonce();
    try {
      final credential = await SignInWithApple.getAppleIDCredential(
        scopes: [
          AppleIDAuthorizationScopes.email,
          AppleIDAuthorizationScopes.fullName,
        ],
        nonce: sha256.convert(utf8.encode(rawNonce)).toString(),
      );
      final idToken = credential.identityToken;
      if (idToken == null) {
        throw const AppError(
          kind: AppErrorKind.auth,
          retryable: false,
          code: 'invalid_id_token',
        );
      }
      // Apple sends the name exactly once, at first authorization — pass it
      // along as the account-creation hint.
      final name = [
        credential.givenName,
        credential.familyName,
      ].whereType<String>().join(' ').trim();
      return NativeSsoCredential(
        idToken: idToken,
        rawNonce: rawNonce,
        displayName: name.isEmpty ? null : name,
      );
    } on SignInWithAppleAuthorizationException catch (e) {
      if (e.code == AuthorizationErrorCode.canceled) {
        throw const _SsoCancelled();
      }
      rethrow;
    }
  }

  static String _randomNonce({int length = 32}) {
    const charset =
        '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._';
    final random = Random.secure();
    return List.generate(
      length,
      (_) => charset[random.nextInt(charset.length)],
    ).join();
  }
}

class _SsoCancelled implements Exception {
  const _SsoCancelled();
}
