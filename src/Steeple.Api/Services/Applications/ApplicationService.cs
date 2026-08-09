using Steeple.Api.Contracts.Applications;
using Steeple.Api.Services.Availability;
using Steeple.Api.Services.Flags;
using Steeple.Api.Services.Manage;
using Steeple.Api.Services.Notifications;
using Steeple.Api.Services.Payments;

namespace Steeple.Api.Services.Applications;
/// <summary>
/// Default <see cref="IApplicationService"/>: validates the venue-local schedule, enforces the
/// state machine (Pending → NeedsInfo ⇄ → Approved | Declined | Withdrawn | Expired), scopes
/// every read/write to the application's parties, honors idempotency keys on submit, and fans out
/// the decision-loop notifications (SYSTEM_DESIGN §7–8).
/// </summary>
public sealed class ApplicationService : IApplicationService
{
    /// <summary>
    /// The uncarded instant-book caps (booking-modes.md, 2026-08-08): a guest with no payment
    /// method on file may hold this many upcoming bookings at one venue / across all venues
    /// before an instant submit falls back to request→approve. A verified payment method lifts
    /// both. Guards calendar spam-booking; tuning is a Phase 6 item.
    /// </summary>
    private const int UncardedUpcomingCapPerVenue = 3;
    private const int UncardedUpcomingCapTotal = 10;

    /// <summary>Feature flag gating the submit-time availability hard block (CONTRACTS §6).</summary>
    private const string AvailabilityFlag = "listing.availability";

    /// <summary>Feature flag gating the host counter-offer surface (CONTRACTS §5).</summary>
    private const string CounterOffersFlag = "booking.counter_offers";

    private readonly IApplicationRepository _repository;
    private readonly IVenueManagerRepository _venueManagers;
    private readonly IBookingService _bookings;
    private readonly IRatingService _ratings;
    private readonly IAvailabilityService _availability;
    private readonly IPaymentService _payments;
    private readonly IFeatureFlags _flags;
    private readonly ApplicationNotifications _applicationNotifications;
    private readonly ITurnstileVerifier _turnstile;
    private readonly IAnalyticsSink _analytics;
    private readonly TimeProvider _clock;

