// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'availability.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_AvailabilityDay _$AvailabilityDayFromJson(Map<String, dynamic> json) =>
    _AvailabilityDay(
      date: json['date'] as String,
      isBlackout: json['isBlackout'] as bool? ?? false,
      freeWindows:
          (json['freeWindows'] as List<dynamic>?)
              ?.map((e) => OpenWindow.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const <OpenWindow>[],
    );

Map<String, dynamic> _$AvailabilityDayToJson(_AvailabilityDay instance) =>
    <String, dynamic>{
      'date': instance.date,
      'isBlackout': instance.isBlackout,
      'freeWindows': instance.freeWindows,
    };

_RoomAvailability _$RoomAvailabilityFromJson(Map<String, dynamic> json) =>
    _RoomAvailability(
      roomId: json['roomId'] as String,
      timezone: json['timezone'] as String,
      from: json['from'] as String,
      to: json['to'] as String,
      days:
          (json['days'] as List<dynamic>?)
              ?.map((e) => AvailabilityDay.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const <AvailabilityDay>[],
    );

Map<String, dynamic> _$RoomAvailabilityToJson(_RoomAvailability instance) =>
    <String, dynamic>{
      'roomId': instance.roomId,
      'timezone': instance.timezone,
      'from': instance.from,
      'to': instance.to,
      'days': instance.days,
    };

_ScheduleConflict _$ScheduleConflictFromJson(Map<String, dynamic> json) =>
    _ScheduleConflict(
      date: json['date'] as String,
      reason: json['reason'] as String,
    );

Map<String, dynamic> _$ScheduleConflictToJson(_ScheduleConflict instance) =>
    <String, dynamic>{'date': instance.date, 'reason': instance.reason};

_ScheduleCheckResult _$ScheduleCheckResultFromJson(Map<String, dynamic> json) =>
    _ScheduleCheckResult(
      available: json['available'] as bool,
      totalOccurrences: (json['totalOccurrences'] as num).toInt(),
      conflicts:
          (json['conflicts'] as List<dynamic>?)
              ?.map((e) => ScheduleConflict.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const <ScheduleConflict>[],
    );

Map<String, dynamic> _$ScheduleCheckResultToJson(
  _ScheduleCheckResult instance,
) => <String, dynamic>{
  'available': instance.available,
  'totalOccurrences': instance.totalOccurrences,
  'conflicts': instance.conflicts,
};
