/// Wire-enum conventions (MOBILE_CONTRACTS §5).
///
/// `/api/v1` sends stable camelCase tokens (`"stepFreeAccess"`); clients
/// humanize for display and MUST tolerate tokens they don't know — an unknown
/// value renders humanized, never crashes (CONTRACTS §1.1 additive rule).
/// Token registry: CONTRACTS.md §2.1.
library;

/// Parses a single-value wire enum. Every wire enum in the app has a trailing
/// `unknown` member and a `tokens` map of the known wire strings; models that
/// display the value also keep the raw string (e.g. `statusRaw`) so `unknown`
/// can still render its humanized token (DESIGN_SYSTEM §8.4 last row).
T parseWireEnum<T>(String? raw, Map<String, T> tokens, T unknown) =>
    raw == null ? unknown : (tokens[raw] ?? unknown);

/// Humanizes a camelCase wire token for display: `stepFreeAccess` →
/// "Step free access". Sentence case per DESIGN_SYSTEM §10; unknown tokens
/// flow through this too — forward-compatible by construction.
String humanizeWireToken(String token) {
  if (token.isEmpty) return token;
  final buffer = StringBuffer(token[0].toUpperCase());
  for (var i = 1; i < token.length; i++) {
    final ch = token[i];
    final isUpper = ch.toUpperCase() == ch && ch.toLowerCase() != ch;
    if (isUpper) {
      buffer.write(' ');
      buffer.write(ch.toLowerCase());
    } else {
      buffer.write(ch);
    }
  }
  return buffer.toString();
}

/// Known display labels that beat naive humanization (wifi, A/V, …).
/// Flags-style lists (`activities`, `accessibility`, `amenities`) stay
/// `List<String>` of raw tokens end-to-end; this is the one display mapping.
String wireTokenLabel(String token) =>
    _overrides[token] ?? humanizeWireToken(token);

const _overrides = <String, String>{
  'wifi': 'Wi-Fi',
  'audioVisual': 'Audio-visual',
  'airConditioning': 'Air conditioning',
  'noShow': 'No-show',
  'oneOff': 'One-off',
  'recurringWeekly': 'Weekly',
};

/// Complete hand-kept mirror of the API's enum-backed wire-token sets.
/// `test/wire_token_contract_test.dart` compares it with the shared golden
/// fixture that C# and web read too; model-specific enum maps are checked
/// against these same rows.
const knownWireTokenSets = <String, List<String>>{
  'accessibilityFeatures': [
    'stepFreeAccess',
    'accessibleRestroom',
    'accessibleParking',
    'hearingLoop',
    'liftAccess',
  ],
  'activityTypes': [
    'children',
    'sports',
    'community',
    'religious',
    'arts',
    'education',
    'music',
  ],
  'agreementDocumentTypes': ['tos', 'privacy'],
  'amenities': [
    'parking',
    'kitchen',
    'restrooms',
    'wifi',
    'audioVisual',
    'tables',
    'chairs',
    'heating',
    'airConditioning',
    'stage',
    'piano',
  ],
  'applicationStatuses': [
    'pending',
    'needsInfo',
    'counterOffered',
    'approved',
    'declined',
    'withdrawn',
    'expired',
  ],
  'authProviders': ['google', 'apple', 'dev'],
  'bookingModes': ['instant', 'manual'],
  'bookingReminderKinds': ['comingUp', 'tomorrow'],
  'bookingStatuses': ['confirmed', 'completed', 'cancelled'],
  'bookingTypes': ['oneOff', 'recurring'],
  'counterOfferStatuses': [
    'open',
    'accepted',
    'declinedByOrganizer',
    'superseded',
    'lapsed',
  ],
  'notificationTypes': [
    'applicationReceived',
    'applicationMessage',
    'applicationApproved',
    'applicationDeclined',
    'bookingCancelled',
    'renewalDue',
    'ratingReceived',
    'listingApproved',
    'listingDeclined',
    'counterOfferReceived',
    'counterOfferAccepted',
    'counterOfferDeclined',
    'paymentFailed',
    'occurrenceRefunded',
    'bookingReceived',
    'bookingReminder',
  ],
  'occurrenceStatuses': ['scheduled', 'occurred', 'noShow', 'cancelled'],
  'paymentStatuses': [
    'pending',
    'requiresAction',
    'succeeded',
    'failed',
    'refunded',
    'disputed',
  ],
  'ratingRateeTypes': ['organizer', 'venue'],
  'roomStatuses': ['draft', 'published', 'unlisted'],
  'scheduleFrequencies': ['oneOff', 'recurringWeekly'],
  'venueTypes': ['church', 'publicSpace', 'other'],
  'venueVerificationStatuses': [
    'unverified',
    'pending',
    'declined',
    'verified',
  ],
  'weekdays': [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ],
};

const knownFeatureFlagKeys = <String>[
  'listing.availability',
  'manage.first_listing_review_required',
  'manage.open_hours_required',
  'booking.counter_offers',
  'payments.enabled',
  'mobile.apply_enabled',
  'mobile.manage_enabled',
  'mobile.force_upgrade',
];

const knownPublicFeatureFlagKeys = <String>[
  'payments.enabled',
  'mobile.apply_enabled',
  'mobile.manage_enabled',
  'mobile.force_upgrade',
];

/// Typed helpers over the raw activity tokens (CONTRACTS §2.1) — the
/// `List<String>` stays the source of truth.
extension ActivityTokens on List<String> {
  bool get acceptsChildren => contains('children');
}

/// Accessibility tokens a room provides (CONTRACTS §2.1).
extension AccessibilityTokens on List<String> {
  bool get hasStepFreeAccess => contains('stepFreeAccess');
}
