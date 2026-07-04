import 'dart:convert';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/api_client.dart';

/// Snapshot of `GET /api/v1/flags?platform=&build=` (CONTRACTS §8).
///
/// A flag read is NEVER a network call: [isEnabled] is a sync lookup of an
/// in-memory snapshot, seeded from the last-known cached copy, refreshed
/// non-blocking at startup and on foreground. Missing/failed fetch → `orElse`
/// (kill-switch flags default closed, so a broken fetch can't strand users
/// with a disabled apply button unless we chose that default).
abstract class FlagsService {
  bool isEnabled(String key, {bool orElse = false});

  Future<void> refresh();
}

/// Registry — add here when a flag ships; clean up when it stabilizes.
abstract final class FlagKeys {
  static const applyEnabled = 'mobile.apply_enabled';
  static const manageEnabled = 'mobile.manage_enabled';

  /// Server evaluates against `?build=` (a rule over `build < N`); the client
  /// just sees `true` → unskippable upgrade screen.
  static const forceUpgrade = 'mobile.force_upgrade';
}

class ApiFlagsService implements FlagsService {
  ApiFlagsService(this._api, {required this.buildNumber, void Function()? onSnapshot})
      : _onSnapshot = onSnapshot;

  static const _cacheKey = 'steeple.flags.snapshot';

  final ApiClient _api;
  final int buildNumber;
  final void Function()? _onSnapshot; // router re-evaluates redirects on change

  Map<String, bool> _snapshot = const {};

  @override
  bool isEnabled(String key, {bool orElse = false}) => _snapshot[key] ?? orElse;

  /// Seeds the in-memory snapshot from the cached last-known copy — called
  /// once at bootstrap, before the network refresh.
  Future<void> seedFromCache() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_cacheKey);
      if (raw != null) {
        _snapshot = (jsonDecode(raw) as Map<String, dynamic>).map(
          (k, v) => MapEntry(k, v == true),
        );
        _onSnapshot?.call();
      }
    } catch (_) {
      // Cache is an optimization; never fail bootstrap over it.
    }
  }

  @override
  Future<void> refresh() async {
    try {
      final flags = await _api.get<Map<String, bool>>(
        '/api/v1/flags',
        query: {
          'platform': Platform.isIOS ? 'ios' : 'android',
          'build': buildNumber,
        },
        decode: (data) =>
            (data as Map<String, dynamic>).map((k, v) => MapEntry(k, v == true)),
      );
      _snapshot = flags;
      _onSnapshot?.call();
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_cacheKey, jsonEncode(flags));
    } catch (_) {
      // Keep the last-known snapshot; flags fetches are best-effort.
    }
  }
}

/// Fakes/tests: a settable in-memory map.
class FakeFlagsService implements FlagsService {
  FakeFlagsService([Map<String, bool>? flags])
      : flags = flags ?? {FlagKeys.applyEnabled: true};

  final Map<String, bool> flags;

  @override
  bool isEnabled(String key, {bool orElse = false}) => flags[key] ?? orElse;

  @override
  Future<void> refresh() async {}
}

/// `core` public surface (MOBILE_CONTRACTS §8); overridden in bootstrap.
final flagsProvider = Provider<FlagsService>(
  (ref) => throw UnimplementedError('flagsProvider is overridden in bootstrap'),
);
