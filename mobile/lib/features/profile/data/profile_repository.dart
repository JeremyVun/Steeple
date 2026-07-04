import '../../../core/api/api_client.dart';
import '../../../core/models/models.dart';

/// Account reads/writes (MOBILE_CONTRACTS §8). `me()` returns the full
/// MeResponse (profile + agreements) — the profile screen shows both.
abstract class ProfileRepository {
  Future<MeResponse> me();

  Future<void> acceptAgreement(String docType, String version);

  /// `DELETE /me` — anonymize + revoke everything (Apple 5.1.1(v)).
  Future<void> deleteAccount();
}

class ApiProfileRepository implements ProfileRepository {
  const ApiProfileRepository(this._api);

  final ApiClient _api;

  @override
  Future<MeResponse> me() => _api.get(
        '/api/v1/me',
        decode: (data) => MeResponse.fromJson(data as Map<String, dynamic>),
      );

  @override
  Future<void> acceptAgreement(String docType, String version) => _api.post<void>(
        '/api/v1/me/agreements',
        body: {'docType': docType, 'version': version},
        decode: (_) {},
      );

  @override
  Future<void> deleteAccount() => _api.delete('/api/v1/me');
}
