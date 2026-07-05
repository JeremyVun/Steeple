// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'availability.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$AvailabilityDay {

/// Venue-local `yyyy-MM-dd`.
 String get date; bool get isBlackout; List<OpenWindow> get freeWindows;
/// Create a copy of AvailabilityDay
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$AvailabilityDayCopyWith<AvailabilityDay> get copyWith => _$AvailabilityDayCopyWithImpl<AvailabilityDay>(this as AvailabilityDay, _$identity);

  /// Serializes this AvailabilityDay to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is AvailabilityDay&&(identical(other.date, date) || other.date == date)&&(identical(other.isBlackout, isBlackout) || other.isBlackout == isBlackout)&&const DeepCollectionEquality().equals(other.freeWindows, freeWindows));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,date,isBlackout,const DeepCollectionEquality().hash(freeWindows));

@override
String toString() {
  return 'AvailabilityDay(date: $date, isBlackout: $isBlackout, freeWindows: $freeWindows)';
}


}

/// @nodoc
abstract mixin class $AvailabilityDayCopyWith<$Res>  {
  factory $AvailabilityDayCopyWith(AvailabilityDay value, $Res Function(AvailabilityDay) _then) = _$AvailabilityDayCopyWithImpl;
@useResult
$Res call({
 String date, bool isBlackout, List<OpenWindow> freeWindows
});




}
/// @nodoc
class _$AvailabilityDayCopyWithImpl<$Res>
    implements $AvailabilityDayCopyWith<$Res> {
  _$AvailabilityDayCopyWithImpl(this._self, this._then);

  final AvailabilityDay _self;
  final $Res Function(AvailabilityDay) _then;

/// Create a copy of AvailabilityDay
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? date = null,Object? isBlackout = null,Object? freeWindows = null,}) {
  return _then(_self.copyWith(
date: null == date ? _self.date : date // ignore: cast_nullable_to_non_nullable
as String,isBlackout: null == isBlackout ? _self.isBlackout : isBlackout // ignore: cast_nullable_to_non_nullable
as bool,freeWindows: null == freeWindows ? _self.freeWindows : freeWindows // ignore: cast_nullable_to_non_nullable
as List<OpenWindow>,
  ));
}

}


/// Adds pattern-matching-related methods to [AvailabilityDay].
extension AvailabilityDayPatterns on AvailabilityDay {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _AvailabilityDay value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _AvailabilityDay() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _AvailabilityDay value)  $default,){
final _that = this;
switch (_that) {
case _AvailabilityDay():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _AvailabilityDay value)?  $default,){
final _that = this;
switch (_that) {
case _AvailabilityDay() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String date,  bool isBlackout,  List<OpenWindow> freeWindows)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _AvailabilityDay() when $default != null:
return $default(_that.date,_that.isBlackout,_that.freeWindows);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String date,  bool isBlackout,  List<OpenWindow> freeWindows)  $default,) {final _that = this;
switch (_that) {
case _AvailabilityDay():
return $default(_that.date,_that.isBlackout,_that.freeWindows);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String date,  bool isBlackout,  List<OpenWindow> freeWindows)?  $default,) {final _that = this;
switch (_that) {
case _AvailabilityDay() when $default != null:
return $default(_that.date,_that.isBlackout,_that.freeWindows);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _AvailabilityDay implements AvailabilityDay {
  const _AvailabilityDay({required this.date, this.isBlackout = false, final  List<OpenWindow> freeWindows = const <OpenWindow>[]}): _freeWindows = freeWindows;
  factory _AvailabilityDay.fromJson(Map<String, dynamic> json) => _$AvailabilityDayFromJson(json);

/// Venue-local `yyyy-MM-dd`.
@override final  String date;
@override@JsonKey() final  bool isBlackout;
 final  List<OpenWindow> _freeWindows;
@override@JsonKey() List<OpenWindow> get freeWindows {
  if (_freeWindows is EqualUnmodifiableListView) return _freeWindows;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_freeWindows);
}


/// Create a copy of AvailabilityDay
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$AvailabilityDayCopyWith<_AvailabilityDay> get copyWith => __$AvailabilityDayCopyWithImpl<_AvailabilityDay>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$AvailabilityDayToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _AvailabilityDay&&(identical(other.date, date) || other.date == date)&&(identical(other.isBlackout, isBlackout) || other.isBlackout == isBlackout)&&const DeepCollectionEquality().equals(other._freeWindows, _freeWindows));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,date,isBlackout,const DeepCollectionEquality().hash(_freeWindows));

