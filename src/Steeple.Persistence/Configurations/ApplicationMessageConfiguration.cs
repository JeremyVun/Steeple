using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Steeple.Persistence.Configurations;
/// <summary>EF mapping for <see cref="ApplicationMessage"/>.</summary>
public class ApplicationMessageConfiguration : IEntityTypeConfiguration<ApplicationMessage>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<ApplicationMessage> builder)
    {
        builder.ToTable("application_messages");

        builder.HasKey(m => m.Id);

        builder.Property(m => m.Body).IsRequired().HasMaxLength(2000);

        builder.HasIndex(m => new { m.ApplicationId, m.SentAtUtc });

        builder
            .HasOne(m => m.Sender)
            .WithMany()
            .HasForeignKey(m => m.SenderId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
