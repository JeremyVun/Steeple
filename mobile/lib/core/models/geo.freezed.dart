// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'geo.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$GeoPoint {

 double get latitude; double get longitude;
/// Create a copy of GeoPoint
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$GeoPointCopyWith<GeoPoint> get copyWith => _$GeoPointCopyWithImpl<GeoPoint>(this as GeoPoint, _$identity);

  /// Serializes this GeoPoint to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is GeoPoint&&(identical(other.latitude, latitude) || other.latitude == latitude)&&(identical(other.longitude, longitude) || other.longitude == longitude));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,latitude,longitude);

@override
String toString() {
  return 'GeoPoint(latitude: $latitude, longitude: $longitude)';
}


}

/// @nodoc
abstract mixin class $GeoPointCopyWith<$Res>  {
  factory $GeoPointCopyWith(GeoPoint value, $Res Function(GeoPoint) _then) = _$GeoPointCopyWithImpl;
@useResult
$Res call({
 double latitude, double longitude
});




}
/// @nodoc
class _$GeoPointCopyWithImpl<$Res>
    implements $GeoPointCopyWith<$Res> {
  _$GeoPointCopyWithImpl(this._self, this._then);

  final GeoPoint _self;
  final $Res Function(GeoPoint) _then;

/// Create a copy of GeoPoint
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? latitude = null,Object? longitude = null,}) {
  return _then(_self.copyWith(
latitude: null == latitude ? _self.latitude : latitude // ignore: cast_nullable_to_non_nullable
as double,longitude: null == longitude ? _self.longitude : longitude // ignore: cast_nullable_to_non_nullable
as double,
  ));
}

}


/// Adds pattern-matching-related methods to [GeoPoint].
extension GeoPointPatterns on GeoPoint {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _GeoPoint value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _GeoPoint() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _GeoPoint value)  $default,){
final _that = this;
switch (_that) {
case _GeoPoint():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _GeoPoint value)?  $default,){
final _that = this;
switch (_that) {
case _GeoPoint() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( double latitude,  double longitude)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _GeoPoint() when $default != null:
return $default(_that.latitude,_that.longitude);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( double latitude,  double longitude)  $default,) {final _that = this;
switch (_that) {
case _GeoPoint():
return $default(_that.latitude,_that.longitude);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( double latitude,  double longitude)?  $default,) {final _that = this;
switch (_that) {
case _GeoPoint() when $default != null:
return $default(_that.latitude,_that.longitude);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _GeoPoint implements GeoPoint {
  const _GeoPoint({required this.latitude, required this.longitude});
  factory _GeoPoint.fromJson(Map<String, dynamic> json) => _$GeoPointFromJson(json);

@override final  double latitude;
@override final  double longitude;

/// Create a copy of GeoPoint
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$GeoPointCopyWith<_GeoPoint> get copyWith => __$GeoPointCopyWithImpl<_GeoPoint>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$GeoPointToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _GeoPoint&&(identical(other.latitude, latitude) || other.latitude == latitude)&&(identical(other.longitude, longitude) || other.longitude == longitude));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,latitude,longitude);

@override
String toString() {
  return 'GeoPoint(latitude: $latitude, longitude: $longitude)';
}


}

/// @nodoc
abstract mixin class _$GeoPointCopyWith<$Res> implements $GeoPointCopyWith<$Res> {
  factory _$GeoPointCopyWith(_GeoPoint value, $Res Function(_GeoPoint) _then) = __$GeoPointCopyWithImpl;
@override @useResult
$Res call({
 double latitude, double longitude
});




}
/// @nodoc
class __$GeoPointCopyWithImpl<$Res>
    implements _$GeoPointCopyWith<$Res> {
  __$GeoPointCopyWithImpl(this._self, this._then);

  final _GeoPoint _self;
  final $Res Function(_GeoPoint) _then;

/// Create a copy of GeoPoint
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? latitude = null,Object? longitude = null,}) {
  return _then(_GeoPoint(
latitude: null == latitude ? _self.latitude : latitude // ignore: cast_nullable_to_non_nullable
as double,longitude: null == longitude ? _self.longitude : longitude // ignore: cast_nullable_to_non_nullable
as double,
  ));
}


}


