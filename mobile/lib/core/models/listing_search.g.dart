// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'listing_search.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_ListingSearchResult _$ListingSearchResultFromJson(Map<String, dynamic> json) =>
    _ListingSearchResult(
      items:
          (json['items'] as List<dynamic>?)
              ?.map((e) => RoomSummary.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const <RoomSummary>[],
      totalCount: (json['totalCount'] as num).toInt(),
      isZeroResult: json['isZeroResult'] as bool,
      appliedBounds: BoundingBox.fromJson(
        json['appliedBounds'] as Map<String, dynamic>,
      ),
      center: json['center'] == null
          ? null
          : GeoPoint.fromJson(json['center'] as Map<String, dynamic>),
      page: (json['page'] as num).toInt(),
      pageSize: (json['pageSize'] as num).toInt(),
    );

Map<String, dynamic> _$ListingSearchResultToJson(
  _ListingSearchResult instance,
) => <String, dynamic>{
  'items': instance.items,
  'totalCount': instance.totalCount,
  'isZeroResult': instance.isZeroResult,
  'appliedBounds': instance.appliedBounds,
  'center': instance.center,
  'page': instance.page,
  'pageSize': instance.pageSize,
};
