
namespace Steeple.Persistence.Models;
/// <summary>
/// An SSO identity — the (provider, subject) pair from a verified ID token. Unique per provider;
/// the find-or-create key at sign-in.
/// </summary>
public class UserLogin
{
    /// <summary>Primary key.</summary>
    public Guid Id { get; set; }

    /// <summary>Owning user.</summary>
    public Guid UserId { get; set; }

    /// <summary>The SSO provider that issued the identity.</summary>
    public AuthProvider Provider { get; set; }

    /// <summary>The provider's stable subject (<c>sub</c> claim) for this user.</summary>
    public string Subject { get; set; } = "";

    /// <summary>When this identity was first seen (UTC).</summary>
    public DateTimeOffset CreatedAtUtc { get; set; }

    /// <summary>Navigation to the owning user.</summary>
    public User? User { get; set; }
}
