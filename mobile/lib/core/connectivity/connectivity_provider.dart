import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// True while the device reports a usable network path. Drives the
/// OfflineBanner (DESIGN_SYSTEM §8.7) — honest-but-thin offline stance:
/// banner + cached content, mutations fail with a retry affordance
/// (MOBILE_DESIGN §5).
final connectivityProvider = StreamProvider<bool>((ref) {
  return Connectivity().onConnectivityChanged.map(
        (results) => results.any((r) => r != ConnectivityResult.none),
      );
});

/// Sync read with an optimistic default (assume online until told otherwise —
/// a false offline banner is worse than a late one).
final isOnlineProvider = Provider<bool>(
  (ref) => ref.watch(connectivityProvider).value ?? true,
);
