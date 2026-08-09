using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Npgsql;
using Steeple.Api.Contracts.Manage;
using Steeple.Api.Proxies.Manage;
using Steeple.Api.Proxies.Media;
using Steeple.Api.Services.Media;
using Steeple.Integration.Tests.Fixtures;

namespace Steeple.Integration.Tests.Proxies;

/// <summary>Database and object-store integrity proofs for room-photo writes.</summary>
[Collection(PostgresCollection.Name)]
public sealed class MediaIntegrityIntegrationTests
{
    private static readonly DateTimeOffset FixedNow = new(2026, 8, 9, 12, 0, 0, TimeSpan.Zero);
    private readonly PostgresDatabaseFixture _fixture;

    public MediaIntegrityIntegrationTests(PostgresDatabaseFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task MigrationRepairsLegacyDuplicateRowsBeforeAddingConstraints()
    {
        var listing = await SeedListingAsync();
        await using var connection = new NpgsqlConnection(_fixture.ConnectionString);
        await connection.OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync();

        await using (var removeGuards = new NpgsqlCommand(
            """
            DROP INDEX "IX_room_photos_StorageKey";
            DROP INDEX "IX_room_photos_RoomId_SortOrder";
            DROP INDEX "IX_room_photos_RoomId_IsPrimary";
            """, connection, transaction))
        {
            await removeGuards.ExecuteNonQueryAsync();
        }

        await using (var seedDuplicates = new NpgsqlCommand(
            """
            INSERT INTO room_photos
                ("Id", "RoomId", "Url", "StorageKey", "IsPrimary", "SortOrder")
            VALUES
                (@first,  @room, 'media/legacy-1600.jpg', 'rooms/shared/legacy', true, 7),
                (@second, @room, 'media/legacy-1600.jpg', 'rooms/shared/legacy', true, 7),
                (@third,  @room, 'media/legacy-1600.jpg', 'rooms/shared/legacy', false, 2);
            """, connection, transaction))
        {
            seedDuplicates.Parameters.AddWithValue("first", Guid.NewGuid());
            seedDuplicates.Parameters.AddWithValue("second", Guid.NewGuid());
            seedDuplicates.Parameters.AddWithValue("third", Guid.NewGuid());
            seedDuplicates.Parameters.AddWithValue("room", listing.RoomId);
            await seedDuplicates.ExecuteNonQueryAsync();
        }

        var migration = await File.ReadAllTextAsync(Path.Combine(FindRepoRoot(), "db", "changelog", "019-photo-integrity.sql"));
        await using (var applyRepair = new NpgsqlCommand(migration, connection, transaction))
        {
            await applyRepair.ExecuteNonQueryAsync();
        }

        await using (var verify = new NpgsqlCommand(
            """
            SELECT count(*) FILTER (WHERE "StorageKey" IS NULL),
                   count(*) FILTER (WHERE "IsPrimary" = true),
                   array_agg("SortOrder" ORDER BY "SortOrder")
            FROM room_photos
            WHERE "RoomId" = @room;
            """, connection, transaction))
        {
            verify.Parameters.AddWithValue("room", listing.RoomId);
            await using var reader = await verify.ExecuteReaderAsync();
            Assert.True(await reader.ReadAsync());
            Assert.Equal(3, reader.GetInt64(0));
            Assert.Equal(1, reader.GetInt64(1));
            Assert.Equal([0, 1, 2], reader.GetFieldValue<int[]>(2));
        }

        await transaction.RollbackAsync();
    }

    [Fact]
    public async Task StorageKeyConstraint_RejectsSharedObjectOwnership()
    {
        var listing = await SeedListingAsync();
        await using var db = CreateContext();
        db.RoomPhotos.AddRange(
            NewPhoto(listing.RoomId, 0, false, "rooms/shared/key"),
            NewPhoto(listing.RoomId, 1, false, "rooms/shared/key"));

        await AssertUniqueViolationAsync(db, "IX_room_photos_StorageKey");
    }

    [Fact]
    public async Task SortOrderConstraint_RejectsTwoPhotosAtTheSamePosition()
    {
        var listing = await SeedListingAsync();
        await using var db = CreateContext();
        db.RoomPhotos.AddRange(
            NewPhoto(listing.RoomId, 0, false, $"rooms/{listing.RoomId}/{Guid.NewGuid()}"),
            NewPhoto(listing.RoomId, 0, false, $"rooms/{listing.RoomId}/{Guid.NewGuid()}"));

        await AssertUniqueViolationAsync(db, "IX_room_photos_RoomId_SortOrder");
    }

    [Fact]
    public async Task PrimaryConstraint_RejectsTwoCoversForOneRoom()
    {
        var listing = await SeedListingAsync();
        await using var db = CreateContext();
        db.RoomPhotos.AddRange(
            NewPhoto(listing.RoomId, 0, true, $"rooms/{listing.RoomId}/{Guid.NewGuid()}"),
            NewPhoto(listing.RoomId, 1, true, $"rooms/{listing.RoomId}/{Guid.NewGuid()}"));

        await AssertUniqueViolationAsync(db, "IX_room_photos_RoomId_IsPrimary");
    }

    [Fact]
    public async Task ConcurrentIdenticalUploads_OwnDistinctObjectsAndChooseOnePrimary()
    {
        var listing = await SeedListingAsync();
        using var media = new TemporaryMediaStore();
        var processor = new GatedImageProcessor(participantCount: 2);

        await using var firstDb = CreateContext();
        await using var secondDb = CreateContext();
        var first = CreateService(firstDb, processor, media.Store);
        var second = CreateService(secondDb, processor, media.Store);

        var uploads = await Task.WhenAll(
            first.UploadPhotoAsync(listing.ManagerId, listing.RoomId, new MemoryStream([0x01]), null),
            second.UploadPhotoAsync(listing.ManagerId, listing.RoomId, new MemoryStream([0x01]), null));

        Assert.All(uploads, upload => Assert.Null(upload.Error));
        await using var verifyDb = CreateContext();
        var photos = await verifyDb.RoomPhotos
            .Where(photo => photo.RoomId == listing.RoomId)
            .OrderBy(photo => photo.SortOrder)
            .ToListAsync();
        Assert.Equal(2, photos.Count);
        Assert.Equal(2, photos.Select(photo => photo.StorageKey).Distinct().Count());
        Assert.Single(photos, photo => photo.IsPrimary);
        Assert.Equal([0, 1], photos.Select(photo => photo.SortOrder));
    }

    [Fact]
    public async Task PartialVariantFailure_RemovesEveryVariantAlreadyWritten()
    {
        var listing = await SeedListingAsync();
        using var media = new TemporaryMediaStore();
        var store = new FailBeforePutMediaStore(media.Store, failOnCall: 2);
        await using var db = CreateContext();

        await Assert.ThrowsAsync<IOException>(() => CreateService(db, new FixedImageProcessor(), store)
            .UploadPhotoAsync(listing.ManagerId, listing.RoomId, new MemoryStream([0x01]), null));

        Assert.Empty(media.Files());
    }

    [Fact]
    public async Task DatabaseFailureAfterUpload_RemovesEveryVariantWritten()
    {
        var listing = await SeedListingAsync();
        using var media = new TemporaryMediaStore();
        var store = new AfterPutMediaStore(media.Store, MediaVariants.Widths.Length, async () =>
        {
            await using var deletingDb = CreateContext();
            var room = await deletingDb.Rooms.SingleAsync(candidate => candidate.Id == listing.RoomId);
            deletingDb.Rooms.Remove(room);
            await deletingDb.SaveChangesAsync();
        });
        await using var db = CreateContext();

        await Assert.ThrowsAnyAsync<DbUpdateException>(() => CreateService(db, new FixedImageProcessor(), store)
            .UploadPhotoAsync(listing.ManagerId, listing.RoomId, new MemoryStream([0x01]), null));

        Assert.Empty(media.Files());
    }

    [Fact]
    public async Task UploadSamePhotoTwice_DeleteOne_LeavesTheOtherRenderable()
    {
        var listing = await SeedListingAsync();
        using var media = new TemporaryMediaStore();
        Guid firstPhotoId;
        Guid secondPhotoId;

        await using (var uploadDb = CreateContext())
        {
            var service = CreateService(uploadDb, new FixedImageProcessor(), media.Store);
            firstPhotoId = (await service.UploadPhotoAsync(
                listing.ManagerId, listing.RoomId, new MemoryStream([0x01]), null)).Value!.Id;
        }

        await using (var uploadDb = CreateContext())
        {
            var service = CreateService(uploadDb, new FixedImageProcessor(), media.Store);
            secondPhotoId = (await service.UploadPhotoAsync(
                listing.ManagerId, listing.RoomId, new MemoryStream([0x01]), null)).Value!.Id;
        }

        await using (var deleteDb = CreateContext())
        {
            var deleted = await CreateService(deleteDb, new FixedImageProcessor(), media.Store)
                .DeletePhotoAsync(listing.ManagerId, firstPhotoId);
            Assert.Null(deleted.Error);
        }

        await using var verifyDb = CreateContext();
        var survivor = await verifyDb.RoomPhotos.SingleAsync(photo => photo.Id == secondPhotoId);
        Assert.True(File.Exists(media.ResolveUrl(survivor.Url)));
        Assert.True(File.Exists(media.ResolveUrl(survivor.CardUrl!)));
        Assert.True(File.Exists(media.ResolveUrl(survivor.ThumbUrl!)));
    }

    [Fact]
    public async Task MakingEachPhotoTheCoverInTurn_LeavesExactlyOneCoverEveryTime()
    {
        var listing = await SeedListingAsync();
        using var media = new TemporaryMediaStore();
        var photoIds = new[]
        {
            await UploadAsync(listing, media),
            await UploadAsync(listing, media),
            await UploadAsync(listing, media),
        };

        foreach (var photoId in new[] { photoIds[2], photoIds[0], photoIds[2], photoIds[1], photoIds[0] })
        {
            var updated = await UpdateAsync(listing, media, photoId, new UpdatePhotoRequest(null, true, null));
            Assert.Null(updated.Error);
            Assert.True(updated.Value!.IsPrimary);

            await using var verify = CreateContext();
            var photos = await verify.RoomPhotos.Where(photo => photo.RoomId == listing.RoomId).ToListAsync();
            Assert.Equal(photoId, Assert.Single(photos, photo => photo.IsPrimary).Id);
        }
    }

    [Fact]
    public async Task MovingAPhotoOntoAnOccupiedPosition_ResequencesItsSiblings()
    {
        var listing = await SeedListingAsync();
        using var media = new TemporaryMediaStore();
        var first = await UploadAsync(listing, media);
        var second = await UploadAsync(listing, media);
        var third = await UploadAsync(listing, media);

        var moved = await UpdateAsync(listing, media, third, new UpdatePhotoRequest(null, null, 0));
        Assert.Null(moved.Error);
        Assert.Equal(0, moved.Value!.SortOrder);
        Assert.Equal([third, first, second], await DisplayOrderAsync(listing.RoomId));

        // A position past the end lands last rather than opening a gap.
        var pushed = await UpdateAsync(listing, media, third, new UpdatePhotoRequest(null, null, 99));
        Assert.Null(pushed.Error);
        Assert.Equal(2, pushed.Value!.SortOrder);
        Assert.Equal([first, second, third], await DisplayOrderAsync(listing.RoomId));
    }

    [Fact]
    public async Task DeletingTheCover_PromotesTheNextPhotoWithoutTwoCoversExisting()
    {
        var listing = await SeedListingAsync();
        using var media = new TemporaryMediaStore();
        var cover = await UploadAsync(listing, media);
        var second = await UploadAsync(listing, media);
        var third = await UploadAsync(listing, media);

        await using (var db = CreateContext())
        {
            var deleted = await CreateService(db, new FixedImageProcessor(), media.Store)
                .DeletePhotoAsync(listing.ManagerId, cover);
            Assert.Null(deleted.Error);
        }

        await using var verify = CreateContext();
        var photos = await verify.RoomPhotos.Where(photo => photo.RoomId == listing.RoomId).ToListAsync();
        Assert.Equal([second, third], photos.OrderBy(photo => photo.SortOrder).Select(photo => photo.Id));
        Assert.Equal(second, Assert.Single(photos, photo => photo.IsPrimary).Id);
    }

    private async Task<Guid> UploadAsync(ListingFixture listing, TemporaryMediaStore media)
    {
        await using var db = CreateContext();
        var uploaded = await CreateService(db, new FixedImageProcessor(), media.Store)
            .UploadPhotoAsync(listing.ManagerId, listing.RoomId, new MemoryStream([0x01]), null);
        Assert.Null(uploaded.Error);
        return uploaded.Value!.Id;
    }

    private async Task<ManageResult<RoomPhotoDto>> UpdateAsync(
        ListingFixture listing, TemporaryMediaStore media, Guid photoId, UpdatePhotoRequest request)
    {
        await using var db = CreateContext();
        return await CreateService(db, new FixedImageProcessor(), media.Store)
            .UpdatePhotoAsync(listing.ManagerId, photoId, request);
    }

    private async Task<IReadOnlyList<Guid>> DisplayOrderAsync(Guid roomId)
    {
        await using var db = CreateContext();
        return await db.RoomPhotos
            .Where(photo => photo.RoomId == roomId)
            .OrderBy(photo => photo.SortOrder)
            .Select(photo => photo.Id)
            .ToListAsync();
    }

    private SteepleDbContext CreateContext() =>
        new(new DbContextOptionsBuilder<SteepleDbContext>()
            .UseNpgsql(_fixture.ConnectionString)
            .Options);

    private static MediaService CreateService(
        SteepleDbContext db,
        IImageProcessor processor,
        IMediaStore store) => new(
            new EfManageRepository(db),
            new EfMediaRepository(db),
            new EfVenueManagerRepository(db),
            processor,
            store,
            new NullAnalytics(),
            new FixedTimeProvider(FixedNow));

    private async Task<ListingFixture> SeedListingAsync()
    {
        var suffix = Guid.NewGuid().ToString("N");
        var user = new User
        {
            Id = Guid.NewGuid(),
            DisplayName = "Photo Test Host",
            Email = $"photo-{suffix}@example.com",
            CreatedAtUtc = FixedNow,
        };
        var venue = new Venue
        {
            Id = Guid.NewGuid(),
            Name = "Photo Test Venue",
            Slug = $"photo-venue-{suffix}",
            Description = "Fixture venue",
            Type = VenueType.Church,
            AddressLine = "1 Fixture Way",
            Suburb = "Vienna",
            Postcode = "22180",
            Latitude = 38.9,
            Longitude = -77.2,
            CreatedAtUtc = FixedNow,
            UpdatedAtUtc = FixedNow,
        };
        var room = new Room
        {
            Id = Guid.NewGuid(),
            VenueId = venue.Id,
            Name = "Photo Test Room",
            Slug = $"photo-room-{suffix}",
            Description = "Fixture room",
            Capacity = 20,
            PricePerHour = 20,
            Status = RoomStatus.Draft,
            CreatedAtUtc = FixedNow,
            UpdatedAtUtc = FixedNow,
        };
        var manager = new VenueManager
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            VenueId = venue.Id,
            CreatedAtUtc = FixedNow,
        };

        await using var db = CreateContext();
        db.AddRange(user, venue, room, manager);
        await db.SaveChangesAsync();
        return new ListingFixture(user.Id, room.Id);
    }

