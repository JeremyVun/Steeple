// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'payments.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_VenuePaymentState _$VenuePaymentStateFromJson(Map<String, dynamic> json) =>
    _VenuePaymentState(
      onboardingStarted: json['onboardingStarted'] as bool,
      detailsSubmitted: json['detailsSubmitted'] as bool,
      chargesEnabled: json['chargesEnabled'] as bool,
      payoutsEnabled: json['payoutsEnabled'] as bool,
      optedIn: json['optedIn'] as bool,
      dashboardUrl: json['dashboardUrl'] as String?,
      mock: json['mock'] as bool,
      status: json['status'] as String,
      requirementsDue:
          (json['requirementsDue'] as List<dynamic>?)
              ?.map((e) => e as String)
              .toList() ??
          const <String>[],
      disabledReason: json['disabledReason'] as String?,
      testMode: json['testMode'] as bool,
      canOpenDashboard: json['canOpenDashboard'] as bool,
      onlinePaymentsAvailable: json['onlinePaymentsAvailable'] as bool,
    );

Map<String, dynamic> _$VenuePaymentStateToJson(_VenuePaymentState instance) =>
    <String, dynamic>{
      'onboardingStarted': instance.onboardingStarted,
      'detailsSubmitted': instance.detailsSubmitted,
      'chargesEnabled': instance.chargesEnabled,
      'payoutsEnabled': instance.payoutsEnabled,
      'optedIn': instance.optedIn,
      'dashboardUrl': instance.dashboardUrl,
      'mock': instance.mock,
      'status': instance.status,
      'requirementsDue': instance.requirementsDue,
      'disabledReason': instance.disabledReason,
      'testMode': instance.testMode,
      'canOpenDashboard': instance.canOpenDashboard,
      'onlinePaymentsAvailable': instance.onlinePaymentsAvailable,
    };

_PaymentExternalLink _$PaymentExternalLinkFromJson(Map<String, dynamic> json) =>
    _PaymentExternalLink(
      url: json['url'] as String,
      mock: json['mock'] as bool,
    );

Map<String, dynamic> _$PaymentExternalLinkToJson(
  _PaymentExternalLink instance,
) => <String, dynamic>{'url': instance.url, 'mock': instance.mock};
