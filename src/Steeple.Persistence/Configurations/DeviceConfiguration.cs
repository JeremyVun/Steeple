using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Steeple.Persistence.Configurations;
/// <summary>EF mapping for <see cref="Device"/>.</summary>
public class DeviceConfiguration : IEntityTypeConfiguration<Device>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<Device> builder)
    {
        builder.ToTable("devices");

        builder.HasKey(d => d.Id);

        builder.Property(d => d.FcmToken).IsRequired().HasMaxLength(512);
        builder.Property(d => d.Platform).IsRequired().HasMaxLength(20);

        builder.HasIndex(d => d.FcmToken).IsUnique();
        builder.HasIndex(d => d.UserId);

        builder
            .HasOne(d => d.User)
            .WithMany()
            .HasForeignKey(d => d.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
