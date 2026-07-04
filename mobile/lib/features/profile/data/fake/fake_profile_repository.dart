import '../../../../core/fixtures/fixture_loader.dart';
import '../../../../core/models/models.dart';
import '../profile_repository.dart';

/// Fixture-backed profile (MOBILE_CONTRACTS §11).
class FakeProfileRepository implements ProfileRepository {
  FakeProfileRepository({FixtureLoader? fixtures}) : fixtures = fixtures ?? FixtureLoader();

  final FixtureLoader fixtures;

  @override
  Future<MeResponse> me() => fixtures.load('me', MeResponse.fromJson);

  @override
  Future<void> acceptAgreement(String docType, String version) async {}

  @override
  Future<void> deleteAccount() async {}
}
