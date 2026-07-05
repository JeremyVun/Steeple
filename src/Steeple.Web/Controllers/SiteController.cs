using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace Steeple.Web.Controllers;

/// <summary>
/// Static marketing and legal pages: About, Privacy, Terms, the host pitch, and the
/// (stubbed) consumer sign-in. These exist partly so the funnel has somewhere to point
/// its header/footer links, and partly because the app stores require public
/// About / Privacy / Terms pages before a mobile app can be listed.
/// </summary>
public sealed class SiteController : SteepleControllerBase
{
    private readonly ISteepleApiClient _api;
    private readonly BrandOptions _brand;
    private readonly IFeatureFlags _flags;
    private readonly AuthFlowOptions _auth;
    private readonly TurnstileClientOptions _turnstile;

    /// <summary>Creates the controller.</summary>
    public SiteController(
        ISteepleApiClient api,
        BrandOptions brand,
        IFeatureFlags flags,
        IOptions<AuthFlowOptions> auth,
        IOptions<TurnstileClientOptions> turnstile)
    {
        _api = api;
        _brand = brand;
        _flags = flags;
        _auth = auth.Value;
        _turnstile = turnstile.Value;
    }

    /// <summary>What Steeple is and how it works.</summary>
    [HttpGet("/about")]
    public async Task<IActionResult> About(CancellationToken ct)
    {
        ViewData["Title"] = $"About {_brand.Name}";
        ViewData["Description"] = $"{_brand.Name} is a neighbourly noticeboard that helps churches open their spare halls to local community groups.";
        ViewData["Canonical"] = AbsoluteUrl("/about");
        ViewData["AreaName"] = await AreaNameAsync(ct);
        return View();
    }

    /// <summary>Privacy policy (POC placeholder, app-store ready structure).</summary>
    [HttpGet("/privacy")]
    public async Task<IActionResult> Privacy(CancellationToken ct)
    {
        ViewData["Title"] = "Privacy policy";
        ViewData["Description"] = $"How {_brand.Name} handles your data.";
        ViewData["Canonical"] = AbsoluteUrl("/privacy");
        ViewData["AreaName"] = await AreaNameAsync(ct);
        return View();
    }

    /// <summary>Terms of use, including the trust &amp; safety position.</summary>
    [HttpGet("/terms")]
    public async Task<IActionResult> Terms(CancellationToken ct)
    {
        ViewData["Title"] = "Terms & safety";
        ViewData["Description"] = $"The terms of using {_brand.Name}, and how trust and safety work on the platform.";
        ViewData["Canonical"] = AbsoluteUrl("/terms");
        ViewData["AreaName"] = await AreaNameAsync(ct);
        return View();
    }

    /// <summary>Pitch and entry point for venues that want to list a space.</summary>
    [HttpGet("/host")]
    public async Task<IActionResult> Host(CancellationToken ct)
    {
        ViewData["Title"] = "Become a host";
        ViewData["Description"] = $"List your church hall or community space on {_brand.Name} and open it to local groups.";
        ViewData["Canonical"] = AbsoluteUrl("/host");
        ViewData["AreaName"] = await AreaNameAsync(ct);
        return View();
    }

    /// <summary>
    /// Consumer sign-in. Renders the real SSO buttons when <c>web.sign_in_enabled</c> is on
    /// (Google Identity Services button + Apple redirect flow, optionally gated by Turnstile);
    /// otherwise the pre-launch "accounts are coming soon" stub.
    /// </summary>
    [HttpGet("/login")]
    public async Task<IActionResult> Login(string? returnUrl = null, CancellationToken ct = default)
    {
        if (User.Identity?.IsAuthenticated == true)
        {
            return Redirect(Url.Content("~/account"));
        }

        ViewData["Title"] = "Log in";
        ViewData["Description"] = $"Sign in to {_brand.Name}.";
        ViewData["Robots"] = "noindex,follow";
        ViewData["AreaName"] = await AreaNameAsync(ct);
        // Only honour local return paths to avoid open-redirect; fall back to the (sub-path aware) root.
        ViewData["ReturnUrl"] = Url.IsLocalUrl(returnUrl) ? returnUrl : Url.Content("~/");
        ViewData["SignInEnabled"] = _flags.IsEnabled("web.sign_in_enabled");
        ViewData["GoogleClientId"] = _auth.Google.ClientId;
        ViewData["AppleEnabled"] = !string.IsNullOrEmpty(_auth.Apple.ServicesId);
        ViewData["TurnstileSiteKey"] = _turnstile.SiteKey;
        return View();
    }

    /// <summary>
    /// Generic error page — the target of the production exception handler. Verb-agnostic route
    /// (not <c>[HttpGet]</c>): the handler re-executes with the original request's method, so a
    /// failed POST must still reach this action or the user sees a bare 405 instead of the page.
    /// </summary>
    [Route("/error")]
    [IgnoreAntiforgeryToken]
    public IActionResult Error()
    {
        ViewData["Title"] = "Something went wrong";
        ViewData["Robots"] = "noindex,nofollow";
        return View();
    }

    /// <summary>
    /// Human-readable served-area name from the API's geofence context. Falls back to a neutral
    /// label so the always-available legal/marketing pages still render if the API is unavailable.
    /// </summary>
    private async Task<string> AreaNameAsync(CancellationToken ct)
    {
        try
        {
            return (await _api.GetGeofenceAsync(ct)).AreaName;
        }
        catch
        {
            return "your area";
        }
    }
}
