import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/theme/theme.dart';
import '../../../core/api/app_error.dart';
import '../../../core/models/models.dart';
import '../../../core/navigation/route_names.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../providers.dart';

/// Booking detail (MOBILE_CONTRACTS §7 `bookingDetail` route): occurrences,
/// cancel (48h notice window, CONTRACTS §5), no-show marking, renewal nudge.
class BookingDetailScreen extends ConsumerWidget {
  const BookingDetailScreen({required this.bookingId, super.key});

  final String bookingId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(bookingDetailProvider(bookingId));

    return Scaffold(
      appBar: AppBar(title: Text(state.value?.roomName ?? 'Booking')),
      body: AsyncValueView(
        value: state,
        skeleton: () => const Skeleton(child: _DetailSkeleton()),
        onRetry: () => ref.read(bookingDetailProvider(bookingId).notifier).refresh(),
        data: (booking) => _BookingDetailBody(booking: booking),
      ),
    );
  }
}

class _BookingDetailBody extends ConsumerWidget {
  const _BookingDetailBody({required this.booking});

  final Booking booking;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.steepleColors;
    final remaining = daysUntil(booking.endDate);
    final showRenewalNudge =
        booking.statusValue == BookingStatus.confirmed && remaining >= 0 && remaining <= 14;
    final canCancel = booking.statusValue == BookingStatus.confirmed;
    final timezoneCity = booking.venueTimezone.split('/').last.replaceAll('_', ' ');

    return ListView(
      padding: const EdgeInsets.all(SteepleTokens.gutter),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(SteepleTokens.space4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  booking.roomName,
                  style: SteepleTypography.headlineSerif.copyWith(color: colors.textPrimary),
                ),
                const SizedBox(height: SteepleTokens.space1),
                Text(
                  booking.venueName,
                  style: SteepleTypography.bodySm.copyWith(color: colors.textSecondary),
                ),
                const SizedBox(height: SteepleTokens.space3),
                StatusChip(statusRaw: booking.status, domain: StatusDomain.booking),
                const SizedBox(height: SteepleTokens.space3),
                Text(
                  scheduleSummary(booking.schedule),
                  style: SteepleTypography.bodySm.copyWith(color: colors.textPrimary),
                ),
                const SizedBox(height: SteepleTokens.space1),
                Text(
                  dateRange(booking.startDate, booking.endDate),
                  style: SteepleTypography.bodySm.copyWith(color: colors.textSecondary),
                ),
                const SizedBox(height: SteepleTokens.space1),
                Text(
                  'Times shown in $timezoneCity time',
                  style: SteepleTypography.caption.copyWith(color: colors.textTertiary),
                ),
              ],
            ),
          ),
        ),
        if (showRenewalNudge) ...[
          const SizedBox(height: SteepleTokens.space4),
          _RenewalBanner(booking: booking),
        ],
        const SizedBox(height: SteepleTokens.space6),
        Text(
          'Occurrences',
          style: SteepleTypography.title.copyWith(color: colors.textPrimary),
        ),
        const SizedBox(height: SteepleTokens.space3),
        for (final occurrence in booking.occurrences) ...[
          _OccurrenceRow(
            occurrence: occurrence,
            onMarkNoShow: occurrence.statusValue == OccurrenceStatus.scheduled &&
                    daysUntil(occurrence.localDate) < 0
                ? () => _confirmNoShow(context, ref, booking.id, occurrence.id)
                : null,
          ),
          const SizedBox(height: SteepleTokens.space2),
        ],
        if (canCancel) ...[
          const SizedBox(height: SteepleTokens.space4),
          OutlinedButton(
            style: OutlinedButton.styleFrom(
              foregroundColor: colors.danger.fg,
              side: BorderSide(color: colors.danger.fg),
            ),
            onPressed: () => _confirmCancel(context, ref, booking),
            child: const Text('Cancel booking'),
          ),
        ],
      ],
    );
  }

  static Future<void> _confirmCancel(BuildContext context, WidgetRef ref, Booking booking) async {
    final colors = context.steepleColors;
    final reasonController = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancel booking?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Occurrences more than 48 hours away are freed up for others. '
              "Anything sooner still stands.",
            ),
            const SizedBox(height: SteepleTokens.space3),
            TextField(
              controller: reasonController,
              maxLength: 500,
              maxLines: 3,
              decoration: const InputDecoration(hintText: 'Let them know why (optional)'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep booking'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: colors.danger.fg,
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Cancel booking'),
          ),
        ],
      ),
    );
    final reason = reasonController.text.trim();
    reasonController.dispose();
    if (confirmed != true) return;

    try {
      await ref
          .read(bookingDetailProvider(booking.id).notifier)
          .cancel(reason: reason.isEmpty ? null : reason);
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Booking cancelled.')));
      }
    } catch (e) {
      if (!context.mounted) return;
      final message = e is AppError && e.kind == AppErrorKind.conflict
          ? "That's already changed — refresh to see the latest."
          : "Couldn't cancel the booking. Try again in a moment.";
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
    }
  }

  static Future<void> _confirmNoShow(
    BuildContext context,
    WidgetRef ref,
    String bookingId,
    String occurrenceId,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Mark as no-show?'),
        content: const Text('This lets the other party know the group did not attend.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Mark no-show'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(bookingDetailProvider(bookingId).notifier).markNoShow(occurrenceId);
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Couldn't mark that. Try again in a moment.")),
        );
      }
    }
  }
}

