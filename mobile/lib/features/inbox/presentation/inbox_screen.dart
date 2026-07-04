import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/theme.dart';
import '../../../core/models/models.dart';
import '../../../core/navigation/route_names.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../providers.dart';

/// The notifications inbox (MOBILE_CONTRACTS §7 `inbox` route). Pull-to-
/// refresh re-reads from the top; scrolling near the end loads the next
/// cursor page. Tapping a row marks it read (fire-and-forget) and follows
/// the payload's canonical deep link.
class InboxScreen extends ConsumerWidget {
  const InboxScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(inboxProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Inbox')),
      body: AsyncValueView(
        value: state,
        skeleton: () => const SkeletonList(),
        onRetry: () => ref.read(inboxProvider.notifier).refresh(),
        data: (items) => items.isEmpty
            ? const _EmptyInbox()
            : _InboxList(items: items),
      ),
    );
  }
}

class _EmptyInbox extends StatelessWidget {
  const _EmptyInbox();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: EmptyState(
        icon: Icons.notifications_none_rounded,
        title: 'Nothing yet',
        body: 'Replies from churches land here — approvals, questions, and '
            'updates on your bookings.',
      ),
    );
  }
}

class _InboxList extends ConsumerWidget {
  const _InboxList({required this.items});

  final List<AppNotification> items;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return RefreshIndicator(
      onRefresh: () => ref.read(inboxProvider.notifier).refresh(),
      child: NotificationListener<ScrollNotification>(
        onNotification: (notification) {
          final metrics = notification.metrics;
          if (metrics.pixels >= metrics.maxScrollExtent - 200) {
            unawaited(ref.read(inboxProvider.notifier).loadMore());
          }
          return false;
        },
        child: ListView.separated(
          padding: const EdgeInsets.symmetric(vertical: SteepleTokens.space2),
          itemCount: items.length,
          separatorBuilder: (context, _) => const Divider(height: 1),
          itemBuilder: (context, index) {
            final notification = items[index];
            return _NotificationTile(
              notification: notification,
              onTap: () {
                unawaited(ref.read(inboxProvider.notifier).markRead([notification.id]));
                goDeepLink(context, notification.payload.deepLink);
              },
            );
          },
        ),
      ),
    );
  }
}

class _NotificationTile extends StatelessWidget {
  const _NotificationTile({required this.notification, required this.onTap});

  final AppNotification notification;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    final unread = notification.readAt == null;
    final (icon, role) = _iconAndRole(notification.typeValue, colors);
    final title = _title(notification);
    final secondary = notification.payload.roomName;
    final stamp = relativeStamp(notification.createdAtUtc);
    final semanticLabel = [
      if (unread) 'Unread',
      title,
      if (secondary != null && secondary.isNotEmpty) secondary,
      stamp,
    ].join(', ');

    return Semantics(
      label: semanticLabel,
      button: true,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: SteepleTokens.gutter,
            vertical: SteepleTokens.space3,
          ),
          child: ExcludeSemantics(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(color: role.bg, shape: BoxShape.circle),
                  child: Icon(icon, size: 20, color: role.fg),
                ),
                const SizedBox(width: SteepleTokens.space3),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: SteepleTypography.body.copyWith(
                          color: colors.textPrimary,
                          fontWeight: unread ? FontWeight.w600 : FontWeight.w400,
                        ),
                      ),
                      if (secondary != null && secondary.isNotEmpty) ...[
                        const SizedBox(height: SteepleTokens.space1),
                        Text(
                          secondary,
                          style: SteepleTypography.bodySm.copyWith(color: colors.textSecondary),
                        ),
                      ],
                      const SizedBox(height: SteepleTokens.space1),
                      Text(
                        stamp,
                        style: SteepleTypography.caption.copyWith(color: colors.textTertiary),
                      ),
                    ],
                  ),
                ),
                if (unread) ...[
                  const SizedBox(width: SteepleTokens.space2),
                  Padding(
                    padding: const EdgeInsets.only(top: SteepleTokens.space1),
                    child: Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(color: colors.accent, shape: BoxShape.circle),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  static (IconData, StatusColors) _iconAndRole(NotificationType type, SteepleColors colors) =>
      switch (type) {
        NotificationType.applicationApproved => (Icons.check_circle_rounded, colors.success),
        NotificationType.applicationDeclined => (Icons.cancel_rounded, colors.danger),
        NotificationType.applicationMessage => (Icons.chat_bubble_rounded, colors.info),
        NotificationType.applicationReceived => (Icons.mail_rounded, colors.info),
        NotificationType.bookingCancelled => (Icons.event_busy_rounded, colors.danger),
        NotificationType.renewalDue => (Icons.refresh_rounded, colors.info),
        NotificationType.ratingReceived => (Icons.star_rounded, colors.neutral),
        NotificationType.unknown => (Icons.notifications_none_rounded, colors.neutral),
      };

  static String _title(AppNotification n) {
    final venue = n.payload.venueName;
    return switch (n.typeValue) {
      NotificationType.applicationApproved => '${venue ?? 'The venue'} approved your application',
      NotificationType.applicationDeclined => '${venue ?? 'The venue'} declined your application',
      NotificationType.applicationMessage => '${venue ?? 'The venue'} sent you a message',
      NotificationType.applicationReceived =>
        'New application for ${n.payload.roomName ?? 'your space'}',
      NotificationType.bookingCancelled => 'Your booking at ${venue ?? 'the venue'} was cancelled',
      NotificationType.renewalDue => 'Your booking at ${venue ?? 'the venue'} is ending soon',
      NotificationType.ratingReceived => '${venue ?? 'Someone'} left you a rating',
      NotificationType.unknown => wireTokenLabel(n.type),
    };
  }
}
