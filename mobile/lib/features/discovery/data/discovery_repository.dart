import 'package:dio/dio.dart';

import '../../../core/api/api_client.dart';
import '../../../core/models/models.dart';

/// Discovery reads (MOBILE_CONTRACTS §8). Repositories are the only place
/// HTTP happens; every failure is an `AppError`.
abstract class DiscoveryRepository {
  Future<ListingSearchResult> search(SearchQuery query, {CancelToken? cancel});

  Future<List<String>> suburbs();

  Future<GeofenceContext> geofence();
}

class ApiDiscoveryRepository implements DiscoveryRepository {
  const ApiDiscoveryRepository(this._api);

  final ApiClient _api;

  @override
  Future<ListingSearchResult> search(SearchQuery query, {CancelToken? cancel}) =>
      _api.get(
        '/api/v1/listings/search',
        query: query.toQueryParameters(),
        cancel: cancel,
        decode: (data) => ListingSearchResult.fromJson(data as Map<String, dynamic>),
      );

  @override
  Future<List<String>> suburbs() => _api.get(
        '/api/v1/suburbs',
        decode: (data) => (data as List<dynamic>).cast<String>(),
      );

  @override
  Future<GeofenceContext> geofence() => _api.get(
        '/api/v1/geofence',
        decode: (data) => GeofenceContext.fromJson(data as Map<String, dynamic>),
      );
}
