
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
    private readonly IAnalyticsSink _analytics;
    private readonly TimeProvider _clock;

    /// <summary>Creates the service from its repository, geofence, and analytics ports.</summary>
    public ListingService(
        IRoomRepository rooms,
        IGeofencePolicy geofence,
        IRatingService ratings,
        IAnalyticsSink analytics,
        TimeProvider clock)
    {
        _rooms = rooms;
        _geofence = geofence;
        _ratings = ratings;
        _analytics = analytics;
        _clock = clock;
    }

    /// <inheritdoc />
    public async Task<ListingSearchResult> SearchAsync(ListingSearchQuery query, CancellationToken ct = default)
    {
        var bounds = _geofence.ResolveSearchBounds(query);

        var page = query.Page < 1 ? 1 : query.Page;
        // Clamp page size so an anonymous caller can't pull the whole table in one request.
        var pageSize = Math.Clamp(query.PageSize, 1, MaxPageSize);

        // Distance is only meaningful when the query supplied a center; when present we push the
        // nearest-first ordering into the query so pagination returns the closest rooms, not page 1 by name.
        var searchCenter = query.CenterLat is double centerLat && query.CenterLng is double centerLng
            ? new GeoPoint(centerLat, centerLng)
            : (GeoPoint?)null;

        var criteria = new RoomSearchCriteria(
            Bounds: bounds,
            MinCapacity: query.MinCapacity,
            FreeOnly: query.FreeOnly,
            Activities: query.Activities,
            Accessibility: query.Accessibility,
            Suburb: query.Suburb,
            Skip: (page - 1) * pageSize,
            Take: pageSize,
            Center: searchCenter);

        var rooms = await _rooms.SearchAsync(criteria, ct).ConfigureAwait(false);
        var totalCount = await _rooms.CountAsync(criteria, ct).ConfigureAwait(false);
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
                    return room.ToSummaryDto(distance, ratingSummaries.GetValueOrDefault(room.VenueId));
                })
                .OrderBy(dto => dto.DistanceMeters ?? double.MaxValue);
        }
        else
        {
            items = rooms
                .Select(room => room.ToSummaryDto(rating: ratingSummaries.GetValueOrDefault(room.VenueId)))
                .OrderBy(dto => dto.VenueName, StringComparer.OrdinalIgnoreCase)
                .ThenBy(dto => dto.RoomName, StringComparer.OrdinalIgnoreCase);
        }

        var itemList = items.ToList();

        var center = searchCenter ?? _geofence.Center;

        await TrackSafelyAsync(
            "search_performed",
            new
            {
                freeOnly = query.FreeOnly,
                minCapacity = query.MinCapacity,
                suburb = string.IsNullOrWhiteSpace(query.Suburb) ? null : query.Suburb.Trim(),
                activities = query.Activities.ToNameList(),
                accessibility = query.Accessibility.ToNameList(),
                bounds,
                resultCount = totalCount,
                zeroResult = totalCount == 0
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
        var dto = room.ToDetailDto(ratingSummaries.GetValueOrDefault(venue.Id));

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
