// Unit tests for lib/core/utils/dates.dart — hand-rolled date/time display
// helpers (no `intl`). Lives under test/features/bookings per the task's
// ownership boundary even though the helpers are shared with inbox.
import 'package:flutter_test/flutter_test.dart';
import 'package:steeple_mobile/core/models/models.dart';
import 'package:steeple_mobile/core/utils/dates.dart';

void main() {
  group('relativeStamp', () {
    test('just now for sub-minute instants', () {
      expect(relativeStamp(DateTime.now().toUtc()), 'just now');
    });

    test('minutes ago', () {
      final t = DateTime.now().toUtc().subtract(const Duration(minutes: 5));
      expect(relativeStamp(t), '5m ago');
    });

    test('hours ago', () {
      final t = DateTime.now().toUtc().subtract(const Duration(hours: 2));
      expect(relativeStamp(t), '2h ago');
    });

    test('days ago, under a week', () {
      final t = DateTime.now().toUtc().subtract(const Duration(days: 3));
      expect(relativeStamp(t), '3d ago');
    });

    test('older than a week shows an absolute date', () {
      final now = DateTime.now().toUtc();
      final t = now.subtract(const Duration(days: 10));
      final result = relativeStamp(t);
      final expectedPattern = t.year == now.year
          ? RegExp(r'^[A-Z][a-z]{2} \d{1,2}$')
          : RegExp(r'^[A-Z][a-z]{2} \d{1,2}, \d{4}$');
      expect(result, matches(expectedPattern));
    });

    test('a different calendar year shows the year', () {
      final now = DateTime.now().toUtc();
      final t = now.subtract(const Duration(days: 400));
      expect(t.year, isNot(now.year));
      expect(relativeStamp(t), matches(RegExp(r'^[A-Z][a-z]{2} \d{1,2}, \d{4}$')));
    });
  });

  group('monthDay', () {
    test('formats a wire calendar date', () {
      expect(monthDay('2026-09-01'), 'Sep 1');
      expect(monthDay('2025-12-25'), 'Dec 25');
    });
  });

  group('dateRange', () {
    test('joins two wire dates with an en dash, no year', () {
      expect(dateRange('2026-09-01', '2026-12-15'), 'Sep 1 – Dec 15');
    });
  });

  group('weekdayMonthDay', () {
    test('prefixes the weekday abbreviation', () {
      // 2026-09-01 is a Tuesday.
      expect(weekdayMonthDay('2026-09-01'), 'Tue, Sep 1');
    });
  });

  group('time12', () {
    test('formats 24h times to 12h with AM/PM', () {
      expect(time12('09:00'), '9:00 AM');
      expect(time12('13:30'), '1:30 PM');
      expect(time12('00:15'), '12:15 AM');
      expect(time12('12:00'), '12:00 PM');
    });
  });

  group('scheduleSummary', () {
    test('recurring weekly collapses to a single AM/PM suffix', () {
      const schedule = ProposedSchedule(
        frequency: 'recurringWeekly',
        startDate: '2026-09-01',
        endDate: '2026-12-15',
        dayOfWeek: 'tuesday',
        startTime: '09:00',
        endTime: '11:30',
      );
      expect(scheduleSummary(schedule), 'Tuesdays 9:00–11:30 AM');
    });

    test('one-off shows the weekday, date, and time', () {
      const schedule = ProposedSchedule(
        frequency: 'oneOff',
        startDate: '2026-09-01',
        startTime: '09:00',
        endTime: '11:30',
      );
      expect(scheduleSummary(schedule), 'Tue, Sep 1 · 9:00–11:30 AM');
    });

    test('a range crossing noon gets its own suffix on each end', () {
      const schedule = ProposedSchedule(
        frequency: 'oneOff',
        startDate: '2026-09-01',
        startTime: '11:00',
        endTime: '13:30',
      );
      expect(scheduleSummary(schedule), 'Tue, Sep 1 · 11:00 AM–1:30 PM');
    });
  });

  group('daysUntil', () {
    String isoOf(DateTime d) =>
        '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

    test('is zero for today', () {
      expect(daysUntil(isoOf(DateTime.now())), 0);
    });

    test('is negative for a date in the past', () {
      expect(daysUntil(isoOf(DateTime.now().subtract(const Duration(days: 5)))), lessThan(0));
    });

    test('is positive for a date in the future', () {
      expect(daysUntil(isoOf(DateTime.now().add(const Duration(days: 5)))), greaterThan(0));
    });
  });
}
