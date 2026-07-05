import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../../../core/utils/dates.dart';
import '../providers.dart';

/// Family key for [manageCalendarProvider]: a venue plus the Sunday that starts
/// the visible week. The fetched range is exactly that week (from..+6d) — the
/// screen re-keys as the operator pages weeks or switches venue.
typedef CalendarWeekKey = ({String venueId, String from});

/// Backs [ManageCalendarScreen] — one venue's confirmed occurrences + pending
/// overlays for the visible week. Fetches exactly `from..from+6d`.
class ManageCalendarNotifier extends AsyncNotifier<VenueCalendar> {
  ManageCalendarNotifier(this.key);

  final CalendarWeekKey key;

  @override
  Future<VenueCalendar> build() => ref
      .read(manageRepositoryProvider)
      .calendar(key.venueId, from: key.from, to: addDays(key.from, 6));

  Future<void> refresh() async {
    ref.invalidateSelf();
    await future;
  }
}

final manageCalendarProvider = AsyncNotifierProvider.family<ManageCalendarNotifier,
    VenueCalendar, CalendarWeekKey>(ManageCalendarNotifier.new);
