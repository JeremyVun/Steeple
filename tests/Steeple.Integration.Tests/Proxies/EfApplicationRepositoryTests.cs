using Microsoft.EntityFrameworkCore;
using Steeple.Integration.Tests.Fixtures;

namespace Steeple.Integration.Tests.Proxies;
/// <summary>
/// Integration tests for <see cref="EfApplicationRepository"/> against a real Postgres, seeded
/// from the Liquibase-owned schema (db/changelog/004-applications.sql) plus the published
/// "Fellowship Hall" room at Grace Community Church of Vienna from 002-seed.sql
/// (RoomId 10000000-0000-0000-0000-000000000001, VenueId 11111111-1111-1111-1111-111111111111).
/// Each test creates its own user(s)/application(s) with fresh <see cref="Guid"/>s so it can run
/// independently of the other tests sharing the container (see
/// <see cref="PostgresDatabaseFixture"/>).
/// </summary>
[Collection(PostgresCollection.Name)]
public class EfApplicationRepositoryTests
{
    private static readonly DateTimeOffset FixedNow = new(2026, 7, 4, 12, 0, 0, TimeSpan.Zero);

    // Fellowship Hall @ Grace Community Church of Vienna — Published, from 002-seed.sql.
    private static readonly Guid PublishedRoomId = Guid.Parse("10000000-0000-0000-0000-000000000001");

    private readonly PostgresDatabaseFixture _fixture;

    public EfApplicationRepositoryTests(PostgresDatabaseFixture fixture) => _fixture = fixture;

    private SteepleDbContext CreateContext() =>
        new(new DbContextOptionsBuilder<SteepleDbContext>()
            .UseNpgsql(_fixture.ConnectionString)
            .Options);

    private static User NewUser(string displayName = "Jamie Organizer", string? email = null) => new()
    {
        Id = Guid.NewGuid(),
        DisplayName = displayName,
        Email = email ?? $"{Guid.NewGuid():N}@example.com",
        CreatedAtUtc = FixedNow,
    };

    private static Application NewApplication(
        Guid organizerId,
        ApplicationStatus status = ApplicationStatus.Pending,
        Guid? idempotencyKey = null,
        Guid? roomId = null,
        DateTimeOffset? createdAtUtc = null) => new()
    {
        Id = Guid.NewGuid(),
        RoomId = roomId ?? PublishedRoomId,
        OrganizerId = organizerId,
        ActivityType = ActivityType.Community,
        GroupSize = 15,
        Frequency = ScheduleFrequency.OneOff,
        StartDate = new DateOnly(2026, 8, 1),
        EndDate = null,
        DaysOfWeek = null,
        StartTime = new TimeOnly(9, 0),
        EndTime = new TimeOnly(11, 0),
        IntentText = "A community potluck for local families.",
        Status = status,
        IdempotencyKey = idempotencyKey,
        CreatedAtUtc = createdAtUtc ?? FixedNow,
        ExpiresAtUtc = (createdAtUtc ?? FixedNow).AddDays(14),
    };

    [Fact]
    public async Task GetAsync_LoadsFullDisplayGraph()
    {
        await using var seedDb = CreateContext();
        var organizer = NewUser();
        var application = NewApplication(organizer.Id);
        seedDb.Users.Add(organizer);
        seedDb.Applications.Add(application);
        await seedDb.SaveChangesAsync();

        await using var db = CreateContext();
        var repository = new EfApplicationRepository(db);

        var loaded = await repository.GetAsync(application.Id);

        Assert.NotNull(loaded);
        Assert.NotNull(loaded!.Room);
        Assert.Equal("Fellowship Hall", loaded.Room!.Name);
        Assert.NotNull(loaded.Room.Venue);
        Assert.Equal("grace-community-vienna", loaded.Room.Venue!.Slug);
        Assert.NotNull(loaded.Organizer);
        Assert.Equal(organizer.DisplayName, loaded.Organizer!.DisplayName);
        Assert.Empty(loaded.Messages);
    }

    [Fact]
    public async Task GetAsync_UnknownId_ReturnsNull()
    {
        await using var db = CreateContext();
        var repository = new EfApplicationRepository(db);

        var loaded = await repository.GetAsync(Guid.NewGuid());

        Assert.Null(loaded);
    }

    [Fact]
    public async Task FindByIdempotencyKeyAsync_FindsMatchingApplication()
    {
        await using var seedDb = CreateContext();
        var organizer = NewUser();
        var key = Guid.NewGuid();
        var application = NewApplication(organizer.Id, idempotencyKey: key);
        seedDb.Users.Add(organizer);
        seedDb.Applications.Add(application);
        await seedDb.SaveChangesAsync();

        await using var db = CreateContext();
        var repository = new EfApplicationRepository(db);

        var found = await repository.FindByIdempotencyKeyAsync(organizer.Id, key);
        var notFound = await repository.FindByIdempotencyKeyAsync(organizer.Id, Guid.NewGuid());

        Assert.NotNull(found);
        Assert.Equal(application.Id, found!.Id);
        Assert.Null(notFound);
    }

