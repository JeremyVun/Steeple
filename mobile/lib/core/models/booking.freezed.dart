// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'booking.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$Occurrence {

 String get id; DateTime get startUtc; DateTime get endUtc;/// `yyyy-MM-dd`, venue-local.
 String get localDate;/// Wire token: `scheduled | occurred | noShow | cancelled`.
 String get status; String? get noShowMarkedBy;
/// Create a copy of Occurrence
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$OccurrenceCopyWith<Occurrence> get copyWith => _$OccurrenceCopyWithImpl<Occurrence>(this as Occurrence, _$identity);

  /// Serializes this Occurrence to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Occurrence&&(identical(other.id, id) || other.id == id)&&(identical(other.startUtc, startUtc) || other.startUtc == startUtc)&&(identical(other.endUtc, endUtc) || other.endUtc == endUtc)&&(identical(other.localDate, localDate) || other.localDate == localDate)&&(identical(other.status, status) || other.status == status)&&(identical(other.noShowMarkedBy, noShowMarkedBy) || other.noShowMarkedBy == noShowMarkedBy));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,startUtc,endUtc,localDate,status,noShowMarkedBy);

@override
String toString() {
  return 'Occurrence(id: $id, startUtc: $startUtc, endUtc: $endUtc, localDate: $localDate, status: $status, noShowMarkedBy: $noShowMarkedBy)';
}


}

/// @nodoc
abstract mixin class $OccurrenceCopyWith<$Res>  {
  factory $OccurrenceCopyWith(Occurrence value, $Res Function(Occurrence) _then) = _$OccurrenceCopyWithImpl;
@useResult
$Res call({
 String id, DateTime startUtc, DateTime endUtc, String localDate, String status, String? noShowMarkedBy
});




}
/// @nodoc
class _$OccurrenceCopyWithImpl<$Res>
    implements $OccurrenceCopyWith<$Res> {
  _$OccurrenceCopyWithImpl(this._self, this._then);

  final Occurrence _self;
  final $Res Function(Occurrence) _then;

/// Create a copy of Occurrence
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? startUtc = null,Object? endUtc = null,Object? localDate = null,Object? status = null,Object? noShowMarkedBy = freezed,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,startUtc: null == startUtc ? _self.startUtc : startUtc // ignore: cast_nullable_to_non_nullable
as DateTime,endUtc: null == endUtc ? _self.endUtc : endUtc // ignore: cast_nullable_to_non_nullable
as DateTime,localDate: null == localDate ? _self.localDate : localDate // ignore: cast_nullable_to_non_nullable
as String,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,noShowMarkedBy: freezed == noShowMarkedBy ? _self.noShowMarkedBy : noShowMarkedBy // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [Occurrence].
extension OccurrencePatterns on Occurrence {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Occurrence value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Occurrence() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Occurrence value)  $default,){
final _that = this;
switch (_that) {
case _Occurrence():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Occurrence value)?  $default,){
final _that = this;
switch (_that) {
case _Occurrence() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  DateTime startUtc,  DateTime endUtc,  String localDate,  String status,  String? noShowMarkedBy)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Occurrence() when $default != null:
return $default(_that.id,_that.startUtc,_that.endUtc,_that.localDate,_that.status,_that.noShowMarkedBy);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  DateTime startUtc,  DateTime endUtc,  String localDate,  String status,  String? noShowMarkedBy)  $default,) {final _that = this;
switch (_that) {
case _Occurrence():
return $default(_that.id,_that.startUtc,_that.endUtc,_that.localDate,_that.status,_that.noShowMarkedBy);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  DateTime startUtc,  DateTime endUtc,  String localDate,  String status,  String? noShowMarkedBy)?  $default,) {final _that = this;
switch (_that) {
case _Occurrence() when $default != null:
return $default(_that.id,_that.startUtc,_that.endUtc,_that.localDate,_that.status,_that.noShowMarkedBy);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _Occurrence extends Occurrence {
  const _Occurrence({required this.id, required this.startUtc, required this.endUtc, required this.localDate, required this.status, this.noShowMarkedBy}): super._();
  factory _Occurrence.fromJson(Map<String, dynamic> json) => _$OccurrenceFromJson(json);

@override final  String id;
@override final  DateTime startUtc;
@override final  DateTime endUtc;
/// `yyyy-MM-dd`, venue-local.
@override final  String localDate;
/// Wire token: `scheduled | occurred | noShow | cancelled`.
@override final  String status;
@override final  String? noShowMarkedBy;

/// Create a copy of Occurrence
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$OccurrenceCopyWith<_Occurrence> get copyWith => __$OccurrenceCopyWithImpl<_Occurrence>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$OccurrenceToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _Occurrence&&(identical(other.id, id) || other.id == id)&&(identical(other.startUtc, startUtc) || other.startUtc == startUtc)&&(identical(other.endUtc, endUtc) || other.endUtc == endUtc)&&(identical(other.localDate, localDate) || other.localDate == localDate)&&(identical(other.status, status) || other.status == status)&&(identical(other.noShowMarkedBy, noShowMarkedBy) || other.noShowMarkedBy == noShowMarkedBy));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,startUtc,endUtc,localDate,status,noShowMarkedBy);

@override
String toString() {
  return 'Occurrence(id: $id, startUtc: $startUtc, endUtc: $endUtc, localDate: $localDate, status: $status, noShowMarkedBy: $noShowMarkedBy)';
}


}

