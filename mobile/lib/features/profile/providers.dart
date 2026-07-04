import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/session_manager.dart';
import '../../core/models/models.dart';
import 'data/profile_repository.dart';

export 'data/fake/fake_profile_repository.dart';
export 'data/profile_repository.dart';

/// Public surface of the profile feature (MOBILE_CONTRACTS §8).
final profileRepositoryProvider = Provider<ProfileRepository>(
  (ref) => ApiProfileRepository(ref.watch(apiClientProvider)),
);

/// Rebuilds on sign-in/out so a fresh account never sees stale profile data.
final meProvider = AsyncNotifierProvider<MeNotifier, MeResponse>(MeNotifier.new);

class MeNotifier extends AsyncNotifier<MeResponse> {
  @override
  Future<MeResponse> build() {
    ref.watch(sessionProvider); // invalidate on auth transitions
    return ref.read(profileRepositoryProvider).me();
  }
}
