import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:steeple_mobile/core/models/legal_documents.dart';
import 'package:steeple_mobile/core/models/models.dart';
import 'package:steeple_mobile/features/profile/providers.dart';

class _Profile implements ProfileRepository {
  final saved = <String>[];
  bool fail = false;
  @override
  Future<MeResponse> me() async => MeResponse(
    id: 'guest',
    displayName: 'Guest',
    createdAtUtc: DateTime.utc(2026),
    agreements: saved
        .map(
          (type) => Agreement(
            docType: type,
            version: currentAgreementVersion,
            acceptedAtUtc: DateTime.utc(2026),
          ),
        )
        .toList(),
  );
  @override
  Future<void> acceptAgreement(String docType, String version) async {
    expect(version, currentAgreementVersion);
    if (fail) throw StateError('Synthetic failed write');
    saved.add(docType);
  }

  @override
  Future<void> deleteAccount() async {}
}

void main() {
  for (final choice in ['Not now', 'Agree and continue', 'failure']) {
    testWidgets('consent gate: $choice', (tester) async {
      final profile = _Profile()..fail = choice == 'failure';
      bool? allowed;
      await tester.pumpWidget(
        ProviderScope(
          overrides: [profileRepositoryProvider.overrideWithValue(profile)],
          child: MaterialApp(
            home: Scaffold(
              body: Consumer(
                builder: (context, ref, _) => TextButton(
                  onPressed: () async {
                    allowed = await ensureCurrentAgreements(context, ref);
                  },
                  child: const Text('Book'),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Book'));
      await tester.pumpAndSettle();
      expect(profile.saved, isEmpty);
      expect(find.text('Terms & safety'), findsOneWidget);
      expect(find.text('Privacy policy'), findsOneWidget);
      await tester.tap(
        find.text(choice == 'failure' ? 'Agree and continue' : choice),
      );
      await tester.pumpAndSettle();
      if (choice == 'Agree and continue') {
        expect(allowed, isTrue);
        expect(profile.saved, ['tos', 'privacy']);
      } else if (choice == 'Not now') {
        expect(allowed, isFalse);
        expect(profile.saved, isEmpty);
      } else {
        expect(allowed, isNull);
        expect(profile.saved, isEmpty);
        expect(
          find.text('Your acceptance could not be saved. Please try again.'),
          findsOneWidget,
        );
      }
    });
  }
  test('stale acceptance does not satisfy current policy', () {
    expect(
      hasCurrentAgreements([
        Agreement(
          docType: 'tos',
          version: 'old',
          acceptedAtUtc: DateTime.utc(2026),
        ),
        Agreement(
          docType: 'privacy',
          version: currentAgreementVersion,
          acceptedAtUtc: DateTime.utc(2026),
        ),
      ]),
      isFalse,
    );
  });
}
