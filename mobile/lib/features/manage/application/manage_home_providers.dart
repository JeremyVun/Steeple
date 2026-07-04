import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../providers.dart';

/// Backs [ManageHomeScreen]'s "Requests" tab — not part of the manage public
/// surface (MOBILE_CONTRACTS §8 lists only `manageRepositoryProvider` and
/// `manageVenuesProvider`), so it lives under `application/` like
/// `ApplicationThreadNotifier` does for inbox.
class ManageApplicationsNotifier extends AsyncNotifier<List<Application>> {
  @override
  Future<List<Application>> build() async {
    final page = await ref.read(manageRepositoryProvider).applications();
    return page.items;
  }

  Future<void> refresh() async {
    ref.invalidateSelf();
    await future;
  }
}

final manageApplicationsProvider =
    AsyncNotifierProvider<ManageApplicationsNotifier, List<Application>>(
  ManageApplicationsNotifier.new,
);

/// One venue's rooms (`ManageHomeScreen`'s "Rooms" tab renders one of these
/// per managed venue).
class ManageVenueDetailNotifier extends AsyncNotifier<ManagedVenueDetail> {
  ManageVenueDetailNotifier(this.venueId);

  final String venueId;

  @override
  Future<ManagedVenueDetail> build() => ref.read(manageRepositoryProvider).venue(venueId);

  Future<void> refresh() async {
    ref.invalidateSelf();
    await future;
  }
}

final manageVenueDetailProvider =
    AsyncNotifierProvider.family<ManageVenueDetailNotifier, ManagedVenueDetail, String>(
  ManageVenueDetailNotifier.new,
);
