
namespace Steeple.Persistence.Models;
/// <summary>
/// A physical site (e.g. a church) that owns one or more bookable rooms/halls.
/// </summary>
public class Venue
{
    /// <summary>Primary key.</summary>
    public Guid Id { get; set; }

    /// <summary>Display name of the venue.</summary>
    public string Name { get; set; } = "";

    /// <summary>URL-friendly unique identifier for the venue.</summary>
    public string Slug { get; set; } = "";

    /// <summary>Free-text description of the venue.</summary>
    public string Description { get; set; } = "";

    /// <summary>The kind of organisation operating this venue.</summary>
    public VenueType Type { get; set; }

    /// <summary>Street address line.</summary>
    public string AddressLine { get; set; } = "";

    /// <summary>Suburb / locality.</summary>
    public string Suburb { get; set; } = "";

    /// <summary>Postal code.</summary>
    public string Postcode { get; set; } = "";

    /// <summary>Latitude of the venue (decimal degrees).</summary>
    public double Latitude { get; set; }

    /// <summary>Longitude of the venue (decimal degrees).</summary>
    public double Longitude { get; set; }

    /// <summary>Optional public contact email.</summary>
    public string? ContactEmail { get; set; }

    /// <summary>
    /// Free-text parking guidance entered by the lister (e.g. "Free on-site lot for 30 cars,
    /// plus street parking on Maple Ave"). Empty when not provided.
    /// </summary>
    public string ParkingInfo { get; set; } = "";

    /// <summary>
    /// Free-text public-transport guidance entered by the lister (e.g. "5 min walk from
    /// Dunn Loring Metro (Orange line); the 1C bus stops outside"). Empty when not provided.
    /// </summary>
    public string TransitInfo { get; set; } = "";

    /// <summary>Whether the operator's identity has been verified.</summary>
    public bool IsIdentityVerified { get; set; }

    /// <summary>Creation timestamp (UTC).</summary>
    public DateTimeOffset CreatedAtUtc { get; set; }

    /// <summary>Rooms belonging to this venue.</summary>
    public ICollection<Room> Rooms { get; set; } = new List<Room>();

    /// <summary>
    /// Computed geographic location. Not persisted — the EF configuration ignores this property.
    /// </summary>
    public GeoPoint Location => new(Latitude, Longitude);
}
