// Discovery/listing wire shapes (CONTRACTS.md §3). Mirrors RoomSummaryDto,
// RoomPhotoDto, VenueSummaryDto, RoomDetailDto in Steeple.Api/Contracts
// exactly. (`venueId`/`suburb` were missing from the built RoomSummaryDto —
// fixed API-side in this same change per CONTRACTS §1 rule 3.)
import 'package:freezed_annotation/freezed_annotation.dart';

import 'wire_enums.dart';
import 'wire_tokens.dart';

part 'room.freezed.dart';
part 'room.g.dart';

/// A room projected as a search-result card (`GET /listings/search`,
/// `ListingCard`).
@freezed
abstract class RoomSummary with _$RoomSummary {
  const factory RoomSummary({
    required String roomId,
    required String venueId,
    required String roomSlug,
    required String venueSlug,
    required String venueName,
    required String suburb,
    required String roomName,
    String? primaryPhotoUrl,
    required int capacity,
    required bool isFree,
    double? pricePerHour,
    required String currency,
    required double latitude,
    required double longitude,
    @Default(<String>[]) List<String> activities,
    @Default(<String>[]) List<String> accessibility,
    double? distanceMeters,
  }) = _RoomSummary;

  factory RoomSummary.fromJson(Map<String, dynamic> json) =>
      _$RoomSummaryFromJson(json);
}

/// A room photo projected for presentation. `id`/`thumbUrl`/`cardUrl` are
/// additive (CONTRACTS §1 rule) — older fixtures/responses without them still
/// round-trip; Manage screens (§6) need `id` to target `DELETE …/photos/{id}`.
@freezed
abstract class RoomPhoto with _$RoomPhoto {
  const factory RoomPhoto({
    String? id,
    required String url,
    String? thumbUrl,
    String? cardUrl,
    String? caption,
    required bool isPrimary,
    required int sortOrder,
  }) = _RoomPhoto;

  factory RoomPhoto.fromJson(Map<String, dynamic> json) =>
      _$RoomPhotoFromJson(json);
}

/// A venue projected for listing/detail presentation (`RoomDetail.venue`).
@freezed
abstract class VenueSummary with _$VenueSummary {
  const VenueSummary._();

  const factory VenueSummary({
    required String venueId,
    required String name,
    required String slug,

    /// Wire token: `church | publicSpace | other`.
    required String venueType,
    required String addressLine,
    required String suburb,
    required String postcode,
    String? contactEmail,
    required String parkingInfo,
    required String transitInfo,
    required bool isIdentityVerified,
    required double latitude,
    required double longitude,
  }) = _VenueSummary;

  factory VenueSummary.fromJson(Map<String, dynamic> json) =>
      _$VenueSummaryFromJson(json);

  VenueType get venueTypeValue =>
      parseWireEnum(venueType, VenueType.tokens, VenueType.unknown);
}

/// Full room detail for the listing detail page, including its venue
/// (`GET /listings/by-slug/{venueSlug}/{roomSlug}`, `GET /listings/{id}`).
@freezed
abstract class RoomDetail with _$RoomDetail {
  const factory RoomDetail({
    required String roomId,
    required String roomSlug,
    required String roomName,
    required String description,
    required int capacity,
    required bool isFree,
    double? pricePerHour,
    required String currency,
    required String houseRules,
    @Default(<String>[]) List<String> amenities,
    @Default(<String>[]) List<String> accessibility,
    @Default(<String>[]) List<String> activities,
    @Default(<RoomPhoto>[]) List<RoomPhoto> photos,
    required VenueSummary venue,
  }) = _RoomDetail;

  factory RoomDetail.fromJson(Map<String, dynamic> json) =>
      _$RoomDetailFromJson(json);
}
