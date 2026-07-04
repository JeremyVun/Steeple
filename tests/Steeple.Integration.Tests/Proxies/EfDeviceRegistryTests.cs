using Microsoft.EntityFrameworkCore;
using Steeple.Integration.Tests.Fixtures;

namespace Steeple.Integration.Tests.Proxies;
/// <summary>
/// Integration tests for <see cref="EfDeviceRegistry"/> against a real Postgres, seeded from
/// db/changelog/004-applications.sql (the <c>devices</c> table). Each test creates its own
/// user(s) with fresh <see cref="Guid"/>s so it can run independently of the other tests sharing
/// the container (see <see cref="PostgresDatabaseFixture"/>).
/// </summary>
[Collection(PostgresCollection.Name)]
public class EfDeviceRegistryTests
{
    private static readonly DateTimeOffset FixedNow = new(2026, 7, 4, 12, 0, 0, TimeSpan.Zero);

    private readonly PostgresDatabaseFixture _fixture;

    public EfDeviceRegistryTests(PostgresDatabaseFixture fixture) => _fixture = fixture;

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

    [Theory]
    [InlineData("", "ios")]
    [InlineData(null, "ios")]
    [InlineData("token", "windows-phone")]
    [InlineData("token", "")]
    public async Task RegisterAsync_InvalidInput_ReturnsFalseAndPersistsNothing(string? fcmToken, string platform)
    {
        await using var db = CreateContext();
        var user = NewUser();
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var registry = new EfDeviceRegistry(db, new FixedTimeProvider(FixedNow));
        var ok = await registry.RegisterAsync(user.Id, fcmToken!, platform);

        Assert.False(ok);
        Assert.Empty(await db.Devices.Where(d => d.UserId == user.Id).ToListAsync());
    }

    [Fact]
    public async Task RegisterAsync_NewToken_InsertsADevice()
    {
        await using var seedDb = CreateContext();
        var user = NewUser();
        seedDb.Users.Add(user);
        await seedDb.SaveChangesAsync();
        var token = Guid.NewGuid().ToString("N");

        await using (var db = CreateContext())
        {
            var registry = new EfDeviceRegistry(db, new FixedTimeProvider(FixedNow));
            var ok = await registry.RegisterAsync(user.Id, token, "ios");
            Assert.True(ok);
        }

        await using var readDb = CreateContext();
        var device = await readDb.Devices.SingleAsync(d => d.FcmToken == token);
        Assert.Equal(user.Id, device.UserId);
        Assert.Equal("ios", device.Platform);
        Assert.Equal(FixedNow, device.CreatedAtUtc);
        Assert.Equal(FixedNow, device.LastSeenAtUtc);
    }

    [Fact]
    public async Task RegisterAsync_SameTokenReRegisteredByAnotherUser_MovesOwnership()
    {
        await using var seedDb = CreateContext();
        var firstOwner = NewUser();
        var secondOwner = NewUser();
        seedDb.Users.AddRange(firstOwner, secondOwner);
        await seedDb.SaveChangesAsync();
        var token = Guid.NewGuid().ToString("N");

        await using (var db = CreateContext())
        {
            var registry = new EfDeviceRegistry(db, new FixedTimeProvider(FixedNow));
            await registry.RegisterAsync(firstOwner.Id, token, "ios");
        }

        var laterSeen = FixedNow.AddDays(1);
        await using (var db = CreateContext())
        {
            var registry = new EfDeviceRegistry(db, new FixedTimeProvider(laterSeen));
            var ok = await registry.RegisterAsync(secondOwner.Id, token, "android");
            Assert.True(ok);
        }

        await using var readDb = CreateContext();
        // One row only — re-registration is an upsert by token, not a second insert.
        var device = await readDb.Devices.SingleAsync(d => d.FcmToken == token);
        Assert.Equal(secondOwner.Id, device.UserId);
        Assert.Equal("android", device.Platform);
        Assert.Equal(laterSeen, device.LastSeenAtUtc);

        var firstOwnerTokens = await new EfDeviceRegistry(readDb, new FixedTimeProvider(laterSeen)).GetTokensAsync(firstOwner.Id);
        Assert.Empty(firstOwnerTokens);
    }

