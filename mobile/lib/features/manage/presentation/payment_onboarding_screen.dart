import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/theme.dart';
import '../../../core/analytics/analytics_service.dart';
import '../../../core/auth/session_manager.dart';
import '../../../core/auth/session_state.dart';
import '../../../core/models/models.dart';
import '../../../core/widgets/widgets.dart';
import '../application/payment_onboarding_provider.dart';
import '../providers.dart';

class PaymentOnboardingScreen extends ConsumerStatefulWidget {
  const PaymentOnboardingScreen({required this.venueId, super.key});

  final String venueId;

  @override
  ConsumerState<PaymentOnboardingScreen> createState() =>
      _PaymentOnboardingScreenState();
}

class _PaymentOnboardingScreenState
    extends ConsumerState<PaymentOnboardingScreen> {
  late final AppLifecycleListener _lifecycle;
  bool _openingLink = false;
  bool _savingPreference = false;

  @override
  void initState() {
    super.initState();
    ref.read(analyticsProvider).track(AnalyticsEvents.payoutStepOpened, {
      'state': 'prompt',
      'surface': 'mobile',
    });
    _lifecycle = AppLifecycleListener(
      onResume: () => unawaited(
        ref.read(venuePaymentProvider(widget.venueId).notifier).refresh(),
      ),
    );
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(venuePaymentProvider(widget.venueId));
    return Scaffold(
      appBar: AppBar(title: const Text('Payments')),
      body: AsyncValueView(
        value: state,
        skeleton: () => const SkeletonList(itemCount: 3),
        onRetry: () =>
            ref.read(venuePaymentProvider(widget.venueId).notifier).refresh(),
        data: (payment) => RefreshIndicator(
          onRefresh: () =>
              ref.read(venuePaymentProvider(widget.venueId).notifier).refresh(),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(SteepleTokens.gutter),
            children: [
              _StatusCard(payment: payment),
              const SizedBox(height: SteepleTokens.space5),
              _BrowserInstructions(payment: payment),
              const SizedBox(height: SteepleTokens.space5),
              if (payment.statusValue != PaymentOnboardingStatus.ready)
                FilledButton.icon(
                  key: const Key('payment-onboarding-action'),
                  onPressed: _openingLink ? null : _openOnboarding,
                  icon: _openingLink
                      ? const SizedBox.square(
                          dimension: SteepleTokens.space4,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.open_in_browser_rounded),
                  label: Text(
                    payment.statusValue == PaymentOnboardingStatus.notStarted
                        ? 'Set up with Stripe'
                        : 'Continue in Stripe',
                  ),
                ),
              if (payment.canOpenDashboard) ...[
                if (payment.statusValue != PaymentOnboardingStatus.ready)
                  const SizedBox(height: SteepleTokens.space3),
                OutlinedButton.icon(
                  key: const Key('payment-dashboard-action'),
                  onPressed: _openingLink ? null : _openDashboard,
                  icon: const Icon(Icons.open_in_new_rounded),
                  label: const Text('Open Stripe dashboard'),
                ),
              ],
              if (payment.canChoosePreference) ...[
                const SizedBox(height: SteepleTokens.space6),
                _PreferenceCard(
                  payment: payment,
                  saving: _savingPreference,
                  onChanged: _savePreference,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _openOnboarding() async {
    await _openLink(
      () => ref
          .read(venuePaymentProvider(widget.venueId).notifier)
          .startOnboarding(),
    );
  }

  Future<void> _openDashboard() async {
    await _openLink(
      () => ref.read(venuePaymentProvider(widget.venueId).notifier).dashboard(),
    );
  }

  Future<void> _openLink(
    Future<PaymentExternalLink> Function() createLink,
  ) async {
    final venueId = widget.venueId;
    final session = ref.read(sessionProvider);
    if (session is! SignedIn) return;
    setState(() => _openingLink = true);
    try {
      final link = await createLink();
      if (!mounted ||
          widget.venueId != venueId ||
          ModalRoute.of(context)?.isCurrent != true ||
          link.mock) {
        return;
      }
      final currentSession = ref.read(sessionProvider);
      if (currentSession is! SignedIn ||
          currentSession.user.id != session.user.id) {
        return;
      }
      final opened = await ref.read(paymentLinkLauncherProvider).open(link.url);
      if (!opened && mounted) _showMessage("Couldn't open Stripe. Try again.");
    } catch (_) {
      if (mounted) _showMessage("Couldn't open Stripe. Try again.");
    } finally {
      if (mounted) setState(() => _openingLink = false);
    }
  }

  Future<void> _savePreference(bool optedIn) async {
    setState(() => _savingPreference = true);
    try {
      await ref
          .read(venuePaymentProvider(widget.venueId).notifier)
          .setOptIn(optedIn);
      if (mounted) {
        _showMessage(
          optedIn
              ? 'Online payment preference saved.'
              : 'Online payment preference turned off.',
        );
      }
    } catch (_) {
      if (mounted) _showMessage("Couldn't save your preference. Try again.");
    } finally {
      if (mounted) setState(() => _savingPreference = false);
    }
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.payment});

  final VenuePaymentState payment;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    final copy = _statusCopy(payment.statusValue);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(SteepleTokens.space4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    copy.$1,
                    style: SteepleTypography.headlineSerif.copyWith(
                      color: colors.textPrimary,
                    ),
                  ),
                ),
                StatusChip(
                  statusRaw: payment.status,
                  domain: StatusDomain.payment,
                ),
              ],
            ),
            const SizedBox(height: SteepleTokens.space2),
            Text(
              copy.$2,
              style: SteepleTypography.body.copyWith(
                color: colors.textSecondary,
              ),
            ),
            if (payment.testMode) ...[
              const SizedBox(height: SteepleTokens.space3),
              Text(
                'Stripe test mode',
                style: SteepleTypography.bodySm.copyWith(
                  color: colors.info.fg,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _BrowserInstructions extends StatelessWidget {
  const _BrowserInstructions({required this.payment});

  final VenuePaymentState payment;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(Icons.language_rounded, color: colors.textSecondary),
        const SizedBox(width: SteepleTokens.space3),
        Expanded(
          child: Text(
            payment.statusValue == PaymentOnboardingStatus.ready
                ? 'Stripe opens in your browser. Return to Steeple when you finish. This page refreshes automatically.'
                : 'Setup opens in your browser. Return to Steeple when you finish. This page refreshes automatically.',
            style: SteepleTypography.bodySm.copyWith(
              color: colors.textSecondary,
            ),
          ),
        ),
      ],
    );
  }
}

class _PreferenceCard extends StatelessWidget {
  const _PreferenceCard({
    required this.payment,
    required this.saving,
    required this.onChanged,
  });

  final VenuePaymentState payment;
  final bool saving;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: SteepleTokens.space2),
        child: SwitchListTile(
          key: const Key('payment-opt-in'),
          value: payment.optedIn,
          onChanged: saving ? null : onChanged,
          title: const Text('Use online payments when available'),
          subtitle: Text(
            payment.onlinePaymentsAvailable
                ? 'New eligible bookings can use online payments.'
                : 'This saves your preference for a future release. Steeple does not accept online booking payments yet.',
            style: SteepleTypography.bodySm.copyWith(
              color: colors.textSecondary,
            ),
          ),
        ),
      ),
    );
  }
}

(String, String) _statusCopy(
  PaymentOnboardingStatus status,
) => switch (status) {
  PaymentOnboardingStatus.notStarted => (
    'Set up payouts',
    'Add your organization details in Stripe to prepare for online payments.',
  ),
  PaymentOnboardingStatus.incomplete => (
    'Finish setting up payouts',
    'Stripe still needs some information from you.',
  ),
  PaymentOnboardingStatus.pending => (
    'Stripe is reviewing your details',
    'Check back after Stripe finishes its review.',
  ),
  PaymentOnboardingStatus.restricted => (
    'Update your Stripe details',
    'Stripe needs more information before your account is ready.',
  ),
  PaymentOnboardingStatus.ready => (
    'Payout setup is ready',
    'Your Stripe test account has completed setup. Online booking payments are not active.',
  ),
  PaymentOnboardingStatus.unknown => (
    'Check your payout setup',
    'Refresh this page or open Stripe to review your account.',
  ),
};
