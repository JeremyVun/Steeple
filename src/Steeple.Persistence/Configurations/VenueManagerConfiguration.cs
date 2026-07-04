using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Steeple.Persistence.Configurations;
/// <summary>EF mapping for <see cref="VenueManager"/>.</summary>
public class VenueManagerConfiguration : IEntityTypeConfiguration<VenueManager>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<VenueManager> builder)
    {
        builder.ToTable("venue_managers");

        builder.HasKey(m => m.Id);

        // One manager row per (venue, user); the reverse lookup drives the provider inbox.
        builder.HasIndex(m => new { m.VenueId, m.UserId }).IsUnique();
        builder.HasIndex(m => m.UserId);

        builder
            .HasOne(m => m.Venue)
            .WithMany()
            .HasForeignKey(m => m.VenueId)
            .OnDelete(DeleteBehavior.Cascade);

        builder
            .HasOne(m => m.User)
            .WithMany()
            .HasForeignKey(m => m.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
