// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'payments.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$VenuePaymentState {

 bool get onboardingStarted; bool get detailsSubmitted; bool get chargesEnabled; bool get payoutsEnabled; bool get optedIn; String? get dashboardUrl; bool get mock; String get status; List<String> get requirementsDue; String? get disabledReason; bool get testMode; bool get canOpenDashboard; bool get onlinePaymentsAvailable;
/// Create a copy of VenuePaymentState
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$VenuePaymentStateCopyWith<VenuePaymentState> get copyWith => _$VenuePaymentStateCopyWithImpl<VenuePaymentState>(this as VenuePaymentState, _$identity);

  /// Serializes this VenuePaymentState to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is VenuePaymentState&&(identical(other.onboardingStarted, onboardingStarted) || other.onboardingStarted == onboardingStarted)&&(identical(other.detailsSubmitted, detailsSubmitted) || other.detailsSubmitted == detailsSubmitted)&&(identical(other.chargesEnabled, chargesEnabled) || other.chargesEnabled == chargesEnabled)&&(identical(other.payoutsEnabled, payoutsEnabled) || other.payoutsEnabled == payoutsEnabled)&&(identical(other.optedIn, optedIn) || other.optedIn == optedIn)&&(identical(other.dashboardUrl, dashboardUrl) || other.dashboardUrl == dashboardUrl)&&(identical(other.mock, mock) || other.mock == mock)&&(identical(other.status, status) || other.status == status)&&const DeepCollectionEquality().equals(other.requirementsDue, requirementsDue)&&(identical(other.disabledReason, disabledReason) || other.disabledReason == disabledReason)&&(identical(other.testMode, testMode) || other.testMode == testMode)&&(identical(other.canOpenDashboard, canOpenDashboard) || other.canOpenDashboard == canOpenDashboard)&&(identical(other.onlinePaymentsAvailable, onlinePaymentsAvailable) || other.onlinePaymentsAvailable == onlinePaymentsAvailable));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,onboardingStarted,detailsSubmitted,chargesEnabled,payoutsEnabled,optedIn,dashboardUrl,mock,status,const DeepCollectionEquality().hash(requirementsDue),disabledReason,testMode,canOpenDashboard,onlinePaymentsAvailable);

@override
String toString() {
  return 'VenuePaymentState(onboardingStarted: $onboardingStarted, detailsSubmitted: $detailsSubmitted, chargesEnabled: $chargesEnabled, payoutsEnabled: $payoutsEnabled, optedIn: $optedIn, dashboardUrl: $dashboardUrl, mock: $mock, status: $status, requirementsDue: $requirementsDue, disabledReason: $disabledReason, testMode: $testMode, canOpenDashboard: $canOpenDashboard, onlinePaymentsAvailable: $onlinePaymentsAvailable)';
}


}

