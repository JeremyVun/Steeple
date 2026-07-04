// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'geo.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_GeoPoint _$GeoPointFromJson(Map<String, dynamic> json) => _GeoPoint(
  latitude: (json['latitude'] as num).toDouble(),
  longitude: (json['longitude'] as num).toDouble(),
);

Map<String, dynamic> _$GeoPointToJson(_GeoPoint instance) => <String, dynamic>{
  'latitude': instance.latitude,
  'longitude': instance.longitude,
};

_BoundingBox _$BoundingBoxFromJson(Map<String, dynamic> json) => _BoundingBox(
  minLat: (json['minLat'] as num).toDouble(),
  maxLat: (json['maxLat'] as num).toDouble(),
  minLng: (json['minLng'] as num).toDouble(),
  maxLng: (json['maxLng'] as num).toDouble(),
);

Map<String, dynamic> _$BoundingBoxToJson(_BoundingBox instance) =>
    <String, dynamic>{
      'minLat': instance.minLat,
      'maxLat': instance.maxLat,
      'minLng': instance.minLng,
      'maxLng': instance.maxLng,
    };

_GeofenceContext _$GeofenceContextFromJson(Map<String, dynamic> json) =>
    _GeofenceContext(
      areaName: json['areaName'] as String,
      center: GeoPoint.fromJson(json['center'] as Map<String, dynamic>),
      beachhead: BoundingBox.fromJson(
        json['beachhead'] as Map<String, dynamic>,
      ),
    );

Map<String, dynamic> _$GeofenceContextToJson(_GeofenceContext instance) =>
    <String, dynamic>{
      'areaName': instance.areaName,
      'center': instance.center,
      'beachhead': instance.beachhead,
    };
