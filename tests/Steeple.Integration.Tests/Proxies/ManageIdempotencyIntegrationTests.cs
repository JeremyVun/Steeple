using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Steeple.Api.Configuration;
using Steeple.Api.Contracts.Manage;
using Steeple.Api.Services;
using Steeple.Integration.Tests.Fixtures;

namespace Steeple.Integration.Tests.Proxies;
/// <summary>
/// Proves the <c>Idempotency-Key</c> guard on the two manage creates (D8) against a real Postgres:
/// a replay returns the original resource instead of making a second one, keys are scoped to the
/// user who spent them, and a request without a key behaves exactly as it always did.
///
/// Each call gets its own DbContext + service — one context per request, as the API does — so a
/// replay can only be resolved from the database, never from a warm change tracker.
/// </summary>
[Collection(PostgresCollection.Name)]
public class ManageIdempotencyIntegrationTests
{
    private static readonly DateTimeOffset FixedNow = new(2026, 8, 5, 12, 0, 0, TimeSpan.Zero);

    private readonly PostgresDatabaseFixture _fixture;

    public ManageIdempotencyIntegrationTests(PostgresDatabaseFixture fixture) => _fixture = fixture;

    // ----- Venues ---------------------------------------------------------------------------

    [Fact]
    public async Task CreateVenue_SameKeyTwice_CreatesOneVenueAndReplaysTheOriginal()
    {
        var host = await NewHostAsync();
        var key = Guid.NewGuid();

        var first = await CreateVenueAsync(host, "Idempotent Hall", key);
        var second = await CreateVenueAsync(host, "Idempotent Hall", key);

        Assert.True(first.Created);
        Assert.False(second.Created);
        Assert.Equal(first.Resource.Id, second.Resource.Id);
        Assert.Equal(first.Resource.Slug, second.Resource.Slug);
        Assert.Equal(1, await CountVenuesManagedByAsync(host));
    }

    [Fact]
    public async Task CreateVenue_SameKeyDifferentUsers_CreatesAVenueEach()
    {
        var alice = await NewHostAsync();
        var bob = await NewHostAsync();
        var sharedKey = Guid.NewGuid();

        var aliceVenue = await CreateVenueAsync(alice, "Alice Hall", sharedKey);
        var bobVenue = await CreateVenueAsync(bob, "Bob Hall", sharedKey);

        Assert.True(aliceVenue.Created);
        Assert.True(bobVenue.Created);
        Assert.NotEqual(aliceVenue.Resource.Id, bobVenue.Resource.Id);
        Assert.Equal("Bob Hall", bobVenue.Resource.Name);
        Assert.Equal(1, await CountVenuesManagedByAsync(alice));
        Assert.Equal(1, await CountVenuesManagedByAsync(bob));
    }

    [Fact]
    public async Task CreateVenue_WithoutAKey_StillCreatesEveryTime()
    {
        var host = await NewHostAsync();

        var first = await CreateVenueAsync(host, "Unguarded Hall");
        var second = await CreateVenueAsync(host, "Unguarded Hall");

        Assert.True(first.Created);
        Assert.True(second.Created);
        Assert.NotEqual(first.Resource.Id, second.Resource.Id);
        Assert.Equal(2, await CountVenuesManagedByAsync(host));
    }

    // ----- Rooms ----------------------------------------------------------------------------

    [Fact]
    public async Task CreateRoom_SameKeyTwice_CreatesOneRoomAndReplaysTheOriginal()
    {
        var host = await NewHostAsync();
        var venueId = (await CreateVenueAsync(host, "Room Idempotency Venue")).Resource.Id;
        var key = Guid.NewGuid();

        var first = await CreateRoomAsync(host, venueId, "Idempotent Room", key);
        var second = await CreateRoomAsync(host, venueId, "Idempotent Room", key);

        Assert.True(first.Created);
        Assert.False(second.Created);
        Assert.Equal(first.Resource.Id, second.Resource.Id);
        Assert.Equal(first.Resource.Slug, second.Resource.Slug);
        Assert.Equal(1, await CountRoomsInAsync(venueId));
    }

    [Fact]
    public async Task CreateRoom_SameKeyDifferentUsers_CreatesARoomEach()
    {
        var alice = await NewHostAsync();
        var bob = await NewHostAsync();
        var aliceVenue = (await CreateVenueAsync(alice, "Alice Rooms")).Resource.Id;
        var bobVenue = (await CreateVenueAsync(bob, "Bob Rooms")).Resource.Id;
        var sharedKey = Guid.NewGuid();

        var aliceRoom = await CreateRoomAsync(alice, aliceVenue, "Alice Room", sharedKey);
        var bobRoom = await CreateRoomAsync(bob, bobVenue, "Bob Room", sharedKey);

        Assert.True(aliceRoom.Created);
        Assert.True(bobRoom.Created);
        Assert.NotEqual(aliceRoom.Resource.Id, bobRoom.Resource.Id);
        Assert.Equal(bobVenue, bobRoom.Resource.VenueId);
        Assert.Equal(1, await CountRoomsInAsync(aliceVenue));
        Assert.Equal(1, await CountRoomsInAsync(bobVenue));
    }

    // ----- The actual hazard: an abandoned create still in flight when the retry lands ---------

    [Fact]
    public async Task CreateVenue_TwoOverlappingRequestsWithOneKey_StillCreatesExactlyOneVenue()
    {
        var host = await NewHostAsync();
        var key = Guid.NewGuid();

        var outcomes = await Task.WhenAll(
            CreateVenueAsync(host, "Raced Hall", key),
            CreateVenueAsync(host, "Raced Hall", key));

        // Whoever lost — on the ledger's primary key, or on its own replay check — answers with
        // the winner's venue, and the DB holds one.
        Assert.Equal(outcomes[0].Resource.Id, outcomes[1].Resource.Id);
        Assert.Equal(1, await CountVenuesManagedByAsync(host));
    }