/// @nodoc
mixin _$BoundingBox {

 double get minLat; double get maxLat; double get minLng; double get maxLng;
/// Create a copy of BoundingBox
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$BoundingBoxCopyWith<BoundingBox> get copyWith => _$BoundingBoxCopyWithImpl<BoundingBox>(this as BoundingBox, _$identity);

  /// Serializes this BoundingBox to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is BoundingBox&&(identical(other.minLat, minLat) || other.minLat == minLat)&&(identical(other.maxLat, maxLat) || other.maxLat == maxLat)&&(identical(other.minLng, minLng) || other.minLng == minLng)&&(identical(other.maxLng, maxLng) || other.maxLng == maxLng));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,minLat,maxLat,minLng,maxLng);

@override
String toString() {
  return 'BoundingBox(minLat: $minLat, maxLat: $maxLat, minLng: $minLng, maxLng: $maxLng)';
}


}

/// @nodoc
abstract mixin class $BoundingBoxCopyWith<$Res>  {
  factory $BoundingBoxCopyWith(BoundingBox value, $Res Function(BoundingBox) _then) = _$BoundingBoxCopyWithImpl;
@useResult
$Res call({
 double minLat, double maxLat, double minLng, double maxLng
});




}
/// @nodoc
class _$BoundingBoxCopyWithImpl<$Res>
    implements $BoundingBoxCopyWith<$Res> {
  _$BoundingBoxCopyWithImpl(this._self, this._then);

  final BoundingBox _self;
  final $Res Function(BoundingBox) _then;

/// Create a copy of BoundingBox
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? minLat = null,Object? maxLat = null,Object? minLng = null,Object? maxLng = null,}) {
  return _then(_self.copyWith(
minLat: null == minLat ? _self.minLat : minLat // ignore: cast_nullable_to_non_nullable
as double,maxLat: null == maxLat ? _self.maxLat : maxLat // ignore: cast_nullable_to_non_nullable
as double,minLng: null == minLng ? _self.minLng : minLng // ignore: cast_nullable_to_non_nullable
as double,maxLng: null == maxLng ? _self.maxLng : maxLng // ignore: cast_nullable_to_non_nullable
as double,
  ));
}

}


