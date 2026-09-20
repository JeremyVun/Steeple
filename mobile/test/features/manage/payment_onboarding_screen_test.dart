import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:steeple_mobile/app/theme/theme.dart';
import 'package:steeple_mobile/core/analytics/analytics_service.dart';
import 'package:steeple_mobile/core/api/app_error.dart';
import 'package:steeple_mobile/core/auth/session_manager.dart';
import 'package:steeple_mobile/core/auth/session_state.dart';
import 'package:steeple_mobile/core/models/models.dart';
import 'package:steeple_mobile/core/utils/payment_link_launcher.dart';
import 'package:steeple_mobile/core/widgets/widgets.dart';
import 'package:steeple_mobile/features/manage/presentation/payment_onboarding_screen.dart';
import 'package:steeple_mobile/features/manage/providers.dart';

const _venueId = '11111111-1111-4111-8111-111111111111';

const _ready = VenuePaymentState(
  onboardingStarted: true,
  detailsSubmitted: true,
  chargesEnabled: true,
  payoutsEnabled: true,
  optedIn: false,
  mock: false,
  status: 'ready',
  testMode: true,
  canOpenDashboard: true,
  onlinePaymentsAvailable: false,
);

class _PaymentRepository implements PaymentRepository {
  _PaymentRepository(this.current);

  VenuePaymentState current;
  int stateCalls = 0;
  int optInCalls = 0;

  @override
  Future<VenuePaymentState> state(String venueId) async {
    stateCalls++;
    return current;
  }

  @override
  Future<PaymentExternalLink> startOnboarding(String venueId) async =>
      const PaymentExternalLink(
        url: 'https://connect.stripe.com/setup/test',
        mock: false,
      );

  @override
  Future<VenuePaymentState> setOptIn(
    String venueId, {
    required bool optedIn,
  }) async {
    optInCalls++;
    current = current.copyWith(optedIn: optedIn);
    return current;
  }

  @override
  Future<PaymentExternalLink> dashboard(String venueId) async =>
      const PaymentExternalLink(
        url: 'https://connect.stripe.com/express/test',
        mock: false,
      );
}

class _PendingPaymentRepository extends _PaymentRepository {
  _PendingPaymentRepository() : super(_ready);

  @override
  Future<VenuePaymentState> state(String venueId) =>
      Completer<VenuePaymentState>().future;
}

class _DelayedLinkRepository extends _PaymentRepository {
  _DelayedLinkRepository() : super(_ready.copyWith(status: 'incomplete'));
  final link = Completer<PaymentExternalLink>();

  @override
  Future<PaymentExternalLink> startOnboarding(String venueId) => link.future;
}

class _FailingPaymentRepository extends _PaymentRepository {
  _FailingPaymentRepository() : super(_ready);

  @override
  Future<VenuePaymentState> state(String venueId) async =>
      throw const AppError(kind: AppErrorKind.network, retryable: true);
}

Widget _wrap(PaymentRepository repository, {ExternalUrlOpen? open}) =>
    ProviderScope(
      key: ValueKey(repository),
      overrides: [
        analyticsProvider.overrideWithValue(const DebugAnalyticsService()),
        sessionProvider.overrideWithValue(
          SignedIn(
            UserProfile(
              id: 'host',
              displayName: 'Host',
              createdAtUtc: DateTime.utc(2026),
            ),
          ),
        ),
        paymentRepositoryProvider.overrideWithValue(repository),
        paymentLinkLauncherProvider.overrideWithValue(
          PaymentLinkLauncher(open: open ?? (uri) async => true),
        ),
      ],
      child: MaterialApp(
        theme: SteepleTheme.light(),
        home: const PaymentOnboardingScreen(venueId: _venueId),
      ),
    );

