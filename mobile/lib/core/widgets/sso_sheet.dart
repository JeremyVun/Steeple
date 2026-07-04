import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

import '../../app/theme/theme.dart';
import '../analytics/analytics_service.dart';
import '../api/app_error.dart';
import '../auth/session_manager.dart';
import '../auth/session_state.dart';

/// The SSO gate (DESIGN_SYSTEM §8.1 SSO row: provider brand rules beat the
/// palette). Sign in with Apple leads on iOS (guideline 4.8). The `reason`
/// line explains *why* — "Sign in so St. Andrew's knows who's asking"
/// (§10 voice) — because the gate appears only at commitment, never before.
///
/// Returns the [SignInResult], or null when dismissed.
Future<SignInResult?> showSsoSheet(
  BuildContext context, {
  String? reason,
  String trigger = 'profile',
}) =>
    showModalBottomSheet<SignInResult>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => _SsoSheet(reason: reason, trigger: trigger),
    );

class _SsoSheet extends ConsumerStatefulWidget {
  const _SsoSheet({this.reason, required this.trigger});

  final String? reason;
  final String trigger;

  @override
  ConsumerState<_SsoSheet> createState() => _SsoSheetState();
}

class _SsoSheetState extends ConsumerState<_SsoSheet> {
  SsoProvider? _busy;
  String? _errorText;

  Future<void> _signIn(SsoProvider provider) async {
    setState(() {
      _busy = provider;
      _errorText = null;
    });
    ref.read(analyticsProvider).track(AnalyticsEvents.ssoStarted, {
      'provider': provider.wireToken,
      'surface': 'mobile',
      'trigger': widget.trigger,
    });
    final result = await ref.read(sessionManagerProvider).signIn(provider);
    if (!mounted) return;
    switch (result) {
      case SignInSuccess():
        Navigator.of(context).pop(result);
      case SignInCancelled():
        setState(() => _busy = null); // stay put — dismissal isn't an error
      case SignInFailed(:final error):
        setState(() {
          _busy = null;
          _errorText = error is AppError && error.code == 'use_original_provider'
              ? 'This email already signed in with '
                  '${provider == SsoProvider.google ? 'Apple' : 'Google'} — '
                  'use that instead.'
              : "Couldn't sign you in. Check your connection and try again.";
        });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    final busy = _busy;

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        SteepleTokens.gutter,
        SteepleTokens.space2,
        SteepleTokens.gutter,
        SteepleTokens.space6,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Sign in to continue',
            textAlign: TextAlign.center,
            style: SteepleTypography.headlineSerif.copyWith(color: colors.textPrimary),
          ),
          if (widget.reason != null) ...[
            const SizedBox(height: SteepleTokens.space2),
            Text(
              widget.reason!,
              textAlign: TextAlign.center,
              style: SteepleTypography.bodySm.copyWith(color: colors.textSecondary),
            ),
          ],
          const SizedBox(height: SteepleTokens.space6),
          if (Platform.isIOS) ...[
            SignInWithAppleButton(
              onPressed: busy == null ? () => _signIn(SsoProvider.apple) : () {},
              height: SteepleTokens.buttonHeight,
              borderRadius:
                  const BorderRadius.all(Radius.circular(SteepleTokens.radiusPill)),
            ),
            const SizedBox(height: SteepleTokens.space3),
          ],
          _GoogleButton(
            busy: busy == SsoProvider.google,
            onPressed: busy == null ? () => _signIn(SsoProvider.google) : null,
          ),
          if (!Platform.isIOS) ...[
            const SizedBox(height: SteepleTokens.space3),
            SignInWithAppleButton(
              onPressed: busy == null ? () => _signIn(SsoProvider.apple) : () {},
              height: SteepleTokens.buttonHeight,
              borderRadius:
                  const BorderRadius.all(Radius.circular(SteepleTokens.radiusPill)),
            ),
          ],
          if (_errorText != null) ...[
            const SizedBox(height: SteepleTokens.space4),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.error_outline_rounded, size: 16, color: colors.danger.fg),
                const SizedBox(width: SteepleTokens.space1),
                Flexible(
                  child: Text(
                    _errorText!,
                    style: SteepleTypography.caption.copyWith(color: colors.danger.fg),
                  ),
                ),
              ],
            ),
          ],
          const SizedBox(height: SteepleTokens.space4),
          Text(
            'We only learn your name and email — never your password.',
            textAlign: TextAlign.center,
            style: SteepleTypography.caption.copyWith(color: colors.textTertiary),
          ),
        ],
      ),
    );
  }
}

/// Approximates Google's light button spec (white surface, border, dark
/// label). TODO(release): swap in the official "G" mark asset before store
/// submission — brand compliance beats palette here.
class _GoogleButton extends StatelessWidget {
  const _GoogleButton({required this.onPressed, required this.busy});

  final VoidCallback? onPressed;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    return SizedBox(
      height: SteepleTokens.buttonHeight,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          backgroundColor: Colors.white,
          foregroundColor: const Color(0xFF1F1F1F), // Google button spec, not palette
          side: const BorderSide(color: Color(0xFF747775)),
        ),
        child: busy
            ? SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2, color: colors.textTertiary),
              )
            : const Text('Continue with Google'),
      ),
    );
  }
}
