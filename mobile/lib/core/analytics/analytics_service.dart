import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../api/api_client.dart';

/// Client-side analytics (MOBILE_DESIGN §6). Client-emitted interaction
/// events only — server-authoritative events (search_performed,
/// application_submitted, …) are NEVER sent from here (CONTRACTS §7).
abstract class AnalyticsService {
  void track(String name, [Map<String, Object?> props = const {}]);

  /// Called on `AppLifecycleState.paused` (and best-effort at other flushes).
  Future<void> flush();
}

/// The registry of names this client may emit (CONTRACTS §7 taxonomy).
/// Adding one = update the CONTRACTS table + both client batchers.
abstract final class AnalyticsEvents {
  static const mapInteracted = 'map_interacted'; // props: kind pan|zoom|pin
  static const applicationStarted = 'application_started'; // props: roomId
  static const ssoStarted = 'sso_started'; // props: provider, surface:'mobile'
  static const notificationOpened = 'notification_opened'; // props: type, channel:'push'
}

/// In-memory queue → `POST /api/v1/events` batcher: flushes every 15 s, at 20
/// queued events, and on lifecycle pause. Fire-and-forget by contract — the
/// endpoint answers 202 and a failed flush just re-queues (bounded).
class BatchingAnalyticsService implements AnalyticsService {
  BatchingAnalyticsService(this._api) {
    _timer = Timer.periodic(const Duration(seconds: 15), (_) => flush());
  }

  static const _flushThreshold = 20;
  static const _queueCap = 100;

  final ApiClient _api;

  /// One session id per cold start (MOBILE_DESIGN §6).
  final String sessionId = const Uuid().v4();

  final List<Map<String, Object?>> _queue = [];
  Timer? _timer;
  bool _flushing = false;

  @override
  void track(String name, [Map<String, Object?> props = const {}]) {
    if (_queue.length >= _queueCap) _queue.removeAt(0);
    _queue.add({
      'name': name,
      'occurredAt': DateTime.now().toUtc().toIso8601String(),
      'props': props,
    });
    if (_queue.length >= _flushThreshold) unawaited(flush());
  }

  @override
  Future<void> flush() async {
    if (_flushing || _queue.isEmpty) return;
    _flushing = true;
    final batch = List.of(_queue);
    _queue.clear();
    try {
      await _api.post<void>(
        '/api/v1/events',
        body: {'sessionId': sessionId, 'events': batch},
        decode: (_) {},
      );
    } catch (_) {
      // Re-queue at the front, bounded — analytics must never surface errors.
      _queue.insertAll(0, batch.take(_queueCap - _queue.length));
    } finally {
      _flushing = false;
    }
  }

  void dispose() => _timer?.cancel();
}

/// Fakes/tests: prints instead of posting.
class DebugAnalyticsService implements AnalyticsService {
  const DebugAnalyticsService();

  @override
  void track(String name, [Map<String, Object?> props = const {}]) =>
      debugPrint('[analytics] $name $props');

  @override
  Future<void> flush() async {}
}

/// `core` public surface (MOBILE_CONTRACTS §8); overridden in bootstrap.
final analyticsProvider = Provider<AnalyticsService>(
  (ref) => throw UnimplementedError('analyticsProvider is overridden in bootstrap'),
);
