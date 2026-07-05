import '../../../core/api/api_client.dart';
import '../../../core/models/models.dart';

/// Bookings reads/writes (MOBILE_CONTRACTS §8; CONTRACTS §5 — created only by
/// approval, there is deliberately no `POST /bookings`).
abstract class BookingsRepository {
  Future<Paged<Booking>> mine({int page = 1});

  Future<Booking> byId(String id);

  /// `{reason?}` (≤500 chars). 48h notice window: occurrences starting beyond
  /// it are cancelled and freed; nearer ones still stand.
  Future<Booking> cancel(String id, {String? reason});

  /// Either party marks the other on a past, non-cancelled occurrence.
  Future<void> markNoShow(String occurrenceId);

  /// Submits the caller's immutable booking rating.
  Future<void> rate(String bookingId, {required int stars, String? comment});
}

class ApiBookingsRepository implements BookingsRepository {
  const ApiBookingsRepository(this._api);

  final ApiClient _api;

  @override
  Future<Paged<Booking>> mine({int page = 1}) => _api.get(
    '/api/v1/me/bookings',
    query: {'page': page},
    decode: (data) =>
        Paged.fromJson(data as Map<String, dynamic>, Booking.fromJson),
  );

  @override
  Future<Booking> byId(String id) => _api.get(
    '/api/v1/bookings/$id',
    decode: (data) => Booking.fromJson(data as Map<String, dynamic>),
  );

  @override
  Future<Booking> cancel(String id, {String? reason}) => _api.post(
    '/api/v1/bookings/$id/cancel',
    body: {'reason': ?reason},
    decode: (data) => Booking.fromJson(data as Map<String, dynamic>),
  );

  @override
  Future<void> markNoShow(String occurrenceId) =>
      _api.post('/api/v1/occurrences/$occurrenceId/no-show', decode: (_) {});

  @override
  Future<void> rate(String bookingId, {required int stars, String? comment}) =>
      _api.post(
        '/api/v1/bookings/$bookingId/ratings',
        body: {'stars': stars, 'comment': ?comment},
        decode: (_) {},
      );
}
