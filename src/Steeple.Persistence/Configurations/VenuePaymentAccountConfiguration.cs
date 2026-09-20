using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Steeple.Persistence.Configurations;
/// <summary>EF mapping for <see cref="VenuePaymentAccount"/> (mirrors 014-payments.sql column-for-column).</summary>
public class VenuePaymentAccountConfiguration : IEntityTypeConfiguration<VenuePaymentAccount>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<VenuePaymentAccount> builder)
    {
        builder.ToTable("venue_payment_accounts");

        builder.HasKey(a => a.VenueId);

        builder.Property(a => a.ProviderAccountId).HasMaxLength(255);
        builder.Property(a => a.ProvisioningKey).IsRequired();
        builder.Property(a => a.Provider).IsRequired().HasMaxLength(20);
        builder.Property(a => a.DetailsSubmitted).HasDefaultValue(false);
        builder.Property(a => a.ChargesEnabled).HasDefaultValue(false);
        builder.Property(a => a.PayoutsEnabled).HasDefaultValue(false);
        builder.Property(a => a.RequirementsDue).HasColumnType("text[]");
        builder.Property(a => a.DisabledReason).HasMaxLength(255);

        builder.HasIndex(a => a.ProviderAccountId).IsUnique();
        builder.HasIndex(a => a.ProvisioningKey).IsUnique();

        builder
            .HasOne(a => a.Venue)
            .WithOne()
            .HasForeignKey<VenuePaymentAccount>(a => a.VenueId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