@override
String toString() {
  return 'AvailabilityDay(date: $date, isBlackout: $isBlackout, freeWindows: $freeWindows)';
}


}

/// @nodoc
abstract mixin class _$AvailabilityDayCopyWith<$Res> implements $AvailabilityDayCopyWith<$Res> {
  factory _$AvailabilityDayCopyWith(_AvailabilityDay value, $Res Function(_AvailabilityDay) _then) = __$AvailabilityDayCopyWithImpl;
@override @useResult
$Res call({
 String date, bool isBlackout, List<OpenWindow> freeWindows
});




}
/// @nodoc
class __$AvailabilityDayCopyWithImpl<$Res>
    implements _$AvailabilityDayCopyWith<$Res> {
  __$AvailabilityDayCopyWithImpl(this._self, this._then);

  final _AvailabilityDay _self;
  final $Res Function(_AvailabilityDay) _then;

/// Create a copy of AvailabilityDay
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? date = null,Object? isBlackout = null,Object? freeWindows = null,}) {
  return _then(_AvailabilityDay(
date: null == date ? _self.date : date // ignore: cast_nullable_to_non_nullable
as String,isBlackout: null == isBlackout ? _self.isBlackout : isBlackout // ignore: cast_nullable_to_non_nullable
as bool,freeWindows: null == freeWindows ? _self._freeWindows : freeWindows // ignore: cast_nullable_to_non_nullable
as List<OpenWindow>,
  ));
}


}


/// @nodoc
mixin _$RoomAvailability {

 String get roomId; String get timezone; String get from; String get to; List<AvailabilityDay> get days;
/// Create a copy of RoomAvailability
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$RoomAvailabilityCopyWith<RoomAvailability> get copyWith => _$RoomAvailabilityCopyWithImpl<RoomAvailability>(this as RoomAvailability, _$identity);

  /// Serializes this RoomAvailability to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is RoomAvailability&&(identical(other.roomId, roomId) || other.roomId == roomId)&&(identical(other.timezone, timezone) || other.timezone == timezone)&&(identical(other.from, from) || other.from == from)&&(identical(other.to, to) || other.to == to)&&const DeepCollectionEquality().equals(other.days, days));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,roomId,timezone,from,to,const DeepCollectionEquality().hash(days));

@override
String toString() {
  return 'RoomAvailability(roomId: $roomId, timezone: $timezone, from: $from, to: $to, days: $days)';
}


}

/// @nodoc
abstract mixin class $RoomAvailabilityCopyWith<$Res>  {
  factory $RoomAvailabilityCopyWith(RoomAvailability value, $Res Function(RoomAvailability) _then) = _$RoomAvailabilityCopyWithImpl;
@useResult
$Res call({
 String roomId, String timezone, String from, String to, List<AvailabilityDay> days
});




}
/// @nodoc
class _$RoomAvailabilityCopyWithImpl<$Res>
    implements $RoomAvailabilityCopyWith<$Res> {
  _$RoomAvailabilityCopyWithImpl(this._self, this._then);

  final RoomAvailability _self;
  final $Res Function(RoomAvailability) _then;

/// Create a copy of RoomAvailability
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? roomId = null,Object? timezone = null,Object? from = null,Object? to = null,Object? days = null,}) {
  return _then(_self.copyWith(
roomId: null == roomId ? _self.roomId : roomId // ignore: cast_nullable_to_non_nullable
as String,timezone: null == timezone ? _self.timezone : timezone // ignore: cast_nullable_to_non_nullable
as String,from: null == from ? _self.from : from // ignore: cast_nullable_to_non_nullable
as String,to: null == to ? _self.to : to // ignore: cast_nullable_to_non_nullable
as String,days: null == days ? _self.days : days // ignore: cast_nullable_to_non_nullable
as List<AvailabilityDay>,
  ));
}

}


