// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'application.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$ProposedSchedule {

/// Wire token: `oneOff` or `recurringWeekly`.
 String get frequency;/// `yyyy-MM-dd`.
 String get startDate;/// `yyyy-MM-dd` — mandatory when recurring.
 String? get endDate;/// Wire token (`monday`…`sunday`) — required when recurring.
 String? get dayOfWeek;/// Venue-local start, `HH:mm` (24h).
 String get startTime;/// Venue-local end, `HH:mm` (24h), after [startTime].
 String get endTime;
/// Create a copy of ProposedSchedule
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ProposedScheduleCopyWith<ProposedSchedule> get copyWith => _$ProposedScheduleCopyWithImpl<ProposedSchedule>(this as ProposedSchedule, _$identity);

  /// Serializes this ProposedSchedule to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ProposedSchedule&&(identical(other.frequency, frequency) || other.frequency == frequency)&&(identical(other.startDate, startDate) || other.startDate == startDate)&&(identical(other.endDate, endDate) || other.endDate == endDate)&&(identical(other.dayOfWeek, dayOfWeek) || other.dayOfWeek == dayOfWeek)&&(identical(other.startTime, startTime) || other.startTime == startTime)&&(identical(other.endTime, endTime) || other.endTime == endTime));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,frequency,startDate,endDate,dayOfWeek,startTime,endTime);

@override
String toString() {
  return 'ProposedSchedule(frequency: $frequency, startDate: $startDate, endDate: $endDate, dayOfWeek: $dayOfWeek, startTime: $startTime, endTime: $endTime)';
}


}

/// @nodoc
abstract mixin class $ProposedScheduleCopyWith<$Res>  {
  factory $ProposedScheduleCopyWith(ProposedSchedule value, $Res Function(ProposedSchedule) _then) = _$ProposedScheduleCopyWithImpl;
@useResult
$Res call({
 String frequency, String startDate, String? endDate, String? dayOfWeek, String startTime, String endTime
});




}
/// @nodoc
class _$ProposedScheduleCopyWithImpl<$Res>
    implements $ProposedScheduleCopyWith<$Res> {
  _$ProposedScheduleCopyWithImpl(this._self, this._then);

  final ProposedSchedule _self;
  final $Res Function(ProposedSchedule) _then;

/// Create a copy of ProposedSchedule
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? frequency = null,Object? startDate = null,Object? endDate = freezed,Object? dayOfWeek = freezed,Object? startTime = null,Object? endTime = null,}) {
  return _then(_self.copyWith(
frequency: null == frequency ? _self.frequency : frequency // ignore: cast_nullable_to_non_nullable
as String,startDate: null == startDate ? _self.startDate : startDate // ignore: cast_nullable_to_non_nullable
as String,endDate: freezed == endDate ? _self.endDate : endDate // ignore: cast_nullable_to_non_nullable
as String?,dayOfWeek: freezed == dayOfWeek ? _self.dayOfWeek : dayOfWeek // ignore: cast_nullable_to_non_nullable
as String?,startTime: null == startTime ? _self.startTime : startTime // ignore: cast_nullable_to_non_nullable
as String,endTime: null == endTime ? _self.endTime : endTime // ignore: cast_nullable_to_non_nullable
as String,
  ));
}

}


/// Adds pattern-matching-related methods to [ProposedSchedule].
extension ProposedSchedulePatterns on ProposedSchedule {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ProposedSchedule value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ProposedSchedule() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ProposedSchedule value)  $default,){
final _that = this;
switch (_that) {
case _ProposedSchedule():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ProposedSchedule value)?  $default,){
final _that = this;
switch (_that) {
case _ProposedSchedule() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String frequency,  String startDate,  String? endDate,  String? dayOfWeek,  String startTime,  String endTime)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ProposedSchedule() when $default != null:
return $default(_that.frequency,_that.startDate,_that.endDate,_that.dayOfWeek,_that.startTime,_that.endTime);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String frequency,  String startDate,  String? endDate,  String? dayOfWeek,  String startTime,  String endTime)  $default,) {final _that = this;
switch (_that) {
case _ProposedSchedule():
return $default(_that.frequency,_that.startDate,_that.endDate,_that.dayOfWeek,_that.startTime,_that.endTime);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String frequency,  String startDate,  String? endDate,  String? dayOfWeek,  String startTime,  String endTime)?  $default,) {final _that = this;
switch (_that) {
case _ProposedSchedule() when $default != null:
return $default(_that.frequency,_that.startDate,_that.endDate,_that.dayOfWeek,_that.startTime,_that.endTime);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ProposedSchedule extends ProposedSchedule {
  const _ProposedSchedule({required this.frequency, required this.startDate, this.endDate, this.dayOfWeek, required this.startTime, required this.endTime}): super._();
  factory _ProposedSchedule.fromJson(Map<String, dynamic> json) => _$ProposedScheduleFromJson(json);

/// Wire token: `oneOff` or `recurringWeekly`.
@override final  String frequency;
/// `yyyy-MM-dd`.
@override final  String startDate;
/// `yyyy-MM-dd` — mandatory when recurring.
@override final  String? endDate;
/// Wire token (`monday`…`sunday`) — required when recurring.
@override final  String? dayOfWeek;
/// Venue-local start, `HH:mm` (24h).
@override final  String startTime;
/// Venue-local end, `HH:mm` (24h), after [startTime].
@override final  String endTime;

/// Create a copy of ProposedSchedule
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ProposedScheduleCopyWith<_ProposedSchedule> get copyWith => __$ProposedScheduleCopyWithImpl<_ProposedSchedule>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ProposedScheduleToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ProposedSchedule&&(identical(other.frequency, frequency) || other.frequency == frequency)&&(identical(other.startDate, startDate) || other.startDate == startDate)&&(identical(other.endDate, endDate) || other.endDate == endDate)&&(identical(other.dayOfWeek, dayOfWeek) || other.dayOfWeek == dayOfWeek)&&(identical(other.startTime, startTime) || other.startTime == startTime)&&(identical(other.endTime, endTime) || other.endTime == endTime));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,frequency,startDate,endDate,dayOfWeek,startTime,endTime);

@override
String toString() {
  return 'ProposedSchedule(frequency: $frequency, startDate: $startDate, endDate: $endDate, dayOfWeek: $dayOfWeek, startTime: $startTime, endTime: $endTime)';
}


}

