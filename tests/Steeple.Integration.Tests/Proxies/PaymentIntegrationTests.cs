using Microsoft.EntityFrameworkCore;
using Steeple.Api.Contracts.Applications;
using Steeple.Api.Contracts.Bookings;
using Steeple.Integration.Tests.Fixtures;

namespace Steeple.Integration.Tests.Proxies;
/// <summary>
/// The payments-rails proofs against a real Postgres with the Liquibase schema
/// (docs/contracts/payments.md): two concurrent <b>instant-book submits</b> for one slot produce
/// exactly one booking (the same exclusion constraint as approval, exercised through
/// <see cref="ApplicationService.SubmitAsync"/>); sweeping twice never double-charges (the
/// one-live-payment partial unique index); a host rescind refunds the charged occurrence and
/// frees the slot; submit without a method on file answers the 402 gate; and the declining test
/// card walks the failure ladder to an auto-cancel.
/// Each test books seeded Published rooms at distinct 2027 windows so tests sharing the container
/// never collide (and no new Published rooms are created — RoomRepositoryTests asserts counts).
/// </summary>
[Collection(PostgresCollection.Name)]
public class PaymentIntegrationTests
{
    private static readonly DateTimeOffset FixedNow = new(2026, 7, 4, 12, 0, 0, TimeSpan.Zero);

    // Gymnasium @ Oakton Baptist ($60/h) and Classroom B ($25/h) — Published, from 002-seed.sql.
    private static readonly Guid GymnasiumId = Guid.Parse("30000000-0000-0000-0000-000000000001");
    private static readonly Guid ClassroomBId = Guid.Parse("30000000-0000-0000-0000-000000000002");
    private static readonly Guid OaktonBaptistVenueId = Guid.Parse("33333333-3333-3333-3333-333333333333");

    private readonly PostgresDatabaseFixture _fixture;

