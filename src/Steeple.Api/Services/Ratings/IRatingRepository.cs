namespace Steeple.Api.Services.Ratings;
/// <summary>Persistence port for ratings, review comments, and reputation aggregate inputs.</summary>
public interface IRatingRepository
{
    /// <summary>Loads all ratings for the supplied bookings, including hidden rows for immutability checks.</summary>
    Task<IReadOnlyList<Rating>> GetForBookingsAsync(
        IReadOnlyCollection<Guid> bookingIds, CancellationToken ct = default);

    /// <summary>Loads visible candidate ratings for venue aggregates with the graph needed for reveal checks.</summary>
    Task<IReadOnlyList<Rating>> GetVisibleForVenuesAsync(
        IReadOnlyCollection<Guid> venueIds, CancellationToken ct = default);

    /// <summary>Loads visible candidate ratings for organizer aggregates with the graph needed for reveal checks.</summary>
    Task<IReadOnlyList<Rating>> GetVisibleForOrganizersAsync(
        IReadOnlyCollection<Guid> organizerIds, CancellationToken ct = default);

    /// <summary>Returns no-show and completed-booking inputs for organizer trust summaries.</summary>
    Task<IReadOnlyDictionary<Guid, OrganizerReputationInputs>> GetOrganizerReputationInputsAsync(
        IReadOnlyCollection<Guid> organizerIds, DateTimeOffset noShowSinceUtc, CancellationToken ct = default);

    /// <summary>Loads visible venue-rating comments with the graph needed for reveal checks.</summary>
    Task<IReadOnlyList<Rating>> GetVisibleCommentedForVenueAsync(
        Guid venueId, CancellationToken ct = default);

    /// <summary>Returns whether the venue currently has at least one public room inside the beachhead.</summary>
    Task<bool> VenueHasPublishedRoomInBeachheadAsync(
        Guid venueId, BoundingBox beachhead, CancellationToken ct = default);

    /// <summary>Adds a rating. Returns false when the booking already has that ratee direction.</summary>
    Task<bool> TryAddAsync(Rating rating, CancellationToken ct = default);
}

/// <summary>Non-rating trust summary inputs derived from bookings/occurrences.</summary>
public sealed record OrganizerReputationInputs(int NoShowCount, int CompletedBookings);
