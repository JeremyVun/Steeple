using System.Globalization;
using Microsoft.Extensions.Options;
using Steeple.Api.Contracts.Bookings;
using Steeple.Api.Services.Flags;
using Steeple.Api.Services.Payments;

namespace Steeple.Api.Services.Bookings;
/// <summary>
/// Default <see cref="IBookingService"/>: materializes approvals into occurrence sets under the
/// database's no-overlap exclusion constraint, scopes every read/write to the booking's parties,
/// enforces the state machines (booking Confirmed → Completed | Cancelled; occurrence
/// Scheduled → Occurred | NoShow | Cancelled), applies the cancellation notice window, and runs
/// the lazy sweeps (past occurrences → Occurred, finished terms → Completed, renewal-due nudges)
/// on read — no background worker at this scale (SYSTEM_DESIGN §5/§7).
/// </summary>
public sealed class BookingService : IBookingService
{
    /// <summary>
    /// How much notice a cancellation owes the other party: occurrences starting sooner than
    /// this still stand (and can be no-show marked); later ones are cancelled and freed.
    /// </summary>
    private static readonly TimeSpan CancellationNoticeWindow = TimeSpan.FromHours(48);

    /// <summary>How close to its term end a recurring booking triggers the renewal-due nudge.</summary>
    private static readonly TimeSpan RenewalNudgeWindow = TimeSpan.FromDays(14);

    private const int MaxReasonLength = 500;

    private readonly IBookingRepository _repository;
    private readonly IVenueManagerRepository _venueManagers;
    private readonly IRatingService _ratings;
    private readonly IPaymentService _payments;
    private readonly IFeatureFlags _flags;
    private readonly INotificationDispatcher _notifications;
    private readonly IAnalyticsSink _analytics;
    private readonly TimeProvider _clock;
    private readonly TimeSpan _chargeWindow;

    /// <summary>Creates the service from its ports.</summary>
    public BookingService(
        IBookingRepository repository,
        IVenueManagerRepository venueManagers,
        IRatingService ratings,
        IPaymentService payments,
        IFeatureFlags flags,
        INotificationDispatcher notifications,
        IAnalyticsSink analytics,
        TimeProvider clock,
        IOptions<PaymentsOptions> paymentsOptions)
    {
        _repository = repository;
        _venueManagers = venueManagers;
        _ratings = ratings;
        _payments = payments;
        _flags = flags;
        _notifications = notifications;
        _analytics = analytics;
        _clock = clock;
        _chargeWindow = TimeSpan.FromHours(paymentsOptions.Value.ChargeWindowHours);
    }

