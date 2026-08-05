using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Steeple.Persistence.Configurations;
/// <summary>EF mapping for <see cref="Payment"/> (mirrors 014-payments.sql column-for-column).</summary>
public class PaymentConfiguration : IEntityTypeConfiguration<Payment>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<Payment> builder)
    {
        builder.ToTable("payments");

        builder.HasKey(p => p.Id);

        builder.Property(p => p.Amount).HasPrecision(12, 2);
        builder.Property(p => p.Currency).IsRequired().HasMaxLength(3);
        builder.Property(p => p.ApplicationFee).HasPrecision(12, 2).HasDefaultValue(0m);
        builder.Property(p => p.ProviderPaymentId).HasMaxLength(255);
        builder.Property(p => p.Status).HasConversion<int>();
        builder.Property(p => p.FailureCode).HasMaxLength(100);

        // One live (non-failed) payment per occurrence — the double-charge impossibility proof.
        builder
            .HasIndex(p => p.OccurrenceId)
            .IsUnique()
            .HasDatabaseName("UX_payments_OccurrenceId_live")
            .HasFilter("\"Status\" <> 3");

        builder.HasIndex(p => p.BookingId);

        builder
            .HasIndex(p => p.ProviderPaymentId)
            .IsUnique()
            .HasFilter("\"ProviderPaymentId\" IS NOT NULL");

        builder
            .HasOne(p => p.Occurrence)
            .WithMany()
            .HasForeignKey(p => p.OccurrenceId)
            .OnDelete(DeleteBehavior.Cascade);

        builder
            .HasOne(p => p.Booking)
            .WithMany()
            .HasForeignKey(p => p.BookingId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
