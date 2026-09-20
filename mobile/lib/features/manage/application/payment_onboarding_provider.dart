import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/session_manager.dart';
import '../../../core/auth/session_state.dart';
import '../../../core/models/models.dart';
import '../providers.dart';

class VenuePaymentNotifier extends AsyncNotifier<VenuePaymentState> {
  VenuePaymentNotifier(this.venueId);

  final String venueId;
  int _generation = 0;

  @override
  Future<VenuePaymentState> build() {
    ref.watch(
      sessionProvider.select(
        (session) => session is SignedIn ? session.user.id : null,
      ),
    );
    _generation++;
    return ref.read(paymentRepositoryProvider).state(venueId);
  }

  Future<void> refresh() async {
    ref.invalidateSelf();
    await future;
  }

  Future<PaymentExternalLink> startOnboarding() =>
      ref.read(paymentRepositoryProvider).startOnboarding(venueId);

  Future<PaymentExternalLink> dashboard() =>
      ref.read(paymentRepositoryProvider).dashboard(venueId);

  Future<void> setOptIn(bool optedIn) async {
    final generation = _generation;
    final updated = await ref
        .read(paymentRepositoryProvider)
        .setOptIn(venueId, optedIn: optedIn);
    if (ref.mounted && generation == _generation) state = AsyncData(updated);
  }
}

final venuePaymentProvider =
    AsyncNotifierProvider.family<
      VenuePaymentNotifier,
      VenuePaymentState,
      String
    >(VenuePaymentNotifier.new);
