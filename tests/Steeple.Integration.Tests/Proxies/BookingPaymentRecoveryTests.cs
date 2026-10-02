using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Steeple.Integration.Tests.Fixtures;

namespace Steeple.Integration.Tests.Proxies;

[Collection(PostgresCollection.Name)]
public sealed class BookingPaymentRecoveryTests(PostgresDatabaseFixture fixture)
{
    private static readonly DateTimeOffset Now = new(2026, 7, 4, 12, 0, 0, TimeSpan.Zero);

    private SteepleDbContext Context() => new(new DbContextOptionsBuilder<SteepleDbContext>()
        .UseNpgsql(fixture.ConnectionString).Options);

    [Fact]
    public async Task StaleHostCancellation_CannotReplaceCommittedGuestCancellation()
    {
        var seed = await SeedAsync();
        await using var staleDb = Context();
        _ = await new EfBookingRepository(staleDb).GetAsync(seed.Booking);
        await using (var guestDb = Context())
        {
            Assert.Null((await Bookings(guestDb).CancelAsync(seed.Booking, seed.Guest,
                new CancelBookingRequest("Guest cancellation"))).Error);
        }

        var stale = await Bookings(staleDb).CancelAsync(seed.Booking, seed.Host,
            new CancelBookingRequest("Host cancellation"));
        Assert.Equal(BookingErrorCodes.InvalidState, stale.Error?.Code);
        await using var verify = Context();
        var booking = await verify.Bookings.SingleAsync(b => b.Id == seed.Booking);
        Assert.Equal(seed.Guest, booking.CancelledBy);
        Assert.Equal("Guest cancellation", booking.CancelReason);
    }

    [Fact]
    public async Task ConcurrentRenewalReads_SendOnlyOneNudge()
    {
        var seed = await SeedAsync(recurring: true);
        await using var staleDb = Context();
        _ = await new EfBookingRepository(staleDb).GetAsync(seed.Booking);
        await using (var firstDb = Context())
        {
            Assert.Null((await Bookings(firstDb).GetAsync(seed.Booking, seed.Guest)).Error);
        }

        Assert.Null((await Bookings(staleDb).GetAsync(seed.Booking, seed.Guest)).Error);
        await using var verify = Context();
        Assert.Equal(1, await verify.Notifications.CountAsync(n =>
            n.UserId == seed.Guest && n.Type == NotificationType.RenewalDue));
    }

    [Fact]
    public async Task StaleNoShowReport_CannotChangeWhoWasReported()
    {
        var seed = await SeedAsync(hoursUntilStart: -3);
        await using var staleDb = Context();
        var occurrenceId = await staleDb.BookingOccurrences.Where(o => o.BookingId == seed.Booking)
            .Select(o => o.Id).SingleAsync();
        _ = await new EfBookingRepository(staleDb).GetOccurrenceAsync(occurrenceId);
        await using (var firstDb = Context())
        {
            Assert.Null((await Bookings(firstDb).MarkNoShowAsync(occurrenceId, seed.Host)).Error);
        }

        var stale = await Bookings(staleDb).MarkNoShowAsync(occurrenceId, seed.Guest);
        Assert.Equal(BookingErrorCodes.InvalidState, stale.Error?.Code);
        await using var verify = Context();
        Assert.Equal(seed.Host, (await verify.BookingOccurrences.SingleAsync(o => o.Id == occurrenceId)).NoShowMarkedBy);
    }

    [Fact]
    public async Task MissedConfirmationCharge_IsDrivenByTheActualSweep()
    {
        var seed = await SeedAsync();
        await using var db = Context();
        var payments = Payments(db);
        await payments.SweepAsync(Now);
        var payment = Assert.Single(await db.Payments.Where(p => p.BookingId == seed.Booking).ToListAsync());
        Assert.Equal(PaymentStatus.Succeeded, payment.Status);
    }

    [Fact]
    public async Task LateGuestCancellation_StillCollectsTheStandingSession()
    {
        var seed = await SeedAsync(hoursUntilStart: 30);
        await using (var cancelDb = Context())
        {
            Assert.Null((await Bookings(cancelDb).CancelAsync(seed.Booking, seed.Guest,
                new CancelBookingRequest(null))).Error);
        }
        await using var db = Context();
        Assert.Equal(OccurrenceStatus.Scheduled,
            (await db.BookingOccurrences.SingleAsync(o => o.BookingId == seed.Booking)).Status);
        await Payments(db).SweepAsync(Now);
        var payment = Assert.Single(await db.Payments.Where(p => p.BookingId == seed.Booking).ToListAsync());
        Assert.Equal(PaymentStatus.Succeeded, payment.Status);
    }

