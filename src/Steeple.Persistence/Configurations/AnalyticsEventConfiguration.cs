using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Steeple.Persistence.Configurations;
/// <summary>EF mapping for <see cref="AnalyticsEvent"/>.</summary>
public class AnalyticsEventConfiguration : IEntityTypeConfiguration<AnalyticsEvent>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<AnalyticsEvent> builder)
    {
        builder.ToTable("analytics_events");

        builder.HasKey(e => e.Id);

        builder.Property(e => e.EventType).IsRequired().HasMaxLength(100);
        builder.Property(e => e.SessionId).HasMaxLength(100);
        // PayloadJson is free-form JSON text; leave unbounded.

        // Reporting queries slice by event type over time.
        builder.HasIndex(e => new { e.EventType, e.OccurredAtUtc });
    }
}
