import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/models/models.dart';
import 'data/applications_repository.dart';

export 'data/applications_repository.dart';
export 'data/fake/fake_applications_repository.dart';

/// Public surface of the apply feature (MOBILE_CONTRACTS §8). The inbox
/// feature reaches applications through here too — one repository, one owner.
final applicationsRepositoryProvider = Provider<ApplicationsRepository>(
  (ref) => ApiApplicationsRepository(ref.watch(apiClientProvider)),
);

/// The in-progress intent form, keyed by room. Lives OUTSIDE the auth state
/// on purpose: the draft survives the SSO gate (MOBILE_CONTRACTS §6/§8) and
/// is cleared explicitly on submit success. Family instances are kept alive
/// (riverpod 3 default) so backing out of the form and returning keeps what
/// was typed.
final applyDraftProvider =
    NotifierProvider.family<ApplyDraftNotifier, ApplicationDraft, String>(
  ApplyDraftNotifier.new,
);

class ApplyDraftNotifier extends Notifier<ApplicationDraft> {
  ApplyDraftNotifier(this.roomId);

  final String roomId;

  @override
  ApplicationDraft build() => const ApplicationDraft();

  void update(ApplicationDraft draft) => state = draft;

  void clear() => state = const ApplicationDraft();
}
