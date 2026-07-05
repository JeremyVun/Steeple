// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'room.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$RatingSummary {

 double get averageStars; int get count;
/// Create a copy of RatingSummary
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$RatingSummaryCopyWith<RatingSummary> get copyWith => _$RatingSummaryCopyWithImpl<RatingSummary>(this as RatingSummary, _$identity);

  /// Serializes this RatingSummary to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is RatingSummary&&(identical(other.averageStars, averageStars) || other.averageStars == averageStars)&&(identical(other.count, count) || other.count == count));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,averageStars,count);

@override
String toString() {
  return 'RatingSummary(averageStars: $averageStars, count: $count)';
}


}

/// @nodoc
abstract mixin class $RatingSummaryCopyWith<$Res>  {
  factory $RatingSummaryCopyWith(RatingSummary value, $Res Function(RatingSummary) _then) = _$RatingSummaryCopyWithImpl;
@useResult
$Res call({
 double averageStars, int count
});




}
/// @nodoc
class _$RatingSummaryCopyWithImpl<$Res>
    implements $RatingSummaryCopyWith<$Res> {
  _$RatingSummaryCopyWithImpl(this._self, this._then);

  final RatingSummary _self;
  final $Res Function(RatingSummary) _then;

/// Create a copy of RatingSummary
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? averageStars = null,Object? count = null,}) {
  return _then(_self.copyWith(
averageStars: null == averageStars ? _self.averageStars : averageStars // ignore: cast_nullable_to_non_nullable
as double,count: null == count ? _self.count : count // ignore: cast_nullable_to_non_nullable
as int,
  ));
}

}


/// Adds pattern-matching-related methods to [RatingSummary].
extension RatingSummaryPatterns on RatingSummary {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _RatingSummary value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _RatingSummary() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _RatingSummary value)  $default,){
final _that = this;
switch (_that) {
case _RatingSummary():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _RatingSummary value)?  $default,){
final _that = this;
switch (_that) {
case _RatingSummary() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( double averageStars,  int count)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _RatingSummary() when $default != null:
return $default(_that.averageStars,_that.count);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( double averageStars,  int count)  $default,) {final _that = this;
switch (_that) {
case _RatingSummary():
return $default(_that.averageStars,_that.count);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( double averageStars,  int count)?  $default,) {final _that = this;
switch (_that) {
case _RatingSummary() when $default != null:
return $default(_that.averageStars,_that.count);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _RatingSummary implements RatingSummary {
  const _RatingSummary({required this.averageStars, required this.count});
  factory _RatingSummary.fromJson(Map<String, dynamic> json) => _$RatingSummaryFromJson(json);

@override final  double averageStars;
@override final  int count;

/// Create a copy of RatingSummary
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$RatingSummaryCopyWith<_RatingSummary> get copyWith => __$RatingSummaryCopyWithImpl<_RatingSummary>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$RatingSummaryToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _RatingSummary&&(identical(other.averageStars, averageStars) || other.averageStars == averageStars)&&(identical(other.count, count) || other.count == count));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,averageStars,count);

@override
String toString() {
  return 'RatingSummary(averageStars: $averageStars, count: $count)';
}


}

/// @nodoc
abstract mixin class _$RatingSummaryCopyWith<$Res> implements $RatingSummaryCopyWith<$Res> {
  factory _$RatingSummaryCopyWith(_RatingSummary value, $Res Function(_RatingSummary) _then) = __$RatingSummaryCopyWithImpl;
@override @useResult
$Res call({
 double averageStars, int count
});




}
/// @nodoc
class __$RatingSummaryCopyWithImpl<$Res>
    implements _$RatingSummaryCopyWith<$Res> {
  __$RatingSummaryCopyWithImpl(this._self, this._then);

  final _RatingSummary _self;
  final $Res Function(_RatingSummary) _then;

/// Create a copy of RatingSummary
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? averageStars = null,Object? count = null,}) {
  return _then(_RatingSummary(
averageStars: null == averageStars ? _self.averageStars : averageStars // ignore: cast_nullable_to_non_nullable
as double,count: null == count ? _self.count : count // ignore: cast_nullable_to_non_nullable
as int,
  ));
}


}


/// @nodoc
mixin _$VenueReview {

 int get stars; String? get comment; String get raterName; DateTime get createdAtUtc;
/// Create a copy of VenueReview
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$VenueReviewCopyWith<VenueReview> get copyWith => _$VenueReviewCopyWithImpl<VenueReview>(this as VenueReview, _$identity);

  /// Serializes this VenueReview to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is VenueReview&&(identical(other.stars, stars) || other.stars == stars)&&(identical(other.comment, comment) || other.comment == comment)&&(identical(other.raterName, raterName) || other.raterName == raterName)&&(identical(other.createdAtUtc, createdAtUtc) || other.createdAtUtc == createdAtUtc));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,stars,comment,raterName,createdAtUtc);

@override
String toString() {
  return 'VenueReview(stars: $stars, comment: $comment, raterName: $raterName, createdAtUtc: $createdAtUtc)';
}


}

/// @nodoc
abstract mixin class $VenueReviewCopyWith<$Res>  {
  factory $VenueReviewCopyWith(VenueReview value, $Res Function(VenueReview) _then) = _$VenueReviewCopyWithImpl;
@useResult
$Res call({
 int stars, String? comment, String raterName, DateTime createdAtUtc
});




}
/// @nodoc
class _$VenueReviewCopyWithImpl<$Res>
    implements $VenueReviewCopyWith<$Res> {
  _$VenueReviewCopyWithImpl(this._self, this._then);

  final VenueReview _self;
  final $Res Function(VenueReview) _then;

/// Create a copy of VenueReview
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? stars = null,Object? comment = freezed,Object? raterName = null,Object? createdAtUtc = null,}) {
  return _then(_self.copyWith(
stars: null == stars ? _self.stars : stars // ignore: cast_nullable_to_non_nullable
as int,comment: freezed == comment ? _self.comment : comment // ignore: cast_nullable_to_non_nullable
as String?,raterName: null == raterName ? _self.raterName : raterName // ignore: cast_nullable_to_non_nullable
as String,createdAtUtc: null == createdAtUtc ? _self.createdAtUtc : createdAtUtc // ignore: cast_nullable_to_non_nullable
as DateTime,
  ));
}

}


/// Adds pattern-matching-related methods to [VenueReview].
extension VenueReviewPatterns on VenueReview {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _VenueReview value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _VenueReview() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _VenueReview value)  $default,){
final _that = this;
switch (_that) {
case _VenueReview():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _VenueReview value)?  $default,){
final _that = this;
switch (_that) {
case _VenueReview() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( int stars,  String? comment,  String raterName,  DateTime createdAtUtc)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _VenueReview() when $default != null:
return $default(_that.stars,_that.comment,_that.raterName,_that.createdAtUtc);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( int stars,  String? comment,  String raterName,  DateTime createdAtUtc)  $default,) {final _that = this;
switch (_that) {
case _VenueReview():
return $default(_that.stars,_that.comment,_that.raterName,_that.createdAtUtc);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( int stars,  String? comment,  String raterName,  DateTime createdAtUtc)?  $default,) {final _that = this;
switch (_that) {
case _VenueReview() when $default != null:
return $default(_that.stars,_that.comment,_that.raterName,_that.createdAtUtc);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _VenueReview implements VenueReview {
  const _VenueReview({required this.stars, this.comment, required this.raterName, required this.createdAtUtc});
  factory _VenueReview.fromJson(Map<String, dynamic> json) => _$VenueReviewFromJson(json);

@override final  int stars;
@override final  String? comment;
@override final  String raterName;
@override final  DateTime createdAtUtc;

/// Create a copy of VenueReview
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$VenueReviewCopyWith<_VenueReview> get copyWith => __$VenueReviewCopyWithImpl<_VenueReview>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$VenueReviewToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _VenueReview&&(identical(other.stars, stars) || other.stars == stars)&&(identical(other.comment, comment) || other.comment == comment)&&(identical(other.raterName, raterName) || other.raterName == raterName)&&(identical(other.createdAtUtc, createdAtUtc) || other.createdAtUtc == createdAtUtc));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,stars,comment,raterName,createdAtUtc);

@override
String toString() {
  return 'VenueReview(stars: $stars, comment: $comment, raterName: $raterName, createdAtUtc: $createdAtUtc)';
}


}

/// @nodoc
abstract mixin class _$VenueReviewCopyWith<$Res> implements $VenueReviewCopyWith<$Res> {
  factory _$VenueReviewCopyWith(_VenueReview value, $Res Function(_VenueReview) _then) = __$VenueReviewCopyWithImpl;
@override @useResult
$Res call({
 int stars, String? comment, String raterName, DateTime createdAtUtc
});




}
/// @nodoc
class __$VenueReviewCopyWithImpl<$Res>
    implements _$VenueReviewCopyWith<$Res> {
  __$VenueReviewCopyWithImpl(this._self, this._then);

  final _VenueReview _self;
  final $Res Function(_VenueReview) _then;

/// Create a copy of VenueReview
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? stars = null,Object? comment = freezed,Object? raterName = null,Object? createdAtUtc = null,}) {
  return _then(_VenueReview(
stars: null == stars ? _self.stars : stars // ignore: cast_nullable_to_non_nullable
as int,comment: freezed == comment ? _self.comment : comment // ignore: cast_nullable_to_non_nullable
as String?,raterName: null == raterName ? _self.raterName : raterName // ignore: cast_nullable_to_non_nullable
as String,createdAtUtc: null == createdAtUtc ? _self.createdAtUtc : createdAtUtc // ignore: cast_nullable_to_non_nullable
as DateTime,
  ));
}


}


