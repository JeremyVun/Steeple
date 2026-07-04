
namespace Steeple.Persistence.Models;
/// <summary>
/// Authorizes a <see cref="User"/> to act for a <see cref="Venue"/> (approve/decline/ask on
/// applications). Rows are founder-created via Admin during the concierge phase.
/// </summary>
public class VenueManager
{
    /// <summary>Primary key.</summary>
    public Guid Id { get; set; }

    /// <summary>Foreign key to the managed venue.</summary>
    public Guid VenueId { get; set; }

    /// <summary>Foreign key to the managing user.</summary>
    public Guid UserId { get; set; }

    /// <summary>Creation timestamp (UTC).</summary>
    public DateTimeOffset CreatedAtUtc { get; set; }

    /// <summary>Navigation to the managed venue.</summary>
    public Venue? Venue { get; set; }

    /// <summary>Navigation to the managing user.</summary>
    public User? User { get; set; }
}
