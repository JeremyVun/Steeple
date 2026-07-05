using Steeple.Api.Contracts.Bookings;
using Steeple.Api.Contracts.Applications;

namespace Steeple.Api.Services.Ratings;
/// <summary>
/// Ratings use-cases, review comments, and read-side aggregate helpers.
/// </summary>
public interface IRatingService
{
    /// <summary>Submits the caller's one immutable rating direction for a booking.</summary>
    Task<BookingResult<RatingSubmissionResult>> SubmitAsync(
        Guid bookingId, Guid callerId, SubmitRatingRequest request, CancellationToken ct = default);

    /// <summary>Builds viewer-scoped rating state for booking DTOs.</summary>
    Task<IReadOnlyDictionary<Guid, BookingRatingsDto>> GetBookingOverviewsAsync(
        IReadOnlyList<Booking> bookings, Guid callerId, DateTimeOffset nowUtc, CancellationToken ct = default);

    /// <summary>Returns visible venue-level rating aggregates keyed by venue id.</summary>
    Task<IReadOnlyDictionary<Guid, RatingSummaryDto>> GetVenueSummariesAsync(
        IReadOnlyCollection<Guid> venueIds, DateTimeOffset nowUtc, CancellationToken ct = default);

    /// <summary>Returns provider-facing organizer trust summaries keyed by organizer id.</summary>
    Task<IReadOnlyDictionary<Guid, OrganizerRatingSummaryDto>> GetOrganizerSummariesAsync(
        IReadOnlyCollection<Guid> organizerIds, DateTimeOffset nowUtc, CancellationToken ct = default);

    /// <summary>Returns public, revealed review comments for a venue, newest first.</summary>
    Task<VenueReviewPageDto> GetVenueReviewsAsync(
        Guid venueId, int page, int pageSize, DateTimeOffset nowUtc, CancellationToken ct = default);
}

/// <summary>Marker outcome for a successful rating submission.</summary>
public sealed record RatingSubmissionResult;
