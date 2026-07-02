using Microsoft.EntityFrameworkCore;

namespace Steeple.Persistence;
/// <summary>
/// EF Core unit-of-work / persistence context for Steeple. Maps the discovery aggregate
/// (venues, rooms, photos) plus the analytics event log to Postgres.
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

    /// <inheritdoc />
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(SteepleDbContext).Assembly);
    }
}
