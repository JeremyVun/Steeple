import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:steeple_mobile/app/theme/theme.dart';
import 'package:steeple_mobile/core/api/app_error.dart';
import 'package:steeple_mobile/core/fixtures/fixture_loader.dart';
import 'package:steeple_mobile/core/models/models.dart';
import 'package:steeple_mobile/core/widgets/widgets.dart';
import 'package:steeple_mobile/features/bookings/presentation/bookings_screen.dart';
import 'package:steeple_mobile/features/bookings/providers.dart';

/// Never resolves — no `Timer` involved (unlike `Future.delayed`), so it
/// leaves nothing pending for `flutter_test` to complain about at teardown.
class _PendingBookingsRepository implements BookingsRepository {
  @override
  Future<Paged<Booking>> mine({int page = 1}) => Completer<Paged<Booking>>().future;

  @override
  Future<Booking> byId(String id) => Completer<Booking>().future;

  @override
  Future<Booking> cancel(String id, {String? reason}) => Completer<Booking>().future;

  @override
  Future<void> markNoShow(String occurrenceId) async {}

  @override
  Future<void> rate(String bookingId, {required int stars, String? comment}) async {}
}

class _EmptyBookingsRepository implements BookingsRepository {
  @override
  Future<Paged<Booking>> mine({int page = 1}) async =>
      const Paged(items: [], totalCount: 0, page: 1, pageSize: 24);

  @override
  Future<Booking> byId(String id) => throw UnimplementedError();

  @override
  Future<Booking> cancel(String id, {String? reason}) => throw UnimplementedError();

  @override
  Future<void> markNoShow(String occurrenceId) async {}

  @override
  Future<void> rate(String bookingId, {required int stars, String? comment}) async {}
}

Widget _wrap(BookingsRepository repository) => ProviderScope(
      overrides: [bookingsRepositoryProvider.overrideWithValue(repository)],
      child: MaterialApp(
        theme: SteepleTheme.light(),
        home: const BookingsScreen(),
      ),
    );

/// `SkeletonList`'s shimmer repeats forever (by design — DESIGN_SYSTEM
/// §8.7), so `pumpAndSettle()` never converges while it's on screen. A
/// couple of bounded pumps is enough to drain the (already-resolved) fixture
/// future without waiting on the animation.
Future<void> _settle(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  testWidgets('loading shows the skeleton list', (tester) async {
    await tester.pumpWidget(_wrap(_PendingBookingsRepository()));
    await tester.pump();

    expect(find.byType(SkeletonList), findsOneWidget);
  });

  testWidgets('error shows ErrorView with a retry action', (tester) async {
    final repo = FakeBookingsRepository(fixtures: FixtureLoader(latency: Duration.zero));
    repo.fixtures.nextError = const AppError(kind: AppErrorKind.server, retryable: true);

    await tester.pumpWidget(_wrap(repo));
    await _settle(tester);

    expect(find.byType(ErrorView), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
  });

  testWidgets('empty shows the empty state', (tester) async {
    await tester.pumpWidget(_wrap(_EmptyBookingsRepository()));
    await _settle(tester);

    expect(find.byType(EmptyState), findsOneWidget);
    expect(find.text('No bookings yet'), findsOneWidget);
    expect(find.text('Find a space'), findsOneWidget);
  });

  testWidgets('data shows the booking card', (tester) async {
    final repo = FakeBookingsRepository(fixtures: FixtureLoader(latency: Duration.zero));

    await tester.pumpWidget(_wrap(repo));
    await _settle(tester);

    expect(find.text('No bookings yet'), findsNothing);
    // From test/fixtures/booking.json.
    expect(find.text('Sunday School Annex'), findsOneWidget);
    expect(find.text('Grace Community Church'), findsOneWidget);
  });
}
