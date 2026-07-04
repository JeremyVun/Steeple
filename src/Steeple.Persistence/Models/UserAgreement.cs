
namespace Steeple.Persistence.Models;
/// <summary>
/// A user's acceptance of one version of a legal document (ToS / Privacy). Append-only legal
/// record: one row per (user, doc, version), kept even after account anonymization.
/// </summary>
public class UserAgreement
{
    /// <summary>Primary key.</summary>
    public Guid Id { get; set; }

    /// <summary>Owning user.</summary>
    public Guid UserId { get; set; }

    /// <summary>Which document was accepted.</summary>
    public AgreementDocType DocType { get; set; }

    /// <summary>The document version accepted (e.g. a date stamp like "2026-07-04").</summary>
    public string Version { get; set; } = "";

    /// <summary>When acceptance was recorded (UTC).</summary>
    public DateTimeOffset AcceptedAtUtc { get; set; }

    /// <summary>Navigation to the owning user.</summary>
    public User? User { get; set; }
}
