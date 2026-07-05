namespace Steeple.Persistence.Constants;
/// <summary>The side being rated. Values are persisted as integers and are append-only.</summary>
public enum RatingRateeType
{
    /// <summary>The booking's organizer is being rated by a venue manager.</summary>
    Organizer = 1,

    /// <summary>The venue is being rated by the booking's organizer.</summary>
    Venue = 2,
}