    /// <summary>Creates the service from its ports.</summary>
    public ApplicationService(
        IApplicationRepository repository,
        IVenueManagerRepository venueManagers,
        IBookingService bookings,
        IRatingService ratings,
        IAvailabilityService availability,
        IPaymentService payments,
        IFeatureFlags flags,
        INotificationDispatcher notifications,
        ITurnstileVerifier turnstile,
        IAnalyticsSink analytics,
        TimeProvider clock)
    {
        _repository = repository;
        _venueManagers = venueManagers;
        _bookings = bookings;
        _ratings = ratings;
        _availability = availability;
        _payments = payments;
        _flags = flags;
        _applicationNotifications = new ApplicationNotifications(venueManagers, notifications);
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

        var validation = ApplicationSchedulePolicy.ValidateSubmission(request);
        if (validation is not null)
        {
            return ApplicationResult<SubmitOutcome>.Fail(ApplicationErrorCodes.InvalidApplication, validation);
        }

        var room = await _repository.GetRoomWithVenueAsync(roomId, ct).ConfigureAwait(false);
        if (room?.Venue is null || room.Status != RoomStatus.Published || room.OperatorUnlistedAtUtc is not null)
        {
            // Unknown and unpublished rooms answer identically so direct-URL probing can't
            // distinguish a Draft room from no room (same stance as the listing visibility gate).
            return ApplicationResult<SubmitOutcome>.Fail(
                ApplicationErrorCodes.RoomNotBookable, "This space isn't taking requests.");
        }

        // Past-date guard on the venue's own wall clock (the calendar the schedule speaks, same as
        // the Availability check endpoint): a valid same-evening request from a Virginia organizer
        // must not be rejected just because UTC has already crossed midnight. Needs the room, so it
        // can't live in ValidateSubmission.
        if (request.Schedule!.StartDate
            < ApplicationSchedulePolicy.VenueLocalToday(room.Venue.Timezone, _clock.GetUtcNow()))
        {
            return ApplicationResult<SubmitOutcome>.Fail(
                ApplicationErrorCodes.InvalidApplication, "The start date can't be in the past.");
        }

        // Submit-time hard block (CONTRACTS §6): when the flag is on, reject a schedule that lands
        // outside open hours / on a blackout / on already-booked time. Rooms with no availability
        // rules report available and pass. Reuses the same materialization + classification math as
        // the advisory check endpoint (no duplicated logic). The booking_occurrences exclusion
        // constraint remains the final race authority at approval time.
        if (await CheckAvailabilityBlockAsync(room.Id, request.Schedule!, ct).ConfigureAwait(false) is { } block)
        {
            return ApplicationResult<SubmitOutcome>.Fail(block.Code, block.Detail, block.Extensions!);
        }

        // Card at request (booking-modes.md): while payments are enabled, EVERY submit — instant
        // or manual — requires a method on file. 402 payment_method_required routes the client
        // into the /me/payments/setup loop first.
        var paymentsOn = _flags.IsEnabled(PaymentService.PaymentsFlag);
        if (paymentsOn && !await _payments.HasPaymentMethodAsync(organizerId, ct).ConfigureAwait(false))
        {
            return ApplicationResult<SubmitOutcome>.Fail(
                ApplicationErrorCodes.PaymentMethodRequired,
                "Save a payment method first — this venue takes bookings with a card on file.");
        }

        var now = _clock.GetUtcNow();
        var schedule = ApplicationSchedulePolicy.Parse(request.Schedule);
        var instant = room.Venue.BookingMode == BookingMode.Instant
            && await WithinInstantCapAsync(organizerId, room.Venue.Id, paymentsOn, ct).ConfigureAwait(false);
        var application = new Application
        {
            Id = Guid.NewGuid(),
            RoomId = room.Id,
            OrganizerId = organizerId,
            ActivityType = ApplicationSchedulePolicy.ParseActivity(request.ActivityType),
            GroupSize = request.GroupSize,
            Frequency = schedule.Frequency,
            StartDate = schedule.StartDate,
            EndDate = schedule.EndDate,
            DaysOfWeek = schedule.DaysOfWeek,
            StartTime = schedule.StartTime,
            EndTime = schedule.EndTime,
            IntentText = request.IntentText.Trim(),
            OrganizationName = string.IsNullOrWhiteSpace(request.OrganizationName) ? null : request.OrganizationName.Trim(),
            Status = instant ? ApplicationStatus.Approved : ApplicationStatus.Pending,
            DecidedAtUtc = instant ? now : null,
            IdempotencyKey = idempotencyKey,
            CreatedAtUtc = now,
            ExpiresAtUtc = now + ApplicationExpiryPolicy.Window,
        };

        try
        {
            if (instant)
            {
                return await ConfirmInstantAsync(application, room, now, ct).ConfigureAwait(false);
            }

            await _repository.AddAsync(application, ct).ConfigureAwait(false);
        }
        catch (DuplicateIdempotencyKeyException)
        {
            // A concurrent retry with the same key won the insert race after the replay lookup
            // above missed. The winner is the application this submit means — answer the replay.
            // (The filtered unique index only fires when a key was supplied.)
            var winner = await _repository.FindByIdempotencyKeyAsync(organizerId, idempotencyKey!.Value, ct).ConfigureAwait(false)
                ?? throw new InvalidOperationException("The idempotent application vanished between conflict and read-back.");
            return ApplicationResult<SubmitOutcome>.Ok(new SubmitOutcome(winner.ToDto(includeThread: true), Created: false));
        }

        // Re-load for the display graph (room/venue/organizer) the DTO and notifications need.
        var created = await _repository.GetAsync(application.Id, ct).ConfigureAwait(false)
            ?? throw new InvalidOperationException("The application vanished between insert and read-back.");

        await _applicationNotifications.NotifyManagersAsync(
            created,
            NotificationType.ApplicationReceived,
            ApplicationNotifications.ApplicationReceivedEmail(created),
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

    /// <summary>
    /// The instant-book spam guard (booking-modes.md, 2026-08-08 — instant no longer rides on
    /// <c>payments.enabled</c>): a guest whose payment identity is verified books freely; one
    /// without a method on file is capped on upcoming bookings, per venue and overall, and an
    /// over-cap submit falls back to request→approve (a pending application, never an error).
    /// While payments are on the 402 gate has already proven the method, so no extra reads run.
    /// </summary>
    private async Task<bool> WithinInstantCapAsync(Guid organizerId, Guid venueId, bool paymentsOn, CancellationToken ct)
    {
        if (paymentsOn || await _payments.HasPaymentMethodAsync(organizerId, ct).ConfigureAwait(false))
        {
            return true;
        }

        var counts = await _bookings.CountUpcomingForOrganizerAsync(organizerId, venueId, ct).ConfigureAwait(false);
        return counts.AtVenue < UncardedUpcomingCapPerVenue && counts.Total < UncardedUpcomingCapTotal;
    }

    /// <summary>
    /// The instant-book confirmation (booking-modes.md): the submit itself is the booking
    /// transaction. The application is tracked-unsaved (Approved) and commits atomically with the
    /// booking + occurrences inside <see cref="IBookingService.ConfirmFromApplicationAsync"/> —
    /// an exclusion-constraint loss aborts everything and answers <c>409 slot_taken</c> (first
    /// valid request wins; nothing persists). The first occurrence's charge kicks <b>after</b>
    /// the commit — never a gateway call inside the transaction.
    /// </summary>
    private async Task<ApplicationResult<SubmitOutcome>> ConfirmInstantAsync(
        Application application, Room room, DateTimeOffset now, CancellationToken ct)
    {
        var organizer = await _repository.GetOrganizerAsync(application.OrganizerId, ct).ConfigureAwait(false)
            ?? throw new InvalidOperationException("Authenticated caller has no user row.");
        application.Room = room;
        application.Organizer = organizer;
        _repository.AddPending(application);

        var confirmation = await _bookings.ConfirmFromApplicationAsync(application, instant: true, ct: ct).ConfigureAwait(false);
        if (confirmation.SlotTaken)
        {
            // Unlike approval's auto-decline, nothing existed before this call and nothing was
            // written by it — the submit simply fails and the guest can pick another time.
            return ApplicationResult<SubmitOutcome>.Fail(
                ApplicationErrorCodes.SlotTaken,
                "Another booking already holds an overlapping time — pick a different slot.");
        }

        var booking = confirmation.Booking!;

        // Post-commit charge kick (booking-modes.md charge timing): one-off → its only occurrence
        // in full, now; recurring → the first occurrence now, the rest at T−48h via the sweeper.
        await _payments.ChargeAtConfirmationAsync(booking.Id, ct).ConfigureAwait(false);

        var venue = room.Venue!;
        var deepLink = $"/bookings/{booking.Id}";
        var payload = new
        {
            applicationId = application.Id,
            bookingId = booking.Id,
            roomId = room.Id,
            roomName = room.Name,
            venueName = venue.Name,
            venueSlug = venue.Slug,
            roomSlug = room.Slug,
            organizerName = organizer.DisplayName,
            status = FlagEnumExtensions.ToCamelCaseToken(application.Status.ToString()),
            deepLink,
        };

        // The booking-confirmed notice, instant flavor: same ApplicationApproved type the approval
        // path uses (clients already render it), CTA deep-links straight to the booking.
        await _applicationNotifications.DispatchAsync(
            [new NotificationRecipient(organizer.Id, organizer.Email)],
            NotificationType.ApplicationApproved,
            payload,
            ApplicationNotifications.InstantOrganizerEmail(
                application,
                _flags.IsEnabled(PaymentService.PaymentsFlag)),
            ct).ConfigureAwait(false);

        // Host-side notice: a booking landed without a decision from them (the rescind lever is
        // their control — cancelling any time refunds the guest in full).
        var managers = await _venueManagers.GetManagersAsync(venue.Id, ct).ConfigureAwait(false);
        if (managers.Count > 0)
        {
            await _applicationNotifications.DispatchAsync(
                managers.Select(m => new NotificationRecipient(m.Id, m.Email)).ToList(),
                NotificationType.BookingReceived,
                payload,
                ApplicationNotifications.InstantManagerEmail(
                    application,
                    _flags.IsEnabled(PaymentService.PaymentsFlag)),
                ct).ConfigureAwait(false);
        }

        await TrackSafelyAsync(
            "application_submitted",
            new
            {
                roomId = room.Id,
                venueId = room.VenueId,
                activityType = FlagEnumExtensions.ToCamelCaseToken(application.ActivityType.ToString()),
                frequency = FlagEnumExtensions.ToCamelCaseToken(application.Frequency.ToString()),
                groupSize = application.GroupSize,
                instant = true,
            },
            ct).ConfigureAwait(false);

        var created = await _repository.GetAsync(application.Id, ct).ConfigureAwait(false) ?? application;
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
            .GetForOrganizerAsync(organizerId, statusFilter, _clock.GetUtcNow(), page, pageSize, ct)
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
            .GetForVenuesAsync(venueIds, statusFilter, _clock.GetUtcNow(), page, pageSize, ct)
            .ConfigureAwait(false);

        await SweepExpiredAsync(items, ct).ConfigureAwait(false);

        var summaries = await GetOrganizerSummariesAsync(items, ct).ConfigureAwait(false);
        return ApplicationResult<ApplicationListResult>.Ok(new ApplicationListResult(
            items.Select(a => a.ToDto(includeThread: false, summaries.GetValueOrDefault(a.OrganizerId))).ToList(),
            total,
            page,
            pageSize));
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

        // The manager-vs-organizer split: a caller who isn't the organizer is (per LoadScopedAsync)
        // a manager of the room's venue. Only the manager sees the reputation summary and — while the
        // application is still undecided and the availability surface is on — the conflict digest
        // (pending demand and other organizers' identities stay host-only, CONTRACTS §6).
        var callerIsManager = application!.OrganizerId != callerId;
        var summary = callerIsManager
            ? (await GetOrganizerSummariesAsync([application], ct).ConfigureAwait(false)).GetValueOrDefault(application.OrganizerId)
            : null;
        var conflicts = callerIsManager
            && ApplicationExpiryPolicy.IsUndecided(application.Status)
            && _flags.IsEnabled(AvailabilityFlag)
            ? await BuildConflictsAsync(application, ct).ConfigureAwait(false)
            : null;
        return ApplicationResult<ApplicationDto>.Ok(application.ToDto(includeThread: true, summary, conflicts));
    }

    /// <summary>
    /// The manager-review conflict digest (CONTRACTS §6) for an undecided application: the schedule's
    /// rules + confirmed-booking conflicts (from the Availability engine) plus competing pending
    /// demand on the same room. Null when the room has no availability rules (nothing to review).
    /// </summary>
    private async Task<ApplicationConflictsDto?> BuildConflictsAsync(Application application, CancellationToken ct)
    {
        var core = await _availability
            .GetStoredScheduleConflictsAsync(application.RoomId, application.ToScheduleDto(), ct)
            .ConfigureAwait(false);
        if (core is null)
        {
            return null; // room has no availability rules
        }

        var overlaps = await BuildPendingOverlapsAsync(application, ct).ConfigureAwait(false);
        return new ApplicationConflictsDto(core.TotalOccurrences, core.Conflicts, overlaps);
    }

    /// <summary>
    /// Other undecided applications on the same room whose projected dates <b>and</b> time ranges
    /// intersect this one's, with the count of shared dates each. Times are constant across a
    /// schedule's dates, so a single half-open <c>[start, end)</c> overlap test gates a competitor;
    /// the count is the size of the date intersection. Competitors with no shared dates or disjoint
    /// times are omitted.
    /// </summary>
    private async Task<IReadOnlyList<PendingOverlapDto>> BuildPendingOverlapsAsync(Application application, CancellationToken ct)
    {
        var competitors = await _repository
            .GetUndecidedForRoomAsync(application.RoomId, application.Id, _clock.GetUtcNow(), ct)
            .ConfigureAwait(false);
        if (competitors.Count == 0)
        {
            return [];
        }

        var tz = TimeZoneInfo.FindSystemTimeZoneById(application.Room!.Venue!.Timezone);
        var myDates = MaterializeLocalDates(application, tz);

        var overlaps = new List<PendingOverlapDto>();
        foreach (var competitor in competitors)
        {
            // Half-open time-range overlap: touching endpoints ([) ) don't clash.
            if (application.StartTime >= competitor.EndTime || competitor.StartTime >= application.EndTime)
            {
                continue;
            }

            var theirDates = MaterializeLocalDates(competitor, tz).ToHashSet();
            var shared = myDates.Count(theirDates.Contains);
            if (shared == 0)
            {
                continue;
            }

            overlaps.Add(new PendingOverlapDto(competitor.Id, competitor.Organizer!.DisplayName, shared));
        }

        return overlaps.OrderByDescending(o => o.OverlappingDateCount).ThenBy(o => o.OrganizerName).ToList();
    }

    /// <summary>The venue-local dates a stored application schedule would occupy if approved.</summary>
    private static IReadOnlyList<DateOnly> MaterializeLocalDates(Application app, TimeZoneInfo tz) =>
        ScheduleMaterializer.Materialize(
            app.Frequency,
            app.StartDate,
            app.EndDate ?? app.StartDate,
            app.Frequency == ScheduleFrequency.RecurringWeekly ? app.DaysOfWeek : null,
            app.StartTime,
            app.EndTime,
            tz)
        .Select(i => i.LocalDate)
        .ToList();

    /// <inheritdoc />
    public Task<ApplicationResult<ApplicationDto>> AddMessageAsync(
        Guid applicationId, Guid callerId, ApplicationMessageRequest request, CancellationToken ct = default) =>
        GuardTransitionAsync(() => AddMessageCoreAsync(applicationId, callerId, request, ct));

    private async Task<ApplicationResult<ApplicationDto>> AddMessageCoreAsync(
        Guid applicationId, Guid callerId, ApplicationMessageRequest request, CancellationToken ct)
    {
        var body = request.Body?.Trim();
        if (string.IsNullOrEmpty(body) || body.Length > ApplicationSchedulePolicy.MaxTextLength)
        {
            return ApplicationResult<ApplicationDto>.Fail(
                ApplicationErrorCodes.InvalidApplication,
                $"A message needs 1–{ApplicationSchedulePolicy.MaxTextLength} characters.");
        }

        var (application, error) = await LoadScopedAsync(applicationId, callerId, ct).ConfigureAwait(false);
        if (error is not null)
        {
            return ApplicationResult<ApplicationDto>.Fail(error.Code, error.Detail);
        }

        await SweepExpiredAsync([application!], ct).ConfigureAwait(false);
        // An approval does not end the correspondence: a booking still needs a
        // way to say "the side door is locked, use the hall entrance". Declined,
        // withdrawn and expired applications are closed and stay closed.
        if (!ApplicationTransitionRules.CanCorrespond(application!.Status))
        {
            return ApplicationResult<ApplicationDto>.Fail(
                ApplicationErrorCodes.InvalidState, "This application has already been decided.");
        }

        var now = _clock.GetUtcNow();
        var callerIsOrganizer = application.OrganizerId == callerId;

        // The ask/answer rhythm drives the sub-state: a provider question parks the application
        // in NeedsInfo; the organizer's answer puts it back in the provider's court (Pending).
        // While CounterOffered the thread flows but must NOT flip status — the ball stays with the
        // organizer until they accept/decline the counter (CONTRACTS §5). Approved is the same for
        // the opposite reason: the ball is with nobody, and a message is not a new question.
        application.Status = ApplicationTransitionRules.AfterMessage(application.Status, callerIsOrganizer);

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
        var email = ApplicationNotifications.MessageEmail(application, senderName, body);

        if (callerIsOrganizer)
        {
            await _applicationNotifications.NotifyManagersAsync(
                application, NotificationType.ApplicationMessage, email, ct, senderName).ConfigureAwait(false);
        }
        else
        {
            await _applicationNotifications.NotifyOrganizerAsync(
                application, NotificationType.ApplicationMessage, email, ct, senderName).ConfigureAwait(false);
        }

        var refreshed = await _repository.GetAsync(application.Id, ct).ConfigureAwait(false) ?? application;
        var summary = refreshed.OrganizerId == callerId
            ? null
            : (await GetOrganizerSummariesAsync([refreshed], ct).ConfigureAwait(false)).GetValueOrDefault(refreshed.OrganizerId);
        return ApplicationResult<ApplicationDto>.Ok(refreshed.ToDto(includeThread: true, summary));
    }

    /// <inheritdoc />
    public Task<ApplicationResult<ApplicationDto>> DecideAsync(
        Guid applicationId, Guid callerId, ApplicationDecisionRequest request, CancellationToken ct = default) =>
        GuardTransitionAsync(() => DecideCoreAsync(applicationId, callerId, request, ct));

    private async Task<ApplicationResult<ApplicationDto>> DecideCoreAsync(
        Guid applicationId, Guid callerId, ApplicationDecisionRequest request, CancellationToken ct)
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

        // Approve needs the ball in the provider's court (Pending|NeedsInfo). A CounterOffered
        // application has been handed to the organizer, so the host can only *decline* it (which
        // also lapses the open counter) — approving is blocked until the organizer responds.
        var counterOffered = application.Status == ApplicationStatus.CounterOffered;
        if (!ApplicationTransitionRules.CanHostDecide(application.Status, approve))
        {
            return ApplicationResult<ApplicationDto>.Fail(
                ApplicationErrorCodes.InvalidState, "This application has already been decided.");
        }

        var now = _clock.GetUtcNow();
        application.Status = approve ? ApplicationStatus.Approved : ApplicationStatus.Declined;
        application.DecidedAtUtc = now;

        // A host decline of a CounterOffered application lapses its open counter along with the flip.
        if (!approve && counterOffered)
        {
            ApplicationTransitionRules.OpenCounter(application)!.Status = CounterOfferStatus.Lapsed;
        }

        // Approval *is* the booking transaction (SYSTEM_DESIGN §5/§7): the Approved flip above is
        // still unsaved, and ConfirmFromApplicationAsync commits it atomically with the booking and
        // every materialized occurrence. When the exclusion constraint aborts that save, the slot
        // is already held — the application auto-declines with notice, and the provider gets
        // slot_taken instead of a half-approved state.
        if (approve)
        {
            var confirmation = await _bookings.ConfirmFromApplicationAsync(application, ct: ct).ConfigureAwait(false);
            if (confirmation.SlotTaken)
            {
                return await AutoDeclineSlotTakenAsync(application, now, viaCounterOffer: false, ct).ConfigureAwait(false);
            }

            // Post-commit charge kick (booking-modes.md): the first occurrence charges at
            // confirmation — approval and instant book share the same machinery. No-op for
            // bookings without a price snapshot (payments disabled at confirmation).
            await _payments.ChargeAtConfirmationAsync(confirmation.Booking!.Id, ct).ConfigureAwait(false);
        }

        if (request.Message is { Length: > 0 } note)
        {
            await _repository.AddMessageAsync(
                new ApplicationMessage
                {
                    Id = Guid.NewGuid(),
                    ApplicationId = application.Id,
                    SenderId = callerId,
                    Body = note.Length > ApplicationSchedulePolicy.MaxTextLength
                        ? note[..ApplicationSchedulePolicy.MaxTextLength]
                        : note,
                    SentAtUtc = now,
                },
                ct).ConfigureAwait(false);
        }
        else
        {
            await _repository.SaveAsync(ct).ConfigureAwait(false);
        }

        var email = ApplicationNotifications.DecisionEmail(application, approve, request.Message);

        await _applicationNotifications.NotifyOrganizerAsync(
            application,
            approve ? NotificationType.ApplicationApproved : NotificationType.ApplicationDeclined,
            email,
            ct,
            messageAdded: request.Message is { Length: > 0 }).ConfigureAwait(false);

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

        var refreshed = await _repository.GetAsync(application.Id, ct).ConfigureAwait(false) ?? application;
        var summary = refreshed.OrganizerId == callerId
            ? null
            : (await GetOrganizerSummariesAsync([refreshed], ct).ConfigureAwait(false)).GetValueOrDefault(refreshed.OrganizerId);
        return ApplicationResult<ApplicationDto>.Ok(refreshed.ToDto(includeThread: true, summary));
    }

    /// <inheritdoc />
    public Task<ApplicationResult<ApplicationDto>> WithdrawAsync(Guid applicationId, Guid organizerId, CancellationToken ct = default) =>
        GuardTransitionAsync(() => WithdrawCoreAsync(applicationId, organizerId, ct));

    private async Task<ApplicationResult<ApplicationDto>> WithdrawCoreAsync(Guid applicationId, Guid organizerId, CancellationToken ct)
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
        if (!ApplicationTransitionRules.CanWithdraw(application.Status))
        {
            return ApplicationResult<ApplicationDto>.Fail(
                ApplicationErrorCodes.InvalidState, "This application has already been decided.");
        }

        application.Status = ApplicationStatus.Withdrawn;
        application.DecidedAtUtc = _clock.GetUtcNow();
        if (ApplicationTransitionRules.OpenCounter(application) is { } openCounter)
        {
            openCounter.Status = CounterOfferStatus.Lapsed;
        }
        await _repository.SaveAsync(ct).ConfigureAwait(false);

        return ApplicationResult<ApplicationDto>.Ok(application.ToDto(includeThread: true));
    }

