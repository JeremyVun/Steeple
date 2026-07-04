import '../../../../core/fixtures/fixture_loader.dart';
import '../../../../core/models/models.dart';
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
}
