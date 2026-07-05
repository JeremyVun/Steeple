import '../../../core/api/api_client.dart';
import '../../../core/models/models.dart';

/// Listing detail reads (MOBILE_CONTRACTS §8). 404 covers unknown,
/// unpublished, and out-of-geofence rooms alike — rendered as "no longer
/// available", not an error (MOBILE_CONTRACTS §4).
abstract class ListingRepository {
  Future<RoomDetail> bySlug(String venueSlug, String roomSlug);

  Future<RoomDetail> byId(String id);

  Future<VenueReviewPage> reviews(
    String venueId, {
    int page = 1,
    int pageSize = 10,
  });

  /// `GET /listings/{roomId}/availability?from&to` — the guest calendar feed.
  /// [from]/[to] are venue-local `yyyy-MM-dd` (`from` ≥ today, span ≤ 92 days).
  /// `freeWindows` already has confirmed bookings subtracted.
  Future<RoomAvailability> availability(
    String roomId, {
    required String from,
    required String to,
  });

  /// `POST /listings/{roomId}/availability/check` — an advisory dry-run of a
  /// proposed schedule against the room's rules and confirmed bookings. Same
  /// verdict shape the submit path's `409 schedule_unavailable` returns.
  Future<ScheduleCheckResult> checkSchedule(
    String roomId,
    ProposedSchedule schedule,
  );
}

class ApiListingRepository implements ListingRepository {
  const ApiListingRepository(this._api);

  final ApiClient _api;

  @override
  Future<RoomDetail> bySlug(String venueSlug, String roomSlug) => _api.get(
    '/api/v1/listings/by-slug/$venueSlug/$roomSlug',
    decode: (data) => RoomDetail.fromJson(data as Map<String, dynamic>),
  );

  @override
  Future<RoomDetail> byId(String id) => _api.get(
    '/api/v1/listings/$id',
    decode: (data) => RoomDetail.fromJson(data as Map<String, dynamic>),
  );

  @override
  Future<VenueReviewPage> reviews(
    String venueId, {
    int page = 1,
    int pageSize = 10,
  }) => _api.get(
    '/api/v1/venues/$venueId/ratings',
    query: {'page': page, 'pageSize': pageSize},
    decode: (data) => VenueReviewPage.fromJson(data as Map<String, dynamic>),
  );

  @override
  Future<RoomAvailability> availability(
    String roomId, {
    required String from,
    required String to,
  }) => _api.get(
    '/api/v1/listings/$roomId/availability',
    query: {'from': from, 'to': to},
    decode: (data) => RoomAvailability.fromJson(data as Map<String, dynamic>),
  );

  @override
  Future<ScheduleCheckResult> checkSchedule(
    String roomId,
    ProposedSchedule schedule,
  ) => _api.post(
    '/api/v1/listings/$roomId/availability/check',
    body: {'schedule': schedule.toJson()},
    decode: (data) => ScheduleCheckResult.fromJson(data as Map<String, dynamic>),
  );
}
