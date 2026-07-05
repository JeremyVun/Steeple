
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

    /// <summary>Last modification timestamp (UTC) — feeds the SEO sitemap's lastmod.</summary>
    public DateTimeOffset UpdatedAtUtc { get; set; }

    /// <summary>
    /// When the provider asked for this room to be published. Non-null rows form the Admin
    /// moderation queue; cleared by the founder's approve/decline decision.
    /// </summary>
    public DateTimeOffset? PublishRequestedAtUtc { get; set; }

    /// <summary>
    /// When the room first passed moderation. Once set, unlist/relist is provider-controlled
    /// (re-publishing needs no second review).
    /// </summary>
    public DateTimeOffset? FirstPublishedAtUtc { get; set; }

    /// <summary>
    /// When a provider last edited this room while it was Published. Non-null rows feed the
    /// Admin edited-listings review feed; cleared when an operator marks them reviewed.
    /// </summary>
    public DateTimeOffset? ProviderEditedAtUtc { get; set; }

    /// <summary>Photos for this room.</summary>
    public ICollection<RoomPhoto> Photos { get; set; } = new List<RoomPhoto>();

    /// <summary>Weekly open windows (venue-local); required non-empty to publish.</summary>
    public ICollection<RoomOpenHours> OpenHours { get; set; } = new List<RoomOpenHours>();

    /// <summary>Whole dates the room is closed regardless of open hours.</summary>
    public ICollection<RoomBlackoutDate> BlackoutDates { get; set; } = new List<RoomBlackoutDate>();

    /// <summary>
    /// Whether the room is free to use. Not persisted — the EF configuration ignores this property.
    /// </summary>
    public bool IsFree => PricePerHour is null or <= 0m;
}
