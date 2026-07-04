import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/models/models.dart';
import 'data/manage_repository.dart';

export 'data/fake/fake_manage_repository.dart';
export 'data/manage_repository.dart';

/// Public surface of the manage feature (MOBILE_CONTRACTS §8; provider
/// self-service, Phase 5).
final manageRepositoryProvider = Provider<ManageRepository>(
  (ref) => ApiManageRepository(ref.watch(apiClientProvider)),
);

/// The caller's managed venues (empty for non-providers, never an error state
/// that blocks anything else). Public because the profile feature's "Your
/// spaces" entry point watches it to decide whether to show the manage
/// surface at all (MOBILE_CONTRACTS §2 cross-feature access via
/// `providers.dart`).
final manageVenuesProvider =
    AsyncNotifierProvider<ManageVenuesNotifier, List<ManagedVenue>>(ManageVenuesNotifier.new);

class ManageVenuesNotifier extends AsyncNotifier<List<ManagedVenue>> {
  @override
  Future<List<ManagedVenue>> build() => ref.read(manageRepositoryProvider).venues();

  Future<void> refresh() async {
    ref.invalidateSelf();
    await future;
  }
}
