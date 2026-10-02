using Microsoft.EntityFrameworkCore;
using Npgsql;
using Steeple.Api.Services.Ratings;

namespace Steeple.Api.Proxies.Ratings;
/// <summary>EF adapter for ratings, including server-side double-blind reveal reads.</summary>
public class EfRatingRepository : IRatingRepository
{
    private static readonly TimeSpan RevealWindow = TimeSpan.FromDays(14);
    private readonly SteepleDbContext _db;

    /// <summary>Creates the repository over the supplied EF context.</summary>
    public EfRatingRepository(SteepleDbContext db) => _db = db;

    /// <inheritdoc />
    public async Task<IReadOnlyList<Rating>> GetForBookingsAsync(
        IReadOnlyCollection<Guid> bookingIds, CancellationToken ct = default)
    {
        if (bookingIds.Count == 0)
        {
            return [];
        }

        return await _db.Ratings
            .AsNoTracking()
            .Where(r => bookingIds.Contains(r.BookingId))
            .ToListAsync(ct)
            .ConfigureAwait(false);
    }

    /// <inheritdoc />
    public async Task<IReadOnlyDictionary<Guid, RatingAggregate>> GetVenueSummaryAggregatesAsync(
        IReadOnlyCollection<Guid> venueIds, DateTimeOffset nowUtc, CancellationToken ct = default)
    {
        if (venueIds.Count == 0)
        {
            return new Dictionary<Guid, RatingAggregate>();
        }

        var aggregates = await RevealedVisibleRatings(
                _db.Ratings
                    .AsNoTracking()
                    .Where(r => venueIds.Contains(r.VenueId) && r.RateeType == RatingRateeType.Venue),
                nowUtc)
            .GroupBy(r => r.VenueId)
            .Select(g => new { VenueId = g.Key, AverageStars = g.Average(r => (double)r.Stars), Count = g.Count() })
            .ToListAsync(ct)
            .ConfigureAwait(false);

        return aggregates.ToDictionary(
            aggregate => aggregate.VenueId,
            aggregate => new RatingAggregate(aggregate.AverageStars, aggregate.Count));
    }

    /// <inheritdoc />
    public async Task<IReadOnlyDictionary<Guid, RatingAggregate>> GetOrganizerSummaryAggregatesAsync(
        IReadOnlyCollection<Guid> organizerIds, DateTimeOffset nowUtc, CancellationToken ct = default)
    {
        if (organizerIds.Count == 0)
        {
            return new Dictionary<Guid, RatingAggregate>();
        }

        var aggregates = await RevealedVisibleRatings(
                _db.Ratings
                    .AsNoTracking()
                    .Where(r => organizerIds.Contains(r.OrganizerId) && r.RateeType == RatingRateeType.Organizer),
                nowUtc)
            .GroupBy(r => r.OrganizerId)
            .Select(g => new { OrganizerId = g.Key, AverageStars = g.Average(r => (double)r.Stars), Count = g.Count() })
            .ToListAsync(ct)
            .ConfigureAwait(false);

        return aggregates.ToDictionary(
            aggregate => aggregate.OrganizerId,
            aggregate => new RatingAggregate(aggregate.AverageStars, aggregate.Count));
    }