/// @nodoc
abstract mixin class _$ProposedScheduleCopyWith<$Res> implements $ProposedScheduleCopyWith<$Res> {
  factory _$ProposedScheduleCopyWith(_ProposedSchedule value, $Res Function(_ProposedSchedule) _then) = __$ProposedScheduleCopyWithImpl;
@override @useResult
$Res call({
 String frequency, String startDate, String? endDate, String? dayOfWeek, String startTime, String endTime
});




}
/// @nodoc
class __$ProposedScheduleCopyWithImpl<$Res>
    implements _$ProposedScheduleCopyWith<$Res> {
  __$ProposedScheduleCopyWithImpl(this._self, this._then);

  final _ProposedSchedule _self;
  final $Res Function(_ProposedSchedule) _then;

/// Create a copy of ProposedSchedule
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? frequency = null,Object? startDate = null,Object? endDate = freezed,Object? dayOfWeek = freezed,Object? startTime = null,Object? endTime = null,}) {
  return _then(_ProposedSchedule(
frequency: null == frequency ? _self.frequency : frequency // ignore: cast_nullable_to_non_nullable
as String,startDate: null == startDate ? _self.startDate : startDate // ignore: cast_nullable_to_non_nullable
as String,endDate: freezed == endDate ? _self.endDate : endDate // ignore: cast_nullable_to_non_nullable
as String?,dayOfWeek: freezed == dayOfWeek ? _self.dayOfWeek : dayOfWeek // ignore: cast_nullable_to_non_nullable
as String?,startTime: null == startTime ? _self.startTime : startTime // ignore: cast_nullable_to_non_nullable
as String,endTime: null == endTime ? _self.endTime : endTime // ignore: cast_nullable_to_non_nullable
as String,
  ));
}


}


/// @nodoc
mixin _$Organizer {

 String get id; String get displayName;
/// Create a copy of Organizer
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$OrganizerCopyWith<Organizer> get copyWith => _$OrganizerCopyWithImpl<Organizer>(this as Organizer, _$identity);

  /// Serializes this Organizer to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Organizer&&(identical(other.id, id) || other.id == id)&&(identical(other.displayName, displayName) || other.displayName == displayName));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,displayName);

@override
String toString() {
  return 'Organizer(id: $id, displayName: $displayName)';
}


}

/// @nodoc
abstract mixin class $OrganizerCopyWith<$Res>  {
  factory $OrganizerCopyWith(Organizer value, $Res Function(Organizer) _then) = _$OrganizerCopyWithImpl;
@useResult
$Res call({
 String id, String displayName
});




}
/// @nodoc
class _$OrganizerCopyWithImpl<$Res>
    implements $OrganizerCopyWith<$Res> {
  _$OrganizerCopyWithImpl(this._self, this._then);

  final Organizer _self;
  final $Res Function(Organizer) _then;

/// Create a copy of Organizer
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? displayName = null,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,displayName: null == displayName ? _self.displayName : displayName // ignore: cast_nullable_to_non_nullable
as String,
  ));
}

}


/// Adds pattern-matching-related methods to [Organizer].
extension OrganizerPatterns on Organizer {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Organizer value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Organizer() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Organizer value)  $default,){
final _that = this;
switch (_that) {
case _Organizer():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Organizer value)?  $default,){
final _that = this;
switch (_that) {
case _Organizer() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String displayName)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Organizer() when $default != null:
return $default(_that.id,_that.displayName);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String displayName)  $default,) {final _that = this;
switch (_that) {
case _Organizer():
return $default(_that.id,_that.displayName);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String displayName)?  $default,) {final _that = this;
switch (_that) {
case _Organizer() when $default != null:
return $default(_that.id,_that.displayName);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _Organizer implements Organizer {
  const _Organizer({required this.id, required this.displayName});
  factory _Organizer.fromJson(Map<String, dynamic> json) => _$OrganizerFromJson(json);

@override final  String id;
@override final  String displayName;

/// Create a copy of Organizer
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$OrganizerCopyWith<_Organizer> get copyWith => __$OrganizerCopyWithImpl<_Organizer>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$OrganizerToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _Organizer&&(identical(other.id, id) || other.id == id)&&(identical(other.displayName, displayName) || other.displayName == displayName));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,displayName);

@override
String toString() {
  return 'Organizer(id: $id, displayName: $displayName)';
}


}

