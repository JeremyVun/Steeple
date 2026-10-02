using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Steeple.Integration.Tests.Fixtures;

namespace Steeple.Integration.Tests.Proxies;

[Collection(PostgresCollection.Name)]
public sealed class AtomicBookingNotificationsTests(PostgresDatabaseFixture fixture)
{
    private static readonly DateTimeOffset Now = new(2026, 7, 4, 12, 0, 0, TimeSpan.Zero);

    private SteepleDbContext Context() => new(new DbContextOptionsBuilder<SteepleDbContext>()
        .UseNpgsql(fixture.ConnectionString).Options);

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Submission_NotificationFailure_RollsBackAndCanRetrySameKey(bool instant)
    {
        var seed = await SeedAsync(instant);
        var key = Guid.NewGuid();
        int outboxBefore;
        await using (var db = Context())
        {
            outboxBefore = await db.NotificationOutbox.CountAsync();
            var (apps, _, payments) = Services(db, failNotification: true);
            await Assert.ThrowsAsync<IOException>(() => apps.SubmitAsync(seed.Room, seed.Guest, Request(), key, null));
            Assert.Empty(payments.ChargeKicks);
            Assert.Empty(db.ChangeTracker.Entries());
        }
        await using (var db = Context())
        {
            Assert.False(await db.Applications.AnyAsync(a => a.RoomId == seed.Room));
            Assert.False(await db.Bookings.AnyAsync(b => b.RoomId == seed.Room));
            Assert.False(await db.Notifications.AnyAsync(n => n.UserId == seed.Guest || n.UserId == seed.Host));
            Assert.Equal(outboxBefore, await db.NotificationOutbox.CountAsync());
            var (apps, _, payments) = Services(db);
            var first = await apps.SubmitAsync(seed.Room, seed.Guest, Request(), key, null);
            var replay = await apps.SubmitAsync(seed.Room, seed.Guest, Request(), key, null);
            Assert.Null(first.Error);
            Assert.Equal(first.Value!.Application.Id, replay.Value!.Application.Id);
            Assert.False(replay.Value.Created);
            Assert.Equal(instant ? 1 : 0, payments.ChargeKicks.Count);
            Assert.Equal(1, await db.Applications.CountAsync(a => a.RoomId == seed.Room));
        }
    }

    [Theory]
    [InlineData("approve")]
    [InlineData("message")]
    [InlineData("counter")]
    [InlineData("accept")]
    public async Task Transition_NotificationFailure_RestoresOriginalState(string action)
    {
        var seed = await SeedAsync(false);
        Guid applicationId;
        await using (var db = Context())
        {
            var (apps, _, _) = Services(db);
            var created = await apps.SubmitAsync(seed.Room, seed.Guest, Request(), null, null);
            applicationId = created.Value!.Application.Id;
            if (action == "accept")
            {
                var counter = await apps.CounterOfferAsync(applicationId, seed.Host,
                    new CounterOfferRequest(Request().Schedule, "Try this time."));
                Assert.Null(counter.Error);
            }
        }
        await using (var db = Context())
        {
            var (apps, _, payments) = Services(db, failNotification: true);
            await Assert.ThrowsAsync<IOException>(async () =>
            {
                _ = action switch
                {
                    "approve" => await apps.DecideAsync(applicationId, seed.Host, new ApplicationDecisionRequest("approve", null)),
                    "message" => await apps.AddMessageAsync(applicationId, seed.Host, new ApplicationMessageRequest("Please explain.")),
                    "counter" => await apps.CounterOfferAsync(applicationId, seed.Host, new CounterOfferRequest(Request().Schedule, null)),
                    _ => await apps.RespondToCounterOfferAsync(applicationId, seed.Guest, new CounterOfferResponseRequest("accept")),
                };
            });
            Assert.Empty(payments.ChargeKicks);
        }
        await using (var db = Context())
        {
            var app = await db.Applications.Include(a => a.Messages).Include(a => a.CounterOffers)
                .SingleAsync(a => a.Id == applicationId);
            Assert.Equal(action == "accept" ? ApplicationStatus.CounterOffered : ApplicationStatus.Pending, app.Status);
            Assert.Null(app.DecidedAtUtc);
            Assert.Empty(app.Messages);
            Assert.False(await db.Bookings.AnyAsync(b => b.ApplicationId == applicationId));
            if (action == "accept") Assert.Equal(CounterOfferStatus.Open, Assert.Single(app.CounterOffers).Status);
            else Assert.Empty(app.CounterOffers);
        }
    }

