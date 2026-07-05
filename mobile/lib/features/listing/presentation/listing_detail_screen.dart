import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/theme/theme.dart';
import '../../../core/flags/flags_service.dart';
import '../../../core/models/models.dart';
import '../../../core/navigation/route_names.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../providers.dart';

/// Listing detail (parity with web discovery). The apply CTA is the one
/// primary button on screen and is flag-gated (`mobile.apply_enabled`) so a
/// bad release can be neutered server-side (MOBILE_DESIGN §6).
class ListingDetailScreen extends ConsumerWidget {
  const ListingDetailScreen({
    required this.venueSlug,
    required this.roomSlug,
    super.key,
  });

  final String venueSlug;
  final String roomSlug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail =
        ref.watch(listingDetailProvider((venueSlug: venueSlug, roomSlug: roomSlug)));

    return Scaffold(
      appBar: AppBar(),
      body: AsyncValueView<RoomDetail>(
        value: detail,
        onRetry: () => ref.invalidate(
          listingDetailProvider((venueSlug: venueSlug, roomSlug: roomSlug)),
        ),
        data: (room) => _Detail(room: room, venueSlug: venueSlug, roomSlug: roomSlug),
      ),
    );
  }
}

class _Detail extends ConsumerWidget {
  const _Detail({required this.room, required this.venueSlug, required this.roomSlug});

  final RoomDetail room;
  final String venueSlug;
  final String roomSlug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.steepleColors;
    final applyEnabled =
        ref.watch(flagsProvider).isEnabled(FlagKeys.applyEnabled, orElse: true);
    final venue = room.venue;
    final rating = room.rating;

    Widget section(String title, Widget child) => Padding(
          padding: const EdgeInsets.only(top: SteepleTokens.space6),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: SteepleTypography.headlineSerif.copyWith(color: colors.textPrimary),
              ),
              const SizedBox(height: SteepleTokens.space3),
              child,
            ],
          ),
        );

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: EdgeInsets.zero,
            children: [
              _PhotoGallery(room: room),
              Padding(
                padding: const EdgeInsets.all(SteepleTokens.gutter),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            room.roomName,
                            style: SteepleTypography.displaySerif
                                .copyWith(color: colors.textPrimary),
                          ),
                        ),
                        const SizedBox(width: SteepleTokens.space3),
                        // Price is a serif "moment" (§3): FREE or $n/hr.
                        Text(
                          room.isFree
                              ? 'FREE'
                              : '\$${(room.pricePerHour ?? 0).toStringAsFixed(0)}/hr',
                          style: SteepleTypography.priceSerif.copyWith(
                            color: room.isFree ? colors.selectedFg : colors.accent,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: SteepleTokens.space2),
                    Text(
                      '${venue.name} · ${venue.suburb}',
                      style: SteepleTypography.body.copyWith(color: colors.textSecondary),
                    ),
                    if (rating != null) ...[
                      const SizedBox(height: SteepleTokens.space1),
                      Text(
                        '★ ${rating.averageStars.toStringAsFixed(1)} (${rating.count})',
                        style: SteepleTypography.bodySm.copyWith(
                          color: colors.accent,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                    Text(
                      'Up to ${room.capacity} people',
                      style: SteepleTypography.bodySm.copyWith(color: colors.textSecondary),
                    ),
                    if (venue.isIdentityVerified) ...[
                      const SizedBox(height: SteepleTokens.space3),
                      _VerifiedBadge(colors: colors),
                    ],
                    if (room.description.isNotEmpty)
                      section(
                        'About this space',
                        Text(
                          room.description,
                          style: SteepleTypography.body.copyWith(color: colors.textPrimary),
                        ),
                      ),
                    if (room.activities.isNotEmpty)
                      section(
                        'Good for',
                        Wrap(
                          spacing: SteepleTokens.space2,
                          runSpacing: SteepleTokens.space2,
                          children: [
                            for (final token in room.activities)
                              TagChip(label: wireTokenLabel(token)),
                          ],
                        ),
                      ),
                    if (room.amenities.isNotEmpty || room.accessibility.isNotEmpty)
                      section(
                        'What it has',
                        Wrap(
                          spacing: SteepleTokens.space2,
                          runSpacing: SteepleTokens.space2,
                          children: [
                            // Accessibility first: it's a first-class feature,
                            // not an afterthought (DESIGN_SYSTEM §1.6).
                            for (final token in room.accessibility)
                              TagChip(label: wireTokenLabel(token)),
                            for (final token in room.amenities)
                              TagChip(label: wireTokenLabel(token)),
                          ],
                        ),
                      ),
                    if (room.houseRules.isNotEmpty)
                      section(
                        'House rules',
                        Text(
                          room.houseRules,
                          style: SteepleTypography.body.copyWith(color: colors.textPrimary),
                        ),
                      ),
                    section(
                      "When it's open",
                      _AvailabilitySection(room: room),
                    ),
                    section(
                      'Getting there',
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${venue.addressLine}, ${venue.suburb} ${venue.postcode}',
                            style:
                                SteepleTypography.body.copyWith(color: colors.textPrimary),
                          ),
                          if (venue.parkingInfo.isNotEmpty) ...[
                            const SizedBox(height: SteepleTokens.space2),
                            _InfoLine(icon: Icons.local_parking_rounded, text: venue.parkingInfo),
                          ],
                          if (venue.transitInfo.isNotEmpty) ...[
                            const SizedBox(height: SteepleTokens.space2),
                            _InfoLine(icon: Icons.directions_bus_rounded, text: venue.transitInfo),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: SteepleTokens.space8),
                  ],
                ),
              ),
            ],
          ),
        ),
        // Sticky apply bar (elevation2 — §5).
        Container(
          padding: const EdgeInsets.all(SteepleTokens.gutter),
          decoration: BoxDecoration(
            color: colors.surfaceRaised,
            border: Border(top: BorderSide(color: colors.border)),
            boxShadow: colors.elevation2,
          ),
          child: SafeArea(
            top: false,
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    room.isFree
                        ? 'Free to use'
                        : '\$${(room.pricePerHour ?? 0).toStringAsFixed(0)} per hour',
                    style: SteepleTypography.title.copyWith(color: colors.textPrimary),
                  ),
                ),
                FilledButton(
                  onPressed: applyEnabled
                      ? () => context.goNamed(
                            RouteNames.apply,
                            pathParameters: {'venueSlug': venueSlug, 'roomSlug': roomSlug},
                          )
                      : null,
                  child: const Text('Ask to book'),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _PhotoGallery extends StatelessWidget {
  const _PhotoGallery({required this.room});

  final RoomDetail room;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    final photos = room.photos;
    if (photos.isEmpty) {
      return AspectRatio(
        aspectRatio: 4 / 3,
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [colors.selectedBg, colors.surface],
            ),
          ),
          child: Center(
            child: Text(
              room.roomName.isEmpty ? '·' : room.roomName[0].toUpperCase(),
              style: SteepleTypography.displaySerif.copyWith(
                color: colors.selectedFg.withValues(alpha: 0.55),
                fontSize: 56,
              ),
            ),
          ),
        ),
      );
    }
    return AspectRatio(
      aspectRatio: 4 / 3,
      child: PageView.builder(
        itemCount: photos.length,
        itemBuilder: (context, index) {
          final photo = photos[index];
          return Semantics(
            image: true,
            label: photo.caption ?? '${room.roomName} photo ${index + 1}',
            child: CachedNetworkImage(
              imageUrl: photo.url,
              fit: BoxFit.cover,
              placeholder: (context, _) => ColoredBox(color: colors.surface),
              errorWidget: (context, _, _) => ColoredBox(color: colors.surface),
            ),
          );
        },
      ),
    );
  }
}

