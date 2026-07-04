import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/auth/session_manager.dart';
import '../core/auth/session_state.dart';
import '../core/flags/flags_service.dart';
import '../core/navigation/route_names.dart';
import '../features/apply/presentation/apply_screen.dart';
import '../features/bookings/presentation/booking_detail_screen.dart';
import '../features/bookings/presentation/bookings_screen.dart';
import '../features/discovery/presentation/explore_screen.dart';
import '../features/inbox/presentation/application_thread_screen.dart';
import '../features/inbox/presentation/inbox_screen.dart';
import '../features/listing/presentation/listing_detail_screen.dart';
import '../features/manage/presentation/manage_home_screen.dart';
import '../features/manage/presentation/manage_request_screen.dart';
import '../features/manage/presentation/manage_room_screen.dart';
import '../features/profile/presentation/profile_screen.dart';
import '../features/profile/presentation/sign_in_screen.dart';
import 'screens/force_upgrade_screen.dart';
import 'screens/splash_screen.dart';
import 'shell.dart';

export '../core/navigation/route_names.dart';

/// Bootstrap pokes this when the flags snapshot or session changes so the
/// router re-runs redirects (forced upgrade, auth gate).
class RouterRefresh extends ChangeNotifier {
  void poke() => notifyListeners();
}

/// The refresh instance is created here and shared with bootstrap (which
/// wires it into the flags service) via this provider.
final routerRefreshProvider = Provider<RouterRefresh>((ref) => RouterRefresh());

final routerProvider = Provider<GoRouter>(
  (ref) => createRouter(ref, ref.watch(routerRefreshProvider)),
);

GoRouter createRouter(Ref ref, RouterRefresh refresh) {
  final rootNavigatorKey = GlobalKey<NavigatorState>();

  return GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: '/explore',
    refreshListenable: Listenable.merge([
      refresh,
      ref.read(sessionManagerProvider).state,
    ]),
    // Unknown/out-of-area deep links land on browse, never an error (§7).
    onException: (context, state, router) => router.go('/explore'),
    redirect: (context, state) {
      final flags = ref.read(flagsProvider);
      final session = ref.read(sessionManagerProvider).state.value;
      final location = state.uri.path;

      // 1. Forced upgrade beats everything (kill switch for broken builds).
      if (flags.isEnabled(FlagKeys.forceUpgrade)) {
        return location == '/upgrade' ? null : '/upgrade';
      }
      if (location == '/upgrade') return '/explore';

      // 2. Hold on splash while the session restore resolves (must finish
      //    inside the cold-start budget — MOBILE_DESIGN §4).
      if (session is SessionUnknown) {
        return location == '/splash'
            ? null
            : '/splash?from=${Uri.encodeComponent(state.uri.toString())}';
      }
      if (location == '/splash') {
        final from = state.uri.queryParameters['from'];
        return (from == null || from.isEmpty) ? '/explore' : sanitizeDeepLink(from);
      }

      // 3. Auth gate: guarded tabs redirect to the sign-in sheet-route.
      final guarded = location.startsWith('/inbox') ||
          location.startsWith('/bookings') ||
          location.startsWith('/manage');
      if (guarded && session is SignedOut) {
        return '/signin?from=${Uri.encodeComponent(state.uri.toString())}';
      }
      if (location == '/signin' && session is SignedIn) {
        final from = state.uri.queryParameters['from'];
        return (from == null || from.isEmpty) ? '/explore' : sanitizeDeepLink(from);
      }
      return null;
    },
    routes: [
      GoRoute(
        path: '/splash',
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(
        name: RouteNames.forceUpgrade,
        path: '/upgrade',
        builder: (context, state) => const ForceUpgradeScreen(),
      ),
      GoRoute(
        name: RouteNames.signIn,
        path: '/signin',
        pageBuilder: (context, state) => MaterialPage(
          fullscreenDialog: true,
          child: SignInScreen(from: state.uri.queryParameters['from']),
        ),
      ),
      // Manage (provider self-service, Phase 5) is a push-in flow off the
      // profile tab's "Your spaces" entry point, not a tab of its own — a
      // plain top-level route (root navigator) rather than a shell branch.
      GoRoute(
        name: RouteNames.manage,
        path: '/manage',
        builder: (context, state) => const ManageHomeScreen(),
        routes: [
          GoRoute(
            name: RouteNames.manageRequest,
            path: 'requests/:id',
            builder: (context, state) =>
                ManageRequestScreen(applicationId: state.pathParameters['id']!),
          ),
          GoRoute(
            name: RouteNames.manageRoom,
            path: 'rooms/:id',
            builder: (context, state) =>
                ManageRoomScreen(roomId: state.pathParameters['id']!),
          ),
        ],
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => AppShell(shell: shell),
        branches: [
          StatefulShellBranch(routes: [
            GoRoute(
              name: RouteNames.explore,
              path: '/explore',
              builder: (context, state) => const ExploreScreen(),
            ),
            GoRoute(
              name: RouteNames.listing,
              path: '/space/:venueSlug/:roomSlug',
              builder: (context, state) => ListingDetailScreen(
                venueSlug: state.pathParameters['venueSlug']!,
                roomSlug: state.pathParameters['roomSlug']!,
              ),
              routes: [
                GoRoute(
                  name: RouteNames.apply,
                  path: 'apply',
                  parentNavigatorKey: rootNavigatorKey,
                  builder: (context, state) => ApplyScreen(
                    venueSlug: state.pathParameters['venueSlug']!,
                    roomSlug: state.pathParameters['roomSlug']!,
                  ),
                ),
              ],
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              name: RouteNames.inbox,
              path: '/inbox',
              builder: (context, state) => const InboxScreen(),
              routes: [
                GoRoute(
                  name: RouteNames.applicationThread,
                  path: 'applications/:id',
                  parentNavigatorKey: rootNavigatorKey,
                  builder: (context, state) =>
                      ApplicationThreadScreen(applicationId: state.pathParameters['id']!),
                ),
              ],
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              name: RouteNames.bookings,
              path: '/bookings',
              builder: (context, state) => const BookingsScreen(),
              routes: [
                GoRoute(
                  name: RouteNames.bookingDetail,
                  path: ':id',
                  parentNavigatorKey: rootNavigatorKey,
                  builder: (context, state) =>
                      BookingDetailScreen(bookingId: state.pathParameters['id']!),
                ),
              ],
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              name: RouteNames.profile,
              path: '/profile',
              builder: (context, state) => const ProfileScreen(),
            ),
          ]),
        ],
      ),
    ],
  );
}
