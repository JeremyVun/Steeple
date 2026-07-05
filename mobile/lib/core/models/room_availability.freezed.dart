// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'room_availability.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$OpenWindow {

 String get startTime; String get endTime;
/// Create a copy of OpenWindow
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$OpenWindowCopyWith<OpenWindow> get copyWith => _$OpenWindowCopyWithImpl<OpenWindow>(this as OpenWindow, _$identity);

  /// Serializes this OpenWindow to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is OpenWindow&&(identical(other.startTime, startTime) || other.startTime == startTime)&&(identical(other.endTime, endTime) || other.endTime == endTime));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,startTime,endTime);

@override
String toString() {
  return 'OpenWindow(startTime: $startTime, endTime: $endTime)';
}


}

/// @nodoc
abstract mixin class $OpenWindowCopyWith<$Res>  {
  factory $OpenWindowCopyWith(OpenWindow value, $Res Function(OpenWindow) _then) = _$OpenWindowCopyWithImpl;
@useResult
$Res call({
 String startTime, String endTime
});




}
/// @nodoc
class _$OpenWindowCopyWithImpl<$Res>
    implements $OpenWindowCopyWith<$Res> {
  _$OpenWindowCopyWithImpl(this._self, this._then);

  final OpenWindow _self;
  final $Res Function(OpenWindow) _then;

/// Create a copy of OpenWindow
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? startTime = null,Object? endTime = null,}) {
  return _then(_self.copyWith(
startTime: null == startTime ? _self.startTime : startTime // ignore: cast_nullable_to_non_nullable
as String,endTime: null == endTime ? _self.endTime : endTime // ignore: cast_nullable_to_non_nullable
as String,
  ));
}

}


/// Adds pattern-matching-related methods to [OpenWindow].
extension OpenWindowPatterns on OpenWindow {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _OpenWindow value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _OpenWindow() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _OpenWindow value)  $default,){
final _that = this;
switch (_that) {
case _OpenWindow():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _OpenWindow value)?  $default,){
final _that = this;
switch (_that) {
case _OpenWindow() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String startTime,  String endTime)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _OpenWindow() when $default != null:
return $default(_that.startTime,_that.endTime);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String startTime,  String endTime)  $default,) {final _that = this;
switch (_that) {
case _OpenWindow():
return $default(_that.startTime,_that.endTime);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String startTime,  String endTime)?  $default,) {final _that = this;
switch (_that) {
case _OpenWindow() when $default != null:
return $default(_that.startTime,_that.endTime);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _OpenWindow implements OpenWindow {
  const _OpenWindow({required this.startTime, required this.endTime});
  factory _OpenWindow.fromJson(Map<String, dynamic> json) => _$OpenWindowFromJson(json);

@override final  String startTime;
@override final  String endTime;

/// Create a copy of OpenWindow
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$OpenWindowCopyWith<_OpenWindow> get copyWith => __$OpenWindowCopyWithImpl<_OpenWindow>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$OpenWindowToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _OpenWindow&&(identical(other.startTime, startTime) || other.startTime == startTime)&&(identical(other.endTime, endTime) || other.endTime == endTime));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,startTime,endTime);

@override
String toString() {
  return 'OpenWindow(startTime: $startTime, endTime: $endTime)';
}


}

/// @nodoc
abstract mixin class _$OpenWindowCopyWith<$Res> implements $OpenWindowCopyWith<$Res> {
  factory _$OpenWindowCopyWith(_OpenWindow value, $Res Function(_OpenWindow) _then) = __$OpenWindowCopyWithImpl;
@override @useResult
$Res call({
 String startTime, String endTime
});




}
/// @nodoc
class __$OpenWindowCopyWithImpl<$Res>
    implements _$OpenWindowCopyWith<$Res> {
  __$OpenWindowCopyWithImpl(this._self, this._then);

  final _OpenWindow _self;
  final $Res Function(_OpenWindow) _then;

/// Create a copy of OpenWindow
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? startTime = null,Object? endTime = null,}) {
  return _then(_OpenWindow(
startTime: null == startTime ? _self.startTime : startTime // ignore: cast_nullable_to_non_nullable
as String,endTime: null == endTime ? _self.endTime : endTime // ignore: cast_nullable_to_non_nullable
as String,
  ));
}


}


