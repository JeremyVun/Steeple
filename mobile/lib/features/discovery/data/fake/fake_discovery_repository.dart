import 'package:dio/dio.dart';

import '../../../../core/fixtures/fixture_loader.dart';
import '../../../../core/models/models.dart';
import '../discovery_repository.dart';

/// Fixture-backed discovery (MOBILE_CONTRACTS §11). Applies the real filter
/// semantics (minCapacity, AND-matching on activities/accessibility —
/// CONTRACTS §3) over `listing_search.json` so filter UX is exercisable
/// offline.
class FakeDiscoveryRepository implements DiscoveryRepository {
  FakeDiscoveryRepository({FixtureLoader? fixtures})
    : fixtures = fixtures ?? FixtureLoader();

  final FixtureLoader fixtures;

  @override
  Future<ListingSearchResult> search(
    SearchQuery query, {
    CancelToken? cancel,
  }) async {
    final all = await fixtures.load(
      'listing_search',
      ListingSearchResult.fromJson,
    );
    var items = all.items.where((room) {
      final minCapacity = query.minCapacity;
      if (minCapacity != null && room.capacity < minCapacity) return false;
      // AND semantics: the room must accept/provide every requested token.
      if (!query.activities.every(room.activities.contains)) return false;
      if (!query.accessibility.every(room.accessibility.contains)) return false;
      return true;
    }).toList();

    // A When filter (CONTRACTS §3, additive) narrows to a deterministic
    // subset and stamps the free window that "satisfied" it, so the sheet
    // and result cards are exercisable offline.
    final hasWhen = query.date != null || query.daysOfWeek.isNotEmpty;
    if (hasWhen) {
      final startTime =
          query.startTime ??
          (query.timeOfDay == null
              ? null
              : timeOfDayBands[query.timeOfDay]?.$1) ??
          '18:00';
      final endTime =
          query.endTime ??
          (query.timeOfDay == null
              ? null
              : timeOfDayBands[query.timeOfDay]?.$2) ??
          '21:00';
      items = [
        for (final room in items.take(2))
          room.copyWith(
            matchedWindow: MatchedWindow(
              date: query.date,
              startTime: startTime,
              endTime: endTime,
            ),
          ),
      ];
    }

    return ListingSearchResult(
      items: items,
      totalCount: items.length,
      isZeroResult: items.isEmpty,
      appliedBounds: all.appliedBounds,
      center: all.center,
      page: 1,
      pageSize: query.pageSize,
    );
  }

  @override
  Future<List<String>> suburbs() async => const [
    'Vienna',
    'Oakton',
    'Dunn Loring',
  ];

  @override
  Future<GeofenceContext> geofence() =>
      fixtures.load('geofence', GeofenceContext.fromJson);
}
