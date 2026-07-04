using Microsoft.EntityFrameworkCore;
using Steeple.Integration.Tests.Fixtures;

namespace Steeple.Integration.Tests.Proxies;
/// <summary>
/// Integration tests for <see cref="EfIdentityRepository"/> against a real Postgres, seeded from
/// the Liquibase-owned identity schema (db/changelog/003-identity.sql). Each test creates its own
/// user(s) with fresh <see cref="Guid"/>s so it can run independently of seed data and of the
/// other tests sharing the container (see <see cref="PostgresDatabaseFixture"/>).
/// </summary>
[Collection(PostgresCollection.Name)]
public class EfIdentityRepositoryTests
{
    private static readonly DateTimeOffset FixedNow = new(2026, 7, 4, 12, 0, 0, TimeSpan.Zero);

    private readonly PostgresDatabaseFixture _fixture;

    public EfIdentityRepositoryTests(PostgresDatabaseFixture fixture) => _fixture = fixture;

    private SteepleDbContext CreateContext() =>
        new(new DbContextOptionsBuilder<SteepleDbContext>()
            .UseNpgsql(_fixture.ConnectionString)
            .Options);

    private static User NewUser(string displayName = "Alex Person", string? email = "alex@example.com") => new()
    {
        Id = Guid.NewGuid(),
        DisplayName = displayName,
        Email = email,
        CreatedAtUtc = FixedNow,
    };

    private static UserLogin NewLogin(Guid userId, AuthProvider provider = AuthProvider.Google, string? subject = null) => new()
    {
        Id = Guid.NewGuid(),
        UserId = userId,
        Provider = provider,
        Subject = subject ?? Guid.NewGuid().ToString("N"),
        CreatedAtUtc = FixedNow,
    };

    private static RefreshToken NewRefreshToken(Guid userId, Guid familyId, string? tokenHash = null) => new()
    {
        Id = Guid.NewGuid(),
        UserId = userId,
        FamilyId = familyId,
        TokenHash = tokenHash ?? Guid.NewGuid().ToString("N"),
        CreatedAtUtc = FixedNow,
        ExpiresAtUtc = FixedNow.AddDays(90),
    };

    [Fact]
    public async Task CreateUserWithLoginAsync_ThenFindLoginAsync_RoundTrips()
    {
        await using var db = CreateContext();
        var repository = new EfIdentityRepository(db, TimeProvider.System);
        var user = NewUser();
        var login = NewLogin(user.Id, AuthProvider.Google, subject: $"sub-{user.Id}");

        await repository.CreateUserWithLoginAsync(user, login);

        await using var db2 = CreateContext();
        var repository2 = new EfIdentityRepository(db2, TimeProvider.System);
        var found = await repository2.FindLoginAsync(AuthProvider.Google, login.Subject);

        Assert.NotNull(found);
        Assert.Equal(user.Id, found!.UserId);
        Assert.NotNull(found.User);
        Assert.Equal("Alex Person", found.User!.DisplayName);
    }

    [Fact]
    public async Task FindLoginAsync_UnknownSubject_ReturnsNull()
    {
        await using var db = CreateContext();
        var repository = new EfIdentityRepository(db, TimeProvider.System);

        var found = await repository.FindLoginAsync(AuthProvider.Google, "never-seen-subject");

        Assert.Null(found);
    }

    [Fact]
    public async Task EmailBelongsToAnotherUserAsync_ExistingNonDeletedEmail_ReturnsTrue()
    {
        await using var seedDb = CreateContext();
        var email = $"shared-{Guid.NewGuid():N}@example.com";
        seedDb.Users.Add(NewUser(email: email));
        await seedDb.SaveChangesAsync();

        await using var db = CreateContext();
        var repository = new EfIdentityRepository(db, TimeProvider.System);

        Assert.True(await repository.EmailBelongsToAnotherUserAsync(email));
        Assert.False(await repository.EmailBelongsToAnotherUserAsync($"nobody-{Guid.NewGuid():N}@example.com"));
    }

    [Fact]
    public async Task AddRefreshTokenAsync_ThenFindRefreshTokenAsync_RoundTripsByHash()
    {
        await using var seedDb = CreateContext();
        var user = NewUser();
        seedDb.Users.Add(user);
        await seedDb.SaveChangesAsync();

        var tokenHash = $"hash-{Guid.NewGuid():N}";
        await using (var db = CreateContext())
        {
            var repository = new EfIdentityRepository(db, TimeProvider.System);
            await repository.AddRefreshTokenAsync(NewRefreshToken(user.Id, Guid.NewGuid(), tokenHash));
        }

        await using var readDb = CreateContext();
        var readRepository = new EfIdentityRepository(readDb, TimeProvider.System);
        var found = await readRepository.FindRefreshTokenAsync(tokenHash);

        Assert.NotNull(found);
        Assert.Equal(user.Id, found!.UserId);
        Assert.NotNull(found.User);
        Assert.Null(found.RevokedAtUtc);
    }

