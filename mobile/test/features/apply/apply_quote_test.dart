import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:steeple_mobile/app/theme/theme.dart';
import 'package:steeple_mobile/core/analytics/analytics_service.dart';
import 'package:steeple_mobile/core/api/app_error.dart';
import 'package:steeple_mobile/core/auth/session_manager.dart';
import 'package:steeple_mobile/core/auth/session_state.dart';
import 'package:steeple_mobile/core/fixtures/fixture_loader.dart';
import 'package:steeple_mobile/core/models/models.dart';
import 'package:steeple_mobile/features/apply/presentation/apply_screen.dart';
import 'package:steeple_mobile/features/apply/providers.dart';
import 'package:steeple_mobile/features/listing/providers.dart';
import 'package:steeple_mobile/features/profile/providers.dart';

class _Fixtures extends FixtureLoader {
  @override
  Future<T> load<T>(
    String name,
    T Function(Map<String, dynamic>) fromJson,
  ) async => fromJson(
    jsonDecode(File('test/fixtures/$name.json').readAsStringSync())
        as Map<String, dynamic>,
  );
}

class _Listing extends FakeListingRepository {
  _Listing(this.current) : super(fixtures: _Fixtures());
  RoomDetail current;
  @override
  Future<RoomDetail> bySlug(String venueSlug, String roomSlug) async => current;
}

class _Applications extends FakeApplicationsRepository {
  _Applications(this.listing) : super(fixtures: _Fixtures());
  final _Listing listing;
  final submitted = <ApplicationDraft>[];
  @override
  Future<Application> submit(
    String roomId,
    ApplicationDraft draft, {
    required String idempotencyKey,
    required String turnstileToken,
  }) async {
    submitted.add(draft);
    listing.current = listing.current.copyWith(
      pricePerHour: 60,
      houseRules: 'Updated rules for this room.',
    );
    throw AppError(
      kind: AppErrorKind.conflict,
      code: submitted.length == 1 ? 'quote_changed' : 'test_stop',
      retryable: false,
    );
  }
}

void main() {
  testWidgets(
    'changed terms require fresh visible review and a second explicit send',
    (tester) async {
      final fixtures = _Fixtures();
      final room = await fixtures.load('room_detail', RoomDetail.fromJson);
      final user = (await fixtures.load(
        'auth_session',
        AuthSession.fromJson,
      )).user;
      final listing = _Listing(room);
      final applications = _Applications(listing);
      final container = ProviderContainer(
        overrides: [
          listingRepositoryProvider.overrideWithValue(listing),
          applicationsRepositoryProvider.overrideWithValue(applications),
          profileRepositoryProvider.overrideWithValue(
            FakeProfileRepository(fixtures: fixtures),
          ),
          analyticsProvider.overrideWithValue(const DebugAnalyticsService()),
          sessionProvider.overrideWithValue(SignedIn(user)),
        ],
      );
      addTearDown(container.dispose);
      container
          .read(applyDraftProvider(room.roomId).notifier)
          .update(
            const ApplicationDraft(
              activityType: 'community',
              groupSize: 10,
              intentText: 'A community group meeting in the hall.',
              schedule: ProposedSchedule(
                frequency: 'oneOff',
                startDate: '2027-01-12',
                startTime: '09:00',
                endTime: '11:00',
              ),
            ),
          );
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp(
            theme: SteepleTheme.light(),
            home: ApplyScreen(
              venueSlug: room.venue.slug,
              roomSlug: room.roomSlug,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Review and send'));
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsOneWidget);
      expect(applications.submitted, isEmpty);
      await tester.tap(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.text('Send request'),
        ),
      );
      await tester.pumpAndSettle();
      expect(applications.submitted.single.quote?.pricePerHour, 45);
      expect(applications.submitted.single.quote?.houseRules, room.houseRules);
      expect(find.textContaining('Review the updated details'), findsOneWidget);
      await tester.pump(const Duration(seconds: 5));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Review and send'));
      await tester.pumpAndSettle();
      expect(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.text('Updated rules for this room.'),
        ),
        findsOneWidget,
      );
      expect(applications.submitted.length, 1);
      await tester.tap(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.text('Send request'),
        ),
      );
      await tester.pumpAndSettle();
      expect(applications.submitted.length, 2);
      expect(applications.submitted.last.quote?.pricePerHour, 60);
      expect(
        applications.submitted.last.quote?.houseRules,
        'Updated rules for this room.',
      );
      expect(tester.takeException(), isNull);
    },
  );
}
