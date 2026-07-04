// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'notification.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$NotificationPayload {

 String? get applicationId; String? get bookingId; String? get roomId; String? get roomName; String? get venueName; String? get venueSlug; String? get roomSlug; String? get organizerName; String? get status;/// Path-only canonical deep link (CONTRACTS §9 / MOBILE_CONTRACTS §7
/// registry), e.g. `/inbox/applications/{id}`, `/bookings/{id}`.
 String? get deepLink;
/// Create a copy of NotificationPayload
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$NotificationPayloadCopyWith<NotificationPayload> get copyWith => _$NotificationPayloadCopyWithImpl<NotificationPayload>(this as NotificationPayload, _$identity);

  /// Serializes this NotificationPayload to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is NotificationPayload&&(identical(other.applicationId, applicationId) || other.applicationId == applicationId)&&(identical(other.bookingId, bookingId) || other.bookingId == bookingId)&&(identical(other.roomId, roomId) || other.roomId == roomId)&&(identical(other.roomName, roomName) || other.roomName == roomName)&&(identical(other.venueName, venueName) || other.venueName == venueName)&&(identical(other.venueSlug, venueSlug) || other.venueSlug == venueSlug)&&(identical(other.roomSlug, roomSlug) || other.roomSlug == roomSlug)&&(identical(other.organizerName, organizerName) || other.organizerName == organizerName)&&(identical(other.status, status) || other.status == status)&&(identical(other.deepLink, deepLink) || other.deepLink == deepLink));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,applicationId,bookingId,roomId,roomName,venueName,venueSlug,roomSlug,organizerName,status,deepLink);

@override
String toString() {
  return 'NotificationPayload(applicationId: $applicationId, bookingId: $bookingId, roomId: $roomId, roomName: $roomName, venueName: $venueName, venueSlug: $venueSlug, roomSlug: $roomSlug, organizerName: $organizerName, status: $status, deepLink: $deepLink)';
}


}

