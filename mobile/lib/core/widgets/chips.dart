import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../app/theme/theme.dart';

/// Interactive filter chip (DESIGN_SYSTEM §8.2): pill, `surfaceRaised` +
/// `borderStrong`; selected → sage-tint bg + sage border + sage-deep 600
/// text. Selection haptic per §7; 44pt minimum target via padding.
class FilterChipPill extends StatelessWidget {
  const FilterChipPill({
    required this.label,
    required this.selected,
    required this.onTap,
    super.key,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      child: InkWell(
        borderRadius: BorderRadius.circular(SteepleTokens.radiusPill),
        onTap: () {
          HapticFeedback.selectionClick();
          onTap();
        },
        child: AnimatedContainer(
          duration: SteepleTokens.durFast,
          curve: Curves.easeOutCubic,
          constraints: const BoxConstraints(minHeight: SteepleTokens.touchTargetMin),
          padding: const EdgeInsets.symmetric(horizontal: SteepleTokens.space4),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: selected ? colors.selectedBg : colors.surfaceRaised,
            borderRadius: BorderRadius.circular(SteepleTokens.radiusPill),
            border: Border.all(
              color: selected ? colors.selectedFill : colors.borderStrong,
            ),
          ),
          child: Text(
            label,
            style: SteepleTypography.bodySm.copyWith(
              color: selected ? colors.selectedFg : colors.textPrimary,
              fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
            ),
          ),
        ),
      ),
    );
  }
}

/// Static tag chip (§8.2): sage-tint bg, sage-deep text, no border. The
/// overflow variant ("+3") uses `surface` + `textTertiary`.
class TagChip extends StatelessWidget {
  const TagChip({required this.label, this.overflow = false, super.key});

  final String label;
  final bool overflow;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: SteepleTokens.space2 + 2,
        vertical: 2,
      ),
      decoration: BoxDecoration(
        color: overflow ? colors.surface : colors.selectedBg,
        borderRadius: BorderRadius.circular(SteepleTokens.radiusPill),
      ),
      child: Text(
        label,
        style: SteepleTypography.caption.copyWith(
          color: overflow ? colors.textTertiary : colors.selectedFg,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
