import '../../../core/api/api_client.dart';
import '../../../core/models/models.dart';

/// Notifications inbox reads/writes (MOBILE_CONTRACTS §8; CONTRACTS §5 —
/// "inbox = truth"). Repositories are the only place HTTP happens; every
/// failure is an `AppError`.
abstract class InboxRepository {
  Future<CursorPage<AppNotification>> list({String? after});

  /// Foreign/unknown ids are ignored server-side.
  Future<void> markRead(List<String> ids);
}

class ApiInboxRepository implements InboxRepository {
  const ApiInboxRepository(this._api);

  final ApiClient _api;

  @override
  Future<CursorPage<AppNotification>> list({String? after}) => _api.get(
        '/api/v1/me/notifications',
        query: {'after': ?after},
        decode: (data) => CursorPage.fromJson(
          data as Map<String, dynamic>,
          AppNotification.fromJson,
        ),
      );

  @override
  Future<void> markRead(List<String> ids) => _api.post(
        '/api/v1/me/notifications/read',
        body: {'ids': ids},
        decode: (_) {},
      );
}