Future<void> _settle(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  testWidgets('shows loading while the state resolves', (tester) async {
    await tester.pumpWidget(_wrap(_PendingPaymentRepository()));
    await tester.pump();
    expect(find.byType(SkeletonList), findsOneWidget);
  });

  testWidgets('shows retryable errors', (tester) async {
    await tester.pumpWidget(_wrap(_FailingPaymentRepository()));
    await _settle(tester);
    expect(find.byType(ErrorView), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
  });

  testWidgets('ready state offers an honest future preference', (tester) async {
    final repository = _PaymentRepository(_ready);
    await tester.pumpWidget(_wrap(repository));
    await _settle(tester);

    expect(find.text('Payout setup is ready'), findsOneWidget);
    expect(find.text('Ready'), findsOneWidget);
    expect(find.text('Stripe test mode'), findsOneWidget);
    expect(find.text('Use online payments when available'), findsOneWidget);
    expect(
      find.text(
        'This saves your preference for a future release. Steeple does not accept online booking payments yet.',
      ),
      findsOneWidget,
    );
    expect(find.byKey(const Key('payment-onboarding-action')), findsNothing);

    await tester.tap(find.byKey(const Key('payment-opt-in')));
    await _settle(tester);

    expect(repository.optInCalls, 1);
    expect(repository.current.optedIn, isTrue);
    expect(find.text('Online payment preference saved.'), findsOneWidget);

    await tester.tap(find.byKey(const Key('payment-opt-in')));
    await _settle(tester);

    expect(repository.optInCalls, 2);
    expect(repository.current.optedIn, isFalse);
  });

  testWidgets('onboarding opens a safe Stripe URL externally', (tester) async {
    Uri? opened;
    final repository = _PaymentRepository(
      _ready.copyWith(
        onboardingStarted: true,
        detailsSubmitted: false,
        chargesEnabled: false,
        payoutsEnabled: false,
        status: 'incomplete',
        canOpenDashboard: false,
      ),
    );
    await tester.pumpWidget(
      _wrap(
        repository,
        open: (uri) async {
          opened = uri;
          return true;
        },
      ),
    );
    await _settle(tester);

    expect(find.text('Finish setting up payouts'), findsOneWidget);
    expect(find.textContaining('Return to Steeple'), findsOneWidget);
    expect(find.byKey(const Key('payment-opt-in')), findsNothing);
    await tester.tap(find.byKey(const Key('payment-onboarding-action')));
    await _settle(tester);

    expect(opened, Uri.parse('https://connect.stripe.com/setup/test'));
  });

  testWidgets('refreshes payment readiness when the app resumes', (
    tester,
  ) async {
    final repository = _PaymentRepository(_ready);
    await tester.pumpWidget(_wrap(repository));
    await _settle(tester);
    expect(repository.stateCalls, 1);

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await _settle(tester);

    expect(repository.stateCalls, 2);
  });

  testWidgets('an opted-in restricted account can opt out', (tester) async {
    final repository = _PaymentRepository(
      _ready.copyWith(
        status: 'restricted',
        optedIn: true,
        payoutsEnabled: false,
      ),
    );
    await tester.pumpWidget(_wrap(repository));
    await _settle(tester);
    await tester.ensureVisible(find.byKey(const Key('payment-opt-in')));
    await tester.tap(find.byKey(const Key('payment-opt-in')));
    await _settle(tester);
    expect(repository.current.optedIn, isFalse);
    expect(find.byKey(const Key('payment-opt-in')), findsNothing);
  });

  testWidgets(
    'a delayed onboarding link cannot open after leaving the screen',
    (tester) async {
      final repository = _DelayedLinkRepository();
      var opened = false;
      await tester.pumpWidget(
        _wrap(
          repository,
          open: (_) async {
            opened = true;
            return true;
          },
        ),
      );
      await _settle(tester);
      await tester.tap(find.byKey(const Key('payment-onboarding-action')));
      await tester.pump();
      await tester.pumpWidget(const SizedBox());
      repository.link.complete(
        const PaymentExternalLink(
          url: 'https://connect.stripe.com/setup/test',
          mock: false,
        ),
      );
      await _settle(tester);
      expect(opened, isFalse);
      expect(tester.takeException(), isNull);
    },
  );
}