/// @nodoc
abstract mixin class $VenuePaymentStateCopyWith<$Res>  {
  factory $VenuePaymentStateCopyWith(VenuePaymentState value, $Res Function(VenuePaymentState) _then) = _$VenuePaymentStateCopyWithImpl;
@useResult
$Res call({
 bool onboardingStarted, bool detailsSubmitted, bool chargesEnabled, bool payoutsEnabled, bool optedIn, String? dashboardUrl, bool mock, String status, List<String> requirementsDue, String? disabledReason, bool testMode, bool canOpenDashboard, bool onlinePaymentsAvailable
});




}
/// @nodoc
class _$VenuePaymentStateCopyWithImpl<$Res>
    implements $VenuePaymentStateCopyWith<$Res> {
  _$VenuePaymentStateCopyWithImpl(this._self, this._then);

  final VenuePaymentState _self;
  final $Res Function(VenuePaymentState) _then;

/// Create a copy of VenuePaymentState
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? onboardingStarted = null,Object? detailsSubmitted = null,Object? chargesEnabled = null,Object? payoutsEnabled = null,Object? optedIn = null,Object? dashboardUrl = freezed,Object? mock = null,Object? status = null,Object? requirementsDue = null,Object? disabledReason = freezed,Object? testMode = null,Object? canOpenDashboard = null,Object? onlinePaymentsAvailable = null,}) {
  return _then(_self.copyWith(
onboardingStarted: null == onboardingStarted ? _self.onboardingStarted : onboardingStarted // ignore: cast_nullable_to_non_nullable
as bool,detailsSubmitted: null == detailsSubmitted ? _self.detailsSubmitted : detailsSubmitted // ignore: cast_nullable_to_non_nullable
as bool,chargesEnabled: null == chargesEnabled ? _self.chargesEnabled : chargesEnabled // ignore: cast_nullable_to_non_nullable
as bool,payoutsEnabled: null == payoutsEnabled ? _self.payoutsEnabled : payoutsEnabled // ignore: cast_nullable_to_non_nullable
as bool,optedIn: null == optedIn ? _self.optedIn : optedIn // ignore: cast_nullable_to_non_nullable
as bool,dashboardUrl: freezed == dashboardUrl ? _self.dashboardUrl : dashboardUrl // ignore: cast_nullable_to_non_nullable
as String?,mock: null == mock ? _self.mock : mock // ignore: cast_nullable_to_non_nullable
as bool,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,requirementsDue: null == requirementsDue ? _self.requirementsDue : requirementsDue // ignore: cast_nullable_to_non_nullable
as List<String>,disabledReason: freezed == disabledReason ? _self.disabledReason : disabledReason // ignore: cast_nullable_to_non_nullable
as String?,testMode: null == testMode ? _self.testMode : testMode // ignore: cast_nullable_to_non_nullable
as bool,canOpenDashboard: null == canOpenDashboard ? _self.canOpenDashboard : canOpenDashboard // ignore: cast_nullable_to_non_nullable
as bool,onlinePaymentsAvailable: null == onlinePaymentsAvailable ? _self.onlinePaymentsAvailable : onlinePaymentsAvailable // ignore: cast_nullable_to_non_nullable
as bool,
  ));
}

}


