using Microsoft.EntityFrameworkCore;
using Steeple.Integration.Tests.Fixtures;

namespace Steeple.Integration.Tests.Proxies;
/// <summary>
/// Integration tests for <see cref="EfVenueManagerRepository"/> against a real Postgres, seeded
/// from db/changelog/004-applications.sql (the <c>venue_managers</c> link table is API-read-only —
/// Admin writes the rows, so tests insert them directly via the DbContext). Uses the published
/// Grace Community Church of Vienna venue (VenueId 11111111-1111-1111-1111-111111111111) from
/// 002-seed.sql plus fresh <see cref="Guid"/>-keyed users per test.
/// </summary>
[Collection(PostgresCollection.Name)]
public class EfVenueManagerRepositoryTests
{
    private static readonly DateTimeOffset FixedNow = new(2026, 7, 4, 12, 0, 0, TimeSpan.Zero);
    private static readonly Guid GraceVenueId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    private readonly PostgresDatabaseFixture _fixture;

    public EfVenueManagerRepositoryTests(PostgresDatabaseFixture fixture) => _fixture = fixture;

    private SteepleDbContext CreateContext() =>
        new(new DbContextOptionsBuilder<SteepleDbContext>()
            .UseNpgsql(_fixture.ConnectionString)
            .Options);

    private static User NewUser(string displayName = "Casey Manager", DateTimeOffset? deletedAtUtc = null) => new()
    {
        Id = Guid.NewGuid(),
        DisplayName = displayName,
        Email = $"{Guid.NewGuid():N}@example.com",
        CreatedAtUtc = FixedNow,
        DeletedAtUtc = deletedAtUtc,
    };

    private static VenueManager NewLink(Guid venueId, Guid userId) => new()
    {
        Id = Guid.NewGuid(),
        VenueId = venueId,
        UserId = userId,
        CreatedAtUtc = FixedNow,
    };

    [Fact]
    public async Task IsManagerAsync_LinkedUser_ReturnsTrue_UnlinkedUser_ReturnsFalse()
    {
        await using var seedDb = CreateContext();
        var manager = NewUser();
        var stranger = NewUser("Not A Manager");
        seedDb.Users.AddRange(manager, stranger);
        seedDb.VenueManagers.Add(NewLink(GraceVenueId, manager.Id));
        await seedDb.SaveChangesAsync();

        await using var db = CreateContext();
        var repository = new EfVenueManagerRepository(db);

        Assert.True(await repository.IsManagerAsync(manager.Id, GraceVenueId));
        Assert.False(await repository.IsManagerAsync(stranger.Id, GraceVenueId));
    }

    [Fact]
    public async Task GetManagedVenueIdsAsync_ReturnsEveryVenueTheUserManages()
    {
        await using var seedDb = CreateContext();
        var manager = NewUser();
        var otherVenueId = Guid.Parse("22222222-2222-2222-2222-222222222222");
        seedDb.Users.Add(manager);
        seedDb.VenueManagers.AddRange(NewLink(GraceVenueId, manager.Id), NewLink(otherVenueId, manager.Id));
        await seedDb.SaveChangesAsync();

        await using var db = CreateContext();
        var repository = new EfVenueManagerRepository(db);

        var venueIds = await repository.GetManagedVenueIdsAsync(manager.Id);

        Assert.Equal(2, venueIds.Count);
        Assert.Contains(GraceVenueId, venueIds);
        Assert.Contains(otherVenueId, venueIds);
    }

    [Fact]
    public async Task GetManagedVenueIdsAsync_NonProvider_ReturnsEmpty()
    {
        await using var db = CreateContext();
        var repository = new EfVenueManagerRepository(db);

        var venueIds = await repository.GetManagedVenueIdsAsync(Guid.NewGuid());

        Assert.Empty(venueIds);
    }

    [Fact]
    public async Task GetManagersAsync_ReturnsLinkedUsers_ExcludingSoftDeleted()
    {
        await using var seedDb = CreateContext();
        var active = NewUser("Active Manager");
        var deleted = NewUser("Deleted Manager", deletedAtUtc: FixedNow);
        seedDb.Users.AddRange(active, deleted);
        seedDb.VenueManagers.AddRange(NewLink(GraceVenueId, active.Id), NewLink(GraceVenueId, deleted.Id));
        await seedDb.SaveChangesAsync();

        await using var db = CreateContext();
        var repository = new EfVenueManagerRepository(db);

        var managers = await repository.GetManagersAsync(GraceVenueId);

        Assert.Contains(managers, u => u.Id == active.Id);
        Assert.DoesNotContain(managers, u => u.Id == deleted.Id);
    }
}
