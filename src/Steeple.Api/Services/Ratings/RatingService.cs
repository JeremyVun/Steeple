using Steeple.Api.Contracts.Applications;
using Steeple.Api.Contracts.Bookings;

namespace Steeple.Api.Services.Ratings;
/// <summary>
/// Default ratings service: validates party/direction, enforces the post-occurrence window,
/// stores one immutable star row per direction, and computes double-blind visibility at read
/// time from the two rating rows plus the booking window.
/// </summary>
public sealed class RatingService : IRatingService
{
    private const int MaxCommentLength = 1000;
    private const int MaxReviewPageSize = 50;
    private static readonly TimeSpan SubmissionWindowAfterClose = TimeSpan.FromDays(14);
    private static readonly TimeSpan NoShowSummaryWindow = TimeSpan.FromDays(365);

    private readonly IRatingRepository _ratings;
    private readonly IBookingRepository _bookings;
    private readonly IVenueManagerRepository _venueManagers;
    private readonly IGeofencePolicy _geofence;
    private readonly INotificationDispatcher _notifications;
    private readonly IAnalyticsSink _analytics;
    private readonly TimeProvider _clock;

    /// <summary>Creates the service from its ports.</summary>
    public RatingService(
        IRatingRepository ratings,
        IBookingRepository bookings,
        IVenueManagerRepository venueManagers,
        IGeofencePolicy geofence,
        INotificationDispatcher notifications,
        IAnalyticsSink analytics,
        TimeProvider clock)
    {
        _ratings = ratings;
        _bookings = bookings;
        _venueManagers = venueManagers;
        _geofence = geofence;
        _notifications = notifications;
        _analytics = analytics;
        _clock = clock;
    }

    /// <inheritdoc />
    public async Task<BookingResult<RatingSubmissionResult>> SubmitAsync(
        Guid bookingId, Guid callerId, SubmitRatingRequest request, CancellationToken ct = default)
    {
        if (request.Stars is < 1 or > 5)
        {
            return BookingResult<RatingSubmissionResult>.Fail(
                BookingErrorCodes.InvalidRating, "Stars must be between 1 and 5.");
        }

        var comment = NormalizeComment(request.Comment);
        if (comment?.Length > MaxCommentLength)
        {
            return BookingResult<RatingSubmissionResult>.Fail(
                BookingErrorCodes.InvalidRating, "Comments must be 1000 characters or fewer.");
        }

        var booking = await _bookings.GetAsync(bookingId, ct).ConfigureAwait(false);
        if (booking?.Room?.Venue is null)
        {
            return BookingResult<RatingSubmissionResult>.Fail(BookingErrorCodes.NotFound, "Booking not found.");
        }

        var callerRates = await InferRateeTypeAsync(booking, callerId, ct).ConfigureAwait(false);
        if (callerRates is null)
        {
            return BookingResult<RatingSubmissionResult>.Fail(BookingErrorCodes.NotFound, "Booking not found.");
        }

        var now = _clock.GetUtcNow();
        if (SweepForRatingEligibility(booking, now))
        {
            await _bookings.SaveAsync(ct).ConfigureAwait(false);
        }

        var window = GetWindow(booking);
        if (!window.HasPastOccurrence)
        {
            return BookingResult<RatingSubmissionResult>.Fail(
                BookingErrorCodes.InvalidState, "This booking cannot be rated until at least one occurrence has happened.");
        }

        if (window.ClosesAtUtc is { } closesAt && now > closesAt)
        {
            return BookingResult<RatingSubmissionResult>.Fail(
                BookingErrorCodes.InvalidState, "The rating window for this booking has closed.");
        }

        var existing = await _ratings.GetForBookingsAsync([booking.Id], ct).ConfigureAwait(false);
        if (existing.Any(r => r.RateeType == callerRates.Value))
        {
            return BookingResult<RatingSubmissionResult>.Fail(
                BookingErrorCodes.InvalidState, "This side has already rated this booking.");
        }

        var rating = new Rating
        {
            Id = Guid.NewGuid(),
            BookingId = booking.Id,
            RaterId = callerId,
            RateeType = callerRates.Value,
            Stars = (short)request.Stars,
            Comment = comment,
            CreatedAtUtc = now,
            VenueId = booking.Room.VenueId,
            OrganizerId = booking.OrganizerId,
        };

        if (!await _ratings.TryAddAsync(rating, ct).ConfigureAwait(false))
        {
            return BookingResult<RatingSubmissionResult>.Fail(
                BookingErrorCodes.InvalidState, "This side has already rated this booking.");
        }

        await NotifyOtherSideAsync(booking, callerRates.Value, ct).ConfigureAwait(false);

        await TrackSafelyAsync(
            "rating_submitted",
            new
            {
                rateeType = callerRates.Value == RatingRateeType.Venue ? "venue" : "organizer",
                stars = request.Stars,
                hasComment = comment is not null,
            },
            ct).ConfigureAwait(false);

        return BookingResult<RatingSubmissionResult>.Ok(new RatingSubmissionResult());
    }