/// @nodoc
mixin _$VenueReviewPage {

 List<VenueReview> get items; int get totalCount; int get page; int get pageSize;
/// Create a copy of VenueReviewPage
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$VenueReviewPageCopyWith<VenueReviewPage> get copyWith => _$VenueReviewPageCopyWithImpl<VenueReviewPage>(this as VenueReviewPage, _$identity);

  /// Serializes this VenueReviewPage to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is VenueReviewPage&&const DeepCollectionEquality().equals(other.items, items)&&(identical(other.totalCount, totalCount) || other.totalCount == totalCount)&&(identical(other.page, page) || other.page == page)&&(identical(other.pageSize, pageSize) || other.pageSize == pageSize));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,const DeepCollectionEquality().hash(items),totalCount,page,pageSize);

@override
String toString() {
  return 'VenueReviewPage(items: $items, totalCount: $totalCount, page: $page, pageSize: $pageSize)';
}


}

/// @nodoc
abstract mixin class $VenueReviewPageCopyWith<$Res>  {
  factory $VenueReviewPageCopyWith(VenueReviewPage value, $Res Function(VenueReviewPage) _then) = _$VenueReviewPageCopyWithImpl;
@useResult
$Res call({
 List<VenueReview> items, int totalCount, int page, int pageSize
});




}
/// @nodoc
class _$VenueReviewPageCopyWithImpl<$Res>
    implements $VenueReviewPageCopyWith<$Res> {
  _$VenueReviewPageCopyWithImpl(this._self, this._then);

  final VenueReviewPage _self;
  final $Res Function(VenueReviewPage) _then;

/// Create a copy of VenueReviewPage
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? items = null,Object? totalCount = null,Object? page = null,Object? pageSize = null,}) {
  return _then(_self.copyWith(
items: null == items ? _self.items : items // ignore: cast_nullable_to_non_nullable
as List<VenueReview>,totalCount: null == totalCount ? _self.totalCount : totalCount // ignore: cast_nullable_to_non_nullable
as int,page: null == page ? _self.page : page // ignore: cast_nullable_to_non_nullable
as int,pageSize: null == pageSize ? _self.pageSize : pageSize // ignore: cast_nullable_to_non_nullable
as int,
  ));
}

}


/// Adds pattern-matching-related methods to [VenueReviewPage].
extension VenueReviewPagePatterns on VenueReviewPage {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _VenueReviewPage value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _VenueReviewPage() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _VenueReviewPage value)  $default,){
final _that = this;
switch (_that) {
case _VenueReviewPage():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _VenueReviewPage value)?  $default,){
final _that = this;
switch (_that) {
case _VenueReviewPage() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( List<VenueReview> items,  int totalCount,  int page,  int pageSize)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _VenueReviewPage() when $default != null:
return $default(_that.items,_that.totalCount,_that.page,_that.pageSize);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( List<VenueReview> items,  int totalCount,  int page,  int pageSize)  $default,) {final _that = this;
switch (_that) {
case _VenueReviewPage():
return $default(_that.items,_that.totalCount,_that.page,_that.pageSize);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( List<VenueReview> items,  int totalCount,  int page,  int pageSize)?  $default,) {final _that = this;
switch (_that) {
case _VenueReviewPage() when $default != null:
return $default(_that.items,_that.totalCount,_that.page,_that.pageSize);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _VenueReviewPage implements VenueReviewPage {
  const _VenueReviewPage({final  List<VenueReview> items = const <VenueReview>[], required this.totalCount, required this.page, required this.pageSize}): _items = items;
  factory _VenueReviewPage.fromJson(Map<String, dynamic> json) => _$VenueReviewPageFromJson(json);

 final  List<VenueReview> _items;
@override@JsonKey() List<VenueReview> get items {
  if (_items is EqualUnmodifiableListView) return _items;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_items);
}

@override final  int totalCount;
@override final  int page;
@override final  int pageSize;

/// Create a copy of VenueReviewPage
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$VenueReviewPageCopyWith<_VenueReviewPage> get copyWith => __$VenueReviewPageCopyWithImpl<_VenueReviewPage>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$VenueReviewPageToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _VenueReviewPage&&const DeepCollectionEquality().equals(other._items, _items)&&(identical(other.totalCount, totalCount) || other.totalCount == totalCount)&&(identical(other.page, page) || other.page == page)&&(identical(other.pageSize, pageSize) || other.pageSize == pageSize));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,const DeepCollectionEquality().hash(_items),totalCount,page,pageSize);

@override
String toString() {
  return 'VenueReviewPage(items: $items, totalCount: $totalCount, page: $page, pageSize: $pageSize)';
}


}

/// @nodoc
abstract mixin class _$VenueReviewPageCopyWith<$Res> implements $VenueReviewPageCopyWith<$Res> {
  factory _$VenueReviewPageCopyWith(_VenueReviewPage value, $Res Function(_VenueReviewPage) _then) = __$VenueReviewPageCopyWithImpl;
@override @useResult
$Res call({
 List<VenueReview> items, int totalCount, int page, int pageSize
});




}
/// @nodoc
class __$VenueReviewPageCopyWithImpl<$Res>
    implements _$VenueReviewPageCopyWith<$Res> {
  __$VenueReviewPageCopyWithImpl(this._self, this._then);

  final _VenueReviewPage _self;
  final $Res Function(_VenueReviewPage) _then;

/// Create a copy of VenueReviewPage
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? items = null,Object? totalCount = null,Object? page = null,Object? pageSize = null,}) {
  return _then(_VenueReviewPage(
items: null == items ? _self._items : items // ignore: cast_nullable_to_non_nullable
as List<VenueReview>,totalCount: null == totalCount ? _self.totalCount : totalCount // ignore: cast_nullable_to_non_nullable
as int,page: null == page ? _self.page : page // ignore: cast_nullable_to_non_nullable
as int,pageSize: null == pageSize ? _self.pageSize : pageSize // ignore: cast_nullable_to_non_nullable
as int,
  ));
}


}