/// @nodoc
mixin _$DayOpenHours {

 String get dayOfWeek; List<OpenWindow> get windows;
/// Create a copy of DayOpenHours
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$DayOpenHoursCopyWith<DayOpenHours> get copyWith => _$DayOpenHoursCopyWithImpl<DayOpenHours>(this as DayOpenHours, _$identity);

  /// Serializes this DayOpenHours to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is DayOpenHours&&(identical(other.dayOfWeek, dayOfWeek) || other.dayOfWeek == dayOfWeek)&&const DeepCollectionEquality().equals(other.windows, windows));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,dayOfWeek,const DeepCollectionEquality().hash(windows));

@override
String toString() {
  return 'DayOpenHours(dayOfWeek: $dayOfWeek, windows: $windows)';
}


}

/// @nodoc
abstract mixin class $DayOpenHoursCopyWith<$Res>  {
  factory $DayOpenHoursCopyWith(DayOpenHours value, $Res Function(DayOpenHours) _then) = _$DayOpenHoursCopyWithImpl;
@useResult
$Res call({
 String dayOfWeek, List<OpenWindow> windows
});




}
/// @nodoc
class _$DayOpenHoursCopyWithImpl<$Res>
    implements $DayOpenHoursCopyWith<$Res> {
  _$DayOpenHoursCopyWithImpl(this._self, this._then);

  final DayOpenHours _self;
  final $Res Function(DayOpenHours) _then;

/// Create a copy of DayOpenHours
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? dayOfWeek = null,Object? windows = null,}) {
  return _then(_self.copyWith(
dayOfWeek: null == dayOfWeek ? _self.dayOfWeek : dayOfWeek // ignore: cast_nullable_to_non_nullable
as String,windows: null == windows ? _self.windows : windows // ignore: cast_nullable_to_non_nullable
as List<OpenWindow>,
  ));
}

}


/// Adds pattern-matching-related methods to [DayOpenHours].
extension DayOpenHoursPatterns on DayOpenHours {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _DayOpenHours value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _DayOpenHours() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _DayOpenHours value)  $default,){
final _that = this;
switch (_that) {
case _DayOpenHours():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _DayOpenHours value)?  $default,){
final _that = this;
switch (_that) {
case _DayOpenHours() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String dayOfWeek,  List<OpenWindow> windows)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _DayOpenHours() when $default != null:
return $default(_that.dayOfWeek,_that.windows);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String dayOfWeek,  List<OpenWindow> windows)  $default,) {final _that = this;
switch (_that) {
case _DayOpenHours():
return $default(_that.dayOfWeek,_that.windows);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String dayOfWeek,  List<OpenWindow> windows)?  $default,) {final _that = this;
switch (_that) {
case _DayOpenHours() when $default != null:
return $default(_that.dayOfWeek,_that.windows);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _DayOpenHours implements DayOpenHours {
  const _DayOpenHours({required this.dayOfWeek, final  List<OpenWindow> windows = const <OpenWindow>[]}): _windows = windows;
  factory _DayOpenHours.fromJson(Map<String, dynamic> json) => _$DayOpenHoursFromJson(json);

@override final  String dayOfWeek;
 final  List<OpenWindow> _windows;
@override@JsonKey() List<OpenWindow> get windows {
  if (_windows is EqualUnmodifiableListView) return _windows;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_windows);
}


/// Create a copy of DayOpenHours
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$DayOpenHoursCopyWith<_DayOpenHours> get copyWith => __$DayOpenHoursCopyWithImpl<_DayOpenHours>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$DayOpenHoursToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _DayOpenHours&&(identical(other.dayOfWeek, dayOfWeek) || other.dayOfWeek == dayOfWeek)&&const DeepCollectionEquality().equals(other._windows, _windows));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,dayOfWeek,const DeepCollectionEquality().hash(_windows));

@override
String toString() {
  return 'DayOpenHours(dayOfWeek: $dayOfWeek, windows: $windows)';
}


}

