import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:steeple_mobile/app/theme/theme.dart';
import 'package:steeple_mobile/core/maps/maps_capability.dart';
import 'package:steeple_mobile/core/widgets/widgets.dart';
import 'package:steeple_mobile/features/discovery/presentation/map_view.dart';

Widget _wrap({bool? mapsAvailable}) => ProviderScope(
      overrides: [
        if (mapsAvailable != null)
          mapsAvailableProvider.overrideWith((ref) async => mapsAvailable),
      ],
      child: MaterialApp(
        theme: SteepleTheme.light(),
        home: const Scaffold(body: DiscoveryMapView()),
      ),
    );

void main() {
  testWidgets('no maps key shows the placeholder instead of a GoogleMap', (tester) async {
    await tester.pumpWidget(_wrap(mapsAvailable: false));
    await tester.pump();

    expect(find.byType(EmptyState), findsOneWidget);
    expect(find.text('Map unavailable'), findsOneWidget);
  });

  testWidgets('unanswered platform channel counts as no key (never mounts a map)',
      (tester) async {
    // No override: the real MethodChannel has no host handler under
    // flutter_test (the call never completes), which must resolve to
    // "unavailable" via the provider's timeout, not hang or crash.
    await tester.pumpWidget(_wrap());
    await tester.pump(const Duration(seconds: 3));
    await tester.pump();

    expect(find.byType(EmptyState), findsOneWidget);
  });
}
