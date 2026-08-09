using System.Globalization;
using Microsoft.Extensions.Options;
using Steeple.Api.Contracts.Payments;
using Steeple.Api.Services.Manage;
using Steeple.Api.Services.Notifications;

namespace Steeple.Api.Services.Payments;
/// <summary>
/// Default <see cref="IPaymentService"/>. Charge flow per occurrence: claim first (insert a
/// Pending row under the one-live-payment partial unique index), then call the gateway with
/// idempotency key = occurrence id, then record the outcome — so neither concurrent sweepers nor
/// crash-replays can double-charge (docs/contracts/payments.md). No gateway call ever runs inside
/// a booking/approval transaction; everything here is post-commit.
/// </summary>
public sealed class PaymentService : IPaymentService
{
    /// <summary>Feature flag gating payment setup, snapshots, charging, refunds, and sweeping.</summary>
    public const string PaymentsFlag = FeatureFlagKeys.PaymentsEnabled;

    private readonly IPaymentRepository _repository;
    private readonly IPaymentGateway _gateway;
    private readonly IVenueManagerRepository _venueManagers;
    private readonly INotificationDispatcher _notifications;
    private readonly IAnalyticsSink _analytics;
    private readonly IFeatureFlags _flags;
    private readonly TimeProvider _clock;
    private readonly PaymentsOptions _options;

    /// <summary>Creates the service from its ports.</summary>
    public PaymentService(
        IPaymentRepository repository,
        IPaymentGateway gateway,
        IVenueManagerRepository venueManagers,
        INotificationDispatcher notifications,
        IAnalyticsSink analytics,
        IFeatureFlags flags,
        TimeProvider clock,
        IOptions<PaymentsOptions> options)
    {
        _repository = repository;
        _gateway = gateway;
        _venueManagers = venueManagers;
        _notifications = notifications;
        _analytics = analytics;
        _flags = flags;
        _clock = clock;
        _options = options.Value;
    }

    private TimeSpan ChargeWindow => TimeSpan.FromHours(_options.ChargeWindowHours);
    private TimeSpan CancelDeadline => TimeSpan.FromHours(_options.CancelDeadlineHours);
    private TimeSpan RetryInterval => TimeSpan.FromSeconds(_options.RetryIntervalSeconds);

    // ----- Guest method-on-file ------------------------------------------------------------------

    /// <inheritdoc />
    public async Task<SetupIntentResponse> CreateSetupAsync(Guid userId, CancellationToken ct = default)
    {
        var user = await _repository.GetUserAsync(userId, ct).ConfigureAwait(false)
            ?? throw new InvalidOperationException("Authenticated caller has no user row.");

        var customerId = await _gateway.EnsureCustomerAsync(user.Id, user.Email, user.PaymentCustomerId, ct).ConfigureAwait(false);
        if (user.PaymentCustomerId != customerId)
        {
            user.PaymentCustomerId = customerId;
            await _repository.SaveAsync(ct).ConfigureAwait(false);
        }

        var clientSecret = await _gateway.CreateSetupIntentAsync(customerId, ct).ConfigureAwait(false);
        return new SetupIntentResponse(clientSecret, _options.PublishableKey, Mock: true);
    }

