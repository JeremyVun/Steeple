/// Hand-rolled date/time display helpers — no `intl` dependency; month names,
/// weekday names, and 12-hour formatting are rolled by hand here.
///
/// MOBILE_CONTRACTS §5 timezone rule: venue-local dates (`yyyy-MM-dd`) and
/// times (`HH:mm`) stay `String` end-to-end and are NEVER parsed into
/// [DateTime] (that would silently reinterpret them in the device's
/// timezone). Only genuine UTC instants (`…Utc` fields) become [DateTime]
/// here — [relativeStamp] is the one function in this file that takes one.
library;

import '../models/models.dart';

const _monthNames = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', //
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const _weekdayAbbrev = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const _weekdayFull = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', //
];

const _weekdayIndex = <String, int>{
  'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3, //
  'thursday': 4, 'friday': 5, 'saturday': 6,
};

/// Relative timestamp for inbox rows (DESIGN_SYSTEM §10): "just now" / "5m
/// ago" / "2h ago" / "3d ago", then an absolute "Jun 12" for anything older
/// than a week ("Jun 12, 2025" once it's a different calendar year).
String relativeStamp(DateTime utc) {
  final instant = utc.isUtc ? utc : utc.toUtc();
  final now = DateTime.now().toUtc();
  final diff = now.difference(instant);

  if (diff.inSeconds < 60) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  if (diff.inDays < 7) return '${diff.inDays}d ago';

  final month = _monthNames[instant.month - 1];
  return instant.year == now.year
      ? '$month ${instant.day}'
      : '$month ${instant.day}, ${instant.year}';
}

/// `yyyy-MM-dd` → "Sep 1". Parsed by hand (never `DateTime.parse`) so a
/// venue-local calendar date is never reinterpreted through a timezone.
String monthDay(String yyyyMmDd) {
  final parts = yyyyMmDd.split('-');
  final month = int.parse(parts[1]);
  final day = int.parse(parts[2]);
  return '${_monthNames[month - 1]} $day';
}

/// "Sep 1 – Dec 15". Same-year elision is allowed by design (MOBILE §0) — the
/// year is never shown, even across a year boundary.
String dateRange(String start, String end) => '${monthDay(start)} – ${monthDay(end)}';

/// `yyyy-MM-dd` → "Tue, Sep 8" — used where a single occurrence date needs its
/// weekday called out (e.g. a booking card's "Next: …" line).
String weekdayMonthDay(String yyyyMmDd) =>
    '${_weekdayAbbrev[_dayOfWeek(yyyyMmDd)]}, ${monthDay(yyyyMmDd)}';

/// `"HH:mm"` (24h, venue-local) → "9:00 AM" — a single formatted time, never
/// parsed into [DateTime].
String time12(String hhmm) {
  final t = _format12(hhmm);
  return '${t.display} ${t.pm ? 'PM' : 'AM'}';
}

/// Whole days from today (device-local calendar date) until [yyyyMmDd] —
/// negative once the date is in the past. Pure integer calendar arithmetic
/// (Howard Hinnant's "days from civil"), so calendar-date comparisons never
/// go through [DateTime]/timezone conversion.
int daysUntil(String yyyyMmDd) {
  final now = DateTime.now();
  final todayIso = '${now.year}-${now.month.toString().padLeft(2, '0')}-'
      '${now.day.toString().padLeft(2, '0')}';
  return _daysSinceEpoch(yyyyMmDd) - _daysSinceEpoch(todayIso);
}

int _daysSinceEpoch(String yyyyMmDd) {
  final parts = yyyyMmDd.split('-');
  final y = int.parse(parts[0]);
  final m = int.parse(parts[1]);
  final d = int.parse(parts[2]);
  final yy = m <= 2 ? y - 1 : y;
  final era = (yy >= 0 ? yy : yy - 399) ~/ 400;
  final yoe = yy - era * 400;
  final mp = (m + 9) % 12;
  final doy = (153 * mp + 2) ~/ 5 + d - 1;
  final doe = yoe * 365 + yoe ~/ 4 - yoe ~/ 100 + doy;
  return era * 146097 + doe - 719468;
}

/// One-line schedule summary (MOBILE_CONTRACTS §5 — times are venue-local
/// `HH:mm` strings, formatted to 12-hour here, never parsed into [DateTime]):
/// recurring → "Tuesdays 9:00–11:30 AM"; one-off → "Tue, Sep 1 · 9:00–11:30 AM".
String scheduleSummary(ProposedSchedule s) {
  final timeRange = _timeRange(s.startTime, s.endTime);
  if (s.frequencyValue == ScheduleFrequency.recurringWeekly) {
    final label = describeWeekdays(s.daysOfWeek);
    return '$label $timeRange';
  }
  final weekday = _weekdayAbbrev[_dayOfWeek(s.startDate)];
  return '$weekday, ${monthDay(s.startDate)} · $timeRange';
}

/// Pluralized weekday-set label matching the server's email style
/// (Steeple.Api ScheduleText.DescribeDays): "Tuesdays", "Tuesdays and
/// Thursdays", "Mondays, Wednesdays and Fridays" — always Sunday-first
/// regardless of wire order. Empty/null falls back to "Weekly".
String describeWeekdays(List<String>? days) {
  if (days == null || days.isEmpty) return 'Weekly';
  final ordered = [...days]..sort(
      (a, b) => (_weekdayIndex[a] ?? 7).compareTo(_weekdayIndex[b] ?? 7),
    );
  final names = ordered.map((d) {
    final i = _weekdayIndex[d];
    return i == null ? '${_capitalize(d)}s' : '${_weekdayFull[i]}s';
  }).toList();
  if (names.length == 1) return names[0];
  if (names.length == 2) return '${names[0]} and ${names[1]}';
  return '${names.sublist(0, names.length - 1).join(', ')} and ${names.last}';
}

String _capitalize(String s) => s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';

/// Sakamoto's algorithm (0 = Sunday … 6 = Saturday) — pure calendar
/// arithmetic, no [DateTime] involved, so a wall-clock date string is never
/// routed through a timezone to find its weekday.
int _dayOfWeek(String yyyyMmDd) {
  final parts = yyyyMmDd.split('-');
  var year = int.parse(parts[0]);
  final month = int.parse(parts[1]);
  final day = int.parse(parts[2]);
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  if (month < 3) year -= 1;
  return (year + year ~/ 4 - year ~/ 100 + year ~/ 400 + t[month - 1] + day) % 7;
}

/// `"HH:mm"` (24h) → 12-hour parts, e.g. `"09:00"` → `(display: '9:00', pm: false)`.
({String display, bool pm}) _format12(String hhmm) {
  final parts = hhmm.split(':');
  final hour24 = int.parse(parts[0]);
  final minute = parts[1];
  final pm = hour24 >= 12;
  var hour12 = hour24 % 12;
  if (hour12 == 0) hour12 = 12;
  return (display: '$hour12:$minute', pm: pm);
}

/// One shared AM/PM suffix when both ends share it ("9:00–11:30 AM"),
/// otherwise each end gets its own ("11:00 AM–1:30 PM").
String _timeRange(String start, String end) {
  final s = _format12(start);
  final e = _format12(end);
  if (s.pm == e.pm) {
    return '${s.display}–${e.display} ${e.pm ? 'PM' : 'AM'}';
  }
  return '${s.display} ${s.pm ? 'PM' : 'AM'}–${e.display} ${e.pm ? 'PM' : 'AM'}';
}