    /// <inheritdoc />
    public async Task<BookingConfirmation> ConfirmFromApplicationAsync(
        Application application, ScheduleSpec? schedule = null, bool instant = false, CancellationToken ct = default)
    {
        var room = application.Room ?? throw new InvalidOperationException("Application passed without its room.");
        var venue = room.Venue ?? throw new InvalidOperationException("Application passed without its venue.");
        _ = application.Organizer ?? throw new InvalidOperationException("Application passed without its organizer.");

        // IANA ids resolve natively on the ICU-backed platforms we run on (Linux containers, macOS).
        // Venues are founder-seeded (concierge phase), so an unknown zone is a data bug, not user input.
        var venueZone = TimeZoneInfo.FindSystemTimeZoneById(venue.Timezone);

        // The counter-offer accept path books an overriding schedule; approval books the ask as-is.
        var viaCounterOffer = schedule is not null;
        var spec = schedule ?? new ScheduleSpec(
            application.Frequency, application.StartDate, application.EndDate,
            application.DaysOfWeek, application.StartTime, application.EndTime);

        var now = _clock.GetUtcNow();
        var endDate = spec.EndDate ?? spec.StartDate;
        var instants = ScheduleMaterializer.Materialize(
            spec.Frequency, spec.StartDate, endDate,
            spec.DaysOfWeek, spec.StartTime, spec.EndTime, venueZone);

        // Price snapshot (docs/contracts/payments.md): column writes only — the actual charge is
        // a post-commit kick by the caller, never a gateway call inside this transaction. Only
        // written while payments are enabled, so bookings confirmed before the rails switched on
        // stay offline forever (mode is frozen for the booking's life, payments.md §4).
        var paid = _flags.IsEnabled(PaymentService.PaymentsFlag);
        var pricePerOccurrence = paid
            ? decimal.Round(room.PricePerHour * (decimal)(spec.EndTime - spec.StartTime).TotalHours, 2)
            : (decimal?)null;

        var booking = new Booking
        {
            Id = Guid.NewGuid(),
            ApplicationId = application.Id,
            RoomId = room.Id,
            OrganizerId = application.OrganizerId,
            Type = spec.Frequency == ScheduleFrequency.RecurringWeekly ? BookingType.Recurring : BookingType.OneOff,
            StartDate = spec.StartDate,
            EndDate = endDate,
            DaysOfWeek = spec.DaysOfWeek,
            StartTime = spec.StartTime,
            EndTime = spec.EndTime,
            Status = BookingStatus.Confirmed,
            PricePerOccurrence = pricePerOccurrence,
            Currency = paid ? room.Currency : null,
            CreatedAtUtc = now,
        };

        foreach (var slot in instants)
        {
            booking.Occurrences.Add(new BookingOccurrence
            {
                Id = Guid.NewGuid(),
                BookingId = booking.Id,
                RoomId = room.Id,
                StartUtc = slot.StartUtc,
                EndUtc = slot.EndUtc,
                LocalDate = slot.LocalDate,
                Status = OccurrenceStatus.Scheduled,
            });
        }

        // One atomic save: the caller's Approved status flip rides along with the booking and
        // every occurrence. An exclusion violation aborts all of it — first-approval-wins.
        if (!await _repository.TrySaveNewAsync(booking, ct).ConfigureAwait(false))
        {
            return new BookingConfirmation(Booking: null, SlotTaken: true);
        }

        // The graph the DTO needs is already on the application the caller loaded.
        booking.Room = room;
        booking.Organizer = application.Organizer;

        await TrackSafelyAsync(
            "booking_confirmed",
            new
            {
                bookingId = booking.Id,
                roomId = booking.RoomId,
                type = FlagEnumExtensions.ToCamelCaseToken(booking.Type.ToString()),
                occurrenceCount = booking.Occurrences.Count,
                // Set weekdays of a recurring term (0/absent for a one-off); whether booked via counter.
                weekdayCount = spec.Frequency == ScheduleFrequency.RecurringWeekly
                    ? System.Numerics.BitOperations.PopCount((uint)(int)(spec.DaysOfWeek ?? Weekdays.None))
                    : 0,
                viaCounterOffer,
                // Additive dimensions (payments rails): instant vs approved, and whether money moves.
                instant,
                isPaid = pricePerOccurrence is not null,
            },
            ct).ConfigureAwait(false);

        return new BookingConfirmation(
            booking.ToDto(
                includeOccurrences: true, now,
                paymentStatuses: new Dictionary<Guid, PaymentStatus>(), chargeWindow: _chargeWindow),
            SlotTaken: false);
    }

    /// <inheritdoc />
    public async Task<BookingResult<BookingListResult>> GetForOrganizerAsync(
        Guid organizerId, string? status, int page, int pageSize, CancellationToken ct = default)
    {
        if (!TryParseStatusFilter(status, out var statusFilter))
        {
            return BookingResult<BookingListResult>.Fail(
                BookingErrorCodes.InvalidBooking, $"Unknown status '{status}'.");
        }

        (page, pageSize) = ClampPaging(page, pageSize);
        var (items, total) = await _repository
            .GetForOrganizerAsync(organizerId, statusFilter, page, pageSize, ct)
            .ConfigureAwait(false);

        var now = await SweepAsync(items, ct).ConfigureAwait(false);

        var dtos = await ToDtosWithRatingsAsync(items, organizerId, includeOccurrences: false, now, ct).ConfigureAwait(false);
        return BookingResult<BookingListResult>.Ok(new BookingListResult(dtos, total, page, pageSize));
    }