    [Fact]
    public async Task GetForOrganizerAsync_PagesAndFiltersByStatus()
    {
        await using var seedDb = CreateContext();
        var organizer = NewUser();
        var pending1 = NewApplication(organizer.Id, ApplicationStatus.Pending, createdAtUtc: FixedNow);
        var pending2 = NewApplication(organizer.Id, ApplicationStatus.Pending, createdAtUtc: FixedNow.AddMinutes(1));
        var withdrawn = NewApplication(organizer.Id, ApplicationStatus.Withdrawn, createdAtUtc: FixedNow.AddMinutes(2));
        seedDb.Users.Add(organizer);
        seedDb.Applications.AddRange(pending1, pending2, withdrawn);
        await seedDb.SaveChangesAsync();

        await using var db = CreateContext();
        var repository = new EfApplicationRepository(db);

        var (allItems, allTotal) = await repository.GetForOrganizerAsync(organizer.Id, status: null, page: 1, pageSize: 24);
        var (pendingItems, pendingTotal) = await repository.GetForOrganizerAsync(organizer.Id, ApplicationStatus.Pending, page: 1, pageSize: 24);
        var (page1, _) = await repository.GetForOrganizerAsync(organizer.Id, status: null, page: 1, pageSize: 2);
        var (page2, _) = await repository.GetForOrganizerAsync(organizer.Id, status: null, page: 2, pageSize: 2);

        Assert.Equal(3, allTotal);
        Assert.Equal(3, allItems.Count);
        Assert.Equal(2, pendingTotal);
        Assert.All(pendingItems, a => Assert.Equal(ApplicationStatus.Pending, a.Status));

        // Newest first.
        Assert.Equal(withdrawn.Id, allItems[0].Id);
        Assert.Equal(pending2.Id, allItems[1].Id);
        Assert.Equal(pending1.Id, allItems[2].Id);

        Assert.Equal(2, page1.Count);
        Assert.Single(page2);
    }

    [Fact]
    public async Task GetForVenuesAsync_FiltersToApplicationsOfGivenVenues()
    {
        await using var seedDb = CreateContext();
        var organizerA = NewUser();
        var organizerB = NewUser();
        var inVenue = NewApplication(organizerA.Id, createdAtUtc: FixedNow);
        // A different venue's room (Music Room @ Vienna Presbyterian, from 002-seed.sql).
        var otherRoomId = Guid.Parse("20000000-0000-0000-0000-000000000001");
        var otherVenueId = Guid.Parse("22222222-2222-2222-2222-222222222222");
        var inOtherVenue = NewApplication(organizerB.Id, roomId: otherRoomId, createdAtUtc: FixedNow.AddMinutes(1));
        seedDb.Users.AddRange(organizerA, organizerB);
        seedDb.Applications.AddRange(inVenue, inOtherVenue);
        await seedDb.SaveChangesAsync();

        await using var db = CreateContext();
        var repository = new EfApplicationRepository(db);
        var venueId = Guid.Parse("11111111-1111-1111-1111-111111111111");

        var (matching, matchingTotal) = await repository.GetForVenuesAsync([venueId], status: null, page: 1, pageSize: 24);
        var (both, bothTotal) = await repository.GetForVenuesAsync([venueId, otherVenueId], status: null, page: 1, pageSize: 24);

        Assert.Contains(matching, a => a.Id == inVenue.Id);
        Assert.DoesNotContain(matching, a => a.Id == inOtherVenue.Id);
        Assert.True(matchingTotal >= 1);
        Assert.Contains(both, a => a.Id == inVenue.Id);
        Assert.Contains(both, a => a.Id == inOtherVenue.Id);
        Assert.True(bothTotal >= 2);
    }

    [Fact]
    public async Task AddMessageAsync_PersistsAndSubsequentGetAsyncReturnsIt()
    {
        await using var seedDb = CreateContext();
        var organizer = NewUser();
        var application = NewApplication(organizer.Id);
        seedDb.Users.Add(organizer);
        seedDb.Applications.Add(application);
        await seedDb.SaveChangesAsync();

        var message = new ApplicationMessage
        {
            Id = Guid.NewGuid(),
            ApplicationId = application.Id,
            SenderId = organizer.Id,
            Body = "Can we bring extra chairs?",
            SentAtUtc = FixedNow.AddMinutes(5),
        };

        await using (var db = CreateContext())
        {
            var repository = new EfApplicationRepository(db);
            await repository.AddMessageAsync(message);
        }

        await using var readDb = CreateContext();
        var readRepository = new EfApplicationRepository(readDb);
        var reloaded = await readRepository.GetAsync(application.Id);

        Assert.NotNull(reloaded);
        var reloadedMessage = Assert.Single(reloaded!.Messages);
        Assert.Equal("Can we bring extra chairs?", reloadedMessage.Body);
        Assert.Equal(organizer.Id, reloadedMessage.SenderId);
    }
}
