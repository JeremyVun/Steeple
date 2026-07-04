import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme/theme.dart';
import '../connectivity/connectivity_provider.dart';

/// Non-blocking connectivity notice under the app bar (DESIGN_SYSTEM §8.7):
/// warning tint, honest copy, no spinner — cached content keeps rendering
/// and mutations fail with their own retry affordances (MOBILE_DESIGN §5).
class OfflineBanner extends ConsumerWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final online = ref.watch(isOnlineProvider);
    final colors = context.steepleColors;
    return AnimatedSwitcher(
      duration: SteepleTokens.durBase,
      child: online
          ? const SizedBox.shrink()
          : Semantics(
              liveRegion: true,
              child: Container(
                width: double.infinity,
                color: colors.warning.bg,
                padding: const EdgeInsets.symmetric(
                  horizontal: SteepleTokens.gutter,
                  vertical: SteepleTokens.space2,
                ),
                child: Text(
                  "You're offline — showing saved results",
                  style: SteepleTypography.bodySm.copyWith(color: colors.warning.fg),
                ),
              ),
            ),
    );
  }
}