/// Adds pattern-matching-related methods to [VenuePaymentState].
extension VenuePaymentStatePatterns on VenuePaymentState {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _VenuePaymentState value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _VenuePaymentState() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _VenuePaymentState value)  $default,){
final _that = this;
switch (_that) {
case _VenuePaymentState():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _VenuePaymentState value)?  $default,){
final _that = this;
switch (_that) {
case _VenuePaymentState() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( bool onboardingStarted,  bool detailsSubmitted,  bool chargesEnabled,  bool payoutsEnabled,  bool optedIn,  String? dashboardUrl,  bool mock,  String status,  List<String> requirementsDue,  String? disabledReason,  bool testMode,  bool canOpenDashboard,  bool onlinePaymentsAvailable)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _VenuePaymentState() when $default != null:
return $default(_that.onboardingStarted,_that.detailsSubmitted,_that.chargesEnabled,_that.payoutsEnabled,_that.optedIn,_that.dashboardUrl,_that.mock,_that.status,_that.requirementsDue,_that.disabledReason,_that.testMode,_that.canOpenDashboard,_that.onlinePaymentsAvailable);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( bool onboardingStarted,  bool detailsSubmitted,  bool chargesEnabled,  bool payoutsEnabled,  bool optedIn,  String? dashboardUrl,  bool mock,  String status,  List<String> requirementsDue,  String? disabledReason,  bool testMode,  bool canOpenDashboard,  bool onlinePaymentsAvailable)  $default,) {final _that = this;
switch (_that) {
case _VenuePaymentState():
return $default(_that.onboardingStarted,_that.detailsSubmitted,_that.chargesEnabled,_that.payoutsEnabled,_that.optedIn,_that.dashboardUrl,_that.mock,_that.status,_that.requirementsDue,_that.disabledReason,_that.testMode,_that.canOpenDashboard,_that.onlinePaymentsAvailable);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( bool onboardingStarted,  bool detailsSubmitted,  bool chargesEnabled,  bool payoutsEnabled,  bool optedIn,  String? dashboardUrl,  bool mock,  String status,  List<String> requirementsDue,  String? disabledReason,  bool testMode,  bool canOpenDashboard,  bool onlinePaymentsAvailable)?  $default,) {final _that = this;
switch (_that) {
case _VenuePaymentState() when $default != null:
return $default(_that.onboardingStarted,_that.detailsSubmitted,_that.chargesEnabled,_that.payoutsEnabled,_that.optedIn,_that.dashboardUrl,_that.mock,_that.status,_that.requirementsDue,_that.disabledReason,_that.testMode,_that.canOpenDashboard,_that.onlinePaymentsAvailable);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _VenuePaymentState extends VenuePaymentState {
  const _VenuePaymentState({required this.onboardingStarted, required this.detailsSubmitted, required this.chargesEnabled, required this.payoutsEnabled, required this.optedIn, this.dashboardUrl, required this.mock, required this.status, final  List<String> requirementsDue = const <String>[], this.disabledReason, required this.testMode, required this.canOpenDashboard, required this.onlinePaymentsAvailable}): _requirementsDue = requirementsDue,super._();
  factory _VenuePaymentState.fromJson(Map<String, dynamic> json) => _$VenuePaymentStateFromJson(json);

@override final  bool onboardingStarted;
@override final  bool detailsSubmitted;
@override final  bool chargesEnabled;
@override final  bool payoutsEnabled;
@override final  bool optedIn;
@override final  String? dashboardUrl;
@override final  bool mock;
@override final  String status;
 final  List<String> _requirementsDue;
@override@JsonKey() List<String> get requirementsDue {
  if (_requirementsDue is EqualUnmodifiableListView) return _requirementsDue;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_requirementsDue);
}

@override final  String? disabledReason;
@override final  bool testMode;
@override final  bool canOpenDashboard;
@override final  bool onlinePaymentsAvailable;

/// Create a copy of VenuePaymentState
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$VenuePaymentStateCopyWith<_VenuePaymentState> get copyWith => __$VenuePaymentStateCopyWithImpl<_VenuePaymentState>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$VenuePaymentStateToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _VenuePaymentState&&(identical(other.onboardingStarted, onboardingStarted) || other.onboardingStarted == onboardingStarted)&&(identical(other.detailsSubmitted, detailsSubmitted) || other.detailsSubmitted == detailsSubmitted)&&(identical(other.chargesEnabled, chargesEnabled) || other.chargesEnabled == chargesEnabled)&&(identical(other.payoutsEnabled, payoutsEnabled) || other.payoutsEnabled == payoutsEnabled)&&(identical(other.optedIn, optedIn) || other.optedIn == optedIn)&&(identical(other.dashboardUrl, dashboardUrl) || other.dashboardUrl == dashboardUrl)&&(identical(other.mock, mock) || other.mock == mock)&&(identical(other.status, status) || other.status == status)&&const DeepCollectionEquality().equals(other._requirementsDue, _requirementsDue)&&(identical(other.disabledReason, disabledReason) || other.disabledReason == disabledReason)&&(identical(other.testMode, testMode) || other.testMode == testMode)&&(identical(other.canOpenDashboard, canOpenDashboard) || other.canOpenDashboard == canOpenDashboard)&&(identical(other.onlinePaymentsAvailable, onlinePaymentsAvailable) || other.onlinePaymentsAvailable == onlinePaymentsAvailable));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,onboardingStarted,detailsSubmitted,chargesEnabled,payoutsEnabled,optedIn,dashboardUrl,mock,status,const DeepCollectionEquality().hash(_requirementsDue),disabledReason,testMode,canOpenDashboard,onlinePaymentsAvailable);

@override
String toString() {
  return 'VenuePaymentState(onboardingStarted: $onboardingStarted, detailsSubmitted: $detailsSubmitted, chargesEnabled: $chargesEnabled, payoutsEnabled: $payoutsEnabled, optedIn: $optedIn, dashboardUrl: $dashboardUrl, mock: $mock, status: $status, requirementsDue: $requirementsDue, disabledReason: $disabledReason, testMode: $testMode, canOpenDashboard: $canOpenDashboard, onlinePaymentsAvailable: $onlinePaymentsAvailable)';
}


}

/// @nodoc
abstract mixin class _$VenuePaymentStateCopyWith<$Res> implements $VenuePaymentStateCopyWith<$Res> {
  factory _$VenuePaymentStateCopyWith(_VenuePaymentState value, $Res Function(_VenuePaymentState) _then) = __$VenuePaymentStateCopyWithImpl;
@override @useResult
$Res call({
 bool onboardingStarted, bool detailsSubmitted, bool chargesEnabled, bool payoutsEnabled, bool optedIn, String? dashboardUrl, bool mock, String status, List<String> requirementsDue, String? disabledReason, bool testMode, bool canOpenDashboard, bool onlinePaymentsAvailable
});




}
/// @nodoc
class __$VenuePaymentStateCopyWithImpl<$Res>
    implements _$VenuePaymentStateCopyWith<$Res> {
  __$VenuePaymentStateCopyWithImpl(this._self, this._then);

  final _VenuePaymentState _self;
  final $Res Function(_VenuePaymentState) _then;

/// Create a copy of VenuePaymentState
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? onboardingStarted = null,Object? detailsSubmitted = null,Object? chargesEnabled = null,Object? payoutsEnabled = null,Object? optedIn = null,Object? dashboardUrl = freezed,Object? mock = null,Object? status = null,Object? requirementsDue = null,Object? disabledReason = freezed,Object? testMode = null,Object? canOpenDashboard = null,Object? onlinePaymentsAvailable = null,}) {
  return _then(_VenuePaymentState(
onboardingStarted: null == onboardingStarted ? _self.onboardingStarted : onboardingStarted // ignore: cast_nullable_to_non_nullable
as bool,detailsSubmitted: null == detailsSubmitted ? _self.detailsSubmitted : detailsSubmitted // ignore: cast_nullable_to_non_nullable
as bool,chargesEnabled: null == chargesEnabled ? _self.chargesEnabled : chargesEnabled // ignore: cast_nullable_to_non_nullable
as bool,payoutsEnabled: null == payoutsEnabled ? _self.payoutsEnabled : payoutsEnabled // ignore: cast_nullable_to_non_nullable
as bool,optedIn: null == optedIn ? _self.optedIn : optedIn // ignore: cast_nullable_to_non_nullable
as bool,dashboardUrl: freezed == dashboardUrl ? _self.dashboardUrl : dashboardUrl // ignore: cast_nullable_to_non_nullable
as String?,mock: null == mock ? _self.mock : mock // ignore: cast_nullable_to_non_nullable
as bool,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,requirementsDue: null == requirementsDue ? _self._requirementsDue : requirementsDue // ignore: cast_nullable_to_non_nullable
as List<String>,disabledReason: freezed == disabledReason ? _self.disabledReason : disabledReason // ignore: cast_nullable_to_non_nullable
as String?,testMode: null == testMode ? _self.testMode : testMode // ignore: cast_nullable_to_non_nullable
as bool,canOpenDashboard: null == canOpenDashboard ? _self.canOpenDashboard : canOpenDashboard // ignore: cast_nullable_to_non_nullable
as bool,onlinePaymentsAvailable: null == onlinePaymentsAvailable ? _self.onlinePaymentsAvailable : onlinePaymentsAvailable // ignore: cast_nullable_to_non_nullable
as bool,
  ));
}


}


