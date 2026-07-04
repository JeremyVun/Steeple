import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/auth/session_manager.dart';
import '../core/auth/session_state.dart';
import '../core/widgets/offline_banner.dart';
import '../features/inbox/providers.dart';
import 'theme/theme.dart';

/// The 4-tab chrome (DESIGN_SYSTEM §8.8): Explore, Inbox, Bookings, Profile.
/// Active = sage-deep, inactive = textTertiary, unread badge = terracotta dot,
/// `surfaceRaised` bar with a hairline top border.
class AppShell extends ConsumerWidget {
  const AppShell({required this.shell, super.key});

  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.steepleColors;
    final unread = ref.watch(unreadCountProvider);

    // The one "You've been signed out" snackbar on forced sign-out (§6).
    ref.listen(sessionProvider, (previous, next) {
      if (next case SignedOut(wasForced: true)) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("You've been signed out")),
        );
      }
    });

    return Scaffold(
      body: Column(
        children: [
          const OfflineBanner(),
          Expanded(child: shell),
        ],
      ),
      bottomNavigationBar: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: colors.border)),
        ),
        child: NavigationBar(
          selectedIndex: shell.currentIndex,
          onDestinationSelected: (index) => shell.goBranch(
            index,
            initialLocation: index == shell.currentIndex,
          ),
          destinations: [
            const NavigationDestination(
              icon: Icon(Icons.map_rounded),
              label: 'Explore',
            ),
            NavigationDestination(
              icon: Badge(
                isLabelVisible: unread > 0,
                backgroundColor: colors.accent,
                smallSize: 8,
                child: const Icon(Icons.notifications_rounded),
              ),
              label: 'Inbox',
            ),
            const NavigationDestination(
              icon: Icon(Icons.event_available_rounded),
              label: 'Bookings',
            ),
            const NavigationDestination(
              icon: Icon(Icons.person_rounded),
              label: 'Profile',
            ),
          ],
        ),
      ),
    );
  }
}