    /// <inheritdoc />
    public async Task<BookingResult<BookingListResult>> GetForManagerAsync(
        Guid managerId, string? status, int page, int pageSize, CancellationToken ct = default)
    {
        if (!TryParseStatusFilter(status, out var statusFilter))
        {
            return BookingResult<BookingListResult>.Fail(
                BookingErrorCodes.InvalidBooking, $"Unknown status '{status}'.");
        }

        var venueIds = await _venueManagers.GetManagedVenueIdsAsync(managerId, ct).ConfigureAwait(false);
        if (venueIds.Count == 0)
        {
            // Not a provider (yet): an empty list, not an error — same stance as applications.
            return BookingResult<BookingListResult>.Ok(new BookingListResult([], 0, 1, pageSize));
        }

        (page, pageSize) = ClampPaging(page, pageSize);
        var (items, total) = await _repository
            .GetForVenuesAsync(venueIds, statusFilter, page, pageSize, ct)
            .ConfigureAwait(false);

        var now = await SweepAsync(items, ct).ConfigureAwait(false);

        var dtos = await ToDtosWithRatingsAsync(items, managerId, includeOccurrences: false, now, ct).ConfigureAwait(false);
        return BookingResult<BookingListResult>.Ok(new BookingListResult(dtos, total, page, pageSize));
    }

    /// <inheritdoc />
    public async Task<BookingResult<BookingDto>> GetAsync(Guid bookingId, Guid callerId, CancellationToken ct = default)
    {
        var (booking, error) = await LoadScopedAsync(bookingId, callerId, ct).ConfigureAwait(false);
        if (error is not null)
        {
            return BookingResult<BookingDto>.Fail(error.Code, error.Detail);
        }

        var scopedBooking = booking!;
        var now = await SweepAsync([scopedBooking], ct).ConfigureAwait(false);
        var ratings = await _ratings.GetBookingOverviewsAsync([scopedBooking], callerId, now, ct).ConfigureAwait(false);
        var payments = await GetPaymentStatusesAsync([scopedBooking], ct).ConfigureAwait(false);
        return BookingResult<BookingDto>.Ok(scopedBooking.ToDto(
            includeOccurrences: true, now, ratings.GetValueOrDefault(scopedBooking.Id), payments, _chargeWindow));
    }

    /// <inheritdoc />
    public async Task<BookingResult<BookingDto>> CancelAsync(
        Guid bookingId, Guid callerId, CancelBookingRequest request, CancellationToken ct = default)
    {
        var reason = request.Reason?.Trim();
        if (reason is { Length: > MaxReasonLength })
        {
            return BookingResult<BookingDto>.Fail(
                BookingErrorCodes.InvalidBooking, $"A cancellation reason can have at most {MaxReasonLength} characters.");
        }

        var (booking, error) = await LoadScopedAsync(bookingId, callerId, ct).ConfigureAwait(false);
        if (error is not null)
        {
            return BookingResult<BookingDto>.Fail(error.Code, error.Detail);
        }

        var now = await SweepAsync([booking!], ct).ConfigureAwait(false);
        if (booking!.Status != BookingStatus.Confirmed)
        {
            return BookingResult<BookingDto>.Fail(
                BookingErrorCodes.InvalidState,
                booking.Status == BookingStatus.Completed
                    ? "This booking has already run its course."
                    : "This booking is already cancelled.");
        }

        booking.Status = BookingStatus.Cancelled;
        booking.CancelledBy = callerId;
        booking.CancelledAtUtc = now;
        booking.CancelReason = string.IsNullOrEmpty(reason) ? null : reason;

        // Asymmetric freeing (booking-modes.md refund table, superseding the symmetric window —
        // SYSTEM_DESIGN §17): the guest's cancellation owes the host 48h notice, so occurrences
        // inside the window keep standing (and their charges stand); a HOST cancel/rescind frees
        // every upcoming occurrence immediately — the notice window binds only guests, and every
        // freed occurrence's charge refunds in full (the Payments refund rule keys off Cancelled).
        var cancelledByOrganizer = booking.OrganizerId == callerId;
        var freeFrom = cancelledByOrganizer ? now + CancellationNoticeWindow : now;
        foreach (var occurrence in booking.Occurrences.Where(o => o.Status == OccurrenceStatus.Scheduled && o.StartUtc >= freeFrom))
        {
            occurrence.Status = OccurrenceStatus.Cancelled;
        }

        await _repository.SaveAsync(ct).ConfigureAwait(false);

        // Post-commit: return any charges now sitting on cancelled occurrences (full refund —
        // guest ≥48h cancels and host rescinds both reduce to this rule). The sweeper re-runs the
        // same rule every pass, so a failure here only delays the refund, never loses it.
        await _payments.RefundCancelledForBookingAsync(booking.Id, ct).ConfigureAwait(false);

        var email = BuildCancellationEmail(booking, cancelledByOrganizer);
        if (cancelledByOrganizer)
        {
            await NotifyManagersAsync(booking, NotificationType.BookingCancelled, email, ct).ConfigureAwait(false);
        }
        else
        {
            await NotifyOrganizerAsync(booking, NotificationType.BookingCancelled, email, ct).ConfigureAwait(false);
        }

        await TrackSafelyAsync(
            "booking_cancelled",
            new
            {
                bookingId = booking.Id,
                type = FlagEnumExtensions.ToCamelCaseToken(booking.Type.ToString()),
                cancelledBy = cancelledByOrganizer ? "organizer" : "venue",
            },
            ct).ConfigureAwait(false);

        var cancelRatings = await _ratings.GetBookingOverviewsAsync([booking], callerId, now, ct).ConfigureAwait(false);
        var cancelPayments = await GetPaymentStatusesAsync([booking], ct).ConfigureAwait(false);
        return BookingResult<BookingDto>.Ok(booking.ToDto(
            includeOccurrences: true, now, cancelRatings.GetValueOrDefault(booking.Id), cancelPayments, _chargeWindow));
    }

