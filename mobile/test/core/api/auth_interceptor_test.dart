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

void main() {
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
