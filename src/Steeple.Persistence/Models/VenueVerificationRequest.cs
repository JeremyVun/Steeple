namespace Steeple.Persistence.Models;

/// <summary>
/// A host-submitted request to prove they own the venue or are authorized to lease rooms for it.
/// Raw documents are not stored here; only document labels and external/signed links are kept.
/// </summary>
public class VenueVerificationRequest
{
    /// <summary>Primary key.</summary>
    public Guid Id { get; set; }

    /// <summary>Foreign key to the venue being verified.</summary>
    public Guid VenueId { get; set; }

    /// <summary>Foreign key to the host who submitted the request.</summary>
    public Guid RequestedByUserId { get; set; }

    /// <summary>Current operator review state.</summary>
    public VenueVerificationStatus Status { get; set; }

    /// <summary>Name of the person the operator should contact about the evidence.</summary>
    public string ContactName { get; set; } = "";

    /// <summary>Optional contact email for follow-up.</summary>
    public string? ContactEmail { get; set; }

    /// <summary>Host explanation of the documents and their authority over the venue.</summary>
    public string EvidenceSummary { get; set; } = "";

    /// <summary>The host attested that they have authority to list / lease rooms for this venue.</summary>
    public bool AttestedAuthority { get; set; }

    /// <summary>Submission timestamp (UTC).</summary>
    public DateTimeOffset RequestedAtUtc { get; set; }

    /// <summary>Decision timestamp (UTC), null while pending.</summary>
    public DateTimeOffset? DecidedAtUtc { get; set; }

    /// <summary>Operator identity from Admin's forwarded auth header.</summary>
    public string? DecidedBy { get; set; }

    /// <summary>Optional operator note explaining approval or decline.</summary>
    public string? DecisionNote { get; set; }

    /// <summary>Navigation to the venue being verified.</summary>
    public Venue? Venue { get; set; }

    /// <summary>Navigation to the submitting host.</summary>
    public User? RequestedByUser { get; set; }

    /// <summary>Document metadata supplied by the host.</summary>
    public ICollection<VenueVerificationDocument> Documents { get; set; } = new List<VenueVerificationDocument>();
}
