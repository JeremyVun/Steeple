// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'user.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_UserProfile _$UserProfileFromJson(Map<String, dynamic> json) => _UserProfile(
  id: json['id'] as String,
  displayName: json['displayName'] as String,
  email: json['email'] as String?,
  createdAtUtc: DateTime.parse(json['createdAtUtc'] as String),
);

Map<String, dynamic> _$UserProfileToJson(_UserProfile instance) =>
    <String, dynamic>{
      'id': instance.id,
      'displayName': instance.displayName,
      'email': instance.email,
      'createdAtUtc': instance.createdAtUtc.toIso8601String(),
    };

_Agreement _$AgreementFromJson(Map<String, dynamic> json) => _Agreement(
  docType: json['docType'] as String,
  version: json['version'] as String,
  acceptedAtUtc: DateTime.parse(json['acceptedAtUtc'] as String),
);

Map<String, dynamic> _$AgreementToJson(_Agreement instance) =>
    <String, dynamic>{
      'docType': instance.docType,
      'version': instance.version,
      'acceptedAtUtc': instance.acceptedAtUtc.toIso8601String(),
    };

_MeResponse _$MeResponseFromJson(Map<String, dynamic> json) => _MeResponse(
  id: json['id'] as String,
  displayName: json['displayName'] as String,
  email: json['email'] as String?,
  createdAtUtc: DateTime.parse(json['createdAtUtc'] as String),
  agreements:
      (json['agreements'] as List<dynamic>?)
          ?.map((e) => Agreement.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const <Agreement>[],
);

Map<String, dynamic> _$MeResponseToJson(_MeResponse instance) =>
    <String, dynamic>{
      'id': instance.id,
      'displayName': instance.displayName,
      'email': instance.email,
      'createdAtUtc': instance.createdAtUtc.toIso8601String(),
      'agreements': instance.agreements,
    };

_AuthSession _$AuthSessionFromJson(Map<String, dynamic> json) => _AuthSession(
  accessToken: json['accessToken'] as String,
  refreshToken: json['refreshToken'] as String,
  user: UserProfile.fromJson(json['user'] as Map<String, dynamic>),
  isNewUser: json['isNewUser'] as bool,
);

Map<String, dynamic> _$AuthSessionToJson(_AuthSession instance) =>
    <String, dynamic>{
      'accessToken': instance.accessToken,
      'refreshToken': instance.refreshToken,
      'user': instance.user,
      'isNewUser': instance.isNewUser,
    };
