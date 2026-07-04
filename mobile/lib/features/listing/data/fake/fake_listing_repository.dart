import '../../../../core/fixtures/fixture_loader.dart';
import '../../../../core/models/models.dart';
import '../listing_repository.dart';

/// Fixture-backed listing detail (MOBILE_CONTRACTS §11): every slug/id
/// resolves to `room_detail.json`, so any card tap lands somewhere real.
class FakeListingRepository implements ListingRepository {
  FakeListingRepository({FixtureLoader? fixtures}) : fixtures = fixtures ?? FixtureLoader();

  final FixtureLoader fixtures;

  @override
  Future<RoomDetail> bySlug(String venueSlug, String roomSlug) =>
      fixtures.load('room_detail', RoomDetail.fromJson);

  @override
  Future<RoomDetail> byId(String id) => fixtures.load('room_detail', RoomDetail.fromJson);
}
