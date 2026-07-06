
namespace Steeple.Api.Services;
/// <summary>
/// Default <see cref="IListingService"/> for the read-only discovery slice. Resolves geofenced
/// search bounds, queries the room repository port, maps results to DTOs, and records best-effort
/// analytics events (the PRD's liquidity proxy) without ever letting analytics failures surface.
/// </summary>
public sealed class ListingService : IListingService
{
    /// <summary>Upper bound on page size for the public, unauthenticated search endpoints.</summary>
    private const int MaxPageSize = 100;

    private readonly IRoomRepository _rooms;
    private readonly IGeofencePolicy _geofence;
    private readonly IRatingService _ratings;
    private readonly IAvailabilityService _availability;
    private readonly IAnalyticsSink _analytics;
    private readonly TimeProvider _clock;

    /// <summary>Creates the service from its repository, geofence, ratings, availability, and analytics ports.</summary>
    public ListingService(
        IRoomRepository rooms,
        IGeofencePolicy geofence,
        IRatingService ratings,
        IAvailabilityService availability,
        IAnalyticsSink analytics,
        TimeProvider clock)
    {
        _rooms = rooms;
        _geofence = geofence;
        _ratings = ratings;
        _availability = availability;
        _analytics = analytics;
        _clock = clock;
    }

    /// <inheritdoc />
    public async Task<ListingSearchResult> SearchAsync(ListingSearchQuery query, AvailabilityFilter? when = null, CancellationToken ct = default)
    {
        var bounds = _geofence.ResolveSearchBounds(query);

        var page = query.Page < 1 ? 1 : query.Page;
        // Clamp page size so an anonymous caller can't pull the whole table in one request.
        var pageSize = Math.Clamp(query.PageSize, 1, MaxPageSize);
        var skip = (page - 1) * pageSize;

        // Distance is only meaningful when the query supplied a center; when present we push the
        // nearest-first ordering into the query so pagination returns the closest rooms, not page 1 by name.
        var searchCenter = query.CenterLat is double centerLat && query.CenterLng is double centerLng
            ? new GeoPoint(centerLat, centerLng)
            : (GeoPoint?)null;

        var criteria = new RoomSearchCriteria(
            Bounds: bounds,
            MinCapacity: query.MinCapacity,
            Activities: query.Activities,
            Accessibility: query.Accessibility,
            Suburb: query.Suburb,
            Skip: skip,
            Take: pageSize,
            Center: searchCenter,
            When: when);

        // Rooms to project + the true total. A When filter refines the cheap SQL prefilter against
        // real free windows, so we fetch every prefiltered candidate, drop non-matchers, count and
        // paginate afterwards (the SQL Skip/Take can't see availability). Plain search paginates in SQL.
        IReadOnlyList<Room> rooms;
        int totalCount;
        IReadOnlyDictionary<Guid, MatchedWindowDto> matched;
        if (when is not null)
        {
            var candidates = await _rooms.SearchAllAsync(criteria, ct).ConfigureAwait(false);
            matched = await _availability
                .FilterByWhenAsync(
                    candidates.Where(r => r.Venue is not null).Select(r => (r.Id, r.Venue!.Timezone)).ToList(),
                    when,
                    ct)
                .ConfigureAwait(false);
            rooms = candidates.Where(r => matched.ContainsKey(r.Id)).ToList();
            totalCount = rooms.Count;
        }
        else
        {
            rooms = await _rooms.SearchAsync(criteria, ct).ConfigureAwait(false);
            totalCount = await _rooms.CountAsync(criteria, ct).ConfigureAwait(false);
            matched = EmptyMatched;
        }

        var ratingSummaries = await _ratings
            .GetVenueSummariesAsync(
                rooms.Select(r => r.VenueId).Distinct().ToList(),
                _clock.GetUtcNow(),
                ct)
            .ConfigureAwait(false);

        IEnumerable<RoomSummaryDto> items;
        if (searchCenter is { } c)
        {
            items = rooms
                .Select(room =>
                {
                    var venue = room.Venue;
                    var distance = venue is null
                        ? (double?)null
                        : GeoMath.DistanceMeters(c.Latitude, c.Longitude, venue.Latitude, venue.Longitude);
                    return room.ToSummaryDto(distance, ratingSummaries.GetValueOrDefault(room.VenueId), matched.GetValueOrDefault(room.Id));
                })
                .OrderBy(dto => dto.DistanceMeters ?? double.MaxValue);
        }
        else
        {
            items = rooms
                .Select(room => room.ToSummaryDto(rating: ratingSummaries.GetValueOrDefault(room.VenueId), matchedWindow: matched.GetValueOrDefault(room.Id)))
                .OrderBy(dto => dto.VenueName, StringComparer.OrdinalIgnoreCase)
                .ThenBy(dto => dto.RoomName, StringComparer.OrdinalIgnoreCase);
        }

        // Plain search already paged in SQL; the When path holds every survivor, so cut the page here.
        var itemList = (when is not null ? items.Skip(skip).Take(pageSize) : items).ToList();

        var center = searchCenter ?? _geofence.Center;

        await TrackSafelyAsync(
            "search_performed",
            new
            {
                minCapacity = query.MinCapacity,
                suburb = string.IsNullOrWhiteSpace(query.Suburb) ? null : query.Suburb.Trim(),
                activities = query.Activities.ToNameList(),
                accessibility = query.Accessibility.ToNameList(),
                bounds,
                resultCount = totalCount,
                zeroResult = totalCount == 0,
                // Additive When-filter instrumentation (CONTRACTS §7).
                hasWhenFilter = when is not null,
                whenMode = when is null ? "none" : when.IsRecurring ? "recurring" : "oneOff",
                timeOfDay = when?.TimeOfDayBand,
                weekdayCount = when is { IsRecurring: true } ? WeekdayCount(when.Weekdays) : (int?)null
            },
            ct).ConfigureAwait(false);

        return new ListingSearchResult(
            Items: itemList,
            TotalCount: totalCount,
            IsZeroResult: totalCount == 0,
            AppliedBounds: bounds.ToDto(),
            Center: center.ToDto(),
            Page: page,
            PageSize: pageSize);
    }

