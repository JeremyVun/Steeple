using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Steeple.Persistence.Configurations;
/// <summary>EF mapping for <see cref="Venue"/>.</summary>
public class VenueConfiguration : IEntityTypeConfiguration<Venue>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<Venue> builder)
    {
        builder.ToTable("venues");

        builder.HasKey(v => v.Id);

        builder.Property(v => v.Name).IsRequired().HasMaxLength(200);
        builder.Property(v => v.Slug).IsRequired().HasMaxLength(160);
        builder.Property(v => v.Description).HasMaxLength(4000);
        builder.Property(v => v.Type).HasConversion<int>();
        builder.Property(v => v.AddressLine).HasMaxLength(300);
        builder.Property(v => v.Suburb).HasMaxLength(200);
        builder.Property(v => v.Postcode).HasMaxLength(20);
        builder.Property(v => v.ContactEmail).HasMaxLength(320);
        // Mirror the SQL schema's `DEFAULT ''` so the EF model stays column-for-column with 001-schema.sql.
        builder.Property(v => v.ParkingInfo).HasMaxLength(1000).HasDefaultValue("");
        builder.Property(v => v.TransitInfo).HasMaxLength(1000).HasDefaultValue("");
        // Mirror 005-bookings.sql's DEFAULT (existing rows inherited it the same way).
        builder.Property(v => v.Timezone).IsRequired().HasMaxLength(64).HasDefaultValue("America/New_York");

        // Composite index supporting the bounding-box discovery query. A B-tree only ranges on
        // the leading column (Latitude); true 2-D pruning awaits a GiST/PostGIS index in the
        // spatial slice. Adequate at one-suburb scale.
        builder.HasIndex(v => new { v.Latitude, v.Longitude });

        // Slugs are the public, URL-facing identifier — keep them unique.
        builder.HasIndex(v => v.Slug).IsUnique();

        // Edited-listings review feed scans only flagged rows (partial index in 006-manage.sql).
        builder.HasIndex(v => v.ProviderEditedAtUtc).HasFilter("\"ProviderEditedAtUtc\" IS NOT NULL");

        builder
            .HasMany(v => v.Rooms)
            .WithOne(r => r.Venue!)
            .HasForeignKey(r => r.VenueId)
            .OnDelete(DeleteBehavior.Cascade);

        // Computed, not persisted.
        builder.Ignore(v => v.Location);
    }
}