    /// <inheritdoc />
    public async Task<BookingResult<BookingDto>> MarkNoShowAsync(Guid occurrenceId, Guid callerId, CancellationToken ct = default)
    {
        var occurrence = await _repository.GetOccurrenceAsync(occurrenceId, ct).ConfigureAwait(false);
        var booking = occurrence?.Booking;
        if (booking?.Room?.Venue is null)
        {
            return BookingResult<BookingDto>.Fail(BookingErrorCodes.NotFound, "Occurrence not found.");
        }

        if (booking.OrganizerId != callerId
            && !await _venueManagers.IsManagerAsync(callerId, booking.Room.VenueId, ct).ConfigureAwait(false))
        {
            return BookingResult<BookingDto>.Fail(BookingErrorCodes.NotFound, "Occurrence not found.");
        }

        var now = _clock.GetUtcNow();
        if (occurrence!.StartUtc > now)
        {
            return BookingResult<BookingDto>.Fail(
                BookingErrorCodes.InvalidState, "An occurrence can only be marked after its start time.");
        }

        if (occurrence.Status is not (OccurrenceStatus.Scheduled or OccurrenceStatus.Occurred))
        {
            return BookingResult<BookingDto>.Fail(
                BookingErrorCodes.InvalidState,
                occurrence.Status == OccurrenceStatus.NoShow
                    ? "This occurrence is already marked as a no-show."
                    : "A cancelled occurrence can't be marked.");
        }

        occurrence.Status = OccurrenceStatus.NoShow;
        occurrence.NoShowMarkedBy = callerId;

        // Sweep (and save) the rest of the booking in the same pass.
        now = await SweepAsync([booking], ct).ConfigureAwait(false);
        await _repository.SaveAsync(ct).ConfigureAwait(false);

        await TrackSafelyAsync(
            "no_show_marked",
            new
            {
                bookingId = booking.Id,
                occurrenceId = occurrence.Id,
                markedBy = booking.OrganizerId == callerId ? "organizer" : "venue",
            },
            ct).ConfigureAwait(false);

        var ratings = await _ratings.GetBookingOverviewsAsync([booking], callerId, now, ct).ConfigureAwait(false);
        var payments = await GetPaymentStatusesAsync([booking], ct).ConfigureAwait(false);
        return BookingResult<BookingDto>.Ok(booking.ToDto(
            includeOccurrences: true, now, ratings.GetValueOrDefault(booking.Id), payments, _chargeWindow));
    }

