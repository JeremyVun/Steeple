import '../../../../core/fixtures/fixture_loader.dart';
import '../../../../core/models/models.dart';
import '../payment_repository.dart';

class FakePaymentRepository implements PaymentRepository {
  FakePaymentRepository({FixtureLoader? fixtures})
    : fixtures = fixtures ?? FixtureLoader();

  final FixtureLoader fixtures;
  final Map<String, VenuePaymentState> _overrides = {};

  @override
  Future<VenuePaymentState> state(String venueId) async =>
      _overrides[venueId] ??
      fixtures.load('venue_payment_state', VenuePaymentState.fromJson);

  @override
  Future<PaymentExternalLink> startOnboarding(String venueId) =>
      fixtures.load('payment_onboarding_link', PaymentExternalLink.fromJson);

  @override
  Future<VenuePaymentState> setOptIn(
    String venueId, {
    required bool optedIn,
  }) async {
    final current = await state(venueId);
    final updated = current.copyWith(optedIn: optedIn);
    _overrides[venueId] = updated;
    return updated;
  }

  @override
  Future<PaymentExternalLink> dashboard(String venueId) =>
      fixtures.load('payment_dashboard_link', PaymentExternalLink.fromJson);
}
