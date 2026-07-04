import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/models/models.dart';
import 'data/listing_repository.dart';

export 'data/fake/fake_listing_repository.dart';
export 'data/listing_repository.dart';

/// Public surface of the listing feature (MOBILE_CONTRACTS §8).
final listingRepositoryProvider = Provider<ListingRepository>(
  (ref) => ApiListingRepository(ref.watch(apiClientProvider)),
);

/// Keyed by `(venueSlug, roomSlug)`. Family instances are kept alive
/// (riverpod 3 default) so back-navigation from apply → detail → list is
/// instant (in-memory cache, MOBILE_DESIGN §4 rule 5).
final listingDetailProvider = AsyncNotifierProvider.family<ListingDetailNotifier,
    RoomDetail, ({String venueSlug, String roomSlug})>(
  ListingDetailNotifier.new,
);

class ListingDetailNotifier extends AsyncNotifier<RoomDetail> {
  ListingDetailNotifier(this.slugs);

  final ({String venueSlug, String roomSlug}) slugs;

  @override
  Future<RoomDetail> build() =>
      ref.read(listingRepositoryProvider).bySlug(slugs.venueSlug, slugs.roomSlug);
}