    /// <inheritdoc />
    public async Task CancelOccurrencesForPaymentFailureAsync(
        Guid bookingId, IReadOnlyList<Guid> occurrenceIds, bool cancelRemainingTerm, CancellationToken ct = default)
    {
        var booking = await _repository.GetAsync(bookingId, ct).ConfigureAwait(false);
        if (booking is null || booking.Status != BookingStatus.Confirmed)
        {
            return; // already cancelled/completed — nothing left for the ladder to free
        }

        var now = _clock.GetUtcNow();
        var targets = booking.Occurrences
            .Where(o => o.Status == OccurrenceStatus.Scheduled && occurrenceIds.Contains(o.Id))
            .ToList();
        if (targets.Count == 0 && !cancelRemainingTerm)
        {
            return;
        }

        foreach (var occurrence in targets)
        {
            occurrence.Status = OccurrenceStatus.Cancelled;
        }

        if (cancelRemainingTerm)
        {
            // Second consecutive payment-failure cancel (payments.md §5): the term itself ends.
            // Every remaining scheduled occurrence frees — they're unpaid or refunding anyway.
            booking.Status = BookingStatus.Cancelled;
            booking.CancelledBy = null; // system, not a party
            booking.CancelledAtUtc = now;
            booking.CancelReason = "Payments for this booking repeatedly failed.";
            foreach (var occurrence in booking.Occurrences.Where(o => o.Status == OccurrenceStatus.Scheduled))
            {
                occurrence.Status = OccurrenceStatus.Cancelled;
            }
        }

        await _repository.SaveAsync(ct).ConfigureAwait(false);

        var dates = targets.Count > 0
            ? string.Join(", ", targets.OrderBy(o => o.StartUtc).Select(o => FormatDate(o.LocalDate)))
            : FormatDate(booking.EndDate);
        var room = booking.Room!;
        var venue = room.Venue!;
        var deepLink = $"/bookings/{booking.Id}";
        var termLine = cancelRemainingTerm
            ? "Because payments failed twice in a row, the rest of the booking has been cancelled as well.\n\n"
            : "The rest of the booking stands.\n\n";

        await NotifyOrganizerAsync(
            booking,
            NotificationType.BookingCancelled,
            new EmailContent(
                Subject: $"Session cancelled — payment didn't go through for {room.Name}",
                TextBody:
                    // CTA appended centrally by NotificationDispatcher from the payload deepLink.
                    $"We couldn't collect payment for {room.Name} at {venue.Name} ({dates}), " +
                    "so that session has been cancelled and the time released.\n\n" +
                    termLine.TrimEnd() + "\n\n" +
                    "You can check your payment method and book again at any time."),
            ct).ConfigureAwait(false);

        await NotifyManagersAsync(
            booking,
            NotificationType.BookingCancelled,
            new EmailContent(
                Subject: $"A booking of {room.Name} was cancelled (payment failure)",
                TextBody:
                    $"{booking.Organizer!.DisplayName}'s booking of {room.Name} ({dates}) was cancelled " +
                    "because their payment didn't go through. The time is open to new requests.\n\n" +
                    (cancelRemainingTerm ? "The remaining term was cancelled as well." : "The rest of the booking stands.")),
            ct).ConfigureAwait(false);

        await TrackSafelyAsync(
            "booking_cancelled",
            new
            {
                bookingId = booking.Id,
                type = FlagEnumExtensions.ToCamelCaseToken(booking.Type.ToString()),
                cancelledBy = "system",
                reason = "payment_failure",
                occurrenceCount = targets.Count,
                cancelRemainingTerm,
            },
            ct).ConfigureAwait(false);
    }

    // ----- Party scoping & lazy sweeps -----------------------------------------------------------

    private async Task<IReadOnlyList<BookingDto>> ToDtosWithRatingsAsync(
        IReadOnlyList<Booking> bookings,
        Guid callerId,
        bool includeOccurrences,
        DateTimeOffset now,
        CancellationToken ct)
    {
        var ratings = await _ratings.GetBookingOverviewsAsync(bookings, callerId, now, ct).ConfigureAwait(false);
        var payments = await GetPaymentStatusesAsync(bookings, ct).ConfigureAwait(false);
        return bookings
            .Select(b => b.ToDto(includeOccurrences, now, ratings.GetValueOrDefault(b.Id), payments, _chargeWindow))
            .ToList();
    }

