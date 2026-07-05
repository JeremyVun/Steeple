// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'venue_calendar.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_CalendarRoomRef _$CalendarRoomRefFromJson(Map<String, dynamic> json) =>
    _CalendarRoomRef(id: json['id'] as String, name: json['name'] as String);

Map<String, dynamic> _$CalendarRoomRefToJson(_CalendarRoomRef instance) =>
    <String, dynamic>{'id': instance.id, 'name': instance.name};

_CalendarOccurrence _$CalendarOccurrenceFromJson(Map<String, dynamic> json) =>
    _CalendarOccurrence(
      bookingId: json['bookingId'] as String,
      roomId: json['roomId'] as String,
      organizerName: json['organizerName'] as String,
      localDate: json['localDate'] as String,
      startTime: json['startTime'] as String,
      endTime: json['endTime'] as String,
      status: json['status'] as String,
    );

Map<String, dynamic> _$CalendarOccurrenceToJson(_CalendarOccurrence instance) =>
    <String, dynamic>{
      'bookingId': instance.bookingId,
      'roomId': instance.roomId,
      'organizerName': instance.organizerName,
      'localDate': instance.localDate,
      'startTime': instance.startTime,
      'endTime': instance.endTime,
      'status': instance.status,
    };

_CalendarPending _$CalendarPendingFromJson(Map<String, dynamic> json) =>
    _CalendarPending(
      applicationId: json['applicationId'] as String,
      roomId: json['roomId'] as String,
      organizerName: json['organizerName'] as String,
      startTime: json['startTime'] as String,
      endTime: json['endTime'] as String,
      dates:
          (json['dates'] as List<dynamic>?)?.map((e) => e as String).toList() ??
          const <String>[],
    );

Map<String, dynamic> _$CalendarPendingToJson(_CalendarPending instance) =>
    <String, dynamic>{
      'applicationId': instance.applicationId,
      'roomId': instance.roomId,
      'organizerName': instance.organizerName,
      'startTime': instance.startTime,
      'endTime': instance.endTime,
      'dates': instance.dates,
    };

_VenueCalendar _$VenueCalendarFromJson(Map<String, dynamic> json) =>
    _VenueCalendar(
      venueId: json['venueId'] as String,
      timezone: json['timezone'] as String,
      from: json['from'] as String,
      to: json['to'] as String,
      rooms:
          (json['rooms'] as List<dynamic>?)
              ?.map((e) => CalendarRoomRef.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const <CalendarRoomRef>[],
      occurrences:
          (json['occurrences'] as List<dynamic>?)
              ?.map(
                (e) => CalendarOccurrence.fromJson(e as Map<String, dynamic>),
              )
              .toList() ??
          const <CalendarOccurrence>[],
      pending:
          (json['pending'] as List<dynamic>?)
              ?.map((e) => CalendarPending.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const <CalendarPending>[],
    );

Map<String, dynamic> _$VenueCalendarToJson(_VenueCalendar instance) =>
    <String, dynamic>{
      'venueId': instance.venueId,
      'timezone': instance.timezone,
      'from': instance.from,
      'to': instance.to,
      'rooms': instance.rooms,
      'occurrences': instance.occurrences,
      'pending': instance.pending,
    };
