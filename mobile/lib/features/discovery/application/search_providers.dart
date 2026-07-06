import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../providers.dart';

/// The one filter state (MOBILE_CONTRACTS §8): UI-side selection that
/// compiles into a [SearchQuery] together with the current map region.
class SearchFilters {
  const SearchFilters({
    this.minCapacity,
    this.activities = const {},
    this.accessibility = const {},
    this.suburb,
    this.when = const WhenFilter(),
  });

  final int? minCapacity;
  final Set<String> activities;
  final Set<String> accessibility;
  final String? suburb;
  final WhenFilter when;

  int get activeCount =>
      (minCapacity == null ? 0 : 1) +
      activities.length +
      accessibility.length +
      (suburb == null ? 0 : 1) +
      (when.isAny ? 0 : 1);

  SearchFilters copyWith({
    int? Function()? minCapacity,
    Set<String>? activities,
    Set<String>? accessibility,
    String? Function()? suburb,
    WhenFilter? when,
  }) => SearchFilters(
    minCapacity: minCapacity == null ? this.minCapacity : minCapacity(),
    activities: activities ?? this.activities,
    accessibility: accessibility ?? this.accessibility,
    suburb: suburb == null ? this.suburb : suburb(),
    when: when ?? this.when,
  );

  SearchQuery toQuery(BoundingBox? region) => SearchQuery(
    minLat: region?.minLat,
    maxLat: region?.maxLat,
    minLng: region?.minLng,
    maxLng: region?.maxLng,
    suburb: suburb,
    minCapacity: minCapacity,
    activities: activities.toList()..sort(),
    accessibility: accessibility.toList()..sort(),
    date: when.date,
    daysOfWeek: when.daysOfWeek.toList()..sort(),
    // timeOfDay and the explicit range are alternatives (CONTRACTS §3) —
    // never send both.
    timeOfDay: when.timeOfDay,
    startTime: when.timeOfDay == null ? when.startTime : null,
    endTime: when.timeOfDay == null ? when.endTime : null,
  );
}

class SearchFiltersNotifier extends Notifier<SearchFilters> {
  @override
  SearchFilters build() => const SearchFilters();

  void toggleActivity(String token) {
    final next = Set.of(state.activities);
    next.contains(token) ? next.remove(token) : next.add(token);
    state = state.copyWith(activities: next);
  }

  void toggleAccessibility(String token) {
    final next = Set.of(state.accessibility);
    next.contains(token) ? next.remove(token) : next.add(token);
    state = state.copyWith(accessibility: next);
  }

  void setMinCapacity(int? value) =>
      state = state.copyWith(minCapacity: () => value);

  /// A one-off date pick clears any weekly selection (mutually exclusive,
  /// CONTRACTS §3).
  void setWhenDate(String? date) => state = state.copyWith(
    when: state.when.copyWith(date: () => date, daysOfWeek: const {}),
  );

  /// Toggling a weekday clears any one-off date (mutually exclusive).
  void toggleWhenDay(String token) {
    final next = Set.of(state.when.daysOfWeek);
    next.contains(token) ? next.remove(token) : next.add(token);
    state = state.copyWith(
      when: state.when.copyWith(date: () => null, daysOfWeek: next),
    );
  }

  /// A time band and a custom range are alternatives — picking one clears
  /// the other.
  void setWhenTimeOfDay(String? band) => state = state.copyWith(
    when: state.when.copyWith(
      timeOfDay: () => band,
      startTime: () => null,
      endTime: () => null,
    ),
  );

  void setWhenCustomRange(String? start, String? end) => state = state.copyWith(
    when: state.when.copyWith(
      timeOfDay: () => null,
      startTime: () => start,
      endTime: () => end,
    ),
  );

  void clearWhen() => state = state.copyWith(when: const WhenFilter());

  void clear() => state = const SearchFilters();
}

/// Last settled map viewport; null until the map first settles (search then
/// runs without bounds and the server centers on the geofence).
class MapRegionNotifier extends Notifier<BoundingBox?> {
  @override
  BoundingBox? build() => null;

  void settle(BoundingBox bounds) => state = bounds;
}

final mapRegionProvider = NotifierProvider<MapRegionNotifier, BoundingBox?>(
  MapRegionNotifier.new,
);

/// Search results: debounces 350 ms (except the first load), cancels
/// in-flight work on new input, and keeps the last result on screen while
/// revalidating (MOBILE_DESIGN §4 rule 5 — AsyncNotifier preserves the
/// previous value through rebuilds, AsyncValueView renders it stale).
class SearchResultsNotifier extends AsyncNotifier<ListingSearchResult> {
  @override
  Future<ListingSearchResult> build() async {
    final filters = ref.watch(searchFiltersProvider);
    final region = ref.watch(mapRegionProvider);

    final cancel = CancelToken();
    ref.onDispose(() {
      if (!cancel.isCancelled) cancel.cancel();
    });

    if (state.hasValue) {
      // Debounce interactive changes only — never the cold start.
      await Future<void>.delayed(const Duration(milliseconds: 350));
    }
    return ref
        .read(discoveryRepositoryProvider)
        .search(filters.toQuery(region), cancel: cancel);
  }

  Future<void> refresh() async {
    ref.invalidateSelf();
    await future;
  }
}
