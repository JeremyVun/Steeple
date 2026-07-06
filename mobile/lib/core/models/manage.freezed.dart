// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'manage.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$ManagedVenue {

 String get id; String get name; String get slug;
/// Create a copy of ManagedVenue
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ManagedVenueCopyWith<ManagedVenue> get copyWith => _$ManagedVenueCopyWithImpl<ManagedVenue>(this as ManagedVenue, _$identity);

  /// Serializes this ManagedVenue to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ManagedVenue&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.slug, slug) || other.slug == slug));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,name,slug);

@override
String toString() {
  return 'ManagedVenue(id: $id, name: $name, slug: $slug)';
}


}

/// @nodoc
abstract mixin class $ManagedVenueCopyWith<$Res>  {
  factory $ManagedVenueCopyWith(ManagedVenue value, $Res Function(ManagedVenue) _then) = _$ManagedVenueCopyWithImpl;
@useResult
$Res call({
 String id, String name, String slug
});




}
/// @nodoc
class _$ManagedVenueCopyWithImpl<$Res>
    implements $ManagedVenueCopyWith<$Res> {
  _$ManagedVenueCopyWithImpl(this._self, this._then);

  final ManagedVenue _self;
  final $Res Function(ManagedVenue) _then;

/// Create a copy of ManagedVenue
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? name = null,Object? slug = null,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,slug: null == slug ? _self.slug : slug // ignore: cast_nullable_to_non_nullable
as String,
  ));
}

}


/// Adds pattern-matching-related methods to [ManagedVenue].
extension ManagedVenuePatterns on ManagedVenue {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ManagedVenue value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ManagedVenue() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ManagedVenue value)  $default,){
final _that = this;
switch (_that) {
case _ManagedVenue():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ManagedVenue value)?  $default,){
final _that = this;
switch (_that) {
case _ManagedVenue() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String name,  String slug)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ManagedVenue() when $default != null:
return $default(_that.id,_that.name,_that.slug);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String name,  String slug)  $default,) {final _that = this;
switch (_that) {
case _ManagedVenue():
return $default(_that.id,_that.name,_that.slug);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String name,  String slug)?  $default,) {final _that = this;
switch (_that) {
case _ManagedVenue() when $default != null:
return $default(_that.id,_that.name,_that.slug);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ManagedVenue implements ManagedVenue {
  const _ManagedVenue({required this.id, required this.name, required this.slug});
  factory _ManagedVenue.fromJson(Map<String, dynamic> json) => _$ManagedVenueFromJson(json);

@override final  String id;
@override final  String name;
@override final  String slug;

/// Create a copy of ManagedVenue
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ManagedVenueCopyWith<_ManagedVenue> get copyWith => __$ManagedVenueCopyWithImpl<_ManagedVenue>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ManagedVenueToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ManagedVenue&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.slug, slug) || other.slug == slug));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,name,slug);

@override
String toString() {
  return 'ManagedVenue(id: $id, name: $name, slug: $slug)';
}


}

/// @nodoc
abstract mixin class _$ManagedVenueCopyWith<$Res> implements $ManagedVenueCopyWith<$Res> {
  factory _$ManagedVenueCopyWith(_ManagedVenue value, $Res Function(_ManagedVenue) _then) = __$ManagedVenueCopyWithImpl;
@override @useResult
$Res call({
 String id, String name, String slug
});




}
/// @nodoc
class __$ManagedVenueCopyWithImpl<$Res>
    implements _$ManagedVenueCopyWith<$Res> {
  __$ManagedVenueCopyWithImpl(this._self, this._then);

  final _ManagedVenue _self;
  final $Res Function(_ManagedVenue) _then;

/// Create a copy of ManagedVenue
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? name = null,Object? slug = null,}) {
  return _then(_ManagedVenue(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,slug: null == slug ? _self.slug : slug // ignore: cast_nullable_to_non_nullable
as String,
  ));
}


}


/// @nodoc
mixin _$ManagedRoomSummary {

 String get id; String get name; String get slug;/// Wire token: `draft | published | unlisted` (additive — tolerate
/// unknown).
 String get status; DateTime? get publishRequestedAtUtc; int get capacity; double get pricePerHour; String get currency; String? get primaryPhotoUrl; int get photoCount; DateTime get updatedAtUtc;
/// Create a copy of ManagedRoomSummary
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ManagedRoomSummaryCopyWith<ManagedRoomSummary> get copyWith => _$ManagedRoomSummaryCopyWithImpl<ManagedRoomSummary>(this as ManagedRoomSummary, _$identity);

  /// Serializes this ManagedRoomSummary to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ManagedRoomSummary&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.slug, slug) || other.slug == slug)&&(identical(other.status, status) || other.status == status)&&(identical(other.publishRequestedAtUtc, publishRequestedAtUtc) || other.publishRequestedAtUtc == publishRequestedAtUtc)&&(identical(other.capacity, capacity) || other.capacity == capacity)&&(identical(other.pricePerHour, pricePerHour) || other.pricePerHour == pricePerHour)&&(identical(other.currency, currency) || other.currency == currency)&&(identical(other.primaryPhotoUrl, primaryPhotoUrl) || other.primaryPhotoUrl == primaryPhotoUrl)&&(identical(other.photoCount, photoCount) || other.photoCount == photoCount)&&(identical(other.updatedAtUtc, updatedAtUtc) || other.updatedAtUtc == updatedAtUtc));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,name,slug,status,publishRequestedAtUtc,capacity,pricePerHour,currency,primaryPhotoUrl,photoCount,updatedAtUtc);

@override
String toString() {
  return 'ManagedRoomSummary(id: $id, name: $name, slug: $slug, status: $status, publishRequestedAtUtc: $publishRequestedAtUtc, capacity: $capacity, pricePerHour: $pricePerHour, currency: $currency, primaryPhotoUrl: $primaryPhotoUrl, photoCount: $photoCount, updatedAtUtc: $updatedAtUtc)';
}


}

