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

        builder.Property(a => a.ProviderAccountId).IsRequired().HasMaxLength(255);
        builder.Property(a => a.DetailsSubmitted).HasDefaultValue(false);
        builder.Property(a => a.ChargesEnabled).HasDefaultValue(false);
        builder.Property(a => a.PayoutsEnabled).HasDefaultValue(false);

        builder.HasIndex(a => a.ProviderAccountId).IsUnique();

        builder
            .HasOne(a => a.Venue)
            .WithOne()
            .HasForeignKey<VenuePaymentAccount>(a => a.VenueId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
