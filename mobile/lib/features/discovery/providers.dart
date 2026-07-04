import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/models/models.dart';
import 'application/search_providers.dart';
import 'data/discovery_repository.dart';

export 'application/search_providers.dart' show SearchFilters, SearchFiltersNotifier, SearchResultsNotifier, mapRegionProvider;
export 'data/discovery_repository.dart';
export 'data/fake/fake_discovery_repository.dart';

/// Public surface of the discovery feature (MOBILE_CONTRACTS §8) — the only
/// members another feature/agent may touch.
final discoveryRepositoryProvider = Provider<DiscoveryRepository>(
  (ref) => ApiDiscoveryRepository(ref.watch(apiClientProvider)),
);

final searchFiltersProvider =
    NotifierProvider<SearchFiltersNotifier, SearchFilters>(SearchFiltersNotifier.new);

final searchResultsProvider =
    AsyncNotifierProvider<SearchResultsNotifier, ListingSearchResult>(
  SearchResultsNotifier.new,
);
