using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Steeple.Persistence.Configurations;
/// <summary>EF mapping for <see cref="RoomBlackoutDate"/> (mirrors 009-availability.sql column-for-column).</summary>
public class RoomBlackoutDateConfiguration : IEntityTypeConfiguration<RoomBlackoutDate>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<RoomBlackoutDate> builder)
    {
        builder.ToTable("room_blackout_dates");

        builder.HasKey(b => b.Id);

        builder.Property(b => b.Reason).HasMaxLength(200);

        // One row per (room, date).
        builder.HasIndex(b => new { b.RoomId, b.Date }).IsUnique();

        builder
            .HasOne(b => b.Room)
            .WithMany(r => r.BlackoutDates)
            .HasForeignKey(b => b.RoomId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