    [Fact]
    public async Task Cancellation_NotificationFailure_RestoresBookingAndDoesNotRefund()
    {
        var seed = await SeedAsync(true);
        Guid bookingId;
        await using (var db = Context())
        {
            var (apps, _, _) = Services(db);
            var created = await apps.SubmitAsync(seed.Room, seed.Guest, Request(), null, null);
            bookingId = created.Value!.Application.BookingId!.Value;
        }
        await using (var db = Context())
        {
            var (_, bookings, payments) = Services(db, failNotification: true);
            await Assert.ThrowsAsync<IOException>(() => bookings.CancelAsync(bookingId, seed.Guest, new CancelBookingRequest(null)));
            Assert.Empty(payments.RefundKicks);
        }
        await using (var db = Context())
        {
            var booking = await db.Bookings.Include(b => b.Occurrences).SingleAsync(b => b.Id == bookingId);
            Assert.Equal(BookingStatus.Confirmed, booking.Status);
            Assert.All(booking.Occurrences, o => Assert.Equal(OccurrenceStatus.Scheduled, o.Status));
            var (_, bookings, payments) = Services(db);
            Assert.Null((await bookings.CancelAsync(bookingId, seed.Guest, new CancelBookingRequest(null))).Error);
            Assert.Single(payments.RefundKicks);
        }
    }

    [Fact]
    public async Task RenewalNotificationFailure_DoesNotLoseTheNudge()
    {
        var seed = await SeedAsync(true);
        Guid bookingId;
        await using (var db = Context())
        {
            var (apps, _, _) = Services(db);
            var request = Request() with { Schedule = new ScheduleDto("recurringWeekly",
                new DateOnly(2026, 7, 5), new DateOnly(2026, 7, 12), ["sunday"], "10:00", "12:00") };
            var created = await apps.SubmitAsync(seed.Room, seed.Guest, request, null, null);
            bookingId = created.Value!.Application.BookingId!.Value;
        }
        await using (var db = Context())
        {
            var (_, bookings, _) = Services(db, failNotification: true);
            await Assert.ThrowsAsync<IOException>(() => bookings.GetAsync(bookingId, seed.Guest));
        }
        await using (var db = Context())
        {
            Assert.Null((await db.Bookings.SingleAsync(b => b.Id == bookingId)).RenewalNudgeSentAtUtc);
            var (_, bookings, _) = Services(db);
            Assert.Null((await bookings.GetAsync(bookingId, seed.Guest)).Error);
            Assert.NotNull((await db.Bookings.SingleAsync(b => b.Id == bookingId)).RenewalNudgeSentAtUtc);
            Assert.Equal(1, await db.Notifications.CountAsync(n => n.UserId == seed.Guest && n.Type == NotificationType.RenewalDue));
        }
    }

    [Fact]
    public async Task MissedFirstCharge_IsRecoverableBeforeTheNormalChargeWindow()
    {
        var seed = await SeedAsync(true);
        await using var db = Context();
        var (apps, _, _) = Services(db);
        var request = Request() with { Schedule = new ScheduleDto("recurringWeekly",
            new DateOnly(2027, 1, 12), new DateOnly(2027, 1, 26), ["tuesday"], "10:00", "12:00") };
        var created = await apps.SubmitAsync(seed.Room, seed.Guest, request, null, null);
        Assert.Null(created.Error);
        var bookingId = created.Value!.Application.BookingId!.Value;
        var occurrences = await db.BookingOccurrences.Where(o => o.BookingId == bookingId).OrderBy(o => o.StartUtc).ToListAsync();
        Assert.Equal(3, occurrences.Count);
        var candidates = await new EfPaymentRepository(db).GetChargeCandidatesAsync(Now, Now.AddHours(48));
        var first = Assert.Single(candidates, c => c.Occurrence.BookingId == bookingId);
        Assert.Equal(occurrences[0].Id, first.Occurrence.Id);
    }