/// Adds pattern-matching-related methods to [BoundingBox].
extension BoundingBoxPatterns on BoundingBox {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _BoundingBox value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _BoundingBox() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _BoundingBox value)  $default,){
final _that = this;
switch (_that) {
case _BoundingBox():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _BoundingBox value)?  $default,){
final _that = this;
switch (_that) {
case _BoundingBox() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( double minLat,  double maxLat,  double minLng,  double maxLng)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _BoundingBox() when $default != null:
return $default(_that.minLat,_that.maxLat,_that.minLng,_that.maxLng);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( double minLat,  double maxLat,  double minLng,  double maxLng)  $default,) {final _that = this;
switch (_that) {
case _BoundingBox():
return $default(_that.minLat,_that.maxLat,_that.minLng,_that.maxLng);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( double minLat,  double maxLat,  double minLng,  double maxLng)?  $default,) {final _that = this;
switch (_that) {
case _BoundingBox() when $default != null:
return $default(_that.minLat,_that.maxLat,_that.minLng,_that.maxLng);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _BoundingBox implements BoundingBox {
  const _BoundingBox({required this.minLat, required this.maxLat, required this.minLng, required this.maxLng});
  factory _BoundingBox.fromJson(Map<String, dynamic> json) => _$BoundingBoxFromJson(json);

@override final  double minLat;
@override final  double maxLat;
@override final  double minLng;
@override final  double maxLng;

/// Create a copy of BoundingBox
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$BoundingBoxCopyWith<_BoundingBox> get copyWith => __$BoundingBoxCopyWithImpl<_BoundingBox>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$BoundingBoxToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _BoundingBox&&(identical(other.minLat, minLat) || other.minLat == minLat)&&(identical(other.maxLat, maxLat) || other.maxLat == maxLat)&&(identical(other.minLng, minLng) || other.minLng == minLng)&&(identical(other.maxLng, maxLng) || other.maxLng == maxLng));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,minLat,maxLat,minLng,maxLng);

@override
String toString() {
  return 'BoundingBox(minLat: $minLat, maxLat: $maxLat, minLng: $minLng, maxLng: $maxLng)';
}


}

/// @nodoc
abstract mixin class _$BoundingBoxCopyWith<$Res> implements $BoundingBoxCopyWith<$Res> {
  factory _$BoundingBoxCopyWith(_BoundingBox value, $Res Function(_BoundingBox) _then) = __$BoundingBoxCopyWithImpl;
@override @useResult
$Res call({
 double minLat, double maxLat, double minLng, double maxLng
});




}
/// @nodoc
class __$BoundingBoxCopyWithImpl<$Res>
    implements _$BoundingBoxCopyWith<$Res> {
  __$BoundingBoxCopyWithImpl(this._self, this._then);

  final _BoundingBox _self;
  final $Res Function(_BoundingBox) _then;

/// Create a copy of BoundingBox
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? minLat = null,Object? maxLat = null,Object? minLng = null,Object? maxLng = null,}) {
  return _then(_BoundingBox(
minLat: null == minLat ? _self.minLat : minLat // ignore: cast_nullable_to_non_nullable
as double,maxLat: null == maxLat ? _self.maxLat : maxLat // ignore: cast_nullable_to_non_nullable
as double,minLng: null == minLng ? _self.minLng : minLng // ignore: cast_nullable_to_non_nullable
as double,maxLng: null == maxLng ? _self.maxLng : maxLng // ignore: cast_nullable_to_non_nullable
as double,
  ));
}


}


/// @nodoc
mixin _$GeofenceContext {

 String get areaName; GeoPoint get center; BoundingBox get beachhead;
/// Create a copy of GeofenceContext
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$GeofenceContextCopyWith<GeofenceContext> get copyWith => _$GeofenceContextCopyWithImpl<GeofenceContext>(this as GeofenceContext, _$identity);

  /// Serializes this GeofenceContext to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is GeofenceContext&&(identical(other.areaName, areaName) || other.areaName == areaName)&&(identical(other.center, center) || other.center == center)&&(identical(other.beachhead, beachhead) || other.beachhead == beachhead));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,areaName,center,beachhead);

@override
String toString() {
  return 'GeofenceContext(areaName: $areaName, center: $center, beachhead: $beachhead)';
}


}

/// @nodoc
abstract mixin class $GeofenceContextCopyWith<$Res>  {
  factory $GeofenceContextCopyWith(GeofenceContext value, $Res Function(GeofenceContext) _then) = _$GeofenceContextCopyWithImpl;
@useResult
$Res call({
 String areaName, GeoPoint center, BoundingBox beachhead
});


$GeoPointCopyWith<$Res> get center;$BoundingBoxCopyWith<$Res> get beachhead;

}
/// @nodoc
class _$GeofenceContextCopyWithImpl<$Res>
    implements $GeofenceContextCopyWith<$Res> {
  _$GeofenceContextCopyWithImpl(this._self, this._then);

  final GeofenceContext _self;
  final $Res Function(GeofenceContext) _then;

/// Create a copy of GeofenceContext
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? areaName = null,Object? center = null,Object? beachhead = null,}) {
  return _then(_self.copyWith(
areaName: null == areaName ? _self.areaName : areaName // ignore: cast_nullable_to_non_nullable
as String,center: null == center ? _self.center : center // ignore: cast_nullable_to_non_nullable
as GeoPoint,beachhead: null == beachhead ? _self.beachhead : beachhead // ignore: cast_nullable_to_non_nullable
as BoundingBox,
  ));
}
/// Create a copy of GeofenceContext
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$GeoPointCopyWith<$Res> get center {
  
  return $GeoPointCopyWith<$Res>(_self.center, (value) {
    return _then(_self.copyWith(center: value));
  });
}/// Create a copy of GeofenceContext
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$BoundingBoxCopyWith<$Res> get beachhead {
  
  return $BoundingBoxCopyWith<$Res>(_self.beachhead, (value) {
    return _then(_self.copyWith(beachhead: value));
  });
}
}


