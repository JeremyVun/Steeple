// Host venue-calendar wire shapes (CONTRACTS §6 "Host review & venue calendar";
// manage-module DTO for `GET /api/v1/manage/venues/{id}/calendar`). Venue-local
// wall-clock throughout: [localDate]/[dates] are `yyyy-MM-dd` and times are
// `HH:mm` (24h) strings — NEVER parsed into DateTime (MOBILE_CONTRACTS §5
// timezone rule).
import 'package:freezed_annotation/freezed_annotation.dart';

part 'venue_calendar.freezed.dart';
part 'venue_calendar.g.dart';

/// A room reference inside the calendar envelope — just enough to label an
/// occurrence's room without a second fetch.
@freezed
abstract class CalendarRoomRef with _$CalendarRoomRef {
  const factory CalendarRoomRef({
    required String id,
    required String name,
  }) = _CalendarRoomRef;

  factory CalendarRoomRef.fromJson(Map<String, dynamic> json) =>
      _$CalendarRoomRefFromJson(json);
}

/// One confirmed booking occurrence on a date. [status] is a wire token
/// (`scheduled | occurred | cancelled | …`; additive — tolerate unknown).
@freezed
abstract class CalendarOccurrence with _$CalendarOccurrence {
  const factory CalendarOccurrence({
    required String bookingId,
    required String roomId,
    required String organizerName,

    /// Venue-local `yyyy-MM-dd`.
    required String localDate,

    /// Venue-local `HH:mm` (24h).
    required String startTime,
    required String endTime,
    required String status,
  }) = _CalendarOccurrence;

  factory CalendarOccurrence.fromJson(Map<String, dynamic> json) =>
      _$CalendarOccurrenceFromJson(json);
}

/// A still-pending application overlaid on the calendar — one entry, spanning
/// every venue-local date in [dates] at the same [startTime]/[endTime].
@freezed
abstract class CalendarPending with _$CalendarPending {
  const factory CalendarPending({
    required String applicationId,
    required String roomId,
    required String organizerName,

    /// Venue-local `HH:mm` (24h).
    required String startTime,
    required String endTime,

    /// Venue-local `yyyy-MM-dd` occurrence dates.
    @Default(<String>[]) List<String> dates,
  }) = _CalendarPending;

  factory CalendarPending.fromJson(Map<String, dynamic> json) =>
      _$CalendarPendingFromJson(json);
}

/// `GET /api/v1/manage/venues/{id}/calendar?from&to` — a venue's confirmed
/// occurrences plus pending overlays over a date span (≤92 days). [from]/[to]
/// echo the request; times/dates are venue-local wall-clock in [timezone].
@freezed
abstract class VenueCalendar with _$VenueCalendar {
  const factory VenueCalendar({
    required String venueId,
    required String timezone,
    required String from,
    required String to,
    @Default(<CalendarRoomRef>[]) List<CalendarRoomRef> rooms,
    @Default(<CalendarOccurrence>[]) List<CalendarOccurrence> occurrences,
    @Default(<CalendarPending>[]) List<CalendarPending> pending,
  }) = _VenueCalendar;

  factory VenueCalendar.fromJson(Map<String, dynamic> json) =>
      _$VenueCalendarFromJson(json);
}
