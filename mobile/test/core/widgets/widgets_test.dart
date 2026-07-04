import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:steeple_mobile/app/theme/theme.dart';
import 'package:steeple_mobile/core/api/app_error.dart';
import 'package:steeple_mobile/core/models/models.dart';
import 'package:steeple_mobile/core/widgets/widgets.dart';

/// Hosts the widget the way features do: themed, phone-width, scrollable —
/// a bare 800×600 Center makes the 4:3 card photo overflow artificially.
Widget host(Widget child) => MaterialApp(
      theme: SteepleTheme.light(),
      home: Scaffold(
        body: SingleChildScrollView(
          child: Center(child: SizedBox(width: 360, child: child)),
        ),
      ),
    );

void main() {
  group('StatusChip (DESIGN_SYSTEM §8.4)', () {
    testWidgets('maps known tokens per domain', (tester) async {
      await tester.pumpWidget(host(const Column(
        children: [
          StatusChip(statusRaw: 'pending', domain: StatusDomain.application),
          StatusChip(statusRaw: 'confirmed', domain: StatusDomain.booking),
          StatusChip(statusRaw: 'noShow', domain: StatusDomain.occurrence),
          StatusChip(statusRaw: 'occurred', domain: StatusDomain.occurrence),
        ],
      )));
      expect(find.text('Pending'), findsOneWidget);
      expect(find.text('Confirmed'), findsOneWidget);
      expect(find.text('No-show'), findsOneWidget);
      expect(find.text('Went ahead'), findsOneWidget);
    });

    testWidgets('unknown token renders humanized, never crashes', (tester) async {
      await tester.pumpWidget(host(
        const StatusChip(statusRaw: 'pendingReview', domain: StatusDomain.application),
      ));
      expect(find.text('Pending review'), findsOneWidget);
    });
  });

  group('ListingCard (DESIGN_SYSTEM §8.5)', () {
    RoomSummary summary({bool isFree = true, List<String> activities = const []}) =>
        RoomSummary(
          roomId: 'r1',
          venueId: 'v1',
          roomSlug: 'main-hall',
          venueSlug: 'st-andrews',
          venueName: "St. Andrew's",
          suburb: 'Vienna',
          roomName: 'Main Hall',
          capacity: 60,
          isFree: isFree,
          pricePerHour: isFree ? null : 25,
          currency: 'USD',
          latitude: 38.9,
          longitude: -77.26,
          activities: activities,
        );

    testWidgets('free listing shows the FREE badge and anatomy', (tester) async {
      await tester.pumpWidget(host(ListingCard(summary: summary())));
      expect(find.text('FREE'), findsOneWidget);
      expect(find.text('Main Hall'), findsOneWidget);
      expect(find.text("St. Andrew's · Vienna"), findsOneWidget);
      expect(find.textContaining('60'), findsWidgets);
    });

    testWidgets('paid listing shows the price badge', (tester) async {
      await tester.pumpWidget(host(ListingCard(summary: summary(isFree: false))));
      expect(find.text(r'$25/hr'), findsOneWidget);
      expect(find.text('FREE'), findsNothing);
    });

    testWidgets('tags cap at 3 with an overflow chip', (tester) async {
      await tester.pumpWidget(host(ListingCard(
        summary: summary(
          activities: const ['children', 'sports', 'community', 'music', 'arts'],
        ),
      )));
      expect(find.text('+2'), findsOneWidget);
    });

    testWidgets('whole card carries one semantic label', (tester) async {
      final handle = tester.ensureSemantics();
      await tester.pumpWidget(host(ListingCard(summary: summary(), onTap: () {})));
      expect(
        find.bySemanticsLabel("Main Hall, St. Andrew's, free, seats 60"),
        findsOneWidget,
      );
      handle.dispose();
    });
  });

  group('ErrorView (§8.7)', () {
    testWidgets('retryable error shows Try again; copy has no codes', (tester) async {
      var retried = false;
      await tester.pumpWidget(host(ErrorView(
        error: const AppError(kind: AppErrorKind.network, retryable: true, code: 'x_y'),
        onRetry: () => retried = true,
      )));
      expect(find.text('Try again'), findsOneWidget);
      expect(find.textContaining('x_y'), findsNothing);
      await tester.tap(find.text('Try again'));
      expect(retried, isTrue);
    });

    testWidgets('notFound reads as "no longer available", no retry', (tester) async {
      await tester.pumpWidget(host(ErrorView(
        error: const AppError(kind: AppErrorKind.notFound, retryable: false),
        onRetry: () {},
      )));
      expect(find.text('No longer available'), findsOneWidget);
      expect(find.text('Try again'), findsNothing);
    });
  });

  group('EmptyState (§8.7)', () {
    testWidgets('renders icon, serif title, body, action', (tester) async {
      await tester.pumpWidget(host(EmptyState(
        icon: Icons.search_off_rounded,
        title: 'No spaces here yet',
        body: 'Widen your search area.',
        action: OutlinedButton(onPressed: () {}, child: const Text('Clear filters')),
      )));
      expect(find.text('No spaces here yet'), findsOneWidget);
      expect(find.text('Widen your search area.'), findsOneWidget);
      expect(find.text('Clear filters'), findsOneWidget);
    });
  });
}
