import 'app/bootstrap.dart';

/// Everything happens in `app/bootstrap.dart` (MOBILE_CONTRACTS §3) — main
/// stays a one-liner so the budgeted bootstrap order is impossible to bypass.
Future<void> main() => bootstrap();