/// @nodoc
abstract mixin class _$OrganizerCopyWith<$Res> implements $OrganizerCopyWith<$Res> {
  factory _$OrganizerCopyWith(_Organizer value, $Res Function(_Organizer) _then) = __$OrganizerCopyWithImpl;
@override @useResult
$Res call({
 String id, String displayName
});




}
/// @nodoc
class __$OrganizerCopyWithImpl<$Res>
    implements _$OrganizerCopyWith<$Res> {
  __$OrganizerCopyWithImpl(this._self, this._then);

  final _Organizer _self;
  final $Res Function(_Organizer) _then;

/// Create a copy of Organizer
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? displayName = null,}) {
  return _then(_Organizer(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,displayName: null == displayName ? _self.displayName : displayName // ignore: cast_nullable_to_non_nullable
as String,
  ));
}


}


/// @nodoc
mixin _$ApplicationMessage {

 String get id; String get senderId; String get body; DateTime get sentAtUtc;
/// Create a copy of ApplicationMessage
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ApplicationMessageCopyWith<ApplicationMessage> get copyWith => _$ApplicationMessageCopyWithImpl<ApplicationMessage>(this as ApplicationMessage, _$identity);

  /// Serializes this ApplicationMessage to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ApplicationMessage&&(identical(other.id, id) || other.id == id)&&(identical(other.senderId, senderId) || other.senderId == senderId)&&(identical(other.body, body) || other.body == body)&&(identical(other.sentAtUtc, sentAtUtc) || other.sentAtUtc == sentAtUtc));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,senderId,body,sentAtUtc);

@override
String toString() {
  return 'ApplicationMessage(id: $id, senderId: $senderId, body: $body, sentAtUtc: $sentAtUtc)';
}


}

/// @nodoc
abstract mixin class $ApplicationMessageCopyWith<$Res>  {
  factory $ApplicationMessageCopyWith(ApplicationMessage value, $Res Function(ApplicationMessage) _then) = _$ApplicationMessageCopyWithImpl;
@useResult
$Res call({
 String id, String senderId, String body, DateTime sentAtUtc
});




}
/// @nodoc
class _$ApplicationMessageCopyWithImpl<$Res>
    implements $ApplicationMessageCopyWith<$Res> {
  _$ApplicationMessageCopyWithImpl(this._self, this._then);

  final ApplicationMessage _self;
  final $Res Function(ApplicationMessage) _then;

/// Create a copy of ApplicationMessage
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? senderId = null,Object? body = null,Object? sentAtUtc = null,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,senderId: null == senderId ? _self.senderId : senderId // ignore: cast_nullable_to_non_nullable
as String,body: null == body ? _self.body : body // ignore: cast_nullable_to_non_nullable
as String,sentAtUtc: null == sentAtUtc ? _self.sentAtUtc : sentAtUtc // ignore: cast_nullable_to_non_nullable
as DateTime,
  ));
}

}


/// Adds pattern-matching-related methods to [ApplicationMessage].
extension ApplicationMessagePatterns on ApplicationMessage {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ApplicationMessage value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ApplicationMessage() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ApplicationMessage value)  $default,){
final _that = this;
switch (_that) {
case _ApplicationMessage():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ApplicationMessage value)?  $default,){
final _that = this;
switch (_that) {
case _ApplicationMessage() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String senderId,  String body,  DateTime sentAtUtc)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ApplicationMessage() when $default != null:
return $default(_that.id,_that.senderId,_that.body,_that.sentAtUtc);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String senderId,  String body,  DateTime sentAtUtc)  $default,) {final _that = this;
switch (_that) {
case _ApplicationMessage():
return $default(_that.id,_that.senderId,_that.body,_that.sentAtUtc);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String senderId,  String body,  DateTime sentAtUtc)?  $default,) {final _that = this;
switch (_that) {
case _ApplicationMessage() when $default != null:
return $default(_that.id,_that.senderId,_that.body,_that.sentAtUtc);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ApplicationMessage implements ApplicationMessage {
  const _ApplicationMessage({required this.id, required this.senderId, required this.body, required this.sentAtUtc});
  factory _ApplicationMessage.fromJson(Map<String, dynamic> json) => _$ApplicationMessageFromJson(json);

@override final  String id;
@override final  String senderId;
@override final  String body;
@override final  DateTime sentAtUtc;

/// Create a copy of ApplicationMessage
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ApplicationMessageCopyWith<_ApplicationMessage> get copyWith => __$ApplicationMessageCopyWithImpl<_ApplicationMessage>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ApplicationMessageToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ApplicationMessage&&(identical(other.id, id) || other.id == id)&&(identical(other.senderId, senderId) || other.senderId == senderId)&&(identical(other.body, body) || other.body == body)&&(identical(other.sentAtUtc, sentAtUtc) || other.sentAtUtc == sentAtUtc));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,senderId,body,sentAtUtc);

@override
String toString() {
  return 'ApplicationMessage(id: $id, senderId: $senderId, body: $body, sentAtUtc: $sentAtUtc)';
}


}

