import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:steeple_mobile/core/flags/flags_service.dart';
import 'package:steeple_mobile/core/models/models.dart';

Map<String, dynamic> _loadGolden() {
  final file = File('../tests/fixtures/wire-tokens.json');
  if (!file.existsSync()) {
    throw StateError(
      'Run this test from the mobile package; ${file.path} was not found.',
    );
  }
  return jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
}

List<String> _strings(Object? value) =>
    (value! as List<dynamic>).cast<String>();

void main() {
  final golden = _loadGolden();
  final goldenSets = golden['tokenSets']! as Map<String, dynamic>;
  final goldenFlags = golden['featureFlags']! as Map<String, dynamic>;

  test('complete mobile token registry matches the API golden table', () {
    expect(knownWireTokenSets.keys, orderedEquals(goldenSets.keys));
    for (final entry in knownWireTokenSets.entries) {
      expect(
        entry.value,
        orderedEquals(_strings(goldenSets[entry.key])),
        reason: entry.key,
      );
    }

    expect(knownFeatureFlagKeys, orderedEquals(_strings(goldenFlags['all'])));
    expect(
      knownPublicFeatureFlagKeys,
      orderedEquals(_strings(goldenFlags['public'])),
    );
    expect(FlagKeys.all, orderedEquals(_strings(goldenFlags['public'])));
  });

  test('typed mobile model maps cover their golden token sets exactly', () {
    final typedMaps = <String, Iterable<String>>{
      'applicationStatuses': ApplicationStatus.tokens.keys,
      'bookingStatuses': BookingStatus.tokens.keys,
      'bookingTypes': BookingType.tokens.keys,
      'counterOfferStatuses': CounterOfferStatus.tokens.keys,
      'notificationTypes': NotificationType.tokens.keys,
      'occurrenceStatuses': OccurrenceStatus.tokens.keys,
      'roomStatuses': ManagedRoomStatus.tokens.keys,
      'scheduleFrequencies': ScheduleFrequency.tokens.keys,
      'venueTypes': VenueType.tokens.keys,
    };

    for (final entry in typedMaps.entries) {
      expect(
        entry.value,
        orderedEquals(_strings(goldenSets[entry.key])),
        reason: entry.key,
      );
    }
  });
}
