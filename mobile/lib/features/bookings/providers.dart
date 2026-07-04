import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/models/models.dart';
import 'data/bookings_repository.dart';

export 'data/bookings_repository.dart';
export 'data/fake/fake_bookings_repository.dart';

/// Public surface of the bookings feature (MOBILE_CONTRACTS §8).
final bookingsRepositoryProvider = Provider<BookingsRepository>(
  (ref) => ApiBookingsRepository(ref.watch(apiClientProvider)),
);

class MyBookingsNotifier extends AsyncNotifier<List<Booking>> {
  @override
  Future<List<Booking>> build() async {
    final page = await ref.read(bookingsRepositoryProvider).mine();
    return page.items;
  }

  Future<void> refresh() async {
    ref.invalidateSelf();
    await future;
  }
}

final myBookingsProvider = AsyncNotifierProvider<MyBookingsNotifier, List<Booking>>(
  MyBookingsNotifier.new,
);

/// Keyed by booking id; family instances are kept alive so returning to a
/// detail screen after a background refresh doesn't refetch needlessly.
class BookingDetailNotifier extends AsyncNotifier<Booking> {
  BookingDetailNotifier(this.bookingId);

  final String bookingId;

  @override
  Future<Booking> build() {
    ref.keepAlive();
    return ref.read(bookingsRepositoryProvider).byId(bookingId);
  }

  Future<void> refresh() async {
    ref.invalidateSelf();
    await future;
  }

  Future<void> cancel({String? reason}) async {
    final updated = await ref.read(bookingsRepositoryProvider).cancel(bookingId, reason: reason);
    state = AsyncData(updated);
  }

  Future<void> markNoShow(String occurrenceId) async {
    await ref.read(bookingsRepositoryProvider).markNoShow(occurrenceId);
    await refresh();
  }
}

final bookingDetailProvider = AsyncNotifierProvider.family<BookingDetailNotifier, Booking, String>(
  BookingDetailNotifier.new,
);
