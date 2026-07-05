namespace Steeple.Persistence.Constants;

/// <summary>
/// Review state for a venue ownership / lease-authority verification request.
/// </summary>
public enum VenueVerificationStatus
{
    /// <summary>The host submitted evidence and is waiting for an operator decision.</summary>
    Pending = 0,

    /// <summary>An operator accepted the evidence and marked the venue verified.</summary>
    Approved = 1,

    /// <summary>An operator rejected the evidence; the host may submit a new request.</summary>
    Declined = 2,
}