class _RenewalBanner extends StatelessWidget {
  const _RenewalBanner({required this.booking});

  final Booking booking;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    return Container(
      padding: const EdgeInsets.all(SteepleTokens.space4),
      decoration: BoxDecoration(
        color: colors.info.bg,
        borderRadius: BorderRadius.circular(SteepleTokens.radiusMd),
      ),
      child: Row(
        children: [
          Icon(Icons.refresh_rounded, color: colors.info.fg),
          const SizedBox(width: SteepleTokens.space3),
          Expanded(
            child: Text(
              'This booking ends soon — ask to book again',
              style: SteepleTypography.bodySm.copyWith(color: colors.info.fg),
            ),
          ),
          TextButton(
            onPressed: () => context.goNamed(
              RouteNames.listing,
              pathParameters: {'venueSlug': booking.venueSlug, 'roomSlug': booking.roomSlug},
            ),
            child: const Text('View space'),
          ),
        ],
      ),
    );
  }
}

class _OccurrenceRow extends StatelessWidget {
  const _OccurrenceRow({required this.occurrence, this.onMarkNoShow});

  final Occurrence occurrence;
  final VoidCallback? onMarkNoShow;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: SteepleTokens.space4,
        vertical: SteepleTokens.space3,
      ),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(SteepleTokens.radiusMd),
        border: Border.all(color: colors.border),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              weekdayMonthDay(occurrence.localDate),
              style: SteepleTypography.bodySm.copyWith(color: colors.textPrimary),
            ),
          ),
          StatusChip(statusRaw: occurrence.status, domain: StatusDomain.occurrence),
          if (onMarkNoShow != null) ...[
            const SizedBox(width: SteepleTokens.space2),
            TextButton(onPressed: onMarkNoShow, child: const Text('Mark no-show')),
          ],
        ],
      ),
    );
  }
}

class _DetailSkeleton extends StatelessWidget {
  const _DetailSkeleton();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(SteepleTokens.gutter),
      children: const [
        SkeletonBlock(width: 200, height: 22),
        SizedBox(height: SteepleTokens.space2),
        SkeletonBlock(width: 150),
        SizedBox(height: SteepleTokens.space4),
        SkeletonBlock(width: 100, height: 24, radius: SteepleTokens.radiusPill),
        SizedBox(height: SteepleTokens.space6),
        SkeletonBlock(width: double.infinity, height: 48),
        SizedBox(height: SteepleTokens.space3),
        SkeletonBlock(width: double.infinity, height: 48),
      ],
    );
  }
}
