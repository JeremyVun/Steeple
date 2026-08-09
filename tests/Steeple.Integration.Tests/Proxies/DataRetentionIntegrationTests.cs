using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Steeple.Integration.Tests.Fixtures;

namespace Steeple.Integration.Tests.Proxies;

/// <summary>Retention-policy proofs against the Liquibase-owned PostgreSQL schema.</summary>
[Collection(PostgresCollection.Name)]
public sealed class DataRetentionIntegrationTests
{
    private static readonly DateTimeOffset FixedNow = new(2000, 1, 1, 0, 0, 0, TimeSpan.Zero);
    private static readonly Guid RoomId = Guid.Parse("10000000-0000-0000-0000-000000000001");
    private static readonly Guid VenueId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    private readonly PostgresDatabaseFixture _fixture;

    public DataRetentionIntegrationTests(PostgresDatabaseFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task OperationalClasses_OverAgeRowsSweepAndUnderAgeRowsSurvive()
    {
        var user = NewUser();
        var oldRevoked = NewRefreshToken(user.Id, FixedNow.AddDays(-100), FixedNow.AddDays(30));
        oldRevoked.RevokedAtUtc = FixedNow.AddDays(-31);
        var oldExpired = NewRefreshToken(user.Id, FixedNow.AddDays(-100), FixedNow.AddDays(-31));
        var recentRevoked = NewRefreshToken(user.Id, FixedNow.AddDays(-20), FixedNow.AddDays(30));
        recentRevoked.RevokedAtUtc = FixedNow.AddDays(-29);
        var recentExpired = NewRefreshToken(user.Id, FixedNow.AddDays(-40), FixedNow.AddDays(-29));

        var oldNotification = NewNotification(user.Id, FixedNow.AddDays(-366));
        var recentNotification = NewNotification(user.Id, FixedNow.AddDays(-364));

        var oldLedger = NewIdempotencyRecord(user.Id, FixedNow.AddDays(-31));
        var recentLedger = NewIdempotencyRecord(user.Id, FixedNow.AddDays(-29));
        var oldApplicationKey = NewApplication(user.Id, ApplicationStatus.Pending, FixedNow.AddDays(-31));
        oldApplicationKey.IdempotencyKey = Guid.NewGuid();
        var recentApplicationKey = NewApplication(user.Id, ApplicationStatus.Pending, FixedNow.AddDays(-29));
        recentApplicationKey.IdempotencyKey = Guid.NewGuid();

        var oldDelivered = NewOutbox(FixedNow.AddDays(-31));
        oldDelivered.DeliveredAtUtc = FixedNow.AddDays(-31);
        var oldFailed = NewOutbox(FixedNow.AddDays(-31));
        oldFailed.FailedAtUtc = FixedNow.AddDays(-31);
        var recentTerminal = NewOutbox(FixedNow.AddDays(-29));
        recentTerminal.DeliveredAtUtc = FixedNow.AddDays(-29);
        var unfinished = NewOutbox(FixedNow.AddYears(-2));

        await using (var db = CreateContext())
        {
            db.Users.Add(user);
            db.RefreshTokens.AddRange(oldRevoked, oldExpired, recentRevoked, recentExpired);
            db.Notifications.AddRange(oldNotification, recentNotification);
            db.IdempotencyRecords.AddRange(oldLedger, recentLedger);
            db.Applications.AddRange(oldApplicationKey, recentApplicationKey);
            db.NotificationOutbox.AddRange(oldDelivered, oldFailed, recentTerminal, unfinished);
            await db.SaveChangesAsync();
        }

        var result = await RunWorkerAsync(new DataRetentionOptions { BatchSize = 20 });

        Assert.Equal(2, result.RefreshTokens);
        Assert.Equal(1, result.Notifications);
        Assert.Equal(2, result.IdempotencyRecords);
        Assert.Equal(2, result.NotificationOutbox);

        await using var verify = CreateContext();
        Assert.False(await verify.RefreshTokens.AnyAsync(row => row.Id == oldRevoked.Id));
        Assert.False(await verify.RefreshTokens.AnyAsync(row => row.Id == oldExpired.Id));
        Assert.True(await verify.RefreshTokens.AnyAsync(row => row.Id == recentRevoked.Id));
        Assert.True(await verify.RefreshTokens.AnyAsync(row => row.Id == recentExpired.Id));
        Assert.False(await verify.Notifications.AnyAsync(row => row.Id == oldNotification.Id));
        Assert.True(await verify.Notifications.AnyAsync(row => row.Id == recentNotification.Id));
        Assert.False(await verify.IdempotencyRecords.AnyAsync(row => row.Key == oldLedger.Key));
        Assert.True(await verify.IdempotencyRecords.AnyAsync(row => row.Key == recentLedger.Key));
        Assert.Null((await verify.Applications.SingleAsync(row => row.Id == oldApplicationKey.Id)).IdempotencyKey);
        Assert.NotNull((await verify.Applications.SingleAsync(row => row.Id == recentApplicationKey.Id)).IdempotencyKey);
        Assert.False(await verify.NotificationOutbox.AnyAsync(row => row.Id == oldDelivered.Id));
        Assert.False(await verify.NotificationOutbox.AnyAsync(row => row.Id == oldFailed.Id));
        Assert.True(await verify.NotificationOutbox.AnyAsync(row => row.Id == recentTerminal.Id));
        Assert.True(await verify.NotificationOutbox.AnyAsync(row => row.Id == unfinished.Id));
    }

    [Fact]
    public async Task Correspondence_SweepsOnlyAfterClosureAndPreservesFinancialHistory()
    {
        var user = NewUser();
        var oldClosure = FixedNow.AddYears(-3);
        var recentClosure = FixedNow.AddYears(-1);

        var declined = NewApplication(user.Id, ApplicationStatus.Declined, FixedNow.AddYears(-4));
        declined.DecidedAtUtc = oldClosure;
        declined.OrganizationName = "Private group";
        var declinedMessage = NewMessage(declined.Id, user.Id, FixedNow.AddYears(-4));
        var counter = NewCounter(declined.Id, user.Id, FixedNow.AddYears(-4));

        var cancelledApplication = NewApplication(user.Id, ApplicationStatus.Approved, FixedNow.AddYears(-4));
        cancelledApplication.DecidedAtUtc = FixedNow.AddYears(-4);
        var cancelledMessage = NewMessage(cancelledApplication.Id, user.Id, FixedNow.AddYears(-4));
        var cancelledBooking = NewBooking(cancelledApplication.Id, user.Id, BookingStatus.Cancelled, oldClosure);
        cancelledBooking.CancelReason = "A private cancellation reason";
        var cancelledOccurrence = NewOccurrence(cancelledBooking.Id, FixedNow.AddYears(-3).AddDays(-1), OccurrenceStatus.Cancelled);
        var payment = new Payment
        {
            Id = Guid.NewGuid(),
            OccurrenceId = cancelledOccurrence.Id,
            BookingId = cancelledBooking.Id,
            Amount = 75m,
            Currency = "USD",
            ApplicationFee = 5m,
            ProviderPaymentId = $"pi_{Guid.NewGuid():N}",
            Status = PaymentStatus.Refunded,
            CreatedAtUtc = FixedNow.AddYears(-3),
            UpdatedAtUtc = oldClosure,
            RefundedAtUtc = oldClosure,
        };
        var rating = new Rating
        {
            Id = Guid.NewGuid(),
            BookingId = cancelledBooking.Id,
            RaterId = user.Id,
            RateeType = RatingRateeType.Venue,
            Stars = 5,
            Comment = "Public review history",
            CreatedAtUtc = oldClosure,
            VenueId = VenueId,
            OrganizerId = user.Id,
        };

        var completedApplication = NewApplication(user.Id, ApplicationStatus.Approved, FixedNow.AddYears(-4));
        completedApplication.DecidedAtUtc = FixedNow.AddYears(-4);
        var completedMessage = NewMessage(completedApplication.Id, user.Id, FixedNow.AddYears(-4));
        var effectivelyCompletedBooking = NewBooking(
            completedApplication.Id,
            user.Id,
            BookingStatus.Confirmed,
            cancelledAt: null);
        var completedOccurrence = NewOccurrence(
            effectivelyCompletedBooking.Id,
            FixedNow.AddYears(-3),
            OccurrenceStatus.Occurred);

        var recent = NewApplication(user.Id, ApplicationStatus.Declined, FixedNow.AddYears(-4));
        recent.DecidedAtUtc = recentClosure;
        recent.OrganizationName = "Still retained";
        var recentMessage = NewMessage(recent.Id, user.Id, FixedNow.AddYears(-4));

        await using (var db = CreateContext())
        {
            db.Users.Add(user);
            db.Applications.AddRange(declined, cancelledApplication, completedApplication, recent);
            db.ApplicationMessages.AddRange(declinedMessage, cancelledMessage, completedMessage, recentMessage);
            db.ApplicationCounterOffers.Add(counter);
            db.Bookings.AddRange(cancelledBooking, effectivelyCompletedBooking);
            db.BookingOccurrences.AddRange(cancelledOccurrence, completedOccurrence);
            db.Payments.Add(payment);
            db.Ratings.Add(rating);
            await db.SaveChangesAsync();
        }

        var result = await RunWorkerAsync(new DataRetentionOptions { BatchSize = 50 });
        Assert.Equal(8, result.Correspondence);

        await using var verify = CreateContext();
        Assert.False(await verify.ApplicationMessages.AnyAsync(row => row.Id == declinedMessage.Id));
        Assert.False(await verify.ApplicationMessages.AnyAsync(row => row.Id == cancelledMessage.Id));
        Assert.False(await verify.ApplicationMessages.AnyAsync(row => row.Id == completedMessage.Id));
        Assert.True(await verify.ApplicationMessages.AnyAsync(row => row.Id == recentMessage.Id));

        var redacted = await verify.Applications.SingleAsync(row => row.Id == declined.Id);
        Assert.Equal("", redacted.IntentText);
        Assert.Null(redacted.OrganizationName);
        var retained = await verify.Applications.SingleAsync(row => row.Id == recent.Id);
        Assert.Equal("Private application intent", retained.IntentText);
        Assert.Equal("Still retained", retained.OrganizationName);
        Assert.Null((await verify.ApplicationCounterOffers.SingleAsync(row => row.Id == counter.Id)).Message);
        Assert.Null((await verify.Bookings.SingleAsync(row => row.Id == cancelledBooking.Id)).CancelReason);

        Assert.True(await verify.Applications.AnyAsync(row => row.Id == cancelledApplication.Id));
        Assert.True(await verify.Bookings.AnyAsync(row => row.Id == cancelledBooking.Id));
        Assert.True(await verify.BookingOccurrences.AnyAsync(row => row.Id == cancelledOccurrence.Id));
        Assert.True(await verify.Payments.AnyAsync(row => row.Id == payment.Id));
        Assert.True(await verify.Ratings.AnyAsync(row => row.Id == rating.Id));
    }

    [Fact]
    public async Task Correspondence_ClosesAbandonedApplicationsOnTheirExpiryDeadline()
    {
        var user = NewUser();
        var longAgo = FixedNow.AddYears(-4);

        // Nobody opened these again, so no read path's lazy sweep ever persisted `expired` — but
        // their deadline closed the correspondence all the same.
        var abandoned = NewApplication(user.Id, ApplicationStatus.Pending, longAgo);
        abandoned.OrganizationName = "Abandoned group";
        var abandonedMessage = NewMessage(abandoned.Id, user.Id, longAgo);
        var abandonedCounter = NewCounter(abandoned.Id, user.Id, longAgo);

        var lapsedCounter = NewApplication(user.Id, ApplicationStatus.CounterOffered, longAgo);
        var lapsedCounterMessage = NewMessage(lapsedCounter.Id, user.Id, longAgo);

        // Past its deadline too, but that deadline is younger than the two-year cutoff.
        var recentlyLapsed = NewApplication(user.Id, ApplicationStatus.Pending, longAgo);
        recentlyLapsed.ExpiresAtUtc = FixedNow.AddYears(-1);
        recentlyLapsed.OrganizationName = "Still retained";
        var recentlyLapsedMessage = NewMessage(recentlyLapsed.Id, user.Id, longAgo);

        await using (var db = CreateContext())
        {
            db.Users.Add(user);
            db.Applications.AddRange(abandoned, lapsedCounter, recentlyLapsed);
            db.ApplicationMessages.AddRange(abandonedMessage, lapsedCounterMessage, recentlyLapsedMessage);
            db.ApplicationCounterOffers.Add(abandonedCounter);
            await db.SaveChangesAsync();
        }

        await RunWorkerAsync(new DataRetentionOptions { BatchSize = 50 });

        await using var verify = CreateContext();
        Assert.False(await verify.ApplicationMessages.AnyAsync(row => row.Id == abandonedMessage.Id));
        Assert.False(await verify.ApplicationMessages.AnyAsync(row => row.Id == lapsedCounterMessage.Id));
        Assert.Null((await verify.ApplicationCounterOffers.SingleAsync(row => row.Id == abandonedCounter.Id)).Message);

        var redacted = await verify.Applications.SingleAsync(row => row.Id == abandoned.Id);
        Assert.Equal("", redacted.IntentText);
        Assert.Null(redacted.OrganizationName);
        Assert.Equal(ApplicationStatus.Pending, redacted.Status); // retention redacts text, never decides
        Assert.Equal("", (await verify.Applications.SingleAsync(row => row.Id == lapsedCounter.Id)).IntentText);

        Assert.True(await verify.ApplicationMessages.AnyAsync(row => row.Id == recentlyLapsedMessage.Id));
        var retained = await verify.Applications.SingleAsync(row => row.Id == recentlyLapsed.Id);
        Assert.Equal("Private application intent", retained.IntentText);
        Assert.Equal("Still retained", retained.OrganizationName);
    }

    [Fact]
    public async Task EveryRetentionClass_RespectsTheConfiguredBatchBound()
    {
        const int batchSize = 2;
        var user = NewUser();
        var application = NewApplication(user.Id, ApplicationStatus.Declined, FixedNow.AddYears(-4));
        application.DecidedAtUtc = FixedNow.AddYears(-3);

        var refreshTokens = Enumerable.Range(0, batchSize + 1)
            .Select(_ => NewRefreshToken(user.Id, FixedNow.AddYears(-2), FixedNow.AddDays(-31)))
            .ToArray();
        var notifications = Enumerable.Range(0, batchSize + 1)
            .Select(_ => NewNotification(user.Id, FixedNow.AddYears(-2)))
            .ToArray();
        var idempotency = Enumerable.Range(0, batchSize + 1)
            .Select(_ => NewIdempotencyRecord(user.Id, FixedNow.AddYears(-2)))
            .ToArray();
        var messages = Enumerable.Range(0, batchSize + 1)
            .Select(_ => NewMessage(application.Id, user.Id, FixedNow.AddYears(-3)))
            .ToArray();
        var outbox = Enumerable.Range(0, batchSize + 1)
            .Select(_ =>
            {
                var row = NewOutbox(FixedNow.AddYears(-2));
                row.DeliveredAtUtc = FixedNow.AddYears(-2);
                return row;
            })
            .ToArray();

        await using (var db = CreateContext())
        {
            db.Users.Add(user);
            db.Applications.Add(application);
            db.RefreshTokens.AddRange(refreshTokens);
            db.Notifications.AddRange(notifications);
            db.IdempotencyRecords.AddRange(idempotency);
            db.ApplicationMessages.AddRange(messages);
            db.NotificationOutbox.AddRange(outbox);
            await db.SaveChangesAsync();
        }

        var result = await RunWorkerAsync(new DataRetentionOptions { BatchSize = batchSize });

        Assert.Equal(batchSize, result.RefreshTokens);
        Assert.Equal(batchSize, result.Notifications);
        Assert.Equal(batchSize, result.IdempotencyRecords);
        Assert.Equal(batchSize, result.Correspondence);
        Assert.Equal(batchSize, result.NotificationOutbox);

        await using var verify = CreateContext();
        Assert.Equal(1, await verify.RefreshTokens.CountAsync(row => refreshTokens.Select(item => item.Id).Contains(row.Id)));
        Assert.Equal(1, await verify.Notifications.CountAsync(row => notifications.Select(item => item.Id).Contains(row.Id)));
        Assert.Equal(1, await verify.IdempotencyRecords.CountAsync(row => idempotency.Select(item => item.Key).Contains(row.Key)));
        Assert.Equal(1, await verify.ApplicationMessages.CountAsync(row => messages.Select(item => item.Id).Contains(row.Id)));
        Assert.Equal(1, await verify.NotificationOutbox.CountAsync(row => outbox.Select(item => item.Id).Contains(row.Id)));
    }

    [Fact]
    public async Task LegalAgreement_IsNeverDeletedRegardlessOfAge()
    {
        var user = NewUser();
        var agreement = new UserAgreement
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            DocType = AgreementDocType.Tos,
            Version = "1980-01-01",
            AcceptedAtUtc = FixedNow.AddYears(-20),
        };

        await using (var db = CreateContext())
        {
            db.Users.Add(user);
            db.UserAgreements.Add(agreement);
            await db.SaveChangesAsync();
        }

        await RunWorkerAsync(new DataRetentionOptions { BatchSize = 500 });

        await using var verify = CreateContext();
        Assert.True(await verify.UserAgreements.AnyAsync(row => row.Id == agreement.Id));
    }

