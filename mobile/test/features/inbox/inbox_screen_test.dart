import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:steeple_mobile/app/theme/theme.dart';
import 'package:steeple_mobile/core/api/app_error.dart';
import 'package:steeple_mobile/core/fixtures/fixture_loader.dart';
import 'package:steeple_mobile/core/models/models.dart';
import 'package:steeple_mobile/core/widgets/widgets.dart';
import 'package:steeple_mobile/features/inbox/presentation/inbox_screen.dart';
import 'package:steeple_mobile/features/inbox/providers.dart';

/// Never resolves — no `Timer` involved (unlike `Future.delayed`), so it
/// leaves nothing pending for `flutter_test` to complain about at teardown.
class _PendingInboxRepository implements InboxRepository {
  @override
  Future<CursorPage<AppNotification>> list({String? after}) =>
      Completer<CursorPage<AppNotification>>().future;

  @override
  Future<void> markRead(List<String> ids) async {}
}

class _EmptyInboxRepository implements InboxRepository {
  @override
  Future<CursorPage<AppNotification>> list({String? after}) async => const CursorPage(items: []);

  @override
  Future<void> markRead(List<String> ids) async {}
}

Widget _wrap(InboxRepository repository) => ProviderScope(
      overrides: [inboxRepositoryProvider.overrideWithValue(repository)],
      child: MaterialApp(
        theme: SteepleTheme.light(),
        home: const InboxScreen(),
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
    await tester.pumpWidget(_wrap(_PendingInboxRepository()));
    await tester.pump();

    expect(find.byType(SkeletonList), findsOneWidget);
  });

  testWidgets('error shows ErrorView with a retry action', (tester) async {
    final repo = FakeInboxRepository(fixtures: FixtureLoader(latency: Duration.zero));
    repo.fixtures.nextError = const AppError(kind: AppErrorKind.server, retryable: true);

    await tester.pumpWidget(_wrap(repo));
    await _settle(tester);

    expect(find.byType(ErrorView), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
  });

  testWidgets('empty shows the empty state', (tester) async {
    await tester.pumpWidget(_wrap(_EmptyInboxRepository()));
    await _settle(tester);

    expect(find.byType(EmptyState), findsOneWidget);
    expect(find.text('Nothing yet'), findsOneWidget);
  });

  testWidgets('data shows the notification rows', (tester) async {
    final repo = FakeInboxRepository(fixtures: FixtureLoader(latency: Duration.zero));

    await tester.pumpWidget(_wrap(repo));
    await _settle(tester);

    expect(find.text('Nothing yet'), findsNothing);
    // From test/fixtures/notifications_page.json (Grace Community Church).
    expect(find.textContaining('approved your application'), findsOneWidget);
    expect(find.textContaining('sent you a message'), findsOneWidget);
    expect(find.textContaining('ending soon'), findsOneWidget);
    expect(find.textContaining('was cancelled'), findsOneWidget);
  });
}
