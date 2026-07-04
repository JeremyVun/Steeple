using System.Globalization;
using Steeple.Api.Contracts.Applications;
using Steeple.Api.Services.Manage;
using Steeple.Api.Services.Notifications;

namespace Steeple.Api.Services.Applications;
/// <summary>
/// Default <see cref="IApplicationService"/>: validates the venue-local schedule, enforces the
/// state machine (Pending → NeedsInfo ⇄ → Approved | Declined | Withdrawn | Expired), scopes
/// every read/write to the application's parties, honors idempotency keys on submit, and fans out
/// the decision-loop notifications (SYSTEM_DESIGN §7–8).
/// </summary>
public sealed class ApplicationService : IApplicationService
{
    /// <summary>Undecided applications lapse after this long (auto-expiry — tuning is a Phase 6 item).</summary>
    private static readonly TimeSpan ExpiryWindow = TimeSpan.FromDays(14);

    /// <summary>Recurrence is always bounded (SYSTEM_DESIGN §5) — and never absurdly long.</summary>
    private static readonly TimeSpan MaxTermLength = TimeSpan.FromDays(366);

    private const int MaxGroupSize = 1000;
    private const int MaxTextLength = 2000;

    private readonly IApplicationRepository _repository;
    private readonly IVenueManagerRepository _venueManagers;
    private readonly IBookingService _bookings;
    private readonly INotificationDispatcher _notifications;
    private readonly ITurnstileVerifier _turnstile;
    private readonly IAnalyticsSink _analytics;
    private readonly TimeProvider _clock;

    /// <summary>Creates the service from its ports.</summary>
    public ApplicationService(
        IApplicationRepository repository,
        IVenueManagerRepository venueManagers,
        IBookingService bookings,
        INotificationDispatcher notifications,
        ITurnstileVerifier turnstile,
        IAnalyticsSink analytics,
        TimeProvider clock)
    {
        _repository = repository;
        _venueManagers = venueManagers;
        _bookings = bookings;
        _notifications = notifications;
        _turnstile = turnstile;
        _analytics = analytics;
        _clock = clock;
    }

