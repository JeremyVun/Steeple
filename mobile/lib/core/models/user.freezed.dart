// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'user.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$UserProfile {

 String get id; String get displayName; String? get email; DateTime get createdAtUtc;
/// Create a copy of UserProfile
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$UserProfileCopyWith<UserProfile> get copyWith => _$UserProfileCopyWithImpl<UserProfile>(this as UserProfile, _$identity);

  /// Serializes this UserProfile to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is UserProfile&&(identical(other.id, id) || other.id == id)&&(identical(other.displayName, displayName) || other.displayName == displayName)&&(identical(other.email, email) || other.email == email)&&(identical(other.createdAtUtc, createdAtUtc) || other.createdAtUtc == createdAtUtc));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,displayName,email,createdAtUtc);

@override
String toString() {
  return 'UserProfile(id: $id, displayName: $displayName, email: $email, createdAtUtc: $createdAtUtc)';
}


}

/// @nodoc
abstract mixin class $UserProfileCopyWith<$Res>  {
  factory $UserProfileCopyWith(UserProfile value, $Res Function(UserProfile) _then) = _$UserProfileCopyWithImpl;
@useResult
$Res call({
 String id, String displayName, String? email, DateTime createdAtUtc
});




}
/// @nodoc
class _$UserProfileCopyWithImpl<$Res>
    implements $UserProfileCopyWith<$Res> {
  _$UserProfileCopyWithImpl(this._self, this._then);

  final UserProfile _self;
  final $Res Function(UserProfile) _then;

/// Create a copy of UserProfile
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? displayName = null,Object? email = freezed,Object? createdAtUtc = null,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,displayName: null == displayName ? _self.displayName : displayName // ignore: cast_nullable_to_non_nullable
as String,email: freezed == email ? _self.email : email // ignore: cast_nullable_to_non_nullable
as String?,createdAtUtc: null == createdAtUtc ? _self.createdAtUtc : createdAtUtc // ignore: cast_nullable_to_non_nullable
as DateTime,
  ));
}

}


/// Adds pattern-matching-related methods to [UserProfile].
extension UserProfilePatterns on UserProfile {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _UserProfile value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _UserProfile() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _UserProfile value)  $default,){
final _that = this;
switch (_that) {
case _UserProfile():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _UserProfile value)?  $default,){
final _that = this;
switch (_that) {
case _UserProfile() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String displayName,  String? email,  DateTime createdAtUtc)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _UserProfile() when $default != null:
return $default(_that.id,_that.displayName,_that.email,_that.createdAtUtc);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String displayName,  String? email,  DateTime createdAtUtc)  $default,) {final _that = this;
switch (_that) {
case _UserProfile():
return $default(_that.id,_that.displayName,_that.email,_that.createdAtUtc);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String displayName,  String? email,  DateTime createdAtUtc)?  $default,) {final _that = this;
switch (_that) {
case _UserProfile() when $default != null:
return $default(_that.id,_that.displayName,_that.email,_that.createdAtUtc);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _UserProfile implements UserProfile {
  const _UserProfile({required this.id, required this.displayName, this.email, required this.createdAtUtc});
  factory _UserProfile.fromJson(Map<String, dynamic> json) => _$UserProfileFromJson(json);

@override final  String id;
@override final  String displayName;
@override final  String? email;
@override final  DateTime createdAtUtc;

/// Create a copy of UserProfile
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$UserProfileCopyWith<_UserProfile> get copyWith => __$UserProfileCopyWithImpl<_UserProfile>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$UserProfileToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _UserProfile&&(identical(other.id, id) || other.id == id)&&(identical(other.displayName, displayName) || other.displayName == displayName)&&(identical(other.email, email) || other.email == email)&&(identical(other.createdAtUtc, createdAtUtc) || other.createdAtUtc == createdAtUtc));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,displayName,email,createdAtUtc);

@override
String toString() {
  return 'UserProfile(id: $id, displayName: $displayName, email: $email, createdAtUtc: $createdAtUtc)';
}


}

