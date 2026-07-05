import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/theme.dart';
import '../../../core/models/models.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../providers.dart';

/// Known filter tokens (CONTRACTS §2.1 registry). Unknown server additions
/// simply don't appear as filters — search itself tolerates any token.
const activityTokens = [
  'children', 'sports', 'community', 'religious', 'arts', 'education', 'music', //
];
const accessibilityTokens = [
  'stepFreeAccess', 'accessibleRestroom', 'accessibleParking', 'hearingLoop', 'liftAccess', //
];
const _capacitySteps = [10, 25, 50, 100];

/// Filters open as a bottom sheet, not a route (MOBILE_CONTRACTS §7).
/// Multi-value matching is AND — "accepts all requested" — so the copy says
/// "must have every one you pick".
Future<void> showFilterSheet(BuildContext context) => showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => const _FilterSheet(),
    );

class _FilterSheet extends ConsumerStatefulWidget {
  const _FilterSheet();

  @override
  ConsumerState<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends ConsumerState<_FilterSheet> {
  /// Weekday wire tokens, Sunday-first (matches the apply schedule's
  /// weekday multi-select — MOBILE_CONTRACTS §5).
  static const _days = [
    'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', //
  ];
  static const _dayAbbrev = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  static const _timeBands = [('morning', 'Morning'), ('afternoon', 'Afternoon'), ('evening', 'Evening')];

  /// Progressive disclosure for the weekly chips — starts open when a
  /// weekly selection already exists (e.g. sheet reopened).
  late bool _weeklyExpanded;

  @override
  void initState() {
    super.initState();
    _weeklyExpanded = ref.read(searchFiltersProvider).when.daysOfWeek.isNotEmpty;
  }

  String _fmtDate(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  String _fmtTime(TimeOfDay t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  Future<void> _pickDate(SearchFiltersNotifier notifier) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      firstDate: now,
      lastDate: now.add(const Duration(days: 365)),
      initialDate: now,
    );
    if (picked == null) return;
    setState(() => _weeklyExpanded = false);
    notifier.setWhenDate(_fmtDate(picked));
  }

  Future<void> _pickCustomTime(
    SearchFiltersNotifier notifier,
    WhenFilter when, {
    required bool isEnd,
  }) async {
    final current = isEnd ? when.endTime : when.startTime;
    final parts = (current ?? (isEnd ? '17:00' : '09:00')).split(':');
    final picked = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: int.parse(parts[0]), minute: int.parse(parts[1])),
    );
    if (picked == null) return;
    final hhmm = _fmtTime(picked);
    notifier.setWhenCustomRange(
      isEnd ? when.startTime : hhmm,
      isEnd ? hhmm : when.endTime,
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    final filters = ref.watch(searchFiltersProvider);
    final notifier = ref.read(searchFiltersProvider.notifier);
    final when = filters.when;

    Widget legend(String text) => Padding(
          padding: const EdgeInsets.only(
            top: SteepleTokens.space6,
            bottom: SteepleTokens.space3,
          ),
          child: Text(
            text.toUpperCase(),
            style: SteepleTypography.label.copyWith(color: colors.textTertiary),
          ),
        );

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.75,
      maxChildSize: 0.95,
      builder: (context, scrollController) => Column(
        children: [
          Expanded(
            child: ListView(
              controller: scrollController,
              padding: const EdgeInsets.symmetric(horizontal: SteepleTokens.gutter),
              children: [
                Text(
                  'Filter spaces',
                  style: SteepleTypography.headlineSerif.copyWith(color: colors.textPrimary),
                ),
                legend('Cost'),
                Wrap(
                  spacing: SteepleTokens.space2,
                  children: [
                    FilterChipPill(
                      label: 'Free only',
                      selected: filters.freeOnly,
                      onTap: () => notifier.setFreeOnly(!filters.freeOnly),
                    ),
                  ],
                ),
                legend('When'),
                Wrap(
                  spacing: SteepleTokens.space2,
                  children: [
                    FilterChipPill(
                      label: 'Any time',
                      selected: when.isAny,
                      onTap: () {
                        setState(() => _weeklyExpanded = false);
                        notifier.clearWhen();
                      },
                    ),
                  ],
                ),
                const SizedBox(height: SteepleTokens.space3),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => _pickDate(notifier),
                        style: OutlinedButton.styleFrom(
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(SteepleTokens.radiusSm),
                          ),
                          alignment: Alignment.centerLeft,
                        ),
                        child: Text(
                          when.date == null ? 'Pick a date' : monthDay(when.date!),
                          style: SteepleTypography.bodySm.copyWith(
                            color: when.date == null ? colors.textTertiary : colors.textPrimary,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: SteepleTokens.space3),
                FilterChipPill(
                  label: 'Weekly on…',
                  selected: _weeklyExpanded,
                  onTap: () => setState(() => _weeklyExpanded = !_weeklyExpanded),
                ),
                if (_weeklyExpanded) ...[
                  const SizedBox(height: SteepleTokens.space2),
                  Wrap(
                    spacing: SteepleTokens.space2,
                    runSpacing: SteepleTokens.space2,
                    children: [
                      for (var i = 0; i < _days.length; i++)
                        FilterChipPill(
                          label: _dayAbbrev[i],
                          selected: when.daysOfWeek.contains(_days[i]),
                          onTap: () => notifier.toggleWhenDay(_days[i]),
                        ),
                    ],
                  ),
                ],
                const SizedBox(height: SteepleTokens.space3),
                Text(
                  'Time of day',
                  style: SteepleTypography.caption.copyWith(color: colors.textSecondary),
                ),
                const SizedBox(height: SteepleTokens.space2),
                Wrap(
                  spacing: SteepleTokens.space2,
                  runSpacing: SteepleTokens.space2,
                  children: [
                    for (final band in _timeBands)
                      FilterChipPill(
                        label: band.$2,
                        selected: when.timeOfDay == band.$1,
                        onTap: () => notifier.setWhenTimeOfDay(
                          when.timeOfDay == band.$1 ? null : band.$1,
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: SteepleTokens.space2),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => _pickCustomTime(notifier, when, isEnd: false),
                        style: OutlinedButton.styleFrom(
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(SteepleTokens.radiusSm),
                          ),
                          alignment: Alignment.centerLeft,
                        ),
                        child: Text(
                          when.timeOfDay == null && when.startTime != null
                              ? time12(when.startTime!)
                              : 'From',
                          style: SteepleTypography.bodySm.copyWith(
                            color: when.startTime == null
                                ? colors.textTertiary
                                : colors.textPrimary,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: SteepleTokens.space2),
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => _pickCustomTime(notifier, when, isEnd: true),
                        style: OutlinedButton.styleFrom(
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(SteepleTokens.radiusSm),
                          ),
                          alignment: Alignment.centerLeft,
                        ),
                        child: Text(
                          when.timeOfDay == null && when.endTime != null
                              ? time12(when.endTime!)
                              : 'To',
                          style: SteepleTypography.bodySm.copyWith(
                            color: when.endTime == null
                                ? colors.textTertiary
                                : colors.textPrimary,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                legend('Good for'),
                Wrap(
                  spacing: SteepleTokens.space2,
                  runSpacing: SteepleTokens.space2,
                  children: [
                    for (final token in activityTokens)
                      FilterChipPill(
                        label: wireTokenLabel(token),
                        selected: filters.activities.contains(token),
                        onTap: () => notifier.toggleActivity(token),
                      ),
                  ],
                ),
                legend('Accessibility'),
                Text(
                  'Spaces must have every feature you pick.',
                  style: SteepleTypography.caption.copyWith(color: colors.textSecondary),
                ),
                const SizedBox(height: SteepleTokens.space3),
                Wrap(
                  spacing: SteepleTokens.space2,
                  runSpacing: SteepleTokens.space2,
                  children: [
                    for (final token in accessibilityTokens)
                      FilterChipPill(
                        label: wireTokenLabel(token),
                        selected: filters.accessibility.contains(token),
                        onTap: () => notifier.toggleAccessibility(token),
                      ),
                  ],
                ),
                legend('Space for'),
                Wrap(
                  spacing: SteepleTokens.space2,
                  children: [
                    for (final capacity in _capacitySteps)
                      FilterChipPill(
                        label: '$capacity+',
                        selected: filters.minCapacity == capacity,
                        onTap: () => notifier.setMinCapacity(
                          filters.minCapacity == capacity ? null : capacity,
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: SteepleTokens.space8),
              ],
            ),
          ),
          // Sticky footer: clear + done.
          Container(
            padding: const EdgeInsets.all(SteepleTokens.gutter),
            decoration: BoxDecoration(
              color: colors.surfaceRaised,
              border: Border(top: BorderSide(color: colors.border)),
            ),
            child: SafeArea(
              top: false,
              child: Row(
                children: [
                  TextButton(
                    onPressed: filters.activeCount == 0 ? null : notifier.clear,
                    child: const Text('Clear all'),
                  ),
                  const Spacer(),
                  FilledButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('Show spaces'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