/// @nodoc
abstract mixin class $NotificationPayloadCopyWith<$Res>  {
  factory $NotificationPayloadCopyWith(NotificationPayload value, $Res Function(NotificationPayload) _then) = _$NotificationPayloadCopyWithImpl;
@useResult
$Res call({
 String? applicationId, String? bookingId, String? roomId, String? roomName, String? venueName, String? venueSlug, String? roomSlug, String? organizerName, String? status, String? deepLink
});




}
/// @nodoc
class _$NotificationPayloadCopyWithImpl<$Res>
    implements $NotificationPayloadCopyWith<$Res> {
  _$NotificationPayloadCopyWithImpl(this._self, this._then);

  final NotificationPayload _self;
  final $Res Function(NotificationPayload) _then;

/// Create a copy of NotificationPayload
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? applicationId = freezed,Object? bookingId = freezed,Object? roomId = freezed,Object? roomName = freezed,Object? venueName = freezed,Object? venueSlug = freezed,Object? roomSlug = freezed,Object? organizerName = freezed,Object? status = freezed,Object? deepLink = freezed,}) {
  return _then(_self.copyWith(
applicationId: freezed == applicationId ? _self.applicationId : applicationId // ignore: cast_nullable_to_non_nullable
as String?,bookingId: freezed == bookingId ? _self.bookingId : bookingId // ignore: cast_nullable_to_non_nullable
as String?,roomId: freezed == roomId ? _self.roomId : roomId // ignore: cast_nullable_to_non_nullable
as String?,roomName: freezed == roomName ? _self.roomName : roomName // ignore: cast_nullable_to_non_nullable
as String?,venueName: freezed == venueName ? _self.venueName : venueName // ignore: cast_nullable_to_non_nullable
as String?,venueSlug: freezed == venueSlug ? _self.venueSlug : venueSlug // ignore: cast_nullable_to_non_nullable
as String?,roomSlug: freezed == roomSlug ? _self.roomSlug : roomSlug // ignore: cast_nullable_to_non_nullable
as String?,organizerName: freezed == organizerName ? _self.organizerName : organizerName // ignore: cast_nullable_to_non_nullable
as String?,status: freezed == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String?,deepLink: freezed == deepLink ? _self.deepLink : deepLink // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [NotificationPayload].
extension NotificationPayloadPatterns on NotificationPayload {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _NotificationPayload value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _NotificationPayload() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _NotificationPayload value)  $default,){
final _that = this;
switch (_that) {
case _NotificationPayload():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _NotificationPayload value)?  $default,){
final _that = this;
switch (_that) {
case _NotificationPayload() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String? applicationId,  String? bookingId,  String? roomId,  String? roomName,  String? venueName,  String? venueSlug,  String? roomSlug,  String? organizerName,  String? status,  String? deepLink)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _NotificationPayload() when $default != null:
return $default(_that.applicationId,_that.bookingId,_that.roomId,_that.roomName,_that.venueName,_that.venueSlug,_that.roomSlug,_that.organizerName,_that.status,_that.deepLink);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String? applicationId,  String? bookingId,  String? roomId,  String? roomName,  String? venueName,  String? venueSlug,  String? roomSlug,  String? organizerName,  String? status,  String? deepLink)  $default,) {final _that = this;
switch (_that) {
case _NotificationPayload():
return $default(_that.applicationId,_that.bookingId,_that.roomId,_that.roomName,_that.venueName,_that.venueSlug,_that.roomSlug,_that.organizerName,_that.status,_that.deepLink);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String? applicationId,  String? bookingId,  String? roomId,  String? roomName,  String? venueName,  String? venueSlug,  String? roomSlug,  String? organizerName,  String? status,  String? deepLink)?  $default,) {final _that = this;
switch (_that) {
case _NotificationPayload() when $default != null:
return $default(_that.applicationId,_that.bookingId,_that.roomId,_that.roomName,_that.venueName,_that.venueSlug,_that.roomSlug,_that.organizerName,_that.status,_that.deepLink);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _NotificationPayload implements NotificationPayload {
  const _NotificationPayload({this.applicationId, this.bookingId, this.roomId, this.roomName, this.venueName, this.venueSlug, this.roomSlug, this.organizerName, this.status, this.deepLink});
  factory _NotificationPayload.fromJson(Map<String, dynamic> json) => _$NotificationPayloadFromJson(json);

@override final  String? applicationId;
@override final  String? bookingId;
@override final  String? roomId;
@override final  String? roomName;
@override final  String? venueName;
@override final  String? venueSlug;
@override final  String? roomSlug;
@override final  String? organizerName;
@override final  String? status;
/// Path-only canonical deep link (CONTRACTS §9 / MOBILE_CONTRACTS §7
/// registry), e.g. `/inbox/applications/{id}`, `/bookings/{id}`.
@override final  String? deepLink;

/// Create a copy of NotificationPayload
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$NotificationPayloadCopyWith<_NotificationPayload> get copyWith => __$NotificationPayloadCopyWithImpl<_NotificationPayload>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$NotificationPayloadToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _NotificationPayload&&(identical(other.applicationId, applicationId) || other.applicationId == applicationId)&&(identical(other.bookingId, bookingId) || other.bookingId == bookingId)&&(identical(other.roomId, roomId) || other.roomId == roomId)&&(identical(other.roomName, roomName) || other.roomName == roomName)&&(identical(other.venueName, venueName) || other.venueName == venueName)&&(identical(other.venueSlug, venueSlug) || other.venueSlug == venueSlug)&&(identical(other.roomSlug, roomSlug) || other.roomSlug == roomSlug)&&(identical(other.organizerName, organizerName) || other.organizerName == organizerName)&&(identical(other.status, status) || other.status == status)&&(identical(other.deepLink, deepLink) || other.deepLink == deepLink));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,applicationId,bookingId,roomId,roomName,venueName,venueSlug,roomSlug,organizerName,status,deepLink);

@override
String toString() {
  return 'NotificationPayload(applicationId: $applicationId, bookingId: $bookingId, roomId: $roomId, roomName: $roomName, venueName: $venueName, venueSlug: $venueSlug, roomSlug: $roomSlug, organizerName: $organizerName, status: $status, deepLink: $deepLink)';
}


}

/// @nodoc
abstract mixin class _$NotificationPayloadCopyWith<$Res> implements $NotificationPayloadCopyWith<$Res> {
  factory _$NotificationPayloadCopyWith(_NotificationPayload value, $Res Function(_NotificationPayload) _then) = __$NotificationPayloadCopyWithImpl;
@override @useResult
$Res call({
 String? applicationId, String? bookingId, String? roomId, String? roomName, String? venueName, String? venueSlug, String? roomSlug, String? organizerName, String? status, String? deepLink
});




}
/// @nodoc
class __$NotificationPayloadCopyWithImpl<$Res>
    implements _$NotificationPayloadCopyWith<$Res> {
  __$NotificationPayloadCopyWithImpl(this._self, this._then);

  final _NotificationPayload _self;
  final $Res Function(_NotificationPayload) _then;

/// Create a copy of NotificationPayload
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? applicationId = freezed,Object? bookingId = freezed,Object? roomId = freezed,Object? roomName = freezed,Object? venueName = freezed,Object? venueSlug = freezed,Object? roomSlug = freezed,Object? organizerName = freezed,Object? status = freezed,Object? deepLink = freezed,}) {
  return _then(_NotificationPayload(
applicationId: freezed == applicationId ? _self.applicationId : applicationId // ignore: cast_nullable_to_non_nullable
as String?,bookingId: freezed == bookingId ? _self.bookingId : bookingId // ignore: cast_nullable_to_non_nullable
as String?,roomId: freezed == roomId ? _self.roomId : roomId // ignore: cast_nullable_to_non_nullable
as String?,roomName: freezed == roomName ? _self.roomName : roomName // ignore: cast_nullable_to_non_nullable
as String?,venueName: freezed == venueName ? _self.venueName : venueName // ignore: cast_nullable_to_non_nullable
as String?,venueSlug: freezed == venueSlug ? _self.venueSlug : venueSlug // ignore: cast_nullable_to_non_nullable
as String?,roomSlug: freezed == roomSlug ? _self.roomSlug : roomSlug // ignore: cast_nullable_to_non_nullable
as String?,organizerName: freezed == organizerName ? _self.organizerName : organizerName // ignore: cast_nullable_to_non_nullable
as String?,status: freezed == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String?,deepLink: freezed == deepLink ? _self.deepLink : deepLink // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}


/// @nodoc
mixin _$AppNotification {

 String get id;/// Wire token, e.g. `applicationReceived` — unknown types route to a
/// generic row.
 String get type; DateTime get createdAtUtc; DateTime? get readAt; NotificationPayload get payload;
/// Create a copy of AppNotification
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$AppNotificationCopyWith<AppNotification> get copyWith => _$AppNotificationCopyWithImpl<AppNotification>(this as AppNotification, _$identity);

  /// Serializes this AppNotification to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is AppNotification&&(identical(other.id, id) || other.id == id)&&(identical(other.type, type) || other.type == type)&&(identical(other.createdAtUtc, createdAtUtc) || other.createdAtUtc == createdAtUtc)&&(identical(other.readAt, readAt) || other.readAt == readAt)&&(identical(other.payload, payload) || other.payload == payload));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,type,createdAtUtc,readAt,payload);

@override
String toString() {
  return 'AppNotification(id: $id, type: $type, createdAtUtc: $createdAtUtc, readAt: $readAt, payload: $payload)';
}


}

/// @nodoc
abstract mixin class $AppNotificationCopyWith<$Res>  {
  factory $AppNotificationCopyWith(AppNotification value, $Res Function(AppNotification) _then) = _$AppNotificationCopyWithImpl;
@useResult
$Res call({
 String id, String type, DateTime createdAtUtc, DateTime? readAt, NotificationPayload payload
});


$NotificationPayloadCopyWith<$Res> get payload;

}
/// @nodoc
class _$AppNotificationCopyWithImpl<$Res>
    implements $AppNotificationCopyWith<$Res> {
  _$AppNotificationCopyWithImpl(this._self, this._then);

  final AppNotification _self;
  final $Res Function(AppNotification) _then;

/// Create a copy of AppNotification
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? type = null,Object? createdAtUtc = null,Object? readAt = freezed,Object? payload = null,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,type: null == type ? _self.type : type // ignore: cast_nullable_to_non_nullable
as String,createdAtUtc: null == createdAtUtc ? _self.createdAtUtc : createdAtUtc // ignore: cast_nullable_to_non_nullable
as DateTime,readAt: freezed == readAt ? _self.readAt : readAt // ignore: cast_nullable_to_non_nullable
as DateTime?,payload: null == payload ? _self.payload : payload // ignore: cast_nullable_to_non_nullable
as NotificationPayload,
  ));
}
/// Create a copy of AppNotification
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$NotificationPayloadCopyWith<$Res> get payload {
  
  return $NotificationPayloadCopyWith<$Res>(_self.payload, (value) {
    return _then(_self.copyWith(payload: value));
  });
}
}


