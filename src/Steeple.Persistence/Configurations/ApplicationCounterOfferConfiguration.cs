using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Steeple.Persistence.Configurations;
/// <summary>EF mapping for <see cref="ApplicationCounterOffer"/> (mirrors 009-availability.sql column-for-column).</summary>
public class ApplicationCounterOfferConfiguration : IEntityTypeConfiguration<ApplicationCounterOffer>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<ApplicationCounterOffer> builder)
    {
        builder.ToTable("application_counter_offers");

        builder.HasKey(c => c.Id);

        builder.Property(c => c.Frequency).HasConversion<int>();
        builder.Property(c => c.Status).HasConversion<int>();
        builder.Property(c => c.DaysOfWeek).HasColumnName("DaysOfWeekMask").HasConversion<int?>();
        builder.Property(c => c.Message).HasMaxLength(2000);

        // At most one live counter per application; history rows keep the thread honest.
        builder
            .HasIndex(c => c.ApplicationId)
            .IsUnique()
            .HasFilter("\"Status\" = 0");

        builder.HasIndex(c => new { c.ApplicationId, c.CreatedAtUtc });

        builder
            .HasOne(c => c.Application)
            .WithMany(a => a.CounterOffers)
            .HasForeignKey(c => c.ApplicationId)
            .OnDelete(DeleteBehavior.Cascade);

        builder
            .HasOne(c => c.ProposedBy)
            .WithMany()
            .HasForeignKey(c => c.ProposedByUserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
