using Microsoft.EntityFrameworkCore;

namespace Steeple.Api.Proxies;
/// <summary>
/// EF Core adapter for <see cref="IRoomRepository"/>. Translates resolved search criteria
/// into a single bounding-box SQL query over published rooms and their venues/photos.
/// </summary>
public class RoomRepository : IRoomRepository
{
    private readonly SteepleDbContext _db;

    /// <summary>Creates the repository over the supplied context.</summary>
    public RoomRepository(SteepleDbContext db) => _db = db;

    /// <inheritdoc />
    public async Task<IReadOnlyList<Room>> SearchAsync(RoomSearchCriteria criteria, CancellationToken ct = default)
    {
        var filtered = ApplyFilters(
            _db.Rooms
                .AsNoTracking()
                .Include(r => r.Venue)
                .Include(r => r.Photos),
            criteria);

        IQueryable<Room> ordered;
        if (criteria.Center is { } center)
        {
            // Nearest-first ordering pushed into SQL so Skip/Take page over distance, not name —
            // otherwise pagination returns the alphabetically-first page and only that page gets
            // distance-sorted. Squared planar distance with a cos(lat) longitude scale is a cheap,
            // translatable approximation; the service computes exact haversine for display.
            var cLat = center.Latitude;
            var cLng = center.Longitude;
            var lngScaleSq = Math.Cos(cLat * Math.PI / 180.0);
            lngScaleSq *= lngScaleSq;
            ordered = filtered
                .OrderBy(r =>
                    (r.Venue!.Latitude - cLat) * (r.Venue.Latitude - cLat) +
                    (r.Venue.Longitude - cLng) * (r.Venue.Longitude - cLng) * lngScaleSq)
                .ThenBy(r => r.Id);
        }
        else
        {
            // Stable ordering so pagination is deterministic.
            ordered = filtered
                .OrderBy(r => r.Venue!.Name)
                .ThenBy(r => r.Name)
                .ThenBy(r => r.Id);
        }

        var rooms = await ordered
            .Skip(criteria.Skip)
            .Take(criteria.Take)
            .ToListAsync(ct);

        return rooms;
    }

    /// <inheritdoc />
    public Task<int> CountAsync(RoomSearchCriteria criteria, CancellationToken ct = default) =>
        ApplyFilters(_db.Rooms.AsNoTracking(), criteria).CountAsync(ct);

    /// <inheritdoc />
    public Task<Room?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        _db.Rooms
            .AsNoTracking()
            .Include(r => r.Venue)
            .Include(r => r.Photos)
            .FirstOrDefaultAsync(r => r.Id == id, ct);

    /// <inheritdoc />
    public Task<Room?> GetBySlugAsync(string venueSlug, string roomSlug, CancellationToken ct = default)
    {
        // Invariant lower-casing on the inputs; slugs are canonical lower-case ASCII.
        var venueSlugLower = venueSlug.ToLowerInvariant();
        var roomSlugLower = roomSlug.ToLowerInvariant();

        return _db.Rooms
            .AsNoTracking()
            .Include(r => r.Venue)
            .Include(r => r.Photos)
            .FirstOrDefaultAsync(
                r => r.Venue!.Slug.ToLower() == venueSlugLower && r.Slug.ToLower() == roomSlugLower,
                ct);
    }

    /// <inheritdoc />
    public async Task<IReadOnlyList<string>> GetPublishedSuburbsAsync(CancellationToken ct = default)
    {
        return await _db.Rooms
            .AsNoTracking()
            .Where(r => r.Status == RoomStatus.Published && r.Venue!.Suburb != "")
            .Select(r => r.Venue!.Suburb)
            .Distinct()
            .OrderBy(s => s)
            .ToListAsync(ct);
    }

    /// <inheritdoc />
    public async Task<IReadOnlyList<SitemapEntry>> GetPublishedForSitemapAsync(CancellationToken ct = default)
    {
        return await _db.Rooms
            .AsNoTracking()
            .Where(r => r.Status == RoomStatus.Published)
            .OrderBy(r => r.Venue!.Slug)
            .ThenBy(r => r.Slug)
            .Select(r => new SitemapEntry(r.Venue!.Slug, r.Slug, r.CreatedAtUtc))
            .ToListAsync(ct);
    }

    /// <summary>
    /// Applies the shared discovery predicate (status, geofence bounds, capacity, price, and
    /// the bitwise activity/accessibility masks) used by both search and count.
    /// </summary>
    private static IQueryable<Room> ApplyFilters(IQueryable<Room> query, RoomSearchCriteria criteria)
    {
        var bounds = criteria.Bounds;

        query = query.Where(r =>
            r.Status == RoomStatus.Published &&
            r.Venue!.Latitude >= bounds.MinLatitude &&
            r.Venue.Latitude <= bounds.MaxLatitude &&
            r.Venue.Longitude >= bounds.MinLongitude &&
            r.Venue.Longitude <= bounds.MaxLongitude);

        if (!string.IsNullOrWhiteSpace(criteria.Suburb))
        {
            var suburb = criteria.Suburb.Trim().ToLower();
            query = query.Where(r => r.Venue!.Suburb.ToLower() == suburb);
        }

        if (criteria.MinCapacity is int minCapacity)
        {
            query = query.Where(r => r.Capacity >= minCapacity);
        }

        if (criteria.FreeOnly)
        {
            query = query.Where(r => r.PricePerHour == null || r.PricePerHour <= 0m);
        }

        if (criteria.Activities != ActivityType.None)
        {
            // Room must accept ALL requested activities. Cast to int so Npgsql can
            // translate the bitwise AND to SQL.
            var activities = (int)criteria.Activities;
            query = query.Where(r => ((int)r.AcceptedActivityTypes & activities) == activities);
        }

        if (criteria.Accessibility != AccessibilityFeature.None)
        {
            var accessibility = (int)criteria.Accessibility;
            query = query.Where(r => ((int)r.AccessibilityFeatures & accessibility) == accessibility);
        }

        return query;
    }
}
