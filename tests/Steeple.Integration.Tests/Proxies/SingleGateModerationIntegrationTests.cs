using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Steeple.Admin.Services.Admin;
using Steeple.Api.Configuration;
using Steeple.Api.Contracts.Manage;
using Steeple.Api.Services;
using Steeple.Integration.Tests.Fixtures;

namespace Steeple.Integration.Tests.Proxies;

/// <summary>
/// The whole moderation loop across both halves that own it: <see cref="ManageService"/> (the API,
/// where the venue-scoped review rule lives) and <see cref="PostgresAdminWorkspace"/> (the operator's
/// decision). Drives the real code against the real
/// schema: a newly claimed venue's first listing waits for a human; approval publishes it, verifies the venue
/// and writes the inbox row; later rooms at that venue publish themselves, while new venues wait.
/// </summary>
[Collection(PostgresCollection.Name)]
public class SingleGateModerationIntegrationTests
{
    private static readonly DateTimeOffset FixedNow = new(2026, 7, 4, 12, 0, 0, TimeSpan.Zero);

    private readonly PostgresDatabaseFixture _fixture;

    public SingleGateModerationIntegrationTests(PostgresDatabaseFixture fixture) => _fixture = fixture;

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

    /// <summary>The real Admin workspace over its own scoped DbContexts, as it runs in the app.</summary>
    private IAdminWorkspace CreateWorkspace()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddDbContext<SteepleDbContext>(options => options.UseNpgsql(_fixture.ConnectionString));
        var provider = services.BuildServiceProvider();
        return new PostgresAdminWorkspace(
            provider.GetRequiredService<IServiceScopeFactory>(),
            provider.GetRequiredService<ILogger<PostgresAdminWorkspace>>());
    }

    // ----- The acceptance arc -------------------------------------------------------------------

    [Fact]
    public async Task FirstListingWaitsForAHuman_ApprovalPublishesVerifiesAndNotifies_ThenTheSecondPublishesItself()
    {
        var host = await NewHostAsync();
        var (venueId, firstRoomId) = await CreateVenueWithPublishRequestAsync(host.Id, "Trinity Fellowship Hall", "Fellowship Hall");

        // 1. The first listing does not publish itself — it waits in the queue.
        await using (var db = CreateContext())
        {
            var room = await db.Rooms.SingleAsync(r => r.Id == firstRoomId);
            Assert.Equal(RoomStatus.Draft, room.Status);
            Assert.Equal(FixedNow, room.PublishRequestedAtUtc);
            Assert.Null(room.FirstPublishedAtUtc);
            Assert.False(await db.Venues.Where(v => v.Id == venueId).Select(v => v.IsIdentityVerified).SingleAsync());
        }

        var workspace = CreateWorkspace();
        Assert.Contains(workspace.Snapshot().ReviewQueue.PublishRequests, r => r.RoomId == firstRoomId);

        // 2. One decision: publish + verify + notify.
        Assert.Null(workspace.DecidePublishRequest(firstRoomId, approve: true, "Lovely space — welcome.", "operator@steeple"));

        await using (var db = CreateContext())
        {
            var room = await db.Rooms.SingleAsync(r => r.Id == firstRoomId);
            Assert.Equal(RoomStatus.Published, room.Status);
            Assert.NotNull(room.FirstPublishedAtUtc);
            Assert.Null(room.PublishRequestedAtUtc);

            var venue = await db.Venues.SingleAsync(v => v.Id == venueId);
            Assert.True(venue.IsIdentityVerified); // invariant: published ⇒ venue verified

            var notification = await db.Notifications
                .Where(n => n.UserId == host.Id && n.Type == NotificationType.ListingApproved)
                .SingleAsync();
            Assert.Contains(room.Slug, notification.PayloadJson);
            Assert.Contains("Lovely space", notification.PayloadJson);
        }

        Assert.DoesNotContain(CreateWorkspace().Snapshot().ReviewQueue.PublishRequests, r => r.RoomId == firstRoomId);

        // 3. The same host's next listing needs no operator at all.
        Guid secondRoomId;
        await using (var db = CreateContext())
        {
            var service = CreateService(db);
            var created = await service.CreateRoomAsync(host.Id, venueId, NewSaveRoomRequest("Quiet Room"));
            secondRoomId = created.Value!.Resource.Id;
            await AddPhotoAsync(db, secondRoomId);

            var published = await service.UpdateRoomAsync(host.Id, secondRoomId, NewSaveRoomRequest("Quiet Room", status: "published"));
            Assert.Null(published.Error);
            Assert.Equal("published", published.Value!.Status);
        }

        await using (var db = CreateContext())
        {
            var room = await db.Rooms.SingleAsync(r => r.Id == secondRoomId);
            Assert.Equal(RoomStatus.Published, room.Status);
            Assert.Equal(FixedNow, room.FirstPublishedAtUtc);
            Assert.Null(room.PublishRequestedAtUtc); // never queued
        }

        Assert.DoesNotContain(CreateWorkspace().Snapshot().ReviewQueue.PublishRequests, r => r.RoomId == secondRoomId);
    }

    [Fact]
    public async Task ApprovedHostBrandNewVenue_StillRequiresVenueScopedReview()
    {
        var host = await NewHostAsync();
        var (_, firstRoomId) = await CreateVenueWithPublishRequestAsync(host.Id, "Cedar Lane Meeting House", "Main Hall");
        Assert.Null(CreateWorkspace().DecidePublishRequest(firstRoomId, approve: true, null, "operator@steeple"));

        // A second, entirely separate venue by the already-approved host.
        Guid secondVenueId;
        Guid roomId;
        await using (var db = CreateContext())
        {
            var service = CreateService(db);
            secondVenueId = (await service.CreateVenueAsync(host.Id, NewSaveVenueRequest("Cedar Lane Annex"))).Value!.Resource.Id;
            roomId = (await service.CreateRoomAsync(host.Id, secondVenueId, NewSaveRoomRequest("Annex Room"))).Value!.Resource.Id;
            await AddPhotoAsync(db, roomId);
            Assert.Null((await service.UpdateRoomAsync(host.Id, roomId, NewSaveRoomRequest("Annex Room", status: "published"))).Error);
        }

        await using (var db = CreateContext())
        {
            var room = await db.Rooms.SingleAsync(r => r.Id == roomId);
            Assert.Equal(RoomStatus.Draft, room.Status);
            Assert.Equal(FixedNow, room.PublishRequestedAtUtc);
            Assert.False(await db.Venues.Where(v => v.Id == secondVenueId).Select(v => v.IsIdentityVerified).SingleAsync());
        }
    }

    [Fact]
    public async Task UntrustedHostStaysUntrusted_AnotherHostsApprovalIsNotTheirs()
    {
        var approvedHost = await NewHostAsync();
        var (_, approvedRoomId) = await CreateVenueWithPublishRequestAsync(approvedHost.Id, "Grace Chapel Hall", "Chapel Hall");
        Assert.Null(CreateWorkspace().DecidePublishRequest(approvedRoomId, approve: true, null, "operator@steeple"));

        var newcomer = await NewHostAsync("Newcomer Nia");
        var (newcomerVenueId, newcomerRoomId) = await CreateVenueWithPublishRequestAsync(newcomer.Id, "Riverside Hall", "Riverside Room");

        await using var db = CreateContext();
        var room = await db.Rooms.SingleAsync(r => r.Id == newcomerRoomId);
        Assert.Equal(RoomStatus.Draft, room.Status); // trust is per-host, not global
        Assert.NotNull(room.PublishRequestedAtUtc);
        Assert.False(await db.Venues.Where(v => v.Id == newcomerVenueId).Select(v => v.IsIdentityVerified).SingleAsync());
    }

    [Fact]
    public async Task Decline_ClearsTheRequestNotifiesAndConsumesTheEvidenceSoTheHostCanResubmit()
    {
        var host = await NewHostAsync();
        var (venueId, roomId) = await CreateVenueWithPublishRequestAsync(host.Id, "Northside Rooms", "Upper Room");

        await using (var db = CreateContext())
        {
            var submitted = await CreateService(db).SubmitVenueVerificationAsync(host.Id, venueId, NewVerificationRequest());
            Assert.Null(submitted.Error);
        }

        Assert.Null(CreateWorkspace().DecidePublishRequest(roomId, approve: false, "Add a photo of the entrance.", "operator@steeple"));

        await using (var db = CreateContext())
        {
            var room = await db.Rooms.SingleAsync(r => r.Id == roomId);
            Assert.Equal(RoomStatus.Draft, room.Status);
            Assert.Null(room.PublishRequestedAtUtc);
            Assert.Null(room.FirstPublishedAtUtc);
            Assert.False(await db.Venues.Where(v => v.Id == venueId).Select(v => v.IsIdentityVerified).SingleAsync());

            var notification = await db.Notifications
                .Where(n => n.UserId == host.Id && n.Type == NotificationType.ListingDeclined)
                .SingleAsync();
            Assert.Contains("Add a photo of the entrance.", notification.PayloadJson);

            var evidence = await db.VenueVerificationRequests.SingleAsync(r => r.VenueId == venueId);
            Assert.Equal(VenueVerificationStatus.Declined, evidence.Status);
            Assert.Equal("operator@steeple", evidence.DecidedBy);
        }

        // The decision consumed the evidence, so a fixed-up host isn't stuck behind a stale pending.
        await using (var db = CreateContext())
        {
            var resubmitted = await CreateService(db).SubmitVenueVerificationAsync(host.Id, venueId, NewVerificationRequest());
            Assert.Null(resubmitted.Error);
        }
    }

    [Fact]
    public async Task DecidingAnAlreadyDecidedRequest_IsRefusedNotDoubleApplied()
    {
        var host = await NewHostAsync();
        var (_, roomId) = await CreateVenueWithPublishRequestAsync(host.Id, "Second Decision Hall", "Hall");
        var workspace = CreateWorkspace();
        Assert.Null(workspace.DecidePublishRequest(roomId, approve: true, null, "operator@steeple"));

        Assert.NotNull(workspace.DecidePublishRequest(roomId, approve: true, null, "someone-else@steeple"));

        await using var db = CreateContext();
        Assert.Single(await db.Notifications.Where(n => n.UserId == host.Id).ToListAsync());
    }

    // ----- Takedown lever -----------------------------------------------------------------------

    [Fact]
    public async Task UnlistRoom_PublishedRoomWithoutBookings_UnlistsIt()
    {
        var host = await NewHostAsync();
        var (_, roomId) = await CreateVenueWithPublishRequestAsync(host.Id, "Takedown Hall", "Back Room");
        var workspace = CreateWorkspace();
        Assert.Null(workspace.DecidePublishRequest(roomId, approve: true, null, "operator@steeple"));

        Assert.Null(workspace.UnlistRoom(roomId, "operator@steeple"));

        await using (var db = CreateContext())
        {
            var room = await db.Rooms.SingleAsync(r => r.Id == roomId);
            Assert.Equal(RoomStatus.Unlisted, room.Status);
            Assert.NotNull(room.OperatorUnlistedAtUtc);
            Assert.Equal("operator@steeple", room.OperatorUnlistedBy);

            var relist = await CreateService(db).UpdateRoomAsync(
                host.Id, roomId, NewSaveRoomRequest("Back Room", status: "published"));
            Assert.Equal(ManageErrorCodes.OperatorUnlisted, relist.Error!.Code);
            Assert.Equal(RoomStatus.Unlisted, room.Status);

            // The database closes the concurrent stale-read race too: even a write that bypasses
            // ManageService cannot combine Published with the operator marker.
            room.Status = RoomStatus.Published;
            await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        }
    }

    [Fact]
    public async Task UnlistRoom_RoomWithUpcomingConfirmedBooking_IsStillTakenDown()
    {
        var host = await NewHostAsync();
        var (_, roomId) = await CreateVenueWithPublishRequestAsync(host.Id, "Committed Hall", "Committed Room");
        var workspace = CreateWorkspace();
        Assert.Null(workspace.DecidePublishRequest(roomId, approve: true, null, "operator@steeple"));
        await SeedFutureConfirmedBookingAsync(roomId);

        Assert.Null(workspace.UnlistRoom(roomId, "operator@steeple"));

        await using var db = CreateContext();
        var room = await db.Rooms.SingleAsync(r => r.Id == roomId);
        Assert.Equal(RoomStatus.Unlisted, room.Status);
        Assert.NotNull(room.OperatorUnlistedAtUtc);
    }

    [Fact]
    public async Task UnlistRoom_RoomThatIsNotPublished_SaysSoInsteadOfChangingAnything()
    {
        var host = await NewHostAsync();
        var (_, roomId) = await CreateVenueWithPublishRequestAsync(host.Id, "Draft Hall", "Draft Room");

        var error = CreateWorkspace().UnlistRoom(roomId, "operator@steeple");

        Assert.NotNull(error);
        await using var db = CreateContext();
        Assert.Equal(RoomStatus.Draft, await db.Rooms.Where(r => r.Id == roomId).Select(r => r.Status).SingleAsync());
    }

    // ----- Rig ----------------------------------------------------------------------------------

    private async Task<User> NewHostAsync(string displayName = "Host Hana")
    {
        var user = new User
        {
            Id = Guid.NewGuid(),
            DisplayName = displayName,
            Email = $"{Guid.NewGuid():N}@example.com",
            CreatedAtUtc = FixedNow,
        };

        await using var db = CreateContext();
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    /// <summary>Creates a venue + photographed room for the host and asks to publish it.</summary>
    private async Task<(Guid VenueId, Guid RoomId)> CreateVenueWithPublishRequestAsync(Guid hostId, string venueName, string roomName)
    {
        await using var db = CreateContext();
        var service = CreateService(db);

        var venue = await service.CreateVenueAsync(hostId, NewSaveVenueRequest(venueName));
        Assert.Null(venue.Error);
        var room = await service.CreateRoomAsync(hostId, venue.Value!.Resource.Id, NewSaveRoomRequest(roomName));
        Assert.Null(room.Error);
        await AddPhotoAsync(db, room.Value!.Resource.Id);

        var published = await service.UpdateRoomAsync(hostId, room.Value.Resource.Id, NewSaveRoomRequest(roomName, status: "published"));
        Assert.Null(published.Error);
        return (venue.Value.Resource.Id, room.Value.Resource.Id);
    }

    private static async Task AddPhotoAsync(SteepleDbContext db, Guid roomId)
    {
        db.RoomPhotos.Add(new RoomPhoto
        {
            Id = Guid.NewGuid(),
            RoomId = roomId,
            Url = "https://cdn.example.org/media/gate-1600.jpg",
            CreatedAtUtc = FixedNow,
            IsPrimary = true,
            SortOrder = 0,
        });
        await db.SaveChangesAsync();
    }

    /// <summary>
    /// A confirmed booking with an occurrence in the real future (the takedown guard reads the wall
    /// clock, not this suite's fixed clock).
    /// </summary>
    private async Task SeedFutureConfirmedBookingAsync(Guid roomId)
    {
        var startUtc = DateTimeOffset.UtcNow.AddDays(30);
        var organizer = await NewHostAsync("Booked Organizer");
        var application = new Application
        {
            Id = Guid.NewGuid(),
            RoomId = roomId,
            OrganizerId = organizer.Id,
            ActivityType = ActivityType.Community,
            GroupSize = 10,
            Frequency = ScheduleFrequency.OneOff,
            StartDate = DateOnly.FromDateTime(startUtc.UtcDateTime),
            StartTime = new TimeOnly(9, 0),
            EndTime = new TimeOnly(11, 0),
            IntentText = "A future community gathering.",
            Status = ApplicationStatus.Approved,
            DecidedAtUtc = FixedNow,
            CreatedAtUtc = FixedNow,
            ExpiresAtUtc = FixedNow.AddDays(14),
        };
        var booking = new Booking
        {
            Id = Guid.NewGuid(),
            ApplicationId = application.Id,
            RoomId = roomId,
            OrganizerId = organizer.Id,
            Type = BookingType.OneOff,
            StartDate = application.StartDate,
            EndDate = application.StartDate,
            StartTime = application.StartTime,
            EndTime = application.EndTime,
            Status = BookingStatus.Confirmed,
            CreatedAtUtc = FixedNow,
        };

        await using var db = CreateContext();
        db.Applications.Add(application);
        db.Bookings.Add(booking);
        db.BookingOccurrences.Add(new BookingOccurrence
        {
            Id = Guid.NewGuid(),
            BookingId = booking.Id,
            RoomId = roomId,
            StartUtc = startUtc,
            EndUtc = startUtc.AddHours(2),
            LocalDate = application.StartDate,
            Status = OccurrenceStatus.Scheduled,
        });
        await db.SaveChangesAsync();
    }

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

    private static SaveRoomRequest NewSaveRoomRequest(string name, string? status = null) => new(
        Name: name,
        Description: "A flexible meeting space.",
        Capacity: 40,
        PricePerHour: 30m,
        HouseRules: null,
        Status: status,
        Activities: null,
        Amenities: null,
        Accessibility: null);

    private static SubmitVenueVerificationRequest NewVerificationRequest() => new(
        ContactName: "Host Hana",
        ContactEmail: "hana@example.com",
        EvidenceSummary: "Signed facilities lease authorizing this manager to list rooms for community use.",
        AttestedAuthority: true,
        Documents: [new VenueVerificationDocumentRequest("Facilities lease", "https://docs.example.org/facilities-lease.pdf")]);

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
    /// Resolves every address to a point deliberately *south-west of the discovery fixtures' search
    /// box* (`RoomRepositoryTests.FullBeachheadBounds`). This suite is the only one that publishes
    /// rooms into the shared test database, and those suites assert absolute counts of published
    /// rooms — parking this suite's supply outside their bounds keeps both honest without either
    /// having to know about the other. The geofence fake below is widened to match.
    /// </summary>
    private sealed class FakeGeocodingGateway : IGeocodingGateway
    {
        public static readonly GeoPoint OutsideDiscoveryFixtures = new(38.60, -77.60);

        public Task<GeoPoint?> GeocodeAsync(string address, CancellationToken ct = default) =>
            Task.FromResult<GeoPoint?>(OutsideDiscoveryFixtures);

        public Task<IReadOnlyList<AddressSuggestion>> AutocompleteAsync(string text, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<AddressSuggestion>>([]);
    }

}
