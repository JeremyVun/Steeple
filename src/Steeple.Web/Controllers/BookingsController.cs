using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Steeple.Web.Controllers;

/// <summary>
/// The organizer's bookings (ROADMAP Phase 3): "my bookings", each opening into the occurrence
/// list with cancel and no-show marking. The same detail view serves venue managers (party
/// scoping and role detection happen at the API / via the returned booking). A thin BFF surface —
/// all state lives at the API.
/// </summary>
[Authorize]
public sealed class BookingsController : SteepleControllerBase
{
    private readonly ISteepleApiClient _api;
    private readonly ILogger<BookingsController> _logger;

    /// <summary>Creates the controller.</summary>
    public BookingsController(ISteepleApiClient api, ILogger<BookingsController> logger)
    {
        _api = api;
        _logger = logger;
    }

    /// <summary>The organizer's bookings, newest first, filterable by status.</summary>
    [HttpGet("/bookings")]
    public async Task<IActionResult> Index([FromQuery] string? status, [FromQuery] int page = 1, CancellationToken ct = default)
    {
        var accessToken = await AccessTokenOrNullAsync();
        if (accessToken is null)
        {
            return await SignOutToLoginAsync();
        }

        try
        {
            var result = await _api.GetMyBookingsAsync(accessToken, status, page, ct);
            var managed = await _api.GetManagedVenuesAsync(accessToken, ct);

            ViewData["Title"] = "Your bookings";
            ViewData["Robots"] = "noindex,nofollow";
            return View(new BookingsViewModel
            {
                Result = result,
                StatusFilter = string.IsNullOrEmpty(status) ? null : status,
                IsProvider = managed.Count > 0,
                Flash = TempData["BookingFlash"] as string,
            });
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Bookings fetch failed.");
            return View("~/Views/Inbox/Unavailable.cshtml");
        }
    }

    /// <summary>One booking's occurrences and actions — rendered for whichever party is looking.</summary>
    [HttpGet("/bookings/{id:guid}")]
    public async Task<IActionResult> Detail(Guid id, CancellationToken ct)
    {
        var accessToken = await AccessTokenOrNullAsync();
        if (accessToken is null)
        {
            return await SignOutToLoginAsync();
        }

        BookingDto? booking;
        try
        {
            booking = await _api.GetBookingAsync(accessToken, id, ct);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Booking fetch failed.");
            return View("~/Views/Inbox/Unavailable.cshtml");
        }

        if (booking is null)
        {
            Response.StatusCode = StatusCodes.Status404NotFound;
            return View("~/Views/Discovery/NotFound.cshtml");
        }

        ViewData["Title"] = $"Booking · {booking.RoomName}";
        ViewData["Robots"] = "noindex,nofollow";
        return View("Detail", new BookingDetailViewModel
        {
            Booking = booking,
            ViewerIsOrganizer = booking.OrganizerId == ViewerId(),
            Error = TempData["BookingError"] as string,
            Flash = TempData["BookingFlash"] as string,
        });
    }

    /// <summary>Cancels the booking (either party) with an optional reason for the other side.</summary>
    [HttpPost("/bookings/{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id, [FromForm] string? reason, CancellationToken ct)
    {
        var accessToken = await AccessTokenOrNullAsync();
        if (accessToken is null)
        {
            return await SignOutToLoginAsync();
        }

        try
        {
            var (booking, errorCode) = await _api.CancelBookingAsync(
                accessToken, id, string.IsNullOrWhiteSpace(reason) ? null : reason.Trim(), ct);

            if (booking is not null)
            {
                var other = booking.OrganizerId == ViewerId() ? booking.VenueName : booking.OrganizerName;
                TempData["BookingFlash"] = $"Booking cancelled — {other} has been notified and the times are freed.";
            }
            else
            {
                TempData["BookingError"] = errorCode switch
                {
                    "invalid_state" => "This booking has already ended or been cancelled.",
                    _ => "Couldn't cancel the booking. Try again in a moment.",
                };
            }
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Booking cancel failed.");
            TempData["BookingError"] = "Couldn't reach the server — try again in a moment.";
        }

        return Redirect(Url.Content($"~/bookings/{id}"));
    }

    /// <summary>Marks one past occurrence as a no-show (either party marks the other).</summary>
    [HttpPost("/bookings/{id:guid}/occurrences/{occurrenceId:guid}/no-show")]
    public async Task<IActionResult> MarkNoShow(Guid id, Guid occurrenceId, CancellationToken ct)
    {
        var accessToken = await AccessTokenOrNullAsync();
        if (accessToken is null)
        {
            return await SignOutToLoginAsync();
        }

        try
        {
            var (_, errorCode) = await _api.MarkNoShowAsync(accessToken, occurrenceId, ct);
            if (errorCode is not null)
            {
                TempData["BookingError"] = errorCode switch
                {
                    "invalid_state" => "That date can't be marked — it either hasn't happened yet or is already settled.",
                    _ => "Couldn't record the no-show. Try again in a moment.",
                };
            }
            else
            {
                TempData["BookingFlash"] = "No-show recorded.";
            }
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "No-show marking failed.");
            TempData["BookingError"] = "Couldn't reach the server — try again in a moment.";
        }

        return Redirect(Url.Content($"~/bookings/{id}"));
    }

    private async Task<string?> AccessTokenOrNullAsync() =>
        await HttpContext.GetTokenAsync(SteepleCookieEvents.AccessTokenName);

    private async Task<IActionResult> SignOutToLoginAsync()
    {
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return Redirect(Url.Content("~/login"));
    }

    private Guid ViewerId() =>
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id)
            ? id
            : throw new InvalidOperationException("Authenticated principal without a user id claim.");
}
