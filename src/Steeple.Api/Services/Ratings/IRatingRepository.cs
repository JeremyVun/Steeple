namespace Steeple.Api.Services.Ratings;
/// <summary>Persistence port for ratings, review comments, and reputation aggregate inputs.</summary>
public interface IRatingRepository
{
    /// <summary>Loads all ratings for the supplied bookings, including hidden rows for immutability checks.</summary>
    Task<IReadOnlyList<Rating>> GetForBookingsAsync(
        IReadOnlyCollection<Guid> bookingIds, CancellationToken ct = default);

    /// <summary>Returns server-side grouped aggregates for revealed, visible venue ratings.</summary>
    Task<IReadOnlyDictionary<Guid, RatingAggregate>> GetVenueSummaryAggregatesAsync(
        IReadOnlyCollection<Guid> venueIds, DateTimeOffset nowUtc, CancellationToken ct = default);

    /// <summary>Returns server-side grouped aggregates for revealed, visible organizer ratings.</summary>
    Task<IReadOnlyDictionary<Guid, RatingAggregate>> GetOrganizerSummaryAggregatesAsync(
        IReadOnlyCollection<Guid> organizerIds, DateTimeOffset nowUtc, CancellationToken ct = default);

    /// <summary>Returns no-show and completed-booking inputs for organizer trust summaries.</summary>
    Task<IReadOnlyDictionary<Guid, OrganizerReputationInputs>> GetOrganizerReputationInputsAsync(
        IReadOnlyCollection<Guid> organizerIds, DateTimeOffset noShowSinceUtc, CancellationToken ct = default);

    /// <summary>Returns one SQL-filtered page of revealed, visible venue review comments.</summary>
    Task<PublicVenueReviewPage> GetPublicVenueReviewsAsync(
        Guid venueId, int page, int pageSize, DateTimeOffset nowUtc, CancellationToken ct = default);

    /// <summary>Returns whether the venue currently has at least one public room inside the beachhead.</summary>
    Task<bool> VenueHasPublishedRoomInAreaAsync(
        Guid venueId, BoundingBox beachhead, CancellationToken ct = default);

    /// <summary>Adds a rating. Returns false when the booking already has that ratee direction.</summary>
    Task<bool> TryAddAsync(Rating rating, CancellationToken ct = default);
}

/// <summary>Non-rating trust summary inputs derived from bookings/occurrences.</summary>
public sealed record OrganizerReputationInputs(int NoShowCount, int CompletedBookings);

/// <summary>One server-side rating aggregate keyed by the requested venue or organizer.</summary>
public sealed record RatingAggregate(double AverageStars, int Count);

/// <summary>Minimal public review projection; no booking or rating graph is materialized.</summary>
public sealed record PublicVenueReview(int Stars, string? Comment, string RaterName, DateTimeOffset CreatedAtUtc);

/// <summary>One SQL-filtered public review page and its total count.</summary>
public sealed record PublicVenueReviewPage(IReadOnlyList<PublicVenueReview> Items, int TotalCount);
