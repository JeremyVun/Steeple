import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/models/models.dart';
import 'data/inbox_repository.dart';

export 'data/fake/fake_inbox_repository.dart';
export 'data/inbox_repository.dart';

/// Public surface of the inbox feature (MOBILE_CONTRACTS §8).
final inboxRepositoryProvider = Provider<InboxRepository>(
  (ref) => ApiInboxRepository(ref.watch(apiClientProvider)),
);

/// Cursor-paged notifications: holds the accumulated pages and the opaque
/// `nextCursor` internally. `refresh()` re-reads from the top (used on
/// pull-to-refresh and app foreground); `loadMore()` appends the next page.
class InboxNotifier extends AsyncNotifier<List<AppNotification>> {
  String? _nextCursor;
  bool _loadingMore = false;

  @override
  Future<List<AppNotification>> build() async {
    final page = await ref.read(inboxRepositoryProvider).list();
    _nextCursor = page.nextCursor;
    return page.items;
  }

  Future<void> refresh() async {
    ref.invalidateSelf();
    await future;
  }

  /// No-op when there is no further page or a load is already in flight.
  Future<void> loadMore() async {
    final cursor = _nextCursor;
    final current = state.value;
    if (cursor == null || current == null || _loadingMore) return;
    _loadingMore = true;
    try {
      final page = await ref.read(inboxRepositoryProvider).list(after: cursor);
      _nextCursor = page.nextCursor;
      state = AsyncData([...current, ...page.items]);
    } finally {
      _loadingMore = false;
    }
  }

  /// Fire-and-forget mark-as-read with an optimistic local flip so the tab
  /// badge (`unreadCountProvider`) drops immediately.
  Future<void> markRead(List<String> ids) async {
    final current = state.value;
    if (current != null) {
      state = AsyncData([
        for (final notification in current)
          if (ids.contains(notification.id) && notification.readAt == null)
            notification.copyWith(readAt: DateTime.now().toUtc())
          else
            notification,
      ]);
    }
    await ref.read(inboxRepositoryProvider).markRead(ids);
  }
}

final inboxProvider = AsyncNotifierProvider<InboxNotifier, List<AppNotification>>(
  InboxNotifier.new,
);

/// Drives the tab badge (`app/shell.dart`) — count of unread notifications;
/// 0 while there's no data yet (first load, or an error with no prior page).
final unreadCountProvider = Provider<int>(
  (ref) => ref.watch(inboxProvider).value?.where((n) => n.readAt == null).length ?? 0,
);