/// @nodoc
abstract mixin class _$ApplicationMessageCopyWith<$Res> implements $ApplicationMessageCopyWith<$Res> {
  factory _$ApplicationMessageCopyWith(_ApplicationMessage value, $Res Function(_ApplicationMessage) _then) = __$ApplicationMessageCopyWithImpl;
@override @useResult
$Res call({
 String id, String senderId, String body, DateTime sentAtUtc
});




}
/// @nodoc
class __$ApplicationMessageCopyWithImpl<$Res>
    implements _$ApplicationMessageCopyWith<$Res> {
  __$ApplicationMessageCopyWithImpl(this._self, this._then);

  final _ApplicationMessage _self;
  final $Res Function(_ApplicationMessage) _then;

/// Create a copy of ApplicationMessage
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? senderId = null,Object? body = null,Object? sentAtUtc = null,}) {
  return _then(_ApplicationMessage(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,senderId: null == senderId ? _self.senderId : senderId // ignore: cast_nullable_to_non_nullable
as String,body: null == body ? _self.body : body // ignore: cast_nullable_to_non_nullable
as String,sentAtUtc: null == sentAtUtc ? _self.sentAtUtc : sentAtUtc // ignore: cast_nullable_to_non_nullable
as DateTime,
  ));
}


}


/// @nodoc
mixin _$Application {

 String get id; String get roomId; String get roomName; String get venueName; String get venueSlug; String get roomSlug; Organizer get organizer; String get activityType; int get groupSize; ProposedSchedule get schedule; String get intentText;/// Wire token: `pending | needsInfo | approved | declined | withdrawn |
/// expired`.
 String get status; DateTime get createdAtUtc; DateTime? get decidedAtUtc; DateTime get expiresAtUtc;/// Set once approved — the booking it created.
 String? get bookingId; int get messageCount; List<ApplicationMessage> get messages;
/// Create a copy of Application
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ApplicationCopyWith<Application> get copyWith => _$ApplicationCopyWithImpl<Application>(this as Application, _$identity);

  /// Serializes this Application to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Application&&(identical(other.id, id) || other.id == id)&&(identical(other.roomId, roomId) || other.roomId == roomId)&&(identical(other.roomName, roomName) || other.roomName == roomName)&&(identical(other.venueName, venueName) || other.venueName == venueName)&&(identical(other.venueSlug, venueSlug) || other.venueSlug == venueSlug)&&(identical(other.roomSlug, roomSlug) || other.roomSlug == roomSlug)&&(identical(other.organizer, organizer) || other.organizer == organizer)&&(identical(other.activityType, activityType) || other.activityType == activityType)&&(identical(other.groupSize, groupSize) || other.groupSize == groupSize)&&(identical(other.schedule, schedule) || other.schedule == schedule)&&(identical(other.intentText, intentText) || other.intentText == intentText)&&(identical(other.status, status) || other.status == status)&&(identical(other.createdAtUtc, createdAtUtc) || other.createdAtUtc == createdAtUtc)&&(identical(other.decidedAtUtc, decidedAtUtc) || other.decidedAtUtc == decidedAtUtc)&&(identical(other.expiresAtUtc, expiresAtUtc) || other.expiresAtUtc == expiresAtUtc)&&(identical(other.bookingId, bookingId) || other.bookingId == bookingId)&&(identical(other.messageCount, messageCount) || other.messageCount == messageCount)&&const DeepCollectionEquality().equals(other.messages, messages));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,roomId,roomName,venueName,venueSlug,roomSlug,organizer,activityType,groupSize,schedule,intentText,status,createdAtUtc,decidedAtUtc,expiresAtUtc,bookingId,messageCount,const DeepCollectionEquality().hash(messages));

@override
String toString() {
  return 'Application(id: $id, roomId: $roomId, roomName: $roomName, venueName: $venueName, venueSlug: $venueSlug, roomSlug: $roomSlug, organizer: $organizer, activityType: $activityType, groupSize: $groupSize, schedule: $schedule, intentText: $intentText, status: $status, createdAtUtc: $createdAtUtc, decidedAtUtc: $decidedAtUtc, expiresAtUtc: $expiresAtUtc, bookingId: $bookingId, messageCount: $messageCount, messages: $messages)';
}


}

