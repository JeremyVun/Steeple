using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Steeple.Persistence.Configurations;

/// <summary>EF mapping for <see cref="NotificationOutbox"/>.</summary>
public sealed class NotificationOutboxConfiguration : IEntityTypeConfiguration<NotificationOutbox>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<NotificationOutbox> builder)
    {
        builder.ToTable("notification_outbox", table =>
        {
            table.HasCheckConstraint("CK_notification_outbox_Channel", "\"Channel\" IN (0, 1)");
            table.HasCheckConstraint("CK_notification_outbox_Attempts", "\"Attempts\" >= 0");
            table.HasCheckConstraint(
                "CK_notification_outbox_TerminalState",
                "NOT (\"DeliveredAtUtc\" IS NOT NULL AND \"FailedAtUtc\" IS NOT NULL)");
        });

        builder.HasKey(row => row.Id);
        builder.Property(row => row.Channel).HasConversion<int>();
        builder.Property(row => row.Kind).HasConversion<int>();
        builder.Property(row => row.PayloadJson).HasColumnType("jsonb").IsRequired();
        builder.Property(row => row.LastError).HasMaxLength(2000);

        builder.HasIndex(row => new { row.NextAttemptAtUtc, row.CreatedAtUtc, row.Id })
            .HasDatabaseName("IX_notification_outbox_Due")
            .HasFilter("\"DeliveredAtUtc\" IS NULL AND \"FailedAtUtc\" IS NULL");
        builder.HasIndex(row => new { row.DeliveredAtUtc, row.Id })
            .HasDatabaseName("IX_notification_outbox_RetentionDelivered")
            .HasFilter("\"DeliveredAtUtc\" IS NOT NULL");
        builder.HasIndex(row => new { row.FailedAtUtc, row.Id })
            .HasDatabaseName("IX_notification_outbox_RetentionFailed")
            .HasFilter("\"FailedAtUtc\" IS NOT NULL");
    }
}