    [Fact]
    public async Task FailedChargeNotificationFailure_LeavesRecoverablePendingClaim()
    {
        var seed = await SeedAsync(last4: "0002");
        await using (var db = Context())
        {
            await Assert.ThrowsAsync<IOException>(() => Payments(db, failNotification: true)
                .ChargeAtConfirmationAsync(seed.Booking));
        }
        await using (var verify = Context())
        {
            var payment = Assert.Single(await verify.Payments.Where(p => p.BookingId == seed.Booking).ToListAsync());
            Assert.Equal(PaymentStatus.Pending, payment.Status);
            Assert.False(await verify.Notifications.AnyAsync(n => n.UserId == seed.Guest));
        }
        await using (var retry = Context())
        {
            await Payments(retry).SweepAsync(Now.AddHours(1));
            Assert.Equal(1, await retry.Notifications.CountAsync(n =>
                n.UserId == seed.Guest && n.Type == NotificationType.PaymentFailed));
        }
    }

    [Fact]
    public async Task RefundNotificationFailure_LeavesRecoverableRefundAndOneNotice()
    {
        var seed = await SeedAsync();
        await using (var db = Context())
        {
            await Payments(db).ChargeAtConfirmationAsync(seed.Booking);
            var occurrence = await db.BookingOccurrences.SingleAsync(o => o.BookingId == seed.Booking);
            occurrence.Status = OccurrenceStatus.Cancelled;
            await db.SaveChangesAsync();
        }
        await using (var db = Context())
        {
            await Assert.ThrowsAsync<IOException>(() => Payments(db, failNotification: true)
                .RefundCancelledForBookingAsync(seed.Booking));
        }
        await using (var verify = Context())
        {
            var payment = Assert.Single(await verify.Payments.Where(p => p.BookingId == seed.Booking).ToListAsync());
            Assert.Equal(PaymentStatus.Succeeded, payment.Status);
            Assert.False(await verify.Notifications.AnyAsync(n => n.UserId == seed.Guest));
        }
        await using (var retry = Context())
        {
            await Payments(retry).RefundCancelledForBookingAsync(seed.Booking);
            Assert.Equal(1, await retry.Notifications.CountAsync(n =>
                n.UserId == seed.Guest && n.Type == NotificationType.OccurrenceRefunded));
        }
    }

    [Fact]
    public async Task ReminderFailure_RollsBackTheClaimAndPartialNotices()
    {
        var seed = await SeedAsync(recurring: true);
        await using (var db = Context())
        {
            var reminder = new BookingReminderService(new EfBookingReminderRepository(db),
                new EfVenueManagerRepository(db), Notifications(db, fail: true), new NullAnalytics(),
                new FixedClock(), Options.Create(new ReminderOptions()),
                NullLogger<BookingReminderService>.Instance,
                new EfServiceTransaction(db, NullLogger<EfServiceTransaction>.Instance));
            Assert.Equal(0, await reminder.RunOnceAsync());
        }
        await using var verify = Context();
        Assert.False(await verify.Notifications.AnyAsync(n => n.UserId == seed.Guest));
        Assert.False(await verify.BookingReminders.AnyAsync(r => r.Occurrence!.BookingId == seed.Booking));
    }

