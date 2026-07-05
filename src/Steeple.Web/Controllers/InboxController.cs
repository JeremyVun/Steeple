using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Steeple.Web.Controllers;

/// <summary>
/// The organizer's inbox (ROADMAP Phase 2): their applications, each opening into the ask/answer
/// thread with reply and withdraw. A thin BFF surface — all state lives at the API.
/// </summary>
[Authorize]
public sealed class InboxController : SteepleControllerBase
{
    private const string CounterOffersFlag = "booking.counter_offers";

    private readonly ISteepleApiClient _api;
    private readonly IFeatureFlags _flags;
    private readonly ILogger<InboxController> _logger;

    /// <summary>Creates the controller.</summary>
    public InboxController(ISteepleApiClient api, IFeatureFlags flags, ILogger<InboxController> logger)
    {
        _api = api;
        _flags = flags;
        _logger = logger;
    }

    /// <summary>The organizer's applications, newest first, filterable by status.</summary>
    [HttpGet("/inbox")]
    public async Task<IActionResult> Index([FromQuery] string? status, [FromQuery] int page = 1, CancellationToken ct = default)
    {
        var accessToken = await AccessTokenOrNullAsync();
        if (accessToken is null)
        {
            return await SignOutToLoginAsync();
        }

        try
        {
            var result = await _api.GetMyApplicationsAsync(accessToken, status, page, ct);
            var managed = await _api.GetManagedVenuesAsync(accessToken, ct);

            ViewData["Title"] = "Your requests";
            ViewData["Robots"] = "noindex,nofollow";
            return View(new InboxViewModel
            {
                Result = result,
                StatusFilter = string.IsNullOrEmpty(status) ? null : status,
                IsProvider = managed.Count > 0,
            });
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Inbox fetch failed.");
            return View("Unavailable");
        }
    }

    /// <summary>One application's thread, organizer perspective.</summary>
    [HttpGet("/inbox/applications/{id:guid}")]
    public Task<IActionResult> Detail(Guid id, CancellationToken ct) => RenderThreadAsync(id, ct);

    /// <summary>Posts the organizer's reply onto the thread.</summary>
    [HttpPost("/inbox/applications/{id:guid}/reply")]
    public async Task<IActionResult> Reply(Guid id, [FromForm] string? body, CancellationToken ct)
    {
        var accessToken = await AccessTokenOrNullAsync();
        if (accessToken is null)
        {
            return await SignOutToLoginAsync();
        }

        if (!string.IsNullOrWhiteSpace(body))
        {
            var (_, errorCode) = await PostMessageSafelyAsync(accessToken, id, body.Trim(), ct);
            if (errorCode is not null)
            {
                TempData["ThreadError"] = MessageErrorText(errorCode);
            }
        }

        return Redirect(Url.Content($"~/inbox/applications/{id}"));
    }

    /// <summary>Withdraws the application.</summary>
    [HttpPost("/inbox/applications/{id:guid}/withdraw")]
    public async Task<IActionResult> Withdraw(Guid id, CancellationToken ct)
    {
        var accessToken = await AccessTokenOrNullAsync();
        if (accessToken is null)
        {
            return await SignOutToLoginAsync();
        }

        try
        {
            var (_, errorCode) = await _api.WithdrawApplicationAsync(accessToken, id, ct);
            if (errorCode is not null)
            {
                TempData["ThreadError"] = errorCode == "invalid_state"
                    ? "This request has already been decided, so it can't be withdrawn."
                    : "Couldn't withdraw the request. Try again in a moment.";
            }
            else
            {
                TempData["ThreadFlash"] = "Request withdrawn.";
            }
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Withdraw failed.");
            TempData["ThreadError"] = "Couldn't reach the server — try again in a moment.";
        }

        return Redirect(Url.Content($"~/inbox/applications/{id}"));
    }

    private async Task<IActionResult> RenderThreadAsync(Guid id, CancellationToken ct)
    {
        var accessToken = await AccessTokenOrNullAsync();
        if (accessToken is null)
        {
            return await SignOutToLoginAsync();
        }

        ApplicationDto? application;
        try
        {
            application = await _api.GetApplicationAsync(accessToken, id, ct);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Thread fetch failed.");
            return View("Unavailable");
        }

        if (application is null)
        {
            Response.StatusCode = StatusCodes.Status404NotFound;
            return View("~/Views/Discovery/NotFound.cshtml");
        }

        var viewerId = ViewerId();
        var viewerIsOrganizer = application.Organizer.Id == viewerId;
        if (!viewerIsOrganizer)
        {
            // A venue manager opened an organizer link (e.g. from an email) — show them their side.
            return Redirect(Url.Content($"~/manage/applications/{id}"));
        }

        ViewData["Title"] = $"Request · {application.RoomName}";
        ViewData["Robots"] = "noindex,nofollow";
        return View("Detail", new ApplicationThreadViewModel
        {
            Application = application,
            ViewerIsOrganizer = true,
            ViewerId = viewerId,
            CounterOffersEnabled = _flags.IsEnabled(CounterOffersFlag),
            Error = TempData["ThreadError"] as string,
            Flash = TempData["ThreadFlash"] as string,
        });
    }

    /// <summary>Organizer's response to a counter-offer: accept (books the offered time) or decline.</summary>
    [HttpPost("/inbox/applications/{id:guid}/counter-offer/respond")]
    public async Task<IActionResult> RespondToCounterOffer(Guid id, [FromForm] string decision, CancellationToken ct)
    {
        var accessToken = await AccessTokenOrNullAsync();
        if (accessToken is null)
        {
            return await SignOutToLoginAsync();
        }

        var wire = decision == "accept" ? "accept" : "decline";
        try
        {
            var (application, errorCode) = await _api.RespondToCounterOfferAsync(accessToken, id, wire, ct);
            if (application is not null)
            {
                TempData["ThreadFlash"] = wire == "accept"
                    ? $"Booked — the new time with {application.VenueName} is confirmed."
                    : $"Declined the suggested time — {application.VenueName} has been asked again.";
            }
            else
            {
                TempData["ThreadError"] = errorCode switch
                {
                    "slot_taken" => "That time was just taken — the venue has been notified.",
                    "invalid_state" => "This suggestion is no longer open.",
                    "rate_limited" => "You're responding quickly — give it a minute.",
                    _ => "Couldn't record your response. Try again in a moment.",
                };
            }
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Counter-offer response failed.");
            TempData["ThreadError"] = "Couldn't reach the server — try again in a moment.";
        }

        return Redirect(Url.Content($"~/inbox/applications/{id}"));
    }

    private async Task<(ApplicationDto? Application, string? ErrorCode)> PostMessageSafelyAsync(
        string accessToken, Guid id, string body, CancellationToken ct)
    {
        try
        {
            return await _api.PostApplicationMessageAsync(accessToken, id, body, ct);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Thread reply failed.");
            return (null, "api_unreachable");
        }
    }

    private static string MessageErrorText(string errorCode) => errorCode switch
    {
        "invalid_state" => "This request has been decided — the thread is closed.",
        "rate_limited" => "You're sending messages quickly — give it a minute.",
        _ => "Couldn't send your message. Try again in a moment.",
    };

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
