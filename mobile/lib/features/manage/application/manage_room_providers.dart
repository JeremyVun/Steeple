import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../providers.dart';

/// Backs [ManageRoomScreen] — loads the room and saves patches through it.
class ManageRoomNotifier extends AsyncNotifier<ManagedRoom> {
  ManageRoomNotifier(this.roomId);

  final String roomId;

  @override
  Future<ManagedRoom> build() => ref.read(manageRepositoryProvider).room(roomId);

  Future<void> refresh() async {
    ref.invalidateSelf();
    await future;
  }

  Future<ManagedRoom> save(ManagedRoomPatch patch) async {
    final updated = await ref.read(manageRepositoryProvider).saveRoom(roomId, patch);
    state = AsyncData(updated);
    return updated;
  }
}

final manageRoomProvider =
    AsyncNotifierProvider.family<ManageRoomNotifier, ManagedRoom, String>(ManageRoomNotifier.new);
