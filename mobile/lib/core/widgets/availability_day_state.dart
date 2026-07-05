import 'package:flutter/material.dart';

import '../../app/theme/theme.dart';
import '../models/models.dart';
import '../utils/dates.dart';

const _weekdayTokens = <String>[
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', //
];

/// The room's open windows for the weekday a `yyyy-MM-dd` falls on (empty when
/// the room has no hours declared or is closed that weekday). Bridges the
/// weekly `openHours` on [RoomDetail] to a specific calendar date.
List<OpenWindow> openWindowsForDate(List<DayOpenHours>? openHours, String date) {
  if (openHours == null) return const [];
  final token = _weekdayTokens[weekdayOf(date)];
  for (final day in openHours) {
    if (day.dayOfWeek == token) return day.windows;
  }
  return const [];
}

/// The per-day availability state a calendar/strip cell renders
/// (DESIGN_SYSTEM §8.10). Derived by [deriveDayState] from the guest
/// availability feed plus the room's weekly open hours; the "closed vs booked
/// out" distinction is impossible from the feed alone (both are empty free
/// windows) so the open hours are required.
enum DayState {
  /// Fully free — the whole weekday's open time is available.
  open,

  /// Some open time is taken but a window remains bookable.
  partlyBooked,

  /// The weekday is open but every window is already booked.
  bookedOut,

  /// The weekday has no open hours at all.
  closed,

  /// A blackout date — closed regardless of open hours.
  blackout,

  /// Before today — never bookable.
  past,

  /// Outside the fetched availability window — unknown, treated as disabled.
  unknown;

  /// Only `open`/`partlyBooked` days can be picked (DESIGN_SYSTEM §8.10).
  bool get isSelectable => this == DayState.open || this == DayState.partlyBooked;
}

int _minutes(String hhmm) {
  final parts = hhmm.split(':');
  return int.parse(parts[0]) * 60 + int.parse(parts[1]);
}

int _totalMinutes(List<OpenWindow> windows) {
  var total = 0;
  for (final w in windows) {
    total += _minutes(w.endTime) - _minutes(w.startTime);
  }
  return total;
}

/// Classifies one calendar date. [day] is that date's entry from the
/// availability feed (null when outside the fetched span); [openWindows] is the
/// room's open windows for that weekday (empty = closed weekday); [today] is
/// the device-local `yyyy-MM-dd` anchor. Date strings compare lexicographically
/// (all `yyyy-MM-dd`), never via [DateTime] (MOBILE_CONTRACTS §5).
DayState deriveDayState({
  required String date,
  required AvailabilityDay? day,
  required List<OpenWindow> openWindows,
  required String today,
}) {
  if (date.compareTo(today) < 0) return DayState.past;
  if (day == null) return DayState.unknown;
  if (day.isBlackout) return DayState.blackout;
  if (day.freeWindows.isEmpty) {
    return openWindows.isEmpty ? DayState.closed : DayState.bookedOut;
  }
  return _totalMinutes(day.freeWindows) < _totalMinutes(openWindows)
      ? DayState.partlyBooked
      : DayState.open;
}

/// The resolved colors/markers for a [DayState] (DESIGN_SYSTEM §8.10 table),
/// all from §2.3 status tokens — never raw hex. [dot] is the small
/// `warning`-bg marker under a partly-booked number; [cross] is the blackout
/// "×" glyph. Booked-out vs closed must never rely on color alone, so the dot
/// and glyph carry the meaning.
@immutable
class DayStateVisual {
  const DayStateVisual({
    required this.background,
    required this.foreground,
    this.dot = false,
    this.cross = false,
  });

  final Color background;
  final Color foreground;
  final bool dot;
  final bool cross;
}

DayStateVisual dayStateVisual(DayState state, SteepleColors c) => switch (state) {
      DayState.open =>
        DayStateVisual(background: c.surfaceRaised, foreground: c.textPrimary),
      DayState.partlyBooked => DayStateVisual(
          background: c.surfaceRaised,
          foreground: c.textPrimary,
          dot: true,
        ),
      DayState.bookedOut =>
        DayStateVisual(background: c.neutral.bg, foreground: c.neutral.fg),
      DayState.closed =>
        DayStateVisual(background: c.surface, foreground: c.textTertiary),
      DayState.blackout => DayStateVisual(
          background: c.surface,
          foreground: c.textTertiary,
          cross: true,
        ),
      DayState.past || DayState.unknown =>
        DayStateVisual(background: Colors.transparent, foreground: c.textTertiary),
    };

/// Screen-reader phrase for a day's state ("open, 2 free windows" etc.),
/// DESIGN_SYSTEM §8.10 accessible-name rule.
String dayStateSemantics(DayState state, int freeWindows) => switch (state) {
      DayState.open => 'open, $freeWindows free ${_windows(freeWindows)}',
      DayState.partlyBooked =>
        'partly booked, $freeWindows free ${_windows(freeWindows)}',
      DayState.bookedOut => 'booked out',
      DayState.closed => 'closed',
      DayState.blackout => 'closed that day',
      DayState.past => 'in the past',
      DayState.unknown => 'unavailable',
    };

String _windows(int n) => n == 1 ? 'window' : 'windows';
