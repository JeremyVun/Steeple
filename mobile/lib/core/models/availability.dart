// Guest availability wire shapes (CONTRACTS §6a; Steeple.Api/Contracts/Availability
// RoomAvailabilityDto, AvailabilityDayDto, ScheduleCheckResultDto, ScheduleConflictDto).
// Venue-local wall-clock throughout: dates are `yyyy-MM-dd`, times are `HH:mm` (24h)
// strings — NEVER parsed into DateTime (MOBILE_CONTRACTS §5 timezone rule). Reuses
// [OpenWindow] from room_availability.dart for the free-time windows.
import 'package:freezed_annotation/freezed_annotation.dart';

import 'room_availability.dart';

part 'availability.freezed.dart';
part 'availability.g.dart';

/// One calendar day of a room's computed availability
/// (`GET /api/v1/listings/{roomId}/availability`): open hours minus blackouts
/// minus **confirmed** bookings. [freeWindows] are venue-local `HH:mm` `[)`
/// intervals; an open day fully booked out has `isBlackout: false` and empty
/// [freeWindows] — the "closed vs booked out" distinction is read off the
/// room's `openHours` for that weekday (see `deriveDayState`).
@freezed
abstract class AvailabilityDay with _$AvailabilityDay {
  const factory AvailabilityDay({
    /// Venue-local `yyyy-MM-dd`.
    required String date,
    @Default(false) bool isBlackout,
    @Default(<OpenWindow>[]) List<OpenWindow> freeWindows,
  }) = _AvailabilityDay;

  factory AvailabilityDay.fromJson(Map<String, dynamic> json) =>
      _$AvailabilityDayFromJson(json);
}

/// A room's guest-facing computed availability over a date span. [from]/[to]
/// echo the request (`from` ≥ today, span ≤ 92 days); [days] is one entry per
/// calendar date in range, ascending.
@freezed
abstract class RoomAvailability with _$RoomAvailability {
  const RoomAvailability._();

  const factory RoomAvailability({
    required String roomId,
    required String timezone,
    required String from,
    required String to,
    @Default(<AvailabilityDay>[]) List<AvailabilityDay> days,
  }) = _RoomAvailability;

  factory RoomAvailability.fromJson(Map<String, dynamic> json) =>
      _$RoomAvailabilityFromJson(json);

  /// Fast lookup of a `yyyy-MM-dd` date's entry, or null when out of range.
  AvailabilityDay? dayFor(String date) {
    for (final day in days) {
      if (day.date == date) return day;
    }
    return null;
  }
}

/// One occurrence that can't happen: [reason] is `outsideOpenHours`,
/// `blackout`, or `booked`. [date] is venue-local `yyyy-MM-dd`.
@freezed
abstract class ScheduleConflict with _$ScheduleConflict {
  const factory ScheduleConflict({
    required String date,
    required String reason,
  }) = _ScheduleConflict;

  factory ScheduleConflict.fromJson(Map<String, dynamic> json) =>
      _$ScheduleConflictFromJson(json);
}

/// Advisory verdict of a schedule dry-run
/// (`POST /api/v1/listings/{roomId}/availability/check`) — and the payload of
/// the submit-time hard block's `409 schedule_unavailable`. [available] means
/// zero conflicts across all [totalOccurrences] materialized dates. Advisory
/// only: approval and the booking exclusion constraint stay the authority
/// (DESIGN_SYSTEM §8.13).
@freezed
abstract class ScheduleCheckResult with _$ScheduleCheckResult {
  const factory ScheduleCheckResult({
    required bool available,
    required int totalOccurrences,
    @Default(<ScheduleConflict>[]) List<ScheduleConflict> conflicts,
  }) = _ScheduleCheckResult;

  factory ScheduleCheckResult.fromJson(Map<String, dynamic> json) =>
      _$ScheduleCheckResultFromJson(json);
}
