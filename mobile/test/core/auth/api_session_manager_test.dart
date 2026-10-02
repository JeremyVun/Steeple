import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:steeple_mobile/core/auth/api_session_manager.dart';
import 'package:steeple_mobile/core/auth/session_state.dart';

class _MemoryStorage extends FlutterSecureStorage {
  _MemoryStorage(
    this.values, {
    this.readGate,
    this.writeGate,
    this.writeStarted,
  });

  final Map<String, String?> values;
  final Future<void>? readGate;
  final Future<void>? writeGate;
  final Completer<void>? writeStarted;

  @override
  Future<String?> read({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    await readGate;
    return values[key];
  }

  @override
  Future<void> write({
    required String key,
    required String? value,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    if (key == 'steeple.access' && writeGate != null) {
      writeStarted?.complete();
      await writeGate;
    }
    if (value == null) {
      values.remove(key);
    } else {
      values[key] = value;
    }
  }

  @override
  Future<void> delete({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    values.remove(key);
  }
}

Map<String, String?> _storedSession(String id, String refreshToken) => {
  'steeple.access': 'access-$id',
  'steeple.refresh': refreshToken,
  'steeple.user': jsonEncode({
    'id': id,
    'displayName': 'Person $id',
    'email': '$id@example.test',
    'createdAtUtc': '2026-01-01T00:00:00Z',
  }),
};

Map<String, dynamic> _sessionResponse(String id, String refreshToken) => {
  'accessToken': 'access-$id',
  'refreshToken': refreshToken,
  'user': {
    'id': id,
    'displayName': 'Person $id',
    'email': '$id@example.test',
    'createdAtUtc': '2026-01-01T00:00:00Z',
  },
  'isNewUser': false,
};

void main() {
  group('ApiSessionManager identity generation', () {
    test(
      'a delayed refresh success cannot restore tokens after force sign-out',
      () async {
        final refreshStarted = Completer<void>();
        final refreshResponse = Completer<Map<String, dynamic>>();
        final writeStarted = Completer<void>();
        final releaseWrite = Completer<void>();
        final dio = Dio()
          ..interceptors.add(
            InterceptorsWrapper(
              onRequest: (options, handler) async {
                if (options.path == '/api/v1/auth/refresh') {
                  refreshStarted.complete();
                  handler.resolve(
                    Response<Map<String, dynamic>>(
                      requestOptions: options,
                      data: await refreshResponse.future,
                    ),
                  );
                  return;
                }
                handler.resolve(Response<void>(requestOptions: options));
              },
            ),
          );
        final storage = _MemoryStorage(
          _storedSession('a', 'refresh-a'),
          writeGate: releaseWrite.future,
          writeStarted: writeStarted,
        );
        final manager = ApiSessionManager(authDio: dio, storage: storage);
        await manager.restore();

        final pendingRefresh = manager.refreshAfter401();
        await refreshStarted.future;
        refreshResponse.complete({
          'accessToken': 'refreshed-access-a',
          'refreshToken': 'refreshed-refresh-a',
        });
        await writeStarted.future;
        final forcedSignOut = manager.forceSignOut();
        releaseWrite.complete();
        await forcedSignOut;

        expect(await pendingRefresh, isFalse);
        expect(manager.state.value, isA<SignedOut>());
        expect(storage.values, isEmpty);
      },
    );

    test(
      'a delayed refresh rejection cannot sign out a newer sign-in',
      () async {
        final refreshStarted = Completer<void>();
        final refreshFailure = Completer<void>();
        final dio = Dio()
          ..interceptors.add(
            InterceptorsWrapper(
              onRequest: (options, handler) async {
                if (options.path == '/api/v1/auth/refresh') {
                  refreshStarted.complete();
                  await refreshFailure.future;
                  handler.reject(
                    DioException(
                      requestOptions: options,
                      type: DioExceptionType.badResponse,
                      response: Response<void>(
                        requestOptions: options,
                        statusCode: 401,
                      ),
                    ),
                  );
                  return;
                }
                if (options.path == '/api/v1/auth/sessions') {
                  handler.resolve(
                    Response<Map<String, dynamic>>(
                      requestOptions: options,
                      data: _sessionResponse('b', 'refresh-b'),
                    ),
                  );
                  return;
                }
                handler.resolve(Response<void>(requestOptions: options));
              },
            ),
          );
        final storage = _MemoryStorage(_storedSession('a', 'refresh-a'));
        final manager = ApiSessionManager(
          authDio: dio,
          storage: storage,
          credentialProvider: (_) async =>
              const NativeSsoCredential(idToken: 'id-token-b'),
        );
        await manager.restore();

        final pendingRefresh = manager.refreshAfter401();
        await refreshStarted.future;
        final signIn = await manager.signIn(SsoProvider.google);
        refreshFailure.complete();

        expect(signIn, isA<SignInSuccess>());
        expect(await pendingRefresh, isFalse);
        expect((manager.state.value as SignedIn).user.id, 'b');
        expect(storage.values['steeple.refresh'], 'refresh-b');
      },
    );

    test(
      'a transient refresh failure preserves the recoverable session',
      () async {
        final dio = Dio()
          ..interceptors.add(
            InterceptorsWrapper(
              onRequest: (options, handler) {
                handler.reject(
                  DioException(
                    requestOptions: options,
                    type: DioExceptionType.badResponse,
                    response: Response<void>(
                      requestOptions: options,
                      statusCode: 503,
                    ),
                  ),
                );
              },
            ),
          );
        final storage = _MemoryStorage(_storedSession('a', 'refresh-a'));
        final manager = ApiSessionManager(authDio: dio, storage: storage);
        await manager.restore();

        expect(await manager.refreshAfter401(), isFalse);
        expect((manager.state.value as SignedIn).user.id, 'a');
        expect(storage.values['steeple.refresh'], 'refresh-a');
      },
    );

    test('a delayed restore cannot replace a completed sign-out', () async {
      final readGate = Completer<void>();
      final storage = _MemoryStorage(
        _storedSession('a', 'refresh-a'),
        readGate: readGate.future,
      );
      final manager = ApiSessionManager(authDio: Dio(), storage: storage);

      final restoring = manager.restore();
      await manager.forceSignOut();
      readGate.complete();
      await restoring;

      expect(manager.state.value, isA<SignedOut>());
      expect((manager.state.value as SignedOut).wasForced, isTrue);
    });

    test('a delayed sign-out completion cannot wipe a newer sign-in', () async {
      final signOutStarted = Completer<void>();
      final completeSignOut = Completer<void>();
      final dio = Dio()
        ..interceptors.add(
          InterceptorsWrapper(
            onRequest: (options, handler) async {
              if (options.path == '/api/v1/auth/sessions' &&
                  options.method == 'DELETE') {
                signOutStarted.complete();
                await completeSignOut.future;
                handler.resolve(Response<void>(requestOptions: options));
                return;
              }
              if (options.path == '/api/v1/auth/sessions') {
                handler.resolve(
                  Response<Map<String, dynamic>>(
                    requestOptions: options,
                    data: _sessionResponse('b', 'refresh-b'),
                  ),
                );
                return;
              }
              handler.resolve(Response<void>(requestOptions: options));
            },
          ),
        );
      final storage = _MemoryStorage(_storedSession('a', 'refresh-a'));
      final manager = ApiSessionManager(
        authDio: dio,
        storage: storage,
        credentialProvider: (_) async =>
            const NativeSsoCredential(idToken: 'id-token-b'),
      );
      await manager.restore();

      final signOut = manager.signOut();
      await signOutStarted.future;
      expect(await manager.signIn(SsoProvider.google), isA<SignInSuccess>());
      completeSignOut.complete();
      await signOut;

      expect((manager.state.value as SignedIn).user.id, 'b');
      expect(storage.values['steeple.refresh'], 'refresh-b');
    });
  });
}
