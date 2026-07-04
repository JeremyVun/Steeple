import 'package:flutter/material.dart';

import '../theme/theme.dart';

/// Unskippable when `mobile.force_upgrade` is on (CONTRACTS §8): the server
/// decided this build is broken. Calm, honest copy (DESIGN_SYSTEM §1.5) —
/// no urgency mechanics, just the one action.
///
/// Store-listing URLs land with release setup (ROADMAP Phase 4 release step);
/// until then the button is informational.
class ForceUpgradeScreen extends StatelessWidget {
  const ForceUpgradeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(SteepleTokens.space6),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Icon(Icons.system_update_alt_rounded, size: 48, color: colors.textSecondary),
              const SizedBox(height: SteepleTokens.space5),
              Text(
                'Time for an update',
                textAlign: TextAlign.center,
                style: SteepleTypography.headlineSerif.copyWith(color: colors.textPrimary),
              ),
              const SizedBox(height: SteepleTokens.space3),
              Text(
                'This version of Steeple no longer works with our service. '
                'Update from the app store to keep browsing and booking spaces.',
                textAlign: TextAlign.center,
                style: SteepleTypography.body.copyWith(color: colors.textSecondary),
              ),
              const SizedBox(height: SteepleTokens.space8),
              // Wired to the store listing once it exists (TestFlight first).
              const FilledButton(
                onPressed: null,
                child: Text('Open the app store'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
