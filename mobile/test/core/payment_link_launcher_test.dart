import 'package:flutter_test/flutter_test.dart';
import 'package:steeple_mobile/core/utils/payment_link_launcher.dart';

void main() {
  test(
    'opens Stripe HTTPS links through the injected external opener',
    () async {
      Uri? opened;
      final launcher = PaymentLinkLauncher(
        open: (uri) async {
          opened = uri;
          return true;
        },
      );

      expect(
        await launcher.open('https://connect.stripe.com/setup/test_123'),
        isTrue,
      );
      expect(opened?.host, 'connect.stripe.com');
    },
  );

  test('rejects unsafe URLs without invoking the opener', () async {
    var calls = 0;
    final launcher = PaymentLinkLauncher(
      open: (uri) async {
        calls++;
        return true;
      },
    );

    for (final url in [
      'http://connect.stripe.com/setup/test',
      'https://stripe.com.evil.example/setup',
      'https://user@connect.stripe.com/setup',
      'https://connect.stripe.com:8443/setup',
      'https://docs.stripe.com/setup',
      'steeple://payments',
      'not a url',
    ]) {
      expect(await launcher.open(url), isFalse, reason: url);
    }
    expect(calls, 0);
  });
}
