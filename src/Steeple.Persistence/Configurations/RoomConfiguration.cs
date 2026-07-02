using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Steeple.Persistence.Configurations;
/// <summary>EF mapping for <see cref="Room"/>.</summary>
public class RoomConfiguration : IEntityTypeConfiguration<Room>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<Room> builder)
    {
        builder.ToTable("rooms");

        builder.HasKey(r => r.Id);

        builder.Property(r => r.Name).IsRequired().HasMaxLength(200);
        builder.Property(r => r.Slug).IsRequired().HasMaxLength(160);
        builder.Property(r => r.Description).HasMaxLength(4000);
        builder.Property(r => r.HouseRules).HasMaxLength(4000);

        builder.Property(r => r.PricePerHour).HasPrecision(10, 2);
        builder.Property(r => r.Currency).IsRequired().HasMaxLength(3);

        // Flag enums and status persist as their underlying int.
        builder.Property(r => r.Status).HasConversion<int>();
        builder.Property(r => r.Amenities).HasConversion<int>();
        builder.Property(r => r.AccessibilityFeatures).HasConversion<int>();
        builder.Property(r => r.AcceptedActivityTypes).HasConversion<int>();

        // Discovery filters by publication state.
        builder.HasIndex(r => r.Status);

        // Slugs are unique within a venue (venueSlug + roomSlug forms the public URL).
        builder.HasIndex(r => new { r.VenueId, r.Slug }).IsUnique();

        builder
            .HasMany(r => r.Photos)
            .WithOne(p => p.Room!)
            .HasForeignKey(p => p.RoomId)
            .OnDelete(DeleteBehavior.Cascade);

        // Computed, not persisted.
        builder.Ignore(r => r.IsFree);
    }
}