    public PaymentIntegrationTests(PostgresDatabaseFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task ConcurrentInstantSubmits_SameSlot_ExactlyOneBookingCharged()
    {
        var organizerA = await SeedOrganizerAsync(last4: "4242");
        var organizerB = await SeedOrganizerAsync(last4: "4242");
        var date = new DateOnly(2027, 8, 6);

        using var gate = new Barrier(2);
        var results = await Task.WhenAll(new[] { organizerA, organizerB }.Select(organizerId => Task.Run(async () =>
        {
            await using var db = CreateContext();
            var (applications, _, _) = CreateStack(db);
            gate.SignalAndWait();
            return await applications.SubmitAsync(
                GymnasiumId, organizerId, SubmitRequest(date, new TimeOnly(18, 0), new TimeOnly(20, 0)),
                idempotencyKey: null, remoteIp: null);
        })));

        // First valid request wins; the loser's submit fails outright and persists nothing.
        var winner = Assert.Single(results, r => r.Error is null);
        Assert.Equal("approved", winner.Value!.Application.Status);
        var loser = Assert.Single(results, r => r.Error is not null);
        Assert.Equal(ApplicationErrorCodes.SlotTaken, loser.Error!.Code);

        await using var verifyDb = CreateContext();
        var organizerIds = new[] { organizerA, organizerB };
        var applicationsPersisted = await verifyDb.Applications
            .Where(a => organizerIds.Contains(a.OrganizerId))
            .ToListAsync();
        var application = Assert.Single(applicationsPersisted); // the loser left no row behind
        Assert.Equal(ApplicationStatus.Approved, application.Status);

        var booking = Assert.Single(await verifyDb.Bookings
            .Include(b => b.Occurrences)
            .Where(b => organizerIds.Contains(b.OrganizerId))
            .ToListAsync());
        Assert.Equal(BookingStatus.Confirmed, booking.Status);
        Assert.Equal(120m, booking.PricePerOccurrence); // $60/h × 2h snapshot
        Assert.Equal("USD", booking.Currency);

        // The at-confirmation charge landed for the (only) occurrence.
        var occurrence = Assert.Single(booking.Occurrences);
        var payment = Assert.Single(await verifyDb.Payments.Where(p => p.OccurrenceId == occurrence.Id).ToListAsync());
        Assert.Equal(PaymentStatus.Succeeded, payment.Status);
        Assert.Equal(120m, payment.Amount);
        Assert.Equal($"pi_mock_{occurrence.Id:N}", payment.ProviderPaymentId);
    }

    [Fact]
    public async Task Submit_WithoutMethodOnFile_Answers402Gate()
    {
        var organizerId = await SeedOrganizerAsync(last4: null);

        await using var db = CreateContext();
        var (applications, _, _) = CreateStack(db);
        var result = await applications.SubmitAsync(
            GymnasiumId, organizerId, SubmitRequest(new DateOnly(2027, 8, 13), new TimeOnly(9, 0), new TimeOnly(11, 0)),
            idempotencyKey: null, remoteIp: null);

        Assert.Null(result.Value);
        Assert.Equal(ApplicationErrorCodes.PaymentMethodRequired, result.Error!.Code);
        Assert.False(await db.Applications.AnyAsync(a => a.OrganizerId == organizerId));
    }

    [Fact]
    public async Task PaymentsDisabled_InstantBookingStaysOfflineAndSweepDoesNoWork()
    {
        var organizerId = await SeedOrganizerAsync(last4: null);

        await using var db = CreateContext();
        var (applications, _, payments) = CreateStack(db, paymentsEnabled: false);
        var result = await applications.SubmitAsync(
            GymnasiumId, organizerId,
            SubmitRequest(new DateOnly(2027, 8, 14), new TimeOnly(9, 0), new TimeOnly(11, 0)),
            idempotencyKey: null, remoteIp: null);

        Assert.Null(result.Error);
        Assert.Equal("approved", result.Value!.Application.Status);
        var booking = await db.Bookings.SingleAsync(b => b.OrganizerId == organizerId);
        Assert.Null(booking.PricePerOccurrence);
        Assert.Null(booking.Currency);
        Assert.Empty(await db.Payments.Where(p => p.BookingId == booking.Id).ToListAsync());
        Assert.Equal(SweepOutcome.Empty, await payments.SweepAsync(FixedNow));
    }

    [Fact]
    public async Task SweepTwice_AndConcurrentClaim_NeverDoubleCharges()
    {
        var organizerId = await SeedOrganizerAsync(last4: "4242");
        Guid occurrenceId;
        DateTimeOffset occurrenceStart;

        await using (var db = CreateContext())
        {
            // A recurring instant booking: the first occurrence charges at confirmation, the
            // SECOND is the sweeper's to charge when it enters the window.
            var (applications, _, _) = CreateStack(db);
            var result = await applications.SubmitAsync(
                ClassroomBId, organizerId,
                SubmitRequest(new DateOnly(2027, 8, 3), new TimeOnly(18, 0), new TimeOnly(20, 0),
                    endDate: new DateOnly(2027, 8, 10), daysOfWeek: ["tuesday"]),
                idempotencyKey: null, remoteIp: null);
            Assert.Null(result.Error);

            var booking = await db.Bookings
                .Include(b => b.Occurrences)
                .SingleAsync(b => b.OrganizerId == organizerId);
            var second = booking.Occurrences.OrderBy(o => o.StartUtc).Last();
            occurrenceId = second.Id;
            occurrenceStart = second.StartUtc;

            Assert.Equal(1, await db.Payments.CountAsync(p => p.BookingId == booking.Id)); // first occurrence only
        }

        // Two sweeps inside the second occurrence's charge window → still exactly one live payment.
        var sweepNow = occurrenceStart.AddHours(-40);
        foreach (var _ in Enumerable.Range(0, 2))
        {
            await using var db = CreateContext();
            var (_, _, payments) = CreateStack(db);
            await payments.SweepAsync(sweepNow);
        }

        await using (var verifyDb = CreateContext())
        {
            var rows = await verifyDb.Payments.Where(p => p.OccurrenceId == occurrenceId).ToListAsync();
            var payment = Assert.Single(rows);
            Assert.Equal(PaymentStatus.Succeeded, payment.Status);

            // And the guard itself bites: a concurrent claim on the same occurrence is refused by
            // the partial unique index (nothing written).
            var repo = new EfPaymentRepository(verifyDb);
            var claimed = await repo.TryAddPaymentAsync(new Payment
            {
                Id = Guid.NewGuid(),
                OccurrenceId = occurrenceId,
                BookingId = payment.BookingId,
                Amount = payment.Amount,
                Currency = payment.Currency,
                Status = PaymentStatus.Pending,
                CreatedAtUtc = FixedNow,
                UpdatedAtUtc = FixedNow,
            });
            Assert.False(claimed);
            Assert.Single(await verifyDb.Payments.Where(p => p.OccurrenceId == occurrenceId).ToListAsync());
        }
    }

    [Fact]
    public async Task HostRescind_RefundsTheCharge_AndFreesTheSlot()
    {
        var organizerId = await SeedOrganizerAsync(last4: "4242");
        var managerId = await SeedManagerAsync(OaktonBaptistVenueId);
        var date = new DateOnly(2027, 8, 20);
        Guid bookingId;

        await using (var db = CreateContext())
        {
            var (applications, _, _) = CreateStack(db);
            var result = await applications.SubmitAsync(
                GymnasiumId, organizerId, SubmitRequest(date, new TimeOnly(9, 0), new TimeOnly(12, 0)),
                idempotencyKey: null, remoteIp: null);
            Assert.Null(result.Error);
            bookingId = (await db.Bookings.SingleAsync(b => b.OrganizerId == organizerId)).Id;
        }

        await using (var db = CreateContext())
        {
            var (_, bookings, _) = CreateStack(db);
            var result = await bookings.CancelAsync(bookingId, managerId, new CancelBookingRequest("Roof repairs"));

            // Host rescind: every occurrence freed regardless of notice, charge refunded in full.
            Assert.Null(result.Error);
            Assert.Equal("cancelled", result.Value!.Status);
            Assert.All(result.Value.Occurrences, o => Assert.Equal("cancelled", o.Status));
        }

        await using (var verifyDb = CreateContext())
        {
            var payment = Assert.Single(await verifyDb.Payments.Where(p => p.BookingId == bookingId).ToListAsync());
            Assert.Equal(PaymentStatus.Refunded, payment.Status);
            Assert.NotNull(payment.RefundedAtUtc);
        }

        // The freed slot is bookable again (the exclusion constraint's predicate released it).
        var rebooker = await SeedOrganizerAsync(last4: "4242");
        await using (var db = CreateContext())
        {
            var (applications, _, _) = CreateStack(db);
            var result = await applications.SubmitAsync(
                GymnasiumId, rebooker, SubmitRequest(date, new TimeOnly(9, 0), new TimeOnly(12, 0)),
                idempotencyKey: null, remoteIp: null);
            Assert.Null(result.Error);
        }
    }

    [Fact]
    public async Task DecliningCard_FailsAtConfirmation_ThenAutoCancelsAtDeadline()
    {
        var organizerId = await SeedOrganizerAsync(last4: MockPaymentGateway.DecliningLast4);
        Guid bookingId;
        Guid occurrenceId;
        DateTimeOffset occurrenceStart;

        await using (var db = CreateContext())
        {
            var (applications, _, _) = CreateStack(db);
            var result = await applications.SubmitAsync(
                ClassroomBId, organizerId, SubmitRequest(new DateOnly(2027, 8, 27), new TimeOnly(14, 0), new TimeOnly(16, 0)),
                idempotencyKey: null, remoteIp: null);

            // Instant book still confirms — the charge is post-commit; failure enters the ladder.
            Assert.Null(result.Error);
            var booking = await db.Bookings.Include(b => b.Occurrences).SingleAsync(b => b.OrganizerId == organizerId);
            bookingId = booking.Id;
            var occurrence = Assert.Single(booking.Occurrences);
            occurrenceId = occurrence.Id;
            occurrenceStart = occurrence.StartUtc;

            var payment = Assert.Single(await db.Payments.Where(p => p.OccurrenceId == occurrenceId).ToListAsync());
            Assert.Equal(PaymentStatus.Failed, payment.Status);
            Assert.Equal("card_declined", payment.FailureCode);
        }

        // Inside the deadline (T−20h) with a failure on record, the sweep instructs an auto-cancel;
        // the sweeper routes it through the Bookings service, and the slot frees.
        await using (var db = CreateContext())
        {
            var (_, bookings, payments) = CreateStack(db);
            var outcome = await payments.SweepAsync(occurrenceStart.AddHours(-20));

            var cancellation = Assert.Single(outcome.ToCancel, c => c.OccurrenceId == occurrenceId);
            Assert.False(cancellation.CancelRemainingTerm); // first failure, not the second consecutive
            await bookings.CancelOccurrencesForPaymentFailureAsync(
                cancellation.BookingId, [cancellation.OccurrenceId], cancellation.CancelRemainingTerm);
        }

        await using (var verifyDb = CreateContext())
        {
            var occurrence = await verifyDb.BookingOccurrences.SingleAsync(o => o.Id == occurrenceId);
            Assert.Equal(OccurrenceStatus.Cancelled, occurrence.Status);
            Assert.False(await verifyDb.Payments.AnyAsync(p => p.BookingId == bookingId && p.Status == PaymentStatus.Succeeded));
        }
    }

    // ----- Test rig ------------------------------------------------------------------------------

    private SteepleDbContext CreateContext() =>
        new(new DbContextOptionsBuilder<SteepleDbContext>()
            .UseNpgsql(_fixture.ConnectionString)
            .Options);

    /// <summary>
    /// The real service stack over one shared context: real EF repositories, the real
    /// <see cref="PaymentService"/> over <see cref="MockPaymentGateway"/>, payments flag on,
    /// retry pacing off (tests re-attempt immediately).
    /// </summary>
    private static (ApplicationService Applications, BookingService Bookings, PaymentService Payments) CreateStack(
        SteepleDbContext db,
        bool paymentsEnabled = true)
    {
        var clock = new FixedTimeProvider(FixedNow);
        var venueManagers = new EfVenueManagerRepository(db);
        var flags = paymentsEnabled
            ? new TestFeatureFlags(PaymentService.PaymentsFlag)
            : new TestFeatureFlags();
        var options = PaymentTestOptions.Payments(retryIntervalSeconds: 0);

        var payments = new PaymentService(
            new EfPaymentRepository(db), new MockPaymentGateway(), venueManagers,
            new NullNotifications(), new NullAnalytics(), flags, clock, options);

        var bookings = new BookingService(
            new EfBookingRepository(db), venueManagers, new NullRatings(), payments, flags,
            new NullNotifications(), new NullAnalytics(), clock, options);

        var applications = new ApplicationService(
            new EfApplicationRepository(db), venueManagers, bookings, new NullRatings(),
            new AvailabilityService(new EfAvailabilityRepository(db), venueManagers, new NullAnalytics(), clock),
            payments, flags, new NullNotifications(), new PassTurnstile(), new NullAnalytics(), clock);

        return (applications, bookings, payments);
    }

    private static SubmitApplicationRequest SubmitRequest(
        DateOnly date, TimeOnly start, TimeOnly end, DateOnly? endDate = null, IReadOnlyList<string>? daysOfWeek = null) =>
        new(
            ActivityType: "community",
            GroupSize: 12,
            Schedule: new ScheduleDto(
                Frequency: endDate is null ? "oneOff" : "recurringWeekly",
                StartDate: date,
                EndDate: endDate,
                DaysOfWeek: daysOfWeek,
                StartTime: start.ToString("HH\\:mm"),
                EndTime: end.ToString("HH\\:mm")),
            IntentText: "A community gathering.",
            TurnstileToken: null);

    /// <summary>An organizer, optionally with a mock payment method on file (never a PAN).</summary>
    private async Task<Guid> SeedOrganizerAsync(string? last4)
    {
        await using var db = CreateContext();
        var user = new User
        {
            Id = Guid.NewGuid(),
            DisplayName = "Payments Organizer",
            Email = $"{Guid.NewGuid():N}@example.com",
            CreatedAtUtc = FixedNow,
        };
        if (last4 is not null)
        {
            user.PaymentCustomerId = $"cus_mock_{user.Id:N}";
            user.PaymentMethodBrand = "visa";
            user.PaymentMethodLast4 = last4;
            user.PaymentMethodSetAtUtc = FixedNow;
        }

        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user.Id;
    }

    /// <summary>A venue manager for the given seeded venue (concierge linking, done as SQL would be).</summary>
    private async Task<Guid> SeedManagerAsync(Guid venueId)
    {
        await using var db = CreateContext();
        var user = new User
        {
            Id = Guid.NewGuid(),
            DisplayName = "Payments Manager",
            Email = $"{Guid.NewGuid():N}@example.com",
            CreatedAtUtc = FixedNow,
        };
        db.Users.Add(user);
        db.VenueManagers.Add(new VenueManager
        {
            Id = Guid.NewGuid(),
            VenueId = venueId,
            UserId = user.Id,
            CreatedAtUtc = FixedNow,
        });
        await db.SaveChangesAsync();
        return user.Id;
    }

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    private sealed class PassTurnstile : ITurnstileVerifier
    {
        public Task<bool> VerifyAsync(string? token, string? remoteIp, CancellationToken ct = default) =>
            Task.FromResult(true);
    }

    private sealed class NullNotifications : INotificationDispatcher
    {
        public Task NotifyAsync(
            IReadOnlyList<NotificationRecipient> recipients, NotificationType type, object payload,
            EmailContent? email, CancellationToken ct = default) => Task.CompletedTask;
    }

    private sealed class NullAnalytics : IAnalyticsSink
    {
        public Task TrackAsync(string eventType, object? payload = null, string? sessionId = null, CancellationToken ct = default) =>
            Task.CompletedTask;
    }

    private sealed class NullRatings : IRatingService
    {
        public Task<BookingResult<RatingSubmissionResult>> SubmitAsync(
            Guid bookingId, Guid callerId, SubmitRatingRequest request, CancellationToken ct = default) =>
            throw new NotSupportedException();

        public Task<IReadOnlyDictionary<Guid, BookingRatingsDto>> GetBookingOverviewsAsync(
            IReadOnlyList<Booking> bookings, Guid callerId, DateTimeOffset nowUtc, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyDictionary<Guid, BookingRatingsDto>>(new Dictionary<Guid, BookingRatingsDto>());

        public Task<IReadOnlyDictionary<Guid, RatingSummaryDto>> GetVenueSummariesAsync(
            IReadOnlyCollection<Guid> venueIds, DateTimeOffset nowUtc, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyDictionary<Guid, RatingSummaryDto>>(new Dictionary<Guid, RatingSummaryDto>());

        public Task<IReadOnlyDictionary<Guid, OrganizerRatingSummaryDto>> GetOrganizerSummariesAsync(
            IReadOnlyCollection<Guid> organizerIds, DateTimeOffset nowUtc, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyDictionary<Guid, OrganizerRatingSummaryDto>>(new Dictionary<Guid, OrganizerRatingSummaryDto>());

        public Task<VenueReviewPageDto> GetVenueReviewsAsync(
            Guid venueId, int page, int pageSize, DateTimeOffset nowUtc, CancellationToken ct = default) =>
            Task.FromResult(new VenueReviewPageDto([], 0, Math.Max(page, 1), Math.Clamp(pageSize, 1, 50)));
    }
}
