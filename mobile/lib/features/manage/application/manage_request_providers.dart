import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../providers.dart';

/// Backs [ManageRequestScreen]. Fetches through the same `applications()`
/// listing the manage home "Requests" tab uses (the manage repository has no
/// single-application getter — CONTRACTS §6/MOBILE_CONTRACTS §8 — so this
/// mirrors `FakeManageRepository.decide`'s own lookup rather than reaching
/// into another feature's fixtures).
class ManageRequestNotifier extends AsyncNotifier<Application> {
  ManageRequestNotifier(this.applicationId);

  final String applicationId;

  @override
  Future<Application> build() async {
    final page = await ref.read(manageRepositoryProvider).applications();
    return page.items.firstWhere((application) => application.id == applicationId);
  }

  Future<void> refresh() async {
    ref.invalidateSelf();
    await future;
  }

  /// Returns the decided application so the screen can tell a genuine
  /// approval from an auto-decline (`slot_taken` raced the decision — the
  /// call still succeeds, it just didn't approve).
  Future<Application> decide({required bool approve, String? message}) async {
    final updated = await ref
        .read(manageRepositoryProvider)
        .decide(applicationId, approve: approve, message: message);
    state = AsyncData(updated);
    return updated;
  }
}

final manageRequestProvider =
    AsyncNotifierProvider.family<ManageRequestNotifier, Application, String>(
  ManageRequestNotifier.new,
);