    /// <inheritdoc />
    public async Task<ApplicationResult<SubmitOutcome>> SubmitAsync(
        Guid roomId, Guid organizerId, SubmitApplicationRequest request, Guid? idempotencyKey, string? remoteIp, CancellationToken ct = default)
    {
        if (!await _turnstile.VerifyAsync(request.TurnstileToken, remoteIp, ct).ConfigureAwait(false))
        {
            return ApplicationResult<SubmitOutcome>.Fail(
                ApplicationErrorCodes.TurnstileFailed, "Turnstile verification failed.");
        }

        // Replays return the original application — the whole point of the idempotency key
        // (CONTRACTS §2): a retried POST must not put a second request in front of the church.
        if (idempotencyKey is { } key
            && await _repository.FindByIdempotencyKeyAsync(organizerId, key, ct).ConfigureAwait(false) is { } existing)
        {
            return ApplicationResult<SubmitOutcome>.Ok(new SubmitOutcome(existing.ToDto(includeThread: true), Created: false));
        }

        var validation = ValidateSubmission(request);
        if (validation is not null)
        {
            return ApplicationResult<SubmitOutcome>.Fail(ApplicationErrorCodes.InvalidApplication, validation);
        }

        var room = await _repository.GetRoomWithVenueAsync(roomId, ct).ConfigureAwait(false);
        if (room?.Venue is null || room.Status != RoomStatus.Published)
        {
            // Unknown and unpublished rooms answer identically so direct-URL probing can't
            // distinguish a Draft room from no room (same stance as the listing visibility gate).
            return ApplicationResult<SubmitOutcome>.Fail(
                ApplicationErrorCodes.RoomNotBookable, "This space isn't taking requests.");
        }

        var now = _clock.GetUtcNow();
        var schedule = ParseSchedule(request.Schedule);
        var application = new Application
        {
            Id = Guid.NewGuid(),
            RoomId = room.Id,
            OrganizerId = organizerId,
            ActivityType = ParseActivity(request.ActivityType),
            GroupSize = request.GroupSize,
            Frequency = schedule.Frequency,
            StartDate = schedule.StartDate,
            EndDate = schedule.EndDate,
            DayOfWeek = schedule.DayOfWeek,
            StartTime = schedule.StartTime,
            EndTime = schedule.EndTime,
            IntentText = request.IntentText.Trim(),
            Status = ApplicationStatus.Pending,
            IdempotencyKey = idempotencyKey,
            CreatedAtUtc = now,
            ExpiresAtUtc = now + ExpiryWindow,
        };

        await _repository.AddAsync(application, ct).ConfigureAwait(false);

        // Re-load for the display graph (room/venue/organizer) the DTO and notifications need.
        var created = await _repository.GetAsync(application.Id, ct).ConfigureAwait(false)
            ?? throw new InvalidOperationException("The application vanished between insert and read-back.");

        await NotifyManagersAsync(
            created,
            NotificationType.ApplicationReceived,
            email: new EmailContent(
                Subject: $"New request for {created.Room!.Name}",
                TextBody:
                    $"{created.Organizer!.DisplayName} asked to use {created.Room.Name} at {created.Room.Venue!.Name}.\n\n" +
                    $"What: {Humanize(created.ActivityType.ToString())}, about {created.GroupSize} people\n" +
                    $"When: {DescribeSchedule(created)}\n\n" +
                    $"\"{created.IntentText}\"\n\n" +
                    $"Approve, ask a question, or decline from your Steeple inbox."),
            ct).ConfigureAwait(false);

        await TrackSafelyAsync(
            "application_submitted",
            new
            {
                roomId = created.RoomId,
                venueId = created.Room!.VenueId,
                activityType = FlagEnumExtensions.ToCamelCaseToken(created.ActivityType.ToString()),
                frequency = FlagEnumExtensions.ToCamelCaseToken(created.Frequency.ToString()),
                groupSize = created.GroupSize,
            },
            ct).ConfigureAwait(false);

        return ApplicationResult<SubmitOutcome>.Ok(new SubmitOutcome(created.ToDto(includeThread: true), Created: true));
    }

    /// <inheritdoc />
    public async Task<ApplicationResult<ApplicationListResult>> GetForOrganizerAsync(
        Guid organizerId, string? status, int page, int pageSize, CancellationToken ct = default)
    {
        if (!TryParseStatusFilter(status, out var statusFilter))
        {
            return ApplicationResult<ApplicationListResult>.Fail(
                ApplicationErrorCodes.InvalidApplication, $"Unknown status '{status}'.");
        }

        (page, pageSize) = ClampPaging(page, pageSize);
        var (items, total) = await _repository
            .GetForOrganizerAsync(organizerId, statusFilter, page, pageSize, ct)
            .ConfigureAwait(false);

        await SweepExpiredAsync(items, ct).ConfigureAwait(false);

        return ApplicationResult<ApplicationListResult>.Ok(new ApplicationListResult(
            items.Select(a => a.ToDto(includeThread: false)).ToList(), total, page, pageSize));
    }

    /// <inheritdoc />
    public async Task<ApplicationResult<ApplicationListResult>> GetForManagerAsync(
        Guid managerId, string? status, int page, int pageSize, CancellationToken ct = default)
    {
        if (!TryParseStatusFilter(status, out var statusFilter))
        {
            return ApplicationResult<ApplicationListResult>.Fail(
                ApplicationErrorCodes.InvalidApplication, $"Unknown status '{status}'.");
        }

        var venueIds = await _venueManagers.GetManagedVenueIdsAsync(managerId, ct).ConfigureAwait(false);
        if (venueIds.Count == 0)
        {
            // Not a provider (yet): an empty inbox, not an error — the surface stays discoverable.
            return ApplicationResult<ApplicationListResult>.Ok(new ApplicationListResult([], 0, 1, pageSize));
        }

        (page, pageSize) = ClampPaging(page, pageSize);
        var (items, total) = await _repository
            .GetForVenuesAsync(venueIds, statusFilter, page, pageSize, ct)
            .ConfigureAwait(false);

        await SweepExpiredAsync(items, ct).ConfigureAwait(false);

        return ApplicationResult<ApplicationListResult>.Ok(new ApplicationListResult(
            items.Select(a => a.ToDto(includeThread: false)).ToList(), total, page, pageSize));
    }

