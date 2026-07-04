/// `GET /api/v1/listings/search` query (CONTRACTS.md §3) — client-side only,
/// never deserialized from the wire, so it is a plain class (no
/// json_serializable): [toQueryParameters] is the one thing it needs to do.
library;

/// The one filter/search state (`searchFiltersProvider`, MOBILE_CONTRACTS §8).
///
/// Either a center + radius **or** an explicit bounding box drives the
/// search — never both. Repeated `activities`/`accessibility` values combine
/// server-side into an AND match (CONTRACTS §3).
class SearchQuery {
  const SearchQuery({
    this.centerLat,
    this.centerLng,
    this.radiusMeters,
    this.minLat,
    this.maxLat,
    this.minLng,
    this.maxLng,
    this.suburb,
    this.minCapacity,
    this.freeOnly = false,
    this.activities = const <String>[],
    this.accessibility = const <String>[],
    this.page = 1,
    this.pageSize = 24,
  });

  final double? centerLat;
  final double? centerLng;
  final double? radiusMeters;

  final double? minLat;
  final double? maxLat;
  final double? minLng;
  final double? maxLng;

  final String? suburb;
  final int? minCapacity;
  final bool freeOnly;
  final List<String> activities;
  final List<String> accessibility;
  final int page;
  final int pageSize;

  SearchQuery copyWith({
    double? centerLat,
    double? centerLng,
    double? radiusMeters,
    double? minLat,
    double? maxLat,
    double? minLng,
    double? maxLng,
    String? suburb,
    int? minCapacity,
    bool? freeOnly,
    List<String>? activities,
    List<String>? accessibility,
    int? page,
    int? pageSize,
  }) =>
      SearchQuery(
        centerLat: centerLat ?? this.centerLat,
        centerLng: centerLng ?? this.centerLng,
        radiusMeters: radiusMeters ?? this.radiusMeters,
        minLat: minLat ?? this.minLat,
        maxLat: maxLat ?? this.maxLat,
        minLng: minLng ?? this.minLng,
        maxLng: maxLng ?? this.maxLng,
        suburb: suburb ?? this.suburb,
        minCapacity: minCapacity ?? this.minCapacity,
        freeOnly: freeOnly ?? this.freeOnly,
        activities: activities ?? this.activities,
        accessibility: accessibility ?? this.accessibility,
        page: page ?? this.page,
        pageSize: pageSize ?? this.pageSize,
      );

  /// Builds the query-parameter map for `GET /listings/search`. Dio encodes
  /// `List<String>` values as repeated params, so `activities`/`accessibility`
  /// are passed through as lists rather than joined. Nulls and defaults
  /// (`freeOnly: false`, `page: 1`, `pageSize: 24`) are omitted.
  Map<String, dynamic> toQueryParameters() {
    final params = <String, dynamic>{};
    if (centerLat != null) params['centerLat'] = centerLat;
    if (centerLng != null) params['centerLng'] = centerLng;
    if (radiusMeters != null) params['radiusMeters'] = radiusMeters;
    if (minLat != null) params['minLat'] = minLat;
    if (maxLat != null) params['maxLat'] = maxLat;
    if (minLng != null) params['minLng'] = minLng;
    if (maxLng != null) params['maxLng'] = maxLng;
    if (suburb != null) params['suburb'] = suburb;
    if (minCapacity != null) params['minCapacity'] = minCapacity;
    if (freeOnly) params['freeOnly'] = true;
    if (activities.isNotEmpty) params['activities'] = activities;
    if (accessibility.isNotEmpty) params['accessibility'] = accessibility;
    if (page != 1) params['page'] = page;
    if (pageSize != 24) params['pageSize'] = pageSize;
    return params;
  }
}