/// @nodoc
abstract mixin class $ManagedRoomSummaryCopyWith<$Res>  {
  factory $ManagedRoomSummaryCopyWith(ManagedRoomSummary value, $Res Function(ManagedRoomSummary) _then) = _$ManagedRoomSummaryCopyWithImpl;
@useResult
$Res call({
 String id, String name, String slug, String status, DateTime? publishRequestedAtUtc, int capacity, double pricePerHour, String currency, String? primaryPhotoUrl, int photoCount, DateTime updatedAtUtc
});




}
/// @nodoc
class _$ManagedRoomSummaryCopyWithImpl<$Res>
    implements $ManagedRoomSummaryCopyWith<$Res> {
  _$ManagedRoomSummaryCopyWithImpl(this._self, this._then);

  final ManagedRoomSummary _self;
  final $Res Function(ManagedRoomSummary) _then;

/// Create a copy of ManagedRoomSummary
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? name = null,Object? slug = null,Object? status = null,Object? publishRequestedAtUtc = freezed,Object? capacity = null,Object? pricePerHour = null,Object? currency = null,Object? primaryPhotoUrl = freezed,Object? photoCount = null,Object? updatedAtUtc = null,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,slug: null == slug ? _self.slug : slug // ignore: cast_nullable_to_non_nullable
as String,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,publishRequestedAtUtc: freezed == publishRequestedAtUtc ? _self.publishRequestedAtUtc : publishRequestedAtUtc // ignore: cast_nullable_to_non_nullable
as DateTime?,capacity: null == capacity ? _self.capacity : capacity // ignore: cast_nullable_to_non_nullable
as int,pricePerHour: null == pricePerHour ? _self.pricePerHour : pricePerHour // ignore: cast_nullable_to_non_nullable
as double,currency: null == currency ? _self.currency : currency // ignore: cast_nullable_to_non_nullable
as String,primaryPhotoUrl: freezed == primaryPhotoUrl ? _self.primaryPhotoUrl : primaryPhotoUrl // ignore: cast_nullable_to_non_nullable
as String?,photoCount: null == photoCount ? _self.photoCount : photoCount // ignore: cast_nullable_to_non_nullable
as int,updatedAtUtc: null == updatedAtUtc ? _self.updatedAtUtc : updatedAtUtc // ignore: cast_nullable_to_non_nullable
as DateTime,
  ));
}

}


/// Adds pattern-matching-related methods to [ManagedRoomSummary].
extension ManagedRoomSummaryPatterns on ManagedRoomSummary {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ManagedRoomSummary value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ManagedRoomSummary() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ManagedRoomSummary value)  $default,){
final _that = this;
switch (_that) {
case _ManagedRoomSummary():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ManagedRoomSummary value)?  $default,){
final _that = this;
switch (_that) {
case _ManagedRoomSummary() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String name,  String slug,  String status,  DateTime? publishRequestedAtUtc,  int capacity,  double pricePerHour,  String currency,  String? primaryPhotoUrl,  int photoCount,  DateTime updatedAtUtc)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ManagedRoomSummary() when $default != null:
return $default(_that.id,_that.name,_that.slug,_that.status,_that.publishRequestedAtUtc,_that.capacity,_that.pricePerHour,_that.currency,_that.primaryPhotoUrl,_that.photoCount,_that.updatedAtUtc);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String name,  String slug,  String status,  DateTime? publishRequestedAtUtc,  int capacity,  double pricePerHour,  String currency,  String? primaryPhotoUrl,  int photoCount,  DateTime updatedAtUtc)  $default,) {final _that = this;
switch (_that) {
case _ManagedRoomSummary():
return $default(_that.id,_that.name,_that.slug,_that.status,_that.publishRequestedAtUtc,_that.capacity,_that.pricePerHour,_that.currency,_that.primaryPhotoUrl,_that.photoCount,_that.updatedAtUtc);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String name,  String slug,  String status,  DateTime? publishRequestedAtUtc,  int capacity,  double pricePerHour,  String currency,  String? primaryPhotoUrl,  int photoCount,  DateTime updatedAtUtc)?  $default,) {final _that = this;
switch (_that) {
case _ManagedRoomSummary() when $default != null:
return $default(_that.id,_that.name,_that.slug,_that.status,_that.publishRequestedAtUtc,_that.capacity,_that.pricePerHour,_that.currency,_that.primaryPhotoUrl,_that.photoCount,_that.updatedAtUtc);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ManagedRoomSummary extends ManagedRoomSummary {
  const _ManagedRoomSummary({required this.id, required this.name, required this.slug, required this.status, this.publishRequestedAtUtc, required this.capacity, required this.pricePerHour, required this.currency, this.primaryPhotoUrl, required this.photoCount, required this.updatedAtUtc}): super._();
  factory _ManagedRoomSummary.fromJson(Map<String, dynamic> json) => _$ManagedRoomSummaryFromJson(json);

@override final  String id;
@override final  String name;
@override final  String slug;
/// Wire token: `draft | published | unlisted` (additive — tolerate
/// unknown).
@override final  String status;
@override final  DateTime? publishRequestedAtUtc;
@override final  int capacity;
@override final  double pricePerHour;
@override final  String currency;
@override final  String? primaryPhotoUrl;
@override final  int photoCount;
@override final  DateTime updatedAtUtc;

/// Create a copy of ManagedRoomSummary
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ManagedRoomSummaryCopyWith<_ManagedRoomSummary> get copyWith => __$ManagedRoomSummaryCopyWithImpl<_ManagedRoomSummary>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ManagedRoomSummaryToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ManagedRoomSummary&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.slug, slug) || other.slug == slug)&&(identical(other.status, status) || other.status == status)&&(identical(other.publishRequestedAtUtc, publishRequestedAtUtc) || other.publishRequestedAtUtc == publishRequestedAtUtc)&&(identical(other.capacity, capacity) || other.capacity == capacity)&&(identical(other.pricePerHour, pricePerHour) || other.pricePerHour == pricePerHour)&&(identical(other.currency, currency) || other.currency == currency)&&(identical(other.primaryPhotoUrl, primaryPhotoUrl) || other.primaryPhotoUrl == primaryPhotoUrl)&&(identical(other.photoCount, photoCount) || other.photoCount == photoCount)&&(identical(other.updatedAtUtc, updatedAtUtc) || other.updatedAtUtc == updatedAtUtc));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,name,slug,status,publishRequestedAtUtc,capacity,pricePerHour,currency,primaryPhotoUrl,photoCount,updatedAtUtc);