    /// <inheritdoc />
    public Task<ApplicationResult<ApplicationDto>> CounterOfferAsync(
        Guid applicationId, Guid callerId, CounterOfferRequest request, CancellationToken ct = default) =>
        GuardTransitionAsync(() => CounterOfferCoreAsync(applicationId, callerId, request, ct));

    private async Task<ApplicationResult<ApplicationDto>> CounterOfferCoreAsync(
        Guid applicationId, Guid callerId, CounterOfferRequest request, CancellationToken ct)
    {
        // Flag off → indistinguishable from an unknown route (404), like listing.availability's endpoints.
        if (!_flags.IsEnabled(CounterOffersFlag))
        {
            return ApplicationResult<ApplicationDto>.Fail(ApplicationErrorCodes.NotFound, "Application not found.");
        }

        var scheduleProblem = ApplicationSchedulePolicy.ValidateSchedule(request.Schedule);
        if (scheduleProblem is not null)
        {
            return ApplicationResult<ApplicationDto>.Fail(ApplicationErrorCodes.InvalidApplication, scheduleProblem);
        }

        var (application, error) = await LoadScopedAsync(applicationId, callerId, ct).ConfigureAwait(false);
        if (error is not null)
        {
            return ApplicationResult<ApplicationDto>.Fail(error.Code, error.Detail);
        }

        // Venue-manager only (same scoping as Decide): a caller who is only the organizer can't counter.
        if (application!.OrganizerId == callerId
            && !await _venueManagers.IsManagerAsync(callerId, application.Room!.VenueId, ct).ConfigureAwait(false))
        {
            return ApplicationResult<ApplicationDto>.Fail(
                ApplicationErrorCodes.NotVenueManager, "Only the venue can counter-offer an application.");
        }

        await SweepExpiredAsync([application], ct).ConfigureAwait(false);

        // Counterable while the ball can still move: not yet decided/withdrawn/expired. A re-counter
        // while already CounterOffered is allowed (it supersedes the prior open counter).
        if (!ApplicationTransitionRules.CanCounterOffer(application.Status))
        {
            return ApplicationResult<ApplicationDto>.Fail(
                ApplicationErrorCodes.InvalidState, "This application has already been decided.");
        }

        // Same venue-local past-date guard as submit — the proposed time speaks the venue's calendar.
        if (request.Schedule!.StartDate
            < ApplicationSchedulePolicy.VenueLocalToday(
                application.Room!.Venue!.Timezone,
                _clock.GetUtcNow()))
        {
            return ApplicationResult<ApplicationDto>.Fail(
                ApplicationErrorCodes.InvalidApplication, "The start date can't be in the past.");
        }

        // Same submit-time availability hard block against the room's rules + confirmed bookings.
        if (await CheckAvailabilityBlockAsync(application.RoomId, request.Schedule!, ct).ConfigureAwait(false) is { } block)
        {
            return ApplicationResult<ApplicationDto>.Fail(block.Code, block.Detail, block.Extensions!);
        }

        var now = _clock.GetUtcNow();
        var parsed = ApplicationSchedulePolicy.Parse(request.Schedule!);
        var message = request.Message?.Trim() is { Length: > 0 } m
            ? (m.Length > ApplicationSchedulePolicy.MaxTextLength
                ? m[..ApplicationSchedulePolicy.MaxTextLength]
                : m)
            : null;

        // One atomic save: supersede any open counter, insert the new open one, flip to
        // CounterOffered, refresh the 14-day expiry.
        var superseded = ApplicationTransitionRules.OpenCounter(application);
        if (superseded is not null)
        {
            superseded.Status = CounterOfferStatus.Superseded;
        }

        var counter = new ApplicationCounterOffer
        {
            Id = Guid.NewGuid(),
            ApplicationId = application.Id,
            ProposedByUserId = callerId,
            Frequency = parsed.Frequency,
            StartDate = parsed.StartDate,
            EndDate = parsed.EndDate,
            DaysOfWeek = parsed.DaysOfWeek,
            StartTime = parsed.StartTime,
            EndTime = parsed.EndTime,
            Message = message,
            Status = CounterOfferStatus.Open,
            CreatedAtUtc = now,
        };
        application.CounterOffers.Add(counter);
        _repository.AddCounterOffer(counter);
        application.Status = ApplicationStatus.CounterOffered;
        application.ExpiresAtUtc = now + ApplicationExpiryPolicy.Window;
        await _repository.SaveAsync(ct).ConfigureAwait(false);

        await _applicationNotifications.NotifyOrganizerAsync(
            application,
            NotificationType.CounterOfferReceived,
            ApplicationNotifications.CounterOfferEmail(application, counter),
            ct).ConfigureAwait(false);

        await TrackSafelyAsync(
            "counter_offer_sent",
            new
            {
                applicationId = application.Id,
                roomId = application.RoomId,
                superseded = superseded is not null,
            },
            ct).ConfigureAwait(false);

        var refreshed = await _repository.GetAsync(application.Id, ct).ConfigureAwait(false) ?? application;
        var summary = refreshed.OrganizerId == callerId
            ? null
            : (await GetOrganizerSummariesAsync([refreshed], ct).ConfigureAwait(false)).GetValueOrDefault(refreshed.OrganizerId);
        return ApplicationResult<ApplicationDto>.Ok(refreshed.ToDto(includeThread: true, summary));
    }