/// Adds pattern-matching-related methods to [RoomAvailability].
extension RoomAvailabilityPatterns on RoomAvailability {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _RoomAvailability value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _RoomAvailability() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _RoomAvailability value)  $default,){
final _that = this;
switch (_that) {
case _RoomAvailability():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _RoomAvailability value)?  $default,){
final _that = this;
switch (_that) {
case _RoomAvailability() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String roomId,  String timezone,  String from,  String to,  List<AvailabilityDay> days)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _RoomAvailability() when $default != null:
return $default(_that.roomId,_that.timezone,_that.from,_that.to,_that.days);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String roomId,  String timezone,  String from,  String to,  List<AvailabilityDay> days)  $default,) {final _that = this;
switch (_that) {
case _RoomAvailability():
return $default(_that.roomId,_that.timezone,_that.from,_that.to,_that.days);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String roomId,  String timezone,  String from,  String to,  List<AvailabilityDay> days)?  $default,) {final _that = this;
switch (_that) {
case _RoomAvailability() when $default != null:
return $default(_that.roomId,_that.timezone,_that.from,_that.to,_that.days);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _RoomAvailability extends RoomAvailability {
  const _RoomAvailability({required this.roomId, required this.timezone, required this.from, required this.to, final  List<AvailabilityDay> days = const <AvailabilityDay>[]}): _days = days,super._();
  factory _RoomAvailability.fromJson(Map<String, dynamic> json) => _$RoomAvailabilityFromJson(json);

@override final  String roomId;
@override final  String timezone;
@override final  String from;
@override final  String to;
 final  List<AvailabilityDay> _days;
@override@JsonKey() List<AvailabilityDay> get days {
  if (_days is EqualUnmodifiableListView) return _days;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_days);
}


/// Create a copy of RoomAvailability
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$RoomAvailabilityCopyWith<_RoomAvailability> get copyWith => __$RoomAvailabilityCopyWithImpl<_RoomAvailability>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$RoomAvailabilityToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _RoomAvailability&&(identical(other.roomId, roomId) || other.roomId == roomId)&&(identical(other.timezone, timezone) || other.timezone == timezone)&&(identical(other.from, from) || other.from == from)&&(identical(other.to, to) || other.to == to)&&const DeepCollectionEquality().equals(other._days, _days));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,roomId,timezone,from,to,const DeepCollectionEquality().hash(_days));

@override
String toString() {
  return 'RoomAvailability(roomId: $roomId, timezone: $timezone, from: $from, to: $to, days: $days)';
}


}

/// @nodoc
abstract mixin class _$RoomAvailabilityCopyWith<$Res> implements $RoomAvailabilityCopyWith<$Res> {
  factory _$RoomAvailabilityCopyWith(_RoomAvailability value, $Res Function(_RoomAvailability) _then) = __$RoomAvailabilityCopyWithImpl;
@override @useResult
$Res call({
 String roomId, String timezone, String from, String to, List<AvailabilityDay> days
});




}
/// @nodoc
class __$RoomAvailabilityCopyWithImpl<$Res>
    implements _$RoomAvailabilityCopyWith<$Res> {
  __$RoomAvailabilityCopyWithImpl(this._self, this._then);

  final _RoomAvailability _self;
  final $Res Function(_RoomAvailability) _then;

/// Create a copy of RoomAvailability
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? roomId = null,Object? timezone = null,Object? from = null,Object? to = null,Object? days = null,}) {
  return _then(_RoomAvailability(
roomId: null == roomId ? _self.roomId : roomId // ignore: cast_nullable_to_non_nullable
as String,timezone: null == timezone ? _self.timezone : timezone // ignore: cast_nullable_to_non_nullable
as String,from: null == from ? _self.from : from // ignore: cast_nullable_to_non_nullable
as String,to: null == to ? _self.to : to // ignore: cast_nullable_to_non_nullable
as String,days: null == days ? _self._days : days // ignore: cast_nullable_to_non_nullable
as List<AvailabilityDay>,
  ));
}


}


/// @nodoc
mixin _$ScheduleConflict {

 String get date; String get reason;
/// Create a copy of ScheduleConflict
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ScheduleConflictCopyWith<ScheduleConflict> get copyWith => _$ScheduleConflictCopyWithImpl<ScheduleConflict>(this as ScheduleConflict, _$identity);

  /// Serializes this ScheduleConflict to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ScheduleConflict&&(identical(other.date, date) || other.date == date)&&(identical(other.reason, reason) || other.reason == reason));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,date,reason);

@override
String toString() {
  return 'ScheduleConflict(date: $date, reason: $reason)';
}


}

/// @nodoc
abstract mixin class $ScheduleConflictCopyWith<$Res>  {
  factory $ScheduleConflictCopyWith(ScheduleConflict value, $Res Function(ScheduleConflict) _then) = _$ScheduleConflictCopyWithImpl;
@useResult
$Res call({
 String date, String reason
});




}
/// @nodoc
class _$ScheduleConflictCopyWithImpl<$Res>
    implements $ScheduleConflictCopyWith<$Res> {
  _$ScheduleConflictCopyWithImpl(this._self, this._then);

  final ScheduleConflict _self;
  final $Res Function(ScheduleConflict) _then;

/// Create a copy of ScheduleConflict
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? date = null,Object? reason = null,}) {
  return _then(_self.copyWith(
date: null == date ? _self.date : date // ignore: cast_nullable_to_non_nullable
as String,reason: null == reason ? _self.reason : reason // ignore: cast_nullable_to_non_nullable
as String,
  ));
}

}


