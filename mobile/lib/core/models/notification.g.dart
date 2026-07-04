// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'notification.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_NotificationPayload _$NotificationPayloadFromJson(Map<String, dynamic> json) =>
    _NotificationPayload(
      applicationId: json['applicationId'] as String?,
      bookingId: json['bookingId'] as String?,
      roomId: json['roomId'] as String?,
      roomName: json['roomName'] as String?,
      venueName: json['venueName'] as String?,
      venueSlug: json['venueSlug'] as String?,
      roomSlug: json['roomSlug'] as String?,
      organizerName: json['organizerName'] as String?,
      status: json['status'] as String?,
      deepLink: json['deepLink'] as String?,
    );

Map<String, dynamic> _$NotificationPayloadToJson(
  _NotificationPayload instance,
) => <String, dynamic>{
  'applicationId': instance.applicationId,
  'bookingId': instance.bookingId,
  'roomId': instance.roomId,
  'roomName': instance.roomName,
  'venueName': instance.venueName,
  'venueSlug': instance.venueSlug,
  'roomSlug': instance.roomSlug,
  'organizerName': instance.organizerName,
  'status': instance.status,
  'deepLink': instance.deepLink,
};

_AppNotification _$AppNotificationFromJson(Map<String, dynamic> json) =>
    _AppNotification(
      id: json['id'] as String,
      type: json['type'] as String,
      createdAtUtc: DateTime.parse(json['createdAtUtc'] as String),
      readAt: json['readAt'] == null
          ? null
          : DateTime.parse(json['readAt'] as String),
      payload: NotificationPayload.fromJson(
        json['payload'] as Map<String, dynamic>,
      ),
    );

Map<String, dynamic> _$AppNotificationToJson(_AppNotification instance) =>
    <String, dynamic>{
      'id': instance.id,
      'type': instance.type,
      'createdAtUtc': instance.createdAtUtc.toIso8601String(),
      'readAt': instance.readAt?.toIso8601String(),
      'payload': instance.payload,
    };