    /// <inheritdoc />
    public async Task<IReadOnlyDictionary<Guid, OrganizerReputationInputs>> GetOrganizerReputationInputsAsync(
        IReadOnlyCollection<Guid> organizerIds, DateTimeOffset noShowSinceUtc, CancellationToken ct = default)
    {
        if (organizerIds.Count == 0)
        {
            return new Dictionary<Guid, OrganizerReputationInputs>();
        }

        var completed = await _db.Bookings
            .AsNoTracking()
            .Where(b => organizerIds.Contains(b.OrganizerId) && b.Status == BookingStatus.Completed)
            .GroupBy(b => b.OrganizerId)
            .Select(g => new { OrganizerId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.OrganizerId, x => x.Count, ct)
            .ConfigureAwait(false);

        var noShows = await _db.BookingOccurrences
            .AsNoTracking()
            .Where(o =>
                o.Status == OccurrenceStatus.NoShow
                && o.StartUtc >= noShowSinceUtc
                && o.NoShowMarkedBy != null
                && o.NoShowMarkedBy != o.Booking!.OrganizerId
                && organizerIds.Contains(o.Booking.OrganizerId))
            .GroupBy(o => o.Booking!.OrganizerId)
            .Select(g => new { OrganizerId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.OrganizerId, x => x.Count, ct)
            .ConfigureAwait(false);

        return organizerIds
            .Distinct()
            .ToDictionary(
                id => id,
                id => new OrganizerReputationInputs(
                    NoShowCount: noShows.GetValueOrDefault(id),
                    CompletedBookings: completed.GetValueOrDefault(id)));
    }

    /// <inheritdoc />
    public async Task<PublicVenueReviewPage> GetPublicVenueReviewsAsync(
        Guid venueId, int page, int pageSize, DateTimeOffset nowUtc, CancellationToken ct = default)
    {
        var reviews = RevealedVisibleRatings(
                _db.Ratings
                    .AsNoTracking()
                    .Where(r =>
                        r.VenueId == venueId
                        && r.RateeType == RatingRateeType.Venue
                        && r.Comment != null
                        && r.Comment != ""),
                nowUtc);
        var totalCount = await reviews.CountAsync(ct).ConfigureAwait(false);
        var offset = ((long)page - 1) * pageSize;
        if (offset >= totalCount)
        {
            return new PublicVenueReviewPage([], totalCount);
        }

        var items = await reviews
            .OrderByDescending(r => r.CreatedAtUtc)
            .ThenBy(r => r.Id)
            .Skip((int)offset)
            .Take(pageSize)
            .Select(r => new PublicVenueReview(
                r.Stars,
                r.Comment,
                string.IsNullOrWhiteSpace(r.Rater!.DisplayName) ? "Steeple user" : r.Rater.DisplayName,
                r.CreatedAtUtc))
            .ToListAsync(ct)
            .ConfigureAwait(false);

        return new PublicVenueReviewPage(items, totalCount);
    }

    /// <inheritdoc />
    public Task<bool> VenueHasPublishedRoomInAreaAsync(
        Guid venueId, BoundingBox beachhead, CancellationToken ct = default)
    {
        return _db.Rooms
            .AsNoTracking()
            .AnyAsync(
                r =>
                    r.VenueId == venueId
                    && r.Status == RoomStatus.Published
                    && r.OperatorUnlistedAtUtc == null
                    && r.Venue!.Latitude >= beachhead.MinLatitude
                    && r.Venue.Latitude <= beachhead.MaxLatitude
                    && r.Venue.Longitude >= beachhead.MinLongitude
                    && r.Venue.Longitude <= beachhead.MaxLongitude,
                ct);
    }

    /// <inheritdoc />
    public async Task<bool> TryAddAsync(Rating rating, CancellationToken ct = default)
    {
        _db.Ratings.Add(rating);
        try
        {
            await _db.SaveChangesAsync(ct).ConfigureAwait(false);
            return true;
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            _db.Entry(rating).State = EntityState.Detached;
            return false;
        }
    }

    private IQueryable<Rating> RevealedVisibleRatings(IQueryable<Rating> query, DateTimeOffset nowUtc)
    {
        var revealCutoffUtc = nowUtc - RevealWindow;
        return query.Where(r =>
            r.HiddenAtUtc == null
            && (_db.Ratings.Any(other =>
                    other.BookingId == r.BookingId
                    && other.RateeType != r.RateeType
                    && other.HiddenAtUtc == null)
                || (r.Booking!.Status == BookingStatus.Cancelled
                    && r.Booking.CancelledAtUtc != null
                    && r.Booking.CancelledAtUtc < revealCutoffUtc)
                || (r.Booking!.Status != BookingStatus.Cancelled
                    && r.Booking.Occurrences.Any(o => o.Status != OccurrenceStatus.Cancelled)
                    && r.Booking.Occurrences
                        .Where(o => o.Status != OccurrenceStatus.Cancelled)
                        .Max(o => o.EndUtc) < revealCutoffUtc)));
    }
}
