// Room availability rules wire shapes (CONTRACTS §6a; manage-module DTOs in
// Steeple.Api/Contracts/Availability). Venue-local wall-clock: times are `HH:mm`
// (24h) strings and dates are `yyyy-MM-dd` strings — never parsed into DateTime
// (MOBILE_CONTRACTS §5 timezone rule). Weekday tokens are `sunday`…`saturday`.
import 'package:freezed_annotation/freezed_annotation.dart';

part 'room_availability.freezed.dart';
part 'room_availability.g.dart';

/// One bookable window inside a day. [startTime]/[endTime] are venue-local
/// `HH:mm`; end is exclusive and must be after start; never crosses midnight.
@freezed
abstract class OpenWindow with _$OpenWindow {
  const factory OpenWindow({
    required String startTime,
    required String endTime,
  }) = _OpenWindow;

  factory OpenWindow.fromJson(Map<String, dynamic> json) =>
      _$OpenWindowFromJson(json);
}

/// A weekday's open windows. [dayOfWeek] is a `sunday`…`saturday` token; an
/// empty [windows] list means closed that day. GET emits all seven days
/// Sunday-first; PUT may send a sparse list (omitted weekday = closed).
@freezed
abstract class DayOpenHours with _$DayOpenHours {
  const factory DayOpenHours({
    required String dayOfWeek,
    @Default(<OpenWindow>[]) List<OpenWindow> windows,
  }) = _DayOpenHours;

  factory DayOpenHours.fromJson(Map<String, dynamic> json) =>
      _$DayOpenHoursFromJson(json);
}

/// A date the room is closed regardless of open hours. [date] is a venue-local
/// `yyyy-MM-dd` string; [reason] is an optional note (≤200 chars).
@freezed
abstract class BlackoutDate with _$BlackoutDate {
  const factory BlackoutDate({
    required String date,
    String? reason,
  }) = _BlackoutDate;

  factory BlackoutDate.fromJson(Map<String, dynamic> json) =>
      _$BlackoutDateFromJson(json);
}

/// A room's full availability rule set (`GET /api/v1/manage/rooms/{id}/availability`
/// response, and the response of the `PUT`). GET always emits all seven days
/// Sunday-first with closed days included (empty windows); blackouts are
/// future-dated only and sorted ascending. [toSavePayload] builds the
/// replace-all `PUT` body (`{days, blackouts}` only).
@freezed
abstract class RoomAvailabilityRules with _$RoomAvailabilityRules {
  const RoomAvailabilityRules._();

  const factory RoomAvailabilityRules({
    required String roomId,
    required String timezone,
    @Default(<DayOpenHours>[]) List<DayOpenHours> days,
    @Default(<BlackoutDate>[]) List<BlackoutDate> blackouts,
  }) = _RoomAvailabilityRules;

  factory RoomAvailabilityRules.fromJson(Map<String, dynamic> json) =>
      _$RoomAvailabilityRulesFromJson(json);

  /// The `PUT` replace-all body — days + blackouts only (server owns
  /// `roomId`/`timezone`).
  Map<String, dynamic> toSavePayload() => {
        'days': [for (final day in days) day.toJson()],
        'blackouts': [for (final blackout in blackouts) blackout.toJson()],
      };
}
