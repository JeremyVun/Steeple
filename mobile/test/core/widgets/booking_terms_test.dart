import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:steeple_mobile/app/theme/theme.dart';
import 'package:steeple_mobile/core/models/models.dart';
import 'package:steeple_mobile/core/widgets/booking_terms.dart';
import 'package:steeple_mobile/features/manage/application/manage_request_providers.dart';
import 'package:steeple_mobile/features/manage/presentation/manage_request_screen.dart';

class _Request extends ManageRequestNotifier {
  _Request(this.application) : super(application.id);
  final Application application;
  @override
  Future<Application> build() async => application;
}

void main() {
  const quote = ApplicationQuote(
    pricePerHour: 9.01,
    currency: 'USD',
    houseRules: 'Leave tables in place.',
  );
  const schedule = ProposedSchedule(
    frequency: 'oneOff',
    startDate: '2027-01-12',
    startTime: '09:00',
    endTime: '10:30',
  );

  test('counter duration uses saved hourly rate with half-even rounding', () {
    expect(
      quotePrice(quote, schedule),
      'USD 9.01 / hour · USD 13.52 per session',
    );
    expect(
      quotePrice(quote.copyWith(pricePerHour: 9.03), schedule),
      'USD 9.03 / hour · USD 13.54 per session',
    );
  });
  test('support email contains context without personal data', () {
    final uri = bookingSupportUri('booking', 'booking-123');
    expect(uri.path, 'jvun@steepleapp.co');
    expect(
      uri.queryParameters['subject'],
      'Steeple booking help — booking-123',
    );
    expect(uri.queryParameters['body'], contains('booking ID: booking-123'));
  });
  testWidgets('saved rules and price fit a small phone', (tester) async {
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        theme: SteepleTheme.light(),
        home: const Scaffold(
          body: SingleChildScrollView(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: BookingTerms(quote: quote, schedule: schedule),
            ),
          ),
        ),
      ),
    );
    expect(find.text('Leave tables in place.'), findsOneWidget);
    expect(
      find.text('USD 9.01 / hour · USD 13.52 per session'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });
  testWidgets('legacy host cannot approve and sees required guest review', (
    tester,
  ) async {
    final json =
        jsonDecode(File('test/fixtures/application.json').readAsStringSync())
            as Map<String, dynamic>;
    final app = Application.fromJson({
      ...json,
      'status': 'pending',
      'quote': null,
      'bookingId': null,
    });
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          manageRequestProvider(app.id).overrideWith(() => _Request(app)),
        ],
        child: MaterialApp(
          theme: SteepleTheme.light(),
          home: ManageRequestScreen(applicationId: app.id),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('guest must withdraw'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Approve'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(
      tester
          .widget<FilledButton>(find.widgetWithText(FilledButton, 'Approve'))
          .onPressed,
      isNull,
    );
    await tester.tap(find.text('Approve'));
    await tester.pump();
    expect(find.byType(AlertDialog), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
