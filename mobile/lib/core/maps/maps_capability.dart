import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Whether the native Google Maps SDK was initialized with an API key.
///
/// iOS aborts the whole process (native `NSException` out of
/// `GMSServices checkServicePreconditions`) if a map view is created without
/// a key, so key-less dev builds must never mount a `GoogleMap` — they show
/// a placeholder instead (MOBILE_DESIGN §2: empty key degrades, never breaks).
/// Answered by the `app.steeple/maps` channel (AppDelegate / MainActivity);
/// anything short of an explicit "yes" counts as no key.
final mapsAvailableProvider = FutureProvider<bool>((ref) async {
  const channel = MethodChannel('app.steeple/maps');
  try {
    // A host build without the handler never answers — time out to "no key".
    return await channel
            .invokeMethod<bool>('hasApiKey')
            .timeout(const Duration(seconds: 2)) ??
        false;
  } on PlatformException {
    return false;
  } on MissingPluginException {
    return false;
  } on TimeoutException {
    return false;
  }
});
