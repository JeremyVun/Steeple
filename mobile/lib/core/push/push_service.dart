import 'dart:async';
import 'dart:io';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../analytics/analytics_service.dart';
import '../api/api_client.dart';
import '../auth/session_manager.dart';

/// Registers device tokens with the API (CONTRACTS §4 `/me/devices`).
abstract class DevicesRepository {
  Future<void> register(String fcmToken, String platform);

  Future<void> unregister(String fcmToken);
}

class ApiDevicesRepository implements DevicesRepository {
  const ApiDevicesRepository(this._api);

  final ApiClient _api;

  @override
  Future<void> register(String fcmToken, String platform) => _api.post<void>(
        '/api/v1/me/devices',
        body: {'fcmToken': fcmToken, 'platform': platform},
        decode: (_) {},
      );

  @override
  Future<void> unregister(String fcmToken) =>
      _api.delete('/api/v1/me/devices/${Uri.encodeComponent(fcmToken)}');
}

/// Push seam (MOBILE_CONTRACTS §10). FCM data messages carry
/// `{notificationId, type, deepLink}`; the inbox row is the record of truth —
/// push content is never rendered directly (CONTRACTS §9).
abstract class PushService {
  /// The contextual iOS ask — ONLY after the first application is submitted
  /// ("want to know when the church replies?"), never at launch.
  Future<void> requestPermissionInContext();

  /// Token upsert via [DevicesRepository]; call after sign-in and on token
  /// rotation. No-op unless permission is already granted.
  Future<void> registerIfPermitted();

  /// Deep-link paths from push taps; the router consumes this and the §7
  /// registry applies (unknown → /explore).
  Stream<String> get deepLinkTaps;
}

/// Used until Firebase is configured for the build, in fakes mode, and in
/// tests. Keeps the whole push seam inert without a single conditional in
/// feature code.
class NoopPushService implements PushService {
  const NoopPushService();

  @override
  Future<void> requestPermissionInContext() async {}

  @override
  Future<void> registerIfPermitted() async {}

  @override
  Stream<String> get deepLinkTaps => const Stream.empty();
}

/// Real FCM implementation. Constructed only after `Firebase.initializeApp`
/// succeeded (bootstrap guards it); registration happens only after sign-in.
class FcmPushService implements PushService {
  FcmPushService(this._devices, this._sessionManager, this._analytics) {
    _messaging.onTokenRefresh.listen((_) => registerIfPermitted());
    FirebaseMessaging.onMessageOpenedApp.listen(_emitTap);
    // Cold start from a push tap: replay the initial message's deep link.
    unawaited(
      _messaging.getInitialMessage().then((m) {
        if (m != null) _emitTap(m);
      }),
    );
    // Unregister while the dying session is still valid (MOBILE_CONTRACTS §6).
    _sessionManager.addSignOutHandler(_unregisterCurrentToken);
  }

  final DevicesRepository _devices;
  final SessionManager _sessionManager;
  final AnalyticsService _analytics;
  final _messaging = FirebaseMessaging.instance;
  final _taps = StreamController<String>.broadcast();

  @override
  Stream<String> get deepLinkTaps => _taps.stream;

  @override
  Future<void> requestPermissionInContext() async {
    try {
      final settings = await _messaging.requestPermission();
      if (settings.authorizationStatus == AuthorizationStatus.authorized ||
          settings.authorizationStatus == AuthorizationStatus.provisional) {
        await registerIfPermitted();
      }
    } catch (e) {
      debugPrint('[push] permission request failed: $e');
    }
  }

  @override
  Future<void> registerIfPermitted() async {
    try {
      final settings = await _messaging.getNotificationSettings();
      if (settings.authorizationStatus != AuthorizationStatus.authorized &&
          settings.authorizationStatus != AuthorizationStatus.provisional) {
        return;
      }
      final token = await _messaging.getToken();
      if (token == null) return;
      await _devices.register(token, Platform.isIOS ? 'ios' : 'android');
    } catch (e) {
      // Push is additive — a failed registration never surfaces to the user.
      debugPrint('[push] register failed: $e');
    }
  }

  Future<void> _unregisterCurrentToken() async {
    final token = await _messaging.getToken();
    if (token != null) {
      await _devices.unregister(token);
      await _messaging.deleteToken();
    }
  }

  void _emitTap(RemoteMessage message) {
    final deepLink = message.data['deepLink'] as String?;
    if (deepLink == null || deepLink.isEmpty) return;
    _analytics.track(AnalyticsEvents.notificationOpened, {
      'type': message.data['type'],
      'channel': 'push',
    });
    _taps.add(deepLink);
  }
}

/// `core` public surface; overridden in bootstrap (Noop by default).
final pushServiceProvider = Provider<PushService>((ref) => const NoopPushService());
