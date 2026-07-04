namespace Steeple.Persistence.Models;
/// <summary>
/// One materialized UTC instant of a <see cref="Booking"/>. <see cref="RoomId"/> is denormalized
/// so the SQL-side btree_gist exclusion constraint (005-bookings.sql) can pair the room with the
/// occurrence's time range — the database, not the application, forbids overlaps among
/// non-cancelled rows.
/// </summary>
public class BookingOccurrence
{
    /// <summary>Primary key.</summary>
    public Guid Id { get; set; }

    /// <summary>Foreign key to the owning booking.</summary>
    public Guid BookingId { get; set; }

    /// <summary>Denormalized room key (the exclusion constraint's equality column).</summary>
    public Guid RoomId { get; set; }

    /// <summary>UTC start instant (inclusive bound of the protected range).</summary>
    public DateTimeOffset StartUtc { get; set; }

    /// <summary>UTC end instant (exclusive bound — back-to-back slots don't clash).</summary>
    public DateTimeOffset EndUtc { get; set; }

    /// <summary>The venue-local date this occurrence renders as (stable across DST).</summary>
    public DateOnly LocalDate { get; set; }

    /// <summary>Current lifecycle state; Cancelled rows leave the exclusion constraint.</summary>
    public OccurrenceStatus Status { get; set; }

    /// <summary>User who marked the no-show; null otherwise.</summary>
    public Guid? NoShowMarkedBy { get; set; }

    /// <summary>Navigation to the owning booking.</summary>
    public Booking? Booking { get; set; }
}