/// @nodoc
mixin _$PaymentExternalLink {

 String get url; bool get mock;
/// Create a copy of PaymentExternalLink
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$PaymentExternalLinkCopyWith<PaymentExternalLink> get copyWith => _$PaymentExternalLinkCopyWithImpl<PaymentExternalLink>(this as PaymentExternalLink, _$identity);

  /// Serializes this PaymentExternalLink to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is PaymentExternalLink&&(identical(other.url, url) || other.url == url)&&(identical(other.mock, mock) || other.mock == mock));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,url,mock);

@override
String toString() {
  return 'PaymentExternalLink(url: $url, mock: $mock)';
}


}

/// @nodoc
abstract mixin class $PaymentExternalLinkCopyWith<$Res>  {
  factory $PaymentExternalLinkCopyWith(PaymentExternalLink value, $Res Function(PaymentExternalLink) _then) = _$PaymentExternalLinkCopyWithImpl;
@useResult
$Res call({
 String url, bool mock
});




}
/// @nodoc
class _$PaymentExternalLinkCopyWithImpl<$Res>
    implements $PaymentExternalLinkCopyWith<$Res> {
  _$PaymentExternalLinkCopyWithImpl(this._self, this._then);

  final PaymentExternalLink _self;
  final $Res Function(PaymentExternalLink) _then;

/// Create a copy of PaymentExternalLink
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? url = null,Object? mock = null,}) {
  return _then(_self.copyWith(
url: null == url ? _self.url : url // ignore: cast_nullable_to_non_nullable
as String,mock: null == mock ? _self.mock : mock // ignore: cast_nullable_to_non_nullable
as bool,
  ));
}

}


