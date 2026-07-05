/// Single-value wire enums (MOBILE_CONTRACTS §5, CONTRACTS.md §2.1 + §5).
///
/// Each enum carries a trailing `unknown` member and a `tokens` map of the
/// known wire strings; parse with `parseWireEnum` from `wire_tokens.dart`.
/// Models that expose one of these also keep the raw wire string (e.g.
/// `status`) so `unknown` values still render humanized
/// (`wireTokenLabel(status)`) instead of crashing (CONTRACTS §1 additive rule).
library;

/// `Application.status` (CONTRACTS §5).
enum ApplicationStatus {
  pending,
  needsInfo,
  counterOffered,
  approved,
  declined,
  withdrawn,
  expired,
  unknown;

  static const tokens = <String, ApplicationStatus>{
    'pending': ApplicationStatus.pending,
    'needsInfo': ApplicationStatus.needsInfo,
    'counterOffered': ApplicationStatus.counterOffered,
    'approved': ApplicationStatus.approved,
    'declined': ApplicationStatus.declined,
    'withdrawn': ApplicationStatus.withdrawn,
    'expired': ApplicationStatus.expired,
  };
}

/// `CounterOffer.status` (CONTRACTS §5 "Counter-offers").
enum CounterOfferStatus {
  open,
  accepted,
  declinedByOrganizer,
  superseded,
  lapsed,
  unknown;

  static const tokens = <String, CounterOfferStatus>{
    'open': CounterOfferStatus.open,
    'accepted': CounterOfferStatus.accepted,
    'declinedByOrganizer': CounterOfferStatus.declinedByOrganizer,
    'superseded': CounterOfferStatus.superseded,
    'lapsed': CounterOfferStatus.lapsed,
  };
}

/// `Booking.status` (CONTRACTS §5).
enum BookingStatus {
  confirmed,
  completed,
  cancelled,
  unknown;

  static const tokens = <String, BookingStatus>{
    'confirmed': BookingStatus.confirmed,
    'completed': BookingStatus.completed,
    'cancelled': BookingStatus.cancelled,
  };
}

/// `Occurrence.status` (CONTRACTS §5).
enum OccurrenceStatus {
  scheduled,
  occurred,
  noShow,
  cancelled,
  unknown;

  static const tokens = <String, OccurrenceStatus>{
    'scheduled': OccurrenceStatus.scheduled,
    'occurred': OccurrenceStatus.occurred,
    'noShow': OccurrenceStatus.noShow,
    'cancelled': OccurrenceStatus.cancelled,
  };
}

/// `ProposedSchedule.frequency` (CONTRACTS §5).
enum ScheduleFrequency {
  oneOff,
  recurringWeekly,
  unknown;

  static const tokens = <String, ScheduleFrequency>{
    'oneOff': ScheduleFrequency.oneOff,
    'recurringWeekly': ScheduleFrequency.recurringWeekly,
  };
}

/// `Booking.type` (CONTRACTS §5).
enum BookingType {
  oneOff,
  recurring,
  unknown;

  static const tokens = <String, BookingType>{
    'oneOff': BookingType.oneOff,
    'recurring': BookingType.recurring,
  };
}

/// `Venue.venueType` (CONTRACTS §2.1).
enum VenueType {
  church,
  publicSpace,
  other,
  unknown;

  static const tokens = <String, VenueType>{
    'church': VenueType.church,
    'publicSpace': VenueType.publicSpace,
    'other': VenueType.other,
  };
}

/// `ManagedRoom(Summary).status` (CONTRACTS §2.1, Manage §6).
enum ManagedRoomStatus {
  draft,
  published,
  unlisted,
  unknown;

  static const tokens = <String, ManagedRoomStatus>{
    'draft': ManagedRoomStatus.draft,
    'published': ManagedRoomStatus.published,
    'unlisted': ManagedRoomStatus.unlisted,
  };
}

/// `AppNotification.type` (CONTRACTS §5).
enum NotificationType {
  applicationReceived,
  applicationMessage,
  applicationApproved,
  applicationDeclined,
  bookingCancelled,
  renewalDue,
  ratingReceived,
  unknown;

  static const tokens = <String, NotificationType>{
    'applicationReceived': NotificationType.applicationReceived,
    'applicationMessage': NotificationType.applicationMessage,
    'applicationApproved': NotificationType.applicationApproved,
    'applicationDeclined': NotificationType.applicationDeclined,
    'bookingCancelled': NotificationType.bookingCancelled,
    'renewalDue': NotificationType.renewalDue,
    'ratingReceived': NotificationType.ratingReceived,
  };
}
