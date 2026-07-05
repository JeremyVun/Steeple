using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Primitives;
using Steeple.Api.Utils;

namespace Steeple.Api.Controllers;

/// <summary>
/// JSON discovery API consumed by the web funnel and (later) the mobile edge. Returns the same
/// contract DTOs the web app renders. Analytics for search/detail are recorded server-side by the
/// listing service, so callers get instrumentation for free.
/// </summary>
/// <remarks>
/// <see cref="ApiControllerAttribute"/> is required for MVC's <c>NotFound()</c>/other client-error
/// results to be transformed into ProblemDetails by <c>UseStatusCodePages()</c> — without it, a
/// bare <see cref="NotFoundResult"/> writes an empty body that the status-code-pages middleware
/// never intercepts (only "no endpoint matched" 404s do).
/// </remarks>
[ApiController]
[Route("api/v1")]
public sealed class ListingsApiController : ControllerBase
{
    /// <summary>Time-first ("When") search is gated behind this flag (off → params ignored).</summary>
    private const string AvailabilityFlag = "listing.availability";

    /// <summary>The beachhead's single IANA timezone; the one-off <c>date</c> is validated venue-local against it.</summary>
    private const string BeachheadTimezone = "America/New_York";

    private readonly IListingService _listings;
    private readonly IGeofencePolicy _geofence;
    private readonly IFeatureFlags _flags;
    private readonly TimeProvider _clock;

    public ListingsApiController(IListingService listings, IGeofencePolicy geofence, IFeatureFlags flags, TimeProvider clock)
    {
        _listings = listings;
        _geofence = geofence;
        _flags = flags;
        _clock = clock;
    }

    /// <summary>Geo-fenced search over published rooms, optionally time-first ("When") filtered.</summary>
    [HttpGet("listings/search")]
    public async Task<ActionResult<ListingSearchResult>> Search([FromQuery] ListingSearchQuery query, CancellationToken ct)
    {
        // Re-bind the [Flags] filters from the raw query string so repeated chips OR together
        // (e.g. ?Activities=Children&Activities=Music), mirroring the funnel's binding behaviour.
        query.Activities = ReadFlags("Activities", query.Activities);
        query.Accessibility = ReadFlags("Accessibility", query.Accessibility);

        // Resolve the When filter from the raw query (repeatable daysOfWeek bound like the flags
        // params). Behind listing.availability: flag off → params ignored. Malformed → 400 invalid_when.
        var todayLocal = DateOnly.FromDateTime(
            TimeZoneInfo.ConvertTime(_clock.GetUtcNow(), TimeZoneInfo.FindSystemTimeZoneById(BeachheadTimezone)).DateTime);
        var when = WhenFilterBinder.Resolve(
            new WhenFilterBinder.WhenQuery(
                Date: Request.Query["date"],
                TimeOfDay: Request.Query["timeOfDay"],
                StartTime: Request.Query["startTime"],
                EndTime: Request.Query["endTime"],
                DayTokens: ReadTokens("daysOfWeek"),
                DurationMinutes: Request.Query["durationMinutes"]),
            todayLocal,
            _flags.IsEnabled(AvailabilityFlag));

        if (when.Error is { } detail)
        {
            return Problem(detail: detail, statusCode: StatusCodes.Status400BadRequest, extensions: new Dictionary<string, object?>
            {
                ["code"] = "invalid_when",
            });
        }

        var result = await _listings.SearchAsync(query, when.Filter, ct);
        return Ok(result);
    }

    /// <summary>Reads repeated/comma-joined query values for <paramref name="key"/> as a flat token list.</summary>
    private IReadOnlyList<string> ReadTokens(string key)
    {
        if (!Request.Query.TryGetValue(key, out StringValues raw) || raw.Count == 0)
        {
            return [];
        }

        var tokens = new List<string>();
        foreach (var entry in raw)
        {
            if (string.IsNullOrWhiteSpace(entry))
            {
                continue;
            }

            tokens.AddRange(entry.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
        }

        return tokens;
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
        Ok(new GeofenceContextDto(_geofence.AreaName, _geofence.Center.ToDto(), _geofence.Beachhead.ToDto()));

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
