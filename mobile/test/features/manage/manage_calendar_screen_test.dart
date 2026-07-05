import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:steeple_mobile/app/theme/theme.dart';
import 'package:steeple_mobile/core/fixtures/fixture_loader.dart';
import 'package:steeple_mobile/core/models/models.dart';
import 'package:steeple_mobile/core/widgets/widgets.dart';
import 'package:steeple_mobile/features/manage/presentation/manage_calendar_screen.dart';
import 'package:steeple_mobile/features/manage/providers.dart';

/// One managed venue, hand-built so `venues()` never spends this file's single
/// reliable `rootBundle` fixture load — that budget goes to `calendar()`.
/// Everything else re-dates `host_calendar.json` through the real fake.
class _OneVenueCalendarRepository extends FakeManageRepository {
  _OneVenueCalendarRepository({super.fixtures});

  @override
  Future<List<ManagedVenue>> venues() async => const [
        ManagedVenue(
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Grace Community Church',
          slug: 'grace-community-church',
        ),
      ];
}

/// Never resolves — for the loading-state assertion.
class _PendingCalendarRepository extends _OneVenueCalendarRepository {
  _PendingCalendarRepository({super.fixtures});

  @override
  Future<VenueCalendar> calendar(String venueId, {required String from, required String to}) =>
      Completer<VenueCalendar>().future;
}

Widget _wrap(ManageRepository repository) => ProviderScope(
      overrides: [manageRepositoryProvider.overrideWithValue(repository)],
      child: MaterialApp(
        theme: SteepleTheme.light(),
        home: const ManageCalendarScreen(),
      ),
    );

Future<void> _settle(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  testWidgets('loading shows a skeleton while the calendar resolves', (tester) async {
    await tester.pumpWidget(_wrap(_PendingCalendarRepository(
      fixtures: FixtureLoader(latency: Duration.zero),
    )));
    // Venues resolve (hand-built), calendar never does → skeleton persists.
    await _settle(tester);

    expect(find.byType(SkeletonList), findsWidgets);
  });

  testWidgets('renders the week agenda: confirmed items and a pending overlay', (tester) async {
    await tester.pumpWidget(_wrap(_OneVenueCalendarRepository(
      fixtures: FixtureLoader(latency: Duration.zero),
    )));
    await _settle(tester);

    expect(find.byType(ManageCalendarScreen), findsOneWidget);
    // Above the fold: early-week confirmed occurrences + a pending overlay from
    // the (re-dated) fixture, flagged with a Pending chip. Not the empty state.
    expect(find.text('Priya Patel'), findsWidgets);
    expect(find.text('Chen Wei'), findsOneWidget);
    expect(find.text('Pending'), findsWidgets);
    expect(find.text('No bookings this week'), findsNothing);

    // The agenda is a lazy list — scroll to a late-week booking to prove the
    // day grouping runs the full week.
    await tester.scrollUntilVisible(
      find.text('Vienna Youth Group'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Vienna Youth Group'), findsOneWidget);
  });
}