    private SteepleDbContext CreateContext() =>
        new(new DbContextOptionsBuilder<SteepleDbContext>()
            .UseNpgsql(_fixture.ConnectionString)
            .Options);

    private async Task<DataRetentionSweepResult> RunWorkerAsync(DataRetentionOptions options)
    {
        var services = new ServiceCollection();
        services.AddDbContext<SteepleDbContext>(builder => builder.UseNpgsql(_fixture.ConnectionString));
        services.AddSingleton<IOptions<DataRetentionOptions>>(Options.Create(options));
        services.AddScoped<IDataRetentionService, DataRetentionService>();
        await using var provider = services.BuildServiceProvider();

        var worker = new DataRetentionWorker(
            provider.GetRequiredService<IServiceScopeFactory>(),
            new FixedTimeProvider(FixedNow),
            Options.Create(options),
            NullLogger<DataRetentionWorker>.Instance);
        return await worker.RunOnceAsync();
    }

    private static User NewUser() => new()
    {
        Id = Guid.NewGuid(),
        DisplayName = "Retention Test User",
        Email = $"{Guid.NewGuid():N}@example.com",
        CreatedAtUtc = FixedNow.AddYears(-10),
    };

    private static RefreshToken NewRefreshToken(Guid userId, DateTimeOffset created, DateTimeOffset expires) => new()
    {
        Id = Guid.NewGuid(),
        UserId = userId,
        FamilyId = Guid.NewGuid(),
        TokenHash = Guid.NewGuid().ToString("N"),
        CreatedAtUtc = created,
        ExpiresAtUtc = expires,
    };

