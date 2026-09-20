using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Steeple.Persistence.Configurations;

public sealed class PaymentWebhookEventConfiguration : IEntityTypeConfiguration<PaymentWebhookEvent>
{
    public void Configure(EntityTypeBuilder<PaymentWebhookEvent> builder)
    {
        builder.ToTable("payment_webhook_events");
        builder.HasKey(e => new { e.Source, e.ProviderEventId });
        builder.Property(e => e.Source).HasMaxLength(20);
        builder.Property(e => e.ProviderEventId).HasMaxLength(255);
        builder.Property(e => e.Type).HasMaxLength(100);
        builder.Property(e => e.ProviderAccountId).HasMaxLength(255);
        builder.Property(e => e.ProviderObjectId).HasMaxLength(255);
        builder.Property(e => e.LastError).HasMaxLength(255);
    }
}