@override
String toString() {
  return 'ManagedRoomSummary(id: $id, name: $name, slug: $slug, status: $status, publishRequestedAtUtc: $publishRequestedAtUtc, capacity: $capacity, pricePerHour: $pricePerHour, currency: $currency, primaryPhotoUrl: $primaryPhotoUrl, photoCount: $photoCount, updatedAtUtc: $updatedAtUtc)';
}


}

/// @nodoc
abstract mixin class _$ManagedRoomSummaryCopyWith<$Res> implements $ManagedRoomSummaryCopyWith<$Res> {
  factory _$ManagedRoomSummaryCopyWith(_ManagedRoomSummary value, $Res Function(_ManagedRoomSummary) _then) = __$ManagedRoomSummaryCopyWithImpl;
@override @useResult
$Res call({
 String id, String name, String slug, String status, DateTime? publishRequestedAtUtc, int capacity, double pricePerHour, String currency, String? primaryPhotoUrl, int photoCount, DateTime updatedAtUtc
});




}
/// @nodoc
class __$ManagedRoomSummaryCopyWithImpl<$Res>
    implements _$ManagedRoomSummaryCopyWith<$Res> {
  __$ManagedRoomSummaryCopyWithImpl(this._self, this._then);

  final _ManagedRoomSummary _self;
  final $Res Function(_ManagedRoomSummary) _then;

/// Create a copy of ManagedRoomSummary
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? name = null,Object? slug = null,Object? status = null,Object? publishRequestedAtUtc = freezed,Object? capacity = null,Object? pricePerHour = null,Object? currency = null,Object? primaryPhotoUrl = freezed,Object? photoCount = null,Object? updatedAtUtc = null,}) {
  return _then(_ManagedRoomSummary(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,slug: null == slug ? _self.slug : slug // ignore: cast_nullable_to_non_nullable
as String,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,publishRequestedAtUtc: freezed == publishRequestedAtUtc ? _self.publishRequestedAtUtc : publishRequestedAtUtc // ignore: cast_nullable_to_non_nullable
as DateTime?,capacity: null == capacity ? _self.capacity : capacity // ignore: cast_nullable_to_non_nullable
as int,pricePerHour: null == pricePerHour ? _self.pricePerHour : pricePerHour // ignore: cast_nullable_to_non_nullable
as double,currency: null == currency ? _self.currency : currency // ignore: cast_nullable_to_non_nullable
as String,primaryPhotoUrl: freezed == primaryPhotoUrl ? _self.primaryPhotoUrl : primaryPhotoUrl // ignore: cast_nullable_to_non_nullable
as String?,photoCount: null == photoCount ? _self.photoCount : photoCount // ignore: cast_nullable_to_non_nullable
as int,updatedAtUtc: null == updatedAtUtc ? _self.updatedAtUtc : updatedAtUtc // ignore: cast_nullable_to_non_nullable
as DateTime,
  ));
}


}


/// @nodoc
mixin _$ManagedVenueDetail {

 String get id; String get name; String get slug; String get description;/// Wire token: `church | publicSpace | other`.
 String get venueType; String get addressLine; String get suburb; String get postcode; String? get contactEmail; String get parkingInfo; String get transitInfo; double get latitude; double get longitude; String get timezone; bool get isIdentityVerified; String get verificationStatus; DateTime? get verificationRequestedAtUtc; List<ManagedRoomSummary> get rooms;
/// Create a copy of ManagedVenueDetail
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ManagedVenueDetailCopyWith<ManagedVenueDetail> get copyWith => _$ManagedVenueDetailCopyWithImpl<ManagedVenueDetail>(this as ManagedVenueDetail, _$identity);

  /// Serializes this ManagedVenueDetail to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ManagedVenueDetail&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.slug, slug) || other.slug == slug)&&(identical(other.description, description) || other.description == description)&&(identical(other.venueType, venueType) || other.venueType == venueType)&&(identical(other.addressLine, addressLine) || other.addressLine == addressLine)&&(identical(other.suburb, suburb) || other.suburb == suburb)&&(identical(other.postcode, postcode) || other.postcode == postcode)&&(identical(other.contactEmail, contactEmail) || other.contactEmail == contactEmail)&&(identical(other.parkingInfo, parkingInfo) || other.parkingInfo == parkingInfo)&&(identical(other.transitInfo, transitInfo) || other.transitInfo == transitInfo)&&(identical(other.latitude, latitude) || other.latitude == latitude)&&(identical(other.longitude, longitude) || other.longitude == longitude)&&(identical(other.timezone, timezone) || other.timezone == timezone)&&(identical(other.isIdentityVerified, isIdentityVerified) || other.isIdentityVerified == isIdentityVerified)&&(identical(other.verificationStatus, verificationStatus) || other.verificationStatus == verificationStatus)&&(identical(other.verificationRequestedAtUtc, verificationRequestedAtUtc) || other.verificationRequestedAtUtc == verificationRequestedAtUtc)&&const DeepCollectionEquality().equals(other.rooms, rooms));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,name,slug,description,venueType,addressLine,suburb,postcode,contactEmail,parkingInfo,transitInfo,latitude,longitude,timezone,isIdentityVerified,verificationStatus,verificationRequestedAtUtc,const DeepCollectionEquality().hash(rooms));

@override
String toString() {
  return 'ManagedVenueDetail(id: $id, name: $name, slug: $slug, description: $description, venueType: $venueType, addressLine: $addressLine, suburb: $suburb, postcode: $postcode, contactEmail: $contactEmail, parkingInfo: $parkingInfo, transitInfo: $transitInfo, latitude: $latitude, longitude: $longitude, timezone: $timezone, isIdentityVerified: $isIdentityVerified, verificationStatus: $verificationStatus, verificationRequestedAtUtc: $verificationRequestedAtUtc, rooms: $rooms)';
}


}