/// @nodoc
abstract mixin class $ApplicationCopyWith<$Res>  {
  factory $ApplicationCopyWith(Application value, $Res Function(Application) _then) = _$ApplicationCopyWithImpl;
@useResult
$Res call({
 String id, String roomId, String roomName, String venueName, String venueSlug, String roomSlug, Organizer organizer, String activityType, int groupSize, ProposedSchedule schedule, String intentText, String status, DateTime createdAtUtc, DateTime? decidedAtUtc, DateTime expiresAtUtc, String? bookingId, int messageCount, List<ApplicationMessage> messages
});


$OrganizerCopyWith<$Res> get organizer;$ProposedScheduleCopyWith<$Res> get schedule;

}
/// @nodoc
class _$ApplicationCopyWithImpl<$Res>
    implements $ApplicationCopyWith<$Res> {
  _$ApplicationCopyWithImpl(this._self, this._then);

  final Application _self;
  final $Res Function(Application) _then;

/// Create a copy of Application
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? roomId = null,Object? roomName = null,Object? venueName = null,Object? venueSlug = null,Object? roomSlug = null,Object? organizer = null,Object? activityType = null,Object? groupSize = null,Object? schedule = null,Object? intentText = null,Object? status = null,Object? createdAtUtc = null,Object? decidedAtUtc = freezed,Object? expiresAtUtc = null,Object? bookingId = freezed,Object? messageCount = null,Object? messages = null,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,roomId: null == roomId ? _self.roomId : roomId // ignore: cast_nullable_to_non_nullable
as String,roomName: null == roomName ? _self.roomName : roomName // ignore: cast_nullable_to_non_nullable
as String,venueName: null == venueName ? _self.venueName : venueName // ignore: cast_nullable_to_non_nullable
as String,venueSlug: null == venueSlug ? _self.venueSlug : venueSlug // ignore: cast_nullable_to_non_nullable
as String,roomSlug: null == roomSlug ? _self.roomSlug : roomSlug // ignore: cast_nullable_to_non_nullable
as String,organizer: null == organizer ? _self.organizer : organizer // ignore: cast_nullable_to_non_nullable
as Organizer,activityType: null == activityType ? _self.activityType : activityType // ignore: cast_nullable_to_non_nullable
as String,groupSize: null == groupSize ? _self.groupSize : groupSize // ignore: cast_nullable_to_non_nullable
as int,schedule: null == schedule ? _self.schedule : schedule // ignore: cast_nullable_to_non_nullable
as ProposedSchedule,intentText: null == intentText ? _self.intentText : intentText // ignore: cast_nullable_to_non_nullable
as String,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,createdAtUtc: null == createdAtUtc ? _self.createdAtUtc : createdAtUtc // ignore: cast_nullable_to_non_nullable
as DateTime,decidedAtUtc: freezed == decidedAtUtc ? _self.decidedAtUtc : decidedAtUtc // ignore: cast_nullable_to_non_nullable
as DateTime?,expiresAtUtc: null == expiresAtUtc ? _self.expiresAtUtc : expiresAtUtc // ignore: cast_nullable_to_non_nullable
as DateTime,bookingId: freezed == bookingId ? _self.bookingId : bookingId // ignore: cast_nullable_to_non_nullable
as String?,messageCount: null == messageCount ? _self.messageCount : messageCount // ignore: cast_nullable_to_non_nullable
as int,messages: null == messages ? _self.messages : messages // ignore: cast_nullable_to_non_nullable
as List<ApplicationMessage>,
  ));
}
/// Create a copy of Application
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$OrganizerCopyWith<$Res> get organizer {
  
  return $OrganizerCopyWith<$Res>(_self.organizer, (value) {
    return _then(_self.copyWith(organizer: value));
  });
}/// Create a copy of Application
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$ProposedScheduleCopyWith<$Res> get schedule {
  
  return $ProposedScheduleCopyWith<$Res>(_self.schedule, (value) {
    return _then(_self.copyWith(schedule: value));
  });
}
}


