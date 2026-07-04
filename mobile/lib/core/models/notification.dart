// Notification wire shapes (CONTRACTS.md §5). Mirrors NotificationDto in
// Steeple.Api/Contracts/Notifications, and the payload shapes built by
// `ApplicationService.BuildPayload` / `BookingService.BuildPayload`
// (both application-flavored and booking-flavored payloads are unioned into
// one tolerant superset here — every field is optional).
//
// Discrepancy vs the naming convention (flagged 2026-07-04): `readAt` is a
// full UTC instant (`DateTimeOffset?` in C#, `NotificationDto.ReadAt`) but
// doesn't carry the `Utc` suffix CONTRACTS.md's other instant fields use.
// CONTRACTS.md itself documents it as `readAt?` (not `readAtUtc?`), so this
// is a documented exception to the naming heuristic rather than a bug —
// modeled as `DateTime?` here since it genuinely is an instant, not a
// venue-local wall-clock value.
import 'package:freezed_annotation/freezed_annotation.dart';

import 'wire_enums.dart';
import 'wire_tokens.dart';

part 'notification.freezed.dart';
part 'notification.g.dart';

/// The union of display fields across notification payload shapes
/// (application-flavored: `applicationId`; booking-flavored: `bookingId`) —
/// a tolerant superset since the wire payload is a loosely-typed JSON
/// document keyed by notification `type`.
@freezed
abstract class NotificationPayload with _$NotificationPayload {
  const factory NotificationPayload({
    String? applicationId,
    String? bookingId,
    String? roomId,
    String? roomName,
    String? venueName,
    String? venueSlug,
    String? roomSlug,
    String? organizerName,
    String? status,

    /// Path-only canonical deep link (CONTRACTS §9 / MOBILE_CONTRACTS §7
    /// registry), e.g. `/inbox/applications/{id}`, `/bookings/{id}`.
    String? deepLink,
  }) = _NotificationPayload;

  factory NotificationPayload.fromJson(Map<String, dynamic> json) =>
      _$NotificationPayloadFromJson(json);
}

/// One inbox row (`GET /me/notifications`) — the payload of record; push/
/// email only point here.
@freezed
abstract class AppNotification with _$AppNotification {
  const AppNotification._();

  const factory AppNotification({
    required String id,

    /// Wire token, e.g. `applicationReceived` — unknown types route to a
    /// generic row.
    required String type,
    required DateTime createdAtUtc,
    DateTime? readAt,
    required NotificationPayload payload,
  }) = _AppNotification;

  factory AppNotification.fromJson(Map<String, dynamic> json) =>
      _$AppNotificationFromJson(json);

  NotificationType get typeValue =>
      parseWireEnum(type, NotificationType.tokens, NotificationType.unknown);
}