    /// <summary>Occurrence payment states for the page's bookings (Payments-owned read).</summary>
    private Task<IReadOnlyDictionary<Guid, PaymentStatus>> GetPaymentStatusesAsync(
        IReadOnlyList<Booking> bookings, CancellationToken ct) =>
        _payments.GetOccurrenceStatusesAsync(bookings.Select(b => b.Id).ToList(), ct);

    /// <summary>
    /// Loads the booking and verifies the caller is a party (organizer or a manager of the room's
    /// venue). Anyone else gets <c>not_found</c> — existence is never leaked.
    /// </summary>
    private async Task<(Booking? Booking, BookingError? Error)> LoadScopedAsync(
        Guid bookingId, Guid callerId, CancellationToken ct)
    {
        var booking = await _repository.GetAsync(bookingId, ct).ConfigureAwait(false);
        if (booking?.Room?.Venue is null)
        {
            return (null, new BookingError(BookingErrorCodes.NotFound, "Booking not found."));
        }

        if (booking.OrganizerId != callerId
            && !await _venueManagers.IsManagerAsync(callerId, booking.Room.VenueId, ct).ConfigureAwait(false))
        {
            return (null, new BookingError(BookingErrorCodes.NotFound, "Booking not found."));
        }

        return (booking, null);
    }

    /// <summary>
    /// The lazy sweeps (no background worker at this scale), applied to whatever a read touched:
    /// past Scheduled occurrences flip to Occurred, a confirmed booking with no slots left to
    /// hold flips to Completed, and a confirmed recurring term entering its last
    /// <see cref="RenewalNudgeWindow"/> gets its one renewal-due nudge. Returns the sweep's
    /// "now" so callers project DTOs against the same instant.
    /// </summary>
    private async Task<DateTimeOffset> SweepAsync(IReadOnlyList<Booking> bookings, CancellationToken ct)
    {
        var now = _clock.GetUtcNow();
        var today = DateOnly.FromDateTime(now.UtcDateTime);
        var dirty = false;
        var renewalDue = new List<Booking>();

        foreach (var booking in bookings)
        {
            foreach (var occurrence in booking.Occurrences.Where(o => o.Status == OccurrenceStatus.Scheduled && o.EndUtc <= now))
            {
                occurrence.Status = OccurrenceStatus.Occurred;
                dirty = true;
            }

            if (booking.Status == BookingStatus.Confirmed
                && booking.Occurrences.All(o => o.Status != OccurrenceStatus.Scheduled))
            {
                booking.Status = BookingStatus.Completed;
                dirty = true;
            }

            // The renewal seam (SYSTEM_DESIGN §5): nudge once as a recurring term nears its end;
            // renewing is a *new* application/booking that re-checks availability.
            if (booking.Status == BookingStatus.Confirmed
                && booking.Type == BookingType.Recurring
                && booking.RenewalNudgeSentAtUtc is null
                && booking.EndDate.DayNumber - today.DayNumber <= RenewalNudgeWindow.TotalDays)
            {
                booking.RenewalNudgeSentAtUtc = now;
                renewalDue.Add(booking);
                dirty = true;
            }
        }

        if (dirty)
        {
            await _repository.SaveAsync(ct).ConfigureAwait(false);
        }

        foreach (var booking in renewalDue)
        {
            await NotifyOrganizerAsync(
                booking,
                NotificationType.RenewalDue,
                new EmailContent(
                    Subject: $"Your time at {booking.Room!.Name} ends {FormatDate(booking.EndDate)}",
                    TextBody:
                        $"Your recurring booking of {booking.Room.Name} at {booking.Room.Venue!.Name} " +
                        $"({DescribeSchedule(booking)}) finishes on {FormatDate(booking.EndDate)}.\n\n" +
                        "If you'd like to keep meeting there, send a new request from the space's page — " +
                        "renewing early keeps your slot from being offered to someone else."),
                ct).ConfigureAwait(false);
        }

        return now;
    }

    // ----- Validation & wire-token parsing ------------------------------------------------------