/// @nodoc
abstract mixin class $ManagedVenueDetailCopyWith<$Res>  {
  factory $ManagedVenueDetailCopyWith(ManagedVenueDetail value, $Res Function(ManagedVenueDetail) _then) = _$ManagedVenueDetailCopyWithImpl;
@useResult
$Res call({
 String id, String name, String slug, String description, String venueType, String addressLine, String suburb, String postcode, String? contactEmail, String parkingInfo, String transitInfo, double latitude, double longitude, String timezone, bool isIdentityVerified, String verificationStatus, DateTime? verificationRequestedAtUtc, List<ManagedRoomSummary> rooms
});




}
/// @nodoc
class _$ManagedVenueDetailCopyWithImpl<$Res>
    implements $ManagedVenueDetailCopyWith<$Res> {
  _$ManagedVenueDetailCopyWithImpl(this._self, this._then);

  final ManagedVenueDetail _self;
  final $Res Function(ManagedVenueDetail) _then;

/// Create a copy of ManagedVenueDetail
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? name = null,Object? slug = null,Object? description = null,Object? venueType = null,Object? addressLine = null,Object? suburb = null,Object? postcode = null,Object? contactEmail = freezed,Object? parkingInfo = null,Object? transitInfo = null,Object? latitude = null,Object? longitude = null,Object? timezone = null,Object? isIdentityVerified = null,Object? verificationStatus = null,Object? verificationRequestedAtUtc = freezed,Object? rooms = null,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,slug: null == slug ? _self.slug : slug // ignore: cast_nullable_to_non_nullable
as String,description: null == description ? _self.description : description // ignore: cast_nullable_to_non_nullable
as String,venueType: null == venueType ? _self.venueType : venueType // ignore: cast_nullable_to_non_nullable
as String,addressLine: null == addressLine ? _self.addressLine : addressLine // ignore: cast_nullable_to_non_nullable
as String,suburb: null == suburb ? _self.suburb : suburb // ignore: cast_nullable_to_non_nullable
as String,postcode: null == postcode ? _self.postcode : postcode // ignore: cast_nullable_to_non_nullable
as String,contactEmail: freezed == contactEmail ? _self.contactEmail : contactEmail // ignore: cast_nullable_to_non_nullable
as String?,parkingInfo: null == parkingInfo ? _self.parkingInfo : parkingInfo // ignore: cast_nullable_to_non_nullable
as String,transitInfo: null == transitInfo ? _self.transitInfo : transitInfo // ignore: cast_nullable_to_non_nullable
as String,latitude: null == latitude ? _self.latitude : latitude // ignore: cast_nullable_to_non_nullable
as double,longitude: null == longitude ? _self.longitude : longitude // ignore: cast_nullable_to_non_nullable
as double,timezone: null == timezone ? _self.timezone : timezone // ignore: cast_nullable_to_non_nullable
as String,isIdentityVerified: null == isIdentityVerified ? _self.isIdentityVerified : isIdentityVerified // ignore: cast_nullable_to_non_nullable
as bool,verificationStatus: null == verificationStatus ? _self.verificationStatus : verificationStatus // ignore: cast_nullable_to_non_nullable
as String,verificationRequestedAtUtc: freezed == verificationRequestedAtUtc ? _self.verificationRequestedAtUtc : verificationRequestedAtUtc // ignore: cast_nullable_to_non_nullable
as DateTime?,rooms: null == rooms ? _self.rooms : rooms // ignore: cast_nullable_to_non_nullable
as List<ManagedRoomSummary>,
  ));
}

}


/// Adds pattern-matching-related methods to [ManagedVenueDetail].
extension ManagedVenueDetailPatterns on ManagedVenueDetail {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ManagedVenueDetail value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ManagedVenueDetail() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ManagedVenueDetail value)  $default,){
final _that = this;
switch (_that) {
case _ManagedVenueDetail():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ManagedVenueDetail value)?  $default,){
final _that = this;
switch (_that) {
case _ManagedVenueDetail() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String name,  String slug,  String description,  String venueType,  String addressLine,  String suburb,  String postcode,  String? contactEmail,  String parkingInfo,  String transitInfo,  double latitude,  double longitude,  String timezone,  bool isIdentityVerified,  String verificationStatus,  DateTime? verificationRequestedAtUtc,  List<ManagedRoomSummary> rooms)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ManagedVenueDetail() when $default != null:
return $default(_that.id,_that.name,_that.slug,_that.description,_that.venueType,_that.addressLine,_that.suburb,_that.postcode,_that.contactEmail,_that.parkingInfo,_that.transitInfo,_that.latitude,_that.longitude,_that.timezone,_that.isIdentityVerified,_that.verificationStatus,_that.verificationRequestedAtUtc,_that.rooms);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String name,  String slug,  String description,  String venueType,  String addressLine,  String suburb,  String postcode,  String? contactEmail,  String parkingInfo,  String transitInfo,  double latitude,  double longitude,  String timezone,  bool isIdentityVerified,  String verificationStatus,  DateTime? verificationRequestedAtUtc,  List<ManagedRoomSummary> rooms)  $default,) {final _that = this;
switch (_that) {
case _ManagedVenueDetail():
return $default(_that.id,_that.name,_that.slug,_that.description,_that.venueType,_that.addressLine,_that.suburb,_that.postcode,_that.contactEmail,_that.parkingInfo,_that.transitInfo,_that.latitude,_that.longitude,_that.timezone,_that.isIdentityVerified,_that.verificationStatus,_that.verificationRequestedAtUtc,_that.rooms);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String name,  String slug,  String description,  String venueType,  String addressLine,  String suburb,  String postcode,  String? contactEmail,  String parkingInfo,  String transitInfo,  double latitude,  double longitude,  String timezone,  bool isIdentityVerified,  String verificationStatus,  DateTime? verificationRequestedAtUtc,  List<ManagedRoomSummary> rooms)?  $default,) {final _that = this;
switch (_that) {
case _ManagedVenueDetail() when $default != null:
return $default(_that.id,_that.name,_that.slug,_that.description,_that.venueType,_that.addressLine,_that.suburb,_that.postcode,_that.contactEmail,_that.parkingInfo,_that.transitInfo,_that.latitude,_that.longitude,_that.timezone,_that.isIdentityVerified,_that.verificationStatus,_that.verificationRequestedAtUtc,_that.rooms);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ManagedVenueDetail extends ManagedVenueDetail {
  const _ManagedVenueDetail({required this.id, required this.name, required this.slug, required this.description, required this.venueType, required this.addressLine, required this.suburb, required this.postcode, this.contactEmail, required this.parkingInfo, required this.transitInfo, required this.latitude, required this.longitude, required this.timezone, required this.isIdentityVerified, this.verificationStatus = 'unverified', this.verificationRequestedAtUtc, final  List<ManagedRoomSummary> rooms = const <ManagedRoomSummary>[]}): _rooms = rooms,super._();
  factory _ManagedVenueDetail.fromJson(Map<String, dynamic> json) => _$ManagedVenueDetailFromJson(json);

@override final  String id;
@override final  String name;
@override final  String slug;
@override final  String description;
/// Wire token: `church | publicSpace | other`.
@override final  String venueType;
@override final  String addressLine;
@override final  String suburb;
@override final  String postcode;
@override final  String? contactEmail;
@override final  String parkingInfo;
@override final  String transitInfo;
@override final  double latitude;
@override final  double longitude;
@override final  String timezone;
@override final  bool isIdentityVerified;
@override@JsonKey() final  String verificationStatus;
@override final  DateTime? verificationRequestedAtUtc;
 final  List<ManagedRoomSummary> _rooms;
@override@JsonKey() List<ManagedRoomSummary> get rooms {
  if (_rooms is EqualUnmodifiableListView) return _rooms;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_rooms);
}


/// Create a copy of ManagedVenueDetail
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ManagedVenueDetailCopyWith<_ManagedVenueDetail> get copyWith => __$ManagedVenueDetailCopyWithImpl<_ManagedVenueDetail>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ManagedVenueDetailToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ManagedVenueDetail&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.slug, slug) || other.slug == slug)&&(identical(other.description, description) || other.description == description)&&(identical(other.venueType, venueType) || other.venueType == venueType)&&(identical(other.addressLine, addressLine) || other.addressLine == addressLine)&&(identical(other.suburb, suburb) || other.suburb == suburb)&&(identical(other.postcode, postcode) || other.postcode == postcode)&&(identical(other.contactEmail, contactEmail) || other.contactEmail == contactEmail)&&(identical(other.parkingInfo, parkingInfo) || other.parkingInfo == parkingInfo)&&(identical(other.transitInfo, transitInfo) || other.transitInfo == transitInfo)&&(identical(other.latitude, latitude) || other.latitude == latitude)&&(identical(other.longitude, longitude) || other.longitude == longitude)&&(identical(other.timezone, timezone) || other.timezone == timezone)&&(identical(other.isIdentityVerified, isIdentityVerified) || other.isIdentityVerified == isIdentityVerified)&&(identical(other.verificationStatus, verificationStatus) || other.verificationStatus == verificationStatus)&&(identical(other.verificationRequestedAtUtc, verificationRequestedAtUtc) || other.verificationRequestedAtUtc == verificationRequestedAtUtc)&&const DeepCollectionEquality().equals(other._rooms, _rooms));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,name,slug,description,venueType,addressLine,suburb,postcode,contactEmail,parkingInfo,transitInfo,latitude,longitude,timezone,isIdentityVerified,verificationStatus,verificationRequestedAtUtc,const DeepCollectionEquality().hash(_rooms));

