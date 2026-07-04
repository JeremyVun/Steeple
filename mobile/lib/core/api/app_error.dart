import 'package:dio/dio.dart';

/// Failure classification for everything the UI renders (MOBILE_CONTRACTS §4).
enum AppErrorKind {
  network,
  timeout,
  server,
  auth,
  validation,
  notFound,
  conflict,
  rateLimited,
  cancelled,
}

/// The ONLY error type repositories throw — dio exceptions never escape
/// `core/api`. `ErrorView` renders these consistently; a few codes get bespoke
/// handling (`slot_taken` → apply-flow screen, `token_reuse` → forced
/// sign-out).
class AppError implements Exception {
  const AppError({
    required this.kind,
    required this.retryable,
    this.code,
    this.detail,
    this.retryAfter,
  });

  final AppErrorKind kind;

  /// ProblemDetails `code` verbatim (e.g. `slot_taken`, `turnstile_failed`).
  final String? code;

  /// ProblemDetails `detail` — for logs/Sentry, NOT for display (§10 voice
  /// rules: user copy comes from ErrorView's kind mapping).
  final String? detail;

  /// From a 429's Retry-After, when present.
  final Duration? retryAfter;

  /// Drives ErrorView's retry button.
  final bool retryable;

  @override
  String toString() =>
      'AppError($kind${code == null ? '' : ', code: $code'}${detail == null ? '' : ', $detail'})';

  /// The exhaustive mapping table of MOBILE_CONTRACTS §4 — anything unlisted
  /// is `server`, retryable. Wildcard keeps new dio enum members from
  /// breaking the build (they map like `unknown`).
  factory AppError.fromDio(DioException e) => switch (e.type) {
        DioExceptionType.connectionError =>
          const AppError(kind: AppErrorKind.network, retryable: true),
        DioExceptionType.connectionTimeout ||
        DioExceptionType.sendTimeout ||
        DioExceptionType.receiveTimeout =>
          const AppError(kind: AppErrorKind.timeout, retryable: true),
        // Swallowed by controllers, never rendered.
        DioExceptionType.cancel =>
          const AppError(kind: AppErrorKind.cancelled, retryable: false),
        DioExceptionType.badResponse => _fromResponse(e.response),
        // Socket-level failures surface as `unknown` with an inner exception.
        _ => const AppError(kind: AppErrorKind.network, retryable: true),
      };

  static AppError _fromResponse(Response<dynamic>? response) {
    final status = response?.statusCode ?? 0;
    final (code, detail) = _problemDetails(response?.data);
    return switch (status) {
      400 || 422 => AppError(
          kind: AppErrorKind.validation, retryable: false, code: code, detail: detail),
      401 || 403 => AppError(kind: AppErrorKind.auth, retryable: false, code: code, detail: detail),
      // Unpublished/out-of-geofence listings land here — "no longer
      // available", not an error state.
      404 => AppError(kind: AppErrorKind.notFound, retryable: false, code: code, detail: detail),
      409 => AppError(kind: AppErrorKind.conflict, retryable: false, code: code, detail: detail),
      429 => AppError(
          kind: AppErrorKind.rateLimited,
          retryable: true,
          code: code,
          detail: detail,
          retryAfter: _retryAfter(response),
        ),
      _ => AppError(kind: AppErrorKind.server, retryable: true, code: code, detail: detail),
    };
  }

  static (String?, String?) _problemDetails(Object? body) {
    if (body is Map<String, dynamic>) {
      return (body['code'] as String?, body['detail'] as String? ?? body['title'] as String?);
    }
    return (null, null);
  }

  static Duration? _retryAfter(Response<dynamic>? response) {
    final raw = response?.headers.value('retry-after');
    final seconds = raw == null ? null : int.tryParse(raw);
    return seconds == null ? null : Duration(seconds: seconds);
  }
}

/// Normalizes anything thrown below the repository layer into [AppError].
AppError toAppError(Object error) => switch (error) {
      final AppError e => e,
      final DioException e => AppError.fromDio(e),
      _ => const AppError(kind: AppErrorKind.server, retryable: true),
    };