    private static bool TryParseStatusFilter(string? token, out BookingStatus? status)
    {
        status = null;
        if (string.IsNullOrEmpty(token))
        {
            return true;
        }

        if (Enum.TryParse<BookingStatus>(token, ignoreCase: true, out var parsed) && Enum.IsDefined(parsed))
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
        Booking booking, NotificationType type, EmailContent? email, CancellationToken ct)
    {
        var managers = await _venueManagers.GetManagersAsync(booking.Room!.VenueId, ct).ConfigureAwait(false);
        if (managers.Count == 0)
        {
            return; // Concierge gap: no linked manager yet — the founder sees it in Admin.
        }

        await _notifications.NotifyAsync(
            managers.Select(m => new NotificationRecipient(m.Id, m.Email)).ToList(),
            type,
            BuildPayload(booking),
            email,
            ct).ConfigureAwait(false);
    }

    private Task NotifyOrganizerAsync(
        Booking booking, NotificationType type, EmailContent? email, CancellationToken ct) =>
        _notifications.NotifyAsync(
            [new NotificationRecipient(booking.OrganizerId, booking.Organizer?.Email)],
            type,
            BuildPayload(booking),
            email,
            ct);

    /// <summary>
    /// The inbox row's JSON document: ids + display fields + the canonical deep link
    /// (CONTRACTS §9 — clients render from this, never from push/email content).
    /// </summary>
    private static object BuildPayload(Booking booking) => new
    {
        bookingId = booking.Id,
        roomId = booking.RoomId,
        roomName = booking.Room!.Name,
        venueName = booking.Room.Venue!.Name,
        venueSlug = booking.Room.Venue.Slug,
        roomSlug = booking.Room.Slug,
        organizerName = booking.Organizer!.DisplayName,
        status = FlagEnumExtensions.ToCamelCaseToken(booking.Status.ToString()),
        deepLink = $"/bookings/{booking.Id}",
    };

    private static EmailContent BuildCancellationEmail(Booking booking, bool cancelledByOrganizer)
    {
        var room = booking.Room!;
        var venue = room.Venue!;
        var reasonLine = booking.CancelReason is { Length: > 0 } r ? $"They said: \"{r}\"\n\n" : "";

        // Asymmetric copy matches the asymmetric rule: a guest cancel leaves in-window sessions
        // standing (charges stand too); a host cancel frees everything and refunds everything.
        return cancelledByOrganizer
            ? new EmailContent(
                Subject: $"{booking.Organizer!.DisplayName} cancelled their booking of {room.Name}",
                TextBody:
                    $"{booking.Organizer.DisplayName} cancelled their booking of {room.Name} at {venue.Name} " +
                    $"({DescribeSchedule(booking)}).\n\n" +
                    reasonLine +
                    "The freed times are open to new requests. Anything already within the 48-hour " +
                    "notice window still stands.")
            : new EmailContent(
                Subject: $"{venue.Name} cancelled your booking of {room.Name}",
                TextBody:
                    $"{venue.Name} has cancelled your booking of {room.Name} ({DescribeSchedule(booking)}).\n\n" +
                    reasonLine +
                    "All upcoming sessions are cancelled, and anything you've already paid for them " +
                    "will be refunded in full automatically. " +
                    "There are more spaces nearby on Steeple — the details are in your inbox.");
    }

    // ----- Copy helpers (email text only — clients humanize wire tokens themselves) --------------

    /// <summary>"Tuesdays 9:00–11:30 AM, Sep 1 – Dec 15, 2026" / "Tue, Sep 1, 9:00–11:30 AM" (venue-local).</summary>
    private static string DescribeSchedule(Booking booking)
    {
        var start = FormatTime(booking.StartTime);
        var end = FormatTime(booking.EndTime);

        return booking.Type == BookingType.Recurring
            ? $"{ScheduleText.DescribeDays(booking.DaysOfWeek ?? Weekdays.None)} {start}–{end}, {FormatDate(booking.StartDate)} – {FormatDate(booking.EndDate)}"
            : $"{booking.StartDate.ToString("ddd, MMM d", CultureInfo.InvariantCulture)}, {start}–{end}";
    }

    private static string FormatTime(TimeOnly time) => time.ToString("h:mm tt", CultureInfo.InvariantCulture);

    private static string FormatDate(DateOnly date) => date.ToString("MMM d, yyyy", CultureInfo.InvariantCulture);

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
