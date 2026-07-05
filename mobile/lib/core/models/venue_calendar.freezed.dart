// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'venue_calendar.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$CalendarRoomRef {

 String get id; String get name;
/// Create a copy of CalendarRoomRef
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$CalendarRoomRefCopyWith<CalendarRoomRef> get copyWith => _$CalendarRoomRefCopyWithImpl<CalendarRoomRef>(this as CalendarRoomRef, _$identity);

  /// Serializes this CalendarRoomRef to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is CalendarRoomRef&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,name);

@override
String toString() {
  return 'CalendarRoomRef(id: $id, name: $name)';
}


}

/// @nodoc
abstract mixin class $CalendarRoomRefCopyWith<$Res>  {
  factory $CalendarRoomRefCopyWith(CalendarRoomRef value, $Res Function(CalendarRoomRef) _then) = _$CalendarRoomRefCopyWithImpl;
@useResult
$Res call({
 String id, String name
});




}
/// @nodoc
class _$CalendarRoomRefCopyWithImpl<$Res>
    implements $CalendarRoomRefCopyWith<$Res> {
  _$CalendarRoomRefCopyWithImpl(this._self, this._then);

  final CalendarRoomRef _self;
  final $Res Function(CalendarRoomRef) _then;

/// Create a copy of CalendarRoomRef
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? name = null,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,
  ));
}

}


/// Adds pattern-matching-related methods to [CalendarRoomRef].
extension CalendarRoomRefPatterns on CalendarRoomRef {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _CalendarRoomRef value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _CalendarRoomRef() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _CalendarRoomRef value)  $default,){
final _that = this;
switch (_that) {
case _CalendarRoomRef():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _CalendarRoomRef value)?  $default,){
final _that = this;
switch (_that) {
case _CalendarRoomRef() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String name)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _CalendarRoomRef() when $default != null:
return $default(_that.id,_that.name);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String name)  $default,) {final _that = this;
switch (_that) {
case _CalendarRoomRef():
return $default(_that.id,_that.name);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String name)?  $default,) {final _that = this;
switch (_that) {
case _CalendarRoomRef() when $default != null:
return $default(_that.id,_that.name);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _CalendarRoomRef implements CalendarRoomRef {
  const _CalendarRoomRef({required this.id, required this.name});
  factory _CalendarRoomRef.fromJson(Map<String, dynamic> json) => _$CalendarRoomRefFromJson(json);

@override final  String id;
@override final  String name;

/// Create a copy of CalendarRoomRef
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$CalendarRoomRefCopyWith<_CalendarRoomRef> get copyWith => __$CalendarRoomRefCopyWithImpl<_CalendarRoomRef>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$CalendarRoomRefToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _CalendarRoomRef&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,name);

@override
String toString() {
  return 'CalendarRoomRef(id: $id, name: $name)';
}


}

/// @nodoc
abstract mixin class _$CalendarRoomRefCopyWith<$Res> implements $CalendarRoomRefCopyWith<$Res> {
  factory _$CalendarRoomRefCopyWith(_CalendarRoomRef value, $Res Function(_CalendarRoomRef) _then) = __$CalendarRoomRefCopyWithImpl;
@override @useResult
$Res call({
 String id, String name
});




}
/// @nodoc
class __$CalendarRoomRefCopyWithImpl<$Res>
    implements _$CalendarRoomRefCopyWith<$Res> {
  __$CalendarRoomRefCopyWithImpl(this._self, this._then);

  final _CalendarRoomRef _self;
  final $Res Function(_CalendarRoomRef) _then;

/// Create a copy of CalendarRoomRef
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? name = null,}) {
  return _then(_CalendarRoomRef(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,
  ));
}


}