    /// <inheritdoc />
    public async Task<PaymentResult<MyPaymentsDto>> ConfirmMockSetupAsync(
        Guid userId, MockConfirmSetupRequest request, CancellationToken ct = default)
    {
        // Display data only, validated hard: exactly four digits. There is no request field a full
        // card number could ride in, and anything longer than 4 digits is rejected — the
        // "no card data ever touches the API" rule enforced at the shape.
        var last4 = request.Last4?.Trim() ?? "";
        if (last4.Length != 4 || !last4.All(char.IsAsciiDigit))
        {
            return PaymentResult<MyPaymentsDto>.Fail(
                PaymentErrorCodes.InvalidPayment, "last4 must be exactly the card's last four digits.");
        }

        var brand = request.Brand?.Trim().ToLowerInvariant() ?? "";
        if (brand.Length is 0 or > 20)
        {
            return PaymentResult<MyPaymentsDto>.Fail(
                PaymentErrorCodes.InvalidPayment, "Give the card brand (up to 20 characters).");
        }

        if (string.IsNullOrWhiteSpace(request.ClientSecret) || !request.ClientSecret.StartsWith("seti_mock_", StringComparison.Ordinal))
        {
            return PaymentResult<MyPaymentsDto>.Fail(
                PaymentErrorCodes.InvalidPayment, "Unknown setup intent — call POST /me/payments/setup first.");
        }

        var user = await _repository.GetUserAsync(userId, ct).ConfigureAwait(false)
            ?? throw new InvalidOperationException("Authenticated caller has no user row.");
        if (user.PaymentCustomerId is null)
        {
            return PaymentResult<MyPaymentsDto>.Fail(
                PaymentErrorCodes.InvalidPayment, "Unknown setup intent — call POST /me/payments/setup first.");
        }

        user.PaymentMethodBrand = brand;
        user.PaymentMethodLast4 = last4;
        user.PaymentMethodSetAtUtc = _clock.GetUtcNow();
        await _repository.SaveAsync(ct).ConfigureAwait(false);

        await TrackSafelyAsync("payment_method_saved", new { brand }, ct).ConfigureAwait(false);
        return PaymentResult<MyPaymentsDto>.Ok(ToMyPayments(user));
    }

    /// <inheritdoc />
    public async Task<MyPaymentsDto> GetMyPaymentsAsync(Guid userId, CancellationToken ct = default)
    {
        var user = await _repository.GetUserAsync(userId, ct).ConfigureAwait(false);
        return user is null ? new MyPaymentsDto(false, null, Mock: true) : ToMyPayments(user);
    }

    /// <inheritdoc />
    public async Task<bool> HasPaymentMethodAsync(Guid userId, CancellationToken ct = default)
    {
        var user = await _repository.GetUserAsync(userId, ct).ConfigureAwait(false);
        return user?.PaymentMethodSetAtUtc is not null;
    }

    private static MyPaymentsDto ToMyPayments(User user) =>
        user.PaymentMethodSetAtUtc is { } setAt
            ? new MyPaymentsDto(true, new SavedPaymentMethodDto(user.PaymentMethodBrand ?? "card", user.PaymentMethodLast4 ?? "", setAt), Mock: true)
            : new MyPaymentsDto(false, null, Mock: true);

    // ----- Venue payout onboarding ---------------------------------------------------------------

    /// <inheritdoc />
    public async Task<PaymentResult<OnboardingLinkDto>> StartOnboardingAsync(Guid callerId, Guid venueId, CancellationToken ct = default)
    {
        if (!await _venueManagers.IsManagerAsync(callerId, venueId, ct).ConfigureAwait(false))
        {
            return PaymentResult<OnboardingLinkDto>.Fail(PaymentErrorCodes.NotFound, "No such venue.");
        }

        var now = _clock.GetUtcNow();
        var account = await _repository.GetVenueAccountAsync(venueId, ct).ConfigureAwait(false);
        if (account is null)
        {
            account = new VenuePaymentAccount
            {
                VenueId = venueId,
                ProviderAccountId = await _gateway.CreateConnectedAccountAsync(venueId, null, ct).ConfigureAwait(false),
                CreatedAtUtc = now,
                UpdatedAtUtc = now,
            };
            await _repository.AddVenueAccountAsync(account, ct).ConfigureAwait(false);
            await TrackSafelyAsync("payout_onboarding_started", new { venueId }, ct).ConfigureAwait(false);
        }

        var url = await _gateway.CreateAccountLinkAsync(account.ProviderAccountId, ct).ConfigureAwait(false);
        return PaymentResult<OnboardingLinkDto>.Ok(new OnboardingLinkDto(url, Mock: true));
    }