    /// <inheritdoc />
    public async Task<IReadOnlyDictionary<Guid, BookingRatingsDto>> GetBookingOverviewsAsync(
        IReadOnlyList<Booking> bookings, Guid callerId, DateTimeOffset nowUtc, CancellationToken ct = default)
    {
        if (bookings.Count == 0)
        {
            return new Dictionary<Guid, BookingRatingsDto>();
        }

        var ratings = await _ratings
            .GetForBookingsAsync(bookings.Select(b => b.Id).Distinct().ToList(), ct)
            .ConfigureAwait(false);
        var byBooking = ratings.GroupBy(r => r.BookingId).ToDictionary(g => g.Key, g => g.ToList());

        var result = new Dictionary<Guid, BookingRatingsDto>();
        foreach (var booking in bookings)
        {
            var callerRates = booking.OrganizerId == callerId
                ? RatingRateeType.Venue
                : RatingRateeType.Organizer;
            var rows = byBooking.GetValueOrDefault(booking.Id) ?? [];
            var byOrganizer = rows.FirstOrDefault(r => r.RateeType == RatingRateeType.Venue);
            var byVenue = rows.FirstOrDefault(r => r.RateeType == RatingRateeType.Organizer);
            var own = callerRates == RatingRateeType.Venue ? byOrganizer : byVenue;
            var window = GetWindow(booking);

            SubmittedRatingDto? MapIfVisible(Rating? rating)
            {
                if (rating is null || rating.HiddenAtUtc is not null)
                {
                    return null;
                }

                if (rating.Id == own?.Id || IsRevealed(rating, booking, rows, nowUtc))
                {
                    return new SubmittedRatingDto(rating.Stars, rating.Comment, rating.CreatedAtUtc);
                }

                return null;
            }

            result[booking.Id] = new BookingRatingsDto(
                ByOrganizer: MapIfVisible(byOrganizer),
                ByVenue: MapIfVisible(byVenue),
                CanRate: window.HasPastOccurrence
                    && (window.ClosesAtUtc is null || nowUtc <= window.ClosesAtUtc)
                    && own is null,
                RateByUtc: window.HasPastOccurrence ? window.ClosesAtUtc : null);
        }

        return result;
    }

    /// <inheritdoc />
    public async Task<IReadOnlyDictionary<Guid, RatingSummaryDto>> GetVenueSummariesAsync(
        IReadOnlyCollection<Guid> venueIds, DateTimeOffset nowUtc, CancellationToken ct = default)
    {
        if (venueIds.Count == 0)
        {
            return new Dictionary<Guid, RatingSummaryDto>();
        }

        var rows = await _ratings.GetVisibleForVenuesAsync(venueIds, ct).ConfigureAwait(false);
        return rows
            .Where(r => r.RateeType == RatingRateeType.Venue && IsRevealed(r, nowUtc))
            .GroupBy(r => r.VenueId)
            .ToDictionary(
                g => g.Key,
                g => new RatingSummaryDto(
                    AverageStars: Math.Round(g.Average(r => r.Stars), 2),
                    Count: g.Count()));
    }

