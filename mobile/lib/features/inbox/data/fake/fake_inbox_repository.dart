import '../../../../core/fixtures/fixture_loader.dart';
import '../../../../core/models/models.dart';
import '../inbox_repository.dart';

/// Fixture-backed inbox (MOBILE_CONTRACTS §11): serves
/// `notifications_page.json` through the real `fromJson`. `markRead` is a
/// local no-op that remembers ids in-memory, so a re-fetched page reflects
/// them as read and the unread badge drops in fakes mode — there is only one
/// page in the fixture, so `after` always returns the empty tail.
class FakeInboxRepository implements InboxRepository {
  FakeInboxRepository({FixtureLoader? fixtures}) : fixtures = fixtures ?? FixtureLoader();

  final FixtureLoader fixtures;
  final Set<String> _readIds = {};

  @override
  Future<CursorPage<AppNotification>> list({String? after}) async {
    final page = await fixtures.load(
      'notifications_page',
      (json) => CursorPage.fromJson(json, AppNotification.fromJson),
    );
    if (after != null) {
      return const CursorPage(items: []);
    }
    final items = [
      for (final notification in page.items)
        if (_readIds.contains(notification.id) && notification.readAt == null)
          notification.copyWith(readAt: DateTime.now().toUtc())
        else
          notification,
    ];
    return CursorPage(items: items, nextCursor: page.nextCursor);
  }

  @override
  Future<void> markRead(List<String> ids) async {
    _readIds.addAll(ids);
  }
}