    /// <inheritdoc />
    public async Task<PaymentResult<VenuePaymentStateDto>> CompleteMockOnboardingAsync(Guid callerId, Guid venueId, CancellationToken ct = default)
    {
        if (!await _venueManagers.IsManagerAsync(callerId, venueId, ct).ConfigureAwait(false))
        {
            return PaymentResult<VenuePaymentStateDto>.Fail(PaymentErrorCodes.NotFound, "No such venue.");
        }

        var account = await _repository.GetVenueAccountAsync(venueId, ct).ConfigureAwait(false);
        if (account is null)
        {
            return PaymentResult<VenuePaymentStateDto>.Fail(
                PaymentErrorCodes.InvalidPayment, "Start onboarding first — POST …/payments/onboarding.");
        }

        // Mock collapse: one call stands in for the provider's hosted KYC + the account.updated
        // webhooks + the explicit opt-in switch. The wire state keeps the payments.md §9 fields so
        // the Stripe machinery slots in without a shape change.
        var now = _clock.GetUtcNow();
        account.DetailsSubmitted = true;
        account.ChargesEnabled = true;
        account.PayoutsEnabled = true;
        account.OptedInAtUtc ??= now;
        account.UpdatedAtUtc = now;
        await _repository.SaveAsync(ct).ConfigureAwait(false);

        await TrackSafelyAsync("payout_onboarding_completed", new { venueId }, ct).ConfigureAwait(false);
        return PaymentResult<VenuePaymentStateDto>.Ok(ToState(account));
    }

    /// <inheritdoc />
    public async Task<PaymentResult<VenuePaymentStateDto>> GetVenuePaymentsAsync(Guid callerId, Guid venueId, CancellationToken ct = default)
    {
        if (!await _venueManagers.IsManagerAsync(callerId, venueId, ct).ConfigureAwait(false))
        {
            return PaymentResult<VenuePaymentStateDto>.Fail(PaymentErrorCodes.NotFound, "No such venue.");
        }

        var account = await _repository.GetVenueAccountAsync(venueId, ct).ConfigureAwait(false);
        return PaymentResult<VenuePaymentStateDto>.Ok(ToState(account));
    }

    private static VenuePaymentStateDto ToState(VenuePaymentAccount? account) =>
        account is null
            ? new VenuePaymentStateDto(false, false, false, false, false, null, Mock: true)
            : new VenuePaymentStateDto(
                OnboardingStarted: true,
                DetailsSubmitted: account.DetailsSubmitted,
                ChargesEnabled: account.ChargesEnabled,
                PayoutsEnabled: account.PayoutsEnabled,
                OptedIn: account.OptedInAtUtc is not null,
                DashboardUrl: null, // Stripe-time: the Express dashboard deep link
                Mock: true);

    // ----- Charge machinery ----------------------------------------------------------------------