    /// <inheritdoc />
    public Task<ApplicationResult<ApplicationDto>> RespondToCounterOfferAsync(
        Guid applicationId, Guid callerId, CounterOfferResponseRequest request, CancellationToken ct = default) =>
        GuardTransitionAsync(() => RespondToCounterOfferCoreAsync(applicationId, callerId, request, ct));

    private async Task<ApplicationResult<ApplicationDto>> RespondToCounterOfferCoreAsync(
        Guid applicationId, Guid callerId, CounterOfferResponseRequest request, CancellationToken ct)
    {
        if (!_flags.IsEnabled(CounterOffersFlag))
        {
            return ApplicationResult<ApplicationDto>.Fail(ApplicationErrorCodes.NotFound, "Application not found.");
        }

        var accept = string.Equals(request.Decision, "accept", StringComparison.OrdinalIgnoreCase);
        if (!accept && !string.Equals(request.Decision, "decline", StringComparison.OrdinalIgnoreCase))
        {
            return ApplicationResult<ApplicationDto>.Fail(
                ApplicationErrorCodes.InvalidApplication, $"Unknown decision '{request.Decision}'.");
        }

        var (application, error) = await LoadScopedAsync(applicationId, callerId, ct).ConfigureAwait(false);
        if (error is not null)
        {
            return ApplicationResult<ApplicationDto>.Fail(error.Code, error.Detail);
        }

        // Organizer-only (same scoping as Withdraw): the counter is the organizer's to answer.
        if (application!.OrganizerId != callerId)
        {
            return ApplicationResult<ApplicationDto>.Fail(
                ApplicationErrorCodes.InvalidState, "Only the organizer can respond to a counter-offer.");
        }

        await SweepExpiredAsync([application], ct).ConfigureAwait(false);

        var open = ApplicationTransitionRules.OpenCounter(application);
        if (application.Status != ApplicationStatus.CounterOffered || open is null)
        {
            return ApplicationResult<ApplicationDto>.Fail(
                ApplicationErrorCodes.InvalidState, "There's no open counter-offer to respond to.");
        }

        var now = _clock.GetUtcNow();
        var timeToResponseHours = Math.Round((now - open.CreatedAtUtc).TotalHours, 1);

        if (accept)
        {
            // Booking transaction on the COUNTER schedule — the application keeps the original ask.
            // The Approved + Accepted flips are tracked and commit atomically with the booking.
            application.Status = ApplicationTransitionRules.AfterCounterResponse(accepted: true);
            application.DecidedAtUtc = now;
            open.Status = CounterOfferStatus.Accepted;
            open.RespondedAtUtc = now;

            var spec = new ScheduleSpec(open.Frequency, open.StartDate, open.EndDate, open.DaysOfWeek, open.StartTime, open.EndTime);
            var confirmation = await _bookings.ConfirmFromApplicationAsync(application, spec, ct: ct).ConfigureAwait(false);
            if (confirmation.SlotTaken)
            {
                // Same race handling as approval: the Accepted flip never committed (the booking save
                // aborted). Roll the counter back to Lapsed so the auto-decline save persists a clean
                // terminal state, then auto-decline, notify, and return slot_taken.
                open.Status = CounterOfferStatus.Lapsed;
                return await AutoDeclineSlotTakenAsync(application, now, viaCounterOffer: true, ct).ConfigureAwait(false);
            }

            // Same post-commit charge kick as approval (no-op without a price snapshot).
            await _payments.ChargeAtConfirmationAsync(confirmation.Booking!.Id, ct).ConfigureAwait(false);

            await _applicationNotifications.NotifyManagersAsync(
                application,
                NotificationType.CounterOfferAccepted,
                ApplicationNotifications.CounterResponseEmail(application, open, accepted: true),
                ct).ConfigureAwait(false);

            await TrackSafelyAsync(
                "counter_offer_responded",
                new { applicationId = application.Id, decision = "accept", timeToResponseHours },
                ct).ConfigureAwait(false);
            await TrackSafelyAsync(
                "application_decided",
                new
                {
                    applicationId = application.Id,
                    roomId = application.RoomId,
                    outcome = "approved",
                    viaCounterOffer = true,
                    timeToDecisionHours = Math.Round((now - application.CreatedAtUtc).TotalHours, 1),
                },
                ct).ConfigureAwait(false);
        }
        else
        {
            // Decline returns the ball to the venue: the application is Pending again, counter closed.
            application.Status = ApplicationTransitionRules.AfterCounterResponse(accepted: false);
            open.Status = CounterOfferStatus.DeclinedByOrganizer;
            open.RespondedAtUtc = now;
            await _repository.SaveAsync(ct).ConfigureAwait(false);

            await _applicationNotifications.NotifyManagersAsync(
                application,
                NotificationType.CounterOfferDeclined,
                ApplicationNotifications.CounterResponseEmail(application, open, accepted: false),
                ct).ConfigureAwait(false);

            await TrackSafelyAsync(
                "counter_offer_responded",
                new { applicationId = application.Id, decision = "decline", timeToResponseHours },
                ct).ConfigureAwait(false);
        }

        // The organizer's own view — no reputation summary.
        var refreshed = await _repository.GetAsync(application.Id, ct).ConfigureAwait(false) ?? application;
        return ApplicationResult<ApplicationDto>.Ok(refreshed.ToDto(includeThread: true));
    }

