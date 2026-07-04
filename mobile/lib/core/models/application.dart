// Application wire shapes (CONTRACTS.md §5). Mirrors ApplicationDto,
// OrganizerDto, ApplicationMessageDto, ScheduleDto in
// Steeple.Api/Contracts/Applications exactly. `ApplicationDraft` is a
// client-side form/request model, never deserialized from the wire.
import 'package:freezed_annotation/freezed_annotation.dart';

import 'wire_enums.dart';
import 'wire_tokens.dart';

part 'application.freezed.dart';
part 'application.g.dart';

/// A proposed usage schedule in venue-local wall-clock terms (CONTRACTS §2
/// "Local times", MOBILE_CONTRACTS §5). Dates/times stay `String` —
/// NEVER `DateTime` — because they are wall-clock, not UTC instants.
@freezed
abstract class ProposedSchedule with _$ProposedSchedule {
  const ProposedSchedule._();

  const factory ProposedSchedule({
    /// Wire token: `oneOff` or `recurringWeekly`.
    required String frequency,

    /// `yyyy-MM-dd`.
    required String startDate,

    /// `yyyy-MM-dd` — mandatory when recurring.
    String? endDate,

    /// Wire token (`monday`…`sunday`) — required when recurring.
    String? dayOfWeek,

    /// Venue-local start, `HH:mm` (24h).
    required String startTime,

    /// Venue-local end, `HH:mm` (24h), after [startTime].
    required String endTime,
  }) = _ProposedSchedule;

  factory ProposedSchedule.fromJson(Map<String, dynamic> json) =>
      _$ProposedScheduleFromJson(json);

  ScheduleFrequency get frequencyValue =>
      parseWireEnum(frequency, ScheduleFrequency.tokens, ScheduleFrequency.unknown);
}

/// The applying organizer as shown to the provider (rating summary arrives
/// Phase 6).
@freezed
abstract class Organizer with _$Organizer {
  const factory Organizer({
    required String id,
    required String displayName,
  }) = _Organizer;

  factory Organizer.fromJson(Map<String, dynamic> json) =>
      _$OrganizerFromJson(json);
}

/// One message on an application's ask/answer thread.
@freezed
abstract class ApplicationMessage with _$ApplicationMessage {
  const factory ApplicationMessage({
    required String id,
    required String senderId,
    required String body,
    required DateTime sentAtUtc,
  }) = _ApplicationMessage;

  factory ApplicationMessage.fromJson(Map<String, dynamic> json) =>
      _$ApplicationMessageFromJson(json);
}

/// An application as both parties see it (CONTRACTS §5). List endpoints
/// return `messages: []` (the thread stays behind the detail fetch);
/// `messageCount` is always set.
@freezed
abstract class Application with _$Application {
  const Application._();

  const factory Application({
    required String id,
    required String roomId,
    required String roomName,
    required String venueName,
    required String venueSlug,
    required String roomSlug,
    required Organizer organizer,
    required String activityType,
    required int groupSize,
    required ProposedSchedule schedule,
    required String intentText,

    /// Wire token: `pending | needsInfo | approved | declined | withdrawn |
    /// expired`.
    required String status,
    required DateTime createdAtUtc,
    DateTime? decidedAtUtc,
    required DateTime expiresAtUtc,

    /// Set once approved — the booking it created.
    String? bookingId,
    required int messageCount,
    @Default(<ApplicationMessage>[]) List<ApplicationMessage> messages,
  }) = _Application;

  factory Application.fromJson(Map<String, dynamic> json) =>
      _$ApplicationFromJson(json);

  ApplicationStatus get statusValue =>
      parseWireEnum(status, ApplicationStatus.tokens, ApplicationStatus.unknown);
}

/// Client-side in-progress apply form state
/// (`applyDraftProvider(roomId)`, MOBILE_CONTRACTS §8). `toJson` matches the
/// `POST /listings/{roomId}/applications` body minus `turnstileToken`, which
/// the repository adds at submit time.
@freezed
abstract class ApplicationDraft with _$ApplicationDraft {
  const factory ApplicationDraft({
    @Default('') String activityType,
    @Default(0) int groupSize,
    ProposedSchedule? schedule,
    @Default('') String intentText,
  }) = _ApplicationDraft;

  factory ApplicationDraft.fromJson(Map<String, dynamic> json) =>
      _$ApplicationDraftFromJson(json);
}