    /// <inheritdoc />
    public async Task ChargeAtConfirmationAsync(Guid bookingId, CancellationToken ct = default)
    {
        if (!_flags.IsEnabled(PaymentsFlag))
        {
            return;
        }

        // Bookings confirmed while payments were off have no price snapshot and yield no
        // candidate. The explicit flag check above also pauses already-paid-mode work during a
        // rollback; it resumes only if the payment rails are enabled again.
        var candidate = await _repository.GetFirstChargeCandidateForBookingAsync(bookingId, ct).ConfigureAwait(false);
        if (candidate is null)
        {
            return;
        }

        await AttemptChargeAsync(candidate, _clock.GetUtcNow(), ct).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public async Task<SweepOutcome> SweepAsync(DateTimeOffset nowUtc, CancellationToken ct = default)
    {
        if (!_flags.IsEnabled(PaymentsFlag))
        {
            return SweepOutcome.Empty;
        }

        var charged = 0;
        var failed = 0;

        // Crash recovery first: a Pending row claimed an occurrence but never got its outcome.
        // The occurrence-id idempotency key makes the re-drive safe (a charge that actually
        // landed is returned, not repeated).
        foreach (var stale in await _repository.GetStalePendingAsync(nowUtc - RetryInterval, ct).ConfigureAwait(false))
        {
            var outcome = await DriveGatewayAsync(stale, nowUtc, notifyOnFirstFailure: true, priorFailures: 0, ct).ConfigureAwait(false);
            if (outcome) charged++; else failed++;
        }

        var toCancel = new List<PaymentFailureCancellation>();
        foreach (var candidate in await _repository.GetChargeCandidatesAsync(nowUtc, nowUtc + ChargeWindow, ct).ConfigureAwait(false))
        {
            switch (ChargePlanner.Plan(candidate, nowUtc, ChargeWindow, CancelDeadline, RetryInterval))
            {
                case ChargePlanner.Action.Charge:
                    var ok = await AttemptChargeAsync(candidate, nowUtc, ct).ConfigureAwait(false);
                    if (ok is true) charged++; else if (ok is false) failed++;
                    break;

                case ChargePlanner.Action.AutoCancel:
                    var booking = candidate.Occurrence.Booking!;
                    var consecutive = await _repository
                        .WasPreviousOccurrencePaymentCancelledAsync(booking.Id, candidate.Occurrence.StartUtc, ct)
                        .ConfigureAwait(false);
                    toCancel.Add(new PaymentFailureCancellation(booking.Id, candidate.Occurrence.Id, consecutive));
                    break;
            }
        }

        var refunded = await RefundCancelledAsync(bookingId: null, ct).ConfigureAwait(false);
        return new SweepOutcome(charged, failed, refunded, toCancel);
    }

    /// <inheritdoc />
    public async Task RefundCancelledForBookingAsync(Guid bookingId, CancellationToken ct = default)
    {
        if (!_flags.IsEnabled(PaymentsFlag))
        {
            return;
        }

        await RefundCancelledAsync(bookingId, ct).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public async Task<IReadOnlyDictionary<Guid, PaymentStatus>> GetOccurrenceStatusesAsync(
        IReadOnlyList<Guid> bookingIds, CancellationToken ct = default)
    {
        if (bookingIds.Count == 0)
        {
            return new Dictionary<Guid, PaymentStatus>();
        }

        var rows = await _repository.GetForBookingsAsync(bookingIds, ct).ConfigureAwait(false);
        return rows
            .GroupBy(p => p.OccurrenceId)
            .ToDictionary(
                g => g.Key,
                // At most one live row exists (partial unique index); it outranks failed history.
                g => g.OrderBy(p => p.Status == PaymentStatus.Failed ? 1 : 0).ThenByDescending(p => p.CreatedAtUtc).First().Status);
    }

    /// <summary>
    /// One charge attempt: claim → gateway → record. Returns true/false for the outcome, or null
    /// when the claim was lost (another worker holds it) — never throws for a payment failure.
    /// </summary>
    private async Task<bool?> AttemptChargeAsync(ChargeCandidate candidate, DateTimeOffset nowUtc, CancellationToken ct)
    {
        var occurrence = candidate.Occurrence;
        var booking = occurrence.Booking ?? throw new InvalidOperationException("Charge candidate loaded without its booking.");
        if (booking.PricePerOccurrence is not { } amount)
        {
            return null; // offline/legacy booking — nothing to charge
        }

        var claim = new Payment
        {
            Id = Guid.NewGuid(),
            OccurrenceId = occurrence.Id,
            BookingId = booking.Id,
            Amount = amount,
            Currency = booking.Currency ?? "USD",
            ApplicationFee = 0m, // commission % is a launch-time founder decision (payments.md §14)
            Status = PaymentStatus.Pending,
            CreatedAtUtc = nowUtc,
            UpdatedAtUtc = nowUtc,
        };

        if (!await _repository.TryAddPaymentAsync(claim, ct).ConfigureAwait(false))
        {
            return null; // someone else already holds the live claim — double-charge prevented here
        }

        claim.Occurrence = occurrence;
        claim.Booking = booking;
        return await DriveGatewayAsync(claim, nowUtc, notifyOnFirstFailure: true, candidate.FailedAttempts, ct).ConfigureAwait(false);
    }

    /// <summary>Drives a claimed (Pending) row through the gateway and records the outcome.</summary>
    private async Task<bool> DriveGatewayAsync(
        Payment claim, DateTimeOffset nowUtc, bool notifyOnFirstFailure, int priorFailures, CancellationToken ct)
    {
        var booking = claim.Booking ?? throw new InvalidOperationException("Payment row loaded without its booking.");
        var organizer = booking.Organizer;

        GatewayChargeResult result;
        if (organizer?.PaymentCustomerId is not { } customerId)
        {
            // Should be unreachable behind the apply gate; recorded as an ordinary failure so the
            // ladder (notify → retry → cancel at T−24h) still runs rather than silently stalling.
            result = new GatewayChargeResult(false, "", "no_payment_method");
        }
        else
        {
            try
            {
                result = await _gateway.ChargeOccurrenceAsync(
                    new ChargeOccurrenceRequest(claim.OccurrenceId, customerId, claim.Amount, claim.Currency, organizer.PaymentMethodLast4),
                    ct).ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                result = new GatewayChargeResult(false, "", "gateway_error:" + ex.GetType().Name);
            }
        }

        claim.UpdatedAtUtc = nowUtc;
        if (result.Succeeded)
        {
            claim.Status = PaymentStatus.Succeeded;
            claim.ProviderPaymentId = result.ProviderPaymentId;
        }
        else
        {
            claim.Status = PaymentStatus.Failed;
            // ProviderPaymentId stays null on failed rows: the idempotent provider id belongs to
            // the eventual successful attempt (unique index) — the failure code is the history.
            claim.FailureCode = result.FailureCode;
        }

        await _repository.SaveAsync(ct).ConfigureAwait(false);

        if (result.Succeeded)
        {
            await TrackSafelyAsync(
                "payment_succeeded",
                new { bookingId = booking.Id, occurrenceId = claim.OccurrenceId, amount = claim.Amount, currency = claim.Currency },
                ct).ConfigureAwait(false);
            return true;
        }

        await TrackSafelyAsync(
            "payment_failed",
            new { bookingId = booking.Id, occurrenceId = claim.OccurrenceId, failureCode = claim.FailureCode },
            ct).ConfigureAwait(false);

        if (notifyOnFirstFailure && priorFailures == 0)
        {
            await NotifyPaymentFailedAsync(claim, ct).ConfigureAwait(false);
        }

        return false;
    }

    /// <summary>
    /// The declarative refund rule: every succeeded charge on a cancelled occurrence is returned
    /// in full — host rescinds, guest ≥48h cancels, and payment-failure term cancels all reduce to
    /// it (booking-modes.md refund table). Crash-safe: the sweeper re-runs this every pass.
    /// </summary>
    private async Task<int> RefundCancelledAsync(Guid? bookingId, CancellationToken ct)
    {
        var refunded = 0;
        foreach (var payment in await _repository.GetRefundableAsync(bookingId, ct).ConfigureAwait(false))
        {
            if (payment.ProviderPaymentId is not { } providerPaymentId)
            {
                continue; // defensive: a succeeded row always carries its provider id
            }

            GatewayRefundResult result;
            try
            {
                result = await _gateway.RefundAsync(providerPaymentId, ct).ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                result = new GatewayRefundResult(false, "gateway_error:" + ex.GetType().Name);
            }

            if (!result.Succeeded)
            {
                continue; // stays Succeeded-on-cancelled; the next sweep retries the refund
            }

            var now = _clock.GetUtcNow();
            payment.Status = PaymentStatus.Refunded;
            payment.RefundedAtUtc = now;
            payment.UpdatedAtUtc = now;
            await _repository.SaveAsync(ct).ConfigureAwait(false);
            refunded++;

            await TrackSafelyAsync(
                "refund_issued",
                new { bookingId = payment.BookingId, occurrenceId = payment.OccurrenceId, amount = payment.Amount, currency = payment.Currency },
                ct).ConfigureAwait(false);
            await NotifyRefundedAsync(payment, ct).ConfigureAwait(false);
        }

        return refunded;
    }

    // ----- Notifications -------------------------------------------------------------------------

    private Task NotifyPaymentFailedAsync(Payment payment, CancellationToken ct)
    {
        var booking = payment.Booking!;
        var (room, venue, organizer) = Display(booking);
        var deepLink = $"/bookings/{booking.Id}";
        var last4 = organizer?.PaymentMethodLast4 is { } l4 ? $" ending {l4}" : "";

        return _notifications.NotifyAsync(
            [new NotificationRecipient(booking.OrganizerId, organizer?.Email)],
            NotificationType.PaymentFailed,
            BuildPayload(payment, deepLink),
            new EmailContent(
                Subject: $"Payment problem with your booking of {room?.Name}",
                TextBody:
                    $"We couldn't charge your card{last4} for {room?.Name} at {venue?.Name} " +
                    $"on {FormatDate(payment.Occurrence?.LocalDate)}.\n\n" +
                    // The email CTA is appended centrally by NotificationDispatcher from the
                    // payload's deepLink — bodies stay URL-free by convention.
                    "Please check your payment method. We'll retry automatically — if the payment " +
                    "still hasn't gone through 24 hours before the session, that session will be " +
                    "cancelled and the time offered to others."),
            ct);
    }

    private Task NotifyRefundedAsync(Payment payment, CancellationToken ct)
    {
        var booking = payment.Booking!;
        var (room, venue, organizer) = Display(booking);
        var deepLink = $"/bookings/{booking.Id}";

        return _notifications.NotifyAsync(
            [new NotificationRecipient(booking.OrganizerId, organizer?.Email)],
            NotificationType.OccurrenceRefunded,
            BuildPayload(payment, deepLink),
            new EmailContent(
                Subject: $"You've been refunded for {room?.Name}",
                TextBody:
                    $"Your payment of {payment.Amount.ToString("0.00", CultureInfo.InvariantCulture)} {payment.Currency} " +
                    $"for {room?.Name} at {venue?.Name} on {FormatDate(payment.Occurrence?.LocalDate)} has been refunded in full."),
            ct);
    }

    private static (Room? Room, Venue? Venue, User? Organizer) Display(Booking booking) =>
        (booking.Room, booking.Room?.Venue, booking.Organizer);

    private static object BuildPayload(Payment payment, string deepLink)
    {
        var booking = payment.Booking!;
        return new
        {
            bookingId = booking.Id,
            occurrenceId = payment.OccurrenceId,
            roomId = booking.RoomId,
            roomName = booking.Room?.Name,
            venueName = booking.Room?.Venue?.Name,
            venueSlug = booking.Room?.Venue?.Slug,
            roomSlug = booking.Room?.Slug,
            organizerName = booking.Organizer?.DisplayName,
            localDate = payment.Occurrence?.LocalDate,
            amount = payment.Amount,
            currency = payment.Currency,
            status = FlagEnumExtensions.ToCamelCaseToken(payment.Status.ToString()),
            failureCode = payment.FailureCode,
            deepLink,
        };
    }

    private static string FormatDate(DateOnly? date) =>
        date?.ToString("ddd, MMM d", CultureInfo.InvariantCulture) ?? "an upcoming date";

    /// <summary>Best-effort analytics — never a reason to fail the operation.</summary>
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