/// @nodoc
abstract mixin class _$UserProfileCopyWith<$Res> implements $UserProfileCopyWith<$Res> {
  factory _$UserProfileCopyWith(_UserProfile value, $Res Function(_UserProfile) _then) = __$UserProfileCopyWithImpl;
@override @useResult
$Res call({
 String id, String displayName, String? email, DateTime createdAtUtc
});




}
/// @nodoc
class __$UserProfileCopyWithImpl<$Res>
    implements _$UserProfileCopyWith<$Res> {
  __$UserProfileCopyWithImpl(this._self, this._then);

  final _UserProfile _self;
  final $Res Function(_UserProfile) _then;

/// Create a copy of UserProfile
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? displayName = null,Object? email = freezed,Object? createdAtUtc = null,}) {
  return _then(_UserProfile(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,displayName: null == displayName ? _self.displayName : displayName // ignore: cast_nullable_to_non_nullable
as String,email: freezed == email ? _self.email : email // ignore: cast_nullable_to_non_nullable
as String?,createdAtUtc: null == createdAtUtc ? _self.createdAtUtc : createdAtUtc // ignore: cast_nullable_to_non_nullable
as DateTime,
  ));
}


}


/// @nodoc
mixin _$Agreement {

 String get docType; String get version; DateTime get acceptedAtUtc;
/// Create a copy of Agreement
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$AgreementCopyWith<Agreement> get copyWith => _$AgreementCopyWithImpl<Agreement>(this as Agreement, _$identity);

  /// Serializes this Agreement to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Agreement&&(identical(other.docType, docType) || other.docType == docType)&&(identical(other.version, version) || other.version == version)&&(identical(other.acceptedAtUtc, acceptedAtUtc) || other.acceptedAtUtc == acceptedAtUtc));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,docType,version,acceptedAtUtc);

@override
String toString() {
  return 'Agreement(docType: $docType, version: $version, acceptedAtUtc: $acceptedAtUtc)';
}


}

/// @nodoc
abstract mixin class $AgreementCopyWith<$Res>  {
  factory $AgreementCopyWith(Agreement value, $Res Function(Agreement) _then) = _$AgreementCopyWithImpl;
@useResult
$Res call({
 String docType, String version, DateTime acceptedAtUtc
});




}
/// @nodoc
class _$AgreementCopyWithImpl<$Res>
    implements $AgreementCopyWith<$Res> {
  _$AgreementCopyWithImpl(this._self, this._then);

  final Agreement _self;
  final $Res Function(Agreement) _then;

/// Create a copy of Agreement
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? docType = null,Object? version = null,Object? acceptedAtUtc = null,}) {
  return _then(_self.copyWith(
docType: null == docType ? _self.docType : docType // ignore: cast_nullable_to_non_nullable
as String,version: null == version ? _self.version : version // ignore: cast_nullable_to_non_nullable
as String,acceptedAtUtc: null == acceptedAtUtc ? _self.acceptedAtUtc : acceptedAtUtc // ignore: cast_nullable_to_non_nullable
as DateTime,
  ));
}

}


/// Adds pattern-matching-related methods to [Agreement].
extension AgreementPatterns on Agreement {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Agreement value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Agreement() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Agreement value)  $default,){
final _that = this;
switch (_that) {
case _Agreement():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Agreement value)?  $default,){
final _that = this;
switch (_that) {
case _Agreement() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String docType,  String version,  DateTime acceptedAtUtc)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Agreement() when $default != null:
return $default(_that.docType,_that.version,_that.acceptedAtUtc);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String docType,  String version,  DateTime acceptedAtUtc)  $default,) {final _that = this;
switch (_that) {
case _Agreement():
return $default(_that.docType,_that.version,_that.acceptedAtUtc);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String docType,  String version,  DateTime acceptedAtUtc)?  $default,) {final _that = this;
switch (_that) {
case _Agreement() when $default != null:
return $default(_that.docType,_that.version,_that.acceptedAtUtc);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _Agreement implements Agreement {
  const _Agreement({required this.docType, required this.version, required this.acceptedAtUtc});
  factory _Agreement.fromJson(Map<String, dynamic> json) => _$AgreementFromJson(json);

@override final  String docType;
@override final  String version;
@override final  DateTime acceptedAtUtc;

/// Create a copy of Agreement
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$AgreementCopyWith<_Agreement> get copyWith => __$AgreementCopyWithImpl<_Agreement>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$AgreementToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _Agreement&&(identical(other.docType, docType) || other.docType == docType)&&(identical(other.version, version) || other.version == version)&&(identical(other.acceptedAtUtc, acceptedAtUtc) || other.acceptedAtUtc == acceptedAtUtc));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,docType,version,acceptedAtUtc);

@override
String toString() {
  return 'Agreement(docType: $docType, version: $version, acceptedAtUtc: $acceptedAtUtc)';
}


}

