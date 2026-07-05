// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'room_availability.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_OpenWindow _$OpenWindowFromJson(Map<String, dynamic> json) => _OpenWindow(
  startTime: json['startTime'] as String,
  endTime: json['endTime'] as String,
);

Map<String, dynamic> _$OpenWindowToJson(_OpenWindow instance) =>
    <String, dynamic>{
      'startTime': instance.startTime,
      'endTime': instance.endTime,
    };

_DayOpenHours _$DayOpenHoursFromJson(Map<String, dynamic> json) =>
    _DayOpenHours(
      dayOfWeek: json['dayOfWeek'] as String,
      windows:
          (json['windows'] as List<dynamic>?)
              ?.map((e) => OpenWindow.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const <OpenWindow>[],
    );

Map<String, dynamic> _$DayOpenHoursToJson(_DayOpenHours instance) =>
    <String, dynamic>{
      'dayOfWeek': instance.dayOfWeek,
      'windows': instance.windows,
    };

_BlackoutDate _$BlackoutDateFromJson(Map<String, dynamic> json) =>
    _BlackoutDate(
      date: json['date'] as String,
      reason: json['reason'] as String?,
    );

Map<String, dynamic> _$BlackoutDateToJson(_BlackoutDate instance) =>
    <String, dynamic>{'date': instance.date, 'reason': instance.reason};

_RoomAvailabilityRules _$RoomAvailabilityRulesFromJson(
  Map<String, dynamic> json,
) => _RoomAvailabilityRules(
  roomId: json['roomId'] as String,
  timezone: json['timezone'] as String,
  days:
      (json['days'] as List<dynamic>?)
          ?.map((e) => DayOpenHours.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const <DayOpenHours>[],
  blackouts:
      (json['blackouts'] as List<dynamic>?)
          ?.map((e) => BlackoutDate.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const <BlackoutDate>[],
);

Map<String, dynamic> _$RoomAvailabilityRulesToJson(
  _RoomAvailabilityRules instance,
) => <String, dynamic>{
  'roomId': instance.roomId,
  'timezone': instance.timezone,
  'days': instance.days,
  'blackouts': instance.blackouts,
};
