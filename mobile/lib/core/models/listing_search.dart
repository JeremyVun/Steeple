// `GET /api/v1/listings/search` response (CONTRACTS.md §3). Mirrors
// ListingSearchResult in Steeple.Api/Contracts.
//
// Discrepancy vs C# (flagged 2026-07-04): `ListingSearchResult.Center` is
// non-nullable in the built DTO (always the search center or the geofence
// default — confirmed at the sole construction site,
// `ListingService.SearchAsync`), but CONTRACTS.md documents it as nullable
// (`"center": {...} | null`). Modeled as nullable here anyway — client-side
// nullability is free/defensive and matches the documented contract; nothing
// breaks if the field is always present in practice.
import 'package:freezed_annotation/freezed_annotation.dart';

import 'geo.dart';
import 'room.dart';

part 'listing_search.freezed.dart';
part 'listing_search.g.dart';

/// The outcome of a listing search: the page of results plus the geographic
/// context applied.
@freezed
abstract class ListingSearchResult with _$ListingSearchResult {
  const factory ListingSearchResult({
    @Default(<RoomSummary>[]) List<RoomSummary> items,
    required int totalCount,

    /// The liquidity metric — a zero-result search is a signal, not an error.
    required bool isZeroResult,
    required BoundingBox appliedBounds,
    GeoPoint? center,
    required int page,
    required int pageSize,
  }) = _ListingSearchResult;

  factory ListingSearchResult.fromJson(Map<String, dynamic> json) =>
      _$ListingSearchResultFromJson(json);
}
