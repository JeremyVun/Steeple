namespace Steeple.Admin.ViewModels.Admin;

public sealed record AdminShellViewModel(IReadOnlyList<AdminMetric> Metrics);

public sealed record AdminMetric(string Label, string Value, string Detail, string Tone);

/// <summary>A room, for the takedown surface — the operator's only listing-status lever.</summary>
public sealed record AdminListingRow(
    Guid Id,
    string Venue,
    string Room,
    string Suburb,
    string Status,
    string Price,
    int PendingApplications,
    int ActiveBookings);

/// <summary>
/// A room awaiting the one human gate: a host's first listing (`v2_migration/design.md` D2).
/// Carries everything the decision needs — listing preview, venue, and any evidence the host
/// submitted — because approve/decline is a single decision with no separate verification step.
/// </summary>
public sealed record AdminPublishRequestRow(
    Guid RoomId,
    string Venue,
    string Room,
    string Suburb,
    string AddressLine,
    int Capacity,
    string Price,
    int PhotoCount,
    DateTimeOffset RequestedAt,
    string Description,
    IReadOnlyList<string> PhotoThumbUrls,
    IReadOnlyList<string> HostNames,
    AdminVenueEvidence? Evidence);

/// <summary>Ownership / lease-authority evidence a host attached, shown inside its queue item.</summary>
public sealed record AdminVenueEvidence(
    string ContactName,
    string? ContactEmail,
    string EvidenceSummary,
    DateTimeOffset SubmittedAt,
    IReadOnlyList<AdminVenueEvidenceDocument> Documents);

/// <summary>One externally hosted proof document link (the API stores links, never contents).</summary>
public sealed record AdminVenueEvidenceDocument(string Label, string ExternalUrl);

/// <summary>A submitted review comment, for the hide/unhide lever.</summary>
public sealed record AdminRatingCommentRow(
    Guid Id,
    string Venue,
    string Room,
    string RaterName,
    string RatedSide,
    int Stars,
    string Comment,
    DateTimeOffset CreatedAt,
    DateTimeOffset? HiddenAt);

public sealed record AdminReviewQueueViewModel(
    IReadOnlyList<AdminPublishRequestRow> PublishRequests,
    IReadOnlyList<AdminRatingCommentRow> RatingComments);

public sealed record AdminVenueManagerRow(
    Guid Id,
    string Venue,
    string UserName,
    string UserEmail,
    DateTimeOffset CreatedAt);

public sealed record AdminVenueOption(Guid Id, string Name);

public sealed record AdminWorkspaceViewModel(
    AdminShellViewModel Shell,
    AdminReviewQueueViewModel ReviewQueue,
    IReadOnlyList<AdminListingRow> Listings,
    IReadOnlyList<AdminVenueManagerRow> VenueManagers,
    IReadOnlyList<AdminVenueOption> VenueOptions);
