// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'listing_search.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$ListingSearchResult {

 List<RoomSummary> get items; int get totalCount;/// The liquidity metric — a zero-result search is a signal, not an error.
 bool get isZeroResult; BoundingBox get appliedBounds; GeoPoint? get center; int get page; int get pageSize;
/// Create a copy of ListingSearchResult
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ListingSearchResultCopyWith<ListingSearchResult> get copyWith => _$ListingSearchResultCopyWithImpl<ListingSearchResult>(this as ListingSearchResult, _$identity);

  /// Serializes this ListingSearchResult to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ListingSearchResult&&const DeepCollectionEquality().equals(other.items, items)&&(identical(other.totalCount, totalCount) || other.totalCount == totalCount)&&(identical(other.isZeroResult, isZeroResult) || other.isZeroResult == isZeroResult)&&(identical(other.appliedBounds, appliedBounds) || other.appliedBounds == appliedBounds)&&(identical(other.center, center) || other.center == center)&&(identical(other.page, page) || other.page == page)&&(identical(other.pageSize, pageSize) || other.pageSize == pageSize));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,const DeepCollectionEquality().hash(items),totalCount,isZeroResult,appliedBounds,center,page,pageSize);

@override
String toString() {
  return 'ListingSearchResult(items: $items, totalCount: $totalCount, isZeroResult: $isZeroResult, appliedBounds: $appliedBounds, center: $center, page: $page, pageSize: $pageSize)';
}


}

/// @nodoc
abstract mixin class $ListingSearchResultCopyWith<$Res>  {
  factory $ListingSearchResultCopyWith(ListingSearchResult value, $Res Function(ListingSearchResult) _then) = _$ListingSearchResultCopyWithImpl;
@useResult
$Res call({
 List<RoomSummary> items, int totalCount, bool isZeroResult, BoundingBox appliedBounds, GeoPoint? center, int page, int pageSize
});


$BoundingBoxCopyWith<$Res> get appliedBounds;$GeoPointCopyWith<$Res>? get center;

}
/// @nodoc
class _$ListingSearchResultCopyWithImpl<$Res>
    implements $ListingSearchResultCopyWith<$Res> {
  _$ListingSearchResultCopyWithImpl(this._self, this._then);

  final ListingSearchResult _self;
  final $Res Function(ListingSearchResult) _then;

/// Create a copy of ListingSearchResult
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? items = null,Object? totalCount = null,Object? isZeroResult = null,Object? appliedBounds = null,Object? center = freezed,Object? page = null,Object? pageSize = null,}) {
  return _then(_self.copyWith(
items: null == items ? _self.items : items // ignore: cast_nullable_to_non_nullable
as List<RoomSummary>,totalCount: null == totalCount ? _self.totalCount : totalCount // ignore: cast_nullable_to_non_nullable
as int,isZeroResult: null == isZeroResult ? _self.isZeroResult : isZeroResult // ignore: cast_nullable_to_non_nullable
as bool,appliedBounds: null == appliedBounds ? _self.appliedBounds : appliedBounds // ignore: cast_nullable_to_non_nullable
as BoundingBox,center: freezed == center ? _self.center : center // ignore: cast_nullable_to_non_nullable
as GeoPoint?,page: null == page ? _self.page : page // ignore: cast_nullable_to_non_nullable
as int,pageSize: null == pageSize ? _self.pageSize : pageSize // ignore: cast_nullable_to_non_nullable
as int,
  ));
}
/// Create a copy of ListingSearchResult
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$BoundingBoxCopyWith<$Res> get appliedBounds {
  
  return $BoundingBoxCopyWith<$Res>(_self.appliedBounds, (value) {
    return _then(_self.copyWith(appliedBounds: value));
  });
}/// Create a copy of ListingSearchResult
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$GeoPointCopyWith<$Res>? get center {
    if (_self.center == null) {
    return null;
  }

  return $GeoPointCopyWith<$Res>(_self.center!, (value) {
    return _then(_self.copyWith(center: value));
  });
}
}