    /// <inheritdoc />
    public async Task<IReadOnlyDictionary<Guid, OrganizerRatingSummaryDto>> GetOrganizerSummariesAsync(
        IReadOnlyCollection<Guid> organizerIds, DateTimeOffset nowUtc, CancellationToken ct = default)
    {
        if (organizerIds.Count == 0)
        {
            return new Dictionary<Guid, OrganizerRatingSummaryDto>();
        }

        var rows = await _ratings.GetVisibleForOrganizersAsync(organizerIds, ct).ConfigureAwait(false);
        var ratingAggregates = rows
            .Where(r => r.RateeType == RatingRateeType.Organizer && IsRevealed(r, nowUtc))
            .GroupBy(r => r.OrganizerId)
            .ToDictionary(
                g => g.Key,
                g => (Average: Math.Round(g.Average(r => r.Stars), 2), Count: g.Count()));

        if (ratingAggregates.Count == 0)
        {
            return new Dictionary<Guid, OrganizerRatingSummaryDto>();
        }

        var inputs = await _ratings
            .GetOrganizerReputationInputsAsync(ratingAggregates.Keys.ToList(), nowUtc - NoShowSummaryWindow, ct)
            .ConfigureAwait(false);

        return ratingAggregates.ToDictionary(
            kvp => kvp.Key,
            kvp =>
            {
                var extra = inputs.GetValueOrDefault(kvp.Key) ?? new OrganizerReputationInputs(0, 0);
                return new OrganizerRatingSummaryDto(
                    AverageStars: kvp.Value.Average,
                    RatingCount: kvp.Value.Count,
                    NoShowCount: extra.NoShowCount,
                    CompletedBookings: extra.CompletedBookings);
            });
    }

    /// <inheritdoc />
    public async Task<VenueReviewPageDto> GetVenueReviewsAsync(
        Guid venueId, int page, int pageSize, DateTimeOffset nowUtc, CancellationToken ct = default)
    {
        var safePage = Math.Max(page, 1);
        var safePageSize = Math.Clamp(pageSize, 1, MaxReviewPageSize);

        if (!await _ratings
                .VenueHasPublishedRoomInBeachheadAsync(venueId, _geofence.Beachhead, ct)
                .ConfigureAwait(false))
        {
            return new VenueReviewPageDto([], 0, safePage, safePageSize);
        }

        var rows = await _ratings.GetVisibleCommentedForVenueAsync(venueId, ct).ConfigureAwait(false);
        var revealed = rows
            .Where(r => IsRevealed(r, nowUtc))
            .OrderByDescending(r => r.CreatedAtUtc)
            .ToList();

        var items = revealed
            .Skip((safePage - 1) * safePageSize)
            .Take(safePageSize)
            .Select(r => new VenueReviewDto(
                Stars: r.Stars,
                Comment: r.Comment,
                RaterName: PublicRaterName(r.Rater),
                CreatedAtUtc: r.CreatedAtUtc))
            .ToList();

        return new VenueReviewPageDto(items, revealed.Count, safePage, safePageSize);
    }

    private async Task<RatingRateeType?> InferRateeTypeAsync(Booking booking, Guid callerId, CancellationToken ct)
    {
        if (booking.OrganizerId == callerId)
        {
            return RatingRateeType.Venue;
        }

        return await _venueManagers.IsManagerAsync(callerId, booking.Room!.VenueId, ct).ConfigureAwait(false)
            ? RatingRateeType.Organizer
            : null;
    }

    private static string? NormalizeComment(string? comment)
    {
        var trimmed = comment?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }

    private static string PublicRaterName(User? user) =>
        string.IsNullOrWhiteSpace(user?.DisplayName) ? "Steeple user" : user.DisplayName;