    // ----- Party scoping & state helpers --------------------------------------------------------

    private async Task<IReadOnlyDictionary<Guid, OrganizerRatingSummaryDto>> GetOrganizerSummariesAsync(
        IReadOnlyList<Application> applications,
        CancellationToken ct)
    {
        var organizerIds = applications.Select(a => a.OrganizerId).Distinct().ToList();
        return await _ratings.GetOrganizerSummariesAsync(organizerIds, _clock.GetUtcNow(), ct).ConfigureAwait(false);
    }

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

    /// <summary>
    /// Runs a state transition, answering an optimistic-concurrency loss as the domain fact it is:
    /// somebody else's transition committed first, so this one reads as a state conflict (409)
    /// rather than overwriting the winner — approve-vs-withdraw races leave exactly one decision
    /// and a booking that agrees with it.
    /// </summary>
    private static async Task<ApplicationResult<ApplicationDto>> GuardTransitionAsync(
        Func<Task<ApplicationResult<ApplicationDto>>> transition)
    {
        try
        {
            return await transition().ConfigureAwait(false);
        }
        catch (ConcurrentUpdateException)
        {
            return ApplicationResult<ApplicationDto>.Fail(
                ApplicationErrorCodes.InvalidState,
                "This application changed while the request was in flight — reload to see where it stands.");
        }
    }

