import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../../apply/providers.dart';

/// Local family notifier backing [ApplicationThreadScreen] — not part of the
/// inbox public surface (MOBILE_CONTRACTS §8 lists only `inboxProvider` and
/// `unreadCountProvider`), so it lives under `application/` rather than being
/// exported from `providers.dart`. Reaches applications through the apply
/// feature's public `applicationsRepositoryProvider` (MOBILE_CONTRACTS §2
/// allows importing another feature's `providers.dart`).
class ApplicationThreadNotifier extends AsyncNotifier<Application> {
  ApplicationThreadNotifier(this.applicationId);

  final String applicationId;

  @override
  Future<Application> build() =>
      ref.read(applicationsRepositoryProvider).byId(applicationId);

  Future<void> refresh() async {
    ref.invalidateSelf();
    await future;
  }

  Future<void> sendMessage(String body) async {
    await ref.read(applicationsRepositoryProvider).sendMessage(applicationId, body);
    await refresh();
  }

  Future<void> withdraw() async {
    final updated = await ref.read(applicationsRepositoryProvider).withdraw(applicationId);
    state = AsyncData(updated);
  }
}

final applicationThreadProvider =
    AsyncNotifierProvider.family<ApplicationThreadNotifier, Application, String>(
  ApplicationThreadNotifier.new,
);