@override
String toString() {
  return 'ManagedVenueDetail(id: $id, name: $name, slug: $slug, description: $description, venueType: $venueType, addressLine: $addressLine, suburb: $suburb, postcode: $postcode, contactEmail: $contactEmail, parkingInfo: $parkingInfo, transitInfo: $transitInfo, latitude: $latitude, longitude: $longitude, timezone: $timezone, isIdentityVerified: $isIdentityVerified, verificationStatus: $verificationStatus, verificationRequestedAtUtc: $verificationRequestedAtUtc, rooms: $rooms)';
}


}

/// @nodoc
abstract mixin class _$ManagedVenueDetailCopyWith<$Res> implements $ManagedVenueDetailCopyWith<$Res> {
  factory _$ManagedVenueDetailCopyWith(_ManagedVenueDetail value, $Res Function(_ManagedVenueDetail) _then) = __$ManagedVenueDetailCopyWithImpl;
@override @useResult
$Res call({
 String id, String name, String slug, String description, String venueType, String addressLine, String suburb, String postcode, String? contactEmail, String parkingInfo, String transitInfo, double latitude, double longitude, String timezone, bool isIdentityVerified, String verificationStatus, DateTime? verificationRequestedAtUtc, List<ManagedRoomSummary> rooms
});




}
/// @nodoc
class __$ManagedVenueDetailCopyWithImpl<$Res>
    implements _$ManagedVenueDetailCopyWith<$Res> {
  __$ManagedVenueDetailCopyWithImpl(this._self, this._then);

  final _ManagedVenueDetail _self;
  final $Res Function(_ManagedVenueDetail) _then;

/// Create a copy of ManagedVenueDetail
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? name = null,Object? slug = null,Object? description = null,Object? venueType = null,Object? addressLine = null,Object? suburb = null,Object? postcode = null,Object? contactEmail = freezed,Object? parkingInfo = null,Object? transitInfo = null,Object? latitude = null,Object? longitude = null,Object? timezone = null,Object? isIdentityVerified = null,Object? verificationStatus = null,Object? verificationRequestedAtUtc = freezed,Object? rooms = null,}) {
  return _then(_ManagedVenueDetail(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,slug: null == slug ? _self.slug : slug // ignore: cast_nullable_to_non_nullable
as String,description: null == description ? _self.description : description // ignore: cast_nullable_to_non_nullable
as String,venueType: null == venueType ? _self.venueType : venueType // ignore: cast_nullable_to_non_nullable
as String,addressLine: null == addressLine ? _self.addressLine : addressLine // ignore: cast_nullable_to_non_nullable
as String,suburb: null == suburb ? _self.suburb : suburb // ignore: cast_nullable_to_non_nullable
as String,postcode: null == postcode ? _self.postcode : postcode // ignore: cast_nullable_to_non_nullable
as String,contactEmail: freezed == contactEmail ? _self.contactEmail : contactEmail // ignore: cast_nullable_to_non_nullable
as String?,parkingInfo: null == parkingInfo ? _self.parkingInfo : parkingInfo // ignore: cast_nullable_to_non_nullable
as String,transitInfo: null == transitInfo ? _self.transitInfo : transitInfo // ignore: cast_nullable_to_non_nullable
as String,latitude: null == latitude ? _self.latitude : latitude // ignore: cast_nullable_to_non_nullable
as double,longitude: null == longitude ? _self.longitude : longitude // ignore: cast_nullable_to_non_nullable
as double,timezone: null == timezone ? _self.timezone : timezone // ignore: cast_nullable_to_non_nullable
as String,isIdentityVerified: null == isIdentityVerified ? _self.isIdentityVerified : isIdentityVerified // ignore: cast_nullable_to_non_nullable
as bool,verificationStatus: null == verificationStatus ? _self.verificationStatus : verificationStatus // ignore: cast_nullable_to_non_nullable
as String,verificationRequestedAtUtc: freezed == verificationRequestedAtUtc ? _self.verificationRequestedAtUtc : verificationRequestedAtUtc // ignore: cast_nullable_to_non_nullable
as DateTime?,rooms: null == rooms ? _self._rooms : rooms // ignore: cast_nullable_to_non_nullable
as List<ManagedRoomSummary>,
  ));
}


}


