import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:steeple_mobile/app/theme/theme.dart';
import 'package:steeple_mobile/core/flags/flags_service.dart';
import 'package:steeple_mobile/core/models/models.dart';
import 'package:steeple_mobile/features/manage/presentation/manage_home_screen.dart';
import 'package:steeple_mobile/features/manage/providers.dart';

class _EntryManageRepository extends FakeManageRepository {
  @override
  Future<List<ManagedVenue>> venues() async => const [
    ManagedVenue(
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Grace Community Church',
      slug: 'grace-community-church',
    ),
  ];

  @override
  Future<ManagedVenueDetail> venue(String id) async =>
      ManagedVenueDetail.fromJson({
        'id': id,
        'name': 'Grace Community Church',
        'slug': 'grace-community-church',
        'description': 'A venue.',
        'venueType': 'church',
        'addressLine': '217 Center St S',
        'suburb': 'Vienna',
        'postcode': '22180',
        'parkingInfo': '',
        'transitInfo': '',
        'latitude': 38.9,
        'longitude': -77.2,
        'timezone': 'America/New_York',
        'isIdentityVerified': true,
        'verificationStatus': 'verified',
        'rooms': <Object>[],
      });
}

Widget _wrap({required bool onboardingEnabled}) => ProviderScope(
  key: ValueKey(onboardingEnabled),
  overrides: [
    flagsProvider.overrideWithValue(
      FakeFlagsService({FlagKeys.paymentsOnboarding: onboardingEnabled}),
    ),
    manageRepositoryProvider.overrideWithValue(
      _EntryManageRepository(),
    ),
  ],
  child: MaterialApp(
    theme: SteepleTheme.light(),
    home: const ManageHomeScreen(),
  ),
);

Future<void> _settle(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 500));
  await tester.pump();
}

void main() {
  testWidgets('shows venue payments only when onboarding is enabled', (
    tester,
  ) async {
    await tester.pumpWidget(_wrap(onboardingEnabled: true));
    await _settle(tester);
    await tester.tap(find.text('Rooms'));
    await _settle(tester);
    expect(find.text('Payments'), findsWidgets);

    await tester.pumpWidget(_wrap(onboardingEnabled: false));
    await _settle(tester);
    await tester.tap(find.text('Rooms'));
    await _settle(tester);
    expect(find.text('Payments'), findsNothing);
  });
}