/// @nodoc
mixin _$CalendarOccurrence {

 String get bookingId; String get roomId; String get organizerName;/// Venue-local `yyyy-MM-dd`.
 String get localDate;/// Venue-local `HH:mm` (24h).
 String get startTime; String get endTime; String get status;
/// Create a copy of CalendarOccurrence
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$CalendarOccurrenceCopyWith<CalendarOccurrence> get copyWith => _$CalendarOccurrenceCopyWithImpl<CalendarOccurrence>(this as CalendarOccurrence, _$identity);

  /// Serializes this CalendarOccurrence to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is CalendarOccurrence&&(identical(other.bookingId, bookingId) || other.bookingId == bookingId)&&(identical(other.roomId, roomId) || other.roomId == roomId)&&(identical(other.organizerName, organizerName) || other.organizerName == organizerName)&&(identical(other.localDate, localDate) || other.localDate == localDate)&&(identical(other.startTime, startTime) || other.startTime == startTime)&&(identical(other.endTime, endTime) || other.endTime == endTime)&&(identical(other.status, status) || other.status == status));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,bookingId,roomId,organizerName,localDate,startTime,endTime,status);

@override
String toString() {
  return 'CalendarOccurrence(bookingId: $bookingId, roomId: $roomId, organizerName: $organizerName, localDate: $localDate, startTime: $startTime, endTime: $endTime, status: $status)';
}


}

/// @nodoc
abstract mixin class $CalendarOccurrenceCopyWith<$Res>  {
  factory $CalendarOccurrenceCopyWith(CalendarOccurrence value, $Res Function(CalendarOccurrence) _then) = _$CalendarOccurrenceCopyWithImpl;
@useResult
$Res call({
 String bookingId, String roomId, String organizerName, String localDate, String startTime, String endTime, String status
});




}
/// @nodoc
class _$CalendarOccurrenceCopyWithImpl<$Res>
    implements $CalendarOccurrenceCopyWith<$Res> {
  _$CalendarOccurrenceCopyWithImpl(this._self, this._then);

  final CalendarOccurrence _self;
  final $Res Function(CalendarOccurrence) _then;

/// Create a copy of CalendarOccurrence
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? bookingId = null,Object? roomId = null,Object? organizerName = null,Object? localDate = null,Object? startTime = null,Object? endTime = null,Object? status = null,}) {
  return _then(_self.copyWith(
bookingId: null == bookingId ? _self.bookingId : bookingId // ignore: cast_nullable_to_non_nullable
as String,roomId: null == roomId ? _self.roomId : roomId // ignore: cast_nullable_to_non_nullable
as String,organizerName: null == organizerName ? _self.organizerName : organizerName // ignore: cast_nullable_to_non_nullable
as String,localDate: null == localDate ? _self.localDate : localDate // ignore: cast_nullable_to_non_nullable
as String,startTime: null == startTime ? _self.startTime : startTime // ignore: cast_nullable_to_non_nullable
as String,endTime: null == endTime ? _self.endTime : endTime // ignore: cast_nullable_to_non_nullable
as String,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,
  ));
}

}