/// @nodoc
mixin _$ManagedRoom {

 String get id; String get venueId; String get venueName; String get venueSlug; String get name; String get slug; String get description; int get capacity; double get pricePerHour; String get currency; String get houseRules;/// Wire token: `draft | published | unlisted` (additive).
 String get status; DateTime? get publishRequestedAtUtc; DateTime? get firstPublishedAtUtc; List<String> get activities; List<String> get amenities; List<String> get accessibility; List<RoomPhoto> get photos; DateTime get updatedAtUtc;
/// Create a copy of ManagedRoom
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ManagedRoomCopyWith<ManagedRoom> get copyWith => _$ManagedRoomCopyWithImpl<ManagedRoom>(this as ManagedRoom, _$identity);

  /// Serializes this ManagedRoom to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ManagedRoom&&(identical(other.id, id) || other.id == id)&&(identical(other.venueId, venueId) || other.venueId == venueId)&&(identical(other.venueName, venueName) || other.venueName == venueName)&&(identical(other.venueSlug, venueSlug) || other.venueSlug == venueSlug)&&(identical(other.name, name) || other.name == name)&&(identical(other.slug, slug) || other.slug == slug)&&(identical(other.description, description) || other.description == description)&&(identical(other.capacity, capacity) || other.capacity == capacity)&&(identical(other.pricePerHour, pricePerHour) || other.pricePerHour == pricePerHour)&&(identical(other.currency, currency) || other.currency == currency)&&(identical(other.houseRules, houseRules) || other.houseRules == houseRules)&&(identical(other.status, status) || other.status == status)&&(identical(other.publishRequestedAtUtc, publishRequestedAtUtc) || other.publishRequestedAtUtc == publishRequestedAtUtc)&&(identical(other.firstPublishedAtUtc, firstPublishedAtUtc) || other.firstPublishedAtUtc == firstPublishedAtUtc)&&const DeepCollectionEquality().equals(other.activities, activities)&&const DeepCollectionEquality().equals(other.amenities, amenities)&&const DeepCollectionEquality().equals(other.accessibility, accessibility)&&const DeepCollectionEquality().equals(other.photos, photos)&&(identical(other.updatedAtUtc, updatedAtUtc) || other.updatedAtUtc == updatedAtUtc));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hashAll([runtimeType,id,venueId,venueName,venueSlug,name,slug,description,capacity,pricePerHour,currency,houseRules,status,publishRequestedAtUtc,firstPublishedAtUtc,const DeepCollectionEquality().hash(activities),const DeepCollectionEquality().hash(amenities),const DeepCollectionEquality().hash(accessibility),const DeepCollectionEquality().hash(photos),updatedAtUtc]);

@override
String toString() {
  return 'ManagedRoom(id: $id, venueId: $venueId, venueName: $venueName, venueSlug: $venueSlug, name: $name, slug: $slug, description: $description, capacity: $capacity, pricePerHour: $pricePerHour, currency: $currency, houseRules: $houseRules, status: $status, publishRequestedAtUtc: $publishRequestedAtUtc, firstPublishedAtUtc: $firstPublishedAtUtc, activities: $activities, amenities: $amenities, accessibility: $accessibility, photos: $photos, updatedAtUtc: $updatedAtUtc)';
}


}

/// @nodoc
abstract mixin class $ManagedRoomCopyWith<$Res>  {
  factory $ManagedRoomCopyWith(ManagedRoom value, $Res Function(ManagedRoom) _then) = _$ManagedRoomCopyWithImpl;
@useResult
$Res call({
 String id, String venueId, String venueName, String venueSlug, String name, String slug, String description, int capacity, double pricePerHour, String currency, String houseRules, String status, DateTime? publishRequestedAtUtc, DateTime? firstPublishedAtUtc, List<String> activities, List<String> amenities, List<String> accessibility, List<RoomPhoto> photos, DateTime updatedAtUtc
});




}
/// @nodoc
class _$ManagedRoomCopyWithImpl<$Res>
    implements $ManagedRoomCopyWith<$Res> {
  _$ManagedRoomCopyWithImpl(this._self, this._then);

  final ManagedRoom _self;
  final $Res Function(ManagedRoom) _then;

/// Create a copy of ManagedRoom
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? venueId = null,Object? venueName = null,Object? venueSlug = null,Object? name = null,Object? slug = null,Object? description = null,Object? capacity = null,Object? pricePerHour = null,Object? currency = null,Object? houseRules = null,Object? status = null,Object? publishRequestedAtUtc = freezed,Object? firstPublishedAtUtc = freezed,Object? activities = null,Object? amenities = null,Object? accessibility = null,Object? photos = null,Object? updatedAtUtc = null,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,venueId: null == venueId ? _self.venueId : venueId // ignore: cast_nullable_to_non_nullable
as String,venueName: null == venueName ? _self.venueName : venueName // ignore: cast_nullable_to_non_nullable
as String,venueSlug: null == venueSlug ? _self.venueSlug : venueSlug // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,slug: null == slug ? _self.slug : slug // ignore: cast_nullable_to_non_nullable
as String,description: null == description ? _self.description : description // ignore: cast_nullable_to_non_nullable
as String,capacity: null == capacity ? _self.capacity : capacity // ignore: cast_nullable_to_non_nullable
as int,pricePerHour: null == pricePerHour ? _self.pricePerHour : pricePerHour // ignore: cast_nullable_to_non_nullable
as double,currency: null == currency ? _self.currency : currency // ignore: cast_nullable_to_non_nullable
as String,houseRules: null == houseRules ? _self.houseRules : houseRules // ignore: cast_nullable_to_non_nullable
as String,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,publishRequestedAtUtc: freezed == publishRequestedAtUtc ? _self.publishRequestedAtUtc : publishRequestedAtUtc // ignore: cast_nullable_to_non_nullable
as DateTime?,firstPublishedAtUtc: freezed == firstPublishedAtUtc ? _self.firstPublishedAtUtc : firstPublishedAtUtc // ignore: cast_nullable_to_non_nullable
as DateTime?,activities: null == activities ? _self.activities : activities // ignore: cast_nullable_to_non_nullable
as List<String>,amenities: null == amenities ? _self.amenities : amenities // ignore: cast_nullable_to_non_nullable
as List<String>,accessibility: null == accessibility ? _self.accessibility : accessibility // ignore: cast_nullable_to_non_nullable
as List<String>,photos: null == photos ? _self.photos : photos // ignore: cast_nullable_to_non_nullable
as List<RoomPhoto>,updatedAtUtc: null == updatedAtUtc ? _self.updatedAtUtc : updatedAtUtc // ignore: cast_nullable_to_non_nullable
as DateTime,
  ));
}

}