/// Adds pattern-matching-related methods to [PaymentExternalLink].
extension PaymentExternalLinkPatterns on PaymentExternalLink {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _PaymentExternalLink value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _PaymentExternalLink() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _PaymentExternalLink value)  $default,){
final _that = this;
switch (_that) {
case _PaymentExternalLink():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _PaymentExternalLink value)?  $default,){
final _that = this;
switch (_that) {
case _PaymentExternalLink() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String url,  bool mock)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _PaymentExternalLink() when $default != null:
return $default(_that.url,_that.mock);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String url,  bool mock)  $default,) {final _that = this;
switch (_that) {
case _PaymentExternalLink():
return $default(_that.url,_that.mock);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String url,  bool mock)?  $default,) {final _that = this;
switch (_that) {
case _PaymentExternalLink() when $default != null:
return $default(_that.url,_that.mock);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _PaymentExternalLink implements PaymentExternalLink {
  const _PaymentExternalLink({required this.url, required this.mock});
  factory _PaymentExternalLink.fromJson(Map<String, dynamic> json) => _$PaymentExternalLinkFromJson(json);

@override final  String url;
@override final  bool mock;

/// Create a copy of PaymentExternalLink
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$PaymentExternalLinkCopyWith<_PaymentExternalLink> get copyWith => __$PaymentExternalLinkCopyWithImpl<_PaymentExternalLink>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$PaymentExternalLinkToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _PaymentExternalLink&&(identical(other.url, url) || other.url == url)&&(identical(other.mock, mock) || other.mock == mock));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,url,mock);

@override
String toString() {
  return 'PaymentExternalLink(url: $url, mock: $mock)';
}


}

/// @nodoc
abstract mixin class _$PaymentExternalLinkCopyWith<$Res> implements $PaymentExternalLinkCopyWith<$Res> {
  factory _$PaymentExternalLinkCopyWith(_PaymentExternalLink value, $Res Function(_PaymentExternalLink) _then) = __$PaymentExternalLinkCopyWithImpl;
@override @useResult
$Res call({
 String url, bool mock
});




}
/// @nodoc
class __$PaymentExternalLinkCopyWithImpl<$Res>
    implements _$PaymentExternalLinkCopyWith<$Res> {
  __$PaymentExternalLinkCopyWithImpl(this._self, this._then);

  final _PaymentExternalLink _self;
  final $Res Function(_PaymentExternalLink) _then;

/// Create a copy of PaymentExternalLink
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? url = null,Object? mock = null,}) {
  return _then(_PaymentExternalLink(
url: null == url ? _self.url : url // ignore: cast_nullable_to_non_nullable
as String,mock: null == mock ? _self.mock : mock // ignore: cast_nullable_to_non_nullable
as bool,
  ));
}


}

// dart format on