/// Adds pattern-matching-related methods to [CalendarOccurrence].
extension CalendarOccurrencePatterns on CalendarOccurrence {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _CalendarOccurrence value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _CalendarOccurrence() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _CalendarOccurrence value)  $default,){
final _that = this;
switch (_that) {
case _CalendarOccurrence():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _CalendarOccurrence value)?  $default,){
final _that = this;
switch (_that) {
case _CalendarOccurrence() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String bookingId,  String roomId,  String organizerName,  String localDate,  String startTime,  String endTime,  String status)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _CalendarOccurrence() when $default != null:
return $default(_that.bookingId,_that.roomId,_that.organizerName,_that.localDate,_that.startTime,_that.endTime,_that.status);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String bookingId,  String roomId,  String organizerName,  String localDate,  String startTime,  String endTime,  String status)  $default,) {final _that = this;
switch (_that) {
case _CalendarOccurrence():
return $default(_that.bookingId,_that.roomId,_that.organizerName,_that.localDate,_that.startTime,_that.endTime,_that.status);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String bookingId,  String roomId,  String organizerName,  String localDate,  String startTime,  String endTime,  String status)?  $default,) {final _that = this;
switch (_that) {
case _CalendarOccurrence() when $default != null:
return $default(_that.bookingId,_that.roomId,_that.organizerName,_that.localDate,_that.startTime,_that.endTime,_that.status);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _CalendarOccurrence implements CalendarOccurrence {
  const _CalendarOccurrence({required this.bookingId, required this.roomId, required this.organizerName, required this.localDate, required this.startTime, required this.endTime, required this.status});
  factory _CalendarOccurrence.fromJson(Map<String, dynamic> json) => _$CalendarOccurrenceFromJson(json);

@override final  String bookingId;
@override final  String roomId;
@override final  String organizerName;
/// Venue-local `yyyy-MM-dd`.
@override final  String localDate;
/// Venue-local `HH:mm` (24h).
@override final  String startTime;
@override final  String endTime;
@override final  String status;

/// Create a copy of CalendarOccurrence
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$CalendarOccurrenceCopyWith<_CalendarOccurrence> get copyWith => __$CalendarOccurrenceCopyWithImpl<_CalendarOccurrence>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$CalendarOccurrenceToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _CalendarOccurrence&&(identical(other.bookingId, bookingId) || other.bookingId == bookingId)&&(identical(other.roomId, roomId) || other.roomId == roomId)&&(identical(other.organizerName, organizerName) || other.organizerName == organizerName)&&(identical(other.localDate, localDate) || other.localDate == localDate)&&(identical(other.startTime, startTime) || other.startTime == startTime)&&(identical(other.endTime, endTime) || other.endTime == endTime)&&(identical(other.status, status) || other.status == status));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,bookingId,roomId,organizerName,localDate,startTime,endTime,status);

@override
String toString() {
  return 'CalendarOccurrence(bookingId: $bookingId, roomId: $roomId, organizerName: $organizerName, localDate: $localDate, startTime: $startTime, endTime: $endTime, status: $status)';
}


}

/// @nodoc
abstract mixin class _$CalendarOccurrenceCopyWith<$Res> implements $CalendarOccurrenceCopyWith<$Res> {
  factory _$CalendarOccurrenceCopyWith(_CalendarOccurrence value, $Res Function(_CalendarOccurrence) _then) = __$CalendarOccurrenceCopyWithImpl;
@override @useResult
$Res call({
 String bookingId, String roomId, String organizerName, String localDate, String startTime, String endTime, String status
});




}
/// @nodoc
class __$CalendarOccurrenceCopyWithImpl<$Res>
    implements _$CalendarOccurrenceCopyWith<$Res> {
  __$CalendarOccurrenceCopyWithImpl(this._self, this._then);

  final _CalendarOccurrence _self;
  final $Res Function(_CalendarOccurrence) _then;

/// Create a copy of CalendarOccurrence
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? bookingId = null,Object? roomId = null,Object? organizerName = null,Object? localDate = null,Object? startTime = null,Object? endTime = null,Object? status = null,}) {
  return _then(_CalendarOccurrence(
bookingId: null == bookingId ? _self.bookingId : bookingId // ignore: cast_nullable_to_non_nullable
as String,roomId: null == roomId ? _self.roomId : roomId // ignore: cast_nullable_to_non_nullable
as String,organizerName: null == organizerName ? _self.organizerName : organizerName // ignore: cast_nullable_to_non_nullable
as String,localDate: null == localDate ? _self.localDate : localDate // ignore: cast_nullable_to_non_nullable
as String,startTime: null == startTime ? _self.startTime : startTime // ignore: cast_nullable_to_non_nullable
as String,endTime: null == endTime ? _self.endTime : endTime // ignore: cast_nullable_to_non_nullable
as String,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,
  ));
}


}


