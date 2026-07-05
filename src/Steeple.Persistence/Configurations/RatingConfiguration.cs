using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Steeple.Persistence.Configurations;
/// <summary>EF mapping for <see cref="Rating"/> (mirrors 008-ratings.sql column-for-column).</summary>
public class RatingConfiguration : IEntityTypeConfiguration<Rating>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<Rating> builder)
    {
        builder.ToTable("ratings");

        builder.HasKey(r => r.Id);

        builder.Property(r => r.RateeType).HasConversion<int>();
        builder.Property(r => r.Stars).HasColumnType("smallint");
        builder.Property(r => r.Comment).HasColumnType("text");

        builder.HasIndex(r => new { r.BookingId, r.RateeType }).IsUnique();
        builder.HasIndex(r => r.VenueId).HasFilter("\"HiddenAtUtc\" IS NULL");
        builder.HasIndex(r => r.OrganizerId).HasFilter("\"HiddenAtUtc\" IS NULL");

        builder
            .HasOne(r => r.Booking)
            .WithMany(b => b.Ratings)
            .HasForeignKey(r => r.BookingId)
            .OnDelete(DeleteBehavior.Cascade);

        builder
            .HasOne(r => r.Rater)
            .WithMany()
            .HasForeignKey(r => r.RaterId)
            .OnDelete(DeleteBehavior.Restrict);

        builder
            .HasOne(r => r.Venue)
            .WithMany()
            .HasForeignKey(r => r.VenueId)
            .OnDelete(DeleteBehavior.Cascade);

        builder
            .HasOne(r => r.Organizer)
            .WithMany()
            .HasForeignKey(r => r.OrganizerId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
