// Geographic wire shapes (CONTRACTS.md §3, §9). Mirrors GeoPointDto,
// BoundingBoxDto, GeofenceContextDto in Steeple.Api/Contracts exactly.
import 'package:freezed_annotation/freezed_annotation.dart';

part 'geo.freezed.dart';
part 'geo.g.dart';

/// A WGS84 coordinate in decimal degrees.
@freezed
abstract class GeoPoint with _$GeoPoint {
  const factory GeoPoint({
    required double latitude,
    required double longitude,
  }) = _GeoPoint;

  factory GeoPoint.fromJson(Map<String, dynamic> json) =>
      _$GeoPointFromJson(json);
}

/// An axis-aligned geographic rectangle, inclusive on all four edges.
@freezed
abstract class BoundingBox with _$BoundingBox {
  const factory BoundingBox({
    required double minLat,
    required double maxLat,
    required double minLng,
    required double maxLng,
  }) = _BoundingBox;

  factory BoundingBox.fromJson(Map<String, dynamic> json) =>
      _$BoundingBoxFromJson(json);
}

/// `GET /api/v1/geofence` — the served-area context the map/UI needs
/// (CONTRACTS §3).
@freezed
abstract class GeofenceContext with _$GeofenceContext {
  const factory GeofenceContext({
    required String areaName,
    required GeoPoint center,
    required BoundingBox beachhead,
  }) = _GeofenceContext;

  factory GeofenceContext.fromJson(Map<String, dynamic> json) =>
      _$GeofenceContextFromJson(json);
}
