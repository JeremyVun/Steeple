import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:steeple_mobile/app/theme/theme.dart';
import 'package:steeple_mobile/core/models/models.dart';
import 'package:steeple_mobile/features/inbox/presentation/widgets/counter_offer_card.dart';

Application _counterApplication() {
  final raw = File('test/fixtures/application_counter_offer.json').readAsStringSync();
  return Application.fromJson(jsonDecode(raw) as Map<String, dynamic>);
}

Widget _wrap(Widget child) => MaterialApp(
      theme: SteepleTheme.light(),
      home: Scaffold(body: child),
    );

void main() {
  testWidgets('renders the requested vs offered diff and both actions', (tester) async {
    final application = _counterApplication();
    var accepted = false;
    var declined = false;

    await tester.pumpWidget(_wrap(
      CounterOfferCard(
        requested: application.schedule,
        offer: application.counterOffer!,
        onAccept: () => accepted = true,
        onDecline: () => declined = true,
      ),
    ));

    // Both schedules are shown (requested Tuesday, offered Thursday), plus the
    // quoted manager note.
    expect(find.text('You asked'.toUpperCase()), findsOneWidget);
    expect(find.text('They suggest'.toUpperCase()), findsOneWidget);
    expect(find.textContaining('Tuesdays'), findsOneWidget);
    expect(find.textContaining('Thursdays'), findsOneWidget);
    expect(find.textContaining('half an hour later'), findsOneWidget);

    await tester.tap(find.text('Accept'));
    await tester.tap(find.text('Decline'));
    expect(accepted, isTrue);
    expect(declined, isTrue);
  });

  testWidgets('busy disables the actions', (tester) async {
    final application = _counterApplication();

    await tester.pumpWidget(_wrap(
      CounterOfferCard(
        requested: application.schedule,
        offer: application.counterOffer!,
        busy: true,
        onAccept: () {},
        onDecline: () {},
      ),
    ));

    final accept = tester.widget<FilledButton>(find.byType(FilledButton));
    final decline = tester.widget<OutlinedButton>(find.byType(OutlinedButton));
    expect(accept.onPressed, isNull);
    expect(decline.onPressed, isNull);
  });
}
