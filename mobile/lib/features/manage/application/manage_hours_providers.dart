import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../providers.dart';

/// Backs [ManageRoomHoursScreen] — loads a room's availability rules and
/// replace-all saves them through the manage repository.
class ManageRoomHoursNotifier extends AsyncNotifier<RoomAvailabilityRules> {
  ManageRoomHoursNotifier(this.roomId);

  final String roomId;

  @override
  Future<RoomAvailabilityRules> build() =>
      ref.read(manageRepositoryProvider).openHours(roomId);

  Future<void> refresh() async {
    ref.invalidateSelf();
    await future;
  }

  /// Replace-all `PUT`; folds the server's canonical response back into state.
  Future<RoomAvailabilityRules> save(RoomAvailabilityRules rules) async {
    final saved = await ref.read(manageRepositoryProvider).saveOpenHours(roomId, rules);
    state = AsyncData(saved);
    return saved;
  }
}

final manageRoomHoursProvider = AsyncNotifierProvider.family<ManageRoomHoursNotifier,
    RoomAvailabilityRules, String>(ManageRoomHoursNotifier.new);
