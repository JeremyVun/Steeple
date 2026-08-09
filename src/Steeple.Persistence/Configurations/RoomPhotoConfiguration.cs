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

        // Every uploaded row owns one object prefix. Legacy external-URL rows keep null.
        builder.HasIndex(p => p.StorageKey)
            .IsUnique()
            .HasFilter("\"StorageKey\" IS NOT NULL");

        // Photos load and render in display order, with one position and at most one cover per room.
        builder.HasIndex(p => new { p.RoomId, p.SortOrder }).IsUnique();
        builder.HasIndex(p => p.RoomId)
            .IsUnique()
            .HasDatabaseName("IX_room_photos_RoomId_IsPrimary")
            .HasFilter("\"IsPrimary\" = true");
    }
}
