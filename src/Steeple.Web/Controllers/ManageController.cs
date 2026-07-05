using System.Security.Claims;
using Steeple.Web.Filters;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Steeple.Web.Controllers;

/// <summary>
/// The provider area: the Phase 2 inbox (applications for managed venues, approve / ask /
/// decline) plus the Phase 5 self-service listings editor (venues, rooms, photos, publish
/// requests). Venue-manager membership is enforced by the API (party scoping) — this surface
/// just renders what the caller may see. The listings editor sits behind the
/// <c>web.manage_enabled</c> flag (risky new surface).
/// </summary>
[Authorize]
public sealed class ManageController : SteepleControllerBase
{
    private readonly ISteepleApiClient _api;
    private readonly ILogger<ManageController> _logger;

    /// <summary>Creates the controller.</summary>
    public ManageController(ISteepleApiClient api, ILogger<ManageController> logger)
    {
        _api = api;
        _logger = logger;
    }

    /// <summary>Applications for every venue the caller manages, newest first.</summary>
    [HttpGet("/manage/applications")]
    public async Task<IActionResult> Applications([FromQuery] string? status, [FromQuery] int page = 1, CancellationToken ct = default)
    {
        var accessToken = await AccessTokenOrNullAsync();
        if (accessToken is null)
        {
            return await SignOutToLoginAsync();
        }

        try
        {
            var result = await _api.GetManageApplicationsAsync(accessToken, status, page, ct);

            ViewData["Title"] = "Requests for your spaces";
            ViewData["Robots"] = "noindex,nofollow";
            return View(new InboxViewModel
            {
                Result = result,
                StatusFilter = string.IsNullOrEmpty(status) ? null : status,
                IsProviderView = true,
                IsProvider = true,
            });
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Provider inbox fetch failed.");
            return View("~/Views/Inbox/Unavailable.cshtml");
        }
    }

    /// <summary>Bookings across every venue the caller manages (the provider's calendar-ish list).</summary>
    [HttpGet("/manage/bookings")]
    public async Task<IActionResult> Bookings([FromQuery] string? status, [FromQuery] int page = 1, CancellationToken ct = default)
    {
        var accessToken = await AccessTokenOrNullAsync();
        if (accessToken is null)
        {
            return await SignOutToLoginAsync();
        }

        try
        {
            var result = await _api.GetManageBookingsAsync(accessToken, status, page, ct);

            ViewData["Title"] = "Bookings at your spaces";
            ViewData["Robots"] = "noindex,nofollow";
            return View(new BookingsViewModel
            {
                Result = result,
                StatusFilter = string.IsNullOrEmpty(status) ? null : status,
                IsProviderView = true,
                IsProvider = true,
                Flash = TempData["BookingFlash"] as string,
            });
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Provider bookings fetch failed.");
            return View("~/Views/Inbox/Unavailable.cshtml");
        }
    }