/// Adds pattern-matching-related methods to [ManagedRoom].
extension ManagedRoomPatterns on ManagedRoom {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ManagedRoom value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ManagedRoom() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ManagedRoom value)  $default,){
final _that = this;
switch (_that) {
case _ManagedRoom():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ManagedRoom value)?  $default,){
final _that = this;
switch (_that) {
case _ManagedRoom() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String venueId,  String venueName,  String venueSlug,  String name,  String slug,  String description,  int capacity,  double pricePerHour,  String currency,  String houseRules,  String status,  DateTime? publishRequestedAtUtc,  DateTime? firstPublishedAtUtc,  List<String> activities,  List<String> amenities,  List<String> accessibility,  List<RoomPhoto> photos,  DateTime updatedAtUtc)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ManagedRoom() when $default != null:
return $default(_that.id,_that.venueId,_that.venueName,_that.venueSlug,_that.name,_that.slug,_that.description,_that.capacity,_that.pricePerHour,_that.currency,_that.houseRules,_that.status,_that.publishRequestedAtUtc,_that.firstPublishedAtUtc,_that.activities,_that.amenities,_that.accessibility,_that.photos,_that.updatedAtUtc);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String venueId,  String venueName,  String venueSlug,  String name,  String slug,  String description,  int capacity,  double pricePerHour,  String currency,  String houseRules,  String status,  DateTime? publishRequestedAtUtc,  DateTime? firstPublishedAtUtc,  List<String> activities,  List<String> amenities,  List<String> accessibility,  List<RoomPhoto> photos,  DateTime updatedAtUtc)  $default,) {final _that = this;
switch (_that) {
case _ManagedRoom():
return $default(_that.id,_that.venueId,_that.venueName,_that.venueSlug,_that.name,_that.slug,_that.description,_that.capacity,_that.pricePerHour,_that.currency,_that.houseRules,_that.status,_that.publishRequestedAtUtc,_that.firstPublishedAtUtc,_that.activities,_that.amenities,_that.accessibility,_that.photos,_that.updatedAtUtc);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String venueId,  String venueName,  String venueSlug,  String name,  String slug,  String description,  int capacity,  double pricePerHour,  String currency,  String houseRules,  String status,  DateTime? publishRequestedAtUtc,  DateTime? firstPublishedAtUtc,  List<String> activities,  List<String> amenities,  List<String> accessibility,  List<RoomPhoto> photos,  DateTime updatedAtUtc)?  $default,) {final _that = this;
switch (_that) {
case _ManagedRoom() when $default != null:
return $default(_that.id,_that.venueId,_that.venueName,_that.venueSlug,_that.name,_that.slug,_that.description,_that.capacity,_that.pricePerHour,_that.currency,_that.houseRules,_that.status,_that.publishRequestedAtUtc,_that.firstPublishedAtUtc,_that.activities,_that.amenities,_that.accessibility,_that.photos,_that.updatedAtUtc);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ManagedRoom extends ManagedRoom {
  const _ManagedRoom({required this.id, required this.venueId, required this.venueName, required this.venueSlug, required this.name, required this.slug, required this.description, required this.capacity, required this.pricePerHour, required this.currency, required this.houseRules, required this.status, this.publishRequestedAtUtc, this.firstPublishedAtUtc, final  List<String> activities = const <String>[], final  List<String> amenities = const <String>[], final  List<String> accessibility = const <String>[], final  List<RoomPhoto> photos = const <RoomPhoto>[], required this.updatedAtUtc}): _activities = activities,_amenities = amenities,_accessibility = accessibility,_photos = photos,super._();
  factory _ManagedRoom.fromJson(Map<String, dynamic> json) => _$ManagedRoomFromJson(json);

@override final  String id;
@override final  String venueId;
@override final  String venueName;
@override final  String venueSlug;
@override final  String name;
@override final  String slug;
@override final  String description;
@override final  int capacity;
@override final  double pricePerHour;
@override final  String currency;
@override final  String houseRules;
/// Wire token: `draft | published | unlisted` (additive).
@override final  String status;
@override final  DateTime? publishRequestedAtUtc;
@override final  DateTime? firstPublishedAtUtc;
 final  List<String> _activities;
@override@JsonKey() List<String> get activities {
  if (_activities is EqualUnmodifiableListView) return _activities;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_activities);
}

 final  List<String> _amenities;
@override@JsonKey() List<String> get amenities {
  if (_amenities is EqualUnmodifiableListView) return _amenities;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_amenities);
}

 final  List<String> _accessibility;
@override@JsonKey() List<String> get accessibility {
  if (_accessibility is EqualUnmodifiableListView) return _accessibility;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_accessibility);
}

 final  List<RoomPhoto> _photos;
@override@JsonKey() List<RoomPhoto> get photos {
  if (_photos is EqualUnmodifiableListView) return _photos;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_photos);
}

@override final  DateTime updatedAtUtc;