    [Fact]
    public async Task ReplaceRefreshTokenAsync_RevokesCurrentAndInsertsNextAtomically()
    {
        await using var seedDb = CreateContext();
        var user = NewUser();
        var familyId = Guid.NewGuid();
        var current = NewRefreshToken(user.Id, familyId, $"current-{Guid.NewGuid():N}");
        seedDb.Users.Add(user);
        seedDb.RefreshTokens.Add(current);
        await seedDb.SaveChangesAsync();

        var clock = new FixedTimeProvider(FixedNow);
        var nextHash = $"next-{Guid.NewGuid():N}";
        await using (var db = CreateContext())
        {
            var repository = new EfIdentityRepository(db, clock);
            var tracked = await db.RefreshTokens.SingleAsync(t => t.Id == current.Id);
            tracked.RevokedAtUtc = FixedNow;
            var next = NewRefreshToken(user.Id, familyId, nextHash);

            await repository.ReplaceRefreshTokenAsync(tracked, next);
        }

        await using var readDb = CreateContext();
        var readRepository = new EfIdentityRepository(readDb, TimeProvider.System);
        var reloadedCurrent = await readRepository.FindRefreshTokenAsync(current.TokenHash);
        var reloadedNext = await readRepository.FindRefreshTokenAsync(nextHash);

        Assert.NotNull(reloadedCurrent);
        Assert.Equal(FixedNow, reloadedCurrent!.RevokedAtUtc);
        Assert.NotNull(reloadedNext);
        Assert.Null(reloadedNext!.RevokedAtUtc);
        Assert.Equal(familyId, reloadedNext.FamilyId);
    }

    [Fact]
    public async Task RevokeFamilyAsync_RevokesAllUnrevokedTokensInFamilyOnly()
    {
        await using var seedDb = CreateContext();
        var user = NewUser();
        var familyId = Guid.NewGuid();
        var otherFamilyId = Guid.NewGuid();
        var tokenA = NewRefreshToken(user.Id, familyId);
        var tokenB = NewRefreshToken(user.Id, familyId);
        var alreadyRevoked = NewRefreshToken(user.Id, familyId);
        alreadyRevoked.RevokedAtUtc = FixedNow.AddDays(-1);
        var otherFamilyToken = NewRefreshToken(user.Id, otherFamilyId);
        seedDb.Users.Add(user);
        seedDb.RefreshTokens.AddRange(tokenA, tokenB, alreadyRevoked, otherFamilyToken);
        await seedDb.SaveChangesAsync();

        await using (var db = CreateContext())
        {
            var repository = new EfIdentityRepository(db, new FixedTimeProvider(FixedNow));
            await repository.RevokeFamilyAsync(familyId);
        }

        await using var readDb = CreateContext();
        Assert.NotNull((await readDb.RefreshTokens.SingleAsync(t => t.Id == tokenA.Id)).RevokedAtUtc);
        Assert.NotNull((await readDb.RefreshTokens.SingleAsync(t => t.Id == tokenB.Id)).RevokedAtUtc);
        Assert.Equal(
            alreadyRevoked.RevokedAtUtc,
            (await readDb.RefreshTokens.SingleAsync(t => t.Id == alreadyRevoked.Id)).RevokedAtUtc);
        Assert.Null((await readDb.RefreshTokens.SingleAsync(t => t.Id == otherFamilyToken.Id)).RevokedAtUtc);
    }

    [Fact]
    public async Task RevokeAllForUserAsync_RevokesEveryUnrevokedTokenAcrossFamilies()
    {
        await using var seedDb = CreateContext();
        var user = NewUser();
        var tokenA = NewRefreshToken(user.Id, Guid.NewGuid());
        var tokenB = NewRefreshToken(user.Id, Guid.NewGuid());
        var otherUser = NewUser(email: $"other-{Guid.NewGuid():N}@example.com");
        var otherUserToken = NewRefreshToken(otherUser.Id, Guid.NewGuid());
        seedDb.Users.AddRange(user, otherUser);
        seedDb.RefreshTokens.AddRange(tokenA, tokenB, otherUserToken);
        await seedDb.SaveChangesAsync();

        await using (var db = CreateContext())
        {
            var repository = new EfIdentityRepository(db, new FixedTimeProvider(FixedNow));
            await repository.RevokeAllForUserAsync(user.Id);
        }

        await using var readDb = CreateContext();
        Assert.NotNull((await readDb.RefreshTokens.SingleAsync(t => t.Id == tokenA.Id)).RevokedAtUtc);
        Assert.NotNull((await readDb.RefreshTokens.SingleAsync(t => t.Id == tokenB.Id)).RevokedAtUtc);
        Assert.Null((await readDb.RefreshTokens.SingleAsync(t => t.Id == otherUserToken.Id)).RevokedAtUtc);
    }

