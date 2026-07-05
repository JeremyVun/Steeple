namespace Steeple.Persistence.Models;

/// <summary>Metadata for one proof document linked from a venue verification request.</summary>
public class VenueVerificationDocument
{
    /// <summary>Primary key.</summary>
    public Guid Id { get; set; }

    /// <summary>Foreign key to the verification request.</summary>
    public Guid RequestId { get; set; }

    /// <summary>Host-provided label, e.g. lease, deed, or authorization letter.</summary>
    public string Label { get; set; } = "";

    /// <summary>External or signed URL where the operator can inspect the document.</summary>
    public string ExternalUrl { get; set; } = "";

    /// <summary>Creation timestamp (UTC).</summary>
    public DateTimeOffset CreatedAtUtc { get; set; }

    /// <summary>Navigation to the verification request.</summary>
    public VenueVerificationRequest? Request { get; set; }
}
