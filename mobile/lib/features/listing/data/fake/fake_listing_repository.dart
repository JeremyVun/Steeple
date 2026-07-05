import '../../../../core/fixtures/fixture_loader.dart';
import '../../../../core/models/models.dart';
import '../../../../core/utils/dates.dart';
import '../listing_repository.dart';

/// Fixture-backed listing detail (MOBILE_CONTRACTS §11): every slug/id
/// resolves to `room_detail.json`, so any card tap lands somewhere real.
class FakeListingRepository implements ListingRepository {
  FakeListingRepository({FixtureLoader? fixtures})
    : fixtures = fixtures ?? FixtureLoader();

  final FixtureLoader fixtures;

  @override
  Future<RoomDetail> bySlug(String venueSlug, String roomSlug) =>
      fixtures.load('room_detail', RoomDetail.fromJson);

  @override
  Future<RoomDetail> byId(String id) =>
      fixtures.load('room_detail', RoomDetail.fromJson);

  @override
  Future<VenueReviewPage> reviews(
    String venueId, {
    int page = 1,
    int pageSize = 10,
  }) => fixtures.load('venue_reviews', VenueReviewPage.fromJson);

  /// Serves `availability.json`, re-dated to start at the requested [from] so
  /// the fake reads as "live" whatever the calendar date — day states and
  /// ordering are preserved verbatim from the fixture (deterministic).
  @override
  Future<RoomAvailability> availability(
    String roomId, {
    required String from,
    required String to,
  }) async {
    final base = await fixtures.load('availability', RoomAvailability.fromJson);
    final shifted = [
      for (var i = 0; i < base.days.length; i++)
        base.days[i].copyWith(date: addDays(from, i)),
    ];
    return base.copyWith(
      roomId: roomId,
      from: from,
      to: shifted.isEmpty ? from : shifted.last.date,
      days: shifted,
    );
  }

  @override
  Future<ScheduleCheckResult> checkSchedule(
    String roomId,
    ProposedSchedule schedule,
  ) => fixtures.load('conflict_check', ScheduleCheckResult.fromJson);
}
