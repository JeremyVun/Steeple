using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Primitives;

namespace Steeple.Web.Controllers;

/// <summary>
/// Read-only discovery funnel: geo-fenced listing search (full page + HTMX partial)
/// and shareable listing detail pages. No auth, no booking — applying converts to the app.
/// </summary>
public sealed class DiscoveryController : SteepleControllerBase
{
    private readonly ISteepleApiClient _api;
    private readonly BrandOptions _brand;
    private readonly IFeatureFlags _flags;

    /// <summary>Creates the controller.</summary>
    public DiscoveryController(ISteepleApiClient api, BrandOptions brand, IFeatureFlags flags)
    {
        _api = api;
        _brand = brand;
        _flags = flags;
    }

    /// <summary>
    /// Full discovery page: filter bar, results list, and the map.
    /// </summary>
    [HttpGet("/")]
    public async Task<IActionResult> Index([FromQuery] ListingSearchQuery query, CancellationToken ct)
    {
        EnsureSessionId();
        var vm = await BuildViewModelAsync(query, includeSuburbs: true, ct);
        ViewData["Canonical"] = AbsoluteUrl("/");
        ViewData["Description"] = $"Browse community halls and church spaces to hire in {vm.AreaName} — many of them free. Filter by size, accessibility, and what they're good for.";
        return View(vm);
    }

    /// <summary>
    /// HTMX target for live filtering — returns only the results partial (which also
    /// re-emits the map-data script so the map can be rebuilt on the client).
    /// </summary>
    [HttpGet("search")]
    public async Task<IActionResult> Results([FromQuery] ListingSearchQuery query, CancellationToken ct)
    {
        EnsureSessionId();

        // hx-push-url makes /search?... a shareable, bookmarkable URL. A non-HTMX GET of it
        // (refresh, share, open-in-new-tab) must render the full page, not the bare partial —
        // and only the full page needs the suburb-picker options.
        var isHtmx = Request.Headers.ContainsKey("HX-Request");
        var vm = await BuildViewModelAsync(query, includeSuburbs: !isHtmx, ct);

        if (!isHtmx)
        {
            // Filtered result URLs are noindex (faceted duplicates); canonical points to the home page.
            ViewData["Robots"] = "noindex,follow";
            ViewData["Canonical"] = AbsoluteUrl("/");
            return View("Index", vm);
        }

        return PartialView("_Results", vm);
    }

    /// <summary>
    /// Shareable listing detail page, addressed by venue + room slug (the canonical URL).
    /// </summary>
    [HttpGet("space/{venueSlug}/{roomSlug}")]
    public async Task<IActionResult> Detail(string venueSlug, string roomSlug, [FromQuery] int reviewsPage = 1, CancellationToken ct = default)
    {
        EnsureSessionId();
        var dto = await _api.GetBySlugAsync(venueSlug, roomSlug, ct);
        if (dto is null)
        {
            Response.StatusCode = StatusCodes.Status404NotFound;
            return View("NotFound");
        }

        ViewData["Canonical"] = AbsoluteUrl($"/space/{dto.Venue.Slug}/{dto.RoomSlug}");
        ViewData["Description"] = BuildListingDescription(dto);
        // The in-product apply flow supersedes the mailto CTA when its flag is on (ROADMAP Phase 2).
        ViewData["ApplyEnabled"] = _flags.IsEnabled("web.apply_from_browser");
        var primaryPhoto = dto.Photos.FirstOrDefault(p => p.IsPrimary)?.Url ?? dto.Photos.FirstOrDefault()?.Url;
        if (primaryPhoto is not null)
        {
            ViewData["OgImage"] = primaryPhoto;
        }
        ViewData["VenueReviews"] = await _api
            .GetVenueReviewsAsync(dto.Venue.VenueId, reviewsPage, pageSize: 5, ct)
            .ConfigureAwait(false);
        SetPreconnectOrigins(dto.Photos.Select(p => p.Url));

        return View(dto);
    }

    /// <summary>
    /// Stable-id entry point that redirects (301) to the canonical slug URL.
    /// </summary>
    [HttpGet("listings/{id:guid}")]
    public async Task<IActionResult> DetailById(Guid id, CancellationToken ct)
    {
        var dto = await _api.GetByIdAsync(id, ct);
        if (dto is null)
        {
            Response.StatusCode = StatusCodes.Status404NotFound;
            return View("NotFound");
        }

        // Route-based redirect so the 301 Location carries the reverse-proxy PathBase (sub-path).
        return RedirectToActionPermanent(nameof(Detail),
            new { venueSlug = dto.Venue.Slug, roomSlug = dto.RoomSlug });
    }

    /// <summary>
    /// Resolves geofence context and runs the search, packaging everything into the view model.
    /// Re-binds the [Flags] enum filters from the raw query string so multiple checked chips
    /// reliably OR together regardless of MVC's default enum-collection binding behaviour.
    /// </summary>
    private async Task<DiscoveryViewModel> BuildViewModelAsync(
        ListingSearchQuery query, bool includeSuburbs, CancellationToken ct)
    {
        query.Activities = ReadFlags<ActivityType>("Activities", query.Activities);
        query.Accessibility = ReadFlags<AccessibilityFeature>("Accessibility", query.Accessibility);

        // Forward the funnel's raw query string so the API applies exactly the same filters.
        var result = await _api.SearchAsync(Request.QueryString.Value, ct);
        var geofence = await _api.GetGeofenceAsync(ct);

        // Preconnect to the card photos' origin(s) — harmless to set even for HTMX partial swaps
        // (ViewData isn't rendered there since the partial has no <head>).
        SetPreconnectOrigins(result.Items.Select(i => i.PrimaryPhotoUrl));

        // The suburb picker only renders on the full page, so skip the extra call for HTMX swaps.
        var suburbs = includeSuburbs
            ? await _api.GetSuburbsAsync(ct)
            : (IReadOnlyList<string>)[];

        return new DiscoveryViewModel
        {
            Result = result,
            Query = query,
            AreaName = geofence.AreaName,
            Center = geofence.Center,
            Beachhead = geofence.Beachhead,
            SuburbOptions = suburbs,
        };
    }

    /// <summary>
    /// Reads repeated query-string values for <paramref name="key"/> (e.g. <c>?Activities=Children&amp;Activities=Music</c>)
    /// and ORs them into a single <typeparamref name="TEnum"/> flags value. Comma-joined values are also handled.
    /// Falls back to the value the default binder produced when no raw values are present.
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

    /// <summary>Builds a concise meta description for a listing detail page.</summary>
    private string BuildListingDescription(RoomDetailDto d)
    {
        var price = d.IsFree
            ? "free to hire"
            : (d.PricePerHour is decimal p ? $"${p:0.##}/hr" : "enquire for pricing");
        var where = string.IsNullOrWhiteSpace(d.Venue.Suburb) ? d.Venue.Name : $"{d.Venue.Name}, {d.Venue.Suburb}";
        return $"{d.RoomName} at {where} — up to {d.Capacity} people, {price}. Find and hire community space on {_brand.Name}.";
    }

    /// <summary>Gets the existing session id or mints a new one (read-only analytics correlation handle).</summary>
    private string EnsureSessionId()
    {
        var sid = HttpContext.Session.GetString("sid");
        if (string.IsNullOrEmpty(sid))
        {
            sid = Guid.NewGuid().ToString("N");
            HttpContext.Session.SetString("sid", sid);
        }

        return sid;
    }
}
