// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'room.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_RatingSummary _$RatingSummaryFromJson(Map<String, dynamic> json) =>
    _RatingSummary(
      averageStars: (json['averageStars'] as num).toDouble(),
      count: (json['count'] as num).toInt(),
    );

Map<String, dynamic> _$RatingSummaryToJson(_RatingSummary instance) =>
    <String, dynamic>{
      'averageStars': instance.averageStars,
      'count': instance.count,
    };

_VenueReview _$VenueReviewFromJson(Map<String, dynamic> json) => _VenueReview(
  stars: (json['stars'] as num).toInt(),
  comment: json['comment'] as String?,
  raterName: json['raterName'] as String,
  createdAtUtc: DateTime.parse(json['createdAtUtc'] as String),
);

Map<String, dynamic> _$VenueReviewToJson(_VenueReview instance) =>
    <String, dynamic>{
      'stars': instance.stars,
      'comment': instance.comment,
      'raterName': instance.raterName,
      'createdAtUtc': instance.createdAtUtc.toIso8601String(),
    };

_VenueReviewPage _$VenueReviewPageFromJson(Map<String, dynamic> json) =>
    _VenueReviewPage(
      items:
          (json['items'] as List<dynamic>?)
              ?.map((e) => VenueReview.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const <VenueReview>[],
      totalCount: (json['totalCount'] as num).toInt(),
      page: (json['page'] as num).toInt(),
      pageSize: (json['pageSize'] as num).toInt(),
    );

Map<String, dynamic> _$VenueReviewPageToJson(_VenueReviewPage instance) =>
    <String, dynamic>{
      'items': instance.items,
      'totalCount': instance.totalCount,
      'page': instance.page,
      'pageSize': instance.pageSize,
    };

_RoomSummary _$RoomSummaryFromJson(Map<String, dynamic> json) => _RoomSummary(
  roomId: json['roomId'] as String,
  venueId: json['venueId'] as String,
  roomSlug: json['roomSlug'] as String,
  venueSlug: json['venueSlug'] as String,
  venueName: json['venueName'] as String,
  suburb: json['suburb'] as String,
  roomName: json['roomName'] as String,
  primaryPhotoUrl: json['primaryPhotoUrl'] as String?,
  capacity: (json['capacity'] as num).toInt(),
  isFree: json['isFree'] as bool,
  pricePerHour: (json['pricePerHour'] as num?)?.toDouble(),
  currency: json['currency'] as String,
  latitude: (json['latitude'] as num).toDouble(),
  longitude: (json['longitude'] as num).toDouble(),
  activities:
      (json['activities'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList() ??
      const <String>[],
  accessibility:
      (json['accessibility'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList() ??
      const <String>[],
  distanceMeters: (json['distanceMeters'] as num?)?.toDouble(),
  rating: json['rating'] == null
      ? null
      : RatingSummary.fromJson(json['rating'] as Map<String, dynamic>),
);

Map<String, dynamic> _$RoomSummaryToJson(_RoomSummary instance) =>
    <String, dynamic>{
      'roomId': instance.roomId,
      'venueId': instance.venueId,
      'roomSlug': instance.roomSlug,
      'venueSlug': instance.venueSlug,
      'venueName': instance.venueName,
      'suburb': instance.suburb,
      'roomName': instance.roomName,
      'primaryPhotoUrl': instance.primaryPhotoUrl,
      'capacity': instance.capacity,
      'isFree': instance.isFree,
      'pricePerHour': instance.pricePerHour,
      'currency': instance.currency,
      'latitude': instance.latitude,
      'longitude': instance.longitude,
      'activities': instance.activities,
      'accessibility': instance.accessibility,
      'distanceMeters': instance.distanceMeters,
      'rating': instance.rating,
    };

_RoomPhoto _$RoomPhotoFromJson(Map<String, dynamic> json) => _RoomPhoto(
  id: json['id'] as String?,
  url: json['url'] as String,
  thumbUrl: json['thumbUrl'] as String?,
  cardUrl: json['cardUrl'] as String?,
  caption: json['caption'] as String?,
  isPrimary: json['isPrimary'] as bool,
  sortOrder: (json['sortOrder'] as num).toInt(),
);

Map<String, dynamic> _$RoomPhotoToJson(_RoomPhoto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'url': instance.url,
      'thumbUrl': instance.thumbUrl,
      'cardUrl': instance.cardUrl,
      'caption': instance.caption,
      'isPrimary': instance.isPrimary,
      'sortOrder': instance.sortOrder,
    };

_VenueSummary _$VenueSummaryFromJson(Map<String, dynamic> json) =>
    _VenueSummary(
      venueId: json['venueId'] as String,
      name: json['name'] as String,
      slug: json['slug'] as String,
      venueType: json['venueType'] as String,
      addressLine: json['addressLine'] as String,
      suburb: json['suburb'] as String,
      postcode: json['postcode'] as String,
      contactEmail: json['contactEmail'] as String?,
      parkingInfo: json['parkingInfo'] as String,
      transitInfo: json['transitInfo'] as String,
      isIdentityVerified: json['isIdentityVerified'] as bool,
      latitude: (json['latitude'] as num).toDouble(),
      longitude: (json['longitude'] as num).toDouble(),
    );

Map<String, dynamic> _$VenueSummaryToJson(_VenueSummary instance) =>
    <String, dynamic>{
      'venueId': instance.venueId,
      'name': instance.name,
      'slug': instance.slug,
      'venueType': instance.venueType,
      'addressLine': instance.addressLine,
      'suburb': instance.suburb,
      'postcode': instance.postcode,
      'contactEmail': instance.contactEmail,
      'parkingInfo': instance.parkingInfo,
      'transitInfo': instance.transitInfo,
      'isIdentityVerified': instance.isIdentityVerified,
      'latitude': instance.latitude,
      'longitude': instance.longitude,
    };

_RoomDetail _$RoomDetailFromJson(Map<String, dynamic> json) => _RoomDetail(
  roomId: json['roomId'] as String,
  roomSlug: json['roomSlug'] as String,
  roomName: json['roomName'] as String,
  description: json['description'] as String,
  capacity: (json['capacity'] as num).toInt(),
  isFree: json['isFree'] as bool,
  pricePerHour: (json['pricePerHour'] as num?)?.toDouble(),
  currency: json['currency'] as String,
  houseRules: json['houseRules'] as String,
  amenities:
      (json['amenities'] as List<dynamic>?)?.map((e) => e as String).toList() ??
      const <String>[],
  accessibility:
      (json['accessibility'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList() ??
      const <String>[],
  activities:
      (json['activities'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList() ??
      const <String>[],
  photos:
      (json['photos'] as List<dynamic>?)
          ?.map((e) => RoomPhoto.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const <RoomPhoto>[],
  venue: VenueSummary.fromJson(json['venue'] as Map<String, dynamic>),
  rating: json['rating'] == null
      ? null
      : RatingSummary.fromJson(json['rating'] as Map<String, dynamic>),
);

Map<String, dynamic> _$RoomDetailToJson(_RoomDetail instance) =>
    <String, dynamic>{
      'roomId': instance.roomId,
      'roomSlug': instance.roomSlug,
      'roomName': instance.roomName,
      'description': instance.description,
      'capacity': instance.capacity,
      'isFree': instance.isFree,
      'pricePerHour': instance.pricePerHour,
      'currency': instance.currency,
      'houseRules': instance.houseRules,
      'amenities': instance.amenities,
      'accessibility': instance.accessibility,
      'activities': instance.activities,
      'photos': instance.photos,
      'venue': instance.venue,
      'rating': instance.rating,
    };