    private static Notification NewNotification(Guid userId, DateTimeOffset created) => new()
    {
        Id = Guid.NewGuid(),
        UserId = userId,
        Type = NotificationType.ApplicationMessage,
        PayloadJson = "{}",
        CreatedAtUtc = created,
    };

    private static IdempotencyRecord NewIdempotencyRecord(Guid userId, DateTimeOffset created) => new()
    {
        UserId = userId,
        Scope = "manage.venue.create",
        Key = Guid.NewGuid(),
        ResourceId = Guid.NewGuid(),
        CreatedAtUtc = created,
    };

    private static NotificationOutbox NewOutbox(DateTimeOffset created) => new()
    {
        Id = Guid.NewGuid(),
        Channel = NotificationOutboxChannel.Email,
        Kind = NotificationType.ApplicationMessage,
        PayloadJson = "{}",
        CreatedAtUtc = created,
        NextAttemptAtUtc = created,
    };

    private static Application NewApplication(Guid organizerId, ApplicationStatus status, DateTimeOffset created) => new()
    {
        Id = Guid.NewGuid(),
        RoomId = RoomId,
        OrganizerId = organizerId,
        ActivityType = ActivityType.Community,
        GroupSize = 12,
        Frequency = ScheduleFrequency.OneOff,
        StartDate = DateOnly.FromDateTime(created.UtcDateTime),
        StartTime = new TimeOnly(9, 0),
        EndTime = new TimeOnly(11, 0),
        IntentText = "Private application intent",
        Status = status,
        CreatedAtUtc = created,
        ExpiresAtUtc = created.AddDays(14),
    };