/// @nodoc
abstract mixin class _$OccurrenceCopyWith<$Res> implements $OccurrenceCopyWith<$Res> {
  factory _$OccurrenceCopyWith(_Occurrence value, $Res Function(_Occurrence) _then) = __$OccurrenceCopyWithImpl;
@override @useResult
$Res call({
 String id, DateTime startUtc, DateTime endUtc, String localDate, String status, String? noShowMarkedBy
});




}
/// @nodoc
class __$OccurrenceCopyWithImpl<$Res>
    implements _$OccurrenceCopyWith<$Res> {
  __$OccurrenceCopyWithImpl(this._self, this._then);

  final _Occurrence _self;
  final $Res Function(_Occurrence) _then;

/// Create a copy of Occurrence
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? startUtc = null,Object? endUtc = null,Object? localDate = null,Object? status = null,Object? noShowMarkedBy = freezed,}) {
  return _then(_Occurrence(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,startUtc: null == startUtc ? _self.startUtc : startUtc // ignore: cast_nullable_to_non_nullable
as DateTime,endUtc: null == endUtc ? _self.endUtc : endUtc // ignore: cast_nullable_to_non_nullable
as DateTime,localDate: null == localDate ? _self.localDate : localDate // ignore: cast_nullable_to_non_nullable
as String,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,noShowMarkedBy: freezed == noShowMarkedBy ? _self.noShowMarkedBy : noShowMarkedBy // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}


/// @nodoc
mixin _$Booking {

 String get id; String get applicationId; String get roomId; String get roomName; String get venueName; String get venueSlug; String get roomSlug; String get venueTimezone; String get organizerId; String get organizerName;/// Wire token: `oneOff` or `recurring`.
 String get type;/// `yyyy-MM-dd`, venue-local.
 String get startDate;/// `yyyy-MM-dd`, venue-local.
 String get endDate; ProposedSchedule get schedule;/// Wire token: `confirmed | completed | cancelled`.
 String get status; DateTime get createdAtUtc; String? get cancelledBy; DateTime? get cancelledAtUtc; String? get cancelReason;/// The next live occurrence — set on lists too.
 Occurrence? get nextOccurrence; List<Occurrence> get occurrences;
/// Create a copy of Booking
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$BookingCopyWith<Booking> get copyWith => _$BookingCopyWithImpl<Booking>(this as Booking, _$identity);

  /// Serializes this Booking to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Booking&&(identical(other.id, id) || other.id == id)&&(identical(other.applicationId, applicationId) || other.applicationId == applicationId)&&(identical(other.roomId, roomId) || other.roomId == roomId)&&(identical(other.roomName, roomName) || other.roomName == roomName)&&(identical(other.venueName, venueName) || other.venueName == venueName)&&(identical(other.venueSlug, venueSlug) || other.venueSlug == venueSlug)&&(identical(other.roomSlug, roomSlug) || other.roomSlug == roomSlug)&&(identical(other.venueTimezone, venueTimezone) || other.venueTimezone == venueTimezone)&&(identical(other.organizerId, organizerId) || other.organizerId == organizerId)&&(identical(other.organizerName, organizerName) || other.organizerName == organizerName)&&(identical(other.type, type) || other.type == type)&&(identical(other.startDate, startDate) || other.startDate == startDate)&&(identical(other.endDate, endDate) || other.endDate == endDate)&&(identical(other.schedule, schedule) || other.schedule == schedule)&&(identical(other.status, status) || other.status == status)&&(identical(other.createdAtUtc, createdAtUtc) || other.createdAtUtc == createdAtUtc)&&(identical(other.cancelledBy, cancelledBy) || other.cancelledBy == cancelledBy)&&(identical(other.cancelledAtUtc, cancelledAtUtc) || other.cancelledAtUtc == cancelledAtUtc)&&(identical(other.cancelReason, cancelReason) || other.cancelReason == cancelReason)&&(identical(other.nextOccurrence, nextOccurrence) || other.nextOccurrence == nextOccurrence)&&const DeepCollectionEquality().equals(other.occurrences, occurrences));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hashAll([runtimeType,id,applicationId,roomId,roomName,venueName,venueSlug,roomSlug,venueTimezone,organizerId,organizerName,type,startDate,endDate,schedule,status,createdAtUtc,cancelledBy,cancelledAtUtc,cancelReason,nextOccurrence,const DeepCollectionEquality().hash(occurrences)]);

@override
String toString() {
  return 'Booking(id: $id, applicationId: $applicationId, roomId: $roomId, roomName: $roomName, venueName: $venueName, venueSlug: $venueSlug, roomSlug: $roomSlug, venueTimezone: $venueTimezone, organizerId: $organizerId, organizerName: $organizerName, type: $type, startDate: $startDate, endDate: $endDate, schedule: $schedule, status: $status, createdAtUtc: $createdAtUtc, cancelledBy: $cancelledBy, cancelledAtUtc: $cancelledAtUtc, cancelReason: $cancelReason, nextOccurrence: $nextOccurrence, occurrences: $occurrences)';
}


}

/// @nodoc
abstract mixin class $BookingCopyWith<$Res>  {
  factory $BookingCopyWith(Booking value, $Res Function(Booking) _then) = _$BookingCopyWithImpl;
@useResult
$Res call({
 String id, String applicationId, String roomId, String roomName, String venueName, String venueSlug, String roomSlug, String venueTimezone, String organizerId, String organizerName, String type, String startDate, String endDate, ProposedSchedule schedule, String status, DateTime createdAtUtc, String? cancelledBy, DateTime? cancelledAtUtc, String? cancelReason, Occurrence? nextOccurrence, List<Occurrence> occurrences
});


$ProposedScheduleCopyWith<$Res> get schedule;$OccurrenceCopyWith<$Res>? get nextOccurrence;

}
/// @nodoc
class _$BookingCopyWithImpl<$Res>
    implements $BookingCopyWith<$Res> {
  _$BookingCopyWithImpl(this._self, this._then);

  final Booking _self;
  final $Res Function(Booking) _then;

/// Create a copy of Booking
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? applicationId = null,Object? roomId = null,Object? roomName = null,Object? venueName = null,Object? venueSlug = null,Object? roomSlug = null,Object? venueTimezone = null,Object? organizerId = null,Object? organizerName = null,Object? type = null,Object? startDate = null,Object? endDate = null,Object? schedule = null,Object? status = null,Object? createdAtUtc = null,Object? cancelledBy = freezed,Object? cancelledAtUtc = freezed,Object? cancelReason = freezed,Object? nextOccurrence = freezed,Object? occurrences = null,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,applicationId: null == applicationId ? _self.applicationId : applicationId // ignore: cast_nullable_to_non_nullable
as String,roomId: null == roomId ? _self.roomId : roomId // ignore: cast_nullable_to_non_nullable
as String,roomName: null == roomName ? _self.roomName : roomName // ignore: cast_nullable_to_non_nullable
as String,venueName: null == venueName ? _self.venueName : venueName // ignore: cast_nullable_to_non_nullable
as String,venueSlug: null == venueSlug ? _self.venueSlug : venueSlug // ignore: cast_nullable_to_non_nullable
as String,roomSlug: null == roomSlug ? _self.roomSlug : roomSlug // ignore: cast_nullable_to_non_nullable
as String,venueTimezone: null == venueTimezone ? _self.venueTimezone : venueTimezone // ignore: cast_nullable_to_non_nullable
as String,organizerId: null == organizerId ? _self.organizerId : organizerId // ignore: cast_nullable_to_non_nullable
as String,organizerName: null == organizerName ? _self.organizerName : organizerName // ignore: cast_nullable_to_non_nullable
as String,type: null == type ? _self.type : type // ignore: cast_nullable_to_non_nullable
as String,startDate: null == startDate ? _self.startDate : startDate // ignore: cast_nullable_to_non_nullable
as String,endDate: null == endDate ? _self.endDate : endDate // ignore: cast_nullable_to_non_nullable
as String,schedule: null == schedule ? _self.schedule : schedule // ignore: cast_nullable_to_non_nullable
as ProposedSchedule,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,createdAtUtc: null == createdAtUtc ? _self.createdAtUtc : createdAtUtc // ignore: cast_nullable_to_non_nullable
as DateTime,cancelledBy: freezed == cancelledBy ? _self.cancelledBy : cancelledBy // ignore: cast_nullable_to_non_nullable
as String?,cancelledAtUtc: freezed == cancelledAtUtc ? _self.cancelledAtUtc : cancelledAtUtc // ignore: cast_nullable_to_non_nullable
as DateTime?,cancelReason: freezed == cancelReason ? _self.cancelReason : cancelReason // ignore: cast_nullable_to_non_nullable
as String?,nextOccurrence: freezed == nextOccurrence ? _self.nextOccurrence : nextOccurrence // ignore: cast_nullable_to_non_nullable
as Occurrence?,occurrences: null == occurrences ? _self.occurrences : occurrences // ignore: cast_nullable_to_non_nullable
as List<Occurrence>,
  ));
}
/// Create a copy of Booking
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$ProposedScheduleCopyWith<$Res> get schedule {
  
  return $ProposedScheduleCopyWith<$Res>(_self.schedule, (value) {
    return _then(_self.copyWith(schedule: value));
  });
}/// Create a copy of Booking
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$OccurrenceCopyWith<$Res>? get nextOccurrence {
    if (_self.nextOccurrence == null) {
    return null;
  }

  return $OccurrenceCopyWith<$Res>(_self.nextOccurrence!, (value) {
    return _then(_self.copyWith(nextOccurrence: value));
  });
}
}