    /// <inheritdoc />
    public async Task<ApplicationResult<ApplicationDto>> GetAsync(Guid applicationId, Guid callerId, CancellationToken ct = default)
    {
        var (application, error) = await LoadScopedAsync(applicationId, callerId, ct).ConfigureAwait(false);
        if (error is not null)
        {
            return ApplicationResult<ApplicationDto>.Fail(error.Code, error.Detail);
        }

        await SweepExpiredAsync([application!], ct).ConfigureAwait(false);
        return ApplicationResult<ApplicationDto>.Ok(application!.ToDto(includeThread: true));
    }

    /// <inheritdoc />
    public async Task<ApplicationResult<ApplicationDto>> AddMessageAsync(
        Guid applicationId, Guid callerId, ApplicationMessageRequest request, CancellationToken ct = default)
    {
        var body = request.Body?.Trim();
        if (string.IsNullOrEmpty(body) || body.Length > MaxTextLength)
        {
            return ApplicationResult<ApplicationDto>.Fail(
                ApplicationErrorCodes.InvalidApplication, $"A message needs 1–{MaxTextLength} characters.");
        }

        var (application, error) = await LoadScopedAsync(applicationId, callerId, ct).ConfigureAwait(false);
        if (error is not null)
        {
            return ApplicationResult<ApplicationDto>.Fail(error.Code, error.Detail);
        }

        await SweepExpiredAsync([application!], ct).ConfigureAwait(false);
        if (!IsUndecided(application!.Status))
        {
            return ApplicationResult<ApplicationDto>.Fail(
                ApplicationErrorCodes.InvalidState, "This application has already been decided.");
        }

        var now = _clock.GetUtcNow();
        var callerIsOrganizer = application.OrganizerId == callerId;

        // The ask/answer rhythm drives the sub-state: a provider question parks the application
        // in NeedsInfo; the organizer's answer puts it back in the provider's court (Pending).
        application.Status = callerIsOrganizer
            ? (application.Status == ApplicationStatus.NeedsInfo ? ApplicationStatus.Pending : application.Status)
            : ApplicationStatus.NeedsInfo;

        await _repository.AddMessageAsync(
            new ApplicationMessage
            {
                Id = Guid.NewGuid(),
                ApplicationId = application.Id,
                SenderId = callerId,
                Body = body,
                SentAtUtc = now,
            },
            ct).ConfigureAwait(false);

        var senderName = callerIsOrganizer ? application.Organizer!.DisplayName : application.Room!.Venue!.Name;
        var email = new EmailContent(
            Subject: $"New message about {application.Room!.Name}",
            TextBody:
                $"{senderName} wrote about the request for {application.Room.Name} at {application.Room.Venue!.Name}:\n\n" +
                $"\"{body}\"\n\n" +
                $"Reply from your Steeple inbox.");

        if (callerIsOrganizer)
        {
            await NotifyManagersAsync(application, NotificationType.ApplicationMessage, email, ct).ConfigureAwait(false);
        }
        else
        {
            await NotifyOrganizerAsync(application, NotificationType.ApplicationMessage, email, ct).ConfigureAwait(false);
        }

        var refreshed = await _repository.GetAsync(application.Id, ct).ConfigureAwait(false);
        return ApplicationResult<ApplicationDto>.Ok((refreshed ?? application).ToDto(includeThread: true));
    }

