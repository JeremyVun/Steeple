import 'package:flutter/material.dart';

import '../theme/theme.dart';

/// Held by the router only while the session restore resolves
/// (`SessionUnknown` — MOBILE_CONTRACTS §7). Paper background + serif
/// wordmark; no spinner for a sub-second hold, no animation to respect
/// reduced motion trivially.
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    return Scaffold(
      body: Center(
        child: Text(
          'Steeple',
          style: SteepleTypography.displaySerif.copyWith(color: colors.textPrimary),
        ),
      ),
    );
  }
}