/// Adds pattern-matching-related methods to [Application].
extension ApplicationPatterns on Application {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Application value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Application() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Application value)  $default,){
final _that = this;
switch (_that) {
case _Application():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Application value)?  $default,){
final _that = this;
switch (_that) {
case _Application() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String roomId,  String roomName,  String venueName,  String venueSlug,  String roomSlug,  Organizer organizer,  String activityType,  int groupSize,  ProposedSchedule schedule,  String intentText,  String status,  DateTime createdAtUtc,  DateTime? decidedAtUtc,  DateTime expiresAtUtc,  String? bookingId,  int messageCount,  List<ApplicationMessage> messages)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Application() when $default != null:
return $default(_that.id,_that.roomId,_that.roomName,_that.venueName,_that.venueSlug,_that.roomSlug,_that.organizer,_that.activityType,_that.groupSize,_that.schedule,_that.intentText,_that.status,_that.createdAtUtc,_that.decidedAtUtc,_that.expiresAtUtc,_that.bookingId,_that.messageCount,_that.messages);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String roomId,  String roomName,  String venueName,  String venueSlug,  String roomSlug,  Organizer organizer,  String activityType,  int groupSize,  ProposedSchedule schedule,  String intentText,  String status,  DateTime createdAtUtc,  DateTime? decidedAtUtc,  DateTime expiresAtUtc,  String? bookingId,  int messageCount,  List<ApplicationMessage> messages)  $default,) {final _that = this;
switch (_that) {
case _Application():
return $default(_that.id,_that.roomId,_that.roomName,_that.venueName,_that.venueSlug,_that.roomSlug,_that.organizer,_that.activityType,_that.groupSize,_that.schedule,_that.intentText,_that.status,_that.createdAtUtc,_that.decidedAtUtc,_that.expiresAtUtc,_that.bookingId,_that.messageCount,_that.messages);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String roomId,  String roomName,  String venueName,  String venueSlug,  String roomSlug,  Organizer organizer,  String activityType,  int groupSize,  ProposedSchedule schedule,  String intentText,  String status,  DateTime createdAtUtc,  DateTime? decidedAtUtc,  DateTime expiresAtUtc,  String? bookingId,  int messageCount,  List<ApplicationMessage> messages)?  $default,) {final _that = this;
switch (_that) {
case _Application() when $default != null:
return $default(_that.id,_that.roomId,_that.roomName,_that.venueName,_that.venueSlug,_that.roomSlug,_that.organizer,_that.activityType,_that.groupSize,_that.schedule,_that.intentText,_that.status,_that.createdAtUtc,_that.decidedAtUtc,_that.expiresAtUtc,_that.bookingId,_that.messageCount,_that.messages);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _Application extends Application {
  const _Application({required this.id, required this.roomId, required this.roomName, required this.venueName, required this.venueSlug, required this.roomSlug, required this.organizer, required this.activityType, required this.groupSize, required this.schedule, required this.intentText, required this.status, required this.createdAtUtc, this.decidedAtUtc, required this.expiresAtUtc, this.bookingId, required this.messageCount, final  List<ApplicationMessage> messages = const <ApplicationMessage>[]}): _messages = messages,super._();
  factory _Application.fromJson(Map<String, dynamic> json) => _$ApplicationFromJson(json);

@override final  String id;
@override final  String roomId;
@override final  String roomName;
@override final  String venueName;
@override final  String venueSlug;
@override final  String roomSlug;
@override final  Organizer organizer;
@override final  String activityType;
@override final  int groupSize;
@override final  ProposedSchedule schedule;
@override final  String intentText;
/// Wire token: `pending | needsInfo | approved | declined | withdrawn |
/// expired`.
@override final  String status;
@override final  DateTime createdAtUtc;
@override final  DateTime? decidedAtUtc;
@override final  DateTime expiresAtUtc;
/// Set once approved — the booking it created.
@override final  String? bookingId;
@override final  int messageCount;
 final  List<ApplicationMessage> _messages;
@override@JsonKey() List<ApplicationMessage> get messages {
  if (_messages is EqualUnmodifiableListView) return _messages;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_messages);
}


/// Create a copy of Application
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ApplicationCopyWith<_Application> get copyWith => __$ApplicationCopyWithImpl<_Application>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ApplicationToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _Application&&(identical(other.id, id) || other.id == id)&&(identical(other.roomId, roomId) || other.roomId == roomId)&&(identical(other.roomName, roomName) || other.roomName == roomName)&&(identical(other.venueName, venueName) || other.venueName == venueName)&&(identical(other.venueSlug, venueSlug) || other.venueSlug == venueSlug)&&(identical(other.roomSlug, roomSlug) || other.roomSlug == roomSlug)&&(identical(other.organizer, organizer) || other.organizer == organizer)&&(identical(other.activityType, activityType) || other.activityType == activityType)&&(identical(other.groupSize, groupSize) || other.groupSize == groupSize)&&(identical(other.schedule, schedule) || other.schedule == schedule)&&(identical(other.intentText, intentText) || other.intentText == intentText)&&(identical(other.status, status) || other.status == status)&&(identical(other.createdAtUtc, createdAtUtc) || other.createdAtUtc == createdAtUtc)&&(identical(other.decidedAtUtc, decidedAtUtc) || other.decidedAtUtc == decidedAtUtc)&&(identical(other.expiresAtUtc, expiresAtUtc) || other.expiresAtUtc == expiresAtUtc)&&(identical(other.bookingId, bookingId) || other.bookingId == bookingId)&&(identical(other.messageCount, messageCount) || other.messageCount == messageCount)&&const DeepCollectionEquality().equals(other._messages, _messages));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,roomId,roomName,venueName,venueSlug,roomSlug,organizer,activityType,groupSize,schedule,intentText,status,createdAtUtc,decidedAtUtc,expiresAtUtc,bookingId,messageCount,const DeepCollectionEquality().hash(_messages));

@override
String toString() {
  return 'Application(id: $id, roomId: $roomId, roomName: $roomName, venueName: $venueName, venueSlug: $venueSlug, roomSlug: $roomSlug, organizer: $organizer, activityType: $activityType, groupSize: $groupSize, schedule: $schedule, intentText: $intentText, status: $status, createdAtUtc: $createdAtUtc, decidedAtUtc: $decidedAtUtc, expiresAtUtc: $expiresAtUtc, bookingId: $bookingId, messageCount: $messageCount, messages: $messages)';
}


}

