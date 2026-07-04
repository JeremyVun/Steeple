import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/theme/theme.dart';
import '../../../core/auth/session_manager.dart';
import '../../../core/auth/session_state.dart';
import '../../../core/navigation/route_names.dart';
import '../../../core/widgets/widgets.dart';

/// The `/signin` modal route: guarded tabs redirect here with `?from=`
/// (MOBILE_CONTRACTS §7); once signed in, the router redirect sends the user
/// back through the sanitized `from` path.
class SignInScreen extends ConsumerWidget {
  const SignInScreen({this.from, super.key});

  final String? from;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.steepleColors;

    // The router redirect handles SignedIn → `from`; this listener only
    // covers the case where the sheet completes while this screen shows.
    ref.listen(sessionProvider, (previous, next) {
      if (next is SignedIn && context.canPop()) context.pop();
    });

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.close_rounded),
          tooltip: 'Close',
          onPressed: () =>
              context.canPop() ? context.pop() : context.goNamed(RouteNames.explore),
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.all(SteepleTokens.gutter),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Steeple',
              textAlign: TextAlign.center,
              style: SteepleTypography.displaySerif.copyWith(color: colors.textPrimary),
            ),
            const SizedBox(height: SteepleTokens.space2),
            Text(
              'Your inbox and bookings live behind sign-in.',
              textAlign: TextAlign.center,
              style: SteepleTypography.bodySm.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: SteepleTokens.space8),
            FilledButton(
              onPressed: () => showSsoSheet(context, trigger: 'gate'),
              child: const Text('Sign in'),
            ),
            const SizedBox(height: SteepleTokens.space3),
            TextButton(
              onPressed: () => context.goNamed(RouteNames.explore),
              child: const Text('Keep browsing'),
            ),
          ],
        ),
      ),
    );
  }
}