    // ----- Scope isolation ------------------------------------------------------------------

    [Fact]
    public async Task OneKeySpentOnAVenueThenARoom_AnswersEachWithItsOwnResource()
    {
        var host = await NewHostAsync();
        var key = Guid.NewGuid();

        var venue = await CreateVenueAsync(host, "Shared Key Venue", key);
        var room = await CreateRoomAsync(host, venue.Resource.Id, "Shared Key Room", key);

        // Same key, different create: the room must not be answered with the venue's replay.
        Assert.True(venue.Created);
        Assert.True(room.Created);
        Assert.Equal(venue.Resource.Id, room.Resource.VenueId);

        // Two ledger rows, one per scope — the scope is what keeps the key spendable twice.
        await using var db = CreateContext();
        var spent = await db.IdempotencyRecords
            .Where(r => r.UserId == host && r.Key == key)
            .OrderBy(r => r.Scope)
            .ToListAsync();

        Assert.Collection(
            spent,
            r => Assert.Equal((IdempotencyScopes.ManageRoomCreate, room.Resource.Id), (r.Scope, r.ResourceId)),
            r => Assert.Equal((IdempotencyScopes.ManageVenueCreate, venue.Resource.Id), (r.Scope, r.ResourceId)));
    }

    // ----- Harness --------------------------------------------------------------------------

    private async Task<Guid> NewHostAsync()
    {
        var host = new User
        {
            Id = Guid.NewGuid(),
            DisplayName = "Idempotency Host",
            Email = $"{Guid.NewGuid():N}@example.com",
            CreatedAtUtc = FixedNow,
        };

        await using var db = CreateContext();
        db.Users.Add(host);
        await db.SaveChangesAsync();
        return host.Id;
    }

    private async Task<CreateOutcome<ManagedVenueDetailDto>> CreateVenueAsync(Guid hostId, string name, Guid? key = null)
    {
        await using var db = CreateContext();
        var result = await CreateService(db).CreateVenueAsync(hostId, NewSaveVenueRequest(name), key);
        Assert.Null(result.Error);
        return result.Value!;
    }

    private async Task<CreateOutcome<ManagedRoomDto>> CreateRoomAsync(Guid hostId, Guid venueId, string name, Guid? key = null)
    {
        await using var db = CreateContext();
        var result = await CreateService(db).CreateRoomAsync(hostId, venueId, NewSaveRoomRequest(name), key);
        Assert.Null(result.Error);
        return result.Value!;
    }

    private async Task<int> CountVenuesManagedByAsync(Guid hostId)
    {
        await using var db = CreateContext();
        return await db.VenueManagers.CountAsync(m => m.UserId == hostId);
    }

    private async Task<int> CountRoomsInAsync(Guid venueId)
    {
        await using var db = CreateContext();
        return await db.Rooms.CountAsync(r => r.VenueId == venueId);
    }

    private SteepleDbContext CreateContext() =>
        new(new DbContextOptionsBuilder<SteepleDbContext>()
            .UseNpgsql(_fixture.ConnectionString)
            .Options);

    private static IManageService CreateService(SteepleDbContext db) => new ManageService(
        new EfManageRepository(db),
        new EfVenueManagerRepository(db),
        new FakeGeocodingGateway(),
        new NullAnalytics(),
        new DisabledFeatureFlags(),
        new AvailabilityService(
            new EfAvailabilityRepository(db), new EfVenueManagerRepository(db), new NullAnalytics(), new FixedTimeProvider(FixedNow)),
        new FixedTimeProvider(FixedNow),
        Options.Create(new GeocodingOptions()));

    private static SaveVenueRequest NewSaveVenueRequest(string name) => new(
        Name: name,
        Description: "A welcoming space for community groups.",
        VenueType: "church",
        AddressLine: "789 Fellowship Way",
        Suburb: "Vienna",
        Postcode: "22180",
        ContactEmail: "hello@example.org",
        ParkingInfo: null,
        TransitInfo: null);

    private static SaveRoomRequest NewSaveRoomRequest(string name) => new(
        Name: name,
        Description: "A flexible meeting space.",
        Capacity: 40,
        PricePerHour: 30m,
        HouseRules: null,
        Status: null,
        Activities: null,
        Amenities: null,
        Accessibility: null);

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    private sealed class NullAnalytics : IAnalyticsSink
    {
        public Task TrackAsync(string eventType, object? payload = null, string? sessionId = null, CancellationToken ct = default) =>
            Task.CompletedTask;
    }

    private sealed class DisabledFeatureFlags : IFeatureFlags
    {
        public bool IsEnabled(string key) => false;
    }

    /// <summary>
    /// Resolves every address south-west of the discovery fixtures' search box, matching
    /// <c>SingleGateModerationIntegrationTests</c>: this suite's venues share a database with
    /// suites that assert absolute supply counts, so its rows stay outside their bounds.
    /// </summary>
    private sealed class FakeGeocodingGateway : IGeocodingGateway
    {
        public Task<GeoPoint?> GeocodeAsync(string address, CancellationToken ct = default) =>
            Task.FromResult<GeoPoint?>(new GeoPoint(38.60, -77.60));

        public Task<IReadOnlyList<AddressSuggestion>> AutocompleteAsync(string text, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<AddressSuggestion>>([]);
    }

}
