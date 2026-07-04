import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/theme.dart';
import '../../../core/models/models.dart';
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

class _FilterSheet extends ConsumerWidget {
  const _FilterSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.steepleColors;
    final filters = ref.watch(searchFiltersProvider);
    final notifier = ref.read(searchFiltersProvider.notifier);

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
