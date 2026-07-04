using Microsoft.EntityFrameworkCore;
using Steeple.Integration.Tests.Fixtures;

namespace Steeple.Integration.Tests.Proxies;
/// <summary>
/// Integration tests for <see cref="EfNotificationRepository"/> against a real Postgres, seeded
/// from db/changelog/004-applications.sql. Each test creates its own user(s) with fresh
/// <see cref="Guid"/>s so it can run independently of the other tests sharing the container (see
/// <see cref="PostgresDatabaseFixture"/>).
/// </summary>
[Collection(PostgresCollection.Name)]
public class EfNotificationRepositoryTests
{
    private static readonly DateTimeOffset FixedNow = new(2026, 7, 4, 12, 0, 0, TimeSpan.Zero);

    private readonly PostgresDatabaseFixture _fixture;

    public EfNotificationRepositoryTests(PostgresDatabaseFixture fixture) => _fixture = fixture;

    private SteepleDbContext CreateContext() =>
        new(new DbContextOptionsBuilder<SteepleDbContext>()
            .UseNpgsql(_fixture.ConnectionString)
            .Options);

    private static User NewUser() => new()
    {
        Id = Guid.NewGuid(),
        DisplayName = "Jamie Organizer",
        Email = $"{Guid.NewGuid():N}@example.com",
        CreatedAtUtc = FixedNow,
    };

    private static Notification NewNotification(Guid userId, DateTimeOffset createdAtUtc, NotificationType type = NotificationType.ApplicationReceived) => new()
    {
        Id = Guid.NewGuid(),
        UserId = userId,
        Type = type,
        PayloadJson = "{}",
        CreatedAtUtc = createdAtUtc,
    };

    [Fact]
    public async Task AddRangeAsync_ThenGetPageAsync_RoundTrips()
    {
        await using var seedDb = CreateContext();
        var user = NewUser();
        seedDb.Users.Add(user);
        await seedDb.SaveChangesAsync();

        var notifications = new[]
        {
            NewNotification(user.Id, FixedNow),
            NewNotification(user.Id, FixedNow.AddMinutes(1)),
        };

        await using (var db = CreateContext())
        {
            var repository = new EfNotificationRepository(db);
            await repository.AddRangeAsync(notifications);
        }

        await using var readDb = CreateContext();
        var readRepository = new EfNotificationRepository(readDb);
        var page = await readRepository.GetPageAsync(user.Id, beforeCreatedAtUtc: null, beforeId: null, limit: 10);

        Assert.Equal(2, page.Count);
    }

    [Fact]
    public async Task GetPageAsync_OrdersNewestFirstAndCursorExcludesTheCursorRowItself()
    {
        await using var seedDb = CreateContext();
        var user = NewUser();
        var n1 = NewNotification(user.Id, FixedNow);
        var n2 = NewNotification(user.Id, FixedNow.AddMinutes(1));
        var n3 = NewNotification(user.Id, FixedNow.AddMinutes(2));
        seedDb.Users.Add(user);
        seedDb.Notifications.AddRange(n1, n2, n3);
        await seedDb.SaveChangesAsync();

        await using var db = CreateContext();
        var repository = new EfNotificationRepository(db);

        var firstPage = await repository.GetPageAsync(user.Id, beforeCreatedAtUtc: null, beforeId: null, limit: 10);
        Assert.Equal(3, firstPage.Count);
        Assert.Equal(n3.Id, firstPage[0].Id);
        Assert.Equal(n2.Id, firstPage[1].Id);
        Assert.Equal(n1.Id, firstPage[2].Id);

        // Cursored at n3's position: strictly older rows only — n3 itself must not reappear.
        var afterN3 = await repository.GetPageAsync(user.Id, n3.CreatedAtUtc, n3.Id, limit: 10);
        Assert.Equal(2, afterN3.Count);
        Assert.DoesNotContain(afterN3, n => n.Id == n3.Id);
        Assert.Equal(n2.Id, afterN3[0].Id);
        Assert.Equal(n1.Id, afterN3[1].Id);
    }

    [Fact]
    public async Task GetPageAsync_SameInstantBatch_TieBreaksOnIdWithoutSkippingOrRepeating()
    {
        await using var seedDb = CreateContext();
        var user = NewUser();
        // A fan-out writing several rows in the same instant (NotificationDispatcher.NotifyAsync).
        var sameInstant = FixedNow.AddMinutes(10);
        var a = NewNotification(user.Id, sameInstant);
        var b = NewNotification(user.Id, sameInstant);
        var c = NewNotification(user.Id, sameInstant);
        seedDb.Users.Add(user);
        seedDb.Notifications.AddRange(a, b, c);
        await seedDb.SaveChangesAsync();

        await using var db = CreateContext();
        var repository = new EfNotificationRepository(db);

        var page1 = await repository.GetPageAsync(user.Id, beforeCreatedAtUtc: null, beforeId: null, limit: 2);
        Assert.Equal(2, page1.Count);
        var last = page1[^1];
        var page2 = await repository.GetPageAsync(user.Id, last.CreatedAtUtc, last.Id, limit: 2);

        var combinedIds = page1.Select(n => n.Id).Concat(page2.Select(n => n.Id)).ToHashSet();
        Assert.Equal(3, combinedIds.Count);
        Assert.Equal(new[] { a.Id, b.Id, c.Id }.ToHashSet(), combinedIds);
    }

    [Fact]
    public async Task MarkReadAsync_OnlyAffectsGivenUsersOwnRows()
    {
        await using var seedDb = CreateContext();
        var user = NewUser();
        var otherUser = NewUser();
        var mine = NewNotification(user.Id, FixedNow);
        var alsoMine = NewNotification(user.Id, FixedNow.AddMinutes(1));
        var notMine = NewNotification(otherUser.Id, FixedNow);
        seedDb.Users.AddRange(user, otherUser);
        seedDb.Notifications.AddRange(mine, alsoMine, notMine);
        await seedDb.SaveChangesAsync();

        await using (var db = CreateContext())
        {
            var repository = new EfNotificationRepository(db);
            // Includes notMine's id — must be scoped away since it belongs to another user.
            await repository.MarkReadAsync(user.Id, [mine.Id, notMine.Id]);
        }

        await using var readDb = CreateContext();
        var reloadedMine = await readDb.Notifications.SingleAsync(n => n.Id == mine.Id);
        var reloadedAlsoMine = await readDb.Notifications.SingleAsync(n => n.Id == alsoMine.Id);
        var reloadedNotMine = await readDb.Notifications.SingleAsync(n => n.Id == notMine.Id);

        Assert.NotNull(reloadedMine.ReadAtUtc);
        Assert.Null(reloadedAlsoMine.ReadAtUtc);
        Assert.Null(reloadedNotMine.ReadAtUtc);
    }
}