class _VerifiedBadge extends StatelessWidget {
  const _VerifiedBadge({required this.colors});

  final SteepleColors colors;

  @override
  Widget build(BuildContext context) {
    // Trust copy is precise: SSO-verified identity, nothing more (§8.3).
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: SteepleTokens.space3,
        vertical: SteepleTokens.space1,
      ),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(SteepleTokens.radiusPill),
        border: Border.all(color: colors.selectedFill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.check_rounded, size: 16, color: colors.selectedFg),
          const SizedBox(width: SteepleTokens.space1),
          Text(
            'Identity verified (SSO)',
            style: SteepleTypography.caption.copyWith(color: colors.selectedFg),
          ),
        ],
      ),
    );
  }
}

/// "When it's open": the room's weekly open-hours summary (rendered from the
/// detail payload synchronously) plus a deferred 14-day availability strip that
/// loads when this section first builds (MOBILE_DESIGN §4 — deferred, kept
/// alive by `roomAvailabilityProvider`). The strip is a read-only preview;
/// picking a slot happens in the apply flow's calendar.
class _AvailabilitySection extends ConsumerWidget {
  const _AvailabilitySection({required this.room});

  final RoomDetail room;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.steepleColors;
    final availability = ref.watch(roomAvailabilityProvider(room.roomId));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _OpenHoursSummary(openHours: room.openHours),
        const SizedBox(height: SteepleTokens.space4),
        availability.when(
          loading: () => const SkeletonBlock(height: 72),
          error: (_, _) => Text(
            "We couldn't load open times right now.",
            style: SteepleTypography.bodySm.copyWith(color: colors.textTertiary),
          ),
          data: (data) => _StripAndNextFree(room: room, availability: data),
        ),
      ],
    );
  }
}

class _StripAndNextFree extends StatelessWidget {
  const _StripAndNextFree({required this.room, required this.availability});

