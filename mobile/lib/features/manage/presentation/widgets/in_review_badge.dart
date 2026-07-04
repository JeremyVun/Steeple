import 'package:flutter/material.dart';

import '../../../../app/theme/theme.dart';

/// A publish request isn't a wire status token (it's `publishRequestedAtUtc`
/// alongside `status: draft`), so it renders as its own small badge rather
/// than through [StatusChip]'s status-token mapping. Shared by the manage
/// home list and the room detail screen.
class InReviewBadge extends StatelessWidget {
  const InReviewBadge({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: SteepleTokens.space3,
        vertical: SteepleTokens.space1,
      ),
      decoration: BoxDecoration(
        color: colors.warning.bg,
        borderRadius: BorderRadius.circular(SteepleTokens.radiusPill),
      ),
      child: Text(
        'In review',
        style: SteepleTypography.bodySm.copyWith(
          color: colors.warning.fg,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
