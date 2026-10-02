import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:shared_preferences/shared_preferences.dart';
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

  static const _sessionKey = 'steeple.session';
  static const _signedOutKey = 'steeple.signedOut';
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
  bool _pendingStorageClear = false;

  @override
  ValueListenable<SessionState> get state => _state;

  @override
  int get identityGeneration => _identityGeneration;

  @override
  Future<void> restore() async {
    final generation = _advanceIdentity();
    try {
      await _storageTail;
      if (!_isCurrent(generation)) return;
      final preferences = await SharedPreferences.getInstance();
      if (!_isCurrent(generation)) return;
      if (_pendingStorageClear || preferences.getBool(_signedOutKey) == true) {
        await _wipe(generation, forced: true);
        return;
      }
      final record = await _storage.read(key: _sessionKey);
      if (!_isCurrent(generation)) return;
      Map<String, dynamic>? stored;
      if (record != null) {
        stored = jsonDecode(record) as Map<String, dynamic>?;
      } else {
        final legacy = await Future.wait([
          _storage.read(key: _accessKey),
          _storage.read(key: _refreshKey),
          _storage.read(key: _userKey),
        ]);
        if (!_isCurrent(generation)) return;
        if (legacy.every((value) => value != null)) {
          final user = jsonDecode(legacy[2]!) as Map<String, dynamic>;
          final payload =
              jsonDecode(
                    utf8.decode(
                      base64Url.decode(
                        base64Url.normalize(legacy[0]!.split('.')[1]),
                      ),
                    ),
                  )
                  as Map<String, dynamic>;
          if (payload['sub'] == user['id']) {
            stored = {
              'accessToken': legacy[0],
              'refreshToken': legacy[1],
              'user': user,
            };
          }
        }
        final migrated = stored;
        await _mutateStorage(
          generation,
          () => _writeRecord(migrated),
          publish: () {},
        );
      }
      if (!_isCurrent(generation)) return;
      if (stored?['refreshToken'] is String &&
          stored?['user'] is Map<String, dynamic>) {
        final user = UserProfile.fromJson(
          stored!['user'] as Map<String, dynamic>,
        );
        _accessToken = stored['accessToken'] as String?;
        _refreshToken = stored['refreshToken'] as String;
        _advanceIdentity();
        _state.value = SignedIn(user);
      } else {
        await _wipe(generation);
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
      final published = await _persistSession(session, generation);
      if (published != _identityGeneration) return const SignInCancelled();
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
  }

  @override
  Future<void> forceSignOut() async {
    final generation = _advanceIdentity();
    await _wipe(generation, forced: true);
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
    if (_inflightRefresh case final inflight?) return inflight;
    late final Future<bool> pending;
    pending = _refresh(generation).whenComplete(() {
      if (identical(_inflightRefresh, pending)) _inflightRefresh = null;
    });
    return _inflightRefresh = pending;
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

  int _advanceIdentity() {
    _inflightRefresh = null;
    return ++_identityGeneration;
  }

  bool _isCurrent(int generation) => generation == _identityGeneration;

  bool _isCurrentSignIn(int generation) =>
      _isCurrent(generation) && _signInGeneration == generation;

  bool _isCurrentRefresh(int generation, String? refreshToken) =>
      _isCurrent(generation) &&
      _signInGeneration != generation &&
      (refreshToken == null || _refreshToken == refreshToken);

  Future<int?> _persistSession(AuthSession session, int generation) async {
    int? published;
    await _mutateStorage(
      generation,
      () async {
        await _writeRecord({
          'accessToken': session.accessToken,
          'refreshToken': session.refreshToken,
          'user': session.user.toJson(),
        });
        final preferences = await SharedPreferences.getInstance();
        if (!await preferences.setBool(_signedOutKey, false)) {
          throw StateError('Could not save sign-in state.');
        }
      },
      publish: () {
        _accessToken = session.accessToken;
        _refreshToken = session.refreshToken;
        _pendingStorageClear = false;
        published = _advanceIdentity();
        _state.value = SignedIn(session.user);
      },
    );
    return published;
  }

  Future<void> _persistRefresh({
    required String accessToken,
    required String refreshToken,
    required int generation,
  }) => _mutateStorage(
    generation,
    () => _writeRecord({
      'accessToken': accessToken,
      'refreshToken': refreshToken,
      'user': (_state.value as SignedIn).user.toJson(),
    }),
    publish: () {
      _accessToken = accessToken;
      _refreshToken = refreshToken;
    },
  );

  Future<void> _forceSignOutCurrent(int generation, String refreshToken) async {
    if (!_isCurrentRefresh(generation, refreshToken)) {
      return;
    }
    final forcedGeneration = _advanceIdentity();
    await _wipe(forcedGeneration, forced: true);
  }

  Future<void> _wipe(int generation, {bool forced = false}) async {
    if (!_isCurrent(generation)) return;
    _accessToken = null;
    _refreshToken = null;
    final cleared = _advanceIdentity();
    _pendingStorageClear = true;
    _state.value = SignedOut(wasForced: forced);
    try {
      await _mutateStorage(
        cleared,
        () async {
          final preferences = await SharedPreferences.getInstance();
          await preferences.setBool(_signedOutKey, true);
          await _writeRecord(null);
        },
        publish: () {
          _pendingStorageClear = false;
        },
      );
    } catch (_) {
      // Local sign-out cannot depend on the OS keychain being writable.
    }
  }

  Future<void> _mutateStorage(
    int generation,
    Future<void> Function() mutation, {
    required void Function() publish,
  }) {
    final operation = _storageTail.then((_) async {
      if (!_isCurrent(generation)) return;
      try {
        await mutation();
      } catch (_) {
        await _restoreStoredIdentity();
        rethrow;
      }
      if (_isCurrent(generation)) {
        publish();
      } else {
        await _restoreStoredIdentity();
      }
    });
    _storageTail = operation.catchError((_) {});
    return operation;
  }

  Future<void> _restoreStoredIdentity() {
    final current = _state.value;
    return _writeRecord(
      current is SignedIn
          ? {
              'accessToken': _accessToken,
              'refreshToken': _refreshToken,
              'user': current.user.toJson(),
            }
          : null,
    );
  }

  Future<void> _writeRecord(Map<String, dynamic>? record) async {
    await _storage.write(key: _sessionKey, value: jsonEncode(record));
    for (final key in [_accessKey, _refreshKey, _userKey]) {
      try {
        await _storage.delete(key: key);
      } catch (_) {}
    }
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
