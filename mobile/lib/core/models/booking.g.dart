// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'booking.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_SubmittedRating _$SubmittedRatingFromJson(Map<String, dynamic> json) =>
    _SubmittedRating(
      stars: (json['stars'] as num).toInt(),
      comment: json['comment'] as String?,
      createdAtUtc: DateTime.parse(json['createdAtUtc'] as String),
    );

Map<String, dynamic> _$SubmittedRatingToJson(_SubmittedRating instance) =>
    <String, dynamic>{
      'stars': instance.stars,
      'comment': instance.comment,
      'createdAtUtc': instance.createdAtUtc.toIso8601String(),
    };

_BookingRatings _$BookingRatingsFromJson(Map<String, dynamic> json) =>
    _BookingRatings(
      byOrganizer: json['byOrganizer'] == null
          ? null
          : SubmittedRating.fromJson(
              json['byOrganizer'] as Map<String, dynamic>,
            ),
      byVenue: json['byVenue'] == null
          ? null
          : SubmittedRating.fromJson(json['byVenue'] as Map<String, dynamic>),
      canRate: json['canRate'] as bool,
      rateByUtc: json['rateByUtc'] == null
          ? null
          : DateTime.parse(json['rateByUtc'] as String),
    );

Map<String, dynamic> _$BookingRatingsToJson(_BookingRatings instance) =>
    <String, dynamic>{
      'byOrganizer': instance.byOrganizer,
      'byVenue': instance.byVenue,
      'canRate': instance.canRate,
      'rateByUtc': instance.rateByUtc?.toIso8601String(),
    };

_Occurrence _$OccurrenceFromJson(Map<String, dynamic> json) => _Occurrence(
  id: json['id'] as String,
  startUtc: DateTime.parse(json['startUtc'] as String),
  endUtc: DateTime.parse(json['endUtc'] as String),
  localDate: json['localDate'] as String,
  status: json['status'] as String,
  noShowMarkedBy: json['noShowMarkedBy'] as String?,
);

Map<String, dynamic> _$OccurrenceToJson(_Occurrence instance) =>
    <String, dynamic>{
      'id': instance.id,
      'startUtc': instance.startUtc.toIso8601String(),
      'endUtc': instance.endUtc.toIso8601String(),
      'localDate': instance.localDate,
      'status': instance.status,
      'noShowMarkedBy': instance.noShowMarkedBy,
    };

_Booking _$BookingFromJson(Map<String, dynamic> json) => _Booking(
  id: json['id'] as String,
  applicationId: json['applicationId'] as String,
  roomId: json['roomId'] as String,
  roomName: json['roomName'] as String,
  venueName: json['venueName'] as String,
  venueSlug: json['venueSlug'] as String,
  roomSlug: json['roomSlug'] as String,
  venueTimezone: json['venueTimezone'] as String,
  organizerId: json['organizerId'] as String,
  organizerName: json['organizerName'] as String,
  type: json['type'] as String,
  startDate: json['startDate'] as String,
  endDate: json['endDate'] as String,
  schedule: ProposedSchedule.fromJson(json['schedule'] as Map<String, dynamic>),
  status: json['status'] as String,
  createdAtUtc: DateTime.parse(json['createdAtUtc'] as String),
  cancelledBy: json['cancelledBy'] as String?,
  cancelledAtUtc: json['cancelledAtUtc'] == null
      ? null
      : DateTime.parse(json['cancelledAtUtc'] as String),
  cancelReason: json['cancelReason'] as String?,
  nextOccurrence: json['nextOccurrence'] == null
      ? null
      : Occurrence.fromJson(json['nextOccurrence'] as Map<String, dynamic>),
  occurrences:
      (json['occurrences'] as List<dynamic>?)
          ?.map((e) => Occurrence.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const <Occurrence>[],
  ratings: json['ratings'] == null
      ? null
      : BookingRatings.fromJson(json['ratings'] as Map<String, dynamic>),
);

Map<String, dynamic> _$BookingToJson(_Booking instance) => <String, dynamic>{
  'id': instance.id,
  'applicationId': instance.applicationId,
  'roomId': instance.roomId,
  'roomName': instance.roomName,
  'venueName': instance.venueName,
  'venueSlug': instance.venueSlug,
  'roomSlug': instance.roomSlug,
  'venueTimezone': instance.venueTimezone,
  'organizerId': instance.organizerId,
  'organizerName': instance.organizerName,
  'type': instance.type,
  'startDate': instance.startDate,
  'endDate': instance.endDate,
  'schedule': instance.schedule,
  'status': instance.status,
  'createdAtUtc': instance.createdAtUtc.toIso8601String(),
  'cancelledBy': instance.cancelledBy,
  'cancelledAtUtc': instance.cancelledAtUtc?.toIso8601String(),
  'cancelReason': instance.cancelReason,
  'nextOccurrence': instance.nextOccurrence,
  'occurrences': instance.occurrences,
  'ratings': instance.ratings,
};
