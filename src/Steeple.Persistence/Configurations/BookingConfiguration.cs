using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Steeple.Persistence.Configurations;
/// <summary>EF mapping for <see cref="Booking"/> (mirrors 005-bookings.sql column-for-column).</summary>
public class BookingConfiguration : IEntityTypeConfiguration<Booking>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<Booking> builder)
    {
        builder.ToTable("bookings");

        builder.HasKey(b => b.Id);

        builder.Property(b => b.Type).HasConversion<int>();
        builder.Property(b => b.Status).HasConversion<int>();
        builder.Property(b => b.DaysOfWeek).HasColumnName("DaysOfWeekMask").HasConversion<int?>();
        builder.Property(b => b.CancelReason).HasMaxLength(500);

        // One booking per application, ever.
        builder.HasIndex(b => b.ApplicationId).IsUnique();

        // Organizer "my bookings" and provider (room → venue) lists, newest first.
        builder.HasIndex(b => new { b.OrganizerId, b.CreatedAtUtc });
        builder.HasIndex(b => new { b.RoomId, b.CreatedAtUtc });

        // The lazy renewal-due sweep scans confirmed bookings by their term end.
        builder.HasIndex(b => new { b.Status, b.EndDate });

        builder
            .HasOne(b => b.Application)
            .WithOne(a => a.Booking)
            .HasForeignKey<Booking>(b => b.ApplicationId)
            .OnDelete(DeleteBehavior.Cascade);

        builder
            .HasOne(b => b.Room)
            .WithMany()
            .HasForeignKey(b => b.RoomId)
            .OnDelete(DeleteBehavior.Cascade);

        builder
            .HasOne(b => b.Organizer)
            .WithMany()
            .HasForeignKey(b => b.OrganizerId)
            .OnDelete(DeleteBehavior.Cascade);

        builder
            .HasMany(b => b.Occurrences)
            .WithOne(o => o.Booking!)
            .HasForeignKey(o => o.BookingId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
