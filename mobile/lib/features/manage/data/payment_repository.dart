import '../../../core/api/api_client.dart';
import '../../../core/models/models.dart';

abstract class PaymentRepository {
  Future<VenuePaymentState> state(String venueId);

  Future<PaymentExternalLink> startOnboarding(String venueId);

  Future<VenuePaymentState> setOptIn(String venueId, {required bool optedIn});

  Future<PaymentExternalLink> dashboard(String venueId);
}

class ApiPaymentRepository implements PaymentRepository {
  const ApiPaymentRepository(this._api);

  final ApiClient _api;

  @override
  Future<VenuePaymentState> state(String venueId) => _api.get(
    '/api/v1/manage/venues/$venueId/payments',
    decode: (data) => VenuePaymentState.fromJson(data as Map<String, dynamic>),
  );

  @override
  Future<PaymentExternalLink> startOnboarding(String venueId) => _api.post(
    '/api/v1/manage/venues/$venueId/payments/onboarding',
    decode: (data) =>
        PaymentExternalLink.fromJson(data as Map<String, dynamic>),
  );

  @override
  Future<VenuePaymentState> setOptIn(String venueId, {required bool optedIn}) =>
      _api.put(
        '/api/v1/manage/venues/$venueId/payments/opt-in',
        body: {'optedIn': optedIn},
        decode: (data) =>
            VenuePaymentState.fromJson(data as Map<String, dynamic>),
      );

  @override
  Future<PaymentExternalLink> dashboard(String venueId) => _api.post(
    '/api/v1/manage/venues/$venueId/payments/dashboard',
    decode: (data) =>
        PaymentExternalLink.fromJson(data as Map<String, dynamic>),
  );
}
