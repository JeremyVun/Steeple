using Microsoft.EntityFrameworkCore;

namespace Steeple.Persistence;
/// <summary>
/// EF Core unit-of-work / persistence context for Steeple. Maps the discovery aggregate
/// (venues, rooms, photos), the applications/notifications aggregate (venue managers,
/// applications, their message threads, the notifications inbox, and push devices), and the
/// analytics event log to Postgres.
/// </summary>
public class SteepleDbContext : DbContext
{
    /// <summary>Creates the context with the supplied options (connection, provider, etc.).</summary>
    public SteepleDbContext(DbContextOptions<SteepleDbContext> options)
        : base(options)
    {
    }

    /// <summary>Venues (sites that own bookable rooms).</summary>
    public DbSet<Venue> Venues => Set<Venue>();

    /// <summary>Bookable rooms/halls within venues.</summary>
    public DbSet<Room> Rooms => Set<Room>();

    /// <summary>Photos associated with rooms.</summary>
    public DbSet<RoomPhoto> RoomPhotos => Set<RoomPhoto>();

    /// <summary>Persisted analytics events.</summary>
    public DbSet<AnalyticsEvent> AnalyticsEvents => Set<AnalyticsEvent>();

    /// <summary>Consumer accounts (organizers and providers — SSO only).</summary>
    public DbSet<User> Users => Set<User>();

    /// <summary>SSO provider identities resolving to users.</summary>
    public DbSet<UserLogin> UserLogins => Set<UserLogin>();

    /// <summary>Rotating, hashed refresh tokens (one family per sign-in).</summary>
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();

    /// <summary>Per-version ToS/Privacy acceptance records.</summary>
    public DbSet<UserAgreement> UserAgreements => Set<UserAgreement>();

    /// <summary>Venue-manager authorization links (who may act for a venue).</summary>
    public DbSet<VenueManager> VenueManagers => Set<VenueManager>();

    /// <summary>Host-submitted venue ownership / lease-authority verification requests.</summary>
    public DbSet<VenueVerificationRequest> VenueVerificationRequests => Set<VenueVerificationRequest>();

    /// <summary>Document metadata attached to venue verification requests.</summary>
    public DbSet<VenueVerificationDocument> VenueVerificationDocuments => Set<VenueVerificationDocument>();

    /// <summary>Organizer applications for a room's proposed schedule.</summary>
    public DbSet<Application> Applications => Set<Application>();

    /// <summary>Ask/answer messages on an application's thread.</summary>
    public DbSet<ApplicationMessage> ApplicationMessages => Set<ApplicationMessage>();

    /// <summary>The notifications inbox (inbox = truth).</summary>
    public DbSet<Notification> Notifications => Set<Notification>();

    /// <summary>FCM push registrations.</summary>
    public DbSet<Device> Devices => Set<Device>();

    /// <summary>Confirmed bookings created by approving applications.</summary>
    public DbSet<Booking> Bookings => Set<Booking>();

    /// <summary>Materialized UTC occurrences protected by the exclusion constraint.</summary>
    public DbSet<BookingOccurrence> BookingOccurrences => Set<BookingOccurrence>();

    /// <summary>Immutable two-way booking ratings.</summary>
    public DbSet<Rating> Ratings => Set<Rating>();

    /// <summary>Weekly open windows rooms advertise (venue-local, advisory).</summary>
    public DbSet<RoomOpenHours> RoomOpenHours => Set<RoomOpenHours>();

    /// <summary>Whole dates rooms are closed regardless of open hours.</summary>
    public DbSet<RoomBlackoutDate> RoomBlackoutDates => Set<RoomBlackoutDate>();

    /// <summary>Host counter-offers proposed on pending applications.</summary>
    public DbSet<ApplicationCounterOffer> ApplicationCounterOffers => Set<ApplicationCounterOffer>();

    /// <inheritdoc />
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(SteepleDbContext).Assembly);
    }
}
