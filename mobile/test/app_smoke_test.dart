import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:steeple_mobile/app/bootstrap.dart';
import 'package:steeple_mobile/app/env_config.dart';
import 'package:steeple_mobile/core/analytics/analytics_service.dart';
import 'package:steeple_mobile/core/auth/fake_session_manager.dart';
import 'package:steeple_mobile/core/auth/session_manager.dart';
import 'package:steeple_mobile/core/flags/flags_service.dart';
import 'package:steeple_mobile/core/widgets/widgets.dart';

/// Headless twin of `integration_test/happy_path_test.dart`: boots the whole
/// app in fakes mode and walks browse → detail. Runs in plain `flutter test`,
/// so contract drift in bootstrap/router/fakes breaks CI, not the demo.
void main() {
  testWidgets('app boots with fakes: explore renders and detail opens', (tester) async {
    final session = FakeSessionManager();
    await session.restore();

    final container = ProviderContainer(
      overrides: [
        envProvider.overrideWithValue(
          EnvConfig(
            env: SteepleEnv.dev,
            apiBaseUrl: Uri.parse('http://unused.localhost'),
            sentryDsn: null,
            useFakes: true,
            canonicalWebHost: 'steeple.example',
            buildNumber: 1,
          ),
        ),
        sessionManagerProvider.overrideWithValue(session),
        analyticsProvider.overrideWithValue(const DebugAnalyticsService()),
        flagsProvider.overrideWith((ref) => FakeFlagsService()),
        ...fakeRepositoryOverrides,
      ],
    );
    addTearDown(container.dispose);

    await tester.pumpWidget(
      UncontrolledProviderScope(container: container, child: const SteepleApp()),
    );
    // Fake latency is 300ms; give the first search a moment.
    await tester.pump(const Duration(milliseconds: 600));
    await tester.pumpAndSettle();

    expect(find.text('Find a space'), findsOneWidget);
    expect(find.byType(ListingCard), findsWidgets);

    await tester.tap(find.byType(ListingCard).first);
    await tester.pump(const Duration(milliseconds: 600));
    await tester.pumpAndSettle();

    expect(find.text('Ask to book'), findsOneWidget);
  });
}
