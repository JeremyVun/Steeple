import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/theme/theme.dart';
import '../../../core/models/models.dart';
import '../../../core/navigation/route_names.dart';
import '../../../core/widgets/widgets.dart';
import '../providers.dart';
import 'filter_sheet.dart';
import 'map_view.dart';

/// Explore: list-first browse with a map toggle, filter chips, and the
/// filter sheet. Anonymous by design — sign-in only appears at apply
/// (PRD: friction only at commitment).
class ExploreScreen extends ConsumerStatefulWidget {
  const ExploreScreen({super.key});

  @override
  ConsumerState<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends ConsumerState<ExploreScreen> {
  bool _showMap = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    final filters = ref.watch(searchFiltersProvider);
    final results = ref.watch(searchResultsProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Find a space',
          style: SteepleTypography.headlineSerif.copyWith(color: colors.textPrimary),
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: SteepleTokens.space2),
            child: Semantics(
              button: true,
              label: _showMap ? 'Show list' : 'Show map',
              child: TextButton.icon(
                onPressed: () => setState(() => _showMap = !_showMap),
                icon: Icon(_showMap ? Icons.view_list_rounded : Icons.map_rounded, size: 18),
                label: Text(_showMap ? 'List' : 'Map'),
              ),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          _FilterRow(filters: filters),
          Expanded(
            child: _showMap
                ? const DiscoveryMapView()
                : AsyncValueView<ListingSearchResult>(
                    value: results,
                    skeleton: () => const SkeletonList(),
                    onRetry: () => ref.read(searchResultsProvider.notifier).refresh(),
                    data: (result) => _ResultsList(result: result),
                  ),
          ),
        ],
      ),
    );
  }
}

class _FilterRow extends ConsumerWidget {
  const _FilterRow({required this.filters});

  final SearchFilters filters;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifier = ref.read(searchFiltersProvider.notifier);
    return SizedBox(
      height: SteepleTokens.space12,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: SteepleTokens.gutter),
        children: [
          Center(
            child: FilterChipPill(
              label: filters.activeCount > 0 ? 'Filters · ${filters.activeCount}' : 'Filters',
              selected: filters.activeCount > 0,
              onTap: () => showFilterSheet(context),
            ),
          ),
          const SizedBox(width: SteepleTokens.space2),
          Center(
            child: FilterChipPill(
              label: 'Free only',
              selected: filters.freeOnly,
              onTap: () => notifier.setFreeOnly(!filters.freeOnly),
            ),
          ),
          const SizedBox(width: SteepleTokens.space2),
          for (final token in ['children', 'community', 'music']) ...[
            Center(
              child: FilterChipPill(
                label: wireTokenLabel(token),
                selected: filters.activities.contains(token),
                onTap: () => notifier.toggleActivity(token),
              ),
            ),
            const SizedBox(width: SteepleTokens.space2),
          ],
        ],
      ),
    );
  }
}

class _ResultsList extends ConsumerWidget {
  const _ResultsList({required this.result});

  final ListingSearchResult result;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.steepleColors;
    if (result.isZeroResult || result.items.isEmpty) {
      return ListView(
        children: [
          const SizedBox(height: SteepleTokens.space10),
          EmptyState(
            icon: Icons.search_off_rounded,
            title: 'No spaces here yet',
            body: 'Try fewer filters, or widen your search area on the map.',
            action: OutlinedButton(
              onPressed: () => ref.read(searchFiltersProvider.notifier).clear(),
              child: const Text('Clear filters'),
            ),
          ),
        ],
      );
    }

    return RefreshIndicator(
      onRefresh: () => ref.read(searchResultsProvider.notifier).refresh(),
      child: ListView.separated(
        padding: const EdgeInsets.all(SteepleTokens.gutter),
        itemCount: result.items.length + 1,
        separatorBuilder: (context, _) => const SizedBox(height: SteepleTokens.space3),
        itemBuilder: (context, index) {
          if (index == 0) {
            final n = result.totalCount;
            return Padding(
              padding: const EdgeInsets.only(bottom: SteepleTokens.space1),
              child: Text(
                n == 1 ? '1 space nearby' : '$n spaces nearby',
                style: SteepleTypography.caption.copyWith(color: colors.textSecondary),
              ),
            );
          }
          final room = result.items[index - 1];
          return ListingCard(
            summary: room,
            onTap: () => context.goNamed(
              RouteNames.listing,
              pathParameters: {'venueSlug': room.venueSlug, 'roomSlug': room.roomSlug},
            ),
          );
        },
      ),
    );
  }
}
