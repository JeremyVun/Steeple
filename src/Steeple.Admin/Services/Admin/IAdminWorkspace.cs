using Steeple.Admin.ViewModels.Admin;

namespace Steeple.Admin.Services.Admin;

public interface IAdminWorkspace
{
    AdminWorkspaceViewModel Snapshot();

    void ToggleFeatureFlag(string key, bool enabled);

    /// <summary>
    /// Bulk room-status change. Rooms with upcoming confirmed occurrences can't leave Published
    /// (listing lifecycle honors bookings); returns a human-readable note naming any skipped
    /// rooms, or null when everything applied.
    /// </summary>
    string? UpdateListingStatuses(IReadOnlyCollection<Guid> listingIds, string status);

    void UpdateUserStatuses(IReadOnlyCollection<Guid> userIds, string status);

    /// <summary>Manual state repair (ROADMAP Phase 2): force applications to a status.</summary>
    void UpdateApplicationStatuses(IReadOnlyCollection<Guid> applicationIds, string status);

    /// <summary>
    /// Links a user (by their sign-in email) as a manager of a venue — the concierge step that
    /// makes a church's Google account a provider. Returns a human-readable error, or null on success.
    /// </summary>
    string? LinkVenueManager(Guid venueId, string email);

    /// <summary>Removes a venue-manager link.</summary>
    void UnlinkVenueManager(Guid venueManagerId);

    /// <summary>
    /// Decides a publish request (Phase 5 moderation gate). Approve publishes the room and
    /// stamps first approval; decline just clears the request. Either way the venue's managers
    /// get an inbox notification (with the optional <paramref name="note"/>). Returns a
    /// human-readable error, or null on success. <paramref name="operatorUser"/> is the
    /// authelia-forwarded identity, for the audit log line.
    /// </summary>
    string? DecidePublishRequest(Guid roomId, bool approve, string? note, string operatorUser);

    /// <summary>
    /// Decides a host's venue ownership / lease-authority verification request. Approval stamps
    /// the venue as identity verified; decline leaves it unverified and records the operator note.
    /// </summary>
    string? DecideVenueVerification(Guid requestId, bool approve, string? note, string operatorUser);

    /// <summary>Clears the provider-edited flag on a room (edited-listings review feed).</summary>
    void MarkRoomReviewed(Guid roomId, string operatorUser);

    /// <summary>Clears the provider-edited flag on a venue (edited-listings review feed).</summary>
    void MarkVenueReviewed(Guid venueId, string operatorUser);

    /// <summary>Hides or restores a review comment from public rating reads and aggregates.</summary>
    void SetRatingHidden(Guid ratingId, bool hidden, string operatorUser);
}