/// @nodoc
abstract mixin class _$DayOpenHoursCopyWith<$Res> implements $DayOpenHoursCopyWith<$Res> {
  factory _$DayOpenHoursCopyWith(_DayOpenHours value, $Res Function(_DayOpenHours) _then) = __$DayOpenHoursCopyWithImpl;
@override @useResult
$Res call({
 String dayOfWeek, List<OpenWindow> windows
});




}
/// @nodoc
class __$DayOpenHoursCopyWithImpl<$Res>
    implements _$DayOpenHoursCopyWith<$Res> {
  __$DayOpenHoursCopyWithImpl(this._self, this._then);

  final _DayOpenHours _self;
  final $Res Function(_DayOpenHours) _then;

/// Create a copy of DayOpenHours
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? dayOfWeek = null,Object? windows = null,}) {
  return _then(_DayOpenHours(
dayOfWeek: null == dayOfWeek ? _self.dayOfWeek : dayOfWeek // ignore: cast_nullable_to_non_nullable
as String,windows: null == windows ? _self._windows : windows // ignore: cast_nullable_to_non_nullable
as List<OpenWindow>,
  ));
}


}


/// @nodoc
mixin _$BlackoutDate {

 String get date; String? get reason;
/// Create a copy of BlackoutDate
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$BlackoutDateCopyWith<BlackoutDate> get copyWith => _$BlackoutDateCopyWithImpl<BlackoutDate>(this as BlackoutDate, _$identity);

  /// Serializes this BlackoutDate to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is BlackoutDate&&(identical(other.date, date) || other.date == date)&&(identical(other.reason, reason) || other.reason == reason));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,date,reason);

@override
String toString() {
  return 'BlackoutDate(date: $date, reason: $reason)';
}


}

