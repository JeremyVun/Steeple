import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:steeple_mobile/app/theme/theme.dart';
import 'package:steeple_mobile/core/fixtures/fixture_loader.dart';
import 'package:steeple_mobile/core/models/models.dart';
import 'package:steeple_mobile/core/widgets/widgets.dart';
import 'package:steeple_mobile/features/manage/presentation/manage_room_hours_screen.dart';
import 'package:steeple_mobile/features/manage/providers.dart';

const _roomId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

/// Never resolves — for the loading-state assertion (mirrors
/// `manage_request_screen_test.dart`'s `_PendingManageRepository`).
class _PendingManageRepository implements ManageRepository {
  @override
  Future<List<ManagedVenue>> venues() => Completer<List<ManagedVenue>>().future;

  @override
  Future<ManagedVenueDetail> venue(String id) => Completer<ManagedVenueDetail>().future;

  @override
  Future<ManagedRoom> room(String id) => Completer<ManagedRoom>().future;

  @override
  Future<ManagedRoom> saveRoom(String id, ManagedRoomPatch patch) =>
      Completer<ManagedRoom>().future;

  @override
  Future<RoomAvailabilityRules> openHours(String roomId) =>
      Completer<RoomAvailabilityRules>().future;

  @override
  Future<RoomAvailabilityRules> saveOpenHours(String roomId, RoomAvailabilityRules rules) =>
      Completer<RoomAvailabilityRules>().future;

  @override
  Future<Paged<Application>> applications({String? status, int page = 1}) =>
      Completer<Paged<Application>>().future;

  @override
  Future<VenueCalendar> calendar(String venueId, {required String from, required String to}) =>
      Completer<VenueCalendar>().future;

  @override
  Future<Application> decide(String id, {required bool approve, String? message}) =>
      Completer<Application>().future;

  @override
  Future<Application> counterOffer(String id, ProposedSchedule schedule, {String? message}) =>
      Completer<Application>().future;
}

Widget _wrap(ManageRepository repository) => ProviderScope(
      overrides: [manageRepositoryProvider.overrideWithValue(repository)],
      child: MaterialApp(
        theme: SteepleTheme.light(),
        home: const ManageRoomHoursScreen(roomId: _roomId),
      ),
    );

Future<void> _settle(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  testWidgets('loading shows the skeleton', (tester) async {
    await tester.pumpWidget(_wrap(_PendingManageRepository()));
    await tester.pump();

    expect(find.byType(Skeleton), findsOneWidget);
  });

  testWidgets('renders the loaded rules: seven days, presets, blackouts', (tester) async {
    final repo = FakeManageRepository(fixtures: FixtureLoader(latency: Duration.zero));

    await tester.pumpWidget(_wrap(repo));
    await _settle(tester);

    // Weekday rows render Sunday-first; Monday is above the fold.
    expect(find.text('Sunday'), findsOneWidget);
    expect(find.text('Monday'), findsOneWidget);
    // Closed days label (Sunday is closed in the fixture).
    expect(find.text('Closed'), findsWidgets);
    // Preset quick-fill chips.
    expect(find.text('Weekday evenings 6–9 PM'), findsOneWidget);
    expect(find.text('Open 8–9 daily'), findsOneWidget);

    // The blackout section and Save action are below the fold — scroll to them.
    await tester.scrollUntilVisible(find.text('Save'), 300);
    expect(find.text('Save'), findsOneWidget);
    expect(find.text('2026-12-25'), findsOneWidget);
    expect(find.text('Christmas Eve service'), findsOneWidget);
  });
}