    [Fact]
    public async Task ConcurrentRefundWinner_DoesNotDetachLaterRefund()
    {
        var seed = await SeedAsync();
        Guid firstId;
        await using (var seedDb = Context())
        {
            await Payments(seedDb).ChargeAtConfirmationAsync(seed.Booking);
            var booking = await seedDb.Bookings.Include(b => b.Occurrences).SingleAsync(b => b.Id == seed.Booking);
            var first = booking.Occurrences.Single();
            first.Status = OccurrenceStatus.Cancelled;
            var second = new BookingOccurrence {
                Id = Guid.NewGuid(), BookingId = booking.Id, RoomId = booking.RoomId,
                StartUtc = first.StartUtc.AddDays(7), EndUtc = first.EndUtc.AddDays(7),
                LocalDate = first.LocalDate.AddDays(7), Status = OccurrenceStatus.Cancelled,
            };
            seedDb.BookingOccurrences.Add(second);
            seedDb.Payments.Add(new Payment {
                Id = Guid.NewGuid(), BookingId = booking.Id, OccurrenceId = second.Id,
                Status = PaymentStatus.Succeeded, ProviderPaymentId = "second-refund", Amount = 80,
                Currency = "USD", CreatedAtUtc = Now, UpdatedAtUtc = Now,
            });
            await seedDb.SaveChangesAsync();
        }
        await using (var loserDb = Context())
        {
            var repo = new EfPaymentRepository(loserDb);
            firstId = (await repo.GetRefundableAsync(seed.Booking))[0].Id;
            var gateway = new ConcurrentRefundGateway(async () => {
                await using var winnerDb = Context();
                var winner = await winnerDb.Payments.SingleAsync(p => p.Id == firstId);
                winner.Status = PaymentStatus.Refunded;
                winner.RefundedAtUtc = Now;
                await winnerDb.SaveChangesAsync();
            });
            var service = new PaymentService(repo, gateway, Notifications(loserDb), new NullAnalytics(),
                new TestFeatureFlags(PaymentService.PaymentsFlag), new FixedClock(), PaymentTestOptions.Payments(),
                new EfServiceTransaction(loserDb, NullLogger<EfServiceTransaction>.Instance));
            await service.RefundCancelledForBookingAsync(seed.Booking);
        }
        await using var verify = Context();
        Assert.All(await verify.Payments.Where(p => p.BookingId == seed.Booking).ToListAsync(),
            payment => Assert.Equal(PaymentStatus.Refunded, payment.Status));
    }

    [Fact]
    public async Task StalePendingRetry_DoesNotRepeatFirstFailureNotice()
    {
        var seed = await SeedAsync(last4: "0002");
        await using (var db = Context())
        {
            await Payments(db).ChargeAtConfirmationAsync(seed.Booking);
            var occurrence = await db.BookingOccurrences.SingleAsync(o => o.BookingId == seed.Booking);
            db.Payments.Add(new Payment {
                Id = Guid.NewGuid(), BookingId = seed.Booking, OccurrenceId = occurrence.Id,
                Status = PaymentStatus.Pending, Amount = 80, Currency = "USD",
                CreatedAtUtc = Now.AddHours(-1), UpdatedAtUtc = Now.AddHours(-1),
            });
            await db.SaveChangesAsync();
        }
        await using (var retryDb = Context()) await Payments(retryDb).SweepAsync(Now);
        await using var verify = Context();
        Assert.Equal(1, await verify.Notifications.CountAsync(n =>
            n.UserId == seed.Guest && n.Type == NotificationType.PaymentFailed));
    }

    private sealed class ConcurrentRefundGateway(Func<Task> firstRefund) : IPaymentGateway
    {
        private readonly MockPaymentGateway inner = new();
        private bool first = true;
        public Task<string> EnsureCustomerAsync(Guid id, string? email, string? existing, CancellationToken ct = default)
            => inner.EnsureCustomerAsync(id, email, existing, ct);
        public Task<string> CreateSetupIntentAsync(string customer, CancellationToken ct = default)
            => inner.CreateSetupIntentAsync(customer, ct);
        public Task<GatewayChargeResult> ChargeOccurrenceAsync(ChargeOccurrenceRequest request, CancellationToken ct = default)
            => inner.ChargeOccurrenceAsync(request, ct);
        public Task<string> CreateConnectedAccountAsync(Guid id, string? existing, CancellationToken ct = default)
            => inner.CreateConnectedAccountAsync(id, existing, ct);
        public Task<string> CreateAccountLinkAsync(string id, CancellationToken ct = default)
            => inner.CreateAccountLinkAsync(id, ct);
        public async Task<GatewayRefundResult> RefundAsync(string provider, CancellationToken ct = default)
        {
            if (first) { first = false; await firstRefund(); }
            return new GatewayRefundResult(true, null);
        }
    }

    private BookingService Bookings(SteepleDbContext db) => new(
        new EfBookingRepository(db), new EfVenueManagerRepository(db), new NullRatings(),
        new NullPaymentService(), new TestFeatureFlags(), Notifications(db), new NullAnalytics(),
        new FixedClock(), PaymentTestOptions.Payments(),
        new EfServiceTransaction(db, NullLogger<EfServiceTransaction>.Instance));