/// @nodoc
mixin _$RoomSummary {

 String get roomId; String get venueId; String get roomSlug; String get venueSlug; String get venueName; String get suburb; String get roomName; String? get primaryPhotoUrl; int get capacity; bool get isFree; double? get pricePerHour; String get currency; double get latitude; double get longitude; List<String> get activities; List<String> get accessibility; double? get distanceMeters; RatingSummary? get rating;
/// Create a copy of RoomSummary
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$RoomSummaryCopyWith<RoomSummary> get copyWith => _$RoomSummaryCopyWithImpl<RoomSummary>(this as RoomSummary, _$identity);

  /// Serializes this RoomSummary to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is RoomSummary&&(identical(other.roomId, roomId) || other.roomId == roomId)&&(identical(other.venueId, venueId) || other.venueId == venueId)&&(identical(other.roomSlug, roomSlug) || other.roomSlug == roomSlug)&&(identical(other.venueSlug, venueSlug) || other.venueSlug == venueSlug)&&(identical(other.venueName, venueName) || other.venueName == venueName)&&(identical(other.suburb, suburb) || other.suburb == suburb)&&(identical(other.roomName, roomName) || other.roomName == roomName)&&(identical(other.primaryPhotoUrl, primaryPhotoUrl) || other.primaryPhotoUrl == primaryPhotoUrl)&&(identical(other.capacity, capacity) || other.capacity == capacity)&&(identical(other.isFree, isFree) || other.isFree == isFree)&&(identical(other.pricePerHour, pricePerHour) || other.pricePerHour == pricePerHour)&&(identical(other.currency, currency) || other.currency == currency)&&(identical(other.latitude, latitude) || other.latitude == latitude)&&(identical(other.longitude, longitude) || other.longitude == longitude)&&const DeepCollectionEquality().equals(other.activities, activities)&&const DeepCollectionEquality().equals(other.accessibility, accessibility)&&(identical(other.distanceMeters, distanceMeters) || other.distanceMeters == distanceMeters)&&(identical(other.rating, rating) || other.rating == rating));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,roomId,venueId,roomSlug,venueSlug,venueName,suburb,roomName,primaryPhotoUrl,capacity,isFree,pricePerHour,currency,latitude,longitude,const DeepCollectionEquality().hash(activities),const DeepCollectionEquality().hash(accessibility),distanceMeters,rating);

@override
String toString() {
  return 'RoomSummary(roomId: $roomId, venueId: $venueId, roomSlug: $roomSlug, venueSlug: $venueSlug, venueName: $venueName, suburb: $suburb, roomName: $roomName, primaryPhotoUrl: $primaryPhotoUrl, capacity: $capacity, isFree: $isFree, pricePerHour: $pricePerHour, currency: $currency, latitude: $latitude, longitude: $longitude, activities: $activities, accessibility: $accessibility, distanceMeters: $distanceMeters, rating: $rating)';
}


}

/// @nodoc
abstract mixin class $RoomSummaryCopyWith<$Res>  {
  factory $RoomSummaryCopyWith(RoomSummary value, $Res Function(RoomSummary) _then) = _$RoomSummaryCopyWithImpl;
@useResult
$Res call({
 String roomId, String venueId, String roomSlug, String venueSlug, String venueName, String suburb, String roomName, String? primaryPhotoUrl, int capacity, bool isFree, double? pricePerHour, String currency, double latitude, double longitude, List<String> activities, List<String> accessibility, double? distanceMeters, RatingSummary? rating
});


$RatingSummaryCopyWith<$Res>? get rating;

}
/// @nodoc
class _$RoomSummaryCopyWithImpl<$Res>
    implements $RoomSummaryCopyWith<$Res> {
  _$RoomSummaryCopyWithImpl(this._self, this._then);

  final RoomSummary _self;
  final $Res Function(RoomSummary) _then;

/// Create a copy of RoomSummary
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? roomId = null,Object? venueId = null,Object? roomSlug = null,Object? venueSlug = null,Object? venueName = null,Object? suburb = null,Object? roomName = null,Object? primaryPhotoUrl = freezed,Object? capacity = null,Object? isFree = null,Object? pricePerHour = freezed,Object? currency = null,Object? latitude = null,Object? longitude = null,Object? activities = null,Object? accessibility = null,Object? distanceMeters = freezed,Object? rating = freezed,}) {
  return _then(_self.copyWith(
roomId: null == roomId ? _self.roomId : roomId // ignore: cast_nullable_to_non_nullable
as String,venueId: null == venueId ? _self.venueId : venueId // ignore: cast_nullable_to_non_nullable
as String,roomSlug: null == roomSlug ? _self.roomSlug : roomSlug // ignore: cast_nullable_to_non_nullable
as String,venueSlug: null == venueSlug ? _self.venueSlug : venueSlug // ignore: cast_nullable_to_non_nullable
as String,venueName: null == venueName ? _self.venueName : venueName // ignore: cast_nullable_to_non_nullable
as String,suburb: null == suburb ? _self.suburb : suburb // ignore: cast_nullable_to_non_nullable
as String,roomName: null == roomName ? _self.roomName : roomName // ignore: cast_nullable_to_non_nullable
as String,primaryPhotoUrl: freezed == primaryPhotoUrl ? _self.primaryPhotoUrl : primaryPhotoUrl // ignore: cast_nullable_to_non_nullable
as String?,capacity: null == capacity ? _self.capacity : capacity // ignore: cast_nullable_to_non_nullable
as int,isFree: null == isFree ? _self.isFree : isFree // ignore: cast_nullable_to_non_nullable
as bool,pricePerHour: freezed == pricePerHour ? _self.pricePerHour : pricePerHour // ignore: cast_nullable_to_non_nullable
as double?,currency: null == currency ? _self.currency : currency // ignore: cast_nullable_to_non_nullable
as String,latitude: null == latitude ? _self.latitude : latitude // ignore: cast_nullable_to_non_nullable
as double,longitude: null == longitude ? _self.longitude : longitude // ignore: cast_nullable_to_non_nullable
as double,activities: null == activities ? _self.activities : activities // ignore: cast_nullable_to_non_nullable
as List<String>,accessibility: null == accessibility ? _self.accessibility : accessibility // ignore: cast_nullable_to_non_nullable
as List<String>,distanceMeters: freezed == distanceMeters ? _self.distanceMeters : distanceMeters // ignore: cast_nullable_to_non_nullable
as double?,rating: freezed == rating ? _self.rating : rating // ignore: cast_nullable_to_non_nullable
as RatingSummary?,
  ));
}
/// Create a copy of RoomSummary
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$RatingSummaryCopyWith<$Res>? get rating {
    if (_self.rating == null) {
    return null;
  }

  return $RatingSummaryCopyWith<$Res>(_self.rating!, (value) {
    return _then(_self.copyWith(rating: value));
  });
}
}


/// Adds pattern-matching-related methods to [RoomSummary].
extension RoomSummaryPatterns on RoomSummary {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _RoomSummary value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _RoomSummary() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _RoomSummary value)  $default,){
final _that = this;
switch (_that) {
case _RoomSummary():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _RoomSummary value)?  $default,){
final _that = this;
switch (_that) {
case _RoomSummary() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String roomId,  String venueId,  String roomSlug,  String venueSlug,  String venueName,  String suburb,  String roomName,  String? primaryPhotoUrl,  int capacity,  bool isFree,  double? pricePerHour,  String currency,  double latitude,  double longitude,  List<String> activities,  List<String> accessibility,  double? distanceMeters,  RatingSummary? rating)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _RoomSummary() when $default != null:
return $default(_that.roomId,_that.venueId,_that.roomSlug,_that.venueSlug,_that.venueName,_that.suburb,_that.roomName,_that.primaryPhotoUrl,_that.capacity,_that.isFree,_that.pricePerHour,_that.currency,_that.latitude,_that.longitude,_that.activities,_that.accessibility,_that.distanceMeters,_that.rating);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String roomId,  String venueId,  String roomSlug,  String venueSlug,  String venueName,  String suburb,  String roomName,  String? primaryPhotoUrl,  int capacity,  bool isFree,  double? pricePerHour,  String currency,  double latitude,  double longitude,  List<String> activities,  List<String> accessibility,  double? distanceMeters,  RatingSummary? rating)  $default,) {final _that = this;
switch (_that) {
case _RoomSummary():
return $default(_that.roomId,_that.venueId,_that.roomSlug,_that.venueSlug,_that.venueName,_that.suburb,_that.roomName,_that.primaryPhotoUrl,_that.capacity,_that.isFree,_that.pricePerHour,_that.currency,_that.latitude,_that.longitude,_that.activities,_that.accessibility,_that.distanceMeters,_that.rating);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String roomId,  String venueId,  String roomSlug,  String venueSlug,  String venueName,  String suburb,  String roomName,  String? primaryPhotoUrl,  int capacity,  bool isFree,  double? pricePerHour,  String currency,  double latitude,  double longitude,  List<String> activities,  List<String> accessibility,  double? distanceMeters,  RatingSummary? rating)?  $default,) {final _that = this;
switch (_that) {
case _RoomSummary() when $default != null:
return $default(_that.roomId,_that.venueId,_that.roomSlug,_that.venueSlug,_that.venueName,_that.suburb,_that.roomName,_that.primaryPhotoUrl,_that.capacity,_that.isFree,_that.pricePerHour,_that.currency,_that.latitude,_that.longitude,_that.activities,_that.accessibility,_that.distanceMeters,_that.rating);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _RoomSummary implements RoomSummary {
  const _RoomSummary({required this.roomId, required this.venueId, required this.roomSlug, required this.venueSlug, required this.venueName, required this.suburb, required this.roomName, this.primaryPhotoUrl, required this.capacity, required this.isFree, this.pricePerHour, required this.currency, required this.latitude, required this.longitude, final  List<String> activities = const <String>[], final  List<String> accessibility = const <String>[], this.distanceMeters, this.rating}): _activities = activities,_accessibility = accessibility;
  factory _RoomSummary.fromJson(Map<String, dynamic> json) => _$RoomSummaryFromJson(json);

@override final  String roomId;
@override final  String venueId;
@override final  String roomSlug;
@override final  String venueSlug;
@override final  String venueName;
@override final  String suburb;
@override final  String roomName;
@override final  String? primaryPhotoUrl;
@override final  int capacity;
@override final  bool isFree;
@override final  double? pricePerHour;
@override final  String currency;
@override final  double latitude;
@override final  double longitude;
 final  List<String> _activities;
@override@JsonKey() List<String> get activities {
  if (_activities is EqualUnmodifiableListView) return _activities;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_activities);
}

 final  List<String> _accessibility;
@override@JsonKey() List<String> get accessibility {
  if (_accessibility is EqualUnmodifiableListView) return _accessibility;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_accessibility);
}

@override final  double? distanceMeters;
@override final  RatingSummary? rating;

/// Create a copy of RoomSummary
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$RoomSummaryCopyWith<_RoomSummary> get copyWith => __$RoomSummaryCopyWithImpl<_RoomSummary>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$RoomSummaryToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _RoomSummary&&(identical(other.roomId, roomId) || other.roomId == roomId)&&(identical(other.venueId, venueId) || other.venueId == venueId)&&(identical(other.roomSlug, roomSlug) || other.roomSlug == roomSlug)&&(identical(other.venueSlug, venueSlug) || other.venueSlug == venueSlug)&&(identical(other.venueName, venueName) || other.venueName == venueName)&&(identical(other.suburb, suburb) || other.suburb == suburb)&&(identical(other.roomName, roomName) || other.roomName == roomName)&&(identical(other.primaryPhotoUrl, primaryPhotoUrl) || other.primaryPhotoUrl == primaryPhotoUrl)&&(identical(other.capacity, capacity) || other.capacity == capacity)&&(identical(other.isFree, isFree) || other.isFree == isFree)&&(identical(other.pricePerHour, pricePerHour) || other.pricePerHour == pricePerHour)&&(identical(other.currency, currency) || other.currency == currency)&&(identical(other.latitude, latitude) || other.latitude == latitude)&&(identical(other.longitude, longitude) || other.longitude == longitude)&&const DeepCollectionEquality().equals(other._activities, _activities)&&const DeepCollectionEquality().equals(other._accessibility, _accessibility)&&(identical(other.distanceMeters, distanceMeters) || other.distanceMeters == distanceMeters)&&(identical(other.rating, rating) || other.rating == rating));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,roomId,venueId,roomSlug,venueSlug,venueName,suburb,roomName,primaryPhotoUrl,capacity,isFree,pricePerHour,currency,latitude,longitude,const DeepCollectionEquality().hash(_activities),const DeepCollectionEquality().hash(_accessibility),distanceMeters,rating);