/// Adds pattern-matching-related methods to [GeofenceContext].
extension GeofenceContextPatterns on GeofenceContext {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _GeofenceContext value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _GeofenceContext() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _GeofenceContext value)  $default,){
final _that = this;
switch (_that) {
case _GeofenceContext():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _GeofenceContext value)?  $default,){
final _that = this;
switch (_that) {
case _GeofenceContext() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String areaName,  GeoPoint center,  BoundingBox beachhead)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _GeofenceContext() when $default != null:
return $default(_that.areaName,_that.center,_that.beachhead);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String areaName,  GeoPoint center,  BoundingBox beachhead)  $default,) {final _that = this;
switch (_that) {
case _GeofenceContext():
return $default(_that.areaName,_that.center,_that.beachhead);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String areaName,  GeoPoint center,  BoundingBox beachhead)?  $default,) {final _that = this;
switch (_that) {
case _GeofenceContext() when $default != null:
return $default(_that.areaName,_that.center,_that.beachhead);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _GeofenceContext implements GeofenceContext {
  const _GeofenceContext({required this.areaName, required this.center, required this.beachhead});
  factory _GeofenceContext.fromJson(Map<String, dynamic> json) => _$GeofenceContextFromJson(json);

@override final  String areaName;
@override final  GeoPoint center;
@override final  BoundingBox beachhead;

/// Create a copy of GeofenceContext
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$GeofenceContextCopyWith<_GeofenceContext> get copyWith => __$GeofenceContextCopyWithImpl<_GeofenceContext>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$GeofenceContextToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _GeofenceContext&&(identical(other.areaName, areaName) || other.areaName == areaName)&&(identical(other.center, center) || other.center == center)&&(identical(other.beachhead, beachhead) || other.beachhead == beachhead));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,areaName,center,beachhead);

@override
String toString() {
  return 'GeofenceContext(areaName: $areaName, center: $center, beachhead: $beachhead)';
}


}

/// @nodoc
abstract mixin class _$GeofenceContextCopyWith<$Res> implements $GeofenceContextCopyWith<$Res> {
  factory _$GeofenceContextCopyWith(_GeofenceContext value, $Res Function(_GeofenceContext) _then) = __$GeofenceContextCopyWithImpl;
@override @useResult
$Res call({
 String areaName, GeoPoint center, BoundingBox beachhead
});


@override $GeoPointCopyWith<$Res> get center;@override $BoundingBoxCopyWith<$Res> get beachhead;

}
/// @nodoc
class __$GeofenceContextCopyWithImpl<$Res>
    implements _$GeofenceContextCopyWith<$Res> {
  __$GeofenceContextCopyWithImpl(this._self, this._then);

  final _GeofenceContext _self;
  final $Res Function(_GeofenceContext) _then;

/// Create a copy of GeofenceContext
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? areaName = null,Object? center = null,Object? beachhead = null,}) {
  return _then(_GeofenceContext(
areaName: null == areaName ? _self.areaName : areaName // ignore: cast_nullable_to_non_nullable
as String,center: null == center ? _self.center : center // ignore: cast_nullable_to_non_nullable
as GeoPoint,beachhead: null == beachhead ? _self.beachhead : beachhead // ignore: cast_nullable_to_non_nullable
as BoundingBox,
  ));
}

/// Create a copy of GeofenceContext
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$GeoPointCopyWith<$Res> get center {
  
  return $GeoPointCopyWith<$Res>(_self.center, (value) {
    return _then(_self.copyWith(center: value));
  });
}/// Create a copy of GeofenceContext
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$BoundingBoxCopyWith<$Res> get beachhead {
  
  return $BoundingBoxCopyWith<$Res>(_self.beachhead, (value) {
    return _then(_self.copyWith(beachhead: value));
  });
}
}

// dart format on