    private static ApplicationMessage NewMessage(Guid applicationId, Guid senderId, DateTimeOffset sent) => new()
    {
        Id = Guid.NewGuid(),
        ApplicationId = applicationId,
        SenderId = senderId,
        Body = "Private thread message",
        SentAtUtc = sent,
    };

    private static ApplicationCounterOffer NewCounter(Guid applicationId, Guid userId, DateTimeOffset created) => new()
    {
        Id = Guid.NewGuid(),
        ApplicationId = applicationId,
        ProposedByUserId = userId,
        Frequency = ScheduleFrequency.OneOff,
        StartDate = DateOnly.FromDateTime(created.UtcDateTime),
        StartTime = new TimeOnly(10, 0),
        EndTime = new TimeOnly(12, 0),
        Message = "Private counter-offer note",
        Status = CounterOfferStatus.Lapsed,
        CreatedAtUtc = created,
    };

    private static Booking NewBooking(
        Guid applicationId,
        Guid organizerId,
        BookingStatus status,
        DateTimeOffset? cancelledAt) => new()
    {
        Id = Guid.NewGuid(),
        ApplicationId = applicationId,
        RoomId = RoomId,
        OrganizerId = organizerId,
        Type = BookingType.OneOff,
        StartDate = new DateOnly(1997, 1, 1),
        EndDate = new DateOnly(1997, 1, 1),
        StartTime = new TimeOnly(9, 0),
        EndTime = new TimeOnly(11, 0),
        Status = status,
        CancelledAtUtc = cancelledAt,
        CreatedAtUtc = FixedNow.AddYears(-4),
        PricePerOccurrence = 75m,
        Currency = "USD",
    };

    private static BookingOccurrence NewOccurrence(
        Guid bookingId,
        DateTimeOffset start,
        OccurrenceStatus status) => new()
    {
        Id = Guid.NewGuid(),
        BookingId = bookingId,
        RoomId = RoomId,
        StartUtc = start,
        EndUtc = start.AddHours(2),
        LocalDate = DateOnly.FromDateTime(start.UtcDateTime),
        Status = status,
    };

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
