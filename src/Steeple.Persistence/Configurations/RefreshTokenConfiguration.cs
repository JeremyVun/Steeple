using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Steeple.Persistence.Configurations;
/// <summary>EF mapping for <see cref="RefreshToken"/>.</summary>
public class RefreshTokenConfiguration : IEntityTypeConfiguration<RefreshToken>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<RefreshToken> builder)
    {
        builder.ToTable("refresh_tokens");

        builder.HasKey(t => t.Id);

        builder.Property(t => t.TokenHash).IsRequired().HasMaxLength(64);
        builder.Property(t => t.DeviceLabel).HasMaxLength(100);
        builder.Property(t => t.Platform).HasMaxLength(20);

        builder.HasIndex(t => t.TokenHash).IsUnique();
        builder.HasIndex(t => t.UserId);
        // Family revocation (reuse detection / sign-out) updates by FamilyId.
        builder.HasIndex(t => t.FamilyId);

        builder.HasIndex(t => new { t.RevokedAtUtc, t.Id })
            .HasDatabaseName("IX_refresh_tokens_RetentionRevoked")
            .HasFilter("\"RevokedAtUtc\" IS NOT NULL");
        builder.HasIndex(t => new { t.ExpiresAtUtc, t.Id })
            .HasDatabaseName("IX_refresh_tokens_RetentionExpired")
            .HasFilter("\"RevokedAtUtc\" IS NULL");

        builder
            .HasOne(t => t.User)
            .WithMany()
            .HasForeignKey(t => t.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
