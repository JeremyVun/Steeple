import '../../../core/api/api_client.dart';
import '../../../core/models/models.dart';

/// Applications wire access (MOBILE_CONTRACTS §8; CONTRACTS §5). Owned by the
/// apply feature; inbox reaches it through `features/apply/providers.dart`.
abstract class ApplicationsRepository {
  /// `POST /listings/{roomId}/applications`. The idempotency key makes a
  /// replayed submit return the original application instead of a duplicate.
  Future<Application> submit(
    String roomId,
    ApplicationDraft draft, {
    required String idempotencyKey,
    required String turnstileToken,
  });

  Future<Paged<Application>> mine({String? status, int page = 1});

  Future<Application> byId(String id);

  Future<ApplicationMessage> sendMessage(String id, String body);

  Future<Application> withdraw(String id);
}

class ApiApplicationsRepository implements ApplicationsRepository {
  const ApiApplicationsRepository(this._api);

  final ApiClient _api;

  @override
  Future<Application> submit(
    String roomId,
    ApplicationDraft draft, {
    required String idempotencyKey,
    required String turnstileToken,
  }) =>
      _api.post(
        '/api/v1/listings/$roomId/applications',
        body: {...draft.toJson(), 'turnstileToken': turnstileToken},
        headers: {'Idempotency-Key': idempotencyKey},
        decode: (data) => Application.fromJson(data as Map<String, dynamic>),
      );

  @override
  Future<Paged<Application>> mine({String? status, int page = 1}) => _api.get(
        '/api/v1/me/applications',
        query: {'status': ?status, 'page': page},
        decode: (data) =>
            Paged.fromJson(data as Map<String, dynamic>, Application.fromJson),
      );

  @override
  Future<Application> byId(String id) => _api.get(
        '/api/v1/applications/$id',
        decode: (data) => Application.fromJson(data as Map<String, dynamic>),
      );

  @override
  Future<ApplicationMessage> sendMessage(String id, String body) => _api.post(
        '/api/v1/applications/$id/messages',
        body: {'body': body},
        decode: (data) => ApplicationMessage.fromJson(data as Map<String, dynamic>),
      );

  @override
  Future<Application> withdraw(String id) => _api.post(
        '/api/v1/applications/$id/withdraw',
        decode: (data) => Application.fromJson(data as Map<String, dynamic>),
      );
}