    /// <inheritdoc />
    public async Task<ApplicationResult<ApplicationDto>> DecideAsync(
        Guid applicationId, Guid callerId, ApplicationDecisionRequest request, CancellationToken ct = default)
    {
        var approve = string.Equals(request.Decision, "approve", StringComparison.OrdinalIgnoreCase);
        if (!approve && !string.Equals(request.Decision, "decline", StringComparison.OrdinalIgnoreCase))
        {
            return ApplicationResult<ApplicationDto>.Fail(
                ApplicationErrorCodes.InvalidApplication, $"Unknown decision '{request.Decision}'.");
        }

        var (application, error) = await LoadScopedAsync(applicationId, callerId, ct).ConfigureAwait(false);
        if (error is not null)
        {
            return ApplicationResult<ApplicationDto>.Fail(error.Code, error.Detail);
        }

        if (application!.OrganizerId == callerId
            && !await _venueManagers.IsManagerAsync(callerId, application.Room!.VenueId, ct).ConfigureAwait(false))
        {
            return ApplicationResult<ApplicationDto>.Fail(
                ApplicationErrorCodes.NotVenueManager, "Only the venue can decide an application.");
        }

        await SweepExpiredAsync([application], ct).ConfigureAwait(false);
        if (!IsUndecided(application.Status))
        {
            return ApplicationResult<ApplicationDto>.Fail(
                ApplicationErrorCodes.InvalidState, "This application has already been decided.");
        }

        var now = _clock.GetUtcNow();
        application.Status = approve ? ApplicationStatus.Approved : ApplicationStatus.Declined;
        application.DecidedAtUtc = now;

        // Approval *is* the booking transaction (SYSTEM_DESIGN §5/§7): the Approved flip above is
        // still unsaved, and ConfirmFromApplicationAsync commits it atomically with the booking and
        // every materialized occurrence. When the exclusion constraint aborts that save, the slot
        // is already held — the application auto-declines with notice, and the provider gets
        // slot_taken instead of a half-approved state.
        if (approve)
        {
            var confirmation = await _bookings.ConfirmFromApplicationAsync(application, ct).ConfigureAwait(false);
            if (confirmation.SlotTaken)
            {
                application.Status = ApplicationStatus.Declined;
                await _repository.SaveAsync(ct).ConfigureAwait(false);

                await NotifyOrganizerAsync(
                    application,
                    NotificationType.ApplicationDeclined,
                    new EmailContent(
                        Subject: $"About your request for {application.Room!.Name}",
                        TextBody:
                            $"The time you asked for at {application.Room.Name} ({application.Room.Venue!.Name}) " +
                            "was booked by another group before your request could be approved.\n\n" +
                            "There are more spaces nearby on Steeple — your request details are in your inbox."),
                    ct).ConfigureAwait(false);

                await TrackSafelyAsync(
                    "application_decided",
                    new
                    {
                        applicationId = application.Id,
                        roomId = application.RoomId,
                        outcome = "declined",
                        autoDeclined = true,
                        reason = "slot_taken",
                        timeToDecisionHours = Math.Round((now - application.CreatedAtUtc).TotalHours, 1),
                    },
                    ct).ConfigureAwait(false);

                return ApplicationResult<ApplicationDto>.Fail(
                    ApplicationErrorCodes.SlotTaken,
                    "Another booking already holds an overlapping time — this request was automatically declined and the organizer notified.");
            }
        }

        if (request.Message is { Length: > 0 } note)
        {
            await _repository.AddMessageAsync(
                new ApplicationMessage
                {
                    Id = Guid.NewGuid(),
                    ApplicationId = application.Id,
                    SenderId = callerId,
                    Body = note.Length > MaxTextLength ? note[..MaxTextLength] : note,
                    SentAtUtc = now,
                },
                ct).ConfigureAwait(false);
        }
        else
        {
            await _repository.SaveAsync(ct).ConfigureAwait(false);
        }

        var venueName = application.Room!.Venue!.Name;
        var email = approve
            ? new EmailContent(
                Subject: $"{venueName} said yes",
                TextBody:
                    $"Good news — {venueName} approved your request to use {application.Room.Name}.\n\n" +
                    $"When: {DescribeSchedule(application)}\n\n" +
                    (request.Message is { Length: > 0 } m ? $"They added: \"{m}\"\n\n" : "") +
                    "Your booking is confirmed — the details are in your Steeple inbox.")
            : new EmailContent(
                Subject: $"About your request for {application.Room.Name}",
                TextBody:
                    $"{venueName} can't host your request for {application.Room.Name} this time.\n\n" +
                    (request.Message is { Length: > 0 } dm ? $"They said: \"{dm}\"\n\n" : "") +
                    "There are more spaces nearby on Steeple — your request details are in your inbox.");

        await NotifyOrganizerAsync(
            application,
            approve ? NotificationType.ApplicationApproved : NotificationType.ApplicationDeclined,
            email,
            ct).ConfigureAwait(false);

        await TrackSafelyAsync(
            "application_decided",
            new
            {
                applicationId = application.Id,
                roomId = application.RoomId,
                outcome = approve ? "approved" : "declined",
                timeToDecisionHours = Math.Round((now - application.CreatedAtUtc).TotalHours, 1),
            },
            ct).ConfigureAwait(false);

        var refreshed = await _repository.GetAsync(application.Id, ct).ConfigureAwait(false);
        return ApplicationResult<ApplicationDto>.Ok((refreshed ?? application).ToDto(includeThread: true));
    }

