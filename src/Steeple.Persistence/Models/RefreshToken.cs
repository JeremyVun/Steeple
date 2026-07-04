
namespace Steeple.Persistence.Models;
/// <summary>
/// One rotating refresh token. Only the SHA-256 hash of the opaque token is stored. A sign-in
/// starts a family (<see cref="FamilyId"/> = the session id); each refresh revokes the presented
/// row and inserts a successor in the same family. Presenting an already-revoked token is theft
/// evidence — the whole family is revoked (SYSTEM_DESIGN §6).
/// </summary>
public class RefreshToken
{
    /// <summary>Primary key.</summary>
    public Guid Id { get; set; }

    /// <summary>Owning user.</summary>
    public Guid UserId { get; set; }

    /// <summary>The sign-in session this token belongs to (the access token's <c>sid</c> claim).</summary>
    public Guid FamilyId { get; set; }

    /// <summary>SHA-256 hex of the opaque token value.</summary>
    public string TokenHash { get; set; } = "";

    /// <summary>Optional human label for the signed-in device ("iPhone 15", "Web").</summary>
    public string? DeviceLabel { get; set; }

    /// <summary>Client platform: <c>ios</c>, <c>android</c> or <c>web</c>.</summary>
    public string? Platform { get; set; }

    /// <summary>Creation timestamp (UTC).</summary>
    public DateTimeOffset CreatedAtUtc { get; set; }

    /// <summary>Idle expiry (UTC) — ~90 days from issuance.</summary>
    public DateTimeOffset ExpiresAtUtc { get; set; }

    /// <summary>Set when rotated away, signed out, or family-revoked. Null while usable.</summary>
    public DateTimeOffset? RevokedAtUtc { get; set; }

    /// <summary>Navigation to the owning user.</summary>
    public User? User { get; set; }
}