    private PaymentService Payments(SteepleDbContext db, bool failNotification = false) => new(
        new EfPaymentRepository(db), new MockPaymentGateway(), Notifications(db, failNotification),
        new NullAnalytics(), new TestFeatureFlags(PaymentService.PaymentsFlag), new FixedClock(),
        PaymentTestOptions.Payments(),
        new EfServiceTransaction(db, NullLogger<EfServiceTransaction>.Instance));

    private INotificationDispatcher Notifications(SteepleDbContext db, bool fail = false)
    {
        var dispatcher = new NotificationDispatcher(new EfNotificationRepository(db), new NullAnalytics(),
            new FixedClock(), Options.Create(new EmailOptions()),
            new EfServiceTransaction(db, NullLogger<EfServiceTransaction>.Instance));
        return fail ? new FailingDispatcher(dispatcher) : dispatcher;
    }

    private async Task<(Guid Booking, Guid Guest, Guid Host)> SeedAsync(
        bool recurring = false, string last4 = "4242", int? hoursUntilStart = null)
    {
        await using var db = Context();
        var guest = new User
        {
            Id = Guid.NewGuid(), DisplayName = "Recovery Guest", Email = $"{Guid.NewGuid():N}@example.com",
            CreatedAtUtc = Now, PaymentCustomerId = $"cus_{Guid.NewGuid():N}", PaymentMethodLast4 = last4,
            PaymentMethodSetAtUtc = Now,
        };
        var host = new User { Id = Guid.NewGuid(), DisplayName = "Recovery Host", CreatedAtUtc = Now };
        var venue = new Venue
        {
            Id = Guid.NewGuid(), Name = "Recovery Venue", Slug = $"recovery-{Guid.NewGuid():N}",
            AddressLine = "Test", Suburb = "Test", Postcode = "00000", Timezone = "UTC",
            CreatedAtUtc = Now, UpdatedAtUtc = Now,
        };
        var room = new Room
        {
            Id = Guid.NewGuid(), Venue = venue, Name = "Hall", Slug = "hall", Capacity = 30,
            PricePerHour = 40, Status = RoomStatus.Draft, CreatedAtUtc = Now, UpdatedAtUtc = Now,
        };
        var start = Now.AddHours(hoursUntilStart ?? (recurring ? 48 : 2160));
        var date = DateOnly.FromDateTime(start.UtcDateTime);
        var application = new Application
        {
            Id = Guid.NewGuid(), Room = room, Organizer = guest, ActivityType = ActivityType.Community,
            GroupSize = 10, Frequency = ScheduleFrequency.OneOff, StartDate = date,
            StartTime = new TimeOnly(12, 0), EndTime = new TimeOnly(14, 0),
            Status = ApplicationStatus.Approved, CreatedAtUtc = Now, ExpiresAtUtc = Now.AddDays(14),
        };
        var booking = new Booking
        {
            Id = Guid.NewGuid(), Application = application, Room = room, Organizer = guest,
            Type = recurring ? BookingType.Recurring : BookingType.OneOff, StartDate = date, EndDate = date,
            StartTime = application.StartTime, EndTime = application.EndTime, Status = BookingStatus.Confirmed,
            PricePerOccurrence = 80, Currency = "USD", InAppPayment = true, CreatedAtUtc = Now,
        };
        booking.Occurrences.Add(new BookingOccurrence
        {
            Id = Guid.NewGuid(), RoomId = room.Id, StartUtc = start, EndUtc = start.AddHours(2),
            LocalDate = date, Status = OccurrenceStatus.Scheduled,
        });
        db.Bookings.Add(booking);
        db.VenueManagers.Add(new VenueManager { Id = Guid.NewGuid(), Venue = venue, User = host, CreatedAtUtc = Now });
        await db.SaveChangesAsync();
        return (booking.Id, guest.Id, host.Id);
    }

    private sealed class FixedClock : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private sealed class FailingDispatcher(INotificationDispatcher inner) : INotificationDispatcher
    {
        public async Task NotifyAsync(IReadOnlyList<NotificationRecipient> recipients, NotificationType type,
            object payload, EmailContent? email, CancellationToken ct = default)
        {
            await inner.NotifyAsync(recipients, type, payload, email, ct);
            throw new IOException("Injected notification persistence failure.");
        }
    }
}