/// @nodoc
abstract mixin class _$ApplicationCopyWith<$Res> implements $ApplicationCopyWith<$Res> {
  factory _$ApplicationCopyWith(_Application value, $Res Function(_Application) _then) = __$ApplicationCopyWithImpl;
@override @useResult
$Res call({
 String id, String roomId, String roomName, String venueName, String venueSlug, String roomSlug, Organizer organizer, String activityType, int groupSize, ProposedSchedule schedule, String intentText, String status, DateTime createdAtUtc, DateTime? decidedAtUtc, DateTime expiresAtUtc, String? bookingId, int messageCount, List<ApplicationMessage> messages
});


@override $OrganizerCopyWith<$Res> get organizer;@override $ProposedScheduleCopyWith<$Res> get schedule;

}
/// @nodoc
class __$ApplicationCopyWithImpl<$Res>
    implements _$ApplicationCopyWith<$Res> {
  __$ApplicationCopyWithImpl(this._self, this._then);

  final _Application _self;
  final $Res Function(_Application) _then;

/// Create a copy of Application
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? roomId = null,Object? roomName = null,Object? venueName = null,Object? venueSlug = null,Object? roomSlug = null,Object? organizer = null,Object? activityType = null,Object? groupSize = null,Object? schedule = null,Object? intentText = null,Object? status = null,Object? createdAtUtc = null,Object? decidedAtUtc = freezed,Object? expiresAtUtc = null,Object? bookingId = freezed,Object? messageCount = null,Object? messages = null,}) {
  return _then(_Application(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,roomId: null == roomId ? _self.roomId : roomId // ignore: cast_nullable_to_non_nullable
as String,roomName: null == roomName ? _self.roomName : roomName // ignore: cast_nullable_to_non_nullable
as String,venueName: null == venueName ? _self.venueName : venueName // ignore: cast_nullable_to_non_nullable
as String,venueSlug: null == venueSlug ? _self.venueSlug : venueSlug // ignore: cast_nullable_to_non_nullable
as String,roomSlug: null == roomSlug ? _self.roomSlug : roomSlug // ignore: cast_nullable_to_non_nullable
as String,organizer: null == organizer ? _self.organizer : organizer // ignore: cast_nullable_to_non_nullable
as Organizer,activityType: null == activityType ? _self.activityType : activityType // ignore: cast_nullable_to_non_nullable
as String,groupSize: null == groupSize ? _self.groupSize : groupSize // ignore: cast_nullable_to_non_nullable
as int,schedule: null == schedule ? _self.schedule : schedule // ignore: cast_nullable_to_non_nullable
as ProposedSchedule,intentText: null == intentText ? _self.intentText : intentText // ignore: cast_nullable_to_non_nullable
as String,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,createdAtUtc: null == createdAtUtc ? _self.createdAtUtc : createdAtUtc // ignore: cast_nullable_to_non_nullable
as DateTime,decidedAtUtc: freezed == decidedAtUtc ? _self.decidedAtUtc : decidedAtUtc // ignore: cast_nullable_to_non_nullable
as DateTime?,expiresAtUtc: null == expiresAtUtc ? _self.expiresAtUtc : expiresAtUtc // ignore: cast_nullable_to_non_nullable
as DateTime,bookingId: freezed == bookingId ? _self.bookingId : bookingId // ignore: cast_nullable_to_non_nullable
as String?,messageCount: null == messageCount ? _self.messageCount : messageCount // ignore: cast_nullable_to_non_nullable
as int,messages: null == messages ? _self._messages : messages // ignore: cast_nullable_to_non_nullable
as List<ApplicationMessage>,
  ));
}

/// Create a copy of Application
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$OrganizerCopyWith<$Res> get organizer {
  
  return $OrganizerCopyWith<$Res>(_self.organizer, (value) {
    return _then(_self.copyWith(organizer: value));
  });
}/// Create a copy of Application
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$ProposedScheduleCopyWith<$Res> get schedule {
  
  return $ProposedScheduleCopyWith<$Res>(_self.schedule, (value) {
    return _then(_self.copyWith(schedule: value));
  });
}
}


/// @nodoc
mixin _$ApplicationDraft {

 String get activityType; int get groupSize; ProposedSchedule? get schedule; String get intentText;
/// Create a copy of ApplicationDraft
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ApplicationDraftCopyWith<ApplicationDraft> get copyWith => _$ApplicationDraftCopyWithImpl<ApplicationDraft>(this as ApplicationDraft, _$identity);

  /// Serializes this ApplicationDraft to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ApplicationDraft&&(identical(other.activityType, activityType) || other.activityType == activityType)&&(identical(other.groupSize, groupSize) || other.groupSize == groupSize)&&(identical(other.schedule, schedule) || other.schedule == schedule)&&(identical(other.intentText, intentText) || other.intentText == intentText));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,activityType,groupSize,schedule,intentText);

@override
String toString() {
  return 'ApplicationDraft(activityType: $activityType, groupSize: $groupSize, schedule: $schedule, intentText: $intentText)';
}


}