    [Fact]
    public async Task UnregisterAsync_OwnedToken_Deletes()
    {
        await using var seedDb = CreateContext();
        var user = NewUser();
        seedDb.Users.Add(user);
        await seedDb.SaveChangesAsync();
        var token = Guid.NewGuid().ToString("N");
        await using (var db = CreateContext())
        {
            await new EfDeviceRegistry(db, new FixedTimeProvider(FixedNow)).RegisterAsync(user.Id, token, "ios");
        }

        await using (var db = CreateContext())
        {
            await new EfDeviceRegistry(db, new FixedTimeProvider(FixedNow)).UnregisterAsync(user.Id, token);
        }

        await using var readDb = CreateContext();
        Assert.Empty(await readDb.Devices.Where(d => d.FcmToken == token).ToListAsync());
    }

    [Fact]
    public async Task UnregisterAsync_TokenOwnedByAnotherUser_LeavesItInPlace()
    {
        await using var seedDb = CreateContext();
        var owner = NewUser();
        var attacker = NewUser();
        seedDb.Users.AddRange(owner, attacker);
        await seedDb.SaveChangesAsync();
        var token = Guid.NewGuid().ToString("N");
        await using (var db = CreateContext())
        {
            await new EfDeviceRegistry(db, new FixedTimeProvider(FixedNow)).RegisterAsync(owner.Id, token, "ios");
        }

        await using (var db = CreateContext())
        {
            // Someone else's unregister call for this token must be a no-op, not a delete.
            await new EfDeviceRegistry(db, new FixedTimeProvider(FixedNow)).UnregisterAsync(attacker.Id, token);
        }

        await using var readDb = CreateContext();
        Assert.NotNull(await readDb.Devices.SingleOrDefaultAsync(d => d.FcmToken == token));
    }

    [Fact]
    public async Task GetTokensAsync_ReturnsOnlyTheGivenUsersTokens()
    {
        await using var seedDb = CreateContext();
        var user = NewUser();
        var otherUser = NewUser();
        seedDb.Users.AddRange(user, otherUser);
        await seedDb.SaveChangesAsync();

        await using (var db = CreateContext())
        {
            var registry = new EfDeviceRegistry(db, new FixedTimeProvider(FixedNow));
            await registry.RegisterAsync(user.Id, "token-a", "ios");
            await registry.RegisterAsync(user.Id, "token-b", "android");
            await registry.RegisterAsync(otherUser.Id, "token-c", "web");
        }

        await using var readDb = CreateContext();
        var tokens = await new EfDeviceRegistry(readDb, new FixedTimeProvider(FixedNow)).GetTokensAsync(user.Id);

        Assert.Equal(new[] { "token-a", "token-b" }.ToHashSet(), tokens.ToHashSet());
    }

    [Fact]
    public async Task DeleteByTokenAsync_RemovesRegardlessOfOwner()
    {
        await using var seedDb = CreateContext();
        var user = NewUser();
        seedDb.Users.Add(user);
        await seedDb.SaveChangesAsync();
        var token = Guid.NewGuid().ToString("N");
        await using (var db = CreateContext())
        {
            await new EfDeviceRegistry(db, new FixedTimeProvider(FixedNow)).RegisterAsync(user.Id, token, "ios");
        }

        await using (var db = CreateContext())
        {
            await new EfDeviceRegistry(db, new FixedTimeProvider(FixedNow)).DeleteByTokenAsync(token);
        }

        await using var readDb = CreateContext();
        Assert.Empty(await readDb.Devices.Where(d => d.FcmToken == token).ToListAsync());
    }

    /// <summary>A clock frozen at a fixed instant, so tests can pin exact created/last-seen timestamps.</summary>
    private sealed class FixedTimeProvider : TimeProvider
    {
        private readonly DateTimeOffset _now;

        public FixedTimeProvider(DateTimeOffset now) => _now = now;

        public override DateTimeOffset GetUtcNow() => _now;
    }
}