/// Create a copy of ManagedRoom
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ManagedRoomCopyWith<_ManagedRoom> get copyWith => __$ManagedRoomCopyWithImpl<_ManagedRoom>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ManagedRoomToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ManagedRoom&&(identical(other.id, id) || other.id == id)&&(identical(other.venueId, venueId) || other.venueId == venueId)&&(identical(other.venueName, venueName) || other.venueName == venueName)&&(identical(other.venueSlug, venueSlug) || other.venueSlug == venueSlug)&&(identical(other.name, name) || other.name == name)&&(identical(other.slug, slug) || other.slug == slug)&&(identical(other.description, description) || other.description == description)&&(identical(other.capacity, capacity) || other.capacity == capacity)&&(identical(other.pricePerHour, pricePerHour) || other.pricePerHour == pricePerHour)&&(identical(other.currency, currency) || other.currency == currency)&&(identical(other.houseRules, houseRules) || other.houseRules == houseRules)&&(identical(other.status, status) || other.status == status)&&(identical(other.publishRequestedAtUtc, publishRequestedAtUtc) || other.publishRequestedAtUtc == publishRequestedAtUtc)&&(identical(other.firstPublishedAtUtc, firstPublishedAtUtc) || other.firstPublishedAtUtc == firstPublishedAtUtc)&&const DeepCollectionEquality().equals(other._activities, _activities)&&const DeepCollectionEquality().equals(other._amenities, _amenities)&&const DeepCollectionEquality().equals(other._accessibility, _accessibility)&&const DeepCollectionEquality().equals(other._photos, _photos)&&(identical(other.updatedAtUtc, updatedAtUtc) || other.updatedAtUtc == updatedAtUtc));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hashAll([runtimeType,id,venueId,venueName,venueSlug,name,slug,description,capacity,pricePerHour,currency,houseRules,status,publishRequestedAtUtc,firstPublishedAtUtc,const DeepCollectionEquality().hash(_activities),const DeepCollectionEquality().hash(_amenities),const DeepCollectionEquality().hash(_accessibility),const DeepCollectionEquality().hash(_photos),updatedAtUtc]);

@override
String toString() {
  return 'ManagedRoom(id: $id, venueId: $venueId, venueName: $venueName, venueSlug: $venueSlug, name: $name, slug: $slug, description: $description, capacity: $capacity, pricePerHour: $pricePerHour, currency: $currency, houseRules: $houseRules, status: $status, publishRequestedAtUtc: $publishRequestedAtUtc, firstPublishedAtUtc: $firstPublishedAtUtc, activities: $activities, amenities: $amenities, accessibility: $accessibility, photos: $photos, updatedAtUtc: $updatedAtUtc)';
}


}

/// @nodoc
abstract mixin class _$ManagedRoomCopyWith<$Res> implements $ManagedRoomCopyWith<$Res> {
  factory _$ManagedRoomCopyWith(_ManagedRoom value, $Res Function(_ManagedRoom) _then) = __$ManagedRoomCopyWithImpl;
@override @useResult
$Res call({
 String id, String venueId, String venueName, String venueSlug, String name, String slug, String description, int capacity, double pricePerHour, String currency, String houseRules, String status, DateTime? publishRequestedAtUtc, DateTime? firstPublishedAtUtc, List<String> activities, List<String> amenities, List<String> accessibility, List<RoomPhoto> photos, DateTime updatedAtUtc
});




}
/// @nodoc
class __$ManagedRoomCopyWithImpl<$Res>
    implements _$ManagedRoomCopyWith<$Res> {
  __$ManagedRoomCopyWithImpl(this._self, this._then);

  final _ManagedRoom _self;
  final $Res Function(_ManagedRoom) _then;

/// Create a copy of ManagedRoom
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? venueId = null,Object? venueName = null,Object? venueSlug = null,Object? name = null,Object? slug = null,Object? description = null,Object? capacity = null,Object? pricePerHour = null,Object? currency = null,Object? houseRules = null,Object? status = null,Object? publishRequestedAtUtc = freezed,Object? firstPublishedAtUtc = freezed,Object? activities = null,Object? amenities = null,Object? accessibility = null,Object? photos = null,Object? updatedAtUtc = null,}) {
  return _then(_ManagedRoom(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,venueId: null == venueId ? _self.venueId : venueId // ignore: cast_nullable_to_non_nullable
as String,venueName: null == venueName ? _self.venueName : venueName // ignore: cast_nullable_to_non_nullable
as String,venueSlug: null == venueSlug ? _self.venueSlug : venueSlug // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,slug: null == slug ? _self.slug : slug // ignore: cast_nullable_to_non_nullable
as String,description: null == description ? _self.description : description // ignore: cast_nullable_to_non_nullable
as String,capacity: null == capacity ? _self.capacity : capacity // ignore: cast_nullable_to_non_nullable
as int,pricePerHour: null == pricePerHour ? _self.pricePerHour : pricePerHour // ignore: cast_nullable_to_non_nullable
as double,currency: null == currency ? _self.currency : currency // ignore: cast_nullable_to_non_nullable
as String,houseRules: null == houseRules ? _self.houseRules : houseRules // ignore: cast_nullable_to_non_nullable
as String,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,publishRequestedAtUtc: freezed == publishRequestedAtUtc ? _self.publishRequestedAtUtc : publishRequestedAtUtc // ignore: cast_nullable_to_non_nullable
as DateTime?,firstPublishedAtUtc: freezed == firstPublishedAtUtc ? _self.firstPublishedAtUtc : firstPublishedAtUtc // ignore: cast_nullable_to_non_nullable
as DateTime?,activities: null == activities ? _self._activities : activities // ignore: cast_nullable_to_non_nullable
as List<String>,amenities: null == amenities ? _self._amenities : amenities // ignore: cast_nullable_to_non_nullable
as List<String>,accessibility: null == accessibility ? _self._accessibility : accessibility // ignore: cast_nullable_to_non_nullable
as List<String>,photos: null == photos ? _self._photos : photos // ignore: cast_nullable_to_non_nullable
as List<RoomPhoto>,updatedAtUtc: null == updatedAtUtc ? _self.updatedAtUtc : updatedAtUtc // ignore: cast_nullable_to_non_nullable
as DateTime,
  ));
}


}

// dart format on
