import '../../../core/api/api_client.dart';
import '../../../core/models/models.dart';

/// Listing detail reads (MOBILE_CONTRACTS §8). 404 covers unknown,
/// unpublished, and out-of-geofence rooms alike — rendered as "no longer
/// available", not an error (MOBILE_CONTRACTS §4).
abstract class ListingRepository {
  Future<RoomDetail> bySlug(String venueSlug, String roomSlug);

  Future<RoomDetail> byId(String id);
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
}