/// @nodoc
abstract mixin class $ApplicationDraftCopyWith<$Res>  {
  factory $ApplicationDraftCopyWith(ApplicationDraft value, $Res Function(ApplicationDraft) _then) = _$ApplicationDraftCopyWithImpl;
@useResult
$Res call({
 String activityType, int groupSize, ProposedSchedule? schedule, String intentText
});


$ProposedScheduleCopyWith<$Res>? get schedule;

}
/// @nodoc
class _$ApplicationDraftCopyWithImpl<$Res>
    implements $ApplicationDraftCopyWith<$Res> {
  _$ApplicationDraftCopyWithImpl(this._self, this._then);

  final ApplicationDraft _self;
  final $Res Function(ApplicationDraft) _then;

/// Create a copy of ApplicationDraft
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? activityType = null,Object? groupSize = null,Object? schedule = freezed,Object? intentText = null,}) {
  return _then(_self.copyWith(
activityType: null == activityType ? _self.activityType : activityType // ignore: cast_nullable_to_non_nullable
as String,groupSize: null == groupSize ? _self.groupSize : groupSize // ignore: cast_nullable_to_non_nullable
as int,schedule: freezed == schedule ? _self.schedule : schedule // ignore: cast_nullable_to_non_nullable
as ProposedSchedule?,intentText: null == intentText ? _self.intentText : intentText // ignore: cast_nullable_to_non_nullable
as String,
  ));
}
/// Create a copy of ApplicationDraft
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$ProposedScheduleCopyWith<$Res>? get schedule {
    if (_self.schedule == null) {
    return null;
  }

  return $ProposedScheduleCopyWith<$Res>(_self.schedule!, (value) {
    return _then(_self.copyWith(schedule: value));
  });
}
}


/// Adds pattern-matching-related methods to [ApplicationDraft].
extension ApplicationDraftPatterns on ApplicationDraft {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ApplicationDraft value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ApplicationDraft() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ApplicationDraft value)  $default,){
final _that = this;
switch (_that) {
case _ApplicationDraft():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ApplicationDraft value)?  $default,){
final _that = this;
switch (_that) {
case _ApplicationDraft() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String activityType,  int groupSize,  ProposedSchedule? schedule,  String intentText)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ApplicationDraft() when $default != null:
return $default(_that.activityType,_that.groupSize,_that.schedule,_that.intentText);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String activityType,  int groupSize,  ProposedSchedule? schedule,  String intentText)  $default,) {final _that = this;
switch (_that) {
case _ApplicationDraft():
return $default(_that.activityType,_that.groupSize,_that.schedule,_that.intentText);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String activityType,  int groupSize,  ProposedSchedule? schedule,  String intentText)?  $default,) {final _that = this;
switch (_that) {
case _ApplicationDraft() when $default != null:
return $default(_that.activityType,_that.groupSize,_that.schedule,_that.intentText);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ApplicationDraft implements ApplicationDraft {
  const _ApplicationDraft({this.activityType = '', this.groupSize = 0, this.schedule, this.intentText = ''});
  factory _ApplicationDraft.fromJson(Map<String, dynamic> json) => _$ApplicationDraftFromJson(json);

@override@JsonKey() final  String activityType;
@override@JsonKey() final  int groupSize;
@override final  ProposedSchedule? schedule;
@override@JsonKey() final  String intentText;

/// Create a copy of ApplicationDraft
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ApplicationDraftCopyWith<_ApplicationDraft> get copyWith => __$ApplicationDraftCopyWithImpl<_ApplicationDraft>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ApplicationDraftToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ApplicationDraft&&(identical(other.activityType, activityType) || other.activityType == activityType)&&(identical(other.groupSize, groupSize) || other.groupSize == groupSize)&&(identical(other.schedule, schedule) || other.schedule == schedule)&&(identical(other.intentText, intentText) || other.intentText == intentText));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,activityType,groupSize,schedule,intentText);

@override
String toString() {
  return 'ApplicationDraft(activityType: $activityType, groupSize: $groupSize, schedule: $schedule, intentText: $intentText)';
}


}

/// @nodoc
abstract mixin class _$ApplicationDraftCopyWith<$Res> implements $ApplicationDraftCopyWith<$Res> {
  factory _$ApplicationDraftCopyWith(_ApplicationDraft value, $Res Function(_ApplicationDraft) _then) = __$ApplicationDraftCopyWithImpl;
@override @useResult
$Res call({
 String activityType, int groupSize, ProposedSchedule? schedule, String intentText
});


@override $ProposedScheduleCopyWith<$Res>? get schedule;

}
/// @nodoc
class __$ApplicationDraftCopyWithImpl<$Res>
    implements _$ApplicationDraftCopyWith<$Res> {
  __$ApplicationDraftCopyWithImpl(this._self, this._then);

  final _ApplicationDraft _self;
  final $Res Function(_ApplicationDraft) _then;

/// Create a copy of ApplicationDraft
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? activityType = null,Object? groupSize = null,Object? schedule = freezed,Object? intentText = null,}) {
  return _then(_ApplicationDraft(
activityType: null == activityType ? _self.activityType : activityType // ignore: cast_nullable_to_non_nullable
as String,groupSize: null == groupSize ? _self.groupSize : groupSize // ignore: cast_nullable_to_non_nullable
as int,schedule: freezed == schedule ? _self.schedule : schedule // ignore: cast_nullable_to_non_nullable
as ProposedSchedule?,intentText: null == intentText ? _self.intentText : intentText // ignore: cast_nullable_to_non_nullable
as String,
  ));
}

/// Create a copy of ApplicationDraft
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$ProposedScheduleCopyWith<$Res>? get schedule {
    if (_self.schedule == null) {
    return null;
  }

  return $ProposedScheduleCopyWith<$Res>(_self.schedule!, (value) {
    return _then(_self.copyWith(schedule: value));
  });
}
}

// dart format on
