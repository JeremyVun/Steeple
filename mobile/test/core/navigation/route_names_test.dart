import 'package:flutter_test/flutter_test.dart';
import 'package:steeple_mobile/core/navigation/route_names.dart';

void main() {
  group('sanitizeDeepLink enforces the §7 registry', () {
    test('allows the four canonical shapes', () {
      expect(sanitizeDeepLink('/space/st-andrews/main-hall'), '/space/st-andrews/main-hall');
      expect(sanitizeDeepLink('/inbox'), '/inbox');
      expect(sanitizeDeepLink('/inbox/applications/abc-123'), '/inbox/applications/abc-123');
      expect(sanitizeDeepLink('/bookings/abc-123'), '/bookings/abc-123');
    });

    test('everything else falls back to /explore, never an error', () {
      expect(sanitizeDeepLink('/'), '/explore');
      expect(sanitizeDeepLink('/admin'), '/explore');
      expect(sanitizeDeepLink('/space/only-venue'), '/explore');
      expect(sanitizeDeepLink('/bookings'), '/explore');
      expect(sanitizeDeepLink('/inbox/applications'), '/explore');
      expect(sanitizeDeepLink('not a path at all'), '/explore');
    });

    test('strips query/fragment noise via path-only matching', () {
      expect(sanitizeDeepLink('/inbox?utm=push#x'), '/inbox');
    });
  });
}
