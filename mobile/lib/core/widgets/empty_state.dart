import 'package:flutter/material.dart';

import '../../app/theme/theme.dart';

/// DESIGN_SYSTEM §8.7: dashed border, centered icon (never emoji), serif
/// title, and copy that always says what to *do* ("Widen your search area").
class EmptyState extends StatelessWidget {
  const EmptyState({
    required this.icon,
    required this.title,
    this.body,
    this.action,
    super.key,
  });

  final IconData icon;
  final String title;
  final String? body;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    return Padding(
      padding: const EdgeInsets.all(SteepleTokens.space4),
      child: CustomPaint(
        painter: _DashedBorderPainter(color: colors.borderStrong),
        child: Padding(
          padding: const EdgeInsets.all(SteepleTokens.space6),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 40, color: colors.textTertiary),
              const SizedBox(height: SteepleTokens.space4),
              Text(
                title,
                textAlign: TextAlign.center,
                style: SteepleTypography.headlineSerif.copyWith(color: colors.textPrimary),
              ),
              if (body != null) ...[
                const SizedBox(height: SteepleTokens.space2),
                Text(
                  body!,
                  textAlign: TextAlign.center,
                  style: SteepleTypography.bodySm.copyWith(color: colors.textSecondary),
                ),
              ],
              if (action != null) ...[
                const SizedBox(height: SteepleTokens.space5),
                action!,
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _DashedBorderPainter extends CustomPainter {
  const _DashedBorderPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    const dash = 6.0;
    const gap = 5.0;
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
