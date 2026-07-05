// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'manage.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_ManagedVenue _$ManagedVenueFromJson(Map<String, dynamic> json) =>
    _ManagedVenue(
      id: json['id'] as String,
      name: json['name'] as String,
      slug: json['slug'] as String,
    );

Map<String, dynamic> _$ManagedVenueToJson(_ManagedVenue instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'slug': instance.slug,
    };

_ManagedRoomSummary _$ManagedRoomSummaryFromJson(Map<String, dynamic> json) =>
    _ManagedRoomSummary(
      id: json['id'] as String,
      name: json['name'] as String,
      slug: json['slug'] as String,
      status: json['status'] as String,
      publishRequestedAtUtc: json['publishRequestedAtUtc'] == null
          ? null
          : DateTime.parse(json['publishRequestedAtUtc'] as String),
      capacity: (json['capacity'] as num).toInt(),
      isFree: json['isFree'] as bool,
      pricePerHour: (json['pricePerHour'] as num?)?.toDouble(),
      currency: json['currency'] as String,
      primaryPhotoUrl: json['primaryPhotoUrl'] as String?,
      photoCount: (json['photoCount'] as num).toInt(),
      updatedAtUtc: DateTime.parse(json['updatedAtUtc'] as String),
    );

Map<String, dynamic> _$ManagedRoomSummaryToJson(
  _ManagedRoomSummary instance,
) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'slug': instance.slug,
  'status': instance.status,
  'publishRequestedAtUtc': instance.publishRequestedAtUtc?.toIso8601String(),
  'capacity': instance.capacity,
  'isFree': instance.isFree,
  'pricePerHour': instance.pricePerHour,
  'currency': instance.currency,
  'primaryPhotoUrl': instance.primaryPhotoUrl,
  'photoCount': instance.photoCount,
  'updatedAtUtc': instance.updatedAtUtc.toIso8601String(),
};

_ManagedVenueDetail _$ManagedVenueDetailFromJson(Map<String, dynamic> json) =>
    _ManagedVenueDetail(
      id: json['id'] as String,
      name: json['name'] as String,
      slug: json['slug'] as String,
      description: json['description'] as String,
      venueType: json['venueType'] as String,
      addressLine: json['addressLine'] as String,
      suburb: json['suburb'] as String,
      postcode: json['postcode'] as String,
      contactEmail: json['contactEmail'] as String?,
      parkingInfo: json['parkingInfo'] as String,
      transitInfo: json['transitInfo'] as String,
      latitude: (json['latitude'] as num).toDouble(),
      longitude: (json['longitude'] as num).toDouble(),
      timezone: json['timezone'] as String,
      isIdentityVerified: json['isIdentityVerified'] as bool,
      verificationStatus: json['verificationStatus'] as String? ?? 'unverified',
      verificationRequestedAtUtc: json['verificationRequestedAtUtc'] == null
          ? null
          : DateTime.parse(json['verificationRequestedAtUtc'] as String),
      rooms:
          (json['rooms'] as List<dynamic>?)
              ?.map(
                (e) => ManagedRoomSummary.fromJson(e as Map<String, dynamic>),
              )
              .toList() ??
          const <ManagedRoomSummary>[],
    );

Map<String, dynamic> _$ManagedVenueDetailToJson(_ManagedVenueDetail instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'slug': instance.slug,
      'description': instance.description,
      'venueType': instance.venueType,
      'addressLine': instance.addressLine,
      'suburb': instance.suburb,
      'postcode': instance.postcode,
      'contactEmail': instance.contactEmail,
      'parkingInfo': instance.parkingInfo,
      'transitInfo': instance.transitInfo,
      'latitude': instance.latitude,
      'longitude': instance.longitude,
      'timezone': instance.timezone,
      'isIdentityVerified': instance.isIdentityVerified,
      'verificationStatus': instance.verificationStatus,
      'verificationRequestedAtUtc': instance.verificationRequestedAtUtc
          ?.toIso8601String(),
      'rooms': instance.rooms,
    };

_ManagedRoom _$ManagedRoomFromJson(Map<String, dynamic> json) => _ManagedRoom(
  id: json['id'] as String,
  venueId: json['venueId'] as String,
  venueName: json['venueName'] as String,
  venueSlug: json['venueSlug'] as String,
  name: json['name'] as String,
  slug: json['slug'] as String,
  description: json['description'] as String,
  capacity: (json['capacity'] as num).toInt(),
  pricePerHour: (json['pricePerHour'] as num?)?.toDouble(),
  currency: json['currency'] as String,
  houseRules: json['houseRules'] as String,
  status: json['status'] as String,
  publishRequestedAtUtc: json['publishRequestedAtUtc'] == null
      ? null
      : DateTime.parse(json['publishRequestedAtUtc'] as String),
  firstPublishedAtUtc: json['firstPublishedAtUtc'] == null
      ? null
      : DateTime.parse(json['firstPublishedAtUtc'] as String),
  activities:
      (json['activities'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList() ??
      const <String>[],
  amenities:
      (json['amenities'] as List<dynamic>?)?.map((e) => e as String).toList() ??
      const <String>[],
  accessibility:
      (json['accessibility'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList() ??
      const <String>[],
  photos:
      (json['photos'] as List<dynamic>?)
          ?.map((e) => RoomPhoto.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const <RoomPhoto>[],
  updatedAtUtc: DateTime.parse(json['updatedAtUtc'] as String),
);

Map<String, dynamic> _$ManagedRoomToJson(
  _ManagedRoom instance,
) => <String, dynamic>{
  'id': instance.id,
  'venueId': instance.venueId,
  'venueName': instance.venueName,
  'venueSlug': instance.venueSlug,
  'name': instance.name,
  'slug': instance.slug,
  'description': instance.description,
  'capacity': instance.capacity,
  'pricePerHour': instance.pricePerHour,
  'currency': instance.currency,
  'houseRules': instance.houseRules,
  'status': instance.status,
  'publishRequestedAtUtc': instance.publishRequestedAtUtc?.toIso8601String(),
  'firstPublishedAtUtc': instance.firstPublishedAtUtc?.toIso8601String(),
  'activities': instance.activities,
  'amenities': instance.amenities,
  'accessibility': instance.accessibility,
  'photos': instance.photos,
  'updatedAtUtc': instance.updatedAtUtc.toIso8601String(),
};