/// @nodoc
abstract mixin class _$AgreementCopyWith<$Res> implements $AgreementCopyWith<$Res> {
  factory _$AgreementCopyWith(_Agreement value, $Res Function(_Agreement) _then) = __$AgreementCopyWithImpl;
@override @useResult
$Res call({
 String docType, String version, DateTime acceptedAtUtc
});




}
/// @nodoc
class __$AgreementCopyWithImpl<$Res>
    implements _$AgreementCopyWith<$Res> {
  __$AgreementCopyWithImpl(this._self, this._then);

  final _Agreement _self;
  final $Res Function(_Agreement) _then;

/// Create a copy of Agreement
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? docType = null,Object? version = null,Object? acceptedAtUtc = null,}) {
  return _then(_Agreement(
docType: null == docType ? _self.docType : docType // ignore: cast_nullable_to_non_nullable
as String,version: null == version ? _self.version : version // ignore: cast_nullable_to_non_nullable
as String,acceptedAtUtc: null == acceptedAtUtc ? _self.acceptedAtUtc : acceptedAtUtc // ignore: cast_nullable_to_non_nullable
as DateTime,
  ));
}


}


/// @nodoc
mixin _$MeResponse {

 String get id; String get displayName; String? get email; DateTime get createdAtUtc; List<Agreement> get agreements;
/// Create a copy of MeResponse
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$MeResponseCopyWith<MeResponse> get copyWith => _$MeResponseCopyWithImpl<MeResponse>(this as MeResponse, _$identity);

  /// Serializes this MeResponse to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is MeResponse&&(identical(other.id, id) || other.id == id)&&(identical(other.displayName, displayName) || other.displayName == displayName)&&(identical(other.email, email) || other.email == email)&&(identical(other.createdAtUtc, createdAtUtc) || other.createdAtUtc == createdAtUtc)&&const DeepCollectionEquality().equals(other.agreements, agreements));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,displayName,email,createdAtUtc,const DeepCollectionEquality().hash(agreements));

@override
String toString() {
  return 'MeResponse(id: $id, displayName: $displayName, email: $email, createdAtUtc: $createdAtUtc, agreements: $agreements)';
}


}

/// @nodoc
abstract mixin class $MeResponseCopyWith<$Res>  {
  factory $MeResponseCopyWith(MeResponse value, $Res Function(MeResponse) _then) = _$MeResponseCopyWithImpl;
@useResult
$Res call({
 String id, String displayName, String? email, DateTime createdAtUtc, List<Agreement> agreements
});




}
/// @nodoc
class _$MeResponseCopyWithImpl<$Res>
    implements $MeResponseCopyWith<$Res> {
  _$MeResponseCopyWithImpl(this._self, this._then);

  final MeResponse _self;
  final $Res Function(MeResponse) _then;

/// Create a copy of MeResponse
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? displayName = null,Object? email = freezed,Object? createdAtUtc = null,Object? agreements = null,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,displayName: null == displayName ? _self.displayName : displayName // ignore: cast_nullable_to_non_nullable
as String,email: freezed == email ? _self.email : email // ignore: cast_nullable_to_non_nullable
as String?,createdAtUtc: null == createdAtUtc ? _self.createdAtUtc : createdAtUtc // ignore: cast_nullable_to_non_nullable
as DateTime,agreements: null == agreements ? _self.agreements : agreements // ignore: cast_nullable_to_non_nullable
as List<Agreement>,
  ));
}

}


/// Adds pattern-matching-related methods to [MeResponse].
extension MeResponsePatterns on MeResponse {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _MeResponse value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _MeResponse() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _MeResponse value)  $default,){
final _that = this;
switch (_that) {
case _MeResponse():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _MeResponse value)?  $default,){
final _that = this;
switch (_that) {
case _MeResponse() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String displayName,  String? email,  DateTime createdAtUtc,  List<Agreement> agreements)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _MeResponse() when $default != null:
return $default(_that.id,_that.displayName,_that.email,_that.createdAtUtc,_that.agreements);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String displayName,  String? email,  DateTime createdAtUtc,  List<Agreement> agreements)  $default,) {final _that = this;
switch (_that) {
case _MeResponse():
return $default(_that.id,_that.displayName,_that.email,_that.createdAtUtc,_that.agreements);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String displayName,  String? email,  DateTime createdAtUtc,  List<Agreement> agreements)?  $default,) {final _that = this;
switch (_that) {
case _MeResponse() when $default != null:
return $default(_that.id,_that.displayName,_that.email,_that.createdAtUtc,_that.agreements);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _MeResponse implements MeResponse {
  const _MeResponse({required this.id, required this.displayName, this.email, required this.createdAtUtc, final  List<Agreement> agreements = const <Agreement>[]}): _agreements = agreements;
  factory _MeResponse.fromJson(Map<String, dynamic> json) => _$MeResponseFromJson(json);

@override final  String id;
@override final  String displayName;
@override final  String? email;
@override final  DateTime createdAtUtc;
 final  List<Agreement> _agreements;
@override@JsonKey() List<Agreement> get agreements {
  if (_agreements is EqualUnmodifiableListView) return _agreements;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_agreements);
}


/// Create a copy of MeResponse
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$MeResponseCopyWith<_MeResponse> get copyWith => __$MeResponseCopyWithImpl<_MeResponse>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$MeResponseToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _MeResponse&&(identical(other.id, id) || other.id == id)&&(identical(other.displayName, displayName) || other.displayName == displayName)&&(identical(other.email, email) || other.email == email)&&(identical(other.createdAtUtc, createdAtUtc) || other.createdAtUtc == createdAtUtc)&&const DeepCollectionEquality().equals(other._agreements, _agreements));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,displayName,email,createdAtUtc,const DeepCollectionEquality().hash(_agreements));

