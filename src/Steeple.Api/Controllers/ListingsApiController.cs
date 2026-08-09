using System.Globalization;
using System.Text;
using System.Xml.Linq;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Primitives;

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
[EnableRateLimiting(RateLimitPolicies.Discovery)]
public sealed class ListingsApiController : ControllerBase
{
    /// <summary>Time-first ("When") search is gated behind this flag (off → params ignored).</summary>
    private const string AvailabilityFlag = "listing.availability";

    private readonly IListingService _listings;
    private readonly IGeofencePolicy _geofence;
    private readonly IFeatureFlags _flags;
    private readonly IPublicBaseResolver _publicBase;
    private readonly TimeProvider _clock;

    public ListingsApiController(
        IListingService listings,
        IGeofencePolicy geofence,
        IFeatureFlags flags,
        IPublicBaseResolver publicBase,
        TimeProvider clock)
    {
        _listings = listings;
        _geofence = geofence;
        _flags = flags;
        _publicBase = publicBase;
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
        query.Amenities = ReadFlags("Amenities", query.Amenities);

        // Resolve the When filter from the raw query (repeatable daysOfWeek bound like the flags
        // params). Behind listing.availability: flag off → params ignored. Malformed → 400 invalid_when.
        // "Today" read in the served area's own timezone (the one-off `date` is validated
        // against it); venue-scoped schedule rules still use each venue's own timezone.
        var todayLocal = DateOnly.FromDateTime(
            TimeZoneInfo.ConvertTime(_clock.GetUtcNow(), TimeZoneInfo.FindSystemTimeZoneById(_geofence.TimezoneId)).DateTime);
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

    /// <summary>
    /// The same rows as <c>sitemap</c>, rendered as sitemaps.org XML for crawlers
    /// (docs/contracts/seo.md). Web v2 is a static bundle behind nginx and has no server of its own to render
    /// this, so the API — the only thing that knows which listings are published — renders it and
    /// the edge aliases <c>/sitemap.xml</c> onto this route.
    /// </summary>
    /// <remarks>
    /// URLs are absolute and come from the configured public base — the same resolver the listing
    /// documents use, so the two crawler surfaces can never advertise different origins for the
    /// same room (docs/backlog/seo/design.md §7).
    /// </remarks>
    [HttpGet("sitemap.xml")]
    [ResponseCache(Duration = 3600)]
    public async Task<IActionResult> SitemapXml(CancellationToken ct)
    {
        var entries = await _listings.GetSitemapEntriesAsync(ct);
        var publicBase = _publicBase.Resolve(Request);

        XNamespace ns = "http://www.sitemaps.org/schemas/sitemap/0.9";
        var urls = new List<XElement>
        {
            new(ns + "url",
                new XElement(ns + "loc", publicBase.Absolute(string.Empty)),
                new XElement(ns + "changefreq", "daily"),
                new XElement(ns + "priority", "1.0")),
        };
        // The same path builder the listing document's canonical uses, so a loc and the canonical
        // it leads to cannot be spelled differently (SEO-D9).
        urls.AddRange(entries.Select(entry => new XElement(ns + "url",
            new XElement(ns + "loc", publicBase.Absolute(WebDocumentRenderer.ListingPath(entry.VenueSlug, entry.RoomSlug))),
            new XElement(ns + "lastmod", entry.LastModifiedUtc.UtcDateTime.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)),
            new XElement(ns + "changefreq", "weekly"),
            new XElement(ns + "priority", "0.8"))));

        var document = new XDocument(new XDeclaration("1.0", "utf-8", null), new XElement(ns + "urlset", urls));
        return Content(document.Declaration + Environment.NewLine + document, "application/xml", Encoding.UTF8);
    }

    /// <summary>Served-area context (name, center, beachhead box) for framing the map.</summary>
    [HttpGet("geofence")]
    public ActionResult<GeofenceContextDto> Geofence() =>
        Ok(new GeofenceContextDto(_geofence.AreaName, _geofence.Center.ToDto(), _geofence.Bounds.ToDto()));

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
