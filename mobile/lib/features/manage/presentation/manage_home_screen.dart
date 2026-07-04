import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/theme/theme.dart';
import '../../../core/models/models.dart';
import '../../../core/navigation/route_names.dart';
import '../../../core/widgets/widgets.dart';
import '../application/manage_home_providers.dart';
import '../providers.dart';
import 'widgets/in_review_badge.dart';

/// Provider self-service dashboard (Phase 5): requests awaiting a decision
/// and the caller's rooms across their venues. Reached only from the
/// profile tab's "Your spaces" entry point (guarded route, §7).
class ManageHomeScreen extends StatelessWidget {
  const ManageHomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Manage'),
          bottom: const TabBar(tabs: [Tab(text: 'Requests'), Tab(text: 'Rooms')]),
        ),
        body: const TabBarView(children: [_RequestsTab(), _RoomsTab()]),
      ),
    );
  }
}

class _RequestsTab extends ConsumerWidget {
  const _RequestsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(manageApplicationsProvider);
    return AsyncValueView(
      value: state,
      skeleton: () => const SkeletonList(),
      onRetry: () => ref.read(manageApplicationsProvider.notifier).refresh(),
      data: (requests) =>
          requests.isEmpty ? const _EmptyRequests() : _RequestsList(requests: requests),
    );
  }
}

class _EmptyRequests extends StatelessWidget {
  const _EmptyRequests();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: EmptyState(
        icon: Icons.inbox_rounded,
        title: 'No requests waiting',
        body: 'New applications for your rooms will show up here.',
      ),
    );
  }
}

class _RequestsList extends ConsumerWidget {
  const _RequestsList({required this.requests});

  final List<Application> requests;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return RefreshIndicator(
      onRefresh: () => ref.read(manageApplicationsProvider.notifier).refresh(),
      child: ListView.separated(
        padding: const EdgeInsets.all(SteepleTokens.gutter),
        itemCount: requests.length,
        separatorBuilder: (context, _) => const SizedBox(height: SteepleTokens.space3),
        itemBuilder: (context, index) => _RequestCard(application: requests[index]),
      ),
    );
  }
}

class _RequestCard extends StatelessWidget {
  const _RequestCard({required this.application});

  final Application application;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    final semanticLabel =
        '${application.roomName}, ${application.organizer.displayName}, ${application.status}';

    return Semantics(
      label: semanticLabel,
      button: true,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.surfaceRaised,
          borderRadius: BorderRadius.circular(SteepleTokens.radiusMd),
          border: Border.all(color: colors.border),
        ),
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            borderRadius: BorderRadius.circular(SteepleTokens.radiusMd),
            onTap: () => context.pushNamed(
              RouteNames.manageRequest,
              pathParameters: {'id': application.id},
            ),
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
                          child: Text(
                            application.roomName,
                            style: SteepleTypography.title.copyWith(color: colors.textPrimary),
                          ),
                        ),
                        const SizedBox(width: SteepleTokens.space2),
                        StatusChip(
                          statusRaw: application.status,
                          domain: StatusDomain.application,
                        ),
                      ],
                    ),
                    const SizedBox(height: SteepleTokens.space1),
                    Text(
                      '${application.organizer.displayName} · Group of ${application.groupSize}',
                      style: SteepleTypography.bodySm.copyWith(color: colors.textSecondary),
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

class _RoomsTab extends ConsumerWidget {
  const _RoomsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(manageVenuesProvider);
    return AsyncValueView(
      value: state,
      skeleton: () => const SkeletonList(),
      onRetry: () => ref.read(manageVenuesProvider.notifier).refresh(),
      data: (venues) => venues.isEmpty ? const _EmptyRooms() : _VenuesList(venues: venues),
    );
  }
}

class _EmptyRooms extends StatelessWidget {
  const _EmptyRooms();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: EmptyState(
        icon: Icons.church_rounded,
        title: 'No spaces yet',
        body: 'Venues you manage will show their rooms here.',
      ),
    );
  }
}

class _VenuesList extends StatelessWidget {
  const _VenuesList({required this.venues});

  final List<ManagedVenue> venues;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(SteepleTokens.gutter),
      children: [for (final venue in venues) _VenueSection(venue: venue)],
    );
  }
}

class _VenueSection extends ConsumerWidget {
  const _VenueSection({required this.venue});

  final ManagedVenue venue;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.steepleColors;
    final state = ref.watch(manageVenueDetailProvider(venue.id));

    return Padding(
      padding: const EdgeInsets.only(bottom: SteepleTokens.space6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            venue.name,
            style: SteepleTypography.headlineSerif.copyWith(color: colors.textPrimary),
          ),
          const SizedBox(height: SteepleTokens.space3),
          AsyncValueView(
            value: state,
            skeleton: () => const SkeletonBlock(width: double.infinity, height: 72),
            onRetry: () => ref.read(manageVenueDetailProvider(venue.id).notifier).refresh(),
            data: (detail) => detail.rooms.isEmpty
                ? Text(
                    'No rooms yet',
                    style: SteepleTypography.bodySm.copyWith(color: colors.textSecondary),
                  )
                : Column(
                    children: [
                      for (final room in detail.rooms) ...[
                        _RoomRow(room: room),
                        const SizedBox(height: SteepleTokens.space2),
                      ],
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _RoomRow extends StatelessWidget {
  const _RoomRow({required this.room});

  final ManagedRoomSummary room;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    final inReview = room.publishRequestedAtUtc != null;
    final semanticLabel = '${room.name}, ${inReview ? 'in review' : room.status}';

    return Semantics(
      label: semanticLabel,
      button: true,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.surfaceRaised,
          borderRadius: BorderRadius.circular(SteepleTokens.radiusMd),
          border: Border.all(color: colors.border),
        ),
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            borderRadius: BorderRadius.circular(SteepleTokens.radiusMd),
            onTap: () =>
                context.pushNamed(RouteNames.manageRoom, pathParameters: {'id': room.id}),
            child: ExcludeSemantics(
              child: Padding(
                padding: const EdgeInsets.all(SteepleTokens.space3),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            room.name,
                            style: SteepleTypography.title.copyWith(color: colors.textPrimary),
                          ),
                          const SizedBox(height: SteepleTokens.space1),
                          Text(
                            room.isFree || room.pricePerHour == null
                                ? 'Free · Capacity ${room.capacity}'
                                : '${room.currency} ${room.pricePerHour!.toStringAsFixed(0)}/hr'
                                    ' · Capacity ${room.capacity}',
                            style:
                                SteepleTypography.bodySm.copyWith(color: colors.textSecondary),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: SteepleTokens.space2),
                    if (inReview)
                      const InReviewBadge()
                    else
                      StatusChip(statusRaw: room.status, domain: StatusDomain.room),
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
