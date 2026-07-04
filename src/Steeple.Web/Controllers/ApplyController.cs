using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace Steeple.Web.Controllers;

/// <summary>
/// The apply form (ROADMAP Phase 2, flag <c>web.apply_from_browser</c>). Anyone can open and fill
/// it — the SSO gate fires at submit (PRD friction rule: friction scales with stakes). An
/// unauthenticated submit stashes the drafted form in the session, sends the person through
/// sign-in, and restores the draft on return, so the gate never costs them their words.
/// </summary>
public sealed class ApplyController : SteepleControllerBase
{
    private const string ApplyFlag = "web.apply_from_browser";

    private readonly ISteepleApiClient _api;
    private readonly IFeatureFlags _flags;
    private readonly IWebAnalytics _analytics;
    private readonly TurnstileClientOptions _turnstile;
    private readonly ILogger<ApplyController> _logger;

    /// <summary>Creates the controller.</summary>
    public ApplyController(
        ISteepleApiClient api,
        IFeatureFlags flags,
        IWebAnalytics analytics,
        IOptions<TurnstileClientOptions> turnstile,
        ILogger<ApplyController> logger)
    {
        _api = api;
        _flags = flags;
        _analytics = analytics;
        _turnstile = turnstile.Value;
        _logger = logger;
    }

    /// <summary>The apply form for a listing (fillable signed-out; the gate is at submit).</summary>
    [HttpGet("space/{venueSlug}/{roomSlug}/apply")]
    public async Task<IActionResult> Index(string venueSlug, string roomSlug, CancellationToken ct)
    {
        if (!ApplyEnabled())
        {
            return NotFound();
        }

        var room = await _api.GetBySlugAsync(venueSlug, roomSlug, ct);
        if (room is null)
        {
            Response.StatusCode = StatusCodes.Status404NotFound;
            return View("~/Views/Discovery/NotFound.cshtml");
        }

        var stashed = ReadStash(room.RoomId);
        var form = stashed ?? new ApplyFormModel { IdempotencyKey = Guid.NewGuid() };
        if (form.ActivityType.Length == 0 && room.Activities.Count > 0)
        {
            form.ActivityType = room.Activities[0];
        }

        _analytics.Track("application_started", new { roomId = room.RoomId }, SessionId());

        ViewData["Title"] = $"Ask to book {room.RoomName}";
        ViewData["Robots"] = "noindex,nofollow";
        return View(new ApplyViewModel
        {
            Room = room,
            Form = form,
            Restored = stashed is not null && User.Identity?.IsAuthenticated == true,
            TurnstileSiteKey = _turnstile.SiteKey,
        });
    }

    /// <summary>
    /// Submits the application. Signed out → stash the draft and go through SSO; signed in →
    /// forward to the API (with the form's idempotency key, so replays can't double-file).
    /// </summary>
    [HttpPost("space/{venueSlug}/{roomSlug}/apply")]
    public async Task<IActionResult> Submit(string venueSlug, string roomSlug, ApplyFormModel form, CancellationToken ct)
    {
        if (!ApplyEnabled())
        {
            return NotFound();
        }

        var room = await _api.GetBySlugAsync(venueSlug, roomSlug, ct);
        if (room is null)
        {
            Response.StatusCode = StatusCodes.Status404NotFound;
            return View("~/Views/Discovery/NotFound.cshtml");
        }

        if (User.Identity?.IsAuthenticated != true)
        {
            // The SSO gate: keep their words safe, sign them in, bring them straight back.
            WriteStash(room.RoomId, form);
            _analytics.Track("sso_started", new { surface = "web", trigger = "apply", roomId = room.RoomId }, SessionId());

            var applyUrl = Url.Content($"~/space/{venueSlug}/{roomSlug}/apply");
            return Redirect($"{Url.Content("~/login")}?returnUrl={Uri.EscapeDataString(applyUrl)}");
        }

        if (LocalValidationError(form) is { } validationError)
        {
            return ReRender(room, form, validationError);
        }

        var accessToken = await HttpContext.GetTokenAsync(SteepleCookieEvents.AccessTokenName);
        if (accessToken is null)
        {
            // Authenticated cookie without tokens shouldn't happen; recover via the gate.
            WriteStash(room.RoomId, form);
            return Redirect(Url.Content("~/login"));
        }

        var idempotencyKey = form.IdempotencyKey == Guid.Empty ? Guid.NewGuid() : form.IdempotencyKey;
        var request = new SubmitApplicationRequest(
            ActivityType: form.ActivityType,
            GroupSize: form.GroupSize,
            Schedule: new ScheduleDto(
                Frequency: form.Frequency,
                StartDate: form.StartDate!.Value,
                EndDate: form.Frequency == "recurringWeekly" ? form.EndDate : null,
                DayOfWeek: form.Frequency == "recurringWeekly" ? form.DayOfWeek : null,
                StartTime: form.StartTime,
                EndTime: form.EndTime),
            IntentText: form.IntentText,
            TurnstileToken: form.TurnstileToken);

        (ApplicationDto? application, string? errorCode) = (null, null);
        try
        {
            (application, errorCode) = await _api.SubmitApplicationAsync(accessToken, room.RoomId, request, idempotencyKey, ct);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Application submit failed: API unreachable.");
        }

        if (application is null)
        {
            return ReRender(room, form, SubmitErrorMessage(errorCode));
        }

        ClearStash(room.RoomId);
        TempData["ThreadFlash"] = $"Your request is on its way to {room.Venue.Name}. They'll reply here.";
        return Redirect(Url.Content($"~/inbox/applications/{application.Id}"));
    }

