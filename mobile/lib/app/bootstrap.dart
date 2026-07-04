import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:dio/dio.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:sentry_flutter/sentry_flutter.dart';

import '../core/analytics/analytics_service.dart';
import '../core/api/api_client.dart';
import '../core/auth/api_session_manager.dart';
import '../core/auth/fake_session_manager.dart';
import '../core/auth/session_manager.dart';
import '../core/flags/flags_service.dart';
import '../core/push/push_service.dart';
import '../features/apply/providers.dart';
import '../features/bookings/providers.dart';
import '../features/discovery/providers.dart';
import '../features/inbox/providers.dart';
import '../features/listing/providers.dart';
import '../features/manage/providers.dart';
import '../features/profile/providers.dart';
import 'env_config.dart';
import 'router.dart';
import 'theme/theme.dart';

/// Composition root. Bootstrap order is budgeted (MOBILE_DESIGN §4): parse
/// env → `runApp` immediately → everything non-critical (session restore,
/// flags, Sentry, Firebase, deep links) AFTER the first frame. FCM permission
/// is never requested at launch — contextual ask only (MOBILE_DESIGN §5).
Future<void> bootstrap() async {
  WidgetsFlutterBinding.ensureInitialized();
  final env = EnvConfig.fromDartDefines();

  final sessionManager = env.useFakes
      ? FakeSessionManager() as SessionManager
      : ApiSessionManager(authDio: Dio(BaseOptions(baseUrl: env.apiBaseUrl.toString())));
  final pushService = UpgradablePushService();

  final container = ProviderContainer(
    overrides: [
      envProvider.overrideWithValue(env),
      sessionManagerProvider.overrideWithValue(sessionManager),
      pushServiceProvider.overrideWithValue(pushService),
      analyticsProvider.overrideWith(
        (ref) => env.useFakes
            ? const DebugAnalyticsService()
            : BatchingAnalyticsService(ref.watch(apiClientProvider)),
      ),
      flagsProvider.overrideWith(
        (ref) => env.useFakes
            ? FakeFlagsService()
            : ApiFlagsService(
                ref.watch(apiClientProvider),
                buildNumber: env.buildNumber,
                onSnapshot: ref.watch(routerRefreshProvider).poke,
              ),
      ),
      if (env.useFakes) ...fakeRepositoryOverrides,
    ],
  );

  runApp(UncontrolledProviderScope(container: container, child: const SteepleApp()));

  SchedulerBinding.instance.addPostFrameCallback((_) {
    unawaited(_deferredInit(container, env, sessionManager, pushService));
  });
}

/// One list swaps every repository to its fixture-backed fake
/// (MOBILE_CONTRACTS §11): how UI work proceeds against 🔲 endpoints and how
/// widget/integration tests get deterministic data.
final fakeRepositoryOverrides = <Override>[
  discoveryRepositoryProvider.overrideWith((ref) => FakeDiscoveryRepository()),
  listingRepositoryProvider.overrideWith((ref) => FakeListingRepository()),
  applicationsRepositoryProvider.overrideWith((ref) => FakeApplicationsRepository()),
  inboxRepositoryProvider.overrideWith((ref) => FakeInboxRepository()),
  bookingsRepositoryProvider.overrideWith((ref) => FakeBookingsRepository()),
  profileRepositoryProvider.overrideWith((ref) => FakeProfileRepository()),
  manageRepositoryProvider.overrideWith((ref) => FakeManageRepository()),
];

Future<void> _deferredInit(
  ProviderContainer container,
  EnvConfig env,
  SessionManager sessionManager,
  UpgradablePushService pushService,
) async {
  final router = container.read(routerProvider);
  final refresh = container.read(routerRefreshProvider);

  // Session restore first: it resolves the splash hold.
  await sessionManager.restore();
  refresh.poke();

  // Flags: cached snapshot synchronously useful, network refresh best-effort.
  final flags = container.read(flagsProvider);
  if (flags is ApiFlagsService) {
    await flags.seedFromCache();
    unawaited(flags.refresh());
  }

  // Sentry — deferred, off entirely without a DSN (dev).
  final dsn = env.sentryDsn;
  if (dsn != null) {
    await Sentry.init((options) => options.dsn = dsn);
  }

  // Firebase/FCM: only upgrades from noop when the platform config exists —
  // a build without Firebase files keeps working, push stays inert.
  if (!env.useFakes) {
    try {
      await Firebase.initializeApp();
      pushService.upgrade(
        FcmPushService(
          ApiDevicesRepository(container.read(apiClientProvider)),
          sessionManager,
          container.read(analyticsProvider),
        ),
      );
    } catch (e) {
      debugPrint('[push] Firebase unavailable, push disabled: $e');
    }
  }

  // Push taps + universal links both route through the §7 registry.
  pushService.deepLinkTaps.listen((path) => router.go(sanitizeDeepLink(path)));
  final appLinks = AppLinks();
  final initial = await appLinks.getInitialLink();
  if (initial != null && initial.scheme != 'steeple') {
    router.go(sanitizeDeepLink(initial.path));
  }
  appLinks.uriLinkStream.listen((uri) {
    // `steeple://` is auth-callback only, never navigation (§7).
    if (uri.scheme != 'steeple') router.go(sanitizeDeepLink(uri.path));
  });
}

/// Starts as a no-op and upgrades to FCM once Firebase init succeeds — the
/// provider graph stays immutable while init stays deferred.
class UpgradablePushService implements PushService {
  PushService _delegate = const NoopPushService();
  final _taps = StreamController<String>.broadcast();
  StreamSubscription<String>? _tapSub;

  void upgrade(PushService real) {
    _delegate = real;
    _tapSub?.cancel();
    _tapSub = real.deepLinkTaps.listen(_taps.add);
  }

  @override
  Future<void> requestPermissionInContext() => _delegate.requestPermissionInContext();

  @override
  Future<void> registerIfPermitted() => _delegate.registerIfPermitted();

  @override
  Stream<String> get deepLinkTaps => _taps.stream;
}

class SteepleApp extends ConsumerStatefulWidget {
  const SteepleApp({super.key});

  @override
  ConsumerState<SteepleApp> createState() => _SteepleAppState();
}

class _SteepleAppState extends ConsumerState<SteepleApp> {
  late final AppLifecycleListener _lifecycle;

  @override
  void initState() {
    super.initState();
    _lifecycle = AppLifecycleListener(
      // Batcher contract: flush on pause (MOBILE_DESIGN §6).
      onPause: () => unawaited(ref.read(analyticsProvider).flush()),
      // Flags refresh on foreground (MOBILE_DESIGN §6).
      onResume: () => unawaited(ref.read(flagsProvider).refresh()),
    );
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Steeple',
      debugShowCheckedModeBanner: false,
      theme: SteepleTheme.light(),
      darkTheme: SteepleTheme.dark(),
      routerConfig: ref.watch(routerProvider),
    );
  }
}
