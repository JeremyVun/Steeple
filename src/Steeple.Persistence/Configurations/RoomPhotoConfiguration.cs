using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Steeple.Persistence.Configurations;
/// <summary>EF mapping for <see cref="RoomPhoto"/>.</summary>
public class RoomPhotoConfiguration : IEntityTypeConfiguration<RoomPhoto>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<RoomPhoto> builder)
    {
        builder.ToTable("room_photos");

        builder.HasKey(p => p.Id);

        builder.Property(p => p.Url).IsRequired().HasMaxLength(1000);
        builder.Property(p => p.Caption).HasMaxLength(500);
        builder.Property(p => p.StorageKey).HasMaxLength(500);
        builder.Property(p => p.ThumbUrl).HasMaxLength(1000);
        builder.Property(p => p.CardUrl).HasMaxLength(1000);
        // Mirror 006-manage.sql's DEFAULT now() (pre-pipeline rows inherited it the same way).
        builder.Property(p => p.CreatedAtUtc).HasDefaultValueSql("now()");

        // Photos load and render in display order.
        builder.HasIndex(p => new { p.RoomId, p.SortOrder });
    }
}
