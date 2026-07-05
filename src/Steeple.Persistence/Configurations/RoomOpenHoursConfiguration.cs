using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Steeple.Persistence.Configurations;
/// <summary>EF mapping for <see cref="RoomOpenHours"/> (mirrors 009-availability.sql column-for-column).</summary>
public class RoomOpenHoursConfiguration : IEntityTypeConfiguration<RoomOpenHours>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<RoomOpenHours> builder)
    {
        builder.ToTable("room_open_hours");

        builder.HasKey(h => h.Id);

        builder.Property(h => h.DayOfWeek).HasConversion<int>();

        // Availability reads and the time-first search prefilter join on (room, weekday).
        builder.HasIndex(h => new { h.RoomId, h.DayOfWeek });

        builder
            .HasOne(h => h.Room)
            .WithMany(r => r.OpenHours)
            .HasForeignKey(h => h.RoomId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
