import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/models/models.dart';
import '../../core/utils/dates.dart';
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

/// How far ahead the guest availability feed is fetched in one shot: ~6 weeks,
/// enough for the listing's 14-day strip and the apply calendar's current +
/// next month, well inside the API's 92-day cap. Both surfaces read this one
/// window (deferred: loads when a section first watches it).
const availabilityWindowDays = 42;

/// Guest availability for a room, keyed by roomId (MOBILE_CONTRACTS §8). Fetched
/// from today across [availabilityWindowDays]; kept alive so returning to the
/// listing/apply screens is instant.
final roomAvailabilityProvider = AsyncNotifierProvider.family<
    RoomAvailabilityNotifier, RoomAvailability, String>(
  RoomAvailabilityNotifier.new,
);

class RoomAvailabilityNotifier extends AsyncNotifier<RoomAvailability> {
  RoomAvailabilityNotifier(this.roomId);

  final String roomId;

  @override
  Future<RoomAvailability> build() {
    final from = todayLocalIso();
    return ref.read(listingRepositoryProvider).availability(
          roomId,
          from: from,
          to: addDays(from, availabilityWindowDays),
        );
  }
}
