// Complete hand-kept mirror of the API's wire-token registry. The API remains
// authoritative; tools/wire-tokens-test.mjs compares this module with the one
// shared golden table read by C# and mobile.

const frozen = (values) => Object.freeze(values);

export const WIRE_TOKEN_SETS = Object.freeze({
  accessibilityFeatures: frozen([
    'stepFreeAccess',
    'accessibleRestroom',
    'accessibleParking',
    'hearingLoop',
    'liftAccess',
  ]),
  activityTypes: frozen(['children', 'sports', 'community', 'religious', 'arts', 'education', 'music']),
  agreementDocumentTypes: frozen(['tos', 'privacy']),
  amenities: frozen([
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
  ]),
  applicationStatuses: frozen([
    'pending',
    'needsInfo',
    'counterOffered',
    'approved',
    'declined',
    'withdrawn',
    'expired',
  ]),
  authProviders: frozen(['google', 'apple', 'dev']),
  bookingModes: frozen(['instant', 'manual']),
  bookingReminderKinds: frozen(['comingUp', 'tomorrow']),
  bookingStatuses: frozen(['confirmed', 'completed', 'cancelled']),
  bookingTypes: frozen(['oneOff', 'recurring']),
  counterOfferStatuses: frozen(['open', 'accepted', 'declinedByOrganizer', 'superseded', 'lapsed']),
  notificationTypes: frozen([
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
  ]),
  occurrenceStatuses: frozen(['scheduled', 'occurred', 'noShow', 'cancelled']),
  paymentStatuses: frozen(['pending', 'requiresAction', 'succeeded', 'failed', 'refunded', 'disputed']),
  ratingRateeTypes: frozen(['organizer', 'venue']),
  roomStatuses: frozen(['draft', 'published', 'unlisted']),
  scheduleFrequencies: frozen(['oneOff', 'recurringWeekly']),
  venueTypes: frozen(['church', 'publicSpace', 'other']),
  venueVerificationStatuses: frozen(['unverified', 'pending', 'declined', 'verified']),
  weekdays: frozen(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']),
});

export const FEATURE_FLAG_KEYS = Object.freeze({
  listingAvailability: 'listing.availability',
  manageFirstListingReviewRequired: 'manage.first_listing_review_required',
  manageOpenHoursRequired: 'manage.open_hours_required',
  bookingCounterOffers: 'booking.counter_offers',
  paymentsEnabled: 'payments.enabled',
  mobileApplyEnabled: 'mobile.apply_enabled',
  mobileManageEnabled: 'mobile.manage_enabled',
  mobileForceUpgrade: 'mobile.force_upgrade',
});

export const ALL_FEATURE_FLAG_KEYS = frozen(Object.values(FEATURE_FLAG_KEYS));
export const PUBLIC_FEATURE_FLAG_KEYS = frozen([
  FEATURE_FLAG_KEYS.paymentsEnabled,
  FEATURE_FLAG_KEYS.mobileApplyEnabled,
  FEATURE_FLAG_KEYS.mobileManageEnabled,
  FEATURE_FLAG_KEYS.mobileForceUpgrade,
]);