    /// <summary>
    /// The approval-race auto-decline (CONTRACTS §5): the exclusion constraint already aborted the
    /// booking save, so the still-tracked Approved flip never committed. Flips the application to
    /// Declined, lapses any open counter, saves, notifies the organizer, tracks, and returns the
    /// <c>slot_taken</c> failure — shared by the approve and counter-offer-accept paths.
    /// </summary>
    private async Task<ApplicationResult<ApplicationDto>> AutoDeclineSlotTakenAsync(
        Application application, DateTimeOffset now, bool viaCounterOffer, CancellationToken ct)
    {
        application.Status = ApplicationStatus.Declined;
        application.DecidedAtUtc = now;
        if (ApplicationTransitionRules.OpenCounter(application) is { } openCounter)
        {
            openCounter.Status = CounterOfferStatus.Lapsed;
        }
        await _repository.SaveAsync(ct).ConfigureAwait(false);

        await _applicationNotifications.NotifyOrganizerAsync(
            application,
            NotificationType.ApplicationDeclined,
            ApplicationNotifications.SlotTakenEmail(application),
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
                viaCounterOffer,
                timeToDecisionHours = Math.Round((now - application.CreatedAtUtc).TotalHours, 1),
            },
            ct).ConfigureAwait(false);

        return ApplicationResult<ApplicationDto>.Fail(
            ApplicationErrorCodes.SlotTaken,
            "Another booking already holds an overlapping time — this request was automatically declined and the organizer notified.");
    }

    /// <summary>
    /// Lazy expiry (no background worker at this scale): any undecided application read past its
    /// expiry flips to Expired before it is returned, so no surface ever renders a stale Pending.
    /// A CounterOffered application that lapses also lapses its open counter.
    /// </summary>
    private async Task SweepExpiredAsync(IReadOnlyList<Application> applications, CancellationToken ct)
    {
        var now = _clock.GetUtcNow();
        var lapsed = applications
            .Where(a => ApplicationExpiryPolicy.IsEffectivelyExpired(a, now)
                && a.Status != ApplicationStatus.Expired)
            .ToList();
        if (lapsed.Count == 0)
        {
            return;
        }

        foreach (var application in lapsed)
        {
            if (application.Status == ApplicationStatus.CounterOffered)
            {
                ApplicationTransitionRules.OpenCounter(application)!.Status = CounterOfferStatus.Lapsed;
            }

            application.Status = ApplicationStatus.Expired;
        }

        try
        {
            await _repository.SaveAsync(ct).ConfigureAwait(false);
        }
        catch (ConcurrentUpdateException)
        {
            // A concurrent transition beat the sweep's flip — theirs is the truth, and the next
            // read re-judges expiry against it. A read must not fail over this; a mutation
            // following this sweep conflicts again on its own save and answers there.
        }
    }

    /// <summary>
    /// The availability hard block (CONTRACTS §6): when <c>listing.availability</c> is on, returns a
    /// <c>schedule_unavailable</c> error (with the per-date conflict payload) if the proposed schedule
    /// lands outside open hours / on a blackout / on already-booked time. Null = allowed (flag off, no
    /// rules, or every occurrence free). Shared by submit and counter-offer.
    /// </summary>
    private async Task<ApplicationError?> CheckAvailabilityBlockAsync(Guid roomId, ScheduleDto schedule, CancellationToken ct)
    {
        if (!_flags.IsEnabled(AvailabilityFlag))
        {
            return null;
        }

        var check = await _availability.CheckScheduleAsync(roomId, schedule, ct).ConfigureAwait(false);
        if (check.Value is not { Available: false } verdict)
        {
            return null;
        }

        return new ApplicationError(
            ApplicationErrorCodes.ScheduleUnavailable,
            "The proposed schedule isn't available — some dates fall outside the room's open hours, on a blackout, or are already booked.",
            new Dictionary<string, object?>
            {
                ["available"] = verdict.Available,
                ["totalOccurrences"] = verdict.TotalOccurrences,
                ["conflicts"] = verdict.Conflicts,
            });
    }

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
