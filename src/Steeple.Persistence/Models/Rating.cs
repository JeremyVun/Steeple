namespace Steeple.Persistence.Models;
/// <summary>
/// One immutable star rating for a booking direction. The ratee side is encoded by
/// <see cref="RateeType"/>: organizer-to-venue ratings use <see cref="RatingRateeType.Venue"/>,
/// venue-manager-to-organizer ratings use <see cref="RatingRateeType.Organizer"/>.
/// </summary>
public class Rating
{
    /// <summary>Primary key.</summary>
    public Guid Id { get; set; }

    /// <summary>Foreign key to the booking being rated.</summary>
    public Guid BookingId { get; set; }

    /// <summary>User who submitted the rating.</summary>
    public Guid RaterId { get; set; }

    /// <summary>The side receiving the rating.</summary>
    public RatingRateeType RateeType { get; set; }

    /// <summary>Required star score, 1 through 5.</summary>
    public short Stars { get; set; }

    /// <summary>Optional immutable review text submitted with the rating.</summary>
    public string? Comment { get; set; }

    /// <summary>Submission timestamp (UTC).</summary>
    public DateTimeOffset CreatedAtUtc { get; set; }

    /// <summary>Admin moderation hide timestamp; hidden ratings are excluded from reads.</summary>
    public DateTimeOffset? HiddenAtUtc { get; set; }

    /// <summary>Denormalized venue id from the booking.</summary>
    public Guid VenueId { get; set; }

    /// <summary>Denormalized organizer id from the booking.</summary>
    public Guid OrganizerId { get; set; }

    /// <summary>Navigation to the rated booking.</summary>
    public Booking? Booking { get; set; }

    /// <summary>Navigation to the submitting user.</summary>
    public User? Rater { get; set; }

    /// <summary>Navigation to the rated venue.</summary>
    public Venue? Venue { get; set; }

    /// <summary>Navigation to the rated organizer.</summary>
    public User? Organizer { get; set; }
}
