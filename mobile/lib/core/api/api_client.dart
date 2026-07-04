import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/env_config.dart';
import '../auth/session_manager.dart';
import 'app_error.dart';
import 'interceptors.dart';

/// Builds the one shared [Dio] with the MOBILE_CONTRACTS §4 interceptor chain:
/// base config → auth → retry → logging (dev only).
Dio buildDio(EnvConfig env, SessionManager Function() sessionManager) {
  final options = BaseOptions(
    baseUrl: env.apiBaseUrl.toString(),
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 20),
    headers: {'Accept': 'application/json'},
  );
  // Bare replayer shared by auth/retry interceptors — no chain, no loops.
  final retryDio = Dio(options);
  final dio = Dio(options);
  dio.interceptors.addAll([
    AuthInterceptor(sessionManager, retryDio),
    RetryInterceptor(retryDio),
    if (kDebugMode) RedactedLogInterceptor(),
  ]);
  return dio;
}

/// The repository-facing HTTP facade. Repositories constructor-inject this
/// and are the ONLY place HTTP happens (MOBILE_CONTRACTS §8); every failure
/// crossing this boundary is an [AppError] — dio types never escape core/api.
class ApiClient {
  const ApiClient(this._dio);

  final Dio _dio;

  Future<T> get<T>(
    String path, {
    Map<String, dynamic>? query,
    CancelToken? cancel,
    required T Function(dynamic data) decode,
  }) =>
      _run(
        () => _dio.get<dynamic>(path, queryParameters: query, cancelToken: cancel),
        decode,
      );

  Future<T> post<T>(
    String path, {
    Object? body,
    Map<String, String>? headers,
    required T Function(dynamic data) decode,
  }) =>
      _run(
        () => _dio.post<dynamic>(
          path,
          data: body,
          options: headers == null ? null : Options(headers: headers),
        ),
        decode,
      );

  Future<T> patch<T>(
    String path, {
    Object? body,
    Map<String, String>? headers,
    required T Function(dynamic data) decode,
  }) =>
      _run(
        () => _dio.patch<dynamic>(
          path,
          data: body,
          options: headers == null ? null : Options(headers: headers),
        ),
        decode,
      );

  Future<void> delete(String path) => _run(() => _dio.delete<dynamic>(path), (_) {});

  Future<T> _run<T>(
    Future<Response<dynamic>> Function() send,
    T Function(dynamic data) decode,
  ) async {
    try {
      final response = await send();
      return decode(response.data);
    } catch (e) {
      throw toAppError(e);
    }
  }
}

/// `core` public surface (MOBILE_CONTRACTS §8). Both are overridden in
/// bootstrap; fakes-mode builds never construct them.
final dioProvider = Provider<Dio>(
  (ref) => buildDio(ref.watch(envProvider), () => ref.read(sessionManagerProvider)),
);

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient(ref.watch(dioProvider)));
