using Steeple.Admin.Services.Admin;
using Microsoft.AspNetCore.Mvc;

namespace Steeple.Admin.Controllers;

[Route("admin")]
public sealed class AdminController : Controller
{
    private readonly IAdminWorkspace _workspace;

    public AdminController(IAdminWorkspace workspace)
    {
        _workspace = workspace;
    }

    [HttpGet("")]
    [HttpGet("/")]
    public IActionResult Index()
    {
        ViewData["Title"] = "Overview";
        ViewData["ActiveSection"] = "overview";
        return View(_workspace.Snapshot());
    }

    [HttpGet("users")]
    public IActionResult Users()
    {
        ViewData["Title"] = "Users";
        ViewData["ActiveSection"] = "users";
        return View(_workspace.Snapshot());
    }

    [HttpGet("listings")]
    public IActionResult Listings()
    {
        ViewData["Title"] = "Listings";
        ViewData["ActiveSection"] = "listings";
        return View(_workspace.Snapshot());
    }

    [HttpGet("analytics")]
    public IActionResult Analytics()
    {
        ViewData["Title"] = "Analytics";
        ViewData["ActiveSection"] = "analytics";
        return View(_workspace.Snapshot());
    }

    [HttpGet("feature-flags")]
    public IActionResult Flags()
    {
        ViewData["Title"] = "Feature flags";
        ViewData["ActiveSection"] = "flags";
        return View(_workspace.Snapshot());
    }

    [HttpGet("account/login")]
    public IActionResult Login()
    {
        ViewData["Title"] = "Admin login";
        return View();
    }

    [HttpPost("account/login")]
    public IActionResult LoginPost()
    {
        // HX-Redirect drives a client-side navigation, so it must be the full browser path
        // including any reverse-proxy sub-path prefix (Url.Content resolves ~/ against PathBase).
        Response.Headers["HX-Redirect"] = Url.Content("~/admin");
        return RedirectToAction(nameof(Index));
    }

    [HttpGet("account")]
    public IActionResult Account()
    {
        ViewData["Title"] = "Admin account";
        ViewData["ActiveSection"] = "account";
        return View(_workspace.Snapshot());
    }

    [HttpPost("account/logout")]
    public IActionResult Logout()
    {
        Response.Headers["HX-Redirect"] = Url.Content("~/admin/account/login");
        return RedirectToAction(nameof(Login));
    }

    [HttpPost("users/status")]
    public IActionResult UserStatus([FromForm] Guid[] ids, [FromForm] string status)
    {
        _workspace.UpdateUserStatuses(ids, status);
        return PartialView("_UsersTable", _workspace.Snapshot());
    }

    [HttpPost("listings/status")]
    public IActionResult ListingStatus([FromForm] Guid[] ids, [FromForm] string status)
    {
        _workspace.UpdateListingStatuses(ids, status);
        return PartialView("_ListingsPanel", _workspace.Snapshot());
    }

    [HttpPost("feature-flags/{key}/toggle")]
    public IActionResult ToggleFlag(string key, [FromForm] bool enabled)
    {
        _workspace.ToggleFeatureFlag(key, enabled);
        return PartialView("_FeatureFlagsPanel", _workspace.Snapshot());
    }
}
