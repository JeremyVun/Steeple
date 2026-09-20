import 'package:freezed_annotation/freezed_annotation.dart';

import 'wire_tokens.dart';

part 'payments.freezed.dart';
part 'payments.g.dart';

enum PaymentOnboardingStatus {
  notStarted('notStarted'),
  incomplete('incomplete'),
  pending('pending'),
  restricted('restricted'),
  ready('ready'),
  unknown('unknown');

  const PaymentOnboardingStatus(this.wireValue);

  final String wireValue;

  static const tokens = {
    'notStarted': notStarted,
    'incomplete': incomplete,
    'pending': pending,
    'restricted': restricted,
    'ready': ready,
  };
}

@freezed
abstract class VenuePaymentState with _$VenuePaymentState {
  const VenuePaymentState._();

  const factory VenuePaymentState({
    required bool onboardingStarted,
    required bool detailsSubmitted,
    required bool chargesEnabled,
    required bool payoutsEnabled,
    required bool optedIn,
    String? dashboardUrl,
    required bool mock,
    required String status,
    @Default(<String>[]) List<String> requirementsDue,
    String? disabledReason,
    required bool testMode,
    required bool canOpenDashboard,
    required bool onlinePaymentsAvailable,
  }) = _VenuePaymentState;

  factory VenuePaymentState.fromJson(Map<String, dynamic> json) =>
      _$VenuePaymentStateFromJson(json);

  PaymentOnboardingStatus get statusValue => parseWireEnum(
    status,
    PaymentOnboardingStatus.tokens,
    PaymentOnboardingStatus.unknown,
  );

  bool get canChoosePreference =>
      optedIn || statusValue == PaymentOnboardingStatus.ready;
}

@freezed
abstract class PaymentExternalLink with _$PaymentExternalLink {
  const factory PaymentExternalLink({required String url, required bool mock}) =
      _PaymentExternalLink;

  factory PaymentExternalLink.fromJson(Map<String, dynamic> json) =>
      _$PaymentExternalLinkFromJson(json);
}