@override
String toString() {
  return 'RoomSummary(roomId: $roomId, venueId: $venueId, roomSlug: $roomSlug, venueSlug: $venueSlug, venueName: $venueName, suburb: $suburb, roomName: $roomName, primaryPhotoUrl: $primaryPhotoUrl, capacity: $capacity, isFree: $isFree, pricePerHour: $pricePerHour, currency: $currency, latitude: $latitude, longitude: $longitude, activities: $activities, accessibility: $accessibility, distanceMeters: $distanceMeters, rating: $rating)';
}


}

/// @nodoc
abstract mixin class _$RoomSummaryCopyWith<$Res> implements $RoomSummaryCopyWith<$Res> {
  factory _$RoomSummaryCopyWith(_RoomSummary value, $Res Function(_RoomSummary) _then) = __$RoomSummaryCopyWithImpl;
@override @useResult
$Res call({
 String roomId, String venueId, String roomSlug, String venueSlug, String venueName, String suburb, String roomName, String? primaryPhotoUrl, int capacity, bool isFree, double? pricePerHour, String currency, double latitude, double longitude, List<String> activities, List<String> accessibility, double? distanceMeters, RatingSummary? rating
});


@override $RatingSummaryCopyWith<$Res>? get rating;

}
/// @nodoc
class __$RoomSummaryCopyWithImpl<$Res>
    implements _$RoomSummaryCopyWith<$Res> {
  __$RoomSummaryCopyWithImpl(this._self, this._then);

  final _RoomSummary _self;
  final $Res Function(_RoomSummary) _then;

/// Create a copy of RoomSummary
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? roomId = null,Object? venueId = null,Object? roomSlug = null,Object? venueSlug = null,Object? venueName = null,Object? suburb = null,Object? roomName = null,Object? primaryPhotoUrl = freezed,Object? capacity = null,Object? isFree = null,Object? pricePerHour = freezed,Object? currency = null,Object? latitude = null,Object? longitude = null,Object? activities = null,Object? accessibility = null,Object? distanceMeters = freezed,Object? rating = freezed,}) {
  return _then(_RoomSummary(
roomId: null == roomId ? _self.roomId : roomId // ignore: cast_nullable_to_non_nullable
as String,venueId: null == venueId ? _self.venueId : venueId // ignore: cast_nullable_to_non_nullable
as String,roomSlug: null == roomSlug ? _self.roomSlug : roomSlug // ignore: cast_nullable_to_non_nullable
as String,venueSlug: null == venueSlug ? _self.venueSlug : venueSlug // ignore: cast_nullable_to_non_nullable
as String,venueName: null == venueName ? _self.venueName : venueName // ignore: cast_nullable_to_non_nullable
as String,suburb: null == suburb ? _self.suburb : suburb // ignore: cast_nullable_to_non_nullable
as String,roomName: null == roomName ? _self.roomName : roomName // ignore: cast_nullable_to_non_nullable
as String,primaryPhotoUrl: freezed == primaryPhotoUrl ? _self.primaryPhotoUrl : primaryPhotoUrl // ignore: cast_nullable_to_non_nullable
as String?,capacity: null == capacity ? _self.capacity : capacity // ignore: cast_nullable_to_non_nullable
as int,isFree: null == isFree ? _self.isFree : isFree // ignore: cast_nullable_to_non_nullable
as bool,pricePerHour: freezed == pricePerHour ? _self.pricePerHour : pricePerHour // ignore: cast_nullable_to_non_nullable
as double?,currency: null == currency ? _self.currency : currency // ignore: cast_nullable_to_non_nullable
as String,latitude: null == latitude ? _self.latitude : latitude // ignore: cast_nullable_to_non_nullable
as double,longitude: null == longitude ? _self.longitude : longitude // ignore: cast_nullable_to_non_nullable
as double,activities: null == activities ? _self._activities : activities // ignore: cast_nullable_to_non_nullable
as List<String>,accessibility: null == accessibility ? _self._accessibility : accessibility // ignore: cast_nullable_to_non_nullable
as List<String>,distanceMeters: freezed == distanceMeters ? _self.distanceMeters : distanceMeters // ignore: cast_nullable_to_non_nullable
as double?,rating: freezed == rating ? _self.rating : rating // ignore: cast_nullable_to_non_nullable
as RatingSummary?,
  ));
}

/// Create a copy of RoomSummary
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$RatingSummaryCopyWith<$Res>? get rating {
    if (_self.rating == null) {
    return null;
  }

  return $RatingSummaryCopyWith<$Res>(_self.rating!, (value) {
    return _then(_self.copyWith(rating: value));
  });
}
}


/// @nodoc
mixin _$RoomPhoto {

 String? get id; String get url; String? get thumbUrl; String? get cardUrl; String? get caption; bool get isPrimary; int get sortOrder;
/// Create a copy of RoomPhoto
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$RoomPhotoCopyWith<RoomPhoto> get copyWith => _$RoomPhotoCopyWithImpl<RoomPhoto>(this as RoomPhoto, _$identity);

  /// Serializes this RoomPhoto to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is RoomPhoto&&(identical(other.id, id) || other.id == id)&&(identical(other.url, url) || other.url == url)&&(identical(other.thumbUrl, thumbUrl) || other.thumbUrl == thumbUrl)&&(identical(other.cardUrl, cardUrl) || other.cardUrl == cardUrl)&&(identical(other.caption, caption) || other.caption == caption)&&(identical(other.isPrimary, isPrimary) || other.isPrimary == isPrimary)&&(identical(other.sortOrder, sortOrder) || other.sortOrder == sortOrder));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,url,thumbUrl,cardUrl,caption,isPrimary,sortOrder);

@override
String toString() {
  return 'RoomPhoto(id: $id, url: $url, thumbUrl: $thumbUrl, cardUrl: $cardUrl, caption: $caption, isPrimary: $isPrimary, sortOrder: $sortOrder)';
}


}

