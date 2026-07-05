import '../../../../core/fixtures/fixture_loader.dart';
import '../../../../core/models/models.dart';
import '../applications_repository.dart';

/// The `application_counter_offer.json` variant's id — `byId`/`mine` serve that
/// fixture (an open counter, status `counterOffered`) for this id so the
/// organizer counter-offer flow is reachable offline, while every other id
/// still serves the default approved `application.json`.
const counterOfferedApplicationId = 'a1a1a1a1-aaaa-4aaa-8aaa-a1a1a1a1a1a1';

/// Fixture-backed applications (MOBILE_CONTRACTS §11). Submit echoes the
/// fixture application with the draft's fields folded in so the confirmation
/// and thread screens show what the user actually typed.
class FakeApplicationsRepository implements ApplicationsRepository {
  FakeApplicationsRepository({FixtureLoader? fixtures})
      : fixtures = fixtures ?? FixtureLoader();

  final FixtureLoader fixtures;
  final Map<String, Application> _overrides = {};

  /// The application for [id], honouring any in-memory transition first
  /// (`respondToCounter`), then the counter-offer variant for its id, then the
  /// default fixture — same override idiom as `FakeManageRepository`.
  Future<Application> _base(String id) async {
    final override = _overrides[id];
    if (override != null) return override;
    final name =
        id == counterOfferedApplicationId ? 'application_counter_offer' : 'application';
    return fixtures.load(name, Application.fromJson);
  }

  @override
  Future<Application> submit(
    String roomId,
    ApplicationDraft draft, {
    required String idempotencyKey,
    required String turnstileToken,
  }) async {
    final base = await fixtures.load('application', Application.fromJson);
    return base.copyWith(
      activityType: draft.activityType,
      groupSize: draft.groupSize,
      schedule: draft.schedule ?? base.schedule,
      intentText: draft.intentText,
      status: 'pending',
      messages: const [],
      messageCount: 0,
    );
  }

  @override
  Future<Paged<Application>> mine({String? status, int page = 1}) async {
    final application = await fixtures.load('application', Application.fromJson);
    final counter = await _base(counterOfferedApplicationId);
    final items = <Application>[application, counter]
        .where((a) => status == null || a.status == status)
        .toList();
    return Paged(items: items, totalCount: items.length, page: 1, pageSize: 24);
  }

  @override
  Future<Application> byId(String id) => _base(id);

  @override
  Future<ApplicationMessage> sendMessage(String id, String body) async {
    final application = await fixtures.load('application', Application.fromJson);
    return ApplicationMessage(
      id: 'fake-message-${DateTime.now().millisecondsSinceEpoch}',
      senderId: application.organizer.id,
      body: body,
      sentAtUtc: DateTime.now().toUtc(),
    );
  }

  @override
  Future<Application> withdraw(String id) async {
    final application = await _base(id);
    final counter = application.counterOffer;
    final updated = application.copyWith(
      status: 'withdrawn',
      counterOffer: counter != null && counter.isOpen
          ? counter.copyWith(status: 'lapsed', respondedAtUtc: DateTime.now().toUtc())
          : counter,
    );
    _overrides[id] = updated;
    return updated;
  }

  @override
  Future<Application> respondToCounter(String id, {required bool accept}) async {
    final application = await _base(id);
    final counter = application.counterOffer;
    final now = DateTime.now().toUtc();
    final updated = accept
        ? application.copyWith(
            status: 'approved',
            decidedAtUtc: now,
            bookingId: application.bookingId ?? 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            counterOffer: counter?.copyWith(status: 'accepted', respondedAtUtc: now),
          )
        : application.copyWith(
            status: 'pending',
            counterOffer:
                counter?.copyWith(status: 'declinedByOrganizer', respondedAtUtc: now),
          );
    _overrides[id] = updated;
    return updated;
  }
}