@override
String toString() {
  return 'MeResponse(id: $id, displayName: $displayName, email: $email, createdAtUtc: $createdAtUtc, agreements: $agreements)';
}


}

/// @nodoc
abstract mixin class _$MeResponseCopyWith<$Res> implements $MeResponseCopyWith<$Res> {
  factory _$MeResponseCopyWith(_MeResponse value, $Res Function(_MeResponse) _then) = __$MeResponseCopyWithImpl;
@override @useResult
$Res call({
 String id, String displayName, String? email, DateTime createdAtUtc, List<Agreement> agreements
});




}
/// @nodoc
class __$MeResponseCopyWithImpl<$Res>
    implements _$MeResponseCopyWith<$Res> {
  __$MeResponseCopyWithImpl(this._self, this._then);

  final _MeResponse _self;
  final $Res Function(_MeResponse) _then;

/// Create a copy of MeResponse
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? displayName = null,Object? email = freezed,Object? createdAtUtc = null,Object? agreements = null,}) {
  return _then(_MeResponse(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,displayName: null == displayName ? _self.displayName : displayName // ignore: cast_nullable_to_non_nullable
as String,email: freezed == email ? _self.email : email // ignore: cast_nullable_to_non_nullable
as String?,createdAtUtc: null == createdAtUtc ? _self.createdAtUtc : createdAtUtc // ignore: cast_nullable_to_non_nullable
as DateTime,agreements: null == agreements ? _self._agreements : agreements // ignore: cast_nullable_to_non_nullable
as List<Agreement>,
  ));
}


}


/// @nodoc
mixin _$AuthSession {

 String get accessToken; String get refreshToken; UserProfile get user; bool get isNewUser;
/// Create a copy of AuthSession
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$AuthSessionCopyWith<AuthSession> get copyWith => _$AuthSessionCopyWithImpl<AuthSession>(this as AuthSession, _$identity);

  /// Serializes this AuthSession to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is AuthSession&&(identical(other.accessToken, accessToken) || other.accessToken == accessToken)&&(identical(other.refreshToken, refreshToken) || other.refreshToken == refreshToken)&&(identical(other.user, user) || other.user == user)&&(identical(other.isNewUser, isNewUser) || other.isNewUser == isNewUser));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,accessToken,refreshToken,user,isNewUser);

@override
String toString() {
  return 'AuthSession(accessToken: $accessToken, refreshToken: $refreshToken, user: $user, isNewUser: $isNewUser)';
}


}

/// @nodoc
abstract mixin class $AuthSessionCopyWith<$Res>  {
  factory $AuthSessionCopyWith(AuthSession value, $Res Function(AuthSession) _then) = _$AuthSessionCopyWithImpl;
@useResult
$Res call({
 String accessToken, String refreshToken, UserProfile user, bool isNewUser
});


$UserProfileCopyWith<$Res> get user;

}
/// @nodoc
class _$AuthSessionCopyWithImpl<$Res>
    implements $AuthSessionCopyWith<$Res> {
  _$AuthSessionCopyWithImpl(this._self, this._then);

  final AuthSession _self;
  final $Res Function(AuthSession) _then;

/// Create a copy of AuthSession
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? accessToken = null,Object? refreshToken = null,Object? user = null,Object? isNewUser = null,}) {
  return _then(_self.copyWith(
accessToken: null == accessToken ? _self.accessToken : accessToken // ignore: cast_nullable_to_non_nullable
as String,refreshToken: null == refreshToken ? _self.refreshToken : refreshToken // ignore: cast_nullable_to_non_nullable
as String,user: null == user ? _self.user : user // ignore: cast_nullable_to_non_nullable
as UserProfile,isNewUser: null == isNewUser ? _self.isNewUser : isNewUser // ignore: cast_nullable_to_non_nullable
as bool,
  ));
}
/// Create a copy of AuthSession
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$UserProfileCopyWith<$Res> get user {
  
  return $UserProfileCopyWith<$Res>(_self.user, (value) {
    return _then(_self.copyWith(user: value));
  });
}
}


