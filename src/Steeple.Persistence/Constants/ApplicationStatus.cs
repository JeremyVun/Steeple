
namespace Steeple.Persistence.Constants;
/// <summary>
/// State of an <see cref="Models.Application"/>. Transitions
/// (Pending → NeedsInfo ⇄ → Approved | Declined | Withdrawn | Expired) are validated in the
/// Applications service (SYSTEM_DESIGN §5); the wire representation is the camelCase token.
/// </summary>
public enum ApplicationStatus
{
    /// <summary>Submitted, awaiting the provider's decision.</summary>
    Pending = 0,

    /// <summary>The provider asked a question; the organizer's answer returns it to Pending.</summary>
    NeedsInfo = 1,

    /// <summary>Approved by a venue manager (creates the booking once Phase 3 lands).</summary>
    Approved = 2,

    /// <summary>Declined by a venue manager.</summary>
    Declined = 3,

    /// <summary>Withdrawn by the organizer before a decision.</summary>
    Withdrawn = 4,

    /// <summary>Lapsed undecided past its expiry window.</summary>
    Expired = 5,
}
