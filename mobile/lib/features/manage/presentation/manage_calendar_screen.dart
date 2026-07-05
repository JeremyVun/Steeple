import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/theme/theme.dart';
import '../../../core/models/models.dart';
import '../../../core/navigation/route_names.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../application/manage_calendar_providers.dart';
import '../providers.dart';

const _weekdayInitials = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/// Agenda-first venue calendar (MOBILE_CONTRACTS §7 `manageCalendar`). A week
/// strip over a chronological agenda grouped by day: confirmed bookings render
/// solid (sage), still-pending requests render dashed/outlined (warning) and
/// tap through to their review screen. Venue selector appears only when the
/// operator manages more than one venue. Fetches exactly the visible week.
class ManageCalendarScreen extends ConsumerStatefulWidget {
  const ManageCalendarScreen({super.key});

  @override
  ConsumerState<ManageCalendarScreen> createState() => _ManageCalendarScreenState();
}

class _ManageCalendarScreenState extends ConsumerState<ManageCalendarScreen> {
  final _scrollController = ScrollController();
  final _dayKeys = <String, GlobalKey>{};

  String? _venueId;
  late String _weekStart;

  @override
  void initState() {
    super.initState();
    final today = todayLocalIso();
    // Sunday-first, matching the wire's canonical week order.
    _weekStart = addDays(today, -weekdayOf(today));
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _shiftWeek(int deltaWeeks) =>
      setState(() => _weekStart = addDays(_weekStart, deltaWeeks * 7));

  void _jumpToDay(String date) {
    final key = _dayKeys[date];
    final context = key?.currentContext;
    if (context != null) {
      Scrollable.ensureVisible(
        context,
        duration: SteepleTokens.durBase,
        alignment: 0.05,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final venuesState = ref.watch(manageVenuesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Calendar')),
      body: AsyncValueView(
        value: venuesState,
        skeleton: () => const SkeletonList(),
        onRetry: () => ref.read(manageVenuesProvider.notifier).refresh(),
        data: (venues) {
          if (venues.isEmpty) {
            return const Center(
              child: EmptyState(
                icon: Icons.church_rounded,
                title: 'No spaces yet',
                body: 'Venues you manage will show their calendar here.',
              ),
            );
          }
          final venueId = _venueId ??= venues.first.id;
          return _CalendarBody(
            venues: venues,
            venueId: venueId,
            weekStart: _weekStart,
            scrollController: _scrollController,
            dayKeys: _dayKeys,
            onSelectVenue: (id) => setState(() => _venueId = id),
            onShiftWeek: _shiftWeek,
            onJumpToDay: _jumpToDay,
          );
        },
      ),
    );
  }
}

class _CalendarBody extends ConsumerWidget {
  const _CalendarBody({
    required this.venues,
    required this.venueId,
    required this.weekStart,
    required this.scrollController,
    required this.dayKeys,
    required this.onSelectVenue,
    required this.onShiftWeek,
    required this.onJumpToDay,
  });

  final List<ManagedVenue> venues;
  final String venueId;
  final String weekStart;
  final ScrollController scrollController;
  final Map<String, GlobalKey> dayKeys;
  final void Function(String venueId) onSelectVenue;
  final void Function(int deltaWeeks) onShiftWeek;
  final void Function(String date) onJumpToDay;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.steepleColors;
    final weekEnd = addDays(weekStart, 6);
    final provider = manageCalendarProvider((venueId: venueId, from: weekStart));
    final state = ref.watch(provider);

    return Column(
      children: [
        if (venues.length > 1)
          Padding(
            padding: const EdgeInsets.fromLTRB(
              SteepleTokens.gutter,
              SteepleTokens.space3,
              SteepleTokens.gutter,
              0,
            ),
            child: _VenueSelector(
              venues: venues,
              venueId: venueId,
              onSelect: onSelectVenue,
            ),
          ),
        _WeekNav(
          weekStart: weekStart,
          weekEnd: weekEnd,
          onPrev: () => onShiftWeek(-1),
          onNext: () => onShiftWeek(1),
        ),
        _WeekStrip(weekStart: weekStart, onTapDay: onJumpToDay),
        Divider(height: 1, color: colors.border),
        Expanded(
          child: AsyncValueView(
            value: state,
            skeleton: () => const SkeletonList(),
            onRetry: () => ref.read(provider.notifier).refresh(),
            data: (calendar) => RefreshIndicator(
              onRefresh: () => ref.read(provider.notifier).refresh(),
              child: _Agenda(
                calendar: calendar,
                weekStart: weekStart,
                scrollController: scrollController,
                dayKeys: dayKeys,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _VenueSelector extends StatelessWidget {
  const _VenueSelector({
    required this.venues,
    required this.venueId,
    required this.onSelect,
  });

  final List<ManagedVenue> venues;
  final String venueId;
  final void Function(String venueId) onSelect;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: SteepleTokens.space3),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(SteepleTokens.radiusMd),
        border: Border.all(color: colors.border),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: venueId,
          isExpanded: true,
          icon: Icon(Icons.expand_more_rounded, color: colors.textSecondary),
          borderRadius: BorderRadius.circular(SteepleTokens.radiusMd),
          style: SteepleTypography.title.copyWith(color: colors.textPrimary),
          items: [
            for (final venue in venues)
              DropdownMenuItem(value: venue.id, child: Text(venue.name)),
          ],
          onChanged: (id) {
            if (id != null && id != venueId) onSelect(id);
          },
        ),
      ),
    );
  }
}

class _WeekNav extends StatelessWidget {
  const _WeekNav({
    required this.weekStart,
    required this.weekEnd,
    required this.onPrev,
    required this.onNext,
  });

  final String weekStart;
  final String weekEnd;
  final VoidCallback onPrev;
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: SteepleTokens.space2),
      child: Row(
        children: [
          IconButton(
            onPressed: onPrev,
            icon: const Icon(Icons.chevron_left_rounded),
            tooltip: 'Previous week',
          ),
          Expanded(
            child: Center(
              child: Semantics(
                liveRegion: true,
                child: Text(
                  dateRange(weekStart, weekEnd),
                  style: SteepleTypography.title.copyWith(color: colors.textPrimary),
                ),
              ),
            ),
          ),
          IconButton(
            onPressed: onNext,
            icon: const Icon(Icons.chevron_right_rounded),
            tooltip: 'Next week',
          ),
        ],
      ),
    );
  }
}

class _WeekStrip extends StatelessWidget {
  const _WeekStrip({required this.weekStart, required this.onTapDay});

  final String weekStart;
  final void Function(String date) onTapDay;

  @override
  Widget build(BuildContext context) {
    final today = todayLocalIso();
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: SteepleTokens.space2,
        vertical: SteepleTokens.space2,
      ),
      child: Row(
        children: [
          for (var i = 0; i < 7; i++)
            Expanded(
              child: _DayChip(
                date: addDays(weekStart, i),
                weekdayInitial: _weekdayInitials[i],
                isToday: addDays(weekStart, i) == today,
                onTap: () => onTapDay(addDays(weekStart, i)),
              ),
            ),
        ],
      ),
    );
  }
}