/// @nodoc
mixin _$CalendarPending {

 String get applicationId; String get roomId; String get organizerName;/// Venue-local `HH:mm` (24h).
 String get startTime; String get endTime;/// Venue-local `yyyy-MM-dd` occurrence dates.
 List<String> get dates;
/// Create a copy of CalendarPending
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$CalendarPendingCopyWith<CalendarPending> get copyWith => _$CalendarPendingCopyWithImpl<CalendarPending>(this as CalendarPending, _$identity);

  /// Serializes this CalendarPending to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is CalendarPending&&(identical(other.applicationId, applicationId) || other.applicationId == applicationId)&&(identical(other.roomId, roomId) || other.roomId == roomId)&&(identical(other.organizerName, organizerName) || other.organizerName == organizerName)&&(identical(other.startTime, startTime) || other.startTime == startTime)&&(identical(other.endTime, endTime) || other.endTime == endTime)&&const DeepCollectionEquality().equals(other.dates, dates));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,applicationId,roomId,organizerName,startTime,endTime,const DeepCollectionEquality().hash(dates));

@override
String toString() {
  return 'CalendarPending(applicationId: $applicationId, roomId: $roomId, organizerName: $organizerName, startTime: $startTime, endTime: $endTime, dates: $dates)';
}


}

/// @nodoc
abstract mixin class $CalendarPendingCopyWith<$Res>  {
  factory $CalendarPendingCopyWith(CalendarPending value, $Res Function(CalendarPending) _then) = _$CalendarPendingCopyWithImpl;
@useResult
$Res call({
 String applicationId, String roomId, String organizerName, String startTime, String endTime, List<String> dates
});




}
/// @nodoc
class _$CalendarPendingCopyWithImpl<$Res>
    implements $CalendarPendingCopyWith<$Res> {
  _$CalendarPendingCopyWithImpl(this._self, this._then);

  final CalendarPending _self;
  final $Res Function(CalendarPending) _then;

/// Create a copy of CalendarPending
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? applicationId = null,Object? roomId = null,Object? organizerName = null,Object? startTime = null,Object? endTime = null,Object? dates = null,}) {
  return _then(_self.copyWith(
applicationId: null == applicationId ? _self.applicationId : applicationId // ignore: cast_nullable_to_non_nullable
as String,roomId: null == roomId ? _self.roomId : roomId // ignore: cast_nullable_to_non_nullable
as String,organizerName: null == organizerName ? _self.organizerName : organizerName // ignore: cast_nullable_to_non_nullable
as String,startTime: null == startTime ? _self.startTime : startTime // ignore: cast_nullable_to_non_nullable
as String,endTime: null == endTime ? _self.endTime : endTime // ignore: cast_nullable_to_non_nullable
as String,dates: null == dates ? _self.dates : dates // ignore: cast_nullable_to_non_nullable
as List<String>,
  ));
}

}


/// Adds pattern-matching-related methods to [CalendarPending].
extension CalendarPendingPatterns on CalendarPending {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _CalendarPending value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _CalendarPending() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _CalendarPending value)  $default,){
final _that = this;
switch (_that) {
case _CalendarPending():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _CalendarPending value)?  $default,){
final _that = this;
switch (_that) {
case _CalendarPending() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String applicationId,  String roomId,  String organizerName,  String startTime,  String endTime,  List<String> dates)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _CalendarPending() when $default != null:
return $default(_that.applicationId,_that.roomId,_that.organizerName,_that.startTime,_that.endTime,_that.dates);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String applicationId,  String roomId,  String organizerName,  String startTime,  String endTime,  List<String> dates)  $default,) {final _that = this;
switch (_that) {
case _CalendarPending():
return $default(_that.applicationId,_that.roomId,_that.organizerName,_that.startTime,_that.endTime,_that.dates);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String applicationId,  String roomId,  String organizerName,  String startTime,  String endTime,  List<String> dates)?  $default,) {final _that = this;
switch (_that) {
case _CalendarPending() when $default != null:
return $default(_that.applicationId,_that.roomId,_that.organizerName,_that.startTime,_that.endTime,_that.dates);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _CalendarPending implements CalendarPending {
  const _CalendarPending({required this.applicationId, required this.roomId, required this.organizerName, required this.startTime, required this.endTime, final  List<String> dates = const <String>[]}): _dates = dates;
  factory _CalendarPending.fromJson(Map<String, dynamic> json) => _$CalendarPendingFromJson(json);

@override final  String applicationId;
@override final  String roomId;
@override final  String organizerName;
/// Venue-local `HH:mm` (24h).
@override final  String startTime;
@override final  String endTime;
/// Venue-local `yyyy-MM-dd` occurrence dates.
 final  List<String> _dates;
/// Venue-local `yyyy-MM-dd` occurrence dates.
@override@JsonKey() List<String> get dates {
  if (_dates is EqualUnmodifiableListView) return _dates;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_dates);
}


/// Create a copy of CalendarPending
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$CalendarPendingCopyWith<_CalendarPending> get copyWith => __$CalendarPendingCopyWithImpl<_CalendarPending>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$CalendarPendingToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _CalendarPending&&(identical(other.applicationId, applicationId) || other.applicationId == applicationId)&&(identical(other.roomId, roomId) || other.roomId == roomId)&&(identical(other.organizerName, organizerName) || other.organizerName == organizerName)&&(identical(other.startTime, startTime) || other.startTime == startTime)&&(identical(other.endTime, endTime) || other.endTime == endTime)&&const DeepCollectionEquality().equals(other._dates, _dates));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,applicationId,roomId,organizerName,startTime,endTime,const DeepCollectionEquality().hash(_dates));

