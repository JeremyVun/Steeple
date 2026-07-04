using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Steeple.Persistence.Configurations;
/// <summary>EF mapping for <see cref="Application"/>.</summary>
public class ApplicationConfiguration : IEntityTypeConfiguration<Application>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<Application> builder)
    {
        builder.ToTable("applications");

        builder.HasKey(a => a.Id);

        builder.Property(a => a.IntentText).IsRequired().HasMaxLength(2000);

        // Single-value and status enums persist as their underlying int (repo convention).
        builder.Property(a => a.ActivityType).HasConversion<int>();
        builder.Property(a => a.Frequency).HasConversion<int>();
        builder.Property(a => a.Status).HasConversion<int>();

        // Provider inbox (applications for a room) and organizer inbox (my applications), newest first.
        builder.HasIndex(a => new { a.RoomId, a.CreatedAtUtc });
        builder.HasIndex(a => new { a.OrganizerId, a.CreatedAtUtc });

        // The lazy expiry sweep scans undecided applications past their ExpiresAtUtc.
        builder.HasIndex(a => new { a.Status, a.ExpiresAtUtc });

        // Idempotent submits: a replayed (organizer, key) resolves to the original application.
        builder
            .HasIndex(a => new { a.OrganizerId, a.IdempotencyKey })
            .IsUnique()
            .HasFilter("\"IdempotencyKey\" IS NOT NULL");

        builder
            .HasOne(a => a.Room)
            .WithMany()
            .HasForeignKey(a => a.RoomId)
            .OnDelete(DeleteBehavior.Cascade);

        builder
            .HasOne(a => a.Organizer)
            .WithMany()
            .HasForeignKey(a => a.OrganizerId)
            .OnDelete(DeleteBehavior.Cascade);

        builder
            .HasMany(a => a.Messages)
            .WithOne(m => m.Application!)
            .HasForeignKey(m => m.ApplicationId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
