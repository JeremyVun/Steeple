using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Primitives;

namespace Steeple.Api.Controllers;

/// <summary>
/// JSON discovery API consumed by the web funnel and (later) the mobile edge. Returns the same
/// contract DTOs the web app renders. Analytics for search/detail are recorded server-side by the
/// listing service, so callers get instrumentation for free.
/// </summary>
[Route("api")]
public sealed class ListingsApiController : ControllerBase
{
    private readonly IListingService _listings;
    private readonly IGeofencePolicy _geofence;

    public ListingsApiController(IListingService listings, IGeofencePolicy geofence)
    {
        _listings = listings;
        _geofence = geofence;
    }

    /// <summary>Geo-fenced search over published rooms.</summary>
    [HttpGet("listings/search")]
    public async Task<ActionResult<ListingSearchResult>> Search([FromQuery] ListingSearchQuery query, CancellationToken ct)
    {
        // Re-bind the [Flags] filters from the raw query string so repeated chips OR together
        // (e.g. ?Activities=Children&Activities=Music), mirroring the funnel's binding behaviour.
        query.Activities = ReadFlags("Activities", query.Activities);
        query.Accessibility = ReadFlags("Accessibility", query.Accessibility);

        var result = await _listings.SearchAsync(query, ct);
        return Ok(result);
    }

    /// <summary>Full listing detail by venue + room slug (the canonical address).</summary>
    [HttpGet("listings/by-slug/{venueSlug}/{roomSlug}")]
    public async Task<ActionResult<RoomDetailDto>> BySlug(string venueSlug, string roomSlug, CancellationToken ct)
    {
        var dto = await _listings.GetBySlugAsync(venueSlug, roomSlug, ct);
        return dto is null ? NotFound() : Ok(dto);
    }

    /// <summary>Full listing detail by stable id (the web app uses this to resolve the canonical slug).</summary>
    [HttpGet("listings/{id:guid}")]
    public async Task<ActionResult<RoomDetailDto>> ById(Guid id, CancellationToken ct)
    {
        var dto = await _listings.GetByIdAsync(id, ct);
        return dto is null ? NotFound() : Ok(dto);
    }

    /// <summary>Distinct suburbs with at least one published room (for the suburb picker).</summary>
    [HttpGet("suburbs")]
    public async Task<ActionResult<IReadOnlyList<string>>> Suburbs(CancellationToken ct) =>
        Ok(await _listings.GetSuburbsAsync(ct));

    /// <summary>Sitemap rows for every published listing.</summary>
    [HttpGet("sitemap")]
    public async Task<ActionResult<IReadOnlyList<SitemapEntry>>> Sitemap(CancellationToken ct) =>
        Ok(await _listings.GetSitemapEntriesAsync(ct));

    /// <summary>Served-area context (name, center, beachhead box) for framing the map.</summary>
    [HttpGet("geofence")]
    public ActionResult<GeofenceContextDto> Geofence() =>
        Ok(new GeofenceContextDto(_geofence.AreaName, _geofence.Center, _geofence.Beachhead));

    /// <summary>
    /// Reads repeated/comma-joined query values for <paramref name="key"/> and ORs them into a
    /// single <typeparamref name="TEnum"/> flags value, falling back to the default-bound value.
    /// </summary>
    private TEnum ReadFlags<TEnum>(string key, TEnum fallback) where TEnum : struct, Enum
    {
        if (!Request.Query.TryGetValue(key, out StringValues raw) || raw.Count == 0)
        {
            return fallback;
        }

        var acc = 0;
        foreach (var entry in raw)
        {
            if (string.IsNullOrWhiteSpace(entry))
            {
                continue;
            }

            foreach (var token in entry.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                if (Enum.TryParse<TEnum>(token, ignoreCase: true, out var parsed))
                {
                    acc |= Convert.ToInt32(parsed);
                }
            }
        }

        return (TEnum)Enum.ToObject(typeof(TEnum), acc);
    }
}
