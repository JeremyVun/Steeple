namespace Steeple.Integration.Tests.Fixtures;

/// <summary>Manager-less venue port for rigs whose subject isn't authorization.</summary>
public sealed class NullVenueManagers : IVenueManagerRepository
{
    public Task<bool> IsManagerAsync(Guid userId, Guid venueId, CancellationToken ct = default) =>
        Task.FromResult(false);

    public Task<IReadOnlyList<Guid>> GetManagedVenueIdsAsync(Guid userId, CancellationToken ct = default) =>
        Task.FromResult<IReadOnlyList<Guid>>([]);

    public Task<IReadOnlyList<Venue>> GetManagedVenuesAsync(Guid userId, CancellationToken ct = default) =>
        Task.FromResult<IReadOnlyList<Venue>>([]);

    public Task<IReadOnlyList<User>> GetManagersAsync(Guid venueId, CancellationToken ct = default) =>
        Task.FromResult<IReadOnlyList<User>>([]);
}

/// <summary>Inert notification fan-out.</summary>
public sealed class NullNotifications : INotificationDispatcher
{
    public Task NotifyAsync(
        IReadOnlyList<NotificationRecipient> recipients, NotificationType type, object payload,
        EmailContent? email, CancellationToken ct = default) => Task.CompletedTask;
}

/// <summary>Ratings port answering empty summaries; submission is out of scope for these rigs.</summary>
public sealed class NullRatings : IRatingService
{
    public Task<BookingResult<RatingSubmissionResult>> SubmitAsync(
        Guid bookingId, Guid callerId, SubmitRatingRequest request, CancellationToken ct = default) =>
        throw new NotSupportedException();

    public Task<IReadOnlyDictionary<Guid, BookingRatingsDto>> GetBookingOverviewsAsync(
        IReadOnlyList<Booking> bookings, Guid callerId, DateTimeOffset nowUtc, CancellationToken ct = default) =>
        Task.FromResult<IReadOnlyDictionary<Guid, BookingRatingsDto>>(new Dictionary<Guid, BookingRatingsDto>());

    public Task<IReadOnlyDictionary<Guid, RatingSummaryDto>> GetVenueSummariesAsync(
        IReadOnlyCollection<Guid> venueIds, DateTimeOffset nowUtc, CancellationToken ct = default) =>
        Task.FromResult<IReadOnlyDictionary<Guid, RatingSummaryDto>>(new Dictionary<Guid, RatingSummaryDto>());

    public Task<IReadOnlyDictionary<Guid, OrganizerRatingSummaryDto>> GetOrganizerSummariesAsync(
        IReadOnlyCollection<Guid> organizerIds, DateTimeOffset nowUtc, CancellationToken ct = default) =>
        Task.FromResult<IReadOnlyDictionary<Guid, OrganizerRatingSummaryDto>>(new Dictionary<Guid, OrganizerRatingSummaryDto>());

    public Task<VenueReviewPageDto> GetVenueReviewsAsync(
        Guid venueId, int page, int pageSize, DateTimeOffset nowUtc, CancellationToken ct = default) =>
        Task.FromResult(new VenueReviewPageDto([], 0, Math.Max(page, 1), Math.Clamp(pageSize, 1, 50)));
}

/// <summary>Analytics sink that swallows events.</summary>
public sealed class NullAnalytics : IAnalyticsSink
{
    public Task TrackAsync(string eventType, object? payload = null, string? sessionId = null, CancellationToken ct = default) =>
        Task.CompletedTask;
}
