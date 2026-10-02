import 'dart:convert';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:steeple_mobile/app/theme/theme.dart';
import 'package:steeple_mobile/core/analytics/analytics_service.dart';
import 'package:steeple_mobile/core/fixtures/fixture_loader.dart';
import 'package:steeple_mobile/core/models/models.dart';
import 'package:steeple_mobile/core/widgets/widgets.dart';
import 'package:steeple_mobile/features/apply/presentation/apply_screen.dart';
import 'package:steeple_mobile/features/apply/providers.dart';
import 'package:steeple_mobile/features/inbox/application/application_thread_providers.dart';
import 'package:steeple_mobile/features/inbox/presentation/application_thread_screen.dart';
import 'package:steeple_mobile/features/listing/providers.dart';
import 'package:steeple_mobile/features/manage/application/manage_request_providers.dart';
import 'package:steeple_mobile/features/manage/presentation/manage_request_screen.dart';

class _HostRequest extends ManageRequestNotifier {
  _HostRequest(this.application) : super(application.id);
  final Application application;
  @override
  Future<Application> build() async => application;
}

class _GuestRequest extends ApplicationThreadNotifier {
  _GuestRequest(this.application) : super(application.id);
  final Application application;
  @override
  Future<Application> build() async => application;
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('saved and legacy request terms on native guest and host screens', (
    tester,
  ) async {
    final fixture = await FixtureLoader(
      latency: Duration.zero,
    ).load('application', Application.fromJson);
    final captureKey = GlobalKey();
    Future<void> capture(String name) async {
      await tester.pumpAndSettle();
      final boundary =
          captureKey.currentContext!.findRenderObject()!
              as RenderRepaintBoundary;
      final image = await boundary.toImage(pixelRatio: 2);
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      if (const bool.fromEnvironment('STEEPLE_CAPTURE')) {
        // ignore: avoid_print
        print(
          'NATIVE_SCREENSHOT=$name:${base64Encode(bytes!.buffer.asUint8List())}',
        );
      }
      image.dispose();
    }

    for (final host in [true, false]) {
      for (final legacy in [false, true]) {
        final app = fixture.copyWith(
          status: 'pending',
          bookingId: null,
          quote: legacy ? null : fixture.quote,
        );
        await tester.pumpWidget(
          ProviderScope(
            key: UniqueKey(),
            overrides: [
              manageRequestProvider(
                app.id,
              ).overrideWith(() => _HostRequest(app)),
              applicationThreadProvider(
                app.id,
              ).overrideWith(() => _GuestRequest(app)),
            ],
            child: RepaintBoundary(
              key: captureKey,
              child: MaterialApp(
                theme: SteepleTheme.light(),
                home: host
                    ? ManageRequestScreen(applicationId: app.id)
                    : ApplicationThreadScreen(applicationId: app.id),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.byType(BookingTerms));
        await capture(
          '${host ? 'host' : 'guest'}-${legacy ? 'legacy' : 'saved'}',
        );
        if (host && legacy) {
          await tester.scrollUntilVisible(
            find.text('Approve'),
            200,
            scrollable: find.byType(Scrollable).first,
          );
          expect(
            tester
                .widget<FilledButton>(
                  find.widgetWithText(FilledButton, 'Approve'),
                )
                .onPressed,
            isNull,
          );
        }
        expect(tester.takeException(), isNull);
      }
    }
    final room = await FixtureLoader(
      latency: Duration.zero,
    ).load('room_detail', RoomDetail.fromJson);
    final container = ProviderContainer(
      overrides: [
        listingRepositoryProvider.overrideWithValue(
          FakeListingRepository(
            fixtures: FixtureLoader(latency: Duration.zero),
          ),
        ),
        analyticsProvider.overrideWithValue(const DebugAnalyticsService()),
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
        child: RepaintBoundary(
          key: captureKey,
          child: MaterialApp(
            theme: SteepleTheme.light(),
            home: ApplyScreen(
              venueSlug: room.venue.slug,
              roomSlug: room.roomSlug,
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Review and send'));
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsOneWidget);
    await capture('apply-review');
    expect(tester.takeException(), isNull);
  });
}
