import '../../../../core/fixtures/fixture_loader.dart';
import '../../../../core/models/models.dart';
import '../bookings_repository.dart';

/// Fixture-backed bookings (MOBILE_CONTRACTS §11): every id resolves to
/// `booking.json`. `mine()` mirrors the real list semantics (`occurrences:
/// []`, `nextOccurrence` populated); `cancel` returns the fixture flipped to
/// `cancelled`; `markNoShow`/`rate` are no-ops.
class FakeBookingsRepository implements BookingsRepository {
  FakeBookingsRepository({FixtureLoader? fixtures}) : fixtures = fixtures ?? FixtureLoader();

  final FixtureLoader fixtures;

  @override
  Future<Paged<Booking>> mine({int page = 1}) async {
    final booking = await fixtures.load('booking', Booking.fromJson);
    return Paged(
      items: [booking.copyWith(occurrences: const [])],
      totalCount: 1,
      page: 1,
      pageSize: 24,
    );
  }

  @override
  Future<Booking> byId(String id) => fixtures.load('booking', Booking.fromJson);

  @override
  Future<Booking> cancel(String id, {String? reason}) async {
    final booking = await fixtures.load('booking', Booking.fromJson);
    return booking.copyWith(
      status: 'cancelled',
      cancelledBy: booking.organizerId,
      cancelledAtUtc: DateTime.now().toUtc(),
      cancelReason: reason,
    );
  }

  @override
  Future<void> markNoShow(String occurrenceId) async {}

  @override
  Future<void> rate(String bookingId, {required int stars, String? comment}) async {}
}