/// @nodoc
abstract mixin class $BlackoutDateCopyWith<$Res>  {
  factory $BlackoutDateCopyWith(BlackoutDate value, $Res Function(BlackoutDate) _then) = _$BlackoutDateCopyWithImpl;
@useResult
$Res call({
 String date, String? reason
});




}
/// @nodoc
class _$BlackoutDateCopyWithImpl<$Res>
    implements $BlackoutDateCopyWith<$Res> {
  _$BlackoutDateCopyWithImpl(this._self, this._then);

  final BlackoutDate _self;
  final $Res Function(BlackoutDate) _then;

/// Create a copy of BlackoutDate
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? date = null,Object? reason = freezed,}) {
  return _then(_self.copyWith(
date: null == date ? _self.date : date // ignore: cast_nullable_to_non_nullable
as String,reason: freezed == reason ? _self.reason : reason // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [BlackoutDate].
extension BlackoutDatePatterns on BlackoutDate {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _BlackoutDate value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _BlackoutDate() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _BlackoutDate value)  $default,){
final _that = this;
switch (_that) {
case _BlackoutDate():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _BlackoutDate value)?  $default,){
final _that = this;
switch (_that) {
case _BlackoutDate() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String date,  String? reason)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _BlackoutDate() when $default != null:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String date,  String? reason)  $default,) {final _that = this;
switch (_that) {
case _BlackoutDate():
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String date,  String? reason)?  $default,) {final _that = this;
switch (_that) {
case _BlackoutDate() when $default != null:
return $default(_that.date,_that.reason);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _BlackoutDate implements BlackoutDate {
  const _BlackoutDate({required this.date, this.reason});
  factory _BlackoutDate.fromJson(Map<String, dynamic> json) => _$BlackoutDateFromJson(json);

@override final  String date;
@override final  String? reason;

/// Create a copy of BlackoutDate
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$BlackoutDateCopyWith<_BlackoutDate> get copyWith => __$BlackoutDateCopyWithImpl<_BlackoutDate>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$BlackoutDateToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _BlackoutDate&&(identical(other.date, date) || other.date == date)&&(identical(other.reason, reason) || other.reason == reason));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,date,reason);

@override
String toString() {
  return 'BlackoutDate(date: $date, reason: $reason)';
}


}

/// @nodoc
abstract mixin class _$BlackoutDateCopyWith<$Res> implements $BlackoutDateCopyWith<$Res> {
  factory _$BlackoutDateCopyWith(_BlackoutDate value, $Res Function(_BlackoutDate) _then) = __$BlackoutDateCopyWithImpl;
@override @useResult
$Res call({
 String date, String? reason
});




}
/// @nodoc
class __$BlackoutDateCopyWithImpl<$Res>
    implements _$BlackoutDateCopyWith<$Res> {
  __$BlackoutDateCopyWithImpl(this._self, this._then);

  final _BlackoutDate _self;
  final $Res Function(_BlackoutDate) _then;

/// Create a copy of BlackoutDate
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? date = null,Object? reason = freezed,}) {
  return _then(_BlackoutDate(
date: null == date ? _self.date : date // ignore: cast_nullable_to_non_nullable
as String,reason: freezed == reason ? _self.reason : reason // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}


/// @nodoc
mixin _$RoomAvailabilityRules {

 String get roomId; String get timezone; List<DayOpenHours> get days; List<BlackoutDate> get blackouts;
/// Create a copy of RoomAvailabilityRules
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$RoomAvailabilityRulesCopyWith<RoomAvailabilityRules> get copyWith => _$RoomAvailabilityRulesCopyWithImpl<RoomAvailabilityRules>(this as RoomAvailabilityRules, _$identity);

  /// Serializes this RoomAvailabilityRules to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is RoomAvailabilityRules&&(identical(other.roomId, roomId) || other.roomId == roomId)&&(identical(other.timezone, timezone) || other.timezone == timezone)&&const DeepCollectionEquality().equals(other.days, days)&&const DeepCollectionEquality().equals(other.blackouts, blackouts));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,roomId,timezone,const DeepCollectionEquality().hash(days),const DeepCollectionEquality().hash(blackouts));

@override
String toString() {
  return 'RoomAvailabilityRules(roomId: $roomId, timezone: $timezone, days: $days, blackouts: $blackouts)';
}


}

/// @nodoc
abstract mixin class $RoomAvailabilityRulesCopyWith<$Res>  {
  factory $RoomAvailabilityRulesCopyWith(RoomAvailabilityRules value, $Res Function(RoomAvailabilityRules) _then) = _$RoomAvailabilityRulesCopyWithImpl;
@useResult
$Res call({
 String roomId, String timezone, List<DayOpenHours> days, List<BlackoutDate> blackouts
});




}
/// @nodoc
class _$RoomAvailabilityRulesCopyWithImpl<$Res>
    implements $RoomAvailabilityRulesCopyWith<$Res> {
  _$RoomAvailabilityRulesCopyWithImpl(this._self, this._then);

  final RoomAvailabilityRules _self;
  final $Res Function(RoomAvailabilityRules) _then;

/// Create a copy of RoomAvailabilityRules
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? roomId = null,Object? timezone = null,Object? days = null,Object? blackouts = null,}) {
  return _then(_self.copyWith(
roomId: null == roomId ? _self.roomId : roomId // ignore: cast_nullable_to_non_nullable
as String,timezone: null == timezone ? _self.timezone : timezone // ignore: cast_nullable_to_non_nullable
as String,days: null == days ? _self.days : days // ignore: cast_nullable_to_non_nullable
as List<DayOpenHours>,blackouts: null == blackouts ? _self.blackouts : blackouts // ignore: cast_nullable_to_non_nullable
as List<BlackoutDate>,
  ));
}

}


/// Adds pattern-matching-related methods to [RoomAvailabilityRules].
extension RoomAvailabilityRulesPatterns on RoomAvailabilityRules {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _RoomAvailabilityRules value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _RoomAvailabilityRules() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _RoomAvailabilityRules value)  $default,){
final _that = this;
switch (_that) {
case _RoomAvailabilityRules():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _RoomAvailabilityRules value)?  $default,){
final _that = this;
switch (_that) {
case _RoomAvailabilityRules() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String roomId,  String timezone,  List<DayOpenHours> days,  List<BlackoutDate> blackouts)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _RoomAvailabilityRules() when $default != null:
return $default(_that.roomId,_that.timezone,_that.days,_that.blackouts);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String roomId,  String timezone,  List<DayOpenHours> days,  List<BlackoutDate> blackouts)  $default,) {final _that = this;
switch (_that) {
case _RoomAvailabilityRules():
return $default(_that.roomId,_that.timezone,_that.days,_that.blackouts);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String roomId,  String timezone,  List<DayOpenHours> days,  List<BlackoutDate> blackouts)?  $default,) {final _that = this;
switch (_that) {
case _RoomAvailabilityRules() when $default != null:
return $default(_that.roomId,_that.timezone,_that.days,_that.blackouts);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _RoomAvailabilityRules extends RoomAvailabilityRules {
  const _RoomAvailabilityRules({required this.roomId, required this.timezone, final  List<DayOpenHours> days = const <DayOpenHours>[], final  List<BlackoutDate> blackouts = const <BlackoutDate>[]}): _days = days,_blackouts = blackouts,super._();
  factory _RoomAvailabilityRules.fromJson(Map<String, dynamic> json) => _$RoomAvailabilityRulesFromJson(json);

@override final  String roomId;
@override final  String timezone;
 final  List<DayOpenHours> _days;
@override@JsonKey() List<DayOpenHours> get days {
  if (_days is EqualUnmodifiableListView) return _days;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_days);
}

 final  List<BlackoutDate> _blackouts;
@override@JsonKey() List<BlackoutDate> get blackouts {
  if (_blackouts is EqualUnmodifiableListView) return _blackouts;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_blackouts);
}


/// Create a copy of RoomAvailabilityRules
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$RoomAvailabilityRulesCopyWith<_RoomAvailabilityRules> get copyWith => __$RoomAvailabilityRulesCopyWithImpl<_RoomAvailabilityRules>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$RoomAvailabilityRulesToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _RoomAvailabilityRules&&(identical(other.roomId, roomId) || other.roomId == roomId)&&(identical(other.timezone, timezone) || other.timezone == timezone)&&const DeepCollectionEquality().equals(other._days, _days)&&const DeepCollectionEquality().equals(other._blackouts, _blackouts));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,roomId,timezone,const DeepCollectionEquality().hash(_days),const DeepCollectionEquality().hash(_blackouts));

