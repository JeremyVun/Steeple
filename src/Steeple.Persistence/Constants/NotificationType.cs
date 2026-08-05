
namespace Steeple.Persistence.Constants;
/// <summary>
/// What a <see cref="Models.Notification"/> inbox row announces (CONTRACTS §5 — the wire token is
/// the camelCase member name; the set only ever grows, additively).
/// </summary>
public enum NotificationType
{
    /// <summary>A new application arrived for a venue the recipient manages.</summary>
    ApplicationReceived = 0,

    /// <summary>The other party wrote on an application thread.</summary>
    ApplicationMessage = 1,

    /// <summary>The recipient's application was approved.</summary>
    ApplicationApproved = 2,

    /// <summary>The recipient's application was declined.</summary>
    ApplicationDeclined = 3,

    /// <summary>A booking the recipient is party to was cancelled (Phase 3).</summary>
    BookingCancelled = 4,

    /// <summary>A recurring booking's term is ending soon (Phase 3 renewal seam).</summary>
    RenewalDue = 5,

    /// <summary>The recipient received a rating (Phase 6).</summary>
    RatingReceived = 6,

    /// <summary>A room the recipient manages passed moderation and is now published (Phase 5).</summary>
    ListingApproved = 7,

    /// <summary>A room the recipient manages was declined in moderation (Phase 5).</summary>
    ListingDeclined = 8,

    /// <summary>The host proposed a counter-offer schedule on the recipient's application.</summary>
    CounterOfferReceived = 9,

    /// <summary>The organizer accepted the host's counter-offer (booking created).</summary>
    CounterOfferAccepted = 10,

    /// <summary>The organizer declined the host's counter-offer (application back to pending).</summary>
    CounterOfferDeclined = 11,

    /// <summary>A charge for one of the recipient's booking occurrences failed (failure ladder).</summary>
    PaymentFailed = 12,

    /// <summary>A charged occurrence was cancelled and the recipient's payment refunded in full.</summary>
    OccurrenceRefunded = 13,

    /// <summary>An instant booking landed at a venue the recipient manages (host-side notice).</summary>
    BookingReceived = 14,

    /// <summary>
    /// An upcoming booking occurrence is close (the reminder worker's "coming up" / "tomorrow"
    /// nudges; the payload's <c>reminderKind</c> says which). Deliberately numbered well clear of
    /// the run of values above so parallel additions can land in that run without renumbering.
    /// </summary>
    BookingReminder = 21,
}