/// @nodoc
abstract mixin class $RoomPhotoCopyWith<$Res>  {
  factory $RoomPhotoCopyWith(RoomPhoto value, $Res Function(RoomPhoto) _then) = _$RoomPhotoCopyWithImpl;
@useResult
$Res call({
 String? id, String url, String? thumbUrl, String? cardUrl, String? caption, bool isPrimary, int sortOrder
});




}
/// @nodoc
class _$RoomPhotoCopyWithImpl<$Res>
    implements $RoomPhotoCopyWith<$Res> {
  _$RoomPhotoCopyWithImpl(this._self, this._then);

  final RoomPhoto _self;
  final $Res Function(RoomPhoto) _then;

/// Create a copy of RoomPhoto
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = freezed,Object? url = null,Object? thumbUrl = freezed,Object? cardUrl = freezed,Object? caption = freezed,Object? isPrimary = null,Object? sortOrder = null,}) {
  return _then(_self.copyWith(
id: freezed == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String?,url: null == url ? _self.url : url // ignore: cast_nullable_to_non_nullable
as String,thumbUrl: freezed == thumbUrl ? _self.thumbUrl : thumbUrl // ignore: cast_nullable_to_non_nullable
as String?,cardUrl: freezed == cardUrl ? _self.cardUrl : cardUrl // ignore: cast_nullable_to_non_nullable
as String?,caption: freezed == caption ? _self.caption : caption // ignore: cast_nullable_to_non_nullable
as String?,isPrimary: null == isPrimary ? _self.isPrimary : isPrimary // ignore: cast_nullable_to_non_nullable
as bool,sortOrder: null == sortOrder ? _self.sortOrder : sortOrder // ignore: cast_nullable_to_non_nullable
as int,
  ));
}

}


/// Adds pattern-matching-related methods to [RoomPhoto].
extension RoomPhotoPatterns on RoomPhoto {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _RoomPhoto value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _RoomPhoto() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _RoomPhoto value)  $default,){
final _that = this;
switch (_that) {
case _RoomPhoto():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _RoomPhoto value)?  $default,){
final _that = this;
switch (_that) {
case _RoomPhoto() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String? id,  String url,  String? thumbUrl,  String? cardUrl,  String? caption,  bool isPrimary,  int sortOrder)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _RoomPhoto() when $default != null:
return $default(_that.id,_that.url,_that.thumbUrl,_that.cardUrl,_that.caption,_that.isPrimary,_that.sortOrder);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String? id,  String url,  String? thumbUrl,  String? cardUrl,  String? caption,  bool isPrimary,  int sortOrder)  $default,) {final _that = this;
switch (_that) {
case _RoomPhoto():
return $default(_that.id,_that.url,_that.thumbUrl,_that.cardUrl,_that.caption,_that.isPrimary,_that.sortOrder);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String? id,  String url,  String? thumbUrl,  String? cardUrl,  String? caption,  bool isPrimary,  int sortOrder)?  $default,) {final _that = this;
switch (_that) {
case _RoomPhoto() when $default != null:
return $default(_that.id,_that.url,_that.thumbUrl,_that.cardUrl,_that.caption,_that.isPrimary,_that.sortOrder);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _RoomPhoto implements RoomPhoto {
  const _RoomPhoto({this.id, required this.url, this.thumbUrl, this.cardUrl, this.caption, required this.isPrimary, required this.sortOrder});
  factory _RoomPhoto.fromJson(Map<String, dynamic> json) => _$RoomPhotoFromJson(json);

@override final  String? id;
@override final  String url;
@override final  String? thumbUrl;
@override final  String? cardUrl;
@override final  String? caption;
@override final  bool isPrimary;
@override final  int sortOrder;

/// Create a copy of RoomPhoto
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$RoomPhotoCopyWith<_RoomPhoto> get copyWith => __$RoomPhotoCopyWithImpl<_RoomPhoto>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$RoomPhotoToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _RoomPhoto&&(identical(other.id, id) || other.id == id)&&(identical(other.url, url) || other.url == url)&&(identical(other.thumbUrl, thumbUrl) || other.thumbUrl == thumbUrl)&&(identical(other.cardUrl, cardUrl) || other.cardUrl == cardUrl)&&(identical(other.caption, caption) || other.caption == caption)&&(identical(other.isPrimary, isPrimary) || other.isPrimary == isPrimary)&&(identical(other.sortOrder, sortOrder) || other.sortOrder == sortOrder));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,url,thumbUrl,cardUrl,caption,isPrimary,sortOrder);

@override
String toString() {
  return 'RoomPhoto(id: $id, url: $url, thumbUrl: $thumbUrl, cardUrl: $cardUrl, caption: $caption, isPrimary: $isPrimary, sortOrder: $sortOrder)';
}


}

/// @nodoc
abstract mixin class _$RoomPhotoCopyWith<$Res> implements $RoomPhotoCopyWith<$Res> {
  factory _$RoomPhotoCopyWith(_RoomPhoto value, $Res Function(_RoomPhoto) _then) = __$RoomPhotoCopyWithImpl;
@override @useResult
$Res call({
 String? id, String url, String? thumbUrl, String? cardUrl, String? caption, bool isPrimary, int sortOrder
});




}
/// @nodoc
class __$RoomPhotoCopyWithImpl<$Res>
    implements _$RoomPhotoCopyWith<$Res> {
  __$RoomPhotoCopyWithImpl(this._self, this._then);

  final _RoomPhoto _self;
  final $Res Function(_RoomPhoto) _then;

/// Create a copy of RoomPhoto
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = freezed,Object? url = null,Object? thumbUrl = freezed,Object? cardUrl = freezed,Object? caption = freezed,Object? isPrimary = null,Object? sortOrder = null,}) {
  return _then(_RoomPhoto(
id: freezed == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String?,url: null == url ? _self.url : url // ignore: cast_nullable_to_non_nullable
as String,thumbUrl: freezed == thumbUrl ? _self.thumbUrl : thumbUrl // ignore: cast_nullable_to_non_nullable
as String?,cardUrl: freezed == cardUrl ? _self.cardUrl : cardUrl // ignore: cast_nullable_to_non_nullable
as String?,caption: freezed == caption ? _self.caption : caption // ignore: cast_nullable_to_non_nullable
as String?,isPrimary: null == isPrimary ? _self.isPrimary : isPrimary // ignore: cast_nullable_to_non_nullable
as bool,sortOrder: null == sortOrder ? _self.sortOrder : sortOrder // ignore: cast_nullable_to_non_nullable
as int,
  ));
}


}


/// @nodoc
mixin _$VenueSummary {

 String get venueId; String get name; String get slug;/// Wire token: `church | publicSpace | other`.
 String get venueType; String get addressLine; String get suburb; String get postcode; String? get contactEmail; String get parkingInfo; String get transitInfo; bool get isIdentityVerified; double get latitude; double get longitude;
/// Create a copy of VenueSummary
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$VenueSummaryCopyWith<VenueSummary> get copyWith => _$VenueSummaryCopyWithImpl<VenueSummary>(this as VenueSummary, _$identity);

  /// Serializes this VenueSummary to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is VenueSummary&&(identical(other.venueId, venueId) || other.venueId == venueId)&&(identical(other.name, name) || other.name == name)&&(identical(other.slug, slug) || other.slug == slug)&&(identical(other.venueType, venueType) || other.venueType == venueType)&&(identical(other.addressLine, addressLine) || other.addressLine == addressLine)&&(identical(other.suburb, suburb) || other.suburb == suburb)&&(identical(other.postcode, postcode) || other.postcode == postcode)&&(identical(other.contactEmail, contactEmail) || other.contactEmail == contactEmail)&&(identical(other.parkingInfo, parkingInfo) || other.parkingInfo == parkingInfo)&&(identical(other.transitInfo, transitInfo) || other.transitInfo == transitInfo)&&(identical(other.isIdentityVerified, isIdentityVerified) || other.isIdentityVerified == isIdentityVerified)&&(identical(other.latitude, latitude) || other.latitude == latitude)&&(identical(other.longitude, longitude) || other.longitude == longitude));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,venueId,name,slug,venueType,addressLine,suburb,postcode,contactEmail,parkingInfo,transitInfo,isIdentityVerified,latitude,longitude);

@override
String toString() {
  return 'VenueSummary(venueId: $venueId, name: $name, slug: $slug, venueType: $venueType, addressLine: $addressLine, suburb: $suburb, postcode: $postcode, contactEmail: $contactEmail, parkingInfo: $parkingInfo, transitInfo: $transitInfo, isIdentityVerified: $isIdentityVerified, latitude: $latitude, longitude: $longitude)';
}


}

