using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Steeple.Persistence.Configurations;

/// <summary>EF mapping for <see cref="VenueVerificationRequest"/>.</summary>
public class VenueVerificationRequestConfiguration : IEntityTypeConfiguration<VenueVerificationRequest>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<VenueVerificationRequest> builder)
    {
        builder.ToTable("venue_verification_requests");

        builder.HasKey(r => r.Id);

        builder.Property(r => r.Status).HasConversion<int>();
        builder.Property(r => r.ContactName).IsRequired().HasMaxLength(200);
        builder.Property(r => r.ContactEmail).HasMaxLength(320);
        builder.Property(r => r.EvidenceSummary).IsRequired().HasMaxLength(4000);
        builder.Property(r => r.DecidedBy).HasMaxLength(320);
        builder.Property(r => r.DecisionNote).HasMaxLength(1000);

        builder.HasIndex(r => new { r.Status, r.RequestedAtUtc });
        builder.HasIndex(r => new { r.VenueId, r.RequestedAtUtc });
        builder.HasIndex(r => r.RequestedByUserId);
        builder
            .HasIndex(r => r.VenueId)
            .IsUnique()
            .HasFilter("\"Status\" = 0");

        builder
            .HasOne(r => r.Venue)
            .WithMany(v => v.VerificationRequests)
            .HasForeignKey(r => r.VenueId)
            .OnDelete(DeleteBehavior.Cascade);

        builder
            .HasOne(r => r.RequestedByUser)
            .WithMany()
            .HasForeignKey(r => r.RequestedByUserId)
            .OnDelete(DeleteBehavior.Restrict);

        builder
            .HasMany(r => r.Documents)
            .WithOne(d => d.Request!)
            .HasForeignKey(d => d.RequestId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