    private static RoomPhoto NewPhoto(Guid roomId, int sortOrder, bool isPrimary, string storageKey) => new()
    {
        Id = Guid.NewGuid(),
        RoomId = roomId,
        Url = $"media/{storageKey}/1600.jpg",
        ThumbUrl = $"media/{storageKey}/400.jpg",
        CardUrl = $"media/{storageKey}/800.jpg",
        StorageKey = storageKey,
        CreatedAtUtc = FixedNow,
        IsPrimary = isPrimary,
        SortOrder = sortOrder,
    };

    private static async Task AssertUniqueViolationAsync(SteepleDbContext db, string constraintName)
    {
        var exception = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        var postgres = Assert.IsType<PostgresException>(exception.InnerException);
        Assert.Equal(PostgresErrorCodes.UniqueViolation, postgres.SqlState);
        Assert.Equal(constraintName, postgres.ConstraintName);
    }

    private static string FindRepoRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "Steeple.slnx")))
        {
            directory = directory.Parent;
        }

        return directory?.FullName
            ?? throw new InvalidOperationException("Could not locate the repository root.");
    }

    private sealed record ListingFixture(Guid ManagerId, Guid RoomId);

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    private sealed class FixedImageProcessor : IImageProcessor
    {
        public Task<ProcessedImage?> ProcessAsync(Stream content, CancellationToken ct = default) =>
            Task.FromResult<ProcessedImage?>(new ProcessedImage(
                MediaVariants.Widths.Select(width => new ImageVariant(width, [(byte)(width / 100)])).ToList(),
                "identical-content-hash"));
    }

    private sealed class GatedImageProcessor(int participantCount) : IImageProcessor
    {
        private readonly TaskCompletionSource _allArrived = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private int _arrivals;

        public async Task<ProcessedImage?> ProcessAsync(Stream content, CancellationToken ct = default)
        {
            if (Interlocked.Increment(ref _arrivals) == participantCount)
            {
                _allArrived.TrySetResult();
            }

            await _allArrived.Task.WaitAsync(ct);
            return await new FixedImageProcessor().ProcessAsync(content, ct);
        }
    }

    private sealed class FailBeforePutMediaStore(IMediaStore inner, int failOnCall) : IMediaStore
    {
        private int _calls;

        public Task<string> PutAsync(string key, byte[] bytes, string contentType, CancellationToken ct = default) =>
            Interlocked.Increment(ref _calls) == failOnCall
                ? Task.FromException<string>(new IOException("Injected variant write failure."))
                : inner.PutAsync(key, bytes, contentType, ct);

        public Task DeleteAsync(IReadOnlyList<string> keys, CancellationToken ct = default) =>
            inner.DeleteAsync(keys, ct);
    }

    private sealed class AfterPutMediaStore(IMediaStore inner, int runAfterCall, Func<Task> afterPut) : IMediaStore
    {
        private int _calls;

        public async Task<string> PutAsync(string key, byte[] bytes, string contentType, CancellationToken ct = default)
        {
            var url = await inner.PutAsync(key, bytes, contentType, ct);
            if (Interlocked.Increment(ref _calls) == runAfterCall)
            {
                await afterPut();
            }

            return url;
        }

        public Task DeleteAsync(IReadOnlyList<string> keys, CancellationToken ct = default) =>
            inner.DeleteAsync(keys, ct);
    }

    private sealed class TemporaryMediaStore : IDisposable
    {
        private readonly string _root = Path.Combine(Path.GetTempPath(), $"steeple-media-integrity-{Guid.NewGuid():N}");

        public TemporaryMediaStore()
        {
            Directory.CreateDirectory(_root);
            Store = new LocalDiskMediaStore(
                Options.Create(new MediaOptions { LocalRoot = "media" }),
                new TestHostEnvironment(_root));
        }

        public IMediaStore Store { get; }

        public IEnumerable<string> Files() => Directory.EnumerateFiles(_root, "*", SearchOption.AllDirectories);

        public string ResolveUrl(string url) => Path.Combine(_root, url.Replace('/', Path.DirectorySeparatorChar));

        public void Dispose() => Directory.Delete(_root, recursive: true);
    }

    private sealed class TestHostEnvironment(string contentRoot) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Development;
        public string ApplicationName { get; set; } = "Steeple.Integration.Tests";
        public string ContentRootPath { get; set; } = contentRoot;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