/// Adds pattern-matching-related methods to [ScheduleConflict].
extension ScheduleConflictPatterns on ScheduleConflict {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ScheduleConflict value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ScheduleConflict() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ScheduleConflict value)  $default,){
final _that = this;
switch (_that) {
case _ScheduleConflict():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ScheduleConflict value)?  $default,){
final _that = this;
switch (_that) {
case _ScheduleConflict() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String date,  String reason)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ScheduleConflict() when $default != null:
return $default(_that.date,_that.reason);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String date,  String reason)  $default,) {final _that = this;
switch (_that) {
case _ScheduleConflict():
return $default(_that.date,_that.reason);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String date,  String reason)?  $default,) {final _that = this;
switch (_that) {
case _ScheduleConflict() when $default != null:
return $default(_that.date,_that.reason);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ScheduleConflict implements ScheduleConflict {
  const _ScheduleConflict({required this.date, required this.reason});
  factory _ScheduleConflict.fromJson(Map<String, dynamic> json) => _$ScheduleConflictFromJson(json);

@override final  String date;
@override final  String reason;

/// Create a copy of ScheduleConflict
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ScheduleConflictCopyWith<_ScheduleConflict> get copyWith => __$ScheduleConflictCopyWithImpl<_ScheduleConflict>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ScheduleConflictToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ScheduleConflict&&(identical(other.date, date) || other.date == date)&&(identical(other.reason, reason) || other.reason == reason));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,date,reason);

@override
String toString() {
  return 'ScheduleConflict(date: $date, reason: $reason)';
}


}

/// @nodoc
abstract mixin class _$ScheduleConflictCopyWith<$Res> implements $ScheduleConflictCopyWith<$Res> {
  factory _$ScheduleConflictCopyWith(_ScheduleConflict value, $Res Function(_ScheduleConflict) _then) = __$ScheduleConflictCopyWithImpl;
@override @useResult
$Res call({
 String date, String reason
});




}
/// @nodoc
class __$ScheduleConflictCopyWithImpl<$Res>
    implements _$ScheduleConflictCopyWith<$Res> {
  __$ScheduleConflictCopyWithImpl(this._self, this._then);

  final _ScheduleConflict _self;
  final $Res Function(_ScheduleConflict) _then;

/// Create a copy of ScheduleConflict
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? date = null,Object? reason = null,}) {
  return _then(_ScheduleConflict(
date: null == date ? _self.date : date // ignore: cast_nullable_to_non_nullable
as String,reason: null == reason ? _self.reason : reason // ignore: cast_nullable_to_non_nullable
as String,
  ));
}


}


/// @nodoc
mixin _$ScheduleCheckResult {

 bool get available; int get totalOccurrences; List<ScheduleConflict> get conflicts;
/// Create a copy of ScheduleCheckResult
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ScheduleCheckResultCopyWith<ScheduleCheckResult> get copyWith => _$ScheduleCheckResultCopyWithImpl<ScheduleCheckResult>(this as ScheduleCheckResult, _$identity);

  /// Serializes this ScheduleCheckResult to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ScheduleCheckResult&&(identical(other.available, available) || other.available == available)&&(identical(other.totalOccurrences, totalOccurrences) || other.totalOccurrences == totalOccurrences)&&const DeepCollectionEquality().equals(other.conflicts, conflicts));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,available,totalOccurrences,const DeepCollectionEquality().hash(conflicts));

@override
String toString() {
  return 'ScheduleCheckResult(available: $available, totalOccurrences: $totalOccurrences, conflicts: $conflicts)';
}


}

/// @nodoc
abstract mixin class $ScheduleCheckResultCopyWith<$Res>  {
  factory $ScheduleCheckResultCopyWith(ScheduleCheckResult value, $Res Function(ScheduleCheckResult) _then) = _$ScheduleCheckResultCopyWithImpl;
@useResult
$Res call({
 bool available, int totalOccurrences, List<ScheduleConflict> conflicts
});




}
/// @nodoc
class _$ScheduleCheckResultCopyWithImpl<$Res>
    implements $ScheduleCheckResultCopyWith<$Res> {
  _$ScheduleCheckResultCopyWithImpl(this._self, this._then);

  final ScheduleCheckResult _self;
  final $Res Function(ScheduleCheckResult) _then;

/// Create a copy of ScheduleCheckResult
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? available = null,Object? totalOccurrences = null,Object? conflicts = null,}) {
  return _then(_self.copyWith(
available: null == available ? _self.available : available // ignore: cast_nullable_to_non_nullable
as bool,totalOccurrences: null == totalOccurrences ? _self.totalOccurrences : totalOccurrences // ignore: cast_nullable_to_non_nullable
as int,conflicts: null == conflicts ? _self.conflicts : conflicts // ignore: cast_nullable_to_non_nullable
as List<ScheduleConflict>,
  ));
}

}


