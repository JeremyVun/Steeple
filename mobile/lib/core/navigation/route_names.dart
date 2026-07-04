import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

/// Route names ARE the contract (MOBILE_CONTRACTS §7) — features navigate by
/// name (`context.goNamed(RouteNames.listing, pathParameters: …)`), never by
/// literal path. Lives in core so features can import it without touching
/// `app/router.dart` (dependency contract §2).
abstract final class RouteNames {
  static const explore = 'explore';
  static const listing = 'listing';
  static const apply = 'apply';
  static const inbox = 'inbox';
  static const applicationThread = 'applicationThread';
  static const bookings = 'bookings';
  static const bookingDetail = 'bookingDetail';
  static const profile = 'profile';
  static const signIn = 'signIn';
  static const forceUpgrade = 'forceUpgrade';
  static const manage = 'manage';
  static const manageRequest = 'manageRequest';
  static const manageRoom = 'manageRoom';
}

/// The deep-link registry (§7): the only path shapes push taps, universal
/// links, and notification `deepLink` fields may navigate to. Anything else
/// falls back to /explore — never an error screen.
String sanitizeDeepLink(String path) {
  final uri = Uri.parse(path);
  final segments = uri.pathSegments;
  final ok = switch (segments) {
    ['space', _, _] => true,
    ['inbox'] => true,
    ['inbox', 'applications', _] => true,
    ['bookings', _] => true,
    _ => false,
  };
  return ok ? uri.path : '/explore';
}

/// Navigate to a server-provided deep link (e.g. a notification payload's
/// `deepLink`) through the registry.
void goDeepLink(BuildContext context, String? deepLink) =>
    GoRouter.of(context).go(sanitizeDeepLink(deepLink ?? '/explore'));