/// @nodoc
abstract mixin class $VenueSummaryCopyWith<$Res>  {
  factory $VenueSummaryCopyWith(VenueSummary value, $Res Function(VenueSummary) _then) = _$VenueSummaryCopyWithImpl;
@useResult
$Res call({
 String venueId, String name, String slug, String venueType, String addressLine, String suburb, String postcode, String? contactEmail, String parkingInfo, String transitInfo, bool isIdentityVerified, double latitude, double longitude
});




}
/// @nodoc
class _$VenueSummaryCopyWithImpl<$Res>
    implements $VenueSummaryCopyWith<$Res> {
  _$VenueSummaryCopyWithImpl(this._self, this._then);

  final VenueSummary _self;
  final $Res Function(VenueSummary) _then;

/// Create a copy of VenueSummary
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? venueId = null,Object? name = null,Object? slug = null,Object? venueType = null,Object? addressLine = null,Object? suburb = null,Object? postcode = null,Object? contactEmail = freezed,Object? parkingInfo = null,Object? transitInfo = null,Object? isIdentityVerified = null,Object? latitude = null,Object? longitude = null,}) {
  return _then(_self.copyWith(
venueId: null == venueId ? _self.venueId : venueId // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,slug: null == slug ? _self.slug : slug // ignore: cast_nullable_to_non_nullable
as String,venueType: null == venueType ? _self.venueType : venueType // ignore: cast_nullable_to_non_nullable
as String,addressLine: null == addressLine ? _self.addressLine : addressLine // ignore: cast_nullable_to_non_nullable
as String,suburb: null == suburb ? _self.suburb : suburb // ignore: cast_nullable_to_non_nullable
as String,postcode: null == postcode ? _self.postcode : postcode // ignore: cast_nullable_to_non_nullable
as String,contactEmail: freezed == contactEmail ? _self.contactEmail : contactEmail // ignore: cast_nullable_to_non_nullable
as String?,parkingInfo: null == parkingInfo ? _self.parkingInfo : parkingInfo // ignore: cast_nullable_to_non_nullable
as String,transitInfo: null == transitInfo ? _self.transitInfo : transitInfo // ignore: cast_nullable_to_non_nullable
as String,isIdentityVerified: null == isIdentityVerified ? _self.isIdentityVerified : isIdentityVerified // ignore: cast_nullable_to_non_nullable
as bool,latitude: null == latitude ? _self.latitude : latitude // ignore: cast_nullable_to_non_nullable
as double,longitude: null == longitude ? _self.longitude : longitude // ignore: cast_nullable_to_non_nullable
as double,
  ));
}

}


/// Adds pattern-matching-related methods to [VenueSummary].
extension VenueSummaryPatterns on VenueSummary {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _VenueSummary value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _VenueSummary() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _VenueSummary value)  $default,){
final _that = this;
switch (_that) {
case _VenueSummary():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _VenueSummary value)?  $default,){
final _that = this;
switch (_that) {
case _VenueSummary() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String venueId,  String name,  String slug,  String venueType,  String addressLine,  String suburb,  String postcode,  String? contactEmail,  String parkingInfo,  String transitInfo,  bool isIdentityVerified,  double latitude,  double longitude)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _VenueSummary() when $default != null:
return $default(_that.venueId,_that.name,_that.slug,_that.venueType,_that.addressLine,_that.suburb,_that.postcode,_that.contactEmail,_that.parkingInfo,_that.transitInfo,_that.isIdentityVerified,_that.latitude,_that.longitude);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String venueId,  String name,  String slug,  String venueType,  String addressLine,  String suburb,  String postcode,  String? contactEmail,  String parkingInfo,  String transitInfo,  bool isIdentityVerified,  double latitude,  double longitude)  $default,) {final _that = this;
switch (_that) {
case _VenueSummary():
return $default(_that.venueId,_that.name,_that.slug,_that.venueType,_that.addressLine,_that.suburb,_that.postcode,_that.contactEmail,_that.parkingInfo,_that.transitInfo,_that.isIdentityVerified,_that.latitude,_that.longitude);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String venueId,  String name,  String slug,  String venueType,  String addressLine,  String suburb,  String postcode,  String? contactEmail,  String parkingInfo,  String transitInfo,  bool isIdentityVerified,  double latitude,  double longitude)?  $default,) {final _that = this;
switch (_that) {
case _VenueSummary() when $default != null:
return $default(_that.venueId,_that.name,_that.slug,_that.venueType,_that.addressLine,_that.suburb,_that.postcode,_that.contactEmail,_that.parkingInfo,_that.transitInfo,_that.isIdentityVerified,_that.latitude,_that.longitude);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _VenueSummary extends VenueSummary {
  const _VenueSummary({required this.venueId, required this.name, required this.slug, required this.venueType, required this.addressLine, required this.suburb, required this.postcode, this.contactEmail, required this.parkingInfo, required this.transitInfo, required this.isIdentityVerified, required this.latitude, required this.longitude}): super._();
  factory _VenueSummary.fromJson(Map<String, dynamic> json) => _$VenueSummaryFromJson(json);

@override final  String venueId;
@override final  String name;
@override final  String slug;
/// Wire token: `church | publicSpace | other`.
@override final  String venueType;
@override final  String addressLine;
@override final  String suburb;
@override final  String postcode;
@override final  String? contactEmail;
@override final  String parkingInfo;
@override final  String transitInfo;
@override final  bool isIdentityVerified;
@override final  double latitude;
@override final  double longitude;

/// Create a copy of VenueSummary
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$VenueSummaryCopyWith<_VenueSummary> get copyWith => __$VenueSummaryCopyWithImpl<_VenueSummary>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$VenueSummaryToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _VenueSummary&&(identical(other.venueId, venueId) || other.venueId == venueId)&&(identical(other.name, name) || other.name == name)&&(identical(other.slug, slug) || other.slug == slug)&&(identical(other.venueType, venueType) || other.venueType == venueType)&&(identical(other.addressLine, addressLine) || other.addressLine == addressLine)&&(identical(other.suburb, suburb) || other.suburb == suburb)&&(identical(other.postcode, postcode) || other.postcode == postcode)&&(identical(other.contactEmail, contactEmail) || other.contactEmail == contactEmail)&&(identical(other.parkingInfo, parkingInfo) || other.parkingInfo == parkingInfo)&&(identical(other.transitInfo, transitInfo) || other.transitInfo == transitInfo)&&(identical(other.isIdentityVerified, isIdentityVerified) || other.isIdentityVerified == isIdentityVerified)&&(identical(other.latitude, latitude) || other.latitude == latitude)&&(identical(other.longitude, longitude) || other.longitude == longitude));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,venueId,name,slug,venueType,addressLine,suburb,postcode,contactEmail,parkingInfo,transitInfo,isIdentityVerified,latitude,longitude);

@override
String toString() {
  return 'VenueSummary(venueId: $venueId, name: $name, slug: $slug, venueType: $venueType, addressLine: $addressLine, suburb: $suburb, postcode: $postcode, contactEmail: $contactEmail, parkingInfo: $parkingInfo, transitInfo: $transitInfo, isIdentityVerified: $isIdentityVerified, latitude: $latitude, longitude: $longitude)';
}


}

