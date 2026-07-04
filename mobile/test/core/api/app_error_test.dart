import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:steeple_mobile/core/api/app_error.dart';

void main() {
  final options = RequestOptions(path: '/api/v1/test');

  DioException response(int status, {Object? body, Map<String, String>? headers}) =>
      DioException(
        requestOptions: options,
        type: DioExceptionType.badResponse,
        response: Response(
          requestOptions: options,
          statusCode: status,
          data: body,
          headers: Headers.fromMap({
            for (final e in (headers ?? const {}).entries) e.key: [e.value],
          }),
        ),
      );

  group('AppError.fromDio maps the MOBILE_CONTRACTS §4 table', () {
    test('connection failure → network, retryable', () {
      final error = AppError.fromDio(
        DioException(requestOptions: options, type: DioExceptionType.connectionError),
      );
      expect(error.kind, AppErrorKind.network);
      expect(error.retryable, isTrue);
    });

    test('timeouts → timeout, retryable', () {
      for (final type in [
        DioExceptionType.connectionTimeout,
        DioExceptionType.sendTimeout,
        DioExceptionType.receiveTimeout,
      ]) {
        expect(
          AppError.fromDio(DioException(requestOptions: options, type: type)).kind,
          AppErrorKind.timeout,
        );
      }
    });

    test('cancel → cancelled (swallowed by controllers)', () {
      final error = AppError.fromDio(
        DioException(requestOptions: options, type: DioExceptionType.cancel),
      );
      expect(error.kind, AppErrorKind.cancelled);
    });

    test('400 ProblemDetails keeps the code verbatim', () {
      final error = AppError.fromDio(
        response(400, body: {'code': 'turnstile_failed', 'detail': 'nope'}),
      );
      expect(error.kind, AppErrorKind.validation);
      expect(error.code, 'turnstile_failed');
      expect(error.retryable, isFalse);
    });

    test('404 → notFound (unpublished/out-of-geofence)', () {
      expect(AppError.fromDio(response(404)).kind, AppErrorKind.notFound);
    });

    test('409 slot_taken → conflict with code', () {
      final error = AppError.fromDio(response(409, body: {'code': 'slot_taken'}));
      expect(error.kind, AppErrorKind.conflict);
      expect(error.code, 'slot_taken');
    });

    test('429 carries Retry-After', () {
      final error = AppError.fromDio(response(429, headers: {'retry-after': '30'}));
      expect(error.kind, AppErrorKind.rateLimited);
      expect(error.retryAfter, const Duration(seconds: 30));
      expect(error.retryable, isTrue);
    });

    test('5xx → server, retryable', () {
      expect(AppError.fromDio(response(503)).kind, AppErrorKind.server);
      expect(AppError.fromDio(response(503)).retryable, isTrue);
    });

    test('anything else → server, retryable (toAppError)', () {
      final error = toAppError(StateError('boom'));
      expect(error.kind, AppErrorKind.server);
      expect(error.retryable, isTrue);
    });
  });
}
