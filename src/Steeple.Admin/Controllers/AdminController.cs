using Steeple.Admin.Services.Admin;
using Microsoft.AspNetCore.Mvc;

namespace Steeple.Admin.Controllers;

/// <summary>
/// The whole operator surface: an overview, the review queue (first-listing decisions + review
/// comments), the listing takedown lever, and venue-manager linking. No auth here by design —
/// authelia gates /admin at the edge (`docs/ARCHITECTURE.md` → Admin).
/// </summary>
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

    [HttpGet("review")]
    public IActionResult Review()
    {
        ViewData["Title"] = "Review queue";
        ViewData["ActiveSection"] = "review";
        return View(_workspace.Snapshot());
    }

    [HttpPost("review/{roomId:guid}/decide")]
    public IActionResult DecidePublishRequest(Guid roomId, [FromForm] string decision, [FromForm] string? note)
    {
        ViewData["ReviewError"] = _workspace.DecidePublishRequest(
            roomId, decision == "approve", note, OperatorUser());
        return PartialView("_ReviewQueuePanel", _workspace.Snapshot());
    }

    [HttpPost("review/ratings/{ratingId:guid}/visibility")]
    public IActionResult RatingVisibility(Guid ratingId, [FromForm] bool hidden)
    {
        _workspace.SetRatingHidden(ratingId, hidden, OperatorUser());
        return PartialView("_ReviewQueuePanel", _workspace.Snapshot());
    }

    [HttpGet("listings")]
    public IActionResult Listings()
    {
        ViewData["Title"] = "Listings";
        ViewData["ActiveSection"] = "listings";
        return View(_workspace.Snapshot());
    }

    [HttpPost("listings/{roomId:guid}/unlist")]
    public IActionResult UnlistListing(Guid roomId)
    {
        ViewData["ListingsError"] = _workspace.UnlistRoom(roomId, OperatorUser());
        return PartialView("_ListingsPanel", _workspace.Snapshot());
    }

    [HttpGet("venue-managers")]
    public IActionResult VenueManagers()
    {
        ViewData["Title"] = "Venue managers";
        ViewData["ActiveSection"] = "venue-managers";
        return View(_workspace.Snapshot());
    }

    [HttpPost("venue-managers/link")]
    public IActionResult LinkVenueManager([FromForm] Guid venueId, [FromForm] string email)
    {
        ViewData["VenueManagerError"] = _workspace.LinkVenueManager(venueId, email ?? "");
        return PartialView("_VenueManagersPanel", _workspace.Snapshot());
    }

    [HttpPost("venue-managers/{id:guid}/unlink")]
    public IActionResult UnlinkVenueManager(Guid id)
    {
        _workspace.UnlinkVenueManager(id);
        return PartialView("_VenueManagersPanel", _workspace.Snapshot());
    }

    /// <summary>
    /// The authelia-forwarded identity (Remote-User) for audit attribution — CONTRACTS §9. Local
    /// runs have no edge proxy, so fall back to a recognizable dev label.
    /// </summary>
    private string OperatorUser() =>
        Request.Headers.TryGetValue("Remote-User", out var user) && !string.IsNullOrWhiteSpace(user)
            ? user.ToString()
            : "local-dev";
}