@override
String toString() {
  return 'CalendarPending(applicationId: $applicationId, roomId: $roomId, organizerName: $organizerName, startTime: $startTime, endTime: $endTime, dates: $dates)';
}


}

/// @nodoc
abstract mixin class _$CalendarPendingCopyWith<$Res> implements $CalendarPendingCopyWith<$Res> {
  factory _$CalendarPendingCopyWith(_CalendarPending value, $Res Function(_CalendarPending) _then) = __$CalendarPendingCopyWithImpl;
@override @useResult
$Res call({
 String applicationId, String roomId, String organizerName, String startTime, String endTime, List<String> dates
});




}
/// @nodoc
class __$CalendarPendingCopyWithImpl<$Res>
    implements _$CalendarPendingCopyWith<$Res> {
  __$CalendarPendingCopyWithImpl(this._self, this._then);

  final _CalendarPending _self;
  final $Res Function(_CalendarPending) _then;

/// Create a copy of CalendarPending
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? applicationId = null,Object? roomId = null,Object? organizerName = null,Object? startTime = null,Object? endTime = null,Object? dates = null,}) {
  return _then(_CalendarPending(
applicationId: null == applicationId ? _self.applicationId : applicationId // ignore: cast_nullable_to_non_nullable
as String,roomId: null == roomId ? _self.roomId : roomId // ignore: cast_nullable_to_non_nullable
as String,organizerName: null == organizerName ? _self.organizerName : organizerName // ignore: cast_nullable_to_non_nullable
as String,startTime: null == startTime ? _self.startTime : startTime // ignore: cast_nullable_to_non_nullable
as String,endTime: null == endTime ? _self.endTime : endTime // ignore: cast_nullable_to_non_nullable
as String,dates: null == dates ? _self._dates : dates // ignore: cast_nullable_to_non_nullable
as List<String>,
  ));
}


}


/// @nodoc
mixin _$VenueCalendar {

 String get venueId; String get timezone; String get from; String get to; List<CalendarRoomRef> get rooms; List<CalendarOccurrence> get occurrences; List<CalendarPending> get pending;
/// Create a copy of VenueCalendar
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$VenueCalendarCopyWith<VenueCalendar> get copyWith => _$VenueCalendarCopyWithImpl<VenueCalendar>(this as VenueCalendar, _$identity);

  /// Serializes this VenueCalendar to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is VenueCalendar&&(identical(other.venueId, venueId) || other.venueId == venueId)&&(identical(other.timezone, timezone) || other.timezone == timezone)&&(identical(other.from, from) || other.from == from)&&(identical(other.to, to) || other.to == to)&&const DeepCollectionEquality().equals(other.rooms, rooms)&&const DeepCollectionEquality().equals(other.occurrences, occurrences)&&const DeepCollectionEquality().equals(other.pending, pending));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,venueId,timezone,from,to,const DeepCollectionEquality().hash(rooms),const DeepCollectionEquality().hash(occurrences),const DeepCollectionEquality().hash(pending));

@override
String toString() {
  return 'VenueCalendar(venueId: $venueId, timezone: $timezone, from: $from, to: $to, rooms: $rooms, occurrences: $occurrences, pending: $pending)';
}


}

