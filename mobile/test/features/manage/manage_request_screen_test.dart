import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:steeple_mobile/app/theme/theme.dart';
import 'package:steeple_mobile/core/api/app_error.dart';
import 'package:steeple_mobile/core/fixtures/fixture_loader.dart';
import 'package:steeple_mobile/core/models/models.dart';
import 'package:steeple_mobile/core/widgets/widgets.dart';
import 'package:steeple_mobile/features/manage/presentation/manage_request_screen.dart';
import 'package:steeple_mobile/features/manage/providers.dart';

/// From `test/fixtures/manage_applications_page.json` — the pending
/// (actionable) application.
const _pendingId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

/// Never resolves — mirrors `_PendingBookingsRepository`/`_PendingInboxRepository`.
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
  Future<Paged<Application>> applications({String? status, int page = 1}) =>
      Completer<Paged<Application>>().future;

  @override
  Future<Application> decide(String id, {required bool approve, String? message}) =>
      Completer<Application>().future;
}

Widget _wrap(ManageRepository repository) => ProviderScope(
      overrides: [manageRepositoryProvider.overrideWithValue(repository)],
      child: MaterialApp(
        theme: SteepleTheme.light(),
        home: const ManageRequestScreen(applicationId: _pendingId),
      ),
    );

/// `Skeleton`'s shimmer repeats forever (DESIGN_SYSTEM §8.7), so
/// `pumpAndSettle()` never converges while it's on screen. A couple of
/// bounded pumps is enough to drain an already-resolved fixture future
/// without waiting on the animation.
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

  testWidgets('error shows ErrorView with a retry action', (tester) async {
    final repo = FakeManageRepository(fixtures: FixtureLoader(latency: Duration.zero));
    repo.fixtures.nextError = const AppError(kind: AppErrorKind.server, retryable: true);

    await tester.pumpWidget(_wrap(repo));
    await _settle(tester);

    expect(find.byType(ErrorView), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
  });

  // The only test in this file that loads a real fixture through
  // `FakeManageRepository` — deliberately the sole one, mirroring
  // `bookings_screen_test.dart`/`inbox_screen_test.dart`: this environment's
  // `rootBundle` asset channel only serves one real load per test file
  // reliably, so every other state above uses a hand-rolled/never-resolving
  // repository instead of a second real fixture read.
  testWidgets('a pending request shows its detail and the approve flow works', (tester) async {
    final repo = FakeManageRepository(fixtures: FixtureLoader(latency: Duration.zero));

    await tester.pumpWidget(_wrap(repo));
    await _settle(tester);

    expect(find.text('Approve'), findsOneWidget);
    expect(find.text('Decline'), findsOneWidget);
    // From the fixture (manage_applications_page.json): the pending item.
    expect(find.text('Pending'), findsOneWidget);
    expect(find.text('Fellowship Hall'), findsWidgets);
    expect(find.text('Marcus Lee · Group of 40 · Community'), findsOneWidget);

    await tester.tap(find.text('Approve'));
    await tester.pumpAndSettle();

    // Confirm dialog appears.
    expect(find.byType(AlertDialog), findsOneWidget);
    expect(find.text('Approve this application?'), findsOneWidget);

    // Confirm — the dialog's own Approve button (the form's Approve button
    // is still on screen behind the dialog, so scope to the dialog).
    await tester.tap(
      find.descendant(of: find.byType(AlertDialog), matching: find.text('Approve')),
    );
    await _settle(tester);
    await tester.pumpAndSettle();

    expect(find.byType(AlertDialog), findsNothing);
    expect(find.text('Approved'), findsOneWidget);
    expect(find.text('Application approved.'), findsOneWidget);
    // Once decided, the action buttons go away.
    expect(find.text('Decline'), findsNothing);
  });
}