    /// <inheritdoc />
    public async Task<ApplicationResult<ApplicationDto>> WithdrawAsync(Guid applicationId, Guid organizerId, CancellationToken ct = default)
    {
        var (application, error) = await LoadScopedAsync(applicationId, organizerId, ct).ConfigureAwait(false);
        if (error is not null)
        {
            return ApplicationResult<ApplicationDto>.Fail(error.Code, error.Detail);
        }

        if (application!.OrganizerId != organizerId)
        {
            return ApplicationResult<ApplicationDto>.Fail(
                ApplicationErrorCodes.InvalidState, "Only the organizer can withdraw an application.");
        }

        await SweepExpiredAsync([application], ct).ConfigureAwait(false);
        if (!IsUndecided(application.Status))
        {
            return ApplicationResult<ApplicationDto>.Fail(
                ApplicationErrorCodes.InvalidState, "This application has already been decided.");
        }

        application.Status = ApplicationStatus.Withdrawn;
        application.DecidedAtUtc = _clock.GetUtcNow();
        await _repository.SaveAsync(ct).ConfigureAwait(false);

        return ApplicationResult<ApplicationDto>.Ok(application.ToDto(includeThread: true));
    }

    // ----- Party scoping & state helpers --------------------------------------------------------

    /// <summary>
    /// Loads the application and verifies the caller is a party (organizer or a manager of the
    /// room's venue). Anyone else gets <c>not_found</c> — existence is never leaked.
    /// </summary>
    private async Task<(Application? Application, ApplicationError? Error)> LoadScopedAsync(
        Guid applicationId, Guid callerId, CancellationToken ct)
    {
        var application = await _repository.GetAsync(applicationId, ct).ConfigureAwait(false);
        if (application?.Room?.Venue is null)
        {
            return (null, new ApplicationError(ApplicationErrorCodes.NotFound, "Application not found."));
        }

        if (application.OrganizerId != callerId
            && !await _venueManagers.IsManagerAsync(callerId, application.Room.VenueId, ct).ConfigureAwait(false))
        {
            return (null, new ApplicationError(ApplicationErrorCodes.NotFound, "Application not found."));
        }

        return (application, null);
    }

    private static bool IsUndecided(ApplicationStatus status) =>
        status is ApplicationStatus.Pending or ApplicationStatus.NeedsInfo;

    /// <summary>
    /// Lazy expiry (no background worker at this scale): any undecided application read past its
    /// expiry flips to Expired before it is returned, so no surface ever renders a stale Pending.
    /// </summary>
    private async Task SweepExpiredAsync(IReadOnlyList<Application> applications, CancellationToken ct)
    {
        var now = _clock.GetUtcNow();
        var lapsed = applications.Where(a => IsUndecided(a.Status) && a.ExpiresAtUtc <= now).ToList();
        if (lapsed.Count == 0)
        {
            return;
        }

        foreach (var application in lapsed)
        {
            application.Status = ApplicationStatus.Expired;
        }

        await _repository.SaveAsync(ct).ConfigureAwait(false);
    }