@override
String toString() {
  return 'RoomAvailabilityRules(roomId: $roomId, timezone: $timezone, days: $days, blackouts: $blackouts)';
}


}

/// @nodoc
abstract mixin class _$RoomAvailabilityRulesCopyWith<$Res> implements $RoomAvailabilityRulesCopyWith<$Res> {
  factory _$RoomAvailabilityRulesCopyWith(_RoomAvailabilityRules value, $Res Function(_RoomAvailabilityRules) _then) = __$RoomAvailabilityRulesCopyWithImpl;
@override @useResult
$Res call({
 String roomId, String timezone, List<DayOpenHours> days, List<BlackoutDate> blackouts
});




}
/// @nodoc
class __$RoomAvailabilityRulesCopyWithImpl<$Res>
    implements _$RoomAvailabilityRulesCopyWith<$Res> {
  __$RoomAvailabilityRulesCopyWithImpl(this._self, this._then);

  final _RoomAvailabilityRules _self;
  final $Res Function(_RoomAvailabilityRules) _then;

/// Create a copy of RoomAvailabilityRules
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? roomId = null,Object? timezone = null,Object? days = null,Object? blackouts = null,}) {
  return _then(_RoomAvailabilityRules(
roomId: null == roomId ? _self.roomId : roomId // ignore: cast_nullable_to_non_nullable
as String,timezone: null == timezone ? _self.timezone : timezone // ignore: cast_nullable_to_non_nullable
as String,days: null == days ? _self._days : days // ignore: cast_nullable_to_non_nullable
as List<DayOpenHours>,blackouts: null == blackouts ? _self._blackouts : blackouts // ignore: cast_nullable_to_non_nullable
as List<BlackoutDate>,
  ));
}


}

// dart format on
