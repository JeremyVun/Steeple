import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/theme/theme.dart';
import '../../../core/auth/session_manager.dart';
import '../../../core/auth/session_state.dart';
import '../../../core/flags/flags_service.dart';
import '../../../core/models/models.dart';
import '../../../core/navigation/route_names.dart';
import '../../../core/widgets/widgets.dart';
import '../../manage/providers.dart';
import '../providers.dart';

/// Profile tab. Signed out: sign-in CTA + legal links. Signed in: account,
/// recorded agreements, sign out, and in-app account deletion
/// (Apple 5.1.1(v) — non-negotiable for store approval).
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.steepleColors;
    final session = ref.watch(sessionProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: switch (session) {
        SignedIn() => const _SignedInView(),
        _ => ListView(
            padding: const EdgeInsets.all(SteepleTokens.gutter),
            children: [
              const SizedBox(height: SteepleTokens.space8),
              Text(
                'Your corner of Steeple',
                textAlign: TextAlign.center,
                style: SteepleTypography.headlineSerif.copyWith(color: colors.textPrimary),
              ),
              const SizedBox(height: SteepleTokens.space2),
              Text(
                'Sign in to see your applications, bookings, and messages from churches.',
                textAlign: TextAlign.center,
                style: SteepleTypography.bodySm.copyWith(color: colors.textSecondary),
              ),
              const SizedBox(height: SteepleTokens.space6),
              FilledButton(
                onPressed: () => showSsoSheet(context, trigger: 'profile'),
                child: const Text('Sign in'),
              ),
              const SizedBox(height: SteepleTokens.space10),
              const _LegalLinks(),
            ],
          ),
      },
    );
  }
}

class _SignedInView extends ConsumerWidget {
  const _SignedInView();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.steepleColors;
    final me = ref.watch(meProvider);

    return AsyncValueView<MeResponse>(
      value: me,
      onRetry: () => ref.invalidate(meProvider),
      data: (profile) => ListView(
        padding: const EdgeInsets.all(SteepleTokens.gutter),
        children: [
          Text(
            profile.displayName,
            style: SteepleTypography.displaySerif.copyWith(color: colors.textPrimary),
          ),
          if (profile.email != null)
            Text(
              profile.email!,
              style: SteepleTypography.bodySm.copyWith(color: colors.textSecondary),
            ),
          const SizedBox(height: SteepleTokens.space3),
          Row(
            children: [
              Icon(Icons.check_rounded, size: 16, color: colors.selectedFg),
              const SizedBox(width: SteepleTokens.space1),
              Text(
                'Identity verified (SSO)',
                style: SteepleTypography.caption.copyWith(color: colors.selectedFg),
              ),
            ],
          ),
          const SizedBox(height: SteepleTokens.space6),
          if (profile.agreements.isNotEmpty) ...[
            Text(
              'AGREEMENTS',
              style: SteepleTypography.label.copyWith(color: colors.textTertiary),
            ),
            const SizedBox(height: SteepleTokens.space2),
            for (final agreement in profile.agreements)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: SteepleTokens.space1),
                child: Text(
                  '${agreement.docType == 'tos' ? 'Terms of service' : 'Privacy policy'} '
                  '${agreement.version} — accepted '
                  '${agreement.acceptedAtUtc.year}-${agreement.acceptedAtUtc.month.toString().padLeft(2, '0')}-${agreement.acceptedAtUtc.day.toString().padLeft(2, '0')}',
                  style: SteepleTypography.bodySm.copyWith(color: colors.textSecondary),
                ),
              ),
            const SizedBox(height: SteepleTokens.space6),
          ],
          const _ManageEntryPoint(),
          OutlinedButton(
            onPressed: () => ref.read(sessionManagerProvider).signOut(),
            child: const Text('Sign out'),
          ),
          const SizedBox(height: SteepleTokens.space3),
          TextButton(
            style: TextButton.styleFrom(foregroundColor: colors.danger.fg),
            onPressed: () => _confirmDelete(context, ref),
            child: const Text('Delete account'),
          ),
          const SizedBox(height: SteepleTokens.space8),
          const _LegalLinks(),
        ],
      ),
    );
  }

  Future<void> _confirmDelete(BuildContext context, WidgetRef ref) async {
    final colors = context.steepleColors;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete your account?'),
        content: const Text(
          'This removes your profile and signs you out everywhere. '
          'Applications and bookings are anonymized. This cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Keep my account'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: colors.danger.fg),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await ref.read(profileRepositoryProvider).deleteAccount();
    await ref.read(sessionManagerProvider).forceSignOut();
  }
}

/// "Your spaces" entry point into the manage surface (Phase 5), behind
/// `mobile.manage_enabled` — default closed. Hidden entirely (not a
/// loading/error state) unless the flag is on AND the caller manages at
/// least one venue, so organizer-only accounts never see a dead end.
class _ManageEntryPoint extends ConsumerWidget {
  const _ManageEntryPoint();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final flags = ref.watch(flagsProvider);
    if (!flags.isEnabled(FlagKeys.manageEnabled, orElse: false)) {
      return const SizedBox.shrink();
    }

    final venues = ref.watch(manageVenuesProvider);
    final list = venues.value;
    if (list == null || list.isEmpty) return const SizedBox.shrink();

    final colors = context.steepleColors;
    return Padding(
      padding: const EdgeInsets.only(bottom: SteepleTokens.space6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'YOUR SPACES',
            style: SteepleTypography.label.copyWith(color: colors.textTertiary),
          ),
          const SizedBox(height: SteepleTokens.space2),
          for (final venue in list)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: SteepleTokens.space1),
              child: Text(
                venue.name,
                style: SteepleTypography.bodySm.copyWith(color: colors.textPrimary),
              ),
            ),
          const SizedBox(height: SteepleTokens.space2),
          OutlinedButton(
            onPressed: () => context.pushNamed(RouteNames.manage),
            child: const Text('Manage your spaces'),
          ),
        ],
      ),
    );
  }
}

class _LegalLinks extends StatelessWidget {
  const _LegalLinks();

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    return Column(
      children: [
        Text(
          'Steeple — spaces shared by neighborhood churches',
          textAlign: TextAlign.center,
          style: SteepleTypography.caption.copyWith(color: colors.textTertiary),
        ),
        const SizedBox(height: SteepleTokens.space2),
        // TODO(release): link to the hosted terms/privacy pages once the
        // canonical web host is configured for this build.
        Text(
          'Terms of service · Privacy policy',
          textAlign: TextAlign.center,
          style: SteepleTypography.caption.copyWith(color: colors.link),
        ),
      ],
    );
  }
}