    // ----- Validation & wire-token parsing ------------------------------------------------------

    /// <summary>Returns a human-readable problem, or null when the submission is valid.</summary>
    private string? ValidateSubmission(SubmitApplicationRequest request)
    {
        if (!TryParseActivity(request.ActivityType))
        {
            return $"Unknown activity type '{request.ActivityType}'.";
        }

        if (request.GroupSize is < 1 or > MaxGroupSize)
        {
            return $"Group size must be between 1 and {MaxGroupSize}.";
        }

        if (string.IsNullOrWhiteSpace(request.IntentText) || request.IntentText.Trim().Length > MaxTextLength)
        {
            return $"Tell the venue what you're planning (up to {MaxTextLength} characters).";
        }

        var schedule = request.Schedule;
        if (schedule is null)
        {
            return "A proposed schedule is required.";
        }

        if (!Enum.TryParse<ScheduleFrequency>(schedule.Frequency, ignoreCase: true, out var frequency)
            || !Enum.IsDefined(frequency))
        {
            return $"Unknown frequency '{schedule.Frequency}'.";
        }

        if (!TryParseTime(schedule.StartTime, out var start) || !TryParseTime(schedule.EndTime, out var end))
        {
            return "Times must be HH:mm (24-hour), e.g. \"09:00\".";
        }

        if (end <= start)
        {
            return "The end time must be after the start time.";
        }

        if (schedule.StartDate < DateOnly.FromDateTime(_clock.GetUtcNow().UtcDateTime.Date))
        {
            return "The start date can't be in the past.";
        }

        if (frequency == ScheduleFrequency.RecurringWeekly)
        {
            if (schedule.EndDate is not { } endDate)
            {
                return "A recurring schedule needs an end date (recurring terms are always bounded).";
            }

            if (endDate < schedule.StartDate)
            {
                return "The end date can't be before the start date.";
            }

            if (endDate.DayNumber - schedule.StartDate.DayNumber > MaxTermLength.TotalDays)
            {
                return "A recurring term can run at most a year — renew it when it ends.";
            }

            if (schedule.DayOfWeek is null || !Enum.TryParse<DayOfWeek>(schedule.DayOfWeek, ignoreCase: true, out _))
            {
                return "A recurring schedule needs a day of the week.";
            }
        }
        else if (schedule.EndDate is { } endDate && endDate != schedule.StartDate)
        {
            return "A one-off request has a single date — leave the end date empty.";
        }

        return null;
    }

    /// <summary>Parses a validated schedule into its stored (venue-local) representation.</summary>
    private static (ScheduleFrequency Frequency, DateOnly StartDate, DateOnly? EndDate, DayOfWeek? DayOfWeek, TimeOnly StartTime, TimeOnly EndTime)
        ParseSchedule(ScheduleDto schedule)
    {
        var frequency = Enum.Parse<ScheduleFrequency>(schedule.Frequency, ignoreCase: true);
        return (
            frequency,
            schedule.StartDate,
            frequency == ScheduleFrequency.RecurringWeekly ? schedule.EndDate : schedule.StartDate,
            frequency == ScheduleFrequency.RecurringWeekly
                ? Enum.Parse<DayOfWeek>(schedule.DayOfWeek!, ignoreCase: true)
                : null,
            TimeOnly.ParseExact(schedule.StartTime, "HH:mm", CultureInfo.InvariantCulture),
            TimeOnly.ParseExact(schedule.EndTime, "HH:mm", CultureInfo.InvariantCulture));
    }

    private static bool TryParseTime(string? value, out TimeOnly time) =>
        TimeOnly.TryParseExact(value, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out time);

    /// <summary>An activity wire token must be a single defined flag member (not None, not a mask).</summary>
    private static bool TryParseActivity(string? token) =>
        Enum.TryParse<ActivityType>(token, ignoreCase: true, out var parsed)
        && parsed != ActivityType.None
        && Enum.IsDefined(parsed);

    private static ActivityType ParseActivity(string token) =>
        Enum.Parse<ActivityType>(token, ignoreCase: true);