/// Adds pattern-matching-related methods to [Booking].
extension BookingPatterns on Booking {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Booking value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Booking() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Booking value)  $default,){
final _that = this;
switch (_that) {
case _Booking():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Booking value)?  $default,){
final _that = this;
switch (_that) {
case _Booking() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String applicationId,  String roomId,  String roomName,  String venueName,  String venueSlug,  String roomSlug,  String venueTimezone,  String organizerId,  String organizerName,  String type,  String startDate,  String endDate,  ProposedSchedule schedule,  String status,  DateTime createdAtUtc,  String? cancelledBy,  DateTime? cancelledAtUtc,  String? cancelReason,  Occurrence? nextOccurrence,  List<Occurrence> occurrences)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Booking() when $default != null:
return $default(_that.id,_that.applicationId,_that.roomId,_that.roomName,_that.venueName,_that.venueSlug,_that.roomSlug,_that.venueTimezone,_that.organizerId,_that.organizerName,_that.type,_that.startDate,_that.endDate,_that.schedule,_that.status,_that.createdAtUtc,_that.cancelledBy,_that.cancelledAtUtc,_that.cancelReason,_that.nextOccurrence,_that.occurrences);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String applicationId,  String roomId,  String roomName,  String venueName,  String venueSlug,  String roomSlug,  String venueTimezone,  String organizerId,  String organizerName,  String type,  String startDate,  String endDate,  ProposedSchedule schedule,  String status,  DateTime createdAtUtc,  String? cancelledBy,  DateTime? cancelledAtUtc,  String? cancelReason,  Occurrence? nextOccurrence,  List<Occurrence> occurrences)  $default,) {final _that = this;
switch (_that) {
case _Booking():
return $default(_that.id,_that.applicationId,_that.roomId,_that.roomName,_that.venueName,_that.venueSlug,_that.roomSlug,_that.venueTimezone,_that.organizerId,_that.organizerName,_that.type,_that.startDate,_that.endDate,_that.schedule,_that.status,_that.createdAtUtc,_that.cancelledBy,_that.cancelledAtUtc,_that.cancelReason,_that.nextOccurrence,_that.occurrences);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String applicationId,  String roomId,  String roomName,  String venueName,  String venueSlug,  String roomSlug,  String venueTimezone,  String organizerId,  String organizerName,  String type,  String startDate,  String endDate,  ProposedSchedule schedule,  String status,  DateTime createdAtUtc,  String? cancelledBy,  DateTime? cancelledAtUtc,  String? cancelReason,  Occurrence? nextOccurrence,  List<Occurrence> occurrences)?  $default,) {final _that = this;
switch (_that) {
case _Booking() when $default != null:
return $default(_that.id,_that.applicationId,_that.roomId,_that.roomName,_that.venueName,_that.venueSlug,_that.roomSlug,_that.venueTimezone,_that.organizerId,_that.organizerName,_that.type,_that.startDate,_that.endDate,_that.schedule,_that.status,_that.createdAtUtc,_that.cancelledBy,_that.cancelledAtUtc,_that.cancelReason,_that.nextOccurrence,_that.occurrences);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _Booking extends Booking {
  const _Booking({required this.id, required this.applicationId, required this.roomId, required this.roomName, required this.venueName, required this.venueSlug, required this.roomSlug, required this.venueTimezone, required this.organizerId, required this.organizerName, required this.type, required this.startDate, required this.endDate, required this.schedule, required this.status, required this.createdAtUtc, this.cancelledBy, this.cancelledAtUtc, this.cancelReason, this.nextOccurrence, final  List<Occurrence> occurrences = const <Occurrence>[]}): _occurrences = occurrences,super._();
  factory _Booking.fromJson(Map<String, dynamic> json) => _$BookingFromJson(json);

@override final  String id;
@override final  String applicationId;
@override final  String roomId;
@override final  String roomName;
@override final  String venueName;
@override final  String venueSlug;
@override final  String roomSlug;
@override final  String venueTimezone;
@override final  String organizerId;
@override final  String organizerName;
/// Wire token: `oneOff` or `recurring`.
@override final  String type;
/// `yyyy-MM-dd`, venue-local.
@override final  String startDate;
/// `yyyy-MM-dd`, venue-local.
@override final  String endDate;
@override final  ProposedSchedule schedule;
/// Wire token: `confirmed | completed | cancelled`.
@override final  String status;
@override final  DateTime createdAtUtc;
@override final  String? cancelledBy;
@override final  DateTime? cancelledAtUtc;
@override final  String? cancelReason;
/// The next live occurrence — set on lists too.
@override final  Occurrence? nextOccurrence;
 final  List<Occurrence> _occurrences;
@override@JsonKey() List<Occurrence> get occurrences {
  if (_occurrences is EqualUnmodifiableListView) return _occurrences;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_occurrences);
}


/// Create a copy of Booking
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$BookingCopyWith<_Booking> get copyWith => __$BookingCopyWithImpl<_Booking>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$BookingToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _Booking&&(identical(other.id, id) || other.id == id)&&(identical(other.applicationId, applicationId) || other.applicationId == applicationId)&&(identical(other.roomId, roomId) || other.roomId == roomId)&&(identical(other.roomName, roomName) || other.roomName == roomName)&&(identical(other.venueName, venueName) || other.venueName == venueName)&&(identical(other.venueSlug, venueSlug) || other.venueSlug == venueSlug)&&(identical(other.roomSlug, roomSlug) || other.roomSlug == roomSlug)&&(identical(other.venueTimezone, venueTimezone) || other.venueTimezone == venueTimezone)&&(identical(other.organizerId, organizerId) || other.organizerId == organizerId)&&(identical(other.organizerName, organizerName) || other.organizerName == organizerName)&&(identical(other.type, type) || other.type == type)&&(identical(other.startDate, startDate) || other.startDate == startDate)&&(identical(other.endDate, endDate) || other.endDate == endDate)&&(identical(other.schedule, schedule) || other.schedule == schedule)&&(identical(other.status, status) || other.status == status)&&(identical(other.createdAtUtc, createdAtUtc) || other.createdAtUtc == createdAtUtc)&&(identical(other.cancelledBy, cancelledBy) || other.cancelledBy == cancelledBy)&&(identical(other.cancelledAtUtc, cancelledAtUtc) || other.cancelledAtUtc == cancelledAtUtc)&&(identical(other.cancelReason, cancelReason) || other.cancelReason == cancelReason)&&(identical(other.nextOccurrence, nextOccurrence) || other.nextOccurrence == nextOccurrence)&&const DeepCollectionEquality().equals(other._occurrences, _occurrences));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hashAll([runtimeType,id,applicationId,roomId,roomName,venueName,venueSlug,roomSlug,venueTimezone,organizerId,organizerName,type,startDate,endDate,schedule,status,createdAtUtc,cancelledBy,cancelledAtUtc,cancelReason,nextOccurrence,const DeepCollectionEquality().hash(_occurrences)]);

@override
String toString() {
  return 'Booking(id: $id, applicationId: $applicationId, roomId: $roomId, roomName: $roomName, venueName: $venueName, venueSlug: $venueSlug, roomSlug: $roomSlug, venueTimezone: $venueTimezone, organizerId: $organizerId, organizerName: $organizerName, type: $type, startDate: $startDate, endDate: $endDate, schedule: $schedule, status: $status, createdAtUtc: $createdAtUtc, cancelledBy: $cancelledBy, cancelledAtUtc: $cancelledAtUtc, cancelReason: $cancelReason, nextOccurrence: $nextOccurrence, occurrences: $occurrences)';
}


}

