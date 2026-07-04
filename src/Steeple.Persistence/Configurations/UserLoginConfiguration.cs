using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Steeple.Persistence.Configurations;
/// <summary>EF mapping for <see cref="UserLogin"/>.</summary>
public class UserLoginConfiguration : IEntityTypeConfiguration<UserLogin>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<UserLogin> builder)
    {
        builder.ToTable("user_logins");

        builder.HasKey(l => l.Id);

        builder.Property(l => l.Provider).HasConversion<int>();
        builder.Property(l => l.Subject).IsRequired().HasMaxLength(255);

        // The SSO identity key for find-or-create at sign-in.
        builder.HasIndex(l => new { l.Provider, l.Subject }).IsUnique();
        builder.HasIndex(l => l.UserId);
    }
}
