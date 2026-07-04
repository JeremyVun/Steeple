// Booking wire shapes (CONTRACTS.md §5). Mirrors BookingDto, OccurrenceDto in
// Steeple.Api/Contracts/Bookings exactly. `startDate`/`endDate`/`localDate`
// stay `String` (venue-local wall-clock dates) — never `DateTime`.
import 'package:freezed_annotation/freezed_annotation.dart';

import 'application.dart';
import 'wire_enums.dart';
import 'wire_tokens.dart';

part 'booking.freezed.dart';
part 'booking.g.dart';

/// One materialized occurrence of a booking.
@freezed
abstract class Occurrence with _$Occurrence {
  const Occurrence._();

  const factory Occurrence({
    required String id,
    required DateTime startUtc,
    required DateTime endUtc,

    /// `yyyy-MM-dd`, venue-local.
    required String localDate,

    /// Wire token: `scheduled | occurred | noShow | cancelled`.
    required String status,
    String? noShowMarkedBy,
  }) = _Occurrence;

  factory Occurrence.fromJson(Map<String, dynamic> json) =>
      _$OccurrenceFromJson(json);

  OccurrenceStatus get statusValue =>
      parseWireEnum(status, OccurrenceStatus.tokens, OccurrenceStatus.unknown);
}

/// A booking as both parties see it (CONTRACTS §5). List endpoints return
/// `occurrences: []` (the set stays behind the detail fetch); `nextOccurrence`
/// is always populated where one exists. `startDate`/`endDate`/`schedule` are
/// venue-local; `venueTimezone` is the IANA zone they're local to.
@freezed
abstract class Booking with _$Booking {
  const Booking._();

  const factory Booking({
    required String id,
    required String applicationId,
    required String roomId,
    required String roomName,
    required String venueName,
    required String venueSlug,
    required String roomSlug,
    required String venueTimezone,
    required String organizerId,
    required String organizerName,

    /// Wire token: `oneOff` or `recurring`.
    required String type,

    /// `yyyy-MM-dd`, venue-local.
    required String startDate,

    /// `yyyy-MM-dd`, venue-local.
    required String endDate,
    required ProposedSchedule schedule,

    /// Wire token: `confirmed | completed | cancelled`.
    required String status,
    required DateTime createdAtUtc,
    String? cancelledBy,
    DateTime? cancelledAtUtc,
    String? cancelReason,

    /// The next live occurrence — set on lists too.
    Occurrence? nextOccurrence,
    @Default(<Occurrence>[]) List<Occurrence> occurrences,
  }) = _Booking;

  factory Booking.fromJson(Map<String, dynamic> json) =>
      _$BookingFromJson(json);

  BookingType get typeValue => parseWireEnum(type, BookingType.tokens, BookingType.unknown);

  BookingStatus get statusValue =>
      parseWireEnum(status, BookingStatus.tokens, BookingStatus.unknown);
}