/// Adds pattern-matching-related methods to [ListingSearchResult].
extension ListingSearchResultPatterns on ListingSearchResult {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ListingSearchResult value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ListingSearchResult() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ListingSearchResult value)  $default,){
final _that = this;
switch (_that) {
case _ListingSearchResult():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ListingSearchResult value)?  $default,){
final _that = this;
switch (_that) {
case _ListingSearchResult() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( List<RoomSummary> items,  int totalCount,  bool isZeroResult,  BoundingBox appliedBounds,  GeoPoint? center,  int page,  int pageSize)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ListingSearchResult() when $default != null:
return $default(_that.items,_that.totalCount,_that.isZeroResult,_that.appliedBounds,_that.center,_that.page,_that.pageSize);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( List<RoomSummary> items,  int totalCount,  bool isZeroResult,  BoundingBox appliedBounds,  GeoPoint? center,  int page,  int pageSize)  $default,) {final _that = this;
switch (_that) {
case _ListingSearchResult():
return $default(_that.items,_that.totalCount,_that.isZeroResult,_that.appliedBounds,_that.center,_that.page,_that.pageSize);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( List<RoomSummary> items,  int totalCount,  bool isZeroResult,  BoundingBox appliedBounds,  GeoPoint? center,  int page,  int pageSize)?  $default,) {final _that = this;
switch (_that) {
case _ListingSearchResult() when $default != null:
return $default(_that.items,_that.totalCount,_that.isZeroResult,_that.appliedBounds,_that.center,_that.page,_that.pageSize);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ListingSearchResult implements ListingSearchResult {
  const _ListingSearchResult({final  List<RoomSummary> items = const <RoomSummary>[], required this.totalCount, required this.isZeroResult, required this.appliedBounds, this.center, required this.page, required this.pageSize}): _items = items;
  factory _ListingSearchResult.fromJson(Map<String, dynamic> json) => _$ListingSearchResultFromJson(json);

 final  List<RoomSummary> _items;
@override@JsonKey() List<RoomSummary> get items {
  if (_items is EqualUnmodifiableListView) return _items;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_items);
}

@override final  int totalCount;
/// The liquidity metric — a zero-result search is a signal, not an error.
@override final  bool isZeroResult;
@override final  BoundingBox appliedBounds;
@override final  GeoPoint? center;
@override final  int page;
@override final  int pageSize;

/// Create a copy of ListingSearchResult
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ListingSearchResultCopyWith<_ListingSearchResult> get copyWith => __$ListingSearchResultCopyWithImpl<_ListingSearchResult>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ListingSearchResultToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ListingSearchResult&&const DeepCollectionEquality().equals(other._items, _items)&&(identical(other.totalCount, totalCount) || other.totalCount == totalCount)&&(identical(other.isZeroResult, isZeroResult) || other.isZeroResult == isZeroResult)&&(identical(other.appliedBounds, appliedBounds) || other.appliedBounds == appliedBounds)&&(identical(other.center, center) || other.center == center)&&(identical(other.page, page) || other.page == page)&&(identical(other.pageSize, pageSize) || other.pageSize == pageSize));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,const DeepCollectionEquality().hash(_items),totalCount,isZeroResult,appliedBounds,center,page,pageSize);

@override
String toString() {
  return 'ListingSearchResult(items: $items, totalCount: $totalCount, isZeroResult: $isZeroResult, appliedBounds: $appliedBounds, center: $center, page: $page, pageSize: $pageSize)';
}


}

/// @nodoc
abstract mixin class _$ListingSearchResultCopyWith<$Res> implements $ListingSearchResultCopyWith<$Res> {
  factory _$ListingSearchResultCopyWith(_ListingSearchResult value, $Res Function(_ListingSearchResult) _then) = __$ListingSearchResultCopyWithImpl;
@override @useResult
$Res call({
 List<RoomSummary> items, int totalCount, bool isZeroResult, BoundingBox appliedBounds, GeoPoint? center, int page, int pageSize
});


@override $BoundingBoxCopyWith<$Res> get appliedBounds;@override $GeoPointCopyWith<$Res>? get center;

}
/// @nodoc
class __$ListingSearchResultCopyWithImpl<$Res>
    implements _$ListingSearchResultCopyWith<$Res> {
  __$ListingSearchResultCopyWithImpl(this._self, this._then);

  final _ListingSearchResult _self;
  final $Res Function(_ListingSearchResult) _then;

/// Create a copy of ListingSearchResult
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? items = null,Object? totalCount = null,Object? isZeroResult = null,Object? appliedBounds = null,Object? center = freezed,Object? page = null,Object? pageSize = null,}) {
  return _then(_ListingSearchResult(
items: null == items ? _self._items : items // ignore: cast_nullable_to_non_nullable
as List<RoomSummary>,totalCount: null == totalCount ? _self.totalCount : totalCount // ignore: cast_nullable_to_non_nullable
as int,isZeroResult: null == isZeroResult ? _self.isZeroResult : isZeroResult // ignore: cast_nullable_to_non_nullable
as bool,appliedBounds: null == appliedBounds ? _self.appliedBounds : appliedBounds // ignore: cast_nullable_to_non_nullable
as BoundingBox,center: freezed == center ? _self.center : center // ignore: cast_nullable_to_non_nullable
as GeoPoint?,page: null == page ? _self.page : page // ignore: cast_nullable_to_non_nullable
as int,pageSize: null == pageSize ? _self.pageSize : pageSize // ignore: cast_nullable_to_non_nullable
as int,
  ));
}

/// Create a copy of ListingSearchResult
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$BoundingBoxCopyWith<$Res> get appliedBounds {
  
  return $BoundingBoxCopyWith<$Res>(_self.appliedBounds, (value) {
    return _then(_self.copyWith(appliedBounds: value));
  });
}/// Create a copy of ListingSearchResult
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$GeoPointCopyWith<$Res>? get center {
    if (_self.center == null) {
    return null;
  }

  return $GeoPointCopyWith<$Res>(_self.center!, (value) {
    return _then(_self.copyWith(center: value));
  });
}
}

// dart format on
