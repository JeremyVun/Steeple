namespace Steeple.Api.Tests.Services;
/// <summary>
/// Unit tests for <see cref="RatingService"/>: party-direction inference, eligibility windows,
/// double-blind reveal, and read aggregates.
/// </summary>
public class RatingServiceTests
{
    private static readonly DateTimeOffset FixedNow = new(2026, 7, 20, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task SubmitAsync_OrganizerAfterPastOccurrence_RatesVenueAndNotifiesManagers()
    {
        var scenario = NewScenario(occurrenceEndOffset: TimeSpan.FromHours(-2));
        var service = CreateService(scenario, out var ratings, out var notifications, out var analytics);

        var result = await service.SubmitAsync(
            scenario.Booking.Id, scenario.Organizer.Id, new SubmitRatingRequest(5));

        Assert.Null(result.Error);
        var rating = Assert.Single(ratings.Ratings);
        Assert.Equal(RatingRateeType.Venue, rating.RateeType);
        Assert.Equal(scenario.Venue.Id, rating.VenueId);
        Assert.Equal(scenario.Organizer.Id, rating.OrganizerId);
        Assert.Equal(OccurrenceStatus.Occurred, scenario.Booking.Occurrences.Single().Status);
        Assert.Contains(notifications.Calls, c =>
            c.Type == NotificationType.RatingReceived
            && c.Recipients.Any(r => r.UserId == scenario.Manager.Id));
        Assert.Contains(analytics.Events, e => e.EventType == "rating_submitted");
    }

    [Fact]
    public async Task SubmitAsync_ManagerAfterPastOccurrence_RatesOrganizer()
    {
        var scenario = NewScenario(occurrenceEndOffset: TimeSpan.FromHours(-2));
        var service = CreateService(scenario, out var ratings, out _, out _);

        var result = await service.SubmitAsync(
            scenario.Booking.Id, scenario.Manager.Id, new SubmitRatingRequest(4));

        Assert.Null(result.Error);
        Assert.Equal(RatingRateeType.Organizer, Assert.Single(ratings.Ratings).RateeType);
    }

    [Fact]
    public async Task SubmitAsync_TrimsAndStoresOptionalComment()
    {
        var scenario = NewScenario(occurrenceEndOffset: TimeSpan.FromHours(-2));
        var service = CreateService(scenario, out var ratings, out _, out var analytics);

        var result = await service.SubmitAsync(
            scenario.Booking.Id,
            scenario.Organizer.Id,
            new SubmitRatingRequest(5, "  Wonderful space.\n"));

        Assert.Null(result.Error);
        var rating = Assert.Single(ratings.Ratings);
        Assert.Equal("Wonderful space.", rating.Comment);
        var submitted = Assert.Single(analytics.Events, e => e.EventType == "rating_submitted");
        Assert.Contains("hasComment = True", submitted.Payload?.ToString());
    }

    [Fact]
    public async Task SubmitAsync_CommentOverOneThousandCharacters_ReturnsInvalidRating()
    {
        var scenario = NewScenario(occurrenceEndOffset: TimeSpan.FromHours(-2));
        var service = CreateService(scenario, out var ratings, out _, out _);

        var result = await service.SubmitAsync(
            scenario.Booking.Id,
            scenario.Organizer.Id,
            new SubmitRatingRequest(5, new string('x', 1001)));

        Assert.Null(result.Value);
        Assert.Equal(BookingErrorCodes.InvalidRating, result.Error!.Code);
        Assert.Empty(ratings.Ratings);
    }

    [Fact]
    public async Task SubmitAsync_BeforeAnyOccurrence_ReturnsInvalidState()
    {
        var scenario = NewScenario(occurrenceEndOffset: TimeSpan.FromHours(2));
        var service = CreateService(scenario, out var ratings, out _, out _);

        var result = await service.SubmitAsync(
            scenario.Booking.Id, scenario.Organizer.Id, new SubmitRatingRequest(5));

        Assert.Null(result.Value);
        Assert.Equal(BookingErrorCodes.InvalidState, result.Error!.Code);
        Assert.Empty(ratings.Ratings);
    }

    [Fact]
    public async Task SubmitAsync_AfterFourteenDayClose_ReturnsInvalidState()
    {
        var scenario = NewScenario(occurrenceEndOffset: TimeSpan.FromDays(-20), status: BookingStatus.Completed);
        scenario.Booking.Occurrences.Single().Status = OccurrenceStatus.Occurred;
        var service = CreateService(scenario, out var ratings, out _, out _);

        var result = await service.SubmitAsync(
            scenario.Booking.Id, scenario.Organizer.Id, new SubmitRatingRequest(5));

        Assert.Null(result.Value);
        Assert.Equal(BookingErrorCodes.InvalidState, result.Error!.Code);
        Assert.Empty(ratings.Ratings);
    }

    [Fact]
    public async Task SubmitAsync_AlreadyRatedDirection_ReturnsInvalidState()
    {
        var scenario = NewScenario(occurrenceEndOffset: TimeSpan.FromHours(-2));
        scenario.Booking.Occurrences.Single().Status = OccurrenceStatus.Occurred;
        var service = CreateService(scenario, out var ratings, out _, out _);
        ratings.Ratings.Add(NewRating(scenario.Booking, RatingRateeType.Venue, scenario.Organizer.Id, 5));

        var result = await service.SubmitAsync(
            scenario.Booking.Id, scenario.Organizer.Id, new SubmitRatingRequest(4));

        Assert.Null(result.Value);
        Assert.Equal(BookingErrorCodes.InvalidState, result.Error!.Code);
    }

    [Fact]
    public async Task GetBookingOverviewsAsync_HidesOtherSideUntilReciprocalRating()
    {
        var scenario = NewScenario(occurrenceEndOffset: TimeSpan.FromHours(-2));
        scenario.Booking.Occurrences.Single().Status = OccurrenceStatus.Occurred;
        var service = CreateService(scenario, out var ratings, out _, out _);
        ratings.Ratings.Add(NewRating(scenario.Booking, RatingRateeType.Organizer, scenario.Manager.Id, 4));

        var first = await service.GetBookingOverviewsAsync(
            [scenario.Booking], scenario.Organizer.Id, FixedNow, CancellationToken.None);
        Assert.Null(first[scenario.Booking.Id].ByVenue);

        ratings.Ratings.Add(NewRating(scenario.Booking, RatingRateeType.Venue, scenario.Organizer.Id, 5, "Good host."));
        var second = await service.GetBookingOverviewsAsync(
            [scenario.Booking], scenario.Organizer.Id, FixedNow, CancellationToken.None);

        Assert.Equal(5, second[scenario.Booking.Id].ByOrganizer!.Stars);
        Assert.Equal("Good host.", second[scenario.Booking.Id].ByOrganizer!.Comment);
        Assert.Equal(4, second[scenario.Booking.Id].ByVenue!.Stars);
    }

    [Fact]
    public async Task GetVenueSummariesAsync_UsesOnlyRevealedVisibleRatings()
    {
        var scenario = NewScenario(occurrenceEndOffset: TimeSpan.FromDays(-20), status: BookingStatus.Completed);
        scenario.Booking.Occurrences.Single().Status = OccurrenceStatus.Occurred;
        var service = CreateService(scenario, out var ratings, out _, out _);
        ratings.Ratings.Add(NewRating(scenario.Booking, RatingRateeType.Venue, scenario.Organizer.Id, 5));
        ratings.Ratings.Add(NewRating(scenario.Booking, RatingRateeType.Organizer, scenario.Manager.Id, 3));

        var hiddenBooking = NewBooking(scenario.Room, scenario.Organizer, TimeSpan.FromDays(-20), BookingStatus.Completed);
        hiddenBooking.Occurrences.Single().Status = OccurrenceStatus.Occurred;
        var hidden = NewRating(hiddenBooking, RatingRateeType.Venue, scenario.Organizer.Id, 1);
        hidden.HiddenAtUtc = FixedNow;
        ratings.Ratings.Add(hidden);

        var summaries = await service.GetVenueSummariesAsync([scenario.Venue.Id], FixedNow, CancellationToken.None);

        var summary = summaries[scenario.Venue.Id];
        Assert.Equal(5, summary.AverageStars);
        Assert.Equal(1, summary.Count);
    }

    [Fact]
    public async Task GetOrganizerSummariesAsync_ReturnsNullUntilOrganizerHasRevealedRating()
    {
        var scenario = NewScenario(occurrenceEndOffset: TimeSpan.FromHours(-2));
        scenario.Booking.Occurrences.Single().Status = OccurrenceStatus.Occurred;
        var service = CreateService(scenario, out var ratings, out _, out _);
        ratings.NoShowCounts[scenario.Organizer.Id] = 2;
        ratings.CompletedCounts[scenario.Organizer.Id] = 7;

        var none = await service.GetOrganizerSummariesAsync([scenario.Organizer.Id], FixedNow, CancellationToken.None);
        Assert.Empty(none);

        ratings.Ratings.Add(NewRating(scenario.Booking, RatingRateeType.Organizer, scenario.Manager.Id, 4));
        ratings.Ratings.Add(NewRating(scenario.Booking, RatingRateeType.Venue, scenario.Organizer.Id, 5));

        var summaries = await service.GetOrganizerSummariesAsync([scenario.Organizer.Id], FixedNow, CancellationToken.None);

        var summary = summaries[scenario.Organizer.Id];
        Assert.Equal(4, summary.AverageStars);
        Assert.Equal(1, summary.RatingCount);
        Assert.Equal(2, summary.NoShowCount);
        Assert.Equal(7, summary.CompletedBookings);
    }

    [Fact]
    public async Task GetVenueReviewsAsync_ReturnsRevealedVisibleCommentsNewestFirst()
    {
        var scenario = NewScenario(occurrenceEndOffset: TimeSpan.FromDays(-20), status: BookingStatus.Completed);
        scenario.Booking.Occurrences.Single().Status = OccurrenceStatus.Occurred;
        var service = CreateService(scenario, out var ratings, out _, out _);

        ratings.Ratings.Add(NewRating(
            scenario.Booking,
            RatingRateeType.Venue,
            scenario.Organizer.Id,
            5,
            "Older public review.",
            scenario.Organizer,
            FixedNow.AddDays(-2)));
        ratings.Ratings.Add(NewRating(
            scenario.Booking,
            RatingRateeType.Organizer,
            scenario.Manager.Id,
            4,
            "Organizer-side reciprocal.",
            scenario.Manager,
            FixedNow.AddDays(-2)));

        var newerBooking = NewBooking(scenario.Room, scenario.Organizer, TimeSpan.FromDays(-19), BookingStatus.Completed);
        newerBooking.Occurrences.Single().Status = OccurrenceStatus.Occurred;
        ratings.Ratings.Add(NewRating(
            newerBooking,
            RatingRateeType.Venue,
            scenario.Organizer.Id,
            4,
            "Newest public review.",
            scenario.Organizer,
            FixedNow.AddDays(-1)));
        ratings.Ratings.Add(NewRating(
            newerBooking,
            RatingRateeType.Organizer,
            scenario.Manager.Id,
            5,
            "Newer reciprocal.",
            scenario.Manager,
            FixedNow.AddDays(-1)));

        var hiddenBooking = NewBooking(scenario.Room, scenario.Organizer, TimeSpan.FromDays(-18), BookingStatus.Completed);
        hiddenBooking.Occurrences.Single().Status = OccurrenceStatus.Occurred;
        var hidden = NewRating(
            hiddenBooking,
            RatingRateeType.Venue,
            scenario.Organizer.Id,
            1,
            "Hidden review.",
            scenario.Organizer,
            FixedNow);
        hidden.HiddenAtUtc = FixedNow;
        ratings.Ratings.Add(hidden);

        var page = await service.GetVenueReviewsAsync(
            scenario.Venue.Id, page: 1, pageSize: 1, FixedNow, CancellationToken.None);

        Assert.Equal(2, page.TotalCount);
        var review = Assert.Single(page.Items);
        Assert.Equal("Newest public review.", review.Comment);
        Assert.Equal("Jamie Organizer", review.RaterName);
    }

    [Fact]
    public async Task GetVenueReviewsAsync_ExcludesUnrevealedAndStarOnlyRatings()
    {
        var scenario = NewScenario(occurrenceEndOffset: TimeSpan.FromHours(-2));
        scenario.Booking.Occurrences.Single().Status = OccurrenceStatus.Occurred;
        var service = CreateService(scenario, out var ratings, out _, out _);

        ratings.Ratings.Add(NewRating(
            scenario.Booking,
            RatingRateeType.Venue,
            scenario.Organizer.Id,
            5,
            "Still blind.",
            scenario.Organizer));

        var starOnlyBooking = NewBooking(scenario.Room, scenario.Organizer, TimeSpan.FromDays(-20), BookingStatus.Completed);
        starOnlyBooking.Occurrences.Single().Status = OccurrenceStatus.Occurred;
        ratings.Ratings.Add(NewRating(starOnlyBooking, RatingRateeType.Venue, scenario.Organizer.Id, 5, rater: scenario.Organizer));
        ratings.Ratings.Add(NewRating(starOnlyBooking, RatingRateeType.Organizer, scenario.Manager.Id, 5, rater: scenario.Manager));

        var page = await service.GetVenueReviewsAsync(
            scenario.Venue.Id, page: 1, pageSize: 10, FixedNow, CancellationToken.None);

        Assert.Empty(page.Items);
        Assert.Equal(0, page.TotalCount);
    }

    private static Scenario NewScenario(TimeSpan occurrenceEndOffset, BookingStatus status = BookingStatus.Confirmed)
    {
        var venue = new Venue
        {
            Id = Guid.NewGuid(),
            Name = "Grace Test Venue",
            Slug = "grace-test",
            Timezone = "America/New_York",
            CreatedAtUtc = FixedNow,
        };
        var room = new Room
        {
            Id = Guid.NewGuid(),
            VenueId = venue.Id,
            Venue = venue,
            Name = "Fellowship Hall",
            Slug = "fellowship-hall",
            Status = RoomStatus.Published,
            CreatedAtUtc = FixedNow,
        };
        var organizer = NewUser("Jamie Organizer", "jamie@example.com");
        var manager = NewUser("Casey Manager", "casey@example.com");
        var booking = NewBooking(room, organizer, occurrenceEndOffset, status);
        return new Scenario(venue, room, organizer, manager, booking);
    }

    private static User NewUser(string displayName, string email) => new()
    {
        Id = Guid.NewGuid(),
        DisplayName = displayName,
        Email = email,
        CreatedAtUtc = FixedNow,
    };

    private static Booking NewBooking(Room room, User organizer, TimeSpan occurrenceEndOffset, BookingStatus status)
    {
        var end = FixedNow + occurrenceEndOffset;
        var booking = new Booking
        {
            Id = Guid.NewGuid(),
            ApplicationId = Guid.NewGuid(),
            RoomId = room.Id,
            OrganizerId = organizer.Id,
            Type = BookingType.OneOff,
            StartDate = DateOnly.FromDateTime(end.UtcDateTime),
            EndDate = DateOnly.FromDateTime(end.UtcDateTime),
            StartTime = new TimeOnly(9, 0),
            EndTime = new TimeOnly(11, 0),
            Status = status,
            CreatedAtUtc = FixedNow.AddDays(-30),
            Room = room,
            Organizer = organizer,
        };
        booking.Occurrences.Add(new BookingOccurrence
        {
            Id = Guid.NewGuid(),
            BookingId = booking.Id,
            RoomId = room.Id,
            StartUtc = end.AddHours(-2),
            EndUtc = end,
            LocalDate = DateOnly.FromDateTime(end.UtcDateTime),
            Status = OccurrenceStatus.Scheduled,
            Booking = booking,
        });
        return booking;
    }

    private static Rating NewRating(
        Booking booking,
        RatingRateeType rateeType,
        Guid raterId,
        short stars,
        string? comment = null,
        User? rater = null,
        DateTimeOffset? createdAtUtc = null)
    {
        var rating = new Rating
        {
            Id = Guid.NewGuid(),
            BookingId = booking.Id,
            RaterId = raterId,
            RateeType = rateeType,
            Stars = stars,
            Comment = comment,
            CreatedAtUtc = createdAtUtc ?? FixedNow,
            VenueId = booking.Room!.VenueId,
            OrganizerId = booking.OrganizerId,
            Booking = booking,
            Rater = rater,
        };
        booking.Ratings.Add(rating);
        return rating;
    }

    private static RatingService CreateService(
        Scenario scenario,
        out FakeRatingRepository ratings,
        out FakeNotificationDispatcher notifications,
        out FakeAnalyticsSink analytics)
    {
        ratings = new FakeRatingRepository();
        notifications = new FakeNotificationDispatcher();
        analytics = new FakeAnalyticsSink();
        var bookings = new FakeBookingRepository(scenario.Booking);
        var managers = new FakeVenueManagerRepository();
        managers.AddManager(scenario.Venue.Id, scenario.Manager);
        return new RatingService(
            ratings, bookings, managers, new FakeGeofencePolicy(), notifications, analytics, new FixedTimeProvider(FixedNow));
    }

    private sealed record Scenario(Venue Venue, Room Room, User Organizer, User Manager, Booking Booking);

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    private sealed class FakeRatingRepository : IRatingRepository
    {
        public List<Rating> Ratings { get; } = [];
        public Dictionary<Guid, int> NoShowCounts { get; } = [];
        public Dictionary<Guid, int> CompletedCounts { get; } = [];

        public Task<IReadOnlyList<Rating>> GetForBookingsAsync(
            IReadOnlyCollection<Guid> bookingIds, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<Rating>>(Ratings.Where(r => bookingIds.Contains(r.BookingId)).ToList());

        public Task<IReadOnlyList<Rating>> GetVisibleForVenuesAsync(
            IReadOnlyCollection<Guid> venueIds, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<Rating>>(
                Ratings.Where(r => r.HiddenAtUtc is null && venueIds.Contains(r.VenueId)).ToList());

        public Task<IReadOnlyList<Rating>> GetVisibleForOrganizersAsync(
            IReadOnlyCollection<Guid> organizerIds, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<Rating>>(
                Ratings.Where(r => r.HiddenAtUtc is null && organizerIds.Contains(r.OrganizerId)).ToList());

        public Task<IReadOnlyDictionary<Guid, OrganizerReputationInputs>> GetOrganizerReputationInputsAsync(
            IReadOnlyCollection<Guid> organizerIds, DateTimeOffset noShowSinceUtc, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyDictionary<Guid, OrganizerReputationInputs>>(
                organizerIds.ToDictionary(
                    id => id,
                    id => new OrganizerReputationInputs(
                        NoShowCounts.GetValueOrDefault(id),
                        CompletedCounts.GetValueOrDefault(id))));

        public Task<IReadOnlyList<Rating>> GetVisibleCommentedForVenueAsync(
            Guid venueId, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<Rating>>(
                Ratings
                    .Where(r =>
                        r.VenueId == venueId
                        && r.RateeType == RatingRateeType.Venue
                        && r.HiddenAtUtc is null
                        && !string.IsNullOrEmpty(r.Comment))
                    .ToList());

        public Task<bool> VenueHasPublishedRoomInBeachheadAsync(
            Guid venueId, BoundingBox beachhead, CancellationToken ct = default) =>
            Task.FromResult(true);

        public Task<bool> TryAddAsync(Rating rating, CancellationToken ct = default)
        {
            if (Ratings.Any(r => r.BookingId == rating.BookingId && r.RateeType == rating.RateeType))
            {
                return Task.FromResult(false);
            }

            Ratings.Add(rating);
            return Task.FromResult(true);
        }
    }

    private sealed class FakeBookingRepository(Booking booking) : IBookingRepository
    {
        public Task<bool> TrySaveNewAsync(Booking booking, CancellationToken ct = default) =>
            throw new NotSupportedException();

        public Task<Booking?> GetAsync(Guid bookingId, CancellationToken ct = default) =>
            Task.FromResult<Booking?>(booking.Id == bookingId ? booking : null);

        public Task<BookingOccurrence?> GetOccurrenceAsync(Guid occurrenceId, CancellationToken ct = default) =>
            throw new NotSupportedException();

        public Task<(IReadOnlyList<Booking> Items, int TotalCount)> GetForOrganizerAsync(
            Guid organizerId, BookingStatus? status, int page, int pageSize, CancellationToken ct = default) =>
            throw new NotSupportedException();

        public Task<(IReadOnlyList<Booking> Items, int TotalCount)> GetForVenuesAsync(
            IReadOnlyList<Guid> venueIds, BookingStatus? status, int page, int pageSize, CancellationToken ct = default) =>
            throw new NotSupportedException();

        public Task SaveAsync(CancellationToken ct = default) => Task.CompletedTask;
    }

    private sealed class FakeVenueManagerRepository : IVenueManagerRepository
    {
        private readonly List<(Guid VenueId, User User)> _managers = [];

        public void AddManager(Guid venueId, User user) => _managers.Add((venueId, user));

        public Task<bool> IsManagerAsync(Guid userId, Guid venueId, CancellationToken ct = default) =>
            Task.FromResult(_managers.Any(m => m.VenueId == venueId && m.User.Id == userId));

        public Task<IReadOnlyList<Guid>> GetManagedVenueIdsAsync(Guid userId, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<Guid>>(
                _managers.Where(m => m.User.Id == userId).Select(m => m.VenueId).ToList());

        public Task<IReadOnlyList<Venue>> GetManagedVenuesAsync(Guid userId, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<Venue>>([]);

        public Task<IReadOnlyList<User>> GetManagersAsync(Guid venueId, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<User>>(
                _managers.Where(m => m.VenueId == venueId).Select(m => m.User).ToList());
    }

    private sealed class FakeGeofencePolicy : IGeofencePolicy
    {
        public string AreaName => "Test beachhead";

        public GeoPoint Center => new(0, 0);

        public BoundingBox Beachhead => new(-90, 90, -180, 180);

        public bool IsWithinBeachhead(double latitude, double longitude) => true;

        public BoundingBox ResolveSearchBounds(ListingSearchQuery query) => Beachhead;
    }

    private sealed class FakeNotificationDispatcher : INotificationDispatcher
    {
        public List<(IReadOnlyList<NotificationRecipient> Recipients, NotificationType Type)> Calls { get; } = [];

        public Task NotifyAsync(
            IReadOnlyList<NotificationRecipient> recipients,
            NotificationType type,
            object payload,
            EmailContent? email,
            CancellationToken ct = default)
        {
            Calls.Add((recipients, type));
            return Task.CompletedTask;
        }
    }

    private sealed class FakeAnalyticsSink : IAnalyticsSink
    {
        public List<(string EventType, object? Payload)> Events { get; } = [];

        public Task TrackAsync(string eventType, object? payload = null, string? sessionId = null, CancellationToken ct = default)
        {
            Events.Add((eventType, payload));
            return Task.CompletedTask;
        }
    }
}
