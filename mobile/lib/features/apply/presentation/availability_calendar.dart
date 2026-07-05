import 'package:flutter/material.dart';

import '../../../app/theme/theme.dart';
import '../../../core/models/models.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';

/// Hand-rolled month grid (no calendar package — MOBILE_CONTRACTS §2 cost
/// ethos). Sunday-first columns (the wire's canonical order); one month at a
/// time, navigable within the fetched availability window. Cells derive their
/// [DayState] from the feed + the room's open hours and are real buttons only
/// when bookable (DESIGN_SYSTEM §8.10). Public so it is widget-testable in
/// isolation.
class AvailabilityCalendar extends StatefulWidget {
  const AvailabilityCalendar({
    required this.availability,
    required this.openHours,
    required this.selectedDate,
    required this.onSelectDay,
    super.key,
  });

  final RoomAvailability availability;
  final List<DayOpenHours>? openHours;
  final String? selectedDate;
  final void Function(String date) onSelectDay;

  @override
  State<AvailabilityCalendar> createState() => _AvailabilityCalendarState();
}

class _AvailabilityCalendarState extends State<AvailabilityCalendar> {
  late int _year;
  late int _month;

  static const _monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June', //
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  static const _weekdayInitials = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  @override
  void initState() {
    super.initState();
    final anchor = widget.selectedDate ?? widget.availability.from;
    final parts = anchor.split('-');
    _year = int.parse(parts[0]);
    _month = int.parse(parts[1]);
  }

  int get _currentMonth => _year * 12 + (_month - 1);
  int _monthIndexOf(String date) {
    final parts = date.split('-');
    return int.parse(parts[0]) * 12 + (int.parse(parts[1]) - 1);
  }

  int get _minMonth => _monthIndexOf(widget.availability.from);
  int get _maxMonth => _monthIndexOf(widget.availability.to);

  void _shift(int delta) {
    final next = _currentMonth + delta;
    if (next < _minMonth || next > _maxMonth) return;
    setState(() {
      _year = next ~/ 12;
      _month = next % 12 + 1;
    });
  }

  int _daysInMonth(int y, int m) {
    const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (m == 2 && y % 4 == 0 && (y % 100 != 0 || y % 400 == 0)) return 29;
    return lengths[m - 1];
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    final today = todayLocalIso();
    final mm = _month.toString().padLeft(2, '0');
    final firstWeekday = weekdayOf('$_year-$mm-01'); // 0 = Sunday
    final total = _daysInMonth(_year, _month);

    final cells = <String?>[
      for (var i = 0; i < firstWeekday; i++) null,
      for (var d = 1; d <= total; d++) '$_year-$mm-${d.toString().padLeft(2, '0')}',
    ];
    while (cells.length % 7 != 0) {
      cells.add(null);
    }
    final weeks = [for (var i = 0; i < cells.length; i += 7) cells.sublist(i, i + 7)];

    return Column(
      children: [
        Row(
          children: [
            IconButton(
              onPressed: _currentMonth > _minMonth ? () => _shift(-1) : null,
              icon: const Icon(Icons.chevron_left_rounded),
              tooltip: 'Previous month',
            ),
            Expanded(
              child: Center(
                child: Semantics(
                  liveRegion: true,
                  child: Text(
                    '${_monthNames[_month - 1]} $_year',
                    style: SteepleTypography.title.copyWith(color: colors.textPrimary),
                  ),
                ),
              ),
            ),
            IconButton(
              onPressed: _currentMonth < _maxMonth ? () => _shift(1) : null,
              icon: const Icon(Icons.chevron_right_rounded),
              tooltip: 'Next month',
            ),
          ],
        ),
        Row(
          children: [
            for (final initial in _weekdayInitials)
              Expanded(
                child: Center(
                  child: Text(
                    initial,
                    style: SteepleTypography.label.copyWith(color: colors.textTertiary),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: SteepleTokens.space1),
        for (final week in weeks)
          Row(
            children: [
              for (final date in week) Expanded(child: _cell(date, today, colors)),
            ],
          ),
      ],
    );
  }

  Widget _cell(String? date, String today, SteepleColors colors) {
    if (date == null) return const AspectRatio(aspectRatio: 1, child: SizedBox());

    final day = widget.availability.dayFor(date);
    final state = deriveDayState(
      date: date,
      day: day,
      openWindows: openWindowsForDate(widget.openHours, date),
      today: today,
    );
    final selected = date == widget.selectedDate;
    final isToday = date == today;
    final visual = dayStateVisual(state, colors);
    final number = int.parse(date.split('-')[2]).toString();

    final background = selected ? colors.selectedFill : visual.background;
    final foreground = selected ? Colors.white : visual.foreground;
    final hasFill = background != Colors.transparent;

    final content = Container(
      margin: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(SteepleTokens.radiusSm),
        border: Border.all(
          color: isToday
              ? colors.selectedFill
              : (hasFill ? colors.border : Colors.transparent),
          width: isToday ? 1.5 : 1,
        ),
      ),
      alignment: Alignment.center,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            visual.cross ? '×' : number,
            style: SteepleTypography.bodySm.copyWith(
              color: foreground,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
            ),
          ),
          SizedBox(
            height: 5,
            child: (visual.dot && !selected)
                ? Container(
                    width: 5,
                    height: 5,
                    decoration:
                        BoxDecoration(color: colors.warning.fg, shape: BoxShape.circle),
                  )
                : null,
          ),
        ],
      ),
    );

    return AspectRatio(
      aspectRatio: 1,
      child: Semantics(
        button: state.isSelectable,
        selected: selected,
        label: '${weekdayMonthDay(date)}, '
            '${dayStateSemantics(state, day?.freeWindows.length ?? 0)}',
        child: state.isSelectable
            ? InkWell(
                borderRadius: BorderRadius.circular(SteepleTokens.radiusSm),
                onTap: () => widget.onSelectDay(date),
                child: content,
              )
            : content,
      ),
    );
  }
}