    /// <summary>Empty match map for the plain-search path (no When filter, no matched windows).</summary>
    private static readonly IReadOnlyDictionary<Guid, MatchedWindowDto> EmptyMatched = new Dictionary<Guid, MatchedWindowDto>();

    /// <summary>Number of set weekdays in a recurring mask (analytics <c>weekdayCount</c>).</summary>
    private static int WeekdayCount(Weekdays days) => System.Numerics.BitOperations.PopCount((uint)days);

    /// <inheritdoc />
    public async Task<RoomDetailDto?> GetByIdAsync(Guid roomId, CancellationToken ct = default)
    {
        var room = await _rooms.GetByIdAsync(roomId, ct).ConfigureAwait(false);
        return await ToDetailIfDiscoverableAsync(room, ct).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public async Task<RoomDetailDto?> GetBySlugAsync(string venueSlug, string roomSlug, CancellationToken ct = default)
    {
        var room = await _rooms.GetBySlugAsync(venueSlug, roomSlug, ct).ConfigureAwait(false);
        return await ToDetailIfDiscoverableAsync(room, ct).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public Task<IReadOnlyList<string>> GetSuburbsAsync(CancellationToken ct = default) =>
        _rooms.GetPublishedSuburbsAsync(ct);

    /// <inheritdoc />
    public Task<IReadOnlyList<SitemapEntry>> GetSitemapEntriesAsync(CancellationToken ct = default) =>
        _rooms.GetPublishedForSitemapAsync(ct);

    /// <summary>
    /// Projects a loaded room to its detail DTO, enforcing the beachhead as defence-in-depth:
    /// a room whose venue falls outside the served area is treated as not discoverable.
    /// Fires a best-effort "listing_viewed" analytics event on success.
    /// </summary>
    private async Task<RoomDetailDto?> ToDetailIfDiscoverableAsync(Room? room, CancellationToken ct)
    {
        if (room?.Venue is not { } venue)
        {
            return null;
        }

        // Only Published rooms are publicly visible. Search filters status in SQL, but direct
        // id/slug lookups reach here unfiltered — without this gate a Draft/Unlisted room leaks
        // via a guessed or previously-shared URL.
        if (room.Status != RoomStatus.Published)
        {
            return null;
        }

        if (!_geofence.IsWithinBeachhead(venue.Latitude, venue.Longitude))
        {
            return null;
        }

        var ratingSummaries = await _ratings
            .GetVenueSummariesAsync([venue.Id], _clock.GetUtcNow(), ct)
            .ConfigureAwait(false);
        // Cross-module read through the Availability port (never queries its tables directly);
        // null for pre-gate legacy rooms with no declared hours.
        var openHours = await _availability.GetPublicOpenHoursAsync(room.Id, ct).ConfigureAwait(false);
        var dto = room.ToDetailDto(ratingSummaries.GetValueOrDefault(venue.Id), openHours);

        await TrackSafelyAsync(
            "listing_viewed",
            new { roomId = room.Id, venueId = venue.Id },
            ct).ConfigureAwait(false);

        return dto;
    }

    /// <summary>
    /// Records an analytics event, swallowing any failure. Analytics is observability, never a
    /// reason to fail a read request. Session correlation is out of scope for the service contract,
    /// so the session id is left null here.
    /// </summary>
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
}
