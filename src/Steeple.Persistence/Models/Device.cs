
namespace Steeple.Persistence.Models;
/// <summary>
/// An FCM push registration for a user's device. Schema rides with this phase; the
/// register/unregister endpoints and the push adapter land with mobile (ROADMAP Phase 4).
/// </summary>
public class Device
{
    /// <summary>Primary key.</summary>
    public Guid Id { get; set; }

    /// <summary>Foreign key to the owning user.</summary>
    public Guid UserId { get; set; }

    /// <summary>FCM registration token.</summary>
    public string FcmToken { get; set; } = "";

    /// <summary>Client platform: <c>ios</c>, <c>android</c> or <c>web</c>.</summary>
    public string Platform { get; set; } = "";

    /// <summary>Creation timestamp (UTC).</summary>
    public DateTimeOffset CreatedAtUtc { get; set; }

    /// <summary>Last time this registration was refreshed/seen.</summary>
    public DateTimeOffset LastSeenAtUtc { get; set; }

    /// <summary>Navigation to the owning user.</summary>
    public User? User { get; set; }
}