/// Adds pattern-matching-related methods to [AppNotification].
extension AppNotificationPatterns on AppNotification {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _AppNotification value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _AppNotification() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _AppNotification value)  $default,){
final _that = this;
switch (_that) {
case _AppNotification():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _AppNotification value)?  $default,){
final _that = this;
switch (_that) {
case _AppNotification() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String type,  DateTime createdAtUtc,  DateTime? readAt,  NotificationPayload payload)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _AppNotification() when $default != null:
return $default(_that.id,_that.type,_that.createdAtUtc,_that.readAt,_that.payload);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String type,  DateTime createdAtUtc,  DateTime? readAt,  NotificationPayload payload)  $default,) {final _that = this;
switch (_that) {
case _AppNotification():
return $default(_that.id,_that.type,_that.createdAtUtc,_that.readAt,_that.payload);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String type,  DateTime createdAtUtc,  DateTime? readAt,  NotificationPayload payload)?  $default,) {final _that = this;
switch (_that) {
case _AppNotification() when $default != null:
return $default(_that.id,_that.type,_that.createdAtUtc,_that.readAt,_that.payload);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _AppNotification extends AppNotification {
  const _AppNotification({required this.id, required this.type, required this.createdAtUtc, this.readAt, required this.payload}): super._();
  factory _AppNotification.fromJson(Map<String, dynamic> json) => _$AppNotificationFromJson(json);

@override final  String id;
/// Wire token, e.g. `applicationReceived` — unknown types route to a
/// generic row.
@override final  String type;
@override final  DateTime createdAtUtc;
@override final  DateTime? readAt;
@override final  NotificationPayload payload;

/// Create a copy of AppNotification
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$AppNotificationCopyWith<_AppNotification> get copyWith => __$AppNotificationCopyWithImpl<_AppNotification>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$AppNotificationToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _AppNotification&&(identical(other.id, id) || other.id == id)&&(identical(other.type, type) || other.type == type)&&(identical(other.createdAtUtc, createdAtUtc) || other.createdAtUtc == createdAtUtc)&&(identical(other.readAt, readAt) || other.readAt == readAt)&&(identical(other.payload, payload) || other.payload == payload));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,type,createdAtUtc,readAt,payload);

@override
String toString() {
  return 'AppNotification(id: $id, type: $type, createdAtUtc: $createdAtUtc, readAt: $readAt, payload: $payload)';
}


}

