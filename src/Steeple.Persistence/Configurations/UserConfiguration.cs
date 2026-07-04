using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Steeple.Persistence.Configurations;
/// <summary>EF mapping for <see cref="User"/>.</summary>
public class UserConfiguration : IEntityTypeConfiguration<User>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.ToTable("users");

        builder.HasKey(u => u.Id);

        builder.Property(u => u.DisplayName).IsRequired().HasMaxLength(200);
        builder.Property(u => u.Email).HasMaxLength(320);

        // Non-unique: the same verified email may legitimately appear on a second provider —
        // we detect it to say "sign in with your original provider", never auto-link (SYSTEM_DESIGN §6).
        builder.HasIndex(u => u.Email);

        builder
            .HasMany(u => u.Logins)
            .WithOne(l => l.User!)
            .HasForeignKey(l => l.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        builder
            .HasMany(u => u.Agreements)
            .WithOne(a => a.User!)
            .HasForeignKey(a => a.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