    [Fact]
    public async Task Transaction_NestedCallbacks_RunOnlyAfterCommitAndDispose()
    {
        await using var db = Context();
        var transaction = new EfServiceTransaction(db, NullLogger<EfServiceTransaction>.Instance);
        var ran = false;
        await transaction.RunAsync(async () =>
        {
            await new EfServiceTransaction(db, NullLogger<EfServiceTransaction>.Instance).RunAsync(async () =>
            {
                await transaction.AfterCommitAsync(() =>
                {
                    Assert.Null(db.Database.CurrentTransaction);
                    ran = true;
                    return Task.CompletedTask;
                });
                Assert.False(ran);
            });
            Assert.False(ran);
        });
        Assert.True(ran);
    }

    private (ApplicationService, BookingService, NullPaymentService) Services(SteepleDbContext db, bool failNotification = false)
    {
        var transaction = new EfServiceTransaction(db, NullLogger<EfServiceTransaction>.Instance);
        var clock = new FixedClock();
        var analytics = new NullAnalytics();
        var dispatcher = new NotificationDispatcher(new EfNotificationRepository(db), analytics, clock,
            Options.Create(new EmailOptions()), transaction);
        INotificationDispatcher notifications = failNotification ? new FailingDispatcher(dispatcher) : dispatcher;
        var managers = new EfVenueManagerRepository(db);
        var payments = new NullPaymentService { BeforeKick = () => Assert.Null(db.Database.CurrentTransaction) };
        var flags = new TestFeatureFlags(FeatureFlagKeys.BookingCounterOffers, PaymentService.PaymentsFlag);
        var ratings = new NullRatings();
        var bookings = new BookingService(new EfBookingRepository(db), managers, ratings, payments, flags,
            notifications, analytics, clock, PaymentTestOptions.Payments(), transaction);
        var applications = new ApplicationService(new EfApplicationRepository(db), managers, bookings, ratings,
            new AvailabilityService(new EfAvailabilityRepository(db), managers, analytics, clock), payments,
            flags, notifications, new PassTurnstile(), analytics, clock, transaction);
        return (applications, bookings, payments);
    }

    private async Task<(Guid Room, Guid Guest, Guid Host)> SeedAsync(bool instant)
    {
        await using var db = Context();
        var guest = new User { Id = Guid.NewGuid(), DisplayName = "Guest", Email = $"{Guid.NewGuid():N}@example.com", CreatedAtUtc = Now };
        var host = new User { Id = Guid.NewGuid(), DisplayName = "Host", Email = $"{Guid.NewGuid():N}@example.com", CreatedAtUtc = Now };
        var venue = new Venue
        {
            Id = Guid.NewGuid(), Name = "Atomic Test Venue", Slug = $"atomic-{Guid.NewGuid():N}",
            AddressLine = "Test", Suburb = "Test", Postcode = "00000", Timezone = "America/New_York",
            BookingMode = instant ? BookingMode.Instant : BookingMode.Manual, CreatedAtUtc = Now, UpdatedAtUtc = Now,
        };
        var room = new Room
        {
            Id = Guid.NewGuid(), Venue = venue, Name = "Hall", Slug = "hall", Capacity = 30,
            PricePerHour = 40, Status = RoomStatus.Published, CreatedAtUtc = Now, UpdatedAtUtc = Now,
        };
        db.Users.AddRange(guest, host);
        db.Rooms.Add(room);
        db.VenueManagers.Add(new VenueManager { Id = Guid.NewGuid(), Venue = venue, User = host, CreatedAtUtc = Now });
        await db.SaveChangesAsync();
        return (room.Id, guest.Id, host.Id);
    }

    private static SubmitApplicationRequest Request() => new("community", 10,
        new ScheduleDto("oneOff", new DateOnly(2027, 1, 12), null, null, "10:00", "12:00"), "Weekly gathering", null,
        Quote: new ApplicationQuoteDto(40m, "USD", ""));

    private sealed class FixedClock : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private sealed class PassTurnstile : ITurnstileVerifier
    {
        public Task<bool> VerifyAsync(string? token, string? remoteIp, CancellationToken ct = default) => Task.FromResult(true);
    }

    private sealed class FailingDispatcher(INotificationDispatcher inner) : INotificationDispatcher
    {
        public async Task NotifyAsync(IReadOnlyList<NotificationRecipient> recipients, NotificationType type,
            object payload, EmailContent? email, CancellationToken ct = default)
        {
            await inner.NotifyAsync(recipients, type, payload, email, ct);
            throw new IOException("Injected failure after notification persistence.");
        }
    }
}
