import 'package:flutter/material.dart';

import '../../app/theme/theme.dart';

/// Shimmer host (DESIGN_SYSTEM §8.7): `surface`-colored blocks mirroring the
/// real layout, subtle 1.2 s shimmer, static under reduced motion. Skeletons
/// appear on FIRST load only — refreshes keep stale content on screen.
class Skeleton extends StatefulWidget {
  const Skeleton({required this.child, super.key});

  final Widget child;

  @override
  State<Skeleton> createState() => _SkeletonState();
}

class _SkeletonState extends State<Skeleton> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1200),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _controller.stop();
    } else if (!_controller.isAnimating) {
      _controller.repeat();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) => Opacity(
        // 1.0 → 0.55 → 1.0: reads as breathing, not flashing.
        opacity: 0.55 + 0.45 * (1 - _controller.value * 2).abs(),
        child: child,
      ),
      child: widget.child,
    );
  }
}

/// A single skeleton block; compose these to mirror real layouts.
class SkeletonBlock extends StatelessWidget {
  const SkeletonBlock({this.width, this.height = 14, this.radius = SteepleTokens.radiusSm, super.key});

  final double? width;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: context.steepleColors.surface,
        borderRadius: BorderRadius.circular(radius),
      ),
    );
  }
}

/// Mirrors [ListingCard]'s anatomy (photo, title, meta, chips).
class SkeletonListingCard extends StatelessWidget {
  const SkeletonListingCard({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(SteepleTokens.radiusMd),
        border: Border.all(color: colors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius:
                const BorderRadius.vertical(top: Radius.circular(SteepleTokens.radiusMd)),
            child: AspectRatio(
              aspectRatio: 4 / 3,
              child: ColoredBox(color: colors.surface),
            ),
          ),
          const Padding(
            padding: EdgeInsets.all(SteepleTokens.space4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SkeletonBlock(width: 180, height: 16),
                SizedBox(height: SteepleTokens.space2),
                SkeletonBlock(width: 220),
                SizedBox(height: SteepleTokens.space2),
                SkeletonBlock(width: 90),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// A shimmering column of [SkeletonListingCard]s for first loads.
class SkeletonList extends StatelessWidget {
  const SkeletonList({this.itemCount = 3, super.key});

  final int itemCount;

  @override
  Widget build(BuildContext context) {
    return Skeleton(
      child: ListView.separated(
        padding: const EdgeInsets.all(SteepleTokens.gutter),
        physics: const NeverScrollableScrollPhysics(),
        itemCount: itemCount,
        separatorBuilder: (context, _) => const SizedBox(height: SteepleTokens.space3),
        itemBuilder: (context, _) => const SkeletonListingCard(),
      ),
    );
  }
}