  final RoomDetail room;
  final RoomAvailability availability;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    final today = todayLocalIso();
    final days = availability.days.take(14).toList();

    // Earliest day with a bookable window, for the "next free" line.
    AvailabilityDay? nextFree;
    for (final day in days) {
      final state = deriveDayState(
        date: day.date,
        day: day,
        openWindows: openWindowsForDate(room.openHours, day.date),
        today: today,
      );
      if (state.isSelectable && day.freeWindows.isNotEmpty) {
        nextFree = day;
        break;
      }
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          height: 62,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: days.length,
            separatorBuilder: (_, _) => const SizedBox(width: SteepleTokens.space2),
            itemBuilder: (context, i) => _StripCell(
              day: days[i],
              openWindows: openWindowsForDate(room.openHours, days[i].date),
              today: today,
            ),
          ),
        ),
        const SizedBox(height: SteepleTokens.space3),
        Text(
          nextFree == null
              ? 'No open times in the next two weeks.'
              : 'Next free: ${weekdayMonthDay(nextFree.date)} · '
                  '${timeRange12(nextFree.freeWindows.first.startTime, nextFree.freeWindows.first.endTime)}',
          style: SteepleTypography.bodySm.copyWith(
            color: nextFree == null ? colors.textTertiary : colors.selectedFg,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: SteepleTokens.space3),
        const AvailabilityLegend(),
      ],
    );
  }
}

class _StripCell extends StatelessWidget {
  const _StripCell({required this.day, required this.openWindows, required this.today});

  final AvailabilityDay day;
  final List<OpenWindow> openWindows;
  final String today;

  static const _abbrev = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    final state = deriveDayState(
      date: day.date,
      day: day,
      openWindows: openWindows,
      today: today,
    );
    final visual = dayStateVisual(state, colors);
    final weekday = _abbrev[weekdayOf(day.date)];
    final dayNumber = int.parse(day.date.split('-')[2]).toString();

    return Semantics(
      label: '$weekday ${monthDay(day.date)}, ${dayStateSemantics(state, day.freeWindows.length)}',
      child: Container(
        width: 44,
        decoration: BoxDecoration(
          color: visual.background,
          borderRadius: BorderRadius.circular(SteepleTokens.radiusSm),
          border: Border.all(color: colors.border),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              weekday,
              style: SteepleTypography.label.copyWith(color: colors.textTertiary),
            ),
            const SizedBox(height: 2),
            Text(
              visual.cross ? '×' : dayNumber,
              style: SteepleTypography.bodySm.copyWith(
                color: visual.foreground,
                fontWeight: FontWeight.w700,
              ),
            ),
            SizedBox(
              height: 6,
              child: visual.dot
                  ? Container(
                      width: 5,
                      height: 5,
                      decoration:
                          BoxDecoration(color: colors.warning.fg, shape: BoxShape.circle),
                    )
                  : null,
            ),
          ],
        ),
      ),
    );
  }
}

class _OpenHoursSummary extends StatelessWidget {
  const _OpenHoursSummary({required this.openHours});

  final List<DayOpenHours>? openHours;

  static const _abbrev = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  static const _order = [
    'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', //
  ];

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    final hours = openHours;
    if (hours == null || hours.every((d) => d.windows.isEmpty)) {
      return Text(
        'Open hours vary — ask the space when you apply.',
        style: SteepleTypography.bodySm.copyWith(color: colors.textSecondary),
      );
    }

    final byToken = {for (final d in hours) d.dayOfWeek: d};
    final closed = <String>[];
    final rows = <Widget>[];
    for (var i = 0; i < _order.length; i++) {
      final windows = byToken[_order[i]]?.windows ?? const <OpenWindow>[];
      if (windows.isEmpty) {
        closed.add(_abbrev[i]);
        continue;
      }
      rows.add(
        Padding(
          padding: const EdgeInsets.only(bottom: SteepleTokens.space1),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 40,
                child: Text(
                  _abbrev[i],
                  style: SteepleTypography.bodySm.copyWith(
                    color: colors.textSecondary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              Expanded(
                child: Text(
                  [for (final w in windows) timeRange12(w.startTime, w.endTime)].join(', '),
                  style: SteepleTypography.bodySm.copyWith(color: colors.textPrimary),
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ...rows,
        if (closed.isNotEmpty)
          Text(
            'Closed ${closed.join(', ')}',
            style: SteepleTypography.caption.copyWith(color: colors.textTertiary),
          ),
      ],
    );
  }
}

class _InfoLine extends StatelessWidget {
  const _InfoLine({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: colors.textTertiary),
        const SizedBox(width: SteepleTokens.space2),
        Expanded(
          child: Text(
            text,
            style: SteepleTypography.bodySm.copyWith(color: colors.textSecondary),
          ),
        ),
      ],
    );
  }
}
