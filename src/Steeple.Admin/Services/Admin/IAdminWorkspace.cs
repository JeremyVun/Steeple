using Steeple.Admin.ViewModels.Admin;

namespace Steeple.Admin.Services.Admin;

/// <summary>
/// Everything the operator dashboard can read or do. Three action surfaces plus one takedown
/// lever — see `docs/backlog/v2_migration/design.md` D3; anything else an operator ever needs is
/// a psql runbook, not a screen.
/// </summary>
public interface IAdminWorkspace
{
    AdminWorkspaceViewModel Snapshot();

    /// <summary>
    /// Links a user (by their sign-in email) as a manager of a venue — the concierge step that
    /// makes a church's SSO account a provider. Returns a human-readable error, or null on success.
    /// </summary>
    string? LinkVenueManager(Guid venueId, string email);

    /// <summary>Removes a venue-manager link.</summary>
    void UnlinkVenueManager(Guid venueManagerId);

    /// <summary>
    /// The venue-scoped human gate: decides an unverified venue's first-listing publish request.
    /// Approve verifies the venue, publishes the room, stamps first approval (which permits later
    /// rooms at that venue) and writes a <c>listingApproved</c> inbox row; decline clears the
    /// request and writes <c>listingDeclined</c> with the note. Any evidence the host submitted is
    /// consumed by the same decision. Returns a human-readable error, or null on success.
    /// <paramref name="operatorUser"/> is the authelia-forwarded identity, for the audit line.
    /// </summary>
    string? DecidePublishRequest(Guid roomId, bool approve, string? note, string operatorUser);

    /// <summary>
    /// Takedown lever (abuse/DMCA): immediately pulls one published room back to Unlisted and
    /// stamps an operator-controlled suspension marker that prevents manager relisting. Existing
    /// booking commitments remain in the booking system and can be handled separately.
    /// </summary>
    string? UnlistRoom(Guid roomId, string operatorUser);

    /// <summary>Hides or restores a review comment from public rating reads and aggregates.</summary>
    void SetRatingHidden(Guid ratingId, bool hidden, string operatorUser);
}
