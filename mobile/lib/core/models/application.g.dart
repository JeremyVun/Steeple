// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'application.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_ProposedSchedule _$ProposedScheduleFromJson(Map<String, dynamic> json) =>
    _ProposedSchedule(
      frequency: json['frequency'] as String,
      startDate: json['startDate'] as String,
      endDate: json['endDate'] as String?,
      daysOfWeek: (json['daysOfWeek'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
      startTime: json['startTime'] as String,
      endTime: json['endTime'] as String,
    );

Map<String, dynamic> _$ProposedScheduleToJson(_ProposedSchedule instance) =>
    <String, dynamic>{
      'frequency': instance.frequency,
      'startDate': instance.startDate,
      'endDate': instance.endDate,
      'daysOfWeek': instance.daysOfWeek,
      'startTime': instance.startTime,
      'endTime': instance.endTime,
    };

_OrganizerRatingSummary _$OrganizerRatingSummaryFromJson(
  Map<String, dynamic> json,
) => _OrganizerRatingSummary(
  averageStars: (json['averageStars'] as num).toDouble(),
  ratingCount: (json['ratingCount'] as num).toInt(),
  noShowCount: (json['noShowCount'] as num).toInt(),
  completedBookings: (json['completedBookings'] as num).toInt(),
);

Map<String, dynamic> _$OrganizerRatingSummaryToJson(
  _OrganizerRatingSummary instance,
) => <String, dynamic>{
  'averageStars': instance.averageStars,
  'ratingCount': instance.ratingCount,
  'noShowCount': instance.noShowCount,
  'completedBookings': instance.completedBookings,
};

_Organizer _$OrganizerFromJson(Map<String, dynamic> json) => _Organizer(
  id: json['id'] as String,
  displayName: json['displayName'] as String,
  ratingSummary: json['ratingSummary'] == null
      ? null
      : OrganizerRatingSummary.fromJson(
          json['ratingSummary'] as Map<String, dynamic>,
        ),
);

Map<String, dynamic> _$OrganizerToJson(_Organizer instance) =>
    <String, dynamic>{
      'id': instance.id,
      'displayName': instance.displayName,
      'ratingSummary': instance.ratingSummary,
    };

_ApplicationMessage _$ApplicationMessageFromJson(Map<String, dynamic> json) =>
    _ApplicationMessage(
      id: json['id'] as String,
      senderId: json['senderId'] as String,
      body: json['body'] as String,
      sentAtUtc: DateTime.parse(json['sentAtUtc'] as String),
    );

Map<String, dynamic> _$ApplicationMessageToJson(_ApplicationMessage instance) =>
    <String, dynamic>{
      'id': instance.id,
      'senderId': instance.senderId,
      'body': instance.body,
      'sentAtUtc': instance.sentAtUtc.toIso8601String(),
    };

_PendingOverlap _$PendingOverlapFromJson(Map<String, dynamic> json) =>
    _PendingOverlap(
      applicationId: json['applicationId'] as String,
      organizerName: json['organizerName'] as String,
      overlappingDateCount: (json['overlappingDateCount'] as num).toInt(),
    );

Map<String, dynamic> _$PendingOverlapToJson(_PendingOverlap instance) =>
    <String, dynamic>{
      'applicationId': instance.applicationId,
      'organizerName': instance.organizerName,
      'overlappingDateCount': instance.overlappingDateCount,
    };

_ApplicationConflicts _$ApplicationConflictsFromJson(
  Map<String, dynamic> json,
) => _ApplicationConflicts(
  totalOccurrences: (json['totalOccurrences'] as num).toInt(),
  conflicts:
      (json['conflicts'] as List<dynamic>?)
          ?.map((e) => ScheduleConflict.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const <ScheduleConflict>[],
  pendingOverlaps:
      (json['pendingOverlaps'] as List<dynamic>?)
          ?.map((e) => PendingOverlap.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const <PendingOverlap>[],
);

Map<String, dynamic> _$ApplicationConflictsToJson(
  _ApplicationConflicts instance,
) => <String, dynamic>{
  'totalOccurrences': instance.totalOccurrences,
  'conflicts': instance.conflicts,
  'pendingOverlaps': instance.pendingOverlaps,
};

_CounterOffer _$CounterOfferFromJson(Map<String, dynamic> json) =>
    _CounterOffer(
      id: json['id'] as String,
      schedule: ProposedSchedule.fromJson(
        json['schedule'] as Map<String, dynamic>,
      ),
      message: json['message'] as String?,
      status: json['status'] as String,
      createdAtUtc: DateTime.parse(json['createdAtUtc'] as String),
      respondedAtUtc: json['respondedAtUtc'] == null
          ? null
          : DateTime.parse(json['respondedAtUtc'] as String),
    );

Map<String, dynamic> _$CounterOfferToJson(_CounterOffer instance) =>
    <String, dynamic>{
      'id': instance.id,
      'schedule': instance.schedule,
      'message': instance.message,
      'status': instance.status,
      'createdAtUtc': instance.createdAtUtc.toIso8601String(),
      'respondedAtUtc': instance.respondedAtUtc?.toIso8601String(),
    };

_Application _$ApplicationFromJson(Map<String, dynamic> json) => _Application(
  id: json['id'] as String,
  roomId: json['roomId'] as String,
  roomName: json['roomName'] as String,
  venueName: json['venueName'] as String,
  venueSlug: json['venueSlug'] as String,
  roomSlug: json['roomSlug'] as String,
  organizer: Organizer.fromJson(json['organizer'] as Map<String, dynamic>),
  activityType: json['activityType'] as String,
  groupSize: (json['groupSize'] as num).toInt(),
  schedule: ProposedSchedule.fromJson(json['schedule'] as Map<String, dynamic>),
  intentText: json['intentText'] as String,
  status: json['status'] as String,
  createdAtUtc: DateTime.parse(json['createdAtUtc'] as String),
  decidedAtUtc: json['decidedAtUtc'] == null
      ? null
      : DateTime.parse(json['decidedAtUtc'] as String),
  expiresAtUtc: DateTime.parse(json['expiresAtUtc'] as String),
  bookingId: json['bookingId'] as String?,
  messageCount: (json['messageCount'] as num).toInt(),
  messages:
      (json['messages'] as List<dynamic>?)
          ?.map((e) => ApplicationMessage.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const <ApplicationMessage>[],
  conflicts: json['conflicts'] == null
      ? null
      : ApplicationConflicts.fromJson(
          json['conflicts'] as Map<String, dynamic>,
        ),
  counterOffer: json['counterOffer'] == null
      ? null
      : CounterOffer.fromJson(json['counterOffer'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ApplicationToJson(_Application instance) =>
    <String, dynamic>{
      'id': instance.id,
      'roomId': instance.roomId,
      'roomName': instance.roomName,
      'venueName': instance.venueName,
      'venueSlug': instance.venueSlug,
      'roomSlug': instance.roomSlug,
      'organizer': instance.organizer,
      'activityType': instance.activityType,
      'groupSize': instance.groupSize,
      'schedule': instance.schedule,
      'intentText': instance.intentText,
      'status': instance.status,
      'createdAtUtc': instance.createdAtUtc.toIso8601String(),
      'decidedAtUtc': instance.decidedAtUtc?.toIso8601String(),
      'expiresAtUtc': instance.expiresAtUtc.toIso8601String(),
      'bookingId': instance.bookingId,
      'messageCount': instance.messageCount,
      'messages': instance.messages,
      'conflicts': instance.conflicts,
      'counterOffer': instance.counterOffer,
    };

_ApplicationDraft _$ApplicationDraftFromJson(Map<String, dynamic> json) =>
    _ApplicationDraft(
      activityType: json['activityType'] as String? ?? '',
      groupSize: (json['groupSize'] as num?)?.toInt() ?? 0,
      schedule: json['schedule'] == null
          ? null
          : ProposedSchedule.fromJson(json['schedule'] as Map<String, dynamic>),
      intentText: json['intentText'] as String? ?? '',
    );

Map<String, dynamic> _$ApplicationDraftToJson(_ApplicationDraft instance) =>
    <String, dynamic>{
      'activityType': instance.activityType,
      'groupSize': instance.groupSize,
      'schedule': instance.schedule,
      'intentText': instance.intentText,
    };
