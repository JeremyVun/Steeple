namespace Steeple.Web.Services;

/// <summary>
/// Web's gateway to the backend <c>Steeple.Api</c>. The funnel no longer touches the database —
/// it fetches the same contract DTOs over HTTP and renders them. Mirrors the API's discovery surface.
/// </summary>
public interface ISteepleApiClient
{
    /// <summary>Runs a geo-fenced search, forwarding the raw funnel query string to the API.</summary>
    /// <param name="queryString">The request query string (including leading '?'), or null/empty.</param>
    Task<ListingSearchResult> SearchAsync(string? queryString, CancellationToken ct = default);

    /// <summary>Full listing detail by venue + room slug, or <c>null</c> when not found.</summary>
    Task<RoomDetailDto?> GetBySlugAsync(string venueSlug, string roomSlug, CancellationToken ct = default);

    /// <summary>Full listing detail by stable id, or <c>null</c> when not found.</summary>
    Task<RoomDetailDto?> GetByIdAsync(Guid id, CancellationToken ct = default);

    /// <summary>Distinct suburbs with at least one published room.</summary>
    Task<IReadOnlyList<string>> GetSuburbsAsync(CancellationToken ct = default);

    /// <summary>Sitemap rows for every published listing.</summary>
    Task<IReadOnlyList<SitemapEntry>> GetSitemapEntriesAsync(CancellationToken ct = default);

    /// <summary>Served-area context (name, center, beachhead) for framing the map and copy.</summary>
    Task<GeofenceContextDto> GetGeofenceAsync(CancellationToken ct = default);
}
