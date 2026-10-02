import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
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
  bool unavailable = false;
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
    if (unavailable) throw StateError('Keychain unavailable');
    if (key == 'steeple.session' && writeGate != null) {
      if (writeStarted?.isCompleted == false) writeStarted!.complete();
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
    if (unavailable) throw StateError('Keychain unavailable');
    values.remove(key);
  }
}

Map<String, String?> _storedSession(String id, String refreshToken) => {
  'steeple.session': jsonEncode(_sessionResponse(id, refreshToken)),
};

String? _storedRefresh(_MemoryStorage storage) =>
    (jsonDecode(storage.values['steeple.session'] ?? 'null')
            as Map<String, dynamic>?)?['refreshToken']
        as String?;

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
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('forced sign-out survives unavailable keychain and restart', () async {
    final storage = _MemoryStorage(_storedSession('a', 'refresh-a'));
    final manager = ApiSessionManager(authDio: Dio(), storage: storage);
    await manager.restore();
    storage.unavailable = true;
    await manager.forceSignOut();
    expect(manager.state.value, isA<SignedOut>());
    storage.unavailable = false;
    final restarted = ApiSessionManager(authDio: Dio(), storage: storage);
    await restarted.restore();
    expect(restarted.state.value, isA<SignedOut>());
    expect(_storedRefresh(storage), isNull);
  });

  test(
    'failed atomic sign-in write cannot mix profile and credentials',
    () async {
      final storage = _MemoryStorage(_storedSession('a', 'refresh-a'));
      final dio = Dio()
        ..interceptors.add(
          InterceptorsWrapper(
            onRequest: (options, handler) {
              handler.resolve(
                Response(
                  requestOptions: options,
                  data: _sessionResponse('b', 'refresh-b'),
                ),
              );
            },
          ),
        );
      final manager = ApiSessionManager(
        authDio: dio,
        storage: storage,
        credentialProvider: (_) async =>
            const NativeSsoCredential(idToken: 'b'),
      );
      await manager.restore();
      storage.unavailable = true;
      expect(await manager.signIn(SsoProvider.google), isA<SignInFailed>());
      storage.unavailable = false;
      final restarted = ApiSessionManager(authDio: Dio(), storage: storage);
      await restarted.restore();
      expect((restarted.state.value as SignedIn).user.id, 'a');
      expect(_storedRefresh(storage), 'refresh-a');
    },
  );

  for (final matches in [true, false]) {
    test(
      'legacy identity migration requires a matching access subject: $matches',
      () async {
        final user = _sessionResponse('a', 'refresh-a')['user'];
        final payload = base64Url.encode(
          utf8.encode(jsonEncode({'sub': matches ? 'a' : 'b'})),
        );
        final storage = _MemoryStorage({
          'steeple.access': 'header.$payload.signature',
          'steeple.refresh': 'refresh-a',
          'steeple.user': jsonEncode(user),
        });
        final manager = ApiSessionManager(authDio: Dio(), storage: storage);
        await manager.restore();
        expect(
          manager.state.value,
          matches ? isA<SignedIn>() : isA<SignedOut>(),
        );
        expect(storage.values.keys, ['steeple.session']);
        expect(_storedRefresh(storage), matches ? 'refresh-a' : null);
      },
    );
  }

  group('ApiSessionManager identity generation', () {
    test('superseded persistence cannot survive replacement failure', () async {
      final writeStarted = Completer<void>();
      final releaseWrite = Completer<void>();
      var credentials = 0;
      final dio = Dio()
        ..interceptors.add(
          InterceptorsWrapper(
            onRequest: (options, handler) {
              if (options.data['idToken'] == 'cancelled') {
                handler.resolve(
                  Response(
                    requestOptions: options,
                    data: _sessionResponse('cancelled', 'refresh-cancelled'),
                  ),
                );
              } else {
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
              }
            },
          ),
        );
      final storage = _MemoryStorage(
        _storedSession('original', 'refresh-original'),
        writeGate: releaseWrite.future,
        writeStarted: writeStarted,
      );
      final manager = ApiSessionManager(
        authDio: dio,
        storage: storage,
        credentialProvider: (_) async => NativeSsoCredential(
          idToken: ++credentials == 1 ? 'cancelled' : 'invalid',
        ),
      );
      await manager.restore();
      final first = manager.signIn(SsoProvider.google);
      await writeStarted.future;
      expect(await manager.signIn(SsoProvider.google), isA<SignInFailed>());
      releaseWrite.complete();
      expect(await first, isA<SignInCancelled>());
      final current = (manager.state.value as SignedIn).user.id;
      final restored = ApiSessionManager(authDio: Dio(), storage: storage);
      await restored.restore();
      expect((restored.state.value as SignedIn).user.id, current);
    });

    test(
      'an old refresh cannot own or clear the new account refresh flight',
      () async {
        final startedA = Completer<void>();
        final startedB = Completer<void>();
        final releaseA = Completer<void>();
        final releaseB = Completer<void>();
        var callsB = 0;
        final dio = Dio()
          ..interceptors.add(
            InterceptorsWrapper(
              onRequest: (options, handler) async {
                if (options.path == '/api/v1/auth/sessions') {
                  handler.resolve(
                    Response(
                      requestOptions: options,
                      data: _sessionResponse('b', 'refresh-b'),
                    ),
                  );
                  return;
                }
                if (options.data['refreshToken'] == 'refresh-a') {
                  startedA.complete();
                  await releaseA.future;
                } else {
                  callsB++;
                  if (!startedB.isCompleted) startedB.complete();
                  await releaseB.future;
                }
                handler.resolve(
                  Response(
                    requestOptions: options,
                    data: {
                      'accessToken': 'new-access',
                      'refreshToken': 'new-refresh',
                    },
                  ),
                );
              },
            ),
          );
        final manager = ApiSessionManager(
          authDio: dio,
          storage: _MemoryStorage(_storedSession('a', 'refresh-a')),
          credentialProvider: (_) async =>
              const NativeSsoCredential(idToken: 'b'),
        );
        await manager.restore();
        final oldRefresh = manager.refreshAfter401();
        await startedA.future;
        final signingIn = manager.signIn(SsoProvider.google);
        final pendingGeneration = manager.identityGeneration;
        expect(await signingIn, isA<SignInSuccess>());
        expect(manager.identityGeneration, greaterThan(pendingGeneration));
        final newRefresh = manager.refreshAfter401();
        await startedB.future.timeout(const Duration(seconds: 2));
        releaseA.complete();
        expect(await oldRefresh, isFalse);
        final joined = manager.refreshAfter401();
        expect(identical(newRefresh, joined), isTrue);
        releaseB.complete();
        expect(await newRefresh, isTrue);
        expect(await joined, isTrue);
        expect(callsB, 1);
      },
    );

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
        expect(storage.values, {'steeple.session': 'null'});
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
        expect(_storedRefresh(storage), 'refresh-b');
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
        expect(_storedRefresh(storage), 'refresh-a');
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
      expect(_storedRefresh(storage), 'refresh-b');
    });
  });
}
