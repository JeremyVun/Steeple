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
    public async Task<IReadOnlyList<Room>> SearchAsync(RoomSearchCriteria criteria, CancellationToken ct = default) =>
        await BuildOrdered(criteria)
            .Skip(criteria.Skip)
            .Take(criteria.Take)
            .ToListAsync(ct);

    /// <inheritdoc />
    public async Task<IReadOnlyList<Room>> SearchAllAsync(RoomSearchCriteria criteria, CancellationToken ct = default) =>
        await BuildOrdered(criteria).ToListAsync(ct);

    /// <inheritdoc />
    public Task<int> CountAsync(RoomSearchCriteria criteria, CancellationToken ct = default) =>
        ApplyFilters(_db.Rooms.AsNoTracking(), criteria).CountAsync(ct);

    /// <summary>The filtered + presentation-ordered query (venue/photos included), before pagination.</summary>
    private IQueryable<Room> BuildOrdered(RoomSearchCriteria criteria)
    {
        var filtered = ApplyFilters(
            _db.Rooms
                .AsNoTracking()
                .Include(r => r.Venue)
                .Include(r => r.Photos),
            criteria);

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
            return filtered
                .OrderBy(r =>
                    (r.Venue!.Latitude - cLat) * (r.Venue.Latitude - cLat) +
                    (r.Venue.Longitude - cLng) * (r.Venue.Longitude - cLng) * lngScaleSq)
                .ThenBy(r => r.Id);
        }

        // Stable ordering so pagination is deterministic.
        return filtered
            .OrderBy(r => r.Venue!.Name)
            .ThenBy(r => r.Name)
            .ThenBy(r => r.Id);
    }

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
            // The listing page renders venue fields too, so lastmod is whichever changed last.
            .Select(r => new SitemapEntry(
                r.Venue!.Slug, r.Slug,
                r.UpdatedAtUtc > r.Venue!.UpdatedAtUtc ? r.UpdatedAtUtc : r.Venue!.UpdatedAtUtc))
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

        if (criteria.When is { } when)
        {
            query = ApplyWhenPrefilter(query, when);
        }

        return query;
    }

    /// <summary>
    /// Cheap, translatable open-hours/blackout prefilter for a time-first search (the service refines
    /// survivors against real free windows afterwards, so this only needs to be a <b>superset</b> of
    /// the true matches — never dropping a room that could still qualify). Requires an open-hours row
    /// (index <c>(RoomId, DayOfWeek)</c>) on the requested weekday(s): containing the explicit range,
    /// overlapping the band, or any row for an unconstrained day. Recurring searches require such a
    /// row for <b>every</b> requested weekday. One-off searches also exclude blackout dates.
    /// </summary>
    private static IQueryable<Room> ApplyWhenPrefilter(IQueryable<Room> query, AvailabilityFilter when)
    {
        foreach (var weekday in ExpandWeekdays(when))
        {
            var wd = weekday;
            query = when.RangeKind switch
            {
                // Explicit range: a single open window must contain [start, end).
                WhenRangeKind.Explicit => query.Where(r => r.OpenHours.Any(h =>
                    h.DayOfWeek == wd && h.StartTime <= when.RangeStart && h.EndTime >= when.RangeEnd)),
                // Band: an open window merely has to overlap the band (duration fit is a refinement concern).
                WhenRangeKind.Band => query.Where(r => r.OpenHours.Any(h =>
                    h.DayOfWeek == wd && h.StartTime < when.RangeEnd && h.EndTime > when.RangeStart)),
                // Any window: just declare open hours that day.
                _ => query.Where(r => r.OpenHours.Any(h => h.DayOfWeek == wd)),
            };
        }

        if (when is { IsRecurring: false, Date: { } date })
        {
            query = query.Where(r => !r.BlackoutDates.Any(b => b.Date == date));
        }

        return query;
    }

    /// <summary>The distinct weekday(s) a filter targets: the one-off date's weekday, or every weekday in the recurring mask.</summary>
    private static IEnumerable<DayOfWeek> ExpandWeekdays(AvailabilityFilter when)
    {
        if (!when.IsRecurring)
        {
            yield return when.Date!.Value.DayOfWeek;
            yield break;
        }

        for (var d = DayOfWeek.Sunday; d <= DayOfWeek.Saturday; d++)
        {
            if ((when.Weekdays & (Weekdays)(1 << (int)d)) != 0)
            {
                yield return d;
            }
        }
    }
}