    /// <summary>One application's thread, venue perspective (approve / ask / decline).</summary>
    [HttpGet("/manage/applications/{id:guid}")]
    public async Task<IActionResult> Detail(Guid id, CancellationToken ct)
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
            _logger.LogWarning(ex, "Provider thread fetch failed.");
            return View("~/Views/Inbox/Unavailable.cshtml");
        }

        if (application is null)
        {
            Response.StatusCode = StatusCodes.Status404NotFound;
            return View("~/Views/Discovery/NotFound.cshtml");
        }

        var viewerId = ViewerId();
        if (application.Organizer.Id == viewerId)
        {
            // The organizer opened a provider link — show them their own side.
            return Redirect(Url.Content($"~/inbox/applications/{id}"));
        }

        ViewData["Title"] = $"Request · {application.RoomName}";
        ViewData["Robots"] = "noindex,nofollow";
        return View("~/Views/Inbox/Detail.cshtml", new ApplicationThreadViewModel
        {
            Application = application,
            ViewerIsOrganizer = false,
            ViewerId = viewerId,
            Error = TempData["ThreadError"] as string,
            Flash = TempData["ThreadFlash"] as string,
        });
    }

    /// <summary>Approves or declines, with an optional note posted onto the thread.</summary>
    [HttpPost("/manage/applications/{id:guid}/decision")]
    public async Task<IActionResult> Decide(Guid id, [FromForm] string decision, [FromForm] string? message, CancellationToken ct)
    {
        var accessToken = await AccessTokenOrNullAsync();
        if (accessToken is null)
        {
            return await SignOutToLoginAsync();
        }

        try
        {
            var (application, errorCode) = await _api.PostApplicationDecisionAsync(
                accessToken, id, decision, string.IsNullOrWhiteSpace(message) ? null : message.Trim(), ct);

            if (application is not null)
            {
                TempData["ThreadFlash"] = application.Status == "approved"
                    ? $"Approved — {application.Organizer.DisplayName} has been told the good news."
                    : $"Declined — {application.Organizer.DisplayName} has been notified.";
            }
            else
            {
                TempData["ThreadError"] = errorCode switch
                {
                    "invalid_state" => "This request has already been decided.",
                    "not_venue_manager" => "Only this venue's managers can decide its requests.",
                    "slot_taken" => "Another confirmed booking already holds that time — this request was automatically declined and the organizer notified.",
                    _ => "Couldn't record the decision. Try again in a moment.",
                };
            }
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Decision failed.");
            TempData["ThreadError"] = "Couldn't reach the server — try again in a moment.";
        }

        return Redirect(Url.Content($"~/manage/applications/{id}"));
    }

    /// <summary>Posts the venue's question/reply onto the thread ("ask").</summary>
    [HttpPost("/manage/applications/{id:guid}/reply")]
    public async Task<IActionResult> Reply(Guid id, [FromForm] string? body, CancellationToken ct)
    {
        var accessToken = await AccessTokenOrNullAsync();
        if (accessToken is null)
        {
            return await SignOutToLoginAsync();
        }

        if (!string.IsNullOrWhiteSpace(body))
        {
            try
            {
                var (_, errorCode) = await _api.PostApplicationMessageAsync(accessToken, id, body.Trim(), ct);
                if (errorCode is not null)
                {
                    TempData["ThreadError"] = errorCode switch
                    {
                        "invalid_state" => "This request has been decided — the thread is closed.",
                        "rate_limited" => "You're sending messages quickly — give it a minute.",
                        _ => "Couldn't send your message. Try again in a moment.",
                    };
                }
            }
            catch (HttpRequestException ex)
            {
                _logger.LogWarning(ex, "Provider reply failed.");
                TempData["ThreadError"] = "Couldn't reach the server — try again in a moment.";
            }
        }

        return Redirect(Url.Content($"~/manage/applications/{id}"));
    }

    // ----- Phase 5: self-service listings editor (flag web.manage_enabled) ---------------------

    /// <summary>The provider home: managed venues, or onboarding when there are none yet.</summary>
    [RequireManageEnabled]
    [HttpGet("/manage")]
    public async Task<IActionResult> Index(CancellationToken ct)
    {

        var accessToken = await AccessTokenOrNullAsync();
        if (accessToken is null)
        {
            return await SignOutToLoginAsync();
        }

        try
        {
            var venues = await _api.GetManagedVenuesAsync(accessToken, ct);
            ViewData["Title"] = "Your spaces";
            ViewData["Robots"] = "noindex,nofollow";
            return View(new ManageHomeViewModel
            {
                Venues = venues,
                Flash = TempData["ManageFlash"] as string,
            });
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Manage home fetch failed.");
            return View("~/Views/Inbox/Unavailable.cshtml");
        }
    }

    /// <summary>The venue onboarding form.</summary>
    [RequireManageEnabled]
    [HttpGet("/manage/venues/new")]
    public IActionResult NewVenue()
    {

        ViewData["Title"] = "List your venue";
        ViewData["Robots"] = "noindex,nofollow";
        return View("VenueForm", new VenueFormViewModel());
    }

    /// <summary>Creates the venue (the caller becomes its first manager) and opens its editor.</summary>
    [RequireManageEnabled]
    [HttpPost("/manage/venues/new")]
    public async Task<IActionResult> CreateVenue(VenueFormViewModel form, CancellationToken ct)
    {

        var accessToken = await AccessTokenOrNullAsync();
        if (accessToken is null)
        {
            return await SignOutToLoginAsync();
        }

        try
        {
            var (venue, errorCode) = await _api.CreateVenueAsync(accessToken, form.ToRequest(), ct);
            if (venue is null)
            {
                form.Error = VenueErrorMessage(errorCode);
                ViewData["Title"] = "List your venue";
                return View("VenueForm", form);
            }

            TempData["ManageFlash"] = $"{venue.Name} is set up — now add its first room.";
            return Redirect(Url.Content($"~/manage/venues/{venue.Id}"));
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Venue create failed.");
            form.Error = "Couldn't reach the server — try again in a moment.";
            ViewData["Title"] = "List your venue";
            return View("VenueForm", form);
        }
    }

    /// <summary>The venue editor: details form + the rooms list.</summary>
    [RequireManageEnabled]
    [HttpGet("/manage/venues/{id:guid}")]
    public async Task<IActionResult> Venue(Guid id, CancellationToken ct)
    {

        var accessToken = await AccessTokenOrNullAsync();
        if (accessToken is null)
        {
            return await SignOutToLoginAsync();
        }

        try
        {
            var venue = await _api.GetManagedVenueAsync(accessToken, id, ct);
            if (venue is null)
            {
                Response.StatusCode = StatusCodes.Status404NotFound;
                return View("~/Views/Discovery/NotFound.cshtml");
            }

            ViewData["Title"] = venue.Name;
            ViewData["Robots"] = "noindex,nofollow";
            return View(new VenueEditorViewModel
            {
                Venue = venue,
                Form = RestoreVenueForm(venue),
                VerificationForm = RestoreVerificationForm(venue),
                Flash = TempData["ManageFlash"] as string,
            });
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Venue editor fetch failed.");
            return View("~/Views/Inbox/Unavailable.cshtml");
        }
    }

    /// <summary>Saves venue details (address changes re-geocode server-side).</summary>
    [RequireManageEnabled]
    [HttpPost("/manage/venues/{id:guid}")]
    public async Task<IActionResult> UpdateVenue(Guid id, VenueFormViewModel form, CancellationToken ct)
    {

        var accessToken = await AccessTokenOrNullAsync();
        if (accessToken is null)
        {
            return await SignOutToLoginAsync();
        }

        try
        {
            var (venue, errorCode) = await _api.UpdateVenueAsync(accessToken, id, form.ToRequest(), ct);
            if (venue is null)
            {
                TempData["ManageError"] = VenueErrorMessage(errorCode);
                StashVenueForm(id, form);
            }
            else
            {
                TempData["ManageFlash"] = "Venue details saved.";
            }
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Venue update failed.");
            TempData["ManageError"] = "Couldn't reach the server — try again in a moment.";
        }

        return Redirect(Url.Content($"~/manage/venues/{id}"));
    }

    /// <summary>Submits venue ownership / lease-authority evidence for Admin review.</summary>
    [RequireManageEnabled]
    [HttpPost("/manage/venues/{id:guid}/verification")]
    public async Task<IActionResult> SubmitVenueVerification(Guid id, VenueVerificationFormViewModel form, CancellationToken ct)
    {

        var accessToken = await AccessTokenOrNullAsync();
        if (accessToken is null)
        {
            return await SignOutToLoginAsync();
        }

        form.VenueId = id;
        try
        {
            var (venue, errorCode) = await _api.SubmitVenueVerificationAsync(accessToken, id, form.ToRequest(), ct);
            if (venue is null)
            {
                TempData["VerificationError"] = VerificationErrorMessage(errorCode);
                StashVerificationForm(id, form);
            }
            else
            {
                TempData["ManageFlash"] = "Verification request submitted — we'll review the documents before the venue's first listing goes live.";
            }
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Venue verification submit failed.");
            TempData["VerificationError"] = "Couldn't reach the server — try again in a moment.";
            StashVerificationForm(id, form);
        }

        return Redirect(Url.Content($"~/manage/venues/{id}"));
    }

    /// <summary>The new-room form.</summary>
    [RequireManageEnabled]
    [HttpGet("/manage/venues/{id:guid}/rooms/new")]
    public async Task<IActionResult> NewRoom(Guid id, CancellationToken ct)
    {

        var accessToken = await AccessTokenOrNullAsync();
        if (accessToken is null)
        {
            return await SignOutToLoginAsync();
        }

        var venue = await _api.GetManagedVenueAsync(accessToken, id, ct);
        if (venue is null)
        {
            Response.StatusCode = StatusCodes.Status404NotFound;
            return View("~/Views/Discovery/NotFound.cshtml");
        }

        ViewData["Title"] = $"Add a room · {venue.Name}";
        ViewData["Robots"] = "noindex,nofollow";
        return View("RoomForm", new RoomFormViewModel { VenueId = venue.Id, VenueName = venue.Name });
    }

    /// <summary>Creates the room (Draft) and opens its editor.</summary>
    [RequireManageEnabled]
    [HttpPost("/manage/venues/{id:guid}/rooms/new")]
    public async Task<IActionResult> CreateRoom(Guid id, RoomFormViewModel form, CancellationToken ct)
    {

        var accessToken = await AccessTokenOrNullAsync();
        if (accessToken is null)
        {
            return await SignOutToLoginAsync();
        }

        form.VenueId = id;
        try
        {
            var (room, errorCode) = await _api.CreateRoomAsync(accessToken, id, form.ToRequest(), ct);
            if (room is null)
            {
                form.Error = RoomErrorMessage(errorCode);
                ViewData["Title"] = "Add a room";
                return View("RoomForm", form);
            }

            TempData["ManageFlash"] = $"{room.Name} saved as a draft — add photos, then request publish when it's ready.";
            return Redirect(Url.Content($"~/manage/rooms/{room.Id}"));
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Room create failed.");
            form.Error = "Couldn't reach the server — try again in a moment.";
            ViewData["Title"] = "Add a room";
            return View("RoomForm", form);
        }
    }

    /// <summary>The room editor: details, photos, and the publish/unlist card.</summary>
    [RequireManageEnabled]
    [HttpGet("/manage/rooms/{id:guid}")]
    public async Task<IActionResult> Room(Guid id, CancellationToken ct)
    {

        var accessToken = await AccessTokenOrNullAsync();
        if (accessToken is null)
        {
            return await SignOutToLoginAsync();
        }

        try
        {
            var room = await _api.GetManagedRoomAsync(accessToken, id, ct);
            if (room is null)
            {
                Response.StatusCode = StatusCodes.Status404NotFound;
                return View("~/Views/Discovery/NotFound.cshtml");
            }

            ViewData["Title"] = $"{room.Name} · {room.VenueName}";
            ViewData["Robots"] = "noindex,nofollow";
            return View(new RoomEditorViewModel
            {
                Room = room,
                Form = RestoreRoomForm(room),
                Flash = TempData["ManageFlash"] as string,
                PhotoError = TempData["PhotoError"] as string,
            });
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Room editor fetch failed.");
            return View("~/Views/Inbox/Unavailable.cshtml");
        }
    }

    /// <summary>Saves room details (never touches status — that's the explicit action below).</summary>
    [RequireManageEnabled]
    [HttpPost("/manage/rooms/{id:guid}")]
    public async Task<IActionResult> UpdateRoom(Guid id, RoomFormViewModel form, CancellationToken ct)
    {

        var accessToken = await AccessTokenOrNullAsync();
        if (accessToken is null)
        {
            return await SignOutToLoginAsync();
        }

        try
        {
            var (room, errorCode) = await _api.UpdateManagedRoomAsync(accessToken, id, form.ToRequest(), ct);
            if (room is null)
            {
                TempData["ManageError"] = RoomErrorMessage(errorCode);
                StashRoomForm(id, form);
            }
            else
            {
                TempData["ManageFlash"] = "Room details saved.";
            }
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Room update failed.");
            TempData["ManageError"] = "Couldn't reach the server — try again in a moment.";
        }

        return Redirect(Url.Content($"~/manage/rooms/{id}"));
    }

    /// <summary>
    /// The explicit status action: request publish (moderated first time, instant after),
    /// unlist, or move back to draft.
    /// </summary>
    [RequireManageEnabled]
    [HttpPost("/manage/rooms/{id:guid}/status")]
    public async Task<IActionResult> SetRoomStatus(Guid id, [FromForm] string status, CancellationToken ct)
    {

        var accessToken = await AccessTokenOrNullAsync();
        if (accessToken is null)
        {
            return await SignOutToLoginAsync();
        }

        try
        {
            var (room, errorCode) = await _api.UpdateManagedRoomAsync(
                accessToken, id, new SaveRoomRequest(null, null, null, null, null, status, null, null, null), ct);

            if (room is null)
            {
                TempData["ManageError"] = RoomErrorMessage(errorCode);
            }
            else
            {
                TempData["ManageFlash"] = (status, room.Status, room.PublishRequestedAtUtc) switch
                {
                    ("published", "published", _) => "Your room is live — organizers can find it now.",
                    ("published", _, not null) => "Publish requested — we review new listings personally, usually within a day.",
                    ("unlisted", _, _) => "Room unlisted — it's hidden from search until you publish it again.",
                    _ => "Status updated.",
                };
            }
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Room status change failed.");
            TempData["ManageError"] = "Couldn't reach the server — try again in a moment.";
        }

        return Redirect(Url.Content($"~/manage/rooms/{id}"));
    }

    /// <summary>Uploads a photo through the API's media pipeline.</summary>
    [RequireManageEnabled]
    [HttpPost("/manage/rooms/{id:guid}/photos")]
    [RequestSizeLimit(11 * 1024 * 1024)] // the API caps at 10 MB; headroom for multipart overhead
    public async Task<IActionResult> UploadPhoto(Guid id, IFormFile? photo, [FromForm] string? caption, CancellationToken ct)
    {

        var accessToken = await AccessTokenOrNullAsync();
        if (accessToken is null)
        {
            return await SignOutToLoginAsync();
        }

        if (photo is null || photo.Length == 0)
        {
            TempData["PhotoError"] = "Choose a photo first.";
            return Redirect(Url.Content($"~/manage/rooms/{id}"));
        }

        try
        {
            await using var content = photo.OpenReadStream();
            var (uploaded, errorCode) = await _api.UploadRoomPhotoAsync(
                accessToken, id, content, photo.FileName, photo.ContentType, caption, ct);

            if (uploaded is null)
            {
                TempData["PhotoError"] = errorCode switch
                {
                    "invalid_image" => "That file isn't a photo we can read — use a JPEG, PNG, or WebP.",
                    "rate_limited" => "You're uploading quickly — give it a minute.",
                    _ => "Couldn't upload the photo. Try again in a moment.",
                };
            }
            else
            {
                TempData["ManageFlash"] = "Photo added.";
            }
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Photo upload failed.");
            TempData["PhotoError"] = "Couldn't reach the server — try again in a moment.";
        }

        return Redirect(Url.Content($"~/manage/rooms/{id}"));
    }

    /// <summary>Makes a photo the cover.</summary>
    [RequireManageEnabled]
    [HttpPost("/manage/rooms/{roomId:guid}/photos/{photoId:guid}/primary")]
    public async Task<IActionResult> MakePhotoPrimary(Guid roomId, Guid photoId, CancellationToken ct)
    {

        var accessToken = await AccessTokenOrNullAsync();
        if (accessToken is null)
        {
            return await SignOutToLoginAsync();
        }

        try
        {
            var (_, errorCode) = await _api.UpdatePhotoAsync(
                accessToken, photoId, new UpdatePhotoRequest(null, true, null), ct);
            if (errorCode is not null)
            {
                TempData["PhotoError"] = "Couldn't update the photo. Try again in a moment.";
            }
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Photo primary change failed.");
            TempData["PhotoError"] = "Couldn't reach the server — try again in a moment.";
        }

        return Redirect(Url.Content($"~/manage/rooms/{roomId}"));
    }

    /// <summary>Deletes a photo.</summary>
    [RequireManageEnabled]
    [HttpPost("/manage/rooms/{roomId:guid}/photos/{photoId:guid}/delete")]
    public async Task<IActionResult> DeletePhoto(Guid roomId, Guid photoId, CancellationToken ct)
    {

        var accessToken = await AccessTokenOrNullAsync();
        if (accessToken is null)
        {
            return await SignOutToLoginAsync();
        }

        try
        {
            var errorCode = await _api.DeletePhotoAsync(accessToken, photoId, ct);
            if (errorCode is not null)
            {
                TempData["PhotoError"] = "Couldn't remove the photo. Try again in a moment.";
            }
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Photo delete failed.");
            TempData["PhotoError"] = "Couldn't reach the server — try again in a moment.";
        }

        return Redirect(Url.Content($"~/manage/rooms/{roomId}"));
    }

    private static string VenueErrorMessage(string? errorCode) => errorCode switch
    {
        "geofence_rejected" => "That address is outside the area Steeple currently serves.",
        "invalid_venue" => "Check the venue details — a required field is missing or too long.",
        "rate_limited" => "You're saving quickly — give it a minute.",
        _ => "Couldn't save the venue. Try again in a moment.",
    };

    private static string VerificationErrorMessage(string? errorCode) => errorCode switch
    {
        "already_verified" => "This venue is already verified.",
        "verification_pending" => "This venue already has a verification request in review.",
        "invalid_verification" => "Check the verification details — include your authority, a short summary, and at least one valid document link.",
        "rate_limited" => "You're submitting quickly — give it a minute.",
        _ => "Couldn't submit the verification request. Try again in a moment.",
    };

    private static string RoomErrorMessage(string? errorCode) => errorCode switch
    {
        "invalid_room" => "Check the room details — a required field is missing or out of range.",
        "has_active_bookings" => "This room has upcoming confirmed bookings — cancel them before taking it offline.",
        "no_photos" => "Add at least one photo before publishing — bright, honest photos do the selling.",
        "rate_limited" => "You're saving quickly — give it a minute.",
        _ => "Couldn't save the room. Try again in a moment.",
    };

    // Failed saves round-trip the person's input through TempData so the editor re-renders with
    // their changes intact (PRG without losing work; same stance as the apply form's stash).
    private void StashVenueForm(Guid id, VenueFormViewModel form) => StashForm($"VenueForm:{id}", form);

    private VenueFormViewModel RestoreVenueForm(ManagedVenueDetailDto venue) =>
        RestoreForm($"VenueForm:{venue.Id}", () => VenueFormViewModel.From(venue), (f, e) => f.Error = e);

    private void StashVerificationForm(Guid id, VenueVerificationFormViewModel form) =>
        StashForm($"VenueVerificationForm:{id}", form);

    private VenueVerificationFormViewModel RestoreVerificationForm(ManagedVenueDetailDto venue) =>
        RestoreForm(
            $"VenueVerificationForm:{venue.Id}",
            () => VenueVerificationFormViewModel.ForVenue(venue),
            (f, _) => f.Error = TempData["VerificationError"] as string);

    private void StashRoomForm(Guid id, RoomFormViewModel form) => StashForm($"RoomForm:{id}", form);

    private RoomFormViewModel RestoreRoomForm(ManagedRoomDto room) =>
        RestoreForm($"RoomForm:{room.Id}", () => RoomFormViewModel.From(room), (f, e) => f.Error = e);

    private void StashForm<T>(string key, T form) =>
        TempData[key] = System.Text.Json.JsonSerializer.Serialize(form);

    private T RestoreForm<T>(string key, Func<T> fresh, Action<T, string?> setError)
    {
        var form = TempData[key] is string stashed
            ? System.Text.Json.JsonSerializer.Deserialize<T>(stashed) ?? fresh()
            : fresh();
        setError(form, TempData["ManageError"] as string);
        return form;
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