/// @nodoc
abstract mixin class _$VenueSummaryCopyWith<$Res> implements $VenueSummaryCopyWith<$Res> {
  factory _$VenueSummaryCopyWith(_VenueSummary value, $Res Function(_VenueSummary) _then) = __$VenueSummaryCopyWithImpl;
@override @useResult
$Res call({
 String venueId, String name, String slug, String venueType, String addressLine, String suburb, String postcode, String? contactEmail, String parkingInfo, String transitInfo, bool isIdentityVerified, double latitude, double longitude
});




}
/// @nodoc
class __$VenueSummaryCopyWithImpl<$Res>
    implements _$VenueSummaryCopyWith<$Res> {
  __$VenueSummaryCopyWithImpl(this._self, this._then);

  final _VenueSummary _self;
  final $Res Function(_VenueSummary) _then;

/// Create a copy of VenueSummary
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? venueId = null,Object? name = null,Object? slug = null,Object? venueType = null,Object? addressLine = null,Object? suburb = null,Object? postcode = null,Object? contactEmail = freezed,Object? parkingInfo = null,Object? transitInfo = null,Object? isIdentityVerified = null,Object? latitude = null,Object? longitude = null,}) {
  return _then(_VenueSummary(
venueId: null == venueId ? _self.venueId : venueId // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,slug: null == slug ? _self.slug : slug // ignore: cast_nullable_to_non_nullable
as String,venueType: null == venueType ? _self.venueType : venueType // ignore: cast_nullable_to_non_nullable
as String,addressLine: null == addressLine ? _self.addressLine : addressLine // ignore: cast_nullable_to_non_nullable
as String,suburb: null == suburb ? _self.suburb : suburb // ignore: cast_nullable_to_non_nullable
as String,postcode: null == postcode ? _self.postcode : postcode // ignore: cast_nullable_to_non_nullable
as String,contactEmail: freezed == contactEmail ? _self.contactEmail : contactEmail // ignore: cast_nullable_to_non_nullable
as String?,parkingInfo: null == parkingInfo ? _self.parkingInfo : parkingInfo // ignore: cast_nullable_to_non_nullable
as String,transitInfo: null == transitInfo ? _self.transitInfo : transitInfo // ignore: cast_nullable_to_non_nullable
as String,isIdentityVerified: null == isIdentityVerified ? _self.isIdentityVerified : isIdentityVerified // ignore: cast_nullable_to_non_nullable
as bool,latitude: null == latitude ? _self.latitude : latitude // ignore: cast_nullable_to_non_nullable
as double,longitude: null == longitude ? _self.longitude : longitude // ignore: cast_nullable_to_non_nullable
as double,
  ));
}


}


/// @nodoc
mixin _$RoomDetail {

 String get roomId; String get roomSlug; String get roomName; String get description; int get capacity; bool get isFree; double? get pricePerHour; String get currency; String get houseRules; List<String> get amenities; List<String> get accessibility; List<String> get activities; List<RoomPhoto> get photos; VenueSummary get venue; RatingSummary? get rating;
/// Create a copy of RoomDetail
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$RoomDetailCopyWith<RoomDetail> get copyWith => _$RoomDetailCopyWithImpl<RoomDetail>(this as RoomDetail, _$identity);

  /// Serializes this RoomDetail to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is RoomDetail&&(identical(other.roomId, roomId) || other.roomId == roomId)&&(identical(other.roomSlug, roomSlug) || other.roomSlug == roomSlug)&&(identical(other.roomName, roomName) || other.roomName == roomName)&&(identical(other.description, description) || other.description == description)&&(identical(other.capacity, capacity) || other.capacity == capacity)&&(identical(other.isFree, isFree) || other.isFree == isFree)&&(identical(other.pricePerHour, pricePerHour) || other.pricePerHour == pricePerHour)&&(identical(other.currency, currency) || other.currency == currency)&&(identical(other.houseRules, houseRules) || other.houseRules == houseRules)&&const DeepCollectionEquality().equals(other.amenities, amenities)&&const DeepCollectionEquality().equals(other.accessibility, accessibility)&&const DeepCollectionEquality().equals(other.activities, activities)&&const DeepCollectionEquality().equals(other.photos, photos)&&(identical(other.venue, venue) || other.venue == venue)&&(identical(other.rating, rating) || other.rating == rating));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,roomId,roomSlug,roomName,description,capacity,isFree,pricePerHour,currency,houseRules,const DeepCollectionEquality().hash(amenities),const DeepCollectionEquality().hash(accessibility),const DeepCollectionEquality().hash(activities),const DeepCollectionEquality().hash(photos),venue,rating);

@override
String toString() {
  return 'RoomDetail(roomId: $roomId, roomSlug: $roomSlug, roomName: $roomName, description: $description, capacity: $capacity, isFree: $isFree, pricePerHour: $pricePerHour, currency: $currency, houseRules: $houseRules, amenities: $amenities, accessibility: $accessibility, activities: $activities, photos: $photos, venue: $venue, rating: $rating)';
}


}

/// @nodoc
abstract mixin class $RoomDetailCopyWith<$Res>  {
  factory $RoomDetailCopyWith(RoomDetail value, $Res Function(RoomDetail) _then) = _$RoomDetailCopyWithImpl;
@useResult
$Res call({
 String roomId, String roomSlug, String roomName, String description, int capacity, bool isFree, double? pricePerHour, String currency, String houseRules, List<String> amenities, List<String> accessibility, List<String> activities, List<RoomPhoto> photos, VenueSummary venue, RatingSummary? rating
});


$VenueSummaryCopyWith<$Res> get venue;$RatingSummaryCopyWith<$Res>? get rating;

}
/// @nodoc
class _$RoomDetailCopyWithImpl<$Res>
    implements $RoomDetailCopyWith<$Res> {
  _$RoomDetailCopyWithImpl(this._self, this._then);

  final RoomDetail _self;
  final $Res Function(RoomDetail) _then;

/// Create a copy of RoomDetail
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? roomId = null,Object? roomSlug = null,Object? roomName = null,Object? description = null,Object? capacity = null,Object? isFree = null,Object? pricePerHour = freezed,Object? currency = null,Object? houseRules = null,Object? amenities = null,Object? accessibility = null,Object? activities = null,Object? photos = null,Object? venue = null,Object? rating = freezed,}) {
  return _then(_self.copyWith(
roomId: null == roomId ? _self.roomId : roomId // ignore: cast_nullable_to_non_nullable
as String,roomSlug: null == roomSlug ? _self.roomSlug : roomSlug // ignore: cast_nullable_to_non_nullable
as String,roomName: null == roomName ? _self.roomName : roomName // ignore: cast_nullable_to_non_nullable
as String,description: null == description ? _self.description : description // ignore: cast_nullable_to_non_nullable
as String,capacity: null == capacity ? _self.capacity : capacity // ignore: cast_nullable_to_non_nullable
as int,isFree: null == isFree ? _self.isFree : isFree // ignore: cast_nullable_to_non_nullable
as bool,pricePerHour: freezed == pricePerHour ? _self.pricePerHour : pricePerHour // ignore: cast_nullable_to_non_nullable
as double?,currency: null == currency ? _self.currency : currency // ignore: cast_nullable_to_non_nullable
as String,houseRules: null == houseRules ? _self.houseRules : houseRules // ignore: cast_nullable_to_non_nullable
as String,amenities: null == amenities ? _self.amenities : amenities // ignore: cast_nullable_to_non_nullable
as List<String>,accessibility: null == accessibility ? _self.accessibility : accessibility // ignore: cast_nullable_to_non_nullable
as List<String>,activities: null == activities ? _self.activities : activities // ignore: cast_nullable_to_non_nullable
as List<String>,photos: null == photos ? _self.photos : photos // ignore: cast_nullable_to_non_nullable
as List<RoomPhoto>,venue: null == venue ? _self.venue : venue // ignore: cast_nullable_to_non_nullable
as VenueSummary,rating: freezed == rating ? _self.rating : rating // ignore: cast_nullable_to_non_nullable
as RatingSummary?,
  ));
}
/// Create a copy of RoomDetail
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$VenueSummaryCopyWith<$Res> get venue {
  
  return $VenueSummaryCopyWith<$Res>(_self.venue, (value) {
    return _then(_self.copyWith(venue: value));
  });
}/// Create a copy of RoomDetail
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$RatingSummaryCopyWith<$Res>? get rating {
    if (_self.rating == null) {
    return null;
  }

  return $RatingSummaryCopyWith<$Res>(_self.rating!, (value) {
    return _then(_self.copyWith(rating: value));
  });
}
}