    private static bool TryParseStatusFilter(string? token, out ApplicationStatus? status)
    {
        status = null;
        if (string.IsNullOrEmpty(token))
        {
            return true;
        }

        if (Enum.TryParse<ApplicationStatus>(token, ignoreCase: true, out var parsed) && Enum.IsDefined(parsed))
        {
            status = parsed;
            return true;
        }

        return false;
    }

    private static (int Page, int PageSize) ClampPaging(int page, int pageSize) =>
        (Math.Max(1, page), Math.Clamp(pageSize is 0 ? 24 : pageSize, 1, 100));

    // ----- Notification fan-out -----------------------------------------------------------------

    private async Task NotifyManagersAsync(
        Application application, NotificationType type, EmailContent? email, CancellationToken ct)
    {
        var managers = await _venueManagers.GetManagersAsync(application.Room!.VenueId, ct).ConfigureAwait(false);
        if (managers.Count == 0)
        {
            return; // Concierge gap: no linked manager yet — the founder sees it in Admin.
        }

        await _notifications.NotifyAsync(
            managers.Select(m => new NotificationRecipient(m.Id, m.Email)).ToList(),
            type,
            BuildPayload(application),
            email,
            ct).ConfigureAwait(false);
    }

    private Task NotifyOrganizerAsync(
        Application application, NotificationType type, EmailContent? email, CancellationToken ct) =>
        _notifications.NotifyAsync(
            [new NotificationRecipient(application.OrganizerId, application.Organizer?.Email)],
            type,
            BuildPayload(application),
            email,
            ct);

    /// <summary>
    /// The inbox row's JSON document: ids + display fields + the canonical deep link
    /// (CONTRACTS §9 — clients render from this, never from push/email content).
    /// </summary>
    private static object BuildPayload(Application application) => new
    {
        applicationId = application.Id,
        roomId = application.RoomId,
        roomName = application.Room!.Name,
        venueName = application.Room.Venue!.Name,
        venueSlug = application.Room.Venue.Slug,
        roomSlug = application.Room.Slug,
        organizerName = application.Organizer!.DisplayName,
        status = FlagEnumExtensions.ToCamelCaseToken(application.Status.ToString()),
        deepLink = $"/inbox/applications/{application.Id}",
    };

    // ----- Copy helpers (email text only — clients humanize wire tokens themselves) --------------

    /// <summary>"Tuesdays 9:00–11:30 AM, Sep 1 – Dec 15" / "Tue, Sep 1, 9:00–11:30 AM" (venue-local).</summary>
    private static string DescribeSchedule(Application application)
    {
        var start = FormatTime(application.StartTime);
        var end = FormatTime(application.EndTime);

        return application.Frequency == ScheduleFrequency.RecurringWeekly
            ? $"{application.DayOfWeek}s {start}–{end}, {FormatDate(application.StartDate)} – {FormatDate(application.EndDate ?? application.StartDate)}"
            : $"{application.StartDate.ToString("ddd, MMM d", CultureInfo.InvariantCulture)}, {start}–{end}";
    }

    private static string FormatTime(TimeOnly time) => time.ToString("h:mm tt", CultureInfo.InvariantCulture);

    private static string FormatDate(DateOnly date) => date.ToString("MMM d, yyyy", CultureInfo.InvariantCulture);

    /// <summary>"stepFreeAccess"-style member name → "Step free access" (email copy only).</summary>
    private static string Humanize(string memberName)
    {
        var withSpaces = string.Concat(memberName.Select((c, i) => i > 0 && char.IsUpper(c) ? " " + char.ToLowerInvariant(c) : c.ToString()));
        return char.ToUpperInvariant(withSpaces[0]) + withSpaces[1..];
    }

    /// <summary>Best-effort analytics — never a reason to fail the request.</summary>
    private async Task TrackSafelyAsync(string eventType, object payload, CancellationToken ct)
    {
        try
        {
            await _analytics.TrackAsync(eventType, payload, sessionId: null, ct).ConfigureAwait(false);
        }
        catch
        {
            // Best-effort: never throw from analytics.
        }
    }
}
