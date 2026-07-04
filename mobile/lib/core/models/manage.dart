// Manage (provider self-service) wire shapes (CONTRACTS.md §6, Phase 5).
// Mirrors the manage-module DTOs in Steeple.Api/Contracts exactly.
import 'package:freezed_annotation/freezed_annotation.dart';

import 'room.dart';
import 'wire_enums.dart';
import 'wire_tokens.dart';

part 'manage.freezed.dart';
part 'manage.g.dart';

/// One row of `GET /api/v1/manage/venues` — venues where the caller is a
/// `venue_manager` (CONTRACTS §5/§6). Used to decide whether to show the
/// provider surface at all.
@freezed
abstract class ManagedVenue with _$ManagedVenue {
  const factory ManagedVenue({
    required String id,
    required String name,
    required String slug,
  }) = _ManagedVenue;

  factory ManagedVenue.fromJson(Map<String, dynamic> json) =>
      _$ManagedVenueFromJson(json);
}

/// A room row inside `ManagedVenueDetail.rooms` — the provider's own listing
/// grid, so it carries fields (`status`, `publishRequestedAtUtc`, counts)
/// public discovery never exposes (CONTRACTS §2 "status … Manage §6 only").
@freezed
abstract class ManagedRoomSummary with _$ManagedRoomSummary {
  const ManagedRoomSummary._();

  const factory ManagedRoomSummary({
    required String id,
    required String name,
    required String slug,

    /// Wire token: `draft | published | unlisted` (additive — tolerate
    /// unknown).
    required String status,
    DateTime? publishRequestedAtUtc,
    required int capacity,
    required bool isFree,
    double? pricePerHour,
    required String currency,
    String? primaryPhotoUrl,
    required int photoCount,
    required DateTime updatedAtUtc,
  }) = _ManagedRoomSummary;

  factory ManagedRoomSummary.fromJson(Map<String, dynamic> json) =>
      _$ManagedRoomSummaryFromJson(json);

  ManagedRoomStatus get statusValue =>
      parseWireEnum(status, ManagedRoomStatus.tokens, ManagedRoomStatus.unknown);
}

/// `GET /api/v1/manage/venues/{id}` — the venue's own fields plus its rooms
/// (§6). Same address/venue fields as `VenueSummary`; kept as a separate type
/// since the manage surface owns edit affordances discovery never needs.
@freezed
abstract class ManagedVenueDetail with _$ManagedVenueDetail {
  const ManagedVenueDetail._();

  const factory ManagedVenueDetail({
    required String id,
    required String name,
    required String slug,
    required String description,

    /// Wire token: `church | publicSpace | other`.
    required String venueType,
    required String addressLine,
    required String suburb,
    required String postcode,
    String? contactEmail,
    required String parkingInfo,
    required String transitInfo,
    required double latitude,
    required double longitude,
    required String timezone,
    required bool isIdentityVerified,
    @Default(<ManagedRoomSummary>[]) List<ManagedRoomSummary> rooms,
  }) = _ManagedVenueDetail;

  factory ManagedVenueDetail.fromJson(Map<String, dynamic> json) =>
      _$ManagedVenueDetailFromJson(json);

  VenueType get venueTypeValue =>
      parseWireEnum(venueType, VenueType.tokens, VenueType.unknown);
}

/// `GET /api/v1/manage/rooms/{id}` and the response of
/// `PATCH /api/v1/manage/rooms/{id}` (§6) — the editable room in full,
/// including its venue context and photos. No `isFree` field on the wire
/// (unlike the public `RoomDetail`/`ManagedRoomSummary`) — [isFree] derives
/// it the same way the API does: `pricePerHour <= 0` (or unset) means free.
@freezed
abstract class ManagedRoom with _$ManagedRoom {
  const ManagedRoom._();

  const factory ManagedRoom({
    required String id,
    required String venueId,
    required String venueName,
    required String venueSlug,
    required String name,
    required String slug,
    required String description,
    required int capacity,
    double? pricePerHour,
    required String currency,
    required String houseRules,

    /// Wire token: `draft | published | unlisted` (additive).
    required String status,
    DateTime? publishRequestedAtUtc,
    DateTime? firstPublishedAtUtc,
    @Default(<String>[]) List<String> activities,
    @Default(<String>[]) List<String> amenities,
    @Default(<String>[]) List<String> accessibility,
    @Default(<RoomPhoto>[]) List<RoomPhoto> photos,
    required DateTime updatedAtUtc,
  }) = _ManagedRoom;

  factory ManagedRoom.fromJson(Map<String, dynamic> json) =>
      _$ManagedRoomFromJson(json);

  ManagedRoomStatus get statusValue =>
      parseWireEnum(status, ManagedRoomStatus.tokens, ManagedRoomStatus.unknown);

  bool get isFree => pricePerHour == null || pricePerHour! <= 0;
}

/// Client-side edit request for `PATCH /api/v1/manage/rooms/{id}` (§6) —
/// never deserialized from the wire. Every field is "leave unchanged" when
/// omitted, so [toJson] emits only the ones actually set; `pricePerHour <= 0`
/// means free (server convention, mirrored — not enforced client-side).
class ManagedRoomPatch {
  const ManagedRoomPatch({
    this.name,
    this.description,
    this.capacity,
    this.pricePerHour,
    this.houseRules,
    this.status,
    this.activities,
    this.amenities,
    this.accessibility,
  });

  final String? name;
  final String? description;
  final int? capacity;
  final double? pricePerHour;
  final String? houseRules;

  /// Wire token: `draft | published | unlisted`.
  final String? status;
  final List<String>? activities;
  final List<String>? amenities;
  final List<String>? accessibility;

  Map<String, dynamic> toJson() => {
        if (name != null) 'name': name,
        if (description != null) 'description': description,
        if (capacity != null) 'capacity': capacity,
        if (pricePerHour != null) 'pricePerHour': pricePerHour,
        if (houseRules != null) 'houseRules': houseRules,
        if (status != null) 'status': status,
        if (activities != null) 'activities': activities,
        if (amenities != null) 'amenities': amenities,
        if (accessibility != null) 'accessibility': accessibility,
      };
}
