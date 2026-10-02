import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:steeple_mobile/core/api/interceptors.dart';
import 'package:steeple_mobile/core/auth/session_manager.dart';
import 'package:steeple_mobile/core/auth/session_state.dart';
import 'package:steeple_mobile/core/models/models.dart';

final _testUser = UserProfile(
  id: 'user',
  displayName: 'User',
  createdAtUtc: DateTime.utc(2026),
);

class _StatusAdapter implements HttpClientAdapter {
  _StatusAdapter(this.statusCode);

  final int statusCode;
  var requests = 0;

  @override
  void close({bool force = false}) {}

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests++;
    return ResponseBody.fromString(
      '{}',
      statusCode,
      headers: {
        'content-type': ['application/json'],
      },
    );
  }
}

class _ChangingSessionManager implements SessionManager {
  final _state = ValueNotifier<SessionState>(SignedIn(_testUser));
  var _identityGeneration = 1;
  var refreshCalls = 0;

  @override
  ValueListenable<SessionState> get state => _state;

  @override
  int get identityGeneration => _identityGeneration;

  @override
  void addSignOutHandler(Future<void> Function() handler) {}

  @override
  Future<void> forceSignOut() async {}

  @override
  Future<bool> refreshAfter401() async {
    refreshCalls++;
    _identityGeneration++;
    return true;
  }

  @override
  Future<void> restore() async {}

  @override
  Future<SignInResult> signIn(SsoProvider provider) async =>
      const SignInCancelled();

  @override
  Future<void> signOut() async {}

  @override
  Future<String?> validAccessToken() async => 'access-token';
}

class _TokenLookupSession extends _ChangingSessionManager {
  final started = Completer<void>();
  final release = Completer<void>();

  @override
  Future<String?> validAccessToken() async {
    started.complete();
    await release.future;
    return null;
  }
}

class _StableSession extends _ChangingSessionManager {
  @override
  Future<bool> refreshAfter401() async {
    refreshCalls++;
    return true;
  }
}

class _DelayedAdapter extends _StatusAdapter {
  _DelayedAdapter([super.statusCode = 200]);
  final started = Completer<void>();
  final release = Completer<void>();

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    started.complete();
    await release.future;
    return super.fetch(options, requestStream, cancelFuture);
  }
}

void main() {
  for (final (path, status) in [
    ('response', 200),
    ('auth retry', 200),
    ('network retry', 200),
    ('response', 503),
    ('auth retry', 503),
    ('network retry', 503),
  ]) {
    test('discards an old identity response from $path ($status)', () async {
      final session = _StableSession();
      final delayed = _DelayedAdapter(status);
      final retryDio = Dio()..httpClientAdapter = delayed;
      final dio = Dio()
        ..httpClientAdapter = path == 'response'
            ? delayed
            : _StatusAdapter(path == 'auth retry' ? 401 : 503)
        ..interceptors.addAll([
          AuthInterceptor(() => session, retryDio),
          RetryInterceptor(retryDio, () => session),
        ]);
      final pending = expectLater(
        dio.get<void>('/private'),
        throwsA(
          isA<DioException>().having(
            (e) => e.type,
            'type',
            DioExceptionType.cancel,
          ),
        ),
      );
      await delayed.started.future;
      session._identityGeneration++;
      delayed.release.complete();
      await pending;
    });
  }

  test(
    'never sends an old account draft after identity changes during token lookup',
    () async {
      final session = _TokenLookupSession();
      final firstAdapter = _StatusAdapter(401);
      final retryAdapter = _StatusAdapter(200);
      final retryDio = Dio()..httpClientAdapter = retryAdapter;
      final dio = Dio()
        ..interceptors.add(AuthInterceptor(() => session, retryDio))
        ..httpClientAdapter = firstAdapter;
      final pending = expectLater(
        dio.post<void>(
          '/applications',
          data: {'intentText': 'Old account draft'},
        ),
        throwsA(
          isA<DioException>().having(
            (e) => e.type,
            'type',
            DioExceptionType.cancel,
          ),
        ),
      );
      await session.started.future;
      session._identityGeneration++;
      session.release.complete();
      await pending;
      expect(firstAdapter.requests, 0);
      expect(retryAdapter.requests, 0);
      expect(session.refreshCalls, 0);
    },
  );

  test('does not retry a 401 with a token from a newer identity', () async {
    final session = _ChangingSessionManager();
    final retryAdapter = _StatusAdapter(200);
    final retryDio = Dio()..httpClientAdapter = retryAdapter;
    final unauthorizedAdapter = _StatusAdapter(401);
    final dio = Dio()
      ..interceptors.add(AuthInterceptor(() => session, retryDio))
      ..httpClientAdapter = unauthorizedAdapter;

    await expectLater(
      dio.get<void>('/protected'),
      throwsA(isA<DioException>()),
    );

    expect(session.refreshCalls, 1);
    expect(retryAdapter.requests, 0);
  });
}
