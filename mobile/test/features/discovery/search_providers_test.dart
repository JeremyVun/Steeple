import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:steeple_mobile/core/models/models.dart';
import 'package:steeple_mobile/features/discovery/providers.dart';

class _PagedDiscoveryRepository implements DiscoveryRepository {
  _PagedDiscoveryRepository(this.totalCount, {this.holdSecondPage = false});

  final int totalCount;
  final bool holdSecondPage;
  final pages = <int>[];
  final secondPageStarted = Completer<void>();
  final releaseSecondPage = Completer<void>();
  final newQueryCompleted = Completer<void>();

  @override
  Future<ListingSearchResult> search(
    SearchQuery query, {
    CancelToken? cancel,
  }) async {
    pages.add(query.page);
    if (query.minCapacity != null) {
      newQueryCompleted.complete();
      return _result(query, const [
        RoomSummary(
          roomId: 'new',
          venueId: 'venue-new',
          roomSlug: 'new-room',
          venueSlug: 'new-venue',
          venueName: 'New venue',
          suburb: 'Vienna',
          roomName: 'New room',
          capacity: 100,
          pricePerHour: 10,
          currency: 'USD',
          latitude: 38.9,
          longitude: -77.2,
        ),
      ], 1);
    }
    if (holdSecondPage && query.page == 2 && !secondPageStarted.isCompleted) {
      secondPageStarted.complete();
      await releaseSecondPage.future;
    }
    final offset = (query.page - 1) * query.pageSize;
    final count = (totalCount - offset).clamp(0, query.pageSize).toInt();
    return _result(
      query,
      List.generate(count, (index) => _room(offset + index)),
      totalCount,
    );
  }

  ListingSearchResult _result(
    SearchQuery query,
    List<RoomSummary> items,
    int count,
  ) => ListingSearchResult(
    items: items,
    totalCount: count,
    isZeroResult: count == 0,
    appliedBounds: const BoundingBox(
      minLat: 38,
      maxLat: 39,
      minLng: -78,
      maxLng: -77,
    ),
    page: query.page,
    pageSize: query.pageSize,
  );

  RoomSummary _room(int index) => RoomSummary(
    roomId: 'room-$index',
    venueId: 'venue-$index',
    roomSlug: 'room-$index',
    venueSlug: 'venue-$index',
    venueName: 'Venue $index',
    suburb: 'Vienna',
    roomName: 'Room $index',
    capacity: 50,
    pricePerHour: 10,
    currency: 'USD',
    latitude: 38.9,
    longitude: -77.2,
  );

  @override
  Future<GeofenceContext> geofence() async => const GeofenceContext(
    areaName: 'Test area',
    center: GeoPoint(latitude: 38.9, longitude: -77.2),
    beachhead: BoundingBox(minLat: 38, maxLat: 39, minLng: -78, maxLng: -77),
  );

  @override
  Future<List<String>> suburbs() async => const [];
}

void main() {
  test(
    'drains every discovery page instead of stopping after the first 24 results',
    () async {
      final repository = _PagedDiscoveryRepository(53);
      final container = ProviderContainer(
        overrides: [discoveryRepositoryProvider.overrideWithValue(repository)],
      );
      addTearDown(container.dispose);

      final results = await container.read(searchResultsProvider.future);

      expect(results.totalCount, 53);
      expect(results.items, hasLength(53));
      expect(results.items.first.roomId, 'room-0');
      expect(results.items.last.roomId, 'room-52');
      expect(repository.pages, [1, 2, 3]);
    },
  );

  test(
    'cancels an old paged search before its delayed page can publish',
    () async {
      final repository = _PagedDiscoveryRepository(48, holdSecondPage: true);
      final container = ProviderContainer(
        overrides: [discoveryRepositoryProvider.overrideWithValue(repository)],
      );
      addTearDown(container.dispose);
      final subscription = container.listen(searchResultsProvider, (_, _) {});
      addTearDown(subscription.close);

      await repository.secondPageStarted.future;
      container.read(searchFiltersProvider.notifier).setMinCapacity(100);
      await repository.newQueryCompleted.future;
      repository.releaseSecondPage.complete();

      final results = await container.read(searchResultsProvider.future);
      expect(results.totalCount, 1);
      expect(results.items.single.roomId, 'new');
    },
  );
}