/// @nodoc
abstract mixin class $VenueCalendarCopyWith<$Res>  {
  factory $VenueCalendarCopyWith(VenueCalendar value, $Res Function(VenueCalendar) _then) = _$VenueCalendarCopyWithImpl;
@useResult
$Res call({
 String venueId, String timezone, String from, String to, List<CalendarRoomRef> rooms, List<CalendarOccurrence> occurrences, List<CalendarPending> pending
});




}
/// @nodoc
class _$VenueCalendarCopyWithImpl<$Res>
    implements $VenueCalendarCopyWith<$Res> {
  _$VenueCalendarCopyWithImpl(this._self, this._then);

  final VenueCalendar _self;
  final $Res Function(VenueCalendar) _then;

/// Create a copy of VenueCalendar
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? venueId = null,Object? timezone = null,Object? from = null,Object? to = null,Object? rooms = null,Object? occurrences = null,Object? pending = null,}) {
  return _then(_self.copyWith(
venueId: null == venueId ? _self.venueId : venueId // ignore: cast_nullable_to_non_nullable
as String,timezone: null == timezone ? _self.timezone : timezone // ignore: cast_nullable_to_non_nullable
as String,from: null == from ? _self.from : from // ignore: cast_nullable_to_non_nullable
as String,to: null == to ? _self.to : to // ignore: cast_nullable_to_non_nullable
as String,rooms: null == rooms ? _self.rooms : rooms // ignore: cast_nullable_to_non_nullable
as List<CalendarRoomRef>,occurrences: null == occurrences ? _self.occurrences : occurrences // ignore: cast_nullable_to_non_nullable
as List<CalendarOccurrence>,pending: null == pending ? _self.pending : pending // ignore: cast_nullable_to_non_nullable
as List<CalendarPending>,
  ));
}

}


/// Adds pattern-matching-related methods to [VenueCalendar].
extension VenueCalendarPatterns on VenueCalendar {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _VenueCalendar value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _VenueCalendar() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _VenueCalendar value)  $default,){
final _that = this;
switch (_that) {
case _VenueCalendar():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _VenueCalendar value)?  $default,){
final _that = this;
switch (_that) {
case _VenueCalendar() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String venueId,  String timezone,  String from,  String to,  List<CalendarRoomRef> rooms,  List<CalendarOccurrence> occurrences,  List<CalendarPending> pending)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _VenueCalendar() when $default != null:
return $default(_that.venueId,_that.timezone,_that.from,_that.to,_that.rooms,_that.occurrences,_that.pending);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String venueId,  String timezone,  String from,  String to,  List<CalendarRoomRef> rooms,  List<CalendarOccurrence> occurrences,  List<CalendarPending> pending)  $default,) {final _that = this;
switch (_that) {
case _VenueCalendar():
return $default(_that.venueId,_that.timezone,_that.from,_that.to,_that.rooms,_that.occurrences,_that.pending);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String venueId,  String timezone,  String from,  String to,  List<CalendarRoomRef> rooms,  List<CalendarOccurrence> occurrences,  List<CalendarPending> pending)?  $default,) {final _that = this;
switch (_that) {
case _VenueCalendar() when $default != null:
return $default(_that.venueId,_that.timezone,_that.from,_that.to,_that.rooms,_that.occurrences,_that.pending);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _VenueCalendar implements VenueCalendar {
  const _VenueCalendar({required this.venueId, required this.timezone, required this.from, required this.to, final  List<CalendarRoomRef> rooms = const <CalendarRoomRef>[], final  List<CalendarOccurrence> occurrences = const <CalendarOccurrence>[], final  List<CalendarPending> pending = const <CalendarPending>[]}): _rooms = rooms,_occurrences = occurrences,_pending = pending;
  factory _VenueCalendar.fromJson(Map<String, dynamic> json) => _$VenueCalendarFromJson(json);

@override final  String venueId;
@override final  String timezone;
@override final  String from;
@override final  String to;
 final  List<CalendarRoomRef> _rooms;
@override@JsonKey() List<CalendarRoomRef> get rooms {
  if (_rooms is EqualUnmodifiableListView) return _rooms;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_rooms);
}

 final  List<CalendarOccurrence> _occurrences;
@override@JsonKey() List<CalendarOccurrence> get occurrences {
  if (_occurrences is EqualUnmodifiableListView) return _occurrences;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_occurrences);
}

 final  List<CalendarPending> _pending;
@override@JsonKey() List<CalendarPending> get pending {
  if (_pending is EqualUnmodifiableListView) return _pending;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_pending);
}