    private async Task NotifyOtherSideAsync(Booking booking, RatingRateeType rateeType, CancellationToken ct)
    {
        var payload = BuildPayload(booking);
        var email = new EmailContent(
            Subject: $"You received a rating for {booking.Room!.Name}",
            TextBody:
                $"You received a rating for {booking.Room.Name} at {booking.Room.Venue!.Name}.\n\n" +
                "Rate back from your booking detail to reveal both ratings.");

        if (rateeType == RatingRateeType.Venue)
        {
            var managers = await _venueManagers.GetManagersAsync(booking.Room!.VenueId, ct).ConfigureAwait(false);
            if (managers.Count == 0)
            {
                return;
            }

            await _notifications.NotifyAsync(
                managers.Select(m => new NotificationRecipient(m.Id, m.Email)).ToList(),
                NotificationType.RatingReceived,
                payload,
                email,
                ct).ConfigureAwait(false);
        }
        else
        {
            await _notifications.NotifyAsync(
                [new NotificationRecipient(booking.OrganizerId, booking.Organizer?.Email)],
                NotificationType.RatingReceived,
                payload,
                email,
                ct).ConfigureAwait(false);
        }
    }

    private static object BuildPayload(Booking booking) => new
    {
        bookingId = booking.Id,
        roomId = booking.RoomId,
        roomName = booking.Room!.Name,
        venueName = booking.Room.Venue!.Name,
        venueSlug = booking.Room.Venue.Slug,
        roomSlug = booking.Room.Slug,
        organizerName = booking.Organizer!.DisplayName,
        deepLink = $"/bookings/{booking.Id}",
    };

    private static bool SweepForRatingEligibility(Booking booking, DateTimeOffset now)
    {
        var dirty = false;
        foreach (var occurrence in booking.Occurrences.Where(o => o.Status == OccurrenceStatus.Scheduled && o.EndUtc <= now))
        {
            occurrence.Status = OccurrenceStatus.Occurred;
            dirty = true;
        }

        if (booking.Status == BookingStatus.Confirmed
            && booking.Occurrences.All(o => o.Status != OccurrenceStatus.Scheduled))
        {
            booking.Status = BookingStatus.Completed;
            dirty = true;
        }

        return dirty;
    }

    private static bool IsRevealed(Rating rating, DateTimeOffset nowUtc)
    {
        if (rating.HiddenAtUtc is not null || rating.Booking is null)
        {
            return false;
        }

        if (rating.Booking.Ratings.Any(r =>
                r.BookingId == rating.BookingId
                && r.RateeType != rating.RateeType
                && r.HiddenAtUtc is null))
        {
            return true;
        }

        var window = GetWindow(rating.Booking);
        return window.ClosesAtUtc is { } closesAt && nowUtc > closesAt;
    }

    private static bool IsRevealed(Rating rating, Booking booking, IReadOnlyList<Rating> bookingRatings, DateTimeOffset nowUtc)
    {
        if (rating.HiddenAtUtc is not null)
        {
            return false;
        }

        if (bookingRatings.Any(r => r.RateeType != rating.RateeType && r.HiddenAtUtc is null))
        {
            return true;
        }

        var window = GetWindow(booking);
        return window.ClosesAtUtc is { } closesAt && nowUtc > closesAt;
    }

    private static RatingWindow GetWindow(Booking booking)
    {
        var nonCancelled = booking.Occurrences
            .Where(o => o.Status != OccurrenceStatus.Cancelled)
            .ToList();
        var hasPastOccurrence = nonCancelled.Any(o => o.Status is OccurrenceStatus.Occurred or OccurrenceStatus.NoShow);

        DateTimeOffset? closesAt = booking.Status switch
        {
            BookingStatus.Cancelled => booking.CancelledAtUtc?.Add(SubmissionWindowAfterClose),
            _ when nonCancelled.Count > 0 => nonCancelled.Max(o => o.EndUtc).Add(SubmissionWindowAfterClose),
            _ => null,
        };

        return new RatingWindow(hasPastOccurrence, closesAt);
    }

    private async Task TrackSafelyAsync(string eventType, object payload, CancellationToken ct)
    {
        try
        {
            await _analytics.TrackAsync(eventType, payload, sessionId: null, ct).ConfigureAwait(false);
        }
        catch
        {
            // Best-effort: never throw from analytics.
        }
    }

    private sealed record RatingWindow(bool HasPastOccurrence, DateTimeOffset? ClosesAtUtc);
}
