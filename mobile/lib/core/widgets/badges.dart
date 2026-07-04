import 'package:flutter/material.dart';

import '../../app/theme/theme.dart';

/// The single most brand-loaded element (DESIGN_SYSTEM §8.3): solid sage,
/// white 700 text, pill. Never restyle it.
class FreeBadge extends StatelessWidget {
  const FreeBadge({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    return Semantics(
      label: 'Free to use',
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: SteepleTokens.space3,
          vertical: SteepleTokens.space1,
        ),
        decoration: BoxDecoration(
          color: colors.selectedFill,
          borderRadius: BorderRadius.circular(SteepleTokens.radiusPill),
        ),
        child: Text(
          'FREE',
          style: SteepleTypography.bodySm.copyWith(
            color: Colors.white,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.5,
          ),
        ),
      ),
    );
  }
}

/// Price pill: `surfaceRaised` bg, ink text, `borderStrong` border (§8.3).
class PriceBadge extends StatelessWidget {
  const PriceBadge({required this.price, required this.currency, super.key});

  final double price;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    final display = _format(price, currency);
    return Semantics(
      label: '$display per hour',
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: SteepleTokens.space3,
          vertical: SteepleTokens.space1,
        ),
        decoration: BoxDecoration(
          color: colors.surfaceRaised,
          borderRadius: BorderRadius.circular(SteepleTokens.radiusPill),
          border: Border.all(color: colors.borderStrong),
        ),
        child: Text(
          '$display/hr',
          style: SteepleTypography.bodySm.copyWith(
            color: colors.textPrimary,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }

  static String _format(double price, String currency) {
    final symbol = currency == 'USD' ? r'$' : '$currency ';
    final whole = price == price.roundToDouble();
    return '$symbol${whole ? price.toStringAsFixed(0) : price.toStringAsFixed(2)}';
  }
}
