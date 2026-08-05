using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Steeple.Persistence.Configurations;
/// <summary>
/// EF mapping for <see cref="BookingReminder"/> (mirrors 015-reminders.sql column-for-column).
/// The unique (occurrence, kind) index is the worker's dedup guard, so it is declared here as
/// well as in SQL — a violation is the expected "already sent" signal, not an error.
/// </summary>
public class BookingReminderConfiguration : IEntityTypeConfiguration<BookingReminder>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<BookingReminder> builder)
    {
        builder.ToTable("booking_reminders");

        builder.HasKey(r => r.Id);

        builder.Property(r => r.Kind).HasConversion<int>();

        builder.HasIndex(r => new { r.OccurrenceId, r.Kind })
            .IsUnique()
            .HasDatabaseName("UQ_booking_reminders_OccurrenceId_Kind");

        builder
            .HasOne(r => r.Occurrence)
            .WithMany()
            .HasForeignKey(r => r.OccurrenceId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