/// @nodoc
abstract mixin class _$BookingCopyWith<$Res> implements $BookingCopyWith<$Res> {
  factory _$BookingCopyWith(_Booking value, $Res Function(_Booking) _then) = __$BookingCopyWithImpl;
@override @useResult
$Res call({
 String id, String applicationId, String roomId, String roomName, String venueName, String venueSlug, String roomSlug, String venueTimezone, String organizerId, String organizerName, String type, String startDate, String endDate, ProposedSchedule schedule, String status, DateTime createdAtUtc, String? cancelledBy, DateTime? cancelledAtUtc, String? cancelReason, Occurrence? nextOccurrence, List<Occurrence> occurrences
});


@override $ProposedScheduleCopyWith<$Res> get schedule;@override $OccurrenceCopyWith<$Res>? get nextOccurrence;

}
/// @nodoc
class __$BookingCopyWithImpl<$Res>
    implements _$BookingCopyWith<$Res> {
  __$BookingCopyWithImpl(this._self, this._then);

  final _Booking _self;
  final $Res Function(_Booking) _then;

/// Create a copy of Booking
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? applicationId = null,Object? roomId = null,Object? roomName = null,Object? venueName = null,Object? venueSlug = null,Object? roomSlug = null,Object? venueTimezone = null,Object? organizerId = null,Object? organizerName = null,Object? type = null,Object? startDate = null,Object? endDate = null,Object? schedule = null,Object? status = null,Object? createdAtUtc = null,Object? cancelledBy = freezed,Object? cancelledAtUtc = freezed,Object? cancelReason = freezed,Object? nextOccurrence = freezed,Object? occurrences = null,}) {
  return _then(_Booking(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,applicationId: null == applicationId ? _self.applicationId : applicationId // ignore: cast_nullable_to_non_nullable
as String,roomId: null == roomId ? _self.roomId : roomId // ignore: cast_nullable_to_non_nullable
as String,roomName: null == roomName ? _self.roomName : roomName // ignore: cast_nullable_to_non_nullable
as String,venueName: null == venueName ? _self.venueName : venueName // ignore: cast_nullable_to_non_nullable
as String,venueSlug: null == venueSlug ? _self.venueSlug : venueSlug // ignore: cast_nullable_to_non_nullable
as String,roomSlug: null == roomSlug ? _self.roomSlug : roomSlug // ignore: cast_nullable_to_non_nullable
as String,venueTimezone: null == venueTimezone ? _self.venueTimezone : venueTimezone // ignore: cast_nullable_to_non_nullable
as String,organizerId: null == organizerId ? _self.organizerId : organizerId // ignore: cast_nullable_to_non_nullable
as String,organizerName: null == organizerName ? _self.organizerName : organizerName // ignore: cast_nullable_to_non_nullable
as String,type: null == type ? _self.type : type // ignore: cast_nullable_to_non_nullable
as String,startDate: null == startDate ? _self.startDate : startDate // ignore: cast_nullable_to_non_nullable
as String,endDate: null == endDate ? _self.endDate : endDate // ignore: cast_nullable_to_non_nullable
as String,schedule: null == schedule ? _self.schedule : schedule // ignore: cast_nullable_to_non_nullable
as ProposedSchedule,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,createdAtUtc: null == createdAtUtc ? _self.createdAtUtc : createdAtUtc // ignore: cast_nullable_to_non_nullable
as DateTime,cancelledBy: freezed == cancelledBy ? _self.cancelledBy : cancelledBy // ignore: cast_nullable_to_non_nullable
as String?,cancelledAtUtc: freezed == cancelledAtUtc ? _self.cancelledAtUtc : cancelledAtUtc // ignore: cast_nullable_to_non_nullable
as DateTime?,cancelReason: freezed == cancelReason ? _self.cancelReason : cancelReason // ignore: cast_nullable_to_non_nullable
as String?,nextOccurrence: freezed == nextOccurrence ? _self.nextOccurrence : nextOccurrence // ignore: cast_nullable_to_non_nullable
as Occurrence?,occurrences: null == occurrences ? _self._occurrences : occurrences // ignore: cast_nullable_to_non_nullable
as List<Occurrence>,
  ));
}

/// Create a copy of Booking
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$ProposedScheduleCopyWith<$Res> get schedule {
  
  return $ProposedScheduleCopyWith<$Res>(_self.schedule, (value) {
    return _then(_self.copyWith(schedule: value));
  });
}/// Create a copy of Booking
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$OccurrenceCopyWith<$Res>? get nextOccurrence {
    if (_self.nextOccurrence == null) {
    return null;
  }

  return $OccurrenceCopyWith<$Res>(_self.nextOccurrence!, (value) {
    return _then(_self.copyWith(nextOccurrence: value));
  });
}
}

// dart format on