/// Adds pattern-matching-related methods to [AuthSession].
extension AuthSessionPatterns on AuthSession {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _AuthSession value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _AuthSession() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _AuthSession value)  $default,){
final _that = this;
switch (_that) {
case _AuthSession():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _AuthSession value)?  $default,){
final _that = this;
switch (_that) {
case _AuthSession() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String accessToken,  String refreshToken,  UserProfile user,  bool isNewUser)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _AuthSession() when $default != null:
return $default(_that.accessToken,_that.refreshToken,_that.user,_that.isNewUser);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String accessToken,  String refreshToken,  UserProfile user,  bool isNewUser)  $default,) {final _that = this;
switch (_that) {
case _AuthSession():
return $default(_that.accessToken,_that.refreshToken,_that.user,_that.isNewUser);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String accessToken,  String refreshToken,  UserProfile user,  bool isNewUser)?  $default,) {final _that = this;
switch (_that) {
case _AuthSession() when $default != null:
return $default(_that.accessToken,_that.refreshToken,_that.user,_that.isNewUser);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _AuthSession implements AuthSession {
  const _AuthSession({required this.accessToken, required this.refreshToken, required this.user, required this.isNewUser});
  factory _AuthSession.fromJson(Map<String, dynamic> json) => _$AuthSessionFromJson(json);

@override final  String accessToken;
@override final  String refreshToken;
@override final  UserProfile user;
@override final  bool isNewUser;

/// Create a copy of AuthSession
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$AuthSessionCopyWith<_AuthSession> get copyWith => __$AuthSessionCopyWithImpl<_AuthSession>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$AuthSessionToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _AuthSession&&(identical(other.accessToken, accessToken) || other.accessToken == accessToken)&&(identical(other.refreshToken, refreshToken) || other.refreshToken == refreshToken)&&(identical(other.user, user) || other.user == user)&&(identical(other.isNewUser, isNewUser) || other.isNewUser == isNewUser));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,accessToken,refreshToken,user,isNewUser);

@override
String toString() {
  return 'AuthSession(accessToken: $accessToken, refreshToken: $refreshToken, user: $user, isNewUser: $isNewUser)';
}


}

/// @nodoc
abstract mixin class _$AuthSessionCopyWith<$Res> implements $AuthSessionCopyWith<$Res> {
  factory _$AuthSessionCopyWith(_AuthSession value, $Res Function(_AuthSession) _then) = __$AuthSessionCopyWithImpl;
@override @useResult
$Res call({
 String accessToken, String refreshToken, UserProfile user, bool isNewUser
});


@override $UserProfileCopyWith<$Res> get user;

}
/// @nodoc
class __$AuthSessionCopyWithImpl<$Res>
    implements _$AuthSessionCopyWith<$Res> {
  __$AuthSessionCopyWithImpl(this._self, this._then);

  final _AuthSession _self;
  final $Res Function(_AuthSession) _then;

/// Create a copy of AuthSession
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? accessToken = null,Object? refreshToken = null,Object? user = null,Object? isNewUser = null,}) {
  return _then(_AuthSession(
accessToken: null == accessToken ? _self.accessToken : accessToken // ignore: cast_nullable_to_non_nullable
as String,refreshToken: null == refreshToken ? _self.refreshToken : refreshToken // ignore: cast_nullable_to_non_nullable
as String,user: null == user ? _self.user : user // ignore: cast_nullable_to_non_nullable
as UserProfile,isNewUser: null == isNewUser ? _self.isNewUser : isNewUser // ignore: cast_nullable_to_non_nullable
as bool,
  ));
}

/// Create a copy of AuthSession
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$UserProfileCopyWith<$Res> get user {
  
  return $UserProfileCopyWith<$Res>(_self.user, (value) {
    return _then(_self.copyWith(user: value));
  });
}
}

// dart format on