class _DayChip extends StatelessWidget {
  const _DayChip({
    required this.date,
    required this.weekdayInitial,
    required this.isToday,
    required this.onTap,
  });

  final String date;
  final String weekdayInitial;
  final bool isToday;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    final dayNumber = int.parse(date.split('-')[2]).toString();
    return Semantics(
      button: true,
      label: 'Jump to ${weekdayMonthDay(date)}',
      child: InkWell(
        borderRadius: BorderRadius.circular(SteepleTokens.radiusSm),
        onTap: onTap,
        child: Container(
          margin: const EdgeInsets.all(2),
          padding: const EdgeInsets.symmetric(vertical: SteepleTokens.space2),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(SteepleTokens.radiusSm),
            border: Border.all(
              color: isToday ? colors.selectedFill : Colors.transparent,
              width: 1.5,
            ),
          ),
          child: Column(
            children: [
              Text(
                weekdayInitial,
                style: SteepleTypography.label.copyWith(color: colors.textTertiary),
              ),
              const SizedBox(height: SteepleTokens.space1),
              Text(
                dayNumber,
                style: SteepleTypography.bodySm.copyWith(
                  color: colors.textPrimary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// One row on the agenda — a confirmed occurrence or a pending overlay.
class _AgendaEntry {
  const _AgendaEntry({
    required this.startTime,
    required this.endTime,
    required this.organizerName,
    required this.roomName,
    required this.pending,
    this.applicationId,
  });

  final String startTime;
  final String endTime;
  final String organizerName;
  final String roomName;
  final bool pending;
  final String? applicationId;
}

class _Agenda extends StatelessWidget {
  const _Agenda({
    required this.calendar,
    required this.weekStart,
    required this.scrollController,
    required this.dayKeys,
  });

  final VenueCalendar calendar;
  final String weekStart;
  final ScrollController scrollController;
  final Map<String, GlobalKey> dayKeys;

  @override
  Widget build(BuildContext context) {
    final roomNames = {for (final room in calendar.rooms) room.id: room.name};
    final days = [for (var i = 0; i < 7; i++) addDays(weekStart, i)];

    final byDay = <String, List<_AgendaEntry>>{for (final d in days) d: []};
    for (final o in calendar.occurrences) {
      byDay[o.localDate]?.add(_AgendaEntry(
        startTime: o.startTime,
        endTime: o.endTime,
        organizerName: o.organizerName,
        roomName: roomNames[o.roomId] ?? 'Room',
        pending: false,
      ));
    }
    for (final p in calendar.pending) {
      for (final date in p.dates) {
        byDay[date]?.add(_AgendaEntry(
          startTime: p.startTime,
          endTime: p.endTime,
          organizerName: p.organizerName,
          roomName: roomNames[p.roomId] ?? 'Room',
          pending: true,
          applicationId: p.applicationId,
        ));
      }
    }
    for (final entries in byDay.values) {
      entries.sort((a, b) => a.startTime.compareTo(b.startTime));
    }

    final hasAny = byDay.values.any((e) => e.isNotEmpty);
    if (!hasAny) {
      return ListView(
        controller: scrollController,
        children: const [
          SizedBox(height: SteepleTokens.space10),
          Center(
            child: EmptyState(
              icon: Icons.event_available_rounded,
              title: 'No bookings this week',
              body: 'Confirmed bookings and pending requests will show up here.',
            ),
          ),
        ],
      );
    }

    return ListView(
      controller: scrollController,
      padding: const EdgeInsets.all(SteepleTokens.gutter),
      children: [
        for (final date in days)
          _DaySection(
            key: dayKeys.putIfAbsent(date, GlobalKey.new),
            date: date,
            entries: byDay[date]!,
          ),
      ],
    );
  }
}

class _DaySection extends StatelessWidget {
  const _DaySection({required this.date, required this.entries, super.key});

  final String date;
  final List<_AgendaEntry> entries;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    return Padding(
      padding: const EdgeInsets.only(bottom: SteepleTokens.space5),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            weekdayMonthDay(date),
            style: SteepleTypography.title.copyWith(color: colors.textPrimary),
          ),
          const SizedBox(height: SteepleTokens.space2),
          if (entries.isEmpty)
            Text(
              'Nothing scheduled.',
              style: SteepleTypography.bodySm.copyWith(color: colors.textTertiary),
            )
          else
            for (final entry in entries) ...[
              _AgendaCard(entry: entry),
              const SizedBox(height: SteepleTokens.space2),
            ],
        ],
      ),
    );
  }
}

class _AgendaCard extends StatelessWidget {
  const _AgendaCard({required this.entry});

  final _AgendaEntry entry;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    final accent = entry.pending ? colors.warning.fg : colors.selectedFill;

    final content = Padding(
      padding: const EdgeInsets.all(SteepleTokens.space3),
      child: Row(
        children: [
          Container(
            width: 3,
            height: 36,
            decoration: BoxDecoration(
              color: accent,
              borderRadius: BorderRadius.circular(SteepleTokens.radiusPill),
            ),
          ),
          const SizedBox(width: SteepleTokens.space3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        entry.organizerName,
                        style: SteepleTypography.title.copyWith(color: colors.textPrimary),
                      ),
                    ),
                    if (entry.pending)
                      const StatusChip(
                        statusRaw: 'pending',
                        domain: StatusDomain.application,
                      ),
                  ],
                ),
                const SizedBox(height: SteepleTokens.space1),
                Text(
                  '${timeRange12(entry.startTime, entry.endTime)} · ${entry.roomName}',
                  style: SteepleTypography.bodySm.copyWith(color: colors.textSecondary),
                ),
              ],
            ),
          ),
        ],
      ),
    );

    if (entry.pending) {
      final semantics = '${entry.organizerName}, pending, '
          '${timeRange12(entry.startTime, entry.endTime)}, ${entry.roomName}';
      return Semantics(
        button: true,
        label: semantics,
        child: CustomPaint(
          painter: _DashedBorderPainter(color: colors.warning.fg),
          child: Material(
            type: MaterialType.transparency,
            child: InkWell(
              borderRadius: BorderRadius.circular(SteepleTokens.radiusMd),
              onTap: entry.applicationId == null
                  ? null
                  : () => context.pushNamed(
                        RouteNames.manageRequest,
                        pathParameters: {'id': entry.applicationId!},
                      ),
              child: ExcludeSemantics(child: content),
            ),
          ),
        ),
      );
    }

    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(SteepleTokens.radiusMd),
        border: Border.all(color: colors.border),
      ),
      child: content,
    );
  }
}

/// Dashed outline for pending overlays (matches [EmptyState]'s treatment) —
/// signals "not yet confirmed" without a fill.
class _DashedBorderPainter extends CustomPainter {
  const _DashedBorderPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    const dash = 6.0;
    const gap = 4.0;
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;
    final path = Path()
      ..addRRect(
        RRect.fromRectAndRadius(
          Offset.zero & size,
          const Radius.circular(SteepleTokens.radiusMd),
        ),
      );
    for (final metric in path.computeMetrics()) {
      var distance = 0.0;
      while (distance < metric.length) {
        canvas.drawPath(metric.extractPath(distance, distance + dash), paint);
        distance += dash + gap;
      }
    }
  }

  @override
  bool shouldRepaint(_DashedBorderPainter oldDelegate) => color != oldDelegate.color;
}
