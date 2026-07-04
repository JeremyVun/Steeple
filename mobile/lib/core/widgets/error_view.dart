import 'package:flutter/material.dart';

import '../../app/theme/theme.dart';
import '../api/app_error.dart';

/// Renders an [AppError] consistently (DESIGN_SYSTEM §8.7): icon +
/// plain-language title + retry when retryable. Never shows codes or stack
/// traces; copy says what happened and what to do (§10). `cancelled` errors
/// are swallowed by controllers and must never reach here.
class ErrorView extends StatelessWidget {
  const ErrorView({required this.error, this.onRetry, super.key});

  final AppError error;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    final (title, body) = _copy(error.kind);

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(SteepleTokens.space6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(_icon(error.kind), size: 40, color: colors.danger.fg),
            const SizedBox(height: SteepleTokens.space4),
            Text(
              title,
              textAlign: TextAlign.center,
              style: SteepleTypography.headlineSerif.copyWith(color: colors.textPrimary),
            ),
            const SizedBox(height: SteepleTokens.space2),
            Text(
              body,
              textAlign: TextAlign.center,
              style: SteepleTypography.bodySm.copyWith(color: colors.textSecondary),
            ),
            if (error.retryable && onRetry != null) ...[
              const SizedBox(height: SteepleTokens.space5),
              OutlinedButton(onPressed: onRetry, child: const Text('Try again')),
            ],
          ],
        ),
      ),
    );
  }

  static (String, String) _copy(AppErrorKind kind) => switch (kind) {
        AppErrorKind.network => (
            "Can't reach Steeple",
            'Check your connection and try again.',
          ),
        AppErrorKind.timeout => (
            'That took too long',
            'The connection timed out. Try again in a moment.',
          ),
        AppErrorKind.notFound => (
            'No longer available',
            "This space isn't listed anymore.",
          ),
        AppErrorKind.auth => (
            'Sign in to continue',
            'Your session ended. Sign in again to pick up where you left off.',
          ),
        AppErrorKind.validation => (
            "That didn't go through",
            'Something in the request needs fixing. Review and try again.',
          ),
        AppErrorKind.conflict => (
            "That's changed",
            'Someone got there first. Refresh to see the latest.',
          ),
        AppErrorKind.rateLimited => (
            'A moment, please',
            "You're moving fast — wait a little and try again.",
          ),
        AppErrorKind.server || AppErrorKind.cancelled => (
            'Something went wrong',
            "It's not you, it's us. Try again in a moment.",
          ),
      };

  static IconData _icon(AppErrorKind kind) => switch (kind) {
        AppErrorKind.network || AppErrorKind.timeout => Icons.wifi_off_rounded,
        AppErrorKind.notFound => Icons.search_off_rounded,
        AppErrorKind.auth => Icons.lock_outline_rounded,
        AppErrorKind.rateLimited => Icons.hourglass_empty_rounded,
        _ => Icons.error_outline_rounded,
      };
}
