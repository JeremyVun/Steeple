// Identity wire shapes (CONTRACTS.md §4). Mirrors SessionUserDto, MeResponse,
// AgreementDto, SessionResponse in Steeple.Api/Contracts/Identity exactly.
import 'package:freezed_annotation/freezed_annotation.dart';

part 'user.freezed.dart';
part 'user.g.dart';

/// The signed-in user, as returned both at session creation
/// (`SessionResponse.user`) and shared with `MeResponse`'s own profile
/// fields.
@freezed
abstract class UserProfile with _$UserProfile {
  const factory UserProfile({
    required String id,
    required String displayName,
    String? email,
    required DateTime createdAtUtc,
  }) = _UserProfile;

  factory UserProfile.fromJson(Map<String, dynamic> json) =>
      _$UserProfileFromJson(json);
}

/// One recorded acceptance of a legal document version.
@freezed
abstract class Agreement with _$Agreement {
  const factory Agreement({
    required String docType,
    required String version,
    required DateTime acceptedAtUtc,
  }) = _Agreement;

  factory Agreement.fromJson(Map<String, dynamic> json) =>
      _$AgreementFromJson(json);
}

/// `GET /api/v1/me` response: profile plus recorded legal-document
/// acceptances.
@freezed
abstract class MeResponse with _$MeResponse {
  const factory MeResponse({
    required String id,
    required String displayName,
    String? email,
    required DateTime createdAtUtc,
    @Default(<Agreement>[]) List<Agreement> agreements,
  }) = _MeResponse;

  factory MeResponse.fromJson(Map<String, dynamic> json) =>
      _$MeResponseFromJson(json);
}

/// `POST /api/v1/auth/sessions` response: a freshly issued token pair plus
/// the resolved user.
@freezed
abstract class AuthSession with _$AuthSession {
  const factory AuthSession({
    required String accessToken,
    required String refreshToken,
    required UserProfile user,
    required bool isNewUser,
  }) = _AuthSession;

  factory AuthSession.fromJson(Map<String, dynamic> json) =>
      _$AuthSessionFromJson(json);
}
