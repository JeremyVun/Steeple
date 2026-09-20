import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:steeple_mobile/core/api/api_client.dart';
import 'package:steeple_mobile/features/manage/providers.dart';

const _venueId = '11111111-1111-4111-8111-111111111111';

Map<String, dynamic> _state({bool optedIn = false}) => {
  'onboardingStarted': true,
  'detailsSubmitted': true,
  'chargesEnabled': true,
  'payoutsEnabled': true,
  'optedIn': optedIn,
  'dashboardUrl': null,
  'mock': false,
  'status': 'ready',
  'requirementsDue': <String>[],
  'disabledReason': null,
  'testMode': true,
  'canOpenDashboard': true,
  'onlinePaymentsAvailable': false,
};

void main() {
  test('uses the venue payment endpoint contract', () async {
    final requests = <RequestOptions>[];
    final dio = Dio();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          requests.add(options);
          final data = options.path.endsWith('/payments/onboarding')
              ? {'url': 'https://connect.stripe.com/setup/test', 'mock': false}
              : options.path.endsWith('/payments/dashboard')
              ? {
                  'url': 'https://connect.stripe.com/express/test',
                  'mock': false,
                }
              : _state(
                  optedIn:
                      (options.data as Map<String, dynamic>?)?['optedIn'] ==
                      true,
                );
          handler.resolve(
            Response<dynamic>(
              requestOptions: options,
              data: data,
              statusCode: 200,
            ),
          );
        },
      ),
    );
    final repository = ApiPaymentRepository(ApiClient(dio));

    final state = await repository.state(_venueId);
    final onboarding = await repository.startOnboarding(_venueId);
    final updated = await repository.setOptIn(_venueId, optedIn: true);
    final dashboard = await repository.dashboard(_venueId);

    expect(state.onlinePaymentsAvailable, isFalse);
    expect(onboarding.mock, isFalse);
    expect(updated.optedIn, isTrue);
    expect(dashboard.url, contains('stripe.com'));
    expect(requests.map((request) => '${request.method} ${request.path}'), [
      'GET /api/v1/manage/venues/$_venueId/payments',
      'POST /api/v1/manage/venues/$_venueId/payments/onboarding',
      'PUT /api/v1/manage/venues/$_venueId/payments/opt-in',
      'POST /api/v1/manage/venues/$_venueId/payments/dashboard',
    ]);
    expect(requests[2].data, {'optedIn': true});
  });
}