/// @nodoc
abstract mixin class _$AppNotificationCopyWith<$Res> implements $AppNotificationCopyWith<$Res> {
  factory _$AppNotificationCopyWith(_AppNotification value, $Res Function(_AppNotification) _then) = __$AppNotificationCopyWithImpl;
@override @useResult
$Res call({
 String id, String type, DateTime createdAtUtc, DateTime? readAt, NotificationPayload payload
});


@override $NotificationPayloadCopyWith<$Res> get payload;

}
/// @nodoc
class __$AppNotificationCopyWithImpl<$Res>
    implements _$AppNotificationCopyWith<$Res> {
  __$AppNotificationCopyWithImpl(this._self, this._then);

  final _AppNotification _self;
  final $Res Function(_AppNotification) _then;

/// Create a copy of AppNotification
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? type = null,Object? createdAtUtc = null,Object? readAt = freezed,Object? payload = null,}) {
  return _then(_AppNotification(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,type: null == type ? _self.type : type // ignore: cast_nullable_to_non_nullable
as String,createdAtUtc: null == createdAtUtc ? _self.createdAtUtc : createdAtUtc // ignore: cast_nullable_to_non_nullable
as DateTime,readAt: freezed == readAt ? _self.readAt : readAt // ignore: cast_nullable_to_non_nullable
as DateTime?,payload: null == payload ? _self.payload : payload // ignore: cast_nullable_to_non_nullable
as NotificationPayload,
  ));
}

/// Create a copy of AppNotification
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$NotificationPayloadCopyWith<$Res> get payload {
  
  return $NotificationPayloadCopyWith<$Res>(_self.payload, (value) {
    return _then(_self.copyWith(payload: value));
  });
}
}

// dart format on
