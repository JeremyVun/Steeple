import 'package:flutter/material.dart';

import '../../app/theme/theme.dart';
import 'availability_day_state.dart';

/// The mandatory calendar legend (DESIGN_SYSTEM §8.10): a compact wrapping row
/// of the four meaningful states — Open, Partly booked, Booked out, Closed —
/// each a small color swatch (matching the day-cell fill) plus its label.
/// Rendered wherever the availability calendar or strip appears.
class AvailabilityLegend extends StatelessWidget {
  const AvailabilityLegend({super.key});

  static const _entries = <(DayState, String)>[
    (DayState.open, 'Open'),
    (DayState.partlyBooked, 'Partly booked'),
    (DayState.bookedOut, 'Booked out'),
    (DayState.closed, 'Closed'),
  ];

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    return Wrap(
      spacing: SteepleTokens.space4,
      runSpacing: SteepleTokens.space2,
      children: [
        for (final (state, label) in _entries)
          _LegendChip(visual: dayStateVisual(state, colors), label: label, colors: colors),
      ],
    );
  }
}

class _LegendChip extends StatelessWidget {
  const _LegendChip({required this.visual, required this.label, required this.colors});

  final DayStateVisual visual;
  final String label;
  final SteepleColors colors;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 14,
          height: 14,
          decoration: BoxDecoration(
            color: visual.background,
            borderRadius: BorderRadius.circular(SteepleTokens.space1),
            border: Border.all(color: colors.border),
          ),
          alignment: Alignment.center,
          child: visual.dot
              ? Container(
                  width: 5,
                  height: 5,
                  decoration: BoxDecoration(color: colors.warning.fg, shape: BoxShape.circle),
                )
              : null,
        ),
        const SizedBox(width: SteepleTokens.space2),
        Text(
          label,
          style: SteepleTypography.caption.copyWith(color: colors.textSecondary),
        ),
      ],
    );
  }
}
