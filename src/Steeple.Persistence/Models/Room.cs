
namespace Steeple.Persistence.Models;
/// <summary>
/// A bookable room/hall within a <see cref="Venue"/>. The discoverable unit of a listing.
/// </summary>
public class Room
{
    /// <summary>Primary key.</summary>
    public Guid Id { get; set; }

    /// <summary>Foreign key to the owning venue.</summary>
    public Guid VenueId { get; set; }

    /// <summary>Navigation to the owning venue.</summary>
    public Venue? Venue { get; set; }

    /// <summary>Display name of the room.</summary>
    public string Name { get; set; } = "";

    /// <summary>URL-friendly identifier for the room (unique within its venue).</summary>
    public string Slug { get; set; } = "";

    /// <summary>Free-text description of the room.</summary>
    public string Description { get; set; } = "";

    /// <summary>Maximum occupancy.</summary>
    public int Capacity { get; set; }

    /// <summary>Hourly price; <c>null</c> or non-positive means free to use.</summary>
    public decimal? PricePerHour { get; set; }

    /// <summary>ISO currency code for <see cref="PricePerHour"/>.</summary>
    public string Currency { get; set; } = "USD";

    /// <summary>House rules and usage conditions.</summary>
    public string HouseRules { get; set; } = "";

    /// <summary>Publication state controlling discoverability.</summary>
    public RoomStatus Status { get; set; }

    /// <summary>Amenities offered (bitwise flags).</summary>
    public Amenity Amenities { get; set; }

    /// <summary>Accessibility features provided (bitwise flags).</summary>
    public AccessibilityFeature AccessibilityFeatures { get; set; }

    /// <summary>Activity categories the room will accept (bitwise flags).</summary>
    public ActivityType AcceptedActivityTypes { get; set; }

    /// <summary>Creation timestamp (UTC).</summary>
    public DateTimeOffset CreatedAtUtc { get; set; }

    /// <summary>Photos for this room.</summary>
    public ICollection<RoomPhoto> Photos { get; set; } = new List<RoomPhoto>();

    /// <summary>
    /// Whether the room is free to use. Not persisted — the EF configuration ignores this property.
    /// </summary>
    public bool IsFree => PricePerHour is null or <= 0m;
}
