using Microsoft.EntityFrameworkCore;
using Npgsql;
using Steeple.Api.Services.Ratings;

namespace Steeple.Api.Proxies.Ratings;
/// <summary>EF adapter for ratings. Reveal rules stay in the service; queries load their inputs.</summary>
public class EfRatingRepository : IRatingRepository
{
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
    public Task<IReadOnlyList<Rating>> GetVisibleForVenuesAsync(
        IReadOnlyCollection<Guid> venueIds, CancellationToken ct = default) =>
        GetVisibleAggregateCandidatesAsync(
            _db.Ratings.Where(r => venueIds.Contains(r.VenueId) && r.RateeType == RatingRateeType.Venue),
            ct);

    /// <inheritdoc />
    public Task<IReadOnlyList<Rating>> GetVisibleForOrganizersAsync(
        IReadOnlyCollection<Guid> organizerIds, CancellationToken ct = default) =>
        GetVisibleAggregateCandidatesAsync(
            _db.Ratings.Where(r => organizerIds.Contains(r.OrganizerId) && r.RateeType == RatingRateeType.Organizer),
            ct);

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
    public async Task<IReadOnlyList<Rating>> GetVisibleCommentedForVenueAsync(
        Guid venueId, CancellationToken ct = default)
    {
        // Identity resolution (not plain no-tracking): the reveal rule reads back through
        // Booking.Ratings, and EF rejects that Include cycle under AsNoTracking().
        return await _db.Ratings
            .AsNoTrackingWithIdentityResolution()
            .Where(r =>
                r.VenueId == venueId
                && r.RateeType == RatingRateeType.Venue
                && r.HiddenAtUtc == null
                && r.Comment != null
                && r.Comment != "")
            .Include(r => r.Rater)
            .Include(r => r.Booking!).ThenInclude(b => b.Occurrences)
            .Include(r => r.Booking!).ThenInclude(b => b.Ratings)
            .OrderByDescending(r => r.CreatedAtUtc)
            .ToListAsync(ct)
            .ConfigureAwait(false);
    }

    /// <inheritdoc />
    public Task<bool> VenueHasPublishedRoomInBeachheadAsync(
        Guid venueId, BoundingBox beachhead, CancellationToken ct = default)
    {
        return _db.Rooms
            .AsNoTracking()
            .AnyAsync(
                r =>
                    r.VenueId == venueId
                    && r.Status == RoomStatus.Published
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

    private static async Task<IReadOnlyList<Rating>> GetVisibleAggregateCandidatesAsync(
        IQueryable<Rating> query, CancellationToken ct)
    {
        // Same cycle constraint as GetVisibleCommentedForVenueAsync.
        return await query
            .AsNoTrackingWithIdentityResolution()
            .Where(r => r.HiddenAtUtc == null)
            .Include(r => r.Booking!).ThenInclude(b => b.Occurrences)
            .Include(r => r.Booking!).ThenInclude(b => b.Ratings)
            .ToListAsync(ct)
            .ConfigureAwait(false);
    }
}
