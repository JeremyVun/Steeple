using System.Globalization;
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
    private const string PickerFlag = "web.availability_picker";

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
    public async Task<IActionResult> Index(
        string venueSlug, string roomSlug,
        DateOnly? date, string? startTime, string? endTime, [FromQuery] string[]? daysOfWeek,
        CancellationToken ct)
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

        // Prefill from a When selection carried through search → detail → here (only for a fresh
        // form; a restored draft always wins). Bad weekday tokens are ignored leniently.
        if (stashed is null)
        {
            PrefillFromWhen(form, date, startTime, endTime, daysOfWeek);
        }

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
            PickerEnabled = PickerEnabled(),
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
                DaysOfWeek: form.Frequency == "recurringWeekly" && form.DaysOfWeek.Count > 0 ? form.DaysOfWeek : null,
                StartTime: form.StartTime,
                EndTime: form.EndTime),
            IntentText: form.IntentText,
            TurnstileToken: form.TurnstileToken);

        (ApplicationDto? application, string? errorCode, ScheduleCheckResultDto? conflict) = (null, null, null);
        try
        {
            (application, errorCode, conflict) = await _api.SubmitApplicationAsync(accessToken, room.RoomId, request, idempotencyKey, ct);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Application submit failed: API unreachable.");
        }

        if (application is null)
        {
            // A hard-blocked schedule (409) re-renders the verdict card (§8.13 danger variant)
            // instead of a bare error line, so the person sees exactly which dates clash.
            if (errorCode == "schedule_unavailable" && conflict is not null)
            {
                return ReRender(room, form, error: null, conflict);
            }

            return ReRender(room, form, SubmitErrorMessage(errorCode));
        }

        ClearStash(room.RoomId);
        TempData["ThreadFlash"] = $"Your request is on its way to {room.Venue.Name}. They'll reply here.";
        return Redirect(Url.Content($"~/inbox/applications/{application.Id}"));
    }

    /// <summary>
    /// Seeds the apply form from a When (time-first search) selection: a weekly selection flips the
    /// frequency and checks the days; a one-off seeds the start date; times prefill either way. The
    /// commit-5 picker then lights up from these native fields (and <c>InitialMonth</c> follows the
    /// start date). Malformed values are ignored — the person just finishes filling the form.
    /// </summary>
    private static void PrefillFromWhen(
        ApplyFormModel form, DateOnly? date, string? startTime, string? endTime, string[]? daysOfWeek)
    {
        var days = WhenCarry.ValidWeekdays(daysOfWeek);
        if (days.Count > 0)
        {
            form.Frequency = "recurringWeekly";
            form.DaysOfWeek = days.ToList();
        }
        else if (date is { } d)
        {
            form.Frequency = "oneOff";
            form.StartDate = d;
        }

        if (IsWireTime(startTime))
        {
            form.StartTime = startTime!;
        }

        if (IsWireTime(endTime))
        {
            form.EndTime = endTime!;
        }
    }

    private static bool IsWireTime(string? value) =>
        !string.IsNullOrEmpty(value)
        && TimeOnly.TryParseExact(value, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out _);

    private IActionResult ReRender(RoomDetailDto room, ApplyFormModel form, string? error, ScheduleCheckResultDto? conflict = null)
    {
        ViewData["Title"] = $"Ask to book {room.RoomName}";
        ViewData["Robots"] = "noindex,nofollow";
        return View("Index", new ApplyViewModel
        {
            Room = room,
            Form = form,
            Error = error,
            Conflict = conflict,
            TurnstileSiteKey = _turnstile.SiteKey,
            PickerEnabled = PickerEnabled(),
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

        if (form.Frequency == "recurringWeekly" && (form.EndDate is null || form.DaysOfWeek.Count == 0))
        {
            return "A weekly booking needs at least one day of the week and an end date.";
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
        "schedule_unavailable" => "Some of those dates aren't free — pick another time and try again.",
        _ => "Couldn't send your request. Check your connection and try again.",
    };

    // ----- Slot picker BFF fragments (flag web.availability_picker; anonymous, no antiforgery) ----

    /// <summary>One month of the availability calendar grid (§8.10), clamped to [today, today+92d).</summary>
    [HttpGet("space/{venueSlug}/{roomSlug}/apply/calendar")]
    public async Task<IActionResult> Calendar(string venueSlug, string roomSlug, string? month, DateOnly? selected, CancellationToken ct)
    {
        if (!PickerRoutesEnabled())
        {
            return NotFound();
        }

        var room = await _api.GetBySlugAsync(venueSlug, roomSlug, ct);
        if (room is null)
        {
            return NotFound();
        }

        var today = DateOnly.FromDateTime(DateTime.Today);
        var minMonth = new DateOnly(today.Year, today.Month, 1);
        // The API caps the range at 92 days out; the last browsable month is the one that date lands in.
        var horizon = today.AddDays(AvailabilityDisplay.MaxHorizonDays - 1);
        var maxMonth = new DateOnly(horizon.Year, horizon.Month, 1);

        var requested = DateOnly.TryParseExact($"{month}-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var m)
            ? new DateOnly(m.Year, m.Month, 1)
            : minMonth;
        var current = requested < minMonth ? minMonth : requested > maxMonth ? maxMonth : requested;

        // Fetch only the visible month's days, still respecting the [today, today+92d) API window.
        var from = current == minMonth ? today : current;
        var to = current.AddMonths(1).AddDays(-1);
        if (to > horizon)
        {
            to = horizon;
        }

        var availability = await _api.GetListingAvailabilityAsync(room.RoomId, from, to, ct);

        return PartialView("_AvailabilityCalendar", new AvailabilityCalendarViewModel
        {
            VenueSlug = venueSlug,
            RoomSlug = roomSlug,
            Month = current,
            Today = today,
            Selected = selected,
            Days = AvailabilityDisplay.BuildCells(current, to, today, availability, room.OpenHours),
            MinMonth = minMonth,
            MaxMonth = maxMonth,
        });
    }

    /// <summary>The chosen day's free windows + range controls (§8.11).</summary>
    [HttpGet("space/{venueSlug}/{roomSlug}/apply/day")]
    public async Task<IActionResult> Day(string venueSlug, string roomSlug, DateOnly date, CancellationToken ct)
    {
        if (!PickerRoutesEnabled())
        {
            return NotFound();
        }

        var room = await _api.GetBySlugAsync(venueSlug, roomSlug, ct);
        if (room is null)
        {
            return NotFound();
        }

        var availability = await _api.GetListingAvailabilityAsync(room.RoomId, date, date, ct);
        var freeWindows = availability?.Days.FirstOrDefault(d => d.Date == date)?.FreeWindows ?? [];

        return PartialView("_DayWindows", new DayWindowsViewModel
        {
            Date = date,
            FreeWindows = freeWindows,
        });
    }

    /// <summary>Advisory verdict card for the proposed schedule (§8.13); debounced live check.</summary>
    [HttpGet("space/{venueSlug}/{roomSlug}/apply/check")]
    public async Task<IActionResult> Check(string venueSlug, string roomSlug, ApplyFormModel form, CancellationToken ct)
    {
        if (!PickerRoutesEnabled())
        {
            return NotFound();
        }

        // Nothing to check yet (incomplete schedule) → render no card, exactly like a 400 would.
        if (form.StartDate is null || string.IsNullOrEmpty(form.StartTime) || string.IsNullOrEmpty(form.EndTime))
        {
            return new EmptyResult();
        }

        if (form.Frequency == "recurringWeekly" && (form.EndDate is null || form.DaysOfWeek.Count == 0))
        {
            return new EmptyResult();
        }

        var room = await _api.GetBySlugAsync(venueSlug, roomSlug, ct);
        if (room is null)
        {
            return new EmptyResult();
        }

        var schedule = new ScheduleDto(
            Frequency: form.Frequency,
            StartDate: form.StartDate.Value,
            EndDate: form.Frequency == "recurringWeekly" ? form.EndDate : null,
            DaysOfWeek: form.Frequency == "recurringWeekly" && form.DaysOfWeek.Count > 0 ? form.DaysOfWeek : null,
            StartTime: form.StartTime,
            EndTime: form.EndTime);

        ScheduleCheckResultDto? result = null;
        try
        {
            result = await _api.CheckListingScheduleAsync(room.RoomId, schedule, ct);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Availability check failed: API unreachable.");
        }

        if (result is null)
        {
            // 404/400/unreachable → no verdict card (the submit remains the authority).
            return new EmptyResult();
        }

        return PartialView("_ConflictSummary", new ConflictSummaryViewModel { Result = result });
    }

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

    private bool PickerEnabled() => _flags.IsEnabled(PickerFlag);

    /// <summary>The picker fragments only exist when both the apply flow and the picker are on.</summary>
    private bool PickerRoutesEnabled() => ApplyEnabled() && PickerEnabled();

    private string? SessionId() => HttpContext.Session.GetString("sid");
}
