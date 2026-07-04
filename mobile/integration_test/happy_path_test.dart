import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:steeple_mobile/app/bootstrap.dart';
import 'package:steeple_mobile/app/env_config.dart';
import 'package:steeple_mobile/core/analytics/analytics_service.dart';
import 'package:steeple_mobile/core/auth/fake_session_manager.dart';
import 'package:steeple_mobile/core/auth/session_manager.dart';
import 'package:steeple_mobile/core/flags/flags_service.dart';
import 'package:steeple_mobile/core/widgets/widgets.dart';

/// The one happy-path E2E (MOBILE_DESIGN §7): launch → browse → open detail →
/// start apply (mock SSO via FakeSessionManager). Runs on a simulator/emulator
/// before each release: `flutter test integration_test`.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('browse → detail → start apply', (tester) async {
    final env = EnvConfig(
      env: SteepleEnv.dev,
      apiBaseUrl: Uri.parse('http://unused.localhost'), // fakes never touch the network
      sentryDsn: null,
      useFakes: true,
      canonicalWebHost: 'steeple.example',
      buildNumber: 1,
    );

    final session = FakeSessionManager();
    await session.restore();

    final container = ProviderContainer(
      overrides: [
        envProvider.overrideWithValue(env),
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
    await tester.pumpAndSettle(const Duration(seconds: 2));

    // Explore renders fixture results.
    expect(find.text('Find a space'), findsOneWidget);
    expect(find.byType(ListingCard), findsWidgets);

    // Open the first listing.
    await tester.tap(find.byType(ListingCard).first);
    await tester.pumpAndSettle(const Duration(seconds: 2));
    expect(find.text('Ask to book'), findsWidgets);

    // Start the application.
    await tester.tap(find.widgetWithText(FilledButton, 'Ask to book'));
    await tester.pumpAndSettle(const Duration(seconds: 2));
    expect(find.textContaining('Ask '), findsWidgets);
    expect(find.textContaining('Tell them about your group'), findsOneWidget);
  });
}
