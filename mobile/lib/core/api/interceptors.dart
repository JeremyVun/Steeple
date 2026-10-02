import 'dart:async';
import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../auth/session_manager.dart';

/// Interceptor 2 of the MOBILE_CONTRACTS §4 chain: attaches the access token,
/// and on a 401 runs the single-flight refresh and retries the request once.
/// A failed refresh has already forced sign-out inside the SessionManager —
/// the 401 then propagates and maps to `AppErrorKind.auth`.
class AuthInterceptor extends Interceptor {
  AuthInterceptor(this._sessionManager, this._retryDio);

  final SessionManager Function() _sessionManager;

  /// A bare dio (no interceptors) used only to replay the one retried
  /// request — replaying through the full chain would loop.
  final Dio _retryDio;

  static const _retriedKey = 'steeple.authRetried';
  static const _identityGenerationKey = 'steeple.identityGeneration';

  bool _isCurrent(RequestOptions options) =>
      options.extra[_identityGenerationKey] ==
      _sessionManager().identityGeneration;

  static DioException _changed(RequestOptions options) => DioException(
    requestOptions: options,
    type: DioExceptionType.cancel,
    message: 'The account changed while this request was in progress.',
  );

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final sessionManager = _sessionManager();
    final requestGeneration = sessionManager.identityGeneration;
    final token = await sessionManager.validAccessToken();
    if (requestGeneration != sessionManager.identityGeneration) {
      return handler.reject(
        DioException(
          requestOptions: options,
          type: DioExceptionType.cancel,
          message: 'The account changed before this request was sent.',
        ),
      );
    }
    options.extra[_identityGenerationKey] = requestGeneration;
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  void onResponse(
    Response<dynamic> response,
    ResponseInterceptorHandler handler,
  ) {
    if (!_isCurrent(response.requestOptions)) {
      return handler.reject(_changed(response.requestOptions));
    }
    handler.next(response);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    final options = err.requestOptions;
    if (!_isCurrent(options)) return handler.next(_changed(options));
    if (err.response?.statusCode != 401 || options.extra[_retriedKey] == true) {
      return handler.next(err);
    }
    final sessionManager = _sessionManager();
    final requestGeneration = options.extra[_identityGenerationKey];
    if (requestGeneration != sessionManager.identityGeneration) {
      return handler.next(err);
    }

    final refreshed = await sessionManager.refreshAfter401();
    if (!refreshed) return handler.next(err);

    final token = await sessionManager.validAccessToken();
    if (token == null ||
        requestGeneration != sessionManager.identityGeneration) {
      return handler.next(err);
    }
    try {
      options.extra[_retriedKey] = true;
      options.headers['Authorization'] = 'Bearer $token';
      final response = await _retryDio.fetch<dynamic>(options);
      if (!_isCurrent(options)) return handler.next(_changed(options));
      return handler.resolve(response);
    } on DioException catch (retryErr) {
      if (!_isCurrent(options)) return handler.next(_changed(options));
      return handler.next(retryErr);
    }
  }
}

/// Interceptor 3: idempotent GETs only, max 2 retries, exponential backoff
/// with jitter — never on POST (a replayed apply is worse than a clear error).
class RetryInterceptor extends Interceptor {
  RetryInterceptor(this._retryDio, this._sessionManager, {this.maxRetries = 2});

  final Dio _retryDio;
  final SessionManager Function() _sessionManager;
  final int maxRetries;
  final _random = Random();

  static const _attemptKey = 'steeple.retryAttempt';

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    final options = err.requestOptions;
    final attempt = (options.extra[_attemptKey] as int?) ?? 0;
    if (!_shouldRetry(err) || attempt >= maxRetries) {
      return handler.next(err);
    }
    final backoff = Duration(
      milliseconds: (300 * pow(2, attempt)).round() + _random.nextInt(200),
    );
    await Future<void>.delayed(backoff);
    if (options.extra[AuthInterceptor._identityGenerationKey] !=
        _sessionManager().identityGeneration) {
      return handler.next(AuthInterceptor._changed(options));
    }
    try {
      options.extra[_attemptKey] = attempt + 1;
      final response = await _retryDio.fetch<dynamic>(options);
      if (options.extra[AuthInterceptor._identityGenerationKey] !=
          _sessionManager().identityGeneration) {
        return handler.next(AuthInterceptor._changed(options));
      }
      return handler.resolve(response);
    } on DioException catch (retryErr) {
      if (options.extra[AuthInterceptor._identityGenerationKey] !=
          _sessionManager().identityGeneration) {
        return handler.next(AuthInterceptor._changed(options));
      }
      return handler.next(retryErr);
    }
  }

  bool _shouldRetry(DioException err) {
    if (err.requestOptions.method.toUpperCase() != 'GET') return false;
    return switch (err.type) {
      DioExceptionType.connectionError ||
      DioExceptionType.connectionTimeout ||
      DioExceptionType.receiveTimeout ||
      DioExceptionType.sendTimeout => true,
      DioExceptionType.badResponse => (err.response?.statusCode ?? 0) >= 500,
      _ => false,
    };
  }
}

/// Interceptor 4: dev-build logging, bodies redacted (tokens/PII never hit
/// the console).
class RedactedLogInterceptor extends Interceptor {
  @override
  void onResponse(
    Response<dynamic> response,
    ResponseInterceptorHandler handler,
  ) {
    debugPrint(
      '[api] ${response.requestOptions.method} ${response.requestOptions.uri.path} '
      '→ ${response.statusCode}',
    );
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    debugPrint(
      '[api] ${err.requestOptions.method} ${err.requestOptions.uri.path} '
      '→ ${err.response?.statusCode ?? err.type.name}',
    );
    handler.next(err);
  }
}
