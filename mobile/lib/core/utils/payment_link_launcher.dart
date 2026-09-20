import 'package:url_launcher/url_launcher.dart';

typedef ExternalUrlOpen = Future<bool> Function(Uri uri);

class PaymentLinkLauncher {
  PaymentLinkLauncher({ExternalUrlOpen? open})
    : _open =
          open ??
          ((uri) => launchUrl(uri, mode: LaunchMode.externalApplication));

  final ExternalUrlOpen _open;

  static bool isAllowed(String value) {
    final uri = Uri.tryParse(value);
    if (uri == null ||
        uri.scheme != 'https' ||
        uri.userInfo.isNotEmpty ||
        uri.port != 443 ||
        uri.hasEmptyPath) {
      return false;
    }
    final host = uri.host.toLowerCase();
    return host == 'connect.stripe.com';
  }

  Future<bool> open(String value) async {
    if (!isAllowed(value)) return false;
    return _open(Uri.parse(value));
  }
}