/// Adds pattern-matching-related methods to [RoomDetail].
extension RoomDetailPatterns on RoomDetail {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _RoomDetail value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _RoomDetail() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _RoomDetail value)  $default,){
final _that = this;
switch (_that) {
case _RoomDetail():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _RoomDetail value)?  $default,){
final _that = this;
switch (_that) {
case _RoomDetail() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String roomId,  String roomSlug,  String roomName,  String description,  int capacity,  bool isFree,  double? pricePerHour,  String currency,  String houseRules,  List<String> amenities,  List<String> accessibility,  List<String> activities,  List<RoomPhoto> photos,  VenueSummary venue,  RatingSummary? rating)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _RoomDetail() when $default != null:
return $default(_that.roomId,_that.roomSlug,_that.roomName,_that.description,_that.capacity,_that.isFree,_that.pricePerHour,_that.currency,_that.houseRules,_that.amenities,_that.accessibility,_that.activities,_that.photos,_that.venue,_that.rating);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String roomId,  String roomSlug,  String roomName,  String description,  int capacity,  bool isFree,  double? pricePerHour,  String currency,  String houseRules,  List<String> amenities,  List<String> accessibility,  List<String> activities,  List<RoomPhoto> photos,  VenueSummary venue,  RatingSummary? rating)  $default,) {final _that = this;
switch (_that) {
case _RoomDetail():
return $default(_that.roomId,_that.roomSlug,_that.roomName,_that.description,_that.capacity,_that.isFree,_that.pricePerHour,_that.currency,_that.houseRules,_that.amenities,_that.accessibility,_that.activities,_that.photos,_that.venue,_that.rating);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String roomId,  String roomSlug,  String roomName,  String description,  int capacity,  bool isFree,  double? pricePerHour,  String currency,  String houseRules,  List<String> amenities,  List<String> accessibility,  List<String> activities,  List<RoomPhoto> photos,  VenueSummary venue,  RatingSummary? rating)?  $default,) {final _that = this;
switch (_that) {
case _RoomDetail() when $default != null:
return $default(_that.roomId,_that.roomSlug,_that.roomName,_that.description,_that.capacity,_that.isFree,_that.pricePerHour,_that.currency,_that.houseRules,_that.amenities,_that.accessibility,_that.activities,_that.photos,_that.venue,_that.rating);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _RoomDetail implements RoomDetail {
  const _RoomDetail({required this.roomId, required this.roomSlug, required this.roomName, required this.description, required this.capacity, required this.isFree, this.pricePerHour, required this.currency, required this.houseRules, final  List<String> amenities = const <String>[], final  List<String> accessibility = const <String>[], final  List<String> activities = const <String>[], final  List<RoomPhoto> photos = const <RoomPhoto>[], required this.venue, this.rating}): _amenities = amenities,_accessibility = accessibility,_activities = activities,_photos = photos;
  factory _RoomDetail.fromJson(Map<String, dynamic> json) => _$RoomDetailFromJson(json);

@override final  String roomId;
@override final  String roomSlug;
@override final  String roomName;
@override final  String description;
@override final  int capacity;
@override final  bool isFree;
@override final  double? pricePerHour;
@override final  String currency;
@override final  String houseRules;
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

 final  List<String> _activities;
@override@JsonKey() List<String> get activities {
  if (_activities is EqualUnmodifiableListView) return _activities;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_activities);
}

 final  List<RoomPhoto> _photos;
@override@JsonKey() List<RoomPhoto> get photos {
  if (_photos is EqualUnmodifiableListView) return _photos;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_photos);
}

@override final  VenueSummary venue;
@override final  RatingSummary? rating;

/// Create a copy of RoomDetail
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$RoomDetailCopyWith<_RoomDetail> get copyWith => __$RoomDetailCopyWithImpl<_RoomDetail>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$RoomDetailToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _RoomDetail&&(identical(other.roomId, roomId) || other.roomId == roomId)&&(identical(other.roomSlug, roomSlug) || other.roomSlug == roomSlug)&&(identical(other.roomName, roomName) || other.roomName == roomName)&&(identical(other.description, description) || other.description == description)&&(identical(other.capacity, capacity) || other.capacity == capacity)&&(identical(other.isFree, isFree) || other.isFree == isFree)&&(identical(other.pricePerHour, pricePerHour) || other.pricePerHour == pricePerHour)&&(identical(other.currency, currency) || other.currency == currency)&&(identical(other.houseRules, houseRules) || other.houseRules == houseRules)&&const DeepCollectionEquality().equals(other._amenities, _amenities)&&const DeepCollectionEquality().equals(other._accessibility, _accessibility)&&const DeepCollectionEquality().equals(other._activities, _activities)&&const DeepCollectionEquality().equals(other._photos, _photos)&&(identical(other.venue, venue) || other.venue == venue)&&(identical(other.rating, rating) || other.rating == rating));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,roomId,roomSlug,roomName,description,capacity,isFree,pricePerHour,currency,houseRules,const DeepCollectionEquality().hash(_amenities),const DeepCollectionEquality().hash(_accessibility),const DeepCollectionEquality().hash(_activities),const DeepCollectionEquality().hash(_photos),venue,rating);

@override
String toString() {
  return 'RoomDetail(roomId: $roomId, roomSlug: $roomSlug, roomName: $roomName, description: $description, capacity: $capacity, isFree: $isFree, pricePerHour: $pricePerHour, currency: $currency, houseRules: $houseRules, amenities: $amenities, accessibility: $accessibility, activities: $activities, photos: $photos, venue: $venue, rating: $rating)';
}


}

/// @nodoc
abstract mixin class _$RoomDetailCopyWith<$Res> implements $RoomDetailCopyWith<$Res> {
  factory _$RoomDetailCopyWith(_RoomDetail value, $Res Function(_RoomDetail) _then) = __$RoomDetailCopyWithImpl;
@override @useResult
$Res call({
 String roomId, String roomSlug, String roomName, String description, int capacity, bool isFree, double? pricePerHour, String currency, String houseRules, List<String> amenities, List<String> accessibility, List<String> activities, List<RoomPhoto> photos, VenueSummary venue, RatingSummary? rating
});


@override $VenueSummaryCopyWith<$Res> get venue;@override $RatingSummaryCopyWith<$Res>? get rating;

}
/// @nodoc
class __$RoomDetailCopyWithImpl<$Res>
    implements _$RoomDetailCopyWith<$Res> {
  __$RoomDetailCopyWithImpl(this._self, this._then);

  final _RoomDetail _self;
  final $Res Function(_RoomDetail) _then;

/// Create a copy of RoomDetail
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? roomId = null,Object? roomSlug = null,Object? roomName = null,Object? description = null,Object? capacity = null,Object? isFree = null,Object? pricePerHour = freezed,Object? currency = null,Object? houseRules = null,Object? amenities = null,Object? accessibility = null,Object? activities = null,Object? photos = null,Object? venue = null,Object? rating = freezed,}) {
  return _then(_RoomDetail(
roomId: null == roomId ? _self.roomId : roomId // ignore: cast_nullable_to_non_nullable
as String,roomSlug: null == roomSlug ? _self.roomSlug : roomSlug // ignore: cast_nullable_to_non_nullable
as String,roomName: null == roomName ? _self.roomName : roomName // ignore: cast_nullable_to_non_nullable
as String,description: null == description ? _self.description : description // ignore: cast_nullable_to_non_nullable
as String,capacity: null == capacity ? _self.capacity : capacity // ignore: cast_nullable_to_non_nullable
as int,isFree: null == isFree ? _self.isFree : isFree // ignore: cast_nullable_to_non_nullable
as bool,pricePerHour: freezed == pricePerHour ? _self.pricePerHour : pricePerHour // ignore: cast_nullable_to_non_nullable
as double?,currency: null == currency ? _self.currency : currency // ignore: cast_nullable_to_non_nullable
as String,houseRules: null == houseRules ? _self.houseRules : houseRules // ignore: cast_nullable_to_non_nullable
as String,amenities: null == amenities ? _self._amenities : amenities // ignore: cast_nullable_to_non_nullable
as List<String>,accessibility: null == accessibility ? _self._accessibility : accessibility // ignore: cast_nullable_to_non_nullable
as List<String>,activities: null == activities ? _self._activities : activities // ignore: cast_nullable_to_non_nullable
as List<String>,photos: null == photos ? _self._photos : photos // ignore: cast_nullable_to_non_nullable
as List<RoomPhoto>,venue: null == venue ? _self.venue : venue // ignore: cast_nullable_to_non_nullable
as VenueSummary,rating: freezed == rating ? _self.rating : rating // ignore: cast_nullable_to_non_nullable
as RatingSummary?,
  ));
}

/// Create a copy of RoomDetail
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$VenueSummaryCopyWith<$Res> get venue {
  
  return $VenueSummaryCopyWith<$Res>(_self.venue, (value) {
    return _then(_self.copyWith(venue: value));
  });
}/// Create a copy of RoomDetail
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$RatingSummaryCopyWith<$Res>? get rating {
    if (_self.rating == null) {
    return null;
  }

  return $RatingSummaryCopyWith<$Res>(_self.rating!, (value) {
    return _then(_self.copyWith(rating: value));
  });
}
}

// dart format on
