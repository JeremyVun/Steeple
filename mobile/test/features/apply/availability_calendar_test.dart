import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:steeple_mobile/app/theme/theme.dart';
import 'package:steeple_mobile/core/models/models.dart';
import 'package:steeple_mobile/features/apply/presentation/availability_calendar.dart';

/// Themed, phone-width host matching the widgets test idiom.
Widget host(Widget child) => MaterialApp(
      theme: SteepleTheme.light(),
      home: Scaffold(
        body: SingleChildScrollView(
          child: Center(child: SizedBox(width: 360, child: child)),
        ),
      ),
    );

// A far-future window so no cell is ever "past"/"today" regardless of the
// machine clock the test runs under — day-state rendering stays deterministic.
// 2035-06-01 is a Friday.
const _openHours = [
  DayOpenHours(dayOfWeek: 'sunday'),
  DayOpenHours(dayOfWeek: 'monday', windows: [OpenWindow(startTime: '18:00', endTime: '21:00')]),
  DayOpenHours(dayOfWeek: 'tuesday', windows: [OpenWindow(startTime: '18:00', endTime: '21:00')]),
  DayOpenHours(dayOfWeek: 'wednesday', windows: [OpenWindow(startTime: '09:00', endTime: '12:00')]),
  DayOpenHours(dayOfWeek: 'thursday', windows: [OpenWindow(startTime: '18:00', endTime: '21:00')]),
  DayOpenHours(dayOfWeek: 'friday'),
  DayOpenHours(dayOfWeek: 'saturday', windows: [OpenWindow(startTime: '09:00', endTime: '17:00')]),
];

RoomAvailability _availability() => const RoomAvailability(
      roomId: 'r1',
      timezone: 'America/New_York',
      from: '2035-06-01',
      to: '2035-06-30',
      days: [
        // Fri 6/1 — open weekday, fully free.
        AvailabilityDay(date: '2035-06-01', freeWindows: [OpenWindow(startTime: '09:00', endTime: '17:00')]),
        // Sat 6/2 — open weekday, no windows left → booked out (not selectable).
        AvailabilityDay(date: '2035-06-02'),
        // Sun 6/3 — closed weekday (no open hours) → closed (not selectable).
        AvailabilityDay(date: '2035-06-03'),
        // Mon 6/4 — blackout → renders the "×" glyph, not selectable.
        AvailabilityDay(date: '2035-06-04', isBlackout: true),
        // Tue 6/5 — open 18–21 but only 19–21 free → partly booked (selectable).
        AvailabilityDay(date: '2035-06-05', freeWindows: [OpenWindow(startTime: '19:00', endTime: '21:00')]),
      ],
    );

void main() {
  group('AvailabilityCalendar day-state rendering (DESIGN_SYSTEM §8.10)', () {
    testWidgets('renders the anchored month, numbers, and the blackout glyph',
        (tester) async {
      await tester.pumpWidget(host(
        AvailabilityCalendar(
          availability: _availability(),
          openHours: _openHours,
          selectedDate: null,
          onSelectDay: (_) {},
        ),
      ));

      // Anchored to the feed's `from` month.
      expect(find.text('June 2035'), findsOneWidget);
      expect(find.text('1'), findsOneWidget);
      // Blackout day shows the "×" glyph rather than its number.
      expect(find.text('×'), findsOneWidget);
      expect(find.text('4'), findsNothing);
    });

    testWidgets('open/partly days are tappable, booked-out/closed/blackout are not',
        (tester) async {
      final tapped = <String>[];
      await tester.pumpWidget(host(
        AvailabilityCalendar(
          availability: _availability(),
          openHours: _openHours,
          selectedDate: null,
          onSelectDay: tapped.add,
        ),
      ));

      // Free day (6/1) selectable.
      await tester.tap(find.text('1'));
      // Partly-booked day (6/5) selectable.
      await tester.tap(find.text('5'));
      // Booked-out (6/2) and closed (6/3) are inert.
      await tester.tap(find.text('2'));
      await tester.tap(find.text('3'));
      await tester.pump();

      expect(tapped, ['2035-06-01', '2035-06-05']);
    });

    testWidgets('a selected day wins the highlight', (tester) async {
      await tester.pumpWidget(host(
        AvailabilityCalendar(
          availability: _availability(),
          openHours: _openHours,
          selectedDate: '2035-06-01',
          onSelectDay: (_) {},
        ),
      ));

      final hasSelected = tester
          .widgetList<Semantics>(
            find.ancestor(of: find.text('1'), matching: find.byType(Semantics)),
          )
          .any((s) => s.properties.selected == true);
      expect(hasSelected, isTrue);
    });
  });
}
