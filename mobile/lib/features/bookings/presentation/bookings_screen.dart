import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/theme/theme.dart';
import '../../../core/models/models.dart';
import '../../../core/navigation/route_names.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../providers.dart';

/// The organizer's bookings list (MOBILE_CONTRACTS §7 `bookings` route).
class BookingsScreen extends ConsumerWidget {
  const BookingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(myBookingsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Bookings')),
      body: AsyncValueView(
        value: state,
        skeleton: () => const SkeletonList(),
        onRetry: () => ref.read(myBookingsProvider.notifier).refresh(),
        data: (bookings) =>
            bookings.isEmpty ? const _EmptyBookings() : _BookingsList(bookings: bookings),
      ),
    );
  }
}

class _EmptyBookings extends StatelessWidget {
  const _EmptyBookings();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: EmptyState(
        icon: Icons.event_available_rounded,
        title: 'No bookings yet',
        body: 'Once a church approves your application, it shows up here.',
        action: OutlinedButton(
          onPressed: () => context.goNamed(RouteNames.explore),
          child: const Text('Find a space'),
        ),
      ),
    );
  }
}

class _BookingsList extends ConsumerWidget {
  const _BookingsList({required this.bookings});

  final List<Booking> bookings;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return RefreshIndicator(
      onRefresh: () => ref.read(myBookingsProvider.notifier).refresh(),
      child: ListView.separated(
        padding: const EdgeInsets.all(SteepleTokens.gutter),
        itemCount: bookings.length,
        separatorBuilder: (context, _) => const SizedBox(height: SteepleTokens.space3),
        itemBuilder: (context, index) => _BookingCard(booking: bookings[index]),
      ),
    );
  }
}

/// Mirrors `ListingCard`'s container idiom (surfaceRaised, radiusMd, border)
/// without a photo — a simpler card for a text-only summary.
class _BookingCard extends StatelessWidget {
  const _BookingCard({required this.booking});

  final Booking booking;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    final next = booking.nextOccurrence;
    final semanticLabel = '${booking.roomName}, ${booking.venueName}, ${booking.status}';

    return Semantics(
      label: semanticLabel,
      button: true,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.surfaceRaised,
          borderRadius: BorderRadius.circular(SteepleTokens.radiusMd),
          border: Border.all(color: colors.border),
          boxShadow: colors.elevation1,
        ),
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            borderRadius: BorderRadius.circular(SteepleTokens.radiusMd),
            onTap: () =>
                context.goNamed(RouteNames.bookingDetail, pathParameters: {'id': booking.id}),
            child: ExcludeSemantics(
              child: Padding(
                padding: const EdgeInsets.all(SteepleTokens.space4),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                booking.roomName,
                                style:
                                    SteepleTypography.title.copyWith(color: colors.textPrimary),
                              ),
                              const SizedBox(height: SteepleTokens.space1),
                              Text(
                                booking.venueName,
                                style: SteepleTypography.bodySm
                                    .copyWith(color: colors.textSecondary),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: SteepleTokens.space2),
                        StatusChip(statusRaw: booking.status, domain: StatusDomain.booking),
                      ],
                    ),
                    const SizedBox(height: SteepleTokens.space3),
                    if (next != null)
                      Text(
                        'Next: ${weekdayMonthDay(next.localDate)} · '
                        '${time12(booking.schedule.startTime)}',
                        style: SteepleTypography.bodySm.copyWith(
                          color: colors.textPrimary,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    const SizedBox(height: SteepleTokens.space1),
                    Text(
                      dateRange(booking.startDate, booking.endDate),
                      style: SteepleTypography.caption.copyWith(color: colors.textTertiary),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