/// Adds pattern-matching-related methods to [ScheduleCheckResult].
extension ScheduleCheckResultPatterns on ScheduleCheckResult {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ScheduleCheckResult value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ScheduleCheckResult() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ScheduleCheckResult value)  $default,){
final _that = this;
switch (_that) {
case _ScheduleCheckResult():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ScheduleCheckResult value)?  $default,){
final _that = this;
switch (_that) {
case _ScheduleCheckResult() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( bool available,  int totalOccurrences,  List<ScheduleConflict> conflicts)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ScheduleCheckResult() when $default != null:
return $default(_that.available,_that.totalOccurrences,_that.conflicts);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( bool available,  int totalOccurrences,  List<ScheduleConflict> conflicts)  $default,) {final _that = this;
switch (_that) {
case _ScheduleCheckResult():
return $default(_that.available,_that.totalOccurrences,_that.conflicts);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( bool available,  int totalOccurrences,  List<ScheduleConflict> conflicts)?  $default,) {final _that = this;
switch (_that) {
case _ScheduleCheckResult() when $default != null:
return $default(_that.available,_that.totalOccurrences,_that.conflicts);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ScheduleCheckResult implements ScheduleCheckResult {
  const _ScheduleCheckResult({required this.available, required this.totalOccurrences, final  List<ScheduleConflict> conflicts = const <ScheduleConflict>[]}): _conflicts = conflicts;
  factory _ScheduleCheckResult.fromJson(Map<String, dynamic> json) => _$ScheduleCheckResultFromJson(json);

@override final  bool available;
@override final  int totalOccurrences;
 final  List<ScheduleConflict> _conflicts;
@override@JsonKey() List<ScheduleConflict> get conflicts {
  if (_conflicts is EqualUnmodifiableListView) return _conflicts;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_conflicts);
}


/// Create a copy of ScheduleCheckResult
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ScheduleCheckResultCopyWith<_ScheduleCheckResult> get copyWith => __$ScheduleCheckResultCopyWithImpl<_ScheduleCheckResult>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ScheduleCheckResultToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ScheduleCheckResult&&(identical(other.available, available) || other.available == available)&&(identical(other.totalOccurrences, totalOccurrences) || other.totalOccurrences == totalOccurrences)&&const DeepCollectionEquality().equals(other._conflicts, _conflicts));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,available,totalOccurrences,const DeepCollectionEquality().hash(_conflicts));

@override
String toString() {
  return 'ScheduleCheckResult(available: $available, totalOccurrences: $totalOccurrences, conflicts: $conflicts)';
}


}

/// @nodoc
abstract mixin class _$ScheduleCheckResultCopyWith<$Res> implements $ScheduleCheckResultCopyWith<$Res> {
  factory _$ScheduleCheckResultCopyWith(_ScheduleCheckResult value, $Res Function(_ScheduleCheckResult) _then) = __$ScheduleCheckResultCopyWithImpl;
@override @useResult
$Res call({
 bool available, int totalOccurrences, List<ScheduleConflict> conflicts
});




}
/// @nodoc
class __$ScheduleCheckResultCopyWithImpl<$Res>
    implements _$ScheduleCheckResultCopyWith<$Res> {
  __$ScheduleCheckResultCopyWithImpl(this._self, this._then);

  final _ScheduleCheckResult _self;
  final $Res Function(_ScheduleCheckResult) _then;

/// Create a copy of ScheduleCheckResult
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? available = null,Object? totalOccurrences = null,Object? conflicts = null,}) {
  return _then(_ScheduleCheckResult(
available: null == available ? _self.available : available // ignore: cast_nullable_to_non_nullable
as bool,totalOccurrences: null == totalOccurrences ? _self.totalOccurrences : totalOccurrences // ignore: cast_nullable_to_non_nullable
as int,conflicts: null == conflicts ? _self._conflicts : conflicts // ignore: cast_nullable_to_non_nullable
as List<ScheduleConflict>,
  ));
}


}

// dart format on
