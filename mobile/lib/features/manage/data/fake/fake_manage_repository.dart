import '../../../../core/fixtures/fixture_loader.dart';
import '../../../../core/models/models.dart';
import '../../../../core/utils/dates.dart';
import '../manage_repository.dart';

/// Fixture-backed manage (MOBILE_CONTRACTS §11). `saveRoom`/`decide` fold the
/// requested change into the fixture object in-memory (via `copyWith`) so the
/// screens that call them see their own edit reflected back, same style as
/// `FakeApplicationsRepository.withdraw`/`FakeInboxRepository.markRead`.
class FakeManageRepository implements ManageRepository {
  FakeManageRepository({FixtureLoader? fixtures}) : fixtures = fixtures ?? FixtureLoader();

  final FixtureLoader fixtures;
  final Map<String, ManagedRoom> _roomOverrides = {};
  final Map<String, Application> _applicationOverrides = {};
  final Map<String, RoomAvailabilityRules> _hoursOverrides = {};

  @override
  Future<List<ManagedVenue>> venues() =>
      fixtures.loadList('managed_venues', ManagedVenue.fromJson);

  @override
  Future<ManagedVenueDetail> venue(String id) =>
      fixtures.load('managed_venue_detail', ManagedVenueDetail.fromJson);

  @override
  Future<ManagedRoom> room(String id) async {
    final override = _roomOverrides[id];
    if (override != null) return override;
    return fixtures.load('managed_room', ManagedRoom.fromJson);
  }

  @override
  Future<ManagedRoom> saveRoom(String id, ManagedRoomPatch patch) async {
    final base = await room(id);
    final updated = base.copyWith(
      name: patch.name ?? base.name,
      description: patch.description ?? base.description,
      capacity: patch.capacity ?? base.capacity,
      pricePerHour: patch.pricePerHour ?? base.pricePerHour,
      houseRules: patch.houseRules ?? base.houseRules,
      status: patch.status ?? base.status,
      activities: patch.activities ?? base.activities,
      amenities: patch.amenities ?? base.amenities,
      accessibility: patch.accessibility ?? base.accessibility,
      updatedAtUtc: DateTime.now().toUtc(),
    );
    _roomOverrides[id] = updated;
    return updated;
  }

  @override
  Future<RoomAvailabilityRules> openHours(String roomId) async {
    final override = _hoursOverrides[roomId];
    if (override != null) return override;
    return fixtures.load('room_open_hours', RoomAvailabilityRules.fromJson);
  }

  @override
  Future<RoomAvailabilityRules> saveOpenHours(
    String roomId,
    RoomAvailabilityRules rules,
  ) async {
    // Echo the save back (same style as `saveRoom`) so the screen sees its own
    // edit; keep the fixture's roomId/timezone as the canonical envelope.
    final base = await openHours(roomId);
    final saved = base.copyWith(days: rules.days, blackouts: rules.blackouts);
    _hoursOverrides[roomId] = saved;
    return saved;
  }

  @override
  Future<Paged<Application>> applications({String? status, int page = 1}) async {
    final page0 = await fixtures.load(
      'manage_applications_page',
      (json) => Paged.fromJson(json, Application.fromJson),
    );
    final items = [
      for (final application in page0.items)
        _applicationOverrides[application.id] ?? application,
    ].where((application) => status == null || application.status == status).toList();
    return Paged(items: items, totalCount: items.length, page: 1, pageSize: page0.pageSize);
  }

  /// Serves `host_calendar.json`, re-dated so the fixture's first day lands on
  /// the requested [from] (same trick as `FakeListingRepository.availability`):
  /// every occurrence/pending date shifts by one constant delta, so the fake
  /// reads as "live" this week whatever the calendar date. Rooms/order/status
  /// stay verbatim.
  @override
  Future<VenueCalendar> calendar(
    String venueId, {
    required String from,
    required String to,
  }) async {
    final base = await fixtures.load('host_calendar', VenueCalendar.fromJson);
    final delta = daysBetween(base.from, from);
    return base.copyWith(
      venueId: venueId,
      from: from,
      to: to,
      occurrences: [
        for (final o in base.occurrences) o.copyWith(localDate: addDays(o.localDate, delta)),
      ],
      pending: [
        for (final p in base.pending)
          p.copyWith(dates: [for (final d in p.dates) addDays(d, delta)]),
      ],
    );
  }

  @override
  Future<Application> decide(String id, {required bool approve, String? message}) async {
    final page = await fixtures.load(
      'manage_applications_page',
      (json) => Paged.fromJson(json, Application.fromJson),
    );
    final base = _applicationOverrides[id] ??
        page.items.firstWhere((application) => application.id == id, orElse: () => page.items.first);
    final updated = base.copyWith(
      status: approve ? 'approved' : 'declined',
      decidedAtUtc: DateTime.now().toUtc(),
    );
    _applicationOverrides[id] = updated;
    return updated;
  }

  @override
  Future<Application> counterOffer(
    String id,
    ProposedSchedule schedule, {
    String? message,
  }) async {
    final page = await fixtures.load(
      'manage_applications_page',
      (json) => Paged.fromJson(json, Application.fromJson),
    );
    final base = _applicationOverrides[id] ??
        page.items.firstWhere((application) => application.id == id, orElse: () => page.items.first);
    final now = DateTime.now().toUtc();
    final updated = base.copyWith(
      status: 'counterOffered',
      counterOffer: CounterOffer(
        id: 'fake-counter-${now.millisecondsSinceEpoch}',
        schedule: schedule,
        message: message,
        status: 'open',
        createdAtUtc: now,
      ),
    );
    _applicationOverrides[id] = updated;
    return updated;
  }
}