    private IActionResult ReRender(RoomDetailDto room, ApplyFormModel form, string error)
    {
        ViewData["Title"] = $"Ask to book {room.RoomName}";
        ViewData["Robots"] = "noindex,nofollow";
        return View("Index", new ApplyViewModel
        {
            Room = room,
            Form = form,
            Error = error,
            TurnstileSiteKey = _turnstile.SiteKey,
        });
    }

    /// <summary>
    /// Friendly pre-flight checks so common misses don't round-trip to the API. The API remains
    /// the authority — anything it still rejects comes back as a coded error.
    /// </summary>
    private static string? LocalValidationError(ApplyFormModel form)
    {
        if (string.IsNullOrWhiteSpace(form.ActivityType))
        {
            return "Pick what kind of activity this is.";
        }

        if (form.GroupSize < 1)
        {
            return "How many people are coming? At least one.";
        }

        if (form.StartDate is null)
        {
            return form.Frequency == "recurringWeekly" ? "Pick the date your first session starts." : "Pick a date.";
        }

        if (string.IsNullOrEmpty(form.StartTime) || string.IsNullOrEmpty(form.EndTime))
        {
            return "Pick a start and end time.";
        }

        if (form.Frequency == "recurringWeekly" && (form.EndDate is null || string.IsNullOrEmpty(form.DayOfWeek)))
        {
            return "A weekly booking needs a day of the week and an end date.";
        }

        if (string.IsNullOrWhiteSpace(form.IntentText))
        {
            return "Tell the venue a little about what you're planning — it's what they decide on.";
        }

        return null;
    }

    /// <summary>Stable API error code → plain-language message (what happened + what to do, §10).</summary>
    private static string SubmitErrorMessage(string? errorCode) => errorCode switch
    {
        "turnstile_failed" => "We couldn't confirm you're not a robot. Reload the page and try again.",
        "room_not_bookable" => "This space isn't taking requests right now.",
        "rate_limited" => "You're sending requests quickly — give it a minute and try again.",
        "invalid_application" => "Something about the schedule doesn't add up — check the dates and times and try again.",
        _ => "Couldn't send your request. Check your connection and try again.",
    };

    // ----- The pre-sign-in draft stash (session-scoped, per room) -------------------------------

    private static string StashKey(Guid roomId) => $"apply.draft.{roomId:N}";

    private void WriteStash(Guid roomId, ApplyFormModel form) =>
        HttpContext.Session.SetString(StashKey(roomId), JsonSerializer.Serialize(form));

    private ApplyFormModel? ReadStash(Guid roomId)
    {
        var raw = HttpContext.Session.GetString(StashKey(roomId));
        if (raw is null)
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<ApplyFormModel>(raw);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private void ClearStash(Guid roomId) => HttpContext.Session.Remove(StashKey(roomId));

    private bool ApplyEnabled() => _flags.IsEnabled(ApplyFlag);

    private string? SessionId() => HttpContext.Session.GetString("sid");
}