/// Create a copy of VenueCalendar
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$VenueCalendarCopyWith<_VenueCalendar> get copyWith => __$VenueCalendarCopyWithImpl<_VenueCalendar>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$VenueCalendarToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _VenueCalendar&&(identical(other.venueId, venueId) || other.venueId == venueId)&&(identical(other.timezone, timezone) || other.timezone == timezone)&&(identical(other.from, from) || other.from == from)&&(identical(other.to, to) || other.to == to)&&const DeepCollectionEquality().equals(other._rooms, _rooms)&&const DeepCollectionEquality().equals(other._occurrences, _occurrences)&&const DeepCollectionEquality().equals(other._pending, _pending));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,venueId,timezone,from,to,const DeepCollectionEquality().hash(_rooms),const DeepCollectionEquality().hash(_occurrences),const DeepCollectionEquality().hash(_pending));

@override
String toString() {
  return 'VenueCalendar(venueId: $venueId, timezone: $timezone, from: $from, to: $to, rooms: $rooms, occurrences: $occurrences, pending: $pending)';
}


}

/// @nodoc
abstract mixin class _$VenueCalendarCopyWith<$Res> implements $VenueCalendarCopyWith<$Res> {
  factory _$VenueCalendarCopyWith(_VenueCalendar value, $Res Function(_VenueCalendar) _then) = __$VenueCalendarCopyWithImpl;
@override @useResult
$Res call({
 String venueId, String timezone, String from, String to, List<CalendarRoomRef> rooms, List<CalendarOccurrence> occurrences, List<CalendarPending> pending
});




}
/// @nodoc
class __$VenueCalendarCopyWithImpl<$Res>
    implements _$VenueCalendarCopyWith<$Res> {
  __$VenueCalendarCopyWithImpl(this._self, this._then);

  final _VenueCalendar _self;
  final $Res Function(_VenueCalendar) _then;

/// Create a copy of VenueCalendar
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? venueId = null,Object? timezone = null,Object? from = null,Object? to = null,Object? rooms = null,Object? occurrences = null,Object? pending = null,}) {
  return _then(_VenueCalendar(
venueId: null == venueId ? _self.venueId : venueId // ignore: cast_nullable_to_non_nullable
as String,timezone: null == timezone ? _self.timezone : timezone // ignore: cast_nullable_to_non_nullable
as String,from: null == from ? _self.from : from // ignore: cast_nullable_to_non_nullable
as String,to: null == to ? _self.to : to // ignore: cast_nullable_to_non_nullable
as String,rooms: null == rooms ? _self._rooms : rooms // ignore: cast_nullable_to_non_nullable
as List<CalendarRoomRef>,occurrences: null == occurrences ? _self._occurrences : occurrences // ignore: cast_nullable_to_non_nullable
as List<CalendarOccurrence>,pending: null == pending ? _self._pending : pending // ignore: cast_nullable_to_non_nullable
as List<CalendarPending>,
  ));
}


}

// dart format on