    [Fact]
    public async Task RecordAgreementAsync_SameUserDocTypeAndVersionTwice_IsIdempotent()
    {
        await using var seedDb = CreateContext();
        var user = NewUser();
        seedDb.Users.Add(user);
        await seedDb.SaveChangesAsync();

        await using (var db1 = CreateContext())
        {
            var repository = new EfIdentityRepository(db1, new FixedTimeProvider(FixedNow));
            await repository.RecordAgreementAsync(user.Id, AgreementDocType.Tos, "2026-01-01");
        }

        await using (var db2 = CreateContext())
        {
            var repository = new EfIdentityRepository(db2, new FixedTimeProvider(FixedNow.AddMinutes(5)));
            await repository.RecordAgreementAsync(user.Id, AgreementDocType.Tos, "2026-01-01");
        }

        await using var readDb = CreateContext();
        var rows = await readDb.UserAgreements
            .Where(a => a.UserId == user.Id && a.DocType == AgreementDocType.Tos && a.Version == "2026-01-01")
            .ToListAsync();

        Assert.Single(rows);
    }

    [Fact]
    public async Task AnonymizeUserAsync_ClearsPiiRemovesLoginsRevokesTokensButKeepsAgreements()
    {
        await using var seedDb = CreateContext();
        var user = NewUser("Alex Person", "alex@example.com");
        var login = NewLogin(user.Id);
        var token = NewRefreshToken(user.Id, Guid.NewGuid());
        var agreement = new UserAgreement
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            DocType = AgreementDocType.Tos,
            Version = "2026-01-01",
            AcceptedAtUtc = FixedNow,
        };
        seedDb.Users.Add(user);
        seedDb.UserLogins.Add(login);
        seedDb.RefreshTokens.Add(token);
        seedDb.UserAgreements.Add(agreement);
        await seedDb.SaveChangesAsync();

        await using (var db = CreateContext())
        {
            var repository = new EfIdentityRepository(db, new FixedTimeProvider(FixedNow));
            await repository.AnonymizeUserAsync(user.Id);
        }

        await using var readDb = CreateContext();
        var reloadedUser = await readDb.Users.SingleAsync(u => u.Id == user.Id);
        Assert.NotEqual("Alex Person", reloadedUser.DisplayName);
        Assert.Null(reloadedUser.Email);
        Assert.Equal(FixedNow, reloadedUser.DeletedAtUtc);

        Assert.Empty(await readDb.UserLogins.Where(l => l.UserId == user.Id).ToListAsync());

        var reloadedToken = await readDb.RefreshTokens.SingleAsync(t => t.Id == token.Id);
        Assert.NotNull(reloadedToken.RevokedAtUtc);

        var reloadedAgreements = await readDb.UserAgreements.Where(a => a.UserId == user.Id).ToListAsync();
        Assert.Single(reloadedAgreements);
    }

    [Fact]
    public async Task AnonymizeUserAsync_RemovesPushDeviceRegistrations()
    {
        // Anonymization keeps the user row (unlike a real delete), so the devices table's
        // ON DELETE CASCADE never fires — the repository must remove them explicitly.
        await using var seedDb = CreateContext();
        var user = NewUser("Alex Person", "alex@example.com");
        var device = new Device
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            FcmToken = Guid.NewGuid().ToString("N"),
            Platform = "ios",
            CreatedAtUtc = FixedNow,
            LastSeenAtUtc = FixedNow,
        };
        seedDb.Users.Add(user);
        seedDb.Devices.Add(device);
        await seedDb.SaveChangesAsync();

        await using (var db = CreateContext())
        {
            var repository = new EfIdentityRepository(db, new FixedTimeProvider(FixedNow));
            await repository.AnonymizeUserAsync(user.Id);
        }

        await using var readDb = CreateContext();
        Assert.Empty(await readDb.Devices.Where(d => d.UserId == user.Id).ToListAsync());
    }

    /// <summary>A clock frozen at a fixed instant, so tests can pin exact revoked/accepted timestamps.</summary>
    private sealed class FixedTimeProvider : TimeProvider
    {
        private readonly DateTimeOffset _now;

        public FixedTimeProvider(DateTimeOffset now) => _now = now;

        public override DateTimeOffset GetUtcNow() => _now;
    }
}
