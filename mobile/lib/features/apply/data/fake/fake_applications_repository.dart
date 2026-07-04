import '../../../../core/fixtures/fixture_loader.dart';
import '../../../../core/models/models.dart';
import '../applications_repository.dart';

/// Fixture-backed applications (MOBILE_CONTRACTS §11). Submit echoes the
/// fixture application with the draft's fields folded in so the confirmation
/// and thread screens show what the user actually typed.
class FakeApplicationsRepository implements ApplicationsRepository {
  FakeApplicationsRepository({FixtureLoader? fixtures})
      : fixtures = fixtures ?? FixtureLoader();

  final FixtureLoader fixtures;

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
    final items = status == null || application.status == status
        ? [application]
        : <Application>[];
    return Paged(items: items, totalCount: items.length, page: 1, pageSize: 24);
  }

  @override
  Future<Application> byId(String id) => fixtures.load('application', Application.fromJson);

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
    final application = await fixtures.load('application', Application.fromJson);
    return application.copyWith(status: 'withdrawn');
  }
}
