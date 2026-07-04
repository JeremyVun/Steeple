using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Steeple.Persistence.Configurations;
/// <summary>
/// EF mapping for <see cref="BookingOccurrence"/> (mirrors 005-bookings.sql column-for-column).
/// The btree_gist exclusion constraint and the range CHECK live in the SQL changelog only —
/// EF never needs to know about them; violations surface as database errors the Bookings
/// repository translates.
/// </summary>
public class BookingOccurrenceConfiguration : IEntityTypeConfiguration<BookingOccurrence>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<BookingOccurrence> builder)
    {
        builder.ToTable("booking_occurrences");

        builder.HasKey(o => o.Id);

        builder.Property(o => o.Status).HasConversion<int>();

        builder.HasIndex(o => new { o.BookingId, o.StartUtc });

        // The listing lifecycle guard ("future confirmed occurrences?") and calendar reads.
        builder.HasIndex(o => new { o.RoomId, o.StartUtc });

        // RoomId is denormalized for the exclusion constraint; keep the FK honest without a
        // second navigation on Room.
        builder
            .HasOne<Room>()
            .WithMany()
            .HasForeignKey(o => o.RoomId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
