import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/app_error.dart';
import 'error_view.dart';

/// The one loading/error/data renderer (MOBILE_CONTRACTS §9): skeleton on
/// first load, [ErrorView] on failure, and stale-while-revalidate on refresh —
/// existing data stays on screen with a thin progress bar instead of blanking
/// (DESIGN_SYSTEM §8.7 skeletons rule).
class AsyncValueView<T> extends StatelessWidget {
  const AsyncValueView({
    required this.value,
    required this.data,
    this.skeleton,
    this.onRetry,
    super.key,
  });

  final AsyncValue<T> value;
  final Widget Function(T data) data;

  /// Shown on first load; defaults to a centered spinner when a screen has
  /// no bespoke skeleton yet.
  final Widget Function()? skeleton;

  final void Function()? onRetry;

  @override
  Widget build(BuildContext context) {
    // Keep showing the previous data through a refresh error/reload.
    if (value.hasValue) {
      final stale = value.isLoading;
      return Column(
        children: [
          if (stale) const LinearProgressIndicator(minHeight: 2),
          Expanded(child: data(value.requireValue)),
        ],
      );
    }
    if (value.hasError) {
      final error = value.error;
      final appError =
          error is AppError ? error : const AppError(kind: AppErrorKind.server, retryable: true);
      // Cancelled fetches are controller noise, not user-visible states.
      if (appError.kind == AppErrorKind.cancelled) return const SizedBox.shrink();
      return ErrorView(error: appError, onRetry: appError.retryable ? onRetry : null);
    }
    return skeleton?.call() ?? const Center(child: CircularProgressIndicator());
  }
}
